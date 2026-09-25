package com.cyberfish.app.capture

import android.content.Context
import android.os.SystemClock
import android.view.Surface
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.Camera
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.camera.view.TransformExperimental
import androidx.camera.view.transform.OutputTransform
import androidx.core.content.ContextCompat
import androidx.core.view.doOnLayout
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.DetectionBounds
import com.cyberfish.app.inference.DetectionRegionGate
import com.cyberfish.app.inference.Detector
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@OptIn(markerClass = [TransformExperimental::class])
class CameraFrameSource(
    private val context: Context,
    private val detector: Detector,
    private val onFrame: (FrameMetrics) -> Unit,
    private val onStatusChanged: (CaptureStatus) -> Unit,
    private val onDetection: (
        detection: com.cyberfish.app.inference.Detection?,
        timestampMillis: Long,
    ) -> DetectionTrackingMetrics? = { _, _ -> null },
    private val snapshotDir: File? = null,
    private val onSnapshotReady: (File) -> Unit = {},
    private val onZoomCapabilitiesChanged: (Float) -> Unit = {},
    private val onDetectionReset: () -> Unit = {},
) : FrameSource {
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val mainExecutor = ContextCompat.getMainExecutor(context)
    private val coordinateMapper = CameraXDetectionCoordinateMapper()
    private var cameraProvider: ProcessCameraProvider? = null
    @Volatile
    private var camera: Camera? = null
    @Volatile
    private var maxZoomRatio = 1f
    @Volatile
    private var generation = 0
    private var framesInWindow = 0
    private var framesPerSecond = 0
    private var windowStartedAt = 0L
    private var lastReportedAt = 0L
    private var lastSnapshotAt = 0L
    @Volatile
    private var latestSnapshotFile: File? = null
    @Volatile
    private var previewOutputTransform: OutputTransform? = null
    @Volatile
    private var detectionModeSnapshot = DetectionModeSnapshot(
        mode = DetectionMode.Intelligent,
        state = DetectionRegionState.Intelligent,
        region = null,
        draft = null,
        revision = 0L,
        geometryEpoch = 0L,
        triggerEnabled = true,
    )
    private var lastDetectionScopeRevision = Long.MIN_VALUE

    fun latestSnapshot(): File? = latestSnapshotFile?.takeIf { it.isFile }

    fun setDetectionMode(snapshot: DetectionModeSnapshot) {
        detectionModeSnapshot = snapshot
    }

    fun refreshPreviewGeometry(previewView: PreviewView) {
        refreshPreviewOutputTransform(previewView, generation)
    }

    override fun start(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        val currentGeneration = ++generation
        onStatusChanged(CaptureStatus.Starting)
        lastSnapshotAt = 0L
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener({
            if (currentGeneration != generation) return@addListener
            try {
                val provider = providerFuture.get()
                cameraProvider = provider
                previewView.doOnLayout {
                    bindCamera(provider, lifecycleOwner, previewView, currentGeneration)
                }
            } catch (_: Exception) {
                if (currentGeneration == generation) onStatusChanged(CaptureStatus.Failed)
            }
        }, mainExecutor)
    }

    private fun bindCamera(
        provider: ProcessCameraProvider,
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        expectedGeneration: Int,
    ) {
        if (expectedGeneration != generation) return
        try {
            val viewPort = previewView.viewPort ?: run {
                previewView.post { bindCamera(provider, lifecycleOwner, previewView, expectedGeneration) }
                return
            }
            val targetRotation = previewView.display?.rotation ?: Surface.ROTATION_0
            val preview = Preview.Builder()
                .setTargetRotation(targetRotation)
                .build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setTargetRotation(targetRotation)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(analysisExecutor) { image ->
                analyzeImage(image, expectedGeneration, previewView)
            }
            val useCaseGroup = UseCaseGroup.Builder()
                .setViewPort(viewPort)
                .addUseCase(preview)
                .addUseCase(analysis)
                .build()
            provider.unbindAll()
            val boundCamera = provider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                useCaseGroup,
            )
            if (expectedGeneration == generation) {
                camera = boundCamera
                refreshPreviewOutputTransform(previewView, expectedGeneration)
                maxZoomRatio = boundCamera.cameraInfo.zoomState.value?.maxZoomRatio?.coerceAtLeast(1f) ?: 1f
                onZoomCapabilitiesChanged(maxZoomRatio)
                onStatusChanged(CaptureStatus.Running)
            }
        } catch (_: Exception) {
            if (expectedGeneration == generation) onStatusChanged(CaptureStatus.Failed)
        }
    }

    override fun stop() {
        generation += 1
        camera = null
        previewOutputTransform = null
        maxZoomRatio = 1f
        lastDetectionScopeRevision = Long.MIN_VALUE
        onZoomCapabilitiesChanged(1f)
        cameraProvider?.unbindAll()
        onStatusChanged(CaptureStatus.Idle)
    }

    private fun refreshPreviewOutputTransform(previewView: PreviewView, expectedGeneration: Int, attempt: Int = 0) {
        previewView.post {
            if (expectedGeneration != generation) return@post
            val transform = previewView.outputTransform
            if (transform != null) {
                previewOutputTransform = transform
            } else if (attempt < 20) {
                previewView.postDelayed({ refreshPreviewOutputTransform(previewView, expectedGeneration, attempt + 1) }, 50L)
            }
        }
    }

    fun setZoomRatio(ratio: Float) {
        val target = ratio.coerceIn(1f, maxZoomRatio.coerceAtLeast(1f))
        mainExecutor.execute {
            camera?.cameraControl?.setZoomRatio(target)
        }
    }

    override fun close() {
        stop()
        analysisExecutor.shutdown()
    }

    private fun analyzeImage(
        image: androidx.camera.core.ImageProxy,
        expectedGeneration: Int,
        previewView: PreviewView,
    ) {
        val startedAt = SystemClock.elapsedRealtimeNanos()
        try {
            if (expectedGeneration != generation) return
            val frameTransform = coordinateMapper.capture(image)
            val scope = detectionModeSnapshot
            if (scope.revision != lastDetectionScopeRevision) {
                lastDetectionScopeRevision = scope.revision
                onDetectionReset()
            }
            val sourceRegion = sourceRegion(scope, frameTransform, previewView)
            val detectionEnabled = scope.mode == DetectionMode.Intelligent ||
                (scope.triggerEnabled && sourceRegion != null)
            val preprocessingStartedAt = SystemClock.elapsedRealtimeNanos()
            val preparedInput = if (detector.requiresPixelData) image.toModelInput(detector.inputSize) else null
            val normalizedRgb = preparedInput?.normalizedRgb
            val sourceWidthPx = preparedInput?.transform?.sourceWidthPx ?: frameTransform.orientedWidthPx
            val sourceHeightPx = preparedInput?.transform?.sourceHeightPx ?: frameTransform.orientedHeightPx
            val preprocessingMillis = elapsedMillisSince(preprocessingStartedAt)
            val inferenceStartedAt = SystemClock.elapsedRealtimeNanos()
            val detection = if (detectionEnabled) {
                detector.detect(
                    CameraFrame(
                        width = sourceWidthPx,
                        height = sourceHeightPx,
                        timestampNanos = image.imageInfo.timestamp,
                        normalizedRgb = normalizedRgb,
                        inputTransform = preparedInput?.transform,
                        detectionRegion = sourceRegion,
                        detectionScopeRevision = scope.revision,
                    ),
                )?.takeIf { sourceRegion == null || DetectionRegionGate.accepts(it, sourceRegion) }
            } else {
                null
            }
            val inferenceMillis = if (detectionEnabled) elapsedMillisSince(inferenceStartedAt) else 0L
            if (scope.revision != detectionModeSnapshot.revision) return
            val now = SystemClock.elapsedRealtime()
            val snapshotDirectory = snapshotDir
            if (normalizedRgb != null && snapshotDirectory != null && now - lastSnapshotAt >= SNAPSHOT_INTERVAL_MILLIS) {
                lastSnapshotAt = now
                runCatching {
                    val snapshot = File(snapshotDirectory, "snapshot-$now.jpg")
                    normalizedRgb.writeJpeg(detector.inputSize, snapshot)
                    latestSnapshotFile = snapshot
                    onSnapshotReady(snapshot)
                    snapshotDirectory.listFiles { file -> file.name.startsWith("snapshot-") && file.extension == "jpg" }
                        ?.sortedByDescending { it.lastModified() }
                        ?.drop(MAX_SNAPSHOT_FILES)
                        ?.forEach(File::delete)
                }
            }
            val trackingMetrics = onDetection(detection, now)
            updateFrameRate(now)
            if (now - lastReportedAt >= REPORT_INTERVAL_MILLIS) {
                lastReportedAt = now
                val latencyMillis = ((SystemClock.elapsedRealtimeNanos() - startedAt) / NANOS_PER_MILLISECOND).coerceAtLeast(1)
                mainExecutor.execute {
                    if (expectedGeneration == generation) {
                        val displayDetection = previewOutputTransform?.let { target ->
                            coordinateMapper.map(
                                detection = detection,
                                source = frameTransform,
                                target = target,
                                previewWidthPx = previewView.width.toFloat(),
                                previewHeightPx = previewView.height.toFloat(),
                            )
                        }
                        onFrame(
                            FrameMetrics(
                                detection = detection,
                                displayDetection = displayDetection,
                                framesPerSecond = framesPerSecond.coerceAtLeast(1),
                                latencyMillis = latencyMillis,
                                timestampMillis = now,
                                sourceWidthPx = sourceWidthPx,
                                sourceHeightPx = sourceHeightPx,
                                preprocessingMillis = preprocessingMillis,
                                inferenceMillis = inferenceMillis,
                                trackingMetrics = trackingMetrics,
                            ),
                        )
                    }
                }
            }
        } finally {
            image.close()
        }
    }

    private fun sourceRegion(
        scope: DetectionModeSnapshot,
        frameTransform: CameraXFrameTransform,
        previewView: PreviewView,
    ): DetectionBounds? {
        if (scope.mode != DetectionMode.ManualRegion || !scope.triggerEnabled) return null
        val region = scope.region ?: return null
        val target = previewOutputTransform ?: return null
        val previewWidthPx = previewView.width.toFloat()
        val previewHeightPx = previewView.height.toFloat()
        if (!previewWidthPx.isFinite() || !previewHeightPx.isFinite() || previewWidthPx <= 0f || previewHeightPx <= 0f) {
            return null
        }
        return coordinateMapper.mapPreviewToSource(
            boundsInPreview = PreviewRect(
                left = region.left * previewWidthPx,
                top = region.top * previewHeightPx,
                right = region.right * previewWidthPx,
                bottom = region.bottom * previewHeightPx,
            ),
            source = frameTransform,
            target = target,
            previewWidthPx = previewWidthPx,
            previewHeightPx = previewHeightPx,
        )
    }

    private fun updateFrameRate(now: Long) {
        if (windowStartedAt == 0L) windowStartedAt = now
        framesInWindow += 1
        if (now - windowStartedAt >= ONE_SECOND_MILLIS) {
            framesPerSecond = framesInWindow
            framesInWindow = 0
            windowStartedAt = now
        }
    }

    private fun elapsedMillisSince(startedAtNanos: Long): Long =
        ((SystemClock.elapsedRealtimeNanos() - startedAtNanos) / NANOS_PER_MILLISECOND).coerceAtLeast(0L)

    private companion object {
        const val NANOS_PER_MILLISECOND = 1_000_000L
        const val ONE_SECOND_MILLIS = 1_000L
        const val REPORT_INTERVAL_MILLIS = 250L
        const val SNAPSHOT_INTERVAL_MILLIS = 500L
        const val MAX_SNAPSHOT_FILES = 12
    }
}

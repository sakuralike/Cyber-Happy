package com.cyberfish.app.capture

import android.content.Context
import android.os.SystemClock
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.Camera
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.camera.view.transform.OutputTransform
import androidx.core.content.ContextCompat
import androidx.core.view.doOnLayout
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.Detector
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraFrameSource(
    private val context: Context,
    private val detector: Detector,
    private val onFrame: (FrameMetrics) -> Unit,
    private val onStatusChanged: (CaptureStatus) -> Unit,
    private val onDetection: (detection: com.cyberfish.app.inference.Detection?, timestampMillis: Long) -> Unit = { _, _ -> },
    private val snapshotDir: File? = null,
    private val onSnapshotReady: (File) -> Unit = {},
    private val onZoomCapabilitiesChanged: (Float) -> Unit = {},
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

    fun latestSnapshot(): File? = latestSnapshotFile?.takeIf { it.isFile }

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
            val preparedInput = if (detector.requiresPixelData) image.toModelInput(detector.inputSize) else null
            val normalizedRgb = preparedInput?.normalizedRgb
            val sourceWidthPx = preparedInput?.transform?.sourceWidthPx ?: frameTransform.orientedWidthPx
            val sourceHeightPx = preparedInput?.transform?.sourceHeightPx ?: frameTransform.orientedHeightPx
            val detection = detector.detect(
                CameraFrame(
                    width = sourceWidthPx,
                    height = sourceHeightPx,
                    timestampNanos = image.imageInfo.timestamp,
                    normalizedRgb = normalizedRgb,
                    inputTransform = preparedInput?.transform,
                ),
            )
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
            onDetection(detection, now)
            updateFrameRate(now)
            if (now - lastReportedAt >= REPORT_INTERVAL_MILLIS) {
                lastReportedAt = now
                val latencyMillis = ((SystemClock.elapsedRealtimeNanos() - startedAt) / NANOS_PER_MILLISECOND).coerceAtLeast(1)
                mainExecutor.execute {
                    if (expectedGeneration == generation) {
                        onFrame(
                            FrameMetrics(
                                detection = detection,
                                displayDetection = previewOutputTransform?.let { target ->
                                    coordinateMapper.map(
                                        detection = detection,
                                        source = frameTransform,
                                        target = target,
                                        previewWidthPx = previewView.width.toFloat(),
                                        previewHeightPx = previewView.height.toFloat(),
                                    )
                                },
                                framesPerSecond = framesPerSecond.coerceAtLeast(1),
                                latencyMillis = latencyMillis,
                                timestampMillis = now,
                                sourceWidthPx = sourceWidthPx,
                                sourceHeightPx = sourceHeightPx,
                            ),
                        )
                    }
                }
            }
        } finally {
            image.close()
        }
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

    private companion object {
        const val NANOS_PER_MILLISECOND = 1_000_000L
        const val ONE_SECOND_MILLIS = 1_000L
        const val REPORT_INTERVAL_MILLIS = 250L
        const val SNAPSHOT_INTERVAL_MILLIS = 500L
        const val MAX_SNAPSHOT_FILES = 12
    }
}

package com.cyberfish.app.capture

import android.content.Context
import android.os.Handler
import android.os.Looper
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
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.video.FallbackStrategy
import androidx.core.content.ContextCompat
import androidx.core.view.doOnLayout
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.DetectionBounds
import com.cyberfish.app.inference.DetectionRegionGate
import com.cyberfish.app.inference.Detector
import com.cyberfish.app.inference.NcnnRuntimeOptions
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@OptIn(markerClass = [TransformExperimental::class])
class CameraFrameSource(
    private val context: Context,
    private val detector: Detector,
    runtimeOptions: NcnnRuntimeOptions = NcnnRuntimeOptions.forPerformanceMode(NcnnRuntimeOptions.MODE_STANDARD),
    private val onFrame: (FrameMetrics) -> Unit,
    private val onStatusChanged: (CaptureStatus) -> Unit,
    private val onDetection: (
        detection: com.cyberfish.app.inference.Detection?,
        timestampMillis: Long,
    ) -> FrameTriggerMetrics = { _, _ ->
        FrameTriggerMetrics(
            featureSnapshot = null,
            triggerState = com.cyberfish.app.trigger.TriggerState.Idle,
            candidateDurationMillis = 0L,
        )
    },
    private val snapshotDir: File? = null,
    private val onSnapshotReady: (File) -> Unit = {},
    private val onZoomCapabilitiesChanged: (Float) -> Unit = {},
    private val onDetectionReset: () -> Unit = {},
    private val videoClipCoordinator: RollingVideoClipCoordinator? = null,
    private val onVideoClipReady: (VideoClipResult) -> Unit = {},
) : FrameSource {
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val videoIoExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val mainExecutor = ContextCompat.getMainExecutor(context)
    private val coordinateMapper = CameraXDetectionCoordinateMapper()
    private var cameraProvider: ProcessCameraProvider? = null
    @Volatile
    private var camera: Camera? = null
    @Volatile
    private var maxZoomRatio = 1f
    @Volatile
    private var generation = 0
    @Volatile
    private var sessionActive = false
    private var framesInWindow = 0
    private var framesPerSecond = 0
    private var inferenceFramesInWindow = 0
    private var inferenceFramesPerSecond = 0
    private var windowStartedAt = 0L
    private var lastReportedAt = 0L
    private var lastSnapshotAt = 0L
    @Volatile
    private var runtimeOptions = runtimeOptions
    @Volatile
    private var lastAnalysisAt = 0L
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
    private val videoHandler = Handler(Looper.getMainLooper())
    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeVideoRecording: Recording? = null
    private var videoSegmentFile: File? = null
    private var videoSegmentStartedAtMillis = 0L
    private var videoSegmentGeneration = 0
    private var lastVideoTriggerState = com.cyberfish.app.trigger.TriggerState.Idle

    fun latestSnapshot(): File? = latestSnapshotFile?.takeIf { it.isFile }

    fun latestVideoClip(): VideoClipResult? = videoClipCoordinator?.latestResult()

    fun markVideoTrigger(timestampMillis: Long): String? = videoClipCoordinator?.markTrigger(timestampMillis)

    fun onVideoSegmentFinalized(segment: VideoClipSegment): VideoClipResult? =
        videoClipCoordinator?.onSegmentFinalized(segment)?.also(onVideoClipReady)

    fun setDetectionMode(snapshot: DetectionModeSnapshot) {
        detectionModeSnapshot = snapshot
    }

    fun setRuntimeOptions(options: NcnnRuntimeOptions) {
        runtimeOptions = options
        lastAnalysisAt = 0L
    }

    fun refreshPreviewGeometry(previewView: PreviewView) {
        refreshPreviewOutputTransform(previewView, generation)
    }

    override fun start(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        if (sessionActive) stop()
        sessionActive = true
        val currentGeneration = ++generation
        lastVideoTriggerState = com.cyberfish.app.trigger.TriggerState.Idle
        videoClipCoordinator?.start()
        onStatusChanged(CaptureStatus.Starting)
        framesInWindow = 0
        framesPerSecond = 0
        inferenceFramesInWindow = 0
        inferenceFramesPerSecond = 0
        windowStartedAt = 0L
        lastReportedAt = 0L
        lastSnapshotAt = 0L
        lastAnalysisAt = 0L
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
            val video = videoClipCoordinator?.let {
                runCatching {
                    val quality = QualitySelector.from(
                        Quality.SD,
                        FallbackStrategy.lowerQualityOrHigherThan(Quality.SD),
                    )
                    VideoCapture.withOutput(Recorder.Builder().setQualitySelector(quality).build())
                }.getOrNull()
            }
            val baseUseCases = UseCaseGroup.Builder()
                .setViewPort(viewPort)
                .addUseCase(preview)
                .addUseCase(analysis)
            val useCaseGroup = baseUseCases.apply { video?.let(::addUseCase) }.build()
            provider.unbindAll()
            val boundCamera = try {
                provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, useCaseGroup)
            } catch (videoBindError: Exception) {
                if (video == null) throw videoBindError
                videoCapture = null
                provider.unbindAll()
                provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, baseUseCases.build())
            }
            if (expectedGeneration == generation) {
                camera = boundCamera
                videoCapture = video
                refreshPreviewOutputTransform(previewView, expectedGeneration)
                maxZoomRatio = boundCamera.cameraInfo.zoomState.value?.maxZoomRatio?.coerceAtLeast(1f) ?: 1f
                onZoomCapabilitiesChanged(maxZoomRatio)
                onStatusChanged(CaptureStatus.Running)
                startVideoSegment(expectedGeneration)
            }
        } catch (_: Exception) {
            if (expectedGeneration == generation) onStatusChanged(CaptureStatus.Failed)
        }
    }

    override fun stop() {
        if (!sessionActive) return
        sessionActive = false
        onStatusChanged(CaptureStatus.Stopping)
        generation += 1
        videoSegmentGeneration = generation
        lastVideoTriggerState = com.cyberfish.app.trigger.TriggerState.Idle
        videoHandler.removeCallbacksAndMessages(null)
        runCatching { activeVideoRecording?.stop() }
        activeVideoRecording = null
        videoSegmentFile = null
        videoCapture = null
        videoClipCoordinator?.stop()
        camera = null
        previewOutputTransform = null
        maxZoomRatio = 1f
        lastAnalysisAt = 0L
        lastDetectionScopeRevision = Long.MIN_VALUE
        onZoomCapabilitiesChanged(1f)
        runCatching { cameraProvider?.unbindAll() }
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
        videoIoExecutor.shutdown()
    }

    private fun startVideoSegment(expectedGeneration: Int) {
        val coordinator = videoClipCoordinator ?: return
        val capture = videoCapture ?: return
        if (expectedGeneration != generation || activeVideoRecording != null) return
        val startedAt = SystemClock.elapsedRealtime()
        val file = coordinator.nextSegmentFile(startedAt) ?: return
        val output = FileOutputOptions.Builder(file).build()
        val recording = runCatching {
            capture.output.prepareRecording(context, output).start(mainExecutor) { event ->
                if (event !is VideoRecordEvent.Finalize) return@start
                val recordedFile = file
                val recordedStartedAt = startedAt
                activeVideoRecording = null
                videoSegmentFile = null
                if (event.error == VideoRecordEvent.Finalize.ERROR_NONE) {
                    if (expectedGeneration != generation || !sessionActive) {
                        recordedFile.delete()
                        return@start
                    }
                    val clip = coordinator.onSegmentFinalized(
                        VideoClipSegment(
                            file = recordedFile,
                            startedAtMillis = recordedStartedAt,
                            endedAtMillis = SystemClock.elapsedRealtime(),
                        ),
                    )
                    clip?.let { ready -> finalizeVideoClip(expectedGeneration, coordinator, ready, file.parentFile) }
                } else {
                    recordedFile.delete()
                }
                if (expectedGeneration == generation && videoSegmentGeneration == expectedGeneration) {
                    startVideoSegment(expectedGeneration)
                }
            }
        }.getOrNull() ?: run {
            file.delete()
            return
        }
        videoSegmentGeneration = expectedGeneration
        videoSegmentFile = file
        videoSegmentStartedAtMillis = startedAt
        activeVideoRecording = recording
        videoHandler.postDelayed({
            if (expectedGeneration == generation && activeVideoRecording === recording) recording.stop()
        }, VIDEO_SEGMENT_MILLIS)
    }

    private fun finalizeVideoClip(
        expectedGeneration: Int,
        coordinator: RollingVideoClipCoordinator,
        ready: VideoClipResult,
        directory: File?,
    ) {
        runCatching {
            videoIoExecutor.execute {
                if (expectedGeneration != generation) {
                    ready.segments.forEach(File::delete)
                    return@execute
                }
                val merged = if (ready.videoPath == null) {
                    directory?.let { VideoSegmentMerger.merge(ready.segments, File(it, "${ready.clipId}.mp4")) }
                } else {
                    ready.segments.singleOrNull()
                }
                mainExecutor.execute {
                    if (expectedGeneration == generation && sessionActive) {
                        val result = ready.copy(videoPath = merged?.absolutePath)
                        coordinator.releaseSegments(ready.segments)
                        if (merged != null && ready.segments.size > 1) {
                            ready.segments.filter { it != merged }.forEach(File::delete)
                        } else if (merged == null) {
                            ready.segments.forEach(File::delete)
                        }
                        coordinator.clearResult()
                        onVideoClipReady(result)
                    } else {
                        merged?.takeIf { it != ready.segments.singleOrNull() }?.delete()
                    }
                }
            }
        }.onFailure {
            ready.segments.forEach(File::delete)
        }
    }

    private fun analyzeImage(
        image: androidx.camera.core.ImageProxy,
        expectedGeneration: Int,
        previewView: PreviewView,
    ) {
        val startedAt = SystemClock.elapsedRealtimeNanos()
        try {
            if (expectedGeneration != generation) return
            val analysisStartedAt = SystemClock.elapsedRealtime()
            val options = runtimeOptions
            if (lastAnalysisAt != 0L && analysisStartedAt - lastAnalysisAt < options.analysisIntervalMillis) return
            lastAnalysisAt = analysisStartedAt
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
            val triggerMetrics = onDetection(detection, now)
            if (triggerMetrics.triggerState == com.cyberfish.app.trigger.TriggerState.Cooldown &&
                lastVideoTriggerState != com.cyberfish.app.trigger.TriggerState.Cooldown
            ) {
                videoClipCoordinator?.markTrigger(now)
            }
            lastVideoTriggerState = triggerMetrics.triggerState
            val featureSnapshot = triggerMetrics.featureSnapshot
            val trackingMetrics = featureSnapshot?.let { snapshot ->
                DetectionTrackingMetrics(
                    confidence = snapshot.confidence,
                    widthRatioFromBaseline = snapshot.bboxWidthRatioFromBaseline,
                    heightRatioFromBaseline = snapshot.bboxHeightRatioFromBaseline,
                    areaRatioFromBaseline = snapshot.bboxAreaRatioFromBaseline,
                )
            }
            updateFrameRate(now, detectionEnabled)
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
                                featureSnapshot = featureSnapshot,
                                triggerState = triggerMetrics.triggerState,
                                candidateDurationMillis = triggerMetrics.candidateDurationMillis,
                                modelVersion = detector.modelVersion,
                                inferenceFramesPerSecond = inferenceFramesPerSecond,
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

    private fun updateFrameRate(now: Long, inferenceRan: Boolean) {
        if (windowStartedAt == 0L) windowStartedAt = now
        framesInWindow += 1
        if (inferenceRan) inferenceFramesInWindow += 1
        if (now - windowStartedAt >= ONE_SECOND_MILLIS) {
            framesPerSecond = framesInWindow
            inferenceFramesPerSecond = inferenceFramesInWindow
            framesInWindow = 0
            inferenceFramesInWindow = 0
            windowStartedAt = now
        }
    }

    private fun elapsedMillisSince(startedAtNanos: Long): Long =
        ((SystemClock.elapsedRealtimeNanos() - startedAtNanos) / NANOS_PER_MILLISECOND).coerceAtLeast(0L)

    private companion object {
        const val VIDEO_SEGMENT_MILLIS = 1_000L
        const val NANOS_PER_MILLISECOND = 1_000_000L
        const val ONE_SECOND_MILLIS = 1_000L
        const val REPORT_INTERVAL_MILLIS = 80L
        const val SNAPSHOT_INTERVAL_MILLIS = 500L
        const val MAX_SNAPSHOT_FILES = 12
    }
}

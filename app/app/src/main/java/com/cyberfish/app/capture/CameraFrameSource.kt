package com.cyberfish.app.capture

import android.content.Context
import android.os.SystemClock
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.Detector
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraFrameSource(
    private val context: Context,
    private val detector: Detector,
    private val onFrame: (FrameMetrics) -> Unit,
    private val onStatusChanged: (CaptureStatus) -> Unit,
    private val onDetection: (detection: com.cyberfish.app.inference.Detection?, timestampMillis: Long) -> Unit = { _, _ -> },
) : FrameSource {
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val mainExecutor = ContextCompat.getMainExecutor(context)
    private var cameraProvider: ProcessCameraProvider? = null
    @Volatile
    private var generation = 0
    private var framesInWindow = 0
    private var framesPerSecond = 0
    private var windowStartedAt = 0L
    private var lastReportedAt = 0L

    override fun start(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        val currentGeneration = ++generation
        onStatusChanged(CaptureStatus.Starting)
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener({
            if (currentGeneration != generation) return@addListener
            try {
                val provider = providerFuture.get()
                cameraProvider = provider
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(analysisExecutor) { image -> analyzeImage(image, currentGeneration) }
                provider.unbindAll()
                provider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                )
                if (currentGeneration == generation) onStatusChanged(CaptureStatus.Running)
            } catch (_: Exception) {
                if (currentGeneration == generation) onStatusChanged(CaptureStatus.Failed)
            }
        }, mainExecutor)
    }

    override fun stop() {
        generation += 1
        cameraProvider?.unbindAll()
        onStatusChanged(CaptureStatus.Idle)
    }

    override fun close() {
        stop()
        analysisExecutor.shutdown()
    }

    private fun analyzeImage(image: androidx.camera.core.ImageProxy, expectedGeneration: Int) {
        val startedAt = SystemClock.elapsedRealtimeNanos()
        try {
            if (expectedGeneration != generation) return
            val detection = detector.detect(CameraFrame(image.width, image.height, image.imageInfo.timestamp))
            val now = SystemClock.elapsedRealtime()
            onDetection(detection, now)
            updateFrameRate(now)
            if (now - lastReportedAt >= REPORT_INTERVAL_MILLIS) {
                lastReportedAt = now
                val latencyMillis = ((SystemClock.elapsedRealtimeNanos() - startedAt) / NANOS_PER_MILLISECOND).coerceAtLeast(1)
                mainExecutor.execute {
                    if (expectedGeneration == generation) {
                        onFrame(FrameMetrics(detection, framesPerSecond.coerceAtLeast(1), latencyMillis, now))
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
    }
}

package com.cyberfish.app.capture

import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.inference.Detection

data class FrameMetrics(
    val detection: Detection?,
    val framesPerSecond: Int,
    val latencyMillis: Long,
    val timestampMillis: Long,
)

enum class CaptureStatus {
    Idle,
    Starting,
    Running,
    Failed,
}

interface FrameSource {
    fun start(lifecycleOwner: LifecycleOwner, previewView: PreviewView)
    fun stop()
    fun close()
}

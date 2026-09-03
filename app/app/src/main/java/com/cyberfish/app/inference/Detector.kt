package com.cyberfish.app.inference

data class CameraFrame(
    val width: Int,
    val height: Int,
    val timestampNanos: Long,
)

data class DetectionBounds(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
)

data class Detection(
    val bounds: DetectionBounds,
    val confidence: Float,
)

interface Detector {
    fun detect(frame: CameraFrame): Detection?
}

package com.cyberfish.app.inference

import java.io.Closeable

data class CameraFrame(
    val width: Int,
    val height: Int,
    val timestampNanos: Long,
    val normalizedRgb: FloatArray? = null,
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
    val motionFrequencyHz: Float? = null,
)

interface Detector {
    val modelVersion: String
        get() = "MockDetector"

    val inputSize: Int
        get() = 640

    val requiresPixelData: Boolean
        get() = false

    fun detect(frame: CameraFrame): Detection?
}

interface CloseableDetector : Detector, Closeable

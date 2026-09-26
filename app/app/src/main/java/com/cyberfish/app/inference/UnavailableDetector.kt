package com.cyberfish.app.inference

class UnavailableDetector : Detector {
    override val modelVersion: String = "NCNN_NOT_READY"
    override val inputSize: Int = 640
    override val requiresPixelData: Boolean = false

    override fun detect(frame: CameraFrame): Detection? = null
}

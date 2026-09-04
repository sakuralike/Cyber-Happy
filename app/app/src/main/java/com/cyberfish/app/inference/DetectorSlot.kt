package com.cyberfish.app.inference

class DetectorSlot(initial: Detector = MockDetector()) : CloseableDetector {
    @Volatile
    private var delegate: Detector = initial

    override val modelVersion: String
        get() = delegate.modelVersion

    override val inputSize: Int
        get() = delegate.inputSize

    override val requiresPixelData: Boolean
        get() = delegate.requiresPixelData

    @Synchronized
    override fun detect(frame: CameraFrame): Detection? = delegate.detect(frame)

    @Synchronized
    fun replace(next: Detector) {
        val previous = delegate
        delegate = next
        if (previous is CloseableDetector) previous.close()
    }

    @Synchronized
    override fun close() {
        val previous = delegate
        delegate = MockDetector()
        if (previous is CloseableDetector) previous.close()
    }
}

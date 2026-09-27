package com.cyberfish.app.inference

class DetectorSlot(initial: Detector = UnavailableDetector()) : CloseableDetector, RuntimeOptionsDetector {
    @Volatile
    private var delegate: Detector = initial
    @Volatile
    private var runtimeOptions = NcnnRuntimeOptions.forPerformanceMode(NcnnRuntimeOptions.MODE_STANDARD)

    override val modelVersion: String
        get() = delegate.modelVersion

    override val inputSize: Int
        get() = delegate.inputSize

    override val requiresPixelData: Boolean
        get() = delegate.requiresPixelData

    @Synchronized
    override fun detect(frame: CameraFrame): Detection? = delegate.detect(frame)

    @Synchronized
    override fun setRuntimeOptions(options: NcnnRuntimeOptions) {
        runtimeOptions = options
        (delegate as? RuntimeOptionsDetector)?.setRuntimeOptions(options)
    }

    @Synchronized
    fun replace(next: Detector) {
        val previous = delegate
        delegate = next
        (next as? RuntimeOptionsDetector)?.setRuntimeOptions(runtimeOptions)
        if (previous is CloseableDetector) previous.close()
    }

    @Synchronized
    override fun close() {
        val previous = delegate
        delegate = UnavailableDetector()
        if (previous is CloseableDetector) previous.close()
    }
}

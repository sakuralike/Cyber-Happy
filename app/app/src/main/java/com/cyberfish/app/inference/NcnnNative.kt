package com.cyberfish.app.inference

internal object NcnnNative {
    init {
        System.loadLibrary("ncnn")
        System.loadLibrary("cyberfish_ncnn")
    }

    external fun create(
        param: ByteArray,
        bin: ByteArray,
        inputName: String,
        outputName: String,
        outputLayout: String,
        valuesPerDetection: Int,
        numThreads: Int,
    ): Long

    external fun setNumThreads(handle: Long, numThreads: Int)

    external fun detect(handle: Long, input: FloatArray, inputSize: Int): FloatArray?

    external fun destroy(handle: Long)
}

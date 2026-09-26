package com.cyberfish.app.inference

internal object NcnnNative {
    init {
        System.loadLibrary("ncnn")
        System.loadLibrary("cyberfish_ncnn")
    }

    external fun create(param: ByteArray, bin: ByteArray): Long

    external fun detect(handle: Long, input: FloatArray, inputSize: Int): FloatArray?

    external fun destroy(handle: Long)
}

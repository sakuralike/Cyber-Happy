package com.cyberfish.app.capture

import androidx.camera.core.ImageProxy
import kotlin.math.min

fun ImageProxy.toNormalizedRgb(targetSize: Int): FloatArray {
    val output = FloatArray(targetSize * targetSize * 3)
    val yPlane = planes[0]
    val uPlane = planes[1]
    val vPlane = planes[2]
    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    val yRowStride = yPlane.rowStride
    val uRowStride = uPlane.rowStride
    val vRowStride = vPlane.rowStride
    val uPixelStride = uPlane.pixelStride
    val vPixelStride = vPlane.pixelStride
    val scaleX = width.toFloat() / targetSize
    val scaleY = height.toFloat() / targetSize

    for (outY in 0 until targetSize) {
        val sourceY = min(height - 1, (outY * scaleY).toInt())
        for (outX in 0 until targetSize) {
            val sourceX = min(width - 1, (outX * scaleX).toInt())
            val yIndex = sourceY * yRowStride + sourceX * yPlane.pixelStride
            val chromaX = sourceX / 2
            val chromaY = sourceY / 2
            val uIndex = chromaY * uRowStride + chromaX * uPixelStride
            val vIndex = chromaY * vRowStride + chromaX * vPixelStride
            val y = (yBuffer.getUnsigned(yIndex) - 16).coerceAtLeast(0) * 1.164f
            val u = uBuffer.getUnsigned(uIndex) - 128
            val v = vBuffer.getUnsigned(vIndex) - 128
            val r = (y + 1.596f * v).coerceIn(0f, 255f)
            val g = (y - 0.392f * u - 0.813f * v).coerceIn(0f, 255f)
            val b = (y + 2.017f * u).coerceIn(0f, 255f)
            val outputIndex = (outY * targetSize + outX) * 3
            output[outputIndex] = r / 255f
            output[outputIndex + 1] = g / 255f
            output[outputIndex + 2] = b / 255f
        }
    }
    return output
}

private fun java.nio.ByteBuffer.getUnsigned(index: Int): Int {
    if (index < 0 || index >= limit()) return 0
    return get(index).toInt() and 0xFF
}

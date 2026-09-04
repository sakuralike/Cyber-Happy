package com.cyberfish.app.inference

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class OfficialLiteRtDetectorTest {
    @Test
    fun officialYolo26nW8A32RunsThroughAppDetector() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val modelFile = File(instrumentation.targetContext.cacheDir, "yolo26n_w8a32.tflite")
        instrumentation.context.assets.open("yolo26n_w8a32.tflite").use { input ->
            modelFile.outputStream().use(input::copyTo)
        }
        assertEquals(MODEL_SHA256, modelFile.sha256())
        val detector = LiteRtDetector(modelFile, descriptor())
        try {
            val detection = detector.detect(
                CameraFrame(
                    width = 640,
                    height = 640,
                    timestampNanos = 0L,
                    normalizedRgb = FloatArray(3 * 640 * 640),
                ),
            )

            assertNotNull(detection)
            assertTrue(detection!!.confidence.isFinite())
            assertTrue(detection.bounds.left in 0f..1f)
            assertTrue(detection.bounds.top in 0f..1f)
            assertTrue(detection.bounds.right in 0f..1f)
            assertTrue(detection.bounds.bottom in 0f..1f)
        } finally {
            detector.close()
        }
    }

    private fun descriptor() = LiteRtModelDescriptor(
        modelVersion = "yolo26n-w8a32-fixture",
        architecture = "YOLO26n",
        quantization = "W8A32",
        framework = "LiteRT",
        inputSize = 640,
        labels = List(80) { "class-$it" },
        sha256 = MODEL_SHA256,
        signature = "fixture",
        signatureAlgorithm = "ECDSA_P256_SHA256",
        publicKeyId = "fixture-key",
        inputLayout = "NCHW",
    )

    private companion object {
        const val MODEL_SHA256 = "3d9fffa34dc9ae849578132ae8f12c3549904cce58da5414cbf634b2ba4f9eba"
    }
}

private fun File.sha256(): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(this).use { input ->
        val buffer = ByteArray(32 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            if (count > 0) digest.update(buffer, 0, count)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
}

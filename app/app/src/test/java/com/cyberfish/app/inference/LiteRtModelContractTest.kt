package com.cyberfish.app.inference

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiteRtModelContractTest {
    @Test
    fun `valid YOLO26n LiteRT descriptor passes`() {
        val descriptor = descriptor()

        assertTrue(LiteRtModelContract.validate(descriptor).isValid)
        assertFalse(descriptor.coordinatesNormalized)
    }

    @Test
    fun `legacy framework and unsupported signature are rejected`() {
        val result = LiteRtModelContract.validate(descriptor(framework = "TFLITE", signatureAlgorithm = "RSA"))

        assertFalse(result.isValid)
        assertTrue(result.errors.any { it.contains("运行时") })
        assertTrue(result.errors.any { it.contains("签名算法") })
    }

    private fun descriptor(framework: String = "LiteRT", signatureAlgorithm: String = "ECDSA_P256_SHA256") = LiteRtModelDescriptor(
        modelVersion = "yolo26n-w8a32-v1",
        architecture = "YOLO26n",
        quantization = "W8A32",
        framework = framework,
        inputSize = 640,
        labels = listOf("fish_float"),
        sha256 = "a".repeat(64),
        signature = "c2ln",
        signatureAlgorithm = signatureAlgorithm,
        publicKeyId = "key-1",
    )
}

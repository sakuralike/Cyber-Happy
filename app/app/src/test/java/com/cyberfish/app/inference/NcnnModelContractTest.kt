package com.cyberfish.app.inference

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NcnnModelContractTest {
    @Test
    fun `valid YOLO26n NCNN descriptor passes`() {
        assertTrue(NcnnModelContract.validate(descriptor()).isValid)
    }

    @Test
    fun `unsupported runtime and signature are rejected`() {
        val result = NcnnModelContract.validate(descriptor(framework = "LiteRT", signatureAlgorithm = "RSA"))

        assertFalse(result.isValid)
        assertTrue(result.errors.any { it.contains("运行时") })
        assertTrue(result.errors.any { it.contains("签名算法") })
    }

    @Test
    fun `expired signature is rejected`() {
        val result = NcnnModelContract.validate(
            descriptor().copy(signatureExpiresAtMillis = 1_000L),
            nowMillis = 1_001L,
        )

        assertFalse(result.isValid)
        assertTrue(result.errors.any { it.contains("过期") })
    }

    private fun descriptor(framework: String = "NCNN", signatureAlgorithm: String = "ECDSA_P256_SHA256") = NcnnModelDescriptor(
        modelVersion = "yolo26n-ncnn-v1",
        architecture = "YOLO26n",
        quantization = "FP32",
        framework = framework,
        inputSize = 640,
        labels = listOf("fish_float"),
        sha256 = "a".repeat(64),
        signature = "c2ln",
        signatureAlgorithm = signatureAlgorithm,
        publicKeyId = "key-1",
    )
}

package com.cyberfish.app.update

import com.cyberfish.app.inference.LiteRtModelDescriptor
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class ModelSignatureVerifierTest {
    private lateinit var directory: File

    @Before
    fun setUp() {
        directory = Files.createTempDirectory("cyberfish-signature").toFile()
    }

    @After
    fun tearDown() {
        directory.deleteRecursively()
    }

    @Test
    fun `valid P-256 signature verifies`() {
        val keyPair = keyPair()
        val file = writeModel("model-bytes")
        val descriptor = descriptor("current", sign(keyPair, file.readBytes()))

        assertTrue(PublicKeyModelSignatureVerifier(mapOf("current" to publicKey(keyPair))).verify(file, descriptor))
    }

    @Test
    fun `rotated key is accepted and unknown key is rejected`() {
        val current = keyPair()
        val rotated = keyPair()
        val file = writeModel("rotated-model")
        val signature = sign(rotated, file.readBytes())
        val verifier = PublicKeyModelSignatureVerifier(
            mapOf("current" to publicKey(current), "rotated" to publicKey(rotated)),
        )

        assertTrue(verifier.verify(file, descriptor("rotated", signature)))
        assertFalse(verifier.verify(file, descriptor("unknown", signature)))
    }

    @Test
    fun `tampered model and signature are rejected`() {
        val keyPair = keyPair()
        val file = writeModel("original-model")
        val signature = sign(keyPair, file.readBytes())
        val verifier = PublicKeyModelSignatureVerifier(mapOf("key" to publicKey(keyPair)))
        file.writeText("tampered-model")

        assertFalse(verifier.verify(file, descriptor("key", signature)))
        assertFalse(verifier.verify(writeModel("other-model"), descriptor("key", signature)))
    }

    @Test
    fun `expired signature is rejected before cryptographic verification`() {
        val keyPair = keyPair()
        val file = writeModel("expired-model")
        val verifier = PublicKeyModelSignatureVerifier(mapOf("key" to publicKey(keyPair)))

        assertFalse(verifier.verify(file, descriptor("key", sign(keyPair, file.readBytes())).copy(signatureExpiresAtMillis = 1L)))
    }

    private fun descriptor(keyId: String, signature: String) = LiteRtModelDescriptor(
        modelVersion = "yolo26n-w8a32-v1",
        architecture = "YOLO26n",
        quantization = "W8A32",
        framework = "LiteRT",
        inputSize = 640,
        labels = listOf("fish_float"),
        sha256 = "a".repeat(64),
        signature = signature,
        signatureAlgorithm = "ECDSA_P256_SHA256",
        publicKeyId = keyId,
    )

    private fun writeModel(content: String): File = File(directory, "model-${System.nanoTime()}.tflite").also { it.writeText(content) }

    private fun keyPair(): KeyPair = KeyPairGenerator.getInstance("EC").apply {
        initialize(ECGenParameterSpec("secp256r1"))
    }.generateKeyPair()

    private fun publicKey(keyPair: KeyPair): String = Base64.getEncoder().encodeToString(keyPair.public.encoded)

    private fun sign(keyPair: KeyPair, bytes: ByteArray): String = Base64.getEncoder().encodeToString(
        Signature.getInstance("SHA256withECDSA").run {
            initSign(keyPair.private)
            update(bytes)
            sign()
        },
    )
}

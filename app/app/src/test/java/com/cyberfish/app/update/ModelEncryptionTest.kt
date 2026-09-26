package com.cyberfish.app.update

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.spec.MGF1ParameterSpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

class ModelEncryptionTest {
    @Test
    fun `decrypts device-bound AES-GCM container and rejects tampering`() {
        val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val plaintext = "encrypted-ncnn-bundle".toByteArray()
        val deviceId = "device-1"
        val version = "model-v1"
        val file = container(plaintext, deviceId, version, keyPair.public.encoded)
        val provider = object : ModelKeyProvider {
            override fun ensureKey() = ModelKeyMaterial("key-1", Base64.getEncoder().encodeToString(keyPair.public.encoded), "SOFTWARE")
            override fun decryptWrappedKey(wrappedKey: ByteArray): ByteArray = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
                init(Cipher.DECRYPT_MODE, keyPair.private, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
                doFinal(wrappedKey)
            }
        }

        assertArrayEquals(plaintext, EncryptedModelContainer.decrypt(file, provider, deviceId, version))
        val tampered = file.readBytes().also { it[it.lastIndex - 1] = (it[it.lastIndex - 1].toInt() xor 1).toByte() }
        file.writeBytes(tampered)
        assertThrows(Exception::class.java) { EncryptedModelContainer.decrypt(file, provider, deviceId, version) }
        file.delete()
    }

    private fun container(plaintext: ByteArray, deviceId: String, version: String, publicKey: ByteArray): File {
        val dek = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        val nonce = ByteArray(12) { it.toByte() }
        val aad = "cyberfish-model-v1|model-id|$version|$deviceId|sha"
        val encrypted = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, dek, GCMParameterSpec(128, nonce))
            updateAAD(aad.toByteArray())
            doFinal(plaintext)
        }
        val wrapped = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            val key = java.security.KeyFactory.getInstance("RSA").generatePublic(java.security.spec.X509EncodedKeySpec(publicKey))
            init(Cipher.ENCRYPT_MODE, key, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
            doFinal(dek.encoded)
        }
        val header = JSONObject()
            .put("version", 1)
            .put("algorithm", "AES_256_GCM_RSA_OAEP_SHA256")
            .put("deviceId", deviceId)
            .put("modelVersion", version)
            .put("keyId", "key-1")
            .put("keyWrap", "RSA_OAEP_SHA256_MGF1_SHA1")
            .put("authorizedUntil", "2099-01-01T00:00:00Z")
            .put("nonce", Base64.getEncoder().encodeToString(nonce))
            .put("wrappedKey", Base64.getEncoder().encodeToString(wrapped))
            .put("aad", aad)
            .toString().toByteArray()
        val prefix = ByteBuffer.allocate(12).order(ByteOrder.BIG_ENDIAN)
            .put("CFMODEL1".toByteArray())
            .putInt(header.size)
            .array()
        return Files.createTempFile("encrypted-model", ".bin").toFile().apply {
            writeBytes(prefix + header + encrypted)
        }
    }
}

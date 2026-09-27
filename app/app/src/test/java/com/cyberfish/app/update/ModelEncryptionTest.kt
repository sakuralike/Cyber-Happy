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

        assertArrayEquals(plaintext, EncryptedModelContainer.decrypt(file, provider, deviceId, version, allowLegacyV1 = true))
        val tampered = file.readBytes().also { it[it.lastIndex - 1] = (it[it.lastIndex - 1].toInt() xor 1).toByte() }
        file.writeBytes(tampered)
        assertThrows(Exception::class.java) { EncryptedModelContainer.decrypt(file, provider, deviceId, version, allowLegacyV1 = true) }
        file.delete()
    }

    @Test
    fun `CFMODEL1 is rejected unless legacy compatibility is explicitly enabled`() {
        val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val file = container("legacy-model".toByteArray(), "device-1", "model-v1", keyPair.public.encoded)
        val provider = provider(keyPair)

        assertThrows(Exception::class.java) {
            EncryptedModelContainer.decrypt(file, provider, "device-1", "model-v1")
        }
        file.delete()
    }

    @Test
    fun `CFMODEL2 authenticates manifest and binds generation and descriptor`() {
        val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val plaintext = "encrypted-ncnn-v2".toByteArray()
        val manifest = JSONObject()
            .put("version", 2)
            .put("modelId", "model-id")
            .put("modelVersion", "model-v2")
            .put("generation", 7)
            .put("deviceId", "device-2")
            .put("keyId", "key-1")
            .put("sha256", sha256(plaintext))
            .toString()
        val file = containerV2(plaintext, manifest, "device-2", "model-v2", "model-id", 7, keyPair.public.encoded)
        val provider = provider(keyPair)

        assertArrayEquals(
            plaintext,
            EncryptedModelContainer.decrypt(
                file,
                provider,
                expectedDeviceId = "device-2",
                expectedModelVersion = "model-v2",
                expectedModelId = "model-id",
                expectedGeneration = 7,
                manifestVerifier = { hash, signature, algorithm, keyId ->
                    hash == sha256(manifest.toByteArray()) && signature == "valid" &&
                        algorithm == "ECDSA_P256_SHA256" && keyId == "manifest-key"
                },
            ),
        )
        assertThrows(Exception::class.java) {
            EncryptedModelContainer.decrypt(
                file,
                provider,
                expectedDeviceId = "device-2",
                expectedModelVersion = "model-v2",
                expectedGeneration = 6,
                manifestVerifier = { _, _, _, _ -> true },
            )
        }
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

    private fun containerV2(
        plaintext: ByteArray,
        manifest: String,
        deviceId: String,
        version: String,
        modelId: String,
        generation: Long,
        publicKey: ByteArray,
    ): File {
        val dek = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        val nonce = ByteArray(12) { (it + 3).toByte() }
        val manifestBytes = manifest.toByteArray()
        val manifestHash = sha256(manifestBytes)
        val wrapped = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            val key = java.security.KeyFactory.getInstance("RSA").generatePublic(java.security.spec.X509EncodedKeySpec(publicKey))
            init(Cipher.ENCRYPT_MODE, key, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
            doFinal(dek.encoded)
        }
        val nonceText = Base64.getEncoder().encodeToString(nonce)
        val wrappedText = Base64.getEncoder().encodeToString(wrapped)
        val authorizedUntil = "2099-01-01T00:00:00Z"
        val encrypted = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, dek, GCMParameterSpec(128, nonce))
            updateAAD(manifestBytes)
            doFinal(plaintext)
        }
        val header = JSONObject()
            .put("version", 2)
            .put("algorithm", "AES_256_GCM_RSA_OAEP_SHA256")
            .put("modelId", modelId)
            .put("modelVersion", version)
            .put("deviceId", deviceId)
            .put("keyId", "key-1")
            .put("keyWrap", "RSA_OAEP_SHA256_MGF1_SHA1")
            .put("authorizedUntil", authorizedUntil)
            .put("nonce", nonceText)
            .put("wrappedKey", wrappedText)
            .put("manifest", manifest)
            .put("manifestHash", manifestHash)
            .put("manifestSignature", "valid")
            .put("manifestSignatureAlgorithm", "ECDSA_P256_SHA256")
            .put("manifestPublicKeyId", "manifest-key")
        val prefix = ByteBuffer.allocate(12).order(ByteOrder.BIG_ENDIAN)
            .put("CFMODEL2".toByteArray())
            .putInt(header.toString().toByteArray().size)
            .array()
        return Files.createTempFile("encrypted-model-v2", ".bin").toFile().apply {
            writeBytes(prefix + header.toString().toByteArray() + encrypted)
        }
    }

    private fun provider(keyPair: java.security.KeyPair): ModelKeyProvider = object : ModelKeyProvider {
        override fun ensureKey() = ModelKeyMaterial("key-1", Base64.getEncoder().encodeToString(keyPair.public.encoded), "SOFTWARE")
        override fun decryptWrappedKey(wrappedKey: ByteArray): ByteArray = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            init(Cipher.DECRYPT_MODE, keyPair.private, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
            doFinal(wrappedKey)
        }
    }

    private fun sha256(bytes: ByteArray): String = java.security.MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it) }
}

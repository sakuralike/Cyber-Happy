package com.cyberfish.app.update

import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class ModelKeyMaterial(val keyId: String, val publicKey: String, val securityLevel: String)

interface ModelKeyProvider {
    fun ensureKey(): ModelKeyMaterial
    fun decryptWrappedKey(wrappedKey: ByteArray): ByteArray
}

object EncryptedModelContainer {
    private val magic = "CFMODEL1".toByteArray(Charsets.US_ASCII)
    private const val TAG_BYTES = 16

    fun decrypt(
        file: File,
        keyProvider: ModelKeyProvider,
        expectedDeviceId: String? = null,
        expectedModelVersion: String? = null,
    ): ByteArray {
        val bytes = file.readBytes()
        require(bytes.size >= magic.size + 4 + TAG_BYTES) { "加密模型包过短" }
        require(bytes.copyOfRange(0, magic.size).contentEquals(magic)) { "加密模型包格式无效" }
        val headerLength = ByteBuffer.wrap(bytes, magic.size, 4).order(ByteOrder.BIG_ENDIAN).int
        val headerStart = magic.size + 4
        val bodyStart = headerStart + headerLength
        require(headerLength > 0 && bodyStart + TAG_BYTES <= bytes.size) { "加密模型包头无效" }
        val header = JSONObject(String(bytes, headerStart, headerLength, Charsets.UTF_8))
        require(header.optInt("version", 0) == 1) { "加密模型包版本不支持" }
        require(header.optString("algorithm") == "AES_256_GCM_RSA_OAEP_SHA256") { "加密模型算法不支持" }
        require(header.optString("keyWrap") == "RSA_OAEP_SHA256_MGF1_SHA1") { "模型密钥封装算法不支持" }
        require(header.optString("keyId") == keyProvider.ensureKey().keyId) { "加密模型密钥标识不匹配" }
        require(expectedDeviceId == null || header.optString("deviceId") == expectedDeviceId) { "加密模型设备不匹配" }
        require(expectedModelVersion == null || header.optString("modelVersion") == expectedModelVersion) { "加密模型版本不匹配" }
        val authorizedUntil = runCatching { Instant.parse(header.optString("authorizedUntil")).toEpochMilli() }.getOrDefault(0L)
        require(authorizedUntil > System.currentTimeMillis()) { "设备模型授权已过期" }
        val nonce = Base64.getDecoder().decode(header.optString("nonce"))
        val wrappedKey = Base64.getDecoder().decode(header.optString("wrappedKey"))
        val aad = header.optString("aad").toByteArray(Charsets.UTF_8)
        require(nonce.size == 12 && wrappedKey.isNotEmpty() && aad.isNotEmpty()) { "加密模型包字段无效" }
        val ciphertextWithTag = bytes.copyOfRange(bodyStart, bytes.size)
        val dek = keyProvider.decryptWrappedKey(wrappedKey)
        return try {
            Cipher.getInstance("AES/GCM/NoPadding").run {
                init(Cipher.DECRYPT_MODE, SecretKeySpec(dek, "AES"), GCMParameterSpec(128, nonce))
                updateAAD(aad)
                doFinal(ciphertextWithTag)
            }
        } finally {
            dek.fill(0)
        }
    }
}

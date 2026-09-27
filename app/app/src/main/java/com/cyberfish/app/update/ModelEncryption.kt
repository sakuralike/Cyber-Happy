package com.cyberfish.app.update

import com.cyberfish.app.inference.NcnnModelDescriptor
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class ModelKeyMaterial(val keyId: String, val publicKey: String, val securityLevel: String)

interface ModelKeyProvider {
    fun ensureKey(): ModelKeyMaterial
    fun decryptWrappedKey(wrappedKey: ByteArray): ByteArray
}

typealias ModelManifestVerifier = (
    manifestHash: String,
    signature: String,
    algorithm: String,
    publicKeyId: String,
) -> Boolean

object EncryptedModelContainer {
    const val CFMODEL2_VERSION = 2
    private val legacyMagic = "CFMODEL1".toByteArray(Charsets.US_ASCII)
    private val v2Magic = "CFMODEL2".toByteArray(Charsets.US_ASCII)
    private const val TAG_BYTES = 16
    private const val MAX_CONTAINER_BYTES = 120L * 1024 * 1024
    private const val MAX_HEADER_BYTES = 1 * 1024 * 1024
    private const val MAX_MANIFEST_BYTES = 256 * 1024
    private const val ECDSA_P256_SHA256 = "ECDSA_P256_SHA256"

    /** Decrypts a model container. Legacy CFMODEL1 is disabled unless explicitly enabled. */
    fun decrypt(
        file: File,
        keyProvider: ModelKeyProvider,
        expectedDeviceId: String? = null,
        expectedModelVersion: String? = null,
        expectedModelId: String? = null,
        expectedGeneration: Long? = null,
        expectedManifestHash: String? = null,
        expectedDescriptor: NcnnModelDescriptor? = null,
        manifestVerifier: ModelManifestVerifier? = null,
        allowLegacyV1: Boolean = false,
    ): ByteArray {
        require(file.length() in (v2Magic.size + 4 + TAG_BYTES).toLong()..MAX_CONTAINER_BYTES) { "加密模型包大小无效" }
        val bytes = file.readBytes()
        require(bytes.size >= v2Magic.size + 4 + TAG_BYTES) { "加密模型包过短" }
        val magic = bytes.copyOfRange(0, v2Magic.size)
        val isLegacy = magic.contentEquals(legacyMagic)
        require(isLegacy || magic.contentEquals(v2Magic)) { "加密模型包格式无效" }
        require(!isLegacy || allowLegacyV1) { "旧版加密模型包已禁用" }

        val headerStart = v2Magic.size + 4
        val headerLength = ByteBuffer.wrap(bytes, v2Magic.size, 4).order(ByteOrder.BIG_ENDIAN).int
        require(headerLength > 0 && headerLength <= MAX_HEADER_BYTES && headerLength <= bytes.size - headerStart - TAG_BYTES) {
            "加密模型包头无效"
        }
        val bodyStart = headerStart + headerLength
        val header = JSONObject(String(bytes, headerStart, headerLength, Charsets.UTF_8))
        val version = header.optInt("version", 0)
        require(if (isLegacy) version == 1 else version == CFMODEL2_VERSION) { "加密模型包版本不支持" }
        require(header.optString("algorithm") == "AES_256_GCM_RSA_OAEP_SHA256") { "加密模型算法不支持" }
        require(header.optString("keyWrap") == "RSA_OAEP_SHA256_MGF1_SHA1") { "模型密钥封装算法不支持" }

        val keyMaterial = keyProvider.ensureKey()
        val manifestForHeader = if (!isLegacy) runCatching { JSONObject(header.optString("manifest")) }.getOrNull() else null
        val keyId = header.optString("keyId").ifBlank { manifestForHeader?.optString("keyId").orEmpty() }
        require(keyId == keyMaterial.keyId) { "加密模型密钥标识不匹配" }
        val headerDeviceId = header.optString("deviceId").ifBlank { manifestForHeader?.optString("deviceId").orEmpty() }
        val headerModelVersion = header.optString("modelVersion").ifBlank { manifestForHeader?.optString("modelVersion").orEmpty() }
        require(expectedDeviceId == null || headerDeviceId == expectedDeviceId) { "加密模型设备不匹配" }
        require(expectedModelVersion == null || headerModelVersion == expectedModelVersion) { "加密模型版本不匹配" }

        val authorizedUntil = runCatching {
            Instant.parse(header.optString("authorizedUntil").ifBlank { manifestForHeader?.optString("authorizedUntil").orEmpty() }).toEpochMilli()
        }.getOrDefault(0L)
        require(authorizedUntil > System.currentTimeMillis()) { "设备模型授权已过期" }
        val nonce = decodeBase64(header.optString("nonce"), "nonce")
        val wrappedKey = decodeBase64(header.optString("wrappedKey"), "wrappedKey")
        require(nonce.size == 12 && wrappedKey.isNotEmpty()) { "加密模型包字段无效" }

        val aad = if (isLegacy) {
            val legacyAad = header.optString("aad").toByteArray(Charsets.UTF_8)
            require(legacyAad.isNotEmpty()) { "加密模型包字段无效" }
            legacyAad
        } else {
            val manifestText = header.optString("manifest")
            require(manifestText.isNotBlank()) { "CFMODEL2 manifest 缺失" }
            val manifestBytes = manifestText.toByteArray(Charsets.UTF_8)
            require(manifestBytes.size <= MAX_MANIFEST_BYTES) { "CFMODEL2 manifest 过大" }
            val manifestHash = sha256(manifestBytes)
            require(header.optString("manifestHash").equals(manifestHash, ignoreCase = true)) {
                "CFMODEL2 manifest 摘要不匹配"
            }
            require(expectedManifestHash == null || expectedManifestHash.equals(manifestHash, ignoreCase = true)) {
                "CFMODEL2 manifest 摘要与模型元数据不匹配"
            }
            val signature = header.optString("manifestSignature")
            val algorithm = header.optString("manifestSignatureAlgorithm")
            val publicKeyId = header.optString("manifestPublicKeyId")
            require(algorithm == ECDSA_P256_SHA256 && signature.isNotBlank() && publicKeyId.isNotBlank()) {
                "CFMODEL2 manifest 签名字段无效"
            }
            require(manifestVerifier?.invoke(manifestHash, signature, algorithm, publicKeyId) == true) {
                "CFMODEL2 manifest 签名校验失败"
            }

            val manifest = JSONObject(manifestText)
            require(manifest.optInt("version", CFMODEL2_VERSION) == CFMODEL2_VERSION) { "CFMODEL2 manifest 版本无效" }
            require(manifest.optString("keyId") == keyId) { "CFMODEL2 manifest 密钥标识不匹配" }
            require(expectedDeviceId == null || manifest.optString("deviceId") == expectedDeviceId) { "CFMODEL2 manifest 设备不匹配" }
            require(expectedModelVersion == null || manifest.optString("modelVersion") == expectedModelVersion) { "CFMODEL2 manifest 版本不匹配" }
            require(expectedModelId == null || manifest.optString("modelId") == expectedModelId) { "CFMODEL2 manifest 模型不匹配" }
            if (expectedGeneration != null) {
                require(manifest.optLong("generation", Long.MIN_VALUE) == expectedGeneration) { "CFMODEL2 manifest generation 不匹配" }
            } else {
                require(manifest.has("generation") && manifest.optLong("generation", Long.MIN_VALUE) >= 0L) { "CFMODEL2 manifest generation 无效" }
            }
            require(manifest.optString("sha256").matches(Regex("[A-Fa-f0-9]{64}"))) { "CFMODEL2 manifest SHA-256 无效" }
            expectedDescriptor?.let { validateManifestDescriptor(manifestText, it) }
            manifestBytes
        }

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

    /** Compares the signed CFMODEL2 manifest descriptor with API metadata before loading NCNN. */
    fun validateManifestDescriptor(manifestText: String, descriptor: NcnnModelDescriptor) {
        val manifest = JSONObject(manifestText)
        val modelDescriptor = manifest.optJSONObject("descriptor") ?: manifest
        fun requireString(name: String, expected: String) {
            require(modelDescriptor.optString(name) == expected) { "CFMODEL2 manifest $name 不匹配" }
        }
        requireString("modelVersion", descriptor.modelVersion)
        requireString("architecture", descriptor.architecture)
        requireString("quantization", descriptor.quantization)
        requireString("framework", descriptor.framework)
        require(modelDescriptor.optInt("inputSize", 0) == descriptor.inputSize) { "CFMODEL2 manifest inputSize 不匹配" }
        require(modelDescriptor.optString("inputName", "in0") == descriptor.inputName) { "CFMODEL2 manifest inputName 不匹配" }
        require(modelDescriptor.optString("outputName", "out0") == descriptor.outputName) { "CFMODEL2 manifest outputName 不匹配" }
        require(modelDescriptor.optString("outputLayout") == descriptor.outputLayout) { "CFMODEL2 manifest outputLayout 不匹配" }
        require(modelDescriptor.optInt("valuesPerDetection", 0) == descriptor.valuesPerDetection) { "CFMODEL2 manifest valuesPerDetection 不匹配" }
        require(modelDescriptor.optBoolean("coordinatesNormalized", false) == descriptor.coordinatesNormalized) { "CFMODEL2 manifest coordinatesNormalized 不匹配" }
        require(modelDescriptor.optInt("numClasses", 0) == descriptor.numClasses) { "CFMODEL2 manifest numClasses 不匹配" }
        require(modelDescriptor.optString("sha256") == descriptor.sha256) { "CFMODEL2 manifest descriptor SHA-256 不匹配" }
    }

    private fun decodeBase64(value: String, field: String): ByteArray = try {
        require(value.isNotBlank()) { "$field 缺失" }
        Base64.getDecoder().decode(value)
    } catch (error: Exception) {
        throw IllegalArgumentException("CFMODEL2 $field 无效", error)
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it) }
}

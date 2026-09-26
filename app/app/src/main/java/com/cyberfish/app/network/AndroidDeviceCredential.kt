package com.cyberfish.app.network

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class DeviceSigningMaterial(
    val keyId: String,
    val publicKey: String,
    val securityLevel: String,
)

interface DeviceSigningKeyProvider {
    fun ensureKey(): DeviceSigningMaterial
    fun sign(value: ByteArray): String
}

class AndroidDeviceSigningKey : DeviceSigningKeyProvider {
    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    @Synchronized
    override fun ensureKey(): DeviceSigningMaterial {
        if (!keyStore.containsAlias(SIGNING_ALIAS)) {
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE).run {
                initialize(
                    KeyGenParameterSpec.Builder(
                        SIGNING_ALIAS,
                        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                    )
                        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(false)
                        .build(),
                )
                generateKeyPair()
            }
        }
        val certificate = keyStore.getCertificate(SIGNING_ALIAS) ?: error("设备签名密钥不可用")
        val privateKey = (keyStore.getEntry(SIGNING_ALIAS, null) as? KeyStore.PrivateKeyEntry)?.privateKey
            ?: error("设备签名私钥不可用")
        val encoded = certificate.publicKey.encoded
        val keyInfo = KeyFactory.getInstance(privateKey.algorithm, ANDROID_KEYSTORE)
            .getKeySpec(privateKey, KeyInfo::class.java)
        val securityLevel = if (Build.VERSION.SDK_INT >= 31) {
            when (keyInfo.securityLevel) {
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
                KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
                else -> "UNKNOWN"
            }
        } else if (keyInfo.isInsideSecureHardware) {
            "TEE"
        } else {
            "SOFTWARE"
        }
        return DeviceSigningMaterial(
            keyId = "ec-${sha256Hex(encoded).take(32)}",
            publicKey = Base64.getEncoder().encodeToString(encoded),
            securityLevel = securityLevel,
        )
    }

    @Synchronized
    override fun sign(value: ByteArray): String {
        ensureKey()
        val privateKey = (keyStore.getEntry(SIGNING_ALIAS, null) as? KeyStore.PrivateKeyEntry)?.privateKey
            ?: error("设备签名私钥不可用")
        return Signature.getInstance("SHA256withECDSA").run {
            initSign(privateKey)
            update(value)
            Base64.getEncoder().encodeToString(sign())
        }
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val SIGNING_ALIAS = "cyberfish.device.signing.v1"
    }
}

interface DeviceAccessTokenPersistence {
    fun read(): DeviceAccessToken?
    fun save(value: DeviceAccessToken)
    fun clear()
}

class DeviceAccessTokenStore(context: Context) : DeviceAccessTokenPersistence {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    @Synchronized
    override fun read(): DeviceAccessToken? = runCatching {
        val encoded = preferences.getString(KEY_TOKEN, null) ?: return null
        val envelope = Base64.getDecoder().decode(encoded)
        require(envelope.size > NONCE_BYTES)
        val plaintext = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, envelope.copyOfRange(0, NONCE_BYTES)))
            doFinal(envelope.copyOfRange(NONCE_BYTES, envelope.size))
        }
        val json = JSONObject(plaintext.toString(Charsets.UTF_8))
        plaintext.fill(0)
        DeviceAccessToken(
            token = json.getString("token"),
            deviceId = json.getString("deviceId"),
            signingKeyId = json.getString("signingKeyId"),
            expiresAtMillis = json.getLong("expiresAtMillis"),
            scopes = json.optJSONArray("scopes")?.let { array ->
                buildSet { for (index in 0 until array.length()) add(array.getString(index)) }
            }.orEmpty(),
        )
    }.getOrElse {
        clear()
        null
    }

    @Synchronized
    override fun save(value: DeviceAccessToken) {
        val plaintext = JSONObject()
            .put("token", value.token)
            .put("deviceId", value.deviceId)
            .put("signingKeyId", value.signingKeyId)
            .put("expiresAtMillis", value.expiresAtMillis)
            .put("scopes", JSONArray(value.scopes.sorted()))
            .toString()
            .toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, encryptionKey())
        }
        val ciphertext = cipher.doFinal(plaintext)
        plaintext.fill(0)
        val envelope = cipher.iv + ciphertext
        preferences.edit().putString(KEY_TOKEN, Base64.getEncoder().encodeToString(envelope)).apply()
    }

    @Synchronized
    override fun clear() {
        preferences.edit().remove(KEY_TOKEN).apply()
    }

    private fun encryptionKey(): SecretKey {
        (keyStore.getKey(ENCRYPTION_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    ENCRYPTION_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ENCRYPTION_ALIAS = "cyberfish.device.token.v1"
        const val PREFERENCES = "cyberfish_device_auth"
        const val KEY_TOKEN = "access_token"
        const val NONCE_BYTES = 12
    }
}

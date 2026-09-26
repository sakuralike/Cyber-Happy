package com.cyberfish.app.update

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.KeyInfo
import android.os.Build
import java.security.KeyFactory
import java.security.KeyStore
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import java.security.spec.MGF1ParameterSpec

class AndroidModelKeyStore : ModelKeyProvider {
    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    @Synchronized
    override fun ensureKey(): ModelKeyMaterial {
        if (!keyStore.containsAlias(ALIAS)) {
            val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, ANDROID_KEYSTORE)
            generator.initialize(
                KeyGenParameterSpec.Builder(
                    ALIAS,
                    KeyProperties.PURPOSE_DECRYPT,
                )
                    .setKeySize(3072)
                    .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generator.generateKeyPair()
        }
        val certificate = keyStore.getCertificate(ALIAS) ?: error("设备模型密钥不可用")
        val privateKey = (keyStore.getEntry(ALIAS, null) as? KeyStore.PrivateKeyEntry)?.privateKey ?: error("设备模型私钥不可用")
        val keyInfo = KeyFactory.getInstance(privateKey.algorithm, ANDROID_KEYSTORE).getKeySpec(privateKey, KeyInfo::class.java)
        val securityLevel = if (Build.VERSION.SDK_INT >= 31) {
            when (keyInfo.securityLevel) {
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
                KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
                else -> "UNKNOWN"
            }
        } else if (keyInfo.isInsideSecureHardware) "TEE" else "SOFTWARE"
        val publicKey = Base64.getEncoder().encodeToString(certificate.publicKey.encoded)
        val keyId = "rsa-${sha256(publicKey).take(32)}"
        return ModelKeyMaterial(keyId, publicKey, securityLevel)
    }

    @Synchronized
    override fun decryptWrappedKey(wrappedKey: ByteArray): ByteArray {
        val entry = keyStore.getEntry(ALIAS, null) as? KeyStore.PrivateKeyEntry ?: error("设备模型私钥不可用")
        return Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            init(
                Cipher.DECRYPT_MODE,
                entry.privateKey,
                OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT),
            )
            doFinal(wrappedKey)
        }
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "cyberfish.model.rsa.v1"
    }
}

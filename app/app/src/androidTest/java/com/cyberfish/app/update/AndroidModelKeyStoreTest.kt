package com.cyberfish.app.update

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyFactory
import java.security.spec.MGF1ParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

@RunWith(AndroidJUnit4::class)
class AndroidModelKeyStoreTest {
    @Test
    fun devicePrivateKeyIsStableAndUnwrapsOnlyInsideAndroidKeystore() {
        val store = AndroidModelKeyStore()
        val first = store.ensureKey()
        val second = store.ensureKey()
        assertEquals(first, second)
        assertTrue(first.keyId.startsWith("rsa-"))

        val publicKey = KeyFactory.getInstance("RSA").generatePublic(
            X509EncodedKeySpec(Base64.getDecoder().decode(first.publicKey)),
        )
        val dek = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().encoded
        val wrapped = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            init(Cipher.ENCRYPT_MODE, publicKey, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
            doFinal(dek)
        }
        assertArrayEquals(dek, store.decryptWrappedKey(wrapped))
    }
}

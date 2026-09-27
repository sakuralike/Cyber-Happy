package com.cyberfish.app.network

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONObject
import java.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

data class UserAccount(
    val id: String,
    val username: String,
    val displayName: String,
    val email: String?,
    val avatarUrl: String? = null,
)

data class UserSession(
    val token: String,
    val user: UserAccount,
)

internal const val USER_SESSION_IDLE_TIMEOUT_MILLIS = 30L * 24L * 60L * 60L * 1_000L

internal fun isUserSessionExpired(lastOpenedAtMillis: Long, nowMillis: Long): Boolean =
    lastOpenedAtMillis > 0L && nowMillis >= lastOpenedAtMillis && nowMillis - lastOpenedAtMillis >= USER_SESSION_IDLE_TIMEOUT_MILLIS

internal fun isUserSessionTokenExpired(token: String, nowMillis: Long): Boolean = runCatching {
    val payload = token.split('.').getOrNull(1) ?: return@runCatching true
    val decoded = String(Base64.getUrlDecoder().decode(payload), Charsets.UTF_8)
    val expirySeconds = JSONObject(decoded).optLong("exp", Long.MIN_VALUE)
    expirySeconds == Long.MIN_VALUE || nowMillis >= expirySeconds * 1_000L
}.getOrDefault(true)

interface UserSessionProvider {
    suspend fun get(): UserSession?

    suspend fun clear() = Unit
}

object EmptyUserSessionProvider : UserSessionProvider {
    override suspend fun get(): UserSession? = null
}

private val Context.userSessionStore by preferencesDataStore(name = "cyberfish_user_session")

class UserSessionStore(private val context: Context) : UserSessionProvider {
    val session: Flow<UserSession?> = context.userSessionStore.data.map { values ->
        readSession(values, System.currentTimeMillis())
    }

    override suspend fun get(): UserSession? {
        val nowMillis = System.currentTimeMillis()
        val values = context.userSessionStore.data.first()
        val result = readSession(values, nowMillis)
        if (result == null && (values[Keys.token] != null || values[Keys.encryptedToken] != null)) clear()
        else if (result != null && values[Keys.token] != null) save(result)
        return result
    }

    suspend fun resume(): UserSession? {
        val nowMillis = System.currentTimeMillis()
        val values = context.userSessionStore.data.first()
        val result = readSession(values, nowMillis)
        if (result == null) {
            if (values[Keys.token] != null || values[Keys.encryptedToken] != null) clear()
            return null
        }
        if (values[Keys.token] != null) save(result)
        context.userSessionStore.edit { it[Keys.lastOpenedAtMillis] = nowMillis }
        return result
    }

    private fun readSession(values: Preferences, nowMillis: Long): UserSession? {
        val token = (values[Keys.encryptedToken]?.let { runCatching { SessionTokenCipher.decrypt(it) }.getOrNull() }
            ?: values[Keys.token])?.takeIf { it.isNotBlank() } ?: return null
        val id = values[Keys.id]?.takeIf { it.isNotBlank() } ?: return null
        val username = values[Keys.username]?.takeIf { it.isNotBlank() } ?: return null
        val lastOpenedAtMillis = values[Keys.lastOpenedAtMillis] ?: nowMillis
        if (isUserSessionExpired(lastOpenedAtMillis, nowMillis)) return null
        if (isUserSessionTokenExpired(token, nowMillis)) return null
        val displayName = values[Keys.displayName]?.takeIf { it.isNotBlank() } ?: username
        return UserSession(
            token = token,
            user = UserAccount(
                id = id,
                username = username,
                displayName = displayName,
                email = values[Keys.email]?.takeIf { it.isNotBlank() },
                avatarUrl = values[Keys.avatarUrl]?.takeIf { it.isNotBlank() },
            ),
        )
    }

    suspend fun save(value: UserSession) {
        context.userSessionStore.edit { values ->
            values[Keys.encryptedToken] = SessionTokenCipher.encrypt(value.token)
            values.remove(Keys.token)
            values[Keys.id] = value.user.id
            values[Keys.username] = value.user.username
            values[Keys.displayName] = value.user.displayName
            values[Keys.email] = value.user.email.orEmpty()
            values[Keys.avatarUrl] = value.user.avatarUrl.orEmpty()
            values[Keys.lastOpenedAtMillis] = System.currentTimeMillis()
        }
    }

    override suspend fun clear() {
        context.userSessionStore.edit { values ->
            values.remove(Keys.token)
            values.remove(Keys.encryptedToken)
            values.remove(Keys.id)
            values.remove(Keys.username)
            values.remove(Keys.displayName)
            values.remove(Keys.email)
            values.remove(Keys.avatarUrl)
            values.remove(Keys.lastOpenedAtMillis)
        }
    }

    private object Keys {
        val token = stringPreferencesKey("token")
        val encryptedToken = stringPreferencesKey("encrypted_token")
        val id = stringPreferencesKey("id")
        val username = stringPreferencesKey("username")
        val displayName = stringPreferencesKey("display_name")
        val email = stringPreferencesKey("email")
        val avatarUrl = stringPreferencesKey("avatar_url")
        val lastOpenedAtMillis = longPreferencesKey("last_opened_at_millis")
    }
}

private object SessionTokenCipher {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "cyberfish.user.session.v1"
    private const val IV_BYTES = 12

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    ALIAS,
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

    fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, key())
        }
        return Base64.getEncoder().encodeToString(cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8)))
    }

    fun decrypt(encoded: String): String {
        val bytes = Base64.getDecoder().decode(encoded)
        require(bytes.size > IV_BYTES)
        return Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE, key(), javax.crypto.spec.GCMParameterSpec(128, bytes.copyOfRange(0, IV_BYTES)))
            String(doFinal(bytes.copyOfRange(IV_BYTES, bytes.size)), Charsets.UTF_8)
        }
    }
}

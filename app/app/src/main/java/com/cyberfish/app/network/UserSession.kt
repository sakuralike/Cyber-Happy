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
        if (result == null && values[Keys.token] != null) clear()
        return result
    }

    suspend fun resume(): UserSession? {
        val nowMillis = System.currentTimeMillis()
        val values = context.userSessionStore.data.first()
        val result = readSession(values, nowMillis)
        if (result == null) {
            if (values[Keys.token] != null) clear()
            return null
        }
        context.userSessionStore.edit { it[Keys.lastOpenedAtMillis] = nowMillis }
        return result
    }

    private fun readSession(values: Preferences, nowMillis: Long): UserSession? {
        val token = values[Keys.token]?.takeIf { it.isNotBlank() } ?: return null
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
            values[Keys.token] = value.token
            values[Keys.id] = value.user.id
            values[Keys.username] = value.user.username
            values[Keys.displayName] = value.user.displayName
            values[Keys.email] = value.user.email.orEmpty()
            values[Keys.avatarUrl] = value.user.avatarUrl.orEmpty()
            values[Keys.lastOpenedAtMillis] = System.currentTimeMillis()
        }
    }

    suspend fun clear() {
        context.userSessionStore.edit { values ->
            values.remove(Keys.token)
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
        val id = stringPreferencesKey("id")
        val username = stringPreferencesKey("username")
        val displayName = stringPreferencesKey("display_name")
        val email = stringPreferencesKey("email")
        val avatarUrl = stringPreferencesKey("avatar_url")
        val lastOpenedAtMillis = longPreferencesKey("last_opened_at_millis")
    }
}

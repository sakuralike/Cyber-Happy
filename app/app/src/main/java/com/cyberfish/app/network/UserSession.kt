package com.cyberfish.app.network

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class UserAccount(
    val id: String,
    val username: String,
    val displayName: String,
    val email: String?,
)

data class UserSession(
    val token: String,
    val user: UserAccount,
)

interface UserSessionProvider {
    suspend fun get(): UserSession?
}

object EmptyUserSessionProvider : UserSessionProvider {
    override suspend fun get(): UserSession? = null
}

private val Context.userSessionStore by preferencesDataStore(name = "cyberfish_user_session")

class UserSessionStore(private val context: Context) : UserSessionProvider {
    val session: Flow<UserSession?> = context.userSessionStore.data.map { values ->
        val token = values[Keys.token]?.takeIf { it.isNotBlank() } ?: return@map null
        val id = values[Keys.id]?.takeIf { it.isNotBlank() } ?: return@map null
        val username = values[Keys.username]?.takeIf { it.isNotBlank() } ?: return@map null
        val displayName = values[Keys.displayName]?.takeIf { it.isNotBlank() } ?: username
        UserSession(
            token = token,
            user = UserAccount(
                id = id,
                username = username,
                displayName = displayName,
                email = values[Keys.email]?.takeIf { it.isNotBlank() },
            ),
        )
    }

    override suspend fun get(): UserSession? = session.first()

    suspend fun save(value: UserSession) {
        context.userSessionStore.edit { values ->
            values[Keys.token] = value.token
            values[Keys.id] = value.user.id
            values[Keys.username] = value.user.username
            values[Keys.displayName] = value.user.displayName
            values[Keys.email] = value.user.email.orEmpty()
        }
    }

    suspend fun clear() {
        context.userSessionStore.edit { values ->
            values.remove(Keys.token)
            values.remove(Keys.id)
            values.remove(Keys.username)
            values.remove(Keys.displayName)
            values.remove(Keys.email)
        }
    }

    private object Keys {
        val token = stringPreferencesKey("token")
        val id = stringPreferencesKey("id")
        val username = stringPreferencesKey("username")
        val displayName = stringPreferencesKey("display_name")
        val email = stringPreferencesKey("email")
    }
}

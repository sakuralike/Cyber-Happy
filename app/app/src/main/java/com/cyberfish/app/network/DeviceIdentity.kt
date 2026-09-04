package com.cyberfish.app.network

import android.content.Context
import android.os.Build
import android.provider.Settings
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import java.security.MessageDigest

data class DeviceIdentity(
    val deviceId: String,
    val userId: String,
    val deviceModel: String,
    val osVersion: String,
)

interface DeviceIdentityProvider {
    suspend fun get(): DeviceIdentity
}

private val Context.deviceIdentityStore by preferencesDataStore(name = "cyberfish_identity")

class DeviceIdentityStore(private val context: Context) : DeviceIdentityProvider {
    override suspend fun get(): DeviceIdentity = INITIALIZATION_LOCK.withLock {
        val preferences = context.deviceIdentityStore.data.first()
        val deviceId = stableDeviceId(context, preferences[DEVICE_ID])
        if (preferences[DEVICE_ID] == null && deviceId.startsWith("install-")) {
            context.deviceIdentityStore.edit { it[DEVICE_ID] = deviceId }
        }
        return DeviceIdentity(
            deviceId = deviceId,
            userId = "anonymous-$deviceId",
            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            osVersion = "Android ${Build.VERSION.RELEASE}",
        )
    }

    private fun stableDeviceId(context: Context, fallback: String?): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?.trim()
            ?.takeIf { it.isNotEmpty() && !it.equals("9774d56d682e549c", ignoreCase = true) }
        if (androidId != null) return "android-${sha256(androidId).take(32)}"
        return fallback ?: "install-${UUID.randomUUID()}"
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    private companion object {
        val INITIALIZATION_LOCK = Mutex()
        val DEVICE_ID = stringPreferencesKey("device_id")
    }
}

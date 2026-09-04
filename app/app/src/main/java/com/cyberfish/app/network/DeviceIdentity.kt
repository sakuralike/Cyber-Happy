package com.cyberfish.app.network

import android.content.Context
import android.os.Build
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

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
        val deviceId = preferences[DEVICE_ID] ?: UUID.randomUUID().toString().also { value ->
            context.deviceIdentityStore.edit { it[DEVICE_ID] = value }
        }
        return DeviceIdentity(
            deviceId = deviceId,
            userId = "anonymous-$deviceId",
            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            osVersion = "Android ${Build.VERSION.RELEASE}",
        )
    }

    private companion object {
        val INITIALIZATION_LOCK = Mutex()
        val DEVICE_ID = stringPreferencesKey("device_id")
    }
}

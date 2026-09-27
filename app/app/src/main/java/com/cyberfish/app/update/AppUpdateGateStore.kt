package com.cyberfish.app.update

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.cyberfish.app.network.AppDownloadMode
import com.cyberfish.app.network.AppUpdateInfo
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import org.json.JSONObject
import java.io.IOException

private val Context.appUpdateGateDataStore by preferencesDataStore(name = "cyberfish_app_update_gate")

class AppUpdateGateStore(private val context: Context) {
    val forcedUpdate: Flow<AppUpdateInfo?> = context.appUpdateGateDataStore.data
        .catch { error ->
            if (error is IOException) emit(androidx.datastore.preferences.core.emptyPreferences()) else throw error
        }
        .map { preferences -> decode(preferences[FORCED_UPDATE]) }

    suspend fun remember(update: AppUpdateInfo) {
        if (!isBlockingUpdate(update)) return
        context.appUpdateGateDataStore.edit { preferences ->
            preferences[FORCED_UPDATE] = encode(update)
        }
    }

    suspend fun clearIfSatisfied(currentVersionCode: Int) {
        context.appUpdateGateDataStore.edit { preferences ->
            val update = decode(preferences[FORCED_UPDATE])
            if (update?.versionCode != null && update.versionCode <= currentVersionCode) {
                preferences.remove(FORCED_UPDATE)
            }
        }
    }

    companion object {
        private val FORCED_UPDATE = stringPreferencesKey("forced_update")

        internal fun isBlockingUpdate(update: AppUpdateInfo): Boolean =
            update.hasUpdate && update.updateType == "FORCE" && (update.versionCode ?: 0) > 0

        private fun encode(update: AppUpdateInfo): String = JSONObject().apply {
            put("versionCode", update.versionCode)
            put("versionName", update.versionName)
            put("downloadMode", update.downloadMode.name)
            put("releaseNotes", update.releaseNotes)
            put("apkUrl", update.apkUrl)
            put("apkSizeBytes", update.apkSizeBytes)
            put("apkSha256", update.apkSha256)
        }.toString()

        private fun decode(raw: String?): AppUpdateInfo? {
            if (raw.isNullOrBlank()) return null
            return runCatching {
                val value = JSONObject(raw)
                val versionCode = value.optInt("versionCode", 0).takeIf { it > 0 } ?: return null
                AppUpdateInfo(
                    hasUpdate = true,
                    updateType = "FORCE",
                    downloadMode = when (value.optString("downloadMode")) {
                        AppDownloadMode.SERVER.name -> AppDownloadMode.SERVER
                        else -> AppDownloadMode.EXTERNAL
                    },
                    versionName = value.optString("versionName").takeUnless { it.isBlank() || it == "null" },
                    versionCode = versionCode,
                    releaseNotes = value.optString("releaseNotes").takeUnless { it.isBlank() || it == "null" },
                    apkUrl = value.optString("apkUrl").takeUnless { it.isBlank() || it == "null" },
                    apkSizeBytes = value.optLong("apkSizeBytes", Long.MIN_VALUE).takeIf { it != Long.MIN_VALUE },
                    apkSha256 = value.optString("apkSha256").takeUnless { it.isBlank() || it == "null" },
                )
            }.getOrNull()
        }
    }
}

package com.cyberfish.app.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.cyberfish.app.data.model.FishingSpot
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

data class AppPreferences(
    val themeMode: String = "Dark",
    val autoTheme: Boolean = true,
    val soundEnabled: Boolean = true,
    val vibrationEnabled: Boolean = true,
    val notificationEnabled: Boolean = false,
    val quietHoursEnabled: Boolean = true,
    val triggerPreset: String = "中级",
    val sinkThresholdPx: Float = 18f,
    val trembleThresholdHz: Float = 3f,
    val durationSeconds: Float = 0.8f,
    val confidenceThreshold: Float = 0.62f,
    val inferenceBackend: String = "NNAPI",
    val performanceMode: String = "标准",
    val favoriteSpots: Set<String> = emptySet(),
    val favoriteFishingSpots: List<FishingSpot> = emptyList(),
)

private val Context.cyberFishDataStore by preferencesDataStore(name = "cyberfish_preferences")

class AppPreferencesStore(private val context: Context) {
    val data: Flow<AppPreferences> = context.cyberFishDataStore.data
        .catch { error ->
            if (error is IOException) emit(androidx.datastore.preferences.core.emptyPreferences()) else throw error
        }
        .map { values ->
            val legacyFavorites = values[Keys.favoriteSpots] ?: emptySet()
            val storedFishingSpots = decodeFishingSpots(values[Keys.favoriteFishingSpots])
            AppPreferences(
                themeMode = values[Keys.themeMode] ?: "Dark",
                autoTheme = values[Keys.autoTheme] ?: true,
                soundEnabled = values[Keys.soundEnabled] ?: true,
                vibrationEnabled = values[Keys.vibrationEnabled] ?: true,
                notificationEnabled = values[Keys.notificationEnabled] ?: false,
                quietHoursEnabled = values[Keys.quietHoursEnabled] ?: true,
                triggerPreset = values[Keys.triggerPreset] ?: "中级",
                sinkThresholdPx = values[Keys.sinkThresholdPx] ?: 18f,
                trembleThresholdHz = values[Keys.trembleThresholdHz] ?: 3f,
                durationSeconds = values[Keys.durationSeconds] ?: 0.8f,
                confidenceThreshold = values[Keys.confidenceThreshold] ?: 0.62f,
                inferenceBackend = values[Keys.inferenceBackend] ?: "NNAPI",
                performanceMode = values[Keys.performanceMode] ?: "标准",
                favoriteSpots = legacyFavorites,
                favoriteFishingSpots = storedFishingSpots.ifEmpty {
                    legacyFavorites.map(FishingSpot::legacy)
                },
            )
        }

    suspend fun save(preferences: AppPreferences) {
        context.cyberFishDataStore.edit { values ->
            values[Keys.themeMode] = preferences.themeMode
            values[Keys.autoTheme] = preferences.autoTheme
            values[Keys.soundEnabled] = preferences.soundEnabled
            values[Keys.vibrationEnabled] = preferences.vibrationEnabled
            values[Keys.notificationEnabled] = preferences.notificationEnabled
            values[Keys.quietHoursEnabled] = preferences.quietHoursEnabled
            values[Keys.triggerPreset] = preferences.triggerPreset
            values[Keys.sinkThresholdPx] = preferences.sinkThresholdPx
            values[Keys.trembleThresholdHz] = preferences.trembleThresholdHz
            values[Keys.durationSeconds] = preferences.durationSeconds
            values[Keys.confidenceThreshold] = preferences.confidenceThreshold
            values[Keys.inferenceBackend] = preferences.inferenceBackend
            values[Keys.performanceMode] = preferences.performanceMode
            values[Keys.favoriteSpots] = preferences.favoriteFishingSpots.map { it.name }.toSet()
            values[Keys.favoriteFishingSpots] = encodeFishingSpots(preferences.favoriteFishingSpots)
        }
    }

    private object Keys {
        val themeMode = stringPreferencesKey("theme_mode")
        val autoTheme = booleanPreferencesKey("auto_theme")
        val soundEnabled = booleanPreferencesKey("sound_enabled")
        val vibrationEnabled = booleanPreferencesKey("vibration_enabled")
        val notificationEnabled = booleanPreferencesKey("notification_enabled")
        val quietHoursEnabled = booleanPreferencesKey("quiet_hours_enabled")
        val triggerPreset = stringPreferencesKey("trigger_preset")
        val sinkThresholdPx = floatPreferencesKey("sink_threshold_px")
        val trembleThresholdHz = floatPreferencesKey("tremble_threshold_hz")
        val durationSeconds = floatPreferencesKey("duration_seconds")
        val confidenceThreshold = floatPreferencesKey("confidence_threshold")
        val inferenceBackend = stringPreferencesKey("inference_backend")
        val performanceMode = stringPreferencesKey("performance_mode")
        val favoriteSpots = stringSetPreferencesKey("favorite_spots")
        val favoriteFishingSpots = stringPreferencesKey("favorite_fishing_spots")
    }
}

private fun encodeFishingSpots(spots: List<FishingSpot>): String {
    val array = JSONArray()
    spots.forEach { spot ->
        val item = JSONObject()
            .put("id", spot.id)
            .put("name", spot.name)
            .put("source", spot.source)
        spot.latitude?.let { item.put("lat", it) }
        spot.longitude?.let { item.put("lon", it) }
        spot.address?.let { item.put("address", it) }
        spot.poiId?.let { item.put("poiId", it) }
        array.put(item)
    }
    return array.toString()
}

private fun decodeFishingSpots(raw: String?): List<FishingSpot> {
    if (raw.isNullOrBlank()) return emptyList()
    return runCatching {
        val array = JSONArray(raw)
        buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val name = item.optString("name").trim()
                if (name.isBlank()) continue
                val latitude = item.optDouble("lat", Double.NaN).takeUnless(Double::isNaN)
                val longitude = item.optDouble("lon", Double.NaN).takeUnless(Double::isNaN)
                add(
                    FishingSpot(
                        id = item.optString("id").ifBlank { "legacy:$name" },
                        name = name,
                        latitude = latitude,
                        longitude = longitude,
                        address = item.optString("address").ifBlank { null },
                        poiId = item.optString("poiId").ifBlank { null },
                        source = item.optString("source").ifBlank { FishingSpot.SOURCE_LEGACY },
                    ),
                )
            }
        }
    }.getOrDefault(emptyList())
}

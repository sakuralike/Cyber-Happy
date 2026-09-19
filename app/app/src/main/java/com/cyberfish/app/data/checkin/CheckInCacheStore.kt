package com.cyberfish.app.data.checkin

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.cyberfish.app.network.CheckInHistory
import com.cyberfish.app.network.CheckInOverview
import com.cyberfish.app.network.CheckInRecord
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

const val CHECK_IN_CONFIG_CACHE_TTL_MILLIS = 5L * 60L * 1_000L

data class CachedCheckInValue<T>(
    val value: T,
    val savedAtMillis: Long,
)

internal fun isCheckInCacheFresh(
    savedAtMillis: Long,
    nowMillis: Long,
    ttlMillis: Long = CHECK_IN_CONFIG_CACHE_TTL_MILLIS,
): Boolean = savedAtMillis > 0L && nowMillis >= savedAtMillis && nowMillis - savedAtMillis < ttlMillis

private val Context.checkInCacheStore by preferencesDataStore(name = "cyberfish_check_in_cache")

class CheckInCacheStore(private val context: Context) {
    suspend fun readOverview(userId: String): CachedCheckInValue<CheckInOverview>? = runCatching {
        val values = context.checkInCacheStore.data.first()
        val raw = values[overviewKey(userId)] ?: return@runCatching null
        decodeOverview(raw)
    }.getOrNull()

    suspend fun writeOverview(userId: String, overview: CheckInOverview, savedAtMillis: Long = System.currentTimeMillis()) {
        runCatching {
            context.checkInCacheStore.edit { values ->
                values[overviewKey(userId)] = encodeOverview(overview, savedAtMillis)
            }
        }
    }

    suspend fun readHistory(userId: String, month: String?): CachedCheckInValue<CheckInHistory>? = runCatching {
        val values = context.checkInCacheStore.data.first()
        val raw = values[historyKey(userId, month)] ?: return@runCatching null
        decodeHistory(raw)
    }.getOrNull()

    suspend fun writeHistory(
        userId: String,
        month: String?,
        history: CheckInHistory,
        savedAtMillis: Long = System.currentTimeMillis(),
    ) {
        runCatching {
            context.checkInCacheStore.edit { values ->
                values[historyKey(userId, month)] = encodeHistory(history, savedAtMillis)
            }
        }
    }

    private fun overviewKey(userId: String) = stringPreferencesKey("overview_${keyPart(userId)}")

    private fun historyKey(userId: String, month: String?) =
        stringPreferencesKey("history_${keyPart(userId)}_${keyPart(month ?: "all")}")

    private fun keyPart(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }
        .take(32)
}

private fun encodeOverview(overview: CheckInOverview, savedAtMillis: Long): String = JSONObject()
    .put("savedAtMillis", savedAtMillis)
    .put("enabled", overview.enabled)
    .put("checkedInToday", overview.checkedInToday)
    .put("currentStreak", overview.currentStreak)
    .put("longestStreak", overview.longestStreak)
    .put("cycleDay", overview.cycleDay)
    .put("cycleLength", overview.cycleLength)
    .put("checkedDates", JSONArray().apply { overview.checkedDates.sorted().forEach(::put) })
    .put("canCheckIn", overview.canCheckIn)
    .apply {
        overview.windowLabel?.let { put("windowLabel", it) }
        overview.notice?.let { put("notice", it) }
    }
    .toString()

private fun decodeOverview(raw: String): CachedCheckInValue<CheckInOverview>? = runCatching {
    val json = JSONObject(raw)
    val checkedDates = buildSet {
        val values = json.optJSONArray("checkedDates") ?: return@buildSet
        for (index in 0 until values.length()) values.optString(index).takeIf { it.isNotBlank() }?.let(::add)
    }
    CachedCheckInValue(
        value = CheckInOverview(
            enabled = json.optBoolean("enabled", true),
            checkedInToday = json.optBoolean("checkedInToday", false),
            currentStreak = json.optInt("currentStreak", 0).coerceAtLeast(0),
            longestStreak = json.optInt("longestStreak", 0).coerceAtLeast(0),
            cycleDay = json.optInt("cycleDay", 0).coerceAtLeast(0),
            cycleLength = json.optInt("cycleLength", 7).coerceAtLeast(1),
            checkedDates = checkedDates,
            canCheckIn = json.optBoolean("canCheckIn", true),
            windowLabel = json.optNullableString("windowLabel"),
            notice = json.optNullableString("notice"),
        ),
        savedAtMillis = json.optLong("savedAtMillis", 0L),
    )
}.getOrNull()

private fun encodeHistory(history: CheckInHistory, savedAtMillis: Long): String = JSONObject()
    .put("savedAtMillis", savedAtMillis)
    .put("page", history.page)
    .put("pageSize", history.pageSize)
    .apply {
        history.total?.let { put("total", it) }
        put("hasMore", history.hasMore)
        put("records", JSONArray().apply {
            history.records.forEach { record ->
                put(JSONObject().apply {
                    put("date", record.date)
                    record.occurredAt?.let { put("occurredAt", it) }
                    put("streak", record.streak)
                })
            }
        })
    }
    .toString()

private fun decodeHistory(raw: String): CachedCheckInValue<CheckInHistory>? = runCatching {
    val json = JSONObject(raw)
    val records = buildList {
        val values = json.optJSONArray("records") ?: return@buildList
        for (index in 0 until values.length()) {
            val item = values.optJSONObject(index) ?: continue
            val date = item.optString("date").takeIf { it.isNotBlank() } ?: continue
            add(
                CheckInRecord(
                    date = date,
                    occurredAt = item.optNullableString("occurredAt"),
                    streak = item.optInt("streak", 0).coerceAtLeast(0),
                ),
            )
        }
    }
    CachedCheckInValue(
        value = CheckInHistory(
            records = records,
            page = json.optInt("page", 1).coerceAtLeast(1),
            pageSize = json.optInt("pageSize", 20).coerceAtLeast(1),
            total = json.optInt("total", -1).takeIf { it >= 0 },
            hasMore = json.optBoolean("hasMore", false),
        ),
        savedAtMillis = json.optLong("savedAtMillis", 0L),
    )
}.getOrNull()

private fun JSONObject.optNullableString(name: String): String? = optString(name).takeIf { it.isNotBlank() && it != "null" }

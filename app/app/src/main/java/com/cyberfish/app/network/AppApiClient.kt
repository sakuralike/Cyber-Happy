package com.cyberfish.app.network

import com.cyberfish.app.BuildConfig
import com.cyberfish.app.data.local.FishRecordEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data object NotConfigured : ApiResult<Nothing>
    data class HttpError(val statusCode: Int, val message: String) : ApiResult<Nothing>
    data class NetworkError(val message: String) : ApiResult<Nothing>
    data class ParseError(val message: String) : ApiResult<Nothing>
}

data class AppUpdateInfo(
    val hasUpdate: Boolean,
    val updateType: String? = null,
    val versionName: String? = null,
    val versionCode: Int? = null,
    val releaseNotes: String? = null,
)

sealed interface VersionCheckState {
    data object Idle : VersionCheckState
    data object Checking : VersionCheckState
    data object NotConfigured : VersionCheckState
    data object UpToDate : VersionCheckState
    data class UpdateAvailable(val update: AppUpdateInfo) : VersionCheckState
    data class Failed(val message: String) : VersionCheckState
}

class AppApiClient(
    private val config: ApiConfig,
    private val identityStore: DeviceIdentityProvider,
    private val httpClient: OkHttpClient = defaultHttpClient(),
) {
    suspend fun checkForUpdate(): ApiResult<AppUpdateInfo> = withContext(Dispatchers.IO) {
        if (!config.isConfigured) return@withContext ApiResult.NotConfigured
        val identity = identityStore.get()
        val url = config.endpoint("api/v1/app-versions/check")
            .toHttpUrlOrNull()
            ?: return@withContext ApiResult.ParseError("服务地址无效")
        val requestUrl = url
            .newBuilder()
            .addQueryParameter("versionCode", BuildConfig.VERSION_CODE.toString())
            .addQueryParameter("deviceId", identity.deviceId)
            .addQueryParameter("platform", "ANDROID")
            .addQueryParameter("channel", "official")
            .build()
        executeJson(Request.Builder().url(requestUrl).get().appToken(config.appToken).build()) { data ->
            val hasUpdate = data.optBoolean("hasUpdate", false)
            val latest = data.optJSONObject("latest")
            AppUpdateInfo(
                hasUpdate = hasUpdate,
                updateType = data.optString("updateType").takeIf { it.isNotBlank() },
                versionName = latest?.optString("versionName")?.takeIf { it.isNotBlank() },
                versionCode = latest?.takeIf { it.has("versionCode") }?.optInt("versionCode"),
                releaseNotes = latest?.optString("releaseNotes")?.takeIf { it.isNotBlank() },
            )
        }
    }

    suspend fun submitMisreport(record: FishRecordEntity): ApiResult<String> = withContext(Dispatchers.IO) {
        if (!config.isConfigured) return@withContext ApiResult.NotConfigured
        val identity = identityStore.get()
        val rawData = JSONObject()
            .put("triggerTimestampMillis", record.triggerTimestampMillis)
            .put("verticalDisplacementPx", record.verticalDisplacementPx)
            .put("jitterHz", record.jitterHz)
            .put("confidence", record.confidence)
            .put("trajectoryPx", JSONArray(record.trajectoryCsv.split(',').mapNotNull { it.toDoubleOrNull() }))
        val body = JSONObject()
            .put("deviceId", identity.deviceId)
            .put("userId", identity.userId)
            .put("deviceModel", identity.deviceModel)
            .put("osVersion", identity.osVersion)
            .put("appVersionName", BuildConfig.VERSION_NAME)
            .put("appVersionCode", BuildConfig.VERSION_CODE)
            .put("modelVersion", "MockDetector")
            .put("reportType", "FALSE_POSITIVE")
            .put("severity", "MEDIUM")
            .put("userNote", "用户确认标记为误报")
            .put("reportedAt", Instant.ofEpochMilli(record.occurredAtMillis).toString())
            .put("rawData", rawData)
            .put("sceneTags", JSONArray(listOf("mock-detector", "user-confirmed")))
        val requestUrl = config.endpoint("api/v1/misreports").toHttpUrlOrNull()
            ?: return@withContext ApiResult.ParseError("服务地址无效")
        val request = Request.Builder()
            .url(requestUrl)
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .appToken(config.appToken)
            .build()
        executeJson(request) { data -> data.optString("id").takeIf { it.isNotBlank() } ?: throw IllegalArgumentException("上报响应缺少 id") }
    }

    private fun <T> executeJson(request: Request, transform: (JSONObject) -> T): ApiResult<T> = try {
        httpClient.newCall(request).execute().use { response ->
            val payload = response.body?.string().orEmpty()
            if (!response.isSuccessful) return ApiResult.HttpError(response.code, parseErrorMessage(payload, response.message))
            val envelope = JSONObject(payload)
            if (envelope.optInt("code", -1) != 0) return ApiResult.HttpError(response.code, envelope.optString("message", "服务端拒绝请求"))
            val data = envelope.optJSONObject("data") ?: JSONObject()
            ApiResult.Success(transform(data))
        }
    } catch (error: IOException) {
        ApiResult.NetworkError(error.message ?: "网络不可用")
    } catch (error: Exception) {
        ApiResult.ParseError(error.message ?: "响应解析失败")
    }

    private fun parseErrorMessage(payload: String, fallback: String): String = try {
        JSONObject(payload).optString("message", fallback)
    } catch (_: Exception) {
        fallback
    }

    private fun Request.Builder.appToken(token: String) = header("X-App-Token", token)

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        fun defaultHttpClient() = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}

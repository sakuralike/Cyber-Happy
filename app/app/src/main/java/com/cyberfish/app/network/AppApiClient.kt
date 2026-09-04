package com.cyberfish.app.network

import com.cyberfish.app.BuildConfig
import com.cyberfish.app.data.local.FishRecordEntity
import com.cyberfish.app.inference.LiteRtModelDescriptor
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
import java.io.OutputStream
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

data class ModelCheckInfo(
    val hasUpdate: Boolean,
    val update: ModelUpdateInfo? = null,
)

data class ModelUpdateInfo(
    val descriptor: LiteRtModelDescriptor,
    val downloadUrl: String,
    val sizeBytes: Long? = null,
    val dispatchId: String? = null,
)

enum class ModelDispatchStatus { PENDING, DOWNLOADING, SUCCESS, FAILED, ROLLED_BACK }

interface ModelApi {
    suspend fun checkModel(currentModelVersion: String? = null): ApiResult<ModelCheckInfo>
    suspend fun reportModelDispatch(
        dispatchId: String,
        status: ModelDispatchStatus,
        progress: Int? = null,
        errorCode: String? = null,
        errorMessage: String? = null,
    ): ApiResult<Unit>
    suspend fun downloadModel(
        url: String,
        output: OutputStream,
        onProgress: (downloadedBytes: Long, totalBytes: Long?) -> Unit = { _, _ -> },
    ): ApiResult<Long>
}

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
) : ModelApi {
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

    override suspend fun checkModel(currentModelVersion: String?): ApiResult<ModelCheckInfo> = withContext(Dispatchers.IO) {
        if (!config.isConfigured) return@withContext ApiResult.NotConfigured
        val identity = identityStore.get()
        val requestUrl = config.endpoint("api/v1/models/check").toHttpUrlOrNull()
            ?: return@withContext ApiResult.ParseError("服务地址无效")
        val url = requestUrl.newBuilder()
            .addQueryParameter("appVersionCode", BuildConfig.VERSION_CODE.toString())
            .addQueryParameter("deviceId", identity.deviceId)
            .apply { currentModelVersion?.takeIf { it.isNotBlank() }?.let { addQueryParameter("currentModelVersion", it) } }
            .build()
        executeJson(Request.Builder().url(url).get().appToken(config.appToken).build()) { data ->
            if (!data.optBoolean("hasUpdate", false)) {
                return@executeJson ModelCheckInfo(hasUpdate = false)
            }
            val model = data.optJSONObject("model") ?: throw IllegalArgumentException("模型检查响应缺少 model")
            val downloadUrl = model.optString("url").takeIf { it.isNotBlank() }
                ?: throw IllegalArgumentException("模型检查响应缺少下载地址")
            val labels = model.optJSONArray("labels")?.let { array ->
                List(array.length()) { index -> array.optString(index) }.filter { it.isNotBlank() }
            }.orEmpty()
            ModelCheckInfo(
                hasUpdate = true,
                update = ModelUpdateInfo(
                descriptor = LiteRtModelDescriptor(
                    modelVersion = model.optString("modelVersion"),
                    architecture = model.optString("arch"),
                    quantization = model.optString("quant"),
                    framework = model.optString("framework"),
                    inputSize = model.optInt("inputSize", 0),
                    labels = labels,
                    sha256 = model.optString("sha256"),
                    signature = model.optString("signature").takeIf { it.isNotBlank() },
                    signatureAlgorithm = model.optString("signatureAlgorithm").takeIf { it.isNotBlank() },
                    publicKeyId = model.optString("publicKeyId").takeIf { it.isNotBlank() },
                    signatureExpiresAtMillis = model.optLong("signatureExpiresAtMillis", Long.MIN_VALUE).takeIf { it != Long.MIN_VALUE }
                        ?: model.optString("signatureExpiresAt").toEpochMillisOrNull(),
                    runtimeSignatureName = model.optString("runtimeSignatureName").takeIf { it.isNotBlank() },
                    inputName = model.optString("inputName").takeIf { it.isNotBlank() },
                    inputLayout = model.optString("inputLayout", "NCHW"),
                    outputName = model.optString("outputName").takeIf { it.isNotBlank() },
                    coordinatesNormalized = model.optBoolean("coordinatesNormalized", true),
                    valuesPerDetection = model.optInt("valuesPerDetection", 6),
                ),
                downloadUrl = config.resolve(downloadUrl),
                sizeBytes = model.optLong("size", Long.MIN_VALUE).takeIf { it != Long.MIN_VALUE },
                dispatchId = data.optString("dispatchId").takeIf { it.isNotBlank() },
                ),
            )
        }
    }

    override suspend fun reportModelDispatch(
        dispatchId: String,
        status: ModelDispatchStatus,
        progress: Int?,
        errorCode: String?,
        errorMessage: String?,
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        if (!config.isConfigured) return@withContext ApiResult.NotConfigured
        val identity = identityStore.get()
        val body = JSONObject()
            .put("deviceId", identity.deviceId)
            .put("status", status.name)
        progress?.let { body.put("progress", it.coerceIn(0, 100)) }
        errorCode?.let { body.put("errorCode", it) }
        errorMessage?.let { body.put("errorMessage", it) }
        val requestUrl = config.endpoint("api/v1/models/dispatches/$dispatchId/report").toHttpUrlOrNull()
            ?: return@withContext ApiResult.ParseError("服务地址无效")
        executeJson(
            Request.Builder()
                .url(requestUrl)
                .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
                .appToken(config.appToken)
                .build(),
        ) { Unit }
    }

    override suspend fun downloadModel(
        url: String,
        output: OutputStream,
        onProgress: (downloadedBytes: Long, totalBytes: Long?) -> Unit,
    ): ApiResult<Long> = withContext(Dispatchers.IO) {
        val requestUrl = url.toHttpUrlOrNull() ?: return@withContext ApiResult.ParseError("模型下载地址无效")
        try {
            httpClient.newCall(Request.Builder().url(requestUrl).get().appToken(config.appToken).build()).execute().use { response ->
                if (!response.isSuccessful) return@withContext ApiResult.HttpError(response.code, response.message)
                val body = response.body ?: return@withContext ApiResult.ParseError("模型下载响应为空")
                val total = body.contentLength().takeIf { it >= 0L }
                var downloaded = 0L
                body.byteStream().use { input ->
                    val buffer = ByteArray(DOWNLOAD_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        if (read == 0) continue
                        output.write(buffer, 0, read)
                        downloaded += read
                        onProgress(downloaded, total)
                    }
                }
                output.flush()
                ApiResult.Success(downloaded)
            }
        } catch (error: IOException) {
            ApiResult.NetworkError(error.message ?: "模型下载失败")
        } catch (error: Exception) {
            ApiResult.ParseError(error.message ?: "模型下载失败")
        }
    }

    suspend fun checkModel(): ApiResult<ModelCheckInfo> = checkModel(null)

    suspend fun reportModelDispatch(dispatchId: String, status: ModelDispatchStatus): ApiResult<Unit> =
        reportModelDispatch(dispatchId, status, null, null, null)

    suspend fun downloadModel(url: String, output: OutputStream): ApiResult<Long> =
        downloadModel(url, output) { _, _ -> }

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
        const val DOWNLOAD_BUFFER_SIZE = 16 * 1024
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        fun defaultHttpClient() = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}

private fun String.toEpochMillisOrNull(): Long? = takeIf { it.isNotBlank() }?.let {
    try { Instant.parse(it).toEpochMilli() } catch (_: Exception) { null }
}

package com.cyberfish.app.network

import com.cyberfish.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit

interface DeviceRequestAuthenticator {
    suspend fun authorize(request: Request): ApiResult<Request>
    fun clear()
}

class DeviceAuthClient(
    private val config: ApiConfig,
    private val identityProvider: DeviceIdentityProvider,
    private val signingKeyProvider: DeviceSigningKeyProvider,
    private val tokenPersistence: DeviceAccessTokenPersistence,
    private val userSessionProvider: UserSessionProvider = EmptyUserSessionProvider,
    private val httpClient: OkHttpClient = defaultHttpClient(),
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : DeviceRequestAuthenticator {
    private val tokenMutex = Mutex()

    override suspend fun authorize(request: Request): ApiResult<Request> {
        val access = when (val result = ensureToken()) {
            is ApiResult.Success -> result.value
            ApiResult.NotConfigured -> return ApiResult.NotConfigured
            is ApiResult.HttpError -> return result
            is ApiResult.NetworkError -> return result
            is ApiResult.ParseError -> return result
        }
        val builder = request.newBuilder()
            .header(DEVICE_AUTHORIZATION, "Device ${access.token}")
            .header(DEVICE_ID, access.deviceId)
            .header(DEVICE_KEY_ID, access.signingKeyId)
        val body = request.body
        val mediaType = body?.contentType()?.toString().orEmpty().lowercase()
        if (body == null || mediaType.contains("json")) {
            val rawBody = if (body == null) "" else Buffer().also(body::writeTo).readUtf8()
            val canonicalBody = if (rawBody.isBlank()) "" else canonicalJson(rawBody)
            val bodyHash = sha256Hex(canonicalBody.toByteArray(Charsets.UTF_8))
            val timestamp = nowMillis() / 1_000L
            val nonce = newDeviceNonce()
            val signature = signingKeyProvider.sign(
                deviceRequestSigningText(request.method, request.url, bodyHash, timestamp, nonce)
                    .toByteArray(Charsets.UTF_8),
            )
            builder
                .header(DEVICE_TIMESTAMP, timestamp.toString())
                .header(DEVICE_NONCE, nonce)
                .header(DEVICE_BODY_SHA256, bodyHash)
                .header(DEVICE_SIGNATURE, signature)
        }
        return ApiResult.Success(builder.build())
    }

    override fun clear() = tokenPersistence.clear()

    suspend fun ensureToken(): ApiResult<DeviceAccessToken> = tokenMutex.withLock {
        val identity = identityProvider.get()
        val signing = runCatching { signingKeyProvider.ensureKey() }
            .getOrElse { return@withLock ApiResult.ParseError(it.message ?: "设备签名密钥初始化失败") }
        tokenPersistence.read()?.takeIf {
            it.deviceId == identity.deviceId &&
                it.signingKeyId == signing.keyId &&
                it.expiresAtMillis > nowMillis() + TOKEN_REFRESH_MARGIN_MILLIS
        }?.let { return@withLock ApiResult.Success(it) }

        val enrolled = postJson(
            path = "api/v1/devices/enroll",
            body = JSONObject()
                .put("deviceId", identity.deviceId)
                .put("signingPublicKey", signing.publicKey)
                .put("securityLevel", signing.securityLevel)
                .put("appVersionCode", BuildConfig.VERSION_CODE),
            bootstrap = true,
        ) { data ->
            val status = data.optString("status")
            if (status != "ACTIVE") throw IllegalStateException("设备凭据尚未激活")
            data.optString("signingKeyId").takeIf { it == signing.keyId }
                ?: throw IllegalArgumentException("设备签名 keyId 不匹配")
        }
        if (enrolled !is ApiResult.Success) return@withLock enrolled.asDeviceTokenFailure()

        val challenge = postJson(
            path = "api/v1/devices/challenges",
            body = JSONObject().put("deviceId", identity.deviceId).put("signingKeyId", signing.keyId),
            bootstrap = true,
        ) { data ->
            DeviceChallenge(
                id = data.getString("challengeId"),
                value = data.getString("challenge"),
                expiresAt = data.getString("expiresAt"),
            )
        }
        if (challenge !is ApiResult.Success) return@withLock challenge.asDeviceTokenFailure()
        val proof = signingKeyProvider.sign(
            deviceChallengeSigningText(
                deviceId = identity.deviceId,
                signingKeyId = signing.keyId,
                challengeId = challenge.value.id,
                challenge = challenge.value.value,
                expiresAt = challenge.value.expiresAt,
            ).toByteArray(Charsets.UTF_8),
        )
        val token = postJson(
            path = "api/v1/devices/token",
            body = JSONObject()
                .put("deviceId", identity.deviceId)
                .put("signingKeyId", signing.keyId)
                .put("challengeId", challenge.value.id)
                .put("challenge", challenge.value.value)
                .put("signature", proof),
            bootstrap = true,
        ) { data ->
            DeviceAccessToken(
                token = data.getString("token"),
                deviceId = identity.deviceId,
                signingKeyId = signing.keyId,
                expiresAtMillis = Instant.parse(data.getString("expiresAt")).toEpochMilli(),
                scopes = data.optJSONArray("scopes").toStringSet(),
            )
        }
        if (token is ApiResult.Success) tokenPersistence.save(token.value)
        token.asDeviceTokenFailure()
    }

    private suspend fun <T> postJson(
        path: String,
        body: JSONObject,
        bootstrap: Boolean,
        transform: (JSONObject) -> T,
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        if (config.baseUrl.isBlank()) return@withContext ApiResult.NotConfigured
        val url = runCatching { config.endpoint(path) }.getOrNull()
            ?: return@withContext ApiResult.ParseError("设备认证服务地址无效")
        val request = Request.Builder()
            .url(url)
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .apply {
                if (bootstrap && config.appToken.isNotBlank()) header("X-App-Token", config.appToken)
                userSessionProvider.get()?.token?.takeIf { it.isNotBlank() }?.let { header("Authorization", "Bearer $it") }
            }
            .build()
        try {
            httpClient.newCall(request).execute().use { response ->
                val payload = response.body?.string().orEmpty()
                val envelope = runCatching { JSONObject(payload) }.getOrNull()
                if (!response.isSuccessful || envelope?.optInt("code", -1) != 0) {
                    return@withContext ApiResult.HttpError(
                        response.code,
                        envelope?.optString("message", response.message).orEmpty().ifBlank { response.message },
                        envelope?.optInt("code", 0)?.takeIf { it != 0 },
                    )
                }
                val data = envelope.optJSONObject("data") ?: JSONObject()
                ApiResult.Success(transform(data))
            }
        } catch (error: IOException) {
            ApiResult.NetworkError(error.message ?: "设备认证网络不可用")
        } catch (error: Exception) {
            ApiResult.ParseError(error.message ?: "设备认证响应无效")
        }
    }

    private data class DeviceChallenge(val id: String, val value: String, val expiresAt: String)

    private companion object {
        const val DEVICE_AUTHORIZATION = "X-Device-Authorization"
        const val DEVICE_ID = "X-Device-Id"
        const val DEVICE_KEY_ID = "X-Device-Key-Id"
        const val DEVICE_TIMESTAMP = "X-Timestamp"
        const val DEVICE_NONCE = "X-Nonce"
        const val DEVICE_BODY_SHA256 = "X-Body-SHA256"
        const val DEVICE_SIGNATURE = "X-Device-Signature"
        const val TOKEN_REFRESH_MARGIN_MILLIS = 60_000L
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        fun defaultHttpClient() = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}

private fun JSONArray?.toStringSet(): Set<String> = if (this == null) emptySet() else buildSet {
    for (index in 0 until length()) optString(index).takeIf { it.isNotBlank() }?.let(::add)
}

@Suppress("UNCHECKED_CAST")
private fun <T> ApiResult<*>.asDeviceTokenFailure(): ApiResult<T> = this as ApiResult<T>

package com.cyberfish.app.network

import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

data class DeviceAccessToken(
    val token: String,
    val deviceId: String,
    val signingKeyId: String,
    val expiresAtMillis: Long,
    val scopes: Set<String>,
)

data class DeviceRequestProof(
    val timestampSeconds: Long,
    val nonce: String,
    val bodySha256: String,
    val signature: String,
)

internal fun deviceChallengeSigningText(
    deviceId: String,
    signingKeyId: String,
    challengeId: String,
    challenge: String,
    expiresAt: String,
): String = listOf(
    "CYBERFISH-DEVICE-AUTH-V1",
    "TOKEN",
    deviceId,
    signingKeyId,
    challengeId,
    challenge,
    expiresAt,
).joinToString("\n")

internal fun deviceRequestSigningText(
    method: String,
    url: HttpUrl,
    bodySha256: String,
    timestampSeconds: Long,
    nonce: String,
): String = listOf(
    "CYBERFISH-REQUEST-V1",
    method.uppercase(),
    url.encodedPath,
    canonicalDeviceQuery(url),
    bodySha256.lowercase(),
    timestampSeconds.toString(),
    nonce,
).joinToString("\n")

internal fun canonicalDeviceQuery(url: HttpUrl): String = buildList {
    for (index in 0 until url.querySize) {
        add(url.queryParameterName(index) to (url.queryParameterValue(index) ?: ""))
    }
}.sortedWith(compareBy<Pair<String, String>>({ it.first }, { it.second }))
    .joinToString("&") { (name, value) -> "${rfc3986(name)}=${rfc3986(value)}" }

internal fun canonicalJson(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return ""
    val value: Any = when (trimmed.first()) {
        '{' -> JSONObject(trimmed)
        '[' -> JSONArray(trimmed)
        else -> throw IllegalArgumentException("JSON 请求体必须是对象或数组")
    }
    return canonicalJsonValue(value)
}

internal fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { "%02x".format(it) }

internal fun newDeviceNonce(): String = ByteArray(16).also(SecureRandom()::nextBytes)
    .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

private fun canonicalJsonValue(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(",", "{", "}") { key ->
        "${JSONObject.quote(key)}:${canonicalJsonValue(value.get(key))}"
    }
    is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { index ->
        canonicalJsonValue(value.get(index))
    }
    is String -> JSONObject.quote(value)
    is Boolean -> value.toString()
    is Byte, is Short, is Int, is Long -> value.toString()
    is Float -> canonicalDecimal(value.toDouble())
    is Double -> canonicalDecimal(value)
    is Number -> BigDecimal(value.toString()).stripTrailingZeros().toPlainString()
    else -> throw IllegalArgumentException("不支持的 JSON 值类型：${value::class.java.name}")
}

private fun canonicalDecimal(value: Double): String {
    require(value.isFinite()) { "JSON 数值必须有限" }
    return BigDecimal(value.toString()).stripTrailingZeros().toPlainString()
}

private fun rfc3986(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
    .replace("+", "%20")
    .replace("*", "%2A")
    .replace("%7E", "~")

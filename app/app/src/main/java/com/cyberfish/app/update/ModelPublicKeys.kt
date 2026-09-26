package com.cyberfish.app.update

import com.cyberfish.app.BuildConfig
import org.json.JSONObject

object ModelPublicKeys {
    fun fromBuildConfig(): Map<String, String> = parse(BuildConfig.MODEL_PUBLIC_KEYS) + BUILT_IN

    private val BUILT_IN = mapOf(
        "cyberfish-ncnn-v1" to "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEexCYbXHx7m2ZBZA6d0eJwOsctH1tsymp28GIMSWx+2xhYwq+FD/Gb5S5QGjtDjkBB8L2ztcPFE0O+oLOuZ+Fdg==",
    )

    internal fun parse(raw: String): Map<String, String> {
        if (raw.isBlank()) return emptyMap()
        return runCatching {
            val json = JSONObject(raw)
            json.keys().asSequence().mapNotNull { keyId ->
                val value = json.opt(keyId)
                if (keyId.isBlank() || value !is String || value.isBlank()) null else keyId to value.trim()
            }.toMap()
        }.getOrDefault(emptyMap())
    }
}

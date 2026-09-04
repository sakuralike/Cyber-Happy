package com.cyberfish.app.network

import com.cyberfish.app.BuildConfig

data class ApiConfig(
    val baseUrl: String,
    val appToken: String,
) {
    val isConfigured: Boolean
        get() = baseUrl.isNotBlank() && appToken.isNotBlank()

    fun endpoint(path: String): String = resolve(path)

    fun resolve(pathOrUrl: String): String = if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
        pathOrUrl
    } else {
        "${baseUrl.trimEnd('/')}/${pathOrUrl.trimStart('/')}"
    }

    companion object {
        fun fromBuildConfig() = ApiConfig(
            baseUrl = BuildConfig.APP_API_BASE_URL,
            appToken = BuildConfig.APP_API_TOKEN,
        )
    }
}

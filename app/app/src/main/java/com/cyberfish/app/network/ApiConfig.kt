package com.cyberfish.app.network

import com.cyberfish.app.BuildConfig

data class ApiConfig(
    val baseUrl: String,
    val appToken: String,
) {
    val isConfigured: Boolean
        get() = baseUrl.isNotBlank() && appToken.isNotBlank()

    fun endpoint(path: String): String = "${baseUrl.trimEnd('/')}/${path.trimStart('/')}"

    companion object {
        fun fromBuildConfig() = ApiConfig(
            baseUrl = BuildConfig.APP_API_BASE_URL,
            appToken = BuildConfig.APP_API_TOKEN,
        )
    }
}

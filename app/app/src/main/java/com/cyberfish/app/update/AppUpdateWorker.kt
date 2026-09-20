package com.cyberfish.app.update

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.ApiConfig
import com.cyberfish.app.network.AppApiClient
import com.cyberfish.app.network.AppUpdateInfo
import com.cyberfish.app.network.AppDownloadMode
import com.cyberfish.app.network.DeviceIdentityStore
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.UUID

class AppUpdateWorker(
    appContext: android.content.Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val url = inputData.getString(KEY_URL)?.takeIf { it.isNotBlank() } ?: return Result.failure()
        val expectedSha256 = inputData.getString(KEY_SHA256)?.takeIf { it.isNotBlank() } ?: return Result.failure()
        val versionCode = inputData.getInt(KEY_VERSION_CODE, 0)
        val directory = File(applicationContext.filesDir, "updates").apply { mkdirs() }
        val part = File(directory, "app-$versionCode.apk.part")
        val apk = File(directory, "app-$versionCode.apk")
        part.delete()
        val client = AppApiClient(ApiConfig.fromBuildConfig(), DeviceIdentityStore(applicationContext))
        val result = part.outputStream().use { output ->
            client.downloadApk(url, output) { downloaded, total ->
                val progress = if (total != null && total > 0) (downloaded * 100L / total).toInt().coerceIn(0, 100) else 0
                setProgressAsync(Data.Builder().putInt(KEY_PROGRESS, progress).build())
            }
        }
        if (result !is ApiResult.Success) {
            part.delete()
            return when (result) {
                is ApiResult.NetworkError -> Result.retry()
                is ApiResult.HttpError -> if (result.statusCode >= 500) Result.retry() else failure("APK 下载失败（${result.statusCode}）")
                ApiResult.NotConfigured -> failure("APP 更新服务未配置")
                is ApiResult.ParseError -> failure(result.message.ifBlank { "APK 下载响应无效" })
                is ApiResult.Success -> failure("APK 下载失败")
            }
        }
        if (!sha256(part).equals(expectedSha256, ignoreCase = true)) {
            part.delete()
            return Result.failure(Data.Builder().putString(KEY_ERROR, "APK SHA-256 校验失败").build())
        }
        if (apk.exists()) apk.delete()
        if (!part.renameTo(apk)) {
            part.delete()
            return Result.failure(Data.Builder().putString(KEY_ERROR, "APK 文件保存失败").build())
        }
        return Result.success(Data.Builder().putString(KEY_APK_PATH, apk.absolutePath).build())
    }

    private fun failure(message: String): Result = Result.failure(
        Data.Builder().putString(KEY_ERROR, message).build(),
    )

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count > 0) digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val WORK_NAME = "cyberfish-app-update"
        const val KEY_URL = "url"
        const val KEY_SHA256 = "sha256"
        const val KEY_VERSION_CODE = "version_code"
        const val KEY_PROGRESS = "progress"
        const val KEY_APK_PATH = "apk_path"
        const val KEY_ERROR = "error"

        fun enqueue(context: android.content.Context, update: AppUpdateInfo): UUID? {
            if (update.downloadMode != AppDownloadMode.SERVER) return null
            val url = update.apkUrl ?: return null
            val sha256 = update.apkSha256 ?: return null
            if (sha256.length != 64 || sha256.any { !it.isDigit() && it.lowercaseChar() !in 'a'..'f' }) return null
            if (update.apkSizeBytes == null || update.apkSizeBytes <= 0L) return null
            val versionCode = update.versionCode ?: return null
            val request = OneTimeWorkRequestBuilder<AppUpdateWorker>()
                .setInputData(
                    Data.Builder()
                        .putString(KEY_URL, url)
                        .putString(KEY_SHA256, sha256)
                        .putInt(KEY_VERSION_CODE, versionCode)
                        .build(),
                )
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                WORK_NAME,
                androidx.work.ExistingWorkPolicy.REPLACE,
                request,
            )
            return request.id
        }

        fun downloadedApkPath(context: android.content.Context, versionCode: Int?): String? {
            versionCode ?: return null
            return File(context.applicationContext.filesDir, "updates/app-$versionCode.apk")
                .takeIf(File::isFile)
                ?.absolutePath
        }
    }
}

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
import com.cyberfish.app.BuildConfig
import java.io.FilterOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.OutputStream
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.UUID

internal data class AppUpdateDownloadSpec(
    val url: String,
    val sha256: String,
    val expectedSize: Long,
    val versionCode: Int,
)

internal fun appUpdateDownloadSpec(
    update: AppUpdateInfo,
    currentVersionCode: Int,
    allowInsecureHttp: Boolean = false,
): AppUpdateDownloadSpec? {
    if (update.downloadMode != AppDownloadMode.SERVER) return null
    val url = update.apkUrl?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val uri = runCatching { URI(url) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase()
    if (uri.host.isNullOrBlank() || (scheme != "https" && !(allowInsecureHttp && scheme == "http"))) return null
    val sha256 = update.apkSha256?.lowercase()?.takeIf { it.matches(Regex("[a-f0-9]{64}")) } ?: return null
    val expectedSize = update.apkSizeBytes?.takeIf { it in 1..MAX_APP_UPDATE_BYTES } ?: return null
    val versionCode = update.versionCode?.takeIf { it > currentVersionCode } ?: return null
    return AppUpdateDownloadSpec(url, sha256, expectedSize, versionCode)
}

internal class SizeBoundOutputStream(
    output: OutputStream,
    private val expectedSize: Long,
) : FilterOutputStream(output) {
    var bytesWritten: Long = 0
        private set

    override fun write(value: Int) {
        ensureCapacity(1)
        out.write(value)
        bytesWritten += 1
    }

    override fun write(buffer: ByteArray, offset: Int, length: Int) {
        if (length == 0) return
        ensureCapacity(length)
        out.write(buffer, offset, length)
        bytesWritten += length
    }

    private fun ensureCapacity(nextBytes: Int) {
        if (nextBytes < 0 || bytesWritten > expectedSize - nextBytes) {
            throw IOException("APK 下载大小超过服务端登记值")
        }
    }
}

private const val MAX_APP_UPDATE_BYTES = 200L * 1024 * 1024

class AppUpdateWorker(
    appContext: android.content.Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val url = inputData.getString(KEY_URL)?.takeIf { it.isNotBlank() } ?: return Result.failure()
        val expectedSha256 = inputData.getString(KEY_SHA256)?.takeIf { it.isNotBlank() } ?: return Result.failure()
        val expectedSize = inputData.getLong(KEY_EXPECTED_SIZE, 0L).takeIf { it in 1..MAX_APP_UPDATE_BYTES }
            ?: return failure("APK 文件大小无效")
        val versionCode = inputData.getInt(KEY_VERSION_CODE, 0)
        val uri = runCatching { URI(url) }.getOrNull()
        val scheme = uri?.scheme?.lowercase()
        if (uri?.host.isNullOrBlank() || (scheme != "https" && !(BuildConfig.DEBUG && scheme == "http"))) {
            return failure("APK 下载地址必须使用 HTTPS")
        }
        val directory = File(applicationContext.filesDir, "updates").apply { mkdirs() }
        if (directory.usableSpace < expectedSize) return failure("存储空间不足，无法下载更新")
        val part = File(directory, "app-$versionCode.apk.part")
        val apk = File(directory, "app-$versionCode.apk")
        part.delete()
        val client = AppApiClient(ApiConfig.fromBuildConfig(), DeviceIdentityStore(applicationContext))
        var boundedOutput: SizeBoundOutputStream? = null
        val result = part.outputStream().use { output ->
            SizeBoundOutputStream(output, expectedSize).also { boundedOutput = it }.use { bounded ->
                client.downloadApk(url, bounded) { downloaded, total ->
                    val progressTotal = total?.takeIf { it > 0 } ?: expectedSize
                    val progress = (downloaded * 100L / progressTotal).toInt().coerceIn(0, 100)
                    setProgressAsync(Data.Builder().putInt(KEY_PROGRESS, progress).build())
                }
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
        if (result.value != expectedSize || boundedOutput?.bytesWritten != expectedSize || part.length() != expectedSize) {
            part.delete()
            return failure("APK 下载大小与服务端登记值不一致")
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
        const val KEY_EXPECTED_SIZE = "expected_size"
        const val KEY_VERSION_CODE = "version_code"
        const val KEY_PROGRESS = "progress"
        const val KEY_APK_PATH = "apk_path"
        const val KEY_ERROR = "error"

        fun enqueue(context: android.content.Context, update: AppUpdateInfo): UUID? {
            val spec = appUpdateDownloadSpec(
                update = update,
                currentVersionCode = BuildConfig.VERSION_CODE,
                allowInsecureHttp = BuildConfig.DEBUG,
            ) ?: return null
            val request = OneTimeWorkRequestBuilder<AppUpdateWorker>()
                .setInputData(
                    Data.Builder()
                        .putString(KEY_URL, spec.url)
                        .putString(KEY_SHA256, spec.sha256)
                        .putLong(KEY_EXPECTED_SIZE, spec.expectedSize)
                        .putInt(KEY_VERSION_CODE, spec.versionCode)
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

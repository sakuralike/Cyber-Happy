package com.cyberfish.app.network

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.cyberfish.app.data.local.CyberFishDatabase
import com.cyberfish.app.data.model.MisreportSyncState
import java.util.concurrent.TimeUnit

class MisreportUploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val triggerTimestampMillis = inputData.getLong(KEY_TRIGGER_TIMESTAMP_MILLIS, MISSING_TIMESTAMP)
        if (triggerTimestampMillis == MISSING_TIMESTAMP) return Result.failure()
        val dao = CyberFishDatabase.get(applicationContext).fishRecordDao()
        val record = dao.findByTriggerTimestamp(triggerTimestampMillis) ?: return Result.success()
        if (!record.isFalsePositive || record.misreportState == MisreportSyncState.Uploaded.name) return Result.success()

        val client = AppApiClient(ApiConfig.fromBuildConfig(), DeviceIdentityStore(applicationContext))
        return when (val result = client.submitMisreport(record)) {
            is ApiResult.Success -> {
                dao.markMisreportUploaded(triggerTimestampMillis, MisreportSyncState.Uploaded.name, result.value)
                Result.success()
            }
            ApiResult.NotConfigured -> {
                dao.markMisreportFailed(triggerTimestampMillis, MisreportSyncState.Failed.name, "未配置服务地址或 APP 令牌")
                Result.success()
            }
            is ApiResult.HttpError -> {
                val error = "${result.statusCode} ${result.message}".take(ERROR_LIMIT)
                if (result.statusCode >= 500) {
                    dao.markMisreportRetry(triggerTimestampMillis, MisreportSyncState.Retrying.name, error)
                    Result.retry()
                } else {
                    dao.markMisreportFailed(triggerTimestampMillis, MisreportSyncState.Failed.name, error)
                    Result.success()
                }
            }
            is ApiResult.NetworkError -> {
                dao.markMisreportRetry(triggerTimestampMillis, MisreportSyncState.Retrying.name, result.message.take(ERROR_LIMIT))
                Result.retry()
            }
            is ApiResult.ParseError -> {
                dao.markMisreportRetry(triggerTimestampMillis, MisreportSyncState.Retrying.name, result.message.take(ERROR_LIMIT))
                Result.retry()
            }
        }
    }

    companion object {
        const val KEY_TRIGGER_TIMESTAMP_MILLIS = "trigger_timestamp_millis"
        private const val MISSING_TIMESTAMP = Long.MIN_VALUE
        private const val ERROR_LIMIT = 240

        fun enqueue(context: Context, triggerTimestampMillis: Long) {
            val request = OneTimeWorkRequestBuilder<MisreportUploadWorker>()
                .setInputData(Data.Builder().putLong(KEY_TRIGGER_TIMESTAMP_MILLIS, triggerTimestampMillis).build())
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                "misreport-$triggerTimestampMillis",
                ExistingWorkPolicy.KEEP,
                request,
            )
        }
    }
}

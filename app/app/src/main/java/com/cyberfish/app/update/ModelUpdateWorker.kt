package com.cyberfish.app.update

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.cyberfish.app.data.CyberFishRepository
import com.cyberfish.app.network.ApiResult
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class ModelUpdateWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val repository = CyberFishRepository(applicationContext).modelRepository
        return coroutineScope {
            val progressJob = launch {
                repository.state.collect { state ->
                    setProgress(
                        Data.Builder()
                            .putString(KEY_STATUS, state.status.name)
                            .putString(KEY_MODEL_VERSION, state.modelVersion)
                            .putInt(KEY_PROGRESS, state.progress)
                            .putString(KEY_ERROR_CODE, state.errorCode)
                            .putString(KEY_ERROR_MESSAGE, state.errorMessage)
                            .build(),
                    )
                }
            }
            try {
                when (val result = repository.checkForUpdate()) {
                    is ApiResult.Success -> Result.success()
                    is ApiResult.NetworkError -> Result.retry()
                    is ApiResult.HttpError -> if (result.statusCode >= 500) Result.retry() else Result.failure()
                    ApiResult.NotConfigured, is ApiResult.ParseError -> Result.failure()
                }
            } finally {
                progressJob.cancelAndJoin()
            }
        }
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "cyberfish-model-update"
        private const val PERIODIC_WORK_NAME = "cyberfish-model-update-periodic"
        const val KEY_STATUS = "status"
        const val KEY_MODEL_VERSION = "model_version"
        const val KEY_PROGRESS = "progress"
        const val KEY_ERROR_CODE = "error_code"
        const val KEY_ERROR_MESSAGE = "error_message"

        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<ModelUpdateWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                request,
            )
        }

        fun schedule(context: Context) {
            val workManager = WorkManager.getInstance(context.applicationContext)
            val startupRequest = OneTimeWorkRequestBuilder<ModelUpdateWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInitialDelay(15, TimeUnit.SECONDS)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            workManager.enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.KEEP, startupRequest)

            val periodicRequest = PeriodicWorkRequestBuilder<ModelUpdateWorker>(6, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            workManager.enqueueUniquePeriodicWork(PERIODIC_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, periodicRequest)
        }
    }
}

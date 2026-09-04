package com.cyberfish.app.update

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
import com.cyberfish.app.data.CyberFishRepository
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
                val result = repository.checkAndInstall()
                if (result.retryable) Result.retry() else Result.success()
            } finally {
                progressJob.cancelAndJoin()
            }
        }
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "cyberfish-model-update"
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
    }
}

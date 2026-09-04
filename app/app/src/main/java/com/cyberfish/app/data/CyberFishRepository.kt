package com.cyberfish.app.data

import android.content.Context
import com.cyberfish.app.data.local.CyberFishDatabase
import com.cyberfish.app.BuildConfig
import com.cyberfish.app.data.local.FishRecordDao
import com.cyberfish.app.data.local.FishRecordEntity
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.data.preferences.AppPreferences
import com.cyberfish.app.data.preferences.AppPreferencesStore
import com.cyberfish.app.network.ApiConfig
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.AppApiClient
import com.cyberfish.app.network.AppUpdateInfo
import com.cyberfish.app.network.DeviceIdentityStore
import com.cyberfish.app.network.MisreportUploadWorker
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.update.ModelRepository
import com.cyberfish.app.update.ModelUpdateWorker
import java.io.File
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class CyberFishRepository(context: Context) {
    private val appContext = context.applicationContext
    private val database = CyberFishDatabase.get(appContext)
    private val recordDao: FishRecordDao = database.fishRecordDao()
    private val preferencesStore = AppPreferencesStore(appContext)
    private val appApiClient = AppApiClient(ApiConfig.fromBuildConfig(), DeviceIdentityStore(appContext))
    val modelRepository = ModelRepository(
        modelApi = appApiClient,
        storageDir = File(appContext.filesDir, "models"),
        allowInsecureHttp = BuildConfig.DEBUG,
    )
    val modelState = modelRepository.state

    val records: Flow<List<FishRecord>> = recordDao.observeAll().map { records -> records.map(FishRecordEntity::toDomain) }
    val preferences: Flow<AppPreferences> = preferencesStore.data

    suspend fun saveTrigger(event: TriggerEvent) {
        recordDao.insert(FishRecordEntity.fromEvent(event, System.currentTimeMillis()))
    }

    suspend fun confirmMisreport(event: TriggerEvent) {
        recordDao.insert(FishRecordEntity.fromEvent(event, System.currentTimeMillis(), isFalsePositive = true))
        confirmMisreport(event.timestampMillis)
    }

    suspend fun confirmMisreport(triggerTimestampMillis: Long) {
        recordDao.markMisreportPending(triggerTimestampMillis, com.cyberfish.app.data.model.MisreportSyncState.Pending.name)
        MisreportUploadWorker.enqueue(appContext, triggerTimestampMillis)
    }

    suspend fun savePreferences(preferences: AppPreferences) {
        preferencesStore.save(preferences)
    }

    suspend fun checkForUpdate(): ApiResult<AppUpdateInfo> = appApiClient.checkForUpdate()

    suspend fun checkForModelUpdate() = modelRepository.checkAndInstall()

    suspend fun rollbackModel() = modelRepository.rollback()

    fun enqueueModelUpdate() = ModelUpdateWorker.enqueue(appContext)
}

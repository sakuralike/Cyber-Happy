package com.cyberfish.app.data

import android.content.Context
import com.cyberfish.app.data.local.CyberFishDatabase
import com.cyberfish.app.data.local.FishRecordDao
import com.cyberfish.app.data.local.FishRecordEntity
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.data.preferences.AppPreferences
import com.cyberfish.app.data.preferences.AppPreferencesStore
import com.cyberfish.app.network.ApiConfig
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.AppApiClient
import com.cyberfish.app.network.AppEventType
import com.cyberfish.app.network.AppUpdateInfo
import com.cyberfish.app.network.DeviceIdentityStore
import com.cyberfish.app.network.SupportContent
import com.cyberfish.app.network.UserSession
import com.cyberfish.app.network.UserSessionStore
import com.cyberfish.app.network.MisreportUploadWorker
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.update.ModelRuntime
import com.cyberfish.app.update.ModelUpdateWorker
import com.cyberfish.app.update.AppUpdateWorker
import androidx.work.WorkInfo
import androidx.work.WorkManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.channels.awaitClose
import androidx.lifecycle.Observer
import org.json.JSONObject

class CyberFishRepository(context: Context) {
    private val appContext = context.applicationContext
    private val database = CyberFishDatabase.get(appContext)
    private val recordDao: FishRecordDao = database.fishRecordDao()
    private val preferencesStore = AppPreferencesStore(appContext)
    private val userSessionStore = UserSessionStore(appContext)
    private val appApiClient = AppApiClient(ApiConfig.fromBuildConfig(), DeviceIdentityStore(appContext), userSessionStore)
    val modelRepository = ModelRuntime.get(appContext, appApiClient)
    val modelState = modelRepository.state
    val appUpdateWorkInfo: Flow<WorkInfo?> = callbackFlow {
        val liveData = WorkManager.getInstance(appContext).getWorkInfosForUniqueWorkLiveData(AppUpdateWorker.WORK_NAME)
        val observer = Observer<List<WorkInfo>> { trySend(it.firstOrNull()).isSuccess }
        liveData.observeForever(observer)
        awaitClose { liveData.removeObserver(observer) }
    }

    val records: Flow<List<FishRecord>> = recordDao.observeAll().map { records -> records.map(FishRecordEntity::toDomain) }
    val preferences: Flow<AppPreferences> = preferencesStore.data
    val userSession: Flow<UserSession?> = userSessionStore.session

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

    suspend fun reportEvent(
        eventType: AppEventType,
        modelVersion: String? = null,
        count: Int = 1,
        payload: JSONObject = JSONObject(),
    ) = appApiClient.reportEvent(eventType, count, modelVersion, payload)

    suspend fun login(username: String, password: String): ApiResult<UserSession> {
        val result = appApiClient.login(username, password)
        if (result is ApiResult.Success) userSessionStore.save(result.value)
        return result
    }

    suspend fun register(username: String, password: String, displayName: String, email: String): ApiResult<UserSession> {
        val result = appApiClient.register(username, password, displayName, email)
        if (result is ApiResult.Success) userSessionStore.save(result.value)
        return result
    }

    suspend fun logout() = userSessionStore.clear()

    suspend fun loadSupportContent(): ApiResult<SupportContent> = appApiClient.fetchSupportContent()

    suspend fun submitFeedback(content: String, contact: String): ApiResult<Unit> = appApiClient.submitFeedback(content, contact)

    fun enqueueAppUpdate(update: AppUpdateInfo) = AppUpdateWorker.enqueue(appContext, update)

    suspend fun checkForModelUpdate() = modelRepository.checkAndInstall()

    suspend fun rollbackModel() = modelRepository.rollback()

    fun enqueueModelUpdate() = ModelUpdateWorker.enqueue(appContext)

    fun scheduleModelUpdates() = ModelUpdateWorker.schedule(appContext)

    suspend fun exportRecords(records: List<FishRecord>): java.io.File = withContext(Dispatchers.IO) {
        val directory = java.io.File(appContext.filesDir, "exports").apply { mkdirs() }
        val file = java.io.File(directory, "cyberfish-records-${System.currentTimeMillis()}.csv")
        val formatter = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
        file.outputStream().bufferedWriter(Charsets.UTF_8).use { writer ->
            writer.write("id,occurred_at,vertical_displacement_px,jitter_hz,confidence,model_version,is_false_positive,misreport_state")
            writer.newLine()
            records.forEach { record ->
                val values = listOf(record.id.toString(), formatter.format(java.util.Date(record.occurredAtMillis)), record.verticalDisplacementPx.toString(), record.jitterHz.toString(), record.confidence.toString(), record.modelVersion, record.isFalsePositive.toString(), record.misreportState.name)
                writer.write(values.joinToString(",") { value -> "\"${value.replace("\"", "\"\"")}\"" })
                writer.newLine()
            }
        }
        file
    }
}

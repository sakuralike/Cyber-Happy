package com.cyberfish.app.data

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.graphics.BitmapFactory
import com.cyberfish.app.data.local.CyberFishDatabase
import com.cyberfish.app.data.local.FishRecordDao
import com.cyberfish.app.data.local.FishRecordEntity
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.data.checkin.CheckInCacheStore
import com.cyberfish.app.data.checkin.CHECK_IN_CONFIG_CACHE_TTL_MILLIS
import com.cyberfish.app.data.checkin.isCheckInCacheFresh
import com.cyberfish.app.data.preferences.AppPreferences
import com.cyberfish.app.data.preferences.AppPreferencesStore
import com.cyberfish.app.network.ApiConfig
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.AppApiClient
import com.cyberfish.app.network.AppEventType
import com.cyberfish.app.network.AppUpdateInfo
import com.cyberfish.app.network.CheckInActionResult
import com.cyberfish.app.network.CheckInHistory
import com.cyberfish.app.network.CheckInOverview
import com.cyberfish.app.network.DeviceIdentityStore
import com.cyberfish.app.network.SupportContent
import com.cyberfish.app.network.UserAccount
import com.cyberfish.app.network.UserSession
import com.cyberfish.app.network.UserSessionStore
import com.cyberfish.app.network.MisreportUploadWorker
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.update.ModelRuntime
import com.cyberfish.app.update.ModelUpdateWorker
import com.cyberfish.app.update.AndroidModelKeyStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL
import org.json.JSONObject

class CyberFishRepository(context: Context) {
    private val appContext = context.applicationContext
    private val database = CyberFishDatabase.get(appContext)
    private val recordDao: FishRecordDao = database.fishRecordDao()
    private val preferencesStore = AppPreferencesStore(appContext)
    private val checkInCacheStore = CheckInCacheStore(appContext)
    private val userSessionStore = UserSessionStore(appContext)
    private val deviceIdentityStore = DeviceIdentityStore(appContext)
    private val modelKeyStore = AndroidModelKeyStore()
    private val appApiClient = AppApiClient(ApiConfig.fromBuildConfig(), deviceIdentityStore, userSessionStore, modelKeyStore)
    val modelRepository = ModelRuntime.get(appContext, appApiClient, modelKeyStore)
    val modelState = modelRepository.state
    val records: Flow<List<FishRecord>> = recordDao.observeAll().map { records -> records.map(FishRecordEntity::toDomain) }
    val preferences: Flow<AppPreferences> = preferencesStore.data
    val userSession: Flow<UserSession?> = userSessionStore.session

    suspend fun saveTrigger(event: TriggerEvent) {
        recordDao.insert(FishRecordEntity.fromEvent(event, System.currentTimeMillis()))
    }

    suspend fun deleteRecord(recordId: Long) {
        recordDao.deleteById(recordId)
    }

    suspend fun deleteAllRecords() {
        recordDao.deleteAll()
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
        if (result is ApiResult.Success) persistSession(result.value)
        return result
    }

    suspend fun register(username: String, password: String, displayName: String, email: String, inviteCode: String? = null): ApiResult<UserSession> {
        val result = appApiClient.register(username, password, displayName, email, inviteCode)
        if (result is ApiResult.Success) persistSession(result.value)
        return result
    }

    suspend fun updateMe(displayName: String, email: String): ApiResult<UserAccount> {
        val result = appApiClient.updateMe(displayName, email)
        if (result is ApiResult.Success) {
            val current = userSessionStore.get() ?: return result
            val avatarUrl = current.user.avatarUrl?.takeIf { it.startsWith("file:") } ?: result.value.avatarUrl
            persistSession(UserSession(current.token, result.value.copy(avatarUrl = avatarUrl)))
        }
        return result
    }

    suspend fun changePassword(currentPassword: String, newPassword: String): ApiResult<Unit> =
        appApiClient.changePassword(currentPassword, newPassword)

    suspend fun uploadAvatar(uri: Uri): ApiResult<UserAccount> {
        val resolver = appContext.contentResolver
        val mimeType = resolver.getType(uri)?.takeIf { it in setOf("image/jpeg", "image/png", "image/webp") }
            ?: return ApiResult.ParseError("头像格式仅支持 JPG、PNG 或 WebP")
        val extension = when (mimeType) {
            "image/png" -> ".png"
            "image/webp" -> ".webp"
            else -> ".jpg"
        }
        val file = File.createTempFile("avatar-", extension, appContext.cacheDir)
        try {
            val input = resolver.openInputStream(uri) ?: return ApiResult.ParseError("无法读取头像文件")
            input.use { source -> file.outputStream().use { target -> source.copyTo(target) } }
            val result = appApiClient.uploadAvatar(file, mimeType)
            if (result is ApiResult.Success) {
                val session = userSessionStore.get() ?: return result
                userSessionStore.save(UserSession(session.token, result.value.copy(avatarUrl = cacheAvatar(file, session.user.id))))
            }
            return result
        } finally {
            file.delete()
        }
    }

    suspend fun uploadAvatar(bitmap: Bitmap): ApiResult<UserAccount> {
        val file = File.createTempFile("avatar-crop-", ".png", appContext.cacheDir)
        return try {
            file.outputStream().use { output -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, output) }
            val result = appApiClient.uploadAvatar(file, "image/png")
            if (result is ApiResult.Success) {
                val session = userSessionStore.get() ?: return result
                userSessionStore.save(UserSession(session.token, result.value.copy(avatarUrl = cacheAvatar(file, session.user.id))))
            }
            result
        } finally {
            file.delete()
            if (!bitmap.isRecycled) bitmap.recycle()
        }
    }

    suspend fun logout() = userSessionStore.clear()

    suspend fun resumeUserSession(): UserSession? {
        val session = userSessionStore.resume() ?: return null
        return persistSession(session)
    }

    private suspend fun persistSession(session: UserSession): UserSession {
        val cached = cacheRemoteAvatar(session)
        userSessionStore.save(cached)
        return cached
    }

    private suspend fun cacheRemoteAvatar(session: UserSession): UserSession = withContext(Dispatchers.IO) {
        val avatarUrl = session.user.avatarUrl ?: return@withContext session
        if (avatarUrl.startsWith("file:")) return@withContext session
        val target = avatarCacheFile(session.user.id)
        if (target.isFile && target.length() > 0L) {
            return@withContext session.copy(user = session.user.copy(avatarUrl = target.toURI().toString()))
        }
        val bitmap = runCatching { URL(avatarUrl).openStream().use(BitmapFactory::decodeStream) }.getOrNull()
            ?: return@withContext session
        try {
            target.parentFile?.mkdirs()
            target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            session.copy(user = session.user.copy(avatarUrl = target.toURI().toString()))
        } finally {
            bitmap.recycle()
        }
    }

    private fun cacheAvatar(source: File, userId: String): String? = runCatching {
        val bitmap = BitmapFactory.decodeFile(source.absolutePath) ?: return null
        val target = avatarCacheFile(userId)
        target.parentFile?.mkdirs()
        target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        target.toURI().toString()
    }.getOrNull()

    private fun avatarCacheFile(userId: String) = File(appContext.filesDir, "profile/avatar-${userId.replace(Regex("[^A-Za-z0-9_-]"), "_")}.png")

    suspend fun loadSupportContent(): ApiResult<SupportContent> = appApiClient.fetchSupportContent()

    suspend fun submitFeedback(content: String, contact: String): ApiResult<Unit> = appApiClient.submitFeedback(content, contact)

    suspend fun fetchCheckInOverview(forceRefresh: Boolean = false): ApiResult<CheckInOverview> {
        val session = userSessionStore.get()
        if (session == null) return appApiClient.fetchCheckInOverview()
        val cached = checkInCacheStore.readOverview(session.user.id)
        val nowMillis = System.currentTimeMillis()
        if (!forceRefresh && cached != null && isCheckInCacheFresh(cached.savedAtMillis, nowMillis, CHECK_IN_CONFIG_CACHE_TTL_MILLIS)) {
            return ApiResult.Success(
                value = cached.value,
                fromCache = true,
                cachedAtMillis = cached.savedAtMillis,
            )
        }
        return when (val result = appApiClient.fetchCheckInOverview()) {
            is ApiResult.Success -> {
                checkInCacheStore.writeOverview(session.user.id, result.value, nowMillis)
                result
            }
            is ApiResult.NetworkError -> if (cached != null) {
                ApiResult.Success(
                    value = cached.value,
                    fromCache = true,
                    cacheFallback = true,
                    cachedAtMillis = cached.savedAtMillis,
                )
            } else {
                result
            }
            else -> result
        }
    }

    suspend fun refreshCheckInOverview(): ApiResult<CheckInOverview> = fetchCheckInOverview(forceRefresh = true)

    suspend fun checkIn(): ApiResult<CheckInActionResult> {
        val result = appApiClient.checkIn()
        if (result is ApiResult.Success) {
            userSessionStore.get()?.user?.id?.let { userId ->
                checkInCacheStore.writeOverview(userId, result.value.overview)
            }
        }
        return result
    }

    suspend fun fetchCheckInHistory(page: Int = 1, pageSize: Int = 20, month: String? = null): ApiResult<CheckInHistory> {
        val session = userSessionStore.get()
        if (session == null) return appApiClient.fetchCheckInHistory(page, pageSize, month)
        val result = appApiClient.fetchCheckInHistory(page, pageSize, month)
        if (result is ApiResult.Success) {
            if (page == 1) checkInCacheStore.writeHistory(session.user.id, month, result.value)
            return result
        }
        if (result is ApiResult.NetworkError && page == 1) {
            val cached = checkInCacheStore.readHistory(session.user.id, month)
            if (cached != null) {
                return ApiResult.Success(
                    value = cached.value,
                    fromCache = true,
                    cacheFallback = true,
                    cachedAtMillis = cached.savedAtMillis,
                )
            }
        }
        return result
    }

    suspend fun checkForModelUpdate() = modelRepository.checkForUpdate()

    suspend fun installPendingModelUpdate() = modelRepository.installPendingUpdate()

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

package com.cyberfish.app.data

import android.content.Context
import com.cyberfish.app.data.local.CyberFishDatabase
import com.cyberfish.app.data.local.FishRecordDao
import com.cyberfish.app.data.local.FishRecordEntity
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.data.preferences.AppPreferences
import com.cyberfish.app.data.preferences.AppPreferencesStore
import com.cyberfish.app.trigger.TriggerEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class CyberFishRepository(context: Context) {
    private val database = CyberFishDatabase.get(context)
    private val recordDao: FishRecordDao = database.fishRecordDao()
    private val preferencesStore = AppPreferencesStore(context.applicationContext)

    val records: Flow<List<FishRecord>> = recordDao.observeAll().map { records -> records.map(FishRecordEntity::toDomain) }
    val preferences: Flow<AppPreferences> = preferencesStore.data

    suspend fun saveTrigger(event: TriggerEvent) {
        recordDao.insert(FishRecordEntity.fromEvent(event, System.currentTimeMillis()))
    }

    suspend fun markFalsePositive(event: TriggerEvent) {
        recordDao.insert(FishRecordEntity.fromEvent(event, System.currentTimeMillis(), isFalsePositive = true))
        recordDao.markFalsePositiveByTriggerTimestamp(event.timestampMillis)
    }

    suspend fun markFalsePositive(triggerTimestampMillis: Long) {
        recordDao.markFalsePositiveByTriggerTimestamp(triggerTimestampMillis)
    }

    suspend fun savePreferences(preferences: AppPreferences) {
        preferencesStore.save(preferences)
    }
}

package com.cyberfish.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface FishRecordDao {
    @Query("SELECT * FROM fish_records ORDER BY occurredAtMillis DESC")
    fun observeAll(): Flow<List<FishRecordEntity>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(record: FishRecordEntity): Long

    @Query("UPDATE fish_records SET isFalsePositive = 1 WHERE triggerTimestampMillis = :triggerTimestampMillis")
    suspend fun markFalsePositiveByTriggerTimestamp(triggerTimestampMillis: Long): Int
}

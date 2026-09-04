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

    @Query("SELECT * FROM fish_records WHERE triggerTimestampMillis = :triggerTimestampMillis LIMIT 1")
    suspend fun findByTriggerTimestamp(triggerTimestampMillis: Long): FishRecordEntity?

    @Query("UPDATE fish_records SET isFalsePositive = 1, misreportState = :state, misreportLastError = NULL WHERE triggerTimestampMillis = :triggerTimestampMillis")
    suspend fun markMisreportPending(triggerTimestampMillis: Long, state: String): Int

    @Query("UPDATE fish_records SET misreportState = :state, remoteMisreportId = :remoteMisreportId, misreportLastError = NULL WHERE triggerTimestampMillis = :triggerTimestampMillis")
    suspend fun markMisreportUploaded(triggerTimestampMillis: Long, state: String, remoteMisreportId: String): Int

    @Query("UPDATE fish_records SET misreportState = :state, misreportAttemptCount = misreportAttemptCount + 1, misreportLastError = :error WHERE triggerTimestampMillis = :triggerTimestampMillis")
    suspend fun markMisreportRetry(triggerTimestampMillis: Long, state: String, error: String): Int

    @Query("UPDATE fish_records SET misreportState = :state, misreportLastError = :error WHERE triggerTimestampMillis = :triggerTimestampMillis")
    suspend fun markMisreportFailed(triggerTimestampMillis: Long, state: String, error: String): Int
}

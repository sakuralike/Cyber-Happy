package com.cyberfish.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.data.model.MisreportSyncState
import com.cyberfish.app.trigger.TriggerEvent

@Entity(
    tableName = "fish_records",
    indices = [Index(value = ["triggerTimestampMillis"], unique = true)],
)
data class FishRecordEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    val occurredAtMillis: Long,
    val triggerTimestampMillis: Long,
    val confidence: Float,
    val verticalDisplacementPx: Float,
    val jitterHz: Float,
    val trajectoryCsv: String,
    val isFalsePositive: Boolean = false,
    val videoPath: String? = null,
    val misreportState: String = MisreportSyncState.None.name,
    val remoteMisreportId: String? = null,
    val misreportAttemptCount: Int = 0,
    val misreportLastError: String? = null,
) {
    fun toDomain() = FishRecord(
        id = id,
        occurredAtMillis = occurredAtMillis,
        triggerTimestampMillis = triggerTimestampMillis,
        confidence = confidence,
        verticalDisplacementPx = verticalDisplacementPx,
        jitterHz = jitterHz,
        trajectoryPx = trajectoryCsv.split(',').mapNotNull { it.toFloatOrNull() },
        isFalsePositive = isFalsePositive,
        videoPath = videoPath,
        misreportState = MisreportSyncState.entries.firstOrNull { it.name == misreportState } ?: MisreportSyncState.None,
        remoteMisreportId = remoteMisreportId,
        misreportAttemptCount = misreportAttemptCount,
        misreportLastError = misreportLastError,
    )

    companion object {
        fun fromEvent(
            event: TriggerEvent,
            occurredAtMillis: Long,
            isFalsePositive: Boolean = false,
            videoPath: String? = null,
            misreportState: MisreportSyncState = MisreportSyncState.None,
        ) = FishRecordEntity(
            occurredAtMillis = occurredAtMillis,
            triggerTimestampMillis = event.timestampMillis,
            confidence = event.confidence,
            verticalDisplacementPx = event.features.verticalDisplacementPx,
            jitterHz = event.features.jitterHz,
            trajectoryCsv = event.trajectoryPx.joinToString(","),
            isFalsePositive = isFalsePositive,
            videoPath = videoPath,
            misreportState = misreportState.name,
        )
    }
}

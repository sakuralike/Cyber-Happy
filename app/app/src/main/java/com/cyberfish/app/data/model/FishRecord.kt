package com.cyberfish.app.data.model

enum class MisreportSyncState(val label: String) {
    None("未上报"),
    Pending("待上报"),
    Retrying("重试中"),
    Uploaded("已上报"),
    Failed("上报失败"),
}

data class FishRecord(
    val id: Long,
    val occurredAtMillis: Long,
    val triggerTimestampMillis: Long,
    val confidence: Float,
    val verticalDisplacementPx: Float,
    val jitterHz: Float,
    val trajectoryPx: List<Float>,
    val modelVersion: String,
    val isFalsePositive: Boolean,
    val snapshotPath: String?,
    val videoPath: String?,
    val misreportState: MisreportSyncState,
    val remoteMisreportId: String?,
    val misreportAttemptCount: Int,
    val misreportLastError: String?,
)

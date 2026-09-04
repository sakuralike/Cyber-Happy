package com.cyberfish.app.data.model

data class FishRecord(
    val id: Long,
    val occurredAtMillis: Long,
    val triggerTimestampMillis: Long,
    val confidence: Float,
    val verticalDisplacementPx: Float,
    val jitterHz: Float,
    val trajectoryPx: List<Float>,
    val isFalsePositive: Boolean,
    val videoPath: String?,
)

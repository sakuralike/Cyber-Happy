package com.cyberfish.app.trigger

enum class TriggerPreset(val label: String) {
    Default("默认"),
    Balanced("中级"),
    Advanced("高级"),
}

data class TriggerConfig(
    val sinkThresholdPx: Float,
    val trembleThresholdHz: Float,
    val minSinkDurationMillis: Long,
    val minConfidence: Float,
    val cooldownMillis: Long = 5_000L,
    val reverseVelocityThresholdPxPerSecond: Float = 8f,
    val reverseConfirmationFrames: Int = 2,
) {
    companion object {
        fun forPreset(preset: TriggerPreset) = when (preset) {
            TriggerPreset.Default -> TriggerConfig(24f, 3.5f, 1_000L, 0.70f)
            TriggerPreset.Balanced -> TriggerConfig(18f, 3.0f, 800L, 0.62f)
            TriggerPreset.Advanced -> TriggerConfig(12f, 2.5f, 500L, 0.55f)
        }
    }
}

enum class TriggerState {
    Idle,
    Tracking,
    Candidate,
    Cooldown,
    Lost,
}

data class TriggerEvent(
    val timestampMillis: Long,
    val confidence: Float,
    val reason: String,
    val features: FeatureSnapshot,
    val trajectoryPx: List<Float>,
    val modelVersion: String = "MockDetector",
    val snapshotPath: String? = null,
)

class TriggerEngine(
    private val config: TriggerConfig = TriggerConfig.forPreset(TriggerPreset.Balanced),
) {
    var state: TriggerState = TriggerState.Idle
        private set

    private var sinkStartedAtMillis: Long? = null
    private var reverseConfirmationFrames = 0
    private var cooldownUntilMillis = 0L
    private val trajectory = ArrayDeque<Float>()

    fun evaluate(snapshot: FeatureSnapshot?): TriggerEvent? {
        if (snapshot == null) {
            if (state != TriggerState.Cooldown) state = TriggerState.Lost
            sinkStartedAtMillis = null
            reverseConfirmationFrames = 0
            return null
        }

        if (snapshot.timestampMillis < cooldownUntilMillis) {
            state = TriggerState.Cooldown
            return null
        }
        if (state == TriggerState.Cooldown) {
            state = TriggerState.Idle
            cooldownUntilMillis = 0L
            trajectory.clear()
        }

        trajectory.addLast(snapshot.verticalDisplacementPx)
        while (trajectory.size > TRAJECTORY_SIZE) trajectory.removeFirst()
        if (snapshot.verticalDisplacementPx >= SINK_START_THRESHOLD_PX && snapshot.verticalVelocityPxPerSecond > 0f) {
            sinkStartedAtMillis = sinkStartedAtMillis ?: snapshot.timestampMillis
        }

        val sinkStartedAt = sinkStartedAtMillis
        val qualified = sinkStartedAt != null &&
            snapshot.timestampMillis - sinkStartedAt >= config.minSinkDurationMillis &&
            snapshot.verticalDisplacementPx >= config.sinkThresholdPx &&
            snapshot.jitterHz >= config.trembleThresholdHz &&
            snapshot.confidence >= config.minConfidence
        if (!qualified) {
            state = if (sinkStartedAt == null) TriggerState.Idle else TriggerState.Tracking
            if (snapshot.verticalDisplacementPx < SINK_START_THRESHOLD_PX) sinkStartedAtMillis = null
            return null
        }

        state = TriggerState.Candidate
        if (snapshot.verticalVelocityPxPerSecond <= -config.reverseVelocityThresholdPxPerSecond) {
            reverseConfirmationFrames += 1
        } else if (snapshot.verticalVelocityPxPerSecond >= 0f) {
            reverseConfirmationFrames = 0
        }
        if (reverseConfirmationFrames < config.reverseConfirmationFrames) return null

        val event = TriggerEvent(
            timestampMillis = snapshot.timestampMillis,
            confidence = snapshot.confidence,
            reason = "持续下沉并完成反向确认",
            features = snapshot,
            trajectoryPx = trajectory.toList(),
        )
        state = TriggerState.Cooldown
        cooldownUntilMillis = snapshot.timestampMillis + config.cooldownMillis
        sinkStartedAtMillis = null
        reverseConfirmationFrames = 0
        return event
    }

    fun reset() {
        state = TriggerState.Idle
        sinkStartedAtMillis = null
        reverseConfirmationFrames = 0
        cooldownUntilMillis = 0L
        trajectory.clear()
    }

    private companion object {
        const val SINK_START_THRESHOLD_PX = 4f
        const val TRAJECTORY_SIZE = 36
    }
}

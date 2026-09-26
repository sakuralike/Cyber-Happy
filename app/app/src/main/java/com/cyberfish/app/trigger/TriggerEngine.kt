package com.cyberfish.app.trigger

import kotlin.math.abs

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
    val action: TriggerAction = TriggerAction.FishOn,
    val modelVersion: String = "NCNN_NOT_READY",
    val snapshotPath: String? = null,
)

enum class TriggerAction(val label: String) {
    Attention("注意"),
    PrepareRod("准备提杆"),
    FishOn("中鱼提杆"),
    BlackDrift("黑漂"),
}

class TriggerEngine(
    private val config: TriggerConfig = TriggerConfig.forPreset(TriggerPreset.Balanced),
    private val onAction: (TriggerEvent) -> Unit = {},
) {
    var state: TriggerState = TriggerState.Idle
        private set

    private var sinkStartedAtMillis: Long? = null
    private var sinkStartBounds: BoundingBoxSize? = null
    private var reverseConfirmationFrames = 0
    private var cooldownUntilMillis = 0L
    private var attentionEmitted = false
    private var prepareRodEmitted = false
    private var blackDriftEmitted = false
    private val trajectory = ArrayDeque<Float>()

    fun evaluate(snapshot: FeatureSnapshot?): TriggerEvent? {
        if (snapshot == null) {
            if (state != TriggerState.Cooldown) state = TriggerState.Lost
            clearCandidate()
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
        if (
            sinkStartedAtMillis == null &&
            snapshot.verticalDisplacementPx >= SINK_START_THRESHOLD_PX &&
            snapshot.verticalVelocityPxPerSecond > 0f
        ) {
            sinkStartedAtMillis = snapshot.timestampMillis
            sinkStartBounds = BoundingBoxSize(
                width = snapshot.bboxWidth,
                height = snapshot.bboxHeight,
                area = snapshot.bboxArea,
            )
            attentionEmitted = true
            emitAction(snapshot, TriggerAction.Attention, "检测到浮漂动作")
        }

        if (!blackDriftEmitted && isBlackDrift(snapshot)) {
            blackDriftEmitted = true
            emitAction(snapshot, TriggerAction.BlackDrift, "浮漂深度下沉，黑漂")
        }

        val sinkStartedAt = sinkStartedAtMillis
        val qualified = sinkStartedAt != null &&
            snapshot.timestampMillis - sinkStartedAt >= config.minSinkDurationMillis &&
            snapshot.verticalDisplacementPx >= config.sinkThresholdPx &&
            snapshot.jitterHz >= config.trembleThresholdHz &&
            snapshot.confidence >= config.minConfidence
        if (!qualified) {
            reverseConfirmationFrames = 0
            state = if (sinkStartedAt == null) TriggerState.Idle else TriggerState.Tracking
            if (snapshot.verticalDisplacementPx < SINK_START_THRESHOLD_PX) clearCandidate()
            return null
        }

        state = TriggerState.Candidate
        if (!prepareRodEmitted) {
            prepareRodEmitted = true
            emitAction(snapshot, TriggerAction.PrepareRod, "持续下沉，准备提杆")
        }
        if (
            snapshot.verticalVelocityPxPerSecond <= -config.reverseVelocityThresholdPxPerSecond &&
            hasAuxiliaryEvidence(snapshot)
        ) {
            reverseConfirmationFrames += 1
        } else {
            reverseConfirmationFrames = 0
        }
        if (reverseConfirmationFrames < config.reverseConfirmationFrames) return null

        val event = createEvent(snapshot, TriggerAction.FishOn, "持续下沉并完成反向确认")
        state = TriggerState.Cooldown
        cooldownUntilMillis = snapshot.timestampMillis + config.cooldownMillis
        clearCandidate()
        return event
    }

    fun reset() {
        state = TriggerState.Idle
        clearCandidate()
        cooldownUntilMillis = 0L
        trajectory.clear()
    }

    private fun hasAuxiliaryEvidence(snapshot: FeatureSnapshot): Boolean {
        if (snapshot.bottomDisplacementPx >= config.sinkThresholdPx * MIN_BOTTOM_DISPLACEMENT_RATIO) return true
        val baseline = sinkStartBounds ?: return false
        return relativeDelta(snapshot.bboxWidth, baseline.width) >= MIN_WIDTH_DELTA_RATIO ||
            relativeDelta(snapshot.bboxHeight, baseline.height) >= MIN_HEIGHT_DELTA_RATIO ||
            relativeDelta(snapshot.bboxArea, baseline.area) >= MIN_AREA_DELTA_RATIO
    }

    private fun relativeDelta(current: Float, baseline: Float): Float {
        if (!current.isFinite() || !baseline.isFinite() || current <= 0f || baseline <= 0f) return 0f
        return abs(current / baseline - 1f)
    }

    private fun clearCandidate() {
        sinkStartedAtMillis = null
        sinkStartBounds = null
        reverseConfirmationFrames = 0
        attentionEmitted = false
        prepareRodEmitted = false
        blackDriftEmitted = false
    }

    private fun emitAction(snapshot: FeatureSnapshot, action: TriggerAction, reason: String) {
        if (action == TriggerAction.Attention && !attentionEmitted) return
        onAction(createEvent(snapshot, action, reason))
    }

    private fun createEvent(snapshot: FeatureSnapshot, action: TriggerAction, reason: String) = TriggerEvent(
        timestampMillis = snapshot.timestampMillis,
        confidence = snapshot.confidence,
        reason = reason,
        features = snapshot,
        trajectoryPx = trajectory.toList(),
        action = action,
    )

    private fun isBlackDrift(snapshot: FeatureSnapshot): Boolean =
        (trajectory.maxOrNull() ?: snapshot.verticalDisplacementPx) >= config.sinkThresholdPx * BLACK_DRIFT_THRESHOLD_RATIO ||
            snapshot.bottomDisplacementPx >= config.sinkThresholdPx * BLACK_DRIFT_THRESHOLD_RATIO

    private data class BoundingBoxSize(
        val width: Float,
        val height: Float,
        val area: Float,
    )

    private companion object {
        const val SINK_START_THRESHOLD_PX = 4f
        const val TRAJECTORY_SIZE = 36
        const val MIN_BOTTOM_DISPLACEMENT_RATIO = 0.75f
        const val MIN_WIDTH_DELTA_RATIO = 0.10f
        const val MIN_HEIGHT_DELTA_RATIO = 0.10f
        const val MIN_AREA_DELTA_RATIO = 0.15f
        const val BLACK_DRIFT_THRESHOLD_RATIO = 1.6f
    }
}

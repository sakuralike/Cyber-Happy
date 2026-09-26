package com.cyberfish.app.trigger

import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.SingleDetectionTracker

class TriggerPipeline(
    config: TriggerConfig = TriggerConfig.forPreset(TriggerPreset.Balanced),
    private val onTrigger: (TriggerEvent) -> Unit,
    private val onAlert: (TriggerEvent) -> Unit = {},
) {
    private val tracker = SingleDetectionTracker()
    private val calculator = FeatureCalculator()
    private val engine = TriggerEngine(config, onAction = onAlert)
    private var activeTrackId: Long? = null

    val state: TriggerState
        @Synchronized get() = engine.state

    @Synchronized
    fun candidateDurationMillis(timestampMillis: Long): Long = engine.candidateDurationMillis(timestampMillis)

    @Synchronized
    fun updateConfig(config: TriggerConfig) = engine.updateConfig(config)

    @Synchronized
    fun accept(detection: Detection?, timestampMillis: Long): FeatureSnapshot? {
        val tracked = tracker.update(detection, timestampMillis)
        if (tracked == null) {
            activeTrackId = null
            engine.evaluate(calculator.update(null, timestampMillis))?.let(onTrigger)
            return null
        }
        if (!tracked.isObserved) return null

        if (tracked.trackId != activeTrackId) {
            calculator.reset()
            activeTrackId = tracked.trackId
        }
        val snapshot = calculator.update(tracked, timestampMillis)
        engine.evaluate(snapshot)?.let { event ->
            onAlert(event)
            onTrigger(event)
        }
        return snapshot
    }

    @Synchronized
    fun reset() {
        tracker.reset()
        calculator.reset()
        engine.reset()
        activeTrackId = null
    }
}

package com.cyberfish.app.trigger

import com.cyberfish.app.inference.Detection

class TriggerPipeline(
    config: TriggerConfig = TriggerConfig.forPreset(TriggerPreset.Balanced),
    private val onTrigger: (TriggerEvent) -> Unit,
) {
    private val calculator = FeatureCalculator()
    private val engine = TriggerEngine(config)

    @Synchronized
    fun accept(detection: Detection?, timestampMillis: Long) {
        engine.evaluate(calculator.update(detection, timestampMillis))?.let(onTrigger)
    }

    @Synchronized
    fun reset() {
        calculator.reset()
        engine.reset()
    }
}

package com.cyberfish.app.trigger

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TriggerEngineTest {
    private val config = TriggerConfig(
        sinkThresholdPx = 18f,
        trembleThresholdHz = 3f,
        minSinkDurationMillis = 800L,
        minConfidence = 0.62f,
    )

    @Test
    fun `sustained sinking emits only after reverse confirmation`() {
        val engine = TriggerEngine(config)

        assertNull(engine.evaluate(snapshot(0L, 0f, 0f)))
        assertNull(engine.evaluate(snapshot(100L, 5f, 10f)))
        assertNull(engine.evaluate(snapshot(500L, 15f, 20f)))
        assertNull(engine.evaluate(snapshot(900L, 20f, 20f)))
        assertNull(engine.evaluate(snapshot(933L, 20f, -12f)))
        val event = engine.evaluate(snapshot(966L, 19f, -12f))

        assertTrue(event != null)
        assertEquals(TriggerState.Cooldown, engine.state)
        assertEquals("持续下沉并完成反向确认", event?.reason)
    }

    @Test
    fun `cooldown suppresses another candidate for five seconds`() {
        val engine = TriggerEngine(config)
        triggerOnce(engine)

        assertNull(engine.evaluate(snapshot(2_000L, 30f, 20f)))
        assertEquals(TriggerState.Cooldown, engine.state)
    }

    @Test
    fun `lost detection clears a pending candidate`() {
        val engine = TriggerEngine(config)
        engine.evaluate(snapshot(0L, 0f, 0f))
        engine.evaluate(snapshot(100L, 5f, 10f))
        engine.evaluate(snapshot(900L, 20f, 20f))

        assertNull(engine.evaluate(null))
        assertEquals(TriggerState.Lost, engine.state)
        assertNull(engine.evaluate(snapshot(933L, 20f, -12f)))
        assertNull(engine.evaluate(snapshot(966L, 19f, -12f)))
    }

    @Test
    fun `three presets expose the planned sensitivity choices`() {
        assertEquals(3, TriggerPreset.entries.size)
        assertTrue(TriggerPreset.entries.map { it.label }.containsAll(listOf("默认", "中级", "高级")))
    }

    private fun triggerOnce(engine: TriggerEngine) {
        engine.evaluate(snapshot(0L, 0f, 0f))
        engine.evaluate(snapshot(100L, 5f, 10f))
        engine.evaluate(snapshot(900L, 20f, 20f))
        engine.evaluate(snapshot(933L, 20f, -12f))
        engine.evaluate(snapshot(966L, 19f, -12f))
    }

    private fun snapshot(timestamp: Long, displacement: Float, velocity: Float) = FeatureSnapshot(
        timestampMillis = timestamp,
        verticalDisplacementPx = displacement,
        verticalVelocityPxPerSecond = velocity,
        jitterHz = 3.6f,
        confidence = 0.9f,
    )
}

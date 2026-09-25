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
    fun `size change cannot trigger without primary displacement`() {
        val engine = TriggerEngine(config)

        assertNull(engine.evaluate(snapshot(0L, 0f, 0f)))
        assertNull(engine.evaluate(snapshot(100L, 5f, 10f)))
        assertNull(engine.evaluate(snapshot(900L, 10f, 20f, width = 0.2f, height = 0.6f)))
        assertNull(engine.evaluate(snapshot(933L, 10f, -12f, width = 0.2f, height = 0.6f)))
        assertNull(engine.evaluate(snapshot(966L, 10f, -12f, width = 0.2f, height = 0.6f)))

        assertEquals(TriggerState.Tracking, engine.state)
    }

    @Test
    fun `primary motion without bottom or size evidence does not trigger`() {
        val engine = TriggerEngine(config)

        assertNull(engine.evaluate(snapshot(0L, 0f, 0f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(100L, 5f, 10f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(900L, 20f, 20f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(933L, 20f, -12f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(966L, 19f, -12f, bottomDisplacement = 0f)))

        assertEquals(TriggerState.Candidate, engine.state)
    }

    @Test
    fun `size evidence confirms primary motion after two reverse frames`() {
        val engine = TriggerEngine(config)

        assertNull(engine.evaluate(snapshot(0L, 0f, 0f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(100L, 5f, 10f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(900L, 20f, 20f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(933L, 20f, -12f, bottomDisplacement = 0f, width = 0.08f)))
        val event = engine.evaluate(snapshot(966L, 19f, -12f, bottomDisplacement = 0f, width = 0.08f))

        assertTrue(event != null)
        assertEquals(TriggerState.Cooldown, engine.state)
    }

    @Test
    fun `missing auxiliary evidence resets reverse confirmation`() {
        val engine = TriggerEngine(config)

        assertNull(engine.evaluate(snapshot(0L, 0f, 0f)))
        assertNull(engine.evaluate(snapshot(100L, 5f, 10f)))
        assertNull(engine.evaluate(snapshot(900L, 20f, 20f)))
        assertNull(engine.evaluate(snapshot(933L, 20f, -12f)))
        assertNull(engine.evaluate(snapshot(966L, 20f, -12f, bottomDisplacement = 0f)))
        assertNull(engine.evaluate(snapshot(999L, 20f, -12f)))
        val event = engine.evaluate(snapshot(1_032L, 19f, -12f))

        assertTrue(event != null)
    }

    @Test
    fun `cooldown completion allows a complete new action`() {
        val engine = TriggerEngine(config)
        triggerOnce(engine)

        assertNull(engine.evaluate(snapshot(5_965L, 0f, 0f)))
        assertEquals(TriggerState.Cooldown, engine.state)
        assertNull(engine.evaluate(snapshot(5_966L, 0f, 0f)))
        assertNull(engine.evaluate(snapshot(6_066L, 5f, 10f)))
        assertNull(engine.evaluate(snapshot(6_866L, 20f, 20f)))
        assertNull(engine.evaluate(snapshot(6_899L, 20f, -12f)))
        val event = engine.evaluate(snapshot(6_932L, 19f, -12f))

        assertTrue(event != null)
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

    private fun snapshot(
        timestamp: Long,
        displacement: Float,
        velocity: Float,
        bottomDisplacement: Float = displacement,
        width: Float = 0.1f,
        height: Float = 0.3f,
        area: Float = width * height,
    ) = FeatureSnapshot(
        timestampMillis = timestamp,
        verticalDisplacementPx = displacement,
        verticalVelocityPxPerSecond = velocity,
        jitterHz = 3.6f,
        confidence = 0.9f,
        bottomDisplacementPx = bottomDisplacement,
        bboxWidth = width,
        bboxHeight = height,
        bboxArea = area,
    )
}

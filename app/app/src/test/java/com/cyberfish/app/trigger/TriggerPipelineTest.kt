package com.cyberfish.app.trigger

import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.MockDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TriggerPipelineTest {
    @Test
    fun `mock sequence emits one trigger and enters cooldown`() {
        val events = mutableListOf<TriggerEvent>()
        val pipeline = TriggerPipeline(onTrigger = events::add)
        val detector = MockDetector()
        val frame = CameraFrame(width = 1280, height = 720, timestampNanos = 0L)

        repeat(180) { index ->
            pipeline.accept(detector.detect(frame), index * 33L)
        }

        assertEquals(1, events.size)
        assertTrue(events.single().features.verticalDisplacementPx >= 18f)
        assertEquals("持续下沉并完成反向确认", events.single().reason)
    }
}

package com.cyberfish.app.trigger

import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.DetectionBounds
import com.cyberfish.app.inference.MockDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TriggerPipelineTest {
    @Test
    fun `returns tracked size ratios for the monitoring status summary`() {
        val pipeline = TriggerPipeline(onTrigger = {})

        val first = pipeline.accept(
            detection = Detection(
                bounds = DetectionBounds(0.4f, 0.3f, 0.6f, 0.5f),
                confidence = 0.9f,
            ),
            timestampMillis = 0L,
        )!!
        val second = pipeline.accept(
            detection = Detection(
                bounds = DetectionBounds(0.39f, 0.28f, 0.61f, 0.52f),
                confidence = 0.9f,
            ),
            timestampMillis = 33L,
        )!!

        assertEquals(1f, first.bboxHeightRatioFromBaseline, 0.0001f)
        assertTrue(second.bboxHeightRatioFromBaseline > 1f)
        pipeline.reset()
        assertNull(pipeline.accept(null, 66L))
    }

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

    @Test
    fun `short loss does not advance candidate and two observed reverse frames trigger`() {
        val events = mutableListOf<TriggerEvent>()
        val driver = SequenceDriver(TriggerPipeline(config = testConfig, onTrigger = events::add))
        driver.feedSink()

        driver.missing(frameCount = 5)
        assertEquals(0, events.size)

        driver.frame(centerY = 0.3f, height = 0.3f)
        assertEquals(0, events.size)
        driver.frame(centerY = 0.2f, height = 0.3f)

        assertEquals(1, events.size)
    }

    @Test
    fun `long loss resets track so reverse-only frames cannot trigger`() {
        val events = mutableListOf<TriggerEvent>()
        val driver = SequenceDriver(TriggerPipeline(config = testConfig, onTrigger = events::add))
        driver.feedSink()

        driver.missing(frameCount = 11)
        driver.frame(centerY = 0.3f, height = 0.3f)
        driver.frame(centerY = 0.2f, height = 0.3f)

        assertEquals(0, events.size)
    }

    @Test
    fun `stationary center with size jitter does not trigger`() {
        val events = mutableListOf<TriggerEvent>()
        val driver = SequenceDriver(TriggerPipeline(config = testConfig, onTrigger = events::add))

        repeat(90) { frameIndex ->
            val scale = if (frameIndex % 2 == 0) 1.08f else 0.92f
            driver.frame(centerY = 0.4f, width = 0.2f * scale, height = 0.4f * scale)
        }

        assertEquals(0, events.size)
    }

    @Test
    fun `stationary center with gradual size change does not trigger`() {
        val events = mutableListOf<TriggerEvent>()
        val driver = SequenceDriver(TriggerPipeline(config = testConfig, onTrigger = events::add))

        repeat(90) { frameIndex ->
            val scale = 1f + frameIndex / 89f * 0.5f
            driver.frame(centerY = 0.4f, width = 0.2f * scale, height = 0.4f * scale)
        }

        assertEquals(0, events.size)
    }

    private class SequenceDriver(
        private val pipeline: TriggerPipeline,
    ) {
        private var timestampMillis = 0L

        fun feedSink() {
            frame(centerY = 0.3f, height = 0.3f)
            frame(centerY = 0.45f, height = 0.3f)
        }

        fun frame(
            centerY: Float,
            width: Float = 0.2f,
            height: Float = 0.4f,
        ) {
            pipeline.accept(
                detection = Detection(
                    bounds = DetectionBounds(
                        left = 0.5f - width / 2f,
                        top = centerY - height / 2f,
                        right = 0.5f + width / 2f,
                        bottom = centerY + height / 2f,
                    ),
                    confidence = 0.9f,
                    motionFrequencyHz = 3.6f,
                ),
                timestampMillis = timestampMillis,
            )
            timestampMillis += FRAME_MILLIS
        }

        fun missing(frameCount: Int) {
            repeat(frameCount) {
                pipeline.accept(detection = null, timestampMillis = timestampMillis)
                timestampMillis += FRAME_MILLIS
            }
        }
    }

    private companion object {
        const val FRAME_MILLIS = 33L

        val testConfig = TriggerConfig(
            sinkThresholdPx = 1f,
            trembleThresholdHz = 3f,
            minSinkDurationMillis = 0L,
            minConfidence = 0.5f,
            reverseVelocityThresholdPxPerSecond = 0.1f,
            reverseConfirmationFrames = 2,
        )
    }
}

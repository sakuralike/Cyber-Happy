package com.cyberfish.app.inference

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DetectionTrackerTest {
    @Test
    fun `smooths width height and area and reports ratios from track start`() {
        val tracker = SingleDetectionTracker(
            sizeEmaAlpha = 0.5f,
            maximumCenterDistance = 0.5f,
        )

        val initial = tracker.update(detection(0.4f, 0.4f, 0.6f, 0.6f), timestampMillis = 0L)!!
        val updated = tracker.update(detection(0.3f, 0.3f, 0.7f, 0.7f), timestampMillis = 33L)!!

        assertEquals(0f, initial.sizeRatios.widthDeltaRatioFromBaseline, DELTA)
        assertEquals(0.3f, updated.smoothedWidth, DELTA)
        assertEquals(0.3f, updated.smoothedHeight, DELTA)
        assertEquals(0.1f, updated.smoothedArea, DELTA)
        assertEquals(1.5f, updated.sizeRatios.widthRatioFromBaseline, DELTA)
        assertEquals(1.5f, updated.sizeRatios.heightRatioFromBaseline, DELTA)
        assertEquals(2.5f, updated.sizeRatios.areaRatioFromBaseline, DELTA)
        assertEquals(1.5f, updated.sizeRatios.areaDeltaRatioFromBaseline, DELTA)
    }

    @Test
    fun `bounds three seconds of stationary size jitter`() {
        val tracker = SingleDetectionTracker()
        var trackId: Long? = null
        val steadySamples = mutableListOf<TrackedDetection>()

        repeat(90) { frameIndex ->
            val scale = when {
                frameIndex == 0 -> 1f
                frameIndex % 2 == 0 -> 1.08f
                else -> 0.92f
            }
            val width = 0.2f * scale
            val height = 0.2f * scale
            val tracked = tracker.update(
                detection(
                    left = 0.5f - width / 2f,
                    top = 0.5f - height / 2f,
                    right = 0.5f + width / 2f,
                    bottom = 0.5f + height / 2f,
                ),
                timestampMillis = frameIndex * 33L,
            )!!

            trackId = trackId ?: tracked.trackId
            assertEquals(trackId, tracked.trackId)
            assertTrue(tracked.isObserved)
            if (frameIndex >= 30) steadySamples += tracked
        }

        assertTrue(steadySamples.peakToPeak { it.smoothedWidth } / 0.2f <= 0.1f)
        assertTrue(steadySamples.peakToPeak { it.smoothedHeight } / 0.2f <= 0.1f)
        assertTrue(steadySamples.peakToPeak { it.smoothedArea } / 0.04f <= 0.1f)
    }

    @Test
    fun `associates overlapping detections by iou`() {
        val tracker = SingleDetectionTracker(
            minimumIou = 0.2f,
            maximumCenterDistance = 0f,
        )
        val first = tracker.update(detection(0.1f, 0.1f, 0.3f, 0.3f), timestampMillis = 0L)!!

        val second = tracker.update(detection(0.15f, 0.15f, 0.35f, 0.35f), timestampMillis = 33L)!!

        assertEquals(first.trackId, second.trackId)
        assertTrue(second.isObserved)
    }

    @Test
    fun `associates nearby non-overlapping detections by center distance`() {
        val tracker = SingleDetectionTracker(
            minimumIou = 0.9f,
            maximumCenterDistance = 0.12f,
        )
        val first = tracker.update(detection(0.10f, 0.1f, 0.20f, 0.2f), timestampMillis = 0L)!!

        val second = tracker.update(detection(0.21f, 0.1f, 0.31f, 0.2f), timestampMillis = 33L)!!

        assertEquals(first.trackId, second.trackId)
        assertTrue(second.isObserved)
    }

    @Test
    fun `keeps stable track during short loss and resets after tolerance`() {
        val tracker = SingleDetectionTracker(missingToleranceMillis = 300L)
        val first = tracker.update(detection(0.1f, 0.1f, 0.2f, 0.3f), timestampMillis = 0L)!!

        val shortLoss = tracker.update(detection = null, timestampMillis = 300L)!!

        assertEquals(first.trackId, shortLoss.trackId)
        assertFalse(shortLoss.isObserved)
        assertEquals(300L, shortLoss.missingDurationMillis)
        assertNull(tracker.update(detection = null, timestampMillis = 301L))

        val restarted = tracker.update(detection(0.1f, 0.1f, 0.2f, 0.3f), timestampMillis = 302L)!!
        assertNotEquals(first.trackId, restarted.trackId)
        assertTrue(restarted.isObserved)
    }

    @Test
    fun `does not update track from low confidence or distant detection`() {
        val tracker = SingleDetectionTracker(
            minimumConfidence = 0.7f,
            maximumCenterDistance = 0.1f,
            missingToleranceMillis = 300L,
        )
        val first = tracker.update(detection(0.1f, 0.1f, 0.2f, 0.2f), timestampMillis = 0L)!!

        val lowConfidence = tracker.update(
            detection(0.1f, 0.1f, 0.4f, 0.4f, confidence = 0.6f),
            timestampMillis = 33L,
        )!!
        val distant = tracker.update(detection(0.8f, 0.8f, 0.9f, 0.9f), timestampMillis = 66L)!!

        assertFalse(lowConfidence.isObserved)
        assertFalse(distant.isObserved)
        assertEquals(first.trackId, distant.trackId)
        assertEquals(first.smoothedWidth, distant.smoothedWidth, DELTA)
        assertEquals(first.smoothedHeight, distant.smoothedHeight, DELTA)
        assertEquals(first.smoothedArea, distant.smoothedArea, DELTA)
    }

    @Test
    fun `starts a new track from a valid detection after loss window`() {
        val tracker = SingleDetectionTracker(
            maximumCenterDistance = 0.1f,
            missingToleranceMillis = 100L,
        )
        val first = tracker.update(detection(0.1f, 0.1f, 0.2f, 0.2f), timestampMillis = 0L)!!

        val replacement = tracker.update(detection(0.8f, 0.8f, 0.9f, 0.9f), timestampMillis = 101L)!!

        assertNotEquals(first.trackId, replacement.trackId)
        assertTrue(replacement.isObserved)
        assertEquals(1f, replacement.sizeRatios.widthRatioFromBaseline, DELTA)
        assertEquals(1f, replacement.sizeRatios.heightRatioFromBaseline, DELTA)
        assertEquals(1f, replacement.sizeRatios.areaRatioFromBaseline, DELTA)
    }

    private fun detection(
        left: Float,
        top: Float,
        right: Float,
        bottom: Float,
        confidence: Float = 0.9f,
    ) = Detection(
        bounds = DetectionBounds(left, top, right, bottom),
        confidence = confidence,
    )

    private fun List<TrackedDetection>.peakToPeak(selector: (TrackedDetection) -> Float): Float {
        val values = map(selector)
        return values.maxOrNull()!! - values.minOrNull()!!
    }

    private companion object {
        const val DELTA = 0.0001f
    }
}

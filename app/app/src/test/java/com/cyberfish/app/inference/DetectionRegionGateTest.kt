package com.cyberfish.app.inference

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class DetectionRegionGateTest {
    @Test
    fun `intelligent mode keeps highest confidence candidate`() {
        val outside = detection(0.05f, 0.05f, 0.2f, 0.2f, 0.95f)
        val inside = detection(0.4f, 0.4f, 0.6f, 0.6f, 0.7f)

        assertSame(outside, DetectionRegionGate.selectBest(listOf(inside, outside), region = null))
    }

    @Test
    fun `manual region chooses lower confidence candidate inside region`() {
        val outside = detection(0.05f, 0.05f, 0.2f, 0.2f, 0.95f)
        val inside = detection(0.4f, 0.4f, 0.6f, 0.6f, 0.7f)
        val region = DetectionBounds(0.3f, 0.3f, 0.7f, 0.7f)

        assertSame(inside, DetectionRegionGate.selectBest(listOf(outside, inside), region))
    }

    @Test
    fun `center outside region is rejected even when intersection is large`() {
        val detection = detection(0.1f, 0.4f, 0.55f, 0.6f, 0.9f)
        val region = DetectionBounds(0.3f, 0.3f, 0.5f, 0.7f)

        assertFalse(DetectionRegionGate.accepts(detection, region))
    }

    @Test
    fun `edge detection below intersection threshold is rejected`() {
        val detection = detection(0.1f, 0.1f, 0.9f, 0.9f, 0.9f)
        val region = DetectionBounds(0.3f, 0.3f, 0.7f, 0.7f)

        assertFalse(DetectionRegionGate.accepts(detection, region))
        assertTrue(DetectionRegionGate.accepts(detection, region, minIntersectionRatio = 0.2f))
    }

    @Test
    fun `invalid region and empty candidates are rejected`() {
        val detection = detection(0.4f, 0.4f, 0.6f, 0.6f, 0.9f)
        val invalid = DetectionBounds(0.7f, 0.7f, 0.2f, 0.2f)

        assertFalse(DetectionRegionGate.accepts(detection, invalid))
        assertNull(DetectionRegionGate.selectBest(emptyList(), invalid))
        assertEquals(true, DetectionRegionGate.accepts(detection, null))
    }

    private fun detection(left: Float, top: Float, right: Float, bottom: Float, confidence: Float) =
        Detection(DetectionBounds(left, top, right, bottom), confidence)
}

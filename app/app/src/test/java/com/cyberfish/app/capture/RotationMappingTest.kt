package com.cyberfish.app.capture

import org.junit.Assert.assertEquals
import org.junit.Test

class RotationMappingTest {
    @Test
    fun `ninety degree asymmetric box maps to raw crop`() {
        val raw = orientedBoundsToRawCrop(0.1f, 0.2f, 0.3f, 0.6f, 100, 200, 90)
        requireNotNull(raw)
        assertBounds(raw.left, raw.top, raw.right, raw.bottom, 0.2f, 0.7f, 0.6f, 0.9f)
    }

    @Test
    fun `two hundred seventy degree asymmetric box maps to raw crop`() {
        val raw = orientedBoundsToRawCrop(0.1f, 0.2f, 0.3f, 0.6f, 100, 200, 270)
        requireNotNull(raw)
        assertBounds(raw.left, raw.top, raw.right, raw.bottom, 0.4f, 0.1f, 0.8f, 0.3f)
    }

    private fun assertBounds(
        left: Float,
        top: Float,
        right: Float,
        bottom: Float,
        expectedLeft: Float,
        expectedTop: Float,
        expectedRight: Float,
        expectedBottom: Float,
    ) {
        assertEquals(expectedLeft, left, EPSILON)
        assertEquals(expectedTop, top, EPSILON)
        assertEquals(expectedRight, right, EPSILON)
        assertEquals(expectedBottom, bottom, EPSILON)
    }

    private companion object {
        const val EPSILON = 0.0001f
    }
}

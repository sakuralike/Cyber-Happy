package com.cyberfish.app.capture

import com.cyberfish.app.inference.DetectionBounds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

    @Test
    fun `raw crop bounds invert every supported rotation`() {
        val expected = mapOf(
            0 to floatArrayOf(0.1f, 0.2f, 0.3f, 0.6f),
            90 to floatArrayOf(0.4f, 0.1f, 0.8f, 0.3f),
            180 to floatArrayOf(0.7f, 0.4f, 0.9f, 0.8f),
            270 to floatArrayOf(0.2f, 0.7f, 0.6f, 0.9f),
        )

        expected.forEach { (rotation, values) ->
            val oriented = rawCropBoundsToOriented(
                left = 0.1f,
                top = 0.2f,
                right = 0.3f,
                bottom = 0.6f,
                cropWidth = 100,
                cropHeight = 200,
                rotationDegrees = rotation,
            )
            requireNotNull(oriented)
            assertBounds(oriented, values[0], values[1], values[2], values[3])
        }
    }

    @Test
    fun `raw crop bounds clip at image edges before inverse rotation`() {
        val oriented = rawCropBoundsToOriented(
            left = -0.2f,
            top = -0.1f,
            right = 0.5f,
            bottom = 1.2f,
            cropWidth = 100,
            cropHeight = 200,
            rotationDegrees = 90,
        )

        requireNotNull(oriented)
        assertBounds(oriented, 0f, 0f, 1f, 0.5f)
    }

    @Test
    fun `rotation helpers reject invalid input`() {
        assertNull(orientedBoundsToRawCrop(0f, 0f, 1f, 1f, 100, 200, 45))
        assertNull(rawCropBoundsToOriented(0f, 0f, 1f, 1f, 100, 200, 45))
        assertNull(rawCropBoundsToOriented(Float.NaN, 0f, 1f, 1f, 100, 200, 0))
        assertNull(rawCropBoundsToOriented(0.8f, 0f, 0.2f, 1f, 100, 200, 0))
        assertNull(rawCropBoundsToOriented(0f, 0f, 1f, 1f, 0, 200, 0))
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

    private fun assertBounds(
        actual: DetectionBounds,
        left: Float,
        top: Float,
        right: Float,
        bottom: Float,
    ) {
        assertBounds(actual.left, actual.top, actual.right, actual.bottom, left, top, right, bottom)
    }

    private companion object {
        const val EPSILON = 0.0001f
    }
}

package com.cyberfish.app.capture

import com.cyberfish.app.inference.DetectionBounds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DetectionCoordinateMapperTest {
    private val mapper = AspectRatioDetectionCoordinateMapper()

    @Test
    fun `fit preserves aspect ratio and centers content with letterbox`() {
        val display = mapper.map(
            detection = detection(0.25f, 0.25f, 0.75f, 0.75f),
            geometry = geometry(scaleType = PreviewScaleType.FIT),
        )

        requireNotNull(display)
        assertEquals(250f, display.boundsInPreview.left, EPSILON)
        assertEquals(359.375f, display.boundsInPreview.top, EPSILON)
        assertEquals(750f, display.boundsInPreview.right, EPSILON)
        assertEquals(640.625f, display.boundsInPreview.bottom, EPSILON)
        assertEquals(500f, display.widthPx, EPSILON)
        assertEquals(281.25f, display.heightPx, EPSILON)
    }

    @Test
    fun `center crop keeps aspect ratio and clips the visible bounds`() {
        val display = mapper.map(
            detection = detection(0.2f, 0.25f, 0.6f, 0.75f),
            geometry = geometry(scaleType = PreviewScaleType.CENTER_CROP),
        )

        requireNotNull(display)
        assertEquals(0f, display.boundsInPreview.left, EPSILON)
        assertEquals(250f, display.boundsInPreview.top, EPSILON)
        assertEquals(677.7778f, display.boundsInPreview.right, EPSILON)
        assertEquals(750f, display.boundsInPreview.bottom, EPSILON)
        assertEquals(677.7778f, display.widthPx, EPSILON)
        assertEquals(500f, display.heightPx, EPSILON)
    }

    @Test
    fun `fully cropped detection returns null`() {
        val display = mapper.map(
            detection = detection(0f, 0.25f, 0.1f, 0.75f),
            geometry = geometry(scaleType = PreviewScaleType.CENTER_CROP),
        )

        assertNull(display)
    }

    @Test
    fun `normalized bounds are clipped before mapping and dimensions use visible pixels`() {
        val display = mapper.map(
            detection = detection(-0.2f, -0.1f, 0.5f, 0.4f),
            geometry = geometry(scaleType = PreviewScaleType.FIT),
        )

        requireNotNull(display)
        assertEquals(0f, display.boundsInPreview.left, EPSILON)
        assertEquals(218.75f, display.boundsInPreview.top, EPSILON)
        assertEquals(500f, display.boundsInPreview.right, EPSILON)
        assertEquals(443.75f, display.boundsInPreview.bottom, EPSILON)
        assertEquals(500f, display.widthPx, EPSILON)
        assertEquals(225f, display.heightPx, EPSILON)
    }

    @Test
    fun `invalid or non finite detections are rejected`() {
        assertNull(
            mapper.map(
                detection = detection(0.5f, 0.5f, 0.4f, 0.6f),
                geometry = geometry(),
            ),
        )
        assertNull(
            mapper.map(
                detection = detection(Float.NaN, 0f, 1f, 1f),
                geometry = geometry(),
            ),
        )
    }

    @Test
    fun `existing detector type can be mapped without an adapter`() {
        val display = mapper.map(
            detection = com.cyberfish.app.inference.Detection(
                bounds = detection(0.25f, 0.25f, 0.75f, 0.75f).bounds,
                confidence = 0.87f,
            ),
            geometry = geometry(scaleType = PreviewScaleType.FIT),
        )

        requireNotNull(display)
        assertEquals(0.87f, display.confidence, EPSILON)
        assertTrue(display.label.isNotBlank())
    }

    private fun detection(left: Float, top: Float, right: Float, bottom: Float) = ModelDetection(
        bounds = DetectionBounds(left, top, right, bottom),
        confidence = 0.9f,
    )

    private fun geometry(scaleType: PreviewScaleType = PreviewScaleType.CENTER_CROP) = FrameGeometry(
        sourceWidthPx = 1920,
        sourceHeightPx = 1080,
        previewWidthPx = 1000f,
        previewHeightPx = 1000f,
        scaleType = scaleType,
    )

    private companion object {
        const val EPSILON = 0.001f
    }
}

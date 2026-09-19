package com.cyberfish.app.inference

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ModelInputTransformTest {
    @Test
    fun `landscape source is letterboxed vertically and maps back to source`() {
        val transform = transform(cropWidth = 1920, cropHeight = 1080)

        assertEquals(1920, transform.sourceWidthPx)
        assertEquals(1080, transform.sourceHeightPx)
        assertEquals(640, transform.contentWidthPx)
        assertEquals(360, transform.contentHeightPx)
        assertEquals(0, transform.paddingLeftPx)
        assertEquals(140, transform.paddingTopPx)
        assertEquals(140, transform.paddingBottomPx)

        val source = transform.modelToSourceNormalized(
            DetectionBounds(left = 0.25f, top = 0.359375f, right = 0.75f, bottom = 0.640625f),
        )

        requireNotNull(source)
        assertBounds(source, 0.25f, 0.25f, 0.75f, 0.75f)
    }

    @Test
    fun `rotation swaps source axes before letterbox`() {
        val transform = transform(cropWidth = 1920, cropHeight = 1080, rotationDegrees = 90)

        assertEquals(1080, transform.sourceWidthPx)
        assertEquals(1920, transform.sourceHeightPx)
        assertEquals(360, transform.contentWidthPx)
        assertEquals(640, transform.contentHeightPx)
        assertEquals(140, transform.paddingLeftPx)
        assertEquals(0, transform.paddingTopPx)

        val source = transform.modelToSourceNormalized(
            DetectionBounds(left = 0.359375f, top = 0.25f, right = 0.640625f, bottom = 0.75f),
        )

        requireNotNull(source)
        assertBounds(source, 0.25f, 0.25f, 0.75f, 0.75f)
    }

    @Test
    fun `ninety degree rotation maps oriented corners through non-zero crop origin`() {
        val transform = ModelInputTransform.letterbox(
            cropLeftPx = 10,
            cropTopPx = 20,
            cropWidthPx = 4,
            cropHeightPx = 3,
            rotationDegrees = 90,
            inputWidthPx = 16,
        )

        assertBufferPixel(transform, x = 0, y = 0, expectedX = 10, expectedY = 22)
        assertBufferPixel(transform, x = 2, y = 0, expectedX = 10, expectedY = 20)
        assertBufferPixel(transform, x = 0, y = 3, expectedX = 13, expectedY = 22)
        assertBufferPixel(transform, x = 2, y = 3, expectedX = 13, expectedY = 20)
    }

    @Test
    fun `two hundred seventy degree rotation maps oriented corners through non-zero crop origin`() {
        val transform = ModelInputTransform.letterbox(
            cropLeftPx = 10,
            cropTopPx = 20,
            cropWidthPx = 4,
            cropHeightPx = 3,
            rotationDegrees = 270,
            inputWidthPx = 16,
        )

        assertBufferPixel(transform, x = 0, y = 0, expectedX = 13, expectedY = 20)
        assertBufferPixel(transform, x = 2, y = 0, expectedX = 13, expectedY = 22)
        assertBufferPixel(transform, x = 0, y = 3, expectedX = 10, expectedY = 20)
        assertBufferPixel(transform, x = 2, y = 3, expectedX = 10, expectedY = 22)
    }

    @Test
    fun `padding-only detection is rejected and partial padding is clipped`() {
        val transform = transform(cropWidth = 1920, cropHeight = 1080)

        assertNull(
            transform.modelToSourceNormalized(
                DetectionBounds(left = 0.2f, top = 0.05f, right = 0.8f, bottom = 0.15f),
            ),
        )

        val clipped = transform.modelToSourceNormalized(
            DetectionBounds(left = 0.25f, top = 0.1f, right = 0.75f, bottom = 0.5f),
        )
        requireNotNull(clipped)
        assertBounds(clipped, 0.25f, 0f, 0.75f, 0.5f)
    }

    @Test
    fun `odd letterbox remainder is represented on trailing edge`() {
        val transform = transform(cropWidth = 1000, cropHeight = 333)

        assertEquals(640, transform.contentWidthPx)
        assertEquals(213, transform.contentHeightPx)
        assertEquals(213, transform.paddingTopPx)
        assertEquals(214, transform.paddingBottomPx)

        val source = transform.modelToSourceNormalized(
            DetectionBounds(
                left = 0f,
                top = 213f / 640f,
                right = 1f,
                bottom = 426f / 640f,
            ),
        )
        requireNotNull(source)
        assertBounds(source, 0f, 0f, 1f, 1f)
    }

    @Test
    fun `detector mapping uses transform and keeps legacy frames compatible`() {
        val transform = transform(cropWidth = 1920, cropHeight = 1080)
        val mapped = mapModelBoundsToSource(
            DetectionBounds(left = 0.25f, top = 0.359375f, right = 0.75f, bottom = 0.640625f),
            transform,
        )
        requireNotNull(mapped)
        assertBounds(mapped, 0.25f, 0.25f, 0.75f, 0.75f)

        val legacy = mapModelBoundsToSource(
            DetectionBounds(left = -0.1f, top = 0.2f, right = 1.1f, bottom = 0.8f),
            inputTransform = null,
        )
        requireNotNull(legacy)
        assertBounds(legacy, 0f, 0.2f, 1f, 0.8f)
    }

    private fun transform(
        cropWidth: Int,
        cropHeight: Int,
        rotationDegrees: Int = 0,
    ) = ModelInputTransform.letterbox(
        cropLeftPx = 0,
        cropTopPx = 0,
        cropWidthPx = cropWidth,
        cropHeightPx = cropHeight,
        rotationDegrees = rotationDegrees,
        inputWidthPx = 640,
    )

    private fun assertBounds(
        actual: DetectionBounds,
        left: Float,
        top: Float,
        right: Float,
        bottom: Float,
    ) {
        assertEquals(left, actual.left, EPSILON)
        assertEquals(top, actual.top, EPSILON)
        assertEquals(right, actual.right, EPSILON)
        assertEquals(bottom, actual.bottom, EPSILON)
    }

    private fun assertBufferPixel(
        transform: ModelInputTransform,
        x: Int,
        y: Int,
        expectedX: Int,
        expectedY: Int,
    ) {
        assertEquals(expectedX, transform.orientedToBufferX(x, y))
        assertEquals(expectedY, transform.orientedToBufferY(x, y))
    }

    private companion object {
        const val EPSILON = 0.0001f
    }
}

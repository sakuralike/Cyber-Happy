package com.cyberfish.app.trigger

import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.DetectionBounds
import com.cyberfish.app.inference.DetectionSizeRatios
import com.cyberfish.app.inference.TrackedDetection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeatureCalculatorTest {
    @Test
    fun `first observed frame establishes center and bottom baselines`() {
        val snapshot = FeatureCalculator(frameHeightPx = 100f).update(
            trackedDetection = tracked(
                top = 0.2f,
                bottom = 0.4f,
                smoothedWidth = 0.2f,
                smoothedHeight = 0.2f,
                smoothedArea = 0.04f,
            ),
            timestampMillis = 0L,
        )!!

        assertEquals(0f, snapshot.verticalDisplacementPx, DELTA)
        assertEquals(0f, snapshot.bottomDisplacementPx, DELTA)
        assertEquals(0.2f, snapshot.bboxWidth, DELTA)
        assertEquals(0.2f, snapshot.bboxHeight, DELTA)
        assertEquals(0.04f, snapshot.bboxArea, DELTA)
        assertEquals(1f, snapshot.bboxHeightRatioFromBaseline, DELTA)
    }

    @Test
    fun `later observed frame reports filtered bottom displacement and tracked size`() {
        val calculator = FeatureCalculator(frameHeightPx = 100f)
        calculator.update(tracked(top = 0.2f, bottom = 0.4f), timestampMillis = 0L)

        val snapshot = calculator.update(
            trackedDetection = tracked(
                top = 0.3f,
                bottom = 0.55f,
                smoothedWidth = 0.25f,
                smoothedHeight = 0.25f,
                smoothedArea = 0.0625f,
                widthRatio = 1.25f,
                heightRatio = 1.5f,
                areaRatio = 1.875f,
                timestampMillis = 200L,
            ),
            timestampMillis = 200L,
        )!!

        assertTrue(snapshot.verticalDisplacementPx > 0f)
        assertTrue(snapshot.bottomDisplacementPx > snapshot.verticalDisplacementPx)
        assertEquals(0.25f, snapshot.bboxWidth, DELTA)
        assertEquals(0.25f, snapshot.bboxHeight, DELTA)
        assertEquals(0.0625f, snapshot.bboxArea, DELTA)
        assertEquals(1.25f, snapshot.bboxWidthRatioFromBaseline, DELTA)
        assertEquals(1.5f, snapshot.bboxHeightRatioFromBaseline, DELTA)
        assertEquals(1.875f, snapshot.bboxAreaRatioFromBaseline, DELTA)

        calculator.reset()
        val resetSnapshot = calculator.update(
            trackedDetection = tracked(top = 0.3f, bottom = 0.55f, timestampMillis = 300L),
            timestampMillis = 300L,
        )!!
        assertEquals(0f, resetSnapshot.verticalDisplacementPx, DELTA)
        assertEquals(0f, resetSnapshot.bottomDisplacementPx, DELTA)
    }

    @Test
    fun `held frame does not advance filters velocity dimensions or timestamp`() {
        val calculator = FeatureCalculator(frameHeightPx = 100f)
        val control = FeatureCalculator(frameHeightPx = 100f)
        val first = tracked(top = 0.2f, bottom = 0.4f)
        calculator.update(first, timestampMillis = 0L)
        control.update(first, timestampMillis = 0L)

        assertNull(
            calculator.update(
                trackedDetection = tracked(
                    top = 0.6f,
                    bottom = 0.9f,
                    smoothedWidth = 0.7f,
                    smoothedHeight = 0.3f,
                    smoothedArea = 0.21f,
                    isObserved = false,
                    timestampMillis = 100L,
                ),
                timestampMillis = 100L,
            ),
        )

        val resumed = tracked(
            top = 0.3f,
            bottom = 0.55f,
            smoothedWidth = 0.25f,
            smoothedHeight = 0.25f,
            smoothedArea = 0.0625f,
            timestampMillis = 200L,
        )
        val actual = calculator.update(resumed, timestampMillis = 200L)!!
        val expected = control.update(resumed, timestampMillis = 200L)!!

        assertEquals(expected.verticalDisplacementPx, actual.verticalDisplacementPx, DELTA)
        assertEquals(expected.bottomDisplacementPx, actual.bottomDisplacementPx, DELTA)
        assertEquals(expected.verticalVelocityPxPerSecond, actual.verticalVelocityPxPerSecond, DELTA)
        assertEquals(expected.bboxWidth, actual.bboxWidth, DELTA)
        assertEquals(expected.bboxHeight, actual.bboxHeight, DELTA)
        assertEquals(expected.bboxArea, actual.bboxArea, DELTA)
    }

    private fun tracked(
        top: Float,
        bottom: Float,
        smoothedWidth: Float = 0.2f,
        smoothedHeight: Float = bottom - top,
        smoothedArea: Float = smoothedWidth * smoothedHeight,
        widthRatio: Float = 1f,
        heightRatio: Float = 1f,
        areaRatio: Float = 1f,
        isObserved: Boolean = true,
        timestampMillis: Long = 0L,
    ): TrackedDetection = TrackedDetection(
        trackId = 1L,
        detection = Detection(
            bounds = DetectionBounds(
                left = 0.4f,
                top = top,
                right = 0.6f,
                bottom = bottom,
            ),
            confidence = 0.9f,
            motionFrequencyHz = 3.6f,
        ),
        timestampMillis = timestampMillis,
        smoothedWidth = smoothedWidth,
        smoothedHeight = smoothedHeight,
        smoothedArea = smoothedArea,
        sizeRatios = DetectionSizeRatios(
            widthRatioFromBaseline = widthRatio,
            heightRatioFromBaseline = heightRatio,
            areaRatioFromBaseline = areaRatio,
        ),
        isObserved = isObserved,
        missingDurationMillis = if (isObserved) 0L else timestampMillis,
    )

    private companion object {
        const val DELTA = 0.0001f
    }
}

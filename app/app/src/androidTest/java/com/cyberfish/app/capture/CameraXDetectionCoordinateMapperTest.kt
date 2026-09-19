package com.cyberfish.app.capture

import android.graphics.Matrix
import android.graphics.RectF
import android.util.Size
import androidx.annotation.OptIn
import androidx.camera.view.TransformExperimental
import androidx.camera.view.transform.OutputTransform
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.DetectionBounds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@OptIn(markerClass = [TransformExperimental::class])
class CameraXDetectionCoordinateMapperTest {
    @Test
    fun mapsSourceDetectionIntoPreviewPixels() {
        val source = CameraXFrameTransform(
            outputTransform = outputTransform(width = 100, height = 200),
            cropWidthPx = 100,
            cropHeightPx = 200,
            rotationDegrees = 0,
        )
        val mapped = CameraXDetectionCoordinateMapper().map(
            detection = Detection(
                bounds = DetectionBounds(left = 0.25f, top = 0.25f, right = 0.75f, bottom = 0.75f),
                confidence = 0.9f,
            ),
            source = source,
            target = outputTransform(width = 200, height = 400),
            previewWidthPx = 200f,
            previewHeightPx = 400f,
        )

        assertNotNull(mapped)
        requireNotNull(mapped)
        assertEquals(50f, mapped.boundsInPreview.left, EPSILON)
        assertEquals(100f, mapped.boundsInPreview.top, EPSILON)
        assertEquals(150f, mapped.boundsInPreview.right, EPSILON)
        assertEquals(300f, mapped.boundsInPreview.bottom, EPSILON)
        assertEquals(100f, mapped.widthPx, EPSILON)
        assertEquals(200f, mapped.heightPx, EPSILON)
    }

    @Test
    fun mapsRotatedDetectionBackToRawCameraCoordinatesBeforePreviewTransform() {
        val source = CameraXFrameTransform(
            outputTransform = outputTransform(width = 100, height = 200),
            cropWidthPx = 100,
            cropHeightPx = 200,
            rotationDegrees = 90,
        )
        val mapped = CameraXDetectionCoordinateMapper().map(
            detection = Detection(
                bounds = DetectionBounds(left = 0f, top = 0f, right = 1f, bottom = 1f),
                confidence = 0.9f,
            ),
            source = source,
            target = outputTransform(width = 100, height = 200),
            previewWidthPx = 100f,
            previewHeightPx = 200f,
        )

        assertNotNull(mapped)
        requireNotNull(mapped)
        assertEquals(0f, mapped.boundsInPreview.left, EPSILON)
        assertEquals(0f, mapped.boundsInPreview.top, EPSILON)
        assertEquals(100f, mapped.boundsInPreview.right, EPSILON)
        assertEquals(200f, mapped.boundsInPreview.bottom, EPSILON)
    }

    @Test
    fun mapsAsymmetricNinetyDegreeBoxBackToRawCoordinates() {
        val source = CameraXFrameTransform(
            outputTransform = outputTransform(width = 100, height = 200),
            cropWidthPx = 100,
            cropHeightPx = 200,
            rotationDegrees = 90,
        )
        val mapped = CameraXDetectionCoordinateMapper().map(
            detection = Detection(
                bounds = DetectionBounds(left = 0.1f, top = 0.2f, right = 0.3f, bottom = 0.6f),
                confidence = 0.9f,
            ),
            source = source,
            target = outputTransform(width = 100, height = 200),
            previewWidthPx = 100f,
            previewHeightPx = 200f,
        )

        assertNotNull(mapped)
        requireNotNull(mapped)
        assertEquals(20f, mapped.boundsInPreview.left, EPSILON)
        assertEquals(140f, mapped.boundsInPreview.top, EPSILON)
        assertEquals(60f, mapped.boundsInPreview.right, EPSILON)
        assertEquals(180f, mapped.boundsInPreview.bottom, EPSILON)
    }

    @Test
    fun mapsAsymmetricTwoHundredSeventyDegreeBoxBackToRawCoordinates() {
        val source = CameraXFrameTransform(
            outputTransform = outputTransform(width = 100, height = 200),
            cropWidthPx = 100,
            cropHeightPx = 200,
            rotationDegrees = 270,
        )
        val mapped = CameraXDetectionCoordinateMapper().map(
            detection = Detection(
                bounds = DetectionBounds(left = 0.1f, top = 0.2f, right = 0.3f, bottom = 0.6f),
                confidence = 0.9f,
            ),
            source = source,
            target = outputTransform(width = 100, height = 200),
            previewWidthPx = 100f,
            previewHeightPx = 200f,
        )

        assertNotNull(mapped)
        requireNotNull(mapped)
        assertEquals(40f, mapped.boundsInPreview.left, EPSILON)
        assertEquals(20f, mapped.boundsInPreview.top, EPSILON)
        assertEquals(80f, mapped.boundsInPreview.right, EPSILON)
        assertEquals(60f, mapped.boundsInPreview.bottom, EPSILON)
    }

    private fun outputTransform(width: Int, height: Int): OutputTransform {
        val matrix = Matrix().apply {
            setRectToRect(
                RectF(-1f, -1f, 1f, 1f),
                RectF(0f, 0f, width.toFloat(), height.toFloat()),
                Matrix.ScaleToFit.FILL,
            )
        }
        return OutputTransform(matrix, Size(width, height))
    }

    private companion object {
        const val EPSILON = 0.001f
    }
}

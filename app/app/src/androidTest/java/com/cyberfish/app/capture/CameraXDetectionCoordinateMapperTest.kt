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

    @Test
    fun keepsAnOrientedVerticalBoxVerticalWithCameraXRotationTransform() {
        val sourceMatrix = Matrix().apply {
            setValues(
                floatArrayOf(
                    0f, -240f, 240f,
                    168f, 0f, 168f,
                    0f, 0f, 1f,
                ),
            )
        }
        val targetMatrix = Matrix().apply {
            setRectToRect(
                RectF(0f, 0f, 480f, 336f),
                RectF(0f, 0f, 1224f, 858f),
                Matrix.ScaleToFit.FILL,
            )
        }
        val source = CameraXFrameTransform(
            outputTransform = OutputTransform(sourceMatrix, Size(480, 336)),
            cropWidthPx = 336,
            cropHeightPx = 480,
            rotationDegrees = 90,
        )
        val mapped = CameraXDetectionCoordinateMapper().map(
            detection = Detection(
                bounds = DetectionBounds(left = 0.56f, top = 0.45f, right = 0.58f, bottom = 0.84f),
                confidence = 0.9f,
            ),
            source = source,
            target = OutputTransform(targetMatrix, Size(1224, 858)),
            previewWidthPx = 1224f,
            previewHeightPx = 858f,
        )

        requireNotNull(mapped)
        assertEquals(24f, mapped.widthPx, 2f)
        assertEquals(333f, mapped.heightPx, 4f)
    }

    @Test
    fun previewMappingRoundTripsForAllRotations() {
        val mapper = CameraXDetectionCoordinateMapper()
        val expected = DetectionBounds(left = 0.1f, top = 0.2f, right = 0.3f, bottom = 0.6f)

        listOf(0, 90, 180, 270).forEach { rotation ->
            val source = CameraXFrameTransform(
                outputTransform = outputTransform(width = 100, height = 200),
                cropWidthPx = 100,
                cropHeightPx = 200,
                rotationDegrees = rotation,
            )
            val mapped = mapper.map(
                detection = Detection(bounds = expected, confidence = 0.9f),
                source = source,
                target = outputTransform(width = 200, height = 400),
                previewWidthPx = 200f,
                previewHeightPx = 400f,
            )
            requireNotNull(mapped)
            val roundTripped = mapper.mapPreviewToSource(
                boundsInPreview = mapped.boundsInPreview,
                source = source,
                target = outputTransform(width = 200, height = 400),
                previewWidthPx = 200f,
                previewHeightPx = 400f,
            )
            requireNotNull(roundTripped)
            assertEquals(expected.left, roundTripped.left, ROUND_TRIP_EPSILON)
            assertEquals(expected.top, roundTripped.top, ROUND_TRIP_EPSILON)
            assertEquals(expected.right, roundTripped.right, ROUND_TRIP_EPSILON)
            assertEquals(expected.bottom, roundTripped.bottom, ROUND_TRIP_EPSILON)
        }
    }

    @Test
    fun inverseMappingClipsPreviewSelectionToVisibleSurface() {
        val mapper = CameraXDetectionCoordinateMapper()
        val source = CameraXFrameTransform(
            outputTransform = outputTransform(width = 100, height = 200),
            cropWidthPx = 100,
            cropHeightPx = 200,
            rotationDegrees = 0,
        )

        val mapped = mapper.mapPreviewToSource(
            boundsInPreview = PreviewRect(left = -20f, top = -10f, right = 100f, bottom = 220f),
            source = source,
            target = outputTransform(width = 100, height = 200),
            previewWidthPx = 100f,
            previewHeightPx = 200f,
        )

        requireNotNull(mapped)
        assertEquals(0f, mapped.left, EPSILON)
        assertEquals(0f, mapped.top, EPSILON)
        assertEquals(1f, mapped.right, EPSILON)
        assertEquals(1f, mapped.bottom, EPSILON)
    }

    @Test
    fun inverseMappingHandlesCenterCropVisibleSourceWindow() {
        val mapper = CameraXDetectionCoordinateMapper()
        val source = CameraXFrameTransform(
            outputTransform = outputTransform(width = 100, height = 200),
            cropWidthPx = 100,
            cropHeightPx = 200,
            rotationDegrees = 0,
        )
        val target = centerCropOutputTransform(width = 200, height = 200)

        val mapped = mapper.mapPreviewToSource(
            boundsInPreview = PreviewRect(left = 0f, top = 0f, right = 200f, bottom = 200f),
            source = source,
            target = target,
            previewWidthPx = 200f,
            previewHeightPx = 200f,
        )

        requireNotNull(mapped)
        assertEquals(0f, mapped.left, EPSILON)
        assertEquals(0.25f, mapped.top, EPSILON)
        assertEquals(1f, mapped.right, EPSILON)
        assertEquals(0.75f, mapped.bottom, EPSILON)
    }

    @Test
    fun inverseMappingRejectsInvalidSelectionOrGeometry() {
        val mapper = CameraXDetectionCoordinateMapper()
        val source = CameraXFrameTransform(
            outputTransform = outputTransform(width = 100, height = 200),
            cropWidthPx = 100,
            cropHeightPx = 200,
            rotationDegrees = 0,
        )
        val target = outputTransform(width = 100, height = 200)

        assertEquals(
            null,
            mapper.mapPreviewToSource(
                boundsInPreview = PreviewRect(Float.NaN, 0f, 1f, 1f),
                source = source,
                target = target,
                previewWidthPx = 100f,
                previewHeightPx = 200f,
            ),
        )
        assertEquals(
            null,
            mapper.mapPreviewToSource(
                boundsInPreview = PreviewRect(0f, 0f, 1f, 1f),
                source = source.copy(rotationDegrees = 45),
                target = target,
                previewWidthPx = 100f,
                previewHeightPx = 200f,
            ),
        )
        assertEquals(
            null,
            mapper.mapPreviewToSource(
                boundsInPreview = PreviewRect(0f, 0f, 1f, 1f),
                source = source,
                target = target,
                previewWidthPx = 0f,
                previewHeightPx = 200f,
            ),
        )
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

    private fun centerCropOutputTransform(width: Int, height: Int): OutputTransform {
        val matrix = Matrix().apply {
            setRectToRect(
                RectF(-1f, -1f, 1f, 1f),
                RectF(0f, -100f, width.toFloat(), 300f),
                Matrix.ScaleToFit.FILL,
            )
        }
        return OutputTransform(matrix, Size(width, height))
    }

    private companion object {
        const val EPSILON = 0.001f
        const val ROUND_TRIP_EPSILON = 0.005f
    }
}

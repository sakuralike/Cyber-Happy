package com.cyberfish.app.capture

import android.graphics.RectF
import androidx.annotation.OptIn
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.camera.view.TransformExperimental
import androidx.camera.view.transform.CoordinateTransform
import androidx.camera.view.transform.ImageProxyTransformFactory
import androidx.camera.view.transform.OutputTransform
import com.cyberfish.app.inference.Detection

@OptIn(markerClass = [TransformExperimental::class])
internal data class CameraXFrameTransform(
    val outputTransform: OutputTransform,
    val cropWidthPx: Int,
    val cropHeightPx: Int,
    val rotationDegrees: Int,
) {
    val orientedWidthPx: Int
        get() = if (rotationDegrees == 90 || rotationDegrees == 270) cropHeightPx else cropWidthPx

    val orientedHeightPx: Int
        get() = if (rotationDegrees == 90 || rotationDegrees == 270) cropWidthPx else cropHeightPx
}

@OptIn(markerClass = [TransformExperimental::class])
internal class CameraXDetectionCoordinateMapper {
    private val transformFactory = ImageProxyTransformFactory().apply {
        setUsingCropRect(true)
        setUsingRotationDegrees(true)
    }

    fun capture(image: ImageProxy): CameraXFrameTransform {
        val rotationDegrees = Math.floorMod(image.imageInfo.rotationDegrees, 360)
        val cropRect = image.cropRect
        return CameraXFrameTransform(
            outputTransform = transformFactory.getOutputTransform(image),
            cropWidthPx = cropRect.width(),
            cropHeightPx = cropRect.height(),
            rotationDegrees = rotationDegrees,
        )
    }

    fun map(
        detection: Detection?,
        source: CameraXFrameTransform,
        previewView: PreviewView,
    ): DisplayDetection? {
        val target = previewView.outputTransform ?: return null
        return map(
            detection = detection,
            source = source,
            target = target,
            previewWidthPx = previewView.width.toFloat(),
            previewHeightPx = previewView.height.toFloat(),
        )
    }

    fun map(
        detection: Detection?,
        source: CameraXFrameTransform,
        target: OutputTransform,
        previewWidthPx: Float,
        previewHeightPx: Float,
    ): DisplayDetection? {
        if (detection == null || !detection.confidence.isFinite()) return null
        if (source.cropWidthPx <= 0 || source.cropHeightPx <= 0) return null
        if (!previewWidthPx.isFinite() || !previewHeightPx.isFinite() || previewWidthPx <= 0f || previewHeightPx <= 0f) {
            return null
        }

        val bounds = detection.bounds
        if (!bounds.left.isFinite() || !bounds.top.isFinite() ||
            !bounds.right.isFinite() || !bounds.bottom.isFinite()
        ) {
            return null
        }
        val left = bounds.left.coerceIn(0f, 1f)
        val top = bounds.top.coerceIn(0f, 1f)
        val right = bounds.right.coerceIn(0f, 1f)
        val bottom = bounds.bottom.coerceIn(0f, 1f)
        if (right <= left || bottom <= top) return null

        val rawBounds = orientedBoundsToRawCrop(
            left,
            top,
            right,
            bottom,
            source.cropWidthPx,
            source.cropHeightPx,
            source.rotationDegrees,
        ) ?: return null
        val mapped = RectF(
            rawBounds.left * source.cropWidthPx,
            rawBounds.top * source.cropHeightPx,
            rawBounds.right * source.cropWidthPx,
            rawBounds.bottom * source.cropHeightPx,
        )
        runCatching {
            CoordinateTransform(source.outputTransform, target).mapRect(mapped)
        }.getOrElse { return null }
        if (!mapped.left.isFinite() || !mapped.top.isFinite() ||
            !mapped.right.isFinite() || !mapped.bottom.isFinite()
        ) {
            return null
        }

        val clipped = PreviewRect(mapped.left, mapped.top, mapped.right, mapped.bottom)
            .clipTo(previewWidthPx, previewHeightPx)
        if (clipped.isEmpty) return null
        return DisplayDetection(
            boundsInPreview = clipped,
            confidence = detection.confidence,
        )
    }

}

internal fun orientedBoundsToRawCrop(
    left: Float,
    top: Float,
    right: Float,
    bottom: Float,
    cropWidth: Int,
    cropHeight: Int,
    rotationDegrees: Int,
): PreviewRect? {
    if (cropWidth <= 0 || cropHeight <= 0) return null
    val orientedWidth = if (rotationDegrees == 90 || rotationDegrees == 270) cropHeight else cropWidth
    val orientedHeight = if (rotationDegrees == 90 || rotationDegrees == 270) cropWidth else cropHeight
    val points = arrayOf(
        floatArrayOf(left * orientedWidth, top * orientedHeight),
        floatArrayOf(right * orientedWidth, top * orientedHeight),
        floatArrayOf(left * orientedWidth, bottom * orientedHeight),
        floatArrayOf(right * orientedWidth, bottom * orientedHeight),
    )
    points.forEach { point ->
        val x = point[0]
        val y = point[1]
        point[0] = when (rotationDegrees) {
            0 -> x
            90 -> y
            180 -> cropWidth - x
            270 -> cropWidth - y
            else -> return null
        }
        point[1] = when (rotationDegrees) {
            0 -> y
            90 -> cropHeight - x
            180 -> cropHeight - y
            270 -> x
            else -> return null
        }
    }
    val minX = points.minOf { it[0] }.coerceIn(0f, cropWidth.toFloat())
    val minY = points.minOf { it[1] }.coerceIn(0f, cropHeight.toFloat())
    val maxX = points.maxOf { it[0] }.coerceIn(0f, cropWidth.toFloat())
    val maxY = points.maxOf { it[1] }.coerceIn(0f, cropHeight.toFloat())
    if (maxX <= minX || maxY <= minY) return null
    return PreviewRect(minX / cropWidth, minY / cropHeight, maxX / cropWidth, maxY / cropHeight)
}

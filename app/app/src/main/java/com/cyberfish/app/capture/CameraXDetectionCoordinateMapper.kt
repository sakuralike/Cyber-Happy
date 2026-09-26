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
import com.cyberfish.app.inference.DetectionBounds

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
        if (source.rotationDegrees !in VALID_ROTATIONS) return null
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

        // ImageProxyTransformFactory already includes crop and rotation. The detector bounds are
        // in the oriented coordinates produced by the same frame transform, so rotating them to
        // raw crop coordinates here would apply the device rotation twice.
        val orientedWidth = source.orientedWidthPx.toFloat()
        val orientedHeight = source.orientedHeightPx.toFloat()
        if (orientedWidth <= 0f || orientedHeight <= 0f) return null
        val mapped = RectF(
            left * orientedWidth,
            top * orientedHeight,
            right * orientedWidth,
            bottom * orientedHeight,
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

    fun mapPreviewToSource(
        boundsInPreview: PreviewRect?,
        source: CameraXFrameTransform,
        previewView: PreviewView,
    ): DetectionBounds? {
        val target = previewView.outputTransform ?: return null
        return mapPreviewToSource(
            boundsInPreview = boundsInPreview,
            source = source,
            target = target,
            previewWidthPx = previewView.width.toFloat(),
            previewHeightPx = previewView.height.toFloat(),
        )
    }

    fun mapPreviewToSource(
        boundsInPreview: PreviewRect?,
        source: CameraXFrameTransform,
        target: OutputTransform,
        previewWidthPx: Float,
        previewHeightPx: Float,
    ): DetectionBounds? {
        if (boundsInPreview == null) return null
        if (source.cropWidthPx <= 0 || source.cropHeightPx <= 0) return null
        if (source.rotationDegrees !in VALID_ROTATIONS) return null
        if (!previewWidthPx.isFinite() || !previewHeightPx.isFinite() ||
            previewWidthPx <= 0f || previewHeightPx <= 0f
        ) {
            return null
        }
        if (!boundsInPreview.isFinite()) return null

        val clippedPreview = boundsInPreview.clipTo(previewWidthPx, previewHeightPx)
        if (clippedPreview.isEmpty) return null
        val mapped = RectF(
            clippedPreview.left,
            clippedPreview.top,
            clippedPreview.right,
            clippedPreview.bottom,
        )
        runCatching {
            CoordinateTransform(target, source.outputTransform).mapRect(mapped)
        }.getOrElse { return null }
        if (!mapped.left.isFinite() || !mapped.top.isFinite() ||
            !mapped.right.isFinite() || !mapped.bottom.isFinite()
        ) {
            return null
        }

        val orientedWidth = source.orientedWidthPx.toFloat()
        val orientedHeight = source.orientedHeightPx.toFloat()
        if (orientedWidth <= 0f || orientedHeight <= 0f) return null
        val oriented = PreviewRect(
            left = minOf(mapped.left, mapped.right),
            top = minOf(mapped.top, mapped.bottom),
            right = maxOf(mapped.left, mapped.right),
            bottom = maxOf(mapped.top, mapped.bottom),
        ).clipTo(orientedWidth, orientedHeight)
        if (oriented.isEmpty) return null
        return DetectionBounds(
            left = oriented.left / orientedWidth,
            top = oriented.top / orientedHeight,
            right = oriented.right / orientedWidth,
            bottom = oriented.bottom / orientedHeight,
        )
    }

}

private val VALID_ROTATIONS = setOf(0, 90, 180, 270)

private fun PreviewRect.isFinite(): Boolean =
    left.isFinite() && top.isFinite() && right.isFinite() && bottom.isFinite()

internal fun orientedBoundsToRawCrop(
    left: Float,
    top: Float,
    right: Float,
    bottom: Float,
    cropWidth: Int,
    cropHeight: Int,
    rotationDegrees: Int,
): PreviewRect? {
    if (cropWidth <= 0 || cropHeight <= 0 || rotationDegrees !in VALID_ROTATIONS) return null
    if (!left.isFinite() || !top.isFinite() || !right.isFinite() || !bottom.isFinite()) return null
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
            else -> error("Unsupported rotation: $rotationDegrees")
        }
        point[1] = when (rotationDegrees) {
            0 -> y
            90 -> cropHeight - x
            180 -> cropHeight - y
            270 -> x
            else -> error("Unsupported rotation: $rotationDegrees")
        }
    }
    val minX = points.minOf { it[0] }.coerceIn(0f, cropWidth.toFloat())
    val minY = points.minOf { it[1] }.coerceIn(0f, cropHeight.toFloat())
    val maxX = points.maxOf { it[0] }.coerceIn(0f, cropWidth.toFloat())
    val maxY = points.maxOf { it[1] }.coerceIn(0f, cropHeight.toFloat())
    if (maxX <= minX || maxY <= minY) return null
    return PreviewRect(minX / cropWidth, minY / cropHeight, maxX / cropWidth, maxY / cropHeight)
}

internal fun rawCropBoundsToOriented(
    left: Float,
    top: Float,
    right: Float,
    bottom: Float,
    cropWidth: Int,
    cropHeight: Int,
    rotationDegrees: Int,
): DetectionBounds? {
    if (cropWidth <= 0 || cropHeight <= 0 || rotationDegrees !in VALID_ROTATIONS) return null
    if (!left.isFinite() || !top.isFinite() || !right.isFinite() || !bottom.isFinite()) return null

    val clippedLeft = left.coerceIn(0f, 1f)
    val clippedTop = top.coerceIn(0f, 1f)
    val clippedRight = right.coerceIn(0f, 1f)
    val clippedBottom = bottom.coerceIn(0f, 1f)
    if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return null

    val orientedWidth = if (rotationDegrees == 90 || rotationDegrees == 270) cropHeight else cropWidth
    val orientedHeight = if (rotationDegrees == 90 || rotationDegrees == 270) cropWidth else cropHeight
    val points = arrayOf(
        floatArrayOf(clippedLeft * cropWidth, clippedTop * cropHeight),
        floatArrayOf(clippedRight * cropWidth, clippedTop * cropHeight),
        floatArrayOf(clippedLeft * cropWidth, clippedBottom * cropHeight),
        floatArrayOf(clippedRight * cropWidth, clippedBottom * cropHeight),
    )
    points.forEach { point ->
        val x = point[0]
        val y = point[1]
        point[0] = when (rotationDegrees) {
            0 -> x
            90 -> cropHeight - y
            180 -> cropWidth - x
            270 -> y
            else -> error("Unsupported rotation: $rotationDegrees")
        }
        point[1] = when (rotationDegrees) {
            0 -> y
            90 -> x
            180 -> cropHeight - y
            270 -> cropWidth - x
            else -> error("Unsupported rotation: $rotationDegrees")
        }
    }
    val minX = points.minOf { it[0] }.coerceIn(0f, orientedWidth.toFloat())
    val minY = points.minOf { it[1] }.coerceIn(0f, orientedHeight.toFloat())
    val maxX = points.maxOf { it[0] }.coerceIn(0f, orientedWidth.toFloat())
    val maxY = points.maxOf { it[1] }.coerceIn(0f, orientedHeight.toFloat())
    if (maxX <= minX || maxY <= minY) return null
    return DetectionBounds(
        left = minX / orientedWidth,
        top = minY / orientedHeight,
        right = maxX / orientedWidth,
        bottom = maxY / orientedHeight,
    )
}

package com.cyberfish.app.capture

import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.DetectionBounds
import kotlin.math.max
import kotlin.math.min

/** The way the source frame is fitted into the preview surface. */
enum class PreviewScaleType {
    FIT,
    CENTER_CROP,
}

/** Dimensions used to map normalized model coordinates into a preview surface. */
data class FrameGeometry(
    val sourceWidthPx: Int,
    val sourceHeightPx: Int,
    val previewWidthPx: Float,
    val previewHeightPx: Float,
    val scaleType: PreviewScaleType = PreviewScaleType.CENTER_CROP,
) {
    init {
        require(sourceWidthPx > 0) { "sourceWidthPx must be positive" }
        require(sourceHeightPx > 0) { "sourceHeightPx must be positive" }
        require(previewWidthPx.isFinite() && previewWidthPx > 0f) {
            "previewWidthPx must be finite and positive"
        }
        require(previewHeightPx.isFinite() && previewHeightPx > 0f) {
            "previewHeightPx must be finite and positive"
        }
    }
}

/** A rectangle in preview-surface pixel coordinates. */
data class PreviewRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    val width: Float
        get() = (right - left).coerceAtLeast(0f)

    val height: Float
        get() = (bottom - top).coerceAtLeast(0f)

    val isEmpty: Boolean
        get() = width <= 0f || height <= 0f

    fun clipTo(widthPx: Float, heightPx: Float): PreviewRect = PreviewRect(
        left = left.coerceIn(0f, widthPx),
        top = top.coerceIn(0f, heightPx),
        right = right.coerceIn(0f, widthPx),
        bottom = bottom.coerceIn(0f, heightPx),
    )
}

/** Model-level input kept independent of CameraX and Compose types. */
data class ModelDetection(
    val bounds: DetectionBounds,
    val confidence: Float,
    val classId: Int = 0,
    val label: String = "fish_float",
)

/** A model detection expressed in the preview surface coordinate system. */
data class DisplayDetection(
    val boundsInPreview: PreviewRect,
    val confidence: Float,
    val classId: Int = 0,
    val label: String = "fish_float",
) {
    val widthPx: Float
        get() = boundsInPreview.width

    val heightPx: Float
        get() = boundsInPreview.height
}

/** Maps model detections without depending on Android graphics or CameraX classes. */
interface DetectionCoordinateMapper {
    fun map(detection: ModelDetection, geometry: FrameGeometry): DisplayDetection?

    fun map(detection: Detection, geometry: FrameGeometry): DisplayDetection? = map(
        ModelDetection(
            bounds = detection.bounds,
            confidence = detection.confidence,
        ),
        geometry,
    )
}

/**
 * Maps a normalized source-frame rectangle through an aspect-preserving preview transform.
 *
 * The returned dimensions describe the visible, clipped rectangle in preview pixels. This is
 * important for CENTER_CROP, where a source-frame box can be partly or entirely outside the
 * preview surface after cropping.
 */
class AspectRatioDetectionCoordinateMapper : DetectionCoordinateMapper {
    override fun map(detection: ModelDetection, geometry: FrameGeometry): DisplayDetection? {
        val bounds = detection.bounds
        if (!detection.confidence.isFinite() || !bounds.isFinite()) return null

        val normalized = bounds.clippedToUnitSquare() ?: return null
        val sourceWidth = geometry.sourceWidthPx.toFloat()
        val sourceHeight = geometry.sourceHeightPx.toFloat()
        val scaleX = geometry.previewWidthPx / sourceWidth
        val scaleY = geometry.previewHeightPx / sourceHeight
        val scale = when (geometry.scaleType) {
            PreviewScaleType.FIT -> min(scaleX, scaleY)
            PreviewScaleType.CENTER_CROP -> max(scaleX, scaleY)
        }
        val contentWidth = sourceWidth * scale
        val contentHeight = sourceHeight * scale
        val offsetX = (geometry.previewWidthPx - contentWidth) / 2f
        val offsetY = (geometry.previewHeightPx - contentHeight) / 2f

        val mapped = PreviewRect(
            left = normalized.left * sourceWidth * scale + offsetX,
            top = normalized.top * sourceHeight * scale + offsetY,
            right = normalized.right * sourceWidth * scale + offsetX,
            bottom = normalized.bottom * sourceHeight * scale + offsetY,
        ).clipTo(geometry.previewWidthPx, geometry.previewHeightPx)

        if (mapped.isEmpty) return null
        return DisplayDetection(
            boundsInPreview = mapped,
            confidence = detection.confidence,
            classId = detection.classId,
            label = detection.label,
        )
    }
}

private fun DetectionBounds.isFinite(): Boolean =
    left.isFinite() && top.isFinite() && right.isFinite() && bottom.isFinite()

private fun DetectionBounds.clippedToUnitSquare(): DetectionBounds? {
    val clipped = DetectionBounds(
        left = left.coerceIn(0f, 1f),
        top = top.coerceIn(0f, 1f),
        right = right.coerceIn(0f, 1f),
        bottom = bottom.coerceIn(0f, 1f),
    )
    return clipped.takeUnless { it.right <= it.left || it.bottom <= it.top }
}

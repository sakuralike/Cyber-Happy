package com.cyberfish.app.inference

import java.io.Closeable
import kotlin.math.min
import kotlin.math.roundToInt

data class CameraFrame(
    val width: Int,
    val height: Int,
    val timestampNanos: Long,
    val normalizedRgb: FloatArray? = null,
    val inputTransform: ModelInputTransform? = null,
)

data class DetectionBounds(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
)

data class ModelInputTransform(
    val cropLeftPx: Int,
    val cropTopPx: Int,
    val cropWidthPx: Int,
    val cropHeightPx: Int,
    val rotationDegrees: Int,
    val inputWidthPx: Int,
    val inputHeightPx: Int,
    val contentWidthPx: Int,
    val contentHeightPx: Int,
    val paddingLeftPx: Int,
    val paddingTopPx: Int,
) {
    init {
        require(cropLeftPx >= 0 && cropTopPx >= 0) { "crop origin must not be negative" }
        require(cropWidthPx > 0 && cropHeightPx > 0) { "crop size must be positive" }
        require(rotationDegrees in VALID_ROTATIONS) { "rotationDegrees must be 0, 90, 180, or 270" }
        require(inputWidthPx > 0 && inputHeightPx > 0) { "input size must be positive" }
        require(contentWidthPx in 1..inputWidthPx && contentHeightPx in 1..inputHeightPx) {
            "content size must fit inside model input"
        }
        require(paddingLeftPx >= 0 && paddingTopPx >= 0) { "padding must not be negative" }
        require(paddingLeftPx + contentWidthPx <= inputWidthPx) { "horizontal content exceeds model input" }
        require(paddingTopPx + contentHeightPx <= inputHeightPx) { "vertical content exceeds model input" }
    }

    val sourceWidthPx: Int
        get() = if (rotationDegrees == 90 || rotationDegrees == 270) cropHeightPx else cropWidthPx

    val sourceHeightPx: Int
        get() = if (rotationDegrees == 90 || rotationDegrees == 270) cropWidthPx else cropHeightPx

    val paddingRightPx: Int
        get() = inputWidthPx - paddingLeftPx - contentWidthPx

    val paddingBottomPx: Int
        get() = inputHeightPx - paddingTopPx - contentHeightPx

    val scale: Float
        get() = min(inputWidthPx.toFloat() / sourceWidthPx, inputHeightPx.toFloat() / sourceHeightPx)

    fun orientedToBufferX(x: Int, y: Int): Int {
        requireOrientedPixel(x, y)
        val cropX = when (rotationDegrees) {
            0 -> x
            90 -> y
            180 -> cropWidthPx - 1 - x
            270 -> cropWidthPx - 1 - y
            else -> error("Unsupported rotation: $rotationDegrees")
        }
        return cropLeftPx + cropX
    }

    fun orientedToBufferY(x: Int, y: Int): Int {
        requireOrientedPixel(x, y)
        val cropY = when (rotationDegrees) {
            0 -> y
            90 -> cropHeightPx - 1 - x
            180 -> cropHeightPx - 1 - y
            270 -> x
            else -> error("Unsupported rotation: $rotationDegrees")
        }
        return cropTopPx + cropY
    }

    private fun requireOrientedPixel(x: Int, y: Int) {
        require(x in 0 until sourceWidthPx && y in 0 until sourceHeightPx) {
            "oriented pixel must fit inside source"
        }
    }

    fun modelToSourceNormalized(bounds: DetectionBounds): DetectionBounds? {
        if (!bounds.isFinite()) return null

        val contentLeft = paddingLeftPx.toFloat()
        val contentTop = paddingTopPx.toFloat()
        val contentRight = contentLeft + contentWidthPx
        val contentBottom = contentTop + contentHeightPx
        val left = (bounds.left * inputWidthPx).coerceIn(contentLeft, contentRight)
        val top = (bounds.top * inputHeightPx).coerceIn(contentTop, contentBottom)
        val right = (bounds.right * inputWidthPx).coerceIn(contentLeft, contentRight)
        val bottom = (bounds.bottom * inputHeightPx).coerceIn(contentTop, contentBottom)
        if (right <= left || bottom <= top) return null

        return DetectionBounds(
            left = (left - contentLeft) / contentWidthPx,
            top = (top - contentTop) / contentHeightPx,
            right = (right - contentLeft) / contentWidthPx,
            bottom = (bottom - contentTop) / contentHeightPx,
        )
    }

    companion object {
        private val VALID_ROTATIONS = setOf(0, 90, 180, 270)

        fun letterbox(
            cropLeftPx: Int,
            cropTopPx: Int,
            cropWidthPx: Int,
            cropHeightPx: Int,
            rotationDegrees: Int,
            inputWidthPx: Int,
            inputHeightPx: Int = inputWidthPx,
        ): ModelInputTransform {
            require(rotationDegrees in VALID_ROTATIONS) { "rotationDegrees must be 0, 90, 180, or 270" }
            require(cropWidthPx > 0 && cropHeightPx > 0) { "crop size must be positive" }
            require(inputWidthPx > 0 && inputHeightPx > 0) { "input size must be positive" }

            val sourceWidth = if (rotationDegrees == 90 || rotationDegrees == 270) cropHeightPx else cropWidthPx
            val sourceHeight = if (rotationDegrees == 90 || rotationDegrees == 270) cropWidthPx else cropHeightPx
            val scale = min(inputWidthPx.toFloat() / sourceWidth, inputHeightPx.toFloat() / sourceHeight)
            val contentWidth = (sourceWidth * scale).roundToInt().coerceIn(1, inputWidthPx)
            val contentHeight = (sourceHeight * scale).roundToInt().coerceIn(1, inputHeightPx)

            return ModelInputTransform(
                cropLeftPx = cropLeftPx,
                cropTopPx = cropTopPx,
                cropWidthPx = cropWidthPx,
                cropHeightPx = cropHeightPx,
                rotationDegrees = rotationDegrees,
                inputWidthPx = inputWidthPx,
                inputHeightPx = inputHeightPx,
                contentWidthPx = contentWidth,
                contentHeightPx = contentHeight,
                paddingLeftPx = (inputWidthPx - contentWidth) / 2,
                paddingTopPx = (inputHeightPx - contentHeight) / 2,
            )
        }
    }
}

private fun DetectionBounds.isFinite(): Boolean =
    left.isFinite() && top.isFinite() && right.isFinite() && bottom.isFinite()

data class Detection(
    val bounds: DetectionBounds,
    val confidence: Float,
    val motionFrequencyHz: Float? = null,
)

interface Detector {
    val modelVersion: String
        get() = "MockDetector"

    val inputSize: Int
        get() = 640

    val requiresPixelData: Boolean
        get() = false

    fun detect(frame: CameraFrame): Detection?
}

interface CloseableDetector : Detector, Closeable

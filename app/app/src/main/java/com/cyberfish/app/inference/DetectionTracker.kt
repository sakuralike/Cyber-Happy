package com.cyberfish.app.inference

import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

interface DetectionTracker {
    fun update(detection: Detection?, timestampMillis: Long): TrackedDetection?

    fun reset()
}

data class DetectionSizeRatios(
    val widthRatioFromBaseline: Float,
    val heightRatioFromBaseline: Float,
    val areaRatioFromBaseline: Float,
) {
    val widthDeltaRatioFromBaseline: Float
        get() = widthRatioFromBaseline - 1f

    val heightDeltaRatioFromBaseline: Float
        get() = heightRatioFromBaseline - 1f

    val areaDeltaRatioFromBaseline: Float
        get() = areaRatioFromBaseline - 1f
}

data class TrackedDetection(
    val trackId: Long,
    val detection: Detection,
    val timestampMillis: Long,
    val smoothedWidth: Float,
    val smoothedHeight: Float,
    val smoothedArea: Float,
    val sizeRatios: DetectionSizeRatios,
    val isObserved: Boolean,
    val missingDurationMillis: Long,
)

class SingleDetectionTracker(
    private val minimumConfidence: Float = 0.5f,
    private val minimumIou: Float = 0.1f,
    private val maximumCenterDistance: Float = 0.15f,
    private val sizeEmaAlpha: Float = 0.25f,
    private val missingToleranceMillis: Long = 300L,
) : DetectionTracker {
    private var state: TrackState? = null
    private var nextTrackId = 1L

    init {
        require(minimumConfidence in 0f..1f) { "minimumConfidence must be between 0 and 1" }
        require(minimumIou in 0f..1f) { "minimumIou must be between 0 and 1" }
        require(maximumCenterDistance.isFinite() && maximumCenterDistance >= 0f) {
            "maximumCenterDistance must be finite and non-negative"
        }
        require(sizeEmaAlpha > 0f && sizeEmaAlpha <= 1f) { "sizeEmaAlpha must be in (0, 1]" }
        require(missingToleranceMillis >= 0L) { "missingToleranceMillis must be non-negative" }
    }

    override fun update(detection: Detection?, timestampMillis: Long): TrackedDetection? {
        val candidate = detection?.takeIf(::isUsable)
        val current = state ?: return candidate?.let { startTrack(it, timestampMillis) }
        val missingDurationMillis = (timestampMillis - current.lastObservedAtMillis).coerceAtLeast(0L)

        if (missingDurationMillis > missingToleranceMillis) {
            state = null
            return candidate?.let { startTrack(it, timestampMillis) }
        }

        if (candidate == null || !isAssociated(current.detection.bounds, candidate.bounds)) {
            return current.snapshot(
                timestampMillis = timestampMillis,
                isObserved = false,
                missingDurationMillis = missingDurationMillis,
            )
        }

        current.update(candidate, timestampMillis, sizeEmaAlpha)
        return current.snapshot(
            timestampMillis = timestampMillis,
            isObserved = true,
            missingDurationMillis = 0L,
        )
    }

    override fun reset() {
        state = null
    }

    private fun startTrack(detection: Detection, timestampMillis: Long): TrackedDetection {
        val width = detection.bounds.width
        val height = detection.bounds.height
        val track = TrackState(
            id = nextTrackId++,
            detection = detection,
            initialWidth = width,
            initialHeight = height,
            initialArea = width * height,
            smoothedWidth = width,
            smoothedHeight = height,
            smoothedArea = width * height,
            lastObservedAtMillis = timestampMillis,
        )
        state = track
        return track.snapshot(timestampMillis, isObserved = true, missingDurationMillis = 0L)
    }

    private fun isUsable(detection: Detection): Boolean {
        val bounds = detection.bounds
        return detection.confidence.isFinite() &&
            detection.confidence >= minimumConfidence &&
            bounds.left.isFinite() &&
            bounds.top.isFinite() &&
            bounds.right.isFinite() &&
            bounds.bottom.isFinite() &&
            bounds.width > 0f &&
            bounds.height > 0f
    }

    private fun isAssociated(current: DetectionBounds, candidate: DetectionBounds): Boolean =
        intersectionOverUnion(current, candidate) >= minimumIou ||
            centerDistance(current, candidate) <= maximumCenterDistance

    private data class TrackState(
        val id: Long,
        var detection: Detection,
        val initialWidth: Float,
        val initialHeight: Float,
        val initialArea: Float,
        var smoothedWidth: Float,
        var smoothedHeight: Float,
        var smoothedArea: Float,
        var lastObservedAtMillis: Long,
    ) {
        fun update(detection: Detection, timestampMillis: Long, alpha: Float) {
            val width = detection.bounds.width
            val height = detection.bounds.height
            this.detection = detection
            smoothedWidth = ema(smoothedWidth, width, alpha)
            smoothedHeight = ema(smoothedHeight, height, alpha)
            smoothedArea = ema(smoothedArea, width * height, alpha)
            lastObservedAtMillis = timestampMillis
        }

        fun snapshot(
            timestampMillis: Long,
            isObserved: Boolean,
            missingDurationMillis: Long,
        ): TrackedDetection = TrackedDetection(
            trackId = id,
            detection = detection,
            timestampMillis = timestampMillis,
            smoothedWidth = smoothedWidth,
            smoothedHeight = smoothedHeight,
            smoothedArea = smoothedArea,
            sizeRatios = DetectionSizeRatios(
                widthRatioFromBaseline = smoothedWidth / initialWidth,
                heightRatioFromBaseline = smoothedHeight / initialHeight,
                areaRatioFromBaseline = smoothedArea / initialArea,
            ),
            isObserved = isObserved,
            missingDurationMillis = missingDurationMillis,
        )
    }
}

private val DetectionBounds.width: Float
    get() = right - left

private val DetectionBounds.height: Float
    get() = bottom - top

private fun intersectionOverUnion(first: DetectionBounds, second: DetectionBounds): Float {
    val intersectionWidth = (min(first.right, second.right) - max(first.left, second.left)).coerceAtLeast(0f)
    val intersectionHeight = (min(first.bottom, second.bottom) - max(first.top, second.top)).coerceAtLeast(0f)
    val intersectionArea = intersectionWidth * intersectionHeight
    val unionArea = first.width * first.height + second.width * second.height - intersectionArea
    return if (unionArea > 0f) intersectionArea / unionArea else 0f
}

private fun centerDistance(first: DetectionBounds, second: DetectionBounds): Float {
    val horizontalDistance = (first.left + first.right - second.left - second.right) / 2f
    val verticalDistance = (first.top + first.bottom - second.top - second.bottom) / 2f
    return hypot(horizontalDistance, verticalDistance)
}

private fun ema(previous: Float, current: Float, alpha: Float): Float =
    alpha * current + (1f - alpha) * previous

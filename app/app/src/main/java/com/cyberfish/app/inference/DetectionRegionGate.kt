package com.cyberfish.app.inference

import kotlin.math.max
import kotlin.math.min

object DetectionRegionGate {
    const val DEFAULT_MIN_INTERSECTION_RATIO = 0.5f

    fun accepts(
        detection: Detection?,
        region: DetectionBounds?,
        minIntersectionRatio: Float = DEFAULT_MIN_INTERSECTION_RATIO,
    ): Boolean {
        if (detection == null) return false
        if (region == null) return true
        require(minIntersectionRatio in 0f..1f) { "minIntersectionRatio must be between 0 and 1" }
        if (!region.isValid() || !detection.bounds.isValid()) return false

        val bounds = detection.bounds
        val centerX = (bounds.left + bounds.right) / 2f
        val centerY = (bounds.top + bounds.bottom) / 2f
        if (centerX !in region.left..region.right || centerY !in region.top..region.bottom) return false

        val intersectionWidth = (min(bounds.right, region.right) - max(bounds.left, region.left)).coerceAtLeast(0f)
        val intersectionHeight = (min(bounds.bottom, region.bottom) - max(bounds.top, region.top)).coerceAtLeast(0f)
        val intersectionArea = intersectionWidth * intersectionHeight
        val detectionArea = (bounds.right - bounds.left) * (bounds.bottom - bounds.top)
        return detectionArea > 0f && intersectionArea / detectionArea >= minIntersectionRatio
    }

    fun selectBest(
        candidates: Iterable<Detection>,
        region: DetectionBounds?,
        minIntersectionRatio: Float = DEFAULT_MIN_INTERSECTION_RATIO,
    ): Detection? = candidates
        .asSequence()
        .filter { accepts(it, region, minIntersectionRatio) }
        .maxByOrNull { it.confidence }

    private fun DetectionBounds.isValid(): Boolean =
        left.isFinite() && top.isFinite() && right.isFinite() && bottom.isFinite() &&
            left in 0f..1f && top in 0f..1f && right in 0f..1f && bottom in 0f..1f &&
            left < right && top < bottom
}

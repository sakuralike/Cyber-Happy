package com.cyberfish.app.trigger

import com.cyberfish.app.inference.Detection
import java.util.ArrayDeque
import kotlin.math.abs

data class FeatureSnapshot(
    val timestampMillis: Long,
    val verticalDisplacementPx: Float,
    val verticalVelocityPxPerSecond: Float,
    val jitterHz: Float,
    val confidence: Float,
)

class FeatureCalculator(
    private val frameHeightPx: Float = 264f,
) {
    private val filter = KalmanFilter1D()
    private val accelerationSamples = ArrayDeque<Pair<Long, Float>>()
    private var baselineY: Float? = null
    private var lastFilteredY: Float? = null
    private var lastVelocity = 0f
    private var lastTimestampMillis: Long? = null
    private var missingSinceMillis: Long? = null

    fun update(detection: Detection?, timestampMillis: Long): FeatureSnapshot? {
        if (detection == null) {
            missingSinceMillis = missingSinceMillis ?: timestampMillis
            if (timestampMillis - (missingSinceMillis ?: timestampMillis) >= RESET_AFTER_MISSING_MILLIS) reset()
            return null
        }

        missingSinceMillis = null
        val centerY = ((detection.bounds.top + detection.bounds.bottom) / 2f) * frameHeightPx
        val lastTimestamp = lastTimestampMillis
        val deltaSeconds = if (lastTimestamp == null) DEFAULT_DELTA_SECONDS else
            ((timestampMillis - lastTimestamp).coerceAtLeast(1L) / 1000f).coerceAtMost(MAX_DELTA_SECONDS)
        val filteredY = filter.update(centerY, deltaSeconds)
        val baseline = baselineY ?: filteredY.also { baselineY = it }
        val previousY = lastFilteredY
        val velocity = if (previousY == null) 0f else (filteredY - previousY) / deltaSeconds
        val acceleration = velocity - lastVelocity
        updateAccelerationHistory(timestampMillis, acceleration)
        lastFilteredY = filteredY
        lastVelocity = velocity
        lastTimestampMillis = timestampMillis

        return FeatureSnapshot(
            timestampMillis = timestampMillis,
            verticalDisplacementPx = filteredY - baseline,
            verticalVelocityPxPerSecond = velocity,
            jitterHz = detection.motionFrequencyHz ?: estimateJitterHz(timestampMillis),
            confidence = detection.confidence,
        )
    }

    fun reset() {
        filter.reset()
        accelerationSamples.clear()
        baselineY = null
        lastFilteredY = null
        lastVelocity = 0f
        lastTimestampMillis = null
        missingSinceMillis = null
    }

    private fun updateAccelerationHistory(timestampMillis: Long, acceleration: Float) {
        accelerationSamples.addLast(timestampMillis to acceleration)
        while (accelerationSamples.isNotEmpty() && timestampMillis - accelerationSamples.first.first > JITTER_WINDOW_MILLIS) {
            accelerationSamples.removeFirst()
        }
    }

    private fun estimateJitterHz(timestampMillis: Long): Float {
        val samples = accelerationSamples.filter { abs(it.second) >= ACCELERATION_NOISE_FLOOR }
        if (samples.size < 3) return 0f
        var signChanges = 0
        for (index in 1 until samples.size) {
            if (samples[index - 1].second * samples[index].second < 0f) signChanges += 1
        }
        val durationSeconds = (timestampMillis - samples.first().first).coerceAtLeast(1L) / 1000f
        return (signChanges / 2f / durationSeconds).coerceIn(0f, 20f)
    }

    private companion object {
        const val DEFAULT_DELTA_SECONDS = 1f / 30f
        const val MAX_DELTA_SECONDS = 1f
        const val RESET_AFTER_MISSING_MILLIS = 1_000L
        const val JITTER_WINDOW_MILLIS = 1_000L
        const val ACCELERATION_NOISE_FLOOR = 0.35f
    }
}

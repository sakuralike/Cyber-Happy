package com.cyberfish.app.inference

import java.util.concurrent.atomic.AtomicInteger

class MockDetector : Detector {
    private val frameIndex = AtomicInteger()

    override fun detect(frame: CameraFrame): Detection? {
        val sequenceIndex = Math.floorMod(frameIndex.getAndIncrement(), SEQUENCE_LENGTH)
        if (sequenceIndex >= LOST_START) return null

        val oscillation = kotlin.math.sin(sequenceIndex * TWO_PI * 3f / 30f) * 0.0015f
        val centerY = when (sequenceIndex) {
            in 30 until 110 -> 0.36f + ((sequenceIndex - 30) / 80f) * 0.24f + oscillation
            in 110 until 130 -> 0.60f - ((sequenceIndex - 110) / 20f) * 0.35f + oscillation
            in 130 until LOST_START -> 0.25f + oscillation
            else -> 0.36f + oscillation
        }
        return Detection(
            bounds = DetectionBounds(
                left = 0.43f,
                top = centerY - 0.185f,
                right = 0.57f,
                bottom = centerY + 0.185f,
            ),
            confidence = 0.92f + (sequenceIndex % 4) * 0.01f,
            motionFrequencyHz = 3.6f,
        )
    }

    private companion object {
        const val TWO_PI = 6.2831855f
        const val SEQUENCE_LENGTH = 180
        const val LOST_START = 150
    }
}

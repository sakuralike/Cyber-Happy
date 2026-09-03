package com.cyberfish.app.inference

import java.util.concurrent.atomic.AtomicInteger

class MockDetector : Detector {
    private val frameIndex = AtomicInteger()

    override fun detect(frame: CameraFrame): Detection? {
        val sequenceIndex = Math.floorMod(frameIndex.getAndIncrement(), SEQUENCE_LENGTH)
        if (sequenceIndex >= LOST_START) return null

        val offset = ((sequenceIndex % 24) - 12) / 800f
        return Detection(
            bounds = DetectionBounds(
                left = 0.43f + offset,
                top = 0.24f + offset,
                right = 0.57f + offset,
                bottom = 0.61f + offset,
            ),
            confidence = 0.92f + (sequenceIndex % 4) * 0.01f,
        )
    }

    private companion object {
        const val SEQUENCE_LENGTH = 180
        const val LOST_START = 150
    }
}

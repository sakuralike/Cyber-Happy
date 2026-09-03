package com.cyberfish.app.inference

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class MockDetectorTest {
    private val frame = CameraFrame(width = 1280, height = 720, timestampNanos = 0L)

    @Test
    fun `fixed sequence reports stable float before a lost interval`() {
        val detector = MockDetector()

        repeat(150) { assertNotNull(detector.detect(frame)) }
        repeat(30) { assertNull(detector.detect(frame)) }
    }

    @Test
    fun `fixed sequence restarts after the lost interval`() {
        val detector = MockDetector()

        repeat(180) { detector.detect(frame) }

        assertEquals(0.92f, detector.detect(frame)?.confidence)
    }
}

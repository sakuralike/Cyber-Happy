package com.cyberfish.app.inference

import org.junit.Assert.assertEquals
import org.junit.Test

class DetectorSlotRuntimeOptionsTest {
    @Test
    fun `runtime options apply to the current and replacement detector`() {
        val first = RecordingDetector()
        val second = RecordingDetector()
        val slot = DetectorSlot(first)
        val options = NcnnRuntimeOptions(numThreads = 3, analysisIntervalMillis = 40L)

        slot.setRuntimeOptions(options)
        slot.replace(second)

        assertEquals(options, first.options)
        assertEquals(options, second.options)
    }

    private class RecordingDetector : RuntimeOptionsDetector {
        var options: NcnnRuntimeOptions? = null

        override fun setRuntimeOptions(options: NcnnRuntimeOptions) {
            this.options = options
        }

        override fun detect(frame: CameraFrame): Detection? = null
    }
}

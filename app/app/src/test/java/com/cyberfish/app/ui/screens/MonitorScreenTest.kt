package com.cyberfish.app.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Test

class MonitorScreenTest {
    @Test
    fun formatsElapsedDurationBelowOneHour() {
        assertEquals("00:00:00", formatElapsedDuration(0L))
        assertEquals("00:00:59", formatElapsedDuration(59L))
        assertEquals("00:01:00", formatElapsedDuration(60L))
        assertEquals("00:59:59", formatElapsedDuration(3_599L))
    }

    @Test
    fun formatsElapsedDurationWithHours() {
        assertEquals("01:00:00", formatElapsedDuration(3_600L))
        assertEquals("01:01:05", formatElapsedDuration(3_665L))
    }
}

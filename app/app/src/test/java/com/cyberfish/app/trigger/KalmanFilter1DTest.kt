package com.cyberfish.app.trigger

import org.junit.Assert.assertTrue
import org.junit.Test

class KalmanFilter1DTest {
    @Test
    fun `filter smooths an abrupt measurement change`() {
        val filter = KalmanFilter1D()

        filter.update(0f, 1f / 30f)
        val smoothed = filter.update(10f, 1f / 30f)

        assertTrue(smoothed > 0f)
        assertTrue(smoothed < 10f)
    }
}

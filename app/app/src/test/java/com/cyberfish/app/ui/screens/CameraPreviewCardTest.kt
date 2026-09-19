package com.cyberfish.app.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Test

class CameraPreviewCardTest {
    @Test
    fun `detection size label uses visible pixel dimensions`() {
        assertEquals("W 48 × H 132 px", formatDetectionSize(48.4f, 131.6f))
    }

    @Test
    fun `detection size label does not expose negative dimensions`() {
        assertEquals("W 0 × H 0 px", formatDetectionSize(-2f, -1f))
    }
}

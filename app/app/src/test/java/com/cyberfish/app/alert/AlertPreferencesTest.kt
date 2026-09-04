package com.cyberfish.app.alert

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertPreferencesTest {
    @Test
    fun `quiet hours include late night and early morning`() {
        val preferences = AlertPreferences(quietHoursEnabled = true)

        assertTrue(preferences.isQuietHour(22))
        assertTrue(preferences.isQuietHour(3))
        assertFalse(preferences.isQuietHour(12))
    }

    @Test
    fun `disabled quiet hours never suppress alerts`() {
        assertFalse(AlertPreferences(quietHoursEnabled = false).isQuietHour(3))
    }
}

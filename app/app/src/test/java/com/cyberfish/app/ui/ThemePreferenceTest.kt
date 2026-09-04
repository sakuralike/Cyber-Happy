package com.cyberfish.app.ui

import com.cyberfish.app.data.preferences.AppPreferences
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemePreferenceTest {
    @Test
    fun `automatic theme follows daytime hours`() {
        val settings = AppPreferences(autoTheme = true)

        assertFalse(resolveDarkTheme(settings, systemDark = true, hourOfDay = 12))
        assertTrue(resolveDarkTheme(settings, systemDark = false, hourOfDay = 3))
    }

    @Test
    fun `manual theme ignores the current hour`() {
        assertFalse(resolveDarkTheme(AppPreferences(themeMode = ThemeMode.Light.name, autoTheme = false), true, 3))
        assertTrue(resolveDarkTheme(AppPreferences(themeMode = ThemeMode.Dark.name, autoTheme = false), false, 12))
    }
}

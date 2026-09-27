package com.cyberfish.app.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class DeviceIdentityTest {
    @Test
    fun releaseKeepsLegacyAndroidIdDerivationWhileDebugUsesSeparateNamespace() {
        val release = deviceIdForApplication("com.cyberfish.app", "android-id")
        val debug = deviceIdForApplication("com.cyberfish.app.debug", "android-id")

        assertEquals("android-df9356f532e1bbc39c579ecee7dc082c", release)
        assertNotEquals(release, debug)
    }
}

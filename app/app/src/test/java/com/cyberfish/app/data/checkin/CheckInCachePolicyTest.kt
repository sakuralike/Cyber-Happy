package com.cyberfish.app.data.checkin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckInCachePolicyTest {
    @Test
    fun `overview cache is fresh only before five minute ttl`() {
        val now = CHECK_IN_CONFIG_CACHE_TTL_MILLIS + 10_000L

        assertTrue(isCheckInCacheFresh(now - CHECK_IN_CONFIG_CACHE_TTL_MILLIS + 1L, now))
        assertFalse(isCheckInCacheFresh(now - CHECK_IN_CONFIG_CACHE_TTL_MILLIS, now))
        assertFalse(isCheckInCacheFresh(now + 1L, now))
        assertFalse(isCheckInCacheFresh(0L, now))
    }
}

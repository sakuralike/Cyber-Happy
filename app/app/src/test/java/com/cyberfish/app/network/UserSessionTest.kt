package com.cyberfish.app.network

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class UserSessionTest {
    @Test
    fun `idle timeout expires only after thirty days`() {
        val now = 1_800_000_000_000L
        assertFalse(isUserSessionExpired(now - USER_SESSION_IDLE_TIMEOUT_MILLIS + 1, now))
        assertTrue(isUserSessionExpired(now - USER_SESSION_IDLE_TIMEOUT_MILLIS, now))
    }

    @Test
    fun `expired JWT is rejected before a protected request`() {
        val now = 1_800_000_000_000L
        assertTrue(isUserSessionTokenExpired(tokenWithExpiry((now / 1_000L) - 1), now))
        assertFalse(isUserSessionTokenExpired(tokenWithExpiry((now / 1_000L) + 1), now))
    }

    private fun tokenWithExpiry(expirySeconds: Long): String {
        val header = Base64.getUrlEncoder().withoutPadding().encodeToString("{}".toByteArray())
        val payload = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"exp\":$expirySeconds}".toByteArray())
        return "$header.$payload.signature"
    }
}

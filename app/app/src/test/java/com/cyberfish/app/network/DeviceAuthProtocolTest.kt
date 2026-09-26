package com.cyberfish.app.network

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceAuthProtocolTest {
    @Test
    fun `challenge signing text follows frozen protocol`() {
        assertEquals(
            "CYBERFISH-DEVICE-AUTH-V1\nTOKEN\ndevice-1\nec-key\nchallenge-1\nabc\n2026-09-27T00:00:00.000Z",
            deviceChallengeSigningText(
                deviceId = "device-1",
                signingKeyId = "ec-key",
                challengeId = "challenge-1",
                challenge = "abc",
                expiresAt = "2026-09-27T00:00:00.000Z",
            ),
        )
    }

    @Test
    fun `request signing text sorts and RFC3986 encodes query`() {
        val url = "https://lycwd.com/api/v1/models/check?z=last&a=hello%20world&a=%2A".toHttpUrl()

        assertEquals(
            "CYBERFISH-REQUEST-V1\nGET\n/api/v1/models/check\na=%2A&a=hello%20world&z=last\n${sha256Hex(ByteArray(0))}\n123\nnonce",
            deviceRequestSigningText("get", url, sha256Hex(ByteArray(0)), 123, "nonce"),
        )
    }

    @Test
    fun `canonical json recursively sorts object keys and preserves arrays`() {
        val first = canonicalJson("""{"z":2,"a":{"b":true,"a":"鱼漂"},"items":[{"y":2,"x":1},null]}""")
        val second = canonicalJson("""{"items":[{"x":1,"y":2},null],"a":{"a":"鱼漂","b":true},"z":2}""")

        assertEquals("""{"a":{"a":"鱼漂","b":true},"items":[{"x":1,"y":2},null],"z":2}""", first)
        assertEquals(first, second)
        assertEquals(sha256Hex(first.toByteArray()), sha256Hex(second.toByteArray()))
    }

    @Test
    fun `nonce is url safe and unique`() {
        val first = newDeviceNonce()
        val second = newDeviceNonce()

        assertTrue(first.matches(Regex("[A-Za-z0-9_-]{22}")))
        assertNotEquals(first, second)
    }
}

package com.cyberfish.app.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelPublicKeysTest {
    @Test
    fun `built-in ncnn signing key cannot be overridden by local configuration`() {
        val key = ModelPublicKeys.fromBuildConfig()["cyberfish-ncnn-v1"]

        assertEquals(
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEexCYbXHx7m2ZBZA6d0eJwOsctH1tsymp28GIMSWx+2xhYwq+FD/Gb5S5QGjtDjkBB8L2ztcPFE0O+oLOuZ+Fdg==",
            key,
        )
    }

    @Test
    fun `parses multiple rotation keys and ignores invalid entries`() {
        val keys = ModelPublicKeys.parse("""{"current":" key-current ","rotated":"key-rotated","empty":"","number":3}""")

        assertEquals(mapOf("current" to "key-current", "rotated" to "key-rotated"), keys)
    }

    @Test
    fun `malformed configuration fails closed`() {
        assertTrue(ModelPublicKeys.parse("not-json").isEmpty())
        assertTrue(ModelPublicKeys.parse("").isEmpty())
    }
}

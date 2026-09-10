package com.cyberfish.app.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelPublicKeysTest {
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

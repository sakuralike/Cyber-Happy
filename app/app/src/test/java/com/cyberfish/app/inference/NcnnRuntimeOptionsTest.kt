package com.cyberfish.app.inference

import org.junit.Assert.assertEquals
import org.junit.Test

class NcnnRuntimeOptionsTest {
    @Test
    fun `performance modes map to distinct runtime parameters`() {
        assertEquals(NcnnRuntimeOptions(1, 100L), NcnnRuntimeOptions.forPerformanceMode("省电", 8))
        assertEquals(NcnnRuntimeOptions(4, 50L), NcnnRuntimeOptions.forPerformanceMode("标准", 8))
        assertEquals(NcnnRuntimeOptions(8, 33L), NcnnRuntimeOptions.forPerformanceMode("高性能", 8))
    }

    @Test
    fun `unknown mode safely uses standard parameters`() {
        assertEquals(NcnnRuntimeOptions(2, 50L), NcnnRuntimeOptions.forPerformanceMode("未知", 3))
    }
}

package com.cyberfish.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import com.cyberfish.app.ui.AppTab

class AppBuildConfigTest {
    @Test
    fun `debug build targets the planned Android API levels`() {
        assertEquals(28, BuildConfig.PLANNED_MIN_SDK)
        assertEquals(34, BuildConfig.PLANNED_TARGET_SDK)
    }

    @Test
    fun `navigation keeps all planned destinations`() {
        assertEquals(4, AppTab.entries.size)
        assertTrue(AppTab.entries.map { it.label }.containsAll(listOf("监控", "记录", "设置", "我的")))
    }
}

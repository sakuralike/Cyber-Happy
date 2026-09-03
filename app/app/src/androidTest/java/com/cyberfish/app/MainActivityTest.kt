package com.cyberfish.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToIndex
import org.junit.Rule
import org.junit.Test

class MainActivityTest {
    @get:Rule
    val activityRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun primaryNavigationAndThemeControlsAreInteractive() {
        activityRule.onNodeWithText("实时监控").assertIsDisplayed()
        activityRule.onNodeWithText("停止监控").performClick()
        activityRule.onNodeWithText("开始监控").assertIsDisplayed()

        activityRule.onNodeWithContentDescription("记录").performClick()
        activityRule.onNodeWithText("中鱼记录").assertIsDisplayed()

        activityRule.onNodeWithContentDescription("设置").performClick()
        activityRule.onNodeWithText("参数配置").assertIsDisplayed()
        activityRule.onNodeWithText("保存配置").performScrollTo().performClick()
        activityRule.onNodeWithText("配置已保存").performScrollTo().assertIsDisplayed()
        activityRule.onNodeWithTag("settings-list").performScrollToIndex(0)
        activityRule.onNodeWithText("提醒与外观").performClick()
        activityRule.onNodeWithText("外观主题").performScrollTo().assertIsDisplayed()
        activityRule.onNodeWithText("白天").performScrollTo().performClick()
        activityRule.onNodeWithTag("settings-list").performScrollToIndex(0)
        activityRule.onNodeWithText("模型与性能").performScrollTo().performClick()
        activityRule.onNodeWithText("占位模型 MockDetector").assertIsDisplayed()

        activityRule.onNodeWithContentDescription("我的").performClick()
        activityRule.onNodeWithText("暂无内容").assertIsDisplayed()
    }
}

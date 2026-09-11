package com.cyberfish.app

import androidx.activity.compose.setContent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cyberfish.app.ui.screens.ProfileScreen
import com.cyberfish.app.ui.theme.CyberFishTheme
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.SupportContent
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProfileScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun exportActionInvokesCallback() {
        var exportRequested = false
        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    ProfileScreen(
                        records = emptyList(),
                        favoriteSpots = emptySet(),
                        userSession = null,
                        supportContent = SupportContent(),
                        onOpenFishingSpots = {},
                        onExportRecords = { exportRequested = true },
                        onLogin = { _, _ -> ApiResult.HttpError(401, "未登录") },
                        onRegister = { _, _, _, _ -> ApiResult.HttpError(401, "未登录") },
                        onLogout = {},
                        onSubmitFeedback = { _, _ -> ApiResult.HttpError(401, "未登录") },
                    )
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("数据导出").performClick()

        assertTrue(exportRequested)
    }

    @Test
    fun favoritesActionOpensFishingSpotMap() {
        var opened = false
        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    ProfileScreen(
                        records = emptyList(),
                        favoriteSpots = emptySet(),
                        userSession = null,
                        supportContent = SupportContent(),
                        onOpenFishingSpots = { opened = true },
                        onExportRecords = {},
                        onLogin = { _, _ -> ApiResult.HttpError(401, "未登录") },
                        onRegister = { _, _, _, _ -> ApiResult.HttpError(401, "未登录") },
                        onLogout = {},
                        onSubmitFeedback = { _, _ -> ApiResult.HttpError(401, "未登录") },
                    )
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("钓场收藏").performClick()
        composeRule.waitForIdle()
        assertTrue(opened)
    }

    @Test
    fun feedbackAndPrivacyDialogsExposeActions() {
        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    ProfileScreen(
                        records = emptyList(),
                        favoriteSpots = emptySet(),
                        userSession = null,
                        supportContent = SupportContent(),
                        onOpenFishingSpots = {},
                        onExportRecords = {},
                        onLogin = { _, _ -> ApiResult.HttpError(401, "未登录") },
                        onRegister = { _, _, _, _ -> ApiResult.HttpError(401, "未登录") },
                        onLogout = {},
                        onSubmitFeedback = { _, _ -> ApiResult.HttpError(401, "未登录") },
                    )
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("反馈与帮助").performClick()
        composeRule.onNodeWithText("使用帮助").assertIsDisplayed()
        composeRule.onNodeWithText("去登录").assertIsDisplayed()
        composeRule.onNodeWithText("关闭").performClick()

        composeRule.onNodeWithText("关于赛博鱼乐").performClick()
        composeRule.onNodeWithText("隐私说明").performClick()
        composeRule.onNodeWithText("识别默认在设备本地完成。", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("返回").performClick()
        composeRule.onNodeWithText("模型运行时：LiteRT v3", substring = true).assertIsDisplayed()
    }
}

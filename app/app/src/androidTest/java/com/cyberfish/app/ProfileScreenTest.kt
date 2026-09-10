package com.cyberfish.app

import android.content.ContextWrapper
import android.content.Intent
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.CompositionLocalProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cyberfish.app.ui.screens.ProfileScreen
import com.cyberfish.app.ui.theme.CyberFishTheme
import org.junit.Assert.assertEquals
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
                        onFavoriteSpotsChange = {},
                        onExportRecords = { exportRequested = true },
                    )
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("数据导出").performClick()

        assertTrue(exportRequested)
    }

    @Test
    fun favoritesCanBeAddedAndRemoved() {
        var favorites by mutableStateOf<Set<String>>(emptySet())
        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    ProfileScreen(
                        records = emptyList(),
                        favoriteSpots = favorites,
                        onFavoriteSpotsChange = { favorites = it },
                        onExportRecords = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("钓场收藏").performClick()
        composeRule.onNodeWithText("添加钓场").performTextInput("东湖")
        composeRule.onNodeWithText("保存").performClick()
        composeRule.waitForIdle()
        assertEquals(setOf("东湖"), favorites)

        composeRule.onNodeWithText("钓场收藏").performClick()
        composeRule.onNodeWithText("东湖").assertIsDisplayed()
        composeRule.onNodeWithText("移除").performClick()
        composeRule.waitForIdle()
        assertEquals(emptySet<String>(), favorites)
    }

    @Test
    fun feedbackAndPrivacyDialogsExposeActions() {
        var mailIntent: Intent? = null
        val testContext = object : ContextWrapper(composeRule.activity) {
            override fun startActivity(intent: Intent) {
                mailIntent = intent
            }
        }
        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CompositionLocalProvider(LocalContext provides testContext) {
                        ProfileScreen(
                            records = emptyList(),
                            favoriteSpots = emptySet(),
                            onFavoriteSpotsChange = {},
                            onExportRecords = {},
                        )
                    }
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("反馈与帮助").performClick()
        composeRule.onNodeWithText("遇到识别问题或使用疑问，可通过邮件联系我们。误报请在记录详情中直接标记，便于携带结构化数据。").assertIsDisplayed()
        composeRule.onNodeWithText("发送邮件").performClick()
        composeRule.waitForIdle()
        assertEquals(Intent.ACTION_SENDTO, mailIntent?.action)
        assertEquals("mailto:support@cyberfish.cn", mailIntent?.dataString)

        composeRule.onNodeWithText("关于赛博鱼乐").performClick()
        composeRule.onNodeWithText("隐私说明").performClick()
        composeRule.onNodeWithText("识别默认在设备本地完成。", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("返回").performClick()
        composeRule.onNodeWithText("模型运行时：LiteRT v3", substring = true).assertIsDisplayed()
    }
}

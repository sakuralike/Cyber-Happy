package com.cyberfish.app

import androidx.activity.compose.setContent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cyberfish.app.ui.screens.MisreportConfirmDialog
import com.cyberfish.app.ui.theme.CyberFishTheme
import org.junit.Rule
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MisreportConfirmDialogTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun dialogRequiresExplicitConfirmation() {
        var confirmed = false
        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    MisreportConfirmDialog(onDismiss = {}, onConfirm = { confirmed = true })
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("确认上报误报").assertIsDisplayed()
        composeRule.onNodeWithText("将同步本条检测的结构化数据，不会上传视频或图片。").assertIsDisplayed()
        composeRule.onNodeWithText("确认上报").performClick()
        assertTrue(confirmed)
    }
}

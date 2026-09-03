package com.cyberfish.app

import androidx.activity.compose.setContent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cyberfish.app.trigger.FeatureSnapshot
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.ui.screens.TriggerHeroCard
import com.cyberfish.app.ui.theme.CyberFishTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TriggerHeroCardTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun heroCardShowsFeaturesAndMarksFalsePositive() {
        val event = TriggerEvent(
            timestampMillis = 966L,
            confidence = 0.94f,
            reason = "持续下沉并完成反向确认",
            features = FeatureSnapshot(966L, 19.2f, -12f, 3.6f, 0.94f),
            trajectoryPx = listOf(0f, 5f, 12f, 19f),
        )
        var falsePositiveMarked by mutableStateOf(false)

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    TriggerHeroCard(
                        event = event,
                        falsePositiveMarked = falsePositiveMarked,
                        onMarkFalsePositive = { falsePositiveMarked = true },
                        onDismiss = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("检测到上鱼动作").assertIsDisplayed()
        composeRule.onNodeWithText("19.2 px").assertIsDisplayed()
        composeRule.onNodeWithText("标记误报").performClick()
        composeRule.onNodeWithText("已标记误报").assertIsDisplayed()
    }
}

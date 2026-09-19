package com.cyberfish.app

import androidx.activity.compose.setContent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.CheckInActionResult
import com.cyberfish.app.network.CheckInHistory
import com.cyberfish.app.network.CheckInOverview
import com.cyberfish.app.network.CheckInReward
import com.cyberfish.app.network.UserAccount
import com.cyberfish.app.network.UserSession
import com.cyberfish.app.ui.screens.CheckInScreen
import com.cyberfish.app.ui.theme.CyberFishTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.assertTrue
import java.util.concurrent.atomic.AtomicInteger

@RunWith(AndroidJUnit4::class)
class CheckInScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun checkInSubmissionShowsReturnedReward() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(
            enabled = true,
            checkedInToday = false,
            currentStreak = 6,
            longestStreak = 6,
            cycleDay = 6,
            cycleLength = 7,
            canCheckIn = true,
        )
        val checkedOverview = overview.copy(
            checkedInToday = true,
            currentStreak = 7,
            cycleDay = 7,
        )

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = { ApiResult.Success(overview) },
                        submitCheckIn = {
                            ApiResult.Success(
                                CheckInActionResult(
                                    overview = checkedOverview,
                                    rewards = listOf(CheckInReward(7, "MEDAL", "铜钩钓士", "medal_bronze")),
                                ),
                            )
                        },
                        loadHistory = { _, _ -> ApiResult.Success(CheckInHistory()) },
                    )
                }
            }
        }

        composeRule.waitForIdle()
        composeRule.onNodeWithTag("check-in-button").performScrollTo().performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithText("本次获得奖励").assertIsDisplayed()
        composeRule.onNodeWithText("第7天 · 铜钩钓士").assertIsDisplayed()
    }

    @Test
    fun cachedOverviewShowsOfflineMessageAndRetryAction() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(enabled = true, checkedInToday = true, currentStreak = 3, cycleDay = 3)
        val overviewRequests = AtomicInteger(0)

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = {
                            overviewRequests.incrementAndGet()
                            ApiResult.Success(overview, fromCache = true, cacheFallback = true)
                        },
                        submitCheckIn = { ApiResult.Success(CheckInActionResult(overview)) },
                        loadHistory = { _, _ -> ApiResult.Success(CheckInHistory()) },
                    )
                }
            }
        }

        composeRule.waitForIdle()
        composeRule.onNodeWithText("网络不可用，当前显示最近同步的签到数据").assertIsDisplayed()
        composeRule.onNodeWithText("重试").performClick()
        composeRule.waitForIdle()
        assertTrue(overviewRequests.get() >= 2)
    }
}

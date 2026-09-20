package com.cyberfish.app

import androidx.activity.compose.setContent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.lifecycle.Lifecycle
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.CheckInActionResult
import com.cyberfish.app.network.CheckInHistory
import com.cyberfish.app.network.CheckInOverview
import com.cyberfish.app.network.CheckInRecord
import com.cyberfish.app.network.CheckInReward
import com.cyberfish.app.network.UserAccount
import com.cyberfish.app.network.UserSession
import com.cyberfish.app.data.checkin.CHECK_IN_CONFIG_CACHE_TTL_MILLIS
import com.cyberfish.app.ui.screens.CheckInScreen
import com.cyberfish.app.ui.theme.CyberFishTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import java.util.concurrent.atomic.AtomicInteger
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

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
    fun milestoneRewardShowsTheAchievementDialog() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(
            enabled = true,
            checkedInToday = false,
            currentStreak = 6,
            cycleDay = 6,
            cycleLength = 7,
            canCheckIn = true,
        )
        val checkedOverview = overview.copy(checkedInToday = true, currentStreak = 7, cycleDay = 7)
        val milestoneShown = AtomicInteger(0)

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = { ApiResult.Success(overview) },
                        forceRefreshOverview = { ApiResult.Success(overview) },
                        onMilestoneShown = { milestoneShown.incrementAndGet() },
                        submitCheckIn = {
                            ApiResult.Success(
                                CheckInActionResult(
                                    overview = checkedOverview,
                                    rewards = listOf(
                                        CheckInReward(7, "MEDAL", "铜钩钓士", "medal_bronze", milestone = true),
                                    ),
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

        composeRule.onNodeWithText("里程碑达成").assertIsDisplayed()
        composeRule.onNodeWithText("连续签到 7 天").assertIsDisplayed()
        composeRule.onNodeWithText("铜钩钓士").assertIsDisplayed()
        assertEquals(1, milestoneShown.get())
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

    @Test
    fun enteringCheckInPageForcesAFreshOverviewRequest() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(enabled = true, checkedInToday = false, canCheckIn = true)
        val cachedRequests = AtomicInteger(0)
        val freshRequests = AtomicInteger(0)

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = {
                            cachedRequests.incrementAndGet()
                            ApiResult.Success(overview, fromCache = true)
                        },
                        forceRefreshOverview = {
                            freshRequests.incrementAndGet()
                            ApiResult.Success(overview)
                        },
                        submitCheckIn = { ApiResult.Success(CheckInActionResult(overview)) },
                        loadHistory = { _, _ -> ApiResult.Success(CheckInHistory()) },
                    )
                }
            }
        }

        composeRule.waitUntil(5_000) { freshRequests.get() > 0 || cachedRequests.get() > 0 }
        assertTrue(freshRequests.get() == 1)
        assertTrue(cachedRequests.get() == 0)
    }

    @Test
    fun historyReloadsWhenTheSelectedCalendarMonthChanges() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(enabled = true, checkedInToday = false, canCheckIn = true)
        val requestedMonths = mutableListOf<String?>()

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = { ApiResult.Success(overview) },
                        forceRefreshOverview = { ApiResult.Success(overview) },
                        submitCheckIn = { ApiResult.Success(CheckInActionResult(overview)) },
                        loadHistory = { _, month ->
                            val record = when (requestedMonths.size) {
                                0 -> CheckInRecord("CURRENT-HISTORY")
                                1 -> CheckInRecord("PREVIOUS-CALENDAR")
                                else -> CheckInRecord("PREVIOUS-HISTORY")
                            }
                            requestedMonths += month
                            ApiResult.Success(CheckInHistory(records = listOf(record)))
                        },
                    )
                }
            }
        }

        composeRule.waitForIdle()
        composeRule.onNodeWithText("签到记录").performClick()
        composeRule.waitUntil(5_000) { requestedMonths.size == 1 }
        composeRule.onNodeWithText("签到日历").performClick()
        composeRule.onNodeWithContentDescription("上个月").performClick()
        composeRule.onNodeWithText("签到记录").performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("PREVIOUS-HISTORY").fetchSemanticsNodes().isNotEmpty()
        }

        assertEquals(3, requestedMonths.size)
        assertTrue(requestedMonths[0] != requestedMonths[2])
    }

    @Test
    fun historicalCalendarMonthCannotSubmitTodaysCheckIn() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(enabled = true, checkedInToday = false, canCheckIn = true)

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = { ApiResult.Success(overview) },
                        submitCheckIn = { ApiResult.Success(CheckInActionResult(overview)) },
                        loadHistory = { _, _ -> ApiResult.Success(CheckInHistory()) },
                    )
                }
            }
        }

        composeRule.waitForIdle()
        composeRule.onNodeWithContentDescription("上个月").performClick()
        composeRule.onNodeWithTag("check-in-button").performScrollTo().assertIsNotEnabled()
    }

    @Test
    fun visibleCheckInPageRefreshesAfterTheFiveMinuteConfigTtl() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(enabled = true, checkedInToday = false, canCheckIn = true)
        val freshRequests = AtomicInteger(0)
        composeRule.mainClock.autoAdvance = false

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = { ApiResult.Success(overview) },
                        forceRefreshOverview = {
                            freshRequests.incrementAndGet()
                            ApiResult.Success(overview)
                        },
                        submitCheckIn = { ApiResult.Success(CheckInActionResult(overview)) },
                        loadHistory = { _, _ -> ApiResult.Success(CheckInHistory()) },
                    )
                }
            }
        }

        composeRule.mainClock.advanceTimeBy(1_000L)
        composeRule.waitForIdle()
        assertEquals(1, freshRequests.get())
        composeRule.mainClock.advanceTimeBy(CHECK_IN_CONFIG_CACHE_TTL_MILLIS + 1_000L)
        composeRule.waitForIdle()

        assertTrue(freshRequests.get() >= 2)
    }

    @Test
    fun resumingAfterMidnightRefreshesAndMovesTheCalendarToTheNewMonth() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(enabled = true, checkedInToday = false, canCheckIn = true)
        val freshRequests = AtomicInteger(0)
        val clock = MutableClock(Instant.parse("2026-01-31T12:00:00Z"))

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = { ApiResult.Success(overview) },
                        forceRefreshOverview = {
                            freshRequests.incrementAndGet()
                            ApiResult.Success(overview)
                        },
                        submitCheckIn = { ApiResult.Success(CheckInActionResult(overview)) },
                        loadHistory = { _, _ -> ApiResult.Success(CheckInHistory()) },
                        clock = clock,
                    )
                }
            }
        }

        composeRule.waitUntil(5_000) { freshRequests.get() == 1 }
        composeRule.onNodeWithText("2026年1月").assertIsDisplayed()
        composeRule.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        clock.currentInstant = Instant.parse("2026-02-01T12:00:00Z")
        composeRule.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        composeRule.waitUntil(5_000) { freshRequests.get() >= 2 }

        composeRule.onNodeWithText("2026年2月").assertIsDisplayed()
    }

    @Test
    fun expiredSessionOffersLoginRecovery() {
        val session = UserSession(
            token = "expired-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        var loginRequested = false

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = { loginRequested = true },
                        loadOverview = { ApiResult.HttpError(401, "登录已过期") },
                        forceRefreshOverview = { ApiResult.HttpError(401, "登录已过期") },
                        submitCheckIn = { ApiResult.HttpError(401, "登录已过期") },
                        loadHistory = { _, _ -> ApiResult.HttpError(401, "登录已过期") },
                    )
                }
            }
        }

        composeRule.waitForIdle()
        composeRule.onNodeWithText("登录状态已失效，请重新登录").assertIsDisplayed()
        composeRule.onNodeWithText("去登录").performClick()
        assertTrue(loginRequested)
    }

    @Test
    fun disabledActivityShowsConfiguredTitleAndAnnouncement() {
        val session = UserSession(
            token = "test-token",
            user = UserAccount("user-1", "angler", "钓友", null),
        )
        val overview = CheckInOverview(
            activityTitle = "休渔期签到",
            enabled = false,
            checkedInToday = false,
            canCheckIn = false,
            notice = "活动维护中，请稍后再来",
        )

        composeRule.activity.runOnUiThread {
            composeRule.activity.setContent {
                CyberFishTheme {
                    CheckInScreen(
                        userSession = session,
                        onBack = {},
                        onRequireLogin = {},
                        loadOverview = { ApiResult.Success(overview) },
                        forceRefreshOverview = { ApiResult.Success(overview) },
                        submitCheckIn = { ApiResult.Success(CheckInActionResult(overview)) },
                        loadHistory = { _, _ -> ApiResult.Success(CheckInHistory()) },
                    )
                }
            }
        }

        composeRule.waitForIdle()
        composeRule.onNodeWithText("休渔期签到").assertIsDisplayed()
        composeRule.onNodeWithText("签到活动已暂停").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("活动维护中，请稍后再来").performScrollTo().assertIsDisplayed()
    }

    private class MutableClock(
        var currentInstant: Instant,
        private val zoneId: ZoneId = ZoneId.of("Asia/Shanghai"),
    ) : Clock() {
        override fun getZone(): ZoneId = zoneId

        override fun withZone(zone: ZoneId): Clock = MutableClock(currentInstant, zone)

        override fun instant(): Instant = currentInstant
    }
}

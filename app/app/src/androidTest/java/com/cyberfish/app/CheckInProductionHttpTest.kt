package com.cyberfish.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.cyberfish.app.network.ApiConfig
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.AppApiClient
import com.cyberfish.app.network.DeviceIdentityStore
import com.cyberfish.app.network.UserSession
import com.cyberfish.app.network.UserSessionProvider
import java.time.YearMonth
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CheckInProductionHttpTest {
    @Test
    fun productionLoginOverviewHistoryAndDuplicateAreConsistent() = runBlocking {
        val arguments = InstrumentationRegistry.getArguments()
        val username = arguments.getString("checkinUsername").orEmpty()
        val password = arguments.getString("checkinPassword").orEmpty()
        assumeTrue("生产 HTTP 验收需提供 checkinUsername/checkinPassword", username.isNotBlank() && password.isNotBlank())

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val config = ApiConfig.fromBuildConfig()
        val identity = DeviceIdentityStore(context)
        val loginClient = AppApiClient(config, identity)
        val login = loginClient.login(username, password)
        assertTrue("生产登录失败：$login", login is ApiResult.Success)
        val session = (login as ApiResult.Success).value
        val client = AppApiClient(config, identity, FixedSessionProvider(session))

        val overview = client.fetchCheckInOverview()
        assertTrue("生产概览失败：$overview", overview is ApiResult.Success)
        val overviewValue = (overview as ApiResult.Success).value
        assertTrue(overviewValue.activityTitle.isNotBlank())

        val history = client.fetchCheckInHistory(month = YearMonth.now().toString())
        assertTrue("生产历史失败：$history", history is ApiResult.Success)
        val historyValue = (history as ApiResult.Success).value
        assertTrue(historyValue.records.all { it.date.startsWith(YearMonth.now().toString()) })

        val first = client.checkIn()
        when (first) {
            is ApiResult.Success -> assertTrue(first.value.overview.checkedInToday)
            is ApiResult.HttpError -> assertEquals(40912, first.errorCode)
            else -> throw AssertionError("生产签到失败：$first")
        }
        val duplicate = client.checkIn()
        assertTrue("重复签到未返回 HTTP 错误：$duplicate", duplicate is ApiResult.HttpError)
        duplicate as ApiResult.HttpError
        assertEquals(40912, duplicate.errorCode)
        assertNotNull(session.user.id)
    }

    private class FixedSessionProvider(private val session: UserSession) : UserSessionProvider {
        override suspend fun get(): UserSession = session
    }
}

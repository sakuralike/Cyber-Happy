package com.cyberfish.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.cyberfish.app.data.checkin.CheckInCacheStore
import com.cyberfish.app.network.CheckInHistory
import com.cyberfish.app.network.CheckInOverview
import com.cyberfish.app.network.CheckInRecord
import com.cyberfish.app.network.CheckInReward
import com.cyberfish.app.network.DeviceIdentityStore
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CheckInPersistenceTest {
    @Test
    fun cacheIsIsolatedByUserAndMonthAndKeepsEarnedHonors() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = CheckInCacheStore(context)
        val firstUser = "cache-a-${UUID.randomUUID()}"
        val secondUser = "cache-b-${UUID.randomUUID()}"
        val honor = CheckInReward(14, "MEDAL", "银钩钓士", "medal_silver", milestone = true)

        store.writeOverview(
            firstUser,
            CheckInOverview(activityTitle = "闭环签到", enabled = true, earnedRewards = listOf(honor)),
        )
        store.writeOverview(secondUser, CheckInOverview(activityTitle = "其他账号", enabled = false))
        store.writeHistory(firstUser, "2026-09", CheckInHistory(records = listOf(CheckInRecord("2026-09-20"))))
        store.writeHistory(firstUser, "2026-10", CheckInHistory(records = listOf(CheckInRecord("2026-10-01"))))

        val firstOverview = store.readOverview(firstUser)
        val secondOverview = store.readOverview(secondUser)
        assertEquals("闭环签到", firstOverview?.value?.activityTitle)
        assertEquals(listOf(honor), firstOverview?.value?.earnedRewards)
        assertFalse(secondOverview?.value?.enabled ?: true)
        assertEquals("2026-09-20", store.readHistory(firstUser, "2026-09")?.value?.records?.single()?.date)
        assertEquals("2026-10-01", store.readHistory(firstUser, "2026-10")?.value?.records?.single()?.date)
    }

    @Test
    fun deviceIdentityIsStableAcrossRepeatedReads() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = DeviceIdentityStore(context)

        val first = store.get()
        val second = store.get()

        assertNotNull(first.deviceId)
        assertEquals(first.deviceId, second.deviceId)
        assertEquals(first.userId, second.userId)
    }
}

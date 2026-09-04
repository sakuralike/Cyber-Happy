package com.cyberfish.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cyberfish.app.data.local.CyberFishDatabase
import com.cyberfish.app.data.local.FishRecordEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FishRecordDaoTest {
    private lateinit var database: CyberFishDatabase

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, CyberFishDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun insertOrdersRecordsAndMarksFalsePositive() = runBlocking {
        val dao = database.fishRecordDao()
        dao.insert(record(1_000L, 10L))
        dao.insert(record(2_000L, 20L))

        val records = dao.observeAll().first()
        assertEquals(listOf(2_000L, 1_000L), records.map { it.occurredAtMillis })

        assertEquals(1, dao.markFalsePositiveByTriggerTimestamp(20L))
        assertTrue(dao.observeAll().first().first().isFalsePositive)

        dao.insert(record(3_000L, 20L))
        assertTrue(dao.observeAll().first().first().isFalsePositive)
    }

    private fun record(occurredAtMillis: Long, triggerTimestampMillis: Long) = FishRecordEntity(
        occurredAtMillis = occurredAtMillis,
        triggerTimestampMillis = triggerTimestampMillis,
        confidence = 0.9f,
        verticalDisplacementPx = 18f,
        jitterHz = 3.6f,
        trajectoryCsv = "0,5,12,18",
    )
}

package com.cyberfish.app.data.local

import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.trigger.FeatureSnapshot
import com.cyberfish.app.trigger.TriggerEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class FishRecordEntityTest {
    @Test
    fun `event mapping preserves trigger metrics and trajectory`() {
        val event = TriggerEvent(
            timestampMillis = 966L,
            confidence = 0.94f,
            reason = "持续下沉并完成反向确认",
            features = FeatureSnapshot(966L, 19.2f, -12f, 3.6f, 0.94f),
            trajectoryPx = listOf(0f, 5f, 12f, 19f),
        )

        val entity = FishRecordEntity.fromEvent(event, occurredAtMillis = 1_700_000_000_000L)
        val record: FishRecord = entity.toDomain()

        assertEquals(1_700_000_000_000L, record.occurredAtMillis)
        assertEquals(966L, record.triggerTimestampMillis)
        assertEquals(0.94f, record.confidence)
        assertEquals(19.2f, record.verticalDisplacementPx)
        assertEquals(3.6f, record.jitterHz)
        assertEquals(listOf(0f, 5f, 12f, 19f), record.trajectoryPx)
        assertFalse(record.isFalsePositive)
        assertNull(record.videoPath)
    }
}

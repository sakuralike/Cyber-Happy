package com.cyberfish.app.ui.screens

import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class CheckInRefreshPolicyTest {
    @Test
    fun `schedules the foreground day rollover at Shanghai midnight`() {
        val clock = Clock.fixed(
            Instant.parse("2026-01-31T15:59:30Z"),
            ZoneId.of("Asia/Shanghai"),
        )

        assertEquals(30_000L, millisUntilNextCheckInDay(clock))
    }

    @Test
    fun `counts missed natural days between history records`() {
        assertEquals(0, missedCheckInDays(LocalDate.parse("2026-09-20"), LocalDate.parse("2026-09-19")))
        assertEquals(2, missedCheckInDays(LocalDate.parse("2026-09-20"), LocalDate.parse("2026-09-17")))
    }
}

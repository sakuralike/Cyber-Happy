package com.cyberfish.app.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class RollingVideoClipCoordinatorTest {
    @Test
    fun `trigger waits for post roll and selects pre roll segments`() {
        val directory = Files.createTempDirectory("cyberfish-video").toFile()
        try {
            val coordinator = RollingVideoClipCoordinator(directory, preRollMillis = 3_000L, postRollMillis = 2_000L)
            coordinator.onSegmentFinalized(segment(directory, "before.mp4", 0L, 1_000L))
            coordinator.onSegmentFinalized(segment(directory, "current.mp4", 1_000L, 4_000L))
            coordinator.markTrigger(3_000L)

            assertNull(coordinator.onSegmentFinalized(segment(directory, "pending.mp4", 4_000L, 4_900L)))
            val result = coordinator.onSegmentFinalized(segment(directory, "after.mp4", 4_900L, 5_100L))

            assertEquals(VideoClipState.READY, result!!.state)
            assertEquals(listOf("before.mp4", "current.mp4", "pending.mp4", "after.mp4"), result.segments.map { it.name })
            assertNull(result.videoPath)
            assertEquals(VideoClipState.READY, coordinator.state())
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `disabled coordinator never creates a trigger or deletes recorder files`() {
        val directory = Files.createTempDirectory("cyberfish-video-disabled").toFile()
        try {
            val segmentFile = directory.resolve("segment.mp4").also { it.writeText("fixture") }
            val coordinator = RollingVideoClipCoordinator(directory, enabled = false)

            assertNull(coordinator.markTrigger(1_000L))
            assertNull(coordinator.onSegmentFinalized(segment(directory, "segment.mp4", 0L, 1_000L)))
            assertEquals(VideoClipState.DISABLED, coordinator.state())
            assertTrue(segmentFile.isFile)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `old rolling segments are pruned after a ready clip`() {
        val directory = Files.createTempDirectory("cyberfish-video-prune").toFile()
        try {
            val coordinator = RollingVideoClipCoordinator(directory, preRollMillis = 1_000L, postRollMillis = 1_000L, maxSegments = 3)
            val old = segment(directory, "old.mp4", 0L, 500L)
            coordinator.onSegmentFinalized(old)
            coordinator.onSegmentFinalized(segment(directory, "current.mp4", 500L, 1_500L))
            coordinator.markTrigger(1_000L)
            val result = coordinator.onSegmentFinalized(segment(directory, "after.mp4", 1_500L, 2_100L))

            assertEquals(VideoClipState.READY, result!!.state)
            assertTrue(!old.file.isFile)
            coordinator.releaseSegments(result.segments)
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun `single recorder segment exposes a local video path`() {
        val directory = Files.createTempDirectory("cyberfish-video-single").toFile()
        try {
            val coordinator = RollingVideoClipCoordinator(directory, preRollMillis = 0L, postRollMillis = 1_000L)
            coordinator.markTrigger(1_000L)
            val result = coordinator.onSegmentFinalized(segment(directory, "clip.mp4", 1_000L, 2_100L))

            assertEquals(VideoClipState.READY, result!!.state)
            assertEquals(directory.resolve("clip.mp4").absolutePath, result.videoPath)
        } finally {
            directory.deleteRecursively()
        }
    }

    private fun segment(directory: java.io.File, name: String, startedAtMillis: Long, endedAtMillis: Long) =
        VideoClipSegment(directory.resolve(name).also { it.writeText("fixture") }, startedAtMillis, endedAtMillis)
}

package com.cyberfish.app.capture

import java.io.File
import java.util.UUID

/**
 * Coordinates camera video segments without owning CameraX's recorder.
 * A recorder integration can feed finalized MP4 segments through [onSegmentFinalized].
 */
enum class VideoClipState {
    DISABLED,
    ROLLING,
    TRIGGERED,
    READY,
    EXPIRED,
}

data class VideoClipSegment(
    val file: File,
    val startedAtMillis: Long,
    val endedAtMillis: Long,
)

data class VideoClipResult(
    val clipId: String,
    val state: VideoClipState,
    val triggerAtMillis: Long,
    val preRollMillis: Long,
    val postRollMillis: Long,
    val segments: List<File>,
    val videoPath: String? = segments.singleOrNull()?.absolutePath,
)

class RollingVideoClipCoordinator(
    private val directory: File,
    private val preRollMillis: Long = DEFAULT_PRE_ROLL_MILLIS,
    private val postRollMillis: Long = DEFAULT_POST_ROLL_MILLIS,
    private val maxSegments: Int = DEFAULT_MAX_SEGMENTS,
    private val enabled: Boolean = true,
) {
    private val segments = ArrayDeque<VideoClipSegment>()
    private var trigger: TriggerWindow? = null
    private var state = if (enabled) VideoClipState.ROLLING else VideoClipState.DISABLED
    private var latestResult: VideoClipResult? = null

    init {
        require(preRollMillis >= 0L) { "preRollMillis must not be negative" }
        require(postRollMillis > 0L) { "postRollMillis must be positive" }
        require(maxSegments > 0) { "maxSegments must be positive" }
        if (enabled) directory.mkdirs()
    }

    @Synchronized
    fun state(): VideoClipState = state

    @Synchronized
    fun start() {
        if (!enabled) return
        segments.forEach { it.file.delete() }
        segments.clear()
        trigger = null
        latestResult = null
        state = VideoClipState.ROLLING
    }

    @Synchronized
    fun stop() {
        trigger = null
        segments.forEach { it.file.delete() }
        segments.clear()
        state = if (enabled) VideoClipState.EXPIRED else VideoClipState.DISABLED
    }

    @Synchronized
    fun markTrigger(triggerAtMillis: Long): String? {
        if (!enabled || state != VideoClipState.ROLLING) return null
        if (trigger != null) return trigger!!.clipId
        val clipId = "clip-${triggerAtMillis}-${UUID.randomUUID()}"
        trigger = TriggerWindow(clipId, triggerAtMillis)
        state = VideoClipState.TRIGGERED
        return clipId
    }

    @Synchronized
    fun nextSegmentFile(startedAtMillis: Long): File? {
        if (!enabled || state !in setOf(VideoClipState.ROLLING, VideoClipState.TRIGGERED)) {
            return null
        }
        directory.mkdirs()
        return File(directory, "segment-$startedAtMillis-${UUID.randomUUID()}.mp4")
    }

    /** Supplies finalized recorder segments and returns a ready clip when post-roll elapsed. */
    @Synchronized
    fun onSegmentFinalized(segment: VideoClipSegment): VideoClipResult? {
        if (!enabled || state !in setOf(VideoClipState.ROLLING, VideoClipState.TRIGGERED)) {
            return null
        }
        if (segment.endedAtMillis <= segment.startedAtMillis || !segment.file.isFile) return null
        segments += segment
        while (segments.size > maxSegments) {
            segments.removeFirst().file.delete()
        }
        val currentTrigger = trigger ?: run {
            pruneBefore(segment.endedAtMillis - preRollMillis)
            return null
        }
        if (segment.endedAtMillis < currentTrigger.triggerAtMillis + postRollMillis) return null
        val windowStart = currentTrigger.triggerAtMillis - preRollMillis
        val selected = segments
            .filter { it.endedAtMillis >= windowStart && it.startedAtMillis <= currentTrigger.triggerAtMillis + postRollMillis }
            .map(VideoClipSegment::file)
        val result = VideoClipResult(
            clipId = currentTrigger.clipId,
            state = VideoClipState.READY,
            triggerAtMillis = currentTrigger.triggerAtMillis,
            preRollMillis = preRollMillis,
            postRollMillis = postRollMillis,
            segments = selected,
        )
        latestResult = result
        trigger = null
        state = VideoClipState.READY
        pruneBefore(segment.endedAtMillis - preRollMillis)
        return result
    }

    @Synchronized
    fun latestResult(): VideoClipResult? = latestResult

    @Synchronized
    fun releaseSegments(files: Collection<File>) {
        segments.removeAll { it.file in files }
    }

    @Synchronized
    fun clearResult() {
        latestResult = null
        if (enabled) state = VideoClipState.ROLLING
    }

    @Synchronized
    fun clearFiles() {
        segments.forEach { it.file.delete() }
        segments.clear()
        latestResult?.segments?.forEach { it.delete() }
        latestResult = null
        trigger = null
        if (enabled) state = VideoClipState.ROLLING
    }

    private fun pruneBefore(startAtMillis: Long) {
        while (segments.firstOrNull()?.endedAtMillis?.let { it < startAtMillis } == true) {
            segments.removeFirst().file.delete()
        }
    }

    private data class TriggerWindow(val clipId: String, val triggerAtMillis: Long)

    companion object {
        const val DEFAULT_PRE_ROLL_MILLIS = 3_000L
        const val DEFAULT_POST_ROLL_MILLIS = 5_000L
        const val DEFAULT_MAX_SEGMENTS = 8
    }
}

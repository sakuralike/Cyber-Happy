package com.cyberfish.app.capture

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer

/** Merges recorder segments that share the same encoded video track. */
object VideoSegmentMerger {
    fun merge(segments: List<File>, output: File): File? {
        val inputs = segments.filter { it.isFile }
        if (inputs.isEmpty()) return null
        if (inputs.size == 1) return inputs.single()
        val extractors = mutableListOf<MediaExtractor>()
        var muxer: MediaMuxer? = null
        return runCatching {
            inputs.forEach { file ->
                MediaExtractor().also { it.setDataSource(file.absolutePath) }.let(extractors::add)
            }
            val first = extractors.first()
            val videoTrack = (0 until first.trackCount).firstOrNull {
                first.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
            }
                ?: return@runCatching null
            val videoFormat = first.getTrackFormat(videoTrack)
            output.parentFile?.mkdirs()
            output.delete()
            muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            val outputTrack = muxer!!.addTrack(videoFormat)
            muxer!!.start()
            val buffer = ByteBuffer.allocateDirect(1024 * 1024)
            val info = MediaCodec.BufferInfo()
            var offsetUs = 0L
            extractors.forEach { extractor ->
                val track = (0 until extractor.trackCount).firstOrNull {
                    extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
                }
                    ?: return@forEach
                extractor.selectTrack(track)
                var lastPts = 0L
                while (true) {
                    buffer.clear()
                    val sampleSize = extractor.readSampleData(buffer, 0)
                    if (sampleSize < 0) break
                    info.offset = 0
                    info.size = sampleSize
                    info.flags = 0
                    if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
                        info.flags = info.flags or MediaCodec.BUFFER_FLAG_KEY_FRAME
                    }
                    if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_PARTIAL_FRAME != 0) {
                        info.flags = info.flags or MediaCodec.BUFFER_FLAG_PARTIAL_FRAME
                    }
                    info.presentationTimeUs = extractor.sampleTime.coerceAtLeast(0L) + offsetUs
                    muxer!!.writeSampleData(outputTrack, buffer, info)
                    lastPts = extractor.sampleTime.coerceAtLeast(lastPts)
                    extractor.advance()
                }
                offsetUs += lastPts + 1_000L
                extractor.unselectTrack(track)
            }
            output.takeIf { it.isFile && it.length() > 0L }
        }.getOrNull().also {
            extractors.forEach { runCatching { it.release() } }
            runCatching { muxer?.stop() }
            runCatching { muxer?.release() }
            if (it == null) output.delete()
        }
    }
}

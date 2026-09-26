package com.cyberfish.app.ui.screens

import com.cyberfish.app.capture.NormalizedPreviewRect
import com.cyberfish.app.capture.DisplayDetection
import com.cyberfish.app.capture.DetectionTrackingMetrics
import com.cyberfish.app.capture.FrameMetrics
import com.cyberfish.app.capture.PreviewRect
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.DetectionBounds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CameraPreviewCardTest {
    @Test
    fun `detection telemetry shows current baseline and change`() {
        val display = DisplayDetection(
            boundsInPreview = PreviewRect(10f, 20f, 34f, 56f),
            confidence = 0.82f,
        )
        val tracking = DetectionTrackingMetrics(
            confidence = 0.82f,
            widthRatioFromBaseline = 1f,
            heightRatioFromBaseline = 1.5f,
            areaRatioFromBaseline = 1.5f,
        )

        assertEquals(
            "浮漂 82% · 当前高 36px · 基准高 24px · +50%",
            formatDetectionTelemetry(display, tracking),
        )
    }

    @Test
    fun `performance telemetry exposes split timings and input size`() {
        val metrics = FrameMetrics(
            detection = Detection(DetectionBounds(0f, 0f, 1f, 1f), 0.8f),
            framesPerSecond = 15,
            latencyMillis = 78L,
            timestampMillis = 1L,
            sourceWidthPx = 1280,
            sourceHeightPx = 720,
            preprocessingMillis = 8L,
            inferenceMillis = 66L,
        )

        assertEquals(
            "分析 1280×720 · 模型输入 640²",
            formatInputTelemetry(metrics, 640),
        )
        assertEquals(
            "预处理 8ms · 推理 66ms · 总计 78ms · 15 FPS",
            formatPerformanceTelemetry(metrics),
        )
    }

    @Test
    fun `detection telemetry has an explicit empty state`() {
        assertEquals("暂无检测", formatDetectionTelemetry(null, null))
    }

    @Test
    fun `detection telemetry distinguishes an untracked candidate`() {
        val display = DisplayDetection(
            boundsInPreview = PreviewRect(10f, 20f, 34f, 56f),
            confidence = 0.42f,
        )

        assertEquals(
            "浮漂 42% · 当前高 36px · 基准建立中",
            formatDetectionTelemetry(display, null),
        )
    }

    @Test
    fun `detection size label uses visible pixel dimensions`() {
        assertEquals("W 48 × H 132 px", formatDetectionSize(48.4f, 131.6f))
    }

    @Test
    fun `detection size label does not expose negative dimensions`() {
        assertEquals("W 0 × H 0 px", formatDetectionSize(-2f, -1f))
    }

    @Test
    fun `drag coordinates normalize and clamp to the preview`() {
        assertEquals(
            NormalizedPreviewRect(0.1f, 0.2f, 0.8f, 0.9f),
            normalizedPreviewRectForDrag(
                startX = 80f,
                startY = 160f,
                endX = 640f,
                endY = 720f,
                widthPx = 800f,
                heightPx = 800f,
            ),
        )
    }

    @Test
    fun `drag with empty preview has no region`() {
        assertNull(
            normalizedPreviewRectForDrag(
                startX = 0f,
                startY = 0f,
                endX = 10f,
                endY = 10f,
                widthPx = 0f,
                heightPx = 100f,
            ),
        )
    }
}

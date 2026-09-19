package com.cyberfish.app.ui.screens

import androidx.camera.view.PreviewView
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.alert.AlertPreferences
import com.cyberfish.app.alert.AndroidAlertNotifier
import com.cyberfish.app.capture.CameraFrameSource
import com.cyberfish.app.capture.CaptureStatus
import com.cyberfish.app.capture.AspectRatioDetectionCoordinateMapper
import com.cyberfish.app.capture.FrameGeometry
import com.cyberfish.app.capture.PreviewScaleType
import com.cyberfish.app.capture.FrameMetrics
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.MockDetector
import com.cyberfish.app.inference.Detector
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.trigger.TriggerConfig
import com.cyberfish.app.trigger.TriggerPipeline
import com.cyberfish.app.ui.theme.ChartPalette
import com.cyberfish.app.ui.theme.CameraPanel
import java.io.File
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.roundToInt

@Composable
fun CameraPreviewCard(
    monitoring: Boolean,
    permissionGranted: Boolean,
    permissionDenied: Boolean,
    triggerConfig: TriggerConfig,
    alertPreferences: AlertPreferences,
    onTrigger: (TriggerEvent) -> Unit,
    onFrameMetrics: (FrameMetrics) -> Unit = {},
    detector: Detector = MockDetector(),
) {
    val context = LocalContext.current
    val lifecycleOwner = context.findLifecycleOwner()
    val mainExecutor = remember(context) { ContextCompat.getMainExecutor(context) }
    val currentOnTrigger = rememberUpdatedState(onTrigger)
    val snapshotDir = remember(context) { File(context.filesDir, "media") }
    val latestSnapshot = remember { AtomicReference<File?>(null) }
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    var metrics by remember { mutableStateOf<FrameMetrics?>(null) }
    var lastTelemetryAt by remember { mutableStateOf(0L) }
    var captureStatus by remember { mutableStateOf(CaptureStatus.Idle) }
    var maxZoomRatio by remember { mutableFloatStateOf(1f) }
    var selectedZoomRatio by rememberSaveable { mutableFloatStateOf(1f) }
    val notifier = remember(context, alertPreferences) { AndroidAlertNotifier(context.applicationContext, alertPreferences) }
    val triggerPipeline = remember(triggerConfig, notifier, detector) {
        TriggerPipeline(config = triggerConfig) { event ->
            mainExecutor.execute {
                notifier.alert(event)
                val snapshotPath = latestSnapshot.get()?.let { copySnapshot(it, snapshotDir, event.timestampMillis) }
                currentOnTrigger.value(event.copy(modelVersion = detector.modelVersion, snapshotPath = snapshotPath))
            }
        }
    }
    val frameSource = remember(triggerPipeline, detector) {
        CameraFrameSource(
            context = context.applicationContext,
            detector = detector,
            onFrame = {
                metrics = it
                if (it.timestampMillis - lastTelemetryAt >= 5_000L) {
                    lastTelemetryAt = it.timestampMillis
                    onFrameMetrics(it)
                }
            },
            onStatusChanged = { captureStatus = it },
            onDetection = { detection, timestampMillis -> triggerPipeline.accept(detection, timestampMillis) },
            snapshotDir = snapshotDir,
            onSnapshotReady = { latestSnapshot.set(it) },
            onZoomCapabilitiesChanged = { maxZoom ->
                maxZoomRatio = maxZoom.coerceAtLeast(1f)
                if (selectedZoomRatio > maxZoomRatio) selectedZoomRatio = 1f
            },
        )
    }

    LaunchedEffect(captureStatus, selectedZoomRatio, maxZoomRatio, frameSource) {
        if (captureStatus == CaptureStatus.Running) frameSource.setZoomRatio(selectedZoomRatio)
    }

    DisposableEffect(frameSource) {
        onDispose {
            frameSource.close()
            triggerPipeline.reset()
        }
    }
    DisposableEffect(monitoring, permissionGranted, lifecycleOwner, previewView, frameSource) {
        if (monitoring && permissionGranted && previewView != null && lifecycleOwner != null) {
            frameSource.start(lifecycleOwner, previewView!!)
        } else {
            frameSource.stop()
            triggerPipeline.reset()
            metrics = null
        }
        onDispose {
            frameSource.stop()
            triggerPipeline.reset()
        }
    }

    val status = monitorStatus(monitoring, permissionGranted, permissionDenied, captureStatus, metrics?.detection)
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).testTag("camera-preview"),
        colors = CardDefaults.cardColors(containerColor = CameraPanel),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(modifier = Modifier.fillMaxWidth().height(264.dp).clip(RoundedCornerShape(20.dp))) {
                if (permissionGranted) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = {
                            PreviewView(it).apply {
                                scaleType = PreviewView.ScaleType.FILL_CENTER
                                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                            }
                        },
                        update = { previewView = it },
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(CameraPanel))
                }

                DetectionOverlay(metrics)
            }

            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                PreviewStatus(
                    modifier = Modifier.fillMaxWidth(),
                    status = status,
                    metrics = metrics,
                    modelVersion = detector.modelVersion,
                    captureStatus = captureStatus,
                )
                ZoomControls(
                    modifier = Modifier.fillMaxWidth(),
                    selectedZoomRatio = selectedZoomRatio,
                    maxZoomRatio = maxZoomRatio,
                    enabled = permissionGranted,
                    onZoomSelected = { ratio ->
                        selectedZoomRatio = ratio.coerceIn(1f, maxZoomRatio)
                        frameSource.setZoomRatio(selectedZoomRatio)
                    },
                )
                if (!permissionGranted || !monitoring || captureStatus == CaptureStatus.Failed) {
                    PreviewState(Modifier.fillMaxWidth().padding(vertical = 4.dp), status)
                }
            }
        }
    }
}

@Composable
private fun ZoomControls(
    modifier: Modifier,
    selectedZoomRatio: Float,
    maxZoomRatio: Float,
    enabled: Boolean,
    onZoomSelected: (Float) -> Unit,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        listOf(1f, 2f, 3f).forEach { ratio ->
            FilterChip(
                selected = selectedZoomRatio == ratio,
                onClick = { onZoomSelected(ratio) },
                enabled = enabled && ratio <= maxZoomRatio + 0.001f,
                label = { Text("${ratio.toInt()}x") },
            )
        }
    }
}

private fun Context.findLifecycleOwner(): LifecycleOwner? = when (this) {
    is LifecycleOwner -> this
    is ContextWrapper -> baseContext.findLifecycleOwner()
    else -> null
}

private fun copySnapshot(source: File, directory: File, timestampMillis: Long): String? = runCatching {
    if (!source.isFile) return@runCatching null
    directory.mkdirs()
    val target = File(directory, "trigger-$timestampMillis.jpg")
    source.inputStream().use { input -> target.outputStream().use { output -> input.copyTo(output) } }
    target.absolutePath
}.getOrNull()

@Composable
private fun DetectionOverlay(metrics: FrameMetrics?) {
    val density = LocalDensity.current
    androidx.compose.foundation.layout.BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val previewWidthPx = with(density) { maxWidth.toPx() }
        val previewHeightPx = with(density) { maxHeight.toPx() }
        val displayDetection = metrics?.detection?.let { detection ->
            AspectRatioDetectionCoordinateMapper().map(
                detection,
                FrameGeometry(
                    sourceWidthPx = metrics.sourceWidthPx,
                    sourceHeightPx = metrics.sourceHeightPx,
                    previewWidthPx = previewWidthPx,
                    previewHeightPx = previewHeightPx,
                    scaleType = PreviewScaleType.CENTER_CROP,
                ),
            )
        }
        Canvas(modifier = Modifier.fillMaxSize()) {
            displayDetection?.boundsInPreview?.let { bounds ->
                drawRect(
                    color = ChartPalette.TraceAccent,
                    topLeft = Offset(bounds.left, bounds.top),
                    size = Size(bounds.width, bounds.height),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3f),
                )
            }
        }
        displayDetection?.let { display ->
            val labelWidthPx = with(density) { 104.dp.toPx() }
            val gapPx = with(density) { 8.dp.toPx() }
            val labelX = if (display.boundsInPreview.right + gapPx + labelWidthPx <= previewWidthPx) {
                display.boundsInPreview.right + gapPx
            } else {
                (display.boundsInPreview.left - gapPx - labelWidthPx).coerceAtLeast(0f)
            }
            val labelY = display.boundsInPreview.top.coerceIn(0f, (previewHeightPx - with(density) { 28.dp.toPx() }).coerceAtLeast(0f))
            Text(
                text = formatDetectionSize(display.widthPx, display.heightPx),
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier
                    .offset { IntOffset(labelX.roundToInt(), labelY.roundToInt()) }
                    .background(Color.Black.copy(alpha = 0.72f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 5.dp, vertical = 3.dp),
                maxLines = 1,
            )
        }
    }
}

internal fun formatDetectionSize(widthPx: Float, heightPx: Float): String =
    "W ${widthPx.coerceAtLeast(0f).roundToInt()} × H ${heightPx.coerceAtLeast(0f).roundToInt()} px"

@Composable
private fun PreviewState(modifier: Modifier, status: String) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Filled.PlayArrow,
            contentDescription = null,
            modifier = Modifier.size(36.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            status,
            modifier = Modifier.padding(top = 8.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.titleMedium,
        )
    }
}

@Composable
private fun PreviewStatus(
    modifier: Modifier,
    status: String,
    metrics: FrameMetrics?,
    modelVersion: String,
    captureStatus: CaptureStatus,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(status, style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (captureStatus == CaptureStatus.Running) "$modelVersion · 检测中" else "$modelVersion · 待机",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Text(
                    metrics?.let { "${it.framesPerSecond} FPS · ${it.latencyMillis}ms" } ?: "FPS -- · --ms",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
            Text(
                metrics?.detection?.let { "检测置信度 %.0f%%".format(it.confidence * 100) } ?: "后置相机",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

private fun monitorStatus(
    monitoring: Boolean,
    permissionGranted: Boolean,
    permissionDenied: Boolean,
    captureStatus: CaptureStatus,
    detection: Detection?,
) = when {
    !permissionGranted && permissionDenied -> "相机权限已拒绝"
    !permissionGranted -> "需要相机权限"
    !monitoring -> "待机"
    captureStatus == CaptureStatus.Failed -> "相机不可用"
    captureStatus == CaptureStatus.Starting -> "连接后置相机"
    detection == null -> "漂目丢失"
    else -> "漂浮稳定"
}

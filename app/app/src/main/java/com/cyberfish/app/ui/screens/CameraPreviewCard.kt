package com.cyberfish.app.ui.screens

import androidx.camera.view.PreviewView
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.alert.AlertPreferences
import com.cyberfish.app.alert.AndroidAlertNotifier
import com.cyberfish.app.capture.CameraFrameSource
import com.cyberfish.app.capture.CaptureStatus
import com.cyberfish.app.capture.DefaultDetectionModeController
import com.cyberfish.app.capture.DetectionMode
import com.cyberfish.app.capture.DetectionModeEffect
import com.cyberfish.app.capture.DetectionModeIntent
import com.cyberfish.app.capture.DetectionModeSnapshot
import com.cyberfish.app.capture.DetectionRegionState
import com.cyberfish.app.capture.DetectionTrackingMetrics
import com.cyberfish.app.capture.FrameMetrics
import com.cyberfish.app.capture.NormalizedPreviewRect
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.UnavailableDetector
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
    detector: Detector = UnavailableDetector(),
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
    val detectionModeController = remember { DefaultDetectionModeController() }
    var detectionModeSnapshot by remember { mutableStateOf(detectionModeController.snapshot()) }
    var lastPreviewSize by remember { mutableStateOf(IntSize.Zero) }
    var geometryEpoch by remember { mutableLongStateOf(detectionModeSnapshot.geometryEpoch) }
    val notifier = remember(context, alertPreferences) { AndroidAlertNotifier(context.applicationContext, alertPreferences) }
    val triggerPipeline = remember(triggerConfig, notifier, detector) {
        TriggerPipeline(
            config = triggerConfig,
            onTrigger = { event ->
                mainExecutor.execute {
                    val snapshotPath = latestSnapshot.get()?.let { copySnapshot(it, snapshotDir, event.timestampMillis) }
                    currentOnTrigger.value(event.copy(modelVersion = detector.modelVersion, snapshotPath = snapshotPath))
                }
            },
            onAlert = { event ->
                mainExecutor.execute {
                    notifier.alert(event)
                }
            },
        )
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
            onDetection = { detection, timestampMillis ->
                triggerPipeline.accept(detection, timestampMillis)?.let { snapshot ->
                    DetectionTrackingMetrics(
                        confidence = snapshot.confidence,
                        widthRatioFromBaseline = snapshot.bboxWidthRatioFromBaseline,
                        heightRatioFromBaseline = snapshot.bboxHeightRatioFromBaseline,
                        areaRatioFromBaseline = snapshot.bboxAreaRatioFromBaseline,
                    )
                }
            },
            snapshotDir = snapshotDir,
            onSnapshotReady = { latestSnapshot.set(it) },
            onZoomCapabilitiesChanged = { maxZoom ->
                maxZoomRatio = maxZoom.coerceAtLeast(1f)
                if (selectedZoomRatio > maxZoomRatio) selectedZoomRatio = 1f
            },
            onDetectionReset = {
                triggerPipeline.reset()
            },
        )
    }

    fun dispatchModeIntent(intent: DetectionModeIntent) {
        val previous = detectionModeSnapshot
        val effect = detectionModeController.dispatch(intent)
        val next = detectionModeController.snapshot()
        detectionModeSnapshot = next
        if (
            effect == DetectionModeEffect.ResetTracking ||
            effect == DetectionModeEffect.SuspendTrigger ||
            previous.mode != next.mode ||
            previous.state != next.state ||
            previous.region != next.region ||
            previous.revision != next.revision
        ) {
            triggerPipeline.reset()
            metrics = metrics?.copy(trackingMetrics = null)
        }
    }

    SideEffect { frameSource.setDetectionMode(detectionModeSnapshot) }

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
        modifier = Modifier.fillMaxWidth().testTag("camera-preview"),
        colors = CardDefaults.cardColors(containerColor = CameraPanel),
        shape = RoundedCornerShape(0.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(264.dp)
                    .onSizeChanged { size ->
                        if (size != lastPreviewSize && size.width > 0 && size.height > 0) {
                            lastPreviewSize = size
                            geometryEpoch += 1L
                            dispatchModeIntent(DetectionModeIntent.GeometryChanged(geometryEpoch))
                            previewView?.let(frameSource::refreshPreviewGeometry)
                        }
                    }
                    .clip(RoundedCornerShape(0.dp)),
            ) {
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
                DetectionRegionOverlay(
                    snapshot = detectionModeSnapshot,
                    onDraftChanged = { region ->
                        dispatchModeIntent(DetectionModeIntent.UpdateDraft(region))
                    },
                )
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
                    detectorInputSize = detector.inputSize,
                )
                DetectionModeControls(
                    modifier = Modifier.fillMaxWidth(),
                    snapshot = detectionModeSnapshot,
                    onIntent = { intent -> dispatchModeIntent(intent) },
                    selectedZoomRatio = selectedZoomRatio,
                    maxZoomRatio = maxZoomRatio,
                    zoomEnabled = permissionGranted,
                    onZoomSelected = { ratio ->
                        val nextRatio = ratio.coerceIn(1f, maxZoomRatio)
                        if (selectedZoomRatio != nextRatio) {
                            selectedZoomRatio = nextRatio
                            triggerPipeline.reset()
                            metrics = metrics?.copy(trackingMetrics = null)
                            previewView?.let(frameSource::refreshPreviewGeometry)
                        }
                        frameSource.setZoomRatio(nextRatio)
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
private fun DetectionModeControls(
    modifier: Modifier,
    snapshot: DetectionModeSnapshot,
    onIntent: (DetectionModeIntent) -> Unit,
    selectedZoomRatio: Float,
    maxZoomRatio: Float,
    zoomEnabled: Boolean,
    onZoomSelected: (Float) -> Unit,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilterChip(
                modifier = Modifier.weight(1f).testTag("detection-mode-intelligent"),
                selected = snapshot.mode == DetectionMode.Intelligent,
                onClick = { onIntent(DetectionModeIntent.SelectMode(DetectionMode.Intelligent)) },
                label = { Text("智能") },
            )
            FilterChip(
                modifier = Modifier.weight(1f).testTag("detection-mode-manual"),
                selected = snapshot.mode == DetectionMode.ManualRegion,
                onClick = { onIntent(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion)) },
                label = { Text("框选") },
            )
            listOf(1f, 2f, 3f).forEach { ratio ->
                FilterChip(
                    modifier = Modifier.weight(1f),
                    selected = selectedZoomRatio == ratio,
                    onClick = { onZoomSelected(ratio) },
                    enabled = zoomEnabled && ratio <= maxZoomRatio + 0.001f,
                    label = { Text("${ratio.toInt()}x") },
                )
            }
        }
        if (snapshot.mode == DetectionMode.ManualRegion) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                when (snapshot.state) {
                    DetectionRegionState.Editing -> {
                        val validDraft = snapshot.draft?.let(::isUsableDetectionRegion) == true
                        Button(
                            modifier = Modifier.testTag("detection-region-confirm"),
                            onClick = { onIntent(DetectionModeIntent.ConfirmSelection) },
                            enabled = validDraft,
                        ) { Text("确认") }
                        TextButton(
                            modifier = Modifier.testTag("detection-region-cancel"),
                            onClick = { onIntent(DetectionModeIntent.CancelSelection) },
                        ) { Text("取消") }
                    }

                    else -> {
                        Button(
                            modifier = Modifier.testTag("detection-region-edit"),
                            onClick = { onIntent(DetectionModeIntent.BeginSelection) },
                        ) {
                            Text(if (snapshot.region == null) "开始框选" else "编辑区域")
                        }
                        if (snapshot.region != null) {
                            TextButton(
                                modifier = Modifier.testTag("detection-region-clear"),
                                onClick = { onIntent(DetectionModeIntent.ClearSelection) },
                            ) { Text("清除") }
                        }
                    }
                }
            }
            when (snapshot.state) {
                DetectionRegionState.Empty ->
                    Text(
                        "请在画面内拖动框选监测区域",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )

                DetectionRegionState.NeedsReview ->
                    Text(
                        "画面变化，请重新确认区域",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )

                DetectionRegionState.Editing,
                DetectionRegionState.Applied,
                DetectionRegionState.Intelligent,
                -> Unit
            }
        }
    }
}

@Composable
private fun DetectionRegionOverlay(
    snapshot: DetectionModeSnapshot,
    onDraftChanged: (NormalizedPreviewRect?) -> Unit,
) {
    val editing = snapshot.mode == DetectionMode.ManualRegion && snapshot.state == DetectionRegionState.Editing
    val currentOnDraftChanged = rememberUpdatedState(onDraftChanged)
    val appliedColor = MaterialTheme.colorScheme.primary.copy(alpha = if (editing) 0.42f else 0.9f)
    val draftColor = MaterialTheme.colorScheme.tertiary
    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .testTag("detection-region-overlay")
            .pointerInput(snapshot.mode, snapshot.state, snapshot.revision) {
                if (editing) {
                    var start: Offset? = null
                    detectDragGestures(
                        onDragStart = { position ->
                            start = position
                            currentOnDraftChanged.value(null)
                        },
                        onDrag = { change, _ ->
                            val origin = start ?: return@detectDragGestures
                            val candidate = normalizedPreviewRectForDrag(
                                startX = origin.x,
                                startY = origin.y,
                                endX = change.position.x,
                                endY = change.position.y,
                                widthPx = size.width.toFloat(),
                                heightPx = size.height.toFloat(),
                            )
                            change.consume()
                            currentOnDraftChanged.value(candidate)
                        },
                        onDragEnd = { start = null },
                        onDragCancel = { start = null },
                    )
                }
            },
    ) {
        val applied = snapshot.region
        if (applied != null) {
            drawNormalizedRegion(
                region = applied,
                color = appliedColor,
                widthPx = size.width.toFloat(),
                heightPx = size.height.toFloat(),
            )
        }
        if (editing) {
            snapshot.draft?.let { draft ->
                drawNormalizedRegion(
                    region = draft,
                    color = draftColor,
                    widthPx = size.width.toFloat(),
                    heightPx = size.height.toFloat(),
                )
            }
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawNormalizedRegion(
    region: NormalizedPreviewRect,
    color: Color,
    widthPx: Float,
    heightPx: Float,
) {
    drawRect(
        color = color,
        topLeft = Offset(region.left * widthPx, region.top * heightPx),
        size = Size(region.width * widthPx, region.height * heightPx),
        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3f),
    )
}

internal fun normalizedPreviewRectForDrag(
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    widthPx: Float,
    heightPx: Float,
): NormalizedPreviewRect? {
    if (!widthPx.isFinite() || !heightPx.isFinite() || widthPx <= 0f || heightPx <= 0f) return null
    return NormalizedPreviewRect.fromUnordered(
        startX = startX / widthPx,
        startY = startY / heightPx,
        endX = endX / widthPx,
        endY = endY / heightPx,
    )
}

private fun isUsableDetectionRegion(region: NormalizedPreviewRect): Boolean =
    region.width >= MINIMUM_REGION_SIZE && region.height >= MINIMUM_REGION_SIZE

private const val MINIMUM_REGION_SIZE = 0.05f

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
        val displayDetection = metrics?.displayDetection
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
    detectorInputSize: Int,
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
            }
            Text(
                formatDetectionTelemetry(metrics?.displayDetection, metrics?.trackingMetrics),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                formatInputTelemetry(metrics, detectorInputSize),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                formatPerformanceTelemetry(metrics),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

internal fun formatDetectionTelemetry(
    displayDetection: com.cyberfish.app.capture.DisplayDetection?,
    trackingMetrics: DetectionTrackingMetrics?,
): String {
    if (displayDetection == null) return "暂无检测"
    val currentHeight = displayDetection.heightPx.coerceAtLeast(0f).roundToInt()
    if (trackingMetrics == null) {
        return "浮漂 %.0f%% · 当前高 %dpx · 基准建立中".format(
            displayDetection.confidence * 100f,
            currentHeight,
        )
    }
    val ratio = trackingMetrics.heightRatioFromBaseline
    if (!ratio.isFinite() || ratio <= 0f) return "浮漂检测中 · 基准建立中"
    val baselineHeight = (displayDetection.heightPx / ratio).coerceAtLeast(0f).roundToInt()
    val deltaPercent = ((ratio - 1f) * 100f).roundToInt()
    val signedDelta = if (deltaPercent >= 0) "+$deltaPercent%" else "$deltaPercent%"
    return "浮漂 %.0f%% · 当前高 %dpx · 基准高 %dpx · %s".format(
        trackingMetrics.confidence * 100f,
        currentHeight,
        baselineHeight,
        signedDelta,
    )
}

internal fun formatInputTelemetry(metrics: FrameMetrics?, detectorInputSize: Int): String =
    if (metrics == null) "分析 -- · 模型输入 ${detectorInputSize}²"
    else "分析 ${metrics.sourceWidthPx}×${metrics.sourceHeightPx} · 模型输入 ${detectorInputSize}²"

internal fun formatPerformanceTelemetry(metrics: FrameMetrics?): String {
    if (metrics == null) return "预处理 -- · 推理 -- · 总计 -- · FPS --"
    return "预处理 ${metrics.preprocessingMillis}ms · 推理 ${metrics.inferenceMillis}ms · " +
        "总计 ${metrics.latencyMillis}ms · ${metrics.framesPerSecond} FPS"
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

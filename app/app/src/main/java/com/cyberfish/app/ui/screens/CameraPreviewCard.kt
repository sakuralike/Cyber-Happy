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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.cyberfish.app.alert.AlertPreferences
import com.cyberfish.app.alert.AndroidAlertNotifier
import com.cyberfish.app.capture.CameraFrameSource
import com.cyberfish.app.capture.CaptureStatus
import com.cyberfish.app.capture.FrameMetrics
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.MockDetector
import com.cyberfish.app.inference.Detector
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.trigger.TriggerConfig
import com.cyberfish.app.trigger.TriggerPipeline
import com.cyberfish.app.ui.components.StatusChip

@Composable
fun CameraPreviewCard(
    monitoring: Boolean,
    permissionGranted: Boolean,
    permissionDenied: Boolean,
    triggerConfig: TriggerConfig,
    alertPreferences: AlertPreferences,
    onTrigger: (TriggerEvent) -> Unit,
    detector: Detector = MockDetector(),
) {
    val context = LocalContext.current
    val lifecycleOwner = context.findLifecycleOwner()
    val mainExecutor = remember(context) { ContextCompat.getMainExecutor(context) }
    val currentOnTrigger = rememberUpdatedState(onTrigger)
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    var metrics by remember { mutableStateOf<FrameMetrics?>(null) }
    var captureStatus by remember { mutableStateOf(CaptureStatus.Idle) }
    val notifier = remember(context, alertPreferences) { AndroidAlertNotifier(context.applicationContext, alertPreferences) }
    val triggerPipeline = remember(triggerConfig, notifier) {
        TriggerPipeline(config = triggerConfig) { event ->
            mainExecutor.execute {
                notifier.alert(event)
                currentOnTrigger.value(event)
            }
        }
    }
    val frameSource = remember(triggerPipeline, detector) {
        CameraFrameSource(
            context = context.applicationContext,
            detector = detector,
            onFrame = { metrics = it },
            onStatusChanged = { captureStatus = it },
            onDetection = { detection, timestampMillis -> triggerPipeline.accept(detection, timestampMillis) },
        )
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
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(22.dp),
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(264.dp).clip(RoundedCornerShape(22.dp))) {
            if (permissionGranted) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { PreviewView(it) },
                    update = { previewView = it },
                )
            } else {
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant))
            }

            DetectionOverlay(metrics?.detection)
            PreviewHud(metrics, captureStatus, detector.modelVersion)
            if (!permissionGranted || !monitoring || captureStatus == CaptureStatus.Failed) {
                PreviewState(Modifier.align(Alignment.Center), status)
            }
            PreviewStatus(Modifier.align(Alignment.BottomCenter), status, metrics, detector.modelVersion)
        }
    }
}

private fun Context.findLifecycleOwner(): LifecycleOwner? = when (this) {
    is LifecycleOwner -> this
    is ContextWrapper -> baseContext.findLifecycleOwner()
    else -> null
}

@Composable
private fun DetectionOverlay(detection: Detection?) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val baselineY = size.height * 0.66f
        val thresholdY = size.height * 0.45f
        drawLine(Color(0xFF1FD3A3), Offset(0f, baselineY), Offset(size.width, baselineY), 3f, StrokeCap.Round)
        drawLine(Color(0xFFFFB74D), Offset(0f, thresholdY), Offset(size.width, thresholdY), 2f, StrokeCap.Round)
        detection?.let {
            val bounds = it.bounds
            val left = bounds.left * size.width
            val top = bounds.top * size.height
            val width = (bounds.right - bounds.left) * size.width
            val height = (bounds.bottom - bounds.top) * size.height
            drawRect(
                color = Color(0xFF49E5C0),
                topLeft = Offset(left, top),
                size = Size(width, height),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3f),
            )
        }
    }
}

@Composable
private fun PreviewHud(metrics: FrameMetrics?, captureStatus: CaptureStatus, modelVersion: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        StatusChip(
            text = metrics?.let { "FPS ${it.framesPerSecond} · ${it.latencyMillis}ms" } ?: "FPS -- · --ms",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        StatusChip(
            text = if (captureStatus == CaptureStatus.Running) "$modelVersion · 检测中" else "$modelVersion · 待机",
            color = MaterialTheme.colorScheme.secondary,
        )
    }
}

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
private fun PreviewStatus(modifier: Modifier, status: String, metrics: FrameMetrics?, modelVersion: String) {
    Surface(
        modifier = modifier.fillMaxWidth().padding(12.dp),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(status, style = MaterialTheme.typography.titleMedium)
                Text(
                    metrics?.detection?.let { "检测置信度 %.0f%%".format(it.confidence * 100) } ?: "后置相机 · $modelVersion",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Text(
                metrics?.let { "${it.framesPerSecond} FPS" } ?: "-- FPS",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
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

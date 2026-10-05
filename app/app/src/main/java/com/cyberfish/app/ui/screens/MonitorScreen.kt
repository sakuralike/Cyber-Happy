package com.cyberfish.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import android.os.SystemClock
import com.cyberfish.app.alert.AlertPreferences
import com.cyberfish.app.capture.CaptureStatus
import com.cyberfish.app.capture.FrameMetrics
import com.cyberfish.app.capture.VideoClipResult
import com.cyberfish.app.trigger.TriggerConfig
import com.cyberfish.app.ui.components.MetricCard
import com.cyberfish.app.ui.components.ScreenTitle
import com.cyberfish.app.ui.components.SectionCard
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.inference.Detector
import com.cyberfish.app.inference.NcnnRuntimeOptions
import com.cyberfish.app.inference.UnavailableDetector
import kotlinx.coroutines.isActive

@Composable
fun MonitorScreen(
    permissionRevision: Int = 0,
    onOpenSettings: () -> Unit,
    triggerConfig: TriggerConfig,
    alertPreferences: AlertPreferences,
    onTriggerPersist: (TriggerEvent) -> Unit,
    onMarkFalsePositive: (TriggerEvent) -> Unit,
    isLoggedIn: Boolean = true,
    onRequireLogin: () -> Unit = {},
    onFrameMetrics: (FrameMetrics) -> Unit = {},
    onVideoClipReady: (VideoClipResult) -> Unit = {},
    onConfidenceThresholdChange: (Float) -> Unit = {},
    runtimeOptions: NcnnRuntimeOptions = NcnnRuntimeOptions.forPerformanceMode(NcnnRuntimeOptions.MODE_STANDARD),
    detector: Detector = UnavailableDetector(),
) {
    val context = LocalContext.current
    var permissionGranted by rememberSaveable { mutableStateOf(hasCameraPermission(context)) }
    var permissionDenied by rememberSaveable { mutableStateOf(false) }
    var monitoring by rememberSaveable { mutableStateOf(permissionGranted) }
    var captureStatus by remember { mutableStateOf(CaptureStatus.Idle) }
    var monitorSessionId by rememberSaveable { mutableStateOf(0L) }
    var monitorStartedAtElapsed by rememberSaveable { mutableStateOf(0L) }
    var elapsedSeconds by rememberSaveable { mutableStateOf(0L) }
    var liveFrameMetrics by remember { mutableStateOf<FrameMetrics?>(null) }
    var triggerEvent by remember { mutableStateOf<TriggerEvent?>(null) }
    var pendingMisreportEvent by remember { mutableStateOf<TriggerEvent?>(null) }
    var falsePositiveMarked by rememberSaveable { mutableStateOf(false) }
    var showLoginRequired by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionGranted = granted
        permissionDenied = !granted
        monitoring = granted
    }
    LaunchedEffect(permissionRevision) {
        val granted = hasCameraPermission(context)
        permissionGranted = granted
        permissionDenied = !granted
        if (granted) monitoring = true
    }
    LaunchedEffect(monitorSessionId, captureStatus, monitorStartedAtElapsed) {
        if (captureStatus != CaptureStatus.Running || monitorStartedAtElapsed == 0L) return@LaunchedEffect
        while (isActive) {
            elapsedSeconds = ((SystemClock.elapsedRealtime() - monitorStartedAtElapsed) / 1_000L).coerceAtLeast(0L)
            kotlinx.coroutines.delay(1_000L)
        }
    }
    val monitorSubtitle by remember {
        derivedStateOf {
            if (captureStatus == CaptureStatus.Running) {
                "漂浮稳定  ·  已运行 ${formatElapsedDuration(elapsedSeconds)}"
            } else if (captureStatus == CaptureStatus.Starting) {
                "监控启动中  ·  尚未开始计时"
            } else if (captureStatus == CaptureStatus.Stopping) {
                "正在停止监控  ·  ${formatElapsedDuration(elapsedSeconds)}"
            } else if (monitorStartedAtElapsed != 0L) {
                "监控已停止  ·  本次运行 ${formatElapsedDuration(elapsedSeconds)}"
            } else {
                "监控待机  ·  尚未开始"
            }
        }
    }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { ScreenTitle("实时监控", monitorSubtitle, actionIcon = Icons.Filled.Settings, actionDescription = "打开设置", onAction = onOpenSettings) }
        item {
            CameraPreviewCard(
                monitoring = monitoring,
                permissionGranted = permissionGranted,
                permissionDenied = permissionDenied,
                triggerConfig = triggerConfig,
                alertPreferences = alertPreferences,
                detector = detector,
                onFrameMetrics = onFrameMetrics,
                onLiveFrameMetrics = { liveFrameMetrics = it },
                onCaptureStatusChanged = { status ->
                    captureStatus = status
                    when (status) {
                        CaptureStatus.Starting -> {
                            monitorSessionId += 1L
                            monitorStartedAtElapsed = 0L
                            elapsedSeconds = 0L
                        }
                        CaptureStatus.Running -> {
                            if (monitorStartedAtElapsed == 0L) {
                                monitorStartedAtElapsed = SystemClock.elapsedRealtime()
                            }
                        }
                        CaptureStatus.Stopping -> Unit
                        CaptureStatus.Idle, CaptureStatus.Failed -> {
                            if (monitorStartedAtElapsed != 0L) {
                                elapsedSeconds = ((SystemClock.elapsedRealtime() - monitorStartedAtElapsed) / 1_000L).coerceAtLeast(0L)
                            }
                        }
                    }
                },
                onVideoClipReady = onVideoClipReady,
                runtimeOptions = runtimeOptions,
                onTrigger = {
                    triggerEvent = it
                    falsePositiveMarked = false
                    onTriggerPersist(it)
                },
            )
        }
        item {
            Button(
                onClick = {
                    if (permissionGranted) {
                        if (monitoring) triggerEvent = null
                        monitoring = !monitoring
                        if (!monitoring) {
                            liveFrameMetrics = null
                        }
                    }
                    else permissionLauncher.launch(Manifest.permission.CAMERA)
                },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).height(56.dp).testTag("monitor-control"),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface),
            ) {
                Icon(if (monitoring && permissionGranted) Icons.Filled.Close else Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(monitorActionLabel(monitoring, permissionGranted, permissionDenied), style = MaterialTheme.typography.titleMedium)
            }
        }
        triggerEvent?.let { event ->
            item {
                TriggerHeroCard(
                    event = event,
                    falsePositiveMarked = falsePositiveMarked,
                    onMarkFalsePositive = {
                        if (isLoggedIn) pendingMisreportEvent = event else showLoginRequired = true
                    },
                    onDismiss = { triggerEvent = null },
                )
            }
        }
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricCard(formatDisplacement(liveFrameMetrics), "相对基准位移", Modifier.weight(1f))
                MetricCard(formatJitter(liveFrameMetrics), "抖动频率", Modifier.weight(1f))
                MetricCard(formatCandidateDuration(liveFrameMetrics), "持续下沉", Modifier.weight(1f))
            }
        }
        item {
            SectionCard("检测灵敏度", Modifier.padding(horizontal = 24.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(sensitivityLabel(triggerConfig.minConfidence), Modifier.weight(1f), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("阈值 %.2f".format(triggerConfig.minConfidence), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
                }
                Slider(
                    value = triggerConfig.minConfidence.coerceIn(0.30f, 0.95f),
                    onValueChange = onConfidenceThresholdChange,
                    valueRange = 0.30f..0.95f,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp).testTag("monitor-sensitivity"),
                )
                Text("灵敏度越高，轻微点动也会触发提醒", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
        }
    }

    pendingMisreportEvent?.let { event ->
        MisreportConfirmDialog(
            onDismiss = { pendingMisreportEvent = null },
            onConfirm = {
                falsePositiveMarked = true
                onMarkFalsePositive(event)
                pendingMisreportEvent = null
            },
        )
    }

    if (showLoginRequired) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showLoginRequired = false },
            title = { Text("需要登录") },
            text = { Text("登录后才能上报误报，请先登录账号。") },
            confirmButton = { Button(onClick = { showLoginRequired = false; onRequireLogin() }) { Text("去登录") } },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { showLoginRequired = false }) { Text("取消") } },
        )
    }
}

private fun sensitivityLabel(value: Float) = when { value < 0.50f -> "低"; value < 0.72f -> "中"; else -> "高" }

internal fun formatDisplacement(metrics: FrameMetrics?): String =
    metrics?.featureSnapshot?.verticalDisplacementPx?.let { "%.1f px".format(it) } ?: "--"

internal fun formatJitter(metrics: FrameMetrics?): String =
    metrics?.featureSnapshot?.jitterHz?.let { "%.1f Hz".format(it) } ?: "--"

internal fun formatCandidateDuration(metrics: FrameMetrics?): String =
    if (metrics?.featureSnapshot == null) "--" else "%.1f s".format(metrics.candidateDurationMillis / 1_000f)

private fun hasCameraPermission(context: android.content.Context) =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

private fun monitorActionLabel(monitoring: Boolean, permissionGranted: Boolean, permissionDenied: Boolean) = when {
    monitoring && permissionGranted -> "停止监控"
    permissionDenied -> "重新请求相机权限"
    !permissionGranted -> "授权并开始监控"
    else -> "开始监控"
}

internal fun formatElapsedDuration(totalSeconds: Long): String {
    val hours = totalSeconds / 3_600L
    val minutes = (totalSeconds % 3_600L) / 60L
    val seconds = totalSeconds % 60L
    return "%02d:%02d:%02d".format(hours, minutes, seconds)
}

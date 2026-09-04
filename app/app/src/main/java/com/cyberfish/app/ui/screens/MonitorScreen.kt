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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
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
import com.cyberfish.app.alert.AlertPreferences
import com.cyberfish.app.trigger.TriggerConfig
import com.cyberfish.app.ui.components.MetricCard
import com.cyberfish.app.ui.components.ScreenTitle
import com.cyberfish.app.ui.components.SectionCard
import com.cyberfish.app.trigger.TriggerEvent

@Composable
fun MonitorScreen(
    onOpenSettings: () -> Unit,
    triggerConfig: TriggerConfig,
    alertPreferences: AlertPreferences,
    onTriggerPersist: (TriggerEvent) -> Unit,
    onMarkFalsePositive: (TriggerEvent) -> Unit,
) {
    val context = LocalContext.current
    var permissionGranted by rememberSaveable { mutableStateOf(hasCameraPermission(context)) }
    var permissionDenied by rememberSaveable { mutableStateOf(false) }
    var monitoring by rememberSaveable { mutableStateOf(permissionGranted) }
    var sensitivity by rememberSaveable { mutableFloatStateOf(0.62f) }
    var triggerEvent by remember { mutableStateOf<TriggerEvent?>(null) }
    var pendingMisreportEvent by remember { mutableStateOf<TriggerEvent?>(null) }
    var falsePositiveMarked by rememberSaveable { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionGranted = granted
        permissionDenied = !granted
        monitoring = granted
    }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { ScreenTitle("实时监控", Icons.Filled.Settings, "打开设置", onOpenSettings) }
        item {
            CameraPreviewCard(
                monitoring = monitoring,
                permissionGranted = permissionGranted,
                permissionDenied = permissionDenied,
                triggerConfig = triggerConfig,
                alertPreferences = alertPreferences,
                onTrigger = {
                    triggerEvent = it
                    falsePositiveMarked = false
                    onTriggerPersist(it)
                },
            )
        }
        triggerEvent?.let { event ->
            item {
                TriggerHeroCard(
                    event = event,
                    falsePositiveMarked = falsePositiveMarked,
                    onMarkFalsePositive = {
                        pendingMisreportEvent = event
                    },
                    onDismiss = { triggerEvent = null },
                )
            }
        }
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricCard("3.2 px", "相对基准位移", Modifier.weight(1f))
                MetricCard("1.4 Hz", "抖动频率", Modifier.weight(1f))
                MetricCard("0.6 s", "持续下沉", Modifier.weight(1f))
            }
        }
        item {
            SectionCard("检测灵敏度", Modifier.padding(horizontal = 24.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(sensitivityLabel(sensitivity), Modifier.weight(1f), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("阈值 %.2f".format(sensitivity), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
                }
                Slider(value = sensitivity, onValueChange = { sensitivity = it }, valueRange = 0.30f..0.95f, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                Text("灵敏度越高，轻微点动也会触发提醒", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
        }
        item {
            Button(
                onClick = {
                    if (permissionGranted) {
                        if (monitoring) triggerEvent = null
                        monitoring = !monitoring
                    }
                    else permissionLauncher.launch(Manifest.permission.CAMERA)
                },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).height(56.dp).testTag("monitor-control"),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(containerColor = if (monitoring && permissionGranted) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary),
            ) {
                Icon(if (monitoring && permissionGranted) Icons.Filled.Close else Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(monitorActionLabel(monitoring, permissionGranted, permissionDenied), style = MaterialTheme.typography.titleMedium)
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
}

private fun sensitivityLabel(value: Float) = when { value < 0.50f -> "低"; value < 0.72f -> "中"; else -> "高" }

private fun hasCameraPermission(context: android.content.Context) =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

private fun monitorActionLabel(monitoring: Boolean, permissionGranted: Boolean, permissionDenied: Boolean) = when {
    monitoring && permissionGranted -> "停止监控"
    permissionDenied -> "重新请求相机权限"
    !permissionGranted -> "授权并开始监控"
    else -> "开始监控"
}

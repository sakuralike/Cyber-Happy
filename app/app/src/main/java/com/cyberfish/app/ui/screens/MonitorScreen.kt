package com.cyberfish.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cyberfish.app.ui.components.MetricCard
import com.cyberfish.app.ui.components.ScreenTitle
import com.cyberfish.app.ui.components.SectionCard
import com.cyberfish.app.ui.components.StatusChip

@Composable
fun MonitorScreen(onOpenSettings: () -> Unit) {
    var monitoring by rememberSaveable { mutableStateOf(true) }
    var sensitivity by rememberSaveable { mutableFloatStateOf(0.62f) }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { ScreenTitle("实时监控", Icons.Filled.Settings, "打开设置", onOpenSettings) }
        item { PreviewCard(monitoring) }
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
                onClick = { monitoring = !monitoring },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).height(56.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(containerColor = if (monitoring) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary),
            ) {
                Icon(if (monitoring) Icons.Filled.Close else Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(if (monitoring) "停止监控" else "开始监控", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

private fun sensitivityLabel(value: Float) = when { value < 0.50f -> "低"; value < 0.72f -> "中"; else -> "高" }

@Composable
private fun PreviewCard(monitoring: Boolean) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).aspectRatio(1.18f), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(22.dp)) {
        Box(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                StatusChip("FPS 28 · 延迟 42ms", MaterialTheme.colorScheme.onSurfaceVariant)
                StatusChip("占位模型 · 演示", MaterialTheme.colorScheme.secondary)
            }
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(36.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
                Text("摄像头实时画面", Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f), style = MaterialTheme.typography.headlineSmall)
            }
            Box(Modifier.align(Alignment.Center).size(width = 112.dp, height = 132.dp).border(BorderStroke(2.dp, MaterialTheme.colorScheme.primary), RoundedCornerShape(8.dp)))
            Box(Modifier.fillMaxWidth(0.64f).height(2.dp).align(Alignment.Center).background(MaterialTheme.colorScheme.primary))
            Surface(Modifier.fillMaxWidth().align(Alignment.BottomCenter).padding(12.dp), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(if (monitoring) "漂浮稳定" else "待机", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(if (monitoring) "检测置信度 94%" else "开始监控以获取实时数据", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                    Text(if (monitoring) "02:14" else "--:--", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

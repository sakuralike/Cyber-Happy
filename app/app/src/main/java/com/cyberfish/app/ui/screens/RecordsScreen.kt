package com.cyberfish.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cyberfish.app.ui.components.EmptyState
import com.cyberfish.app.ui.components.ScreenTitle

private data class RecordPreview(val id: Int, val time: String, val valid: Boolean, val detail: String)
private val previewRecords = listOf(
    RecordPreview(1, "09:41", true, "漂目 -21px · 持续 1.4s · 抖动 3.2Hz"),
    RecordPreview(2, "08:52", true, "漂目 -28px · 持续 0.9s · 抖动 4.1Hz"),
    RecordPreview(3, "07:38", false, "漂目 -19px · 持续 0.6s · 抖动 0.8Hz"),
    RecordPreview(4, "06:55", true, "漂目 -23px · 持续 1.1s · 抖动 2.6Hz"),
    RecordPreview(5, "06:12", true, "漂目 -31px · 持续 1.8s · 抖动 3.7Hz"),
)

@Composable
fun RecordsScreen() {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { ScreenTitle("中鱼记录", Icons.AutoMirrored.Filled.List, "筛选记录", {}) }
        item { TodayStats() }
        if (previewRecords.isEmpty()) item { EmptyState("暂无记录", "开始监控后，触发事件会显示在这里") }
        else items(previewRecords, key = { it.id }) { RecordRow(it) }
    }
}

@Composable
private fun TodayStats() {
    Card(Modifier.fillMaxWidth().padding(horizontal = 24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp)) {
            StatCell("12", "今日中鱼", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
            StatCell("10", "有效", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
            StatCell("2", "误报", MaterialTheme.colorScheme.error, Modifier.weight(1f))
        }
    }
}

@Composable
private fun StatCell(value: String, label: String, color: Color, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun RecordRow(record: RecordPreview) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(72.dp), shape = RoundedCornerShape(12.dp), color = if (record.valid) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else MaterialTheme.colorScheme.error.copy(alpha = 0.15f)) { Waveform(record.valid) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(record.time, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(8.dp))
                    Surface(shape = RoundedCornerShape(8.dp), color = if (record.valid) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else MaterialTheme.colorScheme.error.copy(alpha = 0.14f), contentColor = if (record.valid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error) {
                        Text(if (record.valid) "有效" else "误报", Modifier.padding(horizontal = 7.dp, vertical = 3.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                    }
                }
                Text(record.detail, Modifier.padding(top = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.headlineSmall)
        }
    }
}

@Composable
private fun Waveform(valid: Boolean) {
    Canvas(Modifier.fillMaxSize().padding(14.dp)) {
        val color = if (valid) Color(0xFF1FD3A3) else Color(0xFFFF7A3D)
        val center = size.height / 2f
        val xs = listOf(0f, 0.2f, 0.4f, 0.6f, 0.8f, 1f)
        val ys = listOf(0f, -5f, 4f, -3f, 5f, 0f)
        for (i in 0 until xs.lastIndex) drawLine(color, Offset(xs[i] * size.width, center + ys[i]), Offset(xs[i + 1] * size.width, center + ys[i + 1]), 4f)
    }
}

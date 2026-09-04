package com.cyberfish.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.ui.components.EmptyState
import com.cyberfish.app.ui.components.ScreenTitle

@Composable
fun RecordsScreen(
    records: List<FishRecord>?,
    onMarkFalsePositive: (FishRecord) -> Unit,
) {
    var selectedRecord by remember { mutableStateOf<FishRecord?>(null) }
    var filter by remember { mutableStateOf(RecordFilter.All) }
    val loadedRecords = records.orEmpty()
    val visibleRecords = when (filter) {
        RecordFilter.All -> loadedRecords
        RecordFilter.Valid -> loadedRecords.filterNot { it.isFalsePositive }
        RecordFilter.FalsePositive -> loadedRecords.filter { it.isFalsePositive }
    }
    val currentSelected = selectedRecord?.let { selected -> loadedRecords.firstOrNull { it.id == selected.id } ?: selected }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { ScreenTitle("中鱼记录") }
        item { TodayStats(loadedRecords) }
        item { RecordFilterRow(filter) { filter = it } }
        if (records == null) {
            item { EmptyState("正在加载记录") }
        } else if (visibleRecords.isEmpty()) {
            item { EmptyState("暂无记录", "开始监控后，触发事件会显示在这里") }
        } else {
            items(visibleRecords, key = { it.id }) { record ->
                RecordRow(record) { selectedRecord = record }
            }
        }
    }

    currentSelected?.let { record ->
        RecordDetailDialog(
            record = record,
            onDismiss = { selectedRecord = null },
            onMarkFalsePositive = {
                onMarkFalsePositive(record)
                selectedRecord = record.copy(isFalsePositive = true)
            },
        )
    }
}

private enum class RecordFilter(val label: String) {
    All("全部"),
    Valid("有效"),
    FalsePositive("误报"),
}

@Composable
private fun RecordFilterRow(selected: RecordFilter, onSelected: (RecordFilter) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RecordFilter.entries.forEach { filter ->
            FilterChip(
                selected = filter == selected,
                onClick = { onSelected(filter) },
                label = { Text(filter.label) },
                modifier = Modifier.weight(1f),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                ),
            )
        }
    }
}

@Composable
private fun TodayStats(records: List<FishRecord>) {
    val todayStart = java.util.Calendar.getInstance().apply {
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }.timeInMillis
    val todayRecords = records.filter { it.occurredAtMillis >= todayStart }
    val validCount = todayRecords.count { !it.isFalsePositive }
    val falsePositiveCount = todayRecords.count { it.isFalsePositive }
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp)) {
            StatCell(todayRecords.size.toString(), "今日中鱼", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
            StatCell(validCount.toString(), "有效", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
            StatCell(falsePositiveCount.toString(), "误报", MaterialTheme.colorScheme.error, Modifier.weight(1f))
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
private fun RecordRow(record: FishRecord, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(
                Modifier.size(72.dp),
                shape = RoundedCornerShape(12.dp),
                color = if (record.isFalsePositive) MaterialTheme.colorScheme.error.copy(alpha = 0.15f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
            ) { Waveform(!record.isFalsePositive) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(formatRecordTime(record.occurredAtMillis), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (record.isFalsePositive) MaterialTheme.colorScheme.error.copy(alpha = 0.14f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                        contentColor = if (record.isFalsePositive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    ) {
                        Text(if (record.isFalsePositive) "误报" else "有效", Modifier.padding(horizontal = 7.dp, vertical = 3.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                    }
                }
                Text(
                    "漂目 %.1fpx · 抖动 %.1fHz · 置信度 %.0f%%".format(record.verticalDisplacementPx, record.jitterHz, record.confidence * 100),
                    Modifier.padding(top = 5.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.headlineSmall)
        }
    }
}

@Composable
private fun RecordDetailDialog(
    record: FishRecord,
    onDismiss: () -> Unit,
    onMarkFalsePositive: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("记录详情") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(formatRecordTime(record.occurredAtMillis), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("下沉 %.1f px".format(record.verticalDisplacementPx))
                Text("抖动 %.1f Hz".format(record.jitterHz))
                Text("置信度 %.0f%%".format(record.confidence * 100))
                Text("轨迹 ${record.trajectoryPx.size} 帧")
                Text(if (record.videoPath == null) "视频片段：暂无" else "视频片段：${record.videoPath}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("关闭") }
        },
        dismissButton = if (record.isFalsePositive) null else {
            { TextButton(onClick = onMarkFalsePositive) { Text("标记误报") } }
        },
    )
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

private fun formatRecordTime(timestampMillis: Long): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(timestampMillis))

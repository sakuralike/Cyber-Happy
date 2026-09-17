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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
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
import com.cyberfish.app.ui.theme.ChartPalette
import com.cyberfish.app.ui.theme.CyberFishType

@Composable
fun RecordsScreen(
    records: List<FishRecord>?,
    onMarkFalsePositive: (FishRecord) -> Unit,
    onDeleteRecord: (FishRecord) -> Unit = {},
    onDeleteAllRecords: () -> Unit = {},
    isLoggedIn: Boolean = true,
    onRequireLogin: () -> Unit = {},
) {
    var selectedRecord by remember { mutableStateOf<FishRecord?>(null) }
    var pendingMisreportRecord by remember { mutableStateOf<FishRecord?>(null) }
    var showLoginRequired by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf(RecordFilter.All) }
    var selectionMode by remember { mutableStateOf(false) }
    var selectedRecordIds by remember { mutableStateOf(emptySet<Long>()) }
    var pendingDelete by remember { mutableStateOf<DeleteRequest?>(null) }
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
        item {
            RecordHeader(
                records = visibleRecords,
                selectionMode = selectionMode,
                selectedCount = selectedRecordIds.size,
                onToggleSelectionMode = {
                    selectionMode = !selectionMode
                    selectedRecordIds = emptySet()
                },
                onToggleSelectAll = {
                    selectedRecordIds = if (selectedRecordIds.size == visibleRecords.size) emptySet() else visibleRecords.mapTo(linkedSetOf()) { it.id }
                },
                onDeleteSelected = {
                    pendingDelete = if (
                        selectedRecordIds.size == loadedRecords.size &&
                        loadedRecords.all { it.id in selectedRecordIds }
                    ) {
                        DeleteRequest.All
                    } else {
                        DeleteRequest.Selected(selectedRecordIds)
                    }
                },
            )
        }
        item { TodayStats(loadedRecords) }
        item { RecordFilterRow(filter) { filter = it } }
        if (records == null) {
            item { EmptyState("正在加载记录") }
        } else if (visibleRecords.isEmpty()) {
            item { EmptyState("暂无记录", "开始监控后，触发事件会显示在这里") }
        } else {
            items(visibleRecords, key = { it.id }) { record ->
                RecordRow(
                    record = record,
                    selected = record.id in selectedRecordIds,
                    selectionMode = selectionMode,
                    onClick = {
                        if (selectionMode) {
                            selectedRecordIds = selectedRecordIds.toMutableSet().apply {
                                if (!add(record.id)) remove(record.id)
                            }
                        } else selectedRecord = record
                    },
                )
            }
        }
    }

    currentSelected?.let { record ->
        RecordDetailDialog(
            record = record,
            onDismiss = { selectedRecord = null },
            onMarkFalsePositive = {
                if (isLoggedIn) pendingMisreportRecord = record else showLoginRequired = true
            },
            onDelete = { pendingDelete = DeleteRequest.Selected(setOf(record.id)) },
        )
    }

    pendingMisreportRecord?.let { record ->
        MisreportConfirmDialog(
            onDismiss = { pendingMisreportRecord = null },
            onConfirm = {
                onMarkFalsePositive(record)
                selectedRecord = record.copy(isFalsePositive = true)
                pendingMisreportRecord = null
            },
        )
    }

    if (showLoginRequired) {
        AlertDialog(
            onDismissRequest = { showLoginRequired = false },
            title = { Text("需要登录") },
            text = { Text("登录后才能上报误报，请先登录账号。") },
            confirmButton = { Button(onClick = { showLoginRequired = false; onRequireLogin() }) { Text("去登录") } },
            dismissButton = { TextButton(onClick = { showLoginRequired = false }) { Text("取消") } },
        )
    }

    pendingDelete?.let { request ->
        val count = when (request) {
            DeleteRequest.All -> loadedRecords.size
            is DeleteRequest.Selected -> request.ids.size
        }
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除记录") },
            text = { Text("确定删除 $count 条记录吗？此操作无法恢复。") },
            confirmButton = {
                TextButton(onClick = {
                    when (request) {
                        DeleteRequest.All -> onDeleteAllRecords()
                        is DeleteRequest.Selected -> request.ids.forEach { id -> loadedRecords.firstOrNull { it.id == id }?.let(onDeleteRecord) }
                    }
                    selectedRecord = null
                    selectedRecordIds = emptySet()
                    selectionMode = false
                    pendingDelete = null
                }) { Text("删除", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("取消") } },
        )
    }
}

private sealed interface DeleteRequest {
    data object All : DeleteRequest
    data class Selected(val ids: Set<Long>) : DeleteRequest
}

private enum class RecordFilter(val label: String) {
    All("全部"),
    Valid("有效"),
    FalsePositive("误报"),
}

@Composable
private fun RecordFilterRow(selected: RecordFilter, onSelected: (RecordFilter) -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(16.dp)) {
      Row(Modifier.fillMaxWidth().padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        RecordFilter.entries.forEach { filter ->
            Surface(modifier = Modifier.weight(1f).clickable { onSelected(filter) }, color = if (filter == selected) MaterialTheme.colorScheme.surface else Color.Transparent, shape = RoundedCornerShape(12.dp)) {
                Text(filter.label, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = if (filter == selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, fontWeight = if (filter == selected) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
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
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp)) {
            StatCell(todayRecords.size.toString(), "今日中鱼", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
            StatCell(validCount.toString(), "有效", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
            StatCell(falsePositiveCount.toString(), "误报", MaterialTheme.colorScheme.error, Modifier.weight(1f))
        }
}

@Composable
private fun StatCell(value: String, label: String, color: Color, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, style = CyberFishType.Metric, fontWeight = FontWeight.SemiBold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun RecordHeader(
    records: List<FishRecord>,
    selectionMode: Boolean,
    selectedCount: Int,
    onToggleSelectionMode: () -> Unit,
    onToggleSelectAll: () -> Unit,
    onDeleteSelected: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("中鱼记录", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            Text("今日 ${records.count { it.occurredAtMillis >= todayStart() }} 条", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
        }
        if (selectionMode) {
            TextButton(onClick = onToggleSelectAll, enabled = records.isNotEmpty()) { Text(if (selectedCount == records.size) "取消全选" else "全选") }
            TextButton(onClick = onDeleteSelected, enabled = selectedCount > 0) { Text("删除($selectedCount)", color = MaterialTheme.colorScheme.error) }
        }
        TextButton(onClick = onToggleSelectionMode, enabled = records.isNotEmpty()) { Text(if (selectionMode) "完成" else "管理") }
    }
}

@Composable
private fun RecordRow(record: FishRecord, selected: Boolean, selectionMode: Boolean, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(20.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            if (selectionMode) Checkbox(checked = selected, onCheckedChange = { onClick() })
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(formatRecordTime(record.occurredAtMillis), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (record.isFalsePositive) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
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
    onDelete: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("记录详情") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(formatRecordTime(record.occurredAtMillis), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text("下沉 %.1f px".format(record.verticalDisplacementPx))
                Text("抖动 %.1f Hz".format(record.jitterHz))
                Text("置信度 %.0f%%".format(record.confidence * 100))
                Text("轨迹 ${record.trajectoryPx.size} 帧")
                Text(if (record.videoPath == null) "视频片段：暂无" else "视频片段：${record.videoPath}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (record.isFalsePositive) {
                    Text("误报上报：${record.misreportState.label}")
                    record.misreportLastError?.let { Text("上次错误：$it", color = MaterialTheme.colorScheme.error) }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDelete) { Text("删除", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { if (!record.isFalsePositive) TextButton(onClick = onMarkFalsePositive) { Text("标记误报") } else TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}

@Composable
private fun Waveform(valid: Boolean) {
    Canvas(Modifier.fillMaxSize().padding(14.dp)) {
        val color = if (valid) ChartPalette.TracePrimary else ChartPalette.TraceWarning
        val center = size.height / 2f
        val xs = listOf(0f, 0.2f, 0.4f, 0.6f, 0.8f, 1f)
        val ys = listOf(0f, -5f, 4f, -3f, 5f, 0f)
        for (i in 0 until xs.lastIndex) drawLine(color, Offset(xs[i] * size.width, center + ys[i]), Offset(xs[i + 1] * size.width, center + ys[i + 1]), 4f)
    }
}

private fun formatRecordTime(timestampMillis: Long): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(timestampMillis))

private fun todayStart(): Long = java.util.Calendar.getInstance().apply {
    set(java.util.Calendar.HOUR_OF_DAY, 0)
    set(java.util.Calendar.MINUTE, 0)
    set(java.util.Calendar.SECOND, 0)
    set(java.util.Calendar.MILLISECOND, 0)
}.timeInMillis

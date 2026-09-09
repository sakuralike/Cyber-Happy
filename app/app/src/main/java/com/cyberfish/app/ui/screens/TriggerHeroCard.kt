package com.cyberfish.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.ui.components.SectionCard
import com.cyberfish.app.ui.components.StatusChip
import com.cyberfish.app.ui.theme.ChartPalette

@Composable
fun TriggerHeroCard(
    event: TriggerEvent,
    falsePositiveMarked: Boolean,
    onMarkFalsePositive: () -> Unit,
    onDismiss: () -> Unit,
) {
    SectionCard("检测到上鱼动作", Modifier.padding(horizontal = 24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("反向确认完成", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(event.reason, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            StatusChip("置信度 %.0f%%".format(event.confidence * 100), MaterialTheme.colorScheme.primary)
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            HeroMetric("下沉", "%.1f px".format(event.features.verticalDisplacementPx), Modifier.weight(1f))
            HeroMetric("抖动", "%.1f Hz".format(event.features.jitterHz), Modifier.weight(1f))
            HeroMetric("轨迹", "${event.trajectoryPx.size} 帧", Modifier.weight(1f))
        }
        TrajectoryPreview(event.trajectoryPx, Modifier.fillMaxWidth().height(56.dp).padding(top = 12.dp))
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Button(
                onClick = onMarkFalsePositive,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (falsePositiveMarked) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primaryContainer,
                    contentColor = if (falsePositiveMarked) MaterialTheme.colorScheme.onSecondary else MaterialTheme.colorScheme.primary,
                ),
            ) {
                Icon(if (falsePositiveMarked) Icons.Filled.Check else Icons.Filled.Info, contentDescription = null)
                Text(if (falsePositiveMarked) "已标记误报" else "标记误报", Modifier.padding(start = 6.dp))
            }
            Button(
                onClick = onDismiss,
                modifier = Modifier.weight(1f),
            ) {
                Text("收起")
            }
        }
    }
}

@Composable
private fun HeroMetric(label: String, value: String, modifier: Modifier) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun TrajectoryPreview(values: List<Float>, modifier: Modifier) {
    Canvas(modifier) {
        if (values.size < 2) return@Canvas
        val minValue = values.minOrNull() ?: return@Canvas
        val maxValue = values.maxOrNull() ?: return@Canvas
        val range = (maxValue - minValue).coerceAtLeast(1f)
        val color = ChartPalette.TracePrimary
        for (index in 0 until values.lastIndex) {
            val start = Offset(
                x = size.width * index / values.lastIndex,
                y = size.height * (1f - (values[index] - minValue) / range),
            )
            val end = Offset(
                x = size.width * (index + 1) / values.lastIndex,
                y = size.height * (1f - (values[index + 1] - minValue) / range),
            )
            drawLine(color, start, end, strokeWidth = 3f, cap = StrokeCap.Round)
        }
    }
}

package com.cyberfish.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cyberfish.app.ui.ThemeMode
import com.cyberfish.app.ui.components.ScreenTitle
import com.cyberfish.app.ui.components.SectionCard
import com.cyberfish.app.ui.components.SettingRow
import com.cyberfish.app.ui.components.StatusChip
import com.cyberfish.app.ui.components.ThinDivider

private enum class SettingsSection(val label: String) { Parameters("参数配置"), Alerts("提醒与外观"), Model("模型与性能") }

@Composable
fun SettingsScreen(themeMode: ThemeMode, onThemeModeChange: (ThemeMode) -> Unit) {
    var sectionName by rememberSaveable { mutableStateOf(SettingsSection.Parameters.name) }
    val section = SettingsSection.valueOf(sectionName)
    LazyColumn(modifier = Modifier.fillMaxSize().testTag("settings-list"), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { ScreenTitle("设置") }
        item {
            ScrollableTabRow(selectedTabIndex = section.ordinal, edgePadding = 24.dp, containerColor = MaterialTheme.colorScheme.background, divider = {}) {
                SettingsSection.entries.forEach { item -> Tab(selected = item == section, onClick = { sectionName = item.name }, text = { Text(item.label) }) }
            }
        }
        item {
            when (section) {
                SettingsSection.Parameters -> ParameterSettings()
                SettingsSection.Alerts -> AlertSettings(themeMode, onThemeModeChange)
                SettingsSection.Model -> ModelSettings()
            }
        }
    }
}

@Composable
private fun ParameterSettings() {
    var preset by rememberSaveable { mutableStateOf("中级") }
    var sink by rememberSaveable { mutableFloatStateOf(18f) }
    var tremble by rememberSaveable { mutableFloatStateOf(3.0f) }
    var duration by rememberSaveable { mutableFloatStateOf(0.8f) }
    var confidence by rememberSaveable { mutableFloatStateOf(0.62f) }
    var saved by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionCard("检测模式") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("默认", "中级", "高级").forEach { option ->
                    PresetCard(option, option == preset, Modifier.weight(1f)) {
                        preset = option
                        saved = false
                    }
                }
            }
            Text("切换模式会同步重置阈值，拖动滑块后进入自定义", Modifier.padding(top = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
        SectionCard("阈值微调 · $preset") {
            ThresholdSlider("下沉阈值", sink, 8f..40f, "%.0f px") { sink = it; saved = false }
            ThresholdSlider("抖动阈值", tremble, 1f..8f, "%.1f Hz") { tremble = it; saved = false }
            ThresholdSlider("持续时长", duration, 0.3f..3f, "%.1f s") { duration = it; saved = false }
            ThresholdSlider("检测置信", confidence, 0.3f..0.95f, "%.2f") { confidence = it; saved = false }
        }
        SectionCard("当前模式 · $preset") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                SummaryValue("灵敏度", if (preset == "高级") "高" else if (preset == "默认") "低" else "中")
                SummaryValue("误报率", if (preset == "高级") "≈ 14%" else if (preset == "默认") "≈ 4%" else "≈ 8%", MaterialTheme.colorScheme.error)
                SummaryValue("漏报率", "≈ 6%")
            }
        }
        Button(onClick = { saved = true }, Modifier.fillMaxWidth().height(54.dp), colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary), shape = RoundedCornerShape(16.dp)) {
            Text(if (saved) "配置已保存" else "保存配置")
        }
    }
}

@Composable
private fun PresetCard(name: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = modifier.height(108.dp), colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface), border = BorderStroke(1.5.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline), shape = RoundedCornerShape(14.dp)) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(when (name) { "默认" -> "宽松判定"; "高级" -> "灵敏判定"; else -> "均衡判定" }, Modifier.padding(top = 5.dp), color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.weight(1f)); ThinDivider()
        }
    }
}

@Composable
private fun ThresholdSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, format: String, onChange: (Float) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge); Text(format.format(value), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold) }
        Slider(value = value, onValueChange = onChange, valueRange = range)
    }
}

@Composable
private fun SummaryValue(label: String, value: String, color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(value, color = color, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium) }
}

@Composable
private fun AlertSettings(themeMode: ThemeMode, onThemeModeChange: (ThemeMode) -> Unit) {
    var sound by rememberSaveable { mutableStateOf(true) }
    var vibration by rememberSaveable { mutableStateOf(true) }
    var notification by rememberSaveable { mutableStateOf(false) }
    var autoTheme by rememberSaveable { mutableStateOf(true) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionCard("提醒方式") {
            SettingRow("声音提醒", "默认铃声 · 中鱼号 03") { Switch(checked = sound, onCheckedChange = { sound = it }) }
            SettingRow("震动", "Pattern 0, 200, 100, 200") { Switch(checked = vibration, onCheckedChange = { vibration = it }) }
            SettingRow("推送通知", "需要系统通知权限") { Switch(checked = notification, onCheckedChange = { notification = it }) }
        }
        SectionCard("提醒策略") {
            SettingRow("静默时段", "22:00 - 06:00") { StatusChip("已设置", MaterialTheme.colorScheme.secondary) }
            SettingRow("重复提醒间隔", "3 秒") { Text("3 s", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold) }
        }
        SectionCard("外观主题") {
            SettingRow("自动切换白天 / 黑夜", "按所在地日出日落自动切换") { Switch(checked = autoTheme, onCheckedChange = { autoTheme = it }) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                ThemeMode.entries.forEach { mode ->
                    FilterChip(
                        selected = mode == themeMode,
                        onClick = { onThemeModeChange(mode) },
                        label = { Text(mode.label) },
                        modifier = Modifier.weight(1f),
                        colors = activeChipColors(),
                    )
                }
            }
        }
    }
}

@Composable
private fun ModelSettings() {
    var backend by rememberSaveable { mutableStateOf("NNAPI") }
    var performance by rememberSaveable { mutableStateOf("标准") }
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionCard("模型状态") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 12.dp))
                Column(Modifier.weight(1f)) { Text("占位模型 MockDetector", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold); Text("规则模拟 · 仅供联调", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
                StatusChip("未接入", MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(12.dp)); ThinDivider()
            SettingRow("训练进度", "数据采集 → 标注 → 训练中 → 接入 APP") { Text("训练中", color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.SemiBold) }
        }
        SectionCard("推理后端") {
            listOf("NNAPI", "GPU Delegate", "XNNPACK (CPU)").forEach { option ->
                FilterChip(
                    selected = backend == option.substringBefore(" "),
                    onClick = { backend = option.substringBefore(" ") },
                    label = { Text(option) },
                    leadingIcon = { Icon(Icons.Filled.Info, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                    colors = activeChipColors(),
                )
            }
        }
        SectionCard("性能模式") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                listOf("省电", "标准", "高性能").forEach { option ->
                    FilterChip(
                        selected = performance == option,
                        onClick = { performance = option },
                        label = { Text(option) },
                        modifier = Modifier.weight(1f),
                        colors = activeChipColors(),
                    )
                }
            }
            SettingRow("当前指标", "FPS 28 · 推理耗时 36 ms") { StatusChip("实时", MaterialTheme.colorScheme.primary) }
        }
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary); Text("模型更新由 OTA 通道管理", Modifier.padding(start = 10.dp), style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

@Composable
private fun activeChipColors() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = MaterialTheme.colorScheme.primary,
    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
    selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
)

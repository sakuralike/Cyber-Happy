package com.cyberfish.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.clickable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.cyberfish.app.data.preferences.AppPreferences
import com.cyberfish.app.network.VersionCheckState
import com.cyberfish.app.update.ModelInstallStatus
import com.cyberfish.app.update.ModelState
import com.cyberfish.app.update.AppUpdateWorker
import androidx.work.WorkInfo
import com.cyberfish.app.trigger.TriggerConfig
import com.cyberfish.app.trigger.TriggerPreset
import com.cyberfish.app.ui.ThemeMode
import com.cyberfish.app.ui.components.ScreenTitle
import com.cyberfish.app.ui.components.SectionCard
import com.cyberfish.app.ui.components.SettingRow
import com.cyberfish.app.ui.components.StatusChip
import com.cyberfish.app.ui.components.ThinDivider
import com.cyberfish.app.ui.theme.CyberFishType

private enum class SettingsSection(val label: String) { Parameters("参数配置"), Alerts("提醒与外观"), Model("模型与性能") }

@Composable
fun SettingsScreen(
    settings: AppPreferences,
    onSettingsChange: (AppPreferences) -> Unit,
    versionCheckState: VersionCheckState,
    onCheckForUpdate: () -> Unit,
    modelState: ModelState = ModelState(),
    appUpdateWorkInfo: WorkInfo? = null,
    onCheckModel: () -> Unit = {},
    onRollbackModel: () -> Unit = {},
    onDownloadAppUpdate: () -> Unit = {},
    onInstallAppUpdate: (String) -> Unit = {},
) {
    var sectionName by rememberSaveable { mutableStateOf(SettingsSection.Parameters.name) }
    val section = SettingsSection.valueOf(sectionName)
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("settings-list"),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { ScreenTitle("设置", "阈值与提醒，随时可调") }
        item {
            Surface(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(16.dp),
            ) {
                Row(Modifier.fillMaxWidth().padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    SettingsSection.entries.forEach { item ->
                        Surface(
                            modifier = Modifier.weight(1f),
                            color = if (item == section) MaterialTheme.colorScheme.surface else Color.Transparent,
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text(item.label, modifier = Modifier.fillMaxWidth().clickable { sectionName = item.name }.padding(vertical = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = if (item == section) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, fontWeight = if (item == section) FontWeight.SemiBold else FontWeight.Normal)
                        }
                    }
                }
            }
        }
        item {
            when (section) {
                SettingsSection.Parameters -> ParameterSettings(settings, onSettingsChange)
                SettingsSection.Alerts -> AlertSettings(settings, onSettingsChange)
                SettingsSection.Model -> ModelSettings(
                    settings = settings,
                    onSettingsChange = onSettingsChange,
                    versionCheckState = versionCheckState,
                    onCheckForUpdate = onCheckForUpdate,
                    modelState = modelState,
                    appUpdateWorkInfo = appUpdateWorkInfo,
                    onCheckModel = onCheckModel,
                    onRollbackModel = onRollbackModel,
                    onDownloadAppUpdate = onDownloadAppUpdate,
                    onInstallAppUpdate = onInstallAppUpdate,
                )
            }
        }
    }
}

@Composable
private fun ParameterSettings(settings: AppPreferences, onSettingsChange: (AppPreferences) -> Unit) {
    var saved by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionCard("检测模式") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TriggerPreset.entries.forEach { preset ->
                    PresetCard(preset.label, preset.label == settings.triggerPreset, Modifier.weight(1f)) {
                        val config = TriggerConfig.forPreset(preset)
                        onSettingsChange(
                            settings.copy(
                                triggerPreset = preset.label,
                                sinkThresholdPx = config.sinkThresholdPx,
                                trembleThresholdHz = config.trembleThresholdHz,
                                durationSeconds = config.minSinkDurationMillis / 1_000f,
                                confidenceThreshold = config.minConfidence,
                            ),
                        )
                        saved = false
                    }
                }
            }
            Text("切换模式会同步重置阈值，拖动滑块后进入自定义", Modifier.padding(top = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
        SectionCard("阈值微调 · ${settings.triggerPreset}") {
            ThresholdSlider("下沉阈值", settings.sinkThresholdPx, 8f..40f, "%.0f px") {
                onSettingsChange(settings.copy(sinkThresholdPx = it, triggerPreset = "自定义")); saved = false
            }
            ThresholdSlider("抖动阈值", settings.trembleThresholdHz, 1f..8f, "%.1f Hz") {
                onSettingsChange(settings.copy(trembleThresholdHz = it, triggerPreset = "自定义")); saved = false
            }
            ThresholdSlider("持续时长", settings.durationSeconds, 0.3f..3f, "%.1f s") {
                onSettingsChange(settings.copy(durationSeconds = it, triggerPreset = "自定义")); saved = false
            }
            ThresholdSlider("检测置信", settings.confidenceThreshold, 0.3f..0.95f, "%.2f") {
                onSettingsChange(settings.copy(confidenceThreshold = it, triggerPreset = "自定义")); saved = false
            }
        }
        SectionCard("当前模式 · ${settings.triggerPreset}") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                SummaryValue("灵敏度", when (settings.triggerPreset) { "高级" -> "高"; "默认" -> "低"; else -> "中" })
                SummaryValue("误报率", when (settings.triggerPreset) { "高级" -> "≈ 14%"; "默认" -> "≈ 4%"; else -> "≈ 8%" }, MaterialTheme.colorScheme.error)
                SummaryValue("漏报率", "≈ 6%")
            }
        }
        Button(
            onClick = { saved = true },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(14.dp),
        ) { Text(if (saved) "配置已保存" else "保存配置") }
    }
}

@Composable
private fun PresetCard(name: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = modifier.height(108.dp),
        colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.5.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                when (name) { "默认" -> "宽松判定"; "高级" -> "灵敏判定"; "自定义" -> "手动阈值"; else -> "均衡判定" },
                Modifier.padding(top = 5.dp),
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.weight(1f)); ThinDivider()
        }
    }
}

@Composable
private fun ThresholdSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, format: String, onChange: (Float) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
            Text(format.format(value), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
        }
        Slider(value = value, onValueChange = onChange, valueRange = range)
    }
}

@Composable
private fun SummaryValue(label: String, value: String, color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, style = CyberFishType.MetricSmall, fontWeight = FontWeight.SemiBold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun AlertSettings(settings: AppPreferences, onSettingsChange: (AppPreferences) -> Unit) {
    val context = LocalContext.current
    val themeMode = ThemeMode.entries.firstOrNull { it.name == settings.themeMode } ?: ThemeMode.Dark
    val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        onSettingsChange(settings.copy(notificationEnabled = granted))
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionCard("提醒方式") {
            SettingRow("声音提醒", "默认铃声 · 中鱼号 03") { Switch(checked = settings.soundEnabled, onCheckedChange = { onSettingsChange(settings.copy(soundEnabled = it)) }) }
            SettingRow("震动", "Pattern 0, 200, 100, 200") { Switch(checked = settings.vibrationEnabled, onCheckedChange = { onSettingsChange(settings.copy(vibrationEnabled = it)) }) }
            SettingRow("推送通知", "需要系统通知权限") {
                Switch(
                    checked = settings.notificationEnabled,
                    onCheckedChange = { enabled ->
                        if (!enabled) {
                            onSettingsChange(settings.copy(notificationEnabled = false))
                        } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                        ) {
                            onSettingsChange(settings.copy(notificationEnabled = true))
                        } else {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    },
                )
            }
        }
        SectionCard("提醒策略") {
            SettingRow("静默时段", "22:00 - 06:00") {
                Switch(checked = settings.quietHoursEnabled, onCheckedChange = { onSettingsChange(settings.copy(quietHoursEnabled = it)) })
            }
            SettingRow("重复提醒间隔", "5 秒冷却") { Text("5 s", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold) }
        }
        SectionCard("外观主题") {
            SettingRow("自动切换白天 / 黑夜", "按所在地日出日落自动切换") { Switch(checked = settings.autoTheme, onCheckedChange = { onSettingsChange(settings.copy(autoTheme = it)) }) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                ThemeMode.entries.forEach { mode ->
                    FilterChip(
                        selected = mode == themeMode,
                        onClick = { onSettingsChange(settings.copy(themeMode = mode.name, autoTheme = false)) },
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
private fun ModelSettings(
    settings: AppPreferences,
    onSettingsChange: (AppPreferences) -> Unit,
    versionCheckState: VersionCheckState,
    onCheckForUpdate: () -> Unit,
    modelState: ModelState,
    appUpdateWorkInfo: WorkInfo?,
    onCheckModel: () -> Unit,
    onRollbackModel: () -> Unit,
    onDownloadAppUpdate: () -> Unit,
    onInstallAppUpdate: (String) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionCard("模型状态") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 12.dp))
                Column(Modifier.weight(1f)) {
                    Text(modelStateTitle(modelState), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(modelStateSubtitle(modelState), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                }
                StatusChip(modelStateLabel(modelState), modelStateColor(modelState))
            }
            Spacer(Modifier.height(12.dp)); ThinDivider()
            SettingRow("模型版本", modelState.modelVersion) { Text("${modelState.progress}%", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold) }
            if (modelState.errorMessage != null) {
                Text(modelState.errorMessage, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Button(
                    onClick = onCheckModel,
                    enabled = modelState.status != ModelInstallStatus.CHECKING && modelState.status != ModelInstallStatus.DOWNLOADING && modelState.status != ModelInstallStatus.VERIFYING,
                    modifier = Modifier.weight(1f),
                ) { Text("检查模型") }
                Button(
                    onClick = onRollbackModel,
                    enabled = modelState.status == ModelInstallStatus.READY,
                    modifier = Modifier.weight(1f),
                ) { Text("回滚模型") }
            }
        }
        SectionCard("推理后端") {
            listOf("NNAPI", "GPU Delegate", "XNNPACK (CPU)").forEach { option ->
                FilterChip(
                    selected = settings.inferenceBackend == option.substringBefore(" "),
                    onClick = { onSettingsChange(settings.copy(inferenceBackend = option.substringBefore(" "))) },
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
                        selected = settings.performanceMode == option,
                        onClick = { onSettingsChange(settings.copy(performanceMode = option)) },
                        label = { Text(option) },
                        modifier = Modifier.weight(1f),
                        colors = activeChipColors(),
                    )
                }
            }
            SettingRow("当前指标", "FPS 28 · 推理耗时 36 ms") { StatusChip("实时", MaterialTheme.colorScheme.primary) }
        }
        SectionCard("APP 服务") {
            Text(versionCheckMessage(versionCheckState), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            Button(
                onClick = onCheckForUpdate,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                enabled = versionCheckState !is VersionCheckState.Checking,
            ) {
                Text(if (versionCheckState is VersionCheckState.Checking) "检查中" else "检查 APP 更新")
            }
            val update = (versionCheckState as? VersionCheckState.UpdateAvailable)?.update
            if (update != null) {
                Text(
                    "发现 v${update.versionName ?: update.versionCode ?: ""}，${update.releaseNotes ?: ""}",
                    modifier = Modifier.padding(top = 8.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
                when (appUpdateWorkInfo?.state) {
                    WorkInfo.State.RUNNING, WorkInfo.State.ENQUEUED -> {
                        Text(
                            "下载中 ${appUpdateWorkInfo.progress.getInt(AppUpdateWorker.KEY_PROGRESS, 0)}%",
                            modifier = Modifier.padding(top = 8.dp),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    WorkInfo.State.SUCCEEDED -> {
                        val apkPath = appUpdateWorkInfo.outputData.getString(AppUpdateWorker.KEY_APK_PATH)
                        if (apkPath != null) {
                            Button(onClick = { onInstallAppUpdate(apkPath) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                                Text("安装更新")
                            }
                        }
                    }
                    else -> {
                        Button(
                            onClick = onDownloadAppUpdate,
                            enabled = update.apkUrl != null && update.apkSha256 != null,
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                        ) { Text("下载并安装") }
                    }
                }
            }
        }
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("模型更新由 OTA 通道管理", Modifier.padding(start = 10.dp), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

private fun versionCheckMessage(state: VersionCheckState) = when (state) {
    VersionCheckState.Idle -> "使用已配置的 APP 服务检查版本"
    VersionCheckState.Checking -> "正在检查版本信息"
    VersionCheckState.NotConfigured -> "未配置服务地址或 APP 令牌"
    VersionCheckState.UpToDate -> "当前已是最新版本"
    is VersionCheckState.UpdateAvailable -> "发现 v${state.update.versionName ?: state.update.versionCode} 更新"
    is VersionCheckState.Failed -> "检查失败：${state.message}"
}

private fun modelStateTitle(state: ModelState) = if (state.status == ModelInstallStatus.MOCK) "占位模型 MockDetector" else state.modelVersion

private fun modelStateSubtitle(state: ModelState) = when (state.status) {
    ModelInstallStatus.MOCK -> "规则模拟 · 仅供联调"
    ModelInstallStatus.CHECKING -> "正在检查可用模型"
    ModelInstallStatus.DOWNLOADING -> "正在下载模型 · ${state.progress}%"
    ModelInstallStatus.VERIFYING -> "正在校验模型完整性"
    ModelInstallStatus.READY -> "LiteRT · 已就绪"
    ModelInstallStatus.FAILED -> "模型更新失败"
    ModelInstallStatus.ROLLED_BACK -> "已回滚上一模型"
}

private fun modelStateLabel(state: ModelState) = when (state.status) {
    ModelInstallStatus.MOCK -> "未接入"
    ModelInstallStatus.CHECKING -> "检查中"
    ModelInstallStatus.DOWNLOADING -> "下载中"
    ModelInstallStatus.VERIFYING -> "校验中"
    ModelInstallStatus.READY -> "已就绪"
    ModelInstallStatus.FAILED -> "失败"
    ModelInstallStatus.ROLLED_BACK -> "已回滚"
}

@Composable
private fun modelStateColor(state: ModelState) = when (state.status) {
    ModelInstallStatus.FAILED -> MaterialTheme.colorScheme.error
    ModelInstallStatus.READY, ModelInstallStatus.ROLLED_BACK -> MaterialTheme.colorScheme.primary
    else -> MaterialTheme.colorScheme.secondary
}

@Composable
private fun activeChipColors() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = MaterialTheme.colorScheme.primary,
    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
    selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
)

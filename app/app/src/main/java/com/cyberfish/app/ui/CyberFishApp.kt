package com.cyberfish.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.cyberfish.app.alert.AlertPreferences
import com.cyberfish.app.data.CyberFishRepository
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.data.preferences.AppPreferences
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.VersionCheckState
import com.cyberfish.app.trigger.TriggerConfig
import com.cyberfish.app.ui.components.PillTabBar
import com.cyberfish.app.ui.screens.MonitorScreen
import com.cyberfish.app.ui.screens.ProfileScreen
import com.cyberfish.app.ui.screens.RecordsScreen
import com.cyberfish.app.ui.screens.SettingsScreen
import com.cyberfish.app.ui.theme.CyberFishTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToLong

internal enum class AppTab(val label: String) {
    Monitor("监控"),
    Records("记录"),
    Settings("设置"),
    Profile("我的"),
}

enum class ThemeMode(val label: String) {
    System("跟随系统"),
    Light("白天"),
    Dark("夜晚"),
}

@Composable
fun CyberFishApp() {
    val context = LocalContext.current.applicationContext
    val repository = remember(context) { CyberFishRepository(context) }
    val coroutineScope = rememberCoroutineScope()
    val preferences by repository.preferences.collectAsState(initial = AppPreferences())
    val records by repository.records.collectAsState(initial = null as List<FishRecord>?)
    val modelState by repository.modelState.collectAsState()
    var selectedTabName by rememberSaveable { mutableStateOf(AppTab.Monitor.name) }
    var versionCheckState by remember { mutableStateOf<VersionCheckState>(VersionCheckState.Idle) }
    val selectedTab = AppTab.valueOf(selectedTabName)
    val darkTheme = resolveDarkTheme(
        preferences = preferences,
        systemDark = isSystemInDarkTheme(),
        hourOfDay = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY),
    )

    CyberFishTheme(darkTheme = darkTheme) {
        Scaffold(
            bottomBar = {
                PillTabBar(
                    selectedTab = selectedTab,
                    onTabSelected = { selectedTabName = it.name },
                )
            },
        ) { paddingValues ->
            Surface(modifier = Modifier.fillMaxSize()) {
                Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
                    when (selectedTab) {
                        AppTab.Monitor -> MonitorScreen(
                            onOpenSettings = { selectedTabName = AppTab.Settings.name },
                            triggerConfig = preferences.toTriggerConfig(),
                            alertPreferences = AlertPreferences(
                                soundEnabled = preferences.soundEnabled,
                                vibrationEnabled = preferences.vibrationEnabled,
                                notificationEnabled = preferences.notificationEnabled,
                                quietHoursEnabled = preferences.quietHoursEnabled,
                            ),
                            onTriggerPersist = { event ->
                                coroutineScope.launch(Dispatchers.IO) { repository.saveTrigger(event) }
                            },
                            onMarkFalsePositive = { event ->
                                coroutineScope.launch(Dispatchers.IO) { repository.confirmMisreport(event) }
                            },
                            detector = repository.modelRepository.detectorSlot,
                        )
                        AppTab.Records -> RecordsScreen(
                            records = records,
                            onMarkFalsePositive = { record ->
                                coroutineScope.launch(Dispatchers.IO) { repository.confirmMisreport(record.triggerTimestampMillis) }
                            },
                        )
                        AppTab.Settings -> SettingsScreen(
                            settings = preferences,
                            onSettingsChange = { next ->
                                coroutineScope.launch(Dispatchers.IO) { repository.savePreferences(next) }
                            },
                            versionCheckState = versionCheckState,
                            modelState = modelState,
                            onCheckForUpdate = {
                                coroutineScope.launch {
                                    versionCheckState = VersionCheckState.Checking
                                    versionCheckState = when (val result = withContext(Dispatchers.IO) { repository.checkForUpdate() }) {
                                        is ApiResult.Success -> if (result.value.hasUpdate) VersionCheckState.UpdateAvailable(result.value) else VersionCheckState.UpToDate
                                        ApiResult.NotConfigured -> VersionCheckState.NotConfigured
                                        is ApiResult.HttpError -> VersionCheckState.Failed("${result.statusCode} ${result.message}")
                                        is ApiResult.NetworkError -> VersionCheckState.Failed(result.message)
                                        is ApiResult.ParseError -> VersionCheckState.Failed(result.message)
                                    }
                                }
                            },
                            onCheckModel = {
                                coroutineScope.launch(Dispatchers.IO) { repository.checkForModelUpdate() }
                            },
                            onRollbackModel = {
                                coroutineScope.launch(Dispatchers.IO) { repository.rollbackModel() }
                            },
                        )
                        AppTab.Profile -> ProfileScreen()
                    }
                }
            }
        }
    }
}

private fun AppPreferences.toTriggerConfig() = TriggerConfig(
    sinkThresholdPx = sinkThresholdPx,
    trembleThresholdHz = trembleThresholdHz,
    minSinkDurationMillis = (durationSeconds * 1_000f).roundToLong(),
    minConfidence = confidenceThreshold,
)

internal fun resolveDarkTheme(preferences: AppPreferences, systemDark: Boolean, hourOfDay: Int): Boolean {
    if (preferences.autoTheme) return hourOfDay < 6 || hourOfDay >= 18
    return when (ThemeMode.entries.firstOrNull { it.name == preferences.themeMode } ?: ThemeMode.Dark) {
        ThemeMode.System -> systemDark
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
}

internal val AppTab.icon
    get() = when (this) {
        AppTab.Monitor -> Icons.Filled.Home
        AppTab.Records -> Icons.AutoMirrored.Filled.List
        AppTab.Settings -> Icons.Filled.Settings
        AppTab.Profile -> Icons.Filled.Person
    }

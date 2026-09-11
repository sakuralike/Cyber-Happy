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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import android.content.Intent
import com.cyberfish.app.alert.AlertPreferences
import com.cyberfish.app.data.CyberFishRepository
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.data.preferences.AppPreferences
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.AppEventType
import com.cyberfish.app.network.SupportContent
import com.cyberfish.app.network.VersionCheckState
import com.cyberfish.app.update.installApk
import com.cyberfish.app.trigger.TriggerConfig
import com.cyberfish.app.ui.components.PillTabBar
import com.cyberfish.app.ui.screens.FishingSpotMapScreen
import com.cyberfish.app.ui.screens.MonitorScreen
import com.cyberfish.app.ui.screens.ProfileScreen
import com.cyberfish.app.ui.screens.RecordsScreen
import com.cyberfish.app.ui.screens.SettingsScreen
import com.cyberfish.app.ui.theme.CyberFishTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
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
fun CyberFishApp(permissionRevision: Int = 0) {
    val context = LocalContext.current.applicationContext
    val repository = remember(context) { CyberFishRepository(context) }
    val coroutineScope = rememberCoroutineScope()
    val preferences by repository.preferences.collectAsState(initial = AppPreferences())
    val records by repository.records.collectAsState(initial = null as List<FishRecord>?)
    val modelState by repository.modelState.collectAsState()
    val appUpdateWorkInfo by repository.appUpdateWorkInfo.collectAsState(initial = null)
    val userSession by repository.userSession.collectAsState(initial = null)
    var selectedTabName by rememberSaveable { mutableStateOf(AppTab.Monitor.name) }
    var showingFishingSpots by rememberSaveable { mutableStateOf(false) }
    var versionCheckState by remember { mutableStateOf<VersionCheckState>(VersionCheckState.Idle) }
    var supportContent by remember { mutableStateOf(SupportContent()) }
    val selectedTab = AppTab.valueOf(selectedTabName)
    LaunchedEffect(repository) {
        repository.scheduleModelUpdates()
        val supportResult = withContext(Dispatchers.IO) {
            repository.reportEvent(AppEventType.LAUNCH)
            repository.loadSupportContent()
        }
        if (supportResult is ApiResult.Success) supportContent = supportResult.value
    }
    val darkTheme = resolveDarkTheme(
        preferences = preferences,
        systemDark = isSystemInDarkTheme(),
        hourOfDay = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY),
    )

    CyberFishTheme(darkTheme = darkTheme) {
        if (showingFishingSpots) {
            FishingSpotMapScreen(
                favoriteSpots = preferences.favoriteFishingSpots,
                onFavoriteSpotsChange = { spots ->
                    coroutineScope.launch(Dispatchers.IO) {
                        repository.savePreferences(preferences.copy(favoriteFishingSpots = spots))
                    }
                },
                onBack = { showingFishingSpots = false },
            )
        } else Scaffold(
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
                            permissionRevision = permissionRevision,
                            onOpenSettings = { selectedTabName = AppTab.Settings.name },
                            triggerConfig = preferences.toTriggerConfig(),
                            alertPreferences = AlertPreferences(
                                soundEnabled = preferences.soundEnabled,
                                vibrationEnabled = preferences.vibrationEnabled,
                                notificationEnabled = preferences.notificationEnabled,
                                quietHoursEnabled = preferences.quietHoursEnabled,
                            ),
                            onTriggerPersist = { event ->
                                coroutineScope.launch(Dispatchers.IO) {
                                    repository.saveTrigger(event)
                                    repository.reportEvent(AppEventType.TRIGGER, event.modelVersion)
                                }
                            },
                            onMarkFalsePositive = { event ->
                                coroutineScope.launch(Dispatchers.IO) { repository.confirmMisreport(event) }
                            },
                            onFrameMetrics = { metrics ->
                                coroutineScope.launch(Dispatchers.IO) {
                                    repository.reportEvent(
                                        eventType = AppEventType.MODEL_CALL,
                                        modelVersion = repository.modelRepository.detectorSlot.modelVersion,
                                        payload = JSONObject()
                                            .put("inferenceMs", metrics.latencyMillis)
                                            .put("fps", metrics.framesPerSecond),
                                    )
                                }
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
                            appUpdateWorkInfo = appUpdateWorkInfo,
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
                            onDownloadAppUpdate = {
                                (versionCheckState as? VersionCheckState.UpdateAvailable)?.update?.let(repository::enqueueAppUpdate)
                            },
                            onInstallAppUpdate = { path -> installApk(context, path) },
                            onCheckModel = {
                                coroutineScope.launch(Dispatchers.IO) { repository.checkForModelUpdate() }
                            },
                            onRollbackModel = {
                                coroutineScope.launch(Dispatchers.IO) { repository.rollbackModel() }
                            },
                        )
                        AppTab.Profile -> ProfileScreen(
                            records = records.orEmpty(),
                            favoriteSpots = preferences.favoriteSpots,
                            userSession = userSession,
                            supportContent = supportContent,
                            onOpenFishingSpots = { showingFishingSpots = true },
                            onExportRecords = {
                                coroutineScope.launch {
                                    val file = withContext(Dispatchers.IO) { repository.exportRecords(records.orEmpty()) }
                                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                                    val share = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/csv"
                                        putExtra(Intent.EXTRA_STREAM, uri)
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                                    }
                                    context.startActivity(Intent.createChooser(share, "导出记录").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                }
                            },
                            onLogin = repository::login,
                            onRegister = repository::register,
                            onLogout = repository::logout,
                            onSubmitFeedback = repository::submitFeedback,
                        )
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

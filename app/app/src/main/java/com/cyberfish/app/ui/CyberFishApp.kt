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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.cyberfish.app.ui.components.PillTabBar
import com.cyberfish.app.ui.screens.MonitorScreen
import com.cyberfish.app.ui.screens.ProfileScreen
import com.cyberfish.app.ui.screens.RecordsScreen
import com.cyberfish.app.ui.screens.SettingsScreen
import com.cyberfish.app.ui.theme.CyberFishTheme

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
    var selectedTabName by rememberSaveable { mutableStateOf(AppTab.Monitor.name) }
    var themeModeName by rememberSaveable { mutableStateOf(ThemeMode.Dark.name) }
    val selectedTab = AppTab.valueOf(selectedTabName)
    val themeMode = ThemeMode.valueOf(themeModeName)
    val darkTheme = when (themeMode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }

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
                        )
                        AppTab.Records -> RecordsScreen()
                        AppTab.Settings -> SettingsScreen(
                            themeMode = themeMode,
                            onThemeModeChange = { themeModeName = it.name },
                        )
                        AppTab.Profile -> ProfileScreen()
                    }
                }
            }
        }
    }
}

internal val AppTab.icon
    get() = when (this) {
        AppTab.Monitor -> Icons.Filled.Home
        AppTab.Records -> Icons.AutoMirrored.Filled.List
        AppTab.Settings -> Icons.Filled.Settings
        AppTab.Profile -> Icons.Filled.Person
    }

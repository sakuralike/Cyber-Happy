package com.cyberfish.app.ui.screens

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cyberfish.app.ui.components.EmptyState
import com.cyberfish.app.ui.components.ScreenTitle

@Composable
fun ProfileScreen() {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { ScreenTitle("我的") }
        item { EmptyState("暂无内容", "钓场收藏、数据导出和反馈将在 v1.1 开放") }
    }
}

package com.cyberfish.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.cyberfish.app.BuildConfig
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.ui.components.ScreenTitle

@Composable
fun ProfileScreen(
    records: List<FishRecord>,
    favoriteSpots: Set<String>,
    onFavoriteSpotsChange: (Set<String>) -> Unit,
    onExportRecords: () -> Unit,
) {
    var action by remember { mutableStateOf(ProfileAction.None) }
    val context = LocalContext.current
    val validCount = records.count { !it.isFalsePositive }

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { ScreenTitle("我的", "设备与账户") }
        item {
            Card(Modifier.fillMaxWidth().padding(horizontal = 20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), shape = RoundedCornerShape(20.dp)) {
                Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    Surface(Modifier.size(72.dp), shape = androidx.compose.foundation.shape.CircleShape, color = MaterialTheme.colorScheme.primaryContainer) { Text("赛", Modifier.padding(18.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold) }
                    Column {
                        Text("钓手 · 阿泽", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                        Text("设备 CF-2381  ·  已绑定", Modifier.padding(top = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
                        Text("本地记录 $validCount 条有效 · ${records.size - validCount} 条误报", Modifier.padding(top = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth().padding(horizontal = 20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), shape = RoundedCornerShape(20.dp)) {
                val entries = listOf("数据导出" to ProfileAction.Export, "钓场收藏" to ProfileAction.Favorites, "反馈与帮助" to ProfileAction.Feedback, "关于赛博鱼乐" to ProfileAction.About)
                Column {
                    entries.forEachIndexed { index, (label, target) ->
                        Row(Modifier.fillMaxWidth().clickable { if (target == ProfileAction.Export) onExportRecords() else action = target }.padding(horizontal = 20.dp, vertical = 19.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                            if (target == ProfileAction.Favorites && favoriteSpots.isNotEmpty()) Text(favoriteSpots.size.toString(), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
                        }
                        if (index < entries.lastIndex) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f))
                    }
                }
            }
        }
        item { Text("版本 ${BuildConfig.VERSION_NAME} · 模型 LiteRT v3", Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center) }
    }

    when (action) {
        ProfileAction.Export -> Unit
        ProfileAction.Favorites -> FavoritesDialog(favoriteSpots, onFavoriteSpotsChange) { action = ProfileAction.None }
        ProfileAction.Feedback -> FeedbackDialog({ action = ProfileAction.None }) {
            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:support@cyberfish.cn")).apply { putExtra(Intent.EXTRA_SUBJECT, "赛博鱼乐反馈") }
            runCatching { context.startActivity(intent) }; action = ProfileAction.None
        }
        ProfileAction.About -> AboutDialog { action = ProfileAction.None }
        ProfileAction.None -> Unit
    }
}

private enum class ProfileAction { None, Export, Favorites, Feedback, About }

@Composable
private fun FavoritesDialog(favoriteSpots: Set<String>, onChange: (Set<String>) -> Unit, onDismiss: () -> Unit) {
    var newSpot by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("钓场收藏") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (favoriteSpots.isEmpty()) Text("暂无内容", color = MaterialTheme.colorScheme.onSurfaceVariant)
            favoriteSpots.sorted().forEach { spot -> Row(verticalAlignment = Alignment.CenterVertically) { Text(spot, Modifier.weight(1f)); TextButton(onClick = { onChange(favoriteSpots - spot) }) { Text("移除") } } }
            OutlinedTextField(value = newSpot, onValueChange = { newSpot = it }, singleLine = true, label = { Text("添加钓场") })
        }
    }, confirmButton = { Button(onClick = { val spot = newSpot.trim(); if (spot.isNotEmpty()) onChange(favoriteSpots + spot); onDismiss() }) { Text("保存") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } })
}

@Composable
private fun FeedbackDialog(onDismiss: () -> Unit, onOpenMail: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("反馈与帮助") }, text = { Text("遇到识别问题或使用疑问，可通过邮件联系我们。误报请在记录详情中直接标记，便于携带结构化数据。") }, confirmButton = { Button(onClick = onOpenMail) { Text("发送邮件") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } })
}

@Composable
private fun AboutDialog(onDismiss: () -> Unit) {
    var showPrivacy by remember { mutableStateOf(false) }
    if (showPrivacy) AlertDialog(onDismissRequest = { showPrivacy = false }, title = { Text("隐私说明") }, text = { Text("识别默认在设备本地完成。只有你确认的误报结构化数据，以及主动选择上传的媒体，才会进入同步流程。记录导出文件保存在应用私有目录，由你选择分享目标。") }, confirmButton = { TextButton(onClick = { showPrivacy = false }) { Text("返回") } })
    else AlertDialog(onDismissRequest = onDismiss, title = { Text("关于赛博鱼乐") }, text = { Text("赛博鱼乐 ${BuildConfig.VERSION_NAME}\n端侧 AI 鱼漂识别与上鱼提醒\n模型运行时：LiteRT v3") }, confirmButton = { Button(onClick = { showPrivacy = true }) { Text("隐私说明") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } })
}

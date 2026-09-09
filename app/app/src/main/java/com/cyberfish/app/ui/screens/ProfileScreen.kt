package com.cyberfish.app.ui.screens

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
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cyberfish.app.ui.components.ScreenTitle

@Composable
fun ProfileScreen() {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item { ScreenTitle("我的", "设备与账户") }
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(20.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    androidx.compose.material3.Surface(
                        modifier = Modifier.size(72.dp),
                        shape = androidx.compose.foundation.shape.CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) { Text("赛", modifier = Modifier.padding(18.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold) }
                    Column {
                        Text("钓手 · 阿泽", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                        Text("设备 CF-2381  ·  已绑定", modifier = Modifier.padding(top = 5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(20.dp),
            ) {
                val entries = listOf("数据导出", "钓场收藏", "反馈与帮助", "关于赛博鱼乐")
                Column {
                    entries.forEachIndexed { index, label ->
                        Row(
                            Modifier.fillMaxWidth().clickable { }.padding(horizontal = 20.dp, vertical = 19.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
                        }
                        if (index < entries.lastIndex) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f))
                    }
                }
            }
        }
        item {
            Text("版本 1.0.0 · 模型 LiteRT v3", modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        item {
            Text("暂无内容", modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.cyberfish.app.BuildConfig
import com.cyberfish.app.data.model.FishRecord
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.SupportContent
import com.cyberfish.app.network.UserSession
import com.cyberfish.app.ui.components.ScreenTitle
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    records: List<FishRecord>,
    favoriteSpots: Set<String>,
    userSession: UserSession?,
    supportContent: SupportContent,
    onOpenFishingSpots: () -> Unit,
    onExportRecords: () -> Unit,
    onLogin: suspend (String, String) -> ApiResult<UserSession>,
    onRegister: suspend (String, String, String, String) -> ApiResult<UserSession>,
    onLogout: suspend () -> Unit,
    onSubmitFeedback: suspend (String, String) -> ApiResult<Unit>,
) {
    var action by remember { mutableStateOf(ProfileAction.None) }
    val scope = rememberCoroutineScope()
    val validCount = records.count { !it.isFalsePositive }
    val account = userSession?.user

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item { ScreenTitle("我的", "账户与设备") }
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(20.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    Surface(
                        modifier = Modifier.size(72.dp),
                        shape = androidx.compose.foundation.shape.CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Text(
                            text = (account?.displayName ?: "赛").take(1),
                            modifier = Modifier.padding(18.dp),
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            account?.displayName ?: "未登录",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            account?.username ?: "登录后同步网站用户中心",
                            modifier = Modifier.padding(top = 5.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            "本地记录 $validCount 条有效 · ${records.size - validCount} 条误报",
                            modifier = Modifier.padding(top = 4.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (account == null) {
                        Button(onClick = { action = ProfileAction.Login }) { Text("登录") }
                    } else {
                        TextButton(onClick = { scope.launch { onLogout() } }) { Text("退出") }
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
                val entries = listOf(
                    "数据导出" to ProfileAction.Export,
                    "钓场收藏" to ProfileAction.Favorites,
                    "反馈与帮助" to ProfileAction.Feedback,
                    "关于赛博鱼乐" to ProfileAction.About,
                )
                Column {
                    entries.forEachIndexed { index, (label, target) ->
                        Row(
                            modifier = Modifier.fillMaxWidth()
                                .clickable {
                                    if (target == ProfileAction.Export) onExportRecords()
                                    else if (target == ProfileAction.Favorites) onOpenFishingSpots()
                                    else action = target
                                }
                                .padding(horizontal = 20.dp, vertical = 19.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                            if (target == ProfileAction.Favorites && favoriteSpots.isNotEmpty()) {
                                Text(favoriteSpots.size.toString(), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                            }
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
                        }
                        if (index < entries.lastIndex) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f))
                    }
                }
            }
        }
        item {
            Text(
                "版本 ${BuildConfig.VERSION_NAME} · 模型 LiteRT v3",
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
    }

    when (action) {
        ProfileAction.Login -> LoginDialog(
            onDismiss = { action = ProfileAction.None },
            onLogin = onLogin,
            onRegister = onRegister,
        ) { action = ProfileAction.None }
        ProfileAction.Feedback -> FeedbackDialog(
            session = userSession,
            supportContent = supportContent,
            onDismiss = { action = ProfileAction.None },
            onLoginRequested = { action = ProfileAction.Login },
            onSubmitFeedback = onSubmitFeedback,
        )
        ProfileAction.About -> AboutDialog(supportContent) { action = ProfileAction.None }
        ProfileAction.Export, ProfileAction.Favorites, ProfileAction.None -> Unit
    }
}

private enum class ProfileAction { None, Login, Export, Favorites, Feedback, About }

@Composable
private fun LoginDialog(
    onDismiss: () -> Unit,
    onLogin: suspend (String, String) -> ApiResult<UserSession>,
    onRegister: suspend (String, String, String, String) -> ApiResult<UserSession>,
    onSuccess: () -> Unit,
) {
    var registerMode by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (registerMode) "注册账号" else "登录账号") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = username, onValueChange = { username = it }, label = { Text("用户名") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (registerMode) OutlinedTextField(value = displayName, onValueChange = { displayName = it }, label = { Text("昵称") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (registerMode) OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("邮箱（可选）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("密码") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                TextButton(onClick = { registerMode = !registerMode; error = null }) { Text(if (registerMode) "已有账号，去登录" else "没有账号，去注册") }
            }
        },
        confirmButton = {
            Button(
                enabled = !submitting && username.trim().length >= 2 && password.length >= 6,
                onClick = {
                    submitting = true
                    error = null
                    scope.launch {
                        val result = if (registerMode) onRegister(username.trim(), password, displayName.trim().ifBlank { username.trim() }, email.trim()) else onLogin(username.trim(), password)
                        submitting = false
                        if (result is ApiResult.Success) onSuccess() else error = result.message()
                    }
                },
            ) {
                if (submitting) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text(if (registerMode) "注册并登录" else "登录")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun FeedbackDialog(
    session: UserSession?,
    supportContent: SupportContent,
    onDismiss: () -> Unit,
    onLoginRequested: () -> Unit,
    onSubmitFeedback: suspend (String, String) -> ApiResult<Unit>,
) {
    var content by remember { mutableStateOf("") }
    var contact by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var feedbackMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(supportContent.feedbackTitle) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(supportContent.helpTitle, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(supportContent.helpContent, style = MaterialTheme.typography.bodyMedium)
                if (session == null) Text("登录后可提交意见反馈。", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else {
                    OutlinedTextField(value = content, onValueChange = { content = it }, label = { Text(supportContent.feedbackPlaceholder) }, minLines = 3, maxLines = 6, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = contact, onValueChange = { contact = it }, label = { Text(supportContent.feedbackContactHint) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    feedbackMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            }
        },
        confirmButton = {
            if (session == null) Button(onClick = onLoginRequested) { Text("去登录") }
            else Button(
                enabled = !submitting && content.trim().isNotEmpty(),
                onClick = {
                    submitting = true
                    feedbackMessage = null
                    scope.launch {
                        val result = onSubmitFeedback(content.trim(), contact.trim())
                        submitting = false
                        if (result is ApiResult.Success) {
                            content = ""
                            contact = ""
                            feedbackMessage = "反馈已提交"
                        } else feedbackMessage = result.message()
                    }
                },
            ) {
                if (submitting) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp) else Text("提交反馈")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}

@Composable
private fun AboutDialog(supportContent: SupportContent, onDismiss: () -> Unit) {
    var showPrivacy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (showPrivacy) "隐私说明" else supportContent.aboutTitle) },
        text = {
            Text(
                if (showPrivacy) supportContent.privacyContent else "${supportContent.aboutContent}\n\n赛博鱼乐 ${BuildConfig.VERSION_NAME}\n模型运行时：LiteRT v3",
            )
        },
        confirmButton = {
            if (showPrivacy) TextButton(onClick = { showPrivacy = false }) { Text("返回") }
            else Button(onClick = { showPrivacy = true }) { Text("隐私说明") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}

private fun ApiResult<*>.message(): String = when (this) {
    is ApiResult.Success -> ""
    ApiResult.NotConfigured -> "未配置服务地址或 APP 令牌"
    is ApiResult.HttpError -> message
    is ApiResult.NetworkError -> message
    is ApiResult.ParseError -> message
}

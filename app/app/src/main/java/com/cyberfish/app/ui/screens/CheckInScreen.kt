package com.cyberfish.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.CheckInActionResult
import com.cyberfish.app.network.CheckInHistory
import com.cyberfish.app.network.CheckInOverview
import com.cyberfish.app.network.CheckInRecord
import com.cyberfish.app.network.UserSession
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val CHECK_IN_ZONE: ZoneId = ZoneId.of("Asia/Shanghai")
private val CHECK_IN_DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

@Composable
fun CheckInScreen(
    userSession: UserSession?,
    onBack: () -> Unit,
    onRequireLogin: () -> Unit,
    onOverviewChanged: (CheckInOverview) -> Unit = {},
    loadOverview: suspend () -> ApiResult<CheckInOverview>,
    submitCheckIn: suspend () -> ApiResult<CheckInActionResult>,
    loadHistory: suspend (Int, String?) -> ApiResult<CheckInHistory>,
) {
    var overview by remember { mutableStateOf<CheckInOverview?>(null) }
    var history by remember { mutableStateOf<CheckInHistory?>(null) }
    var selectedSection by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var historyLoading by remember { mutableStateOf(false) }
    var calendarMonth by remember { mutableStateOf(YearMonth.now(CHECK_IN_ZONE)) }
    var calendarDates by remember { mutableStateOf<Set<String>>(emptySet()) }
    val scope = rememberCoroutineScope()
    val currentMonth = remember { YearMonth.now(CHECK_IN_ZONE) }

    fun refreshOverview() {
        if (userSession == null) return
        scope.launch {
            loading = true
            errorMessage = null
            when (val result = loadOverview()) {
                is ApiResult.Success -> {
                    overview = result.value
                    if (calendarMonth == currentMonth) calendarDates = result.value.checkedDates
                    onOverviewChanged(result.value)
                }
                else -> errorMessage = result.checkInMessage()
            }
            loading = false
        }
    }

    fun refreshHistory(page: Int = 1, month: String? = null) {
        if (userSession == null) return
        scope.launch {
            historyLoading = true
            if (page == 1) errorMessage = null
            when (val result = loadHistory(page, month)) {
                is ApiResult.Success -> history = if (page == 1) result.value else {
                    val current = history
                    result.value.copy(records = current?.records.orEmpty() + result.value.records)
                }
                else -> errorMessage = result.checkInMessage()
            }
            historyLoading = false
        }
    }

    LaunchedEffect(userSession?.token) {
        overview = null
        history = null
        errorMessage = null
        if (userSession != null) {
            loading = true
            when (val result = loadOverview()) {
                is ApiResult.Success -> {
                    overview = result.value
                    calendarDates = result.value.checkedDates
                    onOverviewChanged(result.value)
                }
                else -> errorMessage = result.checkInMessage()
            }
            loading = false
        }
    }

    LaunchedEffect(calendarMonth, userSession?.token) {
        if (userSession == null) return@LaunchedEffect
        if (calendarMonth == currentMonth) {
            calendarDates = overview?.checkedDates.orEmpty()
            return@LaunchedEffect
        }
        historyLoading = true
        when (val result = loadHistory(1, calendarMonth.toString())) {
            is ApiResult.Success -> calendarDates = result.value.records.map { it.date }.toSet()
            else -> errorMessage = result.checkInMessage()
        }
        historyLoading = false
    }

    LaunchedEffect(selectedSection, userSession?.token) {
        if (selectedSection == 1 && userSession != null && history == null) refreshHistory()
    }

    Column(modifier = Modifier.fillMaxSize().testTag("check-in-screen")) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("每日签到", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text("坚持签到，记录每天的钓友出勤", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = { refreshOverview(); if (selectedSection == 1) refreshHistory() }) {
                Icon(Icons.Filled.Refresh, contentDescription = "刷新")
            }
        }

        if (userSession == null) {
            LoginRequiredCheckIn(onRequireLogin = onRequireLogin)
        } else {
            TabRow(selectedTabIndex = selectedSection) {
                Tab(selected = selectedSection == 0, onClick = { selectedSection = 0 }, text = { Text("签到日历") })
                Tab(selected = selectedSection == 1, onClick = { selectedSection = 1 }, text = { Text("签到记录") })
            }

            errorMessage?.let { message ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    TextButton(
                        onClick = {
                            if (message.startsWith("登录状态")) onRequireLogin()
                            else if (selectedSection == 0) refreshOverview() else refreshHistory()
                        },
                    ) { Text(if (message.startsWith("登录状态")) "去登录" else "重试") }
                }
            }

            if (selectedSection == 0) {
                CheckInCalendarContent(
                    overview = overview,
                    calendarMonth = calendarMonth,
                    currentMonth = currentMonth,
                    calendarDates = calendarDates,
                    onPreviousMonth = { calendarMonth = calendarMonth.minusMonths(1) },
                    onNextMonth = { if (calendarMonth < currentMonth) calendarMonth = calendarMonth.plusMonths(1) },
                    loading = loading,
                    submitting = submitting,
                    onCheckIn = {
                        if (!submitting) {
                            scope.launch {
                                submitting = true
                                errorMessage = null
                                when (val result = submitCheckIn()) {
                                    is ApiResult.Success -> {
                                        overview = result.value.overview
                                        calendarDates = result.value.overview.checkedDates
                                        onOverviewChanged(result.value.overview)
                                        if (selectedSection == 1) refreshHistory()
                                    }
                                    else -> errorMessage = result.checkInMessage()
                                }
                                submitting = false
                            }
                        }
                    },
                )
            } else {
                CheckInHistoryContent(
                    history = history,
                    loading = historyLoading,
                    onLoadMore = { refreshHistory((history?.page ?: 0) + 1) },
                )
            }
        }
    }
}

@Composable
private fun LoginRequiredCheckIn(onRequireLogin: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.DateRange, contentDescription = null, modifier = Modifier.size(56.dp), tint = MaterialTheme.colorScheme.primary)
        Text("登录后参与每日签到", modifier = Modifier.padding(top = 16.dp), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Text("签到记录会同步到你的账号，在不同设备间保持一致。", modifier = Modifier.padding(top = 8.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onRequireLogin, modifier = Modifier.padding(top = 20.dp)) { Text("去登录") }
    }
}

@Composable
private fun CheckInCalendarContent(
    overview: CheckInOverview?,
    calendarMonth: YearMonth,
    currentMonth: YearMonth,
    calendarDates: Set<String>,
    onPreviousMonth: () -> Unit,
    onNextMonth: () -> Unit,
    loading: Boolean,
    submitting: Boolean,
    onCheckIn: () -> Unit,
) {
    val today = remember { LocalDate.now(CHECK_IN_ZONE) }
    val month = calendarMonth
    val todayKey = today.format(CHECK_IN_DATE_FORMAT)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(20.dp),
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("连续签到", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text((overview?.currentStreak ?: 0).toString(), style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        Text("天 · ${if ((overview?.currentStreak ?: 0) > 0) "连击中" else "等待开始"}", modifier = Modifier.padding(bottom = 6.dp), style = MaterialTheme.typography.titleMedium)
                    }
                    Text("历史最长 ${(overview?.longestStreak ?: 0)} 天", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                    val cycleLength = overview?.cycleLength ?: 7
                    val cycleDay = (overview?.cycleDay ?: 0).coerceIn(0, cycleLength)
                    Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        repeat(cycleLength) { index ->
                            Surface(
                                modifier = Modifier.weight(1f).height(8.dp),
                                shape = RoundedCornerShape(4.dp),
                                color = if (index < cycleDay) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                            ) {}
                        }
                    }
                    Text("本周期 $cycleDay / $cycleLength 天", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(20.dp),
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${month.year}年${month.monthValue}月", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        IconButton(onClick = onPreviousMonth) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "上个月") }
                        IconButton(onClick = onNextMonth, enabled = month < currentMonth) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "下个月") }
                    }
                    Spacer(Modifier.height(12.dp))
                    CalendarGrid(month, calendarDates, if (month == currentMonth) todayKey else "")
                }
            }
        }
        item {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Button(
                    onClick = onCheckIn,
                    enabled = overview != null && overview.enabled && overview.canCheckIn && !overview.checkedInToday && !submitting,
                    modifier = Modifier.fillMaxWidth().height(54.dp).testTag("check-in-button"),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    if (submitting) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Icon(if (overview?.checkedInToday == true) Icons.Filled.Check else Icons.Filled.DateRange, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text(
                        when {
                            loading -> "加载中"
                            overview == null -> "暂无法获取签到状态"
                            !overview.enabled -> "签到活动已暂停"
                            overview.checkedInToday -> "今日已签到，明天见"
                            !overview.canCheckIn -> overview.windowLabel ?: "当前不在签到时间"
                            else -> "今日签到"
                        },
                    )
                }
                overview?.notice?.let { Text(it, modifier = Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun CalendarGrid(month: YearMonth, checkedDates: Set<String>, todayKey: String) {
    val firstOffset = month.atDay(1).dayOfWeek.value - 1
    val cells = (0 until (firstOffset + month.lengthOfMonth())).map { index ->
        if (index < firstOffset) null else month.atDay(index - firstOffset + 1)
    }.let { it + List((7 - it.size % 7) % 7) { null } }
    val weekLabels = listOf("一", "二", "三", "四", "五", "六", "日")
    Row(modifier = Modifier.fillMaxWidth()) {
        weekLabels.forEach { Text(it, Modifier.weight(1f), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium) }
    }
    Spacer(Modifier.height(8.dp))
    cells.chunked(7).forEach { week ->
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            week.forEach { date ->
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    if (date != null) {
                        val key = date.format(CHECK_IN_DATE_FORMAT)
                        val checked = key in checkedDates
                        val isToday = key == todayKey
                        Surface(
                            modifier = Modifier.size(34.dp),
                            shape = CircleShape,
                            color = when {
                                checked -> MaterialTheme.colorScheme.primary
                                isToday -> MaterialTheme.colorScheme.primaryContainer
                                else -> Color.Transparent
                            },
                            border = if (isToday && !checked) BorderStroke(1.dp, MaterialTheme.colorScheme.primary) else null,
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                if (checked) Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onPrimary)
                                else Text(date.dayOfMonth.toString(), color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CheckInHistoryContent(history: CheckInHistory?, loading: Boolean, onLoadMore: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("check-in-history"),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        if (history?.records.isNullOrEmpty() && !loading) {
            item {
                Column(modifier = Modifier.fillMaxWidth().padding(top = 80.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.DateRange, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("还没有签到记录", modifier = Modifier.padding(top = 12.dp), style = MaterialTheme.typography.titleMedium)
                    Text("完成今天的签到后，记录会显示在这里。", modifier = Modifier.padding(top = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        history?.records?.forEach { record -> item { CheckInHistoryRow(record) } }
        if (loading) item { Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        else if (history?.hasMore == true) item {
            OutlinedButton(onClick = onLoadMore, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text("加载更多") }
        }
    }
}

@Composable
private fun CheckInHistoryRow(record: CheckInRecord) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.padding(9.dp), tint = MaterialTheme.colorScheme.primary)
        }
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(record.date, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            record.occurredAt?.let { Text(it.replace('T', ' ').take(19), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        }
        if (record.streak > 0) Text("连击第${record.streak}天", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))
}

private fun <T> ApiResult<T>.checkInMessage(): String = when (this) {
    ApiResult.NotConfigured -> "未配置服务地址或 APP 令牌"
    is ApiResult.HttpError -> if (statusCode == 401) "登录状态已失效，请重新登录" else message.ifBlank { "签到请求失败（$statusCode）" }
    is ApiResult.NetworkError -> "网络不可用，请检查网络后重试"
    is ApiResult.ParseError -> message.ifBlank { "签到数据解析失败" }
    is ApiResult.Success -> ""
}

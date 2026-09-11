package com.cyberfish.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import com.amap.api.location.AMapLocationClient
import com.amap.api.location.AMapLocationClientOption
import com.amap.api.location.AMapLocationListener
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.MapView
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.MarkerOptions
import com.amap.api.services.core.AMapException
import com.amap.api.services.core.LatLonPoint
import com.amap.api.services.core.PoiItem
import com.amap.api.services.poisearch.PoiResult
import com.amap.api.services.poisearch.PoiSearch
import com.cyberfish.app.BuildConfig
import com.cyberfish.app.data.model.FishingSpot
import com.cyberfish.app.map.AMapPrivacy
import kotlinx.coroutines.delay

@Composable
fun FishingSpotMapScreen(
    favoriteSpots: List<FishingSpot>,
    onFavoriteSpotsChange: (List<FishingSpot>) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var privacyAccepted by remember { mutableStateOf(AMapPrivacy.isAccepted(context)) }
    if (!privacyAccepted) {
        AlertDialog(
            onDismissRequest = onBack,
            title = { Text("地图服务隐私授权") },
            text = { Text("钓场功能使用高德地图、定位和搜索服务，需要处理你的位置信息以展示附近钓场。") },
            confirmButton = {
                Button(onClick = {
                    AMapPrivacy.accept(context.applicationContext)
                    privacyAccepted = true
                }) { Text("同意并继续") }
            },
            dismissButton = { TextButton(onClick = onBack) { Text("暂不使用") } },
        )
        return
    }
    if (BuildConfig.AMAP_API_KEY.isBlank()) {
        Column(modifier = Modifier.fillMaxSize()) {
            FishingSpotHeader(favoriteCount = favoriteSpots.size, onBack = onBack)
            MapStateCard("未配置高德地图 Key", "请在本机 sdk/key.txt 或 Gradle 属性中提供 Android 平台 Key。")
        }
        return
    }
    var query by remember { mutableStateOf("垂钓园") }
    var locationGranted by remember { mutableStateOf(hasLocationPermission(context)) }
    var currentLocation by remember { mutableStateOf<LatLng?>(null) }
    var searchResults by remember { mutableStateOf<List<FishingSpot>>(emptyList()) }
    var selectedSpot by remember { mutableStateOf<FishingSpot?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var activePoiSearch by remember { mutableStateOf<PoiSearch?>(null) }
    val locationClient = remember(context) {
        runCatching { AMapLocationClient(context.applicationContext) }.getOrNull()
    }
    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        locationGranted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (!locationGranted) statusMessage = "未授予定位权限，仍可按名称搜索钓场"
    }
    val displayedSpots = remember(favoriteSpots, searchResults) {
        (favoriteSpots + searchResults).distinctBy { it.poiId ?: it.id }
    }

    DisposableEffect(locationClient) {
        onDispose {
            locationClient?.stopLocation()
            locationClient?.onDestroy()
        }
    }
    DisposableEffect(locationClient, locationGranted) {
        if (locationGranted && locationClient != null) {
            locationClient.setLocationListener(object : AMapLocationListener {
                override fun onLocationChanged(location: com.amap.api.location.AMapLocation?) {
                    if (location?.errorCode == 0) {
                        currentLocation = LatLng(location.latitude, location.longitude)
                    } else if (location != null) {
                        statusMessage = "定位失败：${location.errorInfo}"
                    }
                }
            })
            locationClient.setLocationOption(
                AMapLocationClientOption().apply {
                    locationMode = AMapLocationClientOption.AMapLocationMode.Hight_Accuracy
                    isOnceLocation = true
                    isNeedAddress = true
                },
            )
            locationClient.startLocation()
        }
        onDispose { locationClient?.stopLocation() }
    }
    LaunchedEffect(locationGranted, currentLocation) {
        if (locationGranted && currentLocation == null) {
            delay(8_000)
            if (currentLocation == null) {
                statusMessage = "未获得当前位置，请开启系统位置信息后重新进入页面"
            }
        }
    }

    fun toggleFavorite(spot: FishingSpot) {
        val exists = favoriteSpots.any { it.poiId == spot.poiId || it.id == spot.id }
        onFavoriteSpotsChange(
            if (exists) favoriteSpots.filterNot { it.poiId == spot.poiId || it.id == spot.id }
            else favoriteSpots + spot,
        )
    }

    fun navigateToSpot(spot: FishingSpot) {
        if (!spot.hasCoordinates) {
            statusMessage = "该收藏没有坐标，请重新搜索后收藏"
            return
        }
        if (!openAmapNavigation(context, spot)) {
            statusMessage = "未安装高德地图，已打开浏览器导航页面"
        }
    }

    fun searchSpots() {
        val keyword = query.trim().ifBlank { "垂钓园" }
        statusMessage = "正在搜索 $keyword"
        activePoiSearch = searchFishingSpots(
            context = context,
            keyword = keyword,
            center = currentLocation,
            onResult = { result ->
                searchResults = result
                statusMessage = if (result.isEmpty()) "没有找到相关钓场" else "找到 ${result.size} 个钓场"
            },
            onError = { statusMessage = it },
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        FishingSpotHeader(favoriteCount = favoriteSpots.size, onBack = onBack)

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                label = { Text("搜索钓场、垂钓园或水库") },
            )
            Spacer(Modifier.width(8.dp))
            IconButton(onClick = ::searchSpots) {
                Icon(Icons.Filled.Search, contentDescription = "搜索钓场")
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (locationGranted) {
                Text(
                    if (currentLocation == null) "正在获取当前位置" else "已定位当前位置",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                TextButton(
                    onClick = {
                        locationLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION,
                            ),
                        )
                    },
                ) { Text("授权定位以搜索附近钓场") }
            }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = ::searchSpots) { Text("搜索") }
        }

        AMapContainer(
            spots = displayedSpots,
            currentLocation = currentLocation,
            locationEnabled = locationGranted,
            onSpotSelected = { selectedSpot = it },
        )

        selectedSpot?.let { spot ->
            SpotCard(
                spot = spot,
                favorite = favoriteSpots.any { it.poiId == spot.poiId || it.id == spot.id },
                onFavorite = { toggleFavorite(spot) },
                onNavigate = { navigateToSpot(spot) },
            )
        }

        statusMessage?.let { Text(it, Modifier.padding(horizontal = 20.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (searchResults.isNotEmpty()) {
                item { Text("搜索结果", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
                items(searchResults, key = { "search:${it.id}" }) { spot ->
                    SpotCard(
                        spot = spot,
                        favorite = favoriteSpots.any { it.poiId == spot.poiId || it.id == spot.id },
                        onFavorite = { toggleFavorite(spot) },
                        onNavigate = { navigateToSpot(spot) },
                        onClick = { selectedSpot = spot },
                    )
                }
            }
            if (favoriteSpots.isNotEmpty()) {
                item { Text("我的收藏", Modifier.padding(top = 8.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
                items(favoriteSpots, key = { "favorite:${it.id}" }) { spot ->
                    SpotCard(
                        spot = spot,
                        favorite = true,
                        onFavorite = { toggleFavorite(spot) },
                        onNavigate = { navigateToSpot(spot) },
                        onClick = { navigateToSpot(spot) },
                    )
                }
            }
        }
    }
}

@Composable
private fun FishingSpotHeader(favoriteCount: Int, onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回我的")
        }
        Column(Modifier.weight(1f)) {
            Text("钓场收藏", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text("搜索附近钓场并保存位置", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
        Text("$favoriteCount 已收藏", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun AMapContainer(
    spots: List<FishingSpot>,
    currentLocation: LatLng?,
    locationEnabled: Boolean,
    onSpotSelected: (FishingSpot) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = context.findLifecycleOwner()
    val currentOnSpotSelected = rememberUpdatedState(onSpotSelected)
    val mapView = remember(context) { MapView(context).apply { onCreate(null) } }
    var aMap by remember { mutableStateOf<AMap?>(null) }

    DisposableEffect(mapView, lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycleOwner?.lifecycle?.addObserver(observer)
        mapView.onResume()
        onDispose {
            lifecycleOwner?.lifecycle?.removeObserver(observer)
            mapView.onPause()
            mapView.onDestroy()
        }
    }

    LaunchedEffect(aMap, spots, currentLocation, locationEnabled) {
        val map = aMap ?: return@LaunchedEffect
        map.clear()
        map.uiSettings.isZoomControlsEnabled = false
        map.uiSettings.isMyLocationButtonEnabled = false
        runCatching { map.isMyLocationEnabled = locationEnabled }
        spots.filter(FishingSpot::hasCoordinates).forEach { spot ->
            map.addMarker(
                MarkerOptions()
                    .position(LatLng(spot.latitude!!, spot.longitude!!))
                    .title(spot.name)
                    .snippet(spot.address.orEmpty()),
            )
        }
        map.setOnMarkerClickListener { marker ->
            spots.firstOrNull { spot ->
                spot.latitude == marker.position.latitude && spot.longitude == marker.position.longitude
            }?.let(currentOnSpotSelected.value)
            true
        }
        currentLocation?.let { location ->
            map.moveCamera(CameraUpdateFactory.newLatLngZoom(location, if (spots.isEmpty()) 13f else 11f))
        }
    }

    Surface(
        modifier = Modifier.fillMaxWidth().height(270.dp).padding(horizontal = 20.dp),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { mapView },
            update = { aMap = it.map },
        )
    }
}

@Composable
private fun SpotCard(
    spot: FishingSpot,
    favorite: Boolean,
    onFavorite: () -> Unit,
    onNavigate: () -> Unit,
    onClick: (() -> Unit)? = null,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        shape = RoundedCornerShape(14.dp),
        onClick = onClick ?: {},
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(spot.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    spot.address ?: if (spot.hasCoordinates) "已定位" else "待在地图中定位",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            IconButton(onClick = onFavorite) {
                Icon(
                    if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = if (favorite) "取消收藏 ${spot.name}" else "收藏 ${spot.name}",
                    tint = if (favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (spot.hasCoordinates) {
                TextButton(onClick = onNavigate) { Text("导航") }
            }
        }
    }
}

@Composable
private fun MapStateCard(title: String, detail: String) {
    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(detail, Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun searchFishingSpots(
    context: Context,
    keyword: String,
    center: LatLng?,
    onResult: (List<FishingSpot>) -> Unit,
    onError: (String) -> Unit,
): PoiSearch {
    val query = PoiSearch.Query(keyword, "", "").apply {
        pageSize = 30
        pageNum = 0
    }
    return PoiSearch(context, query).apply {
        center?.let { setBound(PoiSearch.SearchBound(LatLonPoint(it.latitude, it.longitude), 10_000)) }
        setOnPoiSearchListener(object : PoiSearch.OnPoiSearchListener {
            override fun onPoiSearched(result: PoiResult?, code: Int) {
                if (code != AMapException.CODE_AMAP_SUCCESS) {
                    onError("搜索失败（$code）")
                    return
                }
                onResult(result?.pois.orEmpty().mapNotNull(PoiItem::toFishingSpot))
            }

            override fun onPoiItemSearched(item: PoiItem?, code: Int) = Unit
        })
        searchPOIAsyn()
    }
}

private fun PoiItem.toFishingSpot(): FishingSpot? {
    val point = latLonPoint ?: return null
    val name = title?.trim().orEmpty()
    if (name.isBlank()) return null
    val addressText = listOfNotNull(provinceName, cityName, adName, snippet)
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
        .joinToString(separator = "")
        .ifBlank { null }
    return FishingSpot(
        id = "poi:${poiId ?: "$name:${point.latitude}:${point.longitude}"}",
        name = name,
        latitude = point.latitude,
        longitude = point.longitude,
        address = addressText,
        poiId = poiId,
    )
}

private fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

private fun Context.findLifecycleOwner(): LifecycleOwner? = when (this) {
    is LifecycleOwner -> this
    is ContextWrapper -> baseContext.findLifecycleOwner()
    else -> null
}

private fun openAmapNavigation(context: Context, spot: FishingSpot): Boolean {
    val latitude = spot.latitude ?: return false
    val longitude = spot.longitude ?: return false
    val destination = "androidamap://route?sourceApplication=CyberFish&dlat=$latitude&dlon=$longitude&dname=${Uri.encode(spot.name)}&dev=0&t=0"
    val amapIntent = Intent(Intent.ACTION_VIEW, Uri.parse(destination)).apply {
        setPackage("com.autonavi.minimap")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (amapIntent.resolveActivity(context.packageManager) != null) {
        context.startActivity(amapIntent)
        return true
    }
    val webIntent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("https://uri.amap.com/marker?position=$longitude,$latitude&name=${Uri.encode(spot.name)}&src=CyberFish&coordinate=gaode"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (webIntent.resolveActivity(context.packageManager) != null) context.startActivity(webIntent)
    return false
}

package com.cyberfish.app.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.cyberfish.app.network.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.min

@Composable
fun AvatarCropDialog(
    uri: Uri,
    onDismiss: () -> Unit,
    onUpload: suspend (Bitmap) -> ApiResult<*>,
) {
    val context = LocalContext.current
    val source by produceState<Bitmap?>(null, uri) {
        value = withContext(Dispatchers.IO) { decodeBitmap(context, uri) }
    }
    var zoom by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var uploading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Dialog(
        onDismissRequest = { if (!uploading) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.widthIn(max = 360.dp).fillMaxWidth().padding(horizontal = 20.dp),
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text("裁剪头像", style = MaterialTheme.typography.headlineSmall)
                if (source == null) {
                    Box(Modifier.fillMaxWidth().height(280.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .size(280.dp)
                            .align(Alignment.CenterHorizontally)
                            .clip(CircleShape)
                            .pointerInput(source, zoom) {
                                detectDragGestures { change, dragAmount ->
                                    change.consume()
                                    offsetX += dragAmount.x
                                    offsetY += dragAmount.y
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(
                            bitmap = source!!.asImageBitmap(),
                            contentDescription = null,
                            modifier = Modifier.fillMaxWidth().graphicsLayer(
                                scaleX = zoom,
                                scaleY = zoom,
                                translationX = offsetX,
                                translationY = offsetY,
                            ),
                            contentScale = ContentScale.Crop,
                        )
                    }
                    Text("拖动调整位置", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Slider(value = zoom, onValueChange = { zoom = it }, valueRange = 1f..3f)
                    Text("缩放", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                androidx.compose.foundation.layout.Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = onDismiss, enabled = !uploading) { Text("取消") }
                    Button(
                        onClick = {
                            val bitmap = source ?: return@Button
                            uploading = true
                            error = null
                            scope.launch {
                                when (val result = onUpload(cropBitmap(bitmap, zoom, offsetX, offsetY))) {
                                    is ApiResult.Success<*> -> onDismiss()
                                    else -> {
                                        uploading = false
                                        error = result.avatarMessage()
                                    }
                                }
                            }
                        },
                        enabled = source != null && !uploading,
                    ) {
                        if (uploading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        else Text("使用头像")
                    }
                }
            }
        }
    }
}

private suspend fun decodeBitmap(context: Context, uri: Uri): Bitmap? = runCatching {
    context.contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
}.getOrNull()

private fun cropBitmap(source: Bitmap, zoom: Float, offsetX: Float, offsetY: Float): Bitmap {
    val viewport = 280f
    val sourceWidth = source.width.toFloat()
    val sourceHeight = source.height.toFloat()
    val baseScale = max(viewport / sourceWidth, viewport / sourceHeight)
    val scale = baseScale * zoom
    val cropSide = min(sourceWidth, viewport / scale).toInt().coerceAtLeast(1)
    val centerX = sourceWidth / 2f - offsetX / scale
    val centerY = sourceHeight / 2f - offsetY / scale
    val left = (centerX - cropSide / 2f).toInt().coerceIn(0, source.width - cropSide)
    val top = (centerY - cropSide / 2f).toInt().coerceIn(0, source.height - cropSide)
    return Bitmap.createBitmap(source, left, top, cropSide, cropSide).let {
        Bitmap.createScaledBitmap(it, 512, 512, true)
    }
}

private fun ApiResult<*>.avatarMessage(): String = when (this) {
    is ApiResult.HttpError -> message
    is ApiResult.NetworkError -> message
    is ApiResult.ParseError -> message
    ApiResult.NotConfigured -> "未配置服务地址或 APP 令牌"
    is ApiResult.Success<*> -> ""
}

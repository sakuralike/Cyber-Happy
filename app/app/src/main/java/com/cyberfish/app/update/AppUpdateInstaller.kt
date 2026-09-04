package com.cyberfish.app.update

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

fun installApk(context: Context, apkPath: String): Boolean {
    val file = File(apkPath)
    if (!file.isFile) return false
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return runCatching {
        context.startActivity(intent)
        true
    }.getOrDefault(false)
}

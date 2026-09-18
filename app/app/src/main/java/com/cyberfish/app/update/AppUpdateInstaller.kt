package com.cyberfish.app.update

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

sealed interface ApkInstallPreparation {
    data class Ready(val intent: Intent, val versionCode: Long) : ApkInstallPreparation
    data object PermissionRequired : ApkInstallPreparation
    data object FileMissing : ApkInstallPreparation
    data object InvalidPackage : ApkInstallPreparation
    data object VersionNotNewer : ApkInstallPreparation
    data object SignatureMismatch : ApkInstallPreparation
    data class Failed(val message: String) : ApkInstallPreparation
}

fun prepareApkInstall(context: Context, apkPath: String): ApkInstallPreparation {
    val file = File(apkPath)
    if (!file.isFile) return ApkInstallPreparation.FileMissing
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !context.packageManager.canRequestPackageInstalls()
    ) {
        return runCatching {
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).setData(
                    Uri.parse("package:${context.packageName}"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            ApkInstallPreparation.PermissionRequired
        }.getOrElse { ApkInstallPreparation.Failed("请在系统设置中允许安装未知应用") }
    }

    val archiveInfo = runCatching {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
        context.packageManager.getPackageArchiveInfo(file.absolutePath, flags)
    }.getOrNull() ?: return ApkInstallPreparation.InvalidPackage
    if (archiveInfo.packageName != context.packageName) return ApkInstallPreparation.InvalidPackage
    val targetVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        archiveInfo.longVersionCode
    } else {
        @Suppress("DEPRECATION")
        archiveInfo.versionCode.toLong()
    }
    val currentVersionCode = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.PackageInfoFlags.of(0),
            ).longVersionCode
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).versionCode.toLong()
        }
    }.getOrNull()
    if (currentVersionCode != null && targetVersionCode <= currentVersionCode) {
        return ApkInstallPreparation.VersionNotNewer
    }
    if (!hasSameSigner(context, archiveInfo)) return ApkInstallPreparation.SignatureMismatch

    val uri = runCatching {
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }.getOrElse { return ApkInstallPreparation.Failed("无法读取安装包") }
    val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri("APK", uri)
    }
    if (intent.resolveActivity(context.packageManager) == null) {
        return ApkInstallPreparation.Failed("系统没有可用的安装器")
    }
    return ApkInstallPreparation.Ready(intent, targetVersionCode)
}

fun installApk(context: Context, apkPath: String): ApkInstallPreparation {
    return when (val preparation = prepareApkInstall(context, apkPath)) {
        is ApkInstallPreparation.Ready -> runCatching {
            context.startActivity(preparation.intent)
            preparation
        }.getOrElse { ApkInstallPreparation.Failed("无法打开系统安装器") }
        else -> preparation
    }
}

private fun hasSameSigner(context: Context, archiveInfo: android.content.pm.PackageInfo): Boolean {
    val currentInfo = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNING_CERTIFICATES,
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
        }
    }.getOrNull() ?: return true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val current = currentInfo.signingInfo ?: return false
        val archive = archiveInfo.signingInfo ?: return false
        val currentSigners = current.apkContentsSigners.orEmpty().toList()
            .plus(current.signingCertificateHistory.orEmpty().toList())
            .map { it.toCharsString() }
            .toSet()
        val archiveSigners = archive.apkContentsSigners.orEmpty().toList()
            .plus(archive.signingCertificateHistory.orEmpty().toList())
            .map { it.toCharsString() }
            .toSet()
        return currentSigners.intersect(archiveSigners).isNotEmpty()
    }
    @Suppress("DEPRECATION")
    val currentSignatures = currentInfo.signatures.orEmpty().map { it.toCharsString() }.toSet()
    @Suppress("DEPRECATION")
    val archiveSignatures = archiveInfo.signatures.orEmpty().map { it.toCharsString() }.toSet()
    return currentSignatures == archiveSignatures
}

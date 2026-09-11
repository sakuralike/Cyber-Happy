package com.cyberfish.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.cyberfish.app.ui.CyberFishApp

class MainActivity : ComponentActivity() {
    private var permissionRevision by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CyberFishApp(permissionRevision = permissionRevision) }
        if (savedInstanceState == null) requestStartupPermissionsOnce()
    }

    private fun requestStartupPermissionsOnce() {
        val preferences = getSharedPreferences(STARTUP_PREFERENCES, MODE_PRIVATE)
        if (preferences.getBoolean(PERMISSIONS_REQUESTED, false)) return
        preferences.edit().putBoolean(PERMISSIONS_REQUESTED, true).apply()
        requestNextStartupPermission()
    }

    private fun requestNextStartupPermission() {
        when {
            !hasPermission(Manifest.permission.CAMERA) -> {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST)
            }
            !hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) &&
                !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION) -> {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                    LOCATION_PERMISSION_REQUEST,
                )
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        permissionRevision++
        if (requestCode == CAMERA_PERMISSION_REQUEST) requestNextStartupPermission()
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private companion object {
        const val STARTUP_PREFERENCES = "startup_permissions"
        const val PERMISSIONS_REQUESTED = "requested"
        const val CAMERA_PERMISSION_REQUEST = 1001
        const val LOCATION_PERMISSION_REQUEST = 1002
    }
}

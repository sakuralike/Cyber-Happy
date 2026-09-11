package com.cyberfish.app

import android.app.Application
import com.cyberfish.app.map.AMapPrivacy

class CyberFishApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AMapPrivacy.initialize(this)
    }
}

package com.cyberfish.app.map

import android.content.Context
import com.amap.api.location.AMapLocationClient
import com.amap.api.maps.MapsInitializer
import com.amap.api.services.core.ServiceSettings
import com.cyberfish.app.BuildConfig

object AMapPrivacy {
    private const val PREFERENCES = "amap_privacy"
    private const val ACCEPTED = "accepted"

    fun isAccepted(context: Context): Boolean =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(ACCEPTED, false)

    fun initialize(context: Context) {
        val accepted = isAccepted(context)
        if (BuildConfig.AMAP_API_KEY.isNotBlank()) {
            AMapLocationClient.setApiKey(BuildConfig.AMAP_API_KEY)
        }
        MapsInitializer.updatePrivacyShow(context, true, accepted)
        MapsInitializer.updatePrivacyAgree(context, accepted)
        AMapLocationClient.updatePrivacyShow(context, true, accepted)
        AMapLocationClient.updatePrivacyAgree(context, accepted)
        ServiceSettings.updatePrivacyShow(context, true, accepted)
        ServiceSettings.updatePrivacyAgree(context, accepted)
    }

    fun accept(context: Context) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(ACCEPTED, true)
            .apply()
        initialize(context)
    }
}

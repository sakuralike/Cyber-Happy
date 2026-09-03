package com.cyberfish.app.alert

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.cyberfish.app.trigger.TriggerEvent
import java.util.concurrent.atomic.AtomicInteger

data class AlertPreferences(
    val soundEnabled: Boolean = true,
    val vibrationEnabled: Boolean = true,
    val notificationEnabled: Boolean = true,
)

interface AlertNotifier {
    fun alert(event: TriggerEvent)
}

class AndroidAlertNotifier(
    context: Context,
    private val preferences: AlertPreferences = AlertPreferences(),
) : AlertNotifier {
    private val appContext = context.applicationContext
    private val notificationManager = NotificationManagerCompat.from(appContext)
    private val notificationId = AtomicInteger()

    override fun alert(event: TriggerEvent) {
        if (preferences.soundEnabled) playSound()
        if (preferences.vibrationEnabled) vibrate()
        if (preferences.notificationEnabled) postNotification(event)
    }

    private fun playSound() {
        val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80)
        tone.startTone(ToneGenerator.TONE_PROP_BEEP, SOUND_DURATION_MILLIS)
        Handler(Looper.getMainLooper()).postDelayed({ tone.release() }, SOUND_DURATION_MILLIS.toLong())
    }

    @Suppress("DEPRECATION")
    private fun vibrate() {
        val vibrator = appContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, -1))
        } else {
            vibrator.vibrate(VIBRATION_PATTERN, -1)
        }
    }

    private fun postNotification(event: TriggerEvent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        ensureNotificationChannel()
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("检测到上鱼动作")
            .setContentText("置信度 %.0f%% · %s".format(event.confidence * 100, event.reason))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build()
        try {
            notificationManager.notify(notificationId.incrementAndGet(), notification)
        } catch (_: SecurityException) {
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = android.app.NotificationChannel(
            CHANNEL_ID,
            "上鱼提醒",
            android.app.NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "鱼漂检测触发提醒"
            enableVibration(false)
            setSound(null, null)
        }
        appContext.getSystemService(android.app.NotificationManager::class.java).createNotificationChannel(channel)
    }

    private companion object {
        const val CHANNEL_ID = "fish_trigger"
        const val SOUND_DURATION_MILLIS = 180
        val VIBRATION_PATTERN = longArrayOf(0L, 200L, 100L, 200L)
    }
}

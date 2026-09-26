package com.cyberfish.app.alert

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.cyberfish.app.trigger.TriggerAction
import com.cyberfish.app.trigger.TriggerEvent
import com.cyberfish.app.R
import java.util.concurrent.atomic.AtomicInteger

data class AlertPreferences(
    val soundEnabled: Boolean = true,
    val vibrationEnabled: Boolean = true,
    val notificationEnabled: Boolean = true,
    val quietHoursEnabled: Boolean = true,
)

fun AlertPreferences.isQuietHour(hourOfDay: Int): Boolean =
    quietHoursEnabled && (hourOfDay >= QUIET_START_HOUR || hourOfDay < QUIET_END_HOUR)

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
        if (preferences.isQuietHour(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY))) return
        if (preferences.soundEnabled) playSound(event.action)
        if (event.action == TriggerAction.FishOn || event.action == TriggerAction.BlackDrift) {
            if (preferences.vibrationEnabled) vibrate()
            if (preferences.notificationEnabled) postNotification(event)
        }
    }

    private fun playSound(action: TriggerAction) {
        runCatching {
            MediaPlayer.create(appContext, action.soundResource)?.apply {
                setOnCompletionListener { it.release() }
                setOnErrorListener { player, _, _ -> player.release(); true }
                start()
            }
        }
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
        val VIBRATION_PATTERN = longArrayOf(0L, 200L, 100L, 200L)
    }
}

private val TriggerAction.soundResource: Int
    get() = when (this) {
        TriggerAction.Attention -> R.raw.alert_attention
        TriggerAction.PrepareRod -> R.raw.prepare_hook
        TriggerAction.FishOn -> R.raw.fish_on_hook
        TriggerAction.BlackDrift -> R.raw.black_float
    }

private const val QUIET_START_HOUR = 22
private const val QUIET_END_HOUR = 6

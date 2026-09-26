package com.cyberfish.app.update

import com.cyberfish.app.network.AppDownloadMode
import com.cyberfish.app.network.AppUpdateInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.IOException

class AppUpdatePolicyTest {
    @Test
    fun `release update requires https checksum bounded size and a newer version`() {
        val valid = update()

        assertEquals(
            AppUpdateDownloadSpec(
                url = "https://lycwd.com/files/app.apk",
                sha256 = "a".repeat(64),
                expectedSize = 1_024,
                versionCode = 147,
            ),
            appUpdateDownloadSpec(valid, currentVersionCode = 146),
        )
        assertNull(appUpdateDownloadSpec(valid.copy(apkUrl = "http://lycwd.com/files/app.apk"), 146))
        assertNull(appUpdateDownloadSpec(valid.copy(apkUrl = "file:///tmp/app.apk"), 146))
        assertNull(appUpdateDownloadSpec(valid.copy(apkSha256 = "invalid"), 146))
        assertNull(appUpdateDownloadSpec(valid.copy(apkSizeBytes = 0), 146))
        assertNull(appUpdateDownloadSpec(valid.copy(apkSizeBytes = 201L * 1024 * 1024), 146))
        assertNull(appUpdateDownloadSpec(valid.copy(versionCode = 146), 146))
        assertNull(appUpdateDownloadSpec(valid.copy(downloadMode = AppDownloadMode.EXTERNAL), 146))
    }

    @Test
    fun `debug policy may explicitly allow http`() {
        val spec = appUpdateDownloadSpec(
            update().copy(apkUrl = "http://127.0.0.1/app.apk"),
            currentVersionCode = 146,
            allowInsecureHttp = true,
        )

        assertEquals("http://127.0.0.1/app.apk", spec?.url)
    }

    @Test
    fun `bounded stream rejects bytes beyond declared apk size`() {
        val target = ByteArrayOutputStream()
        val output = SizeBoundOutputStream(target, expectedSize = 4)

        output.write(byteArrayOf(1, 2, 3, 4))
        assertEquals(4, output.bytesWritten)
        assertThrows(IOException::class.java) { output.write(5) }
        assertEquals(4, target.size())
    }

    private fun update() = AppUpdateInfo(
        hasUpdate = true,
        updateType = "FORCE",
        downloadMode = AppDownloadMode.SERVER,
        versionName = "1.4.7",
        versionCode = 147,
        apkUrl = "https://lycwd.com/files/app.apk",
        apkSizeBytes = 1_024,
        apkSha256 = "a".repeat(64),
    )
}

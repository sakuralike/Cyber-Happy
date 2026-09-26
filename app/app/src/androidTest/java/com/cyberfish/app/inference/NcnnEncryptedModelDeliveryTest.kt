package com.cyberfish.app.inference

import androidx.test.platform.app.InstrumentationRegistry
import com.cyberfish.app.data.CyberFishRepository
import com.cyberfish.app.update.ModelInstallStatus
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NcnnEncryptedModelDeliveryTest {
    @Test
    fun registersDownloadsDecryptsActivatesAndRunsNcnnModel() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = CyberFishRepository(context).modelRepository

        val result = repository.checkAndInstall()

        assertTrue("${result.errorCode}: ${result.errorMessage}", result.activated)
        assertEquals("yolo26n-ncnn-protected-v1", result.modelVersion)
        assertEquals(ModelInstallStatus.READY, repository.state.value.status)
        val detection = repository.detectorSlot.detect(
            CameraFrame(
                width = 640,
                height = 640,
                timestampNanos = 0L,
                normalizedRgb = FloatArray(640 * 640 * 3),
            ),
        )
        assertNotNull(detection)
    }
}

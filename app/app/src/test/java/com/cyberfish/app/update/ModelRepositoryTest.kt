package com.cyberfish.app.update

import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.CloseableDetector
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.LiteRtModelDescriptor
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.ModelApi
import com.cyberfish.app.network.ModelCheckInfo
import com.cyberfish.app.network.ModelDispatchStatus
import com.cyberfish.app.network.ModelUpdateInfo
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.OutputStream
import java.nio.file.Files
import java.security.MessageDigest

class ModelRepositoryTest {
    private lateinit var storageDir: File

    @Before
    fun setUp() {
        storageDir = Files.createTempDirectory("cyberfish-models").toFile()
    }

    @After
    fun tearDown() {
        storageDir.deleteRecursively()
    }

    @Test
    fun `install verifies hash then atomically activates and rollback restores previous`() = runBlocking {
        val api = FakeModelApi()
        val repository = repository(api)
        val first = update("model-v1", "first model".toByteArray())
        val second = update("model-v2", "second model".toByteArray())

        assertTrue(repository.install(first).activated)
        assertEquals("model-v1", repository.activeVersion())
        assertTrue(repository.install(second).activated)
        assertEquals("model-v2", repository.activeVersion())

        val rollback = repository.rollback("rollback-dispatch")

        assertTrue(rollback.activated)
        assertEquals("model-v1", repository.activeVersion())
        assertEquals(ModelInstallStatus.ROLLED_BACK, repository.state.value.status)
        assertTrue(File(storageDir, "active.tflite").isFile)
        assertTrue(api.reports.any { it.second == ModelDispatchStatus.SUCCESS })
        assertTrue(api.reports.any { it.second == ModelDispatchStatus.ROLLED_BACK })
    }

    @Test
    fun `hash mismatch never activates or leaves part file`() = runBlocking {
        val bytes = "corrupted model".toByteArray()
        val update = update("model-bad-hash", bytes, sha256 = "0".repeat(64))
        val repository = repository(FakeModelApi())

        val result = repository.install(update)

        assertFalse(result.activated)
        assertEquals("SHA256_MISMATCH", result.errorCode)
        assertFalse(File(storageDir, "active.tflite").exists())
        assertFalse(storageDir.listFiles()!!.any { it.name.endsWith(".part") })
    }

    @Test
    fun `signature failure never activates`() = runBlocking {
        val repository = repository(FakeModelApi(), signatureValid = false)

        val result = repository.install(update("model-bad-signature", "signed bytes".toByteArray()))

        assertFalse(result.activated)
        assertEquals("SIGNATURE_INVALID", result.errorCode)
        assertEquals(ModelInstallStatus.FAILED, repository.state.value.status)
    }

    @Test
    fun `check without update keeps mock state`() = runBlocking {
        val api = FakeModelApi(check = ModelCheckInfo(hasUpdate = false))
        val repository = repository(api)

        val result = repository.checkAndInstall()

        assertFalse(result.activated)
        assertEquals("MockDetector", repository.state.value.modelVersion)
        assertEquals(ModelInstallStatus.READY, repository.state.value.status)
    }

    private fun repository(api: FakeModelApi, signatureValid: Boolean = true) = ModelRepository(
        modelApi = api,
        storageDir = storageDir,
        signatureVerifier = ModelSignatureVerifier { _, _ -> signatureValid },
        detectorFactory = { _, descriptor -> TestDetector(descriptor.modelVersion) },
        allowInsecureHttp = false,
    )

    private fun update(version: String, body: ByteArray, sha256: String = body.sha256()) = ModelUpdateInfo(
        descriptor = LiteRtModelDescriptor(
            modelVersion = version,
            architecture = "YOLO26n",
            quantization = "W8A32",
            framework = "LiteRT",
            inputSize = 640,
            labels = listOf("fish_float"),
            sha256 = sha256,
            signature = "test-signature",
            signatureAlgorithm = "ECDSA_P256_SHA256",
            publicKeyId = "test-key",
        ),
        downloadUrl = "https://example.test/$version.tflite",
        sizeBytes = body.size.toLong(),
        dispatchId = "dispatch-$version",
    )

    private class FakeModelApi(
        private val check: ModelCheckInfo = ModelCheckInfo(hasUpdate = false),
    ) : ModelApi {
        val reports = mutableListOf<Pair<String, ModelDispatchStatus>>()

        override suspend fun checkModel(currentModelVersion: String?): ApiResult<ModelCheckInfo> = ApiResult.Success(check)

        override suspend fun reportModelDispatch(
            dispatchId: String,
            status: ModelDispatchStatus,
            progress: Int?,
            errorCode: String?,
            errorMessage: String?,
        ): ApiResult<Unit> {
            reports += dispatchId to status
            return ApiResult.Success(Unit)
        }

        override suspend fun downloadModel(
            url: String,
            output: OutputStream,
            onProgress: (downloadedBytes: Long, totalBytes: Long?) -> Unit,
        ): ApiResult<Long> {
            val body = when {
                url.contains("model-v1") -> "first model".toByteArray()
                url.contains("model-v2") -> "second model".toByteArray()
                url.contains("model-bad-hash") -> "corrupted model".toByteArray()
                else -> "signed bytes".toByteArray()
            }
            output.write(body)
            onProgress(body.size.toLong(), body.size.toLong())
            return ApiResult.Success(body.size.toLong())
        }
    }

    private class TestDetector(override val modelVersion: String) : CloseableDetector {
        override fun detect(frame: CameraFrame): Detection? = null
        override fun close() = Unit
    }
}

private fun ByteArray.sha256(): String = MessageDigest.getInstance("SHA-256")
    .digest(this)
    .joinToString("") { "%02x".format(it) }

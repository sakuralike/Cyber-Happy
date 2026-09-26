package com.cyberfish.app.update

import com.cyberfish.app.inference.CameraFrame
import com.cyberfish.app.inference.CloseableDetector
import com.cyberfish.app.inference.Detection
import com.cyberfish.app.inference.NcnnModelDescriptor
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
import java.security.KeyPairGenerator
import java.security.spec.MGF1ParameterSpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONObject

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
        assertTrue(File(storageDir, "active.bin").isFile)
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
        assertFalse(File(storageDir, "active.bin").exists())
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
        assertEquals("NCNN_NOT_READY", repository.state.value.modelVersion)
        assertEquals(ModelInstallStatus.NO_MODEL, repository.state.value.status)
    }

    @Test
    fun `check for update only marks pending model without downloading`() = runBlocking {
        val pending = update("model-pending", "pending model".toByteArray())
        val api = FakeModelApi(check = ModelCheckInfo(hasUpdate = true, update = pending))
        val repository = repository(api)

        val result = repository.checkForUpdate()

        assertTrue(result is ApiResult.Success)
        assertEquals(ModelInstallStatus.UPDATE_AVAILABLE, repository.state.value.status)
        assertEquals("model-pending", repository.state.value.modelVersion)
        assertFalse(File(storageDir, "active.bin").exists())
        assertTrue(api.reports.isEmpty())
    }

    @Test
    fun `invalid previous metadata leaves active model unchanged`() = runBlocking {
        val repository = repository(FakeModelApi())
        assertTrue(repository.install(update("model-v1", "first model".toByteArray())).activated)
        assertTrue(repository.install(update("model-v2", "second model".toByteArray())).activated)
        File(storageDir, "previous.json").writeText("not-json")

        val result = repository.rollback()

        assertFalse(result.activated)
        assertEquals("ROLLBACK_FAILED", result.errorCode)
        assertEquals("model-v2", repository.activeVersion())
        assertEquals(ModelInstallStatus.FAILED, repository.state.value.status)
    }

    @Test
    fun `encrypted install persists only ciphertext and reloads through the device key`() = runBlocking {
        val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val provider = object : ModelKeyProvider {
            override fun ensureKey() = ModelKeyMaterial("key-1", Base64.getEncoder().encodeToString(keyPair.public.encoded), "SOFTWARE")
            override fun decryptWrappedKey(wrappedKey: ByteArray): ByteArray = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
                init(Cipher.DECRYPT_MODE, keyPair.private, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
                doFinal(wrappedKey)
            }
        }
        val plaintext = "encrypted model".toByteArray()
        val body = encryptedContainer(plaintext, "model-encrypted", provider.ensureKey(), keyPair.public.encoded)
        val update = update("model-encrypted", plaintext).copy(downloadUrl = "https://example.test/model-encrypted", encrypted = true)
        val repository = repository(FakeModelApi(bodies = mapOf("model-encrypted" to body)), keyProvider = provider)

        assertTrue(repository.install(update).activated)
        assertFalse(File(storageDir, "active.bin").readBytes().contentEquals(plaintext))
        assertTrue(File(storageDir, "active.json").readText().contains("\"encrypted\":true"))
        assertEquals("model-encrypted", repository(FakeModelApi(), keyProvider = provider).activeVersion())
    }

    private fun repository(api: FakeModelApi, signatureValid: Boolean = true, keyProvider: ModelKeyProvider? = null) = ModelRepository(
        modelApi = api,
        storageDir = storageDir,
        signatureVerifier = object : ModelSignatureVerifier {
            override fun verify(file: File, descriptor: NcnnModelDescriptor) = signatureValid
            override fun verifyBytes(bytes: ByteArray, descriptor: NcnnModelDescriptor) = signatureValid
        },
        detectorFactory = { _, descriptor -> TestDetector(descriptor.modelVersion) },
        bytesDetectorFactory = { _, descriptor -> TestDetector(descriptor.modelVersion) },
        modelKeyProvider = keyProvider,
        allowInsecureHttp = false,
    )

    private fun update(version: String, body: ByteArray, sha256: String = body.sha256()) = ModelUpdateInfo(
        descriptor = NcnnModelDescriptor(
            modelVersion = version,
            architecture = "YOLO26n",
            quantization = "FP32",
            framework = "NCNN",
            inputSize = 640,
            labels = listOf("fish_float"),
            sha256 = sha256,
            signature = "test-signature",
            signatureAlgorithm = "ECDSA_P256_SHA256",
            publicKeyId = "test-key",
        ),
        downloadUrl = "https://example.test/$version.bin",
        sizeBytes = body.size.toLong(),
        dispatchId = "dispatch-$version",
    )

    private class FakeModelApi(
        private val check: ModelCheckInfo = ModelCheckInfo(hasUpdate = false),
        private val bodies: Map<String, ByteArray> = emptyMap(),
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
            val body = bodies.entries.firstOrNull { url.contains(it.key) }?.value ?: when {
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

    private fun encryptedContainer(plaintext: ByteArray, version: String, key: ModelKeyMaterial, publicKey: ByteArray): ByteArray {
        val dek = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        val nonce = ByteArray(12) { (it + 1).toByte() }
        val aad = "cyberfish-model-v1|model-id|$version|device|${plaintext.sha256()}"
        val encrypted = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, dek, GCMParameterSpec(128, nonce))
            updateAAD(aad.toByteArray())
            doFinal(plaintext)
        }
        val wrapped = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            val rsa = java.security.KeyFactory.getInstance("RSA").generatePublic(java.security.spec.X509EncodedKeySpec(publicKey))
            init(Cipher.ENCRYPT_MODE, rsa, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
            doFinal(dek.encoded)
        }
        val header = JSONObject()
            .put("version", 1).put("algorithm", "AES_256_GCM_RSA_OAEP_SHA256")
            .put("modelVersion", version).put("deviceId", "device").put("keyId", key.keyId)
            .put("keyWrap", "RSA_OAEP_SHA256_MGF1_SHA1")
            .put("authorizedUntil", "2099-01-01T00:00:00Z")
            .put("nonce", Base64.getEncoder().encodeToString(nonce))
            .put("wrappedKey", Base64.getEncoder().encodeToString(wrapped)).put("aad", aad)
            .toString().toByteArray()
        return ByteBuffer.allocate(12).order(ByteOrder.BIG_ENDIAN).put("CFMODEL1".toByteArray()).putInt(header.size).array() + header + encrypted
    }

    private class TestDetector(override val modelVersion: String) : CloseableDetector {
        override fun detect(frame: CameraFrame): Detection? = null
        override fun close() = Unit
    }
}

private fun ByteArray.sha256(): String = MessageDigest.getInstance("SHA-256")
    .digest(this)
    .joinToString("") { "%02x".format(it) }

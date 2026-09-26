package com.cyberfish.app.update

import com.cyberfish.app.inference.CloseableDetector
import com.cyberfish.app.inference.DetectorSlot
import com.cyberfish.app.inference.NcnnDetector
import com.cyberfish.app.inference.NcnnModelContract
import com.cyberfish.app.inference.NcnnModelDescriptor
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.ModelCheckInfo
import com.cyberfish.app.network.ModelApi
import com.cyberfish.app.network.ModelDispatchStatus
import com.cyberfish.app.network.ModelUpdateInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.ByteArrayInputStream
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.security.interfaces.ECPublicKey
import java.util.Base64
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.roundToInt

enum class ModelInstallStatus { NO_MODEL, CHECKING, UPDATE_AVAILABLE, DOWNLOADING, VERIFYING, READY, FAILED, ROLLED_BACK }

data class ModelState(
    val status: ModelInstallStatus = ModelInstallStatus.NO_MODEL,
    val modelVersion: String = "NCNN_NOT_READY",
    val progress: Int = 0,
    val errorCode: String? = null,
    val errorMessage: String? = null,
)

data class ModelInstallResult(
    val activated: Boolean,
    val modelVersion: String? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val retryable: Boolean = false,
)

fun interface ModelSignatureVerifier {
    fun verify(file: File, descriptor: NcnnModelDescriptor): Boolean

    fun verifyBytes(bytes: ByteArray, descriptor: NcnnModelDescriptor): Boolean = false
}

class PublicKeyModelSignatureVerifier(
    publicKeys: Map<String, String>,
) : ModelSignatureVerifier {
    private val publicKeys = publicKeys.toMap()

    override fun verify(file: File, descriptor: NcnnModelDescriptor): Boolean {
        if (!file.isFile) return false
        return runCatching { FileInputStream(file).use { verifyStream(it, descriptor) } }.getOrDefault(false)
    }

    override fun verifyBytes(bytes: ByteArray, descriptor: NcnnModelDescriptor): Boolean =
        runCatching { ByteArrayInputStream(bytes).use { verifyStream(it, descriptor) } }.getOrDefault(false)

    private fun verifyStream(input: java.io.InputStream, descriptor: NcnnModelDescriptor): Boolean {
        val signatureText = descriptor.signature ?: return false
        val keyText = publicKeys[descriptor.publicKeyId] ?: return false
        val signatureAlgorithm = descriptor.signatureAlgorithm ?: return false
        if (signatureAlgorithm != ECDSA_P256_SHA256) return false
        if (descriptor.signatureExpiresAtMillis?.let { it <= System.currentTimeMillis() } == true) return false
        return try {
            val keyBytes = decodeBase64(keyText)
            val publicKey: PublicKey = KeyFactory.getInstance("EC")
                .generatePublic(X509EncodedKeySpec(keyBytes))
            val ecKey = publicKey as? ECPublicKey ?: return false
            if (ecKey.params.order.bitLength() != P256_BIT_LENGTH || ecKey.params.curve.field.fieldSize != P256_BIT_LENGTH) return false
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(publicKey)
            val buffer = ByteArray(HASH_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count > 0) verifier.update(buffer, 0, count)
            }
            verifier.verify(decodeBase64(signatureText))
        } catch (_: Exception) {
            false
        }
    }

    private fun decodeBase64(value: String): ByteArray = Base64.getDecoder().decode(
        value.replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace(Regex("\\s"), ""),
    )

    private companion object {
        const val ECDSA_P256_SHA256 = "ECDSA_P256_SHA256"
        const val P256_BIT_LENGTH = 256
        const val HASH_BUFFER_SIZE = 32 * 1024
    }
}

class ModelRepository(
    private val modelApi: ModelApi,
    private val storageDir: File,
    val detectorSlot: DetectorSlot = DetectorSlot(),
    private val signatureVerifier: ModelSignatureVerifier = ModelSignatureVerifier { _, _ -> false },
    private val detectorFactory: (File, NcnnModelDescriptor) -> CloseableDetector = { file, descriptor ->
        NcnnDetector.fromBundle(file, descriptor)
    },
    private val bytesDetectorFactory: (ByteArray, NcnnModelDescriptor) -> CloseableDetector = { bytes, descriptor ->
        NcnnDetector.fromBundleBytes(bytes, descriptor)
    },
    private val modelKeyProvider: ModelKeyProvider? = null,
    private val allowInsecureHttp: Boolean = false,
) {
    private val stateFlow = MutableStateFlow(readState())
    private val mutationMutex = Mutex()
    private val lastProgressReport = AtomicLong(0L)
    @Volatile
    private var pendingUpdate: ModelUpdateInfo? = null
    val state: StateFlow<ModelState> = stateFlow.asStateFlow()

    init {
        storageDir.mkdirs()
        loadActive()
    }

    suspend fun checkAndInstall(currentModelVersion: String? = currentVersionForCheck()): ModelInstallResult {
        updateState(ModelState(ModelInstallStatus.CHECKING, currentModelVersion ?: activeVersion() ?: "NCNN_NOT_READY"))
        return when (val result = modelApi.checkModel(currentModelVersion)) {
            is ApiResult.Success -> {
                val check = result.value
                if (!check.hasUpdate || check.update == null) {
                    val active = currentModelVersion ?: activeVersion()
                    updateState(
                        ModelState(
                            if (active == null) ModelInstallStatus.NO_MODEL else ModelInstallStatus.READY,
                            active ?: "NCNN_NOT_READY",
                            if (active == null) 0 else 100,
                        ),
                    )
                    ModelInstallResult(activated = false, modelVersion = active)
                } else {
                    install(check.update)
                }
            }
            ApiResult.NotConfigured -> {
                updateState(ModelState(ModelInstallStatus.FAILED, currentModelVersion ?: activeVersion() ?: "NCNN_NOT_READY", errorCode = "NOT_CONFIGURED", errorMessage = "未配置服务地址或 APP 令牌"))
                ModelInstallResult(false, errorCode = "NOT_CONFIGURED", errorMessage = "未配置服务地址或 APP 令牌")
            }
            is ApiResult.HttpError -> fail("HTTP_${result.statusCode}", result.message, result.statusCode >= 500)
            is ApiResult.NetworkError -> fail("NETWORK_ERROR", result.message, true)
            is ApiResult.ParseError -> fail("PARSE_ERROR", result.message, false)
        }
    }

    suspend fun checkForUpdate(currentModelVersion: String? = currentVersionForCheck()): ApiResult<ModelCheckInfo> {
        updateState(ModelState(ModelInstallStatus.CHECKING, currentModelVersion ?: activeVersion() ?: "NCNN_NOT_READY"))
        return when (val result = modelApi.checkModel(currentModelVersion)) {
            is ApiResult.Success -> {
                val check = result.value
                if (check.hasUpdate && check.update != null) {
                    pendingUpdate = check.update
                    updateState(
                        ModelState(
                            ModelInstallStatus.UPDATE_AVAILABLE,
                            check.update.descriptor.modelVersion,
                            errorMessage = "发现新模型，确认后手动下载更新",
                        ),
                    )
                } else {
                    pendingUpdate = null
                    val active = currentModelVersion ?: activeVersion()
                    updateState(
                        ModelState(
                            if (active == null) ModelInstallStatus.NO_MODEL else ModelInstallStatus.READY,
                            active ?: "NCNN_NOT_READY",
                            if (active == null) 0 else 100,
                        ),
                    )
                }
                result
            }
            ApiResult.NotConfigured -> {
                updateState(ModelState(ModelInstallStatus.FAILED, currentModelVersion ?: activeVersion() ?: "NCNN_NOT_READY", errorCode = "NOT_CONFIGURED", errorMessage = "未配置服务地址或 APP 令牌"))
                result
            }
            is ApiResult.HttpError -> {
                updateState(ModelState(ModelInstallStatus.FAILED, currentModelVersion ?: activeVersion() ?: "NCNN_NOT_READY", errorCode = "HTTP_${result.statusCode}", errorMessage = result.message))
                result
            }
            is ApiResult.NetworkError -> {
                updateState(ModelState(ModelInstallStatus.FAILED, currentModelVersion ?: activeVersion() ?: "NCNN_NOT_READY", errorCode = "NETWORK_ERROR", errorMessage = result.message))
                result
            }
            is ApiResult.ParseError -> {
                updateState(ModelState(ModelInstallStatus.FAILED, currentModelVersion ?: activeVersion() ?: "NCNN_NOT_READY", errorCode = "PARSE_ERROR", errorMessage = result.message))
                result
            }
        }
    }

    suspend fun installPendingUpdate(): ModelInstallResult = mutationMutex.withLock {
        val update = pendingUpdate ?: return@withLock fail("NO_PENDING_UPDATE", "没有待更新模型", false)
        val result = installUnlocked(update)
        if (result.activated) pendingUpdate = null
        result
    }

    suspend fun install(update: ModelUpdateInfo): ModelInstallResult = mutationMutex.withLock {
        installUnlocked(update)
    }

    private suspend fun installUnlocked(update: ModelUpdateInfo): ModelInstallResult {
        val descriptor = update.descriptor
        val contract = NcnnModelContract.validate(descriptor)
        if (!contract.isValid) return fail("CONTRACT_INVALID", contract.errors.joinToString("；"), false)
        val downloadUrl = update.downloadUrl.trim()
        if (!isAllowedUrl(downloadUrl)) return fail("INSECURE_URL", "模型下载必须使用 HTTPS", false)

        val modelFile = File(storageDir, "active.bin")
        val partFile = File(storageDir, "${safeName(descriptor.modelVersion)}.bin.part")
        val metadataFile = File(storageDir, "active.json")
        val previousFile = File(storageDir, "previous.bin")
        val previousMetadataFile = File(storageDir, "previous.json")
        partFile.delete()
        report(update.dispatchId, ModelDispatchStatus.PENDING)
        updateState(ModelState(ModelInstallStatus.DOWNLOADING, descriptor.modelVersion, 0))

        val downloadResult = try {
            FileOutputStream(partFile).use { output ->
                modelApi.downloadModel(downloadUrl, output) { downloaded, total ->
                    val progress = if (total != null && total > 0) (downloaded * 100f / total).roundToInt().coerceIn(0, 100) else 0
                    updateState(ModelState(ModelInstallStatus.DOWNLOADING, descriptor.modelVersion, progress))
                    val now = System.currentTimeMillis()
                    if (now - lastProgressReport.get() >= PROGRESS_REPORT_INTERVAL_MILLIS || progress == 100) {
                        lastProgressReport.set(now)
                        report(update.dispatchId, ModelDispatchStatus.DOWNLOADING, progress)
                    }
                }
            }
        } catch (error: Exception) {
            ApiResult.ParseError(error.message ?: "模型下载失败")
        }
        if (downloadResult !is ApiResult.Success) {
            val failed = downloadResult.failureDetails()
            partFile.delete()
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = failed.first, errorMessage = failed.second)
            return fail(failed.first, failed.second, failed.first == "NETWORK_ERROR" || failed.first.startsWith("HTTP_5"))
        }

        updateState(ModelState(ModelInstallStatus.VERIFYING, descriptor.modelVersion, 100))
        val plaintext = if (update.encrypted) {
            val provider = modelKeyProvider ?: run {
                partFile.delete()
                report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "ENCRYPTION_UNAVAILABLE", errorMessage = "设备模型密钥不可用")
                return fail("ENCRYPTION_UNAVAILABLE", "设备模型密钥不可用", false)
            }
            runCatching { EncryptedModelContainer.decrypt(partFile, provider, expectedModelVersion = descriptor.modelVersion) }
                .getOrElse {
                    partFile.delete()
                    report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "DECRYPT_FAILED", errorMessage = "模型解密失败")
                    return fail("DECRYPT_FAILED", "模型解密失败", false)
                }
        } else null
        val actualSha256 = plaintext?.let(::sha256) ?: sha256(partFile)
        if (!actualSha256.equals(descriptor.sha256, ignoreCase = true)) {
            plaintext?.fill(0)
            partFile.delete()
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "SHA256_MISMATCH", errorMessage = "模型 SHA-256 校验失败")
            return fail("SHA256_MISMATCH", "模型 SHA-256 校验失败", false)
        }
        val signatureValid = if (plaintext != null) signatureVerifier.verifyBytes(plaintext, descriptor) else signatureVerifier.verify(partFile, descriptor)
        if (!signatureValid) {
            plaintext?.fill(0)
            partFile.delete()
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "SIGNATURE_INVALID", errorMessage = "模型签名校验失败")
            return fail("SIGNATURE_INVALID", "模型签名校验失败", false)
        }

        val nextDetector = try {
            if (plaintext != null) bytesDetectorFactory(plaintext, descriptor) else detectorFactory(partFile, descriptor)
        } catch (error: Exception) {
            plaintext?.fill(0)
            partFile.delete()
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "MODEL_LOAD_FAILED", errorMessage = error.message ?: "模型加载失败")
            return fail("MODEL_LOAD_FAILED", error.message ?: "模型加载失败", false)
        }

        return try {
            moveActiveToPrevious(modelFile, previousFile, metadataFile, previousMetadataFile)
            atomicMove(partFile, modelFile)
            atomicWrite(metadataFile, descriptor.toStoredJson(update.encrypted))
            detectorSlot.replace(nextDetector)
            plaintext?.fill(0)
            updateState(ModelState(ModelInstallStatus.READY, descriptor.modelVersion, 100))
            report(update.dispatchId, ModelDispatchStatus.SUCCESS, 100)
            ModelInstallResult(true, descriptor.modelVersion)
        } catch (error: Exception) {
            nextDetector.close()
            plaintext?.fill(0)
            partFile.delete()
            rollbackInternal(modelFile, previousFile, metadataFile, previousMetadataFile)
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "ACTIVATE_FAILED", errorMessage = error.message ?: "模型切换失败")
            fail("ACTIVATE_FAILED", error.message ?: "模型切换失败", false)
        }
    }

    suspend fun rollback(dispatchId: String? = null): ModelInstallResult = mutationMutex.withLock {
        rollbackUnlocked(dispatchId)
    }

    private suspend fun rollbackUnlocked(dispatchId: String?): ModelInstallResult {
        val activeFile = File(storageDir, "active.bin")
        val previousFile = File(storageDir, "previous.bin")
        val activeMetadata = File(storageDir, "active.json")
        val previousMetadata = File(storageDir, "previous.json")
        if (!previousFile.isFile || !previousMetadata.isFile) return fail("NO_PREVIOUS_MODEL", "没有可回滚的上一模型", false)
        return try {
            val stored = storedModelMetadata(previousMetadata.readText())
            val descriptor = stored.descriptor
            val contract = NcnnModelContract.validate(descriptor)
            require(contract.isValid) { contract.errors.joinToString("；") }
            val nextDetector = createVerifiedDetector(previousFile, stored)
            rollbackInternal(activeFile, previousFile, activeMetadata, previousMetadata)
            detectorSlot.replace(nextDetector)
            updateState(ModelState(ModelInstallStatus.ROLLED_BACK, descriptor.modelVersion, 100))
            report(dispatchId, ModelDispatchStatus.ROLLED_BACK, 100)
            ModelInstallResult(true, descriptor.modelVersion)
        } catch (error: Exception) {
            fail("ROLLBACK_FAILED", error.message ?: "模型回滚失败", false)
        }
    }

    fun activeVersion(): String? = readStoredModel()?.descriptor?.modelVersion

    private fun currentVersionForCheck(): String? = activeVersion().takeIf {
        stateFlow.value.status == ModelInstallStatus.READY || stateFlow.value.status == ModelInstallStatus.ROLLED_BACK
    }

    private fun loadActive() {
        val modelFile = File(storageDir, "active.bin")
        val stored = readStoredModel() ?: return
        val descriptor = stored.descriptor
        if (!modelFile.isFile) return
        try {
            val contract = NcnnModelContract.validate(descriptor)
            require(contract.isValid) { contract.errors.joinToString("；") }
            detectorSlot.replace(createVerifiedDetector(modelFile, stored))
            updateState(ModelState(ModelInstallStatus.READY, descriptor.modelVersion, 100))
        } catch (error: Exception) {
            updateState(ModelState(ModelInstallStatus.FAILED, "NCNN_NOT_READY", errorCode = "MODEL_LOAD_FAILED", errorMessage = error.message ?: "模型加载失败"))
        }
    }

    private fun fail(code: String, message: String, retryable: Boolean): ModelInstallResult {
        updateState(ModelState(ModelInstallStatus.FAILED, activeVersion() ?: "NCNN_NOT_READY", errorCode = code, errorMessage = message))
        return ModelInstallResult(false, errorCode = code, errorMessage = message, retryable = retryable)
    }

    private fun report(dispatchId: String?, status: ModelDispatchStatus, progress: Int? = null, errorCode: String? = null, errorMessage: String? = null) {
        if (dispatchId == null) return
        runCatching {
            kotlinx.coroutines.runBlocking {
                modelApi.reportModelDispatch(dispatchId, status, progress, errorCode, errorMessage)
            }
        }
    }

    private fun updateState(next: ModelState) {
        stateFlow.value = next
    }

    private fun readState(): ModelState = readStoredModel()?.let { ModelState(ModelInstallStatus.READY, it.descriptor.modelVersion, 100) }
        ?: ModelState(ModelInstallStatus.NO_MODEL, "NCNN_NOT_READY")

    private fun readStoredModel(): StoredModelMetadata? = try {
        val file = File(storageDir, "active.json")
        if (file.isFile) storedModelMetadata(file.readText()) else null
    } catch (_: Exception) {
        null
    }

    private fun createVerifiedDetector(file: File, stored: StoredModelMetadata): CloseableDetector {
        val descriptor = stored.descriptor
        val plaintext = if (stored.encrypted) {
            val provider = modelKeyProvider ?: error("设备模型密钥不可用")
            EncryptedModelContainer.decrypt(file, provider, expectedModelVersion = descriptor.modelVersion)
        } else null
        return try {
            require((plaintext?.let(::sha256) ?: sha256(file)).equals(descriptor.sha256, ignoreCase = true)) { "模型 SHA-256 校验失败" }
            require(if (plaintext != null) signatureVerifier.verifyBytes(plaintext, descriptor) else signatureVerifier.verify(file, descriptor)) { "模型签名校验失败" }
            if (plaintext != null) bytesDetectorFactory(plaintext, descriptor) else detectorFactory(file, descriptor)
        } finally {
            plaintext?.fill(0)
        }
    }

    private fun isAllowedUrl(url: String): Boolean = try {
        val scheme = java.net.URI(url).scheme?.lowercase(Locale.US)
        scheme == "https" || (allowInsecureHttp && scheme == "http")
    } catch (_: Exception) {
        false
    }

    private fun moveActiveToPrevious(active: File, previous: File, activeMetadata: File, previousMetadata: File) {
        if (active.isFile) atomicMove(active, previous)
        if (activeMetadata.isFile) atomicMove(activeMetadata, previousMetadata)
    }

    private fun rollbackInternal(active: File, previous: File, activeMetadata: File, previousMetadata: File) {
        val swapFile = File(storageDir, "rollback.swap")
        val swapMetadata = File(storageDir, "rollback.swap.json")
        if (active.isFile) atomicMove(active, swapFile)
        if (activeMetadata.isFile) atomicMove(activeMetadata, swapMetadata)
        atomicMove(previous, active)
        atomicMove(previousMetadata, activeMetadata)
        if (swapFile.isFile) atomicMove(swapFile, previous)
        if (swapMetadata.isFile) atomicMove(swapMetadata, previousMetadata)
    }

    private fun atomicMove(source: File, target: File) {
        target.parentFile?.mkdirs()
        try {
            Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(source.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    private fun atomicWrite(target: File, content: String) {
        val temporary = File(target.parentFile, "${target.name}.part")
        temporary.writeText(content)
        atomicMove(temporary, target)
    }

    private fun sha256(file: File): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count > 0) digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun sha256(bytes: ByteArray): String = java.security.MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it) }

    private fun safeName(value: String) = value.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80)

    private fun ApiResult<*>.failureDetails(): Pair<String, String> = when (this) {
        ApiResult.NotConfigured -> "NOT_CONFIGURED" to "未配置服务地址或 APP 令牌"
        is ApiResult.HttpError -> "HTTP_$statusCode" to message
        is ApiResult.NetworkError -> "NETWORK_ERROR" to message
        is ApiResult.ParseError -> "PARSE_ERROR" to message
        is ApiResult.Success<*> -> "" to ""
    }

    private companion object {
        const val PROGRESS_REPORT_INTERVAL_MILLIS = 1_000L
    }
}

private data class StoredModelMetadata(val descriptor: NcnnModelDescriptor, val encrypted: Boolean)

private fun NcnnModelDescriptor.toStoredJson(encrypted: Boolean): String = org.json.JSONObject()
    .put("encrypted", encrypted)
    .put("descriptor", org.json.JSONObject()
        .put("modelVersion", modelVersion)
        .put("architecture", architecture)
        .put("quantization", quantization)
        .put("framework", framework)
        .put("inputSize", inputSize)
        .put("labels", org.json.JSONArray(labels))
        .put("sha256", sha256)
        .put("signature", signature)
        .put("signatureAlgorithm", signatureAlgorithm)
        .put("publicKeyId", publicKeyId)
        .put("signatureExpiresAtMillis", signatureExpiresAtMillis))
    .toString()

private fun storedModelMetadata(raw: String): StoredModelMetadata {
    val root = org.json.JSONObject(raw)
    val nested = root.optJSONObject("descriptor")
    val descriptor = ncnnModelDescriptorFromJson((nested ?: root).toString())
    return StoredModelMetadata(descriptor, root.optBoolean("encrypted", false))
}

private fun ncnnModelDescriptorFromJson(raw: String): NcnnModelDescriptor {
    val data = org.json.JSONObject(raw)
    val labels = data.optJSONArray("labels")?.let { array -> List(array.length()) { index -> array.optString(index) } }.orEmpty()
    return NcnnModelDescriptor(
        modelVersion = data.optString("modelVersion"),
        architecture = data.optString("architecture"),
        quantization = data.optString("quantization"),
        framework = data.optString("framework"),
        inputSize = data.optInt("inputSize", 0),
        labels = labels,
        sha256 = data.optString("sha256"),
        signature = data.optString("signature").takeIf { it.isNotBlank() },
        signatureAlgorithm = data.optString("signatureAlgorithm").takeIf { it.isNotBlank() },
        publicKeyId = data.optString("publicKeyId").takeIf { it.isNotBlank() },
        signatureExpiresAtMillis = data.optLong("signatureExpiresAtMillis", Long.MIN_VALUE).takeIf { it != Long.MIN_VALUE },
    )
}

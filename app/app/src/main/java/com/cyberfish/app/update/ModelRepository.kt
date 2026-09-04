package com.cyberfish.app.update

import com.cyberfish.app.inference.CloseableDetector
import com.cyberfish.app.inference.DetectorSlot
import com.cyberfish.app.inference.LiteRtDetector
import com.cyberfish.app.inference.LiteRtModelContract
import com.cyberfish.app.inference.LiteRtModelDescriptor
import com.cyberfish.app.network.ApiResult
import com.cyberfish.app.network.ModelApi
import com.cyberfish.app.network.ModelDispatchStatus
import com.cyberfish.app.network.ModelUpdateInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.roundToInt

enum class ModelInstallStatus { MOCK, CHECKING, DOWNLOADING, VERIFYING, READY, FAILED, ROLLED_BACK }

data class ModelState(
    val status: ModelInstallStatus = ModelInstallStatus.MOCK,
    val modelVersion: String = "MockDetector",
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
    fun verify(file: File, descriptor: LiteRtModelDescriptor): Boolean
}

class PublicKeyModelSignatureVerifier(
    private val publicKeys: Map<String, String>,
) : ModelSignatureVerifier {
    override fun verify(file: File, descriptor: LiteRtModelDescriptor): Boolean {
        val signatureText = descriptor.signature ?: return false
        val keyText = publicKeys[descriptor.publicKeyId] ?: return false
        val signatureAlgorithm = descriptor.signatureAlgorithm ?: return false
        if (signatureAlgorithm != ECDSA_P256_SHA256) return false
        return try {
            val keyBytes = Base64.getDecoder().decode(keyText)
            val publicKey: PublicKey = KeyFactory.getInstance("EC")
                .generatePublic(X509EncodedKeySpec(keyBytes))
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(publicKey)
            FileInputStream(file).use { input ->
                val buffer = ByteArray(HASH_BUFFER_SIZE)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (count > 0) verifier.update(buffer, 0, count)
                }
            }
            verifier.verify(Base64.getDecoder().decode(signatureText))
        } catch (_: Exception) {
            false
        }
    }

    private companion object {
        const val ECDSA_P256_SHA256 = "ECDSA_P256_SHA256"
        const val HASH_BUFFER_SIZE = 32 * 1024
    }
}

class ModelRepository(
    private val modelApi: ModelApi,
    private val storageDir: File,
    val detectorSlot: DetectorSlot = DetectorSlot(),
    private val signatureVerifier: ModelSignatureVerifier = ModelSignatureVerifier { _, _ -> false },
    private val detectorFactory: (File, LiteRtModelDescriptor) -> CloseableDetector = ::LiteRtDetector,
    private val allowInsecureHttp: Boolean = false,
) {
    private val stateFlow = MutableStateFlow(readState())
    private val lastProgressReport = AtomicLong(0L)
    val state: StateFlow<ModelState> = stateFlow.asStateFlow()

    init {
        storageDir.mkdirs()
        loadActive()
    }

    suspend fun checkAndInstall(currentModelVersion: String? = activeVersion()): ModelInstallResult {
        updateState(ModelState(ModelInstallStatus.CHECKING, currentModelVersion ?: "MockDetector"))
        return when (val result = modelApi.checkModel(currentModelVersion)) {
            is ApiResult.Success -> {
                val check = result.value
                if (!check.hasUpdate || check.update == null) {
                    updateState(ModelState(ModelInstallStatus.READY, currentModelVersion ?: "MockDetector", 100))
                    ModelInstallResult(activated = false, modelVersion = currentModelVersion)
                } else {
                    install(check.update)
                }
            }
            ApiResult.NotConfigured -> {
                updateState(ModelState(ModelInstallStatus.FAILED, currentModelVersion ?: "MockDetector", errorCode = "NOT_CONFIGURED", errorMessage = "未配置服务地址或 APP 令牌"))
                ModelInstallResult(false, errorCode = "NOT_CONFIGURED", errorMessage = "未配置服务地址或 APP 令牌")
            }
            is ApiResult.HttpError -> fail("HTTP_${result.statusCode}", result.message, result.statusCode >= 500)
            is ApiResult.NetworkError -> fail("NETWORK_ERROR", result.message, true)
            is ApiResult.ParseError -> fail("PARSE_ERROR", result.message, false)
        }
    }

    suspend fun install(update: ModelUpdateInfo): ModelInstallResult {
        val descriptor = update.descriptor
        val contract = LiteRtModelContract.validate(descriptor)
        if (!contract.isValid) return fail("CONTRACT_INVALID", contract.errors.joinToString("；"), false)
        val downloadUrl = update.downloadUrl.trim()
        if (!isAllowedUrl(downloadUrl)) return fail("INSECURE_URL", "模型下载必须使用 HTTPS", false)

        val modelFile = File(storageDir, "active.tflite")
        val partFile = File(storageDir, "${safeName(descriptor.modelVersion)}.tflite.part")
        val metadataFile = File(storageDir, "active.json")
        val previousFile = File(storageDir, "previous.tflite")
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
        val actualSha256 = sha256(partFile)
        if (!actualSha256.equals(descriptor.sha256, ignoreCase = true)) {
            partFile.delete()
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "SHA256_MISMATCH", errorMessage = "模型 SHA-256 校验失败")
            return fail("SHA256_MISMATCH", "模型 SHA-256 校验失败", false)
        }
        if (!signatureVerifier.verify(partFile, descriptor)) {
            partFile.delete()
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "SIGNATURE_INVALID", errorMessage = "模型签名校验失败")
            return fail("SIGNATURE_INVALID", "模型签名校验失败", false)
        }

        val nextDetector = try {
            detectorFactory(partFile, descriptor)
        } catch (error: Exception) {
            partFile.delete()
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "MODEL_LOAD_FAILED", errorMessage = error.message ?: "模型加载失败")
            return fail("MODEL_LOAD_FAILED", error.message ?: "模型加载失败", false)
        }

        return try {
            moveActiveToPrevious(modelFile, previousFile, metadataFile, previousMetadataFile)
            atomicMove(partFile, modelFile)
            atomicWrite(metadataFile, descriptor.toJson())
            detectorSlot.replace(nextDetector)
            updateState(ModelState(ModelInstallStatus.READY, descriptor.modelVersion, 100))
            report(update.dispatchId, ModelDispatchStatus.SUCCESS, 100)
            ModelInstallResult(true, descriptor.modelVersion)
        } catch (error: Exception) {
            nextDetector.close()
            partFile.delete()
            rollbackInternal(modelFile, previousFile, metadataFile, previousMetadataFile)
            report(update.dispatchId, ModelDispatchStatus.FAILED, errorCode = "ACTIVATE_FAILED", errorMessage = error.message ?: "模型切换失败")
            fail("ACTIVATE_FAILED", error.message ?: "模型切换失败", false)
        }
    }

    suspend fun rollback(dispatchId: String? = null): ModelInstallResult {
        val activeFile = File(storageDir, "active.tflite")
        val previousFile = File(storageDir, "previous.tflite")
        val activeMetadata = File(storageDir, "active.json")
        val previousMetadata = File(storageDir, "previous.json")
        if (!previousFile.isFile || !previousMetadata.isFile) return fail("NO_PREVIOUS_MODEL", "没有可回滚的上一模型", false)
        return try {
            val descriptor = liteRtModelDescriptorFromJson(previousMetadata.readText())
            val contract = LiteRtModelContract.validate(descriptor)
            require(contract.isValid) { contract.errors.joinToString("；") }
            require(sha256(previousFile).equals(descriptor.sha256, ignoreCase = true)) { "模型 SHA-256 校验失败" }
            require(signatureVerifier.verify(previousFile, descriptor)) { "模型签名校验失败" }
            val nextDetector = detectorFactory(previousFile, descriptor)
            rollbackInternal(activeFile, previousFile, activeMetadata, previousMetadata)
            detectorSlot.replace(nextDetector)
            updateState(ModelState(ModelInstallStatus.ROLLED_BACK, descriptor.modelVersion, 100))
            report(dispatchId, ModelDispatchStatus.ROLLED_BACK, 100)
            ModelInstallResult(true, descriptor.modelVersion)
        } catch (error: Exception) {
            fail("ROLLBACK_FAILED", error.message ?: "模型回滚失败", false)
        }
    }

    fun activeVersion(): String? = readDescriptor()?.modelVersion

    private fun loadActive() {
        val modelFile = File(storageDir, "active.tflite")
        val descriptor = readDescriptor() ?: return
        if (!modelFile.isFile) return
        try {
            val contract = LiteRtModelContract.validate(descriptor)
            require(contract.isValid) { contract.errors.joinToString("；") }
            require(sha256(modelFile).equals(descriptor.sha256, ignoreCase = true)) { "模型 SHA-256 校验失败" }
            require(signatureVerifier.verify(modelFile, descriptor)) { "模型签名校验失败" }
            detectorSlot.replace(detectorFactory(modelFile, descriptor))
            updateState(ModelState(ModelInstallStatus.READY, descriptor.modelVersion, 100))
        } catch (error: Exception) {
            updateState(ModelState(ModelInstallStatus.FAILED, "MockDetector", errorCode = "MODEL_LOAD_FAILED", errorMessage = error.message ?: "模型加载失败"))
        }
    }

    private fun fail(code: String, message: String, retryable: Boolean): ModelInstallResult {
        updateState(ModelState(ModelInstallStatus.FAILED, activeVersion() ?: "MockDetector", errorCode = code, errorMessage = message))
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

    private fun readState(): ModelState = readDescriptor()?.let { ModelState(ModelInstallStatus.READY, it.modelVersion, 100) } ?: ModelState()

    private fun readDescriptor(): LiteRtModelDescriptor? = try {
        val file = File(storageDir, "active.json")
        if (file.isFile) liteRtModelDescriptorFromJson(file.readText()) else null
    } catch (_: Exception) {
        null
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

private fun LiteRtModelDescriptor.toJson(): String = org.json.JSONObject()
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
    .put("signatureExpiresAtMillis", signatureExpiresAtMillis)
    .put("runtimeSignatureName", runtimeSignatureName)
    .put("inputName", inputName)
    .put("inputLayout", inputLayout)
    .put("outputName", outputName)
    .put("coordinatesNormalized", coordinatesNormalized)
    .put("valuesPerDetection", valuesPerDetection)
    .toString()

private fun liteRtModelDescriptorFromJson(raw: String): LiteRtModelDescriptor {
    val data = org.json.JSONObject(raw)
    val labels = data.optJSONArray("labels")?.let { array -> List(array.length()) { index -> array.optString(index) } }.orEmpty()
    return LiteRtModelDescriptor(
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
        runtimeSignatureName = data.optString("runtimeSignatureName").takeIf { it.isNotBlank() },
        inputName = data.optString("inputName").takeIf { it.isNotBlank() },
        inputLayout = data.optString("inputLayout", "NCHW"),
        outputName = data.optString("outputName").takeIf { it.isNotBlank() },
        coordinatesNormalized = data.optBoolean("coordinatesNormalized", true),
        valuesPerDetection = data.optInt("valuesPerDetection", 6),
    )
}

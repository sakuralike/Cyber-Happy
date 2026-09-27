package com.cyberfish.app.inference

data class NcnnModelDescriptor(
    val modelVersion: String,
    val architecture: String,
    val quantization: String,
    val framework: String,
    val inputSize: Int,
    val labels: List<String>,
    val sha256: String,
    val modelId: String? = null,
    val deviceId: String? = null,
    val generation: Long = 0L,
    val manifestHash: String? = null,
    val inputName: String = DEFAULT_NCNN_INPUT_NAME,
    val outputName: String = DEFAULT_NCNN_OUTPUT_NAME,
    val outputLayout: String = NCNN_OUTPUT_LAYOUT_FIELDS_BY_CANDIDATES,
    val valuesPerDetection: Int = DEFAULT_NCNN_VALUES_PER_DETECTION,
    val coordinatesNormalized: Boolean = false,
    val numClasses: Int = labels.size,
    val signature: String? = null,
    val signatureAlgorithm: String? = null,
    val publicKeyId: String? = null,
    val signatureExpiresAtMillis: Long? = null,
)

data class NcnnContractResult(val errors: List<String>) {
    val isValid: Boolean
        get() = errors.isEmpty()
}

object NcnnModelContract {
    fun validate(descriptor: NcnnModelDescriptor, nowMillis: Long = System.currentTimeMillis()): NcnnContractResult {
        val errors = buildList {
            addAll(validateRuntime(descriptor).errors)
            if (descriptor.signature.isNullOrBlank()) add("模型签名缺失")
            if (descriptor.signatureAlgorithm !in SUPPORTED_SIGNATURE_ALGORITHMS) add("模型签名算法不支持")
            if (descriptor.publicKeyId.isNullOrBlank()) add("模型公钥标识缺失")
            if (descriptor.signatureExpiresAtMillis != null && descriptor.signatureExpiresAtMillis <= nowMillis) add("模型签名已过期")
        }
        return NcnnContractResult(errors)
    }

    internal fun validateRuntime(descriptor: NcnnModelDescriptor): NcnnContractResult {
        val errors = buildList {
            if (!descriptor.modelVersion.matches(MODEL_VERSION_PATTERN)) add("模型版本格式无效")
            if (descriptor.architecture != "YOLO26n") add("模型架构不是 YOLO26n")
            if (!descriptor.framework.equals("NCNN", ignoreCase = true)) add("模型运行时不是 NCNN")
            if (descriptor.quantization !in setOf("FP32", "FP16", "INT8")) add("模型量化方式不支持")
            if (descriptor.inputSize <= 0) add("模型输入尺寸无效")
            if (descriptor.labels.isEmpty()) add("模型类别不能为空")
            if (!descriptor.sha256.matches(SHA256_PATTERN)) add("模型 SHA-256 无效")
            if (descriptor.modelId != null && !descriptor.modelId.matches(MODEL_ID_PATTERN)) add("模型 ID 格式无效")
            if (descriptor.generation < 0L) add("模型 generation 无效")
            if (descriptor.manifestHash != null && !descriptor.manifestHash.matches(SHA256_PATTERN)) add("模型 manifest SHA-256 无效")
            if (!descriptor.inputName.isValidBlobName()) add("模型输入节点名称无效")
            if (!descriptor.outputName.isValidBlobName()) add("模型输出节点名称无效")
            if (descriptor.outputLayout !in SUPPORTED_OUTPUT_LAYOUTS) add("模型输出布局不支持")
            if (descriptor.valuesPerDetection < MIN_VALUES_PER_DETECTION) add("模型每候选字段数无效")
            if (descriptor.numClasses <= 0 || descriptor.numClasses != descriptor.labels.size) add("模型类别数与标签不一致")
            if (descriptor.valuesPerDetection < COORDINATE_FIELD_COUNT + descriptor.numClasses) add("模型每候选字段数不足")
        }
        return NcnnContractResult(errors)
    }

    private val MODEL_VERSION_PATTERN = Regex("[A-Za-z0-9._-]{1,80}")
    private val MODEL_ID_PATTERN = Regex("[A-Za-z0-9._:-]{1,160}")
    private val SHA256_PATTERN = Regex("[A-Fa-f0-9]{64}")
    private val SUPPORTED_SIGNATURE_ALGORITHMS = setOf("ECDSA_P256_SHA256")
    private val SUPPORTED_OUTPUT_LAYOUTS = setOf(
        NCNN_OUTPUT_LAYOUT_FIELDS_BY_CANDIDATES,
        NCNN_OUTPUT_LAYOUT_CANDIDATES_BY_FIELDS,
    )
    private const val MAX_BLOB_NAME_LENGTH = 120
    private const val MIN_VALUES_PER_DETECTION = 5
    private const val COORDINATE_FIELD_COUNT = 4

    private fun String.isValidBlobName(): Boolean =
        isNotBlank() && length <= MAX_BLOB_NAME_LENGTH && '\u0000' !in this
}

const val DEFAULT_NCNN_INPUT_NAME = "in0"
const val DEFAULT_NCNN_OUTPUT_NAME = "out0"
const val NCNN_OUTPUT_LAYOUT_FIELDS_BY_CANDIDATES = "FIELDS_BY_CANDIDATES"
const val NCNN_OUTPUT_LAYOUT_CANDIDATES_BY_FIELDS = "CANDIDATES_BY_FIELDS"
const val DEFAULT_NCNN_VALUES_PER_DETECTION = 5

package com.cyberfish.app.inference

data class LiteRtModelDescriptor(
    val modelVersion: String,
    val architecture: String,
    val quantization: String,
    val framework: String,
    val inputSize: Int,
    val labels: List<String>,
    val sha256: String,
    val signature: String? = null,
    val signatureAlgorithm: String? = null,
    val publicKeyId: String? = null,
    val signatureExpiresAtMillis: Long? = null,
    val runtimeSignatureName: String? = null,
    val inputName: String? = null,
    val inputLayout: String = "NCHW",
    val outputName: String? = null,
    val coordinatesNormalized: Boolean = true,
    val valuesPerDetection: Int = 6,
)

data class LiteRtContractResult(val errors: List<String>) {
    val isValid: Boolean
        get() = errors.isEmpty()
}

object LiteRtModelContract {
    fun validate(descriptor: LiteRtModelDescriptor, nowMillis: Long = System.currentTimeMillis()): LiteRtContractResult {
        val errors = buildList {
            if (!descriptor.modelVersion.matches(MODEL_VERSION_PATTERN)) add("模型版本格式无效")
            if (descriptor.architecture != "YOLO26n") add("模型架构不是 YOLO26n")
            if (!descriptor.framework.equals("LiteRT", ignoreCase = true)) add("模型运行时不是 LiteRT")
            if (descriptor.quantization !in setOf("W8A32", "INT8")) add("模型量化方式不支持")
            if (descriptor.inputSize <= 0) add("模型输入尺寸无效")
            if (descriptor.labels.isEmpty()) add("模型类别不能为空")
            if (!descriptor.sha256.matches(SHA256_PATTERN)) add("模型 SHA-256 无效")
            if (descriptor.valuesPerDetection != 6) add("检测输出必须为 6 列")
            if (descriptor.signature.isNullOrBlank()) add("模型签名缺失")
            if (descriptor.signatureAlgorithm !in SUPPORTED_SIGNATURE_ALGORITHMS) add("模型签名算法不支持")
            if (descriptor.publicKeyId.isNullOrBlank()) add("模型公钥标识缺失")
            if (descriptor.inputLayout.uppercase() !in SUPPORTED_INPUT_LAYOUTS) add("模型输入布局不支持")
            if (descriptor.signatureExpiresAtMillis != null && descriptor.signatureExpiresAtMillis <= nowMillis) add("模型签名已过期")
        }
        return LiteRtContractResult(errors)
    }

    private val MODEL_VERSION_PATTERN = Regex("[A-Za-z0-9._-]{1,80}")
    private val SHA256_PATTERN = Regex("[A-Fa-f0-9]{64}")
    private val SUPPORTED_SIGNATURE_ALGORITHMS = setOf("ECDSA_P256_SHA256")
    private val SUPPORTED_INPUT_LAYOUTS = setOf("NCHW", "NHWC")
}

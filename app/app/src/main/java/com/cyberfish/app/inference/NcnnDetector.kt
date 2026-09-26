package com.cyberfish.app.inference

import android.content.Context
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

class NcnnDetector private constructor(
    private val descriptor: NcnnModelDescriptor,
    private val nativeHandle: Long,
) : CloseableDetector {
    private val lock = Any()

    init {
        require(descriptor.framework.equals("NCNN", ignoreCase = true)) { "模型运行时不是 NCNN" }
        require(descriptor.inputSize > 0) { "模型输入尺寸无效" }
    }

    override val inputSize: Int
        get() = descriptor.inputSize

    override val modelVersion: String
        get() = descriptor.modelVersion

    override val requiresPixelData: Boolean
        get() = true

    override fun detect(frame: CameraFrame): Detection? {
        val pixels = frame.normalizedRgb ?: return null
        if (pixels.size != inputSize * inputSize * 3) return null
        return synchronized(lock) {
            if (handleClosed) return@synchronized null
            val values = runCatching { NcnnNative.detect(nativeHandle, pixels, inputSize) }.getOrNull() ?: return@synchronized null
            parseDetection(values, frame.inputTransform, frame.detectionRegion)
        }
    }

    override fun close() {
        synchronized(lock) {
            if (handleClosed) return
            NcnnNative.destroy(nativeHandle)
            handleClosed = true
        }
    }

    private var handleClosed = false

    private fun parseDetection(
        values: FloatArray,
        inputTransform: ModelInputTransform?,
        detectionRegion: DetectionBounds?,
    ): Detection? {
        return parseNcnnDetectionValues(descriptor, values, inputTransform, detectionRegion)
    }

    companion object {
        fun fromAssets(context: Context, descriptor: NcnnModelDescriptor): NcnnDetector {
            val param = context.assets.open("ncnn/fish_float.param").use { it.readBytes() }
            val bin = context.assets.open("ncnn/fish_float.bin").use { it.readBytes() }
            return create(descriptor, param, bin)
        }

        fun fromBundle(bundle: File, descriptor: NcnnModelDescriptor): NcnnDetector {
            require(bundle.length() in 1..MAX_BUNDLE_BYTES) { "NCNN 模型包大小无效" }
            ZipFile(bundle).use { zip ->
                val paramEntry = zip.getEntry("model.param") ?: error("NCNN 模型包缺少 model.param")
                val binEntry = zip.getEntry("model.bin") ?: error("NCNN 模型包缺少 model.bin")
                require(zip.entries().asSequence().all { it.name == "model.param" || it.name == "model.bin" }) { "NCNN 模型包包含未知文件" }
                val param = zip.getInputStream(paramEntry).use { readLimited(it, MAX_PARAM_BYTES) }
                val bin = zip.getInputStream(binEntry).use { readLimited(it, MAX_BIN_BYTES) }
                return create(descriptor, param, bin)
            }
        }

        fun fromBundleBytes(bundle: ByteArray, descriptor: NcnnModelDescriptor): NcnnDetector {
            require(bundle.size.toLong() <= MAX_BUNDLE_BYTES) { "NCNN 模型包大小无效" }
            var param: ByteArray? = null
            var bin: ByteArray? = null
            ZipInputStream(bundle.inputStream()).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    require(!entry.isDirectory && entry.name != "" && entry.name != "." && !entry.name.contains("..") && !entry.name.contains('/')) { "NCNN 模型包路径无效" }
                    when (entry.name) {
                        "model.param" -> {
                            require(param == null) { "NCNN 模型包重复 model.param" }
                            param = readLimited(zip, MAX_PARAM_BYTES)
                        }
                        "model.bin" -> {
                            require(bin == null) { "NCNN 模型包重复 model.bin" }
                            bin = readLimited(zip, MAX_BIN_BYTES)
                        }
                        else -> error("NCNN 模型包包含未知文件")
                    }
                    zip.closeEntry()
                }
            }
            val paramBytes = param ?: error("NCNN 模型包缺少 model.param")
            val binBytes = bin ?: error("NCNN 模型包缺少 model.bin")
            return try {
                create(descriptor, paramBytes, binBytes)
            } finally {
                paramBytes.fill(0)
                binBytes.fill(0)
            }
        }

        fun createBundle(param: InputStream, bin: InputStream): ByteArray {
            val bundle = ByteArrayOutputStream()
            ZipOutputStream(bundle).use { zip ->
                zip.putNextEntry(ZipEntry("model.param"))
                param.use { it.copyTo(zip) }
                zip.closeEntry()
                zip.putNextEntry(ZipEntry("model.bin"))
                bin.use { it.copyTo(zip) }
                zip.closeEntry()
            }
            return bundle.toByteArray()
        }

        private fun create(descriptor: NcnnModelDescriptor, param: ByteArray, bin: ByteArray): NcnnDetector {
            val contract = NcnnModelContract.validateRuntime(descriptor)
            require(contract.isValid) { contract.errors.joinToString("；") }
            val handle = NcnnNative.create(
                param,
                bin,
                descriptor.inputName,
                descriptor.outputName,
                descriptor.outputLayout,
                descriptor.valuesPerDetection,
            )
            require(handle != 0L) { "NCNN 模型加载失败" }
            return NcnnDetector(descriptor, handle)
        }

        private fun readLimited(input: InputStream, maxBytes: Long): ByteArray {
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(32 * 1024)
            var total = 0L
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= maxBytes) { "NCNN 模型包文件过大" }
                output.write(buffer, 0, count)
            }
            return output.toByteArray()
        }

        private const val MAX_BUNDLE_BYTES = 120L * 1024 * 1024
        private const val MAX_PARAM_BYTES = 2L * 1024 * 1024
        private const val MAX_BIN_BYTES = 100L * 1024 * 1024
    }
}

internal fun parseNcnnDetectionValues(
    descriptor: NcnnModelDescriptor,
    values: FloatArray,
    inputTransform: ModelInputTransform?,
    detectionRegion: DetectionBounds?,
): Detection? {
    val valuesPerDetection = descriptor.valuesPerDetection
    if (valuesPerDetection < 5 ||
        descriptor.numClasses <= 0 ||
        CONFIDENCE_INDEX + descriptor.numClasses > valuesPerDetection ||
        values.isEmpty() ||
        values.size % valuesPerDetection != 0
    ) return null
    val coordinateScale = if (descriptor.coordinatesNormalized) 1f else descriptor.inputSize.toFloat()
    val candidates = ArrayList<Detection>(values.size / valuesPerDetection)
    for (offset in values.indices step valuesPerDetection) {
        var confidence = Float.NEGATIVE_INFINITY
        for (classIndex in 0 until descriptor.numClasses) {
            confidence = maxOf(confidence, values[offset + CONFIDENCE_INDEX + classIndex])
        }
        if (!confidence.isFinite() || confidence <= 0f) continue
        val centerX = values[offset]
        val centerY = values[offset + 1]
        val width = values[offset + 2]
        val height = values[offset + 3]
        val modelBounds = DetectionBounds(
            (centerX - width / 2f) / coordinateScale,
            (centerY - height / 2f) / coordinateScale,
            (centerX + width / 2f) / coordinateScale,
            (centerY + height / 2f) / coordinateScale,
        )
        val bounds = mapModelBoundsToSource(modelBounds, inputTransform) ?: continue
        candidates += Detection(bounds, confidence)
    }
    return DetectionRegionGate.selectBest(candidates, detectionRegion)
}

private const val CONFIDENCE_INDEX = 4

internal fun mapModelBoundsToSource(
    bounds: DetectionBounds,
    inputTransform: ModelInputTransform?,
): DetectionBounds? {
    if (inputTransform != null) return inputTransform.modelToSourceNormalized(bounds)
    if (!bounds.left.isFinite() || !bounds.top.isFinite() ||
        !bounds.right.isFinite() || !bounds.bottom.isFinite()
    ) return null
    val normalized = DetectionBounds(
        left = bounds.left.coerceIn(0f, 1f),
        top = bounds.top.coerceIn(0f, 1f),
        right = bounds.right.coerceIn(0f, 1f),
        bottom = bounds.bottom.coerceIn(0f, 1f),
    )
    return normalized.takeIf { it.right > it.left && it.bottom > it.top }
}

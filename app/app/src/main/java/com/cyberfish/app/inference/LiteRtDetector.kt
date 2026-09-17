package com.cyberfish.app.inference

import com.google.ai.edge.litert.CompiledModel
import com.google.ai.edge.litert.TensorBuffer
import java.io.File

class LiteRtDetector(
    private val modelFile: File,
    private val descriptor: LiteRtModelDescriptor,
) : CloseableDetector {
    private val model: CompiledModel
    private val runtimeSignature: String?
    private val inputBuffers: List<TensorBuffer>
    private val outputBuffers: List<TensorBuffer>
    private val lock = Any()

    init {
        require(modelFile.isFile) { "模型文件不存在: ${modelFile.name}" }
        val contract = LiteRtModelContract.validate(descriptor)
        require(contract.isValid) { contract.errors.joinToString("；") }
        model = CompiledModel.create(modelFile.absolutePath)
        val signature = descriptor.runtimeSignatureName.orEmpty().trim()
        val setup = try {
            BufferSetup(signature.takeIf { it.isNotBlank() }, createBuffers(signature))
        } catch (firstError: Exception) {
            if (signature.isNotBlank()) throw firstError
            BufferSetup(DEFAULT_RUNTIME_SIGNATURE, runCatching { createBuffers(DEFAULT_RUNTIME_SIGNATURE) }.getOrElse { throw firstError })
        }
        runtimeSignature = setup.signature
        inputBuffers = setup.buffers.first
        outputBuffers = setup.buffers.second
        require(inputBuffers.size == 1) { "LiteRT 模型必须有一个输入 buffer" }
        require(outputBuffers.size == 1) { "LiteRT 模型必须有一个输出 buffer" }
    }

    override val inputSize: Int
        get() = descriptor.inputSize

    override val modelVersion: String
        get() = descriptor.modelVersion

    override val requiresPixelData: Boolean
        get() = true

    override fun detect(frame: CameraFrame): Detection? {
        val pixels = frame.normalizedRgb ?: return null
        val expectedInputElements = descriptor.inputSize * descriptor.inputSize * 3
        if (pixels.size != expectedInputElements) return null
        val input = toModelLayout(pixels)
        return synchronized(lock) {
            try {
                inputBuffers[0].writeFloat(input)
                runtimeSignature?.let { model.run(inputBuffers, outputBuffers, it) }
                    ?: model.run(inputBuffers, outputBuffers)
                parseDetection(outputBuffers[0].readFloat())
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun toModelLayout(rgb: FloatArray): FloatArray {
        if (descriptor.inputLayout.equals("NHWC", ignoreCase = true)) return rgb
        val planeSize = descriptor.inputSize * descriptor.inputSize
        return FloatArray(rgb.size) { index ->
            val channel = index / planeSize
            val pixel = index % planeSize
            rgb[pixel * 3 + channel]
        }
    }

    override fun close() {
        synchronized(lock) {
            inputBuffers.forEach(TensorBuffer::close)
            outputBuffers.forEach(TensorBuffer::close)
            model.close()
        }
    }

    private fun createBuffers(signature: String): Pair<List<TensorBuffer>, List<TensorBuffer>> {
        val inputs = if (signature.isBlank()) model.createInputBuffers() else model.createInputBuffers(signature)
        return try {
            val outputs = if (signature.isBlank()) model.createOutputBuffers() else model.createOutputBuffers(signature)
            inputs to outputs
        } catch (error: Exception) {
            inputs.forEach(TensorBuffer::close)
            throw error
        }
    }

    private data class BufferSetup(
        val signature: String?,
        val buffers: Pair<List<TensorBuffer>, List<TensorBuffer>>,
    )

    private fun parseDetection(values: FloatArray): Detection? {
        var best: Detection? = null
        for (offset in values.indices step descriptor.valuesPerDetection) {
            if (offset + descriptor.valuesPerDetection > values.size) break
            val confidence = values[offset + CONFIDENCE_INDEX]
            if (!confidence.isFinite() || confidence <= 0f) continue
            val classId = values[offset + CLASS_ID_INDEX].toInt()
            if (classId !in descriptor.labels.indices) continue
            val left = values[offset]
            val top = values[offset + 1]
            val right = values[offset + 2]
            val bottom = values[offset + 3]
            val bounds = if (descriptor.coordinatesNormalized) {
                DetectionBounds(left, top, right, bottom).normalized()
            } else {
                DetectionBounds(
                    left / descriptor.inputSize,
                    top / descriptor.inputSize,
                    right / descriptor.inputSize,
                    bottom / descriptor.inputSize,
                ).normalized()
            }
            if (best == null || confidence > best.confidence) {
                best = Detection(bounds = bounds, confidence = confidence)
            }
        }
        return best
    }

    private fun DetectionBounds.normalized() = DetectionBounds(
        left = left.coerceIn(0f, 1f),
        top = top.coerceIn(0f, 1f),
        right = right.coerceIn(0f, 1f),
        bottom = bottom.coerceIn(0f, 1f),
    )

    private companion object {
        const val DEFAULT_RUNTIME_SIGNATURE = "serving_default"
        const val CONFIDENCE_INDEX = 4
        const val CLASS_ID_INDEX = 5
    }
}

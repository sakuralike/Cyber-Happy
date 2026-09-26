package com.cyberfish.app.inference

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NcnnDetectionParserTest {
    @Test
    fun `normalized multi-class output uses the strongest class score`() {
        val detection = parseNcnnDetectionValues(
            descriptor(
                labels = listOf("float", "fish"),
                valuesPerDetection = 6,
                coordinatesNormalized = true,
            ),
            floatArrayOf(0.5f, 0.5f, 0.2f, 0.4f, 0.3f, 0.8f),
            inputTransform = null,
            detectionRegion = null,
        )

        assertEquals(0.8f, detection!!.confidence, 0.0001f)
        assertEquals(0.4f, detection.bounds.left, 0.0001f)
        assertEquals(0.3f, detection.bounds.top, 0.0001f)
        assertEquals(0.6f, detection.bounds.right, 0.0001f)
        assertEquals(0.7f, detection.bounds.bottom, 0.0001f)
    }

    @Test
    fun `pixel output honors declared stride`() {
        val detection = parseNcnnDetectionValues(
            descriptor(valuesPerDetection = 6),
            floatArrayOf(
                320f, 320f, 128f, 256f, 0.7f, 99f,
                64f, 64f, 32f, 32f, 0.2f, 88f,
            ),
            inputTransform = null,
            detectionRegion = null,
        )

        assertEquals(0.7f, detection!!.confidence, 0.0001f)
        assertEquals(0.4f, detection.bounds.left, 0.0001f)
        assertEquals(0.3f, detection.bounds.top, 0.0001f)
        assertEquals(0.6f, detection.bounds.right, 0.0001f)
        assertEquals(0.7f, detection.bounds.bottom, 0.0001f)
    }

    @Test
    fun `truncated candidate array is rejected`() {
        assertNull(
            parseNcnnDetectionValues(
                descriptor(),
                floatArrayOf(1f, 2f, 3f, 4f),
                inputTransform = null,
                detectionRegion = null,
            ),
        )
    }

    private fun descriptor(
        labels: List<String> = listOf("float"),
        valuesPerDetection: Int = 5,
        coordinatesNormalized: Boolean = false,
    ) = NcnnModelDescriptor(
        modelVersion = "parser-fixture",
        architecture = "YOLO26n",
        quantization = "FP32",
        framework = "NCNN",
        inputSize = 640,
        labels = labels,
        sha256 = "a".repeat(64),
        valuesPerDetection = valuesPerDetection,
        coordinatesNormalized = coordinatesNormalized,
        numClasses = labels.size,
    )
}

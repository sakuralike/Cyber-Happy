package com.cyberfish.app.inference

data class NcnnRuntimeOptions(
    val numThreads: Int,
    val analysisIntervalMillis: Long,
) {
    init {
        require(numThreads > 0) { "NCNN 线程数必须为正数" }
        require(analysisIntervalMillis > 0L) { "分析帧间隔必须为正数" }
    }

    companion object {
        const val MODE_POWER_SAVE = "省电"
        const val MODE_STANDARD = "标准"
        const val MODE_HIGH_PERFORMANCE = "高性能"

        fun forPerformanceMode(
            performanceMode: String,
            availableProcessors: Int,
        ): NcnnRuntimeOptions {
            val cores = availableProcessors.coerceAtLeast(1)
            return when (performanceMode) {
                MODE_POWER_SAVE -> NcnnRuntimeOptions(numThreads = 1, analysisIntervalMillis = 100L)
                MODE_HIGH_PERFORMANCE -> NcnnRuntimeOptions(numThreads = cores, analysisIntervalMillis = 33L)
                else -> NcnnRuntimeOptions(numThreads = (cores + 1) / 2, analysisIntervalMillis = 50L)
            }
        }

        fun forPerformanceMode(performanceMode: String): NcnnRuntimeOptions =
            forPerformanceMode(performanceMode, Runtime.getRuntime().availableProcessors())
    }
}

package com.cyberfish.app.capture

import kotlin.math.max
import kotlin.math.min

enum class DetectionMode {
    Intelligent,
    ManualRegion,
}

enum class DetectionRegionState {
    Intelligent,
    Editing,
    Applied,
    Empty,
    NeedsReview,
}

data class NormalizedPreviewRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    init {
        require(left.isFinite() && top.isFinite() && right.isFinite() && bottom.isFinite()) {
            "preview region must be finite"
        }
        require(left in 0f..1f && top in 0f..1f && right in 0f..1f && bottom in 0f..1f) {
            "preview region must be normalized"
        }
        require(left < right && top < bottom) { "preview region must have positive area" }
    }

    val width: Float
        get() = right - left

    val height: Float
        get() = bottom - top

    val area: Float
        get() = width * height

    fun contains(x: Float, y: Float): Boolean =
        x in left..right && y in top..bottom

    companion object {
        fun fromUnordered(
            startX: Float,
            startY: Float,
            endX: Float,
            endY: Float,
        ): NormalizedPreviewRect? {
            if (!startX.isFinite() || !startY.isFinite() || !endX.isFinite() || !endY.isFinite()) return null
            val left = min(startX, endX).coerceIn(0f, 1f)
            val top = min(startY, endY).coerceIn(0f, 1f)
            val right = max(startX, endX).coerceIn(0f, 1f)
            val bottom = max(startY, endY).coerceIn(0f, 1f)
            return if (left < right && top < bottom) {
                NormalizedPreviewRect(left, top, right, bottom)
            } else {
                null
            }
        }
    }
}

data class DetectionModeSnapshot(
    val mode: DetectionMode,
    val state: DetectionRegionState,
    val region: NormalizedPreviewRect?,
    val draft: NormalizedPreviewRect?,
    val revision: Long,
    val geometryEpoch: Long,
    val triggerEnabled: Boolean,
)

sealed interface DetectionModeIntent {
    data class SelectMode(val mode: DetectionMode) : DetectionModeIntent
    data object BeginSelection : DetectionModeIntent
    data class UpdateDraft(val region: NormalizedPreviewRect?) : DetectionModeIntent
    data object ConfirmSelection : DetectionModeIntent
    data object CancelSelection : DetectionModeIntent
    data object ClearSelection : DetectionModeIntent
    data class GeometryChanged(val geometryEpoch: Long) : DetectionModeIntent
}

enum class DetectionModeEffect {
    None,
    ResetTracking,
    SuspendTrigger,
    InvalidSelection,
}

interface DetectionModeController {
    fun snapshot(): DetectionModeSnapshot

    fun dispatch(intent: DetectionModeIntent): DetectionModeEffect
}

class DefaultDetectionModeController(
    private val minimumRegionWidth: Float = 0.05f,
    private val minimumRegionHeight: Float = 0.05f,
) : DetectionModeController {
    private var mode = DetectionMode.Intelligent
    private var state = DetectionRegionState.Intelligent
    private var appliedRegion: NormalizedPreviewRect? = null
    private var draftRegion: NormalizedPreviewRect? = null
    private var regionNeedsReview = false
    private var revision = 0L
    private var geometryEpoch = 0L

    init {
        require(minimumRegionWidth > 0f && minimumRegionWidth <= 1f) {
            "minimumRegionWidth must be in (0, 1]"
        }
        require(minimumRegionHeight > 0f && minimumRegionHeight <= 1f) {
            "minimumRegionHeight must be in (0, 1]"
        }
    }

    @Synchronized
    override fun snapshot(): DetectionModeSnapshot = DetectionModeSnapshot(
        mode = mode,
        state = state,
        region = appliedRegion,
        draft = draftRegion,
        revision = revision,
        geometryEpoch = geometryEpoch,
        triggerEnabled = isTriggerEnabled(),
    )

    @Synchronized
    override fun dispatch(intent: DetectionModeIntent): DetectionModeEffect = when (intent) {
        is DetectionModeIntent.SelectMode -> selectMode(intent.mode)
        DetectionModeIntent.BeginSelection -> beginSelection()
        is DetectionModeIntent.UpdateDraft -> updateDraft(intent.region)
        DetectionModeIntent.ConfirmSelection -> confirmSelection()
        DetectionModeIntent.CancelSelection -> cancelSelection()
        DetectionModeIntent.ClearSelection -> clearSelection()
        is DetectionModeIntent.GeometryChanged -> geometryChanged(intent.geometryEpoch)
    }

    private fun selectMode(nextMode: DetectionMode): DetectionModeEffect {
        if (mode == nextMode) return DetectionModeEffect.None
        mode = nextMode
        draftRegion = null
        revision += 1
        state = if (nextMode == DetectionMode.Intelligent) {
            DetectionRegionState.Intelligent
        } else if (appliedRegion == null) {
            DetectionRegionState.Empty
        } else if (regionNeedsReview) {
            DetectionRegionState.NeedsReview
        } else {
            DetectionRegionState.Applied
        }
        return DetectionModeEffect.ResetTracking
    }

    private fun beginSelection(): DetectionModeEffect {
        if (mode != DetectionMode.ManualRegion) return DetectionModeEffect.None
        draftRegion = appliedRegion
        state = DetectionRegionState.Editing
        return if (appliedRegion == null) DetectionModeEffect.SuspendTrigger else DetectionModeEffect.None
    }

    private fun updateDraft(region: NormalizedPreviewRect?): DetectionModeEffect {
        if (mode != DetectionMode.ManualRegion || state != DetectionRegionState.Editing) {
            return DetectionModeEffect.None
        }
        draftRegion = region
        return DetectionModeEffect.None
    }

    private fun confirmSelection(): DetectionModeEffect {
        if (mode != DetectionMode.ManualRegion || state != DetectionRegionState.Editing) {
            return DetectionModeEffect.None
        }
        val candidate = draftRegion
        if (candidate == null || candidate.width < minimumRegionWidth || candidate.height < minimumRegionHeight) {
            return DetectionModeEffect.InvalidSelection
        }
        appliedRegion = candidate
        regionNeedsReview = false
        draftRegion = null
        state = DetectionRegionState.Applied
        revision += 1
        return DetectionModeEffect.ResetTracking
    }

    private fun cancelSelection(): DetectionModeEffect {
        if (mode != DetectionMode.ManualRegion || state != DetectionRegionState.Editing) {
            return DetectionModeEffect.None
        }
        draftRegion = null
        state = if (appliedRegion == null) DetectionRegionState.Empty else DetectionRegionState.Applied
        return DetectionModeEffect.None
    }

    private fun clearSelection(): DetectionModeEffect {
        if (mode != DetectionMode.ManualRegion) return DetectionModeEffect.None
        appliedRegion = null
        regionNeedsReview = false
        draftRegion = null
        state = DetectionRegionState.Empty
        revision += 1
        return DetectionModeEffect.ResetTracking
    }

    private fun geometryChanged(nextEpoch: Long): DetectionModeEffect {
        if (nextEpoch == geometryEpoch) return DetectionModeEffect.None
        geometryEpoch = nextEpoch
        revision += 1
        draftRegion = null
        state = when {
            mode == DetectionMode.Intelligent -> DetectionRegionState.Intelligent
            appliedRegion == null -> DetectionRegionState.Empty
            else -> DetectionRegionState.NeedsReview
        }
        if (appliedRegion != null) regionNeedsReview = true
        return DetectionModeEffect.ResetTracking
    }

    private fun isTriggerEnabled(): Boolean = when (mode) {
        DetectionMode.Intelligent -> true
        DetectionMode.ManualRegion ->
            appliedRegion != null && !regionNeedsReview && state != DetectionRegionState.NeedsReview
    }
}

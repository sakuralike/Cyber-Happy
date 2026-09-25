package com.cyberfish.app.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DetectionModeControllerTest {
    @Test
    fun `starts in intelligent mode with trigger enabled`() {
        val controller = DefaultDetectionModeController()

        val snapshot = controller.snapshot()

        assertEquals(DetectionMode.Intelligent, snapshot.mode)
        assertEquals(DetectionRegionState.Intelligent, snapshot.state)
        assertTrue(snapshot.triggerEnabled)
        assertNull(snapshot.region)
        assertEquals(0L, snapshot.revision)
    }

    @Test
    fun `manual mode requires a confirmed region`() {
        val controller = DefaultDetectionModeController()

        assertEquals(
            DetectionModeEffect.ResetTracking,
            controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion)),
        )
        val snapshot = controller.snapshot()

        assertEquals(DetectionRegionState.Empty, snapshot.state)
        assertFalse(snapshot.triggerEnabled)
        assertEquals(1L, snapshot.revision)
    }

    @Test
    fun `confirming a valid draft enables the manual region`() {
        val controller = DefaultDetectionModeController()
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion))
        controller.dispatch(DetectionModeIntent.BeginSelection)
        val region = NormalizedPreviewRect.fromUnordered(0.8f, 0.7f, 0.2f, 0.1f)
        assertNotNull(region)

        controller.dispatch(DetectionModeIntent.UpdateDraft(region))
        assertEquals(
            DetectionModeEffect.ResetTracking,
            controller.dispatch(DetectionModeIntent.ConfirmSelection),
        )
        val snapshot = controller.snapshot()

        assertEquals(DetectionRegionState.Applied, snapshot.state)
        assertEquals(region, snapshot.region)
        assertTrue(snapshot.triggerEnabled)
        assertEquals(2L, snapshot.revision)
    }

    @Test
    fun `cancel restores the previously applied region`() {
        val controller = DefaultDetectionModeController()
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion))
        controller.dispatch(DetectionModeIntent.BeginSelection)
        val original = NormalizedPreviewRect(0.1f, 0.1f, 0.5f, 0.6f)
        controller.dispatch(DetectionModeIntent.UpdateDraft(original))
        controller.dispatch(DetectionModeIntent.ConfirmSelection)

        controller.dispatch(DetectionModeIntent.BeginSelection)
        controller.dispatch(DetectionModeIntent.UpdateDraft(NormalizedPreviewRect(0.6f, 0.6f, 0.9f, 0.9f)))
        controller.dispatch(DetectionModeIntent.CancelSelection)

        val snapshot = controller.snapshot()
        assertEquals(DetectionRegionState.Applied, snapshot.state)
        assertEquals(original, snapshot.region)
        assertTrue(snapshot.triggerEnabled)
    }

    @Test
    fun `invalid draft cannot be confirmed`() {
        val controller = DefaultDetectionModeController()
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion))
        controller.dispatch(DetectionModeIntent.BeginSelection)
        controller.dispatch(
            DetectionModeIntent.UpdateDraft(NormalizedPreviewRect(0.1f, 0.1f, 0.12f, 0.12f)),
        )

        assertEquals(DetectionModeEffect.InvalidSelection, controller.dispatch(DetectionModeIntent.ConfirmSelection))
        assertEquals(DetectionRegionState.Editing, controller.snapshot().state)
        assertFalse(controller.snapshot().triggerEnabled)
    }

    @Test
    fun `geometry change invalidates an applied manual region`() {
        val controller = DefaultDetectionModeController()
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion))
        controller.dispatch(DetectionModeIntent.BeginSelection)
        controller.dispatch(DetectionModeIntent.UpdateDraft(NormalizedPreviewRect(0.1f, 0.1f, 0.6f, 0.6f)))
        controller.dispatch(DetectionModeIntent.ConfirmSelection)
        val before = controller.snapshot()

        assertEquals(
            DetectionModeEffect.ResetTracking,
            controller.dispatch(DetectionModeIntent.GeometryChanged(before.geometryEpoch + 1)),
        )
        val after = controller.snapshot()

        assertEquals(DetectionRegionState.NeedsReview, after.state)
        assertFalse(after.triggerEnabled)
        assertEquals(before.revision + 1, after.revision)
        assertEquals(before.region, after.region)
    }

    @Test
    fun `clearing a manual region does not fall back to intelligent mode`() {
        val controller = DefaultDetectionModeController()
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion))
        controller.dispatch(DetectionModeIntent.BeginSelection)
        controller.dispatch(DetectionModeIntent.UpdateDraft(NormalizedPreviewRect(0.1f, 0.1f, 0.6f, 0.6f)))
        controller.dispatch(DetectionModeIntent.ConfirmSelection)

        controller.dispatch(DetectionModeIntent.ClearSelection)

        val snapshot = controller.snapshot()
        assertEquals(DetectionMode.ManualRegion, snapshot.mode)
        assertEquals(DetectionRegionState.Empty, snapshot.state)
        assertFalse(snapshot.triggerEnabled)
        assertNull(snapshot.region)
    }

    @Test
    fun `geometry change while intelligent requires review when returning to manual mode`() {
        val controller = DefaultDetectionModeController()
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion))
        controller.dispatch(DetectionModeIntent.BeginSelection)
        controller.dispatch(DetectionModeIntent.UpdateDraft(NormalizedPreviewRect(0.1f, 0.1f, 0.6f, 0.6f)))
        controller.dispatch(DetectionModeIntent.ConfirmSelection)
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.Intelligent))

        controller.dispatch(DetectionModeIntent.GeometryChanged(1L))
        controller.dispatch(DetectionModeIntent.SelectMode(DetectionMode.ManualRegion))

        assertEquals(DetectionRegionState.NeedsReview, controller.snapshot().state)
        assertFalse(controller.snapshot().triggerEnabled)
    }
}

/**
 * Tests for modules/navigation/gesture-control.js
 * Shake-to-recalculate/clear has been removed; plans must stay inert.
 */
const GC = require('../modules/navigation/gesture-control.js');

describe('gesture-control module', () => {
    test('buildGestureShakeDetectionPlan never triggers after shakes', () => {
        const first = GC.buildGestureShakeDetectionPlan({
            magnitude: 20,
            sensitivity: 'medium',
            lastShakeTime: 0,
            shakeCount: 0,
            now: 1000,
        });
        expect(first.shouldTrigger).toBe(false);
        expect(first.shakeCount).toBe(0);

        const second = GC.buildGestureShakeDetectionPlan({
            magnitude: 20,
            sensitivity: 'medium',
            lastShakeTime: first.lastShakeTime,
            shakeCount: 1,
            now: 1200,
        });
        expect(second.shouldTrigger).toBe(false);
        expect(second.shakeCount).toBe(0);
    });

    test('buildToggleGestureControlExecutePlan never attaches device motion', () => {
        const on = GC.buildToggleGestureControlExecutePlan({ enabled: true, hasDeviceMotion: true });
        expect(on.enabled).toBe(false);
        expect(on.addDeviceMotionListener).toBe(false);
        expect(on.removeDeviceMotionListener).toBe(true);
        expect(on.storageKey).toBe(GC.GESTURE_ENABLED_STORAGE_KEY);
        expect(on.storageValue).toBe(false);
    });

    test('buildGestureActionExecutePlan never recalculates or clears', () => {
        const recalculate = GC.buildGestureActionExecutePlan({ action: 'recalculate' });
        expect(recalculate.shouldApply).toBe(false);
        expect(recalculate.triggerRecalculate).toBe(false);
        expect(recalculate.triggerClear).toBe(false);

        const clear = GC.buildGestureActionExecutePlan({ action: 'clear' });
        expect(clear.shouldApply).toBe(false);
        expect(clear.triggerRecalculate).toBe(false);
        expect(clear.triggerClear).toBe(false);
    });

    test('legacy report shake action does not trigger route changes', () => {
        expect(GC.normalizeGestureAction('report')).toBe('recalculate');
        const execute = GC.buildGestureActionExecutePlan({ action: 'report' });
        expect(execute.action).toBe('recalculate');
        expect(execute.shouldApply).toBe(false);
        expect(execute.triggerRecalculate).toBe(false);
        expect(execute.triggerClear).toBe(false);

        const applied = GC.buildApplyGestureSettingsFromApiExecutePlan({
            gesture_enabled: true,
            gesture_action: 'report',
        }, { hasDeviceMotion: true });
        expect(applied.enabled).toBe(false);
        expect(applied.addDeviceMotionListener).toBe(false);
        expect(applied.storageValue).toBe(false);

        const updated = GC.buildUpdateGestureActionExecutePlan({ value: 'report' });
        expect(updated.shouldApply).toBe(false);
        expect(updated.action).toBe('recalculate');
    });

    test('buildApplyGestureSettingsFromApiExecutePlan cannot re-enable shake', () => {
        const execute = GC.buildApplyGestureSettingsFromApiExecutePlan({
            gesture_enabled: true,
            gesture_sensitivity: 'high',
            gesture_action: 'clear',
        }, { hasDeviceMotion: true });
        expect(execute.toggle.id).toBe(GC.GESTURE_TOGGLE_ID);
        expect(execute.toggle.enabled).toBe(false);
        expect(execute.enabled).toBe(false);
        expect(execute.addDeviceMotionListener).toBe(false);
        expect(execute.settingsPanel.display).toBe('none');
    });

    test('buildLoadGestureSettingsFetchPlan does not fetch shake settings', () => {
        expect(GC.buildLoadGestureSettingsFetchPlan().shouldFetch).toBe(false);
    });
});

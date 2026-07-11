/**
 * Tests for modules/navigation/gesture-control.js
 */
const GC = require('../modules/navigation/gesture-control.js');

describe('gesture-control module', () => {
    test('buildGestureShakeDetectionPlan triggers after two shakes in window', () => {
        const first = GC.buildGestureShakeDetectionPlan({
            magnitude: 20,
            sensitivity: 'medium',
            lastShakeTime: 0,
            shakeCount: 0,
            now: 1000,
        });
        expect(first.shouldTrigger).toBe(false);
        expect(first.shakeCount).toBe(1);

        const second = GC.buildGestureShakeDetectionPlan({
            magnitude: 20,
            sensitivity: 'medium',
            lastShakeTime: first.lastShakeTime,
            shakeCount: first.shakeCount,
            now: 1200,
        });
        expect(second.shouldTrigger).toBe(true);
        expect(second.shakeCount).toBe(0);
    });

    test('buildToggleGestureControlExecutePlan wires listener side effects', () => {
        const on = GC.buildToggleGestureControlExecutePlan({ enabled: true, hasDeviceMotion: true });
        expect(on.addDeviceMotionListener).toBe(true);
        expect(on.storageKey).toBe(GC.GESTURE_ENABLED_STORAGE_KEY);

        const off = GC.buildToggleGestureControlExecutePlan({ enabled: false, hasDeviceMotion: true });
        expect(off.removeDeviceMotionListener).toBe(true);
    });

    test('buildGestureActionExecutePlan maps actions to status and triggers', () => {
        expect(GC.buildGestureActionExecutePlan({ action: 'recalculate' }).triggerRecalculate).toBe(true);
        expect(GC.buildGestureActionExecutePlan({ action: 'clear' }).triggerClear).toBe(true);
        expect(GC.buildGestureActionExecutePlan({ action: 'report' }).statusMessage)
            .toContain('hazard');
    });

    test('buildApplyGestureSettingsFromApiExecutePlan uses toggle button not checkbox', () => {
        const execute = GC.buildApplyGestureSettingsFromApiExecutePlan({
            gesture_enabled: true,
            gesture_sensitivity: 'high',
            gesture_action: 'clear',
        }, { hasDeviceMotion: true });
        expect(execute.toggle.id).toBe(GC.GESTURE_TOGGLE_ID);
        expect(execute.toggle.enabled).toBe(true);
        expect(execute.sensitivitySelect.value).toBe('high');
        expect(execute.addDeviceMotionListener).toBe(true);
    });
});

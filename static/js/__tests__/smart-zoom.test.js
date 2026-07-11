/**
 * Tests for modules/navigation/smart-zoom.js
 */
const SZ = require('../modules/navigation/smart-zoom.js');

describe('smart-zoom module', () => {
    test('resolveSmartZoomEnabledFromStorage defaults to enabled when unset', () => {
        expect(SZ.resolveSmartZoomEnabledFromStorage(null)).toBe(true);
        expect(SZ.resolveSmartZoomEnabledFromStorage(undefined)).toBe(true);
        expect(SZ.resolveSmartZoomEnabledFromStorage('')).toBe(true);
    });

    test('resolveSmartZoomEnabledFromStorage respects stored off values', () => {
        expect(SZ.resolveSmartZoomEnabledFromStorage('0')).toBe(false);
        expect(SZ.resolveSmartZoomEnabledFromStorage('false')).toBe(false);
    });

    test('resolveSmartZoomEnabledFromStorage accepts on values', () => {
        expect(SZ.resolveSmartZoomEnabledFromStorage('1')).toBe(true);
        expect(SZ.resolveSmartZoomEnabledFromStorage('true')).toBe(true);
    });

    test('buildToggleSmartZoomCollectPlan flips enabled state', () => {
        expect(SZ.buildToggleSmartZoomCollectPlan({ currentlyEnabled: true })).toEqual({
            enabled: false,
        });
        expect(SZ.buildToggleSmartZoomCollectPlan({ currentlyEnabled: false })).toEqual({
            enabled: true,
        });
    });

    test('buildToggleSmartZoomExecutePlan persists storage and status copy', () => {
        const on = SZ.buildToggleSmartZoomExecutePlan({ enabled: true });
        expect(on.shouldApply).toBe(true);
        expect(on.enabled).toBe(true);
        expect(on.toggle).toEqual({ id: SZ.SMART_ZOOM_TOGGLE_ID, enabled: true });
        expect(on.storageKey).toBe(SZ.SMART_ZOOM_STORAGE_KEY);
        expect(on.storageValue).toBe('1');
        expect(on.saveAllSettings).toBe(true);
        expect(on.statusMessage).toContain('enabled');

        const off = SZ.buildToggleSmartZoomExecutePlan({ enabled: false });
        expect(off.storageValue).toBe('0');
        expect(off.statusMessage).toContain('disabled');
    });
});

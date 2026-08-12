/**
 * Tests for modules/map/center-on-location.js
 */
const COL = require('../modules/map/center-on-location.js');

describe('center-on-location module', () => {
    test('resolveCenterOnLocationEnabledFromStorage defaults to enabled when unset', () => {
        expect(COL.resolveCenterOnLocationEnabledFromStorage(null)).toBe(true);
        expect(COL.resolveCenterOnLocationEnabledFromStorage(undefined)).toBe(true);
        expect(COL.resolveCenterOnLocationEnabledFromStorage('')).toBe(true);
    });

    test('resolveCenterOnLocationEnabledFromStorage respects stored off values', () => {
        expect(COL.resolveCenterOnLocationEnabledFromStorage('0')).toBe(false);
        expect(COL.resolveCenterOnLocationEnabledFromStorage('false')).toBe(false);
    });

    test('resolveCenterOnLocationEnabledFromStorage accepts on values', () => {
        expect(COL.resolveCenterOnLocationEnabledFromStorage('1')).toBe(true);
        expect(COL.resolveCenterOnLocationEnabledFromStorage('true')).toBe(true);
    });

    test('buildToggleCenterOnLocationCollectPlan flips enabled state', () => {
        expect(COL.buildToggleCenterOnLocationCollectPlan({ currentlyEnabled: true })).toEqual({
            enabled: false,
        });
        expect(COL.buildToggleCenterOnLocationCollectPlan({ currentlyEnabled: false })).toEqual({
            enabled: true,
        });
    });

    test('buildToggleCenterOnLocationExecutePlan persists storage and status copy', () => {
        const on = COL.buildToggleCenterOnLocationExecutePlan({ enabled: true });
        expect(on.shouldApply).toBe(true);
        expect(on.enabled).toBe(true);
        expect(on.shouldFlyToUser).toBe(true);
        expect(on.toggle).toEqual({ id: COL.CENTER_ON_LOCATION_TOGGLE_ID, enabled: true });
        expect(on.storageKey).toBe(COL.CENTER_ON_LOCATION_STORAGE_KEY);
        expect(on.storageValue).toBe('1');
        expect(on.saveAllSettings).toBe(true);
        expect(on.statusMessage).toContain('enabled');

        const off = COL.buildToggleCenterOnLocationExecutePlan({ enabled: false });
        expect(off.storageValue).toBe('0');
        expect(off.shouldFlyToUser).toBe(false);
        expect(off.statusMessage).toContain('disabled');
    });

    test('buildCenterOnLocationFlyDecision gates fly by preference and coordinates', () => {
        expect(COL.buildCenterOnLocationFlyDecision({
            enabled: false,
            hasCoordinates: true,
        })).toEqual({ shouldFly: false, reason: 'disabled' });

        expect(COL.buildCenterOnLocationFlyDecision({
            enabled: true,
            hasCoordinates: false,
        })).toEqual({ shouldFly: false, reason: 'no_coordinates' });

        expect(COL.buildCenterOnLocationFlyDecision({
            enabled: true,
            hasCoordinates: true,
        })).toEqual({ shouldFly: true, reason: 'enabled' });
    });
});

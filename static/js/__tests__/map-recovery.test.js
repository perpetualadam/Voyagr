/**
 * Tests for modules/map/map-recovery.js
 */
const MR = require('../modules/map/map-recovery.js');

describe('VoyagrMapRecovery', () => {
    test('resolveNetworkRecoverDebounceMs is longer on 3g/4g radio', () => {
        expect(MR.resolveNetworkRecoverDebounceMs('4g')).toBe(MR.NETWORK_RECOVER_DEBOUNCE_SLOW_MS);
        expect(MR.resolveNetworkRecoverDebounceMs('3g')).toBe(MR.NETWORK_RECOVER_DEBOUNCE_SLOW_MS);
        expect(MR.resolveNetworkRecoverDebounceMs('5g')).toBe(MR.NETWORK_RECOVER_DEBOUNCE_FAST_MS);
        expect(MR.resolveNetworkRecoverDebounceMs('')).toBe(MR.NETWORK_RECOVER_DEBOUNCE_FAST_MS);
    });

    test('shouldRetryForceReloadSources ignores map.loaded false alone', () => {
        expect(MR.shouldRetryForceReloadSources({
            styleLoaded: true,
            areTilesLoaded: true,
            mapLoaded: false,
        })).toBe(false);
        expect(MR.shouldRetryForceReloadSources({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
        })).toBe(true);
        expect(MR.shouldRetryForceReloadSources({
            styleLoaded: false,
            areTilesLoaded: true,
            mapLoaded: true,
        })).toBe(true);
    });

    test('shouldEscalateSoftStyleReload does not wipe layers while 4g tiles download', () => {
        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: true,
            mapLoaded: false,
            msSinceForceReload: 2000,
        })).toBe(false);

        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
            msSinceForceReload: 2000,
        })).toBe(true);

        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: null,
            mapLoaded: false,
            msSinceForceReload: 1000,
            slowNetworkSettleMs: 12000,
        })).toBe(false);

        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: null,
            mapLoaded: false,
            msSinceForceReload: 13000,
            slowNetworkSettleMs: 12000,
        })).toBe(true);
    });

    test('buildNavOverlayRedrawRetryDelaysMs returns retry schedule', () => {
        const delays = MR.buildNavOverlayRedrawRetryDelaysMs();
        expect(delays.length).toBeGreaterThanOrEqual(2);
        expect(delays[0]).toBeLessThan(delays[1]);
    });
});

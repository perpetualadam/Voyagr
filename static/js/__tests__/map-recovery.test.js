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
            isMapMoving: false,
            msSinceLastMapMove: 10000,
        })).toBe(true);
        expect(MR.shouldRetryForceReloadSources({
            styleLoaded: false,
            areTilesLoaded: true,
            mapLoaded: true,
        })).toBe(true);
    });

    test('shouldRetryForceReloadSources does not reload while follow camera is moving', () => {
        expect(MR.shouldRetryForceReloadSources({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
            isMapMoving: true,
        })).toBe(false);

        expect(MR.shouldRetryForceReloadSources({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
            isMapMoving: false,
            msSinceLastMapMove: 500,
            mapIdleGraceMs: MR.MAP_IDLE_GRACE_MS,
        })).toBe(false);
    });

    test('shouldEscalateSoftStyleReload does not wipe layers while 4g tiles download', () => {
        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: true,
            mapLoaded: false,
            msSinceForceReload: 2000,
        })).toBe(false);

        // Immediate escalate on unloaded tiles used to blank the map mid-drive —
        // require settle + camera idle instead.
        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
            msSinceForceReload: 2000,
            isMapMoving: false,
            msSinceLastMapMove: 10000,
        })).toBe(false);

        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
            msSinceForceReload: 13000,
            slowNetworkSettleMs: 12000,
            isMapMoving: false,
            msSinceLastMapMove: 10000,
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

    test('shouldEscalateSoftStyleReload never soft-reloads while nav camera is moving', () => {
        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
            msSinceForceReload: 20000,
            slowNetworkSettleMs: 12000,
            isMapMoving: true,
        })).toBe(false);

        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: true,
            areTilesLoaded: false,
            mapLoaded: false,
            msSinceForceReload: 20000,
            slowNetworkSettleMs: 12000,
            isMapMoving: false,
            msSinceLastMapMove: 1000,
            mapIdleGraceMs: MR.MAP_IDLE_GRACE_MS,
        })).toBe(false);

        // Broken style still escalates immediately even mid-drive.
        expect(MR.shouldEscalateSoftStyleReload({
            styleLoaded: false,
            areTilesLoaded: false,
            isMapMoving: true,
        })).toBe(true);
    });

    test('evaluateTilesStuckHeartbeat ignores unloaded tiles during continuous driving', () => {
        const midDrive = MR.evaluateTilesStuckHeartbeat({
            areTilesLoaded: false,
            tilesStuckForMs: 60000,
            stuckThresholdMs: 50000,
            isMapMoving: true,
        });
        expect(midDrive.forceReload).toBe(false);
        expect(midDrive.clearStuck).toBe(true);

        const recentMove = MR.evaluateTilesStuckHeartbeat({
            areTilesLoaded: false,
            tilesStuckForMs: 60000,
            stuckThresholdMs: 50000,
            isMapMoving: false,
            msSinceLastMapMove: 800,
            mapIdleGraceMs: MR.MAP_IDLE_GRACE_MS,
        });
        expect(recentMove.forceReload).toBe(false);
        expect(recentMove.clearStuck).toBe(true);
    });

    test('evaluateTilesStuckHeartbeat force-reloads only when idle and stuck past threshold', () => {
        const firstSighting = MR.evaluateTilesStuckHeartbeat({
            areTilesLoaded: false,
            tilesStuckForMs: 0,
            stuckThresholdMs: 50000,
            isMapMoving: false,
            msSinceLastMapMove: 10000,
        });
        expect(firstSighting).toEqual({
            trackStuck: true,
            forceReload: false,
            clearStuck: false,
        });

        const stillCounting = MR.evaluateTilesStuckHeartbeat({
            areTilesLoaded: false,
            tilesStuckForMs: 40000,
            stuckThresholdMs: 50000,
            isMapMoving: false,
            msSinceLastMapMove: 10000,
        });
        expect(stillCounting.forceReload).toBe(false);
        expect(stillCounting.trackStuck).toBe(true);

        const stuckIdle = MR.evaluateTilesStuckHeartbeat({
            areTilesLoaded: false,
            tilesStuckForMs: 55000,
            stuckThresholdMs: 50000,
            isMapMoving: false,
            msSinceLastMapMove: 10000,
        });
        expect(stuckIdle.forceReload).toBe(true);
        expect(stuckIdle.clearStuck).toBe(true);

        const tilesOk = MR.evaluateTilesStuckHeartbeat({
            areTilesLoaded: true,
            tilesStuckForMs: 55000,
            stuckThresholdMs: 50000,
        });
        expect(tilesOk).toEqual({
            trackStuck: false,
            forceReload: false,
            clearStuck: true,
        });
    });

    test('isMapCameraSettledForTileRecovery respects idle grace', () => {
        expect(MR.isMapCameraSettledForTileRecovery({ isMapMoving: true })).toBe(false);
        expect(MR.isMapCameraSettledForTileRecovery({
            isMapMoving: false,
            msSinceLastMapMove: 100,
            mapIdleGraceMs: 4000,
        })).toBe(false);
        expect(MR.isMapCameraSettledForTileRecovery({
            isMapMoving: false,
            msSinceLastMapMove: 5000,
            mapIdleGraceMs: 4000,
        })).toBe(true);
        expect(MR.isMapCameraSettledForTileRecovery({})).toBe(true);
    });

    test('buildNavOverlayRedrawRetryDelaysMs returns retry schedule', () => {
        const delays = MR.buildNavOverlayRedrawRetryDelaysMs();
        expect(delays.length).toBeGreaterThanOrEqual(2);
        expect(delays[0]).toBeLessThan(delays[1]);
    });
});

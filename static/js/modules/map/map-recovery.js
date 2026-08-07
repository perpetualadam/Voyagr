/**
 * @file Pure map recovery helpers — decide when to force-reload tiles vs soft setStyle.
 * Keeps slow 4G / radio-swap recovery from wiping custom nav layers unnecessarily.
 * Also prevents mid-drive false positives: MapLibre areTilesLoaded() is false whenever
 * any tile is still downloading, which is normal while the follow camera pans.
 * @module modules/map/map-recovery
 */
(function (root) {
    'use strict';

    /** Default settle after a force source reload before considering soft style reload. */
    var DEFAULT_SLOW_NETWORK_SETTLE_MS = 12000;

    /** Debounce for Network Information API change → recover on fast networks. */
    var NETWORK_RECOVER_DEBOUNCE_FAST_MS = 450;

    /** Longer debounce when the radio reports 2g/3g/4g (thermal downgrade path). */
    var NETWORK_RECOVER_DEBOUNCE_SLOW_MS = 1400;

    /**
     * After the camera stops moving, wait this long before treating unloaded tiles
     * as "stuck". Follow-nav easeTo keeps requesting tiles; areTilesLoaded() false
     * during / just after that movement must not trigger recovery.
     */
    var MAP_IDLE_GRACE_MS = 4000;

    /**
     * @param {string} [effectiveType] - navigator.connection.effectiveType
     * @returns {number}
     */
    function resolveNetworkRecoverDebounceMs(effectiveType) {
        var t = String(effectiveType || '').toLowerCase();
        if (t === '2g' || t === '3g' || t === '4g' || t === 'slow-2g') {
            return NETWORK_RECOVER_DEBOUNCE_SLOW_MS;
        }
        return NETWORK_RECOVER_DEBOUNCE_FAST_MS;
    }

    /**
     * Whether the map camera is settled enough that unloaded tiles may indicate
     * a real stuck-source failure (not mid-drive follow / pan / zoom).
     *
     * @param {Object} [opts]
     * @param {boolean} [opts.isMapMoving]
     * @param {number|null|undefined} [opts.msSinceLastMapMove]
     * @param {number} [opts.mapIdleGraceMs]
     * @returns {boolean}
     */
    function isMapCameraSettledForTileRecovery(opts) {
        opts = opts || {};
        if (opts.isMapMoving === true) return false;
        var grace = opts.mapIdleGraceMs != null ? opts.mapIdleGraceMs : MAP_IDLE_GRACE_MS;
        if (opts.msSinceLastMapMove != null && opts.msSinceLastMapMove < grace) {
            return false;
        }
        return true;
    }

    /**
     * @param {Object} [opts]
     * @returns {number}
     */
    function resolveSettleMs(opts) {
        opts = opts || {};
        return opts.slowNetworkSettleMs != null
            ? opts.slowNetworkSettleMs
            : DEFAULT_SLOW_NETWORK_SETTLE_MS;
    }

    /**
     * Whether a delayed verification should force-reload tile sources again.
     * `map.loaded() === false` alone is normal while tiles download on slow 4G
     * after a radio swap — that must not trigger another reload loop.
     * `areTilesLoaded() === false` while the nav camera is still moving is also
     * normal and must not force-reload (which blanks the basemap mid-drive).
     *
     * @param {Object} [opts]
     * @param {boolean} [opts.styleLoaded]
     * @param {boolean|null|undefined} [opts.areTilesLoaded] - MapLibre areTilesLoaded(); null if unavailable
     * @param {boolean} [opts.mapLoaded] - map.loaded(); ignored as sole escalate signal
     * @param {boolean} [opts.isMapMoving]
     * @param {number|null|undefined} [opts.msSinceLastMapMove]
     * @param {number} [opts.mapIdleGraceMs]
     * @returns {boolean}
     */
    function shouldRetryForceReloadSources(opts) {
        opts = opts || {};
        if (opts.styleLoaded === false) return true;
        if (opts.areTilesLoaded === false) {
            return isMapCameraSettledForTileRecovery(opts);
        }
        return false;
    }

    /**
     * Whether to escalate to soft `setStyle` (wipes custom layers).
     * Only when style is not loaded, or tiles remain unloaded after settle
     * while the camera is idle (not mid-drive follow).
     *
     * @param {Object} [opts]
     * @param {boolean} [opts.styleLoaded]
     * @param {boolean|null|undefined} [opts.areTilesLoaded]
     * @param {boolean} [opts.mapLoaded]
     * @param {number} [opts.msSinceForceReload]
     * @param {number} [opts.slowNetworkSettleMs]
     * @param {boolean} [opts.isMapMoving]
     * @param {number|null|undefined} [opts.msSinceLastMapMove]
     * @param {number} [opts.mapIdleGraceMs]
     * @returns {boolean}
     */
    function shouldEscalateSoftStyleReload(opts) {
        opts = opts || {};
        if (opts.styleLoaded === false) return true;

        var settle = resolveSettleMs(opts);
        var since = opts.msSinceForceReload != null ? opts.msSinceForceReload : 0;

        // areTilesLoaded()===false is normal while any tile downloads — including
        // continuous follow-nav. Never wipe the style immediately on that signal;
        // only escalate after settle once the camera has been idle.
        if (opts.areTilesLoaded === false) {
            if (!isMapCameraSettledForTileRecovery(opts)) return false;
            return since >= settle;
        }

        // Fallback when areTilesLoaded is unavailable: only escalate after a long
        // settle if the map still reports not loaded (avoid early soft reload on 4G).
        if (opts.areTilesLoaded == null && opts.mapLoaded === false) {
            return since >= settle;
        }

        return false;
    }

    /**
     * Heartbeat tiles-stuck detector: force-reload sources only when tiles have
     * stayed unloaded across the stuck window AND the camera is idle. Mid-drive
     * follow keeps areTilesLoaded() false for long stretches without a real fault.
     *
     * @param {Object} [opts]
     * @param {boolean|null|undefined} [opts.areTilesLoaded]
     * @param {number|null|undefined} [opts.tilesStuckForMs] - time since first consecutive false
     * @param {number} [opts.stuckThresholdMs] - typically heartbeatMs + slack
     * @param {boolean} [opts.isMapMoving]
     * @param {number|null|undefined} [opts.msSinceLastMapMove]
     * @param {number} [opts.mapIdleGraceMs]
     * @returns {{ trackStuck: boolean, forceReload: boolean, clearStuck: boolean }}
     */
    function evaluateTilesStuckHeartbeat(opts) {
        opts = opts || {};
        if (opts.areTilesLoaded !== false) {
            return { trackStuck: false, forceReload: false, clearStuck: true };
        }
        // Still downloading while / just after camera motion — reset the stuck clock
        // so continuous driving never accumulates toward a force reload.
        if (!isMapCameraSettledForTileRecovery(opts)) {
            return { trackStuck: false, forceReload: false, clearStuck: true };
        }
        var stuckFor = opts.tilesStuckForMs != null ? opts.tilesStuckForMs : 0;
        var threshold = opts.stuckThresholdMs != null ? opts.stuckThresholdMs : 50000;
        if (stuckFor <= 0) {
            return { trackStuck: true, forceReload: false, clearStuck: false };
        }
        if (stuckFor > threshold) {
            return { trackStuck: false, forceReload: true, clearStuck: true };
        }
        return { trackStuck: true, forceReload: false, clearStuck: false };
    }

    /**
     * Schedule delays for nav overlay redraw retries after recovery / soft reload.
     * First redraw often races mid-style.load; retries remount the polyline.
     *
     * @returns {number[]}
     */
    function buildNavOverlayRedrawRetryDelaysMs() {
        return [700, 2000];
    }

    var api = {
        DEFAULT_SLOW_NETWORK_SETTLE_MS: DEFAULT_SLOW_NETWORK_SETTLE_MS,
        NETWORK_RECOVER_DEBOUNCE_FAST_MS: NETWORK_RECOVER_DEBOUNCE_FAST_MS,
        NETWORK_RECOVER_DEBOUNCE_SLOW_MS: NETWORK_RECOVER_DEBOUNCE_SLOW_MS,
        MAP_IDLE_GRACE_MS: MAP_IDLE_GRACE_MS,
        resolveNetworkRecoverDebounceMs: resolveNetworkRecoverDebounceMs,
        isMapCameraSettledForTileRecovery: isMapCameraSettledForTileRecovery,
        shouldRetryForceReloadSources: shouldRetryForceReloadSources,
        shouldEscalateSoftStyleReload: shouldEscalateSoftStyleReload,
        evaluateTilesStuckHeartbeat: evaluateTilesStuckHeartbeat,
        buildNavOverlayRedrawRetryDelaysMs: buildNavOverlayRedrawRetryDelaysMs,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

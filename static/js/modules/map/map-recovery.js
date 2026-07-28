/**
 * @file Pure map recovery helpers — decide when to force-reload tiles vs soft setStyle.
 * Keeps slow 4G / radio-swap recovery from wiping custom nav layers unnecessarily.
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
     * Whether a delayed verification should force-reload tile sources again.
     * `map.loaded() === false` alone is normal while tiles download on slow 4G
     * after a radio swap — that must not trigger another reload loop.
     *
     * @param {Object} [opts]
     * @param {boolean} [opts.styleLoaded]
     * @param {boolean|null|undefined} [opts.areTilesLoaded] - MapLibre areTilesLoaded(); null if unavailable
     * @param {boolean} [opts.mapLoaded] - map.loaded(); ignored as sole escalate signal
     * @returns {boolean}
     */
    function shouldRetryForceReloadSources(opts) {
        opts = opts || {};
        if (opts.styleLoaded === false) return true;
        if (opts.areTilesLoaded === false) return true;
        return false;
    }

    /**
     * Whether to escalate to soft `setStyle` (wipes custom layers).
     * Only when style is not loaded, or tiles remain unloaded after settle.
     *
     * @param {Object} [opts]
     * @param {boolean} [opts.styleLoaded]
     * @param {boolean|null|undefined} [opts.areTilesLoaded]
     * @param {boolean} [opts.mapLoaded]
     * @param {number} [opts.msSinceForceReload]
     * @param {number} [opts.slowNetworkSettleMs]
     * @returns {boolean}
     */
    function shouldEscalateSoftStyleReload(opts) {
        opts = opts || {};
        if (opts.styleLoaded === false) return true;
        if (opts.areTilesLoaded === false) return true;

        // Fallback when areTilesLoaded is unavailable: only escalate after a long
        // settle if the map still reports not loaded (avoid early soft reload on 4G).
        if (opts.areTilesLoaded == null && opts.mapLoaded === false) {
            var settle = opts.slowNetworkSettleMs != null
                ? opts.slowNetworkSettleMs
                : DEFAULT_SLOW_NETWORK_SETTLE_MS;
            var since = opts.msSinceForceReload != null ? opts.msSinceForceReload : 0;
            return since >= settle;
        }

        return false;
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
        resolveNetworkRecoverDebounceMs: resolveNetworkRecoverDebounceMs,
        shouldRetryForceReloadSources: shouldRetryForceReloadSources,
        shouldEscalateSoftStyleReload: shouldEscalateSoftStyleReload,
        buildNavOverlayRedrawRetryDelaysMs: buildNavOverlayRedrawRetryDelaysMs,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

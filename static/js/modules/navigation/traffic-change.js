/**
 * @file Pure traffic-change predicate (no DOM, no network, no global state).
 * @module modules/navigation/traffic-change
 *
 * detectSignificantTrafficChange was inline in voyagr-app.js. Extracted here
 * so it can be unit-tested without a routing context. The console.log calls are
 * kept intentionally to preserve the existing debug output on the client.
 */
(function (root) {
    'use strict';

    /**
     * Decide whether a traffic snapshot represents a significant change that
     * warrants an automatic reroute attempt.
     *
     * @param {object|null} previous - Previous traffic snapshot (may be null on first sample)
     * @param {object|null} current  - Current  traffic snapshot
     *   Shape: { severe: boolean, congestedPoints: Array, delayMin: number, congestedCount: number }
     * @returns {'severe'|'congestion'|false}
     */
    function detectSignificantTrafficChange(previous, current) {
        if (!current) return false;

        // Near-standstill / severe congestion with an actionable detour.
        if (current.severe && current.congestedPoints.length > 0) {
            console.log('[Auto-Traffic] Severe congestion ahead');
            return 'severe';
        }

        // Meaningful absolute delay even on the first sample.
        if (current.delayMin >= 4 && current.congestedPoints.length > 0) {
            console.log('[Auto-Traffic] Significant delay ahead (~' + current.delayMin.toFixed(1) + ' min)');
            return 'congestion';
        }

        // Only escalate when conditions materially worsened since the last check.
        if (previous) {
            var delayJump = current.delayMin - (previous.delayMin || 0);
            if (delayJump >= 3 && current.congestedPoints.length > 0) {
                console.log('[Auto-Traffic] Delay increased by ~' + delayJump.toFixed(1) + ' min');
                return 'congestion';
            }
            if (current.congestedCount > (previous.congestedCount || 0) + 1 && current.congestedPoints.length > 0) {
                console.log('[Auto-Traffic] More congested segments: ' + (previous.congestedCount || 0) + ' -> ' + current.congestedCount);
                return 'congestion';
            }
        }

        return false;
    }

    /**
     * Effective minutes on the current route including measured traffic delay.
     * @param {number} baseMinutes
     * @param {number} [measuredDelayMin]
     * @returns {number}
     */
    function computeEffectiveRouteMinutes(baseMinutes, measuredDelayMin) {
        return baseMinutes + (measuredDelayMin || 0);
    }

    /**
     * Minutes saved by accepting a traffic-based reroute alternative.
     * @param {number} oldBaseMinutes
     * @param {number} measuredDelayMin
     * @param {number} newRouteMinutes
     * @returns {number}
     */
    function computeTrafficRerouteTimeSaved(oldBaseMinutes, measuredDelayMin, newRouteMinutes) {
        return computeEffectiveRouteMinutes(oldBaseMinutes, measuredDelayMin) - newRouteMinutes;
    }

    /**
     * Whether a traffic reroute alternative should replace the active route.
     * @param {boolean} isSevere
     * @param {number} timeSavedMinutes
     * @param {number} [minSavedMinutes=2]
     * @returns {boolean}
     */
    function shouldAcceptTrafficReroute(isSevere, timeSavedMinutes, minSavedMinutes) {
        var minSaved = typeof minSavedMinutes === 'number' ? minSavedMinutes : 2;
        return !!isSevere || timeSavedMinutes >= minSaved;
    }

    /**
     * User-facing save-time message for traffic reroute notifications.
     * @param {number} timeSavedMinutes
     * @returns {string}
     */
    function formatTrafficRerouteSaveMessage(timeSavedMinutes) {
        return timeSavedMinutes > 0
            ? 'Saves about ' + timeSavedMinutes.toFixed(0) + ' minutes.'
            : '';
    }

    var api = {
        detectSignificantTrafficChange: detectSignificantTrafficChange,
        computeEffectiveRouteMinutes: computeEffectiveRouteMinutes,
        computeTrafficRerouteTimeSaved: computeTrafficRerouteTimeSaved,
        shouldAcceptTrafficReroute: shouldAcceptTrafficReroute,
        formatTrafficRerouteSaveMessage: formatTrafficRerouteSaveMessage,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTrafficChange = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

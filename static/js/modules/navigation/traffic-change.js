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

    /**
     * Preflight plan for automatic traffic sampling during navigation.
     * @param {Object} [opts]
     * @param {boolean} [opts.routeInProgress]
     * @param {number} [opts.currentLat]
     * @param {number} [opts.currentLon]
     * @returns {Object}
     */
    function buildCheckTrafficAndReroutePreflightPlan(opts) {
        opts = opts || {};
        if (!opts.routeInProgress || !opts.currentLat || !opts.currentLon) {
            return { shouldCheck: false, reason: 'no_active_route' };
        }
        return { shouldCheck: true, forceFresh: true };
    }

    /**
     * Dispatch plan after fetching a traffic snapshot for reroute evaluation.
     * @param {Object|null} flow
     * @returns {Object}
     */
    function buildTrafficSampleResponseDispatchPlan(flow) {
        if (!flow) {
            return { action: 'none', reason: 'no_data' };
        }
        if (flow.source !== 'TomTom') {
            return { action: 'update_last_traffic_only', flow: flow, reason: 'simulated' };
        }
        return { action: 'evaluate_change', flow: flow };
    }

    /**
     * Notification and reroute dispatch when a significant traffic change is detected.
     * @param {string|false} changeType
     * @param {Object} flow
     * @returns {Object}
     */
    function buildTrafficChangeNotificationPlan(changeType, flow) {
        flow = flow || {};
        if (!changeType) {
            return { shouldNotify: false, shouldReroute: false };
        }
        var isSevere = changeType === 'severe';
        return {
            shouldNotify: true,
            shouldReroute: true,
            changeType: changeType,
            avoidPoints: flow.congestedPoints || [],
            measuredDelayMin: flow.delayMin || 0,
            notificationTitle: '🚦 Traffic Update',
            notificationMessage: isSevere
                ? 'Severe congestion ahead. Checking for a faster route...'
                : 'Heavier traffic ahead. Checking for a better route...',
            notificationType: 'warning',
        };
    }

    /**
     * Preflight plan before requesting a traffic-based reroute alternative.
     * @param {Object} [opts]
     * @param {string|null} [opts.destination]
     * @param {Object|null} [opts.lastCalculatedRoute]
     * @param {string} [opts.changeType]
     * @returns {Object}
     */
    function buildTrafficReroutePreflightPlan(opts) {
        opts = opts || {};
        if (!opts.destination) {
            return { shouldReroute: false, reason: 'no_destination' };
        }
        if (!opts.lastCalculatedRoute) {
            return { shouldReroute: false, reason: 'no_route_context' };
        }
        return {
            shouldReroute: true,
            isSevere: opts.changeType === 'severe',
        };
    }

    /**
     * Acceptance plan after a traffic reroute API returns a candidate route.
     * @param {Object} [opts]
     * @param {boolean} [opts.isSevere]
     * @param {number} [opts.oldBaseMinutes]
     * @param {number} [opts.measuredDelayMin]
     * @param {number} [opts.newRouteMinutes]
     * @returns {Object}
     */
    function buildTrafficRerouteAcceptancePlan(opts) {
        opts = opts || {};
        var timeSaved = computeTrafficRerouteTimeSaved(
            opts.oldBaseMinutes || 0,
            opts.measuredDelayMin,
            opts.newRouteMinutes || 0
        );
        var accept = shouldAcceptTrafficReroute(!!opts.isSevere, timeSaved);
        var reason = opts.isSevere ? 'severe congestion' : 'traffic';
        var saveMsg = formatTrafficRerouteSaveMessage(timeSaved);
        return {
            accept: accept,
            timeSavedMinutes: timeSaved,
            reason: reason,
            saveMessage: saveMsg,
            clearTrafficCache: accept,
            clearLastTrafficData: accept,
            notificationTitle: accept ? '✅ Route Updated' : null,
            notificationMessage: accept
                ? 'New route found due to ' + reason + '. ' + saveMsg
                : null,
            notificationType: accept ? 'success' : null,
            voiceMessage: accept
                ? 'Route updated due to ' + reason + '. ' + saveMsg
                : null,
        };
    }

    var api = {
        detectSignificantTrafficChange: detectSignificantTrafficChange,
        computeEffectiveRouteMinutes: computeEffectiveRouteMinutes,
        computeTrafficRerouteTimeSaved: computeTrafficRerouteTimeSaved,
        shouldAcceptTrafficReroute: shouldAcceptTrafficReroute,
        formatTrafficRerouteSaveMessage: formatTrafficRerouteSaveMessage,
        buildCheckTrafficAndReroutePreflightPlan: buildCheckTrafficAndReroutePreflightPlan,
        buildTrafficSampleResponseDispatchPlan: buildTrafficSampleResponseDispatchPlan,
        buildTrafficChangeNotificationPlan: buildTrafficChangeNotificationPlan,
        buildTrafficReroutePreflightPlan: buildTrafficReroutePreflightPlan,
        buildTrafficRerouteAcceptancePlan: buildTrafficRerouteAcceptancePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTrafficChange = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

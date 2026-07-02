/**
 * @file Pure off-route / reroute decision logic (no DOM, no network, no timers).
 * @module modules/navigation/reroute-decision
 *
 * The monolith's checkRouteDeviation() runs on every GPS tick and decides whether to
 * trigger an automatic reroute. The *decision* — accuracy gating, the accuracy-widened
 * off-route threshold, the route-join gate, the dwell timer, and the debounce — is pure
 * given the current tick + tracking state, so it lives here to be unit tested for real and
 * is shared with the classic app script via the `VoyagrRerouteDecision` global. The monolith
 * delegates with an inline fallback and applies the returned decision (logging, notification,
 * reroute, and persisting the new tracking state).
 *
 * Conventions encoded here (must match the app's behaviour):
 *   - Fixes worse than DEVIATION_MAX_TRUST_ACCURACY_M are ignored (too unreliable to act on).
 *   - The off-route threshold is widened by half the GPS error, capped, so noisy-but-on-road
 *     fixes don't count as a deviation.
 *   - Deviation alerts/reroutes are gated until GPS first comes within ROUTE_JOIN_GATE_METERS
 *     of the route line (the start point is often not the current location).
 *   - A deviation must persist for DEVIATION_TIME_THRESHOLD_MS before rerouting, and reroutes
 *     are debounced by REROUTE_DEBOUNCE_MS.
 *   - Reroute is suppressed within NAV_ARRIVAL_SUPPRESS_REROUTE_METERS of the destination
 *     (Waze-style parking-lot loops).
 */
(function (root) {
    'use strict';

    var DEFAULTS = {
        DEVIATION_THRESHOLD_METERS: 50,
        DEVIATION_TIME_THRESHOLD_MS: 10000,
        DEVIATION_MAX_TRUST_ACCURACY_M: 65,
        DEVIATION_ACC_EXTRA_CAP_M: 40,
        ROUTE_JOIN_GATE_METERS: 85,
        REROUTE_DEBOUNCE_MS: 30000,
        NAV_ARRIVAL_SUPPRESS_REROUTE_METERS: 100
    };

    /** Treat non-finite / non-positive accuracy as 0 (unknown) for gating purposes. */
    function normalizeAccuracy(accuracy) {
        return (Number.isFinite(accuracy) && accuracy > 0) ? accuracy : 0;
    }

    /** @returns {boolean} Whether a fix is accurate enough to act on. */
    function isTrustworthyAccuracy(accuracy, constants) {
        var c = constants || DEFAULTS;
        return normalizeAccuracy(accuracy) <= c.DEVIATION_MAX_TRUST_ACCURACY_M;
    }

    /**
     * The off-route threshold (m) widened by part of the GPS error (capped).
     * @returns {number}
     */
    function effectiveDeviationThreshold(accuracy, constants) {
        var c = constants || DEFAULTS;
        var acc = normalizeAccuracy(accuracy);
        return c.DEVIATION_THRESHOLD_METERS + Math.min(c.DEVIATION_ACC_EXTRA_CAP_M, acc * 0.5);
    }

    /**
     * Decide what checkRouteDeviation should do for this GPS tick.
     *
     * @param {object} params
     * @param {boolean} params.autoRerouteEnabled
     * @param {boolean} params.hasRoute - Whether a route polyline exists.
     * @param {number} params.remainingToDest - Along-route metres remaining.
     * @param {number} params.accuracy - GPS accuracy (m).
     * @param {number} params.minDistance - Snapped distance from the route line (m).
     * @param {boolean} params.routeJoinConfirmed - Has GPS joined the route yet?
     * @param {number|null} params.deviationStartTime - When the current deviation began (ms).
     * @param {number} params.lastRerouteTime - When the last reroute fired (ms).
     * @param {number} params.now - Current time (ms).
     * @param {object} [params.constants] - Override the tuning constants (tests).
     * @returns {{
     *   action: string,
     *   shouldReroute: boolean,
     *   routeJoinConfirmed: boolean,
     *   deviationStartTime: (number|null),
     *   lastRerouteTime: number,
     *   effectiveThreshold: number,
     *   minDistance: number,
     *   deviationDuration: number
     * }} action is one of: disabled | no-route | near-destination | untrusted-accuracy |
     *   awaiting-join | reroute | debounced | waiting | on-route.
     */
    function decideRouteDeviation(params) {
        params = params || {};
        var c = params.constants || DEFAULTS;
        var routeJoinConfirmed = !!params.routeJoinConfirmed;
        var deviationStartTime = (params.deviationStartTime != null) ? params.deviationStartTime : null;
        var lastRerouteTime = params.lastRerouteTime || 0;
        var minDistance = params.minDistance;
        var now = params.now;

        function base(action, extra) {
            var out = {
                action: action,
                shouldReroute: false,
                routeJoinConfirmed: routeJoinConfirmed,
                deviationStartTime: deviationStartTime,
                lastRerouteTime: lastRerouteTime,
                effectiveThreshold: 0,
                minDistance: minDistance,
                deviationDuration: 0
            };
            if (extra) {
                for (var k in extra) {
                    if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
                }
            }
            return out;
        }

        if (!params.autoRerouteEnabled) return base('disabled');
        if (!params.hasRoute) return base('no-route');
        if (params.remainingToDest <= c.NAV_ARRIVAL_SUPPRESS_REROUTE_METERS) return base('near-destination');
        if (!isTrustworthyAccuracy(params.accuracy, c)) return base('untrusted-accuracy');

        var effectiveThreshold = effectiveDeviationThreshold(params.accuracy, c);

        // Gate deviation monitoring until GPS first joins the route line.
        if (!routeJoinConfirmed) {
            if (minDistance <= c.ROUTE_JOIN_GATE_METERS) {
                routeJoinConfirmed = true;
                deviationStartTime = null;
                // fall through to the deviation check on this same tick
            } else {
                return base('awaiting-join', {
                    routeJoinConfirmed: false,
                    deviationStartTime: null,
                    effectiveThreshold: effectiveThreshold
                });
            }
        }

        if (minDistance > effectiveThreshold) {
            if (!deviationStartTime) deviationStartTime = now;
            var deviationDuration = now - deviationStartTime;

            if (deviationDuration >= c.DEVIATION_TIME_THRESHOLD_MS) {
                var timeSinceLastReroute = now - lastRerouteTime;
                if (timeSinceLastReroute > c.REROUTE_DEBOUNCE_MS) {
                    return base('reroute', {
                        shouldReroute: true,
                        routeJoinConfirmed: routeJoinConfirmed,
                        deviationStartTime: null,
                        lastRerouteTime: now,
                        effectiveThreshold: effectiveThreshold,
                        deviationDuration: deviationDuration
                    });
                }
                return base('debounced', {
                    routeJoinConfirmed: routeJoinConfirmed,
                    deviationStartTime: deviationStartTime,
                    effectiveThreshold: effectiveThreshold,
                    deviationDuration: deviationDuration
                });
            }
            return base('waiting', {
                routeJoinConfirmed: routeJoinConfirmed,
                deviationStartTime: deviationStartTime,
                effectiveThreshold: effectiveThreshold,
                deviationDuration: deviationDuration
            });
        }

        // Back on route — reset deviation tracking.
        return base('on-route', {
            routeJoinConfirmed: routeJoinConfirmed,
            deviationStartTime: null,
            effectiveThreshold: effectiveThreshold
        });
    }

    var api = {
        DEFAULTS: DEFAULTS,
        normalizeAccuracy: normalizeAccuracy,
        isTrustworthyAccuracy: isTrustworthyAccuracy,
        effectiveDeviationThreshold: effectiveDeviationThreshold,
        decideRouteDeviation: decideRouteDeviation
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Namespace global for the classic browser script (voyagr-app.js). Intentionally does
    // NOT expose bare function names, to avoid clobbering the monolith's own declarations.
    root.VoyagrRerouteDecision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

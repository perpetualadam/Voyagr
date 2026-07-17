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
        NAV_ARRIVAL_SUPPRESS_REROUTE_METERS: 100,
        /** Consecutive off-route GPS ticks before the dwell timer may start. */
        MIN_OFF_ROUTE_STREAK: 3
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
     * @param {number} params.lastRerouteTime - When the last successful reroute completed (ms).
     * @param {number} params.lastRerouteAttemptTime - When the last reroute attempt started (ms).
     * @param {number} params.offRouteStreak - Consecutive ticks beyond the off-route threshold.
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
        var lastRerouteAttemptTime = params.lastRerouteAttemptTime || 0;
        var offRouteStreak = Number.isFinite(params.offRouteStreak) ? params.offRouteStreak : 0;
        var minDistance = params.minDistance;
        var now = params.now;

        function base(action, extra) {
            var out = {
                action: action,
                shouldReroute: false,
                routeJoinConfirmed: routeJoinConfirmed,
                deviationStartTime: deviationStartTime,
                lastRerouteTime: lastRerouteTime,
                lastRerouteAttemptTime: lastRerouteAttemptTime,
                offRouteStreak: offRouteStreak,
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
            offRouteStreak += 1;
            if (offRouteStreak >= c.MIN_OFF_ROUTE_STREAK) {
                if (!deviationStartTime) deviationStartTime = now;
            } else {
                deviationStartTime = null;
            }
            var deviationDuration = deviationStartTime ? (now - deviationStartTime) : 0;

            if (deviationStartTime && deviationDuration >= c.DEVIATION_TIME_THRESHOLD_MS) {
                var debounceSince = Math.max(lastRerouteTime, lastRerouteAttemptTime);
                var timeSinceLastReroute = now - debounceSince;
                if (timeSinceLastReroute > c.REROUTE_DEBOUNCE_MS) {
                    return base('reroute', {
                        shouldReroute: true,
                        routeJoinConfirmed: routeJoinConfirmed,
                        deviationStartTime: null,
                        offRouteStreak: 0,
                        lastRerouteAttemptTime: now,
                        effectiveThreshold: effectiveThreshold,
                        deviationDuration: deviationDuration
                    });
                }
                return base('debounced', {
                    routeJoinConfirmed: routeJoinConfirmed,
                    deviationStartTime: deviationStartTime,
                    offRouteStreak: offRouteStreak,
                    effectiveThreshold: effectiveThreshold,
                    deviationDuration: deviationDuration
                });
            }
            return base('waiting', {
                routeJoinConfirmed: routeJoinConfirmed,
                deviationStartTime: deviationStartTime,
                offRouteStreak: offRouteStreak,
                effectiveThreshold: effectiveThreshold,
                deviationDuration: deviationDuration
            });
        }

        // Back on route — reset deviation tracking.
        return base('on-route', {
            routeJoinConfirmed: routeJoinConfirmed,
            deviationStartTime: null,
            offRouteStreak: 0,
            effectiveThreshold: effectiveThreshold
        });
    }

    /**
     * Resolve snap distance and remaining-to-destination inputs for a deviation tick.
     * @param {Object} opts
     * @param {number} opts.lat
     * @param {number} opts.lon
     * @param {Array<[number,number]>} [opts.routePolyline]
     * @param {number} [opts.lastSnappedRouteIndex]
     * @param {function(number, number, Array, number): {distance: number}} [opts.snapFn]
     * @param {function(number, number): number} [opts.remainingFn]
     * @returns {Object}
     */
    function buildRouteDeviationTickInputsPlan(opts) {
        opts = opts || {};
        if (!opts.routePolyline || opts.routePolyline.length === 0) {
            return { action: 'skip', reason: 'no-polyline' };
        }
        if (typeof opts.snapFn !== 'function' || typeof opts.remainingFn !== 'function') {
            return { action: 'skip', reason: 'no-helpers' };
        }
        var snap = opts.snapFn(
            opts.lat,
            opts.lon,
            opts.routePolyline,
            opts.lastSnappedRouteIndex != null ? opts.lastSnappedRouteIndex : 0
        );
        return {
            action: 'ready',
            remainingToDest: opts.remainingFn(opts.lat, opts.lon),
            minDistance: snap && snap.distance != null ? snap.distance : Infinity,
            snap: snap,
        };
    }

    /**
     * Full deviation tick plan: pre-checks, decideRouteDeviation, state patch, reroute apply hints.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildRouteDeviationTickPlan(opts) {
        opts = opts || {};
        var now = opts.now != null ? opts.now : Date.now();

        if (!opts.autoRerouteEnabled) {
            return { action: 'skip', reason: 'disabled' };
        }
        if (!opts.hasRoute) {
            return { action: 'skip', reason: 'no-route' };
        }
        if (opts.rerouteInProgress) {
            return { action: 'skip', reason: 'in-progress' };
        }

        var inPostRerouteGrace = (opts.postRerouteGraceUntil || 0) > now;

        var decision = decideRouteDeviation({
            autoRerouteEnabled: opts.autoRerouteEnabled,
            hasRoute: opts.hasRoute,
            remainingToDest: opts.remainingToDest,
            accuracy: opts.accuracy,
            minDistance: opts.minDistance,
            routeJoinConfirmed: opts.routeJoinConfirmed,
            deviationStartTime: opts.deviationStartTime,
            lastRerouteTime: opts.lastRerouteTime,
            lastRerouteAttemptTime: opts.lastRerouteAttemptTime,
            offRouteStreak: opts.offRouteStreak,
            now: now,
            constants: opts.constants,
        });

        var wasJoined = !!opts.routeJoinConfirmed;
        var plan = {
            action: decision.action,
            decision: decision,
            statePatch: {
                routeJoinConfirmedForDeviation: decision.routeJoinConfirmed,
                deviationStartTimeCheck: decision.deviationStartTime,
                deviationOffRouteStreak: decision.offRouteStreak != null ? decision.offRouteStreak : 0,
            },
            logJoinDetected: !wasJoined && decision.routeJoinConfirmed,
            lastRerouteDeviation: opts.minDistance,
        };

        if (decision.action === 'reroute') {
            if (inPostRerouteGrace) {
                plan.action = 'grace-suppressed';
                plan.trackDeviation = true;
            } else {
                plan.statePatch.lastRerouteAttemptTime = decision.lastRerouteAttemptTime || now;
                plan.rerouteAttemptIncrement = true;
                plan.notification = buildDeviationRerouteNotification(
                    opts.minDistance,
                    opts.distanceUnit,
                    decision.deviationDuration
                );
                plan.logDeviation = {
                    minDistance: opts.minDistance,
                    deviationDuration: decision.deviationDuration,
                };
                plan.triggerReroute = true;
            }
        } else if (decision.action === 'debounced' || decision.action === 'waiting') {
            plan.trackDeviation = true;
        }

        return plan;
    }

    /**
     * Apply plan for a route deviation tick (state patch, logs, reroute trigger hints).
     * @param {Object} tick - Result of buildRouteDeviationTickPlan
     * @param {Object} [opts]
     * @param {number} [opts.rerouteAttemptCount] - Current attempt count before increment
     * @returns {Object}
     */
    function buildRouteDeviationApplyPlan(tick, opts) {
        opts = opts || {};
        if (!tick || tick.action === 'skip') {
            return { action: 'skip', reason: tick && tick.reason };
        }

        var apply = {
            action: 'apply',
            statePatch: tick.statePatch || {},
            updateLastRerouteDeviation: !!(tick.trackDeviation || tick.triggerReroute),
            lastRerouteDeviation: tick.lastRerouteDeviation,
        };

        if (tick.logJoinDetected) {
            apply.logJoinLine = '[Rerouting] Route join detected — deviation monitoring active';
        }

        if (tick.triggerReroute && tick.logDeviation) {
            var nextAttempt = (opts.rerouteAttemptCount != null ? opts.rerouteAttemptCount : 0) + 1;
            apply.triggerReroute = true;
            apply.rerouteAttemptIncrement = true;
            apply.notification = tick.notification;
            apply.logDeviationLine = '[Rerouting] Deviation confirmed: ' +
                tick.logDeviation.minDistance.toFixed(0) + 'm for ' +
                (tick.logDeviation.deviationDuration / 1000).toFixed(1) + 's (attempt #' +
                nextAttempt + ')';
        }

        return apply;
    }

    /**
     * Normalized state apply plan from a route deviation apply result.
     * @param {Object|null|undefined} apply - from buildRouteDeviationApplyPlan
     * @returns {Object}
     */
    function buildRouteDeviationStateApplyPlan(apply) {
        if (!apply || apply.action === 'skip') {
            return { action: 'skip', reason: apply && apply.reason };
        }
        return {
            action: 'apply',
            statePatch: apply.statePatch || {},
            incrementRerouteAttemptCount: !!apply.rerouteAttemptIncrement,
            updateLastRerouteDeviation: !!apply.updateLastRerouteDeviation,
            lastRerouteDeviation: apply.lastRerouteDeviation,
            logJoinLine: apply.logJoinLine || null,
            logDeviationLine: apply.logDeviationLine || null,
            triggerReroute: !!apply.triggerReroute,
            notification: apply.notification || null,
        };
    }

    /**
     * Build a reroute analytics/debug event object.
     * @param {Object} o
     * @param {string} o.timestampIso
     * @param {number} o.startLat
     * @param {number} o.startLon
     * @param {string} o.destination
     * @param {{ distance_km: number, duration_minutes: number }} o.route
     * @param {number} o.hazardCount
     * @param {{ avoidCameras: boolean, avoidTolls: boolean, avoidCaz: boolean }} o.settings
     * @returns {Object}
     */
    function buildRerouteLogEvent(o) {
        o = o || {};
        return {
            timestamp: o.timestampIso,
            type: 'automatic_reroute',
            start: { lat: o.startLat, lon: o.startLon },
            destination: o.destination,
            route: {
                distance_km: o.route.distance_km,
                duration_minutes: o.route.duration_minutes,
                hazard_count: o.hazardCount,
            },
            settings: {
                avoid_cameras: !!o.settings.avoidCameras,
                avoid_tolls: !!o.settings.avoidTolls,
                avoid_caz: !!o.settings.avoidCaz,
            },
        };
    }

    /**
     * Append a reroute log entry, keeping only the most recent N events.
     * @param {Storage} storage
     * @param {Object} event
     * @param {number} [maxEntries=20]
     * @returns {Object[]} Updated log array
     */
    function appendRerouteLogEntry(storage, event, maxEntries) {
        var max = typeof maxEntries === 'number' ? maxEntries : 20;
        var rerouteLog = [];
        try {
            rerouteLog = JSON.parse(storage.getItem('rerouteLog') || '[]');
        } catch (e) {
            rerouteLog = [];
        }
        rerouteLog.push(event);
        var trimmed = rerouteLog.slice(-max);
        storage.setItem('rerouteLog', JSON.stringify(trimmed));
        return trimmed;
    }

    /**
     * Read reroute analytics settings snapshot from storage via route-prefs readers.
     * @param {Storage} storage
     * @param {Object} [routePrefs] - VoyagrRoutePrefs API subset
     * @returns {{ avoidCameras: boolean, avoidTolls: boolean, avoidCaz: boolean }}
     */
    function buildRerouteLogSettingsSnapshot(storage, routePrefs) {
        storage = storage || { getItem: function () { return null; } };
        routePrefs = routePrefs || {};
        var isRouteAvoidancePrefEnabled = routePrefs.isRouteAvoidancePrefEnabled || function () { return true; };
        var isAvoidTollsEnabled = routePrefs.isAvoidTollsEnabled || function () { return false; };
        return {
            avoidCameras: isRouteAvoidancePrefEnabled('cameras', storage),
            avoidTolls: isAvoidTollsEnabled(storage),
            avoidCaz: isRouteAvoidancePrefEnabled('caz', storage),
        };
    }

    /**
     * Build and persist an automatic reroute log entry.
     * @param {Storage} storage
     * @param {Object} opts
     * @returns {{ event: Object, log: Object[] }}
     */
    function recordAutomaticRerouteLog(storage, opts) {
        opts = opts || {};
        var settings = buildRerouteLogSettingsSnapshot(storage, opts.routePrefs);
        var event = buildRerouteLogEvent({
            timestampIso: opts.timestampIso || new Date().toISOString(),
            startLat: opts.startLat,
            startLon: opts.startLon,
            destination: opts.destination,
            route: opts.route,
            hazardCount: opts.hazardCount,
            settings: settings,
        });
        var log = appendRerouteLogEntry(storage, event, opts.maxEntries);
        return { event: event, log: log };
    }

    var REROUTE_FAILURE_RETRY_DELAYS_MS = [4000, 6500, 10000, 14000];
    var REROUTE_ANNOUNCE_MIN_INTERVAL_MS = 60000;

    /**
     * Plan for scheduling automatic reroute failure retries.
     * @param {Object} state
     * @returns {Object}
     */
    function buildRerouteFailureRetryPlan(state) {
        state = state || {};
        var max = REROUTE_FAILURE_RETRY_DELAYS_MS.length;
        var autoReroute = state.autoRerouteOnDeviationEnabled != null
            ? state.autoRerouteOnDeviationEnabled
            : state.autoRerouteEnabled;
        if (!state.routeInProgress || !autoReroute) {
            return { action: 'clear', schedule: false };
        }
        if (state.now < state.postRerouteGraceUntil) {
            return { action: 'skip', schedule: false, reason: 'grace' };
        }
        if (state.rerouteInProgress) {
            return { action: 'skip', schedule: false, reason: 'in-progress' };
        }
        if (state.rerouteFailureRetryCount >= max) {
            return {
                action: 'exhausted',
                schedule: false,
                notification: {
                    title: '❌ Rerouting failed',
                    body: 'Could not get a new route after several tries. Pull over safely and use Recalculate if needed.',
                    type: 'error',
                },
            };
        }
        var delay = REROUTE_FAILURE_RETRY_DELAYS_MS[state.rerouteFailureRetryCount];
        var attemptLabel = state.rerouteFailureRetryCount + 1;
        return {
            action: 'schedule',
            schedule: true,
            delayMs: delay,
            attemptLabel: attemptLabel,
            maxAttempts: max,
            statusMessage: '🔄 Reroute retry ' + attemptLabel + '/' + max + '...',
            nextRetryCount: state.rerouteFailureRetryCount + 1,
            logMessage: '[Rerouting] Scheduling failure retry ' + attemptLabel + '/' + max + ' in ' + delay + 'ms',
        };
    }

    /**
     * Pre-trigger guards before starting an automatic reroute.
     * @param {number} now
     * @param {Object} state
     * @returns {{ skip: boolean, reason?: string }}
     */
    function shouldSkipRerouteTrigger(now, state) {
        state = state || {};
        if (state.rerouteInProgress) {
            return { skip: true, reason: 'in-progress' };
        }
        var debounceMs = state.debounceMs != null ? state.debounceMs : DEFAULTS.REROUTE_DEBOUNCE_MS;
        if (now - (state.lastRerouteAttemptTime || 0) < debounceMs) {
            return { skip: true, reason: 'debounced' };
        }
        if (now < (state.postRerouteGraceUntil || 0)) {
            return { skip: true, reason: 'grace' };
        }
        return { skip: false };
    }

    /**
     * Human-readable log line for skipped automatic reroute triggers.
     * @param {string} reason
     * @returns {string}
     */
    function automaticRerouteSkipLogMessage(reason) {
        if (reason === 'in-progress') return '[Rerouting] Already in progress — skipping duplicate trigger';
        if (reason === 'debounced') return '[Rerouting] Attempt debounced — too soon after last try';
        return '[Rerouting] Post-reroute grace active — skipping';
    }

    /**
     * Skip check plus guard plan for automatic reroute trigger.
     * @param {number} now
     * @param {Object} state
     * @returns {Object}
     */
    function buildAutomaticRerouteTriggerPlan(now, state) {
        state = state || {};
        var skip = shouldSkipRerouteTrigger(now, state);
        if (skip.skip) {
            return {
                action: 'skip',
                reason: skip.reason,
                logMessage: automaticRerouteSkipLogMessage(skip.reason),
            };
        }

        var guard = buildAutomaticRerouteGuardPlan({
            offline: state.offline,
            destination: state.destination,
            hasRouteContext: state.hasRouteContext,
            startLat: state.startLat,
            startLon: state.startLon,
        });

        var plan = {
            action: guard.proceed ? 'fetch' : 'defer',
            lastRerouteAttemptTime: now,
            guard: guard,
        };

        if (!guard.proceed) {
            plan.scheduleRetry = guard.action === 'schedule-retry';
            plan.resetRerouteInProgress = guard.resetRerouteInProgress;
        } else {
            plan.rerouteInProgress = true;
        }

        return plan;
    }

    /**
     * @param {number} minDistanceMeters
     * @param {string} distanceUnit
     * @returns {string}
     */
    function formatDeviationDistanceDisplay(minDistanceMeters, distanceUnit) {
        if (distanceUnit === 'mi') {
            return Math.round(minDistanceMeters * 3.28084) + ' ft';
        }
        return minDistanceMeters.toFixed(0) + ' m';
    }

    /**
     * @param {number} minDistanceMeters
     * @param {string} distanceUnit
     * @param {number} deviationDurationMs
     * @returns {{ title: string, body: string, type: string }}
     */
    function buildDeviationRerouteNotification(minDistanceMeters, distanceUnit, deviationDurationMs) {
        var display = formatDeviationDistanceDisplay(minDistanceMeters, distanceUnit);
        var secs = (deviationDurationMs / 1000).toFixed(0);
        return {
            title: '🔄 Route Deviation',
            body: 'You are ' + display + ' off route for ' + secs + 's. Recalculating...',
            type: 'warning',
        };
    }

    /**
     * @param {number} now
     * @param {number} lastAnnounceTime
     * @param {number} [minIntervalMs]
     * @returns {boolean}
     */
    function shouldAnnounceRerouteVoice(now, lastAnnounceTime, minIntervalMs) {
        minIntervalMs = minIntervalMs != null ? minIntervalMs : REROUTE_ANNOUNCE_MIN_INTERVAL_MS;
        return (now - (lastAnnounceTime || 0)) >= minIntervalMs;
    }

    /**
     * @param {{ duration_minutes: number }} route
     * @param {number} hazardCount
     * @param {string} displayDistance
     * @param {string} distUnit
     * @returns {string}
     */
    function buildRerouteVoiceMessage(route, hazardCount, displayDistance, distUnit) {
        var msg = 'Route recalculated. New distance: ' + displayDistance + ' ' + distUnit +
            ', time: ' + route.duration_minutes + ' minutes';
        if (hazardCount > 0) {
            msg += '. Warning: ' + hazardCount + ' hazard' + (hazardCount > 1 ? 's' : '') + ' on route.';
        }
        return msg;
    }

    /**
     * @param {{ duration_minutes: number }} route
     * @param {number} hazardCount
     * @param {string} displayDistance
     * @param {string} distUnit
     * @returns {{ title: string, body: string, type: string }}
     */
    function buildRerouteSuccessNotificationPlan(route, hazardCount, displayDistance, distUnit) {
        if (hazardCount > 0) {
            return {
                title: '⚠️ Route Updated',
                body: 'New route with ' + hazardCount + ' unavoidable hazard' + (hazardCount > 1 ? 's' : ''),
                type: 'warning',
            };
        }
        return {
            title: '✅ Route Updated',
            body: 'New route: ' + displayDistance + ' ' + distUnit + ', ' + route.duration_minutes + ' min',
            type: 'success',
        };
    }

    /**
     * Guard plan before starting an automatic reroute fetch.
     * @param {Object} o
     * @returns {Object}
     */
    function buildAutomaticRerouteGuardPlan(o) {
        o = o || {};
        if (o.offline) {
            return {
                proceed: false,
                action: 'schedule-retry',
                logMessage: '[Rerouting] Offline — deferring automatic reroute',
            };
        }
        if (!o.destination) {
            return {
                proceed: false,
                action: 'abort',
                resetRerouteInProgress: true,
                logMessage: '[Rerouting] No destination stored, cannot reroute',
            };
        }
        if (!o.hasRouteContext) {
            return {
                proceed: false,
                action: 'abort',
                resetRerouteInProgress: true,
                logMessage: '[Rerouting] No route context, cannot reroute',
            };
        }
        return {
            proceed: true,
            logMessage: '[Rerouting] Starting automatic reroute from (' +
                Number(o.startLat).toFixed(4) + ', ' + Number(o.startLon).toFixed(4) +
                ') to ' + o.destination,
        };
    }

    /**
     * Normalize routing engine source labels for comparison.
     * @param {string} [source]
     * @returns {string}
     */
    function normalizeRouteSourceKey(source) {
        return String(source || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
    }

    /**
     * Whether a reroute candidate matches the previously active engine family.
     * @param {string} [previousSource]
     * @param {string} [candidateSource]
     * @returns {boolean}
     */
    function routeSourcesMatch(previousSource, candidateSource) {
        var prev = normalizeRouteSourceKey(previousSource);
        var candidate = normalizeRouteSourceKey(candidateSource);
        if (!prev) return true;
        if (!candidate) return false;
        if (prev.indexOf('graphhopper') >= 0) {
            return candidate.indexOf('graphhopper') >= 0;
        }
        if (prev.indexOf('valhalla') >= 0) {
            return candidate.indexOf('valhalla') >= 0;
        }
        if (prev.indexOf('osrm') >= 0) {
            return candidate.indexOf('osrm') >= 0;
        }
        return prev === candidate || candidate.indexOf(prev) >= 0 || prev.indexOf(candidate) >= 0;
    }

    /**
     * Pick a route from a multi-route reroute response (name + engine source aware).
     * @param {Array<Object>} routes
     * @param {Object} [opts]
     * @returns {Object|null}
     */
    function pickRerouteRouteFromResponse(routes, opts) {
        opts = opts || {};
        if (!routes || !routes.length) return null;
        if (opts.preferPrimary) return routes[0];

        var prevName = opts.previousRouteName ? String(opts.previousRouteName).toLowerCase() : '';
        var prevSource = opts.previousRouteSource || '';

        if (prevName && prevSource) {
            for (var i = 0; i < routes.length; i++) {
                var exact = routes[i];
                if ((exact.name || '').toLowerCase() === prevName
                    && routeSourcesMatch(prevSource, exact.source)) {
                    return exact;
                }
            }
        }

        if (prevName) {
            for (var j = 0; j < routes.length; j++) {
                if ((routes[j].name || '').toLowerCase() === prevName) {
                    return routes[j];
                }
            }
        }

        return routes[0];
    }

    /**
     * Outcome plan after `/api/route` returns for automatic deviation reroute.
     * @param {Object|null|undefined} data
     * @param {Object} opts
     * @returns {Object}
     */
    function buildAutomaticRerouteOutcomePlan(data, opts) {
        opts = opts || {};
        data = data || {};
        if (data.success && data.routes && data.routes.length > 0) {
            var newRoute = pickRerouteRouteFromResponse(data.routes, {
                previousRouteName: opts.previousRouteName,
                previousRouteSource: opts.previousRouteSource,
            }) || data.routes[0];
            var hazardCount = newRoute.hazard_count || 0;
            var hazardsList = newRoute.hazards || newRoute.hazards_on_route || [];
            var displayDist = typeof opts.convertDistance === 'function'
                ? opts.convertDistance(newRoute.distance_km)
                : (opts.displayDistance != null ? opts.displayDistance : String(newRoute.distance_km));
            var distUnit = opts.distUnit || 'km';
            var voiceMsg = buildRerouteVoiceMessage(newRoute, hazardCount, displayDist, distUnit);
            var announceNow = opts.now != null ? opts.now : Date.now();
            var voice = {
                enabled: !!opts.voiceEnabled,
                message: voiceMsg,
                shouldSpeak: opts.voiceEnabled && shouldAnnounceRerouteVoice(
                    announceNow,
                    opts.lastRerouteAnnouncementTime
                ),
                announceAt: announceNow,
            };
            return {
                ok: true,
                newRoute: newRoute,
                hazardCount: hazardCount,
                hazardsList: hazardsList,
                preferPrimaryRouteOnNextNavUpdate: true,
                clearFailureRetries: true,
                showUnavoidableHazards: hazardCount > 0,
                voice: voice,
                notification: buildRerouteSuccessNotificationPlan(
                    newRoute,
                    hazardCount,
                    displayDist,
                    distUnit
                ),
                successLog: '[Rerouting] New route calculated: ' + newRoute.distance_km +
                    'km, ' + newRoute.duration_minutes + 'min',
                completeLog: '[Rerouting] Automatic reroute completed successfully',
            };
        }

        var isFirstFailure = !opts.rerouteFailureRetryCount;
        return {
            ok: false,
            scheduleRetry: true,
            resetRerouteInProgress: true,
            errorLog: '[Rerouting] Failed to calculate new route: ' + (data.error || 'unknown'),
            notification: isFirstFailure ? {
                title: '❌ Rerouting Failed',
                body: 'Could not calculate new route. Retrying automatically…',
                type: 'error',
            } : null,
        };
    }

    /**
     * Outcome plan when automatic reroute fetch throws.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildAutomaticRerouteErrorPlan(opts) {
        opts = opts || {};
        var isFirstFailure = !opts.rerouteFailureRetryCount;
        return {
            ok: false,
            scheduleRetry: true,
            resetRerouteInProgress: true,
            notification: isFirstFailure ? {
                title: '❌ Rerouting Error',
                body: 'Network or server error. Retrying automatically…',
                type: 'error',
            } : null,
        };
    }

    /**
     * Apply plan for automatic reroute API outcome or fetch error.
     * @param {Object|null|undefined} outcome - from buildAutomaticRerouteOutcomePlan or buildAutomaticRerouteErrorPlan
     * @returns {Object}
     */
    function buildAutomaticRerouteResultApplyPlan(outcome) {
        if (!outcome) return { action: 'skip' };
        if (!outcome.ok) {
            return {
                action: 'apply',
                kind: 'failure',
                logs: outcome.errorLog ? [outcome.errorLog] : [],
                notification: outcome.notification || null,
                scheduleRetry: !!outcome.scheduleRetry,
                resetRerouteInProgress: !!outcome.resetRerouteInProgress,
            };
        }
        var logs = [];
        if (outcome.successLog) logs.push(outcome.successLog);
        if (outcome.completeLog) logs.push(outcome.completeLog);
        return {
            action: 'apply',
            kind: 'success',
            clearFailureRetries: !!outcome.clearFailureRetries,
            logs: logs,
            newRoute: outcome.newRoute,
            hazardCount: outcome.hazardCount,
            hazardsList: outcome.hazardsList,
            showUnavoidableHazards: !!outcome.showUnavoidableHazards,
            preferPrimaryRouteOnNextNavUpdate: !!outcome.preferPrimaryRouteOnNextNavUpdate,
            voice: outcome.voice || null,
            notification: outcome.notification || null,
            updateRouteOnMap: true,
            logRerouteEvent: true,
        };
    }

    var POST_REROUTE_GRACE_MS = 90000;

    /**
     * Resolve maneuver steps from a route API payload shape.
     * @param {Object|null|undefined} route
     * @returns {{ steps: Array<Object>|null, source: string|null, logMessage: string|null }}
     */
    function resolveRouteManeuversFromPayload(route) {
        route = route || {};
        if (route.maneuvers && route.maneuvers.length > 0) {
            return {
                steps: route.maneuvers,
                source: 'maneuvers',
                logMessage: '[Reroute] Maneuvers updated: ' + route.maneuvers.length + ' steps',
            };
        }
        if (route.legs && route.legs[0] && route.legs[0].maneuvers) {
            return {
                steps: route.legs[0].maneuvers,
                source: 'legs',
                logMessage: '[Reroute] Maneuvers from legs updated: ' + route.legs[0].maneuvers.length + ' steps',
            };
        }
        return { steps: null, source: null, logMessage: null };
    }

    /**
     * State apply plan after decoding and drawing a new route during navigation reroute.
     * @param {Object} newRoute
     * @param {Object|null|undefined} prevRoute
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildRouteMapUpdateStatePlan(newRoute, prevRoute, opts) {
        opts = opts || {};
        newRoute = newRoute || {};
        prevRoute = prevRoute || {};
        var now = opts.now != null ? opts.now : Date.now();
        var graceMs = opts.postRerouteGraceMs != null ? opts.postRerouteGraceMs : POST_REROUTE_GRACE_MS;
        var maneuvers = resolveRouteManeuversFromPayload(newRoute);
        var displayDist = typeof opts.convertDistance === 'function'
            ? opts.convertDistance(newRoute.distance_km)
            : String(newRoute.distance_km);
        var distUnit = opts.distUnit || 'km';
        // Engine parity: honour the route's own geometry precision (GraphHopper Optimised
        // and Valhalla routes are p6, OSRM fallback routes are p5) instead of assuming 6.
        var polylinePrecision = Number.isFinite(opts.polylineDecodePrecision)
            ? opts.polylineDecodePrecision
            : (Number.isFinite(newRoute.geometry_precision) ? newRoute.geometry_precision : 6);

        return {
            maneuvers: maneuvers,
            polylineDecodePrecision: polylinePrecision,
            vehicleMarkerReset: true,
            speedLimitReset: true,
            roadNameReset: true,
            navigationArrivalReset: true,
            primeVehicleMarker: !!opts.hasCurrentGps,
            progressResetWithoutGps: opts.hasCurrentGps ? null : {
                currentStepIndex: 0,
                lastSnappedRouteIndex: 0,
                lastTurnDetectRouteVertexIndex: 0,
            },
            deviation: {
                deviationStartTimeCheck: null,
                rerouteAttemptCount: 0,
                postRerouteGraceUntil: now + graceMs,
                routeJoinConfirmedForDeviation: false,
                deviationOffRouteStreak: 0,
                lastRerouteTime: now,
                lastRerouteAttemptTime: now,
                rerouteInProgress: false,
                clearFailureRetries: true,
            },
            lastCalculatedRoutePatch: Object.assign({}, prevRoute, newRoute, {
                geometry: newRoute.geometry,
                geometry_precision: polylinePrecision,
                distance: displayDist + ' ' + distUnit,
                time: String(newRoute.duration_minutes != null ? newRoute.duration_minutes : 0) + ' minutes',
                destination: prevRoute.destination,
                destinationName: prevRoute.destinationName,
            }),
            completeLog: '[Reroute] Route updated on map with fresh maneuvers and step tracking',
        };
    }

    /**
     * Execute plan for updateRouteOnMap orchestration in voyagr-app.
     * @param {Object} statePlan - from buildRouteMapUpdateStatePlan
     * @returns {Object}
     */
    function buildUpdateRouteOnMapExecutePlan(statePlan) {
        statePlan = statePlan || {};
        return {
            resetVoiceAnnouncementState: true,
            removeExistingRouteLayer: true,
            polylineDecodePrecision: statePlan.polylineDecodePrecision || 6,
            mountActiveNavRoute: true,
            bringNavRouteAboveTraffic: true,
            // Along-route traffic edges belong to the old geometry after a reroute;
            // clear and refetch them so congestion colouring follows the new route
            // (parity for GraphHopper Optimised and Valhalla routes alike).
            refreshRouteTraffic: true,
            applyRouteMapUpdateState: true,
            polylineLogPrefix: '[Reroute] Route polyline decoded:',
        };
    }

    /**
     * Post-apply plan after route map state patches are applied.
     * @param {Object} plan - from buildRouteMapUpdateStatePlan
     * @param {Object} [input]
     * @param {number|null} [input.currentLat]
     * @param {number|null} [input.currentLon]
     * @returns {Object}
     */
    function buildRouteMapUpdatePostApplyPlan(plan, input) {
        plan = plan || {};
        input = input || {};
        var hasGps = input.currentLat != null && input.currentLon != null;
        return {
            refreshTurnWidget: hasGps,
            fetchRoadName: hasGps,
            updateTripInfo: true,
            patchLastCalculatedRoute: true,
            completeLog: plan.completeLog,
        };
    }

    /**
     * Section flags for applyRouteMapUpdateStateFromPlan in voyagr-app.
     * @param {Object} plan - from buildRouteMapUpdateStatePlan
     * @returns {Object}
     */
    function buildRouteMapUpdateStateApplySectionsPlan(plan) {
        plan = plan || {};
        return {
            applyManeuvers: !!(plan.maneuvers && plan.maneuvers.steps),
            vehicleMarkerReset: !!plan.vehicleMarkerReset,
            roadNameReset: !!plan.roadNameReset,
            navigationArrivalReset: !!plan.navigationArrivalReset,
            deviation: plan.deviation,
        };
    }

    /**
     * Speed-limit reset plan during route map update.
     * @param {Object} plan - from buildRouteMapUpdateStatePlan
     * @returns {Object}
     */
    function buildRouteMapUpdateSpeedLimitResetPlan(plan) {
        plan = plan || {};
        if (plan.speedLimitReset) {
            return { shouldReset: true, kind: 'full-reroute' };
        }
        if (plan.vehicleMarkerReset) {
            return {
                shouldReset: true,
                kind: 'maneuver-change',
                newLastActiveManeuverIdx: -1,
                resetCurrentSpeedLimitMph: true,
                resetDetectedRoadType: true,
            };
        }
        return { shouldReset: false };
    }

    /**
     * Vehicle marker / progress reset plan during route map update.
     * @param {Object} plan - from buildRouteMapUpdateStatePlan
     * @returns {Object}
     */
    function buildRouteMapUpdateProgressResetPlan(plan) {
        plan = plan || {};
        if (plan.primeVehicleMarker) {
            return { action: 'primeVehicleMarker' };
        }
        if (plan.progressResetWithoutGps) {
            return { action: 'resetProgress', patch: plan.progressResetWithoutGps };
        }
        return { action: 'none' };
    }

    var ROUTE_API_PATH = '/api/route';

    /**
     * Fetch orchestration for automatic deviation reroute.
     * @returns {Object}
     */
    function buildAutomaticRerouteFetchOrchestrationPlan() {
        return {
            apiPath: ROUTE_API_PATH,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };
    }

    /**
     * Execute plan for automatic reroute trigger guard (skip/defer/fetch).
     * @param {Object} trigger - from buildAutomaticRerouteTriggerPlan
     * @returns {Object}
     */
    function buildAutomaticRerouteTriggerExecutePlan(trigger) {
        trigger = trigger || {};
        if (trigger.action === 'skip') {
            return { action: 'skip', logMessage: trigger.logMessage };
        }
        if (trigger.action === 'defer') {
            return {
                action: 'defer',
                lastRerouteAttemptTime: trigger.lastRerouteAttemptTime,
                logMessage: trigger.guard && trigger.guard.logMessage,
                scheduleRetry: !!trigger.scheduleRetry,
                resetRerouteInProgress: !!trigger.resetRerouteInProgress,
            };
        }
        return {
            action: 'fetch',
            lastRerouteAttemptTime: trigger.lastRerouteAttemptTime,
            rerouteInProgress: true,
            logMessage: trigger.guard && trigger.guard.logMessage,
        };
    }

    /**
     * Build outcome + apply plans from automatic reroute API response.
     * @param {Object} data
     * @param {Object} [opts]
     * @returns {{ outcome: Object, apply: Object }}
     */
    function buildAutomaticRerouteResponsePlans(data, opts) {
        var outcome = buildAutomaticRerouteOutcomePlan(data, opts);
        return {
            outcome: outcome,
            apply: buildAutomaticRerouteResultApplyPlan(outcome),
        };
    }

    /**
     * Build error + apply plans from automatic reroute fetch failure.
     * @param {Object} [opts]
     * @returns {{ errPlan: Object, apply: Object }}
     */
    function buildAutomaticRerouteErrorResponsePlans(opts) {
        var errPlan = buildAutomaticRerouteErrorPlan(opts);
        return {
            errPlan: errPlan,
            apply: buildAutomaticRerouteResultApplyPlan(errPlan),
        };
    }

    /**
     * Side-effect execute plan for applyAutomaticRerouteResult in voyagr-app.
     * @param {Object} apply - from buildAutomaticRerouteResultApplyPlan
     * @returns {Object}
     */
    function buildAutomaticRerouteResultExecutePlan(apply) {
        apply = apply || {};
        if (apply.action !== 'apply') {
            return { shouldApply: false };
        }
        if (apply.kind === 'failure') {
            return {
                shouldApply: true,
                kind: 'failure',
                logs: apply.logs || [],
                notification: apply.notification || null,
                scheduleRetry: !!apply.scheduleRetry,
                resetRerouteInProgress: !!apply.resetRerouteInProgress,
            };
        }
        return {
            shouldApply: true,
            kind: 'success',
            clearFailureRetries: !!apply.clearFailureRetries,
            logs: apply.logs || [],
            showUnavoidableHazards: !!apply.showUnavoidableHazards,
            newRoute: apply.newRoute,
            hazardsList: apply.hazardsList,
            hazardCount: apply.hazardCount,
            preferPrimaryRouteOnNextNavUpdate: !!apply.preferPrimaryRouteOnNextNavUpdate,
            updateRouteOnMap: !!apply.updateRouteOnMap,
            logRerouteEvent: !!apply.logRerouteEvent,
            voice: apply.voice || null,
            notification: apply.notification || null,
        };
    }

    /**
     * Consolidated execute plan for applyRouteMapUpdateStateFromPlan.
     * @param {Object} plan - from buildRouteMapUpdateStatePlan
     * @param {Object} [input]
     * @param {number|null} [input.currentLat]
     * @param {number|null} [input.currentLon]
     * @param {Object} [input.newRoute]
     * @returns {Object}
     */
    function buildRouteMapUpdateStateExecutePlan(plan, input) {
        plan = plan || {};
        input = input || {};
        var newRoute = input.newRoute || {};
        var sections = buildRouteMapUpdateStateApplySectionsPlan(plan);
        var speedReset = buildRouteMapUpdateSpeedLimitResetPlan(plan);
        var progress = buildRouteMapUpdateProgressResetPlan(plan);
        var post = buildRouteMapUpdatePostApplyPlan(plan, input);

        return {
            maneuvers: sections.applyManeuvers ? {
                steps: plan.maneuvers.steps,
                logMessage: plan.maneuvers.logMessage,
            } : null,
            vehicleMarkerReset: sections.vehicleMarkerReset,
            speedLimitReset: speedReset,
            progress: progress,
            roadNameReset: sections.roadNameReset,
            navigationArrivalReset: sections.navigationArrivalReset,
            deviation: sections.deviation,
            post: post,
            lastCalculatedRoutePatch: plan.lastCalculatedRoutePatch,
            tripInfo: post.updateTripInfo ? {
                distance_km: newRoute.distance_km,
                duration_minutes: newRoute.duration_minutes,
                fuel_cost: newRoute.fuel_cost,
                toll_cost: newRoute.toll_cost,
            } : null,
        };
    }

    var api = {
        DEFAULTS: DEFAULTS,
        normalizeAccuracy: normalizeAccuracy,
        isTrustworthyAccuracy: isTrustworthyAccuracy,
        effectiveDeviationThreshold: effectiveDeviationThreshold,
        decideRouteDeviation: decideRouteDeviation,
        buildRouteDeviationTickInputsPlan: buildRouteDeviationTickInputsPlan,
        buildRouteDeviationTickPlan: buildRouteDeviationTickPlan,
        buildRouteDeviationApplyPlan: buildRouteDeviationApplyPlan,
        buildRouteDeviationStateApplyPlan: buildRouteDeviationStateApplyPlan,
        buildRerouteLogEvent: buildRerouteLogEvent,
        appendRerouteLogEntry: appendRerouteLogEntry,
        buildRerouteLogSettingsSnapshot: buildRerouteLogSettingsSnapshot,
        recordAutomaticRerouteLog: recordAutomaticRerouteLog,
        REROUTE_FAILURE_RETRY_DELAYS_MS: REROUTE_FAILURE_RETRY_DELAYS_MS,
        REROUTE_ANNOUNCE_MIN_INTERVAL_MS: REROUTE_ANNOUNCE_MIN_INTERVAL_MS,
        buildRerouteFailureRetryPlan: buildRerouteFailureRetryPlan,
        shouldSkipRerouteTrigger: shouldSkipRerouteTrigger,
        automaticRerouteSkipLogMessage: automaticRerouteSkipLogMessage,
        buildAutomaticRerouteTriggerPlan: buildAutomaticRerouteTriggerPlan,
        formatDeviationDistanceDisplay: formatDeviationDistanceDisplay,
        buildDeviationRerouteNotification: buildDeviationRerouteNotification,
        shouldAnnounceRerouteVoice: shouldAnnounceRerouteVoice,
        buildRerouteVoiceMessage: buildRerouteVoiceMessage,
        buildRerouteSuccessNotificationPlan: buildRerouteSuccessNotificationPlan,
        buildAutomaticRerouteGuardPlan: buildAutomaticRerouteGuardPlan,
        pickRerouteRouteFromResponse: pickRerouteRouteFromResponse,
        routeSourcesMatch: routeSourcesMatch,
        normalizeRouteSourceKey: normalizeRouteSourceKey,
        buildAutomaticRerouteOutcomePlan: buildAutomaticRerouteOutcomePlan,
        buildAutomaticRerouteErrorPlan: buildAutomaticRerouteErrorPlan,
        buildAutomaticRerouteResultApplyPlan: buildAutomaticRerouteResultApplyPlan,
        POST_REROUTE_GRACE_MS: POST_REROUTE_GRACE_MS,
        resolveRouteManeuversFromPayload: resolveRouteManeuversFromPayload,
        buildRouteMapUpdateStatePlan: buildRouteMapUpdateStatePlan,
        buildUpdateRouteOnMapExecutePlan: buildUpdateRouteOnMapExecutePlan,
        buildRouteMapUpdatePostApplyPlan: buildRouteMapUpdatePostApplyPlan,
        buildRouteMapUpdateStateApplySectionsPlan: buildRouteMapUpdateStateApplySectionsPlan,
        buildRouteMapUpdateSpeedLimitResetPlan: buildRouteMapUpdateSpeedLimitResetPlan,
        buildRouteMapUpdateProgressResetPlan: buildRouteMapUpdateProgressResetPlan,
        buildRouteMapUpdateStateExecutePlan: buildRouteMapUpdateStateExecutePlan,
        ROUTE_API_PATH: ROUTE_API_PATH,
        buildAutomaticRerouteFetchOrchestrationPlan: buildAutomaticRerouteFetchOrchestrationPlan,
        buildAutomaticRerouteTriggerExecutePlan: buildAutomaticRerouteTriggerExecutePlan,
        buildAutomaticRerouteResponsePlans: buildAutomaticRerouteResponsePlans,
        buildAutomaticRerouteErrorResponsePlans: buildAutomaticRerouteErrorResponsePlans,
        buildAutomaticRerouteResultExecutePlan: buildAutomaticRerouteResultExecutePlan,
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Namespace global for the classic browser script (voyagr-app.js). Intentionally does
    // NOT expose bare function names, to avoid clobbering the monolith's own declarations.
    root.VoyagrRerouteDecision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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

    var TRAFFIC_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
    var AUTO_TRAFFIC_UPDATE_STORAGE_KEY = 'autoTrafficUpdate';
    var AUTO_TRAFFIC_UPDATE_TOGGLE_ID = 'autoTrafficUpdateToggle';
    var AUTO_REROUTE_DEVIATION_STORAGE_KEY = 'autoRerouteOnDeviation';
    var AUTO_REROUTE_DEVIATION_TOGGLE_ID = 'autoRerouteDeviationToggle';

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

    /**
     * Dispatch plan for starting automatic traffic updates during navigation.
     * @param {Object} [opts]
     * @param {boolean} [opts.autoTrafficUpdateEnabled]
     * @param {*} [opts.trafficUpdateInterval]
     * @returns {Object}
     */
    function buildStartAutoTrafficUpdatesDispatchPlan(opts) {
        opts = opts || {};
        if (!opts.autoTrafficUpdateEnabled || opts.trafficUpdateInterval) {
            return { shouldStart: false };
        }
        return {
            shouldStart: true,
            intervalMs: TRAFFIC_UPDATE_INTERVAL_MS,
            immediateCheck: true,
            logMessage: '[Auto-Traffic] Starting automatic traffic updates (every 5 minutes)',
        };
    }

    /**
     * Tick plan for the auto-traffic interval callback.
     * @param {Object} [opts]
     * @param {boolean} [opts.routeInProgress]
     * @param {boolean} [opts.autoTrafficUpdateEnabled]
     * @returns {Object}
     */
    function buildAutoTrafficIntervalTickPlan(opts) {
        opts = opts || {};
        return {
            shouldCheck: !!(opts.routeInProgress && opts.autoTrafficUpdateEnabled),
        };
    }

    /**
     * Dispatch plan for stopping automatic traffic updates.
     * @param {*} [trafficUpdateInterval]
     * @returns {Object}
     */
    function buildStopAutoTrafficUpdatesDispatchPlan(trafficUpdateInterval) {
        if (!trafficUpdateInterval) {
            return { shouldStop: false };
        }
        return {
            shouldStop: true,
            logMessage: '[Auto-Traffic] Stopped automatic traffic updates',
        };
    }

    /**
     * Orchestration plan for starting automatic traffic updates during navigation.
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildStartAutoTrafficUpdatesOrchestrationPlan(opts) {
        var dispatch = buildStartAutoTrafficUpdatesDispatchPlan(opts);
        if (!dispatch.shouldStart) {
            return { shouldStart: false };
        }
        return {
            shouldStart: true,
            dispatch: dispatch,
        };
    }

    /**
     * Orchestration plan for stopping automatic traffic updates.
     * @param {*} [trafficUpdateInterval]
     * @returns {Object}
     */
    function buildStopAutoTrafficUpdatesOrchestrationPlan(trafficUpdateInterval) {
        var dispatch = buildStopAutoTrafficUpdatesDispatchPlan(trafficUpdateInterval);
        return {
            shouldStop: dispatch.shouldStop,
            dispatch: dispatch,
            clearInterval: dispatch.shouldStop,
            resetIntervalHandle: dispatch.shouldStop,
        };
    }

    /**
     * Status plan for manual traffic update button handler.
     * @param {string} phase - 'start' | 'complete'
     * @returns {Object}
     */
    function buildManualTrafficUpdateStatusPlan(phase) {
        if (phase === 'start') {
            return { statusMessage: '🚦 Updating traffic...', statusType: 'info' };
        }
        return { statusMessage: '🚦 Traffic updated', statusType: 'success' };
    }

    /**
     * Orchestration plan for updateTrafficConditions entry validation.
     * @param {Object|null|undefined} lastCalculatedRoute
     * @param {string} startLabel
     * @param {string} endLabel
     * @returns {Object}
     */
    function buildUpdateTrafficConditionsOrchestrationPlan(lastCalculatedRoute, startLabel, endLabel) {
        if (!lastCalculatedRoute) {
            return {
                shouldFetch: false,
                errorStatusMessage: 'No route calculated yet',
            };
        }
        return {
            shouldFetch: true,
            requestBody: { start: startLabel, end: endLabel },
            loadingStatusMessage: 'Checking traffic conditions...',
            loadingStatusType: 'info',
            apiPath: '/api/traffic-conditions',
            fetchErrorStatusMessage: 'Error updating traffic conditions',
            apiFailureStatusMessage: 'Could not fetch traffic data',
        };
    }

    /**
     * Dispatch plan after /api/traffic-conditions returns.
     * @param {Object|null} data
     * @param {Object} [orch]
     * @returns {Object}
     */
    function buildUpdateTrafficConditionsResponseDispatchPlan(data, orch) {
        orch = orch || {};
        if (data && data.success) {
            return { action: 'display', data: data };
        }
        return {
            action: 'failure',
            statusMessage: orch.apiFailureStatusMessage || 'Could not fetch traffic data',
            statusType: 'error',
        };
    }

    /**
     * Error plan when updateTrafficConditions fetch throws.
     * @param {Object} [orch]
     * @returns {Object}
     */
    function buildUpdateTrafficConditionsFetchErrorPlan(orch) {
        orch = orch || {};
        return {
            statusMessage: orch.fetchErrorStatusMessage || 'Error updating traffic conditions',
            statusType: 'error',
            logPrefix: 'Traffic update error:',
        };
    }

    var TRAFFIC_MONITORING_INTERVAL_PROPERTY = 'trafficMonitoringInterval';
    var TRAFFIC_CONDITIONS_START_ELEMENT_ID = 'start';
    var TRAFFIC_CONDITIONS_END_ELEMENT_ID = 'end';

    /**
     * Runtime collect plan for traffic monitoring and conditions updates.
     * @returns {Object}
     */
    function buildTrafficMonitoringRuntimeCollectPlan() {
        return {
            intervalProperty: TRAFFIC_MONITORING_INTERVAL_PROPERTY,
            startElementId: TRAFFIC_CONDITIONS_START_ELEMENT_ID,
            endElementId: TRAFFIC_CONDITIONS_END_ELEMENT_ID,
        };
    }

    /**
     * Parse stored route duration minutes from mixed time fields.
     * @param {{ duration_minutes?: number, time?: string|number }|null|undefined} route
     * @returns {number}
     */
    function parseStoredRouteDurationMinutes(route) {
        route = route || {};
        var minutes = route.duration_minutes;
        if (minutes == null && route.time != null) {
            minutes = parseInt(route.time, 10);
        }
        return Number.isFinite(minutes) ? minutes : 0;
    }

    /**
     * Execute plan for applying a traffic-conditions API response to UI/state.
     * @param {Object} data
     * @param {Object} lastCalculatedRoute
     * @param {Object} fmt
     * @param {function(number): string} fmt.convertDistance
     * @param {string} fmt.distUnit
     * @param {string} [timeStr]
     * @returns {Object}
     */
    function buildDisplayTrafficUpdateExecutePlan(data, lastCalculatedRoute, fmt, timeStr) {
        data = data || {};
        fmt = fmt || {};
        lastCalculatedRoute = lastCalculatedRoute || {};
        var oldMinutes = parseStoredRouteDurationMinutes(lastCalculatedRoute);
        var newMinutes = data.updated_duration_minutes;
        var durationChanged = Number.isFinite(newMinutes) && newMinutes !== oldMinutes;
        var timeDiff = durationChanged ? newMinutes - oldMinutes : 0;
        var timeDiffStr = timeDiff > 0 ? '+' + timeDiff : String(timeDiff);
        var distanceKm = data.updated_distance_km || lastCalculatedRoute.distance_km;
        var distanceText = typeof fmt.convertDistance === 'function'
            ? fmt.convertDistance(distanceKm)
            : String(distanceKm);
        return {
            shouldUpdateStatusElement: true,
            trafficStatusElementId: 'trafficStatus',
            trafficStatusText: 'Last updated: ' + (timeStr || '') + ' | Conditions: ' + (data.traffic_level || ''),
            durationChanged: durationChanged,
            durationChangedStatusMessage: durationChanged
                ? 'Traffic update: Duration changed from ' + oldMinutes + ' to ' + newMinutes +
                    ' min (' + timeDiffStr + ' min)'
                : null,
            durationChangedStatusType: 'warning',
            unchangedStatusMessage: 'Traffic conditions: ' + (data.traffic_level || ''),
            unchangedStatusType: 'success',
            patchLastCalculatedRoute: {
                time: durationChanged ? newMinutes : lastCalculatedRoute.time,
                traffic_level: data.traffic_level,
                updated_at: new Date().toISOString(),
                distance_km: data.updated_distance_km || lastCalculatedRoute.distance_km,
            },
            lastRoutePatchMode: durationChanged ? 'merge' : 'mutate',
            mutateFieldKeys: durationChanged ? [] : ['traffic_level', 'updated_at'],
            detailsLogMessage: [
                '🚦 Traffic Level: ' + (data.traffic_level || ''),
                '📏 Distance: ' + distanceText + ' ' + (fmt.distUnit || ''),
                '⏱️ Duration: ' + newMinutes + ' minutes',
                '🚗 Congestion: ' + (data.congestion_percentage || 0) + '%',
                '⚠️ Incidents: ' + (data.incidents_count || 0),
            ].join('\n'),
            detailsLogPrefix: 'Traffic Update:',
        };
    }

    /**
     * Execute plan for starting periodic traffic condition polling.
     * @param {boolean} hasExistingInterval
     * @returns {Object}
     */
    function buildStartTrafficMonitoringExecutePlan(hasExistingInterval) {
        return {
            shouldStart: true,
            clearExistingInterval: !!hasExistingInterval,
            intervalMs: TRAFFIC_UPDATE_INTERVAL_MS,
            successStatusMessage: 'Traffic monitoring started',
            successStatusType: 'success',
        };
    }

    /**
     * Tick plan for the traffic monitoring interval callback.
     * @param {Object|null|undefined} lastCalculatedRoute
     * @param {string} startLabel
     * @returns {Object}
     */
    function buildTrafficMonitoringTickPlan(lastCalculatedRoute, startLabel) {
        return {
            shouldUpdate: !!(lastCalculatedRoute && startLabel),
        };
    }

    /**
     * Execute plan for stopping periodic traffic condition polling.
     * @param {boolean} hasInterval
     * @returns {Object}
     */
    function buildStopTrafficMonitoringExecutePlan(hasInterval) {
        if (!hasInterval) {
            return { shouldStop: false };
        }
        return {
            shouldStop: true,
            clearInterval: true,
            statusMessage: 'Traffic monitoring stopped',
            statusType: 'info',
        };
    }

    /**
     * Orchestration plan for applying a traffic-conditions API response.
     * @param {Object} data
     * @param {Object} lastCalculatedRoute
     * @param {Object} fmt
     * @param {string} [timeStr]
     * @returns {Object}
     */
    function buildDisplayTrafficUpdateOrchestrationPlan(data, lastCalculatedRoute, fmt, timeStr) {
        return {
            shouldApply: true,
            execute: buildDisplayTrafficUpdateExecutePlan(
                data,
                lastCalculatedRoute,
                fmt,
                timeStr
            ),
        };
    }

    /**
     * Orchestration plan for starting periodic traffic condition polling.
     * @param {boolean} hasExistingInterval
     * @returns {Object}
     */
    function buildStartTrafficMonitoringOrchestrationPlan(hasExistingInterval) {
        return {
            shouldStart: true,
            runtime: buildTrafficMonitoringRuntimeCollectPlan(),
            execute: buildStartTrafficMonitoringExecutePlan(hasExistingInterval),
        };
    }

    /**
     * Orchestration plan for stopping periodic traffic condition polling.
     * @param {boolean} hasInterval
     * @returns {Object}
     */
    function buildStopTrafficMonitoringOrchestrationPlan(hasInterval) {
        var execute = buildStopTrafficMonitoringExecutePlan(hasInterval);
        return {
            shouldStop: execute.shouldStop,
            runtime: buildTrafficMonitoringRuntimeCollectPlan(),
            execute: execute,
        };
    }

    /**
     * Toggle plan for enabling/disabling automatic traffic updates.
     * @param {boolean} currentEnabled
     * @returns {Object}
     */
    function buildAutoTrafficUpdateTogglePlan(currentEnabled) {
        var next = !currentEnabled;
        return {
            nextEnabled: next,
            storageKey: AUTO_TRAFFIC_UPDATE_STORAGE_KEY,
            storageValue: next ? 'true' : 'false',
            toggleElementId: AUTO_TRAFFIC_UPDATE_TOGGLE_ID,
            saveAllSettings: true,
            startUpdatesIfRouteInProgress: next,
            stopUpdates: !next,
            statusMessage: next
                ? '🚦 Auto-traffic updates enabled'
                : '🚦 Auto-traffic updates disabled',
            statusType: next ? 'success' : 'info',
        };
    }

    /**
     * Toggle plan for enabling/disabling automatic reroute on GPS deviation.
     * @param {boolean} currentEnabled
     * @returns {Object}
     */
    function buildAutoRerouteOnDeviationTogglePlan(currentEnabled) {
        var next = !currentEnabled;
        return {
            nextEnabled: next,
            storageKey: AUTO_REROUTE_DEVIATION_STORAGE_KEY,
            storageValue: next ? 'true' : 'false',
            toggleElementId: AUTO_REROUTE_DEVIATION_TOGGLE_ID,
            saveAllSettings: true,
            statusMessage: next
                ? '🔄 Auto-reroute on deviation enabled'
                : '🔄 Auto-reroute on deviation disabled',
            statusType: next ? 'success' : 'info',
        };
    }

    /**
     * Execute plan for toggling automatic traffic updates during navigation.
     * @param {boolean} currentEnabled
     * @param {boolean} [routeInProgress]
     * @returns {Object}
     */
    function buildAutoTrafficUpdateToggleExecutePlan(currentEnabled, routeInProgress) {
        var plan = buildAutoTrafficUpdateTogglePlan(currentEnabled);
        return {
            shouldApply: true,
            nextEnabled: plan.nextEnabled,
            storageKey: plan.storageKey,
            storageValue: plan.storageValue,
            toggle: {
                id: plan.toggleElementId,
                enabled: plan.nextEnabled,
            },
            saveAllSettings: plan.saveAllSettings,
            startAutoTrafficUpdates: plan.startUpdatesIfRouteInProgress && !!routeInProgress,
            stopAutoTrafficUpdates: plan.stopUpdates,
            statusMessage: plan.statusMessage,
            statusType: plan.statusType,
        };
    }

    /**
     * Execute plan for toggling automatic reroute on GPS deviation.
     * @param {boolean} currentEnabled
     * @returns {Object}
     */
    function buildAutoRerouteOnDeviationToggleExecutePlan(currentEnabled) {
        var plan = buildAutoRerouteOnDeviationTogglePlan(currentEnabled);
        return {
            shouldApply: true,
            nextEnabled: plan.nextEnabled,
            storageKey: plan.storageKey,
            storageValue: plan.storageValue,
            toggle: {
                id: plan.toggleElementId,
                enabled: plan.nextEnabled,
            },
            saveAllSettings: plan.saveAllSettings,
            statusMessage: plan.statusMessage,
            statusType: plan.statusType,
        };
    }

    /**
     * Init plan for auto-traffic, deviation reroute, and route-traffic toggles.
     * @param {Object} [opts]
     * @param {boolean} [opts.autoTrafficUpdateEnabled]
     * @param {boolean} [opts.autoRerouteOnDeviationEnabled]
     * @param {boolean} [opts.routeTrafficEnabled]
     * @param {string} [opts.routeTrafficToggleId]
     * @returns {Object}
     */
    function buildInitAutoTrafficRerouteTogglesPlan(opts) {
        opts = opts || {};
        return {
            toggles: [
                {
                    elementId: AUTO_TRAFFIC_UPDATE_TOGGLE_ID,
                    enabled: !!opts.autoTrafficUpdateEnabled,
                },
                {
                    elementId: AUTO_REROUTE_DEVIATION_TOGGLE_ID,
                    enabled: !!opts.autoRerouteOnDeviationEnabled,
                },
                {
                    elementId: opts.routeTrafficToggleId || 'routeTrafficToggle',
                    enabled: !!opts.routeTrafficEnabled,
                },
            ],
        };
    }

    /**
     * DOM apply plan for initialising auto-traffic and reroute toggles.
     * @param {Object} [initPlan] - from buildInitAutoTrafficRerouteTogglesPlan
     * @returns {Object}
     */
    function buildInitAutoTrafficRerouteTogglesApplyPlan(initPlan) {
        initPlan = initPlan || {};
        var toggles = initPlan.toggles || [];
        var standardToggles = [];
        for (var i = 0; i < toggles.length; i++) {
            var toggle = toggles[i] || {};
            standardToggles.push({
                id: toggle.elementId,
                enabled: !!toggle.enabled,
            });
        }
        return {
            shouldApply: standardToggles.length > 0,
            standardToggles: standardToggles,
        };
    }

    /**
     * Entry orchestration plan for updateTrafficConditions (runtime + validation).
     * @param {Object} [opts]
     * @param {Object|null|undefined} [opts.lastCalculatedRoute]
     * @param {string} [opts.startLabel]
     * @param {string} [opts.endLabel]
     * @returns {Object}
     */
    function buildUpdateTrafficConditionsEntryOrchestrationPlan(opts) {
        opts = opts || {};
        var runtime = buildTrafficMonitoringRuntimeCollectPlan();
        var orch = buildUpdateTrafficConditionsOrchestrationPlan(
            opts.lastCalculatedRoute,
            opts.startLabel != null ? opts.startLabel : '',
            opts.endLabel != null ? opts.endLabel : ''
        );
        return Object.assign({ runtime: runtime }, orch);
    }

    /**
     * Apply plan after checkTrafficAndReroute orchestration resolves.
     * @param {Object} [orch] - from buildCheckTrafficAndRerouteOrchestrationPlan
     * @returns {Object}
     */
    function buildCheckTrafficAndRerouteApplyPlan(orch) {
        orch = orch || {};
        var base = {
            shouldApply: true,
            updateLastTrafficData: orch.updateLastTrafficData,
            logMessage: orch.logMessage,
            samplingLogMessage: '[Auto-Traffic] Sampling live traffic along route...',
            errorLogPrefix: '[Auto-Traffic] Error checking traffic:',
        };
        if (orch.action === 'reroute' && orch.notifPlan) {
            return Object.assign({}, base, {
                shouldReroute: true,
                notifPlan: orch.notifPlan,
            });
        }
        return Object.assign({}, base, { shouldReroute: false });
    }

    /**
     * Apply plan when a traffic-based reroute alternative is accepted.
     * @param {Object} [dispatch] - from buildTrafficRerouteApiResponseDispatchPlan
     * @returns {Object}
     */
    function buildTriggerTrafficBasedRerouteAcceptApplyPlan(dispatch) {
        dispatch = dispatch || {};
        if (dispatch.action !== 'accept' || !dispatch.acceptPlan) {
            return {
                shouldApply: false,
                logMessage: dispatch.logMessage,
            };
        }
        var acceptPlan = dispatch.acceptPlan;
        return {
            shouldApply: true,
            newRoute: dispatch.newRoute,
            clearTrafficCache: !!acceptPlan.clearTrafficCache,
            clearLastTrafficData: !!acceptPlan.clearLastTrafficData,
            notificationTitle: acceptPlan.notificationTitle,
            notificationMessage: acceptPlan.notificationMessage,
            notificationType: acceptPlan.notificationType,
            voiceMessage: acceptPlan.voiceMessage,
            speakPriority: 'high',
        };
    }

    var TRAFFIC_REROUTE_API_PATH = '/api/route';

    /**
     * Log plan when a traffic reroute cannot proceed.
     * @param {string} reason
     * @returns {Object}
     */
    function buildTrafficRerouteBlockedLogPlan(reason) {
        if (reason === 'no_destination') {
            return { logMessage: '[Auto-Traffic] No destination stored, cannot reroute' };
        }
        return { logMessage: '[Auto-Traffic] No route context, cannot reroute' };
    }

    /**
     * Orchestration plan before requesting a traffic-based reroute alternative.
     * @param {Object} [input]
     * @param {string} [input.changeType]
     * @param {number} [input.avoidPointCount]
     * @returns {Object}
     */
    function buildTrafficRerouteFetchOrchestrationPlan(input) {
        input = input || {};
        return {
            shouldFetch: true,
            apiPath: TRAFFIC_REROUTE_API_PATH,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            logMessage: '[Auto-Traffic] Calculating new route (reason: ' + (input.changeType || 'traffic')
                + ', avoid pts: ' + (input.avoidPointCount || 0) + ')...',
        };
    }

    /**
     * Dispatch plan after /api/route returns during traffic-based reroute.
     * @param {Object} [input]
     * @param {Object} [input.data]
     * @param {boolean} [input.isSevere]
     * @param {number} [input.oldBaseMinutes]
     * @param {number} [input.measuredDelayMin]
     * @returns {Object}
     */
    function buildTrafficRerouteApiResponseDispatchPlan(input) {
        input = input || {};
        var data = input.data || {};
        if (!data.success || !data.routes || !data.routes.length) {
            return { action: 'no_route' };
        }
        var newRoute = data.routes[0];
        var acceptPlan = buildTrafficRerouteAcceptancePlan({
            isSevere: !!input.isSevere,
            oldBaseMinutes: input.oldBaseMinutes || 0,
            measuredDelayMin: input.measuredDelayMin,
            newRouteMinutes: newRoute.duration_minutes,
        });
        if (acceptPlan.accept) {
            return {
                action: 'accept',
                newRoute: newRoute,
                acceptPlan: acceptPlan,
            };
        }
        return {
            action: 'reject',
            logMessage: '[Auto-Traffic] Alternative not significantly faster, keeping current route',
        };
    }

    /**
     * Orchestration plan after sampling traffic ahead during navigation.
     * @param {Object} [input]
     * @param {Object|null} [input.flow]
     * @param {Object|null} [input.lastTrafficData]
     * @returns {Object}
     */
    function buildCheckTrafficAndRerouteOrchestrationPlan(input) {
        input = input || {};
        var dispatch = buildTrafficSampleResponseDispatchPlan(input.flow);
        if (dispatch.action === 'none') {
            return { action: 'no_data', logMessage: '[Auto-Traffic] No usable traffic data' };
        }
        if (dispatch.action === 'update_last_traffic_only') {
            return {
                action: 'simulated_only',
                flow: dispatch.flow,
                updateLastTrafficData: dispatch.flow,
                logMessage: '[Auto-Traffic] Traffic data is simulated; skipping reroute decision',
            };
        }

        var changeType = detectSignificantTrafficChange(input.lastTrafficData, dispatch.flow);
        var notifPlan = buildTrafficChangeNotificationPlan(changeType, dispatch.flow);
        if (notifPlan.shouldReroute) {
            return {
                action: 'reroute',
                flow: dispatch.flow,
                updateLastTrafficData: dispatch.flow,
                changeType: changeType,
                notifPlan: notifPlan,
                logMessage: '[Auto-Traffic] Significant change: ' + changeType
                    + ' (delay ~' + (dispatch.flow.delayMin || 0).toFixed(1) + ' min, '
                    + (dispatch.flow.congestedPoints || []).length + ' avoid pts)',
            };
        }
        return {
            action: 'no_change',
            flow: dispatch.flow,
            updateLastTrafficData: dispatch.flow,
            logMessage: '[Auto-Traffic] No significant traffic change',
        };
    }

    var api = {
        TRAFFIC_UPDATE_INTERVAL_MS: TRAFFIC_UPDATE_INTERVAL_MS,
        AUTO_TRAFFIC_UPDATE_STORAGE_KEY: AUTO_TRAFFIC_UPDATE_STORAGE_KEY,
        AUTO_TRAFFIC_UPDATE_TOGGLE_ID: AUTO_TRAFFIC_UPDATE_TOGGLE_ID,
        AUTO_REROUTE_DEVIATION_STORAGE_KEY: AUTO_REROUTE_DEVIATION_STORAGE_KEY,
        AUTO_REROUTE_DEVIATION_TOGGLE_ID: AUTO_REROUTE_DEVIATION_TOGGLE_ID,
        detectSignificantTrafficChange: detectSignificantTrafficChange,
        computeEffectiveRouteMinutes: computeEffectiveRouteMinutes,
        computeTrafficRerouteTimeSaved: computeTrafficRerouteTimeSaved,
        shouldAcceptTrafficReroute: shouldAcceptTrafficReroute,
        formatTrafficRerouteSaveMessage: formatTrafficRerouteSaveMessage,
        buildCheckTrafficAndReroutePreflightPlan: buildCheckTrafficAndReroutePreflightPlan,
        buildCheckTrafficAndRerouteOrchestrationPlan: buildCheckTrafficAndRerouteOrchestrationPlan,
        buildTrafficSampleResponseDispatchPlan: buildTrafficSampleResponseDispatchPlan,
        buildTrafficChangeNotificationPlan: buildTrafficChangeNotificationPlan,
        buildTrafficReroutePreflightPlan: buildTrafficReroutePreflightPlan,
        buildTrafficRerouteBlockedLogPlan: buildTrafficRerouteBlockedLogPlan,
        buildTrafficRerouteFetchOrchestrationPlan: buildTrafficRerouteFetchOrchestrationPlan,
        buildTrafficRerouteApiResponseDispatchPlan: buildTrafficRerouteApiResponseDispatchPlan,
        buildTrafficRerouteAcceptancePlan: buildTrafficRerouteAcceptancePlan,
        buildStartAutoTrafficUpdatesDispatchPlan: buildStartAutoTrafficUpdatesDispatchPlan,
        buildStartAutoTrafficUpdatesOrchestrationPlan: buildStartAutoTrafficUpdatesOrchestrationPlan,
        buildAutoTrafficIntervalTickPlan: buildAutoTrafficIntervalTickPlan,
        buildStopAutoTrafficUpdatesDispatchPlan: buildStopAutoTrafficUpdatesDispatchPlan,
        buildStopAutoTrafficUpdatesOrchestrationPlan: buildStopAutoTrafficUpdatesOrchestrationPlan,
        buildManualTrafficUpdateStatusPlan: buildManualTrafficUpdateStatusPlan,
        buildUpdateTrafficConditionsOrchestrationPlan: buildUpdateTrafficConditionsOrchestrationPlan,
        buildUpdateTrafficConditionsResponseDispatchPlan: buildUpdateTrafficConditionsResponseDispatchPlan,
        buildUpdateTrafficConditionsFetchErrorPlan: buildUpdateTrafficConditionsFetchErrorPlan,
        TRAFFIC_MONITORING_INTERVAL_PROPERTY: TRAFFIC_MONITORING_INTERVAL_PROPERTY,
        TRAFFIC_CONDITIONS_START_ELEMENT_ID: TRAFFIC_CONDITIONS_START_ELEMENT_ID,
        TRAFFIC_CONDITIONS_END_ELEMENT_ID: TRAFFIC_CONDITIONS_END_ELEMENT_ID,
        buildTrafficMonitoringRuntimeCollectPlan: buildTrafficMonitoringRuntimeCollectPlan,
        parseStoredRouteDurationMinutes: parseStoredRouteDurationMinutes,
        buildDisplayTrafficUpdateExecutePlan: buildDisplayTrafficUpdateExecutePlan,
        buildDisplayTrafficUpdateOrchestrationPlan: buildDisplayTrafficUpdateOrchestrationPlan,
        buildStartTrafficMonitoringExecutePlan: buildStartTrafficMonitoringExecutePlan,
        buildStartTrafficMonitoringOrchestrationPlan: buildStartTrafficMonitoringOrchestrationPlan,
        buildTrafficMonitoringTickPlan: buildTrafficMonitoringTickPlan,
        buildStopTrafficMonitoringExecutePlan: buildStopTrafficMonitoringExecutePlan,
        buildStopTrafficMonitoringOrchestrationPlan: buildStopTrafficMonitoringOrchestrationPlan,
        buildAutoTrafficUpdateTogglePlan: buildAutoTrafficUpdateTogglePlan,
        buildAutoTrafficUpdateToggleExecutePlan: buildAutoTrafficUpdateToggleExecutePlan,
        buildAutoRerouteOnDeviationTogglePlan: buildAutoRerouteOnDeviationTogglePlan,
        buildAutoRerouteOnDeviationToggleExecutePlan: buildAutoRerouteOnDeviationToggleExecutePlan,
        buildInitAutoTrafficRerouteTogglesPlan: buildInitAutoTrafficRerouteTogglesPlan,
        buildInitAutoTrafficRerouteTogglesApplyPlan: buildInitAutoTrafficRerouteTogglesApplyPlan,
        buildUpdateTrafficConditionsEntryOrchestrationPlan: buildUpdateTrafficConditionsEntryOrchestrationPlan,
        buildCheckTrafficAndRerouteApplyPlan: buildCheckTrafficAndRerouteApplyPlan,
        buildTriggerTrafficBasedRerouteAcceptApplyPlan: buildTriggerTrafficBasedRerouteAcceptApplyPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTrafficChange = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * Tests for modules/navigation/traffic-change.js
 * Asserts the traffic-change predicate logic (no routing context needed).
 */
const TC = require('../modules/navigation/traffic-change.js');
const fn = TC.detectSignificantTrafficChange;

const snapshot = (overrides) => Object.assign(
    { severe: false, congestedPoints: [], delayMin: 0, congestedCount: 0 },
    overrides
);

describe('traffic-change module surface', () => {
    test('exposes detectSignificantTrafficChange', () => {
        expect(typeof TC.detectSignificantTrafficChange).toBe('function');
    });
});

describe('detectSignificantTrafficChange', () => {
    test('null current → false', () => {
        expect(fn(null, null)).toBe(false);
    });

    test('severe congestion with points → "severe"', () => {
        expect(fn(null, snapshot({ severe: true, congestedPoints: [{ lat: 1, lon: 2 }] }))).toBe('severe');
    });

    test('severe with no points → false', () => {
        expect(fn(null, snapshot({ severe: true, congestedPoints: [] }))).toBe(false);
    });

    test('delayMin >= 4 with points → "congestion"', () => {
        expect(fn(null, snapshot({ delayMin: 4, congestedPoints: [{ lat: 1, lon: 2 }] }))).toBe('congestion');
    });

    test('delayMin < 4 on first sample → false', () => {
        expect(fn(null, snapshot({ delayMin: 3, congestedPoints: [{ lat: 1, lon: 2 }] }))).toBe(false);
    });

    test('delay jump >= 3 vs previous → "congestion"', () => {
        const prev = snapshot({ delayMin: 1 });
        const curr = snapshot({ delayMin: 5, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe('congestion');
    });

    test('delay jump < 3 vs previous → false (absolute check also < 4)', () => {
        // delayMin stays under the absolute threshold (4) so only the relative check fires.
        const prev = snapshot({ delayMin: 1 });
        const curr = snapshot({ delayMin: 3.5, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe(false);
    });

    test('congestedCount grew by > 1 → "congestion"', () => {
        const prev = snapshot({ congestedCount: 1 });
        const curr = snapshot({ congestedCount: 3, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe('congestion');
    });

    test('congestedCount grew by 1 → false', () => {
        const prev = snapshot({ congestedCount: 2 });
        const curr = snapshot({ congestedCount: 3, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe(false);
    });

    test('all conditions benign → false', () => {
        expect(fn(snapshot({ delayMin: 1 }), snapshot({ delayMin: 2 }))).toBe(false);
    });
});

describe('traffic reroute acceptance helpers', () => {
    test('computeTrafficRerouteTimeSaved includes measured delay', () => {
        expect(TC.computeTrafficRerouteTimeSaved(20, 5, 18)).toBe(7);
    });

    test('shouldAcceptTrafficReroute accepts severe regardless of savings', () => {
        expect(TC.shouldAcceptTrafficReroute(true, 0)).toBe(true);
    });

    test('shouldAcceptTrafficReroute requires 2+ minute savings otherwise', () => {
        expect(TC.shouldAcceptTrafficReroute(false, 1.9)).toBe(false);
        expect(TC.shouldAcceptTrafficReroute(false, 2)).toBe(true);
    });

    test('formatTrafficRerouteSaveMessage rounds positive savings', () => {
        expect(TC.formatTrafficRerouteSaveMessage(3.2)).toBe('Saves about 3 minutes.');
        expect(TC.formatTrafficRerouteSaveMessage(0)).toBe('');
    });
});

describe('traffic reroute dispatch plans', () => {
    test('buildCheckTrafficAndReroutePreflightPlan requires active navigation', () => {
        expect(TC.buildCheckTrafficAndReroutePreflightPlan({ routeInProgress: false, currentLat: 1, currentLon: 2 }).shouldCheck)
            .toBe(false);
        expect(TC.buildCheckTrafficAndReroutePreflightPlan({ routeInProgress: true, currentLat: 1, currentLon: 2 }).shouldCheck)
            .toBe(true);
        expect(TC.buildCheckTrafficAndReroutePreflightPlan({ routeInProgress: true, currentLat: 1, currentLon: 2 }).forceFresh)
            .toBe(true);
    });

    test('buildTrafficSampleResponseDispatchPlan skips simulated traffic', () => {
        expect(TC.buildTrafficSampleResponseDispatchPlan(null).action).toBe('none');
        expect(TC.buildTrafficSampleResponseDispatchPlan({ source: 'simulated' }).action)
            .toBe('update_last_traffic_only');
        expect(TC.buildTrafficSampleResponseDispatchPlan({ source: 'TomTom' }).action)
            .toBe('evaluate_change');
    });

    test('buildTrafficChangeNotificationPlan maps severe vs congestion messages', () => {
        const severe = TC.buildTrafficChangeNotificationPlan('severe', {
            congestedPoints: [{ lat: 1, lon: 2 }],
            delayMin: 6,
        });
        expect(severe.shouldReroute).toBe(true);
        expect(severe.notificationMessage).toContain('Severe congestion');

        const none = TC.buildTrafficChangeNotificationPlan(false, {});
        expect(none.shouldReroute).toBe(false);
    });

    test('buildTrafficReroutePreflightPlan requires destination and route context', () => {
        expect(TC.buildTrafficReroutePreflightPlan({ destination: null, lastCalculatedRoute: {} }).shouldReroute)
            .toBe(false);
        expect(TC.buildTrafficReroutePreflightPlan({ destination: '51,0', lastCalculatedRoute: null }).shouldReroute)
            .toBe(false);
        const ok = TC.buildTrafficReroutePreflightPlan({
            destination: '51,0',
            lastCalculatedRoute: {},
            changeType: 'severe',
        });
        expect(ok.shouldReroute).toBe(true);
        expect(ok.isSevere).toBe(true);
    });

    test('buildTrafficRerouteAcceptancePlan accepts severe or 2+ minute savings', () => {
        const severe = TC.buildTrafficRerouteAcceptancePlan({
            isSevere: true,
            oldBaseMinutes: 20,
            measuredDelayMin: 5,
            newRouteMinutes: 30,
        });
        expect(severe.accept).toBe(true);
        expect(severe.clearTrafficCache).toBe(true);
        expect(severe.voiceMessage).toContain('severe congestion');

        const marginal = TC.buildTrafficRerouteAcceptancePlan({
            isSevere: false,
            oldBaseMinutes: 20,
            measuredDelayMin: 0,
            newRouteMinutes: 19,
        });
        expect(marginal.accept).toBe(false);
        expect(marginal.notificationTitle).toBeNull();
    });
});

describe('auto traffic interval dispatch plans', () => {
    test('buildStartAutoTrafficUpdatesDispatchPlan requires enabled unset interval', () => {
        expect(TC.buildStartAutoTrafficUpdatesDispatchPlan({
            autoTrafficUpdateEnabled: false,
            trafficUpdateInterval: null,
        }).shouldStart).toBe(false);
        expect(TC.buildStartAutoTrafficUpdatesDispatchPlan({
            autoTrafficUpdateEnabled: true,
            trafficUpdateInterval: {},
        }).shouldStart).toBe(false);
        const plan = TC.buildStartAutoTrafficUpdatesDispatchPlan({
            autoTrafficUpdateEnabled: true,
            trafficUpdateInterval: null,
        });
        expect(plan.shouldStart).toBe(true);
        expect(plan.intervalMs).toBe(TC.TRAFFIC_UPDATE_INTERVAL_MS);
        expect(plan.immediateCheck).toBe(true);
    });

    test('buildAutoTrafficIntervalTickPlan checks route and setting', () => {
        expect(TC.buildAutoTrafficIntervalTickPlan({
            routeInProgress: true,
            autoTrafficUpdateEnabled: true,
        }).shouldCheck).toBe(true);
        expect(TC.buildAutoTrafficIntervalTickPlan({
            routeInProgress: false,
            autoTrafficUpdateEnabled: true,
        }).shouldCheck).toBe(false);
    });

    test('buildStopAutoTrafficUpdatesDispatchPlan only stops active interval', () => {
        expect(TC.buildStopAutoTrafficUpdatesDispatchPlan(null).shouldStop).toBe(false);
        expect(TC.buildStopAutoTrafficUpdatesDispatchPlan({}).shouldStop).toBe(true);
    });

    test('buildStartAutoTrafficUpdatesOrchestrationPlan wraps dispatch plan', () => {
        expect(TC.buildStartAutoTrafficUpdatesOrchestrationPlan({
            autoTrafficUpdateEnabled: false,
            trafficUpdateInterval: null,
        }).shouldStart).toBe(false);
        const orch = TC.buildStartAutoTrafficUpdatesOrchestrationPlan({
            autoTrafficUpdateEnabled: true,
            trafficUpdateInterval: null,
        });
        expect(orch.shouldStart).toBe(true);
        expect(orch.dispatch.immediateCheck).toBe(true);
    });

    test('buildStopAutoTrafficUpdatesOrchestrationPlan clears active interval', () => {
        expect(TC.buildStopAutoTrafficUpdatesOrchestrationPlan(null).shouldStop).toBe(false);
        const orch = TC.buildStopAutoTrafficUpdatesOrchestrationPlan({});
        expect(orch.shouldStop).toBe(true);
        expect(orch.clearInterval).toBe(true);
        expect(orch.resetIntervalHandle).toBe(true);
    });

    test('buildManualTrafficUpdateStatusPlan maps start and complete phases', () => {
        expect(TC.buildManualTrafficUpdateStatusPlan('start').statusMessage).toContain('Updating');
        expect(TC.buildManualTrafficUpdateStatusPlan('complete').statusType).toBe('success');
    });

    test('buildAutoTrafficUpdateTogglePlan flips state and maps storage/toggle ids', () => {
        const plan = TC.buildAutoTrafficUpdateTogglePlan(true);
        expect(plan.nextEnabled).toBe(false);
        expect(plan.storageKey).toBe(TC.AUTO_TRAFFIC_UPDATE_STORAGE_KEY);
        expect(plan.toggleElementId).toBe(TC.AUTO_TRAFFIC_UPDATE_TOGGLE_ID);
        expect(plan.stopUpdates).toBe(true);

        const enable = TC.buildAutoTrafficUpdateTogglePlan(false);
        expect(enable.nextEnabled).toBe(true);
        expect(enable.startUpdatesIfRouteInProgress).toBe(true);
        expect(enable.statusType).toBe('success');
    });

    test('buildAutoRerouteOnDeviationTogglePlan flips state and maps storage/toggle ids', () => {
        const plan = TC.buildAutoRerouteOnDeviationTogglePlan(true);
        expect(plan.nextEnabled).toBe(false);
        expect(plan.storageKey).toBe(TC.AUTO_REROUTE_DEVIATION_STORAGE_KEY);
        expect(plan.toggleElementId).toBe(TC.AUTO_REROUTE_DEVIATION_TOGGLE_ID);
        expect(plan.statusMessage).toContain('disabled');

        const enable = TC.buildAutoRerouteOnDeviationTogglePlan(false);
        expect(enable.nextEnabled).toBe(true);
        expect(enable.saveAllSettings).toBe(true);
        expect(enable.statusType).toBe('success');
    });

    test('buildAutoTrafficUpdateToggleExecutePlan gates start updates on route progress', () => {
        const enable = TC.buildAutoTrafficUpdateToggleExecutePlan(false, true);
        expect(enable.shouldApply).toBe(true);
        expect(enable.startAutoTrafficUpdates).toBe(true);
        expect(TC.buildAutoTrafficUpdateToggleExecutePlan(false, false).startAutoTrafficUpdates)
            .toBe(false);
        const disable = TC.buildAutoTrafficUpdateToggleExecutePlan(true, true);
        expect(disable.stopAutoTrafficUpdates).toBe(true);
    });

    test('buildAutoRerouteOnDeviationToggleExecutePlan wraps toggle apply spec', () => {
        const execute = TC.buildAutoRerouteOnDeviationToggleExecutePlan(false);
        expect(execute.shouldApply).toBe(true);
        expect(execute.toggle.enabled).toBe(true);
        expect(execute.saveAllSettings).toBe(true);
    });

    test('buildInitAutoTrafficRerouteTogglesPlan lists all three traffic toggles', () => {
        const plan = TC.buildInitAutoTrafficRerouteTogglesPlan({
            autoTrafficUpdateEnabled: true,
            autoRerouteOnDeviationEnabled: false,
            routeTrafficEnabled: true,
            routeTrafficToggleId: 'routeTrafficToggle',
        });
        expect(plan.toggles).toHaveLength(3);
        expect(plan.toggles[0].elementId).toBe(TC.AUTO_TRAFFIC_UPDATE_TOGGLE_ID);
        expect(plan.toggles[2].enabled).toBe(true);
    });

    test('buildInitAutoTrafficRerouteTogglesApplyPlan maps init toggles to standard toggle patches', () => {
        const apply = TC.buildInitAutoTrafficRerouteTogglesApplyPlan(
            TC.buildInitAutoTrafficRerouteTogglesPlan({
                autoTrafficUpdateEnabled: true,
                autoRerouteOnDeviationEnabled: false,
                routeTrafficEnabled: true,
            })
        );
        expect(apply.shouldApply).toBe(true);
        expect(apply.standardToggles).toHaveLength(3);
        expect(apply.standardToggles[1].id).toBe(TC.AUTO_REROUTE_DEVIATION_TOGGLE_ID);
        expect(apply.standardToggles[1].enabled).toBe(false);
    });

    test('buildUpdateTrafficConditionsEntryOrchestrationPlan bundles runtime and validation', () => {
        expect(TC.buildUpdateTrafficConditionsEntryOrchestrationPlan({
            lastCalculatedRoute: null,
            startLabel: 'A',
            endLabel: 'B',
        }).shouldFetch).toBe(false);

        const orch = TC.buildUpdateTrafficConditionsEntryOrchestrationPlan({
            lastCalculatedRoute: {},
            startLabel: 'Home',
            endLabel: 'Work',
        });
        expect(orch.shouldFetch).toBe(true);
        expect(orch.runtime.startElementId).toBe(TC.TRAFFIC_CONDITIONS_START_ELEMENT_ID);
        expect(orch.requestBody).toEqual({ start: 'Home', end: 'Work' });
    });

    test('buildCheckTrafficAndRerouteApplyPlan exposes reroute notification side effects', () => {
        const noReroute = TC.buildCheckTrafficAndRerouteApplyPlan({
            action: 'no_change',
            logMessage: '[Auto-Traffic] No significant traffic change',
        });
        expect(noReroute.shouldReroute).toBe(false);
        expect(noReroute.samplingLogMessage).toContain('Sampling');

        const reroute = TC.buildCheckTrafficAndRerouteApplyPlan({
            action: 'reroute',
            notifPlan: {
                shouldReroute: true,
                changeType: 'severe',
                avoidPoints: [{ lat: 1, lon: 2 }],
                measuredDelayMin: 5,
            },
        });
        expect(reroute.shouldReroute).toBe(true);
        expect(reroute.notifPlan.changeType).toBe('severe');
    });

    test('buildTriggerTrafficBasedRerouteAcceptApplyPlan maps accepted reroute notifications', () => {
        const reject = TC.buildTriggerTrafficBasedRerouteAcceptApplyPlan({
            action: 'reject',
            logMessage: 'keep current',
        });
        expect(reject.shouldApply).toBe(false);
        expect(reject.logMessage).toBe('keep current');

        const accept = TC.buildTriggerTrafficBasedRerouteAcceptApplyPlan({
            action: 'accept',
            newRoute: { duration_minutes: 12 },
            acceptPlan: {
                clearTrafficCache: true,
                clearLastTrafficData: true,
                notificationTitle: 'Reroute',
                notificationMessage: 'Faster route found',
                notificationType: 'info',
                voiceMessage: 'Rerouting',
            },
        });
        expect(accept.shouldApply).toBe(true);
        expect(accept.clearTrafficCache).toBe(true);
        expect(accept.voiceMessage).toBe('Rerouting');
    });

    test('buildUpdateTrafficConditionsOrchestrationPlan validates route presence', () => {
        expect(TC.buildUpdateTrafficConditionsOrchestrationPlan(null, 'A', 'B').shouldFetch).toBe(false);
        const orch = TC.buildUpdateTrafficConditionsOrchestrationPlan({}, 'A', 'B');
        expect(orch.shouldFetch).toBe(true);
        expect(orch.requestBody).toEqual({ start: 'A', end: 'B' });
    });

    test('buildDisplayTrafficUpdateExecutePlan compares normalized durations', () => {
        expect(TC.parseStoredRouteDurationMinutes({ time: '20 min' })).toBe(20);
        const changed = TC.buildDisplayTrafficUpdateExecutePlan(
            { updated_duration_minutes: 25, traffic_level: 'heavy', congestion_percentage: 10, incidents_count: 1 },
            { time: '20 min', distance_km: 10 },
            { convertDistance: (km) => String(km), distUnit: 'mi' },
            '12:00'
        );
        expect(changed.durationChanged).toBe(true);
        expect(changed.durationChangedStatusMessage).toContain('20');
        expect(changed.durationChangedStatusMessage).toContain('25');

        const same = TC.buildDisplayTrafficUpdateExecutePlan(
            { updated_duration_minutes: 20, traffic_level: 'light' },
            { time: '20 min' },
            {},
            '12:00'
        );
        expect(same.durationChanged).toBe(false);
        expect(same.lastRoutePatchMode).toBe('mutate');
        expect(same.mutateFieldKeys).toEqual(['traffic_level', 'updated_at']);
        expect(changed.lastRoutePatchMode).toBe('merge');
    });

    test('buildStartTrafficMonitoringExecutePlan clears existing interval and uses default cadence', () => {
        const start = TC.buildStartTrafficMonitoringExecutePlan(true);
        expect(start.shouldStart).toBe(true);
        expect(start.clearExistingInterval).toBe(true);
        expect(start.intervalMs).toBe(TC.TRAFFIC_UPDATE_INTERVAL_MS);

        const fresh = TC.buildStartTrafficMonitoringExecutePlan(false);
        expect(fresh.clearExistingInterval).toBe(false);
    });

    test('buildTrafficMonitoringTickPlan only updates when route and start are present', () => {
        expect(TC.buildTrafficMonitoringTickPlan(null, 'A').shouldUpdate).toBe(false);
        expect(TC.buildTrafficMonitoringTickPlan({}, '').shouldUpdate).toBe(false);
        expect(TC.buildTrafficMonitoringTickPlan({ distance_km: 10 }, 'Home').shouldUpdate).toBe(true);
    });

    test('buildStopTrafficMonitoringExecutePlan only stops active monitoring', () => {
        expect(TC.buildStopTrafficMonitoringExecutePlan(false).shouldStop).toBe(false);
        const stop = TC.buildStopTrafficMonitoringExecutePlan(true);
        expect(stop.shouldStop).toBe(true);
        expect(stop.clearInterval).toBe(true);
        expect(stop.statusMessage).toContain('stopped');
    });

    test('buildDisplayTrafficUpdateOrchestrationPlan wraps execute plan', () => {
        const orch = TC.buildDisplayTrafficUpdateOrchestrationPlan(
            { traffic_level: 'moderate', updated_duration_minutes: 30 },
            { time: 30 },
            { convertDistance: (km) => String(km), distUnit: 'km' },
            '12:00'
        );
        expect(orch.shouldApply).toBe(true);
        expect(orch.execute.trafficStatusText).toContain('moderate');
    });

    test('buildStartTrafficMonitoringOrchestrationPlan bundles runtime and execute', () => {
        const orch = TC.buildStartTrafficMonitoringOrchestrationPlan(true);
        expect(orch.shouldStart).toBe(true);
        expect(orch.runtime.intervalProperty).toBe(TC.TRAFFIC_MONITORING_INTERVAL_PROPERTY);
        expect(orch.execute.clearExistingInterval).toBe(true);
    });

    test('buildStopTrafficMonitoringOrchestrationPlan guards inactive monitoring', () => {
        expect(TC.buildStopTrafficMonitoringOrchestrationPlan(false).shouldStop).toBe(false);
        const orch = TC.buildStopTrafficMonitoringOrchestrationPlan(true);
        expect(orch.shouldStop).toBe(true);
        expect(orch.execute.clearInterval).toBe(true);
    });

    test('buildCheckTrafficAndRerouteOrchestrationPlan routes reroute and simulated data', () => {
        const none = TC.buildCheckTrafficAndRerouteOrchestrationPlan({ flow: null, lastTrafficData: null });
        expect(none.action).toBe('no_data');

        const simulated = TC.buildCheckTrafficAndRerouteOrchestrationPlan({
            flow: { source: 'sim', congestedPoints: [], delayMin: 0 },
            lastTrafficData: null,
        });
        expect(simulated.action).toBe('simulated_only');
        expect(simulated.updateLastTrafficData).toBeTruthy();

        const reroute = TC.buildCheckTrafficAndRerouteOrchestrationPlan({
            flow: {
                source: 'TomTom',
                severe: true,
                congestedPoints: [{ lat: 1, lon: 2 }],
                delayMin: 6,
                congestedCount: 2,
            },
            lastTrafficData: null,
        });
        expect(reroute.action).toBe('reroute');
        expect(reroute.notifPlan.shouldReroute).toBe(true);
    });

    test('buildTrafficRerouteFetchOrchestrationPlan and API response dispatch', () => {
        const fetchOrch = TC.buildTrafficRerouteFetchOrchestrationPlan({
            changeType: 'severe',
            avoidPointCount: 2,
        });
        expect(fetchOrch.apiPath).toBe('/api/route');
        expect(fetchOrch.logMessage).toContain('avoid pts: 2');

        const accept = TC.buildTrafficRerouteApiResponseDispatchPlan({
            data: { success: true, routes: [{ duration_minutes: 10 }] },
            isSevere: true,
            oldBaseMinutes: 25,
            measuredDelayMin: 5,
        });
        expect(accept.action).toBe('accept');

        const reject = TC.buildTrafficRerouteApiResponseDispatchPlan({
            data: { success: true, routes: [{ duration_minutes: 30 }] },
            isSevere: false,
            oldBaseMinutes: 20,
            measuredDelayMin: 2,
        });
        expect(reject.action).toBe('reject');
    });

    test('buildUpdateTrafficConditionsResponseDispatchPlan and monitoring runtime collect', () => {
        const orch = TC.buildUpdateTrafficConditionsOrchestrationPlan({}, 'A', 'B');
        const ok = TC.buildUpdateTrafficConditionsResponseDispatchPlan({ success: true }, orch);
        expect(ok.action).toBe('display');

        const fail = TC.buildUpdateTrafficConditionsResponseDispatchPlan({ success: false }, orch);
        expect(fail.action).toBe('failure');

        const runtime = TC.buildTrafficMonitoringRuntimeCollectPlan();
        expect(runtime.intervalProperty).toBe(TC.TRAFFIC_MONITORING_INTERVAL_PROPERTY);
        expect(runtime.startElementId).toBe('start');
    });
});

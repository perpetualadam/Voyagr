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
});

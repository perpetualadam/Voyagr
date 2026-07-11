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
});

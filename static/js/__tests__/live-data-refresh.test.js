/**
 * Tests for modules/navigation/live-data-refresh.js
 */
const LDR = require('../modules/navigation/live-data-refresh.js');

describe('live-data-refresh module', () => {
    test('exposes navigation refresh interval constants', () => {
        expect(LDR.REFRESH_INTERVALS.eta).toBe(30000);
        expect(LDR.REFRESH_INTERVALS.traffic_navigation).toBe(300000);
    });

    test('buildAdaptiveRefreshIntervalPlan scales down on low battery', () => {
        expect(LDR.buildAdaptiveRefreshIntervalPlan(30000, 1, true).intervalMs).toBe(30000);
        expect(LDR.buildAdaptiveRefreshIntervalPlan(30000, 0.1, true).intervalMs).toBe(90000);
        expect(LDR.buildAdaptiveRefreshIntervalPlan(30000, 0.25, true).intervalMs).toBe(60000);
        expect(LDR.buildAdaptiveRefreshIntervalPlan(30000, 0.4, true).intervalMs).toBe(45000);
        expect(LDR.buildAdaptiveRefreshIntervalPlan(30000, 0.1, false).intervalMs).toBe(30000);
    });

    test('buildStartLiveDataRefreshExecutePlan requires active navigation', () => {
        expect(LDR.buildStartLiveDataRefreshExecutePlan({ routeInProgress: false }).shouldStart).toBe(false);
        const start = LDR.buildStartLiveDataRefreshExecutePlan({
            routeInProgress: true,
            batteryLevel: 0.1,
            hasBatteryApi: true,
        });
        expect(start.shouldStart).toBe(true);
        expect(start.intervals.eta).toBe(90000);
        expect(start.timerActions.hazard).toBe('processNavigationHazardAlerts');
    });

    test('buildStopLiveDataRefreshExecutePlan lists timer keys', () => {
        const stop = LDR.buildStopLiveDataRefreshExecutePlan();
        expect(stop.shouldStop).toBe(true);
        expect(stop.timerKeys).toContain('traffic');
        expect(stop.timerKeys).toContain('hazard');
    });

    test('buildRefreshTrafficDataPreflightPlan and notification plan', () => {
        expect(LDR.buildRefreshTrafficDataPreflightPlan({ routeInProgress: false }).shouldFetch).toBe(false);
        const preflight = LDR.buildRefreshTrafficDataPreflightPlan({
            routeInProgress: true,
            lat: 51.5,
            lon: -0.1,
        });
        expect(preflight.shouldFetch).toBe(true);
        expect(preflight.url).toContain('traffic-patterns');

        expect(LDR.buildRefreshTrafficDataNotificationPlan({
            success: true,
            patterns: [{ congestion: 2 }],
        }).shouldNotify).toBe(false);
        const notify = LDR.buildRefreshTrafficDataNotificationPlan({
            success: true,
            patterns: [{ congestion: 4 }],
        });
        expect(notify.shouldNotify).toBe(true);
        expect(notify.notification.message).toContain('Congestion: 4/5');
    });

    test('buildRefreshWeatherDataPreflightPlan and notification plan', () => {
        expect(LDR.buildRefreshWeatherDataPreflightPlan({}).shouldFetch).toBe(false);
        const preflight = LDR.buildRefreshWeatherDataPreflightPlan({ lat: 51.5, lon: -0.1 });
        expect(preflight.url).toContain('/api/weather');

        expect(LDR.buildRefreshWeatherDataNotificationPlan({
            success: true,
            description: 'Clear skies',
        }).shouldNotify).toBe(false);
        const notify = LDR.buildRefreshWeatherDataNotificationPlan({
            success: true,
            description: 'Heavy rain',
        });
        expect(notify.shouldNotify).toBe(true);
        expect(notify.notification.title).toContain('Weather');
    });
});

/**
 * Tests for modules/navigation/eta.js
 */
const ETA = require('../modules/navigation/eta.js');
const RG = require('../modules/navigation/route-geometry.js');

describe('eta module surface', () => {
    test('exposes formatRemainingTime, buildETAVoiceMessage, and formatETATime', () => {
        expect(typeof ETA.formatRemainingTime).toBe('function');
        expect(typeof ETA.buildETAVoiceMessage).toBe('function');
        expect(typeof ETA.formatETATime).toBe('function');
        expect(typeof ETA.computeBaseNavigationETAMinutes).toBe('function');
    });
});

describe('formatRemainingTime', () => {
    test('< 1 min → "<1 min"', () => expect(ETA.formatRemainingTime(0.5)).toBe('<1 min'));
    test('whole minutes < 60', () => expect(ETA.formatRemainingTime(45)).toBe('45 min'));
    test('fractional rounds correctly', () => expect(ETA.formatRemainingTime(44.6)).toBe('45 min'));
    test('exactly 60 min → "1h"', () => expect(ETA.formatRemainingTime(60)).toBe('1h'));
    test('90 min → "1h 30min"', () => expect(ETA.formatRemainingTime(90)).toBe('1h 30min'));
    test('120 min → "2h" (no trailing 0min)', () => expect(ETA.formatRemainingTime(120)).toBe('2h'));
    test('135.4 min → "2h 15min"', () => expect(ETA.formatRemainingTime(135.4)).toBe('2h 15min'));
});

describe('buildETAVoiceMessage', () => {
    test('≤ 60 min uses simple template', () => {
        const d = new Date(2026, 0, 1, 14, 5);  // 14:05
        expect(ETA.buildETAVoiceMessage(30, d)).toBe('You will arrive in 30 minutes at 14:05');
    });

    test('> 60 min uses hours-and-minutes template', () => {
        const d = new Date(2026, 0, 1, 16, 30);
        expect(ETA.buildETAVoiceMessage(90, d)).toBe('You will arrive in 1 hour and 30 minutes at 16:30');
    });

    test('plural hours', () => {
        const d = new Date(2026, 0, 1, 18, 0);
        expect(ETA.buildETAVoiceMessage(130, d)).toBe('You will arrive in 2 hours and 10 minutes at 18:00');
    });

    test('single-digit minutes are zero-padded, hour is not (matching original)', () => {
        const d = new Date(2026, 0, 1, 9, 5);
        // Original: `${etaHours}:${String(etaMinutes).padStart(2,'0')}` → "9:05"
        expect(ETA.buildETAVoiceMessage(5, d)).toContain('9:05');
    });
});

describe('formatETATime', () => {
    test('24-hour format zero-pads hours and minutes', () => {
        const d = new Date(2026, 0, 1, 9, 5);
        expect(ETA.formatETATime(d, true)).toBe('09:05');
    });

    test('12-hour format uses AM/PM', () => {
        const d = new Date(2026, 0, 1, 14, 30);
        expect(ETA.formatETATime(d, false)).toBe('2:30 PM');
    });

    test('defaults to 24-hour when use24Hour omitted', () => {
        const d = new Date(2026, 0, 1, 23, 0);
        expect(ETA.formatETATime(d)).toBe('23:00');
    });
});

describe('traffic-aware ETA helpers', () => {
    function mockStorage(map) {
        return {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
            setItem: (k, v) => { map[k] = v; },
        };
    }

    test('ensureDefaultTrafficAwareRouting sets true when unset', () => {
        const map = {};
        const storage = mockStorage(map);
        ETA.ensureDefaultTrafficAwareRouting(storage);
        expect(map.pref_trafficAwareRouting).toBe('true');
    });

    test('shouldApplyTrafficAwareETA is false when pref is false', () => {
        const storage = mockStorage({ pref_trafficAwareRouting: 'false' });
        expect(ETA.shouldApplyTrafficAwareETA(storage, 'auto')).toBe(false);
    });

    test('shouldApplyTrafficAwareETA is false for non-auto routing mode', () => {
        const storage = mockStorage({ pref_trafficAwareRouting: 'true' });
        expect(ETA.shouldApplyTrafficAwareETA(storage, 'pedestrian')).toBe(false);
    });

    test('shouldApplyTrafficAwareETA is true for auto with default pref', () => {
        const storage = mockStorage({});
        expect(ETA.shouldApplyTrafficAwareETA(storage, 'auto')).toBe(true);
    });

    test('normalizeRouteDurationMinutes reads duration_minutes', () => {
        expect(ETA.normalizeRouteDurationMinutes({ duration_minutes: 42 })).toBe(42);
    });

    test('normalizeRouteDurationMinutes converts seconds-like values over 1440', () => {
        expect(ETA.normalizeRouteDurationMinutes({ time: '5400' })).toBe(90);
    });

    test('applyTrafficRatioToBaseRemaining scales by cached ratio', () => {
        const snap = { trafficAdjustedMinutes: 30, baseAtTrafficFetch: 20, trafficFetchAt: 1000 };
        expect(ETA.applyTrafficRatioToBaseRemaining(20, snap, 50000, true)).toBe(30);
    });

    test('applyTrafficRatioToBaseRemaining skips stale traffic snapshot', () => {
        const snap = { trafficAdjustedMinutes: 30, baseAtTrafficFetch: 20, trafficFetchAt: 1000 };
        expect(ETA.applyTrafficRatioToBaseRemaining(20, snap, 200000, true)).toBe(20);
    });

    test('applyTrafficRatioToBaseRemaining passes through when traffic disabled', () => {
        expect(ETA.applyTrafficRatioToBaseRemaining(15, {}, 0, false)).toBe(15);
    });
});

describe('computeBaseNavigationETAMinutes', () => {
    const polyline = [
        [51.5, -0.1],
        [51.51, -0.1],
        [51.52, -0.1],
    ];

    test('returns null before navigation starts', () => {
        expect(ETA.computeBaseNavigationETAMinutes({
            routeInProgress: false,
            lastCalculatedRoute: {},
            polyline: polyline,
            originalDurationMinutes: 30,
            userHasStartedMoving: false,
            routeGeometry: RG,
        })).toBeNull();
    });

    test('uses full duration when user has not started moving', () => {
        const result = ETA.computeBaseNavigationETAMinutes({
            routeInProgress: true,
            lastCalculatedRoute: { duration_minutes: 30 },
            polyline: polyline,
            originalDurationMinutes: 30,
            userHasStartedMoving: false,
            routeGeometry: RG,
        });
        expect(result.timeRemainingMinutes).toBe(30);
        expect(result.progressPercent).toBe(0);
    });

    test('reduces remaining time when user is partway along route', () => {
        const result = ETA.computeBaseNavigationETAMinutes({
            routeInProgress: true,
            lastCalculatedRoute: { duration_minutes: 30 },
            polyline: polyline,
            originalDurationMinutes: 30,
            userHasStartedMoving: true,
            currentLat: 51.515,
            currentLon: -0.1,
            lastSnappedRouteIndex: 0,
            routeGeometry: RG,
        });
        expect(result.timeRemainingMinutes).toBeLessThan(30);
        expect(result.progressPercent).toBeGreaterThan(0);
    });
});

describe('journey and traffic panel helpers', () => {
    test('computeJourneyRemainingTimeMinutes uses full duration pre-movement', () => {
        expect(ETA.computeJourneyRemainingTimeMinutes({
            lastCalculatedRoute: { distance_km: 10 },
            routeDurationMin: 20,
            userHasStartedMoving: false,
            remainingDistanceMeters: 5000,
            polylineTotalM: 10000,
        })).toBe(20);
    });

    test('computeJourneyRemainingTimeMinutes scales with progress when moving', () => {
        const mins = ETA.computeJourneyRemainingTimeMinutes({
            lastCalculatedRoute: { distance_km: 10 },
            routeDurationMin: 20,
            userHasStartedMoving: true,
            remainingDistanceMeters: 5000,
            polylineTotalM: 10000,
        });
        expect(mins).toBe(10);
    });

    test('estimateRemainingTimeFromDistance uses 50 km/h fallback', () => {
        expect(ETA.estimateRemainingTimeFromDistance(50000)).toBeCloseTo(60, 5);
    });

    test('shouldRefreshNavTrafficETA respects interval unless forced', () => {
        expect(ETA.shouldRefreshNavTrafficETA(20000, 10000, 12000, false, true)).toBe(false);
        expect(ETA.shouldRefreshNavTrafficETA(25000, 10000, 12000, false, true)).toBe(true);
        expect(ETA.shouldRefreshNavTrafficETA(11000, 10000, 12000, true, true)).toBe(true);
    });

    test('buildTrafficSnapshotFromFlow maps TomTom flow to snapshot fields', () => {
        const snap = ETA.buildTrafficSnapshotFromFlow(20, {
            source: 'TomTom',
            delayMin: 5,
            severe: true,
            avgCongestion: 72,
        }, 1000);
        expect(snap.trafficAdjustedMinutes).toBe(25);
        expect(snap.trafficLevel).toBe('Heavy');
        expect(snap.congestionPercent).toBe(72);
        expect(snap.baseAtTrafficFetch).toBe(20);
    });

    test('buildTrafficSnapshotFromFlow returns null for non-TomTom data', () => {
        expect(ETA.buildTrafficSnapshotFromFlow(20, { source: 'simulated' }, 1000)).toBeNull();
    });

    test('buildTrafficStatusLine shows updating when traffic enabled but no level yet', () => {
        expect(ETA.buildTrafficStatusLine(true, null, null)).toBe('Traffic: updating…');
    });

    test('buildTurnInfoETAPanelHtml includes ETA clock and progress', () => {
        const html = ETA.buildTurnInfoETAPanelHtml(15, 40, '14:30', 'Traffic: Light');
        expect(html).toContain('14:30');
        expect(html).toContain('15 min remaining (40% complete)');
        expect(html).toContain('Traffic: Light');
    });

    test('buildDestinationProgressPanelHtml shows distance and progress', () => {
        const html = ETA.buildDestinationProgressPanelHtml('3.2', 'mi', 62.4);
        expect(html).toContain('Distance to destination');
        expect(html).toContain('3.2 mi');
        expect(html).toContain('Route progress: 62%');
    });

    test('createEmptyNavETASnapshot returns zeroed navigation defaults', () => {
        expect(ETA.createEmptyNavETASnapshot()).toEqual({
            baseRemainingMinutes: 0,
            trafficAdjustedMinutes: null,
            trafficLevel: null,
            congestionPercent: null,
            progressPercent: 0,
            trafficFetchAt: 0,
            baseAtTrafficFetch: 0,
        });
    });
});

describe('journey summary helpers', () => {
    test('buildJourneySummaryBarApplyPlan formats distance time and ETA', () => {
        const plan = ETA.buildJourneySummaryBarApplyPlan({
            remainingDistanceMeters: 5000,
            distanceUnit: 'km',
            formatRemainingDistance: (m) => (m / 1000).toFixed(1) + ' km',
            lastCalculatedRoute: { distance_km: 10, duration_minutes: 20 },
            routeDurationMin: 20,
            userHasStartedMoving: true,
            polylineTotalM: 10000,
            applyTrafficRatio: (m) => m,
            use24HourFormat: true,
            now: Date.parse('2026-07-11T10:00:00.000Z'),
        });
        expect(plan.distanceText).toBe('5.0 km');
        expect(plan.timeText).toMatch(/min/);
        expect(plan.etaText).toBeTruthy();
        expect(plan.remainingTimeMinutes).toBe(10);
    });

    test('buildTraveledJourneyRoutePatch substitutes distance and time together', () => {
        const result = ETA.buildTraveledJourneyRoutePatch(
            { distance_km: 20, duration_minutes: 30 },
            8000,
            Date.now() - 15 * 60000
        );
        expect(result.patch).not.toBeNull();
        expect(result.patch.distance_km).toBe(8);
        expect(result.patch.duration_minutes).toBeGreaterThan(0);
        expect(result.avgSpeedKmh).toBeGreaterThan(0);
    });

    test('buildTraveledJourneyRoutePatch keeps planned values without real driven distance', () => {
        const result = ETA.buildTraveledJourneyRoutePatch(
            { distance_km: 20, duration_minutes: 30 },
            0,
            Date.now() - 5 * 60000
        );
        expect(result.patch).toBeNull();
        expect(result.avgSpeedKmh).toBeCloseTo(40, 0);
    });

    test('buildJourneySummaryModalApplyPlan formats modal values', () => {
        const plan = ETA.buildJourneySummaryModalApplyPlan(
            { distance_km: 15, duration_minutes: 28, total_cost: 12.5 },
            {
                traveledMeters: 0,
                navStartedAt: null,
                convertDistance: (km) => (km * 0.62).toFixed(1),
                distUnit: 'mi',
                convertSpeed: (kmh) => Math.round(kmh * 0.62),
                speedUnit: 'mph',
                currencySymbol: '£',
                adjustCost: (c) => c,
            }
        );
        expect(plan.visible).toBe(true);
        expect(plan.distanceText).toBe('9.3 mi');
        expect(plan.timeText).toBe('28 min');
        expect(plan.costText).toBe('£12.50');
        expect(plan.avgSpeedText).toMatch(/mph$/);
    });

    test('buildJourneySummaryModalApplyPlan returns not visible without route data', () => {
        expect(ETA.buildJourneySummaryModalApplyPlan(null, {})).toEqual({ visible: false });
    });

    test('buildJourneySummaryModalExecutePlan wraps modal element ids', () => {
        const execute = ETA.buildJourneySummaryModalExecutePlan({
            visible: true,
            distanceText: '10 km',
            timeText: '20 min',
            costText: '£5.00',
            avgSpeedText: '30 km/h',
        });
        expect(execute.shouldShow).toBe(true);
        expect(execute.elementIds.summaryDistance).toBe('summaryDistance');
        expect(execute.expandBottomSheet).toBe(true);
    });

    test('buildCloseJourneySummaryExecutePlan closes modal and returns to navigation', () => {
        const execute = ETA.buildCloseJourneySummaryExecutePlan();
        expect(execute.shouldClose).toBe(true);
        expect(execute.modalId).toBe('journeySummaryModal');
        expect(execute.switchTab).toBe('navigation');
        expect(execute.clearForm).toBe(true);
    });

    test('buildAnnounceETAIfNeededPlan gates on interval and route state', () => {
        expect(ETA.buildAnnounceETAIfNeededPlan({ routeInProgress: false }).action).toBe('skip');
        const interval = ETA.buildAnnounceETAIfNeededPlan({
            routeInProgress: true,
            hasRoute: true,
            voiceEnabled: true,
            now: 100_000,
            lastETAAnnouncementTime: 50_000,
            baseRemainingMinutes: 20,
            applyTrafficRatio: (m) => m,
        });
        expect(interval.action).toBe('skip');
        const announce = ETA.buildAnnounceETAIfNeededPlan({
            routeInProgress: true,
            hasRoute: true,
            voiceEnabled: true,
            now: 700_000,
            lastETAAnnouncementTime: 50_000,
            baseRemainingMinutes: 20,
            applyTrafficRatio: (m) => m,
        });
        expect(announce.action).toBe('announce');
        expect(announce.timeRemainingMinutes).toBe(20);
    });

    test('buildInitialETAMovementDeferPlan retries then skips', () => {
        const defer = ETA.buildInitialETAMovementDeferPlan({ hasStartedMoving: false, retries: 0 });
        expect(defer.action).toBe('defer');
        expect(defer.retries).toBe(1);
        const skip = ETA.buildInitialETAMovementDeferPlan({
            hasStartedMoving: false,
            retries: ETA.INITIAL_ETA_MOVEMENT_MAX_RETRIES,
        });
        expect(skip.action).toBe('skip');
        expect(ETA.buildInitialETAMovementDeferPlan({ hasStartedMoving: true }).action).toBe('proceed');
    });

    test('buildScheduleInitialETAAnnouncementPlan defaults nav-start delay', () => {
        const schedule = ETA.buildScheduleInitialETAAnnouncementPlan();
        expect(schedule.shouldSchedule).toBe(true);
        expect(schedule.delayMs).toBe(ETA.ETA_INITIAL_ANNOUNCE_DELAY_MS);
    });
});

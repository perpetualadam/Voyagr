/**
 * Behaviour tests for the real modules/navigation/reroute-decision.js module.
 * These assert the off-route / reroute decision rules the app must follow (accuracy gating,
 * accuracy-widened threshold, route-join gate, dwell timer, debounce), not a
 * re-implementation of them.
 */
const RD = require('../modules/navigation/reroute-decision.js');

const C = RD.DEFAULTS;

/** A confirmed-join, on-route, trustworthy baseline tick far from the destination. */
function tick(overrides) {
    return Object.assign({
        autoRerouteEnabled: true,
        hasRoute: true,
        remainingToDest: 5000,
        accuracy: 10,
        minDistance: 5,
        routeJoinConfirmed: true,
        deviationStartTime: null,
        lastRerouteTime: 0,
        lastRerouteAttemptTime: 0,
        offRouteStreak: 0,
        now: 1000000
    }, overrides || {});
}

describe('reroute-decision module surface', () => {
    test('exposes the expected pure functions and constants', () => {
        expect(typeof RD.normalizeAccuracy).toBe('function');
        expect(typeof RD.isTrustworthyAccuracy).toBe('function');
        expect(typeof RD.effectiveDeviationThreshold).toBe('function');
        expect(typeof RD.decideRouteDeviation).toBe('function');
        expect(RD.DEFAULTS.DEVIATION_THRESHOLD_METERS).toBe(50);
        expect(RD.DEFAULTS.DEVIATION_TIME_THRESHOLD_MS).toBe(10000);
    });
});

describe('normalizeAccuracy', () => {
    test('finite positive values pass through', () => {
        expect(RD.normalizeAccuracy(12.5)).toBe(12.5);
    });
    test('non-finite / non-positive become 0 (unknown)', () => {
        expect(RD.normalizeAccuracy(0)).toBe(0);
        expect(RD.normalizeAccuracy(-5)).toBe(0);
        expect(RD.normalizeAccuracy(NaN)).toBe(0);
        expect(RD.normalizeAccuracy(undefined)).toBe(0);
        expect(RD.normalizeAccuracy(Infinity)).toBe(0);
    });
});

describe('isTrustworthyAccuracy', () => {
    test('accepts fixes at/under the trust ceiling', () => {
        expect(RD.isTrustworthyAccuracy(65)).toBe(true);
        expect(RD.isTrustworthyAccuracy(10)).toBe(true);
        expect(RD.isTrustworthyAccuracy(0)).toBe(true); // unknown treated as 0
    });
    test('rejects fixes worse than the trust ceiling', () => {
        expect(RD.isTrustworthyAccuracy(66)).toBe(false);
        expect(RD.isTrustworthyAccuracy(120)).toBe(false);
    });
});

describe('effectiveDeviationThreshold', () => {
    test('base threshold with a perfect fix', () => {
        expect(RD.effectiveDeviationThreshold(0)).toBe(50);
    });
    test('widens by half the GPS error', () => {
        expect(RD.effectiveDeviationThreshold(40)).toBe(70); // 50 + 20
    });
    test('extra widening is capped', () => {
        // half of 200 = 100, capped at 40 -> 90
        expect(RD.effectiveDeviationThreshold(200)).toBe(50 + 40);
    });
});

describe('decideRouteDeviation — gating', () => {
    test('handles missing params object', () => {
        const d = RD.decideRouteDeviation();
        expect(d.action).toBe('disabled');
    });

    test('defaults non-finite offRouteStreak to zero', () => {
        const d = RD.decideRouteDeviation(tick({ offRouteStreak: NaN, minDistance: 5 }));
        expect(d.offRouteStreak).toBe(0);
        expect(d.action).toBe('on-route');
    });

    test('disabled when auto-reroute is off', () => {
        expect(RD.decideRouteDeviation(tick({ autoRerouteEnabled: false })).action).toBe('disabled');
    });
    test('no-route when there is no polyline', () => {
        expect(RD.decideRouteDeviation(tick({ hasRoute: false })).action).toBe('no-route');
    });
    test('suppressed near the destination', () => {
        expect(RD.decideRouteDeviation(tick({ remainingToDest: 80 })).action).toBe('near-destination');
    });
    test('untrusted accuracy is ignored', () => {
        expect(RD.decideRouteDeviation(tick({ accuracy: 100, minDistance: 500 })).action)
            .toBe('untrusted-accuracy');
    });
});

describe('decideRouteDeviation — route-join gate', () => {
    test('off-route fixes before joining the route just wait for a join', () => {
        const d = RD.decideRouteDeviation(tick({
            routeJoinConfirmed: false, minDistance: 500
        }));
        expect(d.action).toBe('awaiting-join');
        expect(d.routeJoinConfirmed).toBe(false);
        expect(d.deviationStartTime).toBeNull();
        expect(d.shouldReroute).toBe(false);
    });

    test('a near fix confirms the join and then evaluates on the same tick', () => {
        const d = RD.decideRouteDeviation(tick({
            routeJoinConfirmed: false, minDistance: 5
        }));
        expect(d.routeJoinConfirmed).toBe(true);
        expect(d.action).toBe('on-route');
    });
});

describe('decideRouteDeviation — deviation timing', () => {
    test('requires consecutive off-route ticks before starting dwell timer', () => {
        let streak = 0;
        let d = RD.decideRouteDeviation(tick({ minDistance: 120, offRouteStreak: streak }));
        expect(d.action).toBe('waiting');
        expect(d.deviationStartTime).toBeNull();
        streak = d.offRouteStreak;

        d = RD.decideRouteDeviation(tick({ minDistance: 120, offRouteStreak: streak }));
        expect(d.deviationStartTime).toBeNull();
        streak = d.offRouteStreak;

        d = RD.decideRouteDeviation(tick({ minDistance: 120, offRouteStreak: streak }));
        expect(d.action).toBe('waiting');
        expect(d.deviationStartTime).toBe(1000000);
        expect(d.shouldReroute).toBe(false);
    });

    test('still waiting before the dwell threshold elapses', () => {
        const start = 1000000;
        const d = RD.decideRouteDeviation(tick({
            minDistance: 120,
            deviationStartTime: start,
            offRouteStreak: 3,
            now: start + 9000
        }));
        expect(d.action).toBe('waiting');
        expect(d.deviationStartTime).toBe(start);
    });

    test('reroutes once deviated past threshold for long enough and debounce is clear', () => {
        const start = 1000000;
        const d = RD.decideRouteDeviation(tick({
            minDistance: 120,
            deviationStartTime: start,
            offRouteStreak: 3,
            now: start + 10000,
            lastRerouteTime: 0,
            lastRerouteAttemptTime: 0
        }));
        expect(d.action).toBe('reroute');
        expect(d.shouldReroute).toBe(true);
        expect(d.deviationStartTime).toBeNull();
        expect(d.lastRerouteAttemptTime).toBe(start + 10000);
        expect(d.lastRerouteTime).toBe(0);
        expect(d.deviationDuration).toBe(10000);
    });

    test('debounced when a reroute attempt fired too recently', () => {
        const start = 1000000;
        const now = start + 10000;
        const d = RD.decideRouteDeviation(tick({
            minDistance: 120,
            deviationStartTime: start,
            offRouteStreak: 3,
            now: now,
            lastRerouteAttemptTime: now - 1000
        }));
        expect(d.action).toBe('debounced');
        expect(d.shouldReroute).toBe(false);
        expect(d.deviationStartTime).toBe(start);
    });

    test('debounced when last reroute completion was too recent', () => {
        const start = 1000000;
        const now = start + 10000;
        const d = RD.decideRouteDeviation(tick({
            minDistance: 120,
            deviationStartTime: start,
            offRouteStreak: 3,
            now: now,
            lastRerouteTime: now - 1000,
            lastRerouteAttemptTime: 0,
        }));
        expect(d.action).toBe('debounced');
        expect(d.shouldReroute).toBe(false);
    });

    test('the accuracy-widened threshold keeps a noisy-but-on-road fix on route', () => {
        // 60 m off with a 40 m fix -> effective threshold 70 m, so not a deviation.
        const d = RD.decideRouteDeviation(tick({ minDistance: 60, accuracy: 40 }));
        expect(d.action).toBe('on-route');
        expect(d.effectiveThreshold).toBe(70);
    });
});

describe('decideRouteDeviation — back on route', () => {
    test('clears an in-progress deviation timer when back on route', () => {
        const d = RD.decideRouteDeviation(tick({ minDistance: 5, deviationStartTime: 999000 }));
        expect(d.action).toBe('on-route');
        expect(d.deviationStartTime).toBeNull();
    });
});

describe('decideRouteDeviation — custom constants', () => {
    test('honours overridden tuning constants', () => {
        const constants = Object.assign({}, C, { DEVIATION_TIME_THRESHOLD_MS: 2000 });
        const start = 1000000;
        const d = RD.decideRouteDeviation(tick({
            minDistance: 120, deviationStartTime: start, offRouteStreak: 3, now: start + 2500, constants: constants
        }));
        expect(d.action).toBe('reroute');
    });
});

describe('reroute log helpers', () => {
    test('buildRerouteLogEvent handles missing settings and falsey flags', () => {
        const partial = RD.buildRerouteLogEvent({
            timestampIso: '2026-07-11T12:00:00.000Z',
            route: { distance_km: 1, duration_minutes: 2 },
            settings: {},
        });
        expect(partial.type).toBe('automatic_reroute');
        expect(partial.settings.avoid_cameras).toBe(false);
        expect(partial.settings.avoid_tolls).toBe(false);
        expect(partial.settings.avoid_caz).toBe(false);

        const withFlags = RD.buildRerouteLogEvent({
            route: { distance_km: 1, duration_minutes: 2 },
            settings: { avoidCameras: true },
        });
        expect(withFlags.settings.avoid_cameras).toBe(true);
        expect(withFlags.settings.avoid_tolls).toBe(false);
    });

    test('buildRerouteLogEvent shapes analytics payload', () => {
        const event = RD.buildRerouteLogEvent({
            timestampIso: '2026-07-11T12:00:00.000Z',
            startLat: 51.5,
            startLon: -0.1,
            destination: '51.6,-0.2',
            route: { distance_km: 12, duration_minutes: 25 },
            hazardCount: 2,
            settings: { avoidCameras: true, avoidTolls: false, avoidCaz: true },
        });
        expect(event.type).toBe('automatic_reroute');
        expect(event.route.hazard_count).toBe(2);
        expect(event.settings.avoid_tolls).toBe(false);
    });

    test('appendRerouteLogEntry keeps only the most recent entries', () => {
        const map = { rerouteLog: '[]' };
        const storage = {
            getItem: (k) => map[k] || null,
            setItem: (k, v) => { map[k] = v; },
        };
        RD.appendRerouteLogEntry(storage, { id: 1 }, 2);
        RD.appendRerouteLogEntry(storage, { id: 2 }, 2);
        RD.appendRerouteLogEntry(storage, { id: 3 }, 2);
        const log = JSON.parse(map.rerouteLog);
        expect(log).toHaveLength(2);
        expect(log[0].id).toBe(2);
        expect(log[1].id).toBe(3);
    });

    test('appendRerouteLogEntry recovers from invalid stored JSON', () => {
        const map = { rerouteLog: 'not-json' };
        const storage = {
            getItem: (k) => map[k] || null,
            setItem: (k, v) => { map[k] = v; },
        };
        const log = RD.appendRerouteLogEntry(storage, { id: 1 }, 5);
        expect(log).toEqual([{ id: 1 }]);
    });

    test('appendRerouteLogEntry uses default max entries when omitted', () => {
        const map = { rerouteLog: '[]' };
        const storage = {
            getItem: (k) => map[k] || null,
            setItem: (k, v) => { map[k] = v; },
        };
        for (let i = 1; i <= 21; i++) {
            RD.appendRerouteLogEntry(storage, { id: i });
        }
        const log = JSON.parse(map.rerouteLog);
        expect(log).toHaveLength(20);
        expect(log[0].id).toBe(2);
        expect(log[19].id).toBe(21);
    });
});

describe('reroute retry and notification helpers', () => {
    test('buildRerouteFailureRetryPlan schedules with backoff delays', () => {
        const plan = RD.buildRerouteFailureRetryPlan({
            routeInProgress: true,
            autoRerouteOnDeviationEnabled: true,
            postRerouteGraceUntil: 0,
            rerouteInProgress: false,
            rerouteFailureRetryCount: 0,
            now: 1000,
        });
        expect(plan.action).toBe('schedule');
        expect(plan.delayMs).toBe(4000);
        expect(plan.attemptLabel).toBe(1);
    });

    test('buildRerouteFailureRetryPlan exhausts after max attempts', () => {
        const plan = RD.buildRerouteFailureRetryPlan({
            routeInProgress: true,
            autoRerouteOnDeviationEnabled: true,
            postRerouteGraceUntil: 0,
            rerouteInProgress: false,
            rerouteFailureRetryCount: RD.REROUTE_FAILURE_RETRY_DELAYS_MS.length,
            now: 1000,
        });
        expect(plan.action).toBe('exhausted');
        expect(plan.notification.title).toContain('failed');
    });

    test('formatDeviationDistanceDisplay uses feet in imperial mode', () => {
        expect(RD.formatDeviationDistanceDisplay(30, 'mi')).toMatch(/ft$/);
        expect(RD.formatDeviationDistanceDisplay(30, 'km')).toBe('30 m');
    });

    test('shouldSkipRerouteTrigger respects debounce and grace', () => {
        expect(RD.shouldSkipRerouteTrigger(10000, {
            rerouteInProgress: false,
            lastRerouteAttemptTime: 9000,
            postRerouteGraceUntil: 0,
            debounceMs: 30000,
        }).skip).toBe(true);
        expect(RD.shouldSkipRerouteTrigger(100000, {
            rerouteInProgress: false,
            lastRerouteAttemptTime: 0,
            postRerouteGraceUntil: 200000,
        }).reason).toBe('grace');
    });

    test('buildRerouteVoiceMessage includes hazard warning when needed', () => {
        const msg = RD.buildRerouteVoiceMessage({ duration_minutes: 20 }, 2, '5.0', 'mi');
        expect(msg).toContain('Route recalculated');
        expect(msg).toContain('2 hazards');
    });

    test('shouldAnnounceRerouteVoice enforces minimum interval', () => {
        expect(RD.shouldAnnounceRerouteVoice(70000, 0)).toBe(true);
        expect(RD.shouldAnnounceRerouteVoice(30000, 0)).toBe(false);
    });

    test('buildAutomaticRerouteGuardPlan defers when offline', () => {
        const plan = RD.buildAutomaticRerouteGuardPlan({ offline: true });
        expect(plan.proceed).toBe(false);
        expect(plan.action).toBe('schedule-retry');
    });

    test('buildAutomaticRerouteOutcomePlan returns success voice and notification', () => {
        const plan = RD.buildAutomaticRerouteOutcomePlan({
            success: true,
            routes: [{ distance_km: 12, duration_minutes: 25, hazard_count: 1 }],
        }, {
            convertDistance: (km) => km.toFixed(1),
            distUnit: 'km',
            voiceEnabled: true,
            lastRerouteAnnouncementTime: 0,
            now: 70000,
        });
        expect(plan.ok).toBe(true);
        expect(plan.hazardCount).toBe(1);
        expect(plan.voice.shouldSpeak).toBe(true);
        expect(plan.notification.title).toContain('Route Updated');
    });

    test('buildAutomaticRerouteOutcomePlan returns failure with first-attempt notification', () => {
        const plan = RD.buildAutomaticRerouteOutcomePlan({ success: false, error: 'timeout' }, {
            rerouteFailureRetryCount: 0,
        });
        expect(plan.ok).toBe(false);
        expect(plan.scheduleRetry).toBe(true);
        expect(plan.notification.title).toContain('Failed');
    });

    test('buildAutomaticRerouteErrorPlan notifies only on first failure', () => {
        expect(RD.buildAutomaticRerouteErrorPlan({ rerouteFailureRetryCount: 0 }).notification).not.toBeNull();
        expect(RD.buildAutomaticRerouteErrorPlan({ rerouteFailureRetryCount: 1 }).notification).toBeNull();
    });

    test('resolveRouteManeuversFromPayload prefers top-level maneuvers', () => {
        const resolved = RD.resolveRouteManeuversFromPayload({
            maneuvers: [{ type: 1 }],
            legs: [{ maneuvers: [{ type: 2 }] }],
        });
        expect(resolved.steps).toHaveLength(1);
        expect(resolved.source).toBe('maneuvers');
    });

    test('buildRouteMapUpdateStatePlan patches lastCalculatedRoute and deviation state', () => {
        const plan = RD.buildRouteMapUpdateStatePlan(
            { geometry: 'abc', distance_km: 10, duration_minutes: 20 },
            { destination: '51,0', destinationName: 'Home' },
            { convertDistance: (km) => km.toFixed(1), distUnit: 'km', hasCurrentGps: true, now: 1000 }
        );
        expect(plan.primeVehicleMarker).toBe(true);
        expect(plan.deviation.postRerouteGraceUntil).toBe(1000 + RD.POST_REROUTE_GRACE_MS);
        expect(plan.lastCalculatedRoutePatch.destination).toBe('51,0');
        expect(plan.lastCalculatedRoutePatch.distance).toBe('10.0 km');
    });

    test('buildRerouteLogSettingsSnapshot uses route-prefs readers', () => {
        const storage = {
            getItem: (key) => {
                if (key === 'pref_cameras') return 'false';
                if (key === 'pref_caz') return 'true';
                if (key === 'pref_avoid_tollRoads') return 'true';
                return null;
            },
        };
        const snapshot = RD.buildRerouteLogSettingsSnapshot(storage, {
            isRouteAvoidancePrefEnabled: (pref, s) => s.getItem('pref_' + pref) !== 'false',
            isAvoidTollsEnabled: (s) => s.getItem('pref_avoid_tollRoads') === 'true',
        });
        expect(snapshot.avoidCameras).toBe(false);
        expect(snapshot.avoidTolls).toBe(true);
        expect(snapshot.avoidCaz).toBe(true);
    });

    test('recordAutomaticRerouteLog persists event to storage', () => {
        const items = {};
        const storage = {
            getItem: (k) => items[k] || null,
            setItem: (k, v) => { items[k] = v; },
        };
        const result = RD.recordAutomaticRerouteLog(storage, {
            startLat: 51.5,
            startLon: -0.1,
            destination: 'Home',
            route: { distance_km: 10, duration_minutes: 20 },
            hazardCount: 2,
            routePrefs: {
                isRouteAvoidancePrefEnabled: () => true,
                isAvoidTollsEnabled: () => true,
            },
        });
        expect(result.event.type).toBe('automatic_reroute');
        expect(result.log).toHaveLength(1);
        expect(JSON.parse(items.rerouteLog)).toHaveLength(1);
    });

    test('buildAutomaticRerouteTriggerPlan skips duplicate in-progress triggers', () => {
        const plan = RD.buildAutomaticRerouteTriggerPlan(1000, {
            rerouteInProgress: true,
        });
        expect(plan.action).toBe('skip');
        expect(plan.logMessage).toContain('Already in progress');
    });

    test('buildAutomaticRerouteTriggerPlan defers when offline', () => {
        const now = 1_700_000_000_000;
        const plan = RD.buildAutomaticRerouteTriggerPlan(now, {
            rerouteInProgress: false,
            lastRerouteAttemptTime: now - 60_000,
            destination: '51,0',
            hasRouteContext: true,
            offline: true,
            startLat: 51.5,
            startLon: -0.1,
        });
        expect(plan.action).toBe('defer');
        expect(plan.scheduleRetry).toBe(true);
        expect(plan.lastRerouteAttemptTime).toBe(now);
    });

    test('buildAutomaticRerouteTriggerPlan proceeds to fetch when ready', () => {
        const now = 1_700_000_000_000;
        const plan = RD.buildAutomaticRerouteTriggerPlan(now, {
            rerouteInProgress: false,
            lastRerouteAttemptTime: now - 60_000,
            destination: '51,0',
            hasRouteContext: true,
            offline: false,
            startLat: 51.5,
            startLon: -0.1,
        });
        expect(plan.action).toBe('fetch');
        expect(plan.rerouteInProgress).toBe(true);
        expect(plan.guard.proceed).toBe(true);
    });
});

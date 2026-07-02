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

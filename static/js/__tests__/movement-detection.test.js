/**
 * Tests for modules/navigation/movement-detection.js
 */
const Movement = require('../modules/navigation/movement-detection.js');
const RG = require('../modules/navigation/route-geometry.js');

function point(lat, lon, speed, ageMs, now) {
    return {
        lat: lat,
        lon: lon,
        speed: speed,
        timestamp: new Date(now - ageMs),
    };
}

describe('movement-detection module surface', () => {
    test('exposes hasUserStartedMoving', () => {
        expect(typeof Movement.hasUserStartedMoving).toBe('function');
    });
});

describe('hasUserStartedMoving', () => {
    const now = 1_700_000_000_000;
    const haversine = RG.haversineDistanceMeters;

    test('false with fewer than 3 history points', () => {
        expect(Movement.hasUserStartedMoving({
            trackingHistory: [point(0, 0, 0, 1000, now)],
            nowMs: now,
            haversineDistanceMeters: haversine,
        })).toBe(false);
    });

    test('true when two recent speed readings exceed threshold', () => {
        const history = [
            point(51.5, -0.1, 2, 20000, now),
            point(51.5, -0.1, 2.5, 10000, now),
            point(51.5, -0.1, 3, 5000, now),
        ];
        expect(Movement.hasUserStartedMoving({
            trackingHistory: history,
            nowMs: now,
            haversineDistanceMeters: haversine,
        })).toBe(true);
    });

    test('true when position moved more than 50m in recent window', () => {
        const history = [
            point(51.5000, -0.1000, 0, 25000, now),
            point(51.5000, -0.1000, 0, 15000, now),
            point(51.5005, -0.1000, 0, 5000, now),
        ];
        expect(Movement.hasUserStartedMoving({
            trackingHistory: history,
            nowMs: now,
            haversineDistanceMeters: haversine,
        })).toBe(true);
    });

    test('false when stationary in recent window', () => {
        const history = [
            point(51.5, -0.1, 0, 25000, now),
            point(51.5, -0.1, 0, 15000, now),
            point(51.5, -0.1, 0, 5000, now),
        ];
        expect(Movement.hasUserStartedMoving({
            trackingHistory: history,
            nowMs: now,
            haversineDistanceMeters: haversine,
        })).toBe(false);
    });
});

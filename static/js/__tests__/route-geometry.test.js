/**
 * Tests for modules/navigation/route-geometry.js
 * Asserts the pure geometry functions used by the nav hot-path (snap, along-route
 * distance, bearing, heading blend, polyline length, remaining distance).
 */
const RG = require('../modules/navigation/route-geometry.js');

describe('route-geometry module surface', () => {
    test('exposes all expected functions', () => {
        const fns = ['haversineDistanceMeters', 'bearing', 'blendHeadingsCircular',
            'projectToSegment', 'snapToRoutePolyline', 'distanceAlongRouteToVertexMeters',
            'totalPolylineLengthMeters', 'computeRemainingDistanceAlongRoute'];
        fns.forEach(fn => expect(typeof RG[fn]).toBe('function'));
    });
});

describe('haversineDistanceMeters', () => {
    test('same point → 0', () => {
        expect(RG.haversineDistanceMeters(53.5, -1.4, 53.5, -1.4)).toBe(0);
    });

    test('Sheffield → Leeds ~38 km within 5 km', () => {
        const d = RG.haversineDistanceMeters(53.4749, -1.3799, 53.8008, -1.5491);
        expect(d).toBeGreaterThan(33000);
        expect(d).toBeLessThan(43000);
    });
});

describe('bearing', () => {
    test('north is 0°', () => {
        const b = RG.bearing(51.0, -0.1, 52.0, -0.1);
        expect(b).toBeCloseTo(0, 0);
    });

    test('east is ~90°', () => {
        const b = RG.bearing(51.5, -1.0, 51.5, 0.0);
        expect(b).toBeGreaterThan(88);
        expect(b).toBeLessThan(92);
    });
});

describe('blendHeadingsCircular', () => {
    test('blend=0 returns GPS heading', () => {
        expect(RG.blendHeadingsCircular(45, 90, 0)).toBeCloseTo(45, 5);
    });

    test('blend=1 returns route heading', () => {
        expect(RG.blendHeadingsCircular(45, 90, 1)).toBeCloseTo(90, 5);
    });

    test('no wrap artefact near 0/360', () => {
        const result = RG.blendHeadingsCircular(350, 10, 0.5);
        expect(result).toBeCloseTo(0, 0);
    });

    test('non-finite GPS heading defaults to 0', () => {
        // NaN gps → gpsHeadingDeg replaced with 0; blended toward 90 at 0.5 = 45
        const result = RG.blendHeadingsCircular(NaN, 90, 0.5);
        expect(result).toBeCloseTo(45, 0);
    });
});

describe('snapToRoutePolyline', () => {
    const polyline = [
        [51.50, -0.12],
        [51.51, -0.11],
        [51.52, -0.10],
    ];

    test('returns same endpoints when on the line', () => {
        const s = RG.snapToRoutePolyline(51.50, -0.12, polyline, 0);
        expect(s.index).toBe(0);
        expect(s.distance).toBeLessThan(5);
    });

    test('snaps a nearby off-route point to segment 0', () => {
        const s = RG.snapToRoutePolyline(51.505, -0.12, polyline, 0);
        expect(s.index).toBe(0);
        expect(s.distance).toBeLessThan(500);
    });

    test('empty polyline returns identity', () => {
        const s = RG.snapToRoutePolyline(51.5, -0.1, [], 0);
        expect(s.index).toBe(0);
        expect(s.distance).toBe(0);
    });
});

describe('distanceAlongRouteToVertexMeters', () => {
    const polyline = [
        [51.50, -0.12],
        [51.51, -0.11],
        [51.52, -0.10],
    ];

    test('from vertex 0 to vertex 2 is positive', () => {
        const snap = { index: 0, t: 0 };
        const d = RG.distanceAlongRouteToVertexMeters(polyline, snap, 2);
        expect(d).toBeGreaterThan(0);
    });

    test('same vertex forward returns 0', () => {
        const snap = { index: 0, t: 0 };
        const d = RG.distanceAlongRouteToVertexMeters(polyline, snap, 0);
        expect(d).toBeCloseTo(0, 5);
    });
});

describe('totalPolylineLengthMeters', () => {
    test('empty → 0', () => {
        expect(RG.totalPolylineLengthMeters([])).toBe(0);
    });

    test('two-point polyline is positive', () => {
        const d = RG.totalPolylineLengthMeters([[51.5, -0.1], [51.51, -0.1]]);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(5000);
    });
});

describe('computeRemainingDistanceAlongRoute', () => {
    const polyline = [
        [51.50, -0.12],
        [51.51, -0.11],
        [51.52, -0.10],
    ];

    test('at start returns ~total length', () => {
        const rem = RG.computeRemainingDistanceAlongRoute(51.50, -0.12, polyline, 0);
        const total = RG.totalPolylineLengthMeters(polyline);
        expect(rem).toBeGreaterThan(0);
        expect(rem).toBeLessThanOrEqual(total + 5);
    });

    test('at end returns ~0', () => {
        const rem = RG.computeRemainingDistanceAlongRoute(51.52, -0.10, polyline, 0);
        expect(rem).toBeLessThan(200);
    });
});

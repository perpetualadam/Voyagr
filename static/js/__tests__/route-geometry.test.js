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
            'totalPolylineLengthMeters', 'computeRemainingDistanceAlongRoute',
            'findNearestPolylineVertexIndex', 'buildVertexDestinationProgress'];
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

describe('findNearestPolylineVertexIndex', () => {
    const polyline = [[51.50, -0.12], [51.51, -0.11], [51.52, -0.10]];

    test('returns 0 for empty polyline', () => {
        expect(RG.findNearestPolylineVertexIndex(51.5, -0.12, [])).toBe(0);
    });

    test('picks the closest vertex index', () => {
        expect(RG.findNearestPolylineVertexIndex(51.515, -0.11, polyline)).toBe(1);
        expect(RG.findNearestPolylineVertexIndex(51.52, -0.10, polyline)).toBe(2);
    });
});

describe('cumulativeDistanceBetweenVertices', () => {
    const poly = [[51.50, -0.12], [51.51, -0.11], [51.52, -0.10]];

    test('same vertex → 0', () => {
        expect(RG.cumulativeDistanceBetweenVertices(poly, 1, 1)).toBe(0);
    });

    test('0→2 is greater than 0→1', () => {
        const d01 = RG.cumulativeDistanceBetweenVertices(poly, 0, 1);
        const d02 = RG.cumulativeDistanceBetweenVertices(poly, 0, 2);
        expect(d02).toBeGreaterThan(d01);
    });

    test('order does not matter (j < i swapped)', () => {
        expect(RG.cumulativeDistanceBetweenVertices(poly, 0, 2))
            .toBeCloseTo(RG.cumulativeDistanceBetweenVertices(poly, 2, 0), 5);
    });

    test('invalid polyline returns Infinity', () => {
        expect(RG.cumulativeDistanceBetweenVertices(null, 0, 1)).toBe(Infinity);
        expect(RG.cumulativeDistanceBetweenVertices([], 0, 1)).toBe(Infinity);
    });
});

describe('inferRoadClassFromManeuver', () => {
    test('returns road_class when set', () => {
        expect(RG.inferRoadClassFromManeuver({ road_class: 'motorway' })).toBe('motorway');
    });

    test('infers motorway from instruction text', () => {
        expect(RG.inferRoadClassFromManeuver({ instruction: 'Join the motorway' })).toBe('motorway');
        expect(RG.inferRoadClassFromManeuver({ instruction: 'Continue on M1' })).toBe('motorway');
    });

    test('infers primary from A-road text', () => {
        expect(RG.inferRoadClassFromManeuver({ instruction: 'Turn onto the A road' })).toBe('primary');
    });

    test('returns null when no match', () => {
        expect(RG.inferRoadClassFromManeuver({ instruction: 'Turn left' })).toBeNull();
        expect(RG.inferRoadClassFromManeuver(null)).toBeNull();
    });
});

describe('inferRoadClassFromStreetNames', () => {
    test('M-prefixed street → motorway', () => {
        expect(RG.inferRoadClassFromStreetNames(['M1', 'London Road'])).toBe('motorway');
    });

    test('A-prefixed street → primary', () => {
        expect(RG.inferRoadClassFromStreetNames(['A40'])).toBe('primary');
    });

    test('B-prefixed street → secondary', () => {
        expect(RG.inferRoadClassFromStreetNames(['B1234'])).toBe('secondary');
    });

    test('unknown name → null', () => {
        expect(RG.inferRoadClassFromStreetNames(['High Street'])).toBeNull();
    });

    test('empty / null → null', () => {
        expect(RG.inferRoadClassFromStreetNames([])).toBeNull();
        expect(RG.inferRoadClassFromStreetNames(null)).toBeNull();
    });
});

describe('resolveCurrentRoadType', () => {
    test('prefers street-name inference for active maneuver', () => {
        expect(RG.resolveCurrentRoadType({
            maneuverIdxOverride: 0,
            currentRouteSteps: [{ begin_street_names: ['M25'] }],
        })).toBe('motorway');
    });

    test('falls back to lastDetectedRoadType then GPS speed', () => {
        expect(RG.resolveCurrentRoadType({
            gpsSpeedMph: 70,
        })).toBe('motorway');
        expect(RG.resolveCurrentRoadType({
            lastDetectedRoadType: 'residential',
            gpsSpeedMph: 70,
        })).toBe('residential');
        expect(RG.resolveCurrentRoadType({})).toBe('unknown');
    });
});

describe('buildNavigationRemainingDistancePlan', () => {
    const polyline = [
        [51.50, -0.12],
        [51.51, -0.11],
        [51.52, -0.10],
    ];

    test('returns remaining meters along route', () => {
        const plan = RG.buildNavigationRemainingDistancePlan({
            lat: 51.50,
            lon: -0.12,
            routePolyline: polyline,
            lastSnappedRouteIndex: 0,
        });
        expect(plan.valid).toBe(true);
        expect(plan.remainingMeters).toBeGreaterThan(0);
    });

    test('returns Infinity when polyline invalid', () => {
        const plan = RG.buildNavigationRemainingDistancePlan({
            lat: 51.5,
            lon: -0.1,
            routePolyline: [],
        });
        expect(plan.valid).toBe(false);
        expect(plan.remainingMeters).toBe(Infinity);
    });
});

describe('calculateSmartZoom', () => {
    const ZL = { motorway_high_speed: 14, main_road_medium_speed: 15, urban_low_speed: 16, parking_very_low_speed: 17, turn_ahead: 18 };
    const T = 500;

    test('turn within threshold → turn_ahead', () => {
        expect(RG.calculateSmartZoom(60, 400, 'motorway', ZL, T)).toBe(ZL.turn_ahead);
    });

    test('no turn + fast → motorway zoom', () => {
        expect(RG.calculateSmartZoom(110, null, 'motorway', ZL, T)).toBe(ZL.motorway_high_speed);
    });

    test('50-100 mph → main_road', () => {
        expect(RG.calculateSmartZoom(70, null, 'primary', ZL, T)).toBe(ZL.main_road_medium_speed);
    });

    test('20-50 mph → urban', () => {
        expect(RG.calculateSmartZoom(30, null, 'residential', ZL, T)).toBe(ZL.urban_low_speed);
    });

    test('< 20 mph → parking', () => {
        expect(RG.calculateSmartZoom(5, null, 'residential', ZL, T)).toBe(ZL.parking_very_low_speed);
    });

    test('turn beyond threshold ignored', () => {
        expect(RG.calculateSmartZoom(60, 600, 'primary', ZL, T)).toBe(ZL.main_road_medium_speed);
    });
});

describe('calculateDriverViewCenter', () => {
    test('returns raw [lat, lon] (MapLibre padding handles offset)', () => {
        const r = RG.calculateDriverViewCenter(51.5, -0.1, 90, 15);
        expect(r).toEqual([51.5, -0.1]);
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

describe('buildVertexDestinationProgress', () => {
    const polyline = [
        [51.50, -0.12],
        [51.51, -0.11],
        [51.52, -0.10],
    ];

    test('at route start reports full remaining distance', () => {
        const p = RG.buildVertexDestinationProgress(51.50, -0.12, polyline);
        expect(p.closestIndex).toBe(0);
        expect(p.progressPercent).toBe(0);
        const total = RG.totalPolylineLengthMeters(polyline);
        expect(p.distanceToEndMeters).toBeGreaterThan(0);
        expect(p.distanceToEndMeters).toBeLessThanOrEqual(total + 5);
    });

    test('at route end reports zero remaining distance', () => {
        const p = RG.buildVertexDestinationProgress(51.52, -0.10, polyline);
        expect(p.closestIndex).toBe(2);
        expect(p.distanceToEndMeters).toBe(0);
        expect(p.progressPercent).toBeCloseTo(66.67, 0);
    });

    test('empty polyline returns zeroed snapshot', () => {
        const p = RG.buildVertexDestinationProgress(51.5, -0.1, []);
        expect(p).toEqual({ closestIndex: 0, distanceToEndMeters: 0, progressPercent: 0 });
    });
});

/**
 * Behaviour tests for modules/navigation/speed-gps.js
 */
const SG = require('../modules/navigation/speed-gps.js');

const STEPS = [
    { begin_shape_index: 0, street_names: ['Start Road'] },
    { begin_shape_index: 40, street_names: ['Middle Lane'] },
    { begin_shape_index: 120, street_names: ['End Street'] },
];

describe('speed-gps module surface', () => {
    test('exposes the expected pure functions', () => {
        expect(typeof SG.rejectGpsSpeedSpikeMph).toBe('function');
        expect(typeof SG.normalizeGeolocationSpeedToMph).toBe('function');
        expect(typeof SG.mphToDisplaySpeed).toBe('function');
        expect(typeof SG.normalizeManeuverSpeedLimitMph).toBe('function');
        expect(typeof SG.getManeuverStreetLabel).toBe('function');
        expect(typeof SG.computeSnapBlendWeight).toBe('function');
        expect(typeof SG.stepSmoothGpsSpeedMph).toBe('function');
        expect(typeof SG.getActiveRouteManeuverIndex).toBe('function');
        expect(typeof SG.advanceSnappedRouteIndex).toBe('function');
        expect(typeof SG.buildBetweenTurnDisplay).toBe('function');
        expect(typeof SG.estimateDisplacementSpeedMph).toBe('function');
    });
});

describe('rejectGpsSpeedSpikeMph', () => {
    test('holds previous value on 0 -> 145 mph glitch from standstill', () => {
        expect(SG.rejectGpsSpeedSpikeMph(145, 0)).toBe(0);
    });
    test('allows gradual acceleration', () => {
        expect(SG.rejectGpsSpeedSpikeMph(35, 30)).toBe(35);
    });
});

describe('normalizeManeuverSpeedLimitMph', () => {
    test('treats 30 as mph on residential (not 19 from km/h conversion)', () => {
        expect(SG.normalizeManeuverSpeedLimitMph(30, 'residential', 28)).toBe(30);
    });
    test('converts 48 km/h to ~30 mph on motorway', () => {
        expect(SG.normalizeManeuverSpeedLimitMph(48, 'motorway', 60)).toBe(30);
    });
    test('rejects implausible motorway limit', () => {
        expect(SG.normalizeManeuverSpeedLimitMph(5, 'motorway', 65)).toBeNull();
    });
    test('does not flag 28 mph as speeding on a 30 mph residential limit', () => {
        const limit = SG.normalizeManeuverSpeedLimitMph(30, 'residential', 28);
        expect(limit).toBe(30);
        expect(28 - limit).toBeLessThanOrEqual(3);
    });
});

describe('sanitizeApiSpeedLimitMph', () => {
    test('rejects 70 mph on residential from stale API/cache', () => {
        expect(SG.sanitizeApiSpeedLimitMph(70, 'residential', 0)).toBeNull();
    });
    test('accepts 30 mph on residential', () => {
        expect(SG.sanitizeApiSpeedLimitMph(30, 'residential', 28)).toBe(30);
    });
    test('accepts 70 mph on motorway', () => {
        expect(SG.sanitizeApiSpeedLimitMph(70, 'motorway', 65)).toBe(70);
    });
});

describe('getManeuverStreetLabel', () => {
    test('prefers begin_street_names when on current road', () => {
        const m = {
            begin_street_names: ['High Street'],
            street_names: ['Market Road'],
            street_name: 'Other'
        };
        expect(SG.getManeuverStreetLabel(m, true)).toBe('High Street');
    });
    test('uses street_names for upcoming turn', () => {
        const m = {
            begin_street_names: ['High Street'],
            street_names: ['Market Road']
        };
        expect(SG.getManeuverStreetLabel(m, false)).toBe('Market Road');
    });
});

describe('getActiveRouteManeuverIndex', () => {
    test('returns maneuver for snapped vertex on current edge', () => {
        expect(SG.getActiveRouteManeuverIndex(STEPS, 55)).toBe(1);
    });
    test('returns -1 when no steps', () => {
        expect(SG.getActiveRouteManeuverIndex(null, 10)).toBe(-1);
    });
    test('returns first maneuver at route start', () => {
        expect(SG.getActiveRouteManeuverIndex(STEPS, 0)).toBe(0);
    });
});

describe('advanceSnappedRouteIndex', () => {
    test('moves forward along the polyline', () => {
        expect(SG.advanceSnappedRouteIndex(50, 40, 30)).toBe(50);
    });
    test('does not jump backward while driving', () => {
        expect(SG.advanceSnappedRouteIndex(30, 50, 35)).toBe(50);
    });
    test('allows backward index when nearly stopped', () => {
        expect(SG.advanceSnappedRouteIndex(30, 50, 1)).toBe(30);
    });
});

describe('buildBetweenTurnDisplay', () => {
    test('shows current road from begin_street_names after reroute-style context', () => {
        const m = {
            begin_street_names: ['New Cut'],
            street_names: ['Old Harbour Road']
        };
        const d = SG.buildBetweenTurnDisplay(m, 1, 'Stale Name');
        expect(d).not.toBeNull();
        expect(d.streetName).toBe('New Cut');
        expect(d.direction).toBe('straight');
        expect(d.instruction).toBe('Continue');
    });
    test('falls back to reverse-geocoded road name', () => {
        const d = SG.buildBetweenTurnDisplay(null, -1, 'Victoria Street');
        expect(d.streetName).toBe('Victoria Street');
    });
    test('returns null when no street is known', () => {
        expect(SG.buildBetweenTurnDisplay(null, -1, '')).toBeNull();
    });
});

describe('displacementNoiseFloorMeters', () => {
    test('high floor when device claims stopped and no movement history', () => {
        expect(SG.displacementNoiseFloorMeters(true, 0, 12)).toBe(12);
    });
    test('lower floor after repeated displacement movement', () => {
        expect(SG.displacementNoiseFloorMeters(true, 3, 20)).toBeGreaterThanOrEqual(4);
        expect(SG.displacementNoiseFloorMeters(true, 3, 20)).toBeLessThan(20);
    });
});

describe('estimateDisplacementSpeedMph', () => {
    test('returns null below noise floor when device reports stopped', () => {
        expect(SG.estimateDisplacementSpeedMph({
            distM: 5,
            dtSec: 1,
            prevPickMph: 0,
            accAvg: 12,
            deviceReportsStopped: true,
            consecutiveDisplacementMoves: 0
        })).toBeNull();
    });
    test('estimates speed when movement exceeds noise floor', () => {
        const mph = SG.estimateDisplacementSpeedMph({
            distM: 30,
            dtSec: 2,
            prevPickMph: 0,
            accAvg: 12,
            deviceReportsStopped: true,
            consecutiveDisplacementMoves: 3
        });
        expect(mph).toBeGreaterThan(20);
        expect(mph).toBeLessThan(45);
    });
    test('rejects 145 mph displacement glitch from standstill', () => {
        const mph = SG.estimateDisplacementSpeedMph({
            distM: 200,
            dtSec: 1,
            prevPickMph: 0,
            accAvg: 10,
            deviceReportsStopped: false,
            consecutiveDisplacementMoves: 0
        });
        expect(mph).toBe(0);
    });
});

describe('computeSnapBlendWeight', () => {
    test('full snap when within lock radius', () => {
        const r = SG.computeSnapBlendWeight({ distSnap: 10, snapLockMeters: 50, prevWeightState: 0 });
        expect(r.effectiveBlend).toBeGreaterThan(0.3);
    });
    test('hysteresis keeps blend higher when previously snapped', () => {
        const cold = SG.computeSnapBlendWeight({ distSnap: 55, snapLockMeters: 50, prevWeightState: 0 });
        const warm = SG.computeSnapBlendWeight({ distSnap: 55, snapLockMeters: 50, prevWeightState: 0.9 });
        expect(warm.effectiveBlend).toBeGreaterThan(cold.effectiveBlend);
    });
});

describe('smoothDisplayCoordinate', () => {
    test('returns target on first sample', () => {
        expect(SG.smoothDisplayCoordinate(null, 51.5, 0)).toBe(51.5);
    });
    test('moves faster toward target on urgent follow jump', () => {
        const gentle = SG.smoothDisplayCoordinate(51.0, 51.5, 10);
        const urgent = SG.smoothDisplayCoordinate(51.0, 51.5, 80);
        expect(Math.abs(urgent - 51.5)).toBeLessThan(Math.abs(gentle - 51.5));
    });
});

describe('stepSmoothGpsSpeedMph', () => {
    test('wakes quickly from standstill when raw speed exceeds threshold', () => {
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 0, initAt: 1000 }, 25, 2000);
        expect(r.value).toBe(25);
    });
    test('dead-band returns zero for noise', () => {
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 0, initAt: 1000 }, 0.3, 2000);
        expect(r.value).toBe(0);
    });

    test('resets to the raw value when the init window has elapsed', () => {
        // moving (smoothed >= dead band), fix well past INIT_RESET_MS (5000)
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 20, initAt: 1000 }, 30, 7000);
        expect(r.value).toBe(30);
        expect(r.state.smoothedMph).toBe(30);
    });

    test('resets to the raw value when there is no prior init timestamp', () => {
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 20, initAt: 0 }, 28, 2000);
        expect(r.value).toBe(28);
    });

    test('a very large jump decays gradually instead of snapping fully', () => {
        // delta 60 >= LARGE_JUMP_MPH(55): smoothed = 0.8*10 + 0.2*70 = 22
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 10, initAt: 1000 }, 70, 2000);
        expect(r.value).toBeCloseTo(22, 5);
    });

    test('a medium jump snaps to the raw value', () => {
        // delta 10 in [SNAP_DELTA_MPH(8), LARGE_JUMP_MPH(55)) -> snap
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 10, initAt: 1000 }, 20, 2000);
        expect(r.value).toBe(20);
    });

    test('a small delta is EMA-smoothed', () => {
        // delta 3 < SNAP_DELTA_MPH: smoothed = 0.55*10 + 0.45*13 = 11.35
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 10, initAt: 1000 }, 13, 2000);
        expect(r.value).toBeCloseTo(11.35, 5);
    });
});

describe('stepPickRawSpeedMph', () => {
    const emptyState = () => ({ lastGoodRawPickMph: 0, consecutiveDisplacementMoves: 0 });

    test('exposes the function', () => {
        expect(typeof SG.stepPickRawSpeedMph).toBe('function');
    });

    test('returns 0 with no data', () => {
        const r = SG.stepPickRawSpeedMph(emptyState(), null, [], null);
        expect(r.value).toBe(0);
        expect(r.state.lastGoodRawPickMph).toBe(0);
    });

    test('trusts a valid device coords.speed (m/s) directly', () => {
        // 20 m/s ≈ 44.7 mph
        const r = SG.stepPickRawSpeedMph(emptyState(), 20, [], null);
        expect(r.value).toBeGreaterThan(40);
        expect(r.value).toBeLessThan(55);
        expect(r.state.lastGoodRawPickMph).toBe(r.value);
    });

    test('returns 0 when device explicitly reports stopped', () => {
        const r = SG.stepPickRawSpeedMph(emptyState(), 0, [], null);
        expect(r.value).toBe(0);
    });

    test('derives speed from two close history fixes (normal driving ~35 mph)', () => {
        const now = Date.now();
        // ~11 m apart in 0.7 s ≈ 15.7 m/s ≈ 35 mph — plausible urban driving
        const hist = [
            { lat: 51.5000, lon: -0.1000, timestamp: now - 700 },
            { lat: 51.5001, lon: -0.1000, timestamp: now },
        ];
        const r = SG.stepPickRawSpeedMph(emptyState(), null, hist, null);
        expect(r.value).toBeGreaterThan(20);
        expect(r.value).toBeLessThan(60);
        expect(r.state.consecutiveDisplacementMoves).toBeGreaterThanOrEqual(1);
    });

    test('caps at MAX_DISPLAY_GPS_SPEED_MPH', () => {
        // Unrealistically fast coords.speed (1000 m/s → 2237 mph) must be capped
        const r = SG.stepPickRawSpeedMph(emptyState(), 1000, [], null);
        expect(r.value).toBeLessThanOrEqual(SG.DEFAULTS.MAX_DISPLAY_GPS_SPEED_MPH);
    });

    test('state threads through successive calls', () => {
        const r1 = SG.stepPickRawSpeedMph(emptyState(), 20, [], null);
        const r2 = SG.stepPickRawSpeedMph(r1.state, 22, [], null);
        expect(r2.state.lastGoodRawPickMph).toBeGreaterThan(0);
    });
});

describe('normalizeGeolocationSpeedToMph', () => {
    test('m/s to mph at highway speed (~60 mph)', () => {
        const mps = 60 / SG.DEFAULTS.MS_TO_MPH;
        expect(Math.round(SG.metersPerSecondToMph(mps))).toBe(60);
    });

    test('km/h misreported in coords.speed (~96.6) normalizes to ~60 mph', () => {
        const mph = SG.normalizeGeolocationSpeedToMph(96.56, null);
        expect(Math.round(mph)).toBe(60);
    });

    test('ambiguous raw value picks interpretation closest to derived hint', () => {
        const mph = SG.normalizeGeolocationSpeedToMph(43, 27);
        expect(Math.round(mph)).toBe(27);
    });
});

describe('mphToDisplaySpeed', () => {
    test('display mph when user prefers mph', () => {
        expect(Math.round(SG.mphToDisplaySpeed(60, 'mph'))).toBe(60);
        expect(SG.speedUnitLabel('mph')).toBe('mph');
    });

    test('display km/h when user prefers kmh / km/h', () => {
        expect(Math.round(SG.mphToDisplaySpeed(60, 'kmh'))).toBe(97);
        expect(Math.round(SG.mphToDisplaySpeed(60, 'km/h'))).toBe(97);
        expect(SG.speedUnitLabel('km/h')).toBe('km/h');
    });
});

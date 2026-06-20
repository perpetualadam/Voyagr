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
});

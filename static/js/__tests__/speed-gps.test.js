/**
 * Behaviour tests for modules/navigation/speed-gps.js
 */
const SG = require('../modules/navigation/speed-gps.js');

describe('speed-gps module surface', () => {
    test('exposes the expected pure functions', () => {
        expect(typeof SG.rejectGpsSpeedSpikeMph).toBe('function');
        expect(typeof SG.normalizeManeuverSpeedLimitMph).toBe('function');
        expect(typeof SG.getManeuverStreetLabel).toBe('function');
        expect(typeof SG.computeSnapBlendWeight).toBe('function');
        expect(typeof SG.stepSmoothGpsSpeedMph).toBe('function');
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

describe('displacementNoiseFloorMeters', () => {
    test('high floor when device claims stopped and no movement history', () => {
        expect(SG.displacementNoiseFloorMeters(true, 0, 12)).toBe(12);
    });
    test('lower floor after repeated displacement movement', () => {
        expect(SG.displacementNoiseFloorMeters(true, 3, 20)).toBeGreaterThanOrEqual(4);
        expect(SG.displacementNoiseFloorMeters(true, 3, 20)).toBeLessThan(20);
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

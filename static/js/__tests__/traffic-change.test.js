/**
 * Tests for modules/navigation/traffic-change.js
 * Asserts the traffic-change predicate logic (no routing context needed).
 */
const TC = require('../modules/navigation/traffic-change.js');
const fn = TC.detectSignificantTrafficChange;

const snapshot = (overrides) => Object.assign(
    { severe: false, congestedPoints: [], delayMin: 0, congestedCount: 0 },
    overrides
);

describe('traffic-change module surface', () => {
    test('exposes detectSignificantTrafficChange', () => {
        expect(typeof TC.detectSignificantTrafficChange).toBe('function');
    });
});

describe('detectSignificantTrafficChange', () => {
    test('null current → false', () => {
        expect(fn(null, null)).toBe(false);
    });

    test('severe congestion with points → "severe"', () => {
        expect(fn(null, snapshot({ severe: true, congestedPoints: [{ lat: 1, lon: 2 }] }))).toBe('severe');
    });

    test('severe with no points → false', () => {
        expect(fn(null, snapshot({ severe: true, congestedPoints: [] }))).toBe(false);
    });

    test('delayMin >= 4 with points → "congestion"', () => {
        expect(fn(null, snapshot({ delayMin: 4, congestedPoints: [{ lat: 1, lon: 2 }] }))).toBe('congestion');
    });

    test('delayMin < 4 on first sample → false', () => {
        expect(fn(null, snapshot({ delayMin: 3, congestedPoints: [{ lat: 1, lon: 2 }] }))).toBe(false);
    });

    test('delay jump >= 3 vs previous → "congestion"', () => {
        const prev = snapshot({ delayMin: 1 });
        const curr = snapshot({ delayMin: 5, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe('congestion');
    });

    test('delay jump < 3 vs previous → false (absolute check also < 4)', () => {
        // delayMin stays under the absolute threshold (4) so only the relative check fires.
        const prev = snapshot({ delayMin: 1 });
        const curr = snapshot({ delayMin: 3.5, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe(false);
    });

    test('congestedCount grew by > 1 → "congestion"', () => {
        const prev = snapshot({ congestedCount: 1 });
        const curr = snapshot({ congestedCount: 3, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe('congestion');
    });

    test('congestedCount grew by 1 → false', () => {
        const prev = snapshot({ congestedCount: 2 });
        const curr = snapshot({ congestedCount: 3, congestedPoints: [{ lat: 1, lon: 2 }] });
        expect(fn(prev, curr)).toBe(false);
    });

    test('all conditions benign → false', () => {
        expect(fn(snapshot({ delayMin: 1 }), snapshot({ delayMin: 2 }))).toBe(false);
    });
});

describe('traffic reroute acceptance helpers', () => {
    test('computeTrafficRerouteTimeSaved includes measured delay', () => {
        expect(TC.computeTrafficRerouteTimeSaved(20, 5, 18)).toBe(7);
    });

    test('shouldAcceptTrafficReroute accepts severe regardless of savings', () => {
        expect(TC.shouldAcceptTrafficReroute(true, 0)).toBe(true);
    });

    test('shouldAcceptTrafficReroute requires 2+ minute savings otherwise', () => {
        expect(TC.shouldAcceptTrafficReroute(false, 1.9)).toBe(false);
        expect(TC.shouldAcceptTrafficReroute(false, 2)).toBe(true);
    });

    test('formatTrafficRerouteSaveMessage rounds positive savings', () => {
        expect(TC.formatTrafficRerouteSaveMessage(3.2)).toBe('Saves about 3 minutes.');
        expect(TC.formatTrafficRerouteSaveMessage(0)).toBe('');
    });
});

/**
 * Tests for modules/navigation/polyline-codec.js
 * Asserts round-trip fidelity and edge cases for precision 5 (OSRM/GH) and 6 (Valhalla).
 */
const PC = require('../modules/navigation/polyline-codec.js');

describe('polyline-codec module surface', () => {
    test('exposes decodePolyline and encodePolyline', () => {
        expect(typeof PC.decodePolyline).toBe('function');
        expect(typeof PC.encodePolyline).toBe('function');
    });
});

describe('decodePolyline', () => {
    test('returns [] for empty or non-string input', () => {
        expect(PC.decodePolyline('')).toEqual([]);
        expect(PC.decodePolyline(null)).toEqual([]);
        expect(PC.decodePolyline(42)).toEqual([]);
    });

    test('decodes a known precision-5 example (round-tripped)', () => {
        // Use encode→decode to verify a known pair, avoiding hardcoded string fragility.
        const encoded = PC.encodePolyline([[10.0, 20.0]], 5);
        const pts = PC.decodePolyline(encoded, 5);
        expect(pts.length).toBe(1);
        expect(pts[0][0]).toBeCloseTo(10.0, 3);
        expect(pts[0][1]).toBeCloseTo(20.0, 3);
    });

    test('decodes precision-6 Sheffield→Leeds two-point shape', () => {
        // Two points: [53.536, -1.380] and [53.517, -1.150] encoded at precision 6
        const encoded = PC.encodePolyline([[53.536, -1.380], [53.517, -1.150]], 6);
        const pts = PC.decodePolyline(encoded, 6);
        expect(pts.length).toBe(2);
        expect(pts[0][0]).toBeCloseTo(53.536, 3);
        expect(pts[0][1]).toBeCloseTo(-1.380, 3);
        expect(pts[1][0]).toBeCloseTo(53.517, 3);
        expect(pts[1][1]).toBeCloseTo(-1.150, 3);
    });
});

describe('encodePolyline', () => {
    test('returns "" for empty or non-array input', () => {
        expect(PC.encodePolyline([])).toBe('');
        expect(PC.encodePolyline(null)).toBe('');
    });

    test('skips invalid points silently', () => {
        const s = PC.encodePolyline([[51.5, -0.1], null, [51.6, -0.2]], 5);
        const back = PC.decodePolyline(s, 5);
        expect(back.length).toBe(2);
    });
});

describe('round-trip', () => {
    test('precision-5 round-trip fidelity', () => {
        const orig = [[51.501, -0.124], [51.507, -0.127], [51.512, -0.130]];
        const back = PC.decodePolyline(PC.encodePolyline(orig, 5), 5);
        orig.forEach((pt, i) => {
            expect(back[i][0]).toBeCloseTo(pt[0], 3);
            expect(back[i][1]).toBeCloseTo(pt[1], 3);
        });
    });

    test('precision-6 round-trip fidelity', () => {
        const orig = [[53.536, -1.380], [53.517, -1.150], [53.500, -1.000]];
        const back = PC.decodePolyline(PC.encodePolyline(orig, 6), 6);
        orig.forEach((pt, i) => {
            expect(back[i][0]).toBeCloseTo(pt[0], 4);
            expect(back[i][1]).toBeCloseTo(pt[1], 4);
        });
    });
});

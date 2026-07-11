/**
 * Tests for modules/navigation/trip-history.js
 * Asserts pure coordinate parsing and server/local trip merge (no DOM/storage).
 */
const T = require('../modules/navigation/trip-history.js');

describe('trip-history module surface', () => {
    test('exposes parseLatLonString and mergeServerAndLocalTrips', () => {
        expect(typeof T.parseLatLonString).toBe('function');
        expect(typeof T.mergeServerAndLocalTrips).toBe('function');
    });
});

describe('parseLatLonString', () => {
    test('parses a valid "lat,lon" string', () => {
        expect(T.parseLatLonString('51.5074, -0.1278')).toEqual({ lat: 51.5074, lon: -0.1278 });
    });
    test('trims whitespace around each part', () => {
        expect(T.parseLatLonString('  1.5 ,  2.5 ')).toEqual({ lat: 1.5, lon: 2.5 });
    });
    test('returns null for empty/non-string input', () => {
        expect(T.parseLatLonString('')).toBeNull();
        expect(T.parseLatLonString(null)).toBeNull();
        expect(T.parseLatLonString(42)).toBeNull();
    });
    test('returns null when fewer than two parts', () => {
        expect(T.parseLatLonString('51.5')).toBeNull();
    });
    test('returns null when a part is non-numeric', () => {
        expect(T.parseLatLonString('abc,def')).toBeNull();
        expect(T.parseLatLonString('51.5,def')).toBeNull();
    });
});

describe('mergeServerAndLocalTrips', () => {
    test('returns [] for empty inputs', () => {
        expect(T.mergeServerAndLocalTrips([], [])).toEqual([]);
        expect(T.mergeServerAndLocalTrips(null, null)).toEqual([]);
    });

    test('local-only trip gets negative synthetic id and _localOnly flag', () => {
        const out = T.mergeServerAndLocalTrips([], [
            { localId: 123, serverId: null, timestamp: '2026-01-01T00:00:00Z', distance_km: 5 },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe(-123);
        expect(out[0]._localOnly).toBe(true);
        expect(out[0].distance_km).toBe(5);
    });

    test('drops a local trip already present on the server (by serverId)', () => {
        const server = [{ id: 7, timestamp: '2026-01-02T00:00:00Z' }];
        const local = [{ localId: 1, serverId: 7, timestamp: '2026-01-02T00:00:00Z' }];
        const out = T.mergeServerAndLocalTrips(server, local);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe(7);
    });

    test('synced local trip (unique serverId) is added with _localOnly false', () => {
        const out = T.mergeServerAndLocalTrips([], [
            { localId: 2, serverId: 42, timestamp: '2026-01-03T00:00:00Z' },
        ]);
        expect(out[0].id).toBe(42);
        expect(out[0]._localOnly).toBe(false);
    });

    test('sorts newest-first by timestamp', () => {
        const server = [
            { id: 1, timestamp: '2026-01-01T00:00:00Z' },
            { id: 2, timestamp: '2026-03-01T00:00:00Z' },
        ];
        const out = T.mergeServerAndLocalTrips(server, [
            { localId: 9, serverId: null, timestamp: '2026-02-01T00:00:00Z' },
        ]);
        expect(out.map((t) => t.id)).toEqual([2, -9, 1]);
    });

    test('does not mutate the input server array', () => {
        const server = [{ id: 1, timestamp: '2026-01-01T00:00:00Z' }];
        T.mergeServerAndLocalTrips(server, [{ localId: 5, serverId: null, timestamp: '2026-02-01T00:00:00Z' }]);
        expect(server).toHaveLength(1);
    });
});

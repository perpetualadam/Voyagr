/**
 * Tests for modules/navigation/route-selection.js
 */
const RS = require('../modules/navigation/route-selection.js');

describe('route-selection module', () => {
    test('mergeNavigationRouteFromSelected uses selected option fields', () => {
        const out = RS.mergeNavigationRouteFromSelected(
            { geometry: 'old', maneuvers: [], distance_km: 1 },
            [{ geometry: 'new', maneuvers: [{ type: 1 }], distance_km: 5, name: 'Fast' }],
            0
        );
        expect(out.geometry).toBe('new');
        expect(out.maneuvers).toHaveLength(1);
        expect(out.distance_km).toBe(5);
        expect(out.name).toBe('Fast');
    });

    test('mergeLastCalculatedRouteFromSelection preserves destination from prev', () => {
        const out = RS.mergeLastCalculatedRouteFromSelection(
            { destination: '51,0', destinationName: 'Home' },
            { geometry: 'abc', duration_minutes: 20 }
        );
        expect(out.destination).toBe('51,0');
        expect(out.geometry).toBe('abc');
    });

    test('buildRoutePayloadFromPersisted encodes polyline when geometry missing', () => {
        const encode = jest.fn(() => 'encoded');
        const out = RS.buildRoutePayloadFromPersisted({
            polyline: [[51.5, -0.1], [51.6, -0.2]],
            steps: [{ type: 8 }],
        }, encode);
        expect(encode).toHaveBeenCalledWith([[51.5, -0.1], [51.6, -0.2]], 6);
        expect(out.geometry).toBe('encoded');
        expect(out.maneuvers).toHaveLength(1);
    });
});

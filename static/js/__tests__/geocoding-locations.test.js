/**
 * Tests for modules/navigation/geocoding-locations.js
 */
const GL = require('../modules/navigation/geocoding-locations.js');

describe('geocoding-locations module', () => {
    test('readStoredLocationFromDataset returns cached coords when present', () => {
        const out = GL.readStoredLocationFromDataset({
            lat: '51.5',
            lon: '-0.1',
            displayName: 'London',
        }, 'fallback');
        expect(out).toEqual({
            lat: 51.5,
            lon: -0.1,
            display_name: 'London',
            cached: true,
        });
    });

    test('readStoredLocationFromDataset returns null when dataset incomplete', () => {
        expect(GL.readStoredLocationFromDataset({ lat: '51.5' }, 'x')).toBeNull();
        expect(GL.readStoredLocationFromDataset(null, 'x')).toBeNull();
    });

    test('status messages cover loading, not-found, resolved, and errors', () => {
        expect(GL.getGeocodeLoadingStatusMessage()).toContain('Geocoding');
        expect(GL.buildGeocodeNotFoundStatusMessage('start', 'ABC')).toContain('start location: ABC');
        expect(GL.buildGeocodeNotFoundStatusMessage('end', 'XYZ')).toContain('end location: XYZ');
        const resolved = GL.buildGeocodeResolvedStatusMessage(
            { display_name: 'A', cached: true },
            { display_name: 'B', cached: false }
        );
        expect(resolved).toContain('A → B');
        expect(resolved).toContain('(cached)');
        expect(GL.buildGeocodeErrorStatusMessage('timeout')).toContain('timeout');
    });

    test('formatGeocodeApiCoords builds lat,lon strings and names', () => {
        expect(GL.formatGeocodeApiCoords(
            { lat: 51.5, lon: -0.1, display_name: 'Start' },
            { lat: 52.0, lon: -1.0, display_name: 'End' }
        )).toEqual({
            start: '51.5,-0.1',
            end: '52,-1',
            startName: 'Start',
            endName: 'End',
        });
    });
});

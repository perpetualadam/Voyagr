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

    test('coordinate parsing helpers validate and build geocode results', () => {
        expect(GL.normalizeGeocodeQuery('  ')).toBeNull();
        expect(GL.normalizeGeocodeQuery(' Leeds ')).toBe('Leeds');
        expect(GL.isCoordinateFormat('51.5,-0.1')).toBe(true);
        expect(GL.isCoordinateFormat('bad')).toBe(false);
        const coord = GL.parseCoordinateGeocodeResult('51.5,-0.1');
        expect(coord.lat).toBe(51.5);
        expect(coord.display_name).toContain('51.5000');
        expect(GL.buildPlusCodeGeocodeResult('CODE', { lat: 1, lon: 2 }).display_name).toContain('Plus Code');
        expect(GL.parseNominatimResultRow({ lat: '51', lon: '-1', display_name: 'X' })).toEqual({
            lat: 51, lon: -1, display_name: 'X',
        });
    });

    test('parseLatLonPairString and invalid coordinate status messages', () => {
        expect(GL.parseLatLonPairString('51.5,-0.1')).toEqual({ valid: true, coords: [51.5, -0.1] });
        expect(GL.parseLatLonPairString('bad')).toEqual({ valid: false });
        expect(GL.getInvalidCoordinatesFormatStatusMessage()).toContain('format');
        expect(GL.getInvalidCoordinatesStatusMessage()).toContain('Invalid coordinates');
    });

    test('geocode cache read/write helpers', () => {
        const cache = {};
        expect(GL.readGeocodeCacheHit(cache, 'missing')).toBeNull();
        GL.writeGeocodeCacheEntry(cache, 'Leeds', { lat: 53.8, lon: -1.5, display_name: 'Leeds' });
        expect(GL.readGeocodeCacheHit(cache, 'Leeds')).toEqual({
            lat: 53.8,
            lon: -1.5,
            display_name: 'Leeds',
            cached: true,
        });
    });
});

/**
 * Tests for modules/navigation/navigation-destination.js
 */
const NavDest = require('../modules/navigation/navigation-destination.js');

describe('navigation-destination module surface', () => {
    test('exposes resolveDestinationLatLon', () => {
        expect(typeof NavDest.resolveDestinationLatLon).toBe('function');
    });
});

describe('resolveDestinationLatLon', () => {
    test('prefers lastCalculatedRoute destination when lat,lon string', () => {
        expect(NavDest.resolveDestinationLatLon({
            lastRouteDestination: ' 51.5,-0.1 ',
            endCoords: { lat: 52, lon: 0 },
            polylineEnd: { lat: 53, lon: 1 },
        })).toBe('51.5,-0.1');
    });

    test('falls back to end dataset coords', () => {
        expect(NavDest.resolveDestinationLatLon({
            lastRouteDestination: 'invalid',
            endCoords: { lat: 51.501, lon: -0.141 },
            polylineEnd: { lat: 53, lon: 1 },
        })).toBe('51.501,-0.141');
    });

    test('falls back to polyline end vertex', () => {
        expect(NavDest.resolveDestinationLatLon({
            endCoords: null,
            polylineEnd: { lat: 48.8566, lon: 2.3522 },
        })).toBe('48.8566,2.3522');
    });

    test('returns null when no valid source', () => {
        expect(NavDest.resolveDestinationLatLon({})).toBeNull();
        expect(NavDest.resolveDestinationLatLon({
            lastRouteDestination: 'no-comma-here',
            endCoords: { lat: NaN, lon: 0 },
        })).toBeNull();
    });
});

describe('readNavigationDestinationSources', () => {
    test('reads end element dataset and polyline end', () => {
        const sources = NavDest.readNavigationDestinationSources({
            lastRouteDestination: '51.5,-0.1',
            endElement: { dataset: { lat: '51.501', lon: '-0.141' } },
            polylineEnd: { lat: 52, lon: 0 },
        });
        expect(sources.lastRouteDestination).toBe('51.5,-0.1');
        expect(sources.endCoords).toEqual({ lat: 51.501, lon: -0.141 });
        expect(sources.polylineEnd).toEqual({ lat: 52, lon: 0 });
    });

    test('returns null endCoords when dataset missing', () => {
        const sources = NavDest.readNavigationDestinationSources({
            endElement: { dataset: {} },
        });
        expect(sources.endCoords).toBeNull();
    });
});

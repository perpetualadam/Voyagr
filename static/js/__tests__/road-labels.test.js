/**
 * @file Road Labels tests (REAL functions from static/js/maplibre-helpers.js)
 *
 * maplibre-helpers.js is a classic browser script that publishes window.MapLibreHelpers.
 * We execute the real file (which populates window.MapLibreHelpers) and assert the actual
 * configureRoadLabels / toggleRoadLabels / setRoadLabelZoomFilters behaviour against a fake
 * MapLibre map, instead of mocking the helper object and asserting the mocks.
 */

// Executing the module assigns window.MapLibreHelpers with the real implementation.
require('../maplibre-helpers.js');
const Helpers = window.MapLibreHelpers;

/** A fake MapLibre map whose style mirrors a Liberty/OpenMapTiles label set. */
function makeFakeMap({ styleLoaded = true } = {}) {
    const style = {
        layers: [
            { id: 'motorway-label', type: 'symbol', layout: { 'text-field': '{name}' } },
            { id: 'trunk-label', type: 'symbol', layout: { 'text-field': '{name}' } },
            { id: 'primary-label', type: 'symbol', layout: { 'text-field': '{name}' } },
            { id: 'secondary-label', type: 'symbol', layout: { 'text-field': '{name}' } },
            { id: 'street-label', type: 'symbol', layout: { 'text-field': '{name}' } },
            { id: 'water-name', type: 'symbol', layout: { 'text-field': '{name}' } }, // not a road
            { id: 'background', type: 'background', layout: {} },
        ],
    };
    const onceHandlers = {};
    return {
        style,
        onceHandlers,
        isStyleLoaded: jest.fn(() => styleLoaded),
        getStyle: jest.fn(() => style),
        setLayoutProperty: jest.fn(),
        setPaintProperty: jest.fn(),
        setLayerZoomRange: jest.fn(),
        once: jest.fn((event, cb) => { onceHandlers[event] = cb; }),
    };
}

describe('MapLibreHelpers road-label functions (real implementation)', () => {
    test('the real helper functions are exported', () => {
        expect(typeof Helpers.configureRoadLabels).toBe('function');
        expect(typeof Helpers.toggleRoadLabels).toBe('function');
        expect(typeof Helpers.setRoadLabelZoomFilters).toBe('function');
    });

    describe('configureRoadLabels', () => {
        test('sets visibility=visible on road label layers when enabled', () => {
            const map = makeFakeMap();
            Helpers.configureRoadLabels(map);
            const visCalls = map.setLayoutProperty.mock.calls.filter(c => c[1] === 'visibility');
            expect(visCalls.length).toBeGreaterThan(0);
            expect(visCalls.every(c => c[2] === 'visible')).toBe(true);
            // applies text colour too
            expect(map.setPaintProperty).toHaveBeenCalledWith(expect.any(String), 'text-color', '#000000');
        });

        test('sets visibility=none when enabled:false', () => {
            const map = makeFakeMap();
            Helpers.configureRoadLabels(map, { enabled: false });
            const visCalls = map.setLayoutProperty.mock.calls.filter(c => c[1] === 'visibility');
            expect(visCalls.every(c => c[2] === 'none')).toBe(true);
        });

        test('honours custom text colour', () => {
            const map = makeFakeMap();
            Helpers.configureRoadLabels(map, { textColor: '#ff0000' });
            expect(map.setPaintProperty).toHaveBeenCalledWith(expect.any(String), 'text-color', '#ff0000');
        });

        test('null map is handled gracefully', () => {
            expect(() => Helpers.configureRoadLabels(null)).not.toThrow();
        });

        test('defers via once(style.load) when the style is not loaded', () => {
            const map = makeFakeMap({ styleLoaded: false });
            Helpers.configureRoadLabels(map);
            expect(map.once).toHaveBeenCalledWith('style.load', expect.any(Function));
            expect(map.setLayoutProperty).not.toHaveBeenCalled();
            // Run the deferred callback -> now it applies.
            map.onceHandlers['style.load']();
            expect(map.setLayoutProperty).toHaveBeenCalled();
        });
    });

    describe('toggleRoadLabels', () => {
        test('hides road labels (visibility=none) when visible=false', () => {
            const map = makeFakeMap();
            Helpers.toggleRoadLabels(map, false);
            const visCalls = map.setLayoutProperty.mock.calls.filter(c => c[1] === 'visibility');
            expect(visCalls.length).toBeGreaterThan(0);
            expect(visCalls.every(c => c[2] === 'none')).toBe(true);
        });

        test('shows road labels (visibility=visible) when visible=true', () => {
            const map = makeFakeMap();
            Helpers.toggleRoadLabels(map, true);
            const visCalls = map.setLayoutProperty.mock.calls.filter(c => c[1] === 'visibility');
            expect(visCalls.every(c => c[2] === 'visible')).toBe(true);
        });

        test('does not target non-road symbol layers (e.g. water-name)', () => {
            const map = makeFakeMap();
            Helpers.toggleRoadLabels(map, false);
            const touchedIds = map.setLayoutProperty.mock.calls.map(c => c[0]);
            expect(touchedIds).not.toContain('water-name');
            expect(touchedIds).toContain('motorway-label');
        });

        test('null map is a no-op', () => {
            expect(() => Helpers.toggleRoadLabels(null, true)).not.toThrow();
        });
    });

    describe('setRoadLabelZoomFilters', () => {
        test('applies motorway zoom range to motorway labels', () => {
            const map = makeFakeMap();
            Helpers.setRoadLabelZoomFilters(map, { motorwayMinZoom: 5, mainRoadMinZoom: 9, streetMinZoom: 12 });
            const motorway = map.setLayerZoomRange.mock.calls.find(c => c[0] === 'motorway-label');
            const street = map.setLayerZoomRange.mock.calls.find(c => c[0] === 'street-label');
            expect(motorway[1]).toBe(5);
            expect(street[1]).toBe(12);
        });

        test('null map is a no-op', () => {
            expect(() => Helpers.setRoadLabelZoomFilters(null)).not.toThrow();
        });
    });
});

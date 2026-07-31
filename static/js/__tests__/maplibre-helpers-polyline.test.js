/**
 * @jest-environment jsdom
 * @file Polyline mount semantics from static/js/maplibre-helpers.js
 */

require('../maplibre-helpers.js');
const Helpers = window.MapLibreHelpers;

function makeFakeMap({ styleLoaded = true } = {}) {
    const style = {
        layers: [
            { id: 'road-label', type: 'symbol', layout: { 'text-field': '{name}' } },
        ],
    };
    const sources = {};
    const layers = {};
    return {
        style,
        isStyleLoaded: jest.fn(() => styleLoaded),
        getStyle: jest.fn(() => style),
        once: jest.fn(),
        getSource: jest.fn((id) => sources[id] || null),
        getLayer: jest.fn((id) => layers[id] || null),
        addSource: jest.fn((id, spec) => { sources[id] = spec; }),
        addLayer: jest.fn((spec) => { layers[spec.id] = spec; }),
        removeLayer: jest.fn((id) => { delete layers[id]; }),
        removeSource: jest.fn((id) => { delete sources[id]; }),
    };
}

describe('MapLibreHelpers polyline mount semantics', () => {
    test('isPolylineLayerMountOk treats pending and added layers as success', () => {
        expect(Helpers.isPolylineLayerMountOk({ _added: true })).toBe(true);
        expect(Helpers.isPolylineLayerMountOk({ _added: false, _pending: true })).toBe(true);
        expect(Helpers.isPolylineLayerMountOk({ _added: false })).toBe(false);
        expect(Helpers.isPolylineLayerMountOk(null)).toBe(false);
    });

    test('addPolyline returns a pending layer when style is not loaded', () => {
        const map = makeFakeMap({ styleLoaded: false });
        const layer = Helpers.addPolyline(map, [[51.5, -0.1], [51.6, -0.2]], { color: '#3388ff' });

        expect(layer._added).toBe(false);
        expect(layer._pending).toBe(true);
        expect(Helpers.isPolylineLayerMountOk(layer)).toBe(true);
        expect(map.once).toHaveBeenCalledWith('style.load', expect.any(Function));
        expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));
    });
});

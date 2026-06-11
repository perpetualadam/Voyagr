/**
 * @file UI Modules Unit Tests (REAL modules)
 *
 * Imports the real MapManager, ControlsManager, PanelsManager and createUISystem.
 * Controls/Panels are exercised against real jsdom elements; MapManager is exercised
 * against a minimal chainable Leaflet (`L`) test double so we assert the real wiring
 * (route/marker layers, fly-to) rather than re-implementing it.
 */

import {
    MapManager,
    ControlsManager,
    PanelsManager,
    createUISystem,
} from '../../modules/ui/index.js';

describe('ControlsManager (real module)', () => {
    let mgr, btn;
    beforeEach(() => {
        mgr = new ControlsManager();
        btn = document.createElement('button');
    });

    test('registerControl stores element and click handler', () => {
        const onClick = jest.fn();
        mgr.registerControl('go', btn, { onClick });
        btn.click();
        expect(mgr.getControl('go')).toBe(btn);
        expect(onClick).toHaveBeenCalled();
    });

    test('registerControl ignores a missing element', () => {
        mgr.registerControl('missing', null);
        expect(mgr.getAllControls().size).toBe(0);
    });

    test('disable/enable toggles disabled + class', () => {
        mgr.registerControl('go', btn);
        mgr.disableControl('go');
        expect(btn.disabled).toBe(true);
        expect(btn.classList.contains('disabled')).toBe(true);
        mgr.enableControl('go');
        expect(btn.disabled).toBe(false);
        expect(btn.classList.contains('disabled')).toBe(false);
    });

    test('show/hide toggles display', () => {
        mgr.registerControl('go', btn);
        mgr.hideControl('go');
        expect(btn.style.display).toBe('none');
        mgr.showControl('go');
        expect(btn.style.display).toBe('');
    });

    test('updateControlText sets textContent', () => {
        mgr.registerControl('go', btn);
        mgr.updateControlText('go', 'Start');
        expect(btn.textContent).toBe('Start');
    });

    test('clearControls empties the registry', () => {
        mgr.registerControl('go', btn);
        mgr.clearControls();
        expect(mgr.getAllControls().size).toBe(0);
    });
});

describe('PanelsManager (real module)', () => {
    let mgr, el;
    beforeEach(() => {
        mgr = new PanelsManager();
        el = document.createElement('div');
    });

    test('showPanel makes it visible and active', () => {
        mgr.registerPanel('settings', el);
        mgr.showPanel('settings');
        expect(el.style.display).toBe('block');
        expect(mgr.getActivePanels()).toContain('settings');
    });

    test('hidePanel hides and deactivates', () => {
        mgr.registerPanel('settings', el);
        mgr.showPanel('settings');
        mgr.hidePanel('settings');
        expect(el.style.display).toBe('none');
        expect(mgr.getActivePanels()).not.toContain('settings');
    });

    test('togglePanel flips visibility', () => {
        mgr.registerPanel('settings', el);
        mgr.togglePanel('settings');
        expect(mgr.getActivePanels()).toContain('settings');
        mgr.togglePanel('settings');
        expect(mgr.getActivePanels()).not.toContain('settings');
    });

    test('updatePanelContent sets innerHTML', () => {
        mgr.registerPanel('settings', el);
        mgr.updatePanelContent('settings', '<span>hi</span>');
        expect(el.innerHTML).toBe('<span>hi</span>');
    });

    test('closeAllPanels hides every active panel', () => {
        const el2 = document.createElement('div');
        mgr.registerPanel('a', el);
        mgr.registerPanel('b', el2);
        mgr.showPanel('a');
        mgr.showPanel('b');
        mgr.closeAllPanels();
        expect(mgr.getActivePanels()).toHaveLength(0);
    });

    test('operations on unknown panels are no-ops', () => {
        expect(() => mgr.showPanel('nope')).not.toThrow();
        expect(mgr.getActivePanels()).toHaveLength(0);
    });
});

describe('MapManager (real module, Leaflet test double)', () => {
    let layerStub;
    beforeEach(() => {
        layerStub = { addTo: jest.fn().mockReturnThis(), clearLayers: jest.fn(), bindPopup: jest.fn() };
        global.L = {
            map: jest.fn(() => ({
                setView: jest.fn().mockReturnThis(),
                fitBounds: jest.fn(),
                flyTo: jest.fn(),
                getCenter: () => ({ lat: 51.5, lng: -0.1 }),
            })),
            tileLayer: jest.fn(() => layerStub),
            featureGroup: jest.fn(() => layerStub),
            polyline: jest.fn(() => layerStub),
            marker: jest.fn(() => layerStub),
            icon: jest.fn(() => ({})),
            latLngBounds: jest.fn((c) => c),
        };
    });
    afterEach(() => { delete global.L; });

    test('initializeMap wires the map and layers when Leaflet is present', () => {
        const m = new MapManager();
        const map = m.initializeMap(51.5, -0.1);
        expect(map).not.toBeNull();
        expect(global.L.map).toHaveBeenCalledWith('map');
        expect(m.routeLayer).toBe(layerStub);
        expect(m.markerLayer).toBe(layerStub);
    });

    test('initializeMap returns null when Leaflet is missing', () => {
        delete global.L;
        const m = new MapManager();
        expect(m.initializeMap(51.5, -0.1)).toBeNull();
    });

    test('drawRoute is a no-op before init, draws after', () => {
        const m = new MapManager();
        expect(m.drawRoute([[51.5, -0.1]])).toBeUndefined();
        m.initializeMap(51.5, -0.1);
        m.drawRoute([[51.5, -0.1], [51.6, -0.2]]);
        expect(global.L.polyline).toHaveBeenCalled();
    });

    test('addMarker draws through markerLayer after init', () => {
        const m = new MapManager();
        m.initializeMap(51.5, -0.1);
        const marker = m.addMarker(51.5, -0.1, { popup: 'Here' });
        expect(global.L.marker).toHaveBeenCalled();
        expect(marker.bindPopup).toHaveBeenCalledWith('Here');
    });

    test('animateTo flies and updates zoom', () => {
        const m = new MapManager();
        m.initializeMap(51.5, -0.1);
        m.animateTo(52, -1, 16);
        expect(m.getZoom()).toBe(16);
    });

    test('getCenter maps lng -> lon', () => {
        const m = new MapManager();
        m.initializeMap(51.5, -0.1);
        expect(m.getCenter()).toEqual({ lat: 51.5, lon: -0.1 });
    });
});

describe('createUISystem (real factory)', () => {
    test('wires the three managers and reports stats', () => {
        const sys = createUISystem();
        expect(sys.map).toBeInstanceOf(MapManager);
        expect(sys.controls).toBeInstanceOf(ControlsManager);
        expect(sys.panels).toBeInstanceOf(PanelsManager);
        const stats = sys.getStats();
        expect(stats.controls.count).toBe(0);
        expect(stats.panels.count).toBe(0);
    });
});

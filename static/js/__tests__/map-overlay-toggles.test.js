/**
 * Tests for modules/map/map-overlay-toggles.js
 */
const OT = require('../modules/map/map-overlay-toggles.js');

describe('map-overlay-toggles module', () => {
    test('resolveShowCamerasEnabledFromStorage defaults on unless false', () => {
        expect(OT.resolveShowCamerasEnabledFromStorage(null)).toBe(true);
        expect(OT.resolveShowCamerasEnabledFromStorage('false')).toBe(false);
    });

    test('buildToggleShowCamerasExecutePlan persists and saves settings', () => {
        const execute = OT.buildToggleShowCamerasExecutePlan({ enabled: false });
        expect(execute.mapAction).toBe('clearCameraMarkers');
        expect(execute.saveAllSettings).toBe(true);
        expect(execute.storageKey).toBe(OT.SHOW_CAMERAS_STORAGE_KEY);
    });

    test('isOsmOverlayBboxTooLarge rejects wide viewport queries', () => {
        expect(OT.isOsmOverlayBboxTooLarge(1, 0, 1, 0)).toBe(true);
        expect(OT.isOsmOverlayBboxTooLarge(51.6, 51.5, 0.1, 0)).toBe(false);
    });

    test('buildFetchCamerasDispatchPlan requires min zoom', () => {
        const low = OT.buildFetchCamerasDispatchPlan({ enabled: true, hasMap: true, zoom: 8 });
        expect(low.shouldFetch).toBe(false);
        expect(low.clearMarkers).toBe(true);

        const ok = OT.buildFetchCamerasDispatchPlan({ enabled: true, hasMap: true, zoom: 12 });
        expect(ok.shouldFetch).toBe(true);
        expect(ok.apiPath).toBe(OT.CAMERAS_AREA_API_PATH);
    });

    test('buildFetchOsmOverlayDispatchPlan builds bounds URL', () => {
        const plan = OT.buildFetchOsmOverlayDispatchPlan({
            enabled: true,
            hasMap: true,
            zoom: 12,
            north: 51.52,
            south: 51.50,
            east: 0.02,
            west: 0,
            apiPath: OT.OSM_TRAFFIC_LIGHTS_AREA_API_PATH,
            logLabel: 'OSM Traffic Lights',
        });
        expect(plan.shouldFetch).toBe(true);
        expect(plan.url).toContain('north=51.52');
        expect(plan.url).toContain(OT.OSM_TRAFFIC_LIGHTS_AREA_API_PATH);
    });
});

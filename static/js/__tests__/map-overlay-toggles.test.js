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

    test('buildDisplayCameraMarkersCollectPlan dedupes locations', () => {
        const collect = OT.buildDisplayCameraMarkersCollectPlan([
            { lat: 51.5, lon: -0.1, type: 'camera_speed' },
            { lat: 51.5, lon: -0.1, type: 'camera_speed' },
            { lat: 51.51, lon: -0.11, type: 'camera_red_light' },
        ]);
        expect(collect.shouldDisplay).toBe(true);
        expect(collect.items.length).toBe(2);
    });

    test('buildInitializeCameraLayerExecutePlan wires debounce and toggles', () => {
        const init = OT.buildInitializeCameraLayerExecutePlan({
            hasMap: true,
            alreadyInitialized: false,
            showCamerasEnabled: true,
            showOsmTrafficLightsEnabled: false,
            showOsmRailwayCrossingsEnabled: true,
        });
        expect(init.shouldInit).toBe(true);
        expect(init.cameraMoveDebounceMs).toBe(500);
        expect(init.toggles.length).toBe(3);
        expect(init.initialFetches.cameras).toBe(true);
    });

    test('buildClearOverlayMarkersExecutePlan targets window marker arrays', () => {
        const clear = OT.buildClearCameraMarkersExecutePlan();
        expect(clear.markersProperty).toBe(OT.CAMERA_MARKERS_PROPERTY);
        expect(clear.resetMarkerArray).toBe(true);
    });

    test('buildOsmAreaOverlayResponsePlan skips non-OK HTTP responses', () => {
        const plan = OT.buildOsmAreaOverlayResponsePlan({
            ok: false,
            statusCode: 502,
            logLabel: 'OSM Traffic Lights',
        });
        expect(plan.shouldParseJson).toBe(false);
        expect(plan.logMessage).toContain('502');
    });

    test('buildCameraLayerMapMoveHandlerPlan wires debounced fetch actions', () => {
        const move = OT.buildCameraLayerMapMoveHandlerPlan({
            cameraMoveDebounceMs: 500,
            osmOverlayDebounceMs: 2000,
        });
        expect(move.cameraFetch.debounceMs).toBe(500);
        expect(move.osmOverlayFetch.fetchActions).toHaveLength(2);
    });
});

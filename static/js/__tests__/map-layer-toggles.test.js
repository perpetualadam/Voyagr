/**
 * Tests for modules/map/map-layer-toggles.js
 */
const MLT = require('../modules/map/map-layer-toggles.js');

describe('map-layer-toggles module', () => {
    test('resolveDefaultOnBooleanFromStorage defaults on unless false', () => {
        expect(MLT.resolveDefaultOnBooleanFromStorage(null, true)).toBe(true);
        expect(MLT.resolveDefaultOnBooleanFromStorage('true', true)).toBe(true);
        expect(MLT.resolveDefaultOnBooleanFromStorage('false', true)).toBe(false);
    });

    test('resolveBuildings3DEnabledFromStorage and resolveRoadLabelsEnabledFromStorage', () => {
        expect(MLT.resolveBuildings3DEnabledFromStorage(null)).toBe(true);
        expect(MLT.resolveBuildings3DEnabledFromStorage('false')).toBe(false);
        expect(MLT.resolveRoadLabelsEnabledFromStorage('false')).toBe(false);
    });

    test('parseBuildings3DHeightMultiplier and parseBuildings3DOpacity clamp values', () => {
        expect(MLT.parseBuildings3DHeightMultiplier('not-a-number')).toBe(MLT.BUILDINGS_3D_DEFAULT_HEIGHT);
        expect(MLT.parseBuildings3DHeightMultiplier(10)).toBe(3.0);
        expect(MLT.parseBuildings3DOpacity(0)).toBe(0.1);
        expect(MLT.parseBuildings3DOpacity(2)).toBe(1.0);
    });

    test('buildToggle3DBuildings plans flip state and persist storage', () => {
        const collected = MLT.buildToggle3DBuildingsCollectPlan({ currentlyEnabled: true });
        expect(collected.enabled).toBe(false);
        const execute = MLT.buildToggle3DBuildingsExecutePlan({
            enabled: collected.enabled,
            heightMultiplier: 1.5,
            opacity: 0.8,
        });
        expect(execute.mapAction).toBe('remove3DBuildings');
        expect(execute.storageValue).toBe('false');
        expect(execute.recomputeMapView3D).toBe(true);
    });

    test('buildToggleRoadLabelsExecutePlan wires toggle styles and map action', () => {
        const execute = MLT.buildToggleRoadLabelsExecutePlan({ enabled: true });
        expect(execute.mapAction).toBe('toggleRoadLabels');
        expect(execute.toggleInactiveStyles.inactiveBackground).toBe('#ccc');
        expect(execute.statusMessage).toContain('enabled');
    });

    test('buildToggleTrafficLayerExecutePlan uses toggle button storage format', () => {
        const execute = MLT.buildToggleTrafficLayerExecutePlan({ enabled: true });
        expect(execute.toggleId).toBe(MLT.SHOW_TRAFFIC_TOGGLE_ID);
        expect(execute.storageValue).toBe('true');
        expect(execute.mapAction).toBe('addTrafficLayer');
        expect(MLT.resolveShowTrafficEnabledFromStorage('false')).toBe(false);
    });

    test('buildTrafficTileUrlsPlan and raster specs', () => {
        const proxy = MLT.buildTrafficTileUrlsPlan({ useProxy: true, origin: 'https://app.test' });
        expect(proxy.hasTiles).toBe(true);
        expect(proxy.tiles[0]).toContain('/api/tomtom/traffic-tile/');

        const direct = MLT.buildTrafficTileUrlsPlan({ useProxy: false, apiKey: 'KEY' });
        expect(direct.tiles[0]).toContain('KEY');

        const source = MLT.buildTrafficRasterSourceSpec(direct.tiles);
        expect(source.type).toBe('raster');
        const layer = MLT.buildTrafficRasterLayerSpec({ beforeLayerId: 'labels' });
        expect(layer.source).toBe(MLT.TRAFFIC_SOURCE_ID);
    });

    test('buildVectorStyleReadyReconcilePlan re-applies labels and overlay resets', () => {
        const plan = MLT.buildVectorStyleReadyReconcilePlan({
            hasMap: true,
            hasMapLibreHelpers: true,
            roadLabelsStorageValue: 'false',
            showTrafficEnabled: true,
            showWeatherEnabled: false,
            hasTrafficLayerRef: true,
            mapHasTrafficLayer: false,
            hasWeatherLayerRef: false,
            mapHasWeatherLayer: false,
        });
        expect(plan.shouldRun).toBe(true);
        expect(plan.roadLabelsEnabled).toBe(false);
        expect(plan.resetTrafficLayerRef).toBe(true);
        expect(plan.addTrafficLayer).toBe(true);
        expect(plan.addWeatherLayer).toBe(false);
    });
});

/**
 * Tests for modules/map/map-view-3d.js
 */
const MV = require('../modules/map/map-view-3d.js');

describe('map-view-3d module', () => {
    test('resolveMapView3DEnabledFromStorage uses explicit value or granular fallback', () => {
        expect(MV.resolveMapView3DEnabledFromStorage('false', true)).toBe(false);
        expect(MV.resolveMapView3DEnabledFromStorage(null, true)).toBe(true);
        expect(MV.resolveMapView3DEnabledFromStorage(null, false)).toBe(false);
    });

    test('buildRecomputeMapView3DFromGranularExecutePlan ORs granular toggles', () => {
        const on = MV.buildRecomputeMapView3DFromGranularExecutePlan({
            driverPerspectiveEnabled: false,
            buildings3DEnabled: true,
        });
        expect(on.mapView3DEnabled).toBe(true);
        expect(on.storageValue).toBe('true');

        const off = MV.buildRecomputeMapView3DFromGranularExecutePlan({
            driverPerspectiveEnabled: false,
            buildings3DEnabled: false,
        });
        expect(off.mapView3DEnabled).toBe(false);
    });

    test('buildSetMapView3DExecutePlan bundles tilt and buildings', () => {
        const plan = MV.buildSetMapView3DExecutePlan(true, { heightMultiplier: 1.2, opacity: 0.5 });
        expect(plan.driverPerspectiveEnabled).toBe(true);
        expect(plan.buildings3DEnabled).toBe(true);
        expect(plan.mapBuildingsAction).toBe('add3DBuildings');
        expect(plan.heightMultiplier).toBe(1.2);
    });

    test('buildToggleDriverPerspectiveExecutePlan varies status by nav follow', () => {
        const nav = MV.buildToggleDriverPerspectiveExecutePlan({
            enabled: false,
            activeNavFollow: true,
        });
        expect(nav.statusMessage).toContain('during navigation');
    });

    test('buildSyncMapView3DToggleUIPlan wires all three toggles', () => {
        const plan = MV.buildSyncMapView3DToggleUIPlan({
            mapView3DEnabled: true,
            driverPerspectiveEnabled: true,
            buildings3DEnabled: false,
        });
        expect(plan.masterToggleId).toBe(MV.MAP_VIEW_3D_TOGGLE_ID);
        expect(plan.buildings3DEnabled).toBe(false);
    });
});

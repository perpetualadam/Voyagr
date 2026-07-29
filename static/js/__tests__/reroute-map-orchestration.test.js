/**
 * @jest-environment jsdom
 * @file Map recovery overlay redraw behaviour for GPS-only tracking.
 */

global.VoyagrMapTheme = {
    readStoredMapTheme: () => 'standard',
};
global.VoyagrGpsOrchestration = {
    getSnapBlendWeightState: () => 0,
    getSmoothDisplayLat: () => null,
    getSmoothDisplayLon: () => null,
};

const SG = require('../modules/navigation/speed-gps.js');
const RerouteMap = require('../app/reroute-map-orchestration.js');

describe('reroute-map-orchestration map recovery overlays', () => {
    let applyVehicleMarkerFromTickPlan;
    let redrawNavigationRouteLayerSpy;
    let updateTurnWidgetFromPosition;
    let routeInProgress;
    let isTrackingActive;
    let currentUserMarker;

    function bindRuntime() {
        applyVehicleMarkerFromTickPlan = jest.fn();
        updateTurnWidgetFromPosition = jest.fn();
        redrawNavigationRouteLayerSpy = jest.spyOn(RerouteMap, 'redrawNavigationRouteLayer').mockImplementation(() => {});
        routeInProgress = false;
        isTrackingActive = false;
        currentUserMarker = {
            heading: 45,
            speed: 12,
            accuracy: 8,
            setLngLat: jest.fn(),
            addTo: jest.fn(),
            _map: null,
        };

        RerouteMap.bind({
            getRouteInProgress: () => routeInProgress,
            getIsTrackingActive: () => isTrackingActive,
            getMap: () => ({ getBearing: () => 0 }),
            getCurrentLat: () => 51.5,
            getCurrentLon: () => -0.1,
            getCurrentUserMarker: () => currentUserMarker,
            getRoutePolyline: () => null,
            getLastSnappedRouteIndex: () => 0,
            speedGps: () => SG,
            routeGeometry: () => ({
                bearing: () => 45,
                blendHeadingsCircular: (g, r, b) => g + (r - g) * b,
            }),
            call: {
                resolveGpsRouteSnapForTick: () => null,
                applyVehicleMarkerFromTickPlan,
                updateTurnWidgetFromPosition,
            },
        });
    }

    beforeEach(() => {
        bindRuntime();
    });

    afterEach(() => {
        redrawNavigationRouteLayerSpy.mockRestore();
    });

    test('redrawNavigationVehicleMarker runs during GPS-only tracking without a route', () => {
        isTrackingActive = true;

        RerouteMap.redrawNavigationVehicleMarker('style.load');

        expect(applyVehicleMarkerFromTickPlan).toHaveBeenCalledTimes(1);
        expect(currentUserMarker.addTo).toHaveBeenCalledTimes(1);
    });

    test('redrawNavigationVehicleMarker follows current GPS instead of stale smooth coords', () => {
        isTrackingActive = true;
        global.VoyagrGpsOrchestration.getSmoothDisplayLat = () => 51.4;
        global.VoyagrGpsOrchestration.getSmoothDisplayLon = () => -0.2;

        RerouteMap.redrawNavigationVehicleMarker('foreground resume');

        expect(applyVehicleMarkerFromTickPlan).toHaveBeenCalledTimes(1);
        const markerTick = applyVehicleMarkerFromTickPlan.mock.calls[0][0];
        // Current GPS from runtime is 51.5/-0.1; must not stay pinned at smooth 51.4/-0.2.
        expect(markerTick.action).toBe('update');
        // Blends toward current GPS (urgent jump), not pinned at stale smooth coords.
        expect(markerTick.lngLat[1]).toBeGreaterThan(51.45);
        expect(markerTick.lngLat[0]).toBeGreaterThan(-0.15);
        expect(markerTick.lngLat[1]).not.toBeCloseTo(51.4, 3);
        expect(markerTick.lngLat[0]).not.toBeCloseTo(-0.2, 3);
    });

    test('redrawNavigationVehicleMarker skips when neither route nor tracking is active', () => {
        RerouteMap.redrawNavigationVehicleMarker('style.load');

        expect(applyVehicleMarkerFromTickPlan).not.toHaveBeenCalled();
        expect(currentUserMarker.addTo).not.toHaveBeenCalled();
    });

    test('redrawNavigationOverlaysAfterMapRecovery redraws marker but not route during GPS-only tracking', () => {
        isTrackingActive = true;

        RerouteMap.redrawNavigationOverlaysAfterMapRecovery('style.load');

        expect(redrawNavigationRouteLayerSpy).not.toHaveBeenCalled();
        expect(applyVehicleMarkerFromTickPlan).toHaveBeenCalledTimes(1);
        expect(updateTurnWidgetFromPosition).toHaveBeenCalledWith(51.5, -0.1);
    });

    test('redrawNavigationOverlaysAfterMapRecovery retries route remount during navigation', () => {
        jest.useFakeTimers();
        routeInProgress = true;
        global.VoyagrMapRecovery = {
            buildNavOverlayRedrawRetryDelaysMs: () => [100, 200],
        };

        const guardPlan = jest.fn(() => ({ shouldRedraw: true }));
        const mountPlan = jest.fn(() => ({
            polyline: [[-0.1, 51.5], [-0.2, 51.6]],
            style: { color: '#2563EB', weight: 8 },
        }));
        const addPolyline = jest.fn(() => ({ remove: jest.fn() }));
        const bringNavRouteAboveTrafficEdges = jest.fn();
        let routeLayer = { remove: jest.fn() };

        RerouteMap.bind({
            getRouteInProgress: () => routeInProgress,
            getIsTrackingActive: () => false,
            getMap: () => ({ getBearing: () => 0 }),
            getCurrentLat: () => 51.5,
            getCurrentLon: () => -0.1,
            getCurrentUserMarker: () => currentUserMarker,
            getRoutePolyline: () => [[51.5, -0.1], [51.6, -0.2]],
            getLastSnappedRouteIndex: () => 0,
            getRouteLayer: () => routeLayer,
            setRouteLayer: (layer) => { routeLayer = layer; },
            speedGps: () => SG,
            routeGeometry: () => ({
                bearing: () => 45,
                blendHeadingsCircular: (g, r, b) => g + (r - g) * b,
            }),
            routeSelection: () => ({
                buildNavRouteLayerRedrawGuardPlan: guardPlan,
                buildNavActiveRouteLayerMountPlan: mountPlan,
                buildNavActiveRoutePolylineStyle: () => ({ color: '#2563EB', weight: 8 }),
            }),
            getMapLibreHelpers: () => ({ addPolyline }),
            call: {
                resolveGpsRouteSnapForTick: () => null,
                applyVehicleMarkerFromTickPlan,
                updateTurnWidgetFromPosition,
                bringNavRouteAboveTrafficEdges,
                navActiveRouteColor: () => '#2563EB',
            },
        });

        RerouteMap.redrawNavigationOverlaysAfterMapRecovery('soft style reload');
        expect(addPolyline).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(100);
        expect(addPolyline).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(100);
        expect(addPolyline).toHaveBeenCalledTimes(3);

        delete global.VoyagrMapRecovery;
        jest.useRealTimers();
    });
});

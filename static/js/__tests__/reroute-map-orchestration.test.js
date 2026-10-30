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

        const {bindTransition,makeRoute}=require('./fixtures/navigation-transition.cjs');
        const Life=require('../app/navigation-lifecycle-orchestration.js');
        const Compare=require('../app/route-comparison-orchestration.js');
        const AI=require('../modules/navigation/avoidance-integrity.js');
        Life.setRouteInProgress(false);const candidate=makeRoute('recovery');
        candidate.polyline=AI.prepareNavigationCandidate(candidate).polyline;
        Compare.setRouteOptions([candidate]);window.lastCalculatedRoute=candidate;
        Life.setRoutePolyline(candidate.polyline);Life.setCurrentRouteSteps(candidate.maneuvers);Life.setRouteInProgress(true);
        const context=bindTransition();const addPolyline=context.addPolyline;
        Object.assign(context.runtime,{getIsTrackingActive:()=>false,getCurrentUserMarker:()=>currentUserMarker,
            speedGps:()=>SG,routeGeometry:()=>({bearing:()=>45,blendHeadingsCircular:(g,r,b)=>g+(r-g)*b}),
            call:{...context.runtime.call,resolveGpsRouteSnapForTick:()=>null,applyVehicleMarkerFromTickPlan,updateTurnWidgetFromPosition}});
        expect(RerouteMap.authoriseCurrentRouteRedraw()).toBe(true);

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

describe('reroute-map-orchestration updateRouteOnMap runtime accessors', () => {
    const RD = require('../modules/navigation/reroute-decision.js');

    afterEach(() => {
        RerouteMap.setRouteJoinConfirmedForDeviation(false);
    });

    const {bindTransition,makeRoute}=require('./fixtures/navigation-transition.cjs');
    const Life=require('../app/navigation-lifecycle-orchestration.js');
    function bindUpdateRouteRuntime(overrides) {
        localStorage.clear();Life.setRouteInProgress(overrides.routeInProgress);
        const context=bindTransition({gps:overrides.hasGps!==false});
        const buildRouteMapUpdateStatePlan=jest.fn((...args)=>RD.buildRouteMapUpdateStatePlan(...args));
        context.runtime.rerouteDecision=()=>({...RD,buildRouteMapUpdateStatePlan});
        expect(context.runtime.g).toBeUndefined();
        RerouteMap.bind(context.runtime);
        return {buildRouteMapUpdateStatePlan};
    }

    test('updateRouteOnMap uses getRouteInProgress (no g helper) and seeds join during nav', () => {
        const { buildRouteMapUpdateStatePlan } = bindUpdateRouteRuntime({ routeInProgress: true });

        const result = RerouteMap.updateRouteOnMap(makeRoute('synthetic-gh'));

        expect(result).toEqual({ ok: true });
        expect(buildRouteMapUpdateStatePlan).toHaveBeenCalled();
        const opts = buildRouteMapUpdateStatePlan.mock.calls[0][2];
        expect(opts.seedRouteJoinConfirmed).toBe(true);
        expect(opts.hasCurrentGps).toBe(true);
        expect(RerouteMap.getRouteJoinConfirmedForDeviation()).toBe(true);
    });

    test('updateRouteOnMap does not seed join when navigation is inactive', () => {
        const { buildRouteMapUpdateStatePlan } = bindUpdateRouteRuntime({ routeInProgress: false });

        const result = RerouteMap.updateRouteOnMap(makeRoute('synthetic-idle'));

        expect(result).toEqual({ ok: true });
        const opts = buildRouteMapUpdateStatePlan.mock.calls[0][2];
        expect(opts.seedRouteJoinConfirmed).toBe(false);
        expect(RerouteMap.getRouteJoinConfirmedForDeviation()).toBe(false);
    });
});

describe('buildRouteRequest avoid-tolls dependency (PWA-01)', () => {
    const RR = require('../modules/navigation/routing-request.js');

    function bindBuildRouteRequest(isAvoidTollsEnabled) {
        const avoidFn = jest.fn(isAvoidTollsEnabled);
        RerouteMap.bind({
            routingRequest: () => RR,
            getCurrentRoutingMode: () => 'auto',
            getCurrentVehicleType: () => 'petrol_diesel',
            call: {
                getRouteCostParams: () => ({ fuel_price: 1.5 }),
                isAvoidTollsEnabled: avoidFn,
                getRoutePreferences: () => ({}),
            },
        });
        return avoidFn;
    }

    test('traffic reroute with toll avoidance enabled does not throw avoidTollsFn', () => {
        const avoidFn = bindBuildRouteRequest(() => true);

        let body;
        expect(() => {
            body = RerouteMap.buildRouteRequest(51.5, -0.1, '52.0,0.0');
        }).not.toThrow();

        expect(body.avoid_tolls).toBe(true);
        expect(body.is_reroute).toBe(true);
        expect(avoidFn).toHaveBeenCalled();
        expect(typeof avoidFn.mock.results[0].value).toBe('boolean');
    });

    test('traffic reroute with toll avoidance disabled keeps avoid_tolls false', () => {
        bindBuildRouteRequest(() => false);

        const body = RerouteMap.buildRouteRequest(51.5, -0.1, '52.0,0.0');

        expect(body.avoid_tolls).toBe(false);
        expect(body.is_reroute).toBe(true);
    });

    test('PWA-04: deviation reroute origin is the current GPS pair, not a stale start', () => {
        bindBuildRouteRequest(() => false);
        const body = RerouteMap.buildRouteRequest(53.43012, -1.35045, '53.52200,-1.12800');
        expect(body.start).toBe('53.43012,-1.35045');
        expect(body.end).toBe('53.52200,-1.12800');
        expect(body.is_reroute).toBe(true);
        expect(body.start).not.toContain('51.5074');
    });

    test('passes the isAvoidTollsEnabled function, not its boolean result', () => {
        const avoidFn = bindBuildRouteRequest(() => true);
        const collectSpy = jest.spyOn(RR, 'buildRouteRequestCollectPlan');

        RerouteMap.buildRouteRequest(51.5, -0.1, '52.0,0.0', [{ lat: 51.6, lon: 0 }]);

        expect(collectSpy).toHaveBeenCalledTimes(1);
        expect(collectSpy.mock.calls[0][0].isAvoidTollsEnabled).toBe(avoidFn);
        expect(typeof collectSpy.mock.calls[0][0].isAvoidTollsEnabled).toBe('function');
        collectSpy.mockRestore();
    });
});

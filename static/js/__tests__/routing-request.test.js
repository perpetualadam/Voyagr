/**
 * Behaviour tests for modules/navigation/routing-request.js.
 * Asserts the shared /api/route preference block the app must send (hazard/avoidance/cost/
 * preference mapping), matching what calculateRoute and buildRouteRequest previously built inline.
 */
const RR = require('../modules/navigation/routing-request.js');

function baseOpts(overrides) {
    return Object.assign({
        routingMode: 'auto',
        vehicleType: 'petrol_diesel',
        costParams: { fuel_efficiency: 6.0, fuel_price: 1.5 },
        enableHazardAvoidance: true,
        avoidCameras: true,
        avoidCaz: true,
        avoidTrafficLights: true,
        avoidRailwayCrossings: true,
        avoidTolls: false,
        avoidMotorways: false,
        avoidFerries: false,
        routePrefs: {},
    }, overrides || {});
}

describe('routing-request module surface', () => {
    test('exposes buildSharedRouteOptions', () => {
        expect(typeof RR.buildSharedRouteOptions).toBe('function');
    });
});

describe('buildSharedRouteOptions', () => {
    test('maps mode, vehicle and spreads cost params verbatim', () => {
        const o = RR.buildSharedRouteOptions(baseOpts());
        expect(o.routing_mode).toBe('auto');
        expect(o.vehicle_type).toBe('petrol_diesel');
        expect(o.fuel_efficiency).toBe(6.0);
        expect(o.fuel_price).toBe(1.5);
    });

    test('passes through the resolved mode/vehicle without imposing fallbacks', () => {
        const o = RR.buildSharedRouteOptions(baseOpts({ routingMode: 'pedestrian', vehicleType: 'electric' }));
        expect(o.routing_mode).toBe('pedestrian');
        expect(o.vehicle_type).toBe('electric');
    });

    test('coerces avoidance flags to booleans', () => {
        const o = RR.buildSharedRouteOptions(baseOpts({
            avoidCameras: false, avoidTolls: true, avoidMotorways: true, avoidFerries: true,
        }));
        expect(o.avoid_cameras).toBe(false);
        expect(o.avoid_caz).toBe(true);
        expect(o.avoid_traffic_lights).toBe(true);
        expect(o.avoid_railway_crossings).toBe(true);
        expect(o.avoid_tolls).toBe(true);
        expect(o.avoid_motorways).toBe(true);
        expect(o.avoid_ferries).toBe(true);
        expect(o.enable_hazard_avoidance).toBe(true);
    });

    test('defaults route preferences when routePrefs is empty', () => {
        const o = RR.buildSharedRouteOptions(baseOpts({ routePrefs: {} }));
        expect(o.prefer_scenic).toBe(false);
        expect(o.prefer_quiet).toBe(false);
        expect(o.avoid_unpaved).toBe(false);
        expect(o.route_optimization).toBe('fastest');
        expect(o.max_detour).toBe(20);
    });

    test('honours provided route preferences', () => {
        const o = RR.buildSharedRouteOptions(baseOpts({
            routePrefs: {
                preferScenic: true, preferQuiet: true, avoidUnpaved: true,
                routeOptimization: 'scenic', maxDetour: 35,
            },
        }));
        expect(o.prefer_scenic).toBe(true);
        expect(o.prefer_quiet).toBe(true);
        expect(o.avoid_unpaved).toBe(true);
        expect(o.route_optimization).toBe('scenic');
        expect(o.max_detour).toBe(35);
    });

    test('max_detour falls back to 20 when not a number', () => {
        const o = RR.buildSharedRouteOptions(baseOpts({ routePrefs: { maxDetour: 'nope' } }));
        expect(o.max_detour).toBe(20);
    });

    test('does not emit path-specific keys (start/end/via_points/avoid_points)', () => {
        const o = RR.buildSharedRouteOptions(baseOpts());
        expect(o).not.toHaveProperty('start');
        expect(o).not.toHaveProperty('end');
        expect(o).not.toHaveProperty('via_points');
        expect(o).not.toHaveProperty('avoid_points');
        expect(o).not.toHaveProperty('include_tolls');
    });
});

function mockStorage(map) {
    return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    };
}

describe('hazard avoidance helpers', () => {
    test('isInitialRouteHazardAvoidanceEnabled defaults cameras on', () => {
        expect(RR.isInitialRouteHazardAvoidanceEnabled(mockStorage({}))).toBe(true);
    });

    test('isInitialRouteHazardAvoidanceEnabled true when live hazard pref set', () => {
        expect(RR.isInitialRouteHazardAvoidanceEnabled(mockStorage({
            pref_cameras: 'false',
            pref_caz: 'false',
            pref_trafficLightsAvoid: 'false',
            pref_railwayCrossingsAvoid: 'false',
            pref_police: 'true',
        }))).toBe(true);
    });

    test('isMultimodalLegHazardAvoidanceEnabled ignores CAZ', () => {
        expect(RR.isMultimodalLegHazardAvoidanceEnabled(mockStorage({
            pref_cameras: 'false',
            pref_caz: 'true',
            pref_trafficLightsAvoid: 'false',
            pref_railwayCrossingsAvoid: 'false',
        }))).toBe(false);
    });

    test('isRerouteHazardAvoidanceEnabled includes avoid tolls', () => {
        expect(RR.isRerouteHazardAvoidanceEnabled(
            mockStorage({
                pref_cameras: 'false',
                pref_trafficLightsAvoid: 'false',
                pref_railwayCrossingsAvoid: 'false',
                pref_caz: 'false',
            }),
            () => true
        )).toBe(true);
    });
});

describe('normalizeAvoidPoints', () => {
    test('filters invalid points and caps at 10', () => {
        const pts = Array.from({ length: 12 }, (_, i) => ({ lat: i, lon: i }));
        const out = RR.normalizeAvoidPoints([{ lat: NaN, lon: 1 }, null, ...pts]);
        expect(out).toHaveLength(10);
        expect(out[0]).toEqual({ lat: 0, lon: 0 });
        expect(out[9]).toEqual({ lat: 9, lon: 9 });
    });

    test('returns empty array for non-array input', () => {
        expect(RR.normalizeAvoidPoints(null)).toEqual([]);
    });
});

describe('buildRerouteRequestBody', () => {
    test('combines start/end, avoid_points, include flags and shared options', () => {
        const body = RR.buildRerouteRequestBody({
            startLat: 51.5,
            startLon: -0.1,
            destination: '51.6,-0.2',
            avoidPoints: [{ lat: 1, lon: 2 }],
            includeTolls: true,
            includeCaz: false,
            sharedOptions: baseOpts({ routingMode: 'auto', avoidTolls: true }),
        });
        expect(body.start).toBe('51.5,-0.1');
        expect(body.end).toBe('51.6,-0.2');
        expect(body.avoid_points).toEqual([{ lat: 1, lon: 2 }]);
        expect(body.include_tolls).toBe(true);
        expect(body.include_caz).toBe(false);
        expect(body.routing_mode).toBe('auto');
        expect(body.avoid_tolls).toBe(true);
    });
});

describe('multimodal route bodies', () => {
    test('buildMultimodalDrivingLegBody maps driving leg fields', () => {
        const body = RR.buildMultimodalDrivingLegBody({
            startLat: 51.5, startLon: -0.1, endLat: 51.51, endLon: -0.11,
            vehicleType: 'petrol_diesel',
            costParams: { fuel_price: 1.5 },
            includeTolls: true, avoidTolls: false, avoidCaz: true,
            enableHazardAvoidance: true,
            avoidCameras: true, avoidTrafficLights: true, avoidRailwayCrossings: false,
        });
        expect(body.routing_mode).toBe('auto');
        expect(body.fuel_price).toBe(1.5);
        expect(body.enable_hazard_avoidance).toBe(true);
        expect(body.avoid_railway_crossings).toBe(false);
    });

    test('buildMultimodalWalkingLegBody maps pedestrian leg fields', () => {
        const body = RR.buildMultimodalWalkingLegBody({
            startLat: 51.51, startLon: -0.11, endLat: 51.52, endLon: -0.12,
            enableHazardAvoidance: true,
            avoidCameras: true, avoidTrafficLights: true, avoidRailwayCrossings: true,
        });
        expect(body.routing_mode).toBe('pedestrian');
        expect(body.vehicle_type).toBe('pedestrian');
        expect(body.avoid_cameras).toBe(true);
        expect(body).not.toHaveProperty('include_tolls');
    });
});

describe('multi-drop and initial route helpers', () => {
    test('mapViaPointsForApi adds type via', () => {
        expect(RR.mapViaPointsForApi([{ lat: 1, lon: 2, name: 'A' }]))
            .toEqual([{ lat: 1, lon: 2, name: 'A', type: 'via' }]);
    });

    test('mapStopsForApi defaults duration to 15', () => {
        expect(RR.mapStopsForApi([{ lat: 1, lon: 2, name: 'Stop' }]))
            .toEqual([{ lat: 1, lon: 2, name: 'Stop', type: 'stop', duration: 15 }]);
    });

    test('sumStopDurationsMinutes totals stop durations', () => {
        expect(RR.sumStopDurationsMinutes([{ duration: 10 }, {}])).toBe(25);
    });

    test('resolveLiveGpsStartCoord uses live GPS when navigating', () => {
        expect(RR.resolveLiveGpsStartCoord({
            routeInProgress: true,
            isTrackingActive: true,
            trackingHistory: [{}],
            currentLat: 51.5,
            currentLon: -0.1,
            geocodedStart: '51.0,-0.2',
        })).toBe('51.5,-0.1');
    });

    test('resolveLiveGpsStartCoord falls back to geocoded start', () => {
        expect(RR.resolveLiveGpsStartCoord({
            routeInProgress: false,
            geocodedStart: '51.0,-0.2',
        })).toBe('51.0,-0.2');
    });

    test('buildInitialRouteRequestBody includes multi-drop fields', () => {
        const body = RR.buildInitialRouteRequestBody({
            start: '51.5,-0.1',
            end: '51.6,-0.2',
            viaPoints: [{ lat: 51.55, lon: -0.15 }],
            stops: [{ lat: 51.56, lon: -0.16, duration: 20 }],
            optimizeStopOrder: true,
            roundTrip: false,
            departureTime: '08:00',
            sharedOptions: baseOpts(),
        });
        expect(body.start).toBe('51.5,-0.1');
        expect(body.via_points).toHaveLength(1);
        expect(body.stops[0].duration).toBe(20);
        expect(body.optimize_stop_order).toBe(true);
        expect(body.departure_time).toBe('08:00');
        expect(body.routing_mode).toBe('auto');
    });

    test('readMultimodalLegAvoidancePrefs and driving storage prefs', () => {
        const storage = mockStorage({
            pref_cameras: 'false',
            pref_trafficLightsAvoid: 'true',
            pref_railwayCrossingsAvoid: 'false',
            includeTolls: 'false',
            pref_caz: 'true',
        });
        const leg = RR.readMultimodalLegAvoidancePrefs(storage);
        expect(leg.avoidCameras).toBe(false);
        expect(leg.avoidTrafficLights).toBe(true);
        expect(leg.enableHazardAvoidance).toBe(true);
        const driving = RR.readMultimodalDrivingLegStoragePrefs(storage, true);
        expect(driving.includeTolls).toBe(false);
        expect(driving.avoidTolls).toBe(true);
        expect(driving.avoidCaz).toBe(true);
    });

    test('buildInitialRouteSharedOptions and buildRerouteSharedOptions read common flags', () => {
        const storage = mockStorage({
            pref_cameras: 'false',
            pref_avoid_motorways: 'true',
            pref_avoid_ferries: 'true',
            includeTolls: 'true',
            includeCAZ: 'false',
        });
        const initial = RR.buildInitialRouteSharedOptions(storage, {
            routingMode: 'auto',
            vehicleType: 'petrol_diesel',
            costParams: { fuel_price: 1.5 },
            avoidTolls: true,
            routePrefs: { preferScenic: true },
        });
        expect(initial.avoidCameras).toBe(false);
        expect(initial.avoidMotorways).toBe(true);
        expect(initial.enableHazardAvoidance).toBe(true);
        const reroute = RR.buildRerouteSharedOptions(storage, {
            routingMode: 'auto',
            vehicleType: 'petrol_diesel',
            costParams: {},
            isAvoidTollsEnabled: function () { return false; },
            routePrefs: {},
        });
        expect(reroute.avoidFerries).toBe(true);
        expect(RR.readRerouteIncludeFlags(storage).includeCaz).toBe(false);
    });
});

describe('route API error parsing', () => {
    test('isRouteApiJsonContentType detects JSON responses', () => {
        expect(RR.isRouteApiJsonContentType('application/json')).toBe(true);
        expect(RR.isRouteApiJsonContentType('application/json; charset=utf-8')).toBe(true);
        expect(RR.isRouteApiJsonContentType('text/html')).toBe(false);
        expect(RR.isRouteApiJsonContentType(null)).toBe(false);
    });

    test('buildNonJsonRouteApiErrorMessage maps gateway and timeout bodies', () => {
        expect(RR.buildNonJsonRouteApiErrorMessage(504, '')).toContain('Gateway Timeout');
        expect(RR.buildNonJsonRouteApiErrorMessage(502, '')).toContain('Bad Gateway');
        expect(RR.buildNonJsonRouteApiErrorMessage(500, '')).toContain('Internal Server Error');
        expect(RR.buildNonJsonRouteApiErrorMessage(503, 'upstream Timeout')).toContain('timed out');
    });

    test('parseRouteApiErrorMessage prefers JSON error field', () => {
        expect(RR.parseRouteApiErrorMessage(400, JSON.stringify({ error: '  Bad coords  ' }))).toBe('Bad coords');
        expect(RR.parseRouteApiErrorMessage(408, '{}')).toContain('timed out');
        expect(RR.buildRouteApiHttpErrorMessage(418, '')).toContain('418');
    });

    test('getDegradedRoutingStatusMessage warns about offline engines', () => {
        expect(RR.getDegradedRoutingStatusMessage()).toContain('Valhalla/GraphHopper offline');
    });
});

describe('buildCalculateRouteApiPlan', () => {
    test('assembles request body, live GPS start, and multi-drop metadata', () => {
        const storage = mockStorage({
            pref_optimizeStopOrder: 'false',
            pref_roundTrip: 'true',
            pref_departureTime: '08:30',
            pref_avoidCameras: 'true',
        });
        const plan = RR.buildCalculateRouteApiPlan({
            storage,
            geocodedStart: '51.5,-0.1',
            geocodedEnd: '52,-1',
            viaPoints: [{ lat: 51.6, lon: -0.2 }],
            stops: [{ lat: 51.7, lon: -0.3, duration: 10 }],
            routingMode: 'auto',
            vehicleType: 'petrol_diesel',
            costParams: { fuel_efficiency: 6, fuel_price: 1.5 },
            avoidTolls: false,
            routePrefs: { routeOptimization: 'quiet' },
            routeInProgress: true,
            isTrackingActive: true,
            trackingHistory: [{ lat: 51.51, lon: -0.11 }],
            currentLat: 51.51,
            currentLon: -0.11,
        });
        expect(plan.routeStartCoordStr).toBe('51.51,-0.11');
        expect(plan.requestBody.start).toBe('51.51,-0.11');
        expect(plan.requestBody.end).toBe('52,-1');
        expect(plan.requestBody.optimize_stop_order).toBe(false);
        expect(plan.requestBody.round_trip).toBe(true);
        expect(plan.requestBody.departure_time).toBe('08:30');
        expect(plan.requestBody.routing_mode).toBe('auto');
        expect(plan.requestBody.route_optimization).toBe('quiet');
        expect(plan.viaPointsCount).toBe(1);
        expect(plan.stopsCount).toBe(1);
        expect(plan.totalStopTimeMinutes).toBe(10);
        expect(plan.optimizeStopOrder).toBe(false);
        expect(plan.roundTrip).toBe(true);
    });

    test('uses geocoded start when live GPS is unavailable', () => {
        const plan = RR.buildCalculateRouteApiPlan({
            storage: mockStorage({}),
            geocodedStart: '51.5,-0.1',
            geocodedEnd: '52,-1',
            routingMode: 'auto',
            vehicleType: 'petrol_diesel',
            costParams: {},
            avoidTolls: false,
            routePrefs: {},
            routeInProgress: false,
            isTrackingActive: false,
            trackingHistory: [],
            currentLat: null,
            currentLon: null,
        });
        expect(plan.routeStartCoordStr).toBe('51.5,-0.1');
        expect(plan.requestBody.start).toBe('51.5,-0.1');
    });
});

describe('buildCalculateRouteApiInputCollectPlan', () => {
    test('collects runtime state for API orchestration', () => {
        const collect = RR.buildCalculateRouteApiInputCollectPlan({
            storage: mockStorage({}),
            geocodedStart: '51.5,-0.1',
            geocodedEnd: '52,-1',
            viaPoints: [{ lat: 51.6, lon: -0.2 }],
            stops: [],
            routingMode: 'auto',
            vehicleType: 'petrol_diesel',
            costParams: { fuel_efficiency: 6 },
            avoidTolls: true,
            routePrefs: { routeOptimization: 'fastest' },
            routeInProgress: false,
            isTrackingActive: false,
            trackingHistory: [],
            currentLat: null,
            currentLon: null,
        });
        expect(collect.geocodedStart).toBe('51.5,-0.1');
        expect(collect.viaPoints).toHaveLength(1);
        expect(collect.avoidTolls).toBe(true);
    });

    test('buildCalculateRouteApiOrchestrationPlan bundles route and fetch plans', () => {
        const orch = RR.buildCalculateRouteApiOrchestrationPlan(
            RR.buildCalculateRouteApiInputCollectPlan({
                storage: mockStorage({}),
                geocodedStart: '51.5,-0.1',
                geocodedEnd: '52,-1',
                routingMode: 'auto',
                vehicleType: 'petrol_diesel',
                costParams: {},
                avoidTolls: false,
                routePrefs: {},
            })
        );
        expect(orch.routePlan.requestBody.start).toBe('51.5,-0.1');
        expect(orch.fetchPlan.apiPath).toBe('/api/route');
        expect(orch.requestLog.requestLogPrefix).toContain('/api/route');
    });
});

describe('buildRouteApiResultPlan', () => {
    test('maps success, degraded routing, and error payloads', () => {
        const ok = RR.buildRouteApiResultPlan({
            success: true,
            source: 'valhalla',
            geometry: 'abc',
            distance: '12 km',
            time: '20 min',
            routes: [{}, {}],
        });
        expect(ok.success).toBe(true);
        expect(ok.routingDegraded).toBe(false);
        expect(ok.errorMessage).toBeNull();
        expect(ok.responseLogMeta.routesCount).toBe(2);

        const degraded = RR.buildRouteApiResultPlan({
            success: true,
            routing_degraded: true,
            routing_warning: 'fallback',
            engines_failed: { valhalla: true },
        });
        expect(degraded.routingDegraded).toBe(true);
        expect(degraded.degradedLogWarning.warning).toBe('fallback');

        const fail = RR.buildRouteApiResultPlan({ success: false, error: 'bad coords' });
        expect(fail.errorMessage).toBe('Error: bad coords');
    });
});

describe('buildCalculateRouteDispatchPlan', () => {
    test('routes API errors to the error branch', () => {
        const plan = RR.buildCalculateRouteDispatchPlan(
            RR.buildRouteApiResultPlan({ success: false, error: 'bad coords' }),
            false
        );
        expect(plan.branch).toBe('error');
        expect(plan.hideRouteProgressBar).toBe(true);
        expect(plan.statusMessage).toBe('Error: bad coords');
        expect(plan.statusType).toBe('error');
    });

    test('routes successful in-nav responses to in_nav_reroute branch', () => {
        const apiPlan = RR.buildRouteApiResultPlan({ success: true, source: 'valhalla' });
        const plan = RR.buildCalculateRouteDispatchPlan(apiPlan, true);
        expect(plan.branch).toBe('in_nav_reroute');
        expect(plan.hideRouteProgressBar).toBe(true);
        expect(plan.degradedStatusMessage).toBeNull();
    });

    test('routes successful idle responses to idle_preview with degraded warning', () => {
        const apiPlan = RR.buildRouteApiResultPlan({
            success: true,
            routing_degraded: true,
            routing_warning: 'fallback',
        });
        const plan = RR.buildCalculateRouteDispatchPlan(apiPlan, false);
        expect(plan.branch).toBe('idle_preview');
        expect(plan.degradedStatusMessage).toContain('Basic route only');
        expect(plan.degradedLogWarning.warning).toBe('fallback');
    });
});

describe('buildCalculateRoutePreflightPlan', () => {
    test('blocks missing inputs and empty locations', () => {
        expect(RR.buildCalculateRoutePreflightPlan({
            hasStartInput: false,
            hasEndInput: true,
            start: 'A',
            end: 'B',
            isGeocoding: false,
        }).branch).toBe('missing_inputs');

        const empty = RR.buildCalculateRoutePreflightPlan({
            hasStartInput: true,
            hasEndInput: true,
            start: '',
            end: 'B',
            isGeocoding: false,
        });
        expect(empty.branch).toBe('empty_locations');
        expect(empty.statusMessage).toContain('both start and end');
    });

    test('blocks concurrent geocoding and allows proceed', () => {
        const busy = RR.buildCalculateRoutePreflightPlan({
            hasStartInput: true,
            hasEndInput: true,
            start: 'A',
            end: 'B',
            isGeocoding: true,
        });
        expect(busy.branch).toBe('geocoding_busy');
        expect(busy.statusType).toBe('loading');

        const ok = RR.buildCalculateRoutePreflightPlan({
            hasStartInput: true,
            hasEndInput: true,
            start: 'A',
            end: 'B',
            isGeocoding: false,
        });
        expect(ok.ok).toBe(true);
        expect(ok.branch).toBe('proceed');
    });
});

describe('buildCalculateRoutePreflightExecutePlan', () => {
    test('maps preflight branches to log messages', () => {
        const missing = RR.buildCalculateRoutePreflightExecutePlan(
            RR.buildCalculateRoutePreflightPlan({
                hasStartInput: false,
                hasEndInput: true,
                start: 'A',
                end: 'B',
                isGeocoding: false,
            })
        );
        expect(missing.shouldProceed).toBe(false);
        expect(missing.missingInputsLogMessage).toContain('ERROR');

        const busy = RR.buildCalculateRoutePreflightExecutePlan(
            RR.buildCalculateRoutePreflightPlan({
                hasStartInput: true,
                hasEndInput: true,
                start: 'A',
                end: 'B',
                isGeocoding: true,
            })
        );
        expect(busy.geocodingBusyLogMessage).toContain('Geocoding already in progress');
    });
});

describe('buildCalculateRouteApiRequestLogPlan', () => {
    test('formats via-point and multi-drop log lines', () => {
        const logs = RR.buildCalculateRouteApiRequestLogPlan({
            viaPointsCount: 2,
            stopsCount: 1,
            totalStopTimeMinutes: 15,
            optimizeStopOrder: true,
            roundTrip: false,
        });
        expect(logs.viaPointsLogMessage).toContain('Via-points: 2');
        expect(logs.multiDropLogMessage).toContain('optimize=true');
    });
});

describe('buildCalculateRoute entry orchestration helpers', () => {
    test('buildCalculateRouteInputCollectPlan trims start and end values', () => {
        const collect = RR.buildCalculateRouteInputCollectPlan({
            startInput: { value: '  Home  ', dataset: { lat: '1' } },
            endInput: { value: 'Work' },
        });
        expect(collect.start).toBe('Home');
        expect(collect.end).toBe('Work');
        expect(collect.debugLogs).toHaveLength(4);
    });

    test('buildCalculateRoutePreflightOrchestrationPlan gates geocoding busy state', () => {
        const collect = RR.buildCalculateRouteInputCollectPlan({
            startInput: { value: 'A' },
            endInput: { value: 'B' },
        });
        const busy = RR.buildCalculateRoutePreflightOrchestrationPlan(collect, true);
        expect(busy.execute.shouldProceed).toBe(false);
        expect(busy.geocodeCallLogMessage).toContain('geocodeLocations');

        const ok = RR.buildCalculateRoutePreflightOrchestrationPlan(collect, false);
        expect(ok.execute.shouldProceed).toBe(true);
        expect(ok.apply.shouldProceed).toBe(true);
        expect(ok.apply.debugLogs).toBeDefined();
    });

    test('buildCalculateRoutePreflightApplyPlan and loading apply plan', () => {
        const apply = RR.buildCalculateRoutePreflightApplyPlan({
            execute: {
                shouldProceed: false,
                statusMessage: 'busy',
                statusType: 'info',
                geocodingBusyLogMessage: 'wait',
            },
            collect: { debugLogs: [{ prefix: 'x', value: 1 }] },
            entryLogMessage: 'start',
            geocodeCallLogMessage: 'geocode',
        });
        expect(apply.shouldProceed).toBe(false);
        expect(apply.geocodingBusyLogMessage).toBe('wait');
        expect(apply.debugLogs).toHaveLength(1);

        const loading = RR.buildCalculateRouteLoadingApplyPlan(
            RR.buildCalculateRouteLoadingExecutePlan()
        );
        expect(loading.shouldApply).toBe(true);
        expect(loading.showRouteProgressBar).toBe(true);
    });

    test('buildCalculateRouteFetchPlan and fetch error apply plan', () => {
        const fetchPlan = RR.buildCalculateRouteFetchPlan({
            requestBody: { start: '1,2', end: '3,4' },
            viaPointsCount: 1,
            stopsCount: 0,
        });
        expect(fetchPlan.apiPath).toBe('/api/route');
        expect(fetchPlan.body.start).toBe('1,2');

        const err = RR.buildCalculateRouteFetchErrorApplyPlan(new Error('network'));
        expect(err.statusMessage).toContain('network');
        expect(err.hideRouteProgressBar).toBe(true);
    });

    test('buildCalculateRouteFetchHttpResponsePlan dispatches json and error branches', () => {
        const fetchPlan = RR.buildCalculateRouteFetchPlan({
            requestBody: { start: '1,2', end: '3,4' },
        });
        const ok = RR.buildCalculateRouteFetchHttpResponsePlan({
            status: 200,
            ok: true,
            contentType: 'application/json',
        }, fetchPlan);
        expect(ok.action).toBe('parse_json');

        const nonJson = RR.buildCalculateRouteFetchHttpResponsePlan({
            status: 500,
            ok: false,
            contentType: 'text/html',
        }, fetchPlan);
        expect(nonJson.action).toBe('reject_non_json');

        const httpErr = RR.buildCalculateRouteFetchHttpResponsePlan({
            status: 400,
            ok: false,
            contentType: 'application/json',
        }, fetchPlan);
        expect(httpErr.action).toBe('reject_http_error');
    });

    test('buildCalculateRouteLoadingExecutePlan shows loading UI', () => {
        const loading = RR.buildCalculateRouteLoadingExecutePlan();
        expect(loading.showRouteProgressBar).toBe(true);
        expect(loading.statusMessage).toContain('Calculating');
    });
});

describe('buildCalculateRouteResponseExecutePlan', () => {
    test('routes idle success to idle_preview branch', () => {
        const plan = RR.buildCalculateRouteResponseExecutePlan(
            { success: true, source: 'valhalla', distance: '10 km', time: '20 min' },
            false
        );
        expect(plan.branch).toBe('idle_preview');
        expect(plan.inNavRerouteLogMessage).toBeNull();
    });

    test('routes in-nav success to in_nav_reroute branch with log message', () => {
        const plan = RR.buildCalculateRouteResponseExecutePlan(
            { success: true, source: 'valhalla' },
            true
        );
        expect(plan.branch).toBe('in_nav_reroute');
        expect(plan.inNavRerouteLogMessage).toContain('in-nav reroute');
    });

    test('routes API errors to error branch', () => {
        const plan = RR.buildCalculateRouteResponseExecutePlan(
            { success: false, error: 'bad coords' },
            false
        );
        expect(plan.branch).toBe('error');
        expect(plan.statusMessage).toBe('Error: bad coords');
    });

    test('buildCalculateRouteResponseApplyPlan wraps execute plan for apply helper', () => {
        const execute = RR.buildCalculateRouteResponseExecutePlan(
            { success: true, source: 'valhalla' },
            true
        );
        const apply = RR.buildCalculateRouteResponseApplyPlan(execute);
        expect(apply.shouldApply).toBe(true);
        expect(apply.branch).toBe('in_nav_reroute');
        expect(apply.inNavRerouteLogMessage).toContain('in-nav reroute');
    });
});

describe('buildAutomaticRerouteRequestPlan', () => {
    test('assembles reroute body from storage and runtime prefs', () => {
        const storage = mockStorage({
            pref_avoid_tollRoads: 'true',
            pref_caz: 'true',
        });
        const body = RR.buildAutomaticRerouteRequestPlan(storage, {
            startLat: 51.5,
            startLon: -0.1,
            destination: '52,0',
            routingMode: 'fastest',
            vehicleType: 'petrol_diesel',
            costParams: { fuel_efficiency: 6.5, fuel_price: 1.6, energy_efficiency: 18, electricity_price: 0.3 },
            isAvoidTollsEnabled: () => true,
            routePrefs: { avoidTolls: true },
        });
        expect(body.start).toBe('51.5,-0.1');
        expect(body.end).toBe('52,0');
        expect(body.routing_mode).toBe('fastest');
        expect(body.avoid_tolls).toBe(true);
    });
});

describe('buildRouteRequestCollectPlan', () => {
    test('normalises wrapper inputs for buildAutomaticRerouteRequestPlan', () => {
        const storage = mockStorage({});
        const collect = RR.buildRouteRequestCollectPlan({
            storage,
            startLat: 51.5,
            startLon: -0.1,
            destination: '52,0',
            avoidPoints: [{ lat: 51.6, lon: 0 }],
            vehicleType: 'electric',
        });
        const body = RR.buildAutomaticRerouteRequestPlan(collect.storage, collect.opts);
        expect(body.start).toBe('51.5,-0.1');
        expect(body.end).toBe('52,0');
        expect(collect.opts.vehicleType).toBe('electric');
    });
});

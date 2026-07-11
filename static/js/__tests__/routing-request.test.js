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
                routeOptimization: 'shortest', maxDetour: 35,
            },
        }));
        expect(o.prefer_scenic).toBe(true);
        expect(o.prefer_quiet).toBe(true);
        expect(o.avoid_unpaved).toBe(true);
        expect(o.route_optimization).toBe('shortest');
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

/**
 * @file Pure builder for the shared `/api/route` request preferences (no DOM, no network).
 * @module modules/navigation/routing-request
 *
 * Both the initial route request (calculateRoute) and the automatic reroute request
 * (buildRouteRequest) send an identical block of hazard/avoidance/cost/preference fields,
 * assembled from the same localStorage + route-preference inputs. That field mapping was
 * duplicated in voyagr-app.js; it lives here as a pure function so it can be unit tested and
 * shared via the `VoyagrRoutingRequest` global. Each caller still gathers its own inputs
 * (localStorage, current mode/vehicle, cost params) and adds its path-specific fields
 * (avoid_points / include_tolls for reroute; via_points / stops / multi-drop for the initial
 * request), so behaviour is unchanged.
 *
 * The builder does NOT read localStorage or touch globals: callers pass already-resolved
 * values, preserving each path's exact fallback semantics.
 */
(function (root) {
    'use strict';

    /**
     * Build the shared `/api/route` preference fields common to the initial route and reroute
     * requests. Returns a plain object; callers spread it and add start/end + path-specific keys.
     *
     * @param {Object} o
     * @param {string} o.routingMode              Already-resolved routing mode (e.g. 'auto').
     * @param {string} o.vehicleType              Already-resolved vehicle type.
     * @param {Object} [o.costParams]             Result of getRouteCostParams(); spread as-is.
     * @param {boolean} o.enableHazardAvoidance   Master hazard-avoidance flag (precomputed).
     * @param {boolean} o.avoidCameras
     * @param {boolean} o.avoidCaz
     * @param {boolean} o.avoidTrafficLights
     * @param {boolean} o.avoidRailwayCrossings
     * @param {boolean} o.avoidTolls
     * @param {boolean} o.avoidMotorways
     * @param {boolean} o.avoidFerries
     * @param {Object} [o.routePrefs]             getRoutePreferences() result.
     * @returns {Object} Shared request fields.
     */
    function buildSharedRouteOptions(o) {
        o = o || {};
        var routePrefs = o.routePrefs || {};
        var body = {
            routing_mode: o.routingMode,
            vehicle_type: o.vehicleType,
        };
        // Cost params (fuel/energy/prices) are spread verbatim, matching the monolith.
        var cost = o.costParams || {};
        for (var k in cost) {
            if (Object.prototype.hasOwnProperty.call(cost, k)) {
                body[k] = cost[k];
            }
        }
        body.enable_hazard_avoidance = !!o.enableHazardAvoidance;
        body.avoid_cameras = !!o.avoidCameras;
        body.avoid_caz = !!o.avoidCaz;
        body.avoid_traffic_lights = !!o.avoidTrafficLights;
        body.avoid_railway_crossings = !!o.avoidRailwayCrossings;
        body.avoid_tolls = !!o.avoidTolls;
        body.avoid_motorways = !!o.avoidMotorways;
        body.avoid_ferries = !!o.avoidFerries;
        body.prefer_scenic = !!routePrefs.preferScenic;
        body.prefer_quiet = !!routePrefs.preferQuiet;
        body.avoid_unpaved = !!routePrefs.avoidUnpaved;
        body.route_optimization = routePrefs.routeOptimization || 'fastest';
        body.max_detour = (typeof routePrefs.maxDetour === 'number') ? routePrefs.maxDetour : 20;
        return body;
    }

    var api = {
        buildSharedRouteOptions: buildSharedRouteOptions
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoutingRequest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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

    /**
     * Master hazard-avoidance flag for the initial calculateRoute request.
     * @param {Storage} storage
     * @returns {boolean}
     */
    function isInitialRouteHazardAvoidanceEnabled(storage) {
        return storage.getItem('pref_cameras') !== 'false' ||
            storage.getItem('pref_caz') !== 'false' ||
            storage.getItem('pref_trafficLightsAvoid') !== 'false' ||
            storage.getItem('pref_railwayCrossingsAvoid') !== 'false' ||
            storage.getItem('pref_police') === 'true' ||
            storage.getItem('pref_roadworks') === 'true' ||
            storage.getItem('pref_accidents') === 'true';
    }

    /**
     * Master hazard-avoidance flag for parking/walking multimodal legs (no CAZ in OR chain).
     * @param {Storage} storage
     * @returns {boolean}
     */
    function isMultimodalLegHazardAvoidanceEnabled(storage) {
        return storage.getItem('pref_cameras') !== 'false' ||
            storage.getItem('pref_trafficLightsAvoid') !== 'false' ||
            storage.getItem('pref_railwayCrossingsAvoid') !== 'false' ||
            storage.getItem('pref_police') === 'true' ||
            storage.getItem('pref_roadworks') === 'true' ||
            storage.getItem('pref_accidents') === 'true';
    }

    /**
     * Shared avoidance prefs for multimodal driving/walking legs.
     * @param {Storage} storage
     * @returns {Object}
     */
    function readMultimodalLegAvoidancePrefs(storage) {
        return {
            enableHazardAvoidance: isMultimodalLegHazardAvoidanceEnabled(storage),
            avoidCameras: storage.getItem('pref_cameras') !== 'false',
            avoidTrafficLights: storage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: storage.getItem('pref_railwayCrossingsAvoid') !== 'false',
        };
    }

    /**
     * Driving-leg-only prefs read from storage (avoidTolls resolved by caller).
     * @param {Storage} storage
     * @param {boolean} avoidTolls
     * @returns {Object}
     */
    function readMultimodalDrivingLegStoragePrefs(storage, avoidTolls) {
        return {
            includeTolls: storage.getItem('includeTolls') !== 'false',
            avoidTolls: !!avoidTolls,
            avoidCaz: storage.getItem('pref_caz') !== 'false',
        };
    }

    /**
     * Common avoidance flags read from storage for initial route and reroute requests.
     * @param {Storage} storage
     * @param {boolean} avoidTolls
     * @returns {Object}
     */
    function readCommonRouteAvoidanceFlags(storage, avoidTolls) {
        return {
            avoidCameras: storage.getItem('pref_cameras') !== 'false',
            avoidCaz: storage.getItem('pref_caz') !== 'false',
            avoidTrafficLights: storage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: storage.getItem('pref_railwayCrossingsAvoid') !== 'false',
            avoidTolls: !!avoidTolls,
            avoidMotorways: storage.getItem('pref_avoid_motorways') === 'true',
            avoidFerries: storage.getItem('pref_avoid_ferries') === 'true',
        };
    }

    /**
     * sharedOptions block for buildInitialRouteRequestBody.
     * @param {Storage} storage
     * @param {Object} o
     * @returns {Object}
     */
    function buildInitialRouteSharedOptions(storage, o) {
        o = o || {};
        return Object.assign({
            routingMode: o.routingMode,
            vehicleType: o.vehicleType,
            costParams: o.costParams,
            enableHazardAvoidance: isInitialRouteHazardAvoidanceEnabled(storage),
            routePrefs: o.routePrefs || {},
        }, readCommonRouteAvoidanceFlags(storage, o.avoidTolls));
    }

    /**
     * sharedOptions block for buildRerouteRequestBody.
     * @param {Storage} storage
     * @param {Object} o
     * @param {function(): boolean} o.isAvoidTollsEnabled
     * @returns {Object}
     */
    function buildRerouteSharedOptions(storage, o) {
        o = o || {};
        var avoidTollsFn = o.isAvoidTollsEnabled || function () { return false; };
        return Object.assign({
            routingMode: o.routingMode,
            vehicleType: o.vehicleType,
            costParams: o.costParams,
            enableHazardAvoidance: isRerouteHazardAvoidanceEnabled(storage, avoidTollsFn),
            routePrefs: o.routePrefs || {},
        }, readCommonRouteAvoidanceFlags(storage, avoidTollsFn()));
    }

    /**
     * Reroute-only include flags from storage.
     * @param {Storage} storage
     * @returns {{ includeTolls: boolean, includeCaz: boolean }}
     */
    function readRerouteIncludeFlags(storage) {
        return {
            includeTolls: storage.getItem('includeTolls') !== 'false',
            includeCaz: storage.getItem('includeCAZ') !== 'false',
        };
    }

    /**
     * Master hazard-avoidance flag for automatic reroute (buildRouteRequest).
     * @param {Storage} storage
     * @param {function(): boolean} isAvoidTollsEnabled
     * @returns {boolean}
     */
    function isRerouteHazardAvoidanceEnabled(storage, isAvoidTollsEnabled) {
        return storage.getItem('pref_cameras') !== 'false' ||
            storage.getItem('pref_trafficLightsAvoid') !== 'false' ||
            storage.getItem('pref_railwayCrossingsAvoid') !== 'false' ||
            isAvoidTollsEnabled() ||
            storage.getItem('pref_caz') !== 'false';
    }

    /**
     * Sanitize explicit avoid_points for reroute (max 10 finite lat/lon pairs).
     * @param {Array<{lat: number, lon: number}>|null|undefined} avoidPoints
     * @returns {Array<{lat: number, lon: number}>}
     */
    function normalizeAvoidPoints(avoidPoints) {
        if (!Array.isArray(avoidPoints)) return [];
        return avoidPoints
            .filter(function (p) { return p && Number.isFinite(p.lat) && Number.isFinite(p.lon); })
            .slice(0, 10)
            .map(function (p) { return { lat: p.lat, lon: p.lon }; });
    }

    /**
     * Format lat/lon as the API "lat,lon" coordinate string.
     * @param {number} lat
     * @param {number} lon
     * @returns {string}
     */
    function formatCoordPair(lat, lon) {
        return lat + ',' + lon;
    }

    /**
     * Spread cost params onto a request body object.
     * @param {Object} body
     * @param {Object} [costParams]
     */
    function spreadCostParams(body, costParams) {
        var cost = costParams || {};
        for (var k in cost) {
            if (Object.prototype.hasOwnProperty.call(cost, k)) {
                body[k] = cost[k];
            }
        }
    }

    /**
     * Full `/api/route` body for automatic reroute (buildRouteRequest).
     * @param {Object} o
     * @param {number} o.startLat
     * @param {number} o.startLon
     * @param {string} o.destination - "lat,lon" end coordinate string
     * @param {Array<{lat: number, lon: number}>} [o.avoidPoints]
     * @param {boolean} o.includeTolls
     * @param {boolean} o.includeCaz
     * @param {Object} o.sharedOptions - args for buildSharedRouteOptions
     * @returns {Object}
     */
    function buildRerouteRequestBody(o) {
        o = o || {};
        var body = {
            start: formatCoordPair(o.startLat, o.startLon),
            end: o.destination,
            avoid_points: o.avoidPoints || [],
            include_tolls: !!o.includeTolls,
            include_caz: !!o.includeCaz,
        };
        var shared = buildSharedRouteOptions(o.sharedOptions || {});
        for (var key in shared) {
            if (Object.prototype.hasOwnProperty.call(shared, key)) {
                body[key] = shared[key];
            }
        }
        return body;
    }

    /**
     * `/api/route` body for the driving leg of multimodal parking routing.
     * @param {Object} o
     * @returns {Object}
     */
    function buildMultimodalDrivingLegBody(o) {
        o = o || {};
        var body = {
            start: formatCoordPair(o.startLat, o.startLon),
            end: formatCoordPair(o.endLat, o.endLon),
            routing_mode: 'auto',
            vehicle_type: o.vehicleType,
            include_tolls: !!o.includeTolls,
            avoid_tolls: !!o.avoidTolls,
            avoid_caz: !!o.avoidCaz,
            enable_hazard_avoidance: !!o.enableHazardAvoidance,
            avoid_cameras: !!o.avoidCameras,
            avoid_traffic_lights: !!o.avoidTrafficLights,
            avoid_railway_crossings: !!o.avoidRailwayCrossings,
        };
        spreadCostParams(body, o.costParams);
        return body;
    }

    /**
     * `/api/route` body for the walking leg of multimodal parking routing.
     * @param {Object} o
     * @returns {Object}
     */
    function buildMultimodalWalkingLegBody(o) {
        o = o || {};
        return {
            start: formatCoordPair(o.startLat, o.startLon),
            end: formatCoordPair(o.endLat, o.endLon),
            routing_mode: 'pedestrian',
            vehicle_type: 'pedestrian',
            enable_hazard_avoidance: !!o.enableHazardAvoidance,
            avoid_cameras: !!o.avoidCameras,
            avoid_traffic_lights: !!o.avoidTrafficLights,
            avoid_railway_crossings: !!o.avoidRailwayCrossings,
        };
    }

    /**
     * Map in-app via-points to the API via_points shape.
     * @param {Array<{lat: number, lon: number, name?: string}>} viaPoints
     * @returns {Array<{lat: number, lon: number, name?: string, type: string}>}
     */
    function mapViaPointsForApi(viaPoints) {
        return (viaPoints || []).map(function (vp) {
            return {
                lat: vp.lat,
                lon: vp.lon,
                name: vp.name,
                type: 'via',
            };
        });
    }

    /**
     * Map in-app stops to the API stops shape.
     * @param {Array<{lat: number, lon: number, name?: string, duration?: number}>} stops
     * @returns {Array<{lat: number, lon: number, name?: string, type: string, duration: number}>}
     */
    function mapStopsForApi(stops) {
        return (stops || []).map(function (s) {
            return {
                lat: s.lat,
                lon: s.lon,
                name: s.name,
                type: 'stop',
                duration: s.duration || 15,
            };
        });
    }

    /**
     * Total planned stop time in minutes (default 15 min per stop).
     * @param {Array<{duration?: number}>} stops
     * @returns {number}
     */
    function sumStopDurationsMinutes(stops) {
        return (stops || []).reduce(function (sum, s) {
            return sum + (s.duration || 15);
        }, 0);
    }

    /**
     * Start coordinate for calculateRoute — live GPS when navigating, else geocoded start.
     * @param {Object} o
     * @param {boolean} o.routeInProgress
     * @param {boolean} o.isTrackingActive
     * @param {Array} o.trackingHistory
     * @param {number|null} o.currentLat
     * @param {number|null} o.currentLon
     * @param {string} o.geocodedStart
     * @returns {string}
     */
    function resolveLiveGpsStartCoord(o) {
        o = o || {};
        var liveGpsOk = o.routeInProgress &&
            o.isTrackingActive &&
            Array.isArray(o.trackingHistory) &&
            o.trackingHistory.length > 0 &&
            typeof o.currentLat === 'number' &&
            Number.isFinite(o.currentLat) &&
            typeof o.currentLon === 'number' &&
            Number.isFinite(o.currentLon);
        return liveGpsOk
            ? formatCoordPair(o.currentLat, o.currentLon)
            : o.geocodedStart;
    }

    /**
     * Full `/api/route` body for the initial calculateRoute request (multi-drop included).
     * @param {Object} o
     * @param {string} o.start
     * @param {string} o.end
     * @param {Array} [o.viaPoints]
     * @param {Array} [o.stops]
     * @param {boolean} o.optimizeStopOrder
     * @param {boolean} o.roundTrip
     * @param {string|null} o.departureTime
     * @param {Object} o.sharedOptions - args for buildSharedRouteOptions
     * @returns {Object}
     */
    function buildInitialRouteRequestBody(o) {
        o = o || {};
        var body = {
            start: o.start,
            end: o.end,
            via_points: mapViaPointsForApi(o.viaPoints),
            stops: mapStopsForApi(o.stops),
            optimize_stop_order: !!o.optimizeStopOrder,
            round_trip: !!o.roundTrip,
            departure_time: o.departureTime || null,
        };
        var shared = buildSharedRouteOptions(o.sharedOptions || {});
        for (var key in shared) {
            if (Object.prototype.hasOwnProperty.call(shared, key)) {
                body[key] = shared[key];
            }
        }
        return body;
    }

    var api = {
        buildSharedRouteOptions: buildSharedRouteOptions,
        isInitialRouteHazardAvoidanceEnabled: isInitialRouteHazardAvoidanceEnabled,
        isMultimodalLegHazardAvoidanceEnabled: isMultimodalLegHazardAvoidanceEnabled,
        readMultimodalLegAvoidancePrefs: readMultimodalLegAvoidancePrefs,
        readMultimodalDrivingLegStoragePrefs: readMultimodalDrivingLegStoragePrefs,
        readCommonRouteAvoidanceFlags: readCommonRouteAvoidanceFlags,
        buildInitialRouteSharedOptions: buildInitialRouteSharedOptions,
        buildRerouteSharedOptions: buildRerouteSharedOptions,
        readRerouteIncludeFlags: readRerouteIncludeFlags,
        isRerouteHazardAvoidanceEnabled: isRerouteHazardAvoidanceEnabled,
        normalizeAvoidPoints: normalizeAvoidPoints,
        formatCoordPair: formatCoordPair,
        buildRerouteRequestBody: buildRerouteRequestBody,
        buildMultimodalDrivingLegBody: buildMultimodalDrivingLegBody,
        buildMultimodalWalkingLegBody: buildMultimodalWalkingLegBody,
        mapViaPointsForApi: mapViaPointsForApi,
        mapStopsForApi: mapStopsForApi,
        sumStopDurationsMinutes: sumStopDurationsMinutes,
        resolveLiveGpsStartCoord: resolveLiveGpsStartCoord,
        buildInitialRouteRequestBody: buildInitialRouteRequestBody,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoutingRequest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

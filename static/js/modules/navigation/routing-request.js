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
     * Assemble full automatic reroute `/api/route` body from storage and runtime prefs.
     * @param {Storage} storage
     * @param {Object} opts
     * @returns {Object}
     */
    function buildAutomaticRerouteRequestPlan(storage, opts) {
        opts = opts || {};
        var includeFlags = readRerouteIncludeFlags(storage);
        return buildRerouteRequestBody({
            startLat: opts.startLat,
            startLon: opts.startLon,
            destination: opts.destination,
            avoidPoints: normalizeAvoidPoints(opts.avoidPoints),
            includeTolls: includeFlags.includeTolls,
            includeCaz: includeFlags.includeCaz,
            sharedOptions: buildRerouteSharedOptions(storage, {
                routingMode: opts.routingMode,
                vehicleType: opts.vehicleType,
                costParams: opts.costParams,
                isAvoidTollsEnabled: opts.isAvoidTollsEnabled,
                routePrefs: opts.routePrefs,
            }),
        });
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

    /**
     * Assemble the full `/api/route` payload and log metadata for calculateRoute.
     * @param {Object} o
     * @param {{ getItem: function(string): (string|null) }} o.storage
     * @param {string} o.geocodedStart
     * @param {string} o.geocodedEnd
     * @param {Array} [o.viaPoints]
     * @param {Array} [o.stops]
     * @param {string} o.routingMode
     * @param {string} o.vehicleType
     * @param {Object} o.costParams
     * @param {boolean} o.avoidTolls
     * @param {Object} o.routePrefs
     * @param {boolean} o.routeInProgress
     * @param {boolean} o.isTrackingActive
     * @param {Array} o.trackingHistory
     * @param {number|null} o.currentLat
     * @param {number|null} o.currentLon
     * @returns {{ requestBody: Object, routeStartCoordStr: string, viaPointsCount: number, stopsCount: number, totalStopTimeMinutes: number, optimizeStopOrder: boolean, roundTrip: boolean }}
     */
    function buildCalculateRouteApiPlan(o) {
        o = o || {};
        var viaPoints = o.viaPoints || [];
        var stops = o.stops || [];
        var storage = o.storage || { getItem: function () { return null; } };
        var viaPointsData = mapViaPointsForApi(viaPoints);
        var stopsData = mapStopsForApi(stops);
        var totalStopTime = sumStopDurationsMinutes(stops);
        var optimizeOrder = storage.getItem('pref_optimizeStopOrder') !== 'false';
        var roundTrip = storage.getItem('pref_roundTrip') === 'true';
        var departureTime = storage.getItem('pref_departureTime') || null;
        var routeStartCoordStr = resolveLiveGpsStartCoord({
            routeInProgress: o.routeInProgress,
            isTrackingActive: o.isTrackingActive,
            trackingHistory: o.trackingHistory,
            currentLat: o.currentLat,
            currentLon: o.currentLon,
            geocodedStart: o.geocodedStart,
        });
        var requestBody = buildInitialRouteRequestBody({
            start: routeStartCoordStr,
            end: o.geocodedEnd,
            viaPoints: viaPoints,
            stops: stops,
            optimizeStopOrder: optimizeOrder,
            roundTrip: roundTrip,
            departureTime: departureTime,
            sharedOptions: buildInitialRouteSharedOptions(storage, {
                routingMode: o.routingMode,
                vehicleType: o.vehicleType,
                costParams: o.costParams,
                avoidTolls: o.avoidTolls,
                routePrefs: o.routePrefs,
            }),
        });
        return {
            requestBody: requestBody,
            routeStartCoordStr: routeStartCoordStr,
            viaPointsCount: viaPointsData.length,
            stopsCount: stopsData.length,
            totalStopTimeMinutes: totalStopTime,
            optimizeStopOrder: optimizeOrder,
            roundTrip: roundTrip,
        };
    }

    /**
     * User-facing message for a failed `/api/route` HTTP status when the body is not JSON
     * or does not contain a structured `error` field.
     * @param {number} status
     * @param {string} [responseText]
     * @returns {string}
     */
    function buildRouteApiHttpErrorMessage(status, responseText) {
        var code = Number(status) || 0;
        var text = String(responseText || '');
        if (code === 408) {
            return 'Route calculation timed out. Try a shorter route, move start and end closer, or try again in a moment.';
        }
        if (code === 504) {
            return 'Gateway Timeout (504): The route is too complex or the server is busy. Try a shorter route.';
        }
        if (code === 502) {
            return 'Bad Gateway (502): Server communication error. Please try again.';
        }
        if (code === 500) {
            return 'Internal Server Error (500). Please check server logs.';
        }
        if (text.indexOf('timeout') >= 0 || text.indexOf('Timeout') >= 0) {
            return 'Request timed out. The route may be too long. Try a shorter route.';
        }
        if (code > 0) {
            return 'Server error (' + code + '). Please try again.';
        }
        return 'Server error. Please try again.';
    }

    /**
     * Error message when `/api/route` returns a non-JSON body (HTML error page, gateway text, etc.).
     * @param {number} status
     * @param {string} [responseText]
     * @returns {string}
     */
    function buildNonJsonRouteApiErrorMessage(status, responseText) {
        var code = Number(status) || 0;
        var text = String(responseText || '');
        var msg = 'Server error (HTTP ' + code + ')';
        if (code === 504) {
            msg = 'Gateway Timeout (504): The route is too complex or the server is busy. Try a shorter route.';
        } else if (code === 502) {
            msg = 'Bad Gateway (502): Server communication error. Please try again.';
        } else if (code === 500) {
            msg = 'Internal Server Error (500). Please check server logs.';
        } else if (text.indexOf('timeout') >= 0 || text.indexOf('Timeout') >= 0) {
            msg = 'Request timed out. The route may be too long. Try a shorter route.';
        }
        return msg;
    }

    /**
     * Parse a failed `/api/route` response body into a user-facing error message.
     * @param {number} status - HTTP status code
     * @param {string} responseText - Raw response body
     * @returns {string}
     */
    function parseRouteApiErrorMessage(status, responseText) {
        var text = String(responseText || '');
        try {
            var parsed = JSON.parse(text);
            if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
                return parsed.error.trim();
            }
        } catch (_e) {
            /* ignore */
        }
        return buildRouteApiHttpErrorMessage(status, text);
    }

    /**
     * Whether the response Content-Type indicates JSON.
     * @param {string|null|undefined} contentType
     * @returns {boolean}
     */
    function isRouteApiJsonContentType(contentType) {
        return !!(contentType && String(contentType).indexOf('application/json') >= 0);
    }

    /**
     * Status banner when routing fell back to a degraded engine (Valhalla/GraphHopper offline).
     * @returns {string}
     */
    function getDegradedRoutingStatusMessage() {
        return '⚠️ Basic route only (Valhalla/GraphHopper offline). No camera avoidance.';
    }

    /**
     * Normalise a successful or failed `/api/route` JSON payload for app dispatch.
     * @param {Object} data
     * @returns {{ success: boolean, routingDegraded: boolean, degradedLogWarning: ({ warning: *, engines: * }|null), errorMessage: (string|null), responseLogMeta: Object }}
     */
    function buildRouteApiResultPlan(data) {
        data = data || {};
        return {
            success: !!data.success,
            routingDegraded: !!data.routing_degraded,
            degradedLogWarning: data.routing_degraded ? {
                warning: data.routing_warning || data.source,
                engines: data.engines_failed || {},
            } : null,
            errorMessage: data.success ? null : ('Error: ' + (data.error || 'Unknown error')),
            responseLogMeta: {
                success: data.success,
                source: data.source,
                hasGeometry: !!data.geometry,
                geometryLength: data.geometry ? data.geometry.length : 0,
                distance: data.distance,
                time: data.time,
                routesCount: data.routes ? data.routes.length : 0,
            },
        };
    }

    /**
     * Dispatch plan for calculateRoute API success/failure handling.
     * @param {Object} apiPlan - from buildRouteApiResultPlan
     * @param {boolean} routeInProgress
     * @returns {{ branch: 'error'|'in_nav_reroute'|'idle_preview', hideRouteProgressBar: boolean, statusMessage?: string|null, statusType?: string, degradedStatusMessage?: string|null, degradedLogWarning?: Object|null, responseLogMeta?: Object }}
     */
    function buildCalculateRouteDispatchPlan(apiPlan, routeInProgress) {
        apiPlan = apiPlan || {};
        if (!apiPlan.success) {
            return {
                branch: 'error',
                hideRouteProgressBar: true,
                statusMessage: apiPlan.errorMessage,
                statusType: 'error',
                responseLogMeta: apiPlan.responseLogMeta,
            };
        }
        return {
            branch: routeInProgress ? 'in_nav_reroute' : 'idle_preview',
            hideRouteProgressBar: true,
            degradedStatusMessage: apiPlan.routingDegraded ? getDegradedRoutingStatusMessage() : null,
            degradedLogWarning: apiPlan.degradedLogWarning,
            responseLogMeta: apiPlan.responseLogMeta,
        };
    }

    /**
     * Preflight plan for calculateRoute before geocoding/API fetch.
     * @param {Object} o
     * @param {boolean} o.hasStartInput
     * @param {boolean} o.hasEndInput
     * @param {string} o.start
     * @param {string} o.end
     * @param {boolean} o.isGeocoding
     * @returns {Object}
     */
    function buildCalculateRoutePreflightPlan(o) {
        o = o || {};
        if (!o.hasStartInput || !o.hasEndInput) {
            return {
                ok: false,
                branch: 'missing_inputs',
                statusMessage: 'Error: Input fields not found',
                statusType: 'error',
            };
        }
        if (!o.start || !o.end) {
            return {
                ok: false,
                branch: 'empty_locations',
                statusMessage: 'Please enter both start and end locations',
                statusType: 'error',
            };
        }
        if (o.isGeocoding) {
            return {
                ok: false,
                branch: 'geocoding_busy',
                statusMessage: '⏳ Geocoding in progress...',
                statusType: 'loading',
            };
        }
        return { ok: true, branch: 'proceed' };
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
        buildAutomaticRerouteRequestPlan: buildAutomaticRerouteRequestPlan,
        buildMultimodalDrivingLegBody: buildMultimodalDrivingLegBody,
        buildMultimodalWalkingLegBody: buildMultimodalWalkingLegBody,
        mapViaPointsForApi: mapViaPointsForApi,
        mapStopsForApi: mapStopsForApi,
        sumStopDurationsMinutes: sumStopDurationsMinutes,
        resolveLiveGpsStartCoord: resolveLiveGpsStartCoord,
        buildInitialRouteRequestBody: buildInitialRouteRequestBody,
        buildCalculateRouteApiPlan: buildCalculateRouteApiPlan,
        buildRouteApiHttpErrorMessage: buildRouteApiHttpErrorMessage,
        buildNonJsonRouteApiErrorMessage: buildNonJsonRouteApiErrorMessage,
        parseRouteApiErrorMessage: parseRouteApiErrorMessage,
        isRouteApiJsonContentType: isRouteApiJsonContentType,
        getDegradedRoutingStatusMessage: getDegradedRoutingStatusMessage,
        buildRouteApiResultPlan: buildRouteApiResultPlan,
        buildCalculateRouteDispatchPlan: buildCalculateRouteDispatchPlan,
        buildCalculateRoutePreflightPlan: buildCalculateRoutePreflightPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoutingRequest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

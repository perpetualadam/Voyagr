/**
 * @file Pure route-geometry helpers — Haversine distance, bearing, polyline snap, along-route
 *       distance and remaining distance (no DOM, no network, no global state).
 * @module modules/navigation/route-geometry
 *
 * Extracted from voyagr-app.js where three near-identical Haversine implementations and the
 * snap/along-route functions lived inline. All functions take explicit arguments; none read
 * global `routePolyline` (the caller passes the polyline).
 */
(function (root) {
    'use strict';

    var EARTH_RADIUS_M = 6371000;

    /**
     * Haversine distance in **metres** between two lat/lon points.
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @returns {number}
     */
    function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Initial bearing (degrees, 0–360) from point 1 → point 2.
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @returns {number}
     */
    function bearing(lat1, lon1, lat2, lon2) {
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var lat1R = lat1 * Math.PI / 180;
        var lat2R = lat2 * Math.PI / 180;
        var y = Math.sin(dLon) * Math.cos(lat2R);
        var x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    /**
     * Blend two compass headings (circular interpolation, no 359↔0 wrap artefact).
     * @param {number} gpsHeadingDeg
     * @param {number} routeHeadingDeg
     * @param {number} blendTowardRoute - 0.0 = pure GPS, 1.0 = pure route
     * @returns {number}
     */
    function blendHeadingsCircular(gpsHeadingDeg, routeHeadingDeg, blendTowardRoute) {
        if (!Number.isFinite(gpsHeadingDeg)) gpsHeadingDeg = 0;
        if (!Number.isFinite(routeHeadingDeg)) return gpsHeadingDeg;
        var t = Math.max(0, Math.min(1, Number(blendTowardRoute) || 0));
        var d = (((routeHeadingDeg - gpsHeadingDeg) % 360) + 360) % 360;
        if (d > 180) d -= 360;
        return (((gpsHeadingDeg + d * t) % 360) + 360) % 360;
    }

    /**
     * Project a point (lat, lon) onto the line segment (ax,ay)→(bx,by) using
     * latitude-corrected Cartesian math (1° longitude ≠ 1° latitude in metres).
     * @returns {{ projLat, projLon, t }}
     */
    function projectToSegment(lat, lon, ax, ay, bx, by, cosLat) {
        var sAy = ay * cosLat, sBy = by * cosLat, sLon = lon * cosLat;
        var abx = bx - ax, aby = sBy - sAy;
        var apx = lat - ax, apy = sLon - sAy;
        var ab2 = abx * abx + aby * aby;
        var t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
        t = Math.max(0, Math.min(1, t));
        return { projLat: ax + t * (bx - ax), projLon: ay + t * (by - ay), t: t };
    }

    /**
     * Snap a GPS position to the nearest point on a route polyline.
     * Uses a windowed search (± 250 vertices) for performance, falls back to full scan
     * when no close segment is found within 60 m.
     *
     * @param {number} lat
     * @param {number} lon
     * @param {Array<[number,number]>} polyline - Route as [lat,lon] pairs
     * @param {number} [searchStartIndex=0]
     * @returns {{ lat, lon, index, distance, t }}
     */
    function snapToRoutePolyline(lat, lon, polyline, searchStartIndex, snapOpts) {
        searchStartIndex = searchStartIndex || 0;
        snapOpts = snapOpts || {};
        if (!polyline || polyline.length < 2) {
            return { lat: lat, lon: lon, index: 0, distance: 0, t: 0 };
        }
        var backwardWindow = snapOpts.backwardWindow != null ? snapOpts.backwardWindow : 15;
        var forwardWindow = snapOpts.forwardWindow != null ? snapOpts.forwardWindow : 250;
        var fullScanThresholdM = snapOpts.fullScanThresholdM != null ? snapOpts.fullScanThresholdM : 60;
        var cosLat = Math.cos(lat * Math.PI / 180);
        var bestLat = polyline[0][0], bestLon = polyline[0][1];
        var bestDist = Infinity, bestIndex = 0, bestT = 0;

        var testSeg = function (i) {
            var ax = polyline[i][0], ay = polyline[i][1];
            var bx = polyline[i + 1][0], by = polyline[i + 1][1];
            var proj = projectToSegment(lat, lon, ax, ay, bx, by, cosLat);
            var dist = haversineDistanceMeters(lat, lon, proj.projLat, proj.projLon);
            if (dist < bestDist) {
                bestDist = dist; bestLat = proj.projLat; bestLon = proj.projLon;
                bestIndex = i; bestT = proj.t;
            }
        };

        var searchStart = Math.max(0, searchStartIndex - backwardWindow);
        var searchEnd = Math.min(polyline.length - 1, searchStartIndex + forwardWindow);
        for (var i = searchStart; i < searchEnd; i++) testSeg(i);

        if (bestDist > fullScanThresholdM && (searchStart > 0 || searchEnd < polyline.length - 1)) {
            for (var j = 0; j < polyline.length - 1; j++) {
                if (j >= searchStart && j < searchEnd) continue;
                testSeg(j);
            }
        }
        return { lat: bestLat, lon: bestLon, index: bestIndex, distance: bestDist, t: bestT };
    }

    /**
     * Route snap plan for one GPS tick when navigation has an active polyline.
     * @param {Object} opts
     * @param {number} opts.lat
     * @param {number} opts.lon
     * @param {boolean} [opts.routeInProgress]
     * @param {Array<[number,number]>} [opts.routePolyline]
     * @param {number} [opts.lastSnappedRouteIndex]
     * @returns {{ action: string, snapped: (Object|null) }}
     */
    function buildGpsRouteSnapTickPlan(opts) {
        opts = opts || {};
        if (!opts.routeInProgress || !opts.routePolyline || opts.routePolyline.length < 2) {
            return { action: 'skip', snapped: null };
        }
        var searchStartIndex = opts.searchStartIndex != null
            ? opts.searchStartIndex
            : (opts.lastSnappedRouteIndex || 0);
        var stationary = !!opts.stationary;
        var snapOpts = stationary
            ? { backwardWindow: 80, fullScanThresholdM: 25 }
            : null;
        return {
            action: 'snap',
            snapped: snapToRoutePolyline(
                opts.lat,
                opts.lon,
                opts.routePolyline,
                searchStartIndex,
                snapOpts
            ),
        };
    }

    /**
     * Along-route distance (metres) from a snapped position forward to a polyline vertex.
     * @param {Array<[number,number]>} polyline
     * @param {{ index: number, t: number }} snap - Result of snapToRoutePolyline
     * @param {number} targetVertexIndex
     * @returns {number}
     */
    function distanceAlongRouteToVertexMeters(polyline, snap, targetVertexIndex) {
        if (!polyline || polyline.length < 2 || !snap) return 0;
        var n = polyline.length;
        var vi = Math.max(0, Math.min(Math.floor(Number(targetVertexIndex) || 0), n - 1));
        var i0 = Math.max(0, Math.min(snap.index, n - 2));
        var t = (snap.t !== undefined && snap.t !== null) ? Math.max(0, Math.min(1, Number(snap.t))) : 0;
        var a = polyline[i0], b = polyline[i0 + 1];
        var segLen = haversineDistanceMeters(a[0], a[1], b[0], b[1]);
        if (vi < i0) return 0;
        var d = 0;
        if (vi > i0) {
            d += (1 - t) * segLen;
            for (var j = i0 + 1; j < vi; j++) {
                d += haversineDistanceMeters(polyline[j][0], polyline[j][1], polyline[j + 1][0], polyline[j + 1][1]);
            }
        } else {
            d += t * segLen;
        }
        return Math.max(0, d);
    }

    /**
     * Total polyline length in metres.
     * @param {Array<[number,number]>} polyline
     * @returns {number}
     */
    function totalPolylineLengthMeters(polyline) {
        if (!polyline || polyline.length < 2) return 0;
        var total = 0;
        for (var i = 0; i < polyline.length - 1; i++) {
            total += haversineDistanceMeters(polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1]);
        }
        return total;
    }

    /**
     * Remaining along-route distance (metres) from the snapped GPS position to the end.
     * @param {number} lat
     * @param {number} lon
     * @param {Array<[number,number]>} polyline
     * @param {number} [searchStartIndex=0]
     * @returns {number}
     */
    function computeRemainingDistanceAlongRoute(lat, lon, polyline, searchStartIndex) {
        if (!polyline || polyline.length < 2) return 0;
        var snap = snapToRoutePolyline(lat, lon, polyline, searchStartIndex || 0);
        var i = snap.index;
        var t = snap.t !== undefined ? snap.t : 0;
        var segLen = haversineDistanceMeters(polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1]);
        var remaining = (1 - t) * segLen;
        for (var j = i + 1; j < polyline.length - 1; j++) {
            remaining += haversineDistanceMeters(polyline[j][0], polyline[j][1], polyline[j + 1][0], polyline[j + 1][1]);
        }
        return Math.max(0, remaining);
    }

    /**
     * Index of the nearest polyline vertex to a GPS position (vertex snap, not segment projection).
     * @param {number} lat
     * @param {number} lon
     * @param {Array<[number,number]>} polyline
     * @returns {number}
     */
    function findNearestPolylineVertexIndex(lat, lon, polyline) {
        if (!polyline || polyline.length === 0) return 0;
        var minDistance = Infinity;
        var nearestIndex = 0;
        for (var i = 0; i < polyline.length; i++) {
            var routePoint = polyline[i];
            var distance = haversineDistanceMeters(lat, lon, routePoint[0], routePoint[1]);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = i;
            }
        }
        return nearestIndex;
    }

    /**
     * Destination progress snapshot using nearest-vertex snap (matches legacy turnInfo panel).
     * @param {number} lat
     * @param {number} lon
     * @param {Array<[number,number]>} polyline
     * @returns {{ closestIndex: number, distanceToEndMeters: number, progressPercent: number }}
     */
    function buildVertexDestinationProgress(lat, lon, polyline) {
        if (!polyline || polyline.length === 0) {
            return { closestIndex: 0, distanceToEndMeters: 0, progressPercent: 0 };
        }
        var closestIndex = findNearestPolylineVertexIndex(lat, lon, polyline);
        var distanceToEndMeters = cumulativeDistanceBetweenVertices(polyline, closestIndex, polyline.length - 1);
        if (!Number.isFinite(distanceToEndMeters)) {
            distanceToEndMeters = 0;
        }
        var progressPercent = (closestIndex / polyline.length) * 100;
        return {
            closestIndex: closestIndex,
            distanceToEndMeters: distanceToEndMeters,
            progressPercent: progressPercent,
        };
    }

    var api = {
        haversineDistanceMeters: haversineDistanceMeters,
        bearing: bearing,
        blendHeadingsCircular: blendHeadingsCircular,
        projectToSegment: projectToSegment,
        snapToRoutePolyline: snapToRoutePolyline,
        buildGpsRouteSnapTickPlan: buildGpsRouteSnapTickPlan,
        distanceAlongRouteToVertexMeters: distanceAlongRouteToVertexMeters,
        totalPolylineLengthMeters: totalPolylineLengthMeters,
        computeRemainingDistanceAlongRoute: computeRemainingDistanceAlongRoute,
        findNearestPolylineVertexIndex: findNearestPolylineVertexIndex,
        buildVertexDestinationProgress: buildVertexDestinationProgress,
        cumulativeDistanceBetweenVertices: cumulativeDistanceBetweenVertices,
        inferRoadClassFromManeuver: inferRoadClassFromManeuver,
        inferRoadClassFromStreetNames: inferRoadClassFromStreetNames,
    };

    // ======================================================================
    // cumulativeDistanceBetweenVertices — pure explicit-arg version of the
    // previously global-reading cumulativeRouteDistanceBetween
    // ======================================================================

    /**
     * Cumulative along-polyline distance (metres) between two vertex indices.
     * Indices are clamped to valid range; order does not matter (swapped if b < a).
     * Returns Infinity when the polyline is invalid (matching the monolith's contract).
     * @param {Array<[number,number]>} polyline
     * @param {number} i
     * @param {number} j
     * @returns {number}
     */
    function cumulativeDistanceBetweenVertices(polyline, i, j) {
        if (!polyline || polyline.length < 2) return Infinity;
        var n = polyline.length;
        var a = Math.max(0, Math.min(i | 0, n - 1));
        var b = Math.max(0, Math.min(j | 0, n - 1));
        if (b < a) { var t = a; a = b; b = t; }
        var d = 0;
        for (var k = a; k < b; k++) {
            d += haversineDistanceMeters(polyline[k][0], polyline[k][1], polyline[k + 1][0], polyline[k + 1][1]);
        }
        return d;
    }

    // ======================================================================
    // Road-class inference — pure, no global state, extracted from voyagr-app.js
    // ======================================================================

    /**
     * Infer a Valhalla road_class from a maneuver's explicit field or instruction text.
     * @param {object|null} step - Valhalla maneuver object
     * @returns {string|null}
     */
    function inferRoadClassFromManeuver(step) {
        if (!step) return null;
        if (step.road_class) return step.road_class;
        var instruction = String(step.instruction || '').toLowerCase();
        if (instruction.indexOf('motorway') >= 0 || instruction.indexOf('m1') >= 0 || instruction.indexOf('m25') >= 0) return 'motorway';
        if (instruction.indexOf('a-road') >= 0 || instruction.indexOf('a road') >= 0) return 'primary';
        if (instruction.indexOf('b-road') >= 0 || instruction.indexOf('b road') >= 0) return 'secondary';
        return null;
    }

    /**
     * Infer road class from UK-style road numbers in street names (M1, A40, B1234).
     * @param {string[]|null|undefined} streetNames
     * @returns {string|null}
     */
    function inferRoadClassFromStreetNames(streetNames) {
        if (!Array.isArray(streetNames) || streetNames.length === 0) return null;
        var raw = String(streetNames[0] || '').trim().toUpperCase();
        if (!raw) return null;
        if (/^M\d/.test(raw) || raw.indexOf('MOTORWAY') >= 0) return 'motorway';
        if (/^A\d/.test(raw)) return 'primary';
        if (/^B\d/.test(raw)) return 'secondary';
        return null;
    }

    /**
     * Resolve the current road type from route steps, cached detection, or GPS speed.
     * @param {Object} opts
     * @param {number} [opts.maneuverIdxOverride]
     * @param {number} [opts.gpsSpeedMph]
     * @param {Array<Object>} [opts.currentRouteSteps]
     * @param {number} [opts.currentStepIndex]
     * @param {string|null} [opts.lastDetectedRoadType]
     * @returns {string}
     */
    function resolveCurrentRoadType(opts) {
        opts = opts || {};
        var stepIndex = -1;
        if (Number.isFinite(opts.maneuverIdxOverride) && opts.maneuverIdxOverride >= 0) {
            stepIndex = opts.maneuverIdxOverride;
        } else if (opts.currentRouteSteps &&
            Number.isFinite(opts.currentStepIndex) &&
            opts.currentStepIndex >= 0 &&
            opts.currentStepIndex < opts.currentRouteSteps.length) {
            stepIndex = opts.currentStepIndex;
        }

        if (stepIndex >= 0 && opts.currentRouteSteps && stepIndex < opts.currentRouteSteps.length) {
            var step = opts.currentRouteSteps[stepIndex];
            var fromStreet = inferRoadClassFromStreetNames(step.begin_street_names || step.street_names);
            if (fromStreet) return fromStreet;
            var inferred = inferRoadClassFromManeuver(step);
            if (inferred) return inferred;
            if (step.road_class) return step.road_class;
        }

        if (opts.lastDetectedRoadType) return opts.lastDetectedRoadType;

        var spd = Number(opts.gpsSpeedMph);
        if (Number.isFinite(spd) && spd >= 65) return 'motorway';
        if (Number.isFinite(spd) && spd >= 45) return 'primary';

        return 'unknown';
    }

    // ======================================================================
    // Smart zoom helpers — pure, constants injected so they can be overridden in tests
    // ======================================================================

    /** Default zoom levels (matches ZOOM_LEVELS in voyagr-app.js). */
    var DEFAULT_ZOOM_LEVELS = {
        motorway_high_speed:  14,
        main_road_medium_speed: 15,
        urban_low_speed:      16,
        parking_very_low_speed: 17,
        turn_ahead:           18,
    };

    /** Default turn-detection threshold in metres. */
    var DEFAULT_TURN_ZOOM_THRESHOLD = 500;

    /**
     * Choose the appropriate map zoom level given speed and proximity to the next turn.
     *
     * @param {number} speedMph
     * @param {number|null} [distanceToNextTurn] - Metres to next maneuver, or null
     * @param {string} [roadType] - Informational; current logic uses speed only
     * @param {object} [zoomLevels] - Override DEFAULT_ZOOM_LEVELS (for tests)
     * @param {number} [turnZoomThreshold] - Override DEFAULT_TURN_ZOOM_THRESHOLD (for tests)
     * @returns {number} Zoom level
     */
    function calculateSmartZoom(speedMph, distanceToNextTurn, roadType, zoomLevels, turnZoomThreshold) {
        var ZL = zoomLevels || DEFAULT_ZOOM_LEVELS;
        var threshold = (turnZoomThreshold != null) ? turnZoomThreshold : DEFAULT_TURN_ZOOM_THRESHOLD;

        if (distanceToNextTurn != null && distanceToNextTurn < threshold) {
            return ZL.turn_ahead;
        }
        if (speedMph > 100) return ZL.motorway_high_speed;
        if (speedMph > 50)  return ZL.main_road_medium_speed;
        if (speedMph > 20)  return ZL.urban_low_speed;
        return ZL.parking_very_low_speed;
    }

    /**
     * Calculate the offset map-center point for a driver's-view perspective.
     * MapLibre's padding API handles the visual offset, so this returns the raw coords.
     *
     * @param {number} lat
     * @param {number} lon
     * @param {number} _heading - Unused (padding handles orientation)
     * @param {number} _zoomLevel - Unused
     * @returns {[number, number]}
     */
    function calculateDriverViewCenter(lat, lon, _heading, _zoomLevel) {
        return [lat, lon];
    }

    /**
     * Remaining along-route distance for navigation/arrival/deviation checks.
     * @param {Object} opts
     * @returns {{ valid: boolean, remainingMeters: number }}
     */
    function buildNavigationRemainingDistancePlan(opts) {
        opts = opts || {};
        var polyline = opts.routePolyline || [];
        var lat = opts.lat;
        var lon = opts.lon;
        if (polyline.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
            return { valid: false, remainingMeters: Infinity };
        }
        return {
            valid: true,
            remainingMeters: computeRemainingDistanceAlongRoute(
                lat,
                lon,
                polyline,
                opts.lastSnappedRouteIndex || 0
            ),
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteGeometry = api;

    // Append the new functions to the already-created api object so they are exported
    // both via CommonJS (module.exports = api, set above) and via the global.
    api.calculateSmartZoom = calculateSmartZoom;
    api.calculateDriverViewCenter = calculateDriverViewCenter;
    api.resolveCurrentRoadType = resolveCurrentRoadType;
    api.buildNavigationRemainingDistancePlan = buildNavigationRemainingDistancePlan;
})(typeof globalThis !== 'undefined' ? globalThis : this);

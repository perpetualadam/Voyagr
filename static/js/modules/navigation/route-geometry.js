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
    function snapToRoutePolyline(lat, lon, polyline, searchStartIndex) {
        searchStartIndex = searchStartIndex || 0;
        if (!polyline || polyline.length < 2) {
            return { lat: lat, lon: lon, index: 0, distance: 0, t: 0 };
        }
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

        var searchStart = Math.max(0, searchStartIndex - 15);
        var searchEnd = Math.min(polyline.length - 1, searchStartIndex + 250);
        for (var i = searchStart; i < searchEnd; i++) testSeg(i);

        if (bestDist > 60 && (searchStart > 0 || searchEnd < polyline.length - 1)) {
            for (var j = 0; j < polyline.length - 1; j++) {
                if (j >= searchStart && j < searchEnd) continue;
                testSeg(j);
            }
        }
        return { lat: bestLat, lon: bestLon, index: bestIndex, distance: bestDist, t: bestT };
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

    var api = {
        haversineDistanceMeters: haversineDistanceMeters,
        bearing: bearing,
        blendHeadingsCircular: blendHeadingsCircular,
        projectToSegment: projectToSegment,
        snapToRoutePolyline: snapToRoutePolyline,
        distanceAlongRouteToVertexMeters: distanceAlongRouteToVertexMeters,
        totalPolylineLengthMeters: totalPolylineLengthMeters,
        computeRemainingDistanceAlongRoute: computeRemainingDistanceAlongRoute,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

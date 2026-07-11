/**
 * @file Pure along-route traffic flow helpers (no DOM, no network, no globals).
 * @module modules/navigation/route-traffic-flow
 */
(function (root) {
    'use strict';

    /** Traffic level colours for route-edge overlays. */
    var TRAFFIC_COLORS = {
        green: '#22CC22',
        orange: '#FF8C00',
        red: '#FF0000',
        black: '#333333',
    };

    /**
     * Forward search for the closest polyline vertex to a target [lat, lon].
     * @param {Array<[number,number]>} polyline
     * @param {[number,number]} targetPoint
     * @param {number} [startSearchIdx]
     * @returns {number}
     */
    function findForwardPolylineIndex(polyline, targetPoint, startSearchIdx) {
        polyline = polyline || [];
        startSearchIdx = startSearchIdx || 0;
        if (polyline.length === 0) return -1;

        var closestIdx = startSearchIdx;
        var minDist = Infinity;
        for (var i = startSearchIdx; i < polyline.length; i++) {
            var point = polyline[i];
            var dist = Math.pow(point[0] - targetPoint[0], 2) + Math.pow(point[1] - targetPoint[1], 2);
            if (dist < minDist) {
                minDist = dist;
                closestIdx = i;
            }
        }
        return closestIdx;
    }

    /**
     * Sample points along the route ahead of the driver for TomTom flow API.
     * @param {Array<[number,number]>} polyline
     * @param {number} startIdx
     * @param {number} [targetSegmentCount]
     * @returns {{ points: Array<[number,number]>, sampleInterval: number }|null}
     */
    function buildTrafficFlowSamplePlan(polyline, startIdx, targetSegmentCount) {
        targetSegmentCount = targetSegmentCount || 8;
        polyline = polyline || [];
        startIdx = Math.max(0, Math.min(startIdx || 0, polyline.length - 2));
        var ahead = polyline.slice(startIdx);
        if (ahead.length < 2) return null;
        var points = ahead.map(function (p) { return [p[0], p[1]]; });
        var sampleInterval = Math.max(1, Math.floor(points.length / targetSegmentCount));
        return { points: points, sampleInterval: sampleInterval };
    }

    /**
     * Aggregate delay, congestion, and avoid points from TomTom flow segments.
     * @param {Array<Object>} segments
     * @param {function(number, number, number, number): number} calculateDistanceMeters
     * @returns {Object}
     */
    function parseTrafficFlowSegments(segments, calculateDistanceMeters) {
        segments = segments || [];
        var delaySec = 0;
        var congestedCount = 0;
        var congestionSum = 0;
        var severe = false;
        var congestedPoints = [];

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var lvl = seg.traffic_level;
            var cur = Number(seg.current_speed) || 0;
            var free = Number(seg.free_flow_speed) || 0;
            var s = seg.start;
            var e = seg.end;
            if (!Array.isArray(s) || !Array.isArray(e)) continue;
            var segMeters = typeof calculateDistanceMeters === 'function'
                ? calculateDistanceMeters(s[0], s[1], e[0], e[1])
                : 0;
            if (cur > 0 && free > 0 && cur < free && segMeters > 0) {
                var km = segMeters / 1000;
                delaySec += (km / cur - km / free) * 3600;
            }
            congestionSum += Number(seg.congestion_percent) || 0;
            if (lvl === 'orange' || lvl === 'red' || lvl === 'black') {
                congestedCount++;
                if (lvl === 'red' || lvl === 'black') {
                    congestedPoints.push({ lat: (s[0] + e[0]) / 2, lon: (s[1] + e[1]) / 2 });
                }
                if (lvl === 'black') severe = true;
            }
        }

        return {
            delayMin: delaySec / 60,
            congestedCount: congestedCount,
            avgCongestion: segments.length ? Math.round(congestionSum / segments.length) : 0,
            severe: severe,
            congestedPoints: congestedPoints,
        };
    }

    /**
     * Navigation reroute/ETA snapshot from a successful flow API payload.
     * @param {Object} apiData
     * @param {function(number, number, number, number): number} calculateDistanceMeters
     * @returns {Object|null}
     */
    function buildTrafficAheadSnapshot(apiData, calculateDistanceMeters) {
        apiData = apiData || {};
        if (!apiData.success || !Array.isArray(apiData.segments)) return null;
        var parsed = parseTrafficFlowSegments(apiData.segments, calculateDistanceMeters);
        return {
            delayMin: parsed.delayMin,
            congestedCount: parsed.congestedCount,
            avgCongestion: parsed.avgCongestion,
            severe: parsed.severe,
            congestedPoints: parsed.congestedPoints,
            source: apiData.source || 'unknown',
        };
    }

    /**
     * Count segments per traffic level (debug/logging).
     * @param {Array<Object>} segments
     * @returns {Object}
     */
    function countTrafficSegmentLevels(segments) {
        var levelCounts = { green: 0, orange: 0, red: 0, black: 0 };
        (segments || []).forEach(function (s) {
            var lvl = s.traffic_level || 'green';
            levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
        });
        return levelCounts;
    }

    /**
     * @param {string} level
     * @param {Object} [colors]
     * @returns {string}
     */
    function resolveTrafficEdgeColor(level, colors) {
        var palette = colors || TRAFFIC_COLORS;
        return palette[level] || palette.orange;
    }

    /**
     * Draw plans for congested traffic edges along the route polyline.
     * @param {Array<Object>} segments
     * @param {Array<[number,number]>} polyline
     * @param {Object} [opts]
     * @param {Object} [opts.trafficColors]
     * @param {boolean} [opts.skipGreen]
     * @returns {Array<Object>}
     */
    function buildTrafficEdgeDrawPlans(segments, polyline, opts) {
        opts = opts || {};
        segments = segments || [];
        polyline = polyline || [];
        if (!segments.length || !polyline.length) return [];

        var colors = opts.trafficColors || TRAFFIC_COLORS;
        var skipGreen = opts.skipGreen !== false;
        var plans = [];
        var lastEndIdx = 0;

        for (var idx = 0; idx < segments.length; idx++) {
            var segment = segments[idx];
            var level = segment.traffic_level || 'green';
            var startIdx = findForwardPolylineIndex(polyline, segment.start, lastEndIdx);
            var endIdx = findForwardPolylineIndex(polyline, segment.end, startIdx);

            if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) continue;
            lastEndIdx = endIdx;

            if (skipGreen && level === 'green') continue;

            var segmentPoints = polyline.slice(startIdx, endIdx + 1);
            if (segmentPoints.length < 2) {
                segmentPoints = [segment.start, segment.end];
            }

            plans.push({
                segmentIndex: idx,
                trafficLevel: level,
                color: resolveTrafficEdgeColor(level, colors),
                points: segmentPoints,
            });
        }
        return plans;
    }

    var ROUTE_TRAFFIC_POLYLINE_SAMPLE_DIVISOR = 20;

    /**
     * Dispatch plan for fetching along-route traffic flow data.
     * @param {Object} [opts]
     * @param {boolean} [opts.routeTrafficEnabled]
     * @param {Array<[number,number]>} [opts.routePolyline]
     * @returns {Object}
     */
    function buildFetchRouteTrafficDispatchPlan(opts) {
        opts = opts || {};
        var polyline = opts.routePolyline || [];
        if (!opts.routeTrafficEnabled || polyline.length < 2) {
            return { shouldFetch: false };
        }
        return {
            shouldFetch: true,
            sampleInterval: Math.max(1, Math.floor(polyline.length / ROUTE_TRAFFIC_POLYLINE_SAMPLE_DIVISOR)),
            routePolylineLength: polyline.length,
        };
    }

    var ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE = { weight: 6, opacity: 0.9 };

    /**
     * Apply plan for drawing congested traffic edges along the route.
     * @param {Array<Object>} segments
     * @param {Array<[number,number]>} polyline
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildDisplayRouteTrafficEdgesApplyPlan(segments, polyline, opts) {
        opts = opts || {};
        segments = segments || [];
        polyline = polyline || [];
        if (!segments.length || polyline.length === 0) {
            return { shouldDisplay: false };
        }
        var drawPlans = buildTrafficEdgeDrawPlans(segments, polyline, opts);
        return {
            shouldDisplay: drawPlans.length > 0,
            levelCounts: countTrafficSegmentLevels(segments),
            polylines: drawPlans.map(function (plan) {
                return {
                    points: plan.points,
                    color: plan.color,
                    weight: ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE.weight,
                    opacity: ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE.opacity,
                };
            }),
            bringTrafficEdgesToTop: true,
            bringNavRouteAboveTrafficEdges: true,
        };
    }

    var api = {
        TRAFFIC_COLORS: TRAFFIC_COLORS,
        findForwardPolylineIndex: findForwardPolylineIndex,
        buildTrafficFlowSamplePlan: buildTrafficFlowSamplePlan,
        parseTrafficFlowSegments: parseTrafficFlowSegments,
        buildTrafficAheadSnapshot: buildTrafficAheadSnapshot,
        countTrafficSegmentLevels: countTrafficSegmentLevels,
        resolveTrafficEdgeColor: resolveTrafficEdgeColor,
        buildTrafficEdgeDrawPlans: buildTrafficEdgeDrawPlans,
        buildFetchRouteTrafficDispatchPlan: buildFetchRouteTrafficDispatchPlan,
        buildDisplayRouteTrafficEdgesApplyPlan: buildDisplayRouteTrafficEdgesApplyPlan,
        ROUTE_TRAFFIC_POLYLINE_SAMPLE_DIVISOR: ROUTE_TRAFFIC_POLYLINE_SAMPLE_DIVISOR,
        ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE: ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteTrafficFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

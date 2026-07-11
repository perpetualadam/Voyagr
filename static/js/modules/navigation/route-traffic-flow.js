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
    var ROUTE_TRAFFIC_UPDATE_INTERVAL_MS = 2 * 60 * 1000;
    var ROUTE_TRAFFIC_FIRST_UPDATE_DELAY_MS = 500;
    var ROUTE_TRAFFIC_ENABLED_STORAGE_KEY = 'routeTrafficEnabled';
    var ROUTE_TRAFFIC_TOGGLE_ID = 'routeTrafficToggle';

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

    /**
     * Display orchestration plan for mounting route-traffic edge polylines.
     * @param {Array<Object>} segments
     * @param {Array<[number,number]>} polyline
     * @param {Object} [opts]
     * @param {boolean} [opts.hasMap]
     * @returns {Object}
     */
    function buildRouteTrafficEdgesDisplayPlan(segments, polyline, opts) {
        opts = opts || {};
        var apply = buildDisplayRouteTrafficEdgesApplyPlan(segments, polyline, opts);
        var hasMap = opts.hasMap !== false;
        if (!hasMap || !apply.shouldDisplay) {
            return {
                shouldDisplay: false,
                cannotDisplayLog: {
                    map: hasMap,
                    segmentCount: (segments || []).length,
                    polylineLength: (polyline || []).length,
                },
            };
        }
        return {
            shouldDisplay: true,
            levelCounts: apply.levelCounts,
            polylines: apply.polylines,
            polylineMountCount: apply.polylines.length,
            bringTrafficEdgesToTop: apply.bringTrafficEdgesToTop,
            bringNavRouteAboveTrafficEdges: apply.bringNavRouteAboveTrafficEdges,
        };
    }

    /**
     * Post-mount plan after route-traffic edge polylines are added to the map.
     * @param {number} [existingLayerCount]
     * @param {number} [newPolylineCount]
     * @returns {Object}
     */
    function buildRouteTrafficEdgesMountCompletePlan(existingLayerCount, newPolylineCount) {
        var added = newPolylineCount || 0;
        var total = (existingLayerCount || 0) + added;
        return {
            addedLayerCount: added,
            totalLayerCount: total,
            logMessage: '[Route Traffic] Added ' + total + ' congested traffic edge layers',
        };
    }

    var ROUTE_TRAFFIC_SAMPLE_TTL_MS = 60 * 1000;
    var ROUTE_TRAFFIC_AHEAD_SAMPLE_SEGMENT_COUNT = 8;

    /**
     * Dispatch plan for sampling live traffic ahead of the driver on the active route.
     * @param {Array<[number,number]>} routePolyline
     * @param {number} [lastSnappedRouteIndex]
     * @returns {Object}
     */
    function buildSampleRouteTrafficAheadDispatchPlan(routePolyline, lastSnappedRouteIndex) {
        routePolyline = routePolyline || [];
        if (routePolyline.length < 2) {
            return { shouldSample: false };
        }
        var startIdx = Math.max(0, Math.min(lastSnappedRouteIndex || 0, routePolyline.length - 2));
        var samplePlan = buildTrafficFlowSamplePlan(
            routePolyline,
            startIdx,
            ROUTE_TRAFFIC_AHEAD_SAMPLE_SEGMENT_COUNT
        );
        if (!samplePlan) {
            return { shouldSample: false };
        }
        return {
            shouldSample: true,
            startIdx: startIdx,
            points: samplePlan.points,
            sampleInterval: samplePlan.sampleInterval,
        };
    }

    /**
     * Cache plan for along-route traffic snapshots shared by ETA refresh and reroute monitor.
     * @param {boolean} forceFresh
     * @param {{ at: number, result: Object }|null} cacheEntry
     * @param {number} [now]
     * @param {number} [ttlMs]
     * @returns {Object}
     */
    function buildRouteTrafficAheadCachePlan(forceFresh, cacheEntry, now, ttlMs) {
        var stamp = now != null ? now : Date.now();
        var ttl = ttlMs != null ? ttlMs : ROUTE_TRAFFIC_SAMPLE_TTL_MS;
        if (!forceFresh && cacheEntry && (stamp - cacheEntry.at) < ttl) {
            return { useCache: true, cachedResult: cacheEntry.result };
        }
        return { useCache: false, shouldFetch: true };
    }

    var ROUTE_TRAFFIC_FLOW_API_PATH = '/api/route-traffic-flow';
    var ROUTE_TRAFFIC_BACKOFF_NETWORK_MS = 60000;
    var ROUTE_TRAFFIC_BACKOFF_NON_JSON_MS = 60000;
    var ROUTE_TRAFFIC_BACKOFF_JSON_PARSE_MS = 60000;
    var ROUTE_TRAFFIC_BACKOFF_CLIENT_ERROR_MS = 30000;
    var ROUTE_TRAFFIC_BACKOFF_SERVER_ERROR_MS = 90000;

    /**
     * Preflight plan respecting upstream backoff window.
     * @param {number} backoffUntil
     * @param {number} [now]
     * @returns {{ shouldRequest: boolean, reason?: string }}
     */
    function buildRouteTrafficFlowPreflightPlan(backoffUntil, now) {
        var stamp = now != null ? now : Date.now();
        if (backoffUntil && stamp < backoffUntil) {
            return { shouldRequest: false, reason: 'backoff' };
        }
        return { shouldRequest: true };
    }

    /**
     * Fetch request plan for /api/route-traffic-flow.
     * @param {Array<[number,number]>} points
     * @param {number} sampleInterval
     * @returns {Object}
     */
    function buildRouteTrafficFlowFetchRequestPlan(points, sampleInterval) {
        return {
            url: ROUTE_TRAFFIC_FLOW_API_PATH,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                points: points || [],
                sample_interval: sampleInterval,
            }),
        };
    }

    /**
     * Outcome plan for a route-traffic-flow HTTP response.
     * @param {Object} meta
     * @returns {Object}
     */
    function buildRouteTrafficFlowResponsePlan(meta) {
        meta = meta || {};
        if (meta.errorKind === 'network') {
            return {
                ok: false,
                setBackoffMs: ROUTE_TRAFFIC_BACKOFF_NETWORK_MS,
                logMessage: 'network error',
            };
        }
        if (!meta.ok) {
            return {
                ok: false,
                setBackoffMs: (meta.status || 0) >= 500
                    ? ROUTE_TRAFFIC_BACKOFF_SERVER_ERROR_MS
                    : ROUTE_TRAFFIC_BACKOFF_CLIENT_ERROR_MS,
                logMessage: 'HTTP ' + (meta.status || 0),
            };
        }
        var contentType = meta.contentType || '';
        if (contentType.indexOf('application/json') < 0) {
            return {
                ok: false,
                setBackoffMs: ROUTE_TRAFFIC_BACKOFF_NON_JSON_MS,
                logMessage: 'non-JSON response',
            };
        }
        return { ok: true, parseJson: true };
    }

    /**
     * Failure plan when response JSON parsing fails.
     * @returns {Object}
     */
    function buildRouteTrafficFlowParseFailurePlan() {
        return {
            ok: false,
            setBackoffMs: ROUTE_TRAFFIC_BACKOFF_JSON_PARSE_MS,
            logMessage: 'JSON parse failed',
        };
    }

    /**
     * Apply plan for updating route-traffic-flow backoff after a failed request.
     * @param {Object} failPlan
     * @param {number} [now]
     * @returns {Object}
     */
    function buildRouteTrafficFlowBackoffUpdatePlan(failPlan, now) {
        failPlan = failPlan || {};
        var stamp = now != null ? now : Date.now();
        return {
            backoffUntil: stamp + (failPlan.setBackoffMs || 0),
            logMessage: failPlan.logMessage || 'request failed',
        };
    }

    /**
     * Dispatch plan for starting periodic route-traffic edge updates during navigation.
     * @param {Object} [opts]
     * @param {*} [opts.routeTrafficUpdateInterval]
     * @param {boolean} [opts.routeTrafficEnabled]
     * @param {Array<[number,number]>} [opts.routePolyline]
     * @returns {Object}
     */
    function buildStartRouteTrafficUpdatesDispatchPlan(opts) {
        opts = opts || {};
        var polyline = opts.routePolyline || [];
        var hasPolyline = polyline.length > 0;
        return {
            shouldRestart: true,
            clearExistingInterval: !!opts.routeTrafficUpdateInterval,
            immediateUpdate: !!(opts.routeTrafficEnabled && hasPolyline),
            immediateDelayMs: ROUTE_TRAFFIC_FIRST_UPDATE_DELAY_MS,
            intervalMs: ROUTE_TRAFFIC_UPDATE_INTERVAL_MS,
            startLogMessage: '[Route Traffic] Starting updates - enabled: ' + !!opts.routeTrafficEnabled +
                ' polyline: ' + polyline.length,
            logMessage: '[Route Traffic] Started automatic updates every ' +
                (ROUTE_TRAFFIC_UPDATE_INTERVAL_MS / 1000) + ' seconds',
        };
    }

    /**
     * Tick plan for the route-traffic edge update interval.
     * @param {Object} [opts]
     * @param {boolean} [opts.routeInProgress]
     * @param {boolean} [opts.routeTrafficEnabled]
     * @param {Array<[number,number]>} [opts.routePolyline]
     * @returns {Object}
     */
    function buildRouteTrafficIntervalTickPlan(opts) {
        opts = opts || {};
        var polyline = opts.routePolyline || [];
        return {
            shouldFetch: !!(opts.routeInProgress && opts.routeTrafficEnabled && polyline.length > 0),
            tickLogMessage: '[Route Traffic] Periodic update triggered',
        };
    }

    /**
     * Dispatch plan for stopping route-traffic edge updates.
     * @param {*} [routeTrafficUpdateInterval]
     * @returns {Object}
     */
    function buildStopRouteTrafficUpdatesDispatchPlan(routeTrafficUpdateInterval) {
        return {
            shouldStopInterval: !!routeTrafficUpdateInterval,
            clearTrafficLayers: true,
            logMessage: '[Route Traffic] Stopped automatic updates',
        };
    }

    /**
     * Toggle plan for enabling/disabling route-traffic edge display.
     * @param {boolean} currentEnabled
     * @returns {Object}
     */
    function buildRouteTrafficTogglePlan(currentEnabled) {
        var next = !currentEnabled;
        return {
            nextEnabled: next,
            storageKey: ROUTE_TRAFFIC_ENABLED_STORAGE_KEY,
            useWriteBoolPref: true,
            toggleElementId: ROUTE_TRAFFIC_TOGGLE_ID,
            fetchIfRouteInProgress: next,
            clearLayersOnDisable: !next,
            statusMessage: next
                ? '🚦 Route traffic display enabled'
                : '🚦 Route traffic display disabled',
            statusType: next ? 'success' : 'info',
        };
    }

    /**
     * Apply plan for clearing route-traffic edge layers from the map.
     * @param {Array<Object>} layers
     * @returns {Object}
     */
    function buildClearRouteTrafficLayersApplyPlan(layers) {
        layers = layers || [];
        return {
            shouldClear: layers.length > 0,
            layers: layers.map(function (layer, idx) {
                return {
                    index: idx,
                    hasRemove: !!(layer && typeof layer.remove === 'function'),
                    layerId: layer && layer.id ? layer.id : null,
                };
            }),
            resetLayersArray: true,
            logMessage: '[Route Traffic] Cleared traffic edge layers',
        };
    }

    /**
     * Orchestration plan before fetching route-traffic edge data.
     * @param {Object} [opts]
     * @param {boolean} [opts.routeTrafficEnabled]
     * @param {Array<[number,number]>} [opts.routePolyline]
     * @returns {Object}
     */
    function buildFetchAndDisplayRouteTrafficOrchestrationPlan(opts) {
        opts = opts || {};
        var dispatch = buildFetchRouteTrafficDispatchPlan(opts);
        if (!dispatch.shouldFetch) {
            return {
                shouldFetch: false,
                logMessage: '[Route Traffic] Not enabled or no route available',
            };
        }
        return {
            shouldFetch: true,
            sampleInterval: dispatch.sampleInterval,
            fetchLogMessage: '[Route Traffic] Fetching traffic data for route...',
        };
    }

    /**
     * Response plan after route-traffic edge fetch completes.
     * @param {Object|null} data
     * @returns {Object}
     */
    function buildFetchAndDisplayRouteTrafficResponsePlan(data) {
        if (!data) {
            return {
                action: 'none',
                reason: 'no_data',
                debugMessage: '[Route Traffic] No traffic data (backoff or upstream unavailable)',
            };
        }
        if (data.success && data.segments && data.segments.length > 0) {
            return {
                action: 'display',
                segments: data.segments,
                segmentCount: data.segments.length,
                source: data.source,
                logMessage: '[Route Traffic] Displayed ' + data.segments.length +
                    ' traffic segments (source: ' + data.source + ')',
            };
        }
        return {
            action: 'none',
            reason: 'empty_segments',
            debugMessage: '[Route Traffic] No traffic segments returned',
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
        buildRouteTrafficEdgesDisplayPlan: buildRouteTrafficEdgesDisplayPlan,
        buildRouteTrafficEdgesMountCompletePlan: buildRouteTrafficEdgesMountCompletePlan,
        buildRouteTrafficFlowPreflightPlan: buildRouteTrafficFlowPreflightPlan,
        buildRouteTrafficFlowFetchRequestPlan: buildRouteTrafficFlowFetchRequestPlan,
        buildRouteTrafficFlowResponsePlan: buildRouteTrafficFlowResponsePlan,
        buildRouteTrafficFlowParseFailurePlan: buildRouteTrafficFlowParseFailurePlan,
        buildRouteTrafficFlowBackoffUpdatePlan: buildRouteTrafficFlowBackoffUpdatePlan,
        buildStartRouteTrafficUpdatesDispatchPlan: buildStartRouteTrafficUpdatesDispatchPlan,
        buildRouteTrafficIntervalTickPlan: buildRouteTrafficIntervalTickPlan,
        buildStopRouteTrafficUpdatesDispatchPlan: buildStopRouteTrafficUpdatesDispatchPlan,
        buildRouteTrafficTogglePlan: buildRouteTrafficTogglePlan,
        buildClearRouteTrafficLayersApplyPlan: buildClearRouteTrafficLayersApplyPlan,
        buildFetchAndDisplayRouteTrafficOrchestrationPlan: buildFetchAndDisplayRouteTrafficOrchestrationPlan,
        buildFetchAndDisplayRouteTrafficResponsePlan: buildFetchAndDisplayRouteTrafficResponsePlan,
        ROUTE_TRAFFIC_ENABLED_STORAGE_KEY: ROUTE_TRAFFIC_ENABLED_STORAGE_KEY,
        ROUTE_TRAFFIC_TOGGLE_ID: ROUTE_TRAFFIC_TOGGLE_ID,
        ROUTE_TRAFFIC_UPDATE_INTERVAL_MS: ROUTE_TRAFFIC_UPDATE_INTERVAL_MS,
        ROUTE_TRAFFIC_FIRST_UPDATE_DELAY_MS: ROUTE_TRAFFIC_FIRST_UPDATE_DELAY_MS,
        ROUTE_TRAFFIC_SAMPLE_TTL_MS: ROUTE_TRAFFIC_SAMPLE_TTL_MS,
        ROUTE_TRAFFIC_AHEAD_SAMPLE_SEGMENT_COUNT: ROUTE_TRAFFIC_AHEAD_SAMPLE_SEGMENT_COUNT,
        buildSampleRouteTrafficAheadDispatchPlan: buildSampleRouteTrafficAheadDispatchPlan,
        buildRouteTrafficAheadCachePlan: buildRouteTrafficAheadCachePlan,
        ROUTE_TRAFFIC_FLOW_API_PATH: ROUTE_TRAFFIC_FLOW_API_PATH,
        ROUTE_TRAFFIC_BACKOFF_SERVER_ERROR_MS: ROUTE_TRAFFIC_BACKOFF_SERVER_ERROR_MS,
        ROUTE_TRAFFIC_POLYLINE_SAMPLE_DIVISOR: ROUTE_TRAFFIC_POLYLINE_SAMPLE_DIVISOR,
        ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE: ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteTrafficFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

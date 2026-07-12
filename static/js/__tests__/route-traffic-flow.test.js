/**
 * Tests for modules/navigation/route-traffic-flow.js
 */
const RTF = require('../modules/navigation/route-traffic-flow.js');

const polyline = [
    [51.50, -0.10],
    [51.51, -0.11],
    [51.52, -0.12],
    [51.53, -0.13],
    [51.54, -0.14],
];

describe('route-traffic-flow module surface', () => {
    test('exposes expected pure helpers', () => {
        expect(typeof RTF.findForwardPolylineIndex).toBe('function');
        expect(typeof RTF.buildTrafficFlowSamplePlan).toBe('function');
        expect(typeof RTF.parseTrafficFlowSegments).toBe('function');
        expect(typeof RTF.buildTrafficEdgeDrawPlans).toBe('function');
    });
});

describe('findForwardPolylineIndex', () => {
    test('returns -1 for empty polyline', () => {
        expect(RTF.findForwardPolylineIndex([], [51.5, -0.1])).toBe(-1);
    });

    test('searches forward from start index', () => {
        expect(RTF.findForwardPolylineIndex(polyline, [51.53, -0.13], 2)).toBe(3);
    });
});

describe('buildTrafficFlowSamplePlan', () => {
    test('returns null when not enough points ahead', () => {
        expect(RTF.buildTrafficFlowSamplePlan([[51.5, -0.1]], 0)).toBeNull();
        expect(RTF.buildTrafficFlowSamplePlan([], 0)).toBeNull();
    });

    test('samples roughly eight segments along the road ahead', () => {
        const plan = RTF.buildTrafficFlowSamplePlan(polyline, 0, 8);
        expect(plan.points).toHaveLength(5);
        expect(plan.sampleInterval).toBe(1);
    });
});

describe('parseTrafficFlowSegments / buildTrafficAheadSnapshot', () => {
    const dist = () => 1000;

    test('aggregates delay and severe avoid points from congested segments', () => {
        const parsed = RTF.parseTrafficFlowSegments([
            {
                traffic_level: 'red',
                current_speed: 20,
                free_flow_speed: 60,
                congestion_percent: 70,
                start: [51.50, -0.10],
                end: [51.51, -0.11],
            },
            {
                traffic_level: 'black',
                current_speed: 5,
                free_flow_speed: 50,
                congestion_percent: 95,
                start: [51.52, -0.12],
                end: [51.53, -0.13],
            },
        ], dist);
        expect(parsed.congestedCount).toBe(2);
        expect(parsed.severe).toBe(true);
        expect(parsed.congestedPoints).toHaveLength(2);
        expect(parsed.delayMin).toBeGreaterThan(0);
    });

    test('buildTrafficAheadSnapshot returns null for invalid API payload', () => {
        expect(RTF.buildTrafficAheadSnapshot({ success: false }, dist)).toBeNull();
        expect(RTF.buildTrafficAheadSnapshot({ success: true, segments: [] }, dist).source).toBe('unknown');
    });

    test('buildTrafficAheadSnapshot preserves API source', () => {
        const snap = RTF.buildTrafficAheadSnapshot({
            success: true,
            source: 'TomTom',
            segments: [{
                traffic_level: 'orange',
                current_speed: 40,
                free_flow_speed: 60,
                congestion_percent: 30,
                start: [51.50, -0.10],
                end: [51.51, -0.11],
            }],
        }, dist);
        expect(snap.source).toBe('TomTom');
        expect(snap.congestedCount).toBe(1);
    });
});

describe('buildTrafficEdgeDrawPlans', () => {
    test('skips green segments and maps congested slices to route geometry', () => {
        const plans = RTF.buildTrafficEdgeDrawPlans([
            { traffic_level: 'green', start: [51.50, -0.10], end: [51.51, -0.11] },
            { traffic_level: 'red', start: [51.51, -0.11], end: [51.53, -0.13] },
        ], polyline);
        expect(plans).toHaveLength(1);
        expect(plans[0].trafficLevel).toBe('red');
        expect(plans[0].color).toBe(RTF.TRAFFIC_COLORS.red);
        expect(plans[0].points.length).toBeGreaterThanOrEqual(2);
    });

    test('countTrafficSegmentLevels tallies levels', () => {
        expect(RTF.countTrafficSegmentLevels([
            { traffic_level: 'green' },
            { traffic_level: 'red' },
            { traffic_level: 'red' },
        ])).toEqual({ green: 1, orange: 0, red: 2, black: 0 });
    });
});

describe('route traffic dispatch and display plans', () => {
    test('buildFetchRouteTrafficDispatchPlan samples polyline when enabled', () => {
        const dispatch = RTF.buildFetchRouteTrafficDispatchPlan({
            routeTrafficEnabled: true,
            routePolyline: polyline,
        });
        expect(dispatch.shouldFetch).toBe(true);
        expect(dispatch.sampleInterval).toBe(1);
    });

    test('buildFetchRouteTrafficDispatchPlan rejects disabled or short routes', () => {
        expect(RTF.buildFetchRouteTrafficDispatchPlan({ routeTrafficEnabled: false, routePolyline: polyline }).shouldFetch)
            .toBe(false);
    });

    test('buildDisplayRouteTrafficEdgesApplyPlan maps congested segments to styled polylines', () => {
        const apply = RTF.buildDisplayRouteTrafficEdgesApplyPlan(
            [{ traffic_level: 'orange', start: [51.51, -0.11], end: [51.53, -0.13] }],
            polyline
        );
        expect(apply.shouldDisplay).toBe(true);
        expect(apply.polylines[0].weight).toBe(RTF.ROUTE_TRAFFIC_EDGE_POLYLINE_STYLE.weight);
        expect(apply.bringTrafficEdgesToTop).toBe(true);
    });
});

describe('route traffic flow fetch plans', () => {
    test('buildRouteTrafficFlowPreflightPlan respects backoff window', () => {
        expect(RTF.buildRouteTrafficFlowPreflightPlan(Date.now() + 5000, Date.now()).shouldRequest).toBe(false);
        expect(RTF.buildRouteTrafficFlowPreflightPlan(0).shouldRequest).toBe(true);
    });

    test('buildRouteTrafficFlowFetchRequestPlan posts sampled points', () => {
        const request = RTF.buildRouteTrafficFlowFetchRequestPlan(polyline, 2);
        expect(request.url).toBe(RTF.ROUTE_TRAFFIC_FLOW_API_PATH);
        expect(JSON.parse(request.body).sample_interval).toBe(2);
    });

    test('buildRouteTrafficFlowResponsePlan maps HTTP and parse failures to backoff', () => {
        expect(RTF.buildRouteTrafficFlowResponsePlan({ ok: false, status: 503 }).setBackoffMs)
            .toBe(RTF.ROUTE_TRAFFIC_BACKOFF_SERVER_ERROR_MS);
        expect(RTF.buildRouteTrafficFlowParseFailurePlan().logMessage).toContain('JSON');
    });
});

describe('route traffic ahead sampling and cache plans', () => {
    test('buildSampleRouteTrafficAheadDispatchPlan samples ahead of snapped index', () => {
        const dispatch = RTF.buildSampleRouteTrafficAheadDispatchPlan(polyline, 2);
        expect(dispatch.shouldSample).toBe(true);
        expect(dispatch.startIdx).toBe(2);
        expect(dispatch.points.length).toBe(polyline.length - 2);
        expect(dispatch.sampleInterval).toBeGreaterThanOrEqual(1);
    });

    test('buildSampleRouteTrafficAheadDispatchPlan rejects short polylines', () => {
        expect(RTF.buildSampleRouteTrafficAheadDispatchPlan([polyline[0]], 0).shouldSample).toBe(false);
        expect(RTF.buildSampleRouteTrafficAheadDispatchPlan([], 0).shouldSample).toBe(false);
    });

    test('buildRouteTrafficAheadCachePlan returns cached result within TTL', () => {
        const now = 1_000_000;
        const cached = { delayMin: 3, source: 'TomTom' };
        const plan = RTF.buildRouteTrafficAheadCachePlan(
            false,
            { at: now - 30_000, result: cached },
            now,
            RTF.ROUTE_TRAFFIC_SAMPLE_TTL_MS
        );
        expect(plan.useCache).toBe(true);
        expect(plan.cachedResult).toBe(cached);
    });

    test('buildRouteTrafficAheadCachePlan fetches when stale or forced', () => {
        const now = 1_000_000;
        const stale = RTF.buildRouteTrafficAheadCachePlan(
            false,
            { at: now - RTF.ROUTE_TRAFFIC_SAMPLE_TTL_MS, result: {} },
            now
        );
        expect(stale.useCache).toBe(false);
        expect(stale.shouldFetch).toBe(true);

        const forced = RTF.buildRouteTrafficAheadCachePlan(
            true,
            { at: now - 1_000, result: {} },
            now
        );
        expect(forced.useCache).toBe(false);
        expect(forced.shouldFetch).toBe(true);
    });

    test('buildRouteTrafficFlowBackoffUpdatePlan computes backoffUntil from failure plan', () => {
        const now = 1_000_000;
        const fail = RTF.buildRouteTrafficFlowResponsePlan({ errorKind: 'network' });
        const backoff = RTF.buildRouteTrafficFlowBackoffUpdatePlan(fail, now);
        expect(backoff.backoffUntil).toBe(now + fail.setBackoffMs);
        expect(backoff.logMessage).toContain('network');
    });

    test('buildStartRouteTrafficUpdatesDispatchPlan schedules immediate and periodic updates', () => {
        const plan = RTF.buildStartRouteTrafficUpdatesDispatchPlan({
            routeTrafficUpdateInterval: null,
            routeTrafficEnabled: true,
            routePolyline: [[51.5, -0.1], [51.6, -0.2]],
        });
        expect(plan.immediateUpdate).toBe(true);
        expect(plan.intervalMs).toBe(RTF.ROUTE_TRAFFIC_UPDATE_INTERVAL_MS);
        expect(plan.immediateDelayMs).toBe(RTF.ROUTE_TRAFFIC_FIRST_UPDATE_DELAY_MS);
    });

    test('buildRouteTrafficIntervalTickPlan requires active route and polyline', () => {
        expect(RTF.buildRouteTrafficIntervalTickPlan({
            routeInProgress: true,
            routeTrafficEnabled: true,
            routePolyline: [[1, 2], [3, 4]],
        }).shouldFetch).toBe(true);
        expect(RTF.buildRouteTrafficIntervalTickPlan({
            routeInProgress: false,
            routeTrafficEnabled: true,
            routePolyline: [[1, 2]],
        }).shouldFetch).toBe(false);
    });

    test('buildStopRouteTrafficUpdatesDispatchPlan always clears traffic layers', () => {
        const stopped = RTF.buildStopRouteTrafficUpdatesDispatchPlan(null);
        expect(stopped.shouldStopInterval).toBe(false);
        expect(stopped.clearTrafficLayers).toBe(true);
        expect(RTF.buildStopRouteTrafficUpdatesDispatchPlan({}).shouldStopInterval).toBe(true);
    });

    test('buildRouteTrafficTogglePlan flips enabled state and side effects', () => {
        const disable = RTF.buildRouteTrafficTogglePlan(true);
        expect(disable.nextEnabled).toBe(false);
        expect(disable.clearLayersOnDisable).toBe(true);
        expect(disable.toggleElementId).toBe(RTF.ROUTE_TRAFFIC_TOGGLE_ID);

        const enable = RTF.buildRouteTrafficTogglePlan(false);
        expect(enable.fetchIfRouteInProgress).toBe(true);
        expect(enable.storageKey).toBe(RTF.ROUTE_TRAFFIC_ENABLED_STORAGE_KEY);
        expect(enable.saveAllSettings).toBe(true);
    });

    test('buildClearRouteTrafficLayersApplyPlan maps layer removal strategies', () => {
        const plan = RTF.buildClearRouteTrafficLayersApplyPlan([
            { remove: function () {} },
            { id: 'traffic-edge-1' },
        ]);
        expect(plan.layers[0].hasRemove).toBe(true);
        expect(plan.layers[1].layerId).toBe('traffic-edge-1');
        expect(plan.resetLayersArray).toBe(true);
    });

    test('buildFetchAndDisplayRouteTraffic orchestration and response plans', () => {
        const orch = RTF.buildFetchAndDisplayRouteTrafficOrchestrationPlan({
            routeTrafficEnabled: true,
            routePolyline: [[51.5, -0.1], [51.6, -0.2]],
        });
        expect(orch.shouldFetch).toBe(true);
        expect(orch.sampleInterval).toBeGreaterThanOrEqual(1);

        const display = RTF.buildFetchAndDisplayRouteTrafficResponsePlan({
            success: true,
            segments: [{ traffic_level: 'red' }],
            source: 'TomTom',
        });
        expect(display.action).toBe('display');
        expect(display.logMessage).toContain('TomTom');

        expect(RTF.buildFetchAndDisplayRouteTrafficResponsePlan(null).reason).toBe('no_data');
    });

    test('buildRouteTrafficEdgesDisplayPlan mounts polylines when map and segments exist', () => {
        const plan = RTF.buildRouteTrafficEdgesDisplayPlan(
            [{ traffic_level: 'orange', start: [51.51, -0.11], end: [51.53, -0.13] }],
            polyline,
            { hasMap: true }
        );
        expect(plan.shouldDisplay).toBe(true);
        expect(plan.polylineMountCount).toBeGreaterThan(0);
        expect(plan.bringTrafficEdgesToTop).toBe(true);

        const blocked = RTF.buildRouteTrafficEdgesDisplayPlan(
            [{ traffic_level: 'orange', start: [51.51, -0.11], end: [51.53, -0.13] }],
            polyline,
            { hasMap: false }
        );
        expect(blocked.shouldDisplay).toBe(false);
        expect(blocked.cannotDisplayLog.map).toBe(false);
    });

    test('buildRouteTrafficEdgesMountCompletePlan reports total layer count', () => {
        const plan = RTF.buildRouteTrafficEdgesMountCompletePlan(0, 3);
        expect(plan.totalLayerCount).toBe(3);
        expect(plan.logMessage).toContain('3');
    });

    test('buildRouteTrafficEdgesPostDisplayPlan consolidates z-order side effects', () => {
        const display = RTF.buildRouteTrafficEdgesDisplayPlan(
            [{ traffic_level: 'orange', start: [51.51, -0.11], end: [51.53, -0.13] }],
            polyline,
            { hasMap: true }
        );
        const mount = RTF.buildRouteTrafficEdgesMountCompletePlan(0, display.polylineMountCount);
        const post = RTF.buildRouteTrafficEdgesPostDisplayPlan(display, mount);
        expect(post.shouldPostProcess).toBe(true);
        expect(post.bringTrafficEdgesToTop).toBe(true);
        expect(post.logMessage).toContain('traffic edge layers');

        expect(RTF.buildRouteTrafficEdgesPostDisplayPlan({ shouldDisplay: false }).shouldPostProcess)
            .toBe(false);
    });

    test('buildRouteTrafficEdgesDisplayOrchestrationPlan combines mount and post-display', () => {
        const segments = [
            { traffic_level: 'orange', start: [51.51, -0.11], end: [51.53, -0.13] },
        ];
        const orch = RTF.buildRouteTrafficEdgesDisplayOrchestrationPlan({
            segments,
            polyline,
            hasMap: true,
            layersBeforeMount: 0,
        });
        expect(orch.shouldDisplay).toBe(true);
        expect(orch.mountApply.polylines.length).toBeGreaterThan(0);
        expect(orch.mountApply.polylines[0].registerInRouteTrafficLayers).toBe(true);
        expect(orch.postDisplay.bringTrafficEdgesToTop).toBe(true);
        expect(RTF.buildRouteTrafficEdgesDisplayOrchestrationPlan({
            segments: [],
            polyline,
            hasMap: true,
        }).shouldDisplay).toBe(false);
    });

    test('buildRouteTrafficFlowFailedFetchApplyPlan and cache update plans', () => {
        const fail = RTF.buildRouteTrafficFlowFailedFetchApplyPlan(
            RTF.buildRouteTrafficFlowResponsePlan({ errorKind: 'network' }),
            1000
        );
        expect(fail.result).toBeNull();
        expect(fail.backoffUntil).toBeGreaterThan(1000);

        const cache = RTF.buildRouteTrafficAheadCacheUpdatePlan({ source: 'TomTom' }, 2000);
        expect(cache.shouldUpdateCache).toBe(true);
        expect(cache.cacheEntry.at).toBe(2000);
        expect(RTF.buildRouteTrafficAheadCacheUpdatePlan(null).shouldUpdateCache).toBe(false);
    });
});

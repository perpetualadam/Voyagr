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

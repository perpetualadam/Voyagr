/**
 * Behaviour tests for the real modules/navigation/lane-guidance.js module.
 * These assert the deterministic fallback data rules and the overlay view-model decisions
 * the app must follow, not a re-implementation of them.
 */
const LG = require('../modules/navigation/lane-guidance.js');

describe('lane-guidance module surface', () => {
    test('exposes the expected pure functions', () => {
        ['ordinal', 'laneNameFor', 'laneUrgencyFields', 'buildDeterministicLaneGuidance',
            'normalizeLaneManeuverForUK', 'isMotorwayRoadType',
            'shouldShow', 'badge', 'urgencyClass', 'displayText', 'laneIndicators', 'buildLaneIndicatorHtml']
            .forEach((fn) => expect(typeof LG[fn]).toBe('function'));
    });
});

describe('normalizeLaneManeuverForUK', () => {
    test('slight keep hints on 2-lane primary become straight', () => {
        expect(LG.normalizeLaneManeuverForUK('slight_right', 'primary', 2)).toBe('straight');
        expect(LG.normalizeLaneManeuverForUK('slight_left', 'secondary', 2)).toBe('straight');
    });

    test('slight keep hints stay on motorways', () => {
        expect(LG.normalizeLaneManeuverForUK('slight_right', 'motorway', 3)).toBe('slight_right');
    });

    test('through alias maps to straight', () => {
        expect(LG.normalizeLaneManeuverForUK('through', 'primary', 2)).toBe('straight');
    });
});

describe('ordinal', () => {
    test('basic ordinals', () => {
        expect(LG.ordinal(1)).toBe('1st');
        expect(LG.ordinal(2)).toBe('2nd');
        expect(LG.ordinal(3)).toBe('3rd');
        expect(LG.ordinal(4)).toBe('4th');
    });

    test('the 11/12/13 exception', () => {
        expect(LG.ordinal(11)).toBe('11th');
        expect(LG.ordinal(12)).toBe('12th');
        expect(LG.ordinal(13)).toBe('13th');
        expect(LG.ordinal(21)).toBe('21st');
    });
});

describe('laneNameFor', () => {
    test('single-lane road is just "lane"', () => {
        expect(LG.laneNameFor(1, 1)).toBe('lane');
    });
    test('first/last lanes are left/right', () => {
        expect(LG.laneNameFor(1, 3)).toBe('left lane');
        expect(LG.laneNameFor(3, 3)).toBe('right lane');
    });
    test('the middle lane of three is "middle lane"', () => {
        expect(LG.laneNameFor(2, 3)).toBe('middle lane');
    });
    test('otherwise numbered by index', () => {
        expect(LG.laneNameFor(2, 4)).toBe('lane 2');
    });
});

describe('laneUrgencyFields', () => {
    test('distance thresholds map to urgency levels', () => {
        expect(LG.laneUrgencyFields(80, 'left lane', 'left', 0).urgency).toBe('now');
        expect(LG.laneUrgencyFields(250, 'left lane', 'left', 0).urgency).toBe('soon');
        expect(LG.laneUrgencyFields(600, 'left lane', 'left', 0).urgency).toBe('ahead');
        expect(LG.laneUrgencyFields(1200, 'left lane', 'left', 0).urgency).toBe('info');
        expect(LG.laneUrgencyFields(3000, 'left lane', 'left', 0).urgency).toBe('none');
    });

    test('lane_change_needed is only set for now/soon/ahead', () => {
        expect(LG.laneUrgencyFields(80, 'left lane', 'left', 0).lane_change_needed).toBe(true);
        expect(LG.laneUrgencyFields(1200, 'left lane', 'left', 0).lane_change_needed).toBe(false);
        expect(LG.laneUrgencyFields(3000, 'left lane', 'left', 0).lane_change_needed).toBe(false);
    });

    test('urgency text references the lane position', () => {
        expect(LG.laneUrgencyFields(80, 'right lane', 'right', 0).urgency_text)
            .toBe('Get in the right lane now!');
        expect(LG.laneUrgencyFields(250, 'middle lane', 'through', 0).urgency_text)
            .toBe('Move to the middle lane');
    });

    test('roundabout guidance text includes the ordinal exit', () => {
        const f = LG.laneUrgencyFields(600, 'right lane', 'roundabout', 3);
        expect(f.guidance_text).toBe('Use the right lane and take the 3rd exit');
    });
});

describe('buildDeterministicLaneGuidance', () => {
    test('lane count comes from road class', () => {
        expect(LG.buildDeterministicLaneGuidance('through', 500, 0, 'motorway').total_lanes).toBe(3);
        expect(LG.buildDeterministicLaneGuidance('through', 500, 0, 'primary').total_lanes).toBe(2);
        expect(LG.buildDeterministicLaneGuidance('through', 500, 0, 'residential').total_lanes).toBe(1);
        // Unknown road class defaults to 2 lanes.
        expect(LG.buildDeterministicLaneGuidance('through', 500, 0, 'mystery').total_lanes).toBe(2);
    });

    test('left maneuvers recommend the leftmost lane', () => {
        const g = LG.buildDeterministicLaneGuidance('left', 200, 0, 'primary');
        expect(g.recommended_lane).toBe(1);
        expect(g.lane_arrows[0].primary).toBe('left');
        expect(g.lane_arrows[0].arrow).toBe('←');
    });

    test('right maneuvers recommend the rightmost lane', () => {
        const g = LG.buildDeterministicLaneGuidance('right', 200, 0, 'motorway');
        expect(g.recommended_lane).toBe(3);
        expect(g.lane_arrows[2].primary).toBe('right');
        expect(g.lane_arrows[2].arrow).toBe('→');
    });

    test('slight turns keep the slight direction/arrow on motorways', () => {
        const g = LG.buildDeterministicLaneGuidance('slight_right', 200, 0, 'motorway');
        expect(g.lane_arrows[2].primary).toBe('slight_right');
        expect(g.lane_arrows[2].arrow).toBe('↗');
    });

    test('slight_right on 2-lane primary defaults to left lane (UK)', () => {
        const g = LG.buildDeterministicLaneGuidance('slight_right', 200, 0, 'primary');
        expect(g.recommended_lane).toBe(1);
        expect(g.lane_arrows[0].primary).toBe('through');
    });

    test('through maneuvers recommend the central-ish lane', () => {
        const g = LG.buildDeterministicLaneGuidance('through', 200, 0, 'motorway');
        expect(g.recommended_lane).toBe(2);
    });

    test('roundabout with 3+ exits goes right, 1 exit goes left, 2 stays through', () => {
        expect(LG.buildDeterministicLaneGuidance('roundabout', 200, 3, 'primary').lane_arrows
            .find((a) => a.primary !== 'through').primary).toBe('right');
        expect(LG.buildDeterministicLaneGuidance('roundabout', 200, 1, 'primary').lane_arrows
            .find((a) => a.primary !== 'through').primary).toBe('left');
        // A 2-exit roundabout keeps the recommended lane "through" (no found non-through arrow).
        const two = LG.buildDeterministicLaneGuidance('roundabout', 200, 2, 'primary');
        expect(two.lane_arrows.every((a) => a.primary === 'through')).toBe(true);
        expect(two.recommended_lane).toBe(1); // exitCount < 3 => leftmost
    });

    test('uturn recommends the rightmost lane (UK)', () => {
        const g = LG.buildDeterministicLaneGuidance('uturn', 200, 0, 'primary');
        expect(g.recommended_lane).toBe(2);
    });

    test('fallback metadata flags it as estimated, non-OSM', () => {
        const g = LG.buildDeterministicLaneGuidance('left', 200, 0, 'primary');
        expect(g.estimated).toBe(true);
        expect(g.has_osm_data).toBe(false);
        expect(g.has_turn_lanes).toBe(false);
        expect(g.success).toBe(true);
    });

    test('embeds the recomputed urgency fields', () => {
        const g = LG.buildDeterministicLaneGuidance('left', 80, 0, 'primary');
        expect(g.urgency).toBe('now');
        expect(g.distance_to_maneuver).toBe(80);
    });
});

describe('view-model: shouldShow', () => {
    test('hidden for single-lane roads', () => {
        expect(LG.shouldShow({ total_lanes: 1, urgency: 'now' })).toBe(false);
    });
    test('hidden when no maneuver is approaching (urgency none)', () => {
        expect(LG.shouldShow({ total_lanes: 3, urgency: 'none' })).toBe(false);
    });
    test('shown for a multi-lane road with an approaching maneuver', () => {
        expect(LG.shouldShow({
            total_lanes: 3,
            urgency: 'soon',
            confidence: 92,
            recommended_lanes: [2],
            show_lane_guidance: true,
        })).toBe(true);
    });
    test('hidden when confidence is below display threshold', () => {
        expect(LG.shouldShow({
            total_lanes: 3,
            urgency: 'soon',
            confidence: 65,
            recommended_lanes: [1],
        })).toBe(false);
    });
    test('null data is hidden', () => {
        expect(LG.shouldShow(null)).toBe(false);
    });
});

describe('view-model: badge', () => {
    test('OSM data shows no badge', () => {
        expect(LG.badge({ has_osm_data: true })).toEqual({ text: '', visible: false });
    });
    test('estimated/fallback data shows the Estimated badge', () => {
        expect(LG.badge({ has_osm_data: false })).toEqual({ text: 'Estimated', visible: true });
        expect(LG.badge(null)).toEqual({ text: 'Estimated', visible: true });
    });
});

describe('view-model: urgencyClass', () => {
    test('maps urgency to a CSS class', () => {
        expect(LG.urgencyClass('now')).toBe('urgency-now');
        expect(LG.urgencyClass('soon')).toBe('urgency-soon');
        expect(LG.urgencyClass('ahead')).toBe('urgency-ahead');
    });
    test('info and none have no class', () => {
        expect(LG.urgencyClass('info')).toBe('');
        expect(LG.urgencyClass('none')).toBe('');
    });
});

describe('view-model: displayText', () => {
    test('uses urgency text once the maneuver is imminent', () => {
        expect(LG.displayText({ urgency: 'now', urgency_text: 'Get in the left lane now!', guidance_text: 'Use the left lane' }))
            .toBe('Get in the left lane now!');
    });
    test('uses steady guidance text at info/none urgency', () => {
        expect(LG.displayText({ urgency: 'info', urgency_text: 'Stay in the left lane', guidance_text: 'Use the left lane' }))
            .toBe('Use the left lane');
    });
    test('null data is empty', () => {
        expect(LG.displayText(null)).toBe('');
    });
});

describe('view-model: laneIndicators', () => {
    test('marks the recommended lane and carries the arrow glyph', () => {
        const data = {
            total_lanes: 3, recommended_lane: 3, recommended_lanes: [3],
            confidence: 95, show_lane_guidance: true,
            has_turn_lanes: true,
            lane_arrows: [
                { arrow: '↑', directions: ['through'] },
                { arrow: '↑', directions: ['through'] },
                { arrow: '→', directions: ['right'] }
            ]
        };
        const inds = LG.laneIndicators(data);
        expect(inds).toHaveLength(3);
        expect(inds[2]).toEqual({ arrow: '→', recommended: true, hasDirection: true });
        expect(inds[0].recommended).toBe(false);
    });

    test('hasDirection is false when has_turn_lanes is off', () => {
        const data = {
            total_lanes: 1, recommended_lane: 1, has_turn_lanes: false,
            lane_arrows: [{ arrow: '→', directions: ['right'] }]
        };
        expect(LG.laneIndicators(data)[0].hasDirection).toBe(false);
    });

    test('missing arrow info falls back to a straight arrow', () => {
        const data = { total_lanes: 2, recommended_lane: 1, lane_arrows: [] };
        const inds = LG.laneIndicators(data);
        expect(inds[0]).toEqual({ arrow: '↑', recommended: true, hasDirection: false });
        expect(inds[1].arrow).toBe('↑');
    });

    test('null data yields no indicators', () => {
        expect(LG.laneIndicators(null)).toEqual([]);
    });
});

describe('buildLaneIndicatorHtml', () => {
    test('wraps arrow in lane-arrow span', () => {
        expect(LG.buildLaneIndicatorHtml('→')).toBe('<span class="lane-arrow">→</span>');
    });

    test('defaults to straight arrow when missing', () => {
        expect(LG.buildLaneIndicatorHtml()).toContain('↑');
    });
});

describe('lane guidance fetch throttle helpers', () => {
    test('shouldSkipLaneGuidanceFetch respects interval and position', () => {
        expect(LG.shouldSkipLaneGuidanceFetch({
            now: 2000,
            lastFetch: 0,
            lastPosition: { lat: 1, lon: 1 },
            distanceMovedMeters: 10,
            maneuver: 'left',
            lastManeuver: 'left',
        })).toBe(true);
        expect(LG.shouldSkipLaneGuidanceFetch({
            now: 5000,
            lastFetch: 0,
            lastPosition: null,
            distanceMovedMeters: 0,
            maneuver: 'left',
            lastManeuver: 'left',
        })).toBe(false);
    });

    test('buildLaneGuidanceCacheKey and API URL', () => {
        const key = LG.buildLaneGuidanceCacheKey('left', 2, 'primary', 51.501, -0.1);
        expect(key).toContain('left');
        expect(key).toContain('primary');
        const url = LG.buildLaneGuidanceApiUrl({
            lat: 51.5,
            lon: -0.1,
            heading: 90,
            maneuver: 'left',
            distance: 120,
            roadType: 'primary',
            roundaboutExitCount: 0,
        });
        expect(url).toContain('/api/lane-guidance');
        expect(url).toContain('maneuver=left');
    });

    test('isLaneGuidanceCacheEntryFresh uses fallback TTL', () => {
        const now = 10000;
        expect(LG.isLaneGuidanceCacheEntryFresh({ ts: 9000, fallback: false }, now)).toBe(true);
        expect(LG.isLaneGuidanceCacheEntryFresh({ ts: 1000, fallback: true }, now)).toBe(false);
        expect(LG.isLaneGuidanceCacheEntryFresh({ ts: 5000, fallback: true }, now)).toBe(true);
    });
});

describe('lane guidance fetch tick plan', () => {
    const steps = [{ begin_shape_index: 2, type: 10 }];
    const polyline = [[51.5, -0.1], [51.51, -0.09], [51.52, -0.08]];

    test('computeDistanceToManeuverMeters measures to next step shape index', () => {
        const d = LG.computeDistanceToManeuverMeters(
            51.5,
            -0.1,
            steps,
            0,
            polyline,
            (a, b, c, d2) => Math.abs(a - c) * 100000 + Math.abs(b - d2) * 100000
        );
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(9999);
    });

    test('computeDistanceToManeuverMeters prefers along-route distance when snap helpers exist', () => {
        const d = LG.computeDistanceToManeuverMeters(
            51.5,
            -0.1,
            steps,
            0,
            polyline,
            () => 999,
            {
                searchStartIndex: 0,
                snapToRoutePolyline: () => ({ index: 0, t: 0.2 }),
                distanceAlongRouteToVertexMeters: () => 180,
            }
        );
        expect(d).toBe(180);
    });

    test('buildLaneGuidanceFetchTickPlan uses along-route distance in fetch payload', () => {
        const tick = LG.buildLaneGuidanceFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            heading: 90,
            maneuver: 'left',
            now: 10_000,
            lastFetch: 0,
            lastPosition: null,
            lastManeuver: '',
            routeSteps: steps,
            currentStepIndex: 0,
            routePolyline: polyline,
            lastSnappedRouteIndex: 0,
            calculateDistance: () => 999,
            snapToRoutePolyline: () => ({ index: 0, t: 0 }),
            distanceAlongRouteToVertexMeters: () => 220,
        });
        expect(tick.action).toBe('fetch');
        expect(tick.distToManeuver).toBe(220);
        expect(tick.url).toContain('distance=220');
    });

    test('buildLaneGuidanceFetchTickPlan skips throttled fetches', () => {
        const tick = LG.buildLaneGuidanceFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            heading: 90,
            maneuver: 'left',
            now: 5000,
            lastFetch: 4900,
            lastPosition: { lat: 51.5, lon: -0.1 },
            lastManeuver: 'left',
            calculateDistance: () => 10,
        });
        expect(tick.action).toBe('skip');
    });

    test('buildLaneGuidanceFetchTickPlan returns fetch plan when cache is stale', () => {
        const tick = LG.buildLaneGuidanceFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            heading: 90,
            maneuver: 'left',
            now: 10_000,
            lastFetch: 0,
            lastPosition: null,
            lastManeuver: '',
            routeSteps: steps,
            currentStepIndex: 0,
            routePolyline: polyline,
            roadType: 'primary',
            calculateDistance: () => 120,
            cacheLookup: () => null,
        });
        expect(tick.action).toBe('fetch');
        expect(tick.url).toContain('/api/lane-guidance');
        expect(tick.statePatch.lastManeuver).toBe('left');
    });

    test('buildLaneGuidanceFetchTickPlan renders fresh cache without fetch', () => {
        const data = LG.buildDeterministicLaneGuidance('left', 80, 0, 'primary');
        const tick = LG.buildLaneGuidanceFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            heading: 90,
            maneuver: 'left',
            now: 10_000,
            lastFetch: 0,
            lastPosition: null,
            lastManeuver: '',
            routeSteps: steps,
            currentStepIndex: 0,
            routePolyline: polyline,
            roadType: 'primary',
            calculateDistance: () => 80,
            cacheLookup: () => ({ data, ts: 9900, fallback: false }),
        });
        expect(tick.action).toBe('render-cached');
        expect(tick.renderPayload.total_lanes).toBe(data.total_lanes);
    });

    test('buildLaneGuidanceFetchTickPlan normalizes slight_right on primary to straight in API URL', () => {
        const tick = LG.buildLaneGuidanceFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            heading: 90,
            maneuver: 'slight_right',
            now: 10_000,
            lastFetch: 0,
            lastPosition: null,
            lastManeuver: '',
            routeSteps: steps,
            currentStepIndex: 0,
            routePolyline: polyline,
            roadType: 'primary',
            calculateDistance: () => 120,
            cacheLookup: () => null,
        });
        expect(tick.action).toBe('fetch');
        expect(tick.url).toContain('maneuver=straight');
        expect(tick.statePatch.lastManeuver).toBe('straight');
    });
});

describe('buildLaneGuidanceFetchStateApplyPlan', () => {
    test('skips throttled fetch ticks', () => {
        expect(LG.buildLaneGuidanceFetchStateApplyPlan({ action: 'skip', reason: 'throttle' }).action)
            .toBe('skip');
    });

    test('maps render-cached tick to apply plan', () => {
        const apply = LG.buildLaneGuidanceFetchStateApplyPlan({
            action: 'render-cached',
            statePatch: { lastFetch: 1000, lastManeuver: 'left', lastPosition: { lat: 51, lon: 0 } },
            renderPayload: { total_lanes: 3, recommended_lane: 2 },
        });
        expect(apply.kind).toBe('render-cached');
        expect(apply.renderPayload.total_lanes).toBe(3);
    });

    test('maps fetch tick to network apply plan', () => {
        const apply = LG.buildLaneGuidanceFetchStateApplyPlan({
            action: 'fetch',
            statePatch: { lastFetch: 1000, lastManeuver: 'right', lastPosition: { lat: 51, lon: 0 } },
            url: '/api/lane-guidance?lat=51',
            timeoutMs: 5000,
            cacheKey: 'right|0|primary|51.000,0.000',
            maneuver: 'right',
            distToManeuver: 80,
            roundaboutExitCount: 0,
            roadType: 'primary',
        });
        expect(apply.kind).toBe('fetch');
        expect(apply.fetch.url).toContain('/api/lane-guidance');
        expect(apply.fetch.maneuver).toBe('right');
    });
});

describe('buildLaneGuidanceFetchOutcomePlan', () => {
    test('caches successful API data for render', () => {
        const data = {
            success: true,
            total_lanes: 3,
            recommended_lane: 2,
            recommended_lanes: [2],
            urgency: 'soon',
            has_turn_lanes: true,
            has_osm_data: true,
        };
        const outcome = LG.buildLaneGuidanceFetchOutcomePlan({
            apiSuccess: true,
            apiData: data,
            maneuver: 'right',
            distToManeuver: 120,
            roadType: 'motorway',
            now: 10_000,
        });
        expect(outcome.action).toBe('cache-and-render');
        expect(outcome.renderData.confidence).toBeGreaterThanOrEqual(70);
        expect(outcome.cacheEntry.fallback).toBe(false);
    });

    test('falls back to deterministic guidance on failure', () => {
        const outcome = LG.buildLaneGuidanceFetchOutcomePlan({
            apiSuccess: false,
            errorReason: 'timeout',
            maneuver: 'left',
            distToManeuver: 80,
            roadType: 'primary',
        });
        expect(outcome.action).toBe('fallback');
        expect(outcome.warnLine).toContain('timeout');
        expect(outcome.renderData.total_lanes).toBeGreaterThan(0);
        expect(outcome.cacheEntry.fallback).toBe(true);
    });
});

describe('lane guidance UI and voice apply plans', () => {
    function hybridLeftPrimary(dist) {
        return LG.buildHybridLaneGuidance({
            maneuver: 'left',
            distanceToManeuver: dist,
            roundaboutExitCount: 0,
            roadType: 'primary',
            routingManeuverLanes: [{ active: true }, { active: false }],
        });
    }

    test('buildLaneGuidanceUiApplyPlan hides single-lane guidance', () => {
        expect(LG.buildLaneGuidanceUiApplyPlan({ total_lanes: 1, urgency: 'none' }).visible).toBe(false);
    });

    test('buildLaneGuidanceUiApplyPlan includes indicators for multi-lane roads', () => {
        const data = hybridLeftPrimary(120);
        const plan = LG.buildLaneGuidanceUiApplyPlan(data);
        expect(plan.visible).toBe(true);
        expect(plan.indicators.length).toBeGreaterThan(1);
        expect(plan.guidanceText).toBeTruthy();
    });

    test('buildLaneGuidanceDomApplyPlan hides single-lane guidance', () => {
        expect(LG.buildLaneGuidanceDomApplyPlan({ total_lanes: 1, urgency: 'none' }).action)
            .toBe('hide');
    });

    test('buildLaneGuidanceDomApplyPlan includes indicator nodes and voice plan', () => {
        const data = hybridLeftPrimary(120);
        const domPlan = LG.buildLaneGuidanceDomApplyPlan(data, '');
        expect(domPlan.action).toBe('show');
        expect(domPlan.indicators.length).toBeGreaterThan(1);
        expect(domPlan.indicators[0].innerHtml).toBeTruthy();
        expect(domPlan.guidanceText).toBeTruthy();
    });

    test('buildLaneGuidanceDomStateApplyPlan hides when dom plan hides', () => {
        expect(LG.buildLaneGuidanceDomStateApplyPlan({ action: 'hide' }).action).toBe('hide');
    });

    test('buildLaneGuidanceDomStateApplyPlan maps show plan with optional voice', () => {
        const data = hybridLeftPrimary(80);
        const domPlan = LG.buildLaneGuidanceDomApplyPlan(data, '');
        const apply = LG.buildLaneGuidanceDomStateApplyPlan(domPlan, { voiceEnabled: true });
        expect(apply.action).toBe('show');
        expect(apply.indicators.length).toBeGreaterThan(0);
        expect(apply.voice).not.toBeNull();
        expect(apply.voice.message).toContain('lane');
    });

    test('buildLaneGuidanceDomStateApplyPlan omits voice when disabled', () => {
        const data = hybridLeftPrimary(80);
        const domPlan = LG.buildLaneGuidanceDomApplyPlan(data, '');
        const apply = LG.buildLaneGuidanceDomStateApplyPlan(domPlan, { voiceEnabled: false });
        expect(apply.voice).toBeNull();
    });

    test('buildLaneVoiceAnnouncementPlan returns message for urgent lane change', () => {
        const data = hybridLeftPrimary(80);
        const plan = LG.buildLaneVoiceAnnouncementPlan(data, '');
        expect(plan).not.toBeNull();
        expect(plan.message).toContain('lane');
        expect(plan.priority).toBe('high');
        expect(LG.buildLaneVoiceAnnouncementPlan(data, plan.announceKey)).toBeNull();
    });

    test('resolveLanePositionLabel', () => {
        expect(LG.resolveLanePositionLabel(1, 3)).toBe('left');
        expect(LG.resolveLanePositionLabel(2, 3)).toBe('middle');
        expect(LG.resolveLanePositionLabel(3, 3)).toBe('right');
    });
});

describe('confidence-based hybrid lane guidance', () => {
    test('routing lanes take priority over API and estimation', () => {
        const hybrid = LG.buildHybridLaneGuidance({
            routingManeuverLanes: [{ active: false }, { active: true }],
            apiData: {
                success: true,
                total_lanes: 3,
                recommended_lane: 1,
                has_turn_lanes: true,
                has_osm_data: true,
            },
            maneuver: 'right',
            distanceToManeuver: 200,
            roadType: 'motorway',
        });
        expect(hybrid.source).toBe('routing');
        expect(hybrid.recommended_lanes).toEqual([2]);
        expect(hybrid.confidence).toBeGreaterThanOrEqual(90);
    });

    test('estimated 2-lane primary left turn stays hidden (low confidence)', () => {
        const hybrid = LG.buildHybridLaneGuidance({
            maneuver: 'left',
            distanceToManeuver: 200,
            roadType: 'primary',
        });
        expect(hybrid.confidence).toBeLessThan(LG.LANE_CONFIDENCE_DISPLAY_MIN);
        expect(LG.shouldShow(hybrid)).toBe(false);
    });

    test('motorway exit estimation can show with multiple lanes at medium confidence', () => {
        const hybrid = LG.buildHybridLaneGuidance({
            maneuver: 'exit_right',
            distanceToManeuver: 250,
            roadType: 'motorway',
        });
        expect(hybrid.confidence).toBeGreaterThanOrEqual(LG.LANE_CONFIDENCE_DISPLAY_MIN);
        expect(hybrid.recommended_lanes.length).toBeGreaterThanOrEqual(1);
        expect(LG.shouldShow(hybrid)).toBe(true);
    });

    test('high confidence highlights a single lane', () => {
        const out = LG.applyConfidenceLaneSelection({
            confidence: 95,
            recommended_lanes: [1, 2],
            recommended_lane: 1,
            total_lanes: 3,
        });
        expect(out.recommended_lanes).toEqual([1]);
    });

    test('medium confidence keeps multiple acceptable lanes', () => {
        const out = LG.applyConfidenceLaneSelection({
            confidence: 82,
            recommended_lanes: [2, 3],
            recommended_lane: 2,
            total_lanes: 3,
        });
        expect(out.recommended_lanes).toEqual([2, 3]);
    });

    test('stability plan locks guidance within lock distance', () => {
        const guidance = {
            total_lanes: 3,
            recommended_lanes: [3],
            recommended_lane: 3,
            confidence: 95,
            urgency: 'soon',
            show_lane_guidance: true,
        };
        const plan = LG.buildLaneGuidanceStabilityPlan({
            newGuidance: guidance,
            lockedGuidance: null,
            distanceToManeuver: 350,
            maneuverStepIndex: 2,
        });
        expect(plan.action).toBe('lock');
        expect(plan.guidance.recommended_lanes).toEqual([3]);
    });

    test('stability plan keeps locked lanes when GPS updates arrive nearby', () => {
        const locked = {
            data: {
                total_lanes: 3,
                recommended_lanes: [1],
                recommended_lane: 1,
                confidence: 95,
                urgency: 'soon',
                show_lane_guidance: true,
            },
            lockedStepIndex: 2,
        };
        const plan = LG.buildLaneGuidanceStabilityPlan({
            newGuidance: {
                total_lanes: 3,
                recommended_lanes: [2],
                recommended_lane: 2,
                confidence: 76,
                show_lane_guidance: true,
            },
            lockedGuidance: locked,
            distanceToManeuver: 200,
            maneuverStepIndex: 2,
            maneuver: 'left',
            roundaboutExitCount: 0,
        });
        expect(plan.action).toBe('use-locked');
        expect(plan.guidance.recommended_lanes).toEqual([1]);
    });

    test('laneIndicators highlights all recommended lanes', () => {
        const inds = LG.laneIndicators({
            total_lanes: 3,
            recommended_lanes: [1, 2],
            recommended_lane: 1,
            has_turn_lanes: true,
            lane_arrows: [
                { arrow: '←', directions: ['left'] },
                { arrow: '↑', directions: ['through'] },
                { arrow: '→', directions: ['right'] },
            ],
        });
        expect(inds[0].recommended).toBe(true);
        expect(inds[1].recommended).toBe(true);
        expect(inds[2].recommended).toBe(false);
    });
});

describe('lane-guidance hybrid helpers (coverage)', () => {
    test('extractRoutingLaneGuidance handles all routing lane shapes', () => {
        expect(LG.extractRoutingLaneGuidance(null)).toBeNull();
        expect(LG.extractRoutingLaneGuidance([{ active: true }])).toBeNull();

        const multiActive = LG.extractRoutingLaneGuidance([
            { active: true }, { active: true }, { active: false },
        ]);
        expect(multiActive.confidence).toBe(88);
        expect(multiActive.recommended_lanes).toEqual([1, 2]);

        const validSingle = LG.extractRoutingLaneGuidance([
            { valid_indications: [] }, { valid_indications: ['right'] },
        ]);
        expect(validSingle.confidence).toBe(92);
        expect(validSingle.recommended_lanes).toEqual([2]);

        const validMulti = LG.extractRoutingLaneGuidance([
            { valid_indications: ['left'] }, { valid_indications: ['right'] },
        ]);
        expect(validMulti.confidence).toBe(82);

        const noSignal = LG.extractRoutingLaneGuidance([
            null, { valid_indications: [] },
        ]);
        expect(noSignal).toBeNull();
    });

    test('scoreApiLaneGuidanceConfidence and scoreEstimatedLaneConfidence branches', () => {
        expect(LG.scoreApiLaneGuidanceConfidence(null)).toBe(0);
        expect(LG.scoreApiLaneGuidanceConfidence({ has_turn_lanes: true })).toBe(95);
        expect(LG.scoreApiLaneGuidanceConfidence({ has_osm_data: true })).toBe(78);

        const threeLane = { total_lanes: 3 };
        expect(LG.scoreEstimatedLaneConfidence(null, 'left', 'primary')).toBe(0);
        expect(LG.scoreEstimatedLaneConfidence({ total_lanes: 1 }, 'left', 'primary')).toBe(0);
        expect(LG.scoreEstimatedLaneConfidence(threeLane, 'exit_right', 'motorway')).toBe(76);
        expect(LG.scoreEstimatedLaneConfidence(threeLane, 'slight_right', 'motorway')).toBe(74);
        expect(LG.scoreEstimatedLaneConfidence(threeLane, 'through', 'motorway')).toBe(72);
        expect(LG.scoreEstimatedLaneConfidence({ total_lanes: 2 }, 'through', 'motorway')).toBe(68);
        expect(LG.scoreEstimatedLaneConfidence(threeLane, 'roundabout', 'primary')).toBe(80);
        expect(LG.scoreEstimatedLaneConfidence(threeLane, 'left', 'primary')).toBe(72);
        expect(LG.scoreEstimatedLaneConfidence(threeLane, 'exit', 'secondary')).toBe(71);
        expect(LG.scoreEstimatedLaneConfidence(threeLane, 'through', 'primary')).toBe(65);
    });

    test('isLaneGuidanceValuableManeuver and estimateCandidateLanesUK branches', () => {
        expect(LG.isLaneGuidanceValuableManeuver({ totalLanes: 1 })).toBe(false);
        expect(LG.isLaneGuidanceValuableManeuver({ totalLanes: 3, hasRoutingLanes: true })).toBe(true);
        expect(LG.isLaneGuidanceValuableManeuver({
            totalLanes: 3, maneuver: 'slight_right', roadType: 'motorway',
        })).toBe(true);
        expect(LG.isLaneGuidanceValuableManeuver({
            totalLanes: 3, maneuver: 'through', roadType: 'motorway',
        })).toBe(true);
        expect(LG.isLaneGuidanceValuableManeuver({
            totalLanes: 2, maneuver: 'left', roadType: 'primary',
        })).toBe(false);
        expect(LG.isLaneGuidanceValuableManeuver({
            totalLanes: 3, maneuver: 'left', roadType: 'primary',
        })).toBe(true);
        expect(LG.isLaneGuidanceValuableManeuver({
            totalLanes: 2, maneuver: 'exit', roadType: 'primary',
        })).toBe(true);

        expect(LG.estimateCandidateLanesUK('roundabout', 3, 1)).toEqual([1]);
        expect(LG.estimateCandidateLanesUK('roundabout', 3, 3)).toEqual([3]);
        expect(LG.estimateCandidateLanesUK('left', 3, 0)).toEqual([1, 2]);
        expect(LG.estimateCandidateLanesUK('right', 2, 0)).toEqual([2]);
        expect(LG.estimateCandidateLanesUK('merge', 3, 0)).toEqual([1, 3]);
        expect(LG.estimateCandidateLanesUK('through', 4, 0)).toEqual([2]);
    });

    test('getRecommendedLaneNumbers and enrichGuidanceWithRecommendedLanes', () => {
        expect(LG.getRecommendedLaneNumbers(null)).toEqual([]);
        expect(LG.getRecommendedLaneNumbers({ recommended_lane: 2 })).toEqual([2]);
        expect(LG.getRecommendedLaneNumbers({ recommended_lanes: [1, 3] })).toEqual([1, 3]);

        const enriched = LG.enrichGuidanceWithRecommendedLanes(
            { total_lanes: 3 },
            'right',
            0
        );
        expect(enriched.recommended_lanes).toEqual([2, 3]);
        expect(LG.enrichGuidanceWithRecommendedLanes(
            { total_lanes: 3, recommended_lanes: [2] },
            'right',
            0
        ).recommended_lanes).toEqual([2]);
    });

    test('applyConfidenceLaneSelection hides below threshold', () => {
        const out = LG.applyConfidenceLaneSelection({
            confidence: 60,
            recommended_lanes: [1],
            recommended_lane: 1,
            total_lanes: 3,
        });
        expect(out.recommended_lanes).toEqual([]);
        expect(out.recommended_lane).toBeNull();
    });

    test('buildHybridLaneGuidance uses API OSM lanes and enriches missing recommended_lanes', () => {
        const hybrid = LG.buildHybridLaneGuidance({
            apiData: {
                success: true,
                total_lanes: 3,
                has_osm_data: true,
                has_turn_lanes: false,
                recommended_lane: 2,
            },
            maneuver: 'straight',
            distanceToManeuver: 400,
            roadType: 'motorway',
        });
        expect(hybrid.source).toBe('osm_lanes');
        expect(hybrid.confidence).toBe(78);
    });

    test('buildLaneGuidanceStabilityPlan route recalc, clear, upgrade, and update paths', () => {
        const guidance = {
            total_lanes: 3,
            recommended_lanes: [2],
            recommended_lane: 2,
            confidence: 95,
            urgency: 'soon',
            show_lane_guidance: true,
        };
        const recalcPlan = LG.buildLaneGuidanceStabilityPlan({
            routeRecalculated: true,
            newGuidance: guidance,
            maneuverStepIndex: 1,
            distanceToManeuver: 300,
        });
        expect(recalcPlan.action).toBe('lock');
        expect(recalcPlan.lockedGuidance).toEqual({
            data: guidance,
            lockedStepIndex: 1,
        });

        const afterRecalc = LG.buildLaneGuidanceStabilityPlan({
            newGuidance: {
                total_lanes: 3,
                recommended_lanes: [3],
                recommended_lane: 3,
                confidence: 70,
                show_lane_guidance: true,
            },
            lockedGuidance: recalcPlan.lockedGuidance,
            distanceToManeuver: 250,
            maneuverStepIndex: 1,
            maneuver: 'right',
            roundaboutExitCount: 0,
        });
        expect(afterRecalc.action).toBe('use-locked');
        expect(afterRecalc.guidance.recommended_lanes).toEqual([2]);

        expect(LG.buildLaneGuidanceStabilityPlan({
            maneuverCompleted: true,
            newGuidance: guidance,
        }).action).toBe('clear');

        const upgraded = LG.buildLaneGuidanceStabilityPlan({
            newGuidance: { ...guidance, confidence: 95, recommended_lanes: [3], recommended_lane: 3 },
            lockedGuidance: { data: { ...guidance, confidence: 75 }, lockedStepIndex: 2 },
            distanceToManeuver: 250,
            maneuverStepIndex: 2,
        });
        expect(upgraded.action).toBe('lock');
        expect(upgraded.guidance.recommended_lanes).toEqual([3]);

        const updated = LG.buildLaneGuidanceStabilityPlan({
            newGuidance: guidance,
            lockedGuidance: null,
            distanceToManeuver: 900,
            maneuverStepIndex: 2,
        });
        expect(updated.action).toBe('update');
    });

    test('refreshLockedGuidanceUrgency returns null for missing lock', () => {
        expect(LG.refreshLockedGuidanceUrgency(null, 100, 'left', 0)).toBeNull();
    });

    test('badge hides for routing and OSM sources', () => {
        expect(LG.badge({ source: 'routing' }).visible).toBe(false);
        expect(LG.badge({ source: 'osm_turn_lanes' }).visible).toBe(false);
    });

    test('resolveLanePositionLabel numbered lane on 4-lane road', () => {
        expect(LG.resolveLanePositionLabel(2, 4)).toBe('lane 2');
    });

    test('buildLaneVoiceAnnouncementPlan multi-lane roundabout and ahead paths', () => {
        const multi = Object.assign(
            {},
            LG.buildHybridLaneGuidance({
                routingManeuverLanes: [
                    { active: true }, { active: true }, { active: false },
                ],
                maneuver: 'roundabout',
                roundaboutExitCount: 2,
                distanceToManeuver: 80,
                roadType: 'primary',
            }),
            { next_maneuver: 'roundabout' }
        );
        const plan = LG.buildLaneVoiceAnnouncementPlan(multi, '');
        expect(plan.message).toContain('roundabout');

        const ahead = LG.buildDeterministicLaneGuidance('exit_right', 600, 0, 'motorway');
        const aheadHybrid = LG.buildHybridLaneGuidance({
            maneuver: 'exit_right',
            distanceToManeuver: 600,
            roadType: 'motorway',
        });
        const aheadPlan = LG.buildLaneVoiceAnnouncementPlan(aheadHybrid, '');
        expect(aheadPlan).not.toBeNull();
        expect(aheadPlan.message).toContain('lane');

        expect(LG.buildLaneVoiceAnnouncementPlan({ total_lanes: 3, confidence: 50 }, '')).toBeNull();
    });
});

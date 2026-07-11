/**
 * Behaviour-first tests for the REAL camera-pitch decision module
 * (static/js/modules/navigation/camera-pitch.js).
 *
 * Unlike the older driver-perspective tests (which re-implement logic inline),
 * this imports the actual function the app delegates to and asserts the full
 * truth table — in particular the new behaviour: 2D navigation stays heading-up
 * but flat.
 */

const { decideDrivingCamera } = require('../modules/navigation/camera-pitch.js');

const decide = (overrides) => decideDrivingCamera({
    activeNavFollow: false,
    driverPerspectiveEnabled: false,
    prefersFlat2D: false,
    ...overrides,
});

describe('decideDrivingCamera', () => {
    describe('browsing (no active navigation)', () => {
        test('default: static north-up, flat', () => {
            expect(decide({})).toEqual({ followHeading: false, tilt: false });
        });

        test('driver view ON: follow heading and tilt', () => {
            expect(decide({ driverPerspectiveEnabled: true }))
                .toEqual({ followHeading: true, tilt: true });
        });

        test('driver view ON but 2D chosen: follow heading, flat', () => {
            expect(decide({ driverPerspectiveEnabled: true, prefersFlat2D: true }))
                .toEqual({ followHeading: true, tilt: false });
        });
    });

    describe('active navigation', () => {
        test('default 3D: follow heading and tilt to 60°', () => {
            expect(decide({ activeNavFollow: true }))
                .toEqual({ followHeading: true, tilt: true });
        });

        test('THE FIX — 2D chosen: still follows heading-up, but stays flat', () => {
            expect(decide({ activeNavFollow: true, prefersFlat2D: true }))
                .toEqual({ followHeading: true, tilt: false });
        });

        test('2D choice overrides driver-view tilt during navigation', () => {
            expect(decide({
                activeNavFollow: true,
                driverPerspectiveEnabled: true,
                prefersFlat2D: true,
            })).toEqual({ followHeading: true, tilt: false });
        });
    });

    describe('robustness', () => {
        test('missing state is treated as all-false (flat overview)', () => {
            expect(decideDrivingCamera()).toEqual({ followHeading: false, tilt: false });
        });

        test('truthy/falsy coercion', () => {
            const r = decideDrivingCamera({ activeNavFollow: 1, prefersFlat2D: 0 });
            expect(r).toEqual({ followHeading: true, tilt: true });
        });

        test('tilt never true without followHeading', () => {
            // Exhaustive: tilt implies followHeading for every input combination.
            for (const a of [false, true]) {
                for (const d of [false, true]) {
                    for (const f of [false, true]) {
                        const r = decideDrivingCamera({
                            activeNavFollow: a, driverPerspectiveEnabled: d, prefersFlat2D: f,
                        });
                        if (r.tilt) expect(r.followHeading).toBe(true);
                    }
                }
            }
        });
    });
});

describe('computeFollowPadding', () => {
    const { computeFollowPadding } = require('../modules/navigation/camera-pitch.js');

    test('scales with viewport height and width', () => {
        expect(computeFollowPadding(800, 400)).toEqual({
            top: 440,
            bottom: 120,
            left: 12,
            right: 12,
        });
    });

    test('caps bottom reserve between 96 and 200', () => {
        expect(computeFollowPadding(400, 300).bottom).toBe(96);
        expect(computeFollowPadding(2000, 300).bottom).toBe(200);
    });
});

describe('buildNavigationFollowEasePlan', () => {
    const { buildNavigationFollowEasePlan } = require('../modules/navigation/camera-pitch.js');

    test('navigation mode eases when due or urgent', () => {
        const plan = buildNavigationFollowEasePlan({
            nowMs: 5000,
            lastFollowEaseAt: 0,
            followJumpM: 50,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        expect(plan.mode).toBe('navigation');
        expect(plan.shouldEase).toBe(true);
        expect(plan.durationMs).toBe(640);
    });

    test('browsing mode uses fixed zoom and optional padding flag', () => {
        const plan = buildNavigationFollowEasePlan({
            nowMs: 1000,
            lastFollowEaseAt: 0,
            followJumpM: 10,
            zoomAndFollowEnabled: false,
            mapUserPanned: false,
            routeInProgress: true,
        });
        expect(plan.mode).toBe('browsing');
        expect(plan.zoom).toBe(16);
        expect(plan.includePadding).toBe(true);
        expect(plan.browsingDurationMs).toBe(420);
    });

    test('no ease when not due and jump is small', () => {
        const plan = buildNavigationFollowEasePlan({
            nowMs: 1000,
            lastFollowEaseAt: 900,
            followJumpM: 5,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        expect(plan.shouldEase).toBe(false);
    });
});

describe('buildNavigationFollowCameraPlan', () => {
    const { buildNavigationFollowCameraPlan } = require('../modules/navigation/camera-pitch.js');

    test('uses road type for follow zoom and builds easeTo when shouldEase', () => {
        const plan = buildNavigationFollowCameraPlan({
            speedMph: 70,
            roadType: 'motorway',
            heading: 90,
            markerLat: 51.5,
            markerLon: -0.1,
            shouldEase: true,
            durationMs: 600,
            shouldTilt: true,
            usePitchedDrivingCamera: true,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: () => 15,
        });
        expect(plan.zoom).toBe(15);
        expect(plan.pitch).toBe(60);
        expect(plan.easeTo.center).toEqual([-0.1, 51.5]);
    });
});

describe('buildSmartZoomEasePlan', () => {
    const { buildSmartZoomEasePlan } = require('../modules/navigation/camera-pitch.js');

    test('skips when smart zoom disabled', () => {
        expect(buildSmartZoomEasePlan({ smartZoomEnabled: false, routeInProgress: true }).shouldApply)
            .toBe(false);
    });

    test('returns easeTo when zoom changes significantly', () => {
        const plan = buildSmartZoomEasePlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            speedMph: 60,
            distanceToNextTurn: null,
            roadType: 'primary',
            lastZoomLevel: 13,
            userLat: 51.5,
            userLon: -0.1,
            hasMap: true,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
            viewportHeight: 800,
            viewportWidth: 400,
            usePitchedDrivingCamera: false,
            computeSmartZoom: () => 15,
        });
        expect(plan.shouldApply).toBe(true);
        expect(plan.newZoomLevel).toBe(15);
        expect(plan.easeTo.zoom).toBe(15);
        expect(plan.logTurn).toBe(false);
    });

    test('flags turn-based zoom in log metadata', () => {
        const plan = buildSmartZoomEasePlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            speedMph: 20,
            distanceToNextTurn: 200,
            roadType: 'residential',
            lastZoomLevel: 13,
            userLat: 51.5,
            userLon: -0.1,
            hasMap: true,
            turnZoomThreshold: 500,
            computeSmartZoom: () => 17,
        });
        expect(plan.logTurn).toBe(true);
        expect(plan.lastTurnZoomApplied).toBe(true);
    });
});

describe('buildNavigationZoomTickPlan', () => {
    const { buildNavigationZoomTickPlan } = require('../modules/navigation/camera-pitch.js');

    test('skips smart zoom when navigation follow already eased', () => {
        const plan = buildNavigationZoomTickPlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            navigationFollowEaseApplied: true,
            followZoom: 15,
        });
        expect(plan.applySmartZoom).toBe(false);
        expect(plan.syncLastZoomLevel).toBe(15);
    });

    test('allows smart zoom when follow did not ease', () => {
        const plan = buildNavigationZoomTickPlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            navigationFollowEaseApplied: false,
        });
        expect(plan.applySmartZoom).toBe(true);
        expect(plan.syncLastZoomLevel).toBeNull();
    });
});

describe('buildNavigationFollowApplyPlan', () => {
    const {
        buildNavigationFollowEasePlan,
        buildNavigationFollowCameraPlan,
        buildNavigationFollowApplyPlan,
    } = require('../modules/navigation/camera-pitch.js');

    test('navigation mode eases and logs view state', () => {
        const easePlan = buildNavigationFollowEasePlan({
            nowMs: 5000,
            lastFollowEaseAt: 0,
            followJumpM: 50,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        const cameraPlan = buildNavigationFollowCameraPlan({
            speedMph: 60,
            roadType: 'primary',
            heading: 90,
            markerLat: 51.5,
            markerLon: -0.1,
            shouldEase: true,
            shouldTilt: true,
            usePitchedDrivingCamera: true,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: () => 15,
        });
        const apply = buildNavigationFollowApplyPlan({
            hasMap: true,
            followEasePlan: easePlan,
            followCameraPlan: cameraPlan,
            markerLat: 51.5,
            markerLon: -0.1,
            isActiveNavigationFollow: true,
            driverPerspectiveEnabled: false,
        });
        expect(apply.action).toBe('navigation');
        expect(apply.navigationFollowEaseApplied).toBe(true);
        expect(apply.easeTo.center).toEqual([-0.1, 51.5]);
        expect(apply.logLine).toContain('[Navigation] View');
        expect(apply.updateRecenterVisibility).toBe(true);
    });

    test('browsing mode eases with padding when route in progress', () => {
        const easePlan = buildNavigationFollowEasePlan({
            nowMs: 1000,
            lastFollowEaseAt: 0,
            followJumpM: 10,
            zoomAndFollowEnabled: false,
            mapUserPanned: false,
            routeInProgress: true,
        });
        const apply = buildNavigationFollowApplyPlan({
            hasMap: true,
            followEasePlan: easePlan,
            markerLat: 51.5,
            markerLon: -0.1,
            viewportHeight: 800,
            viewportWidth: 400,
        });
        expect(apply.action).toBe('browsing');
        expect(apply.easeTo.zoom).toBe(16);
        expect(apply.easeTo.padding).toBeDefined();
        expect(apply.statePatch.lastFollowCenterGeo).toEqual({ lat: 51.5, lon: -0.1 });
    });

    test('skips when no map available', () => {
        expect(buildNavigationFollowApplyPlan({ hasMap: false }).action).toBe('skip');
    });
});

describe('buildSmartZoomApplyPlan', () => {
    const { buildSmartZoomEasePlan, buildSmartZoomApplyPlan } = require('../modules/navigation/camera-pitch.js');

    test('skips when ease plan does not apply', () => {
        expect(buildSmartZoomApplyPlan({ shouldApply: false }).action).toBe('skip');
    });

    test('returns easeTo apply plan with turn log line', () => {
        const easePlan = buildSmartZoomEasePlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            speedMph: 20,
            distanceToNextTurn: 200,
            roadType: 'residential',
            lastZoomLevel: 13,
            userLat: 51.5,
            userLon: -0.1,
            hasMap: true,
            turnZoomThreshold: 500,
            computeSmartZoom: () => 17,
        });
        const apply = buildSmartZoomApplyPlan(easePlan);
        expect(apply.action).toBe('apply');
        expect(apply.newZoomLevel).toBe(17);
        expect(apply.easeTo.zoom).toBe(17);
        expect(apply.logLine).toContain('Turn-based zoom');
        expect(apply.lastTurnZoomApplied).toBe(true);
    });

    test('returns speed-based log when not a turn zoom', () => {
        const easePlan = buildSmartZoomEasePlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            speedMph: 60,
            distanceToNextTurn: null,
            roadType: 'primary',
            lastZoomLevel: 13,
            userLat: 51.5,
            userLon: -0.1,
            hasMap: true,
            computeSmartZoom: () => 15,
        });
        const apply = buildSmartZoomApplyPlan(easePlan);
        expect(apply.logLine).toContain('Speed-based zoom');
        expect(apply.lastTurnZoomApplied).toBe(false);
    });
});

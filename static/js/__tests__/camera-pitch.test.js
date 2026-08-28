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

    test('places the vanishing point below the visual centre so more map is ahead', () => {
        const height = 800;
        const padding = computeFollowPadding(height, 400);
        const vanishingY = (padding.top + height - padding.bottom) / 2;
        expect(vanishingY).toBeGreaterThan(height / 2);
        expect(padding.top).toBeGreaterThan(padding.bottom);
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
        expect(plan.durationMs).toBe(650);
    });

    test('default follow interval is long enough to avoid stacked zoom eases', () => {
        const due = buildNavigationFollowEasePlan({
            nowMs: 700,
            lastFollowEaseAt: 0,
            followJumpM: 5,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        const notDue = buildNavigationFollowEasePlan({
            nowMs: 699,
            lastFollowEaseAt: 0,
            followJumpM: 5,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        expect(due.shouldEase).toBe(true);
        expect(notDue.shouldEase).toBe(false);
        expect(due.durationMs).toBeLessThanOrEqual(700);
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
        expect(plan.easeTo.padding).toEqual({
            top: 440,
            bottom: 120,
            left: 12,
            right: 12,
        });
        expect(plan.easeTo.padding.top).toBeGreaterThan(plan.easeTo.padding.bottom);
        expect(plan.padding).toEqual(plan.easeTo.padding);
        expect(plan.easeTo.zoom).toBe(15);
    });

    test('passes turn distance into smart zoom and omits ease zoom when unchanged', () => {
        const calls = [];
        const plan = buildNavigationFollowCameraPlan({
            speedMph: 40,
            distanceToNextTurn: 300,
            lastZoomLevel: 18,
            roadType: 'primary',
            heading: 10,
            markerLat: 51.5,
            markerLon: -0.1,
            shouldEase: true,
            shouldTilt: true,
            usePitchedDrivingCamera: true,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: (spd, dist) => {
                calls.push({ spd, dist });
                return 18;
            },
        });
        expect(calls[0]).toEqual({ spd: 40, dist: 300 });
        expect(plan.zoom).toBe(18);
        expect(plan.easeTo.zoom).toBeUndefined();
    });

    test('includes ease zoom when fractional lastZoomLevel is within 1 of target', () => {
        // Route fit stores map.getZoom() (fractional). A "within 1" gate would omit
        // zoom then sync the integer band, leaving the camera at overview.
        const plan = buildNavigationFollowCameraPlan({
            speedMph: 40,
            lastZoomLevel: 15.4,
            roadType: 'urban',
            heading: 10,
            markerLat: 51.5,
            markerLon: -0.1,
            shouldEase: true,
            shouldTilt: true,
            usePitchedDrivingCamera: true,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: () => 16,
        });
        expect(plan.zoom).toBe(16);
        expect(plan.easeTo.zoom).toBe(16);
    });

    test('includes ease zoom when lastZoomLevel is a manual scale away from the target band', () => {
        // Recenter passes map.getZoom() after user zoomstart; managed cache alone
        // can still equal the speed band and would incorrectly omit zoom.
        const plan = buildNavigationFollowCameraPlan({
            speedMph: 40,
            lastZoomLevel: 12,
            roadType: 'urban',
            heading: 10,
            markerLat: 51.5,
            markerLon: -0.1,
            shouldEase: true,
            shouldTilt: true,
            usePitchedDrivingCamera: true,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: () => 16,
        });
        expect(plan.zoom).toBe(16);
        expect(plan.easeTo.zoom).toBe(16);
    });

    test('keeps the same follow padding across GPS-style camera rebuilds', () => {
        const opts = {
            speedMph: 40,
            roadType: 'urban',
            heading: 10,
            markerLat: 53.5,
            markerLon: -1.1,
            shouldEase: true,
            shouldTilt: true,
            usePitchedDrivingCamera: true,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: () => 16,
        };
        const first = buildNavigationFollowCameraPlan(opts);
        const second = buildNavigationFollowCameraPlan(Object.assign({}, opts, { heading: 18 }));
        expect(second.easeTo.padding).toEqual(first.easeTo.padding);
        expect(second.easeTo.center).toEqual([-1.1, 53.5]);
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
        expect(plan.easeTo.padding).toEqual({
            top: 440,
            bottom: 120,
            left: 12,
            right: 12,
        });
        expect(plan.logTurn).toBe(false);
    });

    test('omits follow padding when zoom-and-follow is not active', () => {
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
            zoomAndFollowEnabled: false,
            mapFollowingActive: false,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: () => 15,
        });
        expect(plan.easeTo.padding).toBeUndefined();
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
            turnAheadZoomLevel: 18,
            computeSmartZoom: () => 18,
        });
        expect(plan.logTurn).toBe(true);
        expect(plan.lastTurnZoomApplied).toBe(true);
        expect(plan.newZoomLevel).toBe(18);
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

    test('skips smart zoom entirely while zoom-and-follow owns the camera', () => {
        const plan = buildNavigationZoomTickPlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            navigationFollowEaseApplied: false,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        expect(plan.applySmartZoom).toBe(false);
    });
});

describe('buildNavigationZoomApplyPlan', () => {
    const { buildNavigationZoomTickPlan, buildNavigationZoomApplyPlan } =
        require('../modules/navigation/camera-pitch.js');

    test('maps tick to zoom apply hints', () => {
        const tick = buildNavigationZoomTickPlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            navigationFollowEaseApplied: false,
        });
        const apply = buildNavigationZoomApplyPlan(tick, {
            speedMph: 45,
            distanceToNextTurn: 120,
            roadType: 'primary',
            lat: 51.5,
            lon: -0.1,
        });
        expect(apply.action).toBe('apply');
        expect(apply.applySmartZoom.speedMph).toBe(45);
        expect(apply.applySmartZoom.roadType).toBe('primary');
    });

    test('syncs last zoom when follow eased', () => {
        const tick = buildNavigationZoomTickPlan({
            smartZoomEnabled: true,
            routeInProgress: true,
            navigationFollowEaseApplied: true,
            followZoom: 16,
        });
        const apply = buildNavigationZoomApplyPlan(tick, {});
        expect(apply.syncLastZoomLevel).toBe(16);
        expect(apply.applySmartZoom).toBeUndefined();
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
        expect(apply.navigationFollowZoom).toBe(15);
        expect(apply.easeTo.center).toEqual([-0.1, 51.5]);
        expect(apply.easeTo.padding.top).toBeGreaterThan(apply.easeTo.padding.bottom);
        expect(apply.logLine).toContain('[Navigation] View');
        expect(apply.updateRecenterVisibility).toBe(true);
    });

    test('does not sync followZoom when easeTo omitted zoom for unchanged band', () => {
        const easePlan = buildNavigationFollowEasePlan({
            nowMs: 5000,
            lastFollowEaseAt: 0,
            followJumpM: 50,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        const cameraPlan = buildNavigationFollowCameraPlan({
            speedMph: 40,
            lastZoomLevel: 16,
            roadType: 'urban',
            heading: 90,
            markerLat: 51.5,
            markerLon: -0.1,
            shouldEase: true,
            shouldTilt: true,
            usePitchedDrivingCamera: true,
            viewportHeight: 800,
            viewportWidth: 400,
            computeSmartZoom: () => 16,
        });
        expect(cameraPlan.easeTo.zoom).toBeUndefined();
        const apply = buildNavigationFollowApplyPlan({
            hasMap: true,
            followEasePlan: easePlan,
            followCameraPlan: cameraPlan,
            markerLat: 51.5,
            markerLon: -0.1,
            isActiveNavigationFollow: true,
            driverPerspectiveEnabled: false,
        });
        expect(apply.navigationFollowEaseApplied).toBe(true);
        expect(apply.navigationFollowZoom).toBeNull();
        expect(apply.easeTo.zoom).toBeUndefined();
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
            turnAheadZoomLevel: 18,
            computeSmartZoom: () => 18,
        });
        const apply = buildSmartZoomApplyPlan(easePlan);
        expect(apply.action).toBe('apply');
        expect(apply.newZoomLevel).toBe(18);
        expect(apply.easeTo.zoom).toBe(18);
        expect(apply.logLine).toContain('Turn-based zoom');
        expect(apply.lastTurnZoomApplied).toBe(true);
    });

    test('preserves follow padding on the smart-zoom apply easeTo', () => {
        const { computeFollowPadding } = require('../modules/navigation/camera-pitch.js');
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
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
            viewportHeight: 800,
            viewportWidth: 400,
            turnZoomThreshold: 500,
            turnAheadZoomLevel: 18,
            computeSmartZoom: () => 18,
        });
        const apply = buildSmartZoomApplyPlan(easePlan);
        expect(apply.easeTo.padding).toEqual(computeFollowPadding(800, 400));
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

describe('resolveFollowViewportSize', () => {
    const {
        resolveFollowViewportSize,
        resolveFollowPadding,
        computeFollowPadding,
    } = require('../modules/navigation/camera-pitch.js');

    test('prefers the map container over the window fallback', () => {
        const size = resolveFollowViewportSize({
            map: { getContainer: () => ({ clientHeight: 640, clientWidth: 360 }) },
            fallbackHeight: 800,
            fallbackWidth: 400,
        });
        expect(size).toEqual({ height: 640, width: 360 });
        expect(resolveFollowPadding({
            map: { getContainer: () => ({ clientHeight: 640, clientWidth: 360 }) },
        })).toEqual(computeFollowPadding(640, 360));
    });

    test('falls back when the map container has no size', () => {
        expect(resolveFollowViewportSize({
            map: { getContainer: () => ({ clientHeight: 0, clientWidth: 0 }) },
            fallbackHeight: 800,
            fallbackWidth: 400,
        })).toEqual({ height: 800, width: 400 });
    });
});

describe('buildForegroundFollowCameraRestorePlan', () => {
    const { buildForegroundFollowCameraRestorePlan } = require('../modules/navigation/camera-pitch.js');

    test('re-applies the live navigation camera after background when follow is active', () => {
        expect(buildForegroundFollowCameraRestorePlan({
            routeInProgress: true,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        })).toEqual({
            shouldRestore: true,
            action: 'applyLiveNavigationCamera',
        });
    });

    test('does not force the camera back when the driver left follow', () => {
        expect(buildForegroundFollowCameraRestorePlan({
            routeInProgress: true,
            zoomAndFollowEnabled: true,
            mapFollowingActive: false,
        }).shouldRestore).toBe(false);
        expect(buildForegroundFollowCameraRestorePlan({
            routeInProgress: true,
            zoomAndFollowEnabled: false,
            mapFollowingActive: true,
        }).action).toBe('skip');
    });
});

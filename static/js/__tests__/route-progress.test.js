/**
 * Tests for modules/navigation/route-progress.js
 */
const RP = require('../modules/navigation/route-progress.js');

describe('route-progress module', () => {
    test('exposes progress bar element ids and default text', () => {
        expect(RP.ROUTE_PROGRESS_CONTAINER_ID).toBe('routeProgressContainer');
        expect(RP.ROUTE_PROGRESS_BAR_ID).toBe('routeProgressBar');
        expect(RP.ROUTE_PROGRESS_TEXT_ID).toBe('routeProgressText');
        expect(RP.ROUTE_PROGRESS_DEFAULT_TEXT).toContain('Calculating route');
    });

    test('buildRouteProgressBarInnerHtml includes bar and text span', () => {
        const html = RP.buildRouteProgressBarInnerHtml();
        expect(html).toContain('routeProgressBar');
        expect(html).toContain('routeProgressText');
        expect(html).toContain('Calculating route');
    });

    test('buildRouteProgressBarInnerHtml accepts custom progress text', () => {
        const html = RP.buildRouteProgressBarInnerHtml('Optimising…');
        expect(html).toContain('Optimising…');
    });

    test('getRouteProgressAnimationKeyframes defines progressGradient', () => {
        expect(RP.getRouteProgressAnimationKeyframes()).toContain('@keyframes progressGradient');
    });

    test('buildRouteProgressMountPlan bundles container mount fields', () => {
        const plan = RP.buildRouteProgressMountPlan('Routing…');
        expect(plan.containerId).toBe('routeProgressContainer');
        expect(plan.containerStyleCssText).toContain('position: fixed');
        expect(plan.innerHtml).toContain('Routing…');
        expect(plan.animationStyleId).toBe('progressAnimationStyle');
        expect(plan.animationKeyframes).toContain('progressGradient');
    });
});

describe('navigation progress seed helpers', () => {
    const steps = [
        { begin_shape_index: 0, type: 1 },
        { begin_shape_index: 20, type: 15 },
        { begin_shape_index: 55, type: 10 },
    ];

    test('resolveStepIndexFromSnapIndex picks step near snap vertex', () => {
        expect(RP.resolveStepIndexFromSnapIndex(steps, 0)).toBe(0);
        expect(RP.resolveStepIndexFromSnapIndex(steps, 22)).toBe(1);
        expect(RP.resolveStepIndexFromSnapIndex(steps, 58)).toBe(2);
        expect(RP.resolveStepIndexFromSnapIndex(null, 10)).toBe(0);
    });

    test('buildNavigationProgressSeedPlan seeds indices and join gate', () => {
        const plan = RP.buildNavigationProgressSeedPlan(22, 40, steps, 85);
        expect(plan.lastSnappedRouteIndex).toBe(22);
        expect(plan.lastTurnDetectRouteVertexIndex).toBe(22);
        expect(plan.currentStepIndex).toBe(1);
        expect(plan.routeJoinConfirmedForDeviation).toBe(true);
        expect(plan.logMessage).toContain('snapIdx=22');
    });

    test('buildNavigationProgressSeedPlan does not confirm join when off-route', () => {
        const plan = RP.buildNavigationProgressSeedPlan(10, 120, steps, 85);
        expect(plan.routeJoinConfirmedForDeviation).toBe(false);
    });
});

describe('navigation arrival helpers', () => {
    test('buildNavigationArrivalPlan ends immediately when very close', () => {
        const plan = RP.buildNavigationArrivalPlan(30, 5, 0, 1000);
        expect(plan.action).toBe('end');
    });

    test('buildNavigationArrivalPlan starts dwell when slow in arrival zone', () => {
        const plan = RP.buildNavigationArrivalPlan(50, 0.5, 0, 5000);
        expect(plan.action).toBe('dwell-start');
        expect(plan.nextArrivalZoneSince).toBe(5000);
    });

    test('buildNavigationArrivalPlan ends after dwell time elapsed', () => {
        const plan = RP.buildNavigationArrivalPlan(50, 0.5, 1000, 5000);
        expect(plan.action).toBe('end');
    });

    test('buildNavigationArrivalPlan resets dwell when leaving zone', () => {
        const plan = RP.buildNavigationArrivalPlan(200, 5, 1000, 5000);
        expect(plan.action).toBe('none');
        expect(plan.nextArrivalZoneSince).toBe(0);
    });
});

describe('navigation arrival tick plan', () => {
    test('buildNavigationArrivalTickPlan skips when arrival already triggered', () => {
        const tick = RP.buildNavigationArrivalTickPlan({
            routeInProgress: true,
            arrivalTriggered: true,
            remainingM: 30,
            speedMs: 0,
            arrivalZoneSince: 0,
            now: 5000,
        });
        expect(tick.action).toBe('skip');
        expect(tick.reason).toBe('triggered');
    });

    test('buildNavigationArrivalTickPlan ends navigation when very close', () => {
        const tick = RP.buildNavigationArrivalTickPlan({
            routeInProgress: true,
            arrivalTriggered: false,
            remainingM: 30,
            speedMs: 5,
            arrivalZoneSince: 0,
            now: 5000,
        });
        expect(tick.endNavigation).toBe(true);
        expect(tick.statePatch.arrivalZoneSince).toBe(0);
        expect(tick.logMessage).toContain('30m remaining');
    });
});

describe('GPS navigation active tick plan', () => {
    test('buildGpsNavigationActiveTickPlan enables sub-tasks when route polyline exists', () => {
        const tick = RP.buildGpsNavigationActiveTickPlan({
            routeInProgress: true,
            routePolyline: [[1, 2], [3, 4]],
        });
        expect(tick.active).toBe(true);
        expect(tick.detectTurn).toBe(true);
        expect(tick.checkArrival).toBe(true);
    });

    test('buildGpsNavigationActiveTickPlan is inactive without polyline', () => {
        const tick = RP.buildGpsNavigationActiveTickPlan({
            routeInProgress: true,
            routePolyline: [],
        });
        expect(tick.active).toBe(false);
    });
});

describe('GPS tracking side effects plan', () => {
    test('buildGpsTrackingSideEffectsPlan enables nav phases when route is active', () => {
        const plan = RP.buildGpsTrackingSideEffectsPlan({
            routeInProgress: true,
            routePolyline: [[1, 2], [3, 4]],
            routeSteps: [{ type: 8 }],
            isTrackingActive: true,
            speedLimitShowWidget: true,
        });
        expect(plan.checkDeviation).toBe(true);
        expect(plan.processHazards).toBe(true);
        expect(plan.navActive.active).toBe(true);
        expect(plan.updateLaneGuidance).toBe(true);
        expect(plan.showSpeedWidget).toBe(true);
        expect(plan.fetchRoadName).toBe(true);
    });

    test('buildGpsTrackingSideEffectsPlan still processes hazards when only tracking', () => {
        const plan = RP.buildGpsTrackingSideEffectsPlan({
            routeInProgress: false,
            isTrackingActive: true,
            speedLimitShowWidget: false,
        });
        expect(plan.processHazards).toBe(true);
        expect(plan.navActive.active).toBe(false);
        expect(plan.checkDeviation).toBe(false);
    });
});

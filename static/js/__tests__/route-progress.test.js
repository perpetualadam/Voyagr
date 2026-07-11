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

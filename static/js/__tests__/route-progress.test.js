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
});

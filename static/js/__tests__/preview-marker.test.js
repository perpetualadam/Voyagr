/**
 * Tests for modules/map/preview-marker.js
 */
const PM = require('../modules/map/preview-marker.js');

describe('preview-marker module', () => {
    test('buildPreviewMarkerInnerHtml includes icon and label', () => {
        const html = PM.buildPreviewMarkerInnerHtml('High Street');
        expect(html).toContain('preview-marker-icon');
        expect(html).toContain('preview-marker-label');
        expect(html).toContain('High Street');
        expect(html).toContain('📍');
    });

    test('getPreviewMarkerStyleCssText centers marker above anchor', () => {
        expect(PM.getPreviewMarkerStyleCssText()).toContain('translateY(-50%)');
    });

    test('getRouteEndpointMarkerOptions returns start and end pin styles', () => {
        const start = PM.getRouteEndpointMarkerOptions('start');
        expect(start.fillColor).toBe('#00ff00');
        expect(start.popup).toBe('Start Location');
        const end = PM.getRouteEndpointMarkerOptions('end');
        expect(end.fillColor).toBe('#ff0000');
        expect(end.popup).toBe('End Location');
    });

    test('buildRoutePreviewMapApplyPlan assembles marker and bounds apply metadata', () => {
        const plan = PM.buildRoutePreviewMapApplyPlan({
            startCoords: [51.5, -0.1],
            endCoords: [51.6, -0.2],
            routePath: [[51.5, -0.1], [51.55, -0.15], [51.6, -0.2]],
            pathPlan: { usedFallback: false, precision: 6 },
            hasGeometry: true,
            geometrySource: 'valhalla',
        });
        expect(plan.removeExistingMarkers).toBe(true);
        expect(plan.startMarker.lat).toBe(51.5);
        expect(plan.endMarker.options.fillColor).toBe('#ff0000');
        expect(plan.fitBounds.padding).toBe(50);
        expect(plan.pathLog.level).toBe('log');
        expect(plan.pathLog.message).toContain('precision 6');
    });

    test('buildRoutePreviewMapApplyPlan logs fallback when decode fails', () => {
        const plan = PM.buildRoutePreviewMapApplyPlan({
            startCoords: [51.5, -0.1],
            endCoords: [51.6, -0.2],
            routePath: [[51.5, -0.1], [51.6, -0.2]],
            pathPlan: { usedFallback: true, precision: null },
            hasGeometry: true,
        });
        expect(plan.pathLog.level).toBe('error');
        expect(plan.pathLog.message).toContain('empty');
    });
});

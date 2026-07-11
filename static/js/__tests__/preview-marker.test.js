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
});

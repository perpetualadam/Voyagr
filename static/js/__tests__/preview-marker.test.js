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
});

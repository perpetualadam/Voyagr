/**
 * Tests for modules/map/osm-map-icons.js
 */
const OSM = require('../modules/map/osm-map-icons.js');

describe('osm-map-icons module', () => {
    test('buildRailwayCrossingIconSvg includes rails and cross', () => {
        const svg = OSM.buildRailwayCrossingIconSvg();
        expect(svg).toContain('<svg');
        expect(svg).toContain('#795548');
    });

    test('buildRailwayCrossingMarkerHtml wraps icon in styled container', () => {
        const html = OSM.buildRailwayCrossingMarkerHtml('<svg></svg>');
        expect(html).toContain('32px');
        expect(html).toContain('<svg></svg>');
    });

    test('buildOsmTrafficLightMarkerPillHtml wraps inner SVG', () => {
        const html = OSM.buildOsmTrafficLightMarkerPillHtml('<svg id="tl"></svg>');
        expect(html).toContain('osm-traffic-light-pill');
        expect(html).toContain('id="tl"');
    });

    test('buildOsmTrafficLightPopupHtml includes traffic light label', () => {
        const html = OSM.buildOsmTrafficLightPopupHtml('<pill/>');
        expect(html).toContain('Traffic light');
        expect(html).toContain('<pill/>');
    });
});

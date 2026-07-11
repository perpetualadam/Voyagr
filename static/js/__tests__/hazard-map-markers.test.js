/**
 * Tests for modules/map/hazard-map-markers.js
 */
const HM = require('../modules/map/hazard-map-markers.js');

describe('hazard-map-markers module', () => {
    const config = { emoji: '⚠️', color: '#ff9800', bgColor: '#fff3e0', label: 'Hazard' };

    test('buildHazardEmojiMarkerHtml wraps emoji marker', () => {
        const html = HM.buildHazardEmojiMarkerHtml(config);
        expect(html).toContain('28px');
        expect(html).toContain('⚠️');
    });

    test('buildHazardDistanceAheadHtml formats km ahead', () => {
        expect(HM.buildHazardDistanceAheadHtml(2.4)).toContain('2.4 km ahead');
        expect(HM.buildHazardDistanceAheadHtml(null)).toBe('');
    });

    test('buildHazardMarkerPopupHtml includes label and distance', () => {
        const html = HM.buildHazardMarkerPopupHtml({
            popupIcon: '<svg></svg>',
            config,
            description: 'Roadworks',
            distanceHtml: HM.buildHazardDistanceAheadHtml(1.2),
        });
        expect(html).toContain('Hazard');
        expect(html).toContain('Roadworks');
        expect(html).toContain('1.2 km ahead');
    });

    test('normalizeCameraHazardTypeForMarker maps legacy camera strings', () => {
        expect(HM.normalizeCameraHazardTypeForMarker('traffic_signals')).toBe('traffic_light');
        expect(HM.normalizeCameraHazardTypeForMarker('camera_average_speed')).toBe('camera_average_speed');
        expect(HM.normalizeCameraHazardTypeForMarker('traffic light camera')).toBe('camera_red_light');
    });

    test('getHazardMarkerStyleMap includes camera and traffic light entries', () => {
        const map = HM.getHazardMarkerStyleMap();
        expect(map.camera_speed.svg).toContain('<svg');
        expect(map.traffic_light.useOsmTrafficLightPill).toBe(true);
        expect(HM.resolveHazardMarkerConfig(map, 'unknown').label).toBe('Hazard');
    });
});

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
        expect(HM.normalizeCameraHazardTypeForMarker('roadworks')).toBe('roadworks');
    });

    test('getHazardMarkerStyleMap includes camera and traffic light entries', () => {
        const map = HM.getHazardMarkerStyleMap();
        expect(map.camera_speed.svg).toContain('<svg');
        expect(map.traffic_light.useOsmTrafficLightPill).toBe(true);
        expect(HM.resolveHazardMarkerConfig(map, 'unknown').label).toBe('Hazard');
    });

    test('buildHazardMarkersMountPlans dedupes locations and skips invalid coords', () => {
        const plan = HM.buildHazardMarkersMountPlans([
            { lat: 51.5, lon: -0.1, type: 'camera_speed', distance_km: 1.2 },
            { lat: 51.5, lon: -0.1, type: 'camera_speed' },
            { lat: null, lon: -0.1, type: 'camera' },
            { lat: 51.51, lon: -0.11, type: 'roadworks', description: 'Works' },
        ]);
        expect(plan.markers).toHaveLength(2);
        expect(plan.skippedDuplicate).toBe(1);
        expect(plan.skippedInvalid).toBe(1);
        expect(plan.markers[0].popupHtml).toContain('1.2 km ahead');
        expect(plan.markers[1].popupHtml).toContain('Roadworks');
    });

    test('buildAllRoutesHazardsList collects hazards from all routes', () => {
        const list = HM.buildAllRoutesHazardsList([
            { hazards: [{ lat: 1, lon: 2 }] },
            { hazards: [] },
            { hazards: [{ lat: 3, lon: 4 }] },
        ]);
        expect(list.routeCount).toBe(3);
        expect(list.hazards).toHaveLength(2);
    });

    test('buildDisplayAllRouteHazardsPlan requests display when hazards exist', () => {
        const plan = HM.buildDisplayAllRouteHazardsPlan([
            { hazards: [{ lat: 1, lon: 2, type: 'camera' }] },
            { hazards: [] },
        ]);
        expect(plan.shouldDisplay).toBe(true);
        expect(plan.hazardCount).toBe(1);
        expect(plan.logMessage).toContain('1 total');
        expect(HM.buildDisplayAllRouteHazardsPlan([{ hazards: [] }]).shouldDisplay).toBe(false);
    });
});

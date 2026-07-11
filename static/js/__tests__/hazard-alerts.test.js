/**
 * Behaviour tests for modules/navigation/hazard-alerts.js — offline route hazards must alert.
 */
const HA = require('../modules/navigation/hazard-alerts.js');

describe('hazard-alerts module', () => {
    test('isCameraHazardType recognises average-speed cameras', () => {
        expect(HA.isCameraHazardType('camera_average_speed')).toBe(true);
        expect(HA.isCameraHazardType('accident')).toBe(false);
    });

    test('getRouteEmbeddedHazards reads hazards and hazards_on_route', () => {
        const route = {
            hazards: [{ lat: 1, lon: 2, type: 'camera_speed' }],
            hazards_on_route: [{ lat: 3, lon: 4, type: 'camera_average_speed' }]
        };
        expect(HA.getRouteEmbeddedHazards(route)).toHaveLength(1);
        expect(HA.getRouteEmbeddedHazards({ hazards_on_route: route.hazards_on_route })).toHaveLength(1);
    });

    test('formatHazardDistanceForUserMeters uses feet under 402 m for miles preference', () => {
        expect(HA.formatHazardDistanceForUserMeters(33.5, 'mi')).toBe('110 feet');
    });

    test('collectHazardsToAnnounce uses route hazards offline (no nearby payload)', () => {
        const route = {
            hazards: [{ lat: 51.501, lon: -0.142, type: 'camera_average_speed' }]
        };
        const polyline = [
            [51.500, -0.140],
            [51.501, -0.141],
            [51.502, -0.142]
        ];
        const alerts = HA.collectHazardsToAnnounce({
            lat: 51.500,
            lon: -0.140,
            route: route,
            includeNearby: false,
            routePolyline: polyline,
            snappedRouteIndex: 0,
            cameraAlertDistanceM: 500,
            generalHazardDistanceM: 500,
            calculateDistance: HA.haversineMeters
        });
        expect(alerts.length).toBeGreaterThan(0);
        expect(alerts[0].unavoidableRouteCamera).toBe(true);
        expect(alerts[0].distanceM).toBeLessThan(500);
    });

    test('mergeHazardSources prefers route flag on duplicates', () => {
        const merged = HA.mergeHazardSources(
            [{ lat: 1.1, lon: 2.2, type: 'camera_speed' }],
            [{ lat: 1.10001, lon: 2.20001, type: 'camera_speed' }]
        );
        expect(merged).toHaveLength(2);
    });

    test('groupHazardsByType counts hazard types', () => {
        const grouped = HA.groupHazardsByType([
            { type: 'camera' },
            { type: 'camera' },
            { type: 'roadworks' },
        ]);
        expect(grouped).toEqual({ camera: 2, roadworks: 1 });
    });

    test('formatHazardTypeSummary builds readable summary', () => {
        expect(HA.formatHazardTypeSummary({ camera: 2, traffic_light: 1 }))
            .toBe('2x camera, 1x traffic light');
    });

    test('buildUnavoidableHazardsListHtml includes icon and count', () => {
        const html = HA.buildUnavoidableHazardsListHtml({ camera: 2 });
        expect(html).toContain('📷');
        expect(html).toContain('camera');
        expect(html).toContain('2');
    });

    test('buildUnavoidableHazardsModalHtml pluralizes hazard count and keeps actions', () => {
        const html = HA.buildUnavoidableHazardsModalHtml('<p>list</p>', 2);
        expect(html).toContain('2 hazards');
        expect(html).toContain('list');
        expect(html).toContain('closeUnavoidableHazardsModal');
        expect(html).toContain('openHazardSettings');

        const singular = HA.buildUnavoidableHazardsModalHtml('', 1);
        expect(singular).toContain('1 hazard on all routes');
    });

    test('unavoidable hazards modal shell exposes ids and layout styles', () => {
        expect(HA.UNAVOIDABLE_HAZARDS_MODAL_ID).toBe('unavoidableHazardsModal');
        expect(HA.UNAVOIDABLE_HAZARDS_BACKDROP_ID).toBe('unavoidableHazardsBackdrop');
        expect(HA.getUnavoidableHazardsModalStyleCssText()).toContain('z-index: 10001');
        expect(HA.getUnavoidableHazardsBackdropStyleCssText()).toContain('rgba(0,0,0,0.5)');
    });
});

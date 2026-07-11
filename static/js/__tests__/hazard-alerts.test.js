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

    test('isHazardPreferenceEnabled treats missing pref as enabled', () => {
        expect(HA.isHazardPreferenceEnabled(null)).toBe(true);
        expect(HA.isHazardPreferenceEnabled({ enabled: 0 })).toBe(false);
        expect(HA.HAZARD_CAMERA_PREF_SUBTYPES).toContain('camera_speed');
    });

    test('buildHazardCameraTogglesApplyPlan maps API prefs to toggle states', () => {
        const plan = HA.buildHazardCameraTogglesApplyPlan([
            { hazard_type: 'camera_speed', enabled: false },
            { hazard_type: 'camera_red_light', enabled: true },
        ]);
        expect(plan.find((item) => item.hazardType === 'camera_speed').enabled).toBe(false);
        expect(plan.find((item) => item.hazardType === 'camera_red_light').enabled).toBe(true);
        expect(plan.find((item) => item.hazardType === 'camera_mobile').enabled).toBe(true);
    });

    test('buildHazardCameraTogglesFallbackApplyPlan defaults all toggles to enabled', () => {
        const plan = HA.buildHazardCameraTogglesFallbackApplyPlan();
        expect(plan.length).toBe(HA.HAZARD_CAMERA_PREF_SUBTYPES.length);
        expect(plan.every((item) => item.enabled === true)).toBe(true);
    });

    test('buildHazardPreferenceTogglePayload preserves penalty fields', () => {
        const payload = HA.buildHazardPreferenceTogglePayload('camera_speed', {
            penalty_seconds: 30,
            proximity_threshold_meters: 100,
        }, false);
        expect(payload).toEqual({
            hazard_type: 'camera_speed',
            enabled: false,
            penalty_seconds: 30,
            proximity_threshold_meters: 100,
        });
    });

    test('buildHazardPreferenceToggleStatusMessage formats camera label', () => {
        expect(HA.buildHazardPreferenceToggleStatusMessage('camera_red_light', true))
            .toBe('Camera (red light) avoidance enabled');
    });

    test('buildUnavoidableHazardsModalMountPlan returns mount shell and inner html', () => {
        const mount = HA.buildUnavoidableHazardsModalMountPlan({ camera: 2 }, 2);
        expect(mount.modalId).toBe(HA.UNAVOIDABLE_HAZARDS_MODAL_ID);
        expect(mount.backdropId).toBe(HA.UNAVOIDABLE_HAZARDS_BACKDROP_ID);
        expect(mount.display).toBe('block');
        expect(mount.autoCloseMs).toBe(10000);
        expect(mount.innerHtml).toContain('2 hazards');
        expect(mount.modalStyle).toContain('z-index: 10001');
    });

    test('buildUnavoidableHazardsHandlingPlan groups hazards and builds log lines', () => {
        const plan = HA.buildUnavoidableHazardsHandlingPlan([
            { type: 'camera' },
            { type: 'camera' },
            { type: 'roadworks' },
        ], 3);
        expect(plan.hazardTypes).toEqual({ camera: 2, roadworks: 1 });
        expect(plan.hazardSummary).toContain('camera');
        expect(plan.logLine).toContain('3 unavoidable hazards');
        expect(plan.summaryLogLine).toContain('Unavoidable hazards');
    });
});

describe('navigation hazard tick helpers', () => {
    test('buildNavigationHazardAlertsTickPlan skips when not navigating or tracking', () => {
        expect(HA.buildNavigationHazardAlertsTickPlan({ routeInProgress: false, isTrackingActive: false }).action)
            .toBe('skip');
    });

    test('buildNavigationHazardAlertsTickPlan evaluates embedded hazards offline', () => {
        const plan = HA.buildNavigationHazardAlertsTickPlan({
            routeInProgress: true,
            isTrackingActive: false,
            isOffline: true,
            navigatorOnLine: false,
            lat: 51.5,
            lon: -0.1,
        });
        expect(plan.action).toBe('evaluate-embedded');
        expect(plan.evaluateEmbedded).toBe(true);
        expect(plan.fetchNearby).toBe(false);
    });

    test('buildNavigationHazardAlertsTickPlan fetches nearby hazards when online', () => {
        const plan = HA.buildNavigationHazardAlertsTickPlan({
            routeInProgress: true,
            isTrackingActive: false,
            isOffline: false,
            navigatorOnLine: true,
            lat: 51.5,
            lon: -0.12,
        });
        expect(plan.action).toBe('evaluate-both');
        expect(plan.fetchNearby).toBe(true);
        expect(plan.nearbyUrl).toContain('lat=51.5');
        expect(plan.nearbyUrl).toContain('radius_km=0.8');
    });

    test('buildHazardEvaluationParams prefers along-route for route hazards', () => {
        const params = HA.buildHazardEvaluationParams({
            lat: 1,
            lon: 2,
            route: { hazards: [] },
            includeNearby: true,
            nearbyPayload: [],
            routePolyline: [[1, 2]],
            snappedRouteIndex: 0,
            cameraAlertDistanceM: 500,
            generalHazardDistanceM: 400,
            calculateDistance: HA.haversineMeters,
        });
        expect(params.preferAlongRouteForRouteHazards).toBe(true);
        expect(params.generalHazardDistanceM).toBe(400);
    });

    test('buildHazardAnnouncementDebounceKey is stable for route vs nearby', () => {
        const hazard = { type: 'camera', lat: 1.1, lon: 2.2 };
        expect(HA.buildHazardAnnouncementDebounceKey(hazard, false)).toBe('camera_1.1_2.2_near');
        expect(HA.buildHazardAnnouncementDebounceKey(hazard, true)).toBe('camera_1.1_2.2_route');
    });

    test('buildHazardAnnouncementPlan skips camera alerts when preference is off', () => {
        const plan = HA.buildHazardAnnouncementPlan(
            { type: 'camera_speed', lat: 1, lon: 2 },
            100,
            { cameraAlertType: 'off' }
        );
        expect(plan.action).toBe('skip');
        expect(plan.reason).toBe('camera-alerts-off');
    });

    test('buildHazardAnnouncementPlan announces voice for general hazards', () => {
        const plan = HA.buildHazardAnnouncementPlan(
            { type: 'roadworks', lat: 1, lon: 2 },
            200,
            { voiceAnnouncementsEnabled: true, distanceUnit: 'km', now: 40_000, lastAnnounceAt: 0 }
        );
        expect(plan.action).toBe('announce');
        expect(plan.speak).toBe(true);
        expect(plan.notification.message).toContain('roadworks');
    });

    test('buildHazardAnnouncementPlan debounces repeat announcements', () => {
        const plan = HA.buildHazardAnnouncementPlan(
            { type: 'camera', lat: 1, lon: 2 },
            50,
            { now: 20_000, lastAnnounceAt: 5_000, cameraAlertType: 'voice' }
        );
        expect(plan.action).toBe('skip');
        expect(plan.reason).toBe('debounced');
    });

    test('buildHazardAnnouncementExecutePlan maps announce plan to side effects', () => {
        const announce = HA.buildHazardAnnouncementPlan(
            { type: 'roadworks', lat: 1, lon: 2 },
            200,
            { now: 60_000, lastAnnounceAt: 0, voiceAnnouncementsEnabled: true }
        );
        const execute = HA.buildHazardAnnouncementExecutePlan(announce);
        expect(execute.shouldExecute).toBe(true);
        expect(execute.speak).toBe(true);
        expect(execute.notification.title).toBe('Hazard Alert');

        expect(HA.buildHazardAnnouncementExecutePlan({ action: 'skip' }).shouldExecute).toBe(false);
    });

    test('buildNavigationHazardAlertsNearbyFetchPlan gates on tick flags', () => {
        expect(HA.buildNavigationHazardAlertsNearbyFetchPlan({ fetchNearby: false }).shouldFetch).toBe(false);
        const fetch = HA.buildNavigationHazardAlertsNearbyFetchPlan({
            fetchNearby: true,
            nearbyUrl: '/api/hazards/nearby?lat=1&lon=2&radius_km=2',
        });
        expect(fetch.shouldFetch).toBe(true);
        expect(fetch.url).toContain('nearby');
    });
});

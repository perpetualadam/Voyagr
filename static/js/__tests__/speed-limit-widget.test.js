/**
 * Behaviour tests for modules/navigation/speed-limit-widget.js
 */
const SL = require('../modules/navigation/speed-limit-widget.js');
const SG = require('../modules/navigation/speed-gps.js');

describe('speed-limit-widget module', () => {
    test('shouldFetchSpeedLimit respects interval and distance', () => {
        const state = SL.createFetchState({ lastFetchAt: 1000, lastPosition: { lat: 51, lon: 0 } });
        const now = 2000;
        const dist = () => 10;
        expect(SL.shouldFetchSpeedLimit(state, 51.0001, 0.0001, now, dist)).toBe(false);
        expect(SL.shouldFetchSpeedLimit(state, 51.001, 0.001, now + 5000, dist)).toBe(true);
    });

    test('parseSpeedLimitApiResponse prefers mph and sanitizes implausible limits', () => {
        const parsed = SL.parseSpeedLimitApiResponse({
            success: true,
            data: { speed_limit_mph: 70, road_type: 'residential', source: 'osm' }
        }, 'residential', 30, SG);
        expect(parsed.limitMph).toBeNull();
        const motorway = SL.parseSpeedLimitApiResponse({
            success: true,
            data: { speed_limit_mph: 70, road_type: 'motorway', source: 'osm' }
        }, 'motorway', 65, SG);
        expect(motorway.limitMph).toBe(70);
    });

    test('pickDisplaySpeedLimitMph prefers API over Valhalla edge hint', () => {
        expect(SL.pickDisplaySpeedLimitMph(30, 70)).toBe(30);
        expect(SL.pickDisplaySpeedLimitMph(null, 60)).toBe(60);
    });

    test('pickDisplaySpeedLimitMph prefers edge hint when preferValhallaOverApi is set', () => {
        // Live GPS must forward this options bag from buildNavSpeedLimitTickPlan
        // so a sticky API 60 does not win over a signed 30 on maneuver change.
        expect(SL.pickDisplaySpeedLimitMph(60, 30, 'primary', 'uk', {
            preferValhallaOverApi: true,
        })).toBe(30);
        expect(SL.pickDisplaySpeedLimitMph(60, 30, 'primary', 'uk')).toBe(60);
    });

    test('pickDisplaySpeedLimitMph falls back to road-type default when allowed', () => {
        expect(SL.pickDisplaySpeedLimitMph(null, null, 'motorway', 'uk', { allowRoadTypeFallback: true })).toBe(70);
        expect(SL.pickDisplaySpeedLimitMph(null, null, 'motorway', 'uk')).toBeNull();
        expect(SL.pickDisplaySpeedLimitMph(null, null, 'unknown', 'uk', { allowRoadTypeFallback: true })).toBeNull();
    });

    test('parseSpeedLimitApiResponse rejects motorway 70 when active edge is residential', () => {
        // Bad TomTom snaps used to invent detected_road_type=motorway and show
        // 70 mph on signed 30 mph streets near the destination.
        const parsed = SL.parseSpeedLimitApiResponse({
            success: true,
            data: {
                speed_limit_mph: 70,
                detected_road_type: 'motorway',
                source: 'TomTom-SnapToRoads'
            }
        }, 'residential', 28, SG);
        expect(parsed.limitMph).toBeNull();
    });

    test('parseSpeedLimitApiResponse accepts motorway 70 when client edge is motorway', () => {
        const parsed = SL.parseSpeedLimitApiResponse({
            success: true,
            data: {
                speed_limit_mph: 70,
                detected_road_type: 'motorway',
                source: 'TomTom-SnapToRoads'
            }
        }, 'motorway', 65, SG);
        expect(parsed.limitMph).toBe(70);
        expect(parsed.roadType).toBe('motorway');
    });

    test('inferRoadTypeDefaultLimitMph uses 60 for UK trunk (single-carriageway NSL)', () => {
        expect(SL.inferRoadTypeDefaultLimitMph('trunk', 'uk')).toBe(60);
        expect(SL.inferRoadTypeDefaultLimitMph('trunk_road', 'uk')).toBe(60);
        expect(SL.inferRoadTypeDefaultLimitMph('motorway', 'uk')).toBe(70);
        expect(SL.inferRoadTypeDefaultLimitMph('residential', 'uk')).toBe(30);
    });

    test('formatSpeedForWidget converts mph to km/h display', () => {
        const mph = SL.formatSpeedForWidget(60, 'mph', SG);
        expect(mph.value).toBe(60);
        expect(mph.unitLabel).toBe('mph');
        const kmh = SL.formatSpeedForWidget(60, 'kmh', SG);
        expect(kmh.unitLabel).toBe('km/h');
        expect(kmh.value).toBeGreaterThan(95);
    });

    test('buildSpeedWidgetApplyPlan skips when widget hidden', () => {
        expect(SL.buildSpeedWidgetApplyPlan({ showSpeedWidget: false }).action).toBe('skip');
    });

    test('buildSpeedWidgetApplyPlan resets fetch state on maneuver change', () => {
        const plan = SL.buildSpeedWidgetApplyPlan({
            showSpeedWidget: true,
            speedLimitPlan: {
                resetFetchState: true,
                newLastActiveManeuverIdx: 2,
                displaySpeedMph: 45,
                shownLimit: 50,
                roadType: 'primary',
                valhallaSpeedLimitMph: 50,
            },
            routeInProgress: true,
            isTrackingActive: false,
            lat: 51.5,
            lon: -0.1,
            heading: 90,
        });
        expect(plan.action).toBe('apply');
        expect(plan.resetFetchState).toBe(true);
        expect(plan.newLastActiveManeuverIdx).toBe(2);
        expect(plan.updateWidget).toEqual({ displaySpeedMph: 45, shownLimit: 50 });
        expect(plan.fetchHint).toMatchObject({
            lat: 51.5,
            lon: -0.1,
            roadType: 'primary',
            valhallaSpeedLimitMph: 50,
            heading: 90,
        });
    });

    test('buildSpeedWidgetApplyPlan omits fetch hint when idle', () => {
        const plan = SL.buildSpeedWidgetApplyPlan({
            showSpeedWidget: true,
            speedLimitPlan: {
                displaySpeedMph: 0,
                shownLimit: null,
                roadType: 'unknown',
            },
            routeInProgress: false,
            isTrackingActive: false,
            lat: 51.5,
            lon: -0.1,
        });
        expect(plan.fetchHint).toBeNull();
    });

    test('buildSpeedLimitFetchResetApplyPlan full reroute clears fetch and hints', () => {
        const plan = SL.buildSpeedLimitFetchResetApplyPlan({ kind: 'full-reroute' });
        expect(plan.action).toBe('apply');
        expect(plan.newLastActiveManeuverIdx).toBe(-1);
        expect(plan.resetCurrentLimitMph).toBe(true);
        expect(plan.resetCurrentSpeedLimitMph).toBe(true);
        expect(plan.resetDetectedRoadType).toBe(true);
    });

    test('buildSpeedLimitFetchResetApplyPlan maneuver change resets fetch cadence', () => {
        const plan = SL.buildSpeedLimitFetchResetApplyPlan({
            kind: 'maneuver-change',
            newLastActiveManeuverIdx: 3,
        });
        expect(plan.newLastActiveManeuverIdx).toBe(3);
        expect(plan.resetCurrentLimitMph).toBeFalsy();
    });

    test('buildSpeedLimitFetchTickPlan throttles in-flight and due fetches', () => {
        const state = SL.createFetchState({ inFlight: true });
        expect(SL.buildSpeedLimitFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            fetchState: state,
            calculateDistance: () => 100,
        }).action).toBe('skip');

        const tick = SL.buildSpeedLimitFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            roadType: 'primary',
            valhallaSpeedLimit: 50,
            fetchState: SL.createFetchState({ seq: 2 }),
            now: 10000,
            calculateDistance: () => 100,
            currentSpeedMph: 45,
            currentGpsSpeedMph: 44,
        });
        expect(tick.action).toBe('fetch');
        expect(tick.seq).toBe(3);
        expect(tick.statePatch.inFlight).toBe(true);
        expect(tick.url).toContain('/api/speed-limit');
    });

    test('buildSpeedLimitFetchTickPlan fetches immediately when road type changes', () => {
        const tick = SL.buildSpeedLimitFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            roadType: 'motorway',
            lastFetchedRoadType: 'residential',
            fetchState: SL.createFetchState({ lastFetchAt: Date.now(), lastPosition: { lat: 51.5, lon: -0.1 } }),
            now: Date.now(),
            calculateDistance: () => 0,
        });
        expect(tick.action).toBe('fetch');
    });

    test('buildSpeedLimitApiSuccessApplyPlan maps API payload to widget update', () => {
        const apply = SL.buildSpeedLimitApiSuccessApplyPlan({
            data: {
                success: true,
                data: { speed_limit_mph: 70, road_type: 'motorway', source: 'osm' },
            },
            lat: 51.5,
            lon: -0.1,
            roadType: 'motorway',
            valhallaSpeedLimit: 70,
            currentSpeedMph: 65,
            currentGpsSpeedMph: 64,
            speedGpsModule: SG,
        });
        expect(apply.action).toBe('apply');
        expect(apply.statePatch.currentSpeedLimitMph).toBe(70);
        expect(apply.widgetUpdate.shownLimit).toBe(70);
        expect(apply.cacheHint.limitMph).toBe(70);
    });

    test('buildSpeedLimitApiSuccessApplyPlan keeps edge 30 over weak road-type 60', () => {
        // Trunk/primary road-type defaults must not re-stick NSL 60 after the
        // active maneuver already entered a signed 30 mph zone.
        const apply = SL.buildSpeedLimitApiSuccessApplyPlan({
            data: {
                success: true,
                data: {
                    speed_limit_mph: 60,
                    road_type: 'trunk',
                    source: 'road-type-default',
                },
            },
            lat: 51.5,
            lon: -0.1,
            roadType: 'trunk',
            valhallaSpeedLimit: 30,
            currentSpeedMph: 28,
            currentGpsSpeedMph: 27,
            speedGpsModule: SG,
        });
        expect(apply.action).toBe('apply');
        expect(apply.widgetUpdate.shownLimit).toBe(30);
        expect(apply.statePatch.currentSpeedLimitMph).toBe(30);
    });

    test('buildSpeedLimitApiSuccessApplyPlan keeps edge 30 over authoritative OSM 60', () => {
        // A nearby NSL / wrong-way OSM hit must not inflate above the active
        // signed edge after the widget already entered a 30 mph segment.
        const apply = SL.buildSpeedLimitApiSuccessApplyPlan({
            data: {
                success: true,
                data: {
                    speed_limit_mph: 60,
                    road_type: 'primary',
                    source: 'OSM-maxspeed',
                },
            },
            lat: 51.5,
            lon: -0.1,
            roadType: 'primary',
            valhallaSpeedLimit: 30,
            currentSpeedMph: 28,
            currentGpsSpeedMph: 27,
            speedGpsModule: SG,
        });
        expect(apply.action).toBe('apply');
        expect(apply.widgetUpdate.shownLimit).toBe(30);
        expect(apply.statePatch.currentSpeedLimitMph).toBe(30);
        expect(apply.cacheHint.source).toBe('edge-hint');
    });

    test('buildSpeedLimitApiSuccessApplyPlan still accepts lower API than edge', () => {
        // Unsigned freeflow edge 60 with a real posted OSM 30 must show 30.
        const apply = SL.buildSpeedLimitApiSuccessApplyPlan({
            data: {
                success: true,
                data: {
                    speed_limit_mph: 30,
                    road_type: 'primary',
                    source: 'OSM-maxspeed',
                },
            },
            lat: 51.5,
            lon: -0.1,
            roadType: 'primary',
            valhallaSpeedLimit: 60,
            currentSpeedMph: 28,
            currentGpsSpeedMph: 27,
            speedGpsModule: SG,
        });
        expect(apply.widgetUpdate.shownLimit).toBe(30);
        expect(apply.statePatch.currentSpeedLimitMph).toBe(30);
    });

    test('buildSpeedLimitFetchFallbackApplyPlan prefers cached limit', () => {
        const apply = SL.buildSpeedLimitFetchFallbackApplyPlan({
            cachedLimitMph: 40,
            valhallaSpeedLimit: 50,
            roadType: 'primary',
            currentGpsSpeedMph: 38,
        });
        expect(apply.action).toBe('apply');
        expect(apply.statePatch.currentSpeedLimitMph).toBe(40);
        expect(apply.widgetUpdate.shownLimit).toBe(40);
    });

    test('buildSpeedLimitFetchFallbackApplyPlan caps cached 60 to edge 30', () => {
        const apply = SL.buildSpeedLimitFetchFallbackApplyPlan({
            cachedLimitMph: 60,
            valhallaSpeedLimit: 30,
            roadType: 'primary',
            currentGpsSpeedMph: 28,
        });
        expect(apply.action).toBe('apply');
        expect(apply.widgetUpdate.shownLimit).toBe(30);
        expect(apply.statePatch.currentSpeedLimitMph).toBe(30);
    });

    test('buildUpdateAllSpeedDisplaysExecutePlan refreshes widget with shown limit', () => {
        const execute = SL.buildUpdateAllSpeedDisplaysExecutePlan({
            apiSpeedLimitMph: 30,
            valhallaSpeedLimitMph: 70,
            roadType: 'motorway',
            region: 'uk',
            gpsSpeedMph: 45,
            speedUnit: 'mph',
        });
        expect(execute.shouldUpdateWidget).toBe(true);
        expect(execute.shownLimitMph).toBe(30);
        expect(execute.logMessage).toContain('mph');
    });
});

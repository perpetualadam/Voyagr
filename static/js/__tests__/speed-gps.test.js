/**
 * Behaviour tests for modules/navigation/speed-gps.js
 */
const SG = require('../modules/navigation/speed-gps.js');

const STEPS = [
    { begin_shape_index: 0, street_names: ['Start Road'] },
    { begin_shape_index: 40, street_names: ['Middle Lane'] },
    { begin_shape_index: 120, street_names: ['End Street'] },
];

describe('speed-gps module surface', () => {
    test('exposes the expected pure functions', () => {
        expect(typeof SG.rejectGpsSpeedSpikeMph).toBe('function');
        expect(typeof SG.normalizeGeolocationSpeedToMph).toBe('function');
        expect(typeof SG.mphToDisplaySpeed).toBe('function');
        expect(typeof SG.normalizeManeuverSpeedLimitMph).toBe('function');
        expect(typeof SG.getManeuverStreetLabel).toBe('function');
        expect(typeof SG.computeSnapBlendWeight).toBe('function');
        expect(typeof SG.stepSmoothGpsSpeedMph).toBe('function');
        expect(typeof SG.getActiveRouteManeuverIndex).toBe('function');
        expect(typeof SG.advanceSnappedRouteIndex).toBe('function');
        expect(typeof SG.buildBetweenTurnDisplay).toBe('function');
        expect(typeof SG.estimateDisplacementSpeedMph).toBe('function');
    });
});

describe('rejectGpsSpeedSpikeMph', () => {
    test('holds previous value on 0 -> 145 mph glitch from standstill', () => {
        expect(SG.rejectGpsSpeedSpikeMph(145, 0)).toBe(0);
    });
    test('allows gradual acceleration', () => {
        expect(SG.rejectGpsSpeedSpikeMph(35, 30)).toBe(35);
    });
});

describe('normalizeManeuverSpeedLimitMph', () => {
    test('treats 30 as mph on residential (not 19 from km/h conversion)', () => {
        expect(SG.normalizeManeuverSpeedLimitMph(30, 'residential', 28)).toBe(30);
    });
    test('converts 48 km/h to ~30 mph on motorway', () => {
        expect(SG.normalizeManeuverSpeedLimitMph(48, 'motorway', 60)).toBe(30);
    });
    test('rejects implausible motorway limit', () => {
        expect(SG.normalizeManeuverSpeedLimitMph(5, 'motorway', 65)).toBeNull();
    });
    test('does not flag 28 mph as speeding on a 30 mph residential limit', () => {
        const limit = SG.normalizeManeuverSpeedLimitMph(30, 'residential', 28);
        expect(limit).toBe(30);
        expect(28 - limit).toBeLessThanOrEqual(3);
    });
});

describe('sanitizeApiSpeedLimitMph', () => {
    test('rejects 70 mph on residential from stale API/cache', () => {
        expect(SG.sanitizeApiSpeedLimitMph(70, 'residential', 0)).toBeNull();
    });
    test('accepts 30 mph on residential', () => {
        expect(SG.sanitizeApiSpeedLimitMph(30, 'residential', 28)).toBe(30);
    });
    test('accepts 70 mph on motorway', () => {
        expect(SG.sanitizeApiSpeedLimitMph(70, 'motorway', 65)).toBe(70);
    });
});

describe('getManeuverStreetLabel', () => {
    test('prefers begin_street_names when on current road', () => {
        const m = {
            begin_street_names: ['High Street'],
            street_names: ['Market Road'],
            street_name: 'Other'
        };
        expect(SG.getManeuverStreetLabel(m, true)).toBe('High Street');
    });
    test('uses street_names for upcoming turn', () => {
        const m = {
            begin_street_names: ['High Street'],
            street_names: ['Market Road']
        };
        expect(SG.getManeuverStreetLabel(m, false)).toBe('Market Road');
    });
});

describe('getActiveRouteManeuverIndex', () => {
    test('returns maneuver for snapped vertex on current edge', () => {
        expect(SG.getActiveRouteManeuverIndex(STEPS, 55)).toBe(1);
    });
    test('returns -1 when no steps', () => {
        expect(SG.getActiveRouteManeuverIndex(null, 10)).toBe(-1);
    });
    test('returns first maneuver at route start', () => {
        expect(SG.getActiveRouteManeuverIndex(STEPS, 0)).toBe(0);
    });
});

describe('advanceSnappedRouteIndex', () => {
    test('moves forward along the polyline', () => {
        expect(SG.advanceSnappedRouteIndex(50, 40, 30)).toBe(50);
    });
    test('does not jump backward while driving', () => {
        expect(SG.advanceSnappedRouteIndex(30, 50, 35)).toBe(50);
    });
    test('allows backward index when nearly stopped', () => {
        expect(SG.advanceSnappedRouteIndex(30, 50, 1)).toBe(30);
    });
});

describe('buildBetweenTurnDisplay', () => {
    test('shows current road from begin_street_names after reroute-style context', () => {
        const m = {
            begin_street_names: ['New Cut'],
            street_names: ['Old Harbour Road']
        };
        const d = SG.buildBetweenTurnDisplay(m, 1, 'Stale Name');
        expect(d).not.toBeNull();
        expect(d.streetName).toBe('New Cut');
        expect(d.direction).toBe('straight');
        expect(d.instruction).toBe('Continue');
    });
    test('falls back to reverse-geocoded road name', () => {
        const d = SG.buildBetweenTurnDisplay(null, -1, 'Victoria Street');
        expect(d.streetName).toBe('Victoria Street');
    });
    test('returns null when no street is known', () => {
        expect(SG.buildBetweenTurnDisplay(null, -1, '')).toBeNull();
    });
});

describe('displacementNoiseFloorMeters', () => {
    test('high floor when device claims stopped and no movement history', () => {
        expect(SG.displacementNoiseFloorMeters(true, 0, 12)).toBe(12);
    });
    test('lower floor after repeated displacement movement', () => {
        expect(SG.displacementNoiseFloorMeters(true, 3, 20)).toBeGreaterThanOrEqual(4);
        expect(SG.displacementNoiseFloorMeters(true, 3, 20)).toBeLessThan(20);
    });
});

describe('estimateDisplacementSpeedMph', () => {
    test('returns null below noise floor when device reports stopped', () => {
        expect(SG.estimateDisplacementSpeedMph({
            distM: 5,
            dtSec: 1,
            prevPickMph: 0,
            accAvg: 12,
            deviceReportsStopped: true,
            consecutiveDisplacementMoves: 0
        })).toBeNull();
    });
    test('estimates speed when movement exceeds noise floor', () => {
        const mph = SG.estimateDisplacementSpeedMph({
            distM: 30,
            dtSec: 2,
            prevPickMph: 0,
            accAvg: 12,
            deviceReportsStopped: true,
            consecutiveDisplacementMoves: 3
        });
        expect(mph).toBeGreaterThan(20);
        expect(mph).toBeLessThan(45);
    });
    test('rejects 145 mph displacement glitch from standstill', () => {
        const mph = SG.estimateDisplacementSpeedMph({
            distM: 200,
            dtSec: 1,
            prevPickMph: 0,
            accAvg: 10,
            deviceReportsStopped: false,
            consecutiveDisplacementMoves: 0
        });
        expect(mph).toBe(0);
    });
});

describe('computeSnapBlendWeight', () => {
    test('full snap when within lock radius', () => {
        const r = SG.computeSnapBlendWeight({ distSnap: 10, snapLockMeters: 50, prevWeightState: 0 });
        expect(r.effectiveBlend).toBeGreaterThan(0.3);
    });
    test('hysteresis keeps blend higher when previously snapped', () => {
        const cold = SG.computeSnapBlendWeight({ distSnap: 55, snapLockMeters: 50, prevWeightState: 0 });
        const warm = SG.computeSnapBlendWeight({ distSnap: 55, snapLockMeters: 50, prevWeightState: 0.9 });
        expect(warm.effectiveBlend).toBeGreaterThan(cold.effectiveBlend);
    });
});

describe('smoothDisplayCoordinate', () => {
    test('returns target on first sample', () => {
        expect(SG.smoothDisplayCoordinate(null, 51.5, 0)).toBe(51.5);
    });
    test('moves faster toward target on urgent follow jump', () => {
        const gentle = SG.smoothDisplayCoordinate(51.0, 51.5, 10);
        const urgent = SG.smoothDisplayCoordinate(51.0, 51.5, 80);
        expect(Math.abs(urgent - 51.5)).toBeLessThan(Math.abs(gentle - 51.5));
    });
});

describe('stepSmoothGpsSpeedMph', () => {
    test('wakes quickly from standstill when raw speed exceeds threshold', () => {
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 0, initAt: 1000 }, 25, 2000);
        expect(r.value).toBe(25);
    });
    test('dead-band returns zero for noise', () => {
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 0, initAt: 1000 }, 0.3, 2000);
        expect(r.value).toBe(0);
    });

    test('resets to the raw value when the init window has elapsed', () => {
        // moving (smoothed >= dead band), fix well past INIT_RESET_MS (5000)
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 20, initAt: 1000 }, 30, 7000);
        expect(r.value).toBe(30);
        expect(r.state.smoothedMph).toBe(30);
    });

    test('resets to the raw value when there is no prior init timestamp', () => {
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 20, initAt: 0 }, 28, 2000);
        expect(r.value).toBe(28);
    });

    test('a very large jump decays gradually instead of snapping fully', () => {
        // delta 60 >= LARGE_JUMP_MPH(55): smoothed = 0.8*10 + 0.2*70 = 22
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 10, initAt: 1000 }, 70, 2000);
        expect(r.value).toBeCloseTo(22, 5);
    });

    test('a medium jump snaps to the raw value', () => {
        // delta 10 in [SNAP_DELTA_MPH(8), LARGE_JUMP_MPH(55)) -> snap
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 10, initAt: 1000 }, 20, 2000);
        expect(r.value).toBe(20);
    });

    test('a small delta is EMA-smoothed', () => {
        // delta 3 < SNAP_DELTA_MPH: smoothed = 0.55*10 + 0.45*13 = 11.35
        const r = SG.stepSmoothGpsSpeedMph({ smoothedMph: 10, initAt: 1000 }, 13, 2000);
        expect(r.value).toBeCloseTo(11.35, 5);
    });
});

describe('stepPickRawSpeedMph', () => {
    const emptyState = () => ({ lastGoodRawPickMph: 0, consecutiveDisplacementMoves: 0 });

    test('exposes the function', () => {
        expect(typeof SG.stepPickRawSpeedMph).toBe('function');
    });

    test('returns 0 with no data', () => {
        const r = SG.stepPickRawSpeedMph(emptyState(), null, [], null);
        expect(r.value).toBe(0);
        expect(r.state.lastGoodRawPickMph).toBe(0);
    });

    test('trusts a valid device coords.speed (m/s) directly', () => {
        // 20 m/s ≈ 44.7 mph
        const r = SG.stepPickRawSpeedMph(emptyState(), 20, [], null);
        expect(r.value).toBeGreaterThan(40);
        expect(r.value).toBeLessThan(55);
        expect(r.state.lastGoodRawPickMph).toBe(r.value);
    });

    test('returns 0 when device explicitly reports stopped', () => {
        const r = SG.stepPickRawSpeedMph(emptyState(), 0, [], null);
        expect(r.value).toBe(0);
    });

    test('derives speed from two close history fixes (normal driving ~35 mph)', () => {
        const now = Date.now();
        // ~11 m apart in 0.7 s ≈ 15.7 m/s ≈ 35 mph — plausible urban driving
        const hist = [
            { lat: 51.5000, lon: -0.1000, timestamp: now - 700 },
            { lat: 51.5001, lon: -0.1000, timestamp: now },
        ];
        const r = SG.stepPickRawSpeedMph(emptyState(), null, hist, null);
        expect(r.value).toBeGreaterThan(20);
        expect(r.value).toBeLessThan(60);
        expect(r.state.consecutiveDisplacementMoves).toBeGreaterThanOrEqual(1);
    });

    test('caps at MAX_DISPLAY_GPS_SPEED_MPH', () => {
        // Unrealistically fast coords.speed (1000 m/s → 2237 mph) must be capped
        const r = SG.stepPickRawSpeedMph(emptyState(), 1000, [], null);
        expect(r.value).toBeLessThanOrEqual(SG.DEFAULTS.MAX_DISPLAY_GPS_SPEED_MPH);
    });

    test('state threads through successive calls', () => {
        const r1 = SG.stepPickRawSpeedMph(emptyState(), 20, [], null);
        const r2 = SG.stepPickRawSpeedMph(r1.state, 22, [], null);
        expect(r2.state.lastGoodRawPickMph).toBeGreaterThan(0);
    });
});

describe('normalizeGeolocationSpeedToMph', () => {
    test('m/s to mph at highway speed (~60 mph)', () => {
        const mps = 60 / SG.DEFAULTS.MS_TO_MPH;
        expect(Math.round(SG.metersPerSecondToMph(mps))).toBe(60);
    });

    test('km/h misreported in coords.speed (~96.6) normalizes to ~60 mph', () => {
        const mph = SG.normalizeGeolocationSpeedToMph(96.56, null);
        expect(Math.round(mph)).toBe(60);
    });

    test('ambiguous raw value picks interpretation closest to derived hint', () => {
        const mph = SG.normalizeGeolocationSpeedToMph(43, 27);
        expect(Math.round(mph)).toBe(27);
    });
});

describe('mphToDisplaySpeed', () => {
    test('display mph when user prefers mph', () => {
        expect(Math.round(SG.mphToDisplaySpeed(60, 'mph'))).toBe(60);
        expect(SG.speedUnitLabel('mph')).toBe('mph');
    });

    test('display km/h when user prefers kmh / km/h', () => {
        expect(Math.round(SG.mphToDisplaySpeed(60, 'kmh'))).toBe(97);
        expect(Math.round(SG.mphToDisplaySpeed(60, 'km/h'))).toBe(97);
        expect(SG.speedUnitLabel('km/h')).toBe('km/h');
    });
});

describe('accumulateNavOdometerSegment', () => {
    const dist = (a, b, c, d) => Math.sqrt((c - a) ** 2 + (d - b) ** 2) * 111000;

    test('accumulates plausible movement and advances anchor', () => {
        const first = SG.accumulateNavOdometerSegment(null, 51.5, -0.1, 1000, dist);
        expect(first.traveledMeters).toBe(0);
        const second = SG.accumulateNavOdometerSegment(first, 51.5003, -0.1, 2000, dist);
        expect(second.traveledMeters).toBeGreaterThan(0);
        expect(second.lastGeo.lat).toBe(51.5003);
    });

    test('rejects teleport-scale jumps', () => {
        const first = SG.accumulateNavOdometerSegment(null, 51.5, -0.1, 1000, dist);
        const second = SG.accumulateNavOdometerSegment(first, 52.5, -0.1, 2000, dist);
        expect(second.traveledMeters).toBe(0);
    });
});

describe('resolveGpsHeadingDegrees', () => {
    test('prefers device compass when moving', () => {
        expect(SG.resolveGpsHeadingDegrees({ deviceHeading: 90, speed: 5 })).toBe(90);
    });

    test('derives heading from recent tracking history motion vector', () => {
        const heading = SG.resolveGpsHeadingDegrees({
            speed: 0,
            trackingHistory: [
                { lat: 51.50, lon: -0.10 },
                { lat: 51.50, lon: -0.09 },
            ],
            calculateDistanceMeters: () => 100,
        });
        expect(heading).toBeGreaterThan(80);
        expect(heading).toBeLessThan(100);
    });
});

describe('computeFollowJumpMeters', () => {
    test('returns max of follow-center and smooth-position deltas', () => {
        const jump = SG.computeFollowJumpMeters({
            displayLat: 51.51,
            displayLon: -0.1,
            smoothDisplayLat: 51.50,
            smoothDisplayLon: -0.1,
            lastFollowCenterGeo: { lat: 51.49, lon: -0.1 },
            calculateDistanceMeters: (a, b, c, d) => Math.abs(c - a) * 111000,
        });
        expect(jump).toBeGreaterThan(1000);
    });
});

describe('buildSnappedVehicleDisplayPlan', () => {
    const bearing = (_lat1, _lon1, lat2, _lon2) => (lat2 > 51.5 ? 90 : 0);

    test('returns raw position when snap result missing', () => {
        const plan = SG.buildSnappedVehicleDisplayPlan({
            lat: 51.5,
            lon: -0.1,
            gpsHeadingForBlend: 45,
            lastSnappedRouteIndex: 0,
            speedMph: 30,
        });
        expect(plan.displayLat).toBe(51.5);
        expect(plan.heading).toBe(45);
    });

    test('blends toward snapped point and advances route index when near route', () => {
        const plan = SG.buildSnappedVehicleDisplayPlan({
            lat: 51.5001,
            lon: -0.1001,
            accuracy: 10,
            snapped: { lat: 51.5002, lon: -0.1002, index: 2, distance: 20 },
            routePolyline: [[51.5, -0.1], [51.501, -0.101], [51.502, -0.102]],
            gpsHeadingForBlend: 10,
            lastSnappedRouteIndex: 1,
            speedMph: 30,
            prevSnapBlendWeightState: 0,
            calculateBearing: bearing,
            blendHeadingsCircular: (gps, route, blend) => gps + (route - gps) * blend,
        });
        expect(plan.displayLat).toBeGreaterThan(51.5001);
        expect(plan.lastSnappedRouteIndex).toBeGreaterThanOrEqual(2);
        expect(plan.snapBlendWeightState).toBeGreaterThan(0);
    });
});

describe('GPS sample normalization and tracking history', () => {
    test('normalizeGeolocationCoordsSample maps coords and clamps invalid speed', () => {
        const sample = SG.normalizeGeolocationCoordsSample({
            latitude: 51.5,
            longitude: -0.1,
            accuracy: 12,
            speed: 5.5,
            heading: 180,
        });
        expect(sample.lat).toBe(51.5);
        expect(sample.lon).toBe(-0.1);
        expect(sample.speedMs).toBe(5.5);
        expect(sample.deviceSpeedMs).toBe(5.5);
        expect(sample.deviceHeading).toBe(180);

        const invalid = SG.normalizeGeolocationCoordsSample({
            latitude: 51.5,
            longitude: -0.1,
            speed: -1,
            heading: NaN,
        });
        expect(invalid.speedMs).toBe(0);
        expect(invalid.deviceSpeedMs).toBeNull();
        expect(invalid.deviceHeading).toBeNull();
    });

    test('buildTrackingHistoryAppendPlan trims to max length', () => {
        const history = Array.from({ length: 40 }, (_, i) => ({ lat: i, lon: i }));
        const plan = SG.buildTrackingHistoryAppendPlan(history, { lat: 99, lon: 99 }, 40);
        expect(plan.history).toHaveLength(40);
        expect(plan.history[39]).toEqual({ lat: 99, lon: 99 });
        expect(plan.history[0].lat).toBe(1);
    });
});

describe('buildGpsCoordSampleTickPlan', () => {
    const dist = (a, b, c, d) => Math.sqrt((c - a) ** 2 + (d - b) ** 2) * 111000;

    test('appends history, picks raw speed, and accumulates odometer during navigation', () => {
        const tick = SG.buildGpsCoordSampleTickPlan({
            sample: {
                lat: 51.5,
                lon: -0.1,
                accuracy: 10,
                speedMs: 5,
                deviceSpeedMs: 5,
                deviceHeading: null,
            },
            trackingHistory: [{ lat: 51.499, lon: -0.1, timestamp: new Date(1000), speed: 4, accuracy: 10 }],
            pickRawSpeedState: { lastGoodRawPickMph: 0, consecutiveDisplacementMoves: 0 },
            routeInProgress: true,
            odometerState: { lastGeo: { lat: 51.499, lon: -0.1, t: 1000 }, traveledMeters: 100 },
            nowMs: 3000,
            calculateDistanceMeters: dist,
        });
        expect(tick.lat).toBe(51.5);
        expect(tick.speedMph).toBeGreaterThan(0);
        expect(tick.statePatch.trackingHistory).toHaveLength(2);
        expect(tick.statePatch.odometer.traveledMeters).toBeGreaterThan(100);
        expect(tick.statePatch.pickRawSpeedState.lastGoodRawPickMph).toBe(tick.speedMph);
    });

    test('skips odometer when route is not in progress', () => {
        const tick = SG.buildGpsCoordSampleTickPlan({
            sample: { lat: 51.5, lon: -0.1, accuracy: 10, speedMs: 0, deviceSpeedMs: null, deviceHeading: null },
            trackingHistory: [],
            pickRawSpeedState: { lastGoodRawPickMph: 0, consecutiveDisplacementMoves: 0 },
            routeInProgress: false,
            nowMs: 2000,
        });
        expect(tick.statePatch.odometer).toBeNull();
    });
});

describe('buildGpsCoordSampleStateApplyPlan', () => {
    test('maps coord tick to apply outputs and state patch', () => {
        const tick = {
            lat: 51.5,
            lon: -0.1,
            accuracy: 8,
            speed: 3,
            deviceHeading: 45,
            speedMph: 12,
            statePatch: {
                trackingHistory: [{ lat: 51.5, lon: -0.1 }],
                pickRawSpeedState: { lastGoodRawPickMph: 12, consecutiveDisplacementMoves: 1 },
                currentLat: 51.5,
                currentLon: -0.1,
                odometer: null,
            },
        };
        const apply = SG.buildGpsCoordSampleStateApplyPlan(tick);
        expect(apply.action).toBe('apply');
        expect(apply.speedMph).toBe(12);
        expect(apply.statePatch.trackingHistory).toHaveLength(1);
    });

    test('returns skip when tick is missing', () => {
        expect(SG.buildGpsCoordSampleStateApplyPlan(null).action).toBe('skip');
    });
});

describe('navigation vehicle marker position', () => {
    test('buildNavigationVehicleMarkerPositionPlan smooths snapped display coords', () => {
        const plan = SG.buildNavigationVehicleMarkerPositionPlan({
            lat: 51.5,
            lon: -0.1,
            routeInProgress: true,
            routePolyline: [[51.5, -0.1], [51.501, -0.101]],
            snapped: { lat: 51.5005, lon: -0.1005, index: 0, distance: 30 },
            gpsHeadingForBlend: 90,
            speedMph: 20,
            smoothDisplayLat: 51.499,
            smoothDisplayLon: -0.099,
            followJumpM: 50,
            calculateBearing: () => 90,
            blendHeadingsCircular: (g, r, b) => g + (r - g) * b,
        });
        expect(plan.markerLat).toBeGreaterThan(51.499);
        expect(plan.markerLon).toBeLessThan(-0.099);
        expect(plan.heading).toBeGreaterThanOrEqual(0);
    });

    test('computeVehicleMarkerRotationDeg compensates for map bearing', () => {
        expect(SG.computeVehicleMarkerRotationDeg(90, 45)).toBe(45);
        expect(SG.computeVehicleMarkerRotationDeg(10, 0)).toBe(10);
    });
});

describe('buildNavSpeedLimitTickPlan', () => {
    test('resolves road type and shown limit from maneuver hint', () => {
        const plan = SG.buildNavSpeedLimitTickPlan({
            routeInProgress: true,
            isTrackingActive: true,
            routePolyline: [[51.5, -0.1], [51.6, -0.2]],
            currentRouteSteps: [{
                speed_limit: 30,
                road_class: 'residential',
            }],
            lastSnappedRouteIndex: 0,
            displaySpeedMph: 25,
            currentSpeedLimitMph: null,
            lastSpeedLimitRegion: null,
            lastActiveManeuverIdx: -1,
            resolveRoadType: () => 'residential',
            pickDisplaySpeedLimitMph: (_api, val) => val,
        });
        expect(plan.roadType).toBe('residential');
        expect(plan.valhallaSpeedLimitMph).toBe(30);
        expect(plan.shownLimit).toBe(30);
        expect(plan.resetFetchState).toBe(true);
    });

    test('drops implausible Valhalla limit for current road type', () => {
        const plan = SG.buildNavSpeedLimitTickPlan({
            routeInProgress: true,
            isTrackingActive: true,
            routePolyline: [[51.5, -0.1], [51.6, -0.2]],
            currentRouteSteps: [{ speed_limit: 70, road_class: 'motorway' }],
            lastSnappedRouteIndex: 0,
            displaySpeedMph: 20,
            lastActiveManeuverIdx: 0,
            resolveRoadType: () => 'residential',
            pickDisplaySpeedLimitMph: (_api, val) => val,
        });
        expect(plan.valhallaSpeedLimitMph).toBeNull();
    });
});

describe('buildGpsTrackingPositionTickPlan', () => {
    test('returns marker position and state patch from snapped route', () => {
        const tick = SG.buildGpsTrackingPositionTickPlan({
            lat: 51.5,
            lon: -0.1,
            routeInProgress: true,
            routePolyline: [[51.5, -0.1], [51.501, -0.101]],
            snapped: { lat: 51.5005, lon: -0.1005, index: 0, distance: 30 },
            speedMph: 25,
            resolveGpsHeading: () => 90,
            calculateBearing: () => 90,
            blendHeadingsCircular: (g, r, b) => g + (r - g) * b,
        });
        expect(tick.markerLat).toBeGreaterThan(51.5);
        expect(tick.heading).toBeGreaterThanOrEqual(0);
        expect(tick.statePatch.lastSnappedRouteIndex).toBeGreaterThanOrEqual(0);
    });
});

describe('buildGpsPositionTickPlan', () => {
    test('assembles position apply and speed-limit plans', () => {
        const plans = SG.buildGpsPositionTickPlan({
            lat: 51.5,
            lon: -0.1,
            accuracy: 10,
            routeInProgress: true,
            routePolyline: [[51.5, -0.1], [51.501, -0.101]],
            snapped: { lat: 51.5005, lon: -0.1005, index: 0, distance: 30 },
            lastSnappedRouteIndex: 0,
            prevSnapBlendWeightState: 0,
            speedMph: 25,
            smoothDisplayLat: 51.499,
            smoothDisplayLon: -0.099,
            resolveGpsHeading: () => 90,
            calculateBearing: () => 90,
            blendHeadingsCircular: (g, r, b) => g + (r - g) * b,
            isTrackingActive: true,
            currentRouteSteps: [{ begin_shape_index: 0, road_class: 'primary' }],
            displaySpeedMph: 24,
            currentSpeedLimitMph: 30,
            lastSpeedLimitRegion: 'gb',
            lastActiveManeuverIdx: 0,
            resolveRoadType: () => 'primary',
            pickDisplaySpeedLimitMph: (api, val) => val || api,
        });
        expect(plans.posApply.action).toBe('apply');
        expect(plans.posApply.markerLat).toBeGreaterThan(51.4);
        expect(plans.speedLimitPlan.showWidget).toBe(true);
        expect(plans.speedLimitPlan.roadType).toBe('primary');
    });
});

describe('buildGpsPositionStateApplyPlan', () => {
    test('maps position tick to marker outputs and state patch', () => {
        const posTick = SG.buildGpsTrackingPositionTickPlan({
            lat: 51.5,
            lon: -0.1,
            routeInProgress: true,
            routePolyline: [[51.5, -0.1], [51.501, -0.101]],
            snapped: { lat: 51.5005, lon: -0.1005, index: 0, distance: 30 },
            speedMph: 25,
            resolveGpsHeading: () => 90,
            calculateBearing: () => 90,
            blendHeadingsCircular: (g, r, b) => g + (r - g) * b,
        });
        const apply = SG.buildGpsPositionStateApplyPlan(posTick, { lat: 51.5, lon: -0.1 });
        expect(apply.action).toBe('apply');
        expect(apply.markerLat).toBe(posTick.markerLat);
        expect(apply.statePatch.lastSnappedRouteIndex).toBeGreaterThanOrEqual(0);
    });

    test('seeds smooth display coords when position tick is unavailable', () => {
        const apply = SG.buildGpsPositionStateApplyPlan(null, {
            lat: 51.5,
            lon: -0.1,
            smoothDisplayLat: null,
            smoothDisplayLon: null,
        });
        expect(apply.markerLat).toBe(51.5);
        expect(apply.statePatch.smoothDisplayLat).toBe(51.5);
        expect(apply.followJumpM).toBe(Number.POSITIVE_INFINITY);
    });
});

describe('buildVehicleMarkerTickPlan', () => {
    test('updates existing marker with rotation and lngLat', () => {
        const plan = SG.buildVehicleMarkerTickPlan({
            hasMarker: true,
            canSetLngLat: true,
            markerLat: 51.5,
            markerLon: -0.1,
            heading: 90,
            speed: 5,
            accuracy: 10,
            mapBearing: 45,
        });
        expect(plan.action).toBe('update');
        expect(plan.lngLat).toEqual([-0.1, 51.5]);
        expect(plan.rotationDeg).toBe(45);
    });

    test('creates marker when none exists', () => {
        const plan = SG.buildVehicleMarkerTickPlan({
            hasMarker: false,
            markerLat: 51.5,
            markerLon: -0.1,
            heading: 180,
            speed: 0,
            accuracy: 15,
        });
        expect(plan.action).toBe('create');
        expect(plan.lat).toBe(51.5);
        expect(plan.lon).toBe(-0.1);
    });
});

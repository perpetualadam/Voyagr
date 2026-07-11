/**
 * Tests for modules/navigation/road-name-display.js
 */
const RN = require('../modules/navigation/road-name-display.js');

describe('road-name-display module', () => {
    test('shouldFetchRoadName respects interval and distance thresholds', () => {
        expect(RN.shouldFetchRoadName({
            now: 10000,
            lastFetch: 0,
            lastPosition: null,
            distanceMovedMeters: 0,
        })).toBe(true);

        expect(RN.shouldFetchRoadName({
            now: 2000,
            lastFetch: 0,
            lastPosition: null,
            distanceMovedMeters: 0,
        })).toBe(false);

        expect(RN.shouldFetchRoadName({
            now: 10000,
            lastFetch: 1000,
            lastPosition: { lat: 1, lon: 1 },
            distanceMovedMeters: 10,
        })).toBe(false);
    });

    test('buildRoadInfoApiUrl encodes coordinates', () => {
        expect(RN.buildRoadInfoApiUrl(51.5, -0.12)).toBe('/api/road-info?lat=51.5&lon=-0.12');
    });

    test('road name bar show/hide plans', () => {
        expect(RN.getRoadNameBarShowPlan('High Street')).toEqual({
            roadName: 'High Street',
            barDisplay: 'block',
        });
        expect(RN.getRoadNameBarHidePlan()).toEqual({
            roadName: '',
            barDisplay: 'none',
        });
    });

    test('buildRoadNameFetchTickPlan throttles and builds fetch plan', () => {
        expect(RN.buildRoadNameFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            now: 2000,
            lastFetch: 0,
            lastPosition: null,
            calculateDistance: () => 0,
        }).action).toBe('skip');

        const tick = RN.buildRoadNameFetchTickPlan({
            lat: 51.5,
            lon: -0.1,
            now: 10000,
            lastFetch: 0,
            lastPosition: null,
            calculateDistance: () => 0,
        });
        expect(tick.action).toBe('fetch');
        expect(tick.url).toBe('/api/road-info?lat=51.5&lon=-0.1');
        expect(tick.statePatch.lastPosition).toEqual({ lat: 51.5, lon: -0.1 });
    });

    test('buildRoadNameFetchStateApplyPlan maps fetch tick to apply', () => {
        const apply = RN.buildRoadNameFetchStateApplyPlan({
            action: 'fetch',
            url: '/api/road-info?lat=1&lon=2',
            statePatch: { lastFetch: 5000, lastPosition: { lat: 1, lon: 2 } },
        });
        expect(apply.action).toBe('apply');
        expect(apply.fetch.url).toBe('/api/road-info?lat=1&lon=2');
        expect(apply.statePatch.lastFetch).toBe(5000);
    });

    test('buildRoadNameApiResponseDomApplyPlan maps successful API payload', () => {
        const apply = RN.buildRoadNameApiResponseDomApplyPlan({
            success: true,
            road_name: 'Main Road',
        });
        expect(apply.action).toBe('apply');
        expect(apply.roadName).toBe('Main Road');
        expect(apply.barDisplay).toBe('block');
        expect(apply.statePatch.currentRoadDisplayName).toBe('Main Road');
        expect(RN.buildRoadNameApiResponseDomApplyPlan({ success: false }).action).toBe('skip');
    });
});

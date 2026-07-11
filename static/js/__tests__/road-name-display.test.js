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
});

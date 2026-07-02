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

    test('formatSpeedForWidget converts mph to km/h display', () => {
        const mph = SL.formatSpeedForWidget(60, 'mph', SG);
        expect(mph.value).toBe(60);
        expect(mph.unitLabel).toBe('mph');
        const kmh = SL.formatSpeedForWidget(60, 'kmh', SG);
        expect(kmh.unitLabel).toBe('km/h');
        expect(kmh.value).toBeGreaterThan(95);
    });
});

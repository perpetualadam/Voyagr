/**
 * Tests for modules/navigation/multimodal-parking.js
 */
const MP = require('../modules/navigation/multimodal-parking.js');

describe('multimodal-parking module', () => {
    test('computeMultimodalLegTotals sums driving and walking legs', () => {
        const totals = MP.computeMultimodalLegTotals(
            { distance_km: 5, duration_minutes: 12 },
            { distance_km: 0.8, duration_minutes: 10 }
        );
        expect(totals.totalDistKm).toBe(5.8);
        expect(totals.totalTimeMin).toBe(22);
        expect(totals.drivingDistKm).toBe(5);
        expect(totals.walkingTimeMin).toBe(10);
    });

    test('buildParkingRouteLabel formats start → parking → end', () => {
        expect(MP.buildParkingRouteLabel('Home', 'City Centre', 'Office'))
            .toBe('Home → 🅿️ City Centre → Office');
    });

    test('buildParkingBreakdownHtml includes both legs', () => {
        const html = MP.buildParkingBreakdownHtml({
            drivingDistDisplay: '3.10',
            drivingTimeMin: 8,
            walkingDistDisplay: '0.50',
            walkingTimeMin: 6,
            distUnit: 'mi',
        });
        expect(html).toContain('🚗 Driving');
        expect(html).toContain('3.10 mi');
        expect(html).toContain('🚶 Walking');
        expect(html).toContain('6 min');
    });
});

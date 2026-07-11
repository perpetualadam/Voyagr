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

    test('computeWalkingMinutesFromMeters estimates at least one minute', () => {
        expect(MP.computeWalkingMinutesFromMeters(0)).toBe(1);
        expect(MP.computeWalkingMinutesFromMeters(420)).toBe(5);
    });

    test('buildParkingOptionItemHtml includes distance and action buttons', () => {
        const html = MP.buildParkingOptionItemHtml(
            { name: 'City Car Park', distance_m: 420 },
            0,
            { distanceText: '0.26', distUnit: 'mi' }
        );
        expect(html).toContain('City Car Park');
        expect(html).toContain('parking-show-route-btn');
        expect(html).toContain('parking-set-dest-btn');
        expect(html).toContain('0.26 mi');
    });

    test('buildParkingEmptyStateHtml wraps message text', () => {
        const html = MP.buildParkingEmptyStateHtml('No parking found nearby.');
        expect(html).toContain('No parking found nearby.');
        expect(html).toContain('font-size:13px');
    });

    test('buildParkingPreviewRouteHtml concatenates label and breakdown', () => {
        const html = MP.buildParkingPreviewRouteHtml('A → B', '<div>walk</div>');
        expect(html).toBe('A → B<div>walk</div>');
    });

    test('buildParkingMapMarkerHtml and popup include parking icon and distance', () => {
        expect(MP.buildParkingMapMarkerHtml()).toContain('🅿️');
        expect(MP.buildParkingMapMarkerPopupHtml('City Park', '0.3', 'mi')).toContain('City Park');
        expect(MP.buildParkingMapMarkerPopupHtml('City Park', '0.3', 'mi')).toContain('0.3 mi');
    });

    test('getParkingOptionItemContainerStyleCssText styles list row container', () => {
        expect(MP.getParkingOptionItemContainerStyleCssText()).toContain('border-radius: 6px');
        expect(MP.getParkingOptionItemContainerStyleCssText()).toContain('cursor: pointer');
        expect(MP.PARKING_OPTION_ITEM_HOVER_BACKGROUND).toBe('#FFF3E0');
    });
});

/**
 * Tests for modules/navigation/caz-info.js
 */
const CAZ = require('../modules/navigation/caz-info.js');

describe('caz-info module', () => {
    test('buildCazLoadingHtml and buildCazEmptyHtml', () => {
        expect(CAZ.buildCazLoadingHtml()).toContain('Loading CAZ zones');
        expect(CAZ.buildCazEmptyHtml()).toContain('No CAZ zones found');
    });

    test('buildCazErrorHtml includes message', () => {
        expect(CAZ.buildCazErrorHtml('Network failed')).toContain('Network failed');
    });

    test('buildCazZoneCardHtml includes charge, passes, and purchase link', () => {
        const html = CAZ.buildCazZoneCardHtml({
            name: 'Birmingham CAZ',
            daily_charge: 8,
            city: 'Birmingham',
            operating_hours: '24/7',
            operating_days: 'Mon–Sun',
            passes: { daily: 8, weekly: 45 },
            exemptions: ['electric', 'disabled'],
            purchase_url: 'https://example.com/buy',
        });
        expect(html).toContain('Birmingham CAZ');
        expect(html).toContain('£8/day');
        expect(html).toContain('daily: £8');
        expect(html).toContain('Exempt: electric, disabled');
        expect(html).toContain('Buy Pass');
    });

    test('buildCazZonesListHtml returns empty state for no zones', () => {
        expect(CAZ.buildCazZonesListHtml([])).toContain('No CAZ zones found');
    });
});

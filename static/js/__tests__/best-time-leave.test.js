/**
 * Tests for modules/navigation/best-time-leave.js
 */
const BT = require('../modules/navigation/best-time-leave.js');

describe('best-time-leave module', () => {
    test('trafficColorForLevel maps known levels', () => {
        expect(BT.trafficColorForLevel('low')).toBe('#4CAF50');
        expect(BT.trafficColorForLevel('severe')).toBe('#D32F2F');
        expect(BT.trafficColorForLevel('unknown')).toBe('#999');
    });

    test('buildBestTimeSlotRowHtml highlights best slot', () => {
        const html = BT.buildBestTimeSlotRowHtml(
            { time: '08:00', traffic_level: 'low', is_now: false },
            true,
            '#4CAF50',
            25
        );
        expect(html).toContain('08:00');
        expect(html).toContain('BEST');
        expect(html).toContain('width: 25%');
    });

    test('buildBestTimeSlotsPanelHtml includes footer and departure button', () => {
        const html = BT.buildBestTimeSlotsPanelHtml(
            [{ time: '09:00', traffic_level: 'moderate', congestion_pct: 40 }],
            { time: '09:00', is_now: false },
            { source: 'tomtom', analysed_at: '14:00' }
        );
        expect(html).toContain('tomtom');
        expect(html).toContain('Set departure to 09:00');
    });
});

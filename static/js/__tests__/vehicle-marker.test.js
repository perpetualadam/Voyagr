/**
 * Tests for modules/map/vehicle-marker.js
 */
const VM = require('../modules/map/vehicle-marker.js');

describe('vehicle-marker module', () => {
    test('buildVehicleArrowSvg returns self-contained SVG path', () => {
        const svg = VM.buildVehicleArrowSvg();
        expect(svg).toContain('<svg');
        expect(svg).toContain('#1E88E5');
        expect(svg).not.toContain('<img');
    });

    test('exported vehicle marker dimensions are ~30% larger than legacy 60px', () => {
        expect(VM.VEHICLE_MARKER_SIZE).toBe(78);
        expect(VM.VEHICLE_MARKER_ICON_SIZE).toEqual([78, 78]);
        expect(VM.VEHICLE_MARKER_ICON_ANCHOR).toEqual([39, 39]);
    });

    test('buildVehicleMarkerPopupHtml includes speed, heading, and accuracy', () => {
        const html = VM.buildVehicleMarkerPopupHtml({
            iconEmoji: '🚗',
            displaySpeed: 42,
            speedUnit: 'mph',
            headingDegrees: 90,
            accuracyLabel: '±12m',
        });
        expect(html).toContain('🚗');
        expect(html).toContain('42 mph');
        expect(html).toContain('90°');
        expect(html).toContain('±12m');
    });
});

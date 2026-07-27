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

    test('exported vehicle marker dimensions are 24px + ~30%', () => {
        expect(VM.VEHICLE_MARKER_SIZE).toBe(31);
        expect(VM.VEHICLE_MARKER_ICON_SIZE).toEqual([31, 31]);
        expect(VM.VEHICLE_MARKER_ICON_ANCHOR).toEqual([15.5, 15.5]);
    });

    test('applyVehicleMarkerElementSize sizes root and inner wrapper from one constant', () => {
        const el = document.createElement('div');
        el.innerHTML = '<div style="width:24px;height:24px"><svg></svg></div>';
        VM.applyVehicleMarkerElementSize(el);
        expect(el.style.width).toBe('31px');
        expect(el.style.height).toBe('31px');
        expect(el.style.getPropertyValue('--vehicle-marker-size')).toBe('31px');
        expect(el.querySelector('div').style.width).toBe('100%');
        expect(el.querySelector('div').style.height).toBe('100%');
        expect(el.style.getPropertyValue('--vehicle-marker-shadow-width')).toBe('21px');
    });

    test('viewBox is cropped to the ink so the delta paints at the full marker size', () => {
        // Delta fill bounds on the 0-100 design grid are x 11, y 5, w 78, h 90, and the
        // round-joined 4-unit stroke paints 2 units outside that on every edge.
        expect(VM.VEHICLE_MARKER_VIEW_BOX).toBe('9 3 82 94');
        expect(VM.buildVehicleArrowSvg()).toContain('viewBox="9 3 82 94"');
    });

    test('viewBox stays centred on 50,50 so the marker anchor sits on the GPS fix', () => {
        const [x, y, width, height] = VM.VEHICLE_MARKER_VIEW_BOX.split(' ').map(Number);
        expect(x + width / 2).toBe(50);
        expect(y + height / 2).toBe(50);
    });

    test('painted delta height matches VEHICLE_MARKER_SIZE and keeps its aspect ratio', () => {
        const painted = VM.getVehicleArrowPaintedSize(VM.VEHICLE_MARKER_SIZE);
        expect(painted.height).toBeCloseTo(31, 5);
        expect(painted.width).toBeCloseTo(31 * (82 / 94), 5);
        expect(painted.width).toBeLessThan(painted.height);
    });

    test('painted delta scales linearly with the requested marker size', () => {
        const small = VM.getVehicleArrowPaintedSize(24);
        const large = VM.getVehicleArrowPaintedSize(48);
        expect(small.height).toBeCloseTo(24, 5);
        expect(large.height).toBeCloseTo(48, 5);
        expect(large.width / small.width).toBeCloseTo(2, 5);
    });

    test('getVehicleArrowPaintedSize falls back to the exported size', () => {
        expect(VM.getVehicleArrowPaintedSize()).toEqual(
            VM.getVehicleArrowPaintedSize(VM.VEHICLE_MARKER_SIZE)
        );
        expect(VM.getVehicleArrowPaintedSize(NaN).height).toBeCloseTo(31, 5);
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

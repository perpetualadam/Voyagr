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

    test('exported marker dimensions derive from one square box', () => {
        expect(VM.VEHICLE_MARKER_SIZE).toBeCloseTo(42.37, 2);
        expect(VM.VEHICLE_MARKER_ICON_SIZE).toEqual([VM.VEHICLE_MARKER_SIZE, VM.VEHICLE_MARKER_SIZE]);
        expect(VM.VEHICLE_MARKER_ICON_ANCHOR).toEqual([
            VM.VEHICLE_MARKER_SIZE / 2,
            VM.VEHICLE_MARKER_SIZE / 2,
        ]);
    });

    test('applyVehicleMarkerElementSize sizes root and inner wrapper from one constant', () => {
        const el = document.createElement('div');
        el.innerHTML = '<div style="width:24px;height:24px"><svg></svg></div>';
        VM.applyVehicleMarkerElementSize(el);
        const expected = `${VM.VEHICLE_MARKER_SIZE}px`;
        expect(el.style.width).toBe(expected);
        expect(el.style.height).toBe(expected);
        expect(el.style.getPropertyValue('--vehicle-marker-size')).toBe(expected);
        expect(el.querySelector('div').style.width).toBe('100%');
        expect(el.querySelector('div').style.height).toBe('100%');
        expect(el.style.getPropertyValue('--vehicle-marker-shadow-width'))
            .toBe(`${VM.VEHICLE_MARKER_SHADOW_WIDTH}px`);
    });

    test('painted delta overhangs the route polyline by 10% of its width per side', () => {
        const lineWidth = VM.getNavRoutePolylineWidth();
        const painted = VM.getVehicleArrowPaintedSize(VM.VEHICLE_MARKER_SIZE);
        const overhangPerSide = (painted.width - lineWidth) / 2;

        expect(VM.VEHICLE_MARKER_POLYLINE_OVERHANG_FRACTION).toBe(0.1);
        expect(overhangPerSide / lineWidth).toBeCloseTo(0.1, 3);
        expect(painted.width).toBeCloseTo(lineWidth * 1.2, 1);
    });

    test('marker box tracks the polyline width it is sized against', () => {
        const narrow = VM.getVehicleMarkerSizeForPolylineWidth(20);
        const wide = VM.getVehicleMarkerSizeForPolylineWidth(40);
        expect(wide / narrow).toBeCloseTo(2, 2);
        expect(VM.getVehicleArrowPaintedSize(narrow).width).toBeCloseTo(24, 1);
        expect(VM.getVehicleArrowPaintedSize(wide).width).toBeCloseTo(48, 1);
    });

    test('shadow ellipse scales with the marker box', () => {
        expect(VM.VEHICLE_MARKER_SHADOW_WIDTH / VM.VEHICLE_MARKER_SIZE).toBeCloseTo(21 / 31, 3);
        expect(VM.VEHICLE_MARKER_SHADOW_HEIGHT / VM.VEHICLE_MARKER_SIZE).toBeCloseTo(4 / 31, 3);
        expect(VM.VEHICLE_MARKER_SHADOW_OFFSET / VM.VEHICLE_MARKER_SIZE).toBeCloseTo(2 / 31, 3);
        expect(VM.VEHICLE_MARKER_SHADOW_WIDTH).toBeLessThan(VM.VEHICLE_MARKER_SIZE);
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
        expect(painted.height).toBeCloseTo(VM.VEHICLE_MARKER_SIZE, 5);
        expect(painted.width).toBeCloseTo(VM.VEHICLE_MARKER_SIZE * (82 / 94), 5);
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
        expect(VM.getVehicleArrowPaintedSize(NaN).height).toBeCloseTo(VM.VEHICLE_MARKER_SIZE, 5);
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

describe('vehicle marker sizing against the real route polyline', () => {
    let Helpers;
    let RouteSelection;
    let Live;

    beforeAll(() => {
        jest.resetModules();
        require('../maplibre-helpers.js');
        Helpers = global.window.MapLibreHelpers;
        RouteSelection = require('../modules/navigation/route-selection.js');
        global.VoyagrRouteSelection = RouteSelection;
        global.window.VoyagrRouteSelection = RouteSelection;
        Live = require('../modules/map/vehicle-marker.js');
    });

    afterAll(() => {
        delete global.VoyagrRouteSelection;
        delete global.window.VoyagrRouteSelection;
        jest.resetModules();
    });

    test('reads the active nav route casing width from the real modules', () => {
        const casing = RouteSelection.buildNavActiveRoutePolylineStyle().outlineWeight;
        expect(Live.getNavRoutePolylineWidth())
            .toBeCloseTo(casing * Helpers.POLYLINE_LINE_WIDTH_SCALE, 5);
    });

    test('standalone fallbacks agree with the live polyline config', () => {
        // VM was loaded without MapLibreHelpers/VoyagrRouteSelection present, so an equal
        // size proves the fallback literals still mirror the real route line.
        expect(Live.VEHICLE_MARKER_SIZE).toBeCloseTo(VM.VEHICLE_MARKER_SIZE, 2);
    });

    test('delta overhangs the real rendered route line by 10% per side', () => {
        const lineWidth = Live.getNavRoutePolylineWidth();
        const painted = Live.getVehicleArrowPaintedSize(Live.VEHICLE_MARKER_SIZE);
        expect((painted.width - lineWidth) / 2 / lineWidth).toBeCloseTo(0.1, 3);
    });

    test('polyline width matches what buildZoomScaledLineWidth paints at navigation zooms', () => {
        const casing = RouteSelection.buildNavActiveRoutePolylineStyle().outlineWeight;
        const expr = Helpers.buildZoomScaledLineWidth(casing);
        const stops = {};
        for (let i = 3; i < expr.length; i += 2) stops[expr[i]] = expr[i + 1];
        // z12-z17 all hold the base width, and that is the width the marker is sized to.
        expect(stops[12]).toBeCloseTo(Live.getNavRoutePolylineWidth(), 5);
        expect(stops[15]).toBeCloseTo(Live.getNavRoutePolylineWidth(), 5);
        expect(stops[17]).toBeCloseTo(Live.getNavRoutePolylineWidth(), 5);
    });
});

/**
 * Tests for modules/map/camera-map-markers.js
 */
const CAM = require('../modules/map/camera-map-markers.js');

describe('camera-map-markers module', () => {
    const config = {
        bgColor: '#fff3e0',
        color: '#e65100',
        label: 'Speed camera',
        svg: '<svg width="20" height="20"></svg>',
    };

    test('scaleHazardMarkerSvg resizes default hazard SVG dimensions', () => {
        const scaled = CAM.scaleHazardMarkerSvg(config.svg, 24, 24);
        expect(scaled).toContain('width="24"');
        expect(scaled).toContain('height="24"');
    });

    test('buildCameraMarkerHtml wraps SVG with marker styling', () => {
        const html = CAM.buildCameraMarkerHtml(config, '<svg></svg>');
        expect(html).toContain('26px');
        expect(html).toContain(config.bgColor);
        expect(html).toContain('<svg></svg>');
    });

    test('buildCameraMarkerPopupHtml includes label and optional description', () => {
        const html = CAM.buildCameraMarkerPopupHtml(config, '<svg></svg>', 'A40 westbound');
        expect(html).toContain('Speed camera');
        expect(html).toContain('A40 westbound');
    });

    test('exported camera marker dimensions are ~20% smaller', () => {
        expect(CAM.CAMERA_MARKER_ICON_SIZE).toEqual([26, 26]);
        expect(CAM.CAMERA_MARKER_ICON_ANCHOR).toEqual([13, 13]);
        expect(CAM.CAMERA_HAZARD_MARKER_ICON_SIZE).toEqual([22, 22]);
    });

    test('buildCameraMarkersMountSpecs resolves style and builds marker specs', () => {
        const styleMap = {
            camera_speed: config,
        };
        const specs = CAM.buildCameraMarkersMountSpecs([
            { lat: 51.5, lon: -0.1, bucket: 'camera_speed', description: 'M1' },
        ], styleMap, {
            normalizeBucket: (b) => b,
            markerClassName: 'camera-marker',
            markerSvgSize: 16,
            popupSvgSize: 19,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
        });
        expect(specs).toHaveLength(1);
        expect(specs[0].lat).toBe(51.5);
        expect(specs[0].html).toContain('26px');
        expect(specs[0].popup).toContain('M1');
    });
});

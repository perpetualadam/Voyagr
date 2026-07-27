/**
 * @file Pure vehicle position marker SVG and popup HTML (no DOM, no MapLibre).
 * @module modules/map/vehicle-marker
 */
(function (root) {
    'use strict';

    /** Painted height of the vehicle delta in CSS pixels (24px + ~30%). */
    var VEHICLE_MARKER_SIZE = 31;
    var VEHICLE_MARKER_ICON_SIZE = [VEHICLE_MARKER_SIZE, VEHICLE_MARKER_SIZE];
    var VEHICLE_MARKER_ICON_ANCHOR = [VEHICLE_MARKER_SIZE / 2, VEHICLE_MARKER_SIZE / 2];
    var VEHICLE_MARKER_SHADOW_WIDTH = 21;
    var VEHICLE_MARKER_SHADOW_HEIGHT = 4;
    var VEHICLE_MARKER_SHADOW_OFFSET = 2;

    /** Delta outline drawn on a 0–100 design grid. */
    var ARROW_PATH = 'M50 5 C 55 28 68 62 89 95 C 70 83 58 79 50 79 C 42 79 30 83 11 95 C 32 62 45 28 50 5 Z';
    var ARROW_STROKE_WIDTH = 4;
    /** Fill bounds of ARROW_PATH on that grid (SVGGeometryElement.getBBox). */
    var ARROW_FILL_BOX = { x: 11, y: 5, width: 78, height: 90 };

    /**
     * viewBox cropped to the ink the delta actually paints: its fill bounds grown by the
     * round-joined stroke, which extends half a stroke width past every edge. A 0 0 100 100
     * viewBox would letterbox the delta to 82% × 94% of the marker box, painting it smaller
     * than VEHICLE_MARKER_SIZE. Remains centred on 50,50 so the marker anchor, which
     * MapLibre pins to the box centre, still lands on the GPS fix.
     */
    var ARROW_INK_BOX = {
        x: ARROW_FILL_BOX.x - ARROW_STROKE_WIDTH / 2,
        y: ARROW_FILL_BOX.y - ARROW_STROKE_WIDTH / 2,
        width: ARROW_FILL_BOX.width + ARROW_STROKE_WIDTH,
        height: ARROW_FILL_BOX.height + ARROW_STROKE_WIDTH,
    };
    var ARROW_VIEW_BOX = [ARROW_INK_BOX.x, ARROW_INK_BOX.y, ARROW_INK_BOX.width, ARROW_INK_BOX.height].join(' ');

    /**
     * Apply marker dimensions on the MapLibre root element so CSS and inline HTML stay in sync.
     * @param {HTMLElement|null|undefined} el
     */
    function applyVehicleMarkerElementSize(el) {
        if (!el) return;
        el.style.setProperty('--vehicle-marker-size', VEHICLE_MARKER_SIZE + 'px');
        el.style.width = VEHICLE_MARKER_SIZE + 'px';
        el.style.height = VEHICLE_MARKER_SIZE + 'px';
        el.style.setProperty('--vehicle-marker-shadow-width', VEHICLE_MARKER_SHADOW_WIDTH + 'px');
        el.style.setProperty('--vehicle-marker-shadow-height', VEHICLE_MARKER_SHADOW_HEIGHT + 'px');
        el.style.setProperty('--vehicle-marker-shadow-offset', VEHICLE_MARKER_SHADOW_OFFSET + 'px');
        var inner = el.querySelector(':scope > div');
        if (inner) {
            inner.style.width = '100%';
            inner.style.height = '100%';
        }
    }

    /**
     * Starfleet-delta-style arrowhead SVG pointing north; container rotation sets heading.
     * @returns {string}
     */
    function buildVehicleArrowSvg() {
        return (
            '<svg viewBox="' + ARROW_VIEW_BOX + '" width="100%" height="100%" ' +
                'preserveAspectRatio="xMidYMid meet" ' +
                'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ' +
                'style="display:block;width:100%;height:100%;overflow:visible;">' +
                '<path d="' + ARROW_PATH + '" ' +
                    'fill="#1E88E5" stroke="#FFFFFF" stroke-width="' + ARROW_STROKE_WIDTH + '" ' +
                    'stroke-linejoin="round" stroke-linecap="round"></path>' +
            '</svg>'
        );
    }

    /**
     * Painted size of the delta inside a square marker box of the given size.
     * xMidYMid meet fits the taller axis, so height matches the box and width follows
     * the ink aspect ratio.
     * @param {number} [size] - Marker box size in CSS pixels.
     * @returns {{width: number, height: number}}
     */
    function getVehicleArrowPaintedSize(size) {
        var box = Number.isFinite(size) ? size : VEHICLE_MARKER_SIZE;
        var scale = box / Math.max(ARROW_INK_BOX.width, ARROW_INK_BOX.height);
        return { width: ARROW_INK_BOX.width * scale, height: ARROW_INK_BOX.height * scale };
    }

    /**
     * @param {Object} opts
     * @returns {string}
     */
    function buildVehicleMarkerPopupHtml(opts) {
        opts = opts || {};
        return (
            '<div style="font-family: Arial, sans-serif; font-size: 13px; min-width: 180px;">' +
                '<strong style="font-size: 14px;">' + (opts.iconEmoji || '🚗') + ' Current Position</strong><br>' +
                '<div style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px;">' +
                    '<div>Speed: <strong>' + (opts.displaySpeed != null ? opts.displaySpeed : '0') + ' ' + (opts.speedUnit || '') + '</strong></div>' +
                    '<div>Heading: <strong>' + (opts.headingDegrees != null ? opts.headingDegrees : 0) + '°</strong></div>' +
                    '<div>Accuracy: <strong>' + (opts.accuracyLabel || '—') + '</strong></div>' +
                '</div>' +
            '</div>'
        );
    }

    var api = {
        VEHICLE_MARKER_SIZE: VEHICLE_MARKER_SIZE,
        VEHICLE_MARKER_ICON_SIZE: VEHICLE_MARKER_ICON_SIZE,
        VEHICLE_MARKER_ICON_ANCHOR: VEHICLE_MARKER_ICON_ANCHOR,
        VEHICLE_MARKER_SHADOW_WIDTH: VEHICLE_MARKER_SHADOW_WIDTH,
        VEHICLE_MARKER_SHADOW_HEIGHT: VEHICLE_MARKER_SHADOW_HEIGHT,
        VEHICLE_MARKER_SHADOW_OFFSET: VEHICLE_MARKER_SHADOW_OFFSET,
        VEHICLE_MARKER_VIEW_BOX: ARROW_VIEW_BOX,
        applyVehicleMarkerElementSize: applyVehicleMarkerElementSize,
        buildVehicleArrowSvg: buildVehicleArrowSvg,
        getVehicleArrowPaintedSize: getVehicleArrowPaintedSize,
        buildVehicleMarkerPopupHtml: buildVehicleMarkerPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVehicleMarker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

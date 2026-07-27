/**
 * @file Pure vehicle position marker SVG and popup HTML (no DOM, no MapLibre).
 * @module modules/map/vehicle-marker
 */
(function (root) {
    'use strict';

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

    /** Fraction of the route line's width the delta overhangs on each side. */
    var POLYLINE_OVERHANG_FRACTION = 0.1;
    /** Mirrors maplibre-helpers POLYLINE_LINE_WIDTH_SCALE when that script has not run yet. */
    var FALLBACK_POLYLINE_WIDTH_SCALE = 2.8;
    /** Mirrors the casing weight from route-selection buildNavActiveRoutePolylineStyle(). */
    var FALLBACK_NAV_ROUTE_CASING_WEIGHT = 11;
    /** Ground-shadow ellipse proportions, kept at the ratios tuned for a 31px marker. */
    var SHADOW_WIDTH_FRACTION = 21 / 31;
    var SHADOW_HEIGHT_FRACTION = 4 / 31;
    var SHADOW_OFFSET_FRACTION = 2 / 31;

    /**
     * @param {number} value
     * @returns {number}
     */
    function roundToHundredths(value) {
        return Math.round(value * 100) / 100;
    }

    /**
     * On-screen width of the active navigation route line, casing included, at the zooms
     * drivers navigate at (z12–z17, where buildZoomScaledLineWidth holds the base width).
     * Read live so the marker tracks the route line, with literal fallbacks for module
     * consumers that load vehicle-marker.js on its own.
     * @returns {number} Width in CSS pixels.
     */
    function getNavRoutePolylineWidth() {
        var helpers = root.MapLibreHelpers;
        var routes = root.VoyagrRouteSelection;
        var scale = helpers && Number.isFinite(helpers.POLYLINE_LINE_WIDTH_SCALE)
            ? helpers.POLYLINE_LINE_WIDTH_SCALE
            : FALLBACK_POLYLINE_WIDTH_SCALE;
        var casing = FALLBACK_NAV_ROUTE_CASING_WEIGHT;
        if (routes && typeof routes.buildNavActiveRoutePolylineStyle === 'function') {
            // No theme argument resolves the default (light) basemap style.
            var style = routes.buildNavActiveRoutePolylineStyle();
            if (style && Number.isFinite(style.outlineWeight)) casing = style.outlineWeight;
        }
        return casing * scale;
    }

    /**
     * Square marker box whose painted delta overhangs the route line by
     * POLYLINE_OVERHANG_FRACTION on each side. The delta paints narrower than it is tall
     * (ARROW_INK_BOX aspect), so the box is scaled up from the target width.
     * @param {number} [polylineWidth] - Route line width in CSS pixels.
     * @returns {number} Marker box size in CSS pixels.
     */
    function getVehicleMarkerSizeForPolylineWidth(polylineWidth) {
        var lineWidth = Number.isFinite(polylineWidth) ? polylineWidth : getNavRoutePolylineWidth();
        var paintedWidth = lineWidth * (1 + 2 * POLYLINE_OVERHANG_FRACTION);
        return roundToHundredths(paintedWidth * (ARROW_INK_BOX.height / ARROW_INK_BOX.width));
    }

    /** Marker box in CSS pixels; the delta paints this tall and 82/94 of it wide. */
    var VEHICLE_MARKER_SIZE = getVehicleMarkerSizeForPolylineWidth();
    var VEHICLE_MARKER_ICON_SIZE = [VEHICLE_MARKER_SIZE, VEHICLE_MARKER_SIZE];
    var VEHICLE_MARKER_ICON_ANCHOR = [VEHICLE_MARKER_SIZE / 2, VEHICLE_MARKER_SIZE / 2];
    var VEHICLE_MARKER_SHADOW_WIDTH = roundToHundredths(VEHICLE_MARKER_SIZE * SHADOW_WIDTH_FRACTION);
    var VEHICLE_MARKER_SHADOW_HEIGHT = roundToHundredths(VEHICLE_MARKER_SIZE * SHADOW_HEIGHT_FRACTION);
    var VEHICLE_MARKER_SHADOW_OFFSET = roundToHundredths(VEHICLE_MARKER_SIZE * SHADOW_OFFSET_FRACTION);

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
        VEHICLE_MARKER_POLYLINE_OVERHANG_FRACTION: POLYLINE_OVERHANG_FRACTION,
        applyVehicleMarkerElementSize: applyVehicleMarkerElementSize,
        buildVehicleArrowSvg: buildVehicleArrowSvg,
        getNavRoutePolylineWidth: getNavRoutePolylineWidth,
        getVehicleMarkerSizeForPolylineWidth: getVehicleMarkerSizeForPolylineWidth,
        getVehicleArrowPaintedSize: getVehicleArrowPaintedSize,
        buildVehicleMarkerPopupHtml: buildVehicleMarkerPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVehicleMarker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

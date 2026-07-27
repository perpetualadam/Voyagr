/**
 * @file Pure vehicle position marker SVG and popup HTML (no DOM, no MapLibre).
 * @module modules/map/vehicle-marker
 */
(function (root) {
    'use strict';

    /** Vehicle delta marker size in CSS pixels (~48% smaller than legacy 60px). */
    var VEHICLE_MARKER_SIZE = 31;
    var VEHICLE_MARKER_ICON_SIZE = [VEHICLE_MARKER_SIZE, VEHICLE_MARKER_SIZE];
    var VEHICLE_MARKER_ICON_ANCHOR = [VEHICLE_MARKER_SIZE / 2, VEHICLE_MARKER_SIZE / 2];
    var VEHICLE_MARKER_SHADOW_WIDTH = 21;
    var VEHICLE_MARKER_SHADOW_HEIGHT = 4;

    /**
     * Starfleet-delta-style arrowhead SVG pointing north; container rotation sets heading.
     * @returns {string}
     */
    function buildVehicleArrowSvg() {
        return (
            '<svg viewBox="0 0 100 100" width="100%" height="100%" ' +
                'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ' +
                'style="display:block;width:100%;height:100%;overflow:visible;">' +
                '<path d="M50 5 C 55 28 68 62 89 95 C 70 83 58 79 50 79 C 42 79 30 83 11 95 C 32 62 45 28 50 5 Z" ' +
                    'fill="#1E88E5" stroke="#FFFFFF" stroke-width="4" ' +
                    'stroke-linejoin="round" stroke-linecap="round"></path>' +
            '</svg>'
        );
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
        buildVehicleArrowSvg: buildVehicleArrowSvg,
        buildVehicleMarkerPopupHtml: buildVehicleMarkerPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVehicleMarker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

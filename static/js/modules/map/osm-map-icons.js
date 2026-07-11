/**
 * @file Pure OSM map layer marker SVG/HTML builders (no DOM, no MapLibre).
 * @module modules/map/osm-map-icons
 */
(function (root) {
    'use strict';

    /**
     * Level crossing icon (rails + warning cross).
     * @returns {string}
     */
    function buildRailwayCrossingIconSvg() {
        return (
            '<svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                '<rect x="1" y="1" width="22" height="22" rx="4" fill="#efebe9" stroke="#795548" stroke-width="2"/>' +
                '<path stroke="#424242" stroke-width="1.8" stroke-linecap="round" d="M5 9h14M5 15h14"/>' +
                '<path stroke="#c62828" stroke-width="2.2" stroke-linecap="round" d="M8 7l8 10M16 7l-8 10"/>' +
            '</svg>'
        );
    }

    /**
     * Fallback vertical traffic-light SVG when TrafficLights module is unavailable.
     * @returns {string}
     */
    function buildOsmTrafficLightFallbackSvg() {
        return (
            '<svg viewBox="0 0 16 36" width="14" height="32" xmlns="http://www.w3.org/2000/svg" ' +
                'preserveAspectRatio="xMidYMid meet" style="display:block;flex-shrink:0;width:14px;height:32px">' +
                '<rect x="1.5" y="0.5" width="13" height="35" rx="2" fill="#111827" stroke="#2e7d32" stroke-width="1.2"/>' +
                '<circle cx="8" cy="8.5" r="4.2" fill="#ef4444"/>' +
                '<circle cx="8" cy="18" r="4.2" fill="#f59e0b"/>' +
                '<circle cx="8" cy="27.5" r="4.2" fill="#22c55e"/>' +
            '</svg>'
        );
    }

    /**
     * @param {string} innerSvg
     * @returns {string}
     */
    function buildOsmTrafficLightMarkerPillHtml(innerSvg) {
        return (
            '<div class="osm-traffic-light-pill" style="box-sizing:border-box;width:100%;height:100%;' +
                'background:#e8f5e9;border:2px solid #2e7d32;border-radius:10px;display:flex;align-items:center;' +
                'justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">' +
                (innerSvg || '') +
            '</div>'
        );
    }

    var OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE = [26, 38];
    var OSM_TRAFFIC_LIGHT_MARKER_ICON_ANCHOR = [13, 19];

    /**
     * @param {string} iconSvg
     * @returns {string}
     */
    function buildRailwayCrossingMarkerHtml(iconSvg) {
        var svg = iconSvg || buildRailwayCrossingIconSvg();
        return (
            '<div style="background:#efebe9;border:2px solid #795548;border-radius:6px;width:32px;height:32px;' +
                'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35);">' +
                svg +
            '</div>'
        );
    }

    /**
     * @param {string} iconSvg
     * @returns {string}
     */
    function buildRailwayCrossingPopupHtml(iconSvg) {
        var svg = iconSvg || buildRailwayCrossingIconSvg();
        return (
            '<div style="text-align:center;font-size:12px;max-width:220px;">' +
                '<div style="margin-bottom:6px;display:flex;justify-content:center;">' + svg + '</div>' +
                '<strong>Level crossing</strong>' +
            '</div>'
        );
    }

    /**
     * Centered pill wrapper for hazard marker popups (traffic lights on route).
     * @param {string} pillHtml
     * @returns {string}
     */
    function buildOsmTrafficLightPopupIconWrapperHtml(pillHtml) {
        return '<div style="width:26px;height:38px;margin:0 auto;">' + (pillHtml || '') + '</div>';
    }

    /**
     * @param {string} pillHtml
     * @returns {string}
     */
    function buildOsmTrafficLightPopupHtml(pillHtml) {
        var pill = pillHtml || '';
        return (
            '<div style="text-align:center;font-size:12px;max-width:200px;">' +
                '<div style="width:26px;height:38px;margin:0 auto 6px;">' + pill + '</div>' +
                '<strong>Traffic light</strong>' +
            '</div>'
        );
    }

    var api = {
        buildRailwayCrossingIconSvg: buildRailwayCrossingIconSvg,
        buildOsmTrafficLightFallbackSvg: buildOsmTrafficLightFallbackSvg,
        buildOsmTrafficLightMarkerPillHtml: buildOsmTrafficLightMarkerPillHtml,
        OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE: OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
        OSM_TRAFFIC_LIGHT_MARKER_ICON_ANCHOR: OSM_TRAFFIC_LIGHT_MARKER_ICON_ANCHOR,
        buildOsmTrafficLightPopupIconWrapperHtml: buildOsmTrafficLightPopupIconWrapperHtml,
        buildRailwayCrossingMarkerHtml: buildRailwayCrossingMarkerHtml,
        buildRailwayCrossingPopupHtml: buildRailwayCrossingPopupHtml,
        buildOsmTrafficLightPopupHtml: buildOsmTrafficLightPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrOsmMapIcons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

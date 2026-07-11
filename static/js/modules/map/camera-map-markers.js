/**
 * @file Pure camera map marker HTML builders (no DOM, no MapLibre).
 * @module modules/map/camera-map-markers
 */
(function (root) {
    'use strict';

    /**
     * @param {string} svg
     * @param {number} width
     * @param {number} height
     * @returns {string}
     */
    function scaleHazardMarkerSvg(svg, width, height) {
        return String(svg || '')
            .replace('width="20"', 'width="' + width + '"')
            .replace('height="20"', 'height="' + height + '"');
    }

    /**
     * @param {Object} config
     * @param {string} svgForMarker
     * @returns {string}
     */
    function buildCameraMarkerHtml(config, svgForMarker) {
        config = config || {};
        return (
            '<div style="' +
                'background: ' + (config.bgColor || '#fff') + ';' +
                'border: 2px solid ' + (config.color || '#333') + ';' +
                'border-radius: 4px;' +
                'width: 32px;' +
                'height: 32px;' +
                'display: flex;' +
                'align-items: center;' +
                'justify-content: center;' +
                'box-shadow: 0 4px 10px rgba(0,0,0,0.4);' +
                'cursor: pointer;' +
                'transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);' +
            '">' + (svgForMarker || '') + '</div>'
        );
    }

    /**
     * @param {Object} config
     * @param {string} svgForPopup
     * @param {string} [description]
     * @returns {string}
     */
    function buildCameraMarkerPopupHtml(config, svgForPopup, description) {
        config = config || {};
        var descHtml = description
            ? '<div style="font-size: 11px; color: #666;">' + description + '</div>'
            : '';
        return (
            '<div style="text-align: center; min-width: 140px;">' +
                '<div style="margin-bottom: 8px; display: flex; justify-content: center;">' + (svgForPopup || '') + '</div>' +
                '<div style="font-weight: bold; color: ' + (config.color || '#333') + '; margin-bottom: 5px;">' + (config.label || '') + '</div>' +
                descHtml +
            '</div>'
        );
    }

    var api = {
        scaleHazardMarkerSvg: scaleHazardMarkerSvg,
        buildCameraMarkerHtml: buildCameraMarkerHtml,
        buildCameraMarkerPopupHtml: buildCameraMarkerPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrCameraMapMarkers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

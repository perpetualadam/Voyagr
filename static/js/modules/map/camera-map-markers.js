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

    /**
     * Build marker mount specs for camera overlay markers (app applies MapLibre createMarker).
     * @param {Array<Object>} items
     * @param {Object} styleMap
     * @param {Object} [opts]
     * @param {function(string): string} [opts.normalizeBucket]
     * @param {string} [opts.markerClassName]
     * @param {number} [opts.markerSvgSize]
     * @param {number} [opts.popupSvgSize]
     * @param {Array<number>} [opts.iconSize]
     * @param {Array<number>} [opts.iconAnchor]
     * @returns {Array<Object>}
     */
    function buildCameraMarkersMountSpecs(items, styleMap, opts) {
        opts = opts || {};
        styleMap = styleMap || {};
        var normalize = typeof opts.normalizeBucket === 'function'
            ? opts.normalizeBucket
            : function (bucket) { return bucket; };
        var markerSvgSize = opts.markerSvgSize != null ? opts.markerSvgSize : 20;
        var popupSvgSize = opts.popupSvgSize != null ? opts.popupSvgSize : 24;
        var fallback = styleMap.camera_speed || {};

        return (items || []).map(function (camera) {
            var bucket = normalize(camera.bucket);
            var config = styleMap[bucket] || fallback;
            if (!config || !config.svg) {
                config = fallback;
            }
            var svgForMarker = scaleHazardMarkerSvg(config.svg, markerSvgSize, markerSvgSize);
            var svgForPopup = scaleHazardMarkerSvg(config.svg, popupSvgSize, popupSvgSize);
            return {
                lat: camera.lat,
                lon: camera.lon,
                className: opts.markerClassName,
                html: buildCameraMarkerHtml(config, svgForMarker),
                iconSize: opts.iconSize,
                iconAnchor: opts.iconAnchor,
                popup: buildCameraMarkerPopupHtml(config, svgForPopup, camera.description),
            };
        });
    }

    var api = {
        scaleHazardMarkerSvg: scaleHazardMarkerSvg,
        buildCameraMarkerHtml: buildCameraMarkerHtml,
        buildCameraMarkerPopupHtml: buildCameraMarkerPopupHtml,
        buildCameraMarkersMountSpecs: buildCameraMarkersMountSpecs,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrCameraMapMarkers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

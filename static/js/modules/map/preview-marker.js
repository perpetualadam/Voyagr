/**
 * @file Pure map preview marker HTML and styles (no DOM, no MapLibre).
 * @module modules/map/preview-marker
 */
(function (root) {
    'use strict';

    var PREVIEW_MARKER_CLASS = 'preview-marker';

    /**
     * @returns {string}
     */
    function getPreviewMarkerStyleCssText() {
        return [
            'display: flex;',
            'flex-direction: column;',
            'align-items: center;',
            'transform: translateY(-50%);',
        ].join('');
    }

    /**
     * @param {string} label
     * @returns {string}
     */
    function buildPreviewMarkerInnerHtml(label) {
        return (
            '<div class="preview-marker-icon">📍</div>' +
            '<div class="preview-marker-label">' + (label || '') + '</div>'
        );
    }

    /**
     * Circle-marker options for route preview start/end pins (MapLibre createCircleMarker).
     * @param {'start'|'end'} which
     * @returns {{ radius: number, fillColor: string, color: string, weight: number, fillOpacity: number, popup: string }}
     */
    function getRouteEndpointMarkerOptions(which) {
        if (which === 'start') {
            return {
                radius: 8,
                fillColor: '#00ff00',
                color: '#000',
                weight: 2,
                fillOpacity: 0.8,
                popup: 'Start Location',
            };
        }
        return {
            radius: 8,
            fillColor: '#ff0000',
            color: '#000',
            weight: 2,
            fillOpacity: 0.8,
            popup: 'End Location',
        };
    }

    var api = {
        PREVIEW_MARKER_CLASS: PREVIEW_MARKER_CLASS,
        getPreviewMarkerStyleCssText: getPreviewMarkerStyleCssText,
        buildPreviewMarkerInnerHtml: buildPreviewMarkerInnerHtml,
        getRouteEndpointMarkerOptions: getRouteEndpointMarkerOptions,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPreviewMarker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

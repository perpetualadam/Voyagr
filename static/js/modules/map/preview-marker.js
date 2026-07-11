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

    var api = {
        PREVIEW_MARKER_CLASS: PREVIEW_MARKER_CLASS,
        getPreviewMarkerStyleCssText: getPreviewMarkerStyleCssText,
        buildPreviewMarkerInnerHtml: buildPreviewMarkerInnerHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPreviewMarker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

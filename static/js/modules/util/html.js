/**
 * @file Pure HTML string-safety helpers (no DOM).
 * @module modules/util/html
 */
(function (root) {
    'use strict';

    /**
     * Escape a value for safe insertion into HTML text or attributes.
     * @param {*} value
     * @returns {string}
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    var api = { escapeHtml: escapeHtml };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrHtml = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

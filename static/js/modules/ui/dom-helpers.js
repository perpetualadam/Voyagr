/**
 * @file DOM event-target helpers for mobile taps on text/emoji nodes.
 * @module modules/ui/dom-helpers
 */
(function (root) {
    'use strict';

    var ELEMENT_NODE = typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1;
    var TEXT_NODE = typeof Node !== 'undefined' ? Node.TEXT_NODE : 3;

    /**
     * Normalize an event target to an Element (Text nodes have no .closest).
     * @param {*} raw - Typically event.target
     * @returns {Element|null}
     */
    function eventTargetElement(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.nodeType === ELEMENT_NODE) return raw;
        if (raw.nodeType === TEXT_NODE && raw.parentElement) return raw.parentElement;
        return null;
    }

    /**
     * closest() on a possibly-text event target.
     * @param {*} raw
     * @param {string} selector
     * @returns {Element|null}
     */
    function closest(raw, selector) {
        var el = eventTargetElement(raw);
        return el && typeof el.closest === 'function' ? el.closest(selector) : null;
    }

    var SWAP_LOCATIONS_FLASH_STYLE = { background: '#e3f2fd', borderColor: '#2196F3' };
    var SWAP_LOCATIONS_REST_STYLE = { background: '#f5f5f5', borderColor: '#ddd' };
    var SWAP_LOCATIONS_FLASH_MS = 300;

    var api = {
        eventTargetElement: eventTargetElement,
        closest: closest,
        SWAP_LOCATIONS_FLASH_STYLE: SWAP_LOCATIONS_FLASH_STYLE,
        SWAP_LOCATIONS_REST_STYLE: SWAP_LOCATIONS_REST_STYLE,
        SWAP_LOCATIONS_FLASH_MS: SWAP_LOCATIONS_FLASH_MS,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDomHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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

    var api = {
        eventTargetElement: eventTargetElement,
        closest: closest,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDomHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

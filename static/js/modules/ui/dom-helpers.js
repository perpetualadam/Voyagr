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

    var SWAP_LOCATIONS_FLASH_MS = 300;
    var BOTTOM_SHEET_DRAG_THRESHOLD_PX = 50;

    /**
     * Orchestration plan for bottom sheet init element lookup.
     * @param {boolean} hasBottomSheet
     * @param {boolean} hasHandle
     * @returns {Object}
     */
    function buildBottomSheetInitOrchestrationPlan(hasBottomSheet, hasHandle) {
        if (!hasBottomSheet || !hasHandle) {
            return {
                shouldInit: false,
                missingElementsLogMessage: 'Bottom Sheet elements not found',
            };
        }
        return {
            shouldInit: true,
            bottomSheetId: 'bottomSheet',
            handleSelector: '.bottom-sheet-handle',
            headerSelector: '.bottom-sheet-header',
            dragThresholdPx: BOTTOM_SHEET_DRAG_THRESHOLD_PX,
        };
    }

    /**
     * Whether a drag gesture may start from the event target.
     * @param {boolean} onHandle
     * @param {boolean} onHeader
     * @returns {Object}
     */
    function buildBottomSheetDragStartAllowedPlan(onHandle, onHeader) {
        return { allowDrag: !!(onHandle || onHeader) };
    }

    /**
     * Snap plan after a bottom sheet drag ends.
     * @param {number} deltaY
     * @param {boolean} isExpanded
     * @param {number} [thresholdPx]
     * @returns {Object}
     */
    function buildBottomSheetDragSnapPlan(deltaY, isExpanded, thresholdPx) {
        var threshold = thresholdPx != null ? thresholdPx : BOTTOM_SHEET_DRAG_THRESHOLD_PX;
        if (deltaY < -threshold) {
            return { action: 'expand' };
        }
        if (deltaY > threshold) {
            return { action: 'collapse' };
        }
        return { action: isExpanded ? 'expand' : 'collapse', revert: true };
    }

    var api = {
        eventTargetElement: eventTargetElement,
        closest: closest,
        SWAP_LOCATIONS_FLASH_STYLE: SWAP_LOCATIONS_FLASH_STYLE,
        SWAP_LOCATIONS_REST_STYLE: SWAP_LOCATIONS_REST_STYLE,
        SWAP_LOCATIONS_FLASH_MS: SWAP_LOCATIONS_FLASH_MS,
        BOTTOM_SHEET_DRAG_THRESHOLD_PX: BOTTOM_SHEET_DRAG_THRESHOLD_PX,
        buildBottomSheetInitOrchestrationPlan: buildBottomSheetInitOrchestrationPlan,
        buildBottomSheetDragStartAllowedPlan: buildBottomSheetDragStartAllowedPlan,
        buildBottomSheetDragSnapPlan: buildBottomSheetDragSnapPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDomHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

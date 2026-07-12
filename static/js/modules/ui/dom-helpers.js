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
    var BOTTOM_SHEET_DRAG_THRESHOLD_PX = 50;
    var BOTTOM_SHEET_ID = 'bottomSheet';
    var BOTTOM_SHEET_EXPANDED_CLASS = 'expanded';

    var BOTTOM_SHEET_OVERLAP_ALWAYS_HIDE_IDS = [
        'roadReportFab',
        'startTrackingBtn',
        'voiceFab',
        'currentLocationFab',
        'mapControlsHintFab',
        'recenterVehicleFab',
    ];
    var BOTTOM_SHEET_HANDLE_SELECTOR = '.bottom-sheet-handle';
    var BOTTOM_SHEET_CONTENT_SELECTOR = '.bottom-sheet-content';
    var BOTTOM_SHEET_HEADER_SELECTOR = '.bottom-sheet-header';
    var BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX = 100;
    var BOTTOM_SHEET_FOCUS_EXPAND_INPUT_IDS = ['start', 'end'];
    var ROUTE_PREVIEW_HANDLE_TITLE = 'Swipe up to see route details';

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
        if (isExpanded && deltaY > threshold) {
            return { action: 'collapse' };
        }
        if (!isExpanded && deltaY < -threshold) {
            return { action: 'expand' };
        }
        return { action: 'revert' };
    }

    /**
     * Visual transform feedback while dragging the bottom sheet handle.
     * @param {Object} [input]
     * @param {number} [input.diff]
     * @param {boolean} [input.isExpanded]
     * @param {number} [input.previewMaxPx]
     * @returns {Object}
     */
    function buildBottomSheetDragVisualFeedbackPlan(input) {
        input = input || {};
        var diff = input.diff != null ? input.diff : 0;
        var isExpanded = !!input.isExpanded;
        var previewMaxPx = input.previewMaxPx != null
            ? input.previewMaxPx
            : BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX;

        if (isExpanded && diff > 0) {
            return {
                shouldApplyTransform: true,
                transformTranslateY: diff,
            };
        }
        if (!isExpanded && diff < 0) {
            return {
                shouldApplyTransform: true,
                transformTranslateY: Math.max(diff, -previewMaxPx),
            };
        }
        return { shouldApplyTransform: false };
    }

    /**
     * Whether a header click should toggle the sheet (ignore icon buttons).
     * @param {boolean} clickedButton
     * @returns {Object}
     */
    function buildBottomSheetHeaderClickAllowedPlan(clickedButton) {
        return { allowToggle: !clickedButton };
    }

    /**
     * Whether a sheet body click should expand when collapsed.
     * @param {boolean} clickedContent
     * @param {boolean} isExpanded
     * @returns {Object}
     */
    function buildBottomSheetBodyClickExpandPlan(clickedContent, isExpanded) {
        return {
            shouldExpand: !isExpanded && !clickedContent,
        };
    }

    /**
     * Extended init orchestration for initBottomSheet wiring.
     * @param {boolean} hasBottomSheet
     * @param {boolean} hasHandle
     * @returns {Object}
     */
    function buildBottomSheetFullInitOrchestrationPlan(hasBottomSheet, hasHandle) {
        var base = buildBottomSheetInitOrchestrationPlan(hasBottomSheet, hasHandle);
        if (!base.shouldInit) {
            return Object.assign({}, base, {
                missingElementsErrorLog: '[BottomSheet] ERROR: bottomSheet or handle not found!',
            });
        }
        return Object.assign({}, base, {
            headerSelector: BOTTOM_SHEET_HEADER_SELECTOR,
            contentSelector: BOTTOM_SHEET_CONTENT_SELECTOR,
            headerButtonIgnoreSelector: 'button',
            dragCollapsePreviewMaxPx: BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX,
            focusExpandInputIds: BOTTOM_SHEET_FOCUS_EXPAND_INPUT_IDS.slice(),
            initLogMessage: '[BottomSheet] Initializing...',
            missingElementsErrorLog: '[BottomSheet] ERROR: bottomSheet or handle not found!',
            handleClickLogMessage: '[BottomSheet] Handle clicked, expanded:',
            sheetExpandClickLogMessage: '[BottomSheet] Sheet clicked while collapsed - Expanding',
            collapseSwipeLogMessage: '[BottomSheet] Collapsed via swipe down',
            expandSwipeLogMessage: '[BottomSheet] Expanded via swipe up',
        });
    }

    /**
     * DOM display plan for map FABs overlapped by an expanded bottom sheet.
     * @param {Object} [input]
     * @param {boolean} [input.sheetExpanded]
     * @param {boolean} [input.routeInProgress]
     * @returns {Object}
     */
    function buildBottomSheetOverlapFabDisplayPlan(input) {
        input = input || {};
        var sheetExpanded = !!input.sheetExpanded;
        var routeInProgress = !!input.routeInProgress;
        var alwaysHide = BOTTOM_SHEET_OVERLAP_ALWAYS_HIDE_IDS.map(function (id) {
            return {
                id: id,
                action: sheetExpanded ? 'hide' : 'clearDisplay',
            };
        });

        var navFabDisplays = [];
        if (sheetExpanded && routeInProgress) {
            navFabDisplays = [
                { id: 'zoomFollowToggle', display: 'none' },
                { id: 'journeyOverviewBtn', display: 'none' },
                { id: 'endNavigationBtn', display: 'block' },
            ];
        } else if (routeInProgress) {
            navFabDisplays = [
                { id: 'zoomFollowToggle', display: 'block' },
                { id: 'journeyOverviewBtn', display: 'block' },
                { id: 'endNavigationBtn', display: 'block' },
            ];
        } else {
            navFabDisplays = [
                { id: 'zoomFollowToggle', display: 'none' },
                { id: 'journeyOverviewBtn', display: 'none' },
                { id: 'endNavigationBtn', display: 'none' },
            ];
        }

        return {
            shouldApply: true,
            sheetExpanded: sheetExpanded,
            routeInProgress: routeInProgress,
            alwaysHideWhenExpanded: alwaysHide,
            navFabDisplays: navFabDisplays,
        };
    }

    /**
     * Execute plan for expanding the bottom sheet.
     * @returns {Object}
     */
    function buildExpandBottomSheetExecutePlan() {
        return {
            shouldApply: true,
            bottomSheetId: BOTTOM_SHEET_ID,
            expandedClass: BOTTOM_SHEET_EXPANDED_CLASS,
            ariaExpanded: 'true',
            setExpandedState: true,
            clearInlineStyles: ['height', 'transform', 'transition'],
            expandLogMessage: '[BottomSheet] Expanding...',
            expandedLogMessage: '[BottomSheet] Expanded, classes:',
            syncOverlapFabs: true,
        };
    }

    /**
     * Execute plan for collapsing the bottom sheet.
     * @returns {Object}
     */
    function buildCollapseBottomSheetExecutePlan() {
        return {
            shouldApply: true,
            bottomSheetId: BOTTOM_SHEET_ID,
            expandedClass: BOTTOM_SHEET_EXPANDED_CLASS,
            ariaExpanded: 'false',
            setExpandedState: false,
            clearInlineStyles: ['height', 'transform', 'transition'],
            resetContentScroll: true,
            contentSelector: BOTTOM_SHEET_CONTENT_SELECTOR,
            collapseLogMessage: '[BottomSheet] Collapsing...',
            syncOverlapFabs: true,
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleBottomSheetCollectPlan(input) {
        input = input || {};
        return {
            isExpanded: !!input.isExpanded,
            expand: !input.isExpanded,
            collapse: !!input.isExpanded,
        };
    }

    /**
     * Execute plan for collapsing the sheet before route preview.
     * @returns {Object}
     */
    function buildCollapseBottomSheetForRoutePreviewExecutePlan() {
        return {
            shouldApply: true,
            collapse: true,
            clearInlineStyles: ['height', 'transition', 'transform'],
            handleSelector: BOTTOM_SHEET_HANDLE_SELECTOR,
            handleTitle: ROUTE_PREVIEW_HANDLE_TITLE,
            logMessage: '[Route Preview] Collapsed bottom sheet to show map',
        };
    }

    /**
     * Apply plan for collapsing the sheet before route preview.
     * @param {Object} [execute] - from buildCollapseBottomSheetForRoutePreviewExecutePlan
     * @returns {Object}
     */
    function buildCollapseBottomSheetForRoutePreviewApplyPlan(execute) {
        execute = execute || {};
        if (!execute.shouldApply) {
            return { shouldApply: false };
        }
        return {
            shouldApply: true,
            bottomSheetId: BOTTOM_SHEET_ID,
            clearInlineStyles: execute.clearInlineStyles || [],
            collapse: !!execute.collapse,
            handleSelector: execute.handleSelector,
            handleTitle: execute.handleTitle,
            logMessage: execute.logMessage,
        };
    }

    /**
     * Orchestration plan for collapseBottomSheetForRoutePreview entry.
     * @returns {Object}
     */
    function buildCollapseBottomSheetForRoutePreviewOrchestrationPlan() {
        var execute = buildCollapseBottomSheetForRoutePreviewExecutePlan();
        return {
            execute: execute,
            apply: buildCollapseBottomSheetForRoutePreviewApplyPlan(execute),
        };
    }

    var api = {
        eventTargetElement: eventTargetElement,
        closest: closest,
        SWAP_LOCATIONS_FLASH_STYLE: SWAP_LOCATIONS_FLASH_STYLE,
        SWAP_LOCATIONS_REST_STYLE: SWAP_LOCATIONS_REST_STYLE,
        SWAP_LOCATIONS_FLASH_MS: SWAP_LOCATIONS_FLASH_MS,
        BOTTOM_SHEET_DRAG_THRESHOLD_PX: BOTTOM_SHEET_DRAG_THRESHOLD_PX,
        BOTTOM_SHEET_ID: BOTTOM_SHEET_ID,
        BOTTOM_SHEET_EXPANDED_CLASS: BOTTOM_SHEET_EXPANDED_CLASS,
        BOTTOM_SHEET_OVERLAP_ALWAYS_HIDE_IDS: BOTTOM_SHEET_OVERLAP_ALWAYS_HIDE_IDS,
        BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX: BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX,
        buildBottomSheetInitOrchestrationPlan: buildBottomSheetInitOrchestrationPlan,
        buildBottomSheetFullInitOrchestrationPlan: buildBottomSheetFullInitOrchestrationPlan,
        buildBottomSheetDragStartAllowedPlan: buildBottomSheetDragStartAllowedPlan,
        buildBottomSheetDragSnapPlan: buildBottomSheetDragSnapPlan,
        buildBottomSheetDragVisualFeedbackPlan: buildBottomSheetDragVisualFeedbackPlan,
        buildBottomSheetHeaderClickAllowedPlan: buildBottomSheetHeaderClickAllowedPlan,
        buildBottomSheetBodyClickExpandPlan: buildBottomSheetBodyClickExpandPlan,
        buildBottomSheetOverlapFabDisplayPlan: buildBottomSheetOverlapFabDisplayPlan,
        buildExpandBottomSheetExecutePlan: buildExpandBottomSheetExecutePlan,
        buildCollapseBottomSheetExecutePlan: buildCollapseBottomSheetExecutePlan,
        buildToggleBottomSheetCollectPlan: buildToggleBottomSheetCollectPlan,
        buildCollapseBottomSheetForRoutePreviewExecutePlan: buildCollapseBottomSheetForRoutePreviewExecutePlan,
        buildCollapseBottomSheetForRoutePreviewApplyPlan: buildCollapseBottomSheetForRoutePreviewApplyPlan,
        buildCollapseBottomSheetForRoutePreviewOrchestrationPlan:
            buildCollapseBottomSheetForRoutePreviewOrchestrationPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDomHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

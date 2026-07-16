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
    var BOTTOM_SHEET_TAP_SLOP_PX = 10;
    var BOTTOM_SHEET_TOUCH_TAP_SLOP_PX = 18;
    var BOTTOM_SHEET_PEEK_HEIGHT_PX = 110;
    var BOTTOM_SHEET_ID = 'bottomSheet';
    var BOTTOM_SHEET_EXPANDED_CLASS = 'expanded';

    var BOTTOM_SHEET_OVERLAP_ALWAYS_HIDE_IDS = [
        'navMenuToggle',
        'roadReportFab',
        'startTrackingBtn',
        'voiceFab',
        'currentLocationFab',
        'mapControlsHintFab',
        'showCamerasFab',
        'recenterVehicleFab',
    ];
    var BOTTOM_SHEET_HANDLE_SELECTOR = '.bottom-sheet-handle';
    var BOTTOM_SHEET_CONTENT_SELECTOR = '.bottom-sheet-content';
    var BOTTOM_SHEET_HEADER_SELECTOR = '.bottom-sheet-header';
    var BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX = 100;
    var BOTTOM_SHEET_FOCUS_EXPAND_INPUT_IDS = ['start', 'end'];
    var ROUTE_PREVIEW_HANDLE_TITLE = 'Swipe up to see route details';
    var NAV_CONTROL_BUTTONS_ID = 'navControlButtons';
    var NAV_MENU_TOGGLE_ID = 'navMenuToggle';
    var NAV_CONTROL_MENU_SELECTOR = '.nav-control-menu';
    var NAV_CONTROL_MENU_OPEN_CLASS = 'nav-control-menu--open';
    var NAV_MENU_COLLAPSED_CLASS = 'nav-menu-collapsed';
    var NAV_MENU_EXPANDED_CLASS = 'nav-menu-expanded';
    var JOURNEY_SUMMARY_VISIBLE_BODY_CLASS = 'voyagr-journey-summary-visible';

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
     * Decide whether a pointer/touch move should start a drag (vs a tap).
     * @param {Object} [input]
     * @param {number} [input.startY]
     * @param {number} [input.currentY]
     * @param {boolean} [input.isDragging]
     * @param {number} [input.tapSlopPx]
     * @returns {Object}
     */
    function buildBottomSheetGestureMovePlan(input) {
        input = input || {};
        var startY = input.startY != null ? input.startY : 0;
        var currentY = input.currentY != null ? input.currentY : startY;
        var diff = currentY - startY;
        var slop = input.tapSlopPx != null ? input.tapSlopPx : BOTTOM_SHEET_TAP_SLOP_PX;
        if (input.pointerType === 'touch') {
            slop = input.touchTapSlopPx != null ? input.touchTapSlopPx : BOTTOM_SHEET_TOUCH_TAP_SLOP_PX;
        }
        var isDragging = !!input.isDragging;

        if (!isDragging && Math.abs(diff) > slop) {
            isDragging = true;
        }

        return {
            isDragging: isDragging,
            diff: diff,
            shouldApplyDrag: isDragging,
        };
    }

    /**
     * Whether a pointerdown should start a bottom-sheet gesture.
     * Touch pointers may report button -1 on some UAs; only filter mouse buttons.
     * @param {Object} [input]
     * @param {string} [input.pointerType]
     * @param {number} [input.button]
     * @returns {Object}
     */
    function buildBottomSheetPointerDownAllowedPlan(input) {
        input = input || {};
        if (input.pointerType === 'mouse' && input.button != null && input.button !== 0) {
            return { allowed: false };
        }
        return { allowed: true };
    }

    /**
     * Whether to capture the pointer on pointerdown (touch/pen).
     * Firefox defers capture until drag starts to avoid lost taps on mobile.
     * @param {Object} [input]
     * @param {string} [input.pointerType]
     * @param {string} [input.userAgent]
     * @returns {Object}
     */
    function buildBottomSheetPointerCaptureOnDownPlan(input) {
        input = input || {};
        if (!input.pointerType || input.pointerType === 'mouse') {
            return { shouldCapture: false };
        }
        var ua = String(input.userAgent || '');
        if (/firefox|fxios/i.test(ua)) {
            return { shouldCapture: false };
        }
        return { shouldCapture: true };
    }

    /**
     * Whether touchend should drive tap fallback (Firefox mobile).
     * @param {string} [userAgent]
     * @returns {Object}
     */
    function buildBottomSheetTouchTapFallbackPlan(userAgent) {
        var ua = String(userAgent || '');
        return { enabled: /firefox|fxios/i.test(ua) };
    }

    /**
     * Whether a completed gesture plan actually toggled or snapped the sheet.
     * @param {Object|null|undefined} entry
     * @returns {Object}
     */
    function buildBottomSheetGestureConsumedPlan(entry) {
        if (!entry) return { consumed: false };
        if (entry.kind === 'tap' && entry.shouldToggle) return { consumed: true };
        if (entry.shouldCollapse || entry.shouldExpand) return { consumed: true };
        return { consumed: false };
    }

    /**
     * End-of-gesture plan: tap toggles; drag snaps open/closed.
     * @param {number} diff
     * @param {boolean} isDragging
     * @param {boolean} isExpanded
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildBottomSheetGestureEndPlan(diff, isDragging, isExpanded, opts) {
        opts = opts || {};
        var thresholdPx = opts.thresholdPx != null ? opts.thresholdPx : BOTTOM_SHEET_DRAG_THRESHOLD_PX;

        if (!isDragging) {
            return {
                kind: 'tap',
                shouldToggle: true,
                action: isExpanded ? 'collapse' : 'expand',
                logMessage: opts.tapLogMessage,
                logState: isExpanded,
            };
        }

        var finish = buildBottomSheetDragFinishEntryOrchestrationPlan(diff, isExpanded, opts);
        // Imprecise mobile taps can exceed tap slop but stay below swipe threshold.
        // Treat those as taps so the synthesized click fallback is not swallowed.
        if (finish.snap.action === 'revert' && Math.abs(diff) < thresholdPx) {
            return {
                kind: 'tap',
                shouldToggle: true,
                action: isExpanded ? 'collapse' : 'expand',
                logMessage: opts.tapLogMessage,
                logState: isExpanded,
                promotedFromDragRevert: true,
            };
        }

        return Object.assign({ kind: 'drag' }, finish);
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
    function buildBottomSheetFullInitOrchestrationPlan(hasBottomSheet, hasHandle, opts) {
        opts = opts || {};
        var base = buildBottomSheetInitOrchestrationPlan(hasBottomSheet, hasHandle);
        if (!base.shouldInit) {
            return Object.assign({}, base, {
                missingElementsErrorLog: '[BottomSheet] ERROR: bottomSheet or handle not found!',
            });
        }
        var userAgent = opts.userAgent != null ? String(opts.userAgent) : '';
        return Object.assign({}, base, {
            headerSelector: BOTTOM_SHEET_HEADER_SELECTOR,
            contentSelector: BOTTOM_SHEET_CONTENT_SELECTOR,
            headerButtonIgnoreSelector: 'button',
            dragCollapsePreviewMaxPx: BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX,
            touchTapSlopPx: BOTTOM_SHEET_TOUCH_TAP_SLOP_PX,
            focusExpandInputIds: BOTTOM_SHEET_FOCUS_EXPAND_INPUT_IDS.slice(),
            touchTapFallback: buildBottomSheetTouchTapFallbackPlan(userAgent).enabled,
            userAgent: userAgent,
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
            collapseNavMenu: sheetExpanded,
        };
    }

    /**
     * Whether the map action menu is currently collapsed.
     * @param {boolean} [hasCollapsedClass]
     * @returns {Object}
     */
    function buildNavMenuToggleCollectPlan(hasCollapsedClass) {
        return { expand: !!hasCollapsedClass };
    }

    /**
     * Apply plan for expanded/collapsed map action menu state.
     * @param {Object} [input]
     * @param {boolean} [input.expand]
     * @param {boolean} [input.collapse]
     * @returns {Object}
     */
    function buildNavMenuStateApplyPlan(input) {
        input = input || {};
        var expand = !!input.expand;
        var collapse = !!input.collapse;
        if (!expand && !collapse) {
            return { shouldApply: false };
        }
        return {
            shouldApply: true,
            navControlButtonsId: NAV_CONTROL_BUTTONS_ID,
            navMenuToggleId: NAV_MENU_TOGGLE_ID,
            navControlMenuSelector: NAV_CONTROL_MENU_SELECTOR,
            navControlMenuOpenClass: NAV_CONTROL_MENU_OPEN_CLASS,
            collapsedClass: NAV_MENU_COLLAPSED_CLASS,
            expandedClass: NAV_MENU_EXPANDED_CLASS,
            expand: expand,
            collapse: collapse,
            ariaExpanded: expand ? 'true' : 'false',
        };
    }

    /**
     * Execute plan to collapse the map action menu.
     * @returns {Object}
     */
    function buildCollapseNavMenuExecutePlan() {
        return buildNavMenuStateApplyPlan({ collapse: true });
    }

    /**
     * Entry plan for toggling the map action menu.
     * @param {boolean} isCollapsed
     * @returns {Object}
     */
    function buildToggleNavMenuEntryOrchestrationPlan(isCollapsed) {
        var collected = buildNavMenuToggleCollectPlan(isCollapsed);
        return {
            collected: collected,
            execute: buildNavMenuStateApplyPlan({ expand: collected.expand, collapse: !collected.expand }),
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

    /**
     * Entry orchestration plan for expandBottomSheet handler.
     * @returns {Object}
     */
    function buildExpandBottomSheetEntryOrchestrationPlan() {
        return {
            execute: buildExpandBottomSheetExecutePlan(),
        };
    }

    /**
     * Entry orchestration plan for collapseBottomSheet handler.
     * @returns {Object}
     */
    function buildCollapseBottomSheetEntryOrchestrationPlan() {
        return {
            execute: buildCollapseBottomSheetExecutePlan(),
        };
    }

    /**
     * Entry orchestration plan for toggleBottomSheet handler.
     * @param {boolean} isExpanded
     * @returns {Object}
     */
    function buildToggleBottomSheetEntryOrchestrationPlan(isExpanded) {
        var collected = buildToggleBottomSheetCollectPlan({ isExpanded: isExpanded });
        return {
            collected: collected,
            execute: collected.expand
                ? buildExpandBottomSheetExecutePlan()
                : collected.collapse
                  ? buildCollapseBottomSheetExecutePlan()
                  : null,
        };
    }

    /**
     * Entry orchestration plan for bottom sheet drag visual feedback.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildBottomSheetDragVisualEntryOrchestrationPlan(input) {
        return {
            feedback: buildBottomSheetDragVisualFeedbackPlan(input),
        };
    }

    /**
     * Entry orchestration plan for finishing a bottom sheet drag gesture.
     * @param {number} diff
     * @param {boolean} isExpanded
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildBottomSheetDragFinishEntryOrchestrationPlan(diff, isExpanded, opts) {
        opts = opts || {};
        var snap = buildBottomSheetDragSnapPlan(diff, isExpanded, opts.thresholdPx);
        return {
            snap: snap,
            clearInlineStyles: ['transition', 'transform'],
            shouldCollapse: snap.action === 'collapse',
            shouldExpand: snap.action === 'expand',
            collapseLogMessage: snap.action === 'collapse' ? opts.collapseSwipeLogMessage : null,
            expandLogMessage: snap.action === 'expand' ? opts.expandSwipeLogMessage : null,
        };
    }

    /**
     * Execute plan for starting a bottom sheet drag gesture.
     * @returns {Object}
     */
    function buildBottomSheetDragStartExecutePlan() {
        return {
            shouldDisableTransition: true,
            transitionValue: 'none',
        };
    }

    /**
     * Entry orchestration plan for bottom sheet handle click toggle.
     * @param {boolean} isExpanded
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildBottomSheetHandleClickEntryOrchestrationPlan(isExpanded, opts) {
        opts = opts || {};
        return {
            shouldToggle: true,
            action: isExpanded ? 'collapse' : 'expand',
            logMessage: opts.handleClickLogMessage,
            logState: isExpanded,
        };
    }

    /**
     * Entry orchestration plan for bottom sheet header click toggle.
     * @param {boolean} clickedButton
     * @param {boolean} isExpanded
     * @returns {Object}
     */
    function buildBottomSheetHeaderClickEntryOrchestrationPlan(clickedButton, isExpanded) {
        var allow = buildBottomSheetHeaderClickAllowedPlan(clickedButton);
        return {
            shouldToggle: allow.allowToggle,
            action: isExpanded ? 'collapse' : 'expand',
        };
    }

    /**
     * Entry orchestration plan for bottom sheet body click expand.
     * @param {boolean} clickedContent
     * @param {boolean} isExpanded
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildBottomSheetBodyClickEntryOrchestrationPlan(clickedContent, isExpanded, opts) {
        opts = opts || {};
        var expandPlan = buildBottomSheetBodyClickExpandPlan(clickedContent, isExpanded);
        return {
            shouldExpand: expandPlan.shouldExpand,
            logMessage: opts.sheetExpandClickLogMessage,
            action: 'expand',
        };
    }

    /**
     * Binding plan for expanding the sheet when route inputs receive focus.
     * @param {Array<string>} [inputIds]
     * @returns {Object}
     */
    function buildBottomSheetFocusExpandBindingPlan(inputIds) {
        var ids = Array.isArray(inputIds) ? inputIds.slice() : [];
        return {
            shouldBind: ids.length > 0,
            inputIds: ids,
            action: 'expand',
        };
    }

    /**
     * Update the global status banner (#status).
     * @param {string} message
     * @param {string} type
     */
    function showStatus(message, type) {
        if (typeof document === 'undefined') return;
        var status = document.getElementById('status');
        if (!status) return;
        status.textContent = message;
        status.className = 'status ' + type;
    }

    var api = {
        eventTargetElement: eventTargetElement,
        closest: closest,
        SWAP_LOCATIONS_FLASH_STYLE: SWAP_LOCATIONS_FLASH_STYLE,
        SWAP_LOCATIONS_REST_STYLE: SWAP_LOCATIONS_REST_STYLE,
        SWAP_LOCATIONS_FLASH_MS: SWAP_LOCATIONS_FLASH_MS,
        BOTTOM_SHEET_DRAG_THRESHOLD_PX: BOTTOM_SHEET_DRAG_THRESHOLD_PX,
        BOTTOM_SHEET_TAP_SLOP_PX: BOTTOM_SHEET_TAP_SLOP_PX,
        BOTTOM_SHEET_TOUCH_TAP_SLOP_PX: BOTTOM_SHEET_TOUCH_TAP_SLOP_PX,
        BOTTOM_SHEET_PEEK_HEIGHT_PX: BOTTOM_SHEET_PEEK_HEIGHT_PX,
        BOTTOM_SHEET_ID: BOTTOM_SHEET_ID,
        BOTTOM_SHEET_EXPANDED_CLASS: BOTTOM_SHEET_EXPANDED_CLASS,
        BOTTOM_SHEET_OVERLAP_ALWAYS_HIDE_IDS: BOTTOM_SHEET_OVERLAP_ALWAYS_HIDE_IDS,
        NAV_CONTROL_BUTTONS_ID: NAV_CONTROL_BUTTONS_ID,
        NAV_MENU_TOGGLE_ID: NAV_MENU_TOGGLE_ID,
        NAV_CONTROL_MENU_SELECTOR: NAV_CONTROL_MENU_SELECTOR,
        NAV_CONTROL_MENU_OPEN_CLASS: NAV_CONTROL_MENU_OPEN_CLASS,
        NAV_MENU_COLLAPSED_CLASS: NAV_MENU_COLLAPSED_CLASS,
        NAV_MENU_EXPANDED_CLASS: NAV_MENU_EXPANDED_CLASS,
        JOURNEY_SUMMARY_VISIBLE_BODY_CLASS: JOURNEY_SUMMARY_VISIBLE_BODY_CLASS,
        BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX: BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX,
        buildBottomSheetInitOrchestrationPlan: buildBottomSheetInitOrchestrationPlan,
        buildBottomSheetFullInitOrchestrationPlan: buildBottomSheetFullInitOrchestrationPlan,
        buildBottomSheetDragStartAllowedPlan: buildBottomSheetDragStartAllowedPlan,
        buildBottomSheetDragSnapPlan: buildBottomSheetDragSnapPlan,
        buildBottomSheetGestureMovePlan: buildBottomSheetGestureMovePlan,
        buildBottomSheetPointerDownAllowedPlan: buildBottomSheetPointerDownAllowedPlan,
        buildBottomSheetPointerCaptureOnDownPlan: buildBottomSheetPointerCaptureOnDownPlan,
        buildBottomSheetTouchTapFallbackPlan: buildBottomSheetTouchTapFallbackPlan,
        buildBottomSheetGestureConsumedPlan: buildBottomSheetGestureConsumedPlan,
        buildBottomSheetGestureEndPlan: buildBottomSheetGestureEndPlan,
        buildBottomSheetDragVisualFeedbackPlan: buildBottomSheetDragVisualFeedbackPlan,
        buildBottomSheetHeaderClickAllowedPlan: buildBottomSheetHeaderClickAllowedPlan,
        buildBottomSheetBodyClickExpandPlan: buildBottomSheetBodyClickExpandPlan,
        buildBottomSheetOverlapFabDisplayPlan: buildBottomSheetOverlapFabDisplayPlan,
        buildNavMenuToggleCollectPlan: buildNavMenuToggleCollectPlan,
        buildNavMenuStateApplyPlan: buildNavMenuStateApplyPlan,
        buildCollapseNavMenuExecutePlan: buildCollapseNavMenuExecutePlan,
        buildToggleNavMenuEntryOrchestrationPlan: buildToggleNavMenuEntryOrchestrationPlan,
        buildExpandBottomSheetExecutePlan: buildExpandBottomSheetExecutePlan,
        buildCollapseBottomSheetExecutePlan: buildCollapseBottomSheetExecutePlan,
        buildToggleBottomSheetCollectPlan: buildToggleBottomSheetCollectPlan,
        buildExpandBottomSheetEntryOrchestrationPlan: buildExpandBottomSheetEntryOrchestrationPlan,
        buildCollapseBottomSheetEntryOrchestrationPlan: buildCollapseBottomSheetEntryOrchestrationPlan,
        buildToggleBottomSheetEntryOrchestrationPlan: buildToggleBottomSheetEntryOrchestrationPlan,
        buildBottomSheetDragVisualEntryOrchestrationPlan: buildBottomSheetDragVisualEntryOrchestrationPlan,
        buildBottomSheetDragFinishEntryOrchestrationPlan: buildBottomSheetDragFinishEntryOrchestrationPlan,
        buildBottomSheetDragStartExecutePlan: buildBottomSheetDragStartExecutePlan,
        buildBottomSheetHandleClickEntryOrchestrationPlan: buildBottomSheetHandleClickEntryOrchestrationPlan,
        buildBottomSheetHeaderClickEntryOrchestrationPlan: buildBottomSheetHeaderClickEntryOrchestrationPlan,
        buildBottomSheetBodyClickEntryOrchestrationPlan: buildBottomSheetBodyClickEntryOrchestrationPlan,
        buildBottomSheetFocusExpandBindingPlan: buildBottomSheetFocusExpandBindingPlan,
        buildCollapseBottomSheetForRoutePreviewExecutePlan: buildCollapseBottomSheetForRoutePreviewExecutePlan,
        buildCollapseBottomSheetForRoutePreviewApplyPlan: buildCollapseBottomSheetForRoutePreviewApplyPlan,
        buildCollapseBottomSheetForRoutePreviewOrchestrationPlan:
            buildCollapseBottomSheetForRoutePreviewOrchestrationPlan,
        showStatus: showStatus,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDomHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

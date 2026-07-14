/**
 * @file Bottom sheet drawer orchestration (expand, collapse, drag, FAB overlap).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    var bottomSheetStartY = 0;
    var bottomSheetCurrentY = 0;
    var bottomSheetIsExpanded = false;

    function getBottomSheetStartY() { return bottomSheetStartY; }
    function setBottomSheetStartY(val) { bottomSheetStartY = val; }
    function getBottomSheetCurrentY() { return bottomSheetCurrentY; }
    function setBottomSheetCurrentY(val) { bottomSheetCurrentY = val; }
    function getBottomSheetIsExpanded() { return bottomSheetIsExpanded; }
    function setBottomSheetIsExpanded(val) { bottomSheetIsExpanded = !!val; }

    function rt() {
        if (!runtime) {
            throw new Error('[BottomSheet] Orchestration runtime not bound');
        }
        return runtime;
    }

    function DH() { return rt().domHelpers(); }

    function applyBottomSheetDragVisualFromPlan(feedback, bottomSheetEl) {
        if (!feedback || !feedback.shouldApplyTransform || !bottomSheetEl) return;
        bottomSheetEl.style.transform = 'translateY(' + feedback.transformTranslateY + 'px)';
    }

    function applyBottomSheetDragFinishFromPlan(entry) {
        if (!entry) return;

        const bottomSheet = document.getElementById('bottomSheet');
        if (!bottomSheet) return;

        (entry.clearInlineStyles || []).forEach((prop) => {
            bottomSheet.style[prop] = '';
        });

        if (entry.shouldCollapse) {
            collapseBottomSheet();
            if (entry.collapseLogMessage) console.log(entry.collapseLogMessage);
        } else if (entry.shouldExpand) {
            expandBottomSheet();
            if (entry.expandLogMessage) console.log(entry.expandLogMessage);
        }
    }

    function applyBottomSheetDragStartFromPlan(execute, bottomSheetEl) {
        if (!execute || !execute.shouldDisableTransition || !bottomSheetEl) return;
        bottomSheetEl.style.transition = execute.transitionValue;
    }

    function applyBottomSheetClickToggleFromPlan(entry) {
        if (!entry || !entry.shouldToggle) return;
        if (entry.logMessage != null) console.log(entry.logMessage, entry.logState);
        if (entry.action === 'collapse') collapseBottomSheet();
        else if (entry.action === 'expand') expandBottomSheet();
    }

    function applyBottomSheetBodyClickExpandFromPlan(entry) {
        if (!entry || !entry.shouldExpand) return;
        if (entry.logMessage) console.log(entry.logMessage);
        expandBottomSheet();
    }

    function applyBottomSheetFocusExpandBindingFromPlan(binding) {
        if (!binding || !binding.shouldBind) return;

        binding.inputIds.forEach((inputId) => {
            const input = document.getElementById(inputId);
            if (input) input.addEventListener('focus', expandBottomSheet);
        });
    }

    function applyBottomSheetGestureEndFromPlan(entry) {
        if (!entry) return;

        if (entry.kind === 'tap' && entry.shouldToggle) {
            applyBottomSheetClickToggleFromPlan(entry);
            return;
        }

        applyBottomSheetDragFinishFromPlan(entry);
    }

    function bindBottomSheetPointerGesture(el, bottomSheet, initPlan, options) {
        const domHelpers = DH();
        let pointerId = null;
        let isDragging = false;
        let suppressClick = false;
        options = options || {};

        const applyDragVisual = (diff) => {
            applyBottomSheetDragVisualFromPlan(
                domHelpers.buildBottomSheetDragVisualEntryOrchestrationPlan({
                    diff,
                    isExpanded: getBottomSheetIsExpanded(),
                    previewMaxPx: initPlan.dragCollapsePreviewMaxPx,
                }).feedback,
                bottomSheet
            );
        };

        const finishGesture = (diff) => {
            applyBottomSheetGestureEndFromPlan(
                domHelpers.buildBottomSheetGestureEndPlan(diff, isDragging, getBottomSheetIsExpanded(), {
                    thresholdPx: initPlan.dragThresholdPx,
                    collapseSwipeLogMessage: initPlan.collapseSwipeLogMessage,
                    expandSwipeLogMessage: initPlan.expandSwipeLogMessage,
                    tapLogMessage: options.tapLogMessage,
                })
            );
        };

        const resetGesture = () => {
            pointerId = null;
            isDragging = false;
        };

        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (options.shouldIgnoreTarget && options.shouldIgnoreTarget(e.target)) return;

            pointerId = e.pointerId;
            isDragging = false;
            suppressClick = false;
            setBottomSheetStartY(e.clientY);
            setBottomSheetCurrentY(getBottomSheetStartY());
            applyBottomSheetDragStartFromPlan(domHelpers.buildBottomSheetDragStartExecutePlan(), bottomSheet);
        });

        el.addEventListener('pointermove', (e) => {
            if (pointerId == null || e.pointerId !== pointerId) return;

            const movePlan = domHelpers.buildBottomSheetGestureMovePlan({
                startY: getBottomSheetStartY(),
                currentY: e.clientY,
                isDragging: isDragging,
            });
            const wasDragging = isDragging;
            isDragging = movePlan.isDragging;
            setBottomSheetCurrentY(e.clientY);

            if (!movePlan.shouldApplyDrag) return;

            // Capture only once a real drag starts. Capturing on pointerdown
            // breaks tap toggling in Firefox (touch capture suppresses the
            // synthesized click and can fire pointercancel early).
            if (!wasDragging && typeof el.setPointerCapture === 'function') {
                el.setPointerCapture(e.pointerId);
            }
            applyDragVisual(movePlan.diff);
        });

        const onPointerEnd = (e) => {
            if (pointerId == null || e.pointerId !== pointerId) return;

            const diff = e.clientY - getBottomSheetStartY();
            if (!isDragging) {
                suppressClick = true;
            }
            finishGesture(diff);
            resetGesture();

            if (typeof el.releasePointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
                el.releasePointerCapture(e.pointerId);
            }
        };

        el.addEventListener('pointerup', onPointerEnd);
        el.addEventListener('pointercancel', onPointerEnd);

        if (options.useClickFallback) {
            el.addEventListener('click', (e) => {
                if (suppressClick) {
                    suppressClick = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (options.shouldIgnoreTarget && options.shouldIgnoreTarget(e.target)) {
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                applyBottomSheetClickToggleFromPlan(
                    domHelpers.buildBottomSheetHandleClickEntryOrchestrationPlan(getBottomSheetIsExpanded(), {
                        handleClickLogMessage: options.tapLogMessage,
                    })
                );
            });
        }
    }

    function applyBottomSheetStateFromPlan(execute) {
        const domHelpers = DH();
        if (!execute || !execute.shouldApply) return;

        const bottomSheet = document.getElementById(execute.bottomSheetId || domHelpers.BOTTOM_SHEET_ID);
        if (!bottomSheet) return;

        if (execute.expandLogMessage) console.log(execute.expandLogMessage);
        if (execute.collapseLogMessage) console.log(execute.collapseLogMessage);

        (execute.clearInlineStyles || []).forEach((prop) => {
            bottomSheet.style[prop] = '';
        });

        if (execute.setExpandedState) {
            bottomSheet.classList.add(execute.expandedClass || domHelpers.BOTTOM_SHEET_EXPANDED_CLASS);
            bottomSheet.setAttribute('aria-expanded', execute.ariaExpanded || 'true');
            setBottomSheetIsExpanded(true);
            if (execute.expandedLogMessage) {
                console.log(execute.expandedLogMessage, bottomSheet.className);
            }
        } else if (execute.setExpandedState === false) {
            bottomSheet.classList.remove(execute.expandedClass || domHelpers.BOTTOM_SHEET_EXPANDED_CLASS);
            bottomSheet.setAttribute('aria-expanded', execute.ariaExpanded || 'false');
            setBottomSheetIsExpanded(false);
            if (execute.resetContentScroll && execute.contentSelector) {
                const content = bottomSheet.querySelector(execute.contentSelector);
                if (content) content.scrollTop = 0;
            }
        }

        if (execute.syncOverlapFabs) syncBottomSheetOverlapFabs();
    }

    function syncBottomSheetOverlapFabs() {
        const domHelpers = DH();
        const bottomSheet = document.getElementById(domHelpers.BOTTOM_SHEET_ID);
        const execute = domHelpers.buildBottomSheetOverlapFabDisplayPlan({
            sheetExpanded: !!(bottomSheet && bottomSheet.classList.contains(domHelpers.BOTTOM_SHEET_EXPANDED_CLASS)),
            routeInProgress: rt().getRouteInProgress(),
        });
        if (!execute.shouldApply) return;

        (execute.alwaysHideWhenExpanded || []).forEach(({ id, action }) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (action === 'hide') {
                el.style.display = 'none';
            } else {
                el.style.removeProperty('display');
            }
        });

        (execute.navFabDisplays || []).forEach(({ id, display }) => {
            const el = document.getElementById(id);
            if (el) el.style.display = display;
        });
    }

    function toggleBottomSheet() {
        applyBottomSheetStateFromPlan(
            DH().buildToggleBottomSheetEntryOrchestrationPlan(getBottomSheetIsExpanded()).execute
        );
    }

    function expandBottomSheet() {
        applyBottomSheetStateFromPlan(
            DH().buildExpandBottomSheetEntryOrchestrationPlan().execute
        );
    }

    function collapseBottomSheet() {
        applyBottomSheetStateFromPlan(
            DH().buildCollapseBottomSheetEntryOrchestrationPlan().execute
        );
    }

    function initBottomSheet() {
        const domHelpers = DH();
        const bottomSheet = document.getElementById('bottomSheet');
        const handle = document.querySelector('.bottom-sheet-handle');
        const header = document.querySelector('.bottom-sheet-header');
        const initPlan = domHelpers.buildBottomSheetFullInitOrchestrationPlan(!!bottomSheet, !!handle);

        console.log(initPlan.initLogMessage, { bottomSheet, handle, header });

        if (!initPlan.shouldInit) {
            console.error(initPlan.missingElementsErrorLog);
            return;
        }

        bindBottomSheetPointerGesture(handle, bottomSheet, initPlan, {
            useClickFallback: true,
            tapLogMessage: initPlan.handleClickLogMessage,
        });

        if (header) {
            bindBottomSheetPointerGesture(header, bottomSheet, initPlan, {
                useClickFallback: true,
                shouldIgnoreTarget: (target) => !!domHelpers.closest(target, initPlan.headerButtonIgnoreSelector),
                tapLogMessage: initPlan.handleClickLogMessage,
            });
        }

        bottomSheet.addEventListener('click', (e) => {
            applyBottomSheetBodyClickExpandFromPlan(
                domHelpers.buildBottomSheetBodyClickEntryOrchestrationPlan(
                    !!domHelpers.closest(e.target, initPlan.contentSelector),
                    getBottomSheetIsExpanded(),
                    { sheetExpandClickLogMessage: initPlan.sheetExpandClickLogMessage }
                )
            );
        });

        applyBottomSheetFocusExpandBindingFromPlan(
            domHelpers.buildBottomSheetFocusExpandBindingPlan(initPlan.focusExpandInputIds)
        );

        syncBottomSheetOverlapFabs();
    }

    function applyCollapseBottomSheetForRoutePreviewFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        var bottomSheet = document.getElementById(apply.bottomSheetId);
        if (!bottomSheet) return;

        (apply.clearInlineStyles || []).forEach(function (prop) {
            bottomSheet.style[prop] = '';
        });
        if (apply.collapse) collapseBottomSheet();

        var handle = bottomSheet.querySelector(apply.handleSelector);
        if (handle && apply.handleTitle) handle.title = apply.handleTitle;
        if (apply.logMessage) console.log(apply.logMessage);
    }

    function collapseBottomSheetForRoutePreview() {
        applyCollapseBottomSheetForRoutePreviewFromPlan(
            DH().buildCollapseBottomSheetForRoutePreviewOrchestrationPlan().apply
        );
    }

    function debugScrollIssue() {
        var bsc = document.querySelector('.bottom-sheet-content');
        var rpt = document.getElementById('routePreviewTab');
        var navTab = document.getElementById('navigationTab');
        var settingsTab = document.getElementById('settingsTab');

        console.log('=== SCROLL DEBUG ===');
        console.log('bottom-sheet-content:', bsc ? {
            scrollHeight: bsc.scrollHeight,
            clientHeight: bsc.clientHeight,
            scrollTop: bsc.scrollTop,
            offsetHeight: bsc.offsetHeight,
            overflowY: getComputedStyle(bsc).overflowY,
            maxHeight: getComputedStyle(bsc).maxHeight,
            display: getComputedStyle(bsc).display,
        } : 'NOT FOUND');

        console.log('routePreviewTab:', rpt ? {
            scrollHeight: rpt.scrollHeight,
            clientHeight: rpt.clientHeight,
            display: rpt.style.display,
            computedDisplay: getComputedStyle(rpt).display,
            overflow: getComputedStyle(rpt).overflow,
        } : 'NOT FOUND');

        console.log('navigationTab:', navTab ? {
            display: navTab.style.display,
            computedDisplay: getComputedStyle(navTab).display,
        } : 'NOT FOUND');

        console.log('settingsTab:', settingsTab ? {
            display: settingsTab.style.display,
            computedDisplay: getComputedStyle(settingsTab).display,
        } : 'NOT FOUND');

        var allTabs = document.querySelectorAll('.bottom-sheet-content > div[id$="Tab"]');
        console.log('All tabs:', Array.from(allTabs).map(function (t) {
            return {
                id: t.id,
                display: t.style.display,
                computedDisplay: getComputedStyle(t).display,
                height: t.offsetHeight,
            };
        }));

        return 'Debug info logged above';
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        collapseBottomSheetForRoutePreview: collapseBottomSheetForRoutePreview,
        applyBottomSheetDragVisualFromPlan: applyBottomSheetDragVisualFromPlan,
        applyBottomSheetDragFinishFromPlan: applyBottomSheetDragFinishFromPlan,
        applyBottomSheetDragStartFromPlan: applyBottomSheetDragStartFromPlan,
        applyBottomSheetClickToggleFromPlan: applyBottomSheetClickToggleFromPlan,
        applyBottomSheetBodyClickExpandFromPlan: applyBottomSheetBodyClickExpandFromPlan,
        applyBottomSheetFocusExpandBindingFromPlan: applyBottomSheetFocusExpandBindingFromPlan,
        applyBottomSheetStateFromPlan: applyBottomSheetStateFromPlan,
        syncBottomSheetOverlapFabs: syncBottomSheetOverlapFabs,
        toggleBottomSheet: toggleBottomSheet,
        expandBottomSheet: expandBottomSheet,
        collapseBottomSheet: collapseBottomSheet,
        initBottomSheet: initBottomSheet,
        debugScrollIssue: debugScrollIssue,
        getBottomSheetStartY: getBottomSheetStartY,
        setBottomSheetStartY: setBottomSheetStartY,
        getBottomSheetCurrentY: getBottomSheetCurrentY,
        setBottomSheetCurrentY: setBottomSheetCurrentY,
        getBottomSheetIsExpanded: getBottomSheetIsExpanded,
        setBottomSheetIsExpanded: setBottomSheetIsExpanded,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrBottomSheetOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

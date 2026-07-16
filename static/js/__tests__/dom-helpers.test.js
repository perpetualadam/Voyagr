/**
 * @jest-environment jsdom
 */
const Dom = require('../modules/ui/dom-helpers.js');

describe('dom-helpers', () => {
    test('eventTargetElement returns element nodes unchanged', () => {
        const el = document.createElement('button');
        expect(Dom.eventTargetElement(el)).toBe(el);
    });

    test('eventTargetElement promotes text node to parent element', () => {
        const parent = document.createElement('span');
        const text = document.createTextNode('Go');
        parent.appendChild(text);
        expect(Dom.eventTargetElement(text)).toBe(parent);
    });

    test('eventTargetElement returns null for non-nodes', () => {
        expect(Dom.eventTargetElement(null)).toBeNull();
        expect(Dom.eventTargetElement('x')).toBeNull();
    });

    test('closest finds ancestor from text node target', () => {
        const outer = document.createElement('div');
        outer.className = 'waypoint-item';
        const inner = document.createElement('span');
        const text = document.createTextNode('Stop');
        inner.appendChild(text);
        outer.appendChild(inner);
        document.body.appendChild(outer);
        expect(Dom.closest(text, '.waypoint-item')).toBe(outer);
    });

    test('showStatus updates #status text and class', () => {
        const status = document.createElement('div');
        status.id = 'status';
        document.body.appendChild(status);

        Dom.showStatus('Ready', 'success');
        expect(status.textContent).toBe('Ready');
        expect(status.className).toBe('status success');
    });

    test('showStatus no-ops when #status is missing', () => {
        expect(() => Dom.showStatus('x', 'info')).not.toThrow();
    });

    test('swap locations flash style constants', () => {
        expect(Dom.SWAP_LOCATIONS_FLASH_STYLE.background).toBe('#e3f2fd');
        expect(Dom.SWAP_LOCATIONS_REST_STYLE.borderColor).toBe('#ddd');
        expect(Dom.SWAP_LOCATIONS_FLASH_MS).toBe(300);
        expect(Dom.BOTTOM_SHEET_PEEK_HEIGHT_PX).toBe(110);
    });

    test('buildBottomSheetInitOrchestrationPlan requires sheet and handle', () => {
        expect(Dom.buildBottomSheetInitOrchestrationPlan(false, true).shouldInit).toBe(false);
        const plan = Dom.buildBottomSheetInitOrchestrationPlan(true, true);
        expect(plan.shouldInit).toBe(true);
        expect(plan.dragThresholdPx).toBe(Dom.BOTTOM_SHEET_DRAG_THRESHOLD_PX);
    });

    test('buildBottomSheetDragSnapPlan expands, collapses, or reverts', () => {
        expect(Dom.buildBottomSheetDragSnapPlan(-60, false).action).toBe('expand');
        expect(Dom.buildBottomSheetDragSnapPlan(60, true).action).toBe('collapse');
        expect(Dom.buildBottomSheetDragSnapPlan(5, true).action).toBe('revert');
        expect(Dom.buildBottomSheetDragStartAllowedPlan(true, false).allowDrag).toBe(true);
    });

    test('buildBottomSheetGestureMovePlan starts drag only after tap slop', () => {
        expect(Dom.buildBottomSheetGestureMovePlan({
            startY: 100,
            currentY: 104,
            isDragging: false,
        }).shouldApplyDrag).toBe(false);

        const drag = Dom.buildBottomSheetGestureMovePlan({
            startY: 100,
            currentY: 120,
            isDragging: false,
        });
        expect(drag.isDragging).toBe(true);
        expect(drag.shouldApplyDrag).toBe(true);
        expect(drag.diff).toBe(20);
    });

    test('buildBottomSheetGestureMovePlan uses wider slop for touch pointers', () => {
        expect(Dom.buildBottomSheetGestureMovePlan({
            startY: 100,
            currentY: 115,
            isDragging: false,
            pointerType: 'touch',
        }).shouldApplyDrag).toBe(false);

        expect(Dom.buildBottomSheetGestureMovePlan({
            startY: 100,
            currentY: 120,
            isDragging: false,
            pointerType: 'touch',
        }).shouldApplyDrag).toBe(true);
    });

    test('buildBottomSheetGestureEndPlan toggles on tap and snaps on drag', () => {
        const tap = Dom.buildBottomSheetGestureEndPlan(0, false, false, {
            tapLogMessage: 'tapped',
        });
        expect(tap.kind).toBe('tap');
        expect(tap.shouldToggle).toBe(true);
        expect(tap.action).toBe('expand');

        const drag = Dom.buildBottomSheetGestureEndPlan(60, true, true, {
            thresholdPx: 50,
            collapseSwipeLogMessage: 'collapsed',
        });
        expect(drag.kind).toBe('drag');
        expect(drag.shouldCollapse).toBe(true);
    });

    test('buildBottomSheetGestureEndPlan promotes short drag revert to tap', () => {
        const promoted = Dom.buildBottomSheetGestureEndPlan(20, true, false, {
            thresholdPx: 50,
            tapLogMessage: 'tapped',
        });
        expect(promoted.kind).toBe('tap');
        expect(promoted.shouldToggle).toBe(true);
        expect(promoted.action).toBe('expand');
        expect(promoted.promotedFromDragRevert).toBe(true);

        const revert = Dom.buildBottomSheetGestureEndPlan(60, true, false, {
            thresholdPx: 50,
        });
        expect(revert.kind).toBe('drag');
        expect(revert.shouldExpand).toBeFalsy();
        expect(revert.shouldCollapse).toBeFalsy();
    });

    test('buildBottomSheetGestureConsumedPlan only marks real toggles consumed', () => {
        expect(Dom.buildBottomSheetGestureConsumedPlan({
            kind: 'tap',
            shouldToggle: true,
        }).consumed).toBe(true);

        expect(Dom.buildBottomSheetGestureConsumedPlan({
            kind: 'drag',
            shouldCollapse: true,
        }).consumed).toBe(true);

        expect(Dom.buildBottomSheetGestureConsumedPlan({
            kind: 'drag',
            snap: { action: 'revert' },
        }).consumed).toBe(false);
    });

    test('buildBottomSheetPointerDownAllowedPlan ignores non-primary mouse buttons only', () => {
        expect(Dom.buildBottomSheetPointerDownAllowedPlan({
            pointerType: 'mouse',
            button: 1,
        }).allowed).toBe(false);
        expect(Dom.buildBottomSheetPointerDownAllowedPlan({
            pointerType: 'touch',
            button: -1,
        }).allowed).toBe(true);
    });

    test('buildBottomSheetPointerCaptureOnDownPlan defers Firefox touch capture', () => {
        expect(Dom.buildBottomSheetPointerCaptureOnDownPlan({
            pointerType: 'touch',
            userAgent: 'Mozilla/5.0 Firefox/128.0',
        }).shouldCapture).toBe(false);

        expect(Dom.buildBottomSheetPointerCaptureOnDownPlan({
            pointerType: 'touch',
            userAgent: 'Mozilla/5.0 Chrome/128.0',
        }).shouldCapture).toBe(true);

        expect(Dom.buildBottomSheetPointerCaptureOnDownPlan({
            pointerType: 'mouse',
            userAgent: 'Mozilla/5.0 Firefox/128.0',
        }).shouldCapture).toBe(false);
    });

    test('buildBottomSheetTouchTapFallbackPlan enables on Firefox user agents', () => {
        expect(Dom.buildBottomSheetTouchTapFallbackPlan('Mozilla/5.0 Firefox/128.0').enabled)
            .toBe(true);
        expect(Dom.buildBottomSheetTouchTapFallbackPlan('Mozilla/5.0 Chrome/128.0').enabled)
            .toBe(false);
    });

    test('buildBottomSheetDragVisualFeedbackPlan clamps expand preview', () => {
        const down = Dom.buildBottomSheetDragVisualFeedbackPlan({ diff: 30, isExpanded: true });
        expect(down.shouldApplyTransform).toBe(true);
        expect(down.transformTranslateY).toBe(30);

        const up = Dom.buildBottomSheetDragVisualFeedbackPlan({ diff: -200, isExpanded: false });
        expect(up.transformTranslateY).toBe(-100);

        const noop = Dom.buildBottomSheetDragVisualFeedbackPlan({ diff: 5, isExpanded: false });
        expect(noop.shouldApplyTransform).toBe(false);
    });

    test('buildBottomSheetFullInitOrchestrationPlan extends base init plan', () => {
        const plan = Dom.buildBottomSheetFullInitOrchestrationPlan(true, true, {
            userAgent: 'Mozilla/5.0 Firefox/128.0',
        });
        expect(plan.focusExpandInputIds).toContain('start');
        expect(plan.dragCollapsePreviewMaxPx).toBe(Dom.BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX);
        expect(plan.touchTapFallback).toBe(true);
        expect(plan.touchTapSlopPx).toBe(Dom.BOTTOM_SHEET_TOUCH_TAP_SLOP_PX);
    });

    test('buildBottomSheetOverlapFabDisplayPlan hides nav FABs when sheet expanded', () => {
        const expandedNav = Dom.buildBottomSheetOverlapFabDisplayPlan({
            sheetExpanded: true,
            routeInProgress: true,
        });
        expect(expandedNav.navFabDisplays.find((item) => item.id === 'zoomFollowToggle').display).toBe('none');
        expect(expandedNav.navFabDisplays.find((item) => item.id === 'endNavigationBtn').display).toBe('block');
        expect(expandedNav.alwaysHideWhenExpanded[0].action).toBe('hide');

        const idle = Dom.buildBottomSheetOverlapFabDisplayPlan({
            sheetExpanded: false,
            routeInProgress: false,
        });
        expect(idle.alwaysHideWhenExpanded[0].action).toBe('clearDisplay');
        expect(idle.navFabDisplays.every((item) => item.display === 'none')).toBe(true);
    });

    test('buildExpandBottomSheetExecutePlan and toggle collect plan', () => {
        const expand = Dom.buildExpandBottomSheetExecutePlan();
        expect(expand.setExpandedState).toBe(true);
        expect(expand.syncOverlapFabs).toBe(true);

        const collapse = Dom.buildCollapseBottomSheetExecutePlan();
        expect(collapse.setExpandedState).toBe(false);
        expect(collapse.resetContentScroll).toBe(true);

        expect(Dom.buildToggleBottomSheetCollectPlan({ isExpanded: true }).collapse).toBe(true);
        expect(Dom.buildCollapseBottomSheetForRoutePreviewExecutePlan().handleTitle)
            .toContain('Swipe up');

        const preview = Dom.buildCollapseBottomSheetForRoutePreviewOrchestrationPlan();
        expect(preview.apply.shouldApply).toBe(true);
        expect(preview.apply.bottomSheetId).toBe(Dom.BOTTOM_SHEET_ID);
        expect(preview.apply.collapse).toBe(true);
    });

    test('buildExpandBottomSheetEntryOrchestrationPlan and toggle entry plan', () => {
        const expand = Dom.buildExpandBottomSheetEntryOrchestrationPlan();
        expect(expand.execute.setExpandedState).toBe(true);

        const collapse = Dom.buildCollapseBottomSheetEntryOrchestrationPlan();
        expect(collapse.execute.setExpandedState).toBe(false);

        const toggleExpand = Dom.buildToggleBottomSheetEntryOrchestrationPlan(false);
        expect(toggleExpand.collected.expand).toBe(true);
        expect(toggleExpand.execute.setExpandedState).toBe(true);

        const toggleCollapse = Dom.buildToggleBottomSheetEntryOrchestrationPlan(true);
        expect(toggleCollapse.collected.collapse).toBe(true);
        expect(toggleCollapse.execute.setExpandedState).toBe(false);
    });

    test('buildBottomSheetDragVisualEntryOrchestrationPlan and drag finish entry plan', () => {
        const visual = Dom.buildBottomSheetDragVisualEntryOrchestrationPlan({
            diff: 30,
            isExpanded: true,
        });
        expect(visual.feedback.shouldApplyTransform).toBe(true);
        expect(visual.feedback.transformTranslateY).toBe(30);

        const finish = Dom.buildBottomSheetDragFinishEntryOrchestrationPlan(60, true, {
            thresholdPx: 50,
            collapseSwipeLogMessage: 'collapsed',
            expandSwipeLogMessage: 'expanded',
        });
        expect(finish.shouldCollapse).toBe(true);
        expect(finish.collapseLogMessage).toBe('collapsed');

        const start = Dom.buildBottomSheetDragStartExecutePlan();
        expect(start.shouldDisableTransition).toBe(true);
        expect(start.transitionValue).toBe('none');
    });

    test('buildBottomSheet click entry orchestration plans choose toggle actions', () => {
        const handle = Dom.buildBottomSheetHandleClickEntryOrchestrationPlan(false, {
            handleClickLogMessage: 'handle click',
        });
        expect(handle.shouldToggle).toBe(true);
        expect(handle.action).toBe('expand');
        expect(handle.logMessage).toBe('handle click');

        const header = Dom.buildBottomSheetHeaderClickEntryOrchestrationPlan(false, true);
        expect(header.shouldToggle).toBe(true);
        expect(header.action).toBe('collapse');
        expect(Dom.buildBottomSheetHeaderClickEntryOrchestrationPlan(true, false).shouldToggle)
            .toBe(false);

        const body = Dom.buildBottomSheetBodyClickEntryOrchestrationPlan(false, false, {
            sheetExpandClickLogMessage: 'expand sheet',
        });
        expect(body.shouldExpand).toBe(true);
        expect(body.logMessage).toBe('expand sheet');
    });

    test('buildBottomSheetFocusExpandBindingPlan lists focus-expand input ids', () => {
        const binding = Dom.buildBottomSheetFocusExpandBindingPlan(['start', 'end']);
        expect(binding.shouldBind).toBe(true);
        expect(binding.inputIds).toEqual(['start', 'end']);
        expect(binding.action).toBe('expand');
        expect(Dom.buildBottomSheetFocusExpandBindingPlan([]).shouldBind).toBe(false);
    });
});

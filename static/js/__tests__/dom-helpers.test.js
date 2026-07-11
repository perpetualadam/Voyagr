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

    test('swap locations flash style constants', () => {
        expect(Dom.SWAP_LOCATIONS_FLASH_STYLE.background).toBe('#e3f2fd');
        expect(Dom.SWAP_LOCATIONS_REST_STYLE.borderColor).toBe('#ddd');
        expect(Dom.SWAP_LOCATIONS_FLASH_MS).toBe(300);
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
        const plan = Dom.buildBottomSheetFullInitOrchestrationPlan(true, true);
        expect(plan.focusExpandInputIds).toContain('start');
        expect(plan.dragCollapsePreviewMaxPx).toBe(Dom.BOTTOM_SHEET_DRAG_COLLAPSE_PREVIEW_MAX_PX);
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
    });
});

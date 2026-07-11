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
        expect(Dom.buildBottomSheetDragSnapPlan(5, true).action).toBe('expand');
        expect(Dom.buildBottomSheetDragStartAllowedPlan(true, false).allowDrag).toBe(true);
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
});

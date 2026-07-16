/**
 * Tests for modules/ui/nav-menu.js
 */
const NavMenu = require('../modules/ui/nav-menu.js');

describe('nav-menu module', () => {
    test('resolveNavMenuOpenFromAriaExpanded reads toggle state', () => {
        expect(NavMenu.resolveNavMenuOpenFromAriaExpanded('true')).toBe(true);
        expect(NavMenu.resolveNavMenuOpenFromAriaExpanded('false')).toBe(false);
        expect(NavMenu.resolveNavMenuOpenFromAriaExpanded(null)).toBe(false);
    });

    test('buildToggleNavMenuEntryOrchestrationPlan opens and closes menu', () => {
        const open = NavMenu.buildToggleNavMenuEntryOrchestrationPlan(false);
        expect(open.collected.nextOpen).toBe(true);
        expect(open.execute.open).toBe(true);
        expect(open.execute.ariaExpanded).toBe('true');
        expect(open.execute.panelHidden).toBe(false);
        expect(open.execute.toggleIcon).toBe('\u2715');

        const close = NavMenu.buildToggleNavMenuEntryOrchestrationPlan(true);
        expect(close.collected.nextOpen).toBe(false);
        expect(close.execute.open).toBe(false);
        expect(close.execute.panelHidden).toBe(true);
        expect(close.execute.toggleIcon).toBe('\u2630');
    });

    test('buildNavMenuToggleDebouncedPlan ignores rapid repeat taps', () => {
        expect(NavMenu.buildNavMenuToggleDebouncedPlan(1000, 900).shouldToggle).toBe(false);
        expect(NavMenu.buildNavMenuToggleDebouncedPlan(1000, 500).shouldToggle).toBe(true);
        expect(NavMenu.buildNavMenuToggleDebouncedPlan(1000, 500).nextToggleAtMs).toBe(1000);
    });
});

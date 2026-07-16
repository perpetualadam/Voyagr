/**
 * @file Pure helpers for the bottom-right map action menu (hamburger).
 * @module modules/ui/nav-menu
 */
(function (root) {
    'use strict';

    var NAV_CONTROL_BUTTONS_ID = 'navControlButtons';
    var NAV_MENU_TOGGLE_ID = 'navMenuToggle';
    var NAV_CONTROL_MENU_SELECTOR = '.nav-control-menu';
    var NAV_CONTROL_MENU_OPEN_CLASS = 'nav-control-menu--open';
    var NAV_MENU_COLLAPSED_CLASS = 'nav-menu-collapsed';
    var NAV_MENU_EXPANDED_CLASS = 'nav-menu-expanded';
    var NAV_MENU_TOGGLE_DEBOUNCE_MS = 400;
    var NAV_MENU_ICON_OPEN = '\u2715';
    var NAV_MENU_ICON_CLOSED = '\u2630';

    /**
     * @param {string|null|undefined} ariaExpanded
     * @returns {boolean}
     */
    function resolveNavMenuOpenFromAriaExpanded(ariaExpanded) {
        return ariaExpanded === 'true';
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.isOpen]
     * @returns {Object}
     */
    function buildNavMenuToggleCollectPlan(input) {
        input = input || {};
        return { nextOpen: !input.isOpen };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.open]
     * @returns {Object}
     */
    function buildNavMenuStateApplyPlan(input) {
        input = input || {};
        var open = !!input.open;
        return {
            shouldApply: true,
            open: open,
            navControlButtonsId: NAV_CONTROL_BUTTONS_ID,
            navMenuToggleId: NAV_MENU_TOGGLE_ID,
            navControlMenuSelector: NAV_CONTROL_MENU_SELECTOR,
            navControlMenuOpenClass: NAV_CONTROL_MENU_OPEN_CLASS,
            collapsedClass: NAV_MENU_COLLAPSED_CLASS,
            expandedClass: NAV_MENU_EXPANDED_CLASS,
            ariaExpanded: open ? 'true' : 'false',
            toggleIcon: open ? NAV_MENU_ICON_OPEN : NAV_MENU_ICON_CLOSED,
            panelHidden: !open,
        };
    }

    /**
     * @returns {Object}
     */
    function buildCollapseNavMenuExecutePlan() {
        return buildNavMenuStateApplyPlan({ open: false });
    }

    /**
     * @param {boolean} isOpen
     * @returns {Object}
     */
    function buildToggleNavMenuEntryOrchestrationPlan(isOpen) {
        var collected = buildNavMenuToggleCollectPlan({ isOpen: !!isOpen });
        return {
            collected: collected,
            execute: buildNavMenuStateApplyPlan({ open: collected.nextOpen }),
        };
    }

    /**
     * @param {number} [nowMs]
     * @param {number} [lastToggleAtMs]
     * @returns {Object}
     */
    function buildNavMenuToggleDebouncedPlan(nowMs, lastToggleAtMs) {
        var now = nowMs != null ? nowMs : 0;
        var last = lastToggleAtMs != null ? lastToggleAtMs : 0;
        if (now - last < NAV_MENU_TOGGLE_DEBOUNCE_MS) {
            return { shouldToggle: false };
        }
        return { shouldToggle: true, nextToggleAtMs: now };
    }

    var api = {
        NAV_CONTROL_BUTTONS_ID: NAV_CONTROL_BUTTONS_ID,
        NAV_MENU_TOGGLE_ID: NAV_MENU_TOGGLE_ID,
        NAV_CONTROL_MENU_SELECTOR: NAV_CONTROL_MENU_SELECTOR,
        NAV_CONTROL_MENU_OPEN_CLASS: NAV_CONTROL_MENU_OPEN_CLASS,
        NAV_MENU_COLLAPSED_CLASS: NAV_MENU_COLLAPSED_CLASS,
        NAV_MENU_EXPANDED_CLASS: NAV_MENU_EXPANDED_CLASS,
        NAV_MENU_TOGGLE_DEBOUNCE_MS: NAV_MENU_TOGGLE_DEBOUNCE_MS,
        resolveNavMenuOpenFromAriaExpanded: resolveNavMenuOpenFromAriaExpanded,
        buildNavMenuToggleCollectPlan: buildNavMenuToggleCollectPlan,
        buildNavMenuStateApplyPlan: buildNavMenuStateApplyPlan,
        buildCollapseNavMenuExecutePlan: buildCollapseNavMenuExecutePlan,
        buildToggleNavMenuEntryOrchestrationPlan: buildToggleNavMenuEntryOrchestrationPlan,
        buildNavMenuToggleDebouncedPlan: buildNavMenuToggleDebouncedPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrNavMenu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Map action menu (bottom-right hamburger) orchestration.
 */
(function (root) {
    'use strict';

    function DH() {
        return root.VoyagrDomHelpers;
    }

    function applyNavMenuStateFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;

        var navButtons = document.getElementById(execute.navControlButtonsId);
        var toggle = document.getElementById(execute.navMenuToggleId);
        if (!navButtons) return;

        if (execute.expand) {
            navButtons.classList.remove(execute.collapsedClass);
            navButtons.classList.add(execute.expandedClass);
        } else if (execute.collapse) {
            navButtons.classList.remove(execute.expandedClass);
            navButtons.classList.add(execute.collapsedClass);
        }

        if (toggle && execute.ariaExpanded != null) {
            toggle.setAttribute('aria-expanded', execute.ariaExpanded);
        }
    }

    function toggleNavMenu() {
        var domHelpers = DH();
        var navButtons = document.getElementById(domHelpers.NAV_CONTROL_BUTTONS_ID);
        if (!navButtons) return;

        var plan = domHelpers.buildToggleNavMenuEntryOrchestrationPlan(
            navButtons.classList.contains(domHelpers.NAV_MENU_COLLAPSED_CLASS)
        );
        applyNavMenuStateFromPlan(plan.execute);
    }

    function collapseNavMenu() {
        applyNavMenuStateFromPlan(DH().buildCollapseNavMenuExecutePlan());
    }

    var api = {
        applyNavMenuStateFromPlan: applyNavMenuStateFromPlan,
        toggleNavMenu: toggleNavMenu,
        collapseNavMenu: collapseNavMenu,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrNavMenuOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

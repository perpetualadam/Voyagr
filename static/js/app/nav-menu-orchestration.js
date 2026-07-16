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
        var menu = execute.navControlMenuSelector
            ? document.querySelector(execute.navControlMenuSelector)
            : null;
        if (!navButtons) return;

        if (execute.expand) {
            navButtons.classList.remove(execute.collapsedClass);
            navButtons.classList.add(execute.expandedClass);
            if (menu && execute.navControlMenuOpenClass) {
                menu.classList.add(execute.navControlMenuOpenClass);
            }
        } else if (execute.collapse) {
            navButtons.classList.remove(execute.expandedClass);
            navButtons.classList.add(execute.collapsedClass);
            if (menu && execute.navControlMenuOpenClass) {
                menu.classList.remove(execute.navControlMenuOpenClass);
            }
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

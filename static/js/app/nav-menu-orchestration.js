/**
 * @file Map action menu (bottom-right hamburger) orchestration.
 */
(function (root) {
    'use strict';

    var NAV_MENU_BOUND_DATASET = 'voyagrNavMenuBound';
    var lastNavMenuToggleAtMs = 0;

    function NM() {
        return root.VoyagrNavMenu;
    }

    function readNavMenuOpen(toggle) {
        if (!toggle) return false;
        return NM().resolveNavMenuOpenFromAriaExpanded(toggle.getAttribute('aria-expanded'));
    }

    function applyNavMenuStateFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;

        var navButtons = document.getElementById(execute.navControlButtonsId);
        var toggle = document.getElementById(execute.navMenuToggleId);
        var menu = execute.navControlMenuSelector
            ? document.querySelector(execute.navControlMenuSelector)
            : null;
        if (!navButtons || !toggle) return;

        if (menu && execute.navControlMenuOpenClass) {
            menu.classList.toggle(execute.navControlMenuOpenClass, !!execute.open);
        }

        navButtons.classList.toggle(execute.expandedClass, !!execute.open);
        navButtons.classList.toggle(execute.collapsedClass, !execute.open);

        if (execute.panelHidden) {
            navButtons.setAttribute('hidden', '');
        } else {
            navButtons.removeAttribute('hidden');
        }

        toggle.setAttribute('aria-expanded', execute.ariaExpanded);
        toggle.classList.toggle('nav-menu-toggle--open', !!execute.open);
        if (execute.toggleIcon != null) {
            toggle.textContent = execute.toggleIcon;
        }
    }

    function toggleNavMenu() {
        var navMenu = NM();
        var toggle = document.getElementById(navMenu.NAV_MENU_TOGGLE_ID);
        if (!toggle) return;

        var debounced = navMenu.buildNavMenuToggleDebouncedPlan(Date.now(), lastNavMenuToggleAtMs);
        if (!debounced.shouldToggle) return;
        lastNavMenuToggleAtMs = debounced.nextToggleAtMs;

        var plan = navMenu.buildToggleNavMenuEntryOrchestrationPlan(readNavMenuOpen(toggle));
        applyNavMenuStateFromPlan(plan.execute);
    }

    function collapseNavMenu() {
        applyNavMenuStateFromPlan(NM().buildCollapseNavMenuExecutePlan());
    }

    function initNavMenu() {
        var navMenu = NM();
        var toggle = document.getElementById(navMenu.NAV_MENU_TOGGLE_ID);
        if (!toggle || toggle.dataset[NAV_MENU_BOUND_DATASET] === '1') return;
        toggle.dataset[NAV_MENU_BOUND_DATASET] = '1';

        applyNavMenuStateFromPlan(navMenu.buildCollapseNavMenuExecutePlan());

        function handleToggle(event) {
            event.preventDefault();
            event.stopPropagation();
            toggleNavMenu();
        }

        toggle.addEventListener('touchend', handleToggle, { passive: false });
        toggle.addEventListener('click', handleToggle);
    }

    var api = {
        applyNavMenuStateFromPlan: applyNavMenuStateFromPlan,
        toggleNavMenu: toggleNavMenu,
        collapseNavMenu: collapseNavMenu,
        initNavMenu: initNavMenu,
        readNavMenuOpen: readNavMenuOpen,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrNavMenuOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

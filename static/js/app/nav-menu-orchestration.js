/**
 * @file Map action menu (bottom-right hamburger) orchestration.
 */
(function (root) {
    'use strict';

    var NAV_MENU_BOUND_DATASET = 'voyagrNavMenuBound';
    var lastNavMenuToggleAtMs = 0;
    var pointerToggleHandled = false;

    function NM() {
        return root.VoyagrNavMenu;
    }

    function readNavMenuOpen(toggle) {
        var navMenu = NM();
        if (!toggle || !navMenu) return false;
        return navMenu.resolveNavMenuOpenFromAriaExpanded(toggle.getAttribute('aria-expanded'));
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
        if (!navMenu) return;

        var toggle = document.getElementById(navMenu.NAV_MENU_TOGGLE_ID);
        if (!toggle) return;

        var debounced = navMenu.buildNavMenuToggleDebouncedPlan(Date.now(), lastNavMenuToggleAtMs);
        if (!debounced.shouldToggle) return;
        lastNavMenuToggleAtMs = debounced.nextToggleAtMs;

        var plan = navMenu.buildToggleNavMenuEntryOrchestrationPlan(readNavMenuOpen(toggle));
        applyNavMenuStateFromPlan(plan.execute);
    }

    function collapseNavMenu() {
        var navMenu = NM();
        if (!navMenu) return;
        applyNavMenuStateFromPlan(navMenu.buildCollapseNavMenuExecutePlan());
    }

    function initNavMenu() {
        var navMenu = NM();
        if (!navMenu) {
            console.warn('[NavMenu] VoyagrNavMenu module missing; menu toggle not bound');
            return;
        }

        var toggle = document.getElementById(navMenu.NAV_MENU_TOGGLE_ID);
        if (!toggle || toggle.dataset[NAV_MENU_BOUND_DATASET] === '1') return;
        toggle.dataset[NAV_MENU_BOUND_DATASET] = '1';

        applyNavMenuStateFromPlan(navMenu.buildCollapseNavMenuExecutePlan());

        function runToggle(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            toggleNavMenu();
        }

        function handleEarlyToggle(event) {
            // Treat missing isPrimary as primary (synthetic/test events).
            if (event && event.isPrimary === false) return;
            if (event && event.pointerType === 'mouse'
                && event.button != null && event.button !== 0) {
                return;
            }
            pointerToggleHandled = true;
            runToggle(event);
            // Keep the flag long enough to swallow the synthetic click that follows
            // touchend/pointerup on mobile (including Firefox).
            setTimeout(function () {
                pointerToggleHandled = false;
            }, 50);
        }

        // pointerup covers mouse/pen/touch when Pointer Events work. touchend remains
        // as a Firefox fallback when pointercancel suppresses pointerup. click covers
        // desktop and any UA that synthesizes click without earlier pointer/touch ends.
        // Debounce + pointerToggleHandled prevent open-then-immediate-close.
        if (typeof window !== 'undefined' && window.PointerEvent) {
            toggle.addEventListener('pointerup', handleEarlyToggle);
        }
        toggle.addEventListener('touchend', handleEarlyToggle, { passive: false });
        toggle.addEventListener('click', function (event) {
            if (pointerToggleHandled) {
                pointerToggleHandled = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            runToggle(event);
        });
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

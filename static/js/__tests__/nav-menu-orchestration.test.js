/**
 * @jest-environment jsdom
 * @file Tests for app/nav-menu-orchestration.js DOM event handling
 */

// Setup global dependencies
global.VoyagrNavMenu = require('../modules/ui/nav-menu.js');

describe('nav-menu-orchestration DOM event handling', () => {
    let toggle, navButtons, menu;
    let mockNow = 1000;
    let originalDateNow;
    let Orchestration;

    beforeEach(() => {
        // Mock Date.now() for consistent timing in tests
        originalDateNow = Date.now;
        Date.now = jest.fn(() => mockNow);

        // Clear module cache to get fresh state for each test
        jest.resetModules();
        global.VoyagrNavMenu = require('../modules/ui/nav-menu.js');
        Orchestration = require('../app/nav-menu-orchestration.js');

        document.body.innerHTML = '';

        // Match production DOM: toggle and panel are children of .nav-control-menu
        toggle = document.createElement('button');
        toggle.id = 'navMenuToggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '☰';

        navButtons = document.createElement('div');
        navButtons.id = 'navControlButtons';
        navButtons.className = 'nav-menu-collapsed';
        navButtons.setAttribute('hidden', '');

        menu = document.createElement('div');
        menu.className = 'nav-control-menu';
        menu.appendChild(navButtons);
        menu.appendChild(toggle);
        document.body.appendChild(menu);

        // Reset mock time
        mockNow = 1000;
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    function dispatchTouchEnd(target) {
        const event = new Event('touchend', { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event;
    }

    test('initNavMenu binds toggle listeners', () => {
        Orchestration.initNavMenu();

        expect(toggle.dataset.voyagrNavMenuBound).toBe('1');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(navButtons.hasAttribute('hidden')).toBe(true);
    });

    test('initNavMenu does not double-bind', () => {
        Orchestration.initNavMenu();
        const firstBound = toggle.dataset.voyagrNavMenuBound;

        Orchestration.initNavMenu();
        const secondBound = toggle.dataset.voyagrNavMenuBound;

        expect(firstBound).toBe(secondBound);
        expect(secondBound).toBe('1');
    });

    test('single touchend opens menu', () => {
        Orchestration.initNavMenu();

        mockNow = 1000;
        dispatchTouchEnd(toggle);

        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(navButtons.hasAttribute('hidden')).toBe(false);
        expect(navButtons.classList.contains('nav-menu-expanded')).toBe(true);
        expect(navButtons.classList.contains('nav-menu-collapsed')).toBe(false);
        expect(menu.classList.contains('nav-control-menu--open')).toBe(true);
        expect(toggle.textContent).toBe('✕');
    });

    test('single click opens menu when pointer path did not run', () => {
        Orchestration.initNavMenu();

        mockNow = 1000;
        const event = new Event('click', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(event);

        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(navButtons.hasAttribute('hidden')).toBe(false);
        expect(toggle.textContent).toBe('✕');
    });

    test('mobile double-fire: touchend then click leaves menu open', () => {
        Orchestration.initNavMenu();

        mockNow = 1000;
        dispatchTouchEnd(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        mockNow = 1050;
        const clickEvent = new Event('click', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(clickEvent);

        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(navButtons.classList.contains('nav-menu-expanded')).toBe(true);
        expect(menu.classList.contains('nav-control-menu--open')).toBe(true);
    });

    test('rapid taps do not flicker menu open/closed', () => {
        Orchestration.initNavMenu();

        mockNow = 1000;
        dispatchTouchEnd(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        mockNow = 1100;
        dispatchTouchEnd(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        mockNow = 1200;
        dispatchTouchEnd(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    test('tap after debounce window allows toggle', () => {
        Orchestration.initNavMenu();

        mockNow = 1000;
        dispatchTouchEnd(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        mockNow = 1450;
        dispatchTouchEnd(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(navButtons.hasAttribute('hidden')).toBe(true);
        expect(toggle.textContent).toBe('☰');
    });

    test('collapseNavMenu forces menu closed', () => {
        Orchestration.initNavMenu();

        mockNow = 1000;
        const openEvent = new Event('click', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(openEvent);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        Orchestration.collapseNavMenu();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(navButtons.hasAttribute('hidden')).toBe(true);
        expect(menu.classList.contains('nav-control-menu--open')).toBe(false);
    });

    test('initNavMenu no-ops when VoyagrNavMenu is missing', () => {
        jest.resetModules();
        delete global.VoyagrNavMenu;
        Orchestration = require('../app/nav-menu-orchestration.js');

        expect(() => Orchestration.initNavMenu()).not.toThrow();
        expect(toggle.dataset.voyagrNavMenuBound).toBeUndefined();
    });
});

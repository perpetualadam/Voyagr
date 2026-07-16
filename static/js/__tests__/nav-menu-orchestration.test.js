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

        // Create DOM structure
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

        document.body.appendChild(toggle);
        document.body.appendChild(navButtons);
        document.body.appendChild(menu);

        // Reset mock time
        mockNow = 1000;
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    test('initNavMenu binds touchend and click listeners', () => {
        Orchestration.initNavMenu();
        
        // Verify button is bound
        expect(toggle.dataset.voyagrNavMenuBound).toBe('1');
        
        // Verify initial state is collapsed
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
        const event = new Event('touchend', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(event);

        // Menu should be open
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(navButtons.hasAttribute('hidden')).toBe(false);
        expect(navButtons.classList.contains('nav-menu-expanded')).toBe(true);
        expect(navButtons.classList.contains('nav-menu-collapsed')).toBe(false);
        expect(menu.classList.contains('nav-control-menu--open')).toBe(true);
        expect(toggle.textContent).toBe('✕');
    });

    test('single click opens menu', () => {
        Orchestration.initNavMenu();

        mockNow = 1000;
        const event = new Event('click', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(event);

        // Menu should be open
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(navButtons.hasAttribute('hidden')).toBe(false);
        expect(toggle.textContent).toBe('✕');
    });

    test('mobile double-fire: touchend then click leaves menu open', () => {
        Orchestration.initNavMenu();

        // Simulate mobile tap: touchend fires first at t=1000
        mockNow = 1000;
        const touchEvent = new Event('touchend', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(touchEvent);

        // Menu should be open after touchend
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        // Simulate synthetic click 50ms later (typical mobile behavior) at t=1050
        mockNow = 1050;
        const clickEvent = new Event('click', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(clickEvent);

        // Menu should STILL be open (debounce prevented double-toggle)
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(navButtons.classList.contains('nav-menu-expanded')).toBe(true);
        expect(menu.classList.contains('nav-control-menu--open')).toBe(true);
    });

    test('rapid taps do not flicker menu open/closed', () => {
        Orchestration.initNavMenu();

        // First tap opens at t=1000
        mockNow = 1000;
        const tap1 = new Event('touchend', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(tap1);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        // Second tap 100ms later is blocked by debounce at t=1100
        mockNow = 1100;
        const tap2 = new Event('touchend', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(tap2);
        expect(toggle.getAttribute('aria-expanded')).toBe('true'); // Still open

        // Third tap 200ms after first (still within 400ms) is also blocked at t=1200
        mockNow = 1200;
        const tap3 = new Event('touchend', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(tap3);
        expect(toggle.getAttribute('aria-expanded')).toBe('true'); // Still open
    });

    test('tap after debounce window allows toggle', () => {
        Orchestration.initNavMenu();

        // First tap opens at t=1000
        mockNow = 1000;
        const tap1 = new Event('touchend', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(tap1);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        // Tap after 400ms debounce window should close at t=1450
        mockNow = 1450;
        const tap2 = new Event('touchend', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(tap2);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(navButtons.hasAttribute('hidden')).toBe(true);
        expect(toggle.textContent).toBe('☰');
    });

    test('collapseNavMenu forces menu closed', () => {
        Orchestration.initNavMenu();

        // Open menu first at t=1000
        mockNow = 1000;
        const openEvent = new Event('click', { bubbles: true, cancelable: true });
        toggle.dispatchEvent(openEvent);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        // Force collapse
        Orchestration.collapseNavMenu();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(navButtons.hasAttribute('hidden')).toBe(true);
        expect(menu.classList.contains('nav-control-menu--open')).toBe(false);
    });
});

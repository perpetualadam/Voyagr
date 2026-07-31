/**
 * @jest-environment jsdom
 * @file Tests for app/service-worker-orchestration.js controllerchange wiring.
 *
 * `controllerchange` fires both when a worker first claims a page and when an update
 * replaces one. Treating the first case as an update reloaded the app a second after
 * load, which discarded a route the user had just calculated and left the preview
 * blank. The distinction depends on the controller captured at startup, so it lives
 * in the wiring rather than the pure plan.
 */

function makeServiceWorkerStub(controller) {
    const listeners = {};
    return {
        controller: controller,
        register: jest.fn(() => Promise.resolve({ installing: null, update: jest.fn() })),
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        getRegistration: jest.fn(() => Promise.resolve(null)),
        /** Fire controllerchange the way the browser does after a worker takes over. */
        emitControllerChange() {
            (listeners.controllerchange || []).forEach((fn) => fn());
        },
    };
}

function setup({ controllerAtStartup, routeInProgress = false, lastCalculatedRoute = null }) {
    jest.resetModules();
    global.VoyagrPwaInstall = require('../modules/ui/pwa-install.js');

    const sw = makeServiceWorkerStub(controllerAtStartup);
    Object.defineProperty(global.navigator, 'serviceWorker', {
        value: sw, configurable: true, writable: true,
    });
    window.lastCalculatedRoute = lastCalculatedRoute;

    const calls = { scheduleAppReload: [], saveAppState: 0, showStatus: [] };
    const Orchestration = require('../app/service-worker-orchestration.js');
    Orchestration.bind({
        pwaInstall: () => global.VoyagrPwaInstall,
        getRouteInProgress: () => routeInProgress,
        call: {
            showStatus: (msg, type) => calls.showStatus.push({ msg, type }),
            saveAppState: () => { calls.saveAppState += 1; },
            scheduleAppReload: (reason, delayMs) => calls.scheduleAppReload.push({ reason, delayMs }),
            warmPicovoiceStaticCache: () => {},
        },
    });
    return { sw, calls, Orchestration };
}

describe('service-worker-orchestration controllerchange', () => {
    afterEach(() => {
        delete window.lastCalculatedRoute;
    });

    test('does not reload when a worker first takes control of the page', () => {
        const { sw, calls } = setup({ controllerAtStartup: null });

        sw.emitControllerChange();

        expect(calls.scheduleAppReload).toEqual([]);
        expect(calls.saveAppState).toBe(0);
    });

    test('reloads when an update replaces the worker that was already in control', () => {
        const { sw, calls } = setup({ controllerAtStartup: { scriptURL: '/service-worker.js' } });

        sw.emitControllerChange();

        expect(calls.scheduleAppReload).toHaveLength(1);
        expect(calls.scheduleAppReload[0].reason).toBe('service-worker-update');
        expect(calls.saveAppState).toBe(1);
    });

    test('uses the controller captured at startup, not the one in place when it fires', () => {
        const { sw, calls } = setup({ controllerAtStartup: null });
        // The browser sets controller to the new worker before dispatching the event.
        sw.controller = { scriptURL: '/service-worker.js' };

        sw.emitControllerChange();

        expect(calls.scheduleAppReload).toEqual([]);
    });

    test('defers an update while a calculated route is on screen', () => {
        const { sw, calls, Orchestration } = setup({
            controllerAtStartup: { scriptURL: '/service-worker.js' },
            lastCalculatedRoute: { distance_km: 12, duration_minutes: 20 },
        });

        sw.emitControllerChange();

        expect(calls.scheduleAppReload).toEqual([]);
        expect(Orchestration.getUpdatePending()).toBe(true);
    });

    test('defers an update during navigation', () => {
        const { sw, calls, Orchestration } = setup({
            controllerAtStartup: { scriptURL: '/service-worker.js' },
            routeInProgress: true,
        });

        sw.emitControllerChange();

        expect(calls.scheduleAppReload).toEqual([]);
        expect(Orchestration.getUpdatePending()).toBe(true);
    });
});

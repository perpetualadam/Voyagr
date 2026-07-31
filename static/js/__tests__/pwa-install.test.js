/**
 * Tests for modules/ui/pwa-install.js
 */
const PWA = require('../modules/ui/pwa-install.js');

describe('pwa-install module', () => {
    test('buildPwaInstallMessageHtml varies by mode', () => {
        expect(PWA.buildPwaInstallMessageHtml('ios')).toContain('Share');
        expect(PWA.buildPwaInstallMessageHtml('install')).toContain('Install Voyagr');
        expect(PWA.buildPwaInstallMessageHtml('generic')).toContain('browser menu');
    });

    test('banner and button style helpers return css text', () => {
        expect(PWA.getPwaInstallBannerStyleCssText()).toContain('position:fixed');
        expect(PWA.getPwaDismissButtonStyleCssText()).toContain('transparent');
        expect(PWA.getPwaPrimaryButtonStyleCssText()).toContain('#7c4dff');
    });

    test('buildServiceWorkerUpdatePreflightPlan throttles offline and in-flight updates', () => {
        expect(PWA.buildServiceWorkerUpdatePreflightPlan({
            hasRegistration: true,
            hasServiceWorker: true,
            isOnline: false,
        }).shouldUpdate).toBe(false);

        const ok = PWA.buildServiceWorkerUpdatePreflightPlan({
            hasRegistration: true,
            hasServiceWorker: true,
            isOnline: true,
            updateInFlight: false,
            backoffUntil: 0,
            installing: false,
        });
        expect(ok.shouldUpdate).toBe(true);
    });

    test('buildServiceWorkerControllerChangePlan defers reload during navigation', () => {
        const defer = PWA.buildServiceWorkerControllerChangePlan({
            hadControllerAtStartup: true,
            routeInProgress: true,
        });
        expect(defer.action).toBe('defer');
        expect(defer.setUpdatePending).toBe(true);

        const reload = PWA.buildServiceWorkerControllerChangePlan({
            hadControllerAtStartup: true,
            routeInProgress: false,
        });
        expect(reload.action).toBe('reload');
        expect(reload.saveAppState).toBe(true);
    });

    test('buildServiceWorkerControllerChangePlan does not reload on first install', () => {
        // The first worker to claim a page is not an update: the page was just
        // loaded from the network, and reloading discards what the user has done
        // since — including a route they had just calculated.
        const first = PWA.buildServiceWorkerControllerChangePlan({
            hadControllerAtStartup: false,
            routeInProgress: false,
        });
        expect(first.action).toBe('none');
        expect(first.reloadReason).toBeUndefined();
        expect(first.saveAppState).toBeUndefined();
    });

    test('buildServiceWorkerControllerChangePlan defers an update while a route preview is up', () => {
        const plan = PWA.buildServiceWorkerControllerChangePlan({
            hadControllerAtStartup: true,
            routeInProgress: false,
            hasCalculatedRoute: true,
        });
        expect(plan.action).toBe('defer');
        expect(plan.setUpdatePending).toBe(true);
        expect(plan.statusMessage).toMatch(/route/i);
    });

    test('buildScheduleAppReloadPlan dedupes scheduled reloads', () => {
        expect(PWA.buildScheduleAppReloadPlan({
            alreadyScheduled: true,
            reason: 'manual',
        }).shouldSchedule).toBe(false);
        const plan = PWA.buildScheduleAppReloadPlan({ reason: 'manual-refresh', delayMs: 500 });
        expect(plan.shouldSchedule).toBe(true);
        expect(plan.delayMs).toBe(500);
    });

    test('buildRestoreUiStateAfterReloadExecutePlan restores tab and sheet flags', () => {
        expect(PWA.buildRestoreUiStateAfterReloadExecutePlan(null).shouldRestore).toBe(false);
        const execute = PWA.buildRestoreUiStateAfterReloadExecutePlan({
            activeTab: 'navigation',
            bottomSheetExpanded: true,
        });
        expect(execute.shouldRestore).toBe(true);
        expect(execute.activeTab).toBe('navigation');
        expect(execute.scheduleMapRepaint).toBe(true);
    });

    test('buildRefreshAppExecutePlan and check-for-updates outcome plans', () => {
        const refresh = PWA.buildRefreshAppExecutePlan();
        expect(refresh.saveAppState).toBe(true);
        expect(refresh.reloadReason).toBe('manual-refresh');

        expect(PWA.buildCheckForUpdatesPreflightPlan({ hasServiceWorker: false }).action)
            .toBe('unsupported');

        const waiting = PWA.buildCheckForUpdatesRegistrationOutcomePlan({
            hasRegistration: true,
            hasWaiting: true,
        });
        expect(waiting.action).toBe('activate-waiting');
        expect(waiting.skipWaitingMessageType).toBe('SKIP_WAITING');

        const version = PWA.buildDisplayPwaVersionExecutePlan({ buildDate: '2026-07-11' });
        expect(version.versionText).toContain('2026-07-11');
    });
});

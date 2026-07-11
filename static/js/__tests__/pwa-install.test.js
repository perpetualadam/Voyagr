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
        const defer = PWA.buildServiceWorkerControllerChangePlan({ routeInProgress: true });
        expect(defer.action).toBe('defer');
        expect(defer.setUpdatePending).toBe(true);

        const reload = PWA.buildServiceWorkerControllerChangePlan({ routeInProgress: false });
        expect(reload.action).toBe('reload');
        expect(reload.saveAppState).toBe(true);
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
});

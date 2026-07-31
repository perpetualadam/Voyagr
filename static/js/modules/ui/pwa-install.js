/**
 * @file Pure PWA add-to-home-screen banner HTML and styles (no DOM).
 * @module modules/ui/pwa-install
 */
(function (root) {
    'use strict';

    var PWA_BANNER_ID = 'voyagr-add-homescreen-banner';
    var SW_REGISTRATION_PATH = '/service-worker.js';
    var SW_UPDATE_BACKOFF_MS = 5 * 60 * 1000;
    var SW_PERIODIC_UPDATE_INTERVAL_MS = 30 * 60 * 1000;
    var SW_CONTROLLER_RELOAD_DELAY_MS = 1000;
    var SW_PICOVOICE_WARM_DELAY_MS = 8000;
    var SW_PICOVOICE_IDLE_TIMEOUT_MS = 12000;

    /**
     * Preflight plan before calling registration.update().
     * @param {Object} [input]
     * @param {boolean} [input.hasRegistration]
     * @param {boolean} [input.hasServiceWorker]
     * @param {boolean} [input.isOnline]
     * @param {boolean} [input.updateInFlight]
     * @param {number} [input.backoffUntil]
     * @param {boolean} [input.installing]
     * @param {number} [input.now]
     * @returns {Object}
     */
    function buildServiceWorkerUpdatePreflightPlan(input) {
        input = input || {};
        if (!input.hasRegistration || !input.hasServiceWorker) {
            return { shouldUpdate: false, reason: 'no_sw' };
        }
        if (!input.isOnline) {
            return { shouldUpdate: false, reason: 'offline' };
        }
        var now = input.now != null ? input.now : Date.now();
        if (input.updateInFlight || (input.backoffUntil && now < input.backoffUntil)) {
            return { shouldUpdate: false, reason: 'throttled' };
        }
        if (input.installing) {
            return { shouldUpdate: false, reason: 'installing' };
        }
        return { shouldUpdate: true, setUpdateInFlight: true };
    }

    /**
     * Apply plan after a failed service worker update attempt.
     * @param {number} [now]
     * @returns {Object}
     */
    function buildServiceWorkerUpdateErrorApplyPlan(now) {
        var stamp = now != null ? now : Date.now();
        return {
            backoffUntil: stamp + SW_UPDATE_BACKOFF_MS,
            logPrefix: '[PWA] Service worker update skipped:',
        };
    }

    /**
     * Plan when a new service worker controller takes over.
     *
     * ``controllerchange`` also fires the first time a service worker claims the
     * page, which is not an update: the page was just loaded from the network, so
     * there is nothing newer to apply. Reloading then throws away whatever the user
     * did in the first seconds after load — a route they had just calculated
     * included, leaving the preview blank. Only a controller that *replaces* an
     * earlier one means new code is waiting, so the reload is gated on
     * ``hadControllerAtStartup``.
     *
     * A genuine update still waits when the user has something on screen: mid
     * navigation, or with a calculated route in the preview they have not started.
     *
     * @param {Object} [input]
     * @param {boolean} [input.hadControllerAtStartup] - a worker already controlled the page on load
     * @param {boolean} [input.routeInProgress]
     * @param {boolean} [input.hasCalculatedRoute] - a route preview is on screen
     * @returns {Object}
     */
    function buildServiceWorkerControllerChangePlan(input) {
        input = input || {};
        if (!input.hadControllerAtStartup) {
            return {
                action: 'none',
                logMessage: '[PWA] Service worker took control (first install) — no reload needed',
            };
        }
        if (input.routeInProgress || input.hasCalculatedRoute) {
            return {
                action: 'defer',
                setUpdatePending: true,
                statusMessage: input.routeInProgress
                    ? '✅ Update available. Will apply after navigation.'
                    : '✅ Update available. Will apply once you finish with this route.',
                statusType: 'info',
                logMessage: '[PWA] New service worker activated',
            };
        }
        return {
            action: 'reload',
            saveAppState: true,
            statusMessage: '🔄 Applying app update...',
            statusType: 'success',
            reloadReason: 'service-worker-update',
            reloadDelayMs: SW_CONTROLLER_RELOAD_DELAY_MS,
            logMessage: '[PWA] New service worker activated',
        };
    }

    /**
     * Execute plan for service worker registration on window load.
     * @returns {Object}
     */
    function buildServiceWorkerRegistrationExecutePlan() {
        return {
            scriptPath: SW_REGISTRATION_PATH,
            periodicUpdateIntervalMs: SW_PERIODIC_UPDATE_INTERVAL_MS,
            picovoiceWarmDelayMs: SW_PICOVOICE_WARM_DELAY_MS,
            picovoiceIdleTimeoutMs: SW_PICOVOICE_IDLE_TIMEOUT_MS,
            preferIdleCallback: true,
            successLogPrefix: '[PWA] Service Worker registered:',
            failureLogPrefix: '[PWA] Service Worker registration failed:',
        };
    }

    /**
     * @returns {string}
     */
    function getPwaInstallBannerStyleCssText() {
        return [
            'position:fixed',
            'bottom:0',
            'left:0',
            'right:0',
            'z-index:99999',
            'background:#1a237e',
            'color:#fff',
            'padding:12px 14px',
            'display:flex',
            'flex-wrap:wrap',
            'align-items:center',
            'justify-content:space-between',
            'gap:10px',
            'font-size:14px',
            'box-shadow:0 -4px 16px rgba(0,0,0,0.25)',
        ].join(';');
    }

    /**
     * @returns {string}
     */
    function getPwaDismissButtonStyleCssText() {
        return 'padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.5);background:transparent;color:#fff;cursor:pointer;font-size:13px;';
    }

    /**
     * @returns {string}
     */
    function getPwaPrimaryButtonStyleCssText() {
        return 'padding:8px 14px;border-radius:8px;border:none;background:#7c4dff;color:#fff;cursor:pointer;font-weight:600;font-size:13px;';
    }

    /**
     * @param {'ios'|'install'|'generic'} mode
     * @returns {string}
     */
    function buildPwaInstallMessageHtml(mode) {
        if (mode === 'ios') {
            return (
                '<strong>Add Voyagr to your home screen</strong><br>' +
                '<span style="opacity:0.92;font-size:12px;">Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>'
            );
        }
        if (mode === 'install') {
            return (
                '<strong>Install Voyagr</strong>' +
                '<span style="opacity:0.92;font-size:12px;display:block;margin-top:4px;">Add this app to your home screen for quick access.</span>'
            );
        }
        return (
            '<strong>Add Voyagr to your home screen</strong>' +
            '<span style="opacity:0.92;font-size:12px;display:block;margin-top:4px;">Use your browser menu: Install app or Add to Home Screen.</span>'
        );
    }

    /**
     * Plan for scheduling a single app reload (deduped).
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildScheduleAppReloadPlan(input) {
        input = input || {};
        if (input.alreadyScheduled) {
            return {
                shouldSchedule: false,
                skipLogMessage: '[PWA] Reload already scheduled, skipping:',
                reason: input.reason,
            };
        }
        return {
            shouldSchedule: true,
            reason: input.reason,
            delayMs: input.delayMs != null ? input.delayMs : 500,
            setReloadScheduledFlag: true,
            action: 'locationReload',
        };
    }

    /**
     * Execute plan for repainting the map after layout/tab changes.
     * @returns {Object}
     */
    function buildScheduleMapRepaintAfterUiChangePlan() {
        return {
            shouldRepaint: true,
            immediate: true,
            requestAnimationFrame: true,
            delayedRepaintsMs: [300, 1000],
            handlerName: '__voyagrMapResizeAndRepaint',
        };
    }

    /**
     * Execute plan for restoring UI state after a PWA reload.
     * @param {Object|null|undefined} pending
     * @returns {Object}
     */
    function buildRestoreUiStateAfterReloadExecutePlan(pending) {
        if (!pending) {
            return { shouldRestore: false };
        }
        return {
            shouldRestore: true,
            activeTab: pending.activeTab,
            bottomSheetExpanded: pending.bottomSheetExpanded,
            scheduleMapRepaint: true,
            restoreLogPrefix: '[PWA] UI state restored after reload:',
            errorLogPrefix: '[PWA] UI restore error:',
        };
    }

    /**
     * Execute plan for manual app refresh (save state + reload).
     * @returns {Object}
     */
    function buildRefreshAppExecutePlan() {
        return {
            shouldRefresh: true,
            statusRefreshing: { message: '🔄 Refreshing app...', type: 'info' },
            saveAppState: true,
            reloadReason: 'manual-refresh',
            reloadDelayMs: 500,
            alreadyScheduledStatus: { message: '🔄 Refresh already in progress...', type: 'info' },
        };
    }

    /**
     * Preflight for checking PWA/service-worker updates.
     * @param {Object} [input]
     * @param {boolean} [input.hasServiceWorker]
     * @returns {Object}
     */
    function buildCheckForUpdatesPreflightPlan(input) {
        input = input || {};
        if (!input.hasServiceWorker) {
            return {
                action: 'unsupported',
                statusMessage: '⚠️ PWA not supported on this browser',
                statusType: 'warning',
            };
        }
        return {
            action: 'check',
            statusChecking: { message: '📥 Checking for updates...', type: 'info' },
            errorLogPrefix: '[PWA] Update check failed:',
            errorStatus: { message: '❌ Update check failed', type: 'error' },
        };
    }

    /**
     * Outcome plan after inspecting service worker registration state.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildCheckForUpdatesRegistrationOutcomePlan(input) {
        input = input || {};
        if (!input.hasRegistration) {
            return {
                action: 'no-registration',
                statusMessage: '⚠️ Service worker not registered',
                statusType: 'warning',
            };
        }
        if (input.hasWaiting) {
            return {
                action: 'activate-waiting',
                saveAppState: true,
                statusMessage: '📥 New update found! Reloading...',
                statusType: 'success',
                skipWaitingMessageType: 'SKIP_WAITING',
            };
        }
        if (input.hasInstalling) {
            return {
                action: 'installing',
                statusMessage: '📥 Update installing...',
                statusType: 'info',
            };
        }
        return {
            action: 'up-to-date',
            statusMessage: '✅ App is up to date!',
            statusType: 'success',
        };
    }

    /**
     * Execute plan for displaying the PWA version label.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildDisplayPwaVersionExecutePlan(input) {
        input = input || {};
        var buildDate = input.buildDate || new Date().toISOString().split('T')[0];
        return {
            shouldUpdate: true,
            elementId: 'pwaVersionText',
            versionText: 'App version: PWA ' + buildDate,
        };
    }

    var api = {
        PWA_BANNER_ID: PWA_BANNER_ID,
        SW_REGISTRATION_PATH: SW_REGISTRATION_PATH,
        SW_UPDATE_BACKOFF_MS: SW_UPDATE_BACKOFF_MS,
        SW_PERIODIC_UPDATE_INTERVAL_MS: SW_PERIODIC_UPDATE_INTERVAL_MS,
        buildServiceWorkerUpdatePreflightPlan: buildServiceWorkerUpdatePreflightPlan,
        buildServiceWorkerUpdateErrorApplyPlan: buildServiceWorkerUpdateErrorApplyPlan,
        buildServiceWorkerControllerChangePlan: buildServiceWorkerControllerChangePlan,
        buildServiceWorkerRegistrationExecutePlan: buildServiceWorkerRegistrationExecutePlan,
        getPwaInstallBannerStyleCssText: getPwaInstallBannerStyleCssText,
        getPwaDismissButtonStyleCssText: getPwaDismissButtonStyleCssText,
        getPwaPrimaryButtonStyleCssText: getPwaPrimaryButtonStyleCssText,
        buildPwaInstallMessageHtml: buildPwaInstallMessageHtml,
        buildScheduleAppReloadPlan: buildScheduleAppReloadPlan,
        buildScheduleMapRepaintAfterUiChangePlan: buildScheduleMapRepaintAfterUiChangePlan,
        buildRestoreUiStateAfterReloadExecutePlan: buildRestoreUiStateAfterReloadExecutePlan,
        buildRefreshAppExecutePlan: buildRefreshAppExecutePlan,
        buildCheckForUpdatesPreflightPlan: buildCheckForUpdatesPreflightPlan,
        buildCheckForUpdatesRegistrationOutcomePlan: buildCheckForUpdatesRegistrationOutcomePlan,
        buildDisplayPwaVersionExecutePlan: buildDisplayPwaVersionExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPwaInstall = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

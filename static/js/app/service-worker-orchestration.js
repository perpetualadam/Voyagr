/**
 * @file Service worker registration and update orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var swUpdateInFlight = false;
    var swUpdateBackoffUntil = 0;
    var serviceWorkerInitBound = false;

    function rt() {
        if (!runtime) {
            throw new Error('[ServiceWorker] Orchestration runtime not bound');
        }
        return runtime;
    }

    function PWA() { return rt().pwaInstall(); }

    async function safeServiceWorkerUpdate(registration, reason) {
        const preflight = PWA().buildServiceWorkerUpdatePreflightPlan({
            hasRegistration: !!registration,
            hasServiceWorker: 'serviceWorker' in navigator,
            isOnline: navigator.onLine,
            updateInFlight: swUpdateInFlight,
            backoffUntil: swUpdateBackoffUntil,
            installing: !!(registration && registration.installing),
        });
        if (!preflight.shouldUpdate) return;

        swUpdateInFlight = true;
        try {
            await registration.update();
        } catch (e) {
            const apply = PWA().buildServiceWorkerUpdateErrorApplyPlan();
            swUpdateBackoffUntil = apply.backoffUntil;
            console.debug(apply.logPrefix, e && e.name, reason || '');
        } finally {
            swUpdateInFlight = false;
        }
    }

    function initNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    function initPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then((persistent) => {
                console.log('[PWA] Persistent storage:', persistent ? 'granted' : 'denied');
            });
        }
    }

    function initServiceWorkerRegistration() {
        if (serviceWorkerInitBound || !('serviceWorker' in navigator)) return;
        serviceWorkerInitBound = true;

        window.addEventListener('load', () => {
            const regPlan = PWA().buildServiceWorkerRegistrationExecutePlan();
            navigator.serviceWorker.register(regPlan.scriptPath)
                .then((registration) => {
                    console.log(regPlan.successLogPrefix, registration);

                    setInterval(() => {
                        void safeServiceWorkerUpdate(registration, 'periodic');
                    }, regPlan.periodicUpdateIntervalMs);

                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible') {
                            void safeServiceWorkerUpdate(registration, 'visible');
                        }
                    });

                    const scheduleWarm = (cb) => {
                        if (regPlan.preferIdleCallback && typeof requestIdleCallback === 'function') {
                            requestIdleCallback(cb, { timeout: regPlan.picovoiceIdleTimeoutMs });
                        } else {
                            setTimeout(cb, regPlan.picovoiceWarmDelayMs);
                        }
                    };
                    scheduleWarm(rt().call.warmPicovoiceStaticCache);
                })
                .catch((error) => {
                    console.log(regPlan.failureLogPrefix, error);
                });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            const change = PWA().buildServiceWorkerControllerChangePlan({
                routeInProgress: rt().getRouteInProgress(),
            });
            console.log(change.logMessage);

            if (change.action === 'defer') {
                if (change.setUpdatePending) rt().setUpdatePending(true);
                rt().call.showStatus(change.statusMessage, change.statusType);
            } else if (change.action === 'reload') {
                rt().call.showStatus(change.statusMessage, change.statusType);
                if (change.saveAppState) rt().call.saveAppState();
                rt().call.scheduleAppReload(change.reloadReason, change.reloadDelayMs);
            }
        });

        initNotificationPermission();
        initPersistentStorage();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        initServiceWorkerRegistration();
    }

    var api = {
        bind: bind,
        safeServiceWorkerUpdate: safeServiceWorkerUpdate,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrServiceWorkerOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

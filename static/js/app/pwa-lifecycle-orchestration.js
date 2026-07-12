/**
 * @file PWA lifecycle orchestration (app state, reload, updates, version display).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var displayVersionListenerBound = false;

    function rt() {
        if (!runtime) {
            throw new Error('[PwaLifecycle] Orchestration runtime not bound');
        }
        return runtime;
    }

    function PWA() { return rt().pwaInstall(); }
    function AS() { return rt().appState(); }

    function applyRestoreAppStateFromPlan(apply, orch) {
        if (!apply || !apply.shouldApply) return;

        (apply.storagePatches || []).forEach(({ key, value }) => {
            localStorage.setItem(key, value);
        });
        if (apply.pendingUiRestore) {
            window[apply.pendingUiRestoreProperty] = apply.pendingUiRestore;
        }
        localStorage.removeItem(apply.removeAppStateKey);
        console.log(apply.restoredLogMessage);
    }

    function scheduleAppReload(reason, delayMs) {
        const plan = PWA().buildScheduleAppReloadPlan({
            reason: reason,
            delayMs: delayMs,
            alreadyScheduled: !!window.__voyagrReloadScheduled,
        });
        if (!plan.shouldSchedule) {
            console.log(plan.skipLogMessage, plan.reason);
            return false;
        }
        window.__voyagrReloadScheduled = true;
        setTimeout(() => {
            window.location.reload();
        }, plan.delayMs);
        return true;
    }

    function scheduleMapRepaintAfterUiChange() {
        const execute = PWA().buildScheduleMapRepaintAfterUiChangePlan();
        if (!execute.shouldRepaint) return;

        const repaint = () => {
            if (typeof window[execute.handlerName] === 'function') {
                window[execute.handlerName]();
            }
        };
        if (execute.immediate) repaint();
        if (execute.requestAnimationFrame) requestAnimationFrame(repaint);
        (execute.delayedRepaintsMs || []).forEach((ms) => setTimeout(repaint, ms));
    }

    function restoreUiStateAfterReload() {
        const pending = window.__voyagrPendingUiRestore;
        const execute = PWA().buildRestoreUiStateAfterReloadExecutePlan(pending);
        if (!execute.shouldRestore) return;
        window.__voyagrPendingUiRestore = null;

        try {
            if (execute.activeTab) rt().call.switchTab(execute.activeTab);
            if (execute.bottomSheetExpanded === true) {
                rt().call.expandBottomSheet();
            } else if (execute.bottomSheetExpanded === false) {
                rt().call.collapseBottomSheet();
            }
            if (execute.scheduleMapRepaint) scheduleMapRepaintAfterUiChange();
            console.log(execute.restoreLogPrefix, pending);
        } catch (e) {
            console.warn(execute.errorLogPrefix, e);
        }
    }

    function saveAppState() {
        try {
            const execute = AS().buildSaveAppStateExecutePlan({
                avoidTolls: rt().call.isAvoidTollsEnabled(),
                getStorageItem: (key) => localStorage.getItem(key),
                activeTab: rt().call.getCurrentVisibleTab(),
                bottomSheetExpanded: rt().getBottomSheetExpanded(),
            });
            if (!execute.shouldSave) return;
            localStorage.setItem(execute.storageKey, execute.storageValue);
            console.log(execute.logMessage);
        } catch (e) {
            console.log(AS().buildSaveAppStateExecutePlan().errorLogPrefix, e);
        }
    }

    function restoreAppState() {
        const orch = AS().buildRestoreAppStateOrchestrationPlan();
        if (window[orch.restoredFlagProperty]) {
            return;
        }
        window[orch.restoredFlagProperty] = true;

        try {
            const saved = localStorage.getItem(orch.storageKey);
            if (!saved) return;

            const state = JSON.parse(saved);
            const execute = AS().buildRestoreAppStateExecutePlan(state);
            applyRestoreAppStateFromPlan(AS().buildRestoreAppStateApplyPlan(execute, orch), orch);
        } catch (e) {
            console.log(AS().buildRestoreAppStateExecutePlan().errorLogPrefix, e);
        }
    }

    function refreshApp() {
        const execute = PWA().buildRefreshAppExecutePlan();
        if (!execute.shouldRefresh) return;

        rt().call.showStatus(execute.statusRefreshing.message, execute.statusRefreshing.type);
        if (execute.saveAppState) saveAppState();

        if (!scheduleAppReload(execute.reloadReason, execute.reloadDelayMs)) {
            rt().call.showStatus(
                execute.alreadyScheduledStatus.message,
                execute.alreadyScheduledStatus.type
            );
        }
    }

    async function checkForUpdates() {
        const preflight = PWA().buildCheckForUpdatesPreflightPlan({
            hasServiceWorker: 'serviceWorker' in navigator,
        });

        if (preflight.action === 'unsupported') {
            rt().call.showStatus(preflight.statusMessage, preflight.statusType);
            return;
        }

        rt().call.showStatus(preflight.statusChecking.message, preflight.statusChecking.type);

        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) {
                const missing = PWA().buildCheckForUpdatesRegistrationOutcomePlan({ hasRegistration: false });
                rt().call.showStatus(missing.statusMessage, missing.statusType);
                return;
            }

            await rt().call.safeServiceWorkerUpdate(registration, 'manual');

            const outcome = PWA().buildCheckForUpdatesRegistrationOutcomePlan({
                hasRegistration: true,
                hasWaiting: !!registration.waiting,
                hasInstalling: !!registration.installing,
            });

            if (outcome.action === 'activate-waiting') {
                rt().call.showStatus(outcome.statusMessage, outcome.statusType);
                if (outcome.saveAppState) saveAppState();
                registration.waiting.postMessage({ type: outcome.skipWaitingMessageType });
                return;
            }

            rt().call.showStatus(outcome.statusMessage, outcome.statusType);
        } catch (error) {
            console.error(preflight.errorLogPrefix, error);
            rt().call.showStatus(preflight.errorStatus.message, preflight.errorStatus.type);
        }
    }

    function displayPWAVersion() {
        const execute = PWA().buildDisplayPwaVersionExecutePlan();
        if (!execute.shouldUpdate) return;
        const versionElement = document.getElementById(execute.elementId);
        if (versionElement) versionElement.textContent = execute.versionText;
    }

    function initDisplayPwaVersionOnDomReady() {
        if (displayVersionListenerBound || typeof document === 'undefined') return;
        displayVersionListenerBound = true;
        document.addEventListener('DOMContentLoaded', displayPWAVersion);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        initDisplayPwaVersionOnDomReady();
    }

    var api = {
        bind: bind,
        scheduleAppReload: scheduleAppReload,
        scheduleMapRepaintAfterUiChange: scheduleMapRepaintAfterUiChange,
        restoreUiStateAfterReload: restoreUiStateAfterReload,
        saveAppState: saveAppState,
        restoreAppState: restoreAppState,
        refreshApp: refreshApp,
        checkForUpdates: checkForUpdates,
        displayPWAVersion: displayPWAVersion,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPwaLifecycleOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

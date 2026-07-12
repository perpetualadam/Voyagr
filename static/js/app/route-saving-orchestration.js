/**
 * @file Saved route list, persist, use, and delete orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[RouteSaving] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RS() {
        return rt().routeSharing();
    }

    function collectSaveCurrentRouteInput() {
        return RS().buildCollectSaveCurrentRouteInputPlan({
            lastCalculatedRoute: rt().getLastCalculatedRoute(),
            routeName: document.getElementById('routeName')?.value,
            startLabel: document.getElementById('start')?.value,
            endLabel: document.getElementById('end')?.value,
        });
    }

    function applySaveCurrentRouteFromPlan(execute) {
        if (!execute || !execute.shouldSave) {
            if (execute && execute.errorStatusMessage) {
                rt().call.showStatus(execute.errorStatusMessage, 'error');
            }
            return;
        }

        let savedRoutes = JSON.parse(localStorage.getItem(execute.storageKey) || '[]');
        savedRoutes.push(execute.savedRoute);
        localStorage.setItem(execute.storageKey, JSON.stringify(savedRoutes));
        if (execute.persistProfile) rt().call.persistActiveProfile();

        if (execute.clearRouteNameInput) {
            const routeNameInput = document.getElementById(execute.routeNameInputId);
            if (routeNameInput) routeNameInput.value = '';
        }

        rt().call.showStatus(execute.successStatusMessage, 'success');
        if (execute.reloadList) loadSavedRoutes();
    }

    function saveCurrentRoute() {
        applySaveCurrentRouteFromPlan(
            RS().buildSaveCurrentRouteEntryOrchestrationPlan(collectSaveCurrentRouteInput()).execute
        );
    }

    function collectLoadSavedRoutesFmt() {
        return {
            convertDistance: rt().call.convertDistance,
            currencySymbol: rt().call.getCurrencySymbol(),
            distUnit: rt().call.getDistanceUnit(),
        };
    }

    function applyLoadSavedRoutesFromPlan(execute) {
        if (!execute || !execute.shouldRender) return;
        const savedRoutesList = document.getElementById(execute.listContainerId);
        if (!savedRoutesList) return;
        savedRoutesList.innerHTML = execute.listHtml;
    }

    function loadSavedRoutes() {
        const savedRoutes = JSON.parse(localStorage.getItem(RS().SAVED_ROUTES_STORAGE_KEY) || '[]');
        applyLoadSavedRoutesFromPlan(
            RS().buildLoadSavedRoutesEntryOrchestrationPlan(savedRoutes, collectLoadSavedRoutesFmt()).execute
        );
    }

    function applyUseSavedRouteFromPlan(plan) {
        if (!plan || !plan.ok) return;

        const startEl = document.getElementById('start');
        const endEl = document.getElementById('end');
        if (startEl) startEl.value = plan.startLabel;
        if (endEl) endEl.value = plan.endLabel;
        window.lastCalculatedRoute = plan.lastCalculatedRoutePatch;
        rt().call.showStatus(plan.successStatusMessage, 'success');
        rt().call.switchTab(plan.switchTab);
    }

    function useSavedRoute(routeId) {
        const savedRoutes = JSON.parse(localStorage.getItem(RS().SAVED_ROUTES_STORAGE_KEY) || '[]');
        applyUseSavedRouteFromPlan(
            RS().buildUseSavedRouteEntryOrchestrationPlan(routeId, savedRoutes).plan
        );
    }

    function applyDeleteSavedRouteFromPlan(execute) {
        if (!execute || !execute.shouldPersist) return;

        localStorage.setItem(execute.storageKey, JSON.stringify(execute.nextRoutes));
        if (execute.persistProfile) rt().call.persistActiveProfile();
        rt().call.showStatus(execute.successStatusMessage, 'success');
        if (execute.reloadList) loadSavedRoutes();
    }

    function deleteSavedRoute(routeId) {
        const savedRoutes = JSON.parse(localStorage.getItem(RS().SAVED_ROUTES_STORAGE_KEY) || '[]');
        const entry = RS().buildDeleteSavedRouteEntryOrchestrationPlan(routeId, savedRoutes);
        if (!confirm(entry.deletePlan.confirmMessage)) return;
        applyDeleteSavedRouteFromPlan(entry.execute);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        saveCurrentRoute: saveCurrentRoute,
        loadSavedRoutes: loadSavedRoutes,
        useSavedRoute: useSavedRoute,
        deleteSavedRoute: deleteSavedRoute,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSavingOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

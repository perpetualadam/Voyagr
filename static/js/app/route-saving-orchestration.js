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

    async function applySaveCurrentRouteFromPlan(execute) {
        if(!execute||!execute.shouldSave){if(execute?.errorStatusMessage)rt().call.showStatus(execute.errorStatusMessage,'error');return;}
        const local=root.VoyagrLocalData;if(!local){rt().call.showStatus('Device storage unavailable','error');return;}
        const c=local.capture();
        try{await local.update('routes',rows=>[...(rows||[]),execute.savedRoute],c);
            if(!local.current(c))return;
            const input=document.getElementById(execute.routeNameInputId);if(input&&execute.clearRouteNameInput)input.value='';
            rt().call.showStatus(execute.successStatusMessage,'success');await loadSavedRoutes();
        }catch(_){local.report();rt().call.showStatus('Route was not saved. Existing device data is retained.','error');}
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

    async function loadSavedRoutes() {
        const local=root.VoyagrLocalData;if(!local)return;
        const c=local.capture();try{const rows=await local.getRoutes(c);if(local.current(c))applyLoadSavedRoutesFromPlan(RS().buildLoadSavedRoutesEntryOrchestrationPlan(rows,collectLoadSavedRoutesFmt()).execute);}catch(_){local.report();}
    }

    function applyUseSavedRouteFromPlan(plan) {
        if (!plan || !plan.ok) return false;
        if (rt().getRouteInProgress()) {
            rt().call.showStatus('Stop navigation before inspecting a saved journey. Current route retained.', 'warning');
            return false;
        }
        // Use the same isolated, non-navigable preview as IndexedDB restoration.
        return rt().call.showRestoredRoutePreview(plan.lastCalculatedRoutePatch);
    }

    async function useSavedRoute(routeId) {
        const local=root.VoyagrLocalData;if(!local)return false;
        const c=local.capture();try{const rows=await local.getRoutes(c);if(!local.current(c))return false;return applyUseSavedRouteFromPlan(RS().buildUseSavedRouteEntryOrchestrationPlan(routeId,rows).plan);}catch(_){local.report();return false;}
    }

    function applyDeleteSavedRouteFromPlan(execute) {
        return false; // Deletes use a scoped transactional mutation in deleteSavedRoute().
    }

    async function deleteSavedRoute(routeId) {
        const local=root.VoyagrLocalData;if(!local)return;
        const c=local.capture();try{const rows=await local.getRoutes(c),entry=RS().buildDeleteSavedRouteEntryOrchestrationPlan(routeId,rows);
            if(!local.current(c)||!confirm(entry.deletePlan.confirmMessage))return;
            await local.update('routes',values=>(values||[]).filter(x=>x.id!==routeId),c);if(local.current(c))await loadSavedRoutes();
        }catch(_){local.report();}
    }

    if(typeof window!=='undefined'){window.addEventListener('voyagr-local-owner-change',()=>{const el=document.getElementById('savedRoutesList');if(el)el.textContent='';});window.addEventListener('voyagr-local-data-changed',()=>{if(runtime)void loadSavedRoutes();});}
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

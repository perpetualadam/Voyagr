/**
 * @file Form clear orchestration (reset inputs, markers, map view).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[FormClear] Orchestration runtime not bound');
        }
        return runtime;
    }

    function clearJourneyInputs() {
        const navigation=root.VoyagrNavigationLifecycleOrchestration;
        if(navigation && navigation.getRouteInProgress()) return false;
        if(root.VoyagrLocationOrchestration)root.VoyagrLocationOrchestration.invalidateEndpointRequests();
        resetJourneyInputValues();
        return true;
    }

    function resetJourneyInputValues() {
        if(root.VoyagrJourneyPlan)root.VoyagrJourneyPlan.clearArrival();
        ['start','end','drivingArrival','viaPointAddress','stopAddress'].forEach(function(id){
            const input=document.getElementById(id);if(!input)return;
            input.value='';
            Object.keys(input.dataset).forEach(function(key){
                if(['lat','lon','displayName'].includes(key)||key.startsWith('journey'))delete input.dataset[key];
            });
        });
        ['autocomplete_start','autocomplete_end','autocomplete_drivingArrival','autocompleteStart','autocompleteEnd'].forEach(function(id){
            const list=document.getElementById(id);if(list){list.replaceChildren();list.classList.remove('show');}
        });
        return true;
    }

    function clearForm() {
        if(root.VoyagrLocationOrchestration)root.VoyagrLocationOrchestration.invalidateEndpointRequests();
        if(root.VoyagrNavigationLifecycleOrchestration&&root.VoyagrNavigationLifecycleOrchestration.getRouteInProgress()){rt().call.showStatus('End the current journey before clearing its map.','warning');return false;}
        resetJourneyInputValues();
        const resultEl = document.getElementById('result');
        if (resultEl) resultEl.classList.remove('show');
        document.getElementById('status').className = 'status';

        const startMarker = rt().getStartMarker();
        const endMarker = rt().getEndMarker();
        const routeLayer = rt().getRouteLayer();
        if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
        if (endMarker && typeof endMarker.remove === 'function') endMarker.remove();
        if (routeLayer && typeof routeLayer.remove === 'function') routeLayer.remove();

        rt().call.clearParkingSelection();

        const map = rt().getMap();
        map.flyTo({
            center: [-0.1278, 51.5074],
            zoom: 13,
            duration: rt().getZoomAnimationDurationMs()
        });
        rt().setLastZoomLevel(13);

        if (root.VoyagrAutoGpsOrchestration.getAutoGpsEnabled()) {
            rt().call.updateAutoGpsLocation();
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        ENDPOINT_INTENT_PROTOCOL:1,
        endpointIntentReady:function(){return !!runtime;},
        bind: bind,
        clearForm: clearForm,
        clearJourneyInputs: clearJourneyInputs,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrFormClearOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

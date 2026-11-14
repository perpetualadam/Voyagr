/**
 * @file Recent destinations orchestration (local search/route history).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[RecentDestinations] Orchestration runtime not bound');
        }
        return runtime;
    }

    function loadRecentDestinations() {
        return root.VoyagrLocalData ? root.VoyagrLocalData.getDestinations().catch(()=>[]) : [];
    }

    function recordRecentDestination(label, lat, lon, kind) {
        if(root.VoyagrLocalData)void root.VoyagrLocalData.recordDestination(label,lat,lon,kind).catch(()=>root.VoyagrLocalData.report());
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        loadRecentDestinations: loadRecentDestinations,
        recordRecentDestination: recordRecentDestination,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRecentDestinationsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

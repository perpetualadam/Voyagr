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
        return rt().recentDestinations().loadRecentDestinations();
    }

    function recordRecentDestination(label, lat, lon, kind) {
        return rt().recentDestinations().recordRecentDestination(label, lat, lon, kind);
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

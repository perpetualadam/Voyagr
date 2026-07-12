/**
 * @file TomTom reverse-geocoding road name bar orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var lastRoadNameFetch = 0;
    var lastRoadNamePosition = null;
    var currentRoadDisplayName = '';

    function rt() {
        if (!runtime) {
            throw new Error('[RoadName] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RN() { return rt().roadNameDisplay(); }

    function resetRoadNameState() {
        lastRoadNameFetch = 0;
        lastRoadNamePosition = null;
        currentRoadDisplayName = '';
    }

    function getCurrentRoadDisplayName() {
        return currentRoadDisplayName;
    }

    function fetchRoadNameThrottled(lat, lon) {
        const roadName = RN();
        const tick = roadName.buildRoadNameFetchTickPlan({
            lat,
            lon,
            now: Date.now(),
            lastFetch: lastRoadNameFetch,
            lastPosition: lastRoadNamePosition,
            calculateDistance: rt().call.calculateDistanceMeters,
        });
        if (tick.action === 'skip') return;

        const apply = roadName.buildRoadNameFetchStateApplyPlan(tick);
        if (apply.action === 'skip') return;

        lastRoadNameFetch = apply.statePatch.lastFetch;
        lastRoadNamePosition = apply.statePatch.lastPosition;

        fetch(apply.fetch.url)
            .then((r) => r.json())
            .then((data) => {
                const domApply = roadName.buildRoadNameApiResponseDomApplyPlan(data);
                if (domApply.action !== 'apply') return;
                currentRoadDisplayName = domApply.statePatch.currentRoadDisplayName;
                const bar = document.getElementById('roadNameBar');
                const label = document.getElementById('currentRoadName');
                if (bar && label) {
                    label.textContent = domApply.roadName;
                    bar.style.display = domApply.barDisplay;
                }
            })
            .catch((err) => {
                console.debug('[RoadName] Fetch error:', err);
            });
    }

    function hideRoadNameBar() {
        const plan = RN().getRoadNameBarHidePlan();
        const bar = document.getElementById('roadNameBar');
        if (bar) bar.style.display = plan.barDisplay;
        currentRoadDisplayName = plan.roadName;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        resetRoadNameState: resetRoadNameState,
        getCurrentRoadDisplayName: getCurrentRoadDisplayName,
        fetchRoadNameThrottled: fetchRoadNameThrottled,
        hideRoadNameBar: hideRoadNameBar,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoadNameOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

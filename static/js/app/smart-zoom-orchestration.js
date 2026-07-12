/**
 * @file Smart zoom toggle orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[SmartZoom] Orchestration runtime not bound');
        }
        return runtime;
    }

    function toggleSmartZoom() {
        const smartZoom = rt().smartZoom();
        const toggleUi = rt().toggleUI();
        const collected = smartZoom.buildToggleSmartZoomCollectPlan({
            currentlyEnabled: rt().getSmartZoomEnabled(),
        });
        const execute = smartZoom.buildToggleSmartZoomExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        rt().setSmartZoomEnabled(execute.enabled);
        const btn = document.getElementById(execute.toggle.id);
        if (btn) toggleUi.applyToggleButton(btn, execute.toggle.enabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.saveAllSettings) rt().call.saveAllSettings();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage, rt().getSmartZoomEnabled());
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleSmartZoom: toggleSmartZoom,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSmartZoomOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

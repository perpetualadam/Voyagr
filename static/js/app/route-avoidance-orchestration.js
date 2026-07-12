/**
 * @file Route leg and hazard avoidance preference toggle orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[RouteAvoidance] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RP() { return rt().routePrefs(); }
    function TU() { return rt().toggleUI(); }

    function applyRouteLegAvoidanceToggleFromPlan(dispatch) {
        if (!dispatch) return;

        const btn = document.getElementById(dispatch.buttonId);
        if (!btn) return;

        TU().applyToggleButton(btn, dispatch.nextEnabled, TU().TOGGLE_SWITCH_OPTS);
        localStorage.setItem(dispatch.storage.storageKey, dispatch.storage.value);
        console.log(`[Avoidance] ${dispatch.logLine}`);
    }

    function toggleAvoidancePreference(pref) {
        const btn = document.getElementById(RP().resolveRouteLegAvoidanceButtonId(pref));
        if (!btn) return;

        applyRouteLegAvoidanceToggleFromPlan(
            RP().buildRouteLegAvoidanceToggleEntryOrchestrationPlan(
                pref,
                btn.classList.contains('active')
            ).dispatch
        );
    }

    function applyLoadRouteLegAvoidanceTogglesFromPlan(items) {
        (items || []).forEach((item) => {
            const btn = document.getElementById(item.buttonId);
            if (btn) {
                TU().applyToggleButton(btn, item.enabled, TU().TOGGLE_SWITCH_OPTS);
            }
        });
    }

    function loadAvoidancePreferences() {
        applyLoadRouteLegAvoidanceTogglesFromPlan(
            RP().buildLoadRouteLegAvoidanceTogglesEntryOrchestrationPlan(localStorage).items
        );
    }

    function togglePreference(pref) {
        if (!pref) {
            console.error('[Preferences] togglePreference called with undefined pref');
            return;
        }

        const routePrefs = RP();
        const buttonId = routePrefs.resolveRouteAvoidanceButtonId(pref);
        const button = document.getElementById(buttonId);

        if (!button) {
            console.warn('[Preferences] Button not found for preference:', pref, 'ID:', buttonId);
            return;
        }

        button.classList.toggle('active');
        const isActive = button.classList.contains('active');
        localStorage.setItem(routePrefs.getRouteAvoidancePrefStorageKey(pref), isActive ? 'true' : 'false');

        TU().applyLabeledToggleButton(button, isActive);

        if (pref === 'caz') {
            console.log('[Settings] Charge zones routing:', isActive ? 'enabled' : 'disabled');
            rt().call.showStatus(`Emissions charge zones ${isActive ? 'on' : 'off'} for routing`, 'info');
        } else if (pref === 'cameras') {
            console.log('[Settings] Smarter routing:', isActive ? 'enabled' : 'disabled');
            rt().call.showStatus(`Map-based routing ${isActive ? 'on' : 'off'}`, 'info');
        } else if (pref === 'trafficLightsAvoid') {
            console.log('[Settings] Traffic signals routing:', isActive ? 'enabled' : 'disabled');
            rt().call.showStatus(`Traffic signals ${isActive ? 'on' : 'off'} for routing`, 'info');
        } else if (pref === 'railwayCrossingsAvoid') {
            console.log('[Settings] Level crossings routing:', isActive ? 'enabled' : 'disabled');
            rt().call.showStatus(`Level crossings ${isActive ? 'on' : 'off'} for routing`, 'info');
        }

        rt().call.saveAllSettings();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleAvoidancePreference: toggleAvoidancePreference,
        loadAvoidancePreferences: loadAvoidancePreferences,
        togglePreference: togglePreference,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteAvoidanceOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

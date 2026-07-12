/**
 * @file Camera hazard preference API toggle orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[HazardPreferences] Orchestration runtime not bound');
        }
        return runtime;
    }

    function HA() { return rt().hazardAlerts(); }
    function TU() { return rt().toggleUI(); }

    function applyHazardToggleStyles(button, enabled) {
        TU().applyLabeledToggleButton(button, enabled);
    }

    async function loadHazardCameraTogglesFromApi() {
        const ha = HA();
        const applyTogglePlan = (items) => {
            items.forEach((item) => {
                const btn = document.querySelector(`button.hazard-pref-toggle[data-hazard-type="${item.hazardType}"]`);
                if (btn) applyHazardToggleStyles(btn, item.enabled);
            });
        };

        try {
            const res = await fetch('/api/hazard-preferences');
            const data = await res.json();
            const prefsList = data.success && data.preferences ? data.preferences : [];
            applyTogglePlan(ha.buildHazardCameraTogglesApplyPlan(prefsList));
        } catch (e) {
            console.warn('[HAZARDS] Could not load camera hazard preferences:', e);
            applyTogglePlan(ha.buildHazardCameraTogglesFallbackApplyPlan());
        }
    }

    async function toggleHazardPreferenceApi(hazardType, ev) {
        if (ev) ev.preventDefault();
        const ha = HA();
        try {
            const res = await fetch('/api/hazard-preferences');
            const data = await res.json();
            if (!data.success || !data.preferences) {
                rt().call.showStatus('Could not load hazard preferences', 'error');
                return;
            }
            const pref = data.preferences.find((p) => p.hazard_type === hazardType);
            const newEnabled = !ha.isHazardPreferenceEnabled(pref);
            const payload = ha.buildHazardPreferenceTogglePayload(hazardType, pref, newEnabled);

            const upd = await fetch('/api/hazard-preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const out = await upd.json();
            if (!out.success) {
                rt().call.showStatus(out.error || 'Update failed', 'error');
                return;
            }
            const btn = document.querySelector(`button.hazard-pref-toggle[data-hazard-type="${hazardType}"]`);
            applyHazardToggleStyles(btn, newEnabled);
            rt().call.showStatus(ha.buildHazardPreferenceToggleStatusMessage(hazardType, newEnabled), 'info');
            rt().call.saveAllSettings();
        } catch (e) {
            console.error('[HAZARDS] toggle:', e);
            rt().call.showStatus('Could not update hazard preference', 'error');
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        loadHazardCameraTogglesFromApi: loadHazardCameraTogglesFromApi,
        toggleHazardPreferenceApi: toggleHazardPreferenceApi,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrHazardPreferencesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

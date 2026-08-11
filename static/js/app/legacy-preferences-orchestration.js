/**
 * @file Legacy preference restore orchestration (route avoidance, gesture, auto-GPS, battery).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[LegacyPreferences] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RP() { return rt().routePrefs(); }
    function TU() { return rt().toggleUI(); }
    function GC() { return rt().gestureControl(); }
    function LPR() { return rt().legacyPrefsRestore(); }
    function BS() { return rt().batterySaving(); }

    function loadPreferences() {
        const orch = LPR().buildLoadLegacyPreferencesOrchestrationPlan();

        if (orch.applyRouteAvoidanceToggles) {
            RP().buildRouteAvoidanceTogglesApplyPlan(localStorage).forEach((item) => {
                const button = document.getElementById(item.buttonId);

                if (button) {
                    TU().applyLabeledToggleButton(button, item.enabled);
                    console.log('[Settings] Loaded preference:', item.pref, '=', item.enabled ? 'enabled' : 'disabled',
                        item.usesDefault ? '(default)' : '');
                } else {
                    console.warn('[Settings] Button not found for preference:', item.pref, 'ID:', item.buttonId);
                }
            });
        }

        if (orch.loadHazardCameraTogglesFromApi) rt().call.loadHazardCameraTogglesFromApi();

        // Shake gesture removed — clear any prior enablement and detach listeners.
        rt().setGestureEnabled(false);
        localStorage.setItem(GC().GESTURE_ENABLED_STORAGE_KEY, 'false');
        window.removeEventListener('devicemotion', rt().call.handleDeviceMotion);

        const autoGpsRestore = LPR().buildRestoreAutoGpsPreferencePlan({
            savedValue: localStorage.getItem(LPR().AUTO_GPS_STORAGE_KEY),
        });
        if (autoGpsRestore.shouldRestore) {
            const autoGpsToggle = document.getElementById(autoGpsRestore.toggle.id);
            if (autoGpsToggle) {
                autoGpsToggle.checked = autoGpsRestore.toggle.checked;
                rt().setAutoGpsEnabled(autoGpsRestore.autoGpsEnabled);
                if (autoGpsRestore.startAutoGpsLocation) rt().call.startAutoGpsLocation();
                console.log(autoGpsRestore.restoreLogMessage);
            }
        }

        const batteryRestore = BS().buildRestoreBatterySavingUiPlan({
            savedValue: localStorage.getItem(BS().BATTERY_SAVING_STORAGE_KEY),
        });
        if (batteryRestore.shouldApply) {
            rt().call.applyBatterySavingModeFromPlan(batteryRestore);
        }

        if (orch.applySpeedWidgetToggleUi) rt().call.applySpeedWidgetToggleUi();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        loadPreferences: loadPreferences,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLegacyPreferencesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

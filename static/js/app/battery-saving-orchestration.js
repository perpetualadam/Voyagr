/**
 * @file Battery saving mode orchestration (toggle, enable/disable, status bridge).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var batterySavingMode = false;

    function rt() {
        if (!runtime) {
            throw new Error('[BatterySaving] Orchestration runtime not bound');
        }
        return runtime;
    }

    function BS() { return rt().batterySaving(); }

    function applyBatterySavingModeFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;
        const toggleUi = rt().toggleUI();
        if (execute.setBatterySavingMode) batterySavingMode = execute.batterySavingMode;
        if (execute.toggle) {
            toggleUi.applyToggleButton(document.getElementById(execute.toggle.id), execute.toggle.enabled);
        }
        if (execute.disableBodyAnimation) document.body.style.animation = 'none';
        if (execute.disableElementAnimations) {
            document.querySelectorAll('[style*="animation"]').forEach((el) => {
                el.style.animation = 'none';
            });
        }
        if (execute.restoreBodyAnimation) document.body.style.animation = '';
        if (execute.storageKey) localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.persistApiBody) {
            fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(execute.persistApiBody),
            }).catch((error) => console.error('Error updating battery mode:', error));
        }
        if (execute.statusMessage) rt().call.showStatus(execute.statusMessage, execute.statusType);
        if (execute.restoreLogMessage) console.log(execute.restoreLogMessage);
    }

    function toggleBatterySavingMode() {
        applyBatterySavingModeFromPlan(
            BS().buildToggleBatterySavingExecutePlan(batterySavingMode)
        );
    }

    function enableBatterySavingMode() {
        applyBatterySavingModeFromPlan(BS().buildEnableBatterySavingExecutePlan());
    }

    function disableBatterySavingMode() {
        applyBatterySavingModeFromPlan(BS().buildDisableBatterySavingExecutePlan());
    }

    function updateBatteryStatus(battery) {
        const batterySaving = BS();
        const level = Math.round(battery.level * 100);

        root.VoyagrBatteryMonitoringOrchestration.setCurrentBatteryLevel(battery.level);

        const autoEnable = batterySaving.buildBatteryAutoEnablePlan({
            levelPercent: level,
            currentlyEnabled: batterySavingMode,
        });
        if (autoEnable.shouldEnable) {
            enableBatterySavingMode();
        }
    }

    function getBatterySavingMode() {
        return batterySavingMode;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        applyBatterySavingModeFromPlan: applyBatterySavingModeFromPlan,
        toggleBatterySavingMode: toggleBatterySavingMode,
        enableBatterySavingMode: enableBatterySavingMode,
        disableBatterySavingMode: disableBatterySavingMode,
        updateBatteryStatus: updateBatteryStatus,
        getBatterySavingMode: getBatterySavingMode,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrBatterySavingOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

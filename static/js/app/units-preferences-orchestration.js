/**
 * @file Unit preference change orchestration (distance, currency, speed, temperature).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[UnitsPreferences] Orchestration runtime not bound');
        }
        return runtime;
    }

    function U() { return rt().units(); }

    function saveUnitSettingsToBackend() {
        const request = U().buildSaveUnitSettingsBackendRequestPlan({
            distanceUnit: rt().getDistanceUnit(),
            currencyUnit: rt().getCurrencyUnit(),
            speedUnit: rt().getSpeedUnit(),
            temperatureUnit: rt().getTemperatureUnit(),
        });
        if (!request.shouldSave) return;

        fetch(request.apiPath, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(request.body),
        }).catch((error) => console.error(request.errorLogPrefix, error));
    }

    function updateDistanceUnit() {
        const execute = U().buildDistanceUnitChangeExecutePlan(
            document.getElementById('distanceUnit')?.value
        );
        if (!execute.shouldChange) return;

        rt().setDistanceUnit(execute.newUnit);
        localStorage.setItem(execute.storageKey, execute.newUnit);
        if (execute.saveBackend) saveUnitSettingsToBackend();
        if (execute.updateDisplays) rt().call.updateAllDistanceDisplays();
        if (execute.saveSettings) rt().call.saveAllSettings();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    function updateCurrencyUnit() {
        const execute = U().buildCurrencyUnitChangeExecutePlan(
            document.getElementById('currencyUnit')?.value
        );
        if (!execute.shouldChange) return;

        rt().setCurrencyUnit(execute.newUnit);
        localStorage.setItem(execute.storageKey, execute.newUnit);
        if (execute.saveBackend) saveUnitSettingsToBackend();
        if (execute.updateDisplays) rt().call.updateAllCostDisplays();
        if (execute.saveSettings) rt().call.saveAllSettings();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    function updateSpeedUnit() {
        const execute = U().buildSpeedUnitChangeExecutePlan(
            document.getElementById('speedUnit')?.value
        );
        if (!execute.shouldChange) return;

        rt().setSpeedUnit(execute.newUnit);
        localStorage.setItem(execute.storageKey, execute.newUnit);
        if (execute.saveBackend) saveUnitSettingsToBackend();
        if (execute.updateDisplays) rt().call.updateAllSpeedDisplays();
        if (execute.saveSettings) rt().call.saveAllSettings();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    function updateTemperatureUnit() {
        const execute = U().buildTemperatureUnitChangeExecutePlan(
            document.getElementById('temperatureUnit')?.value
        );
        if (!execute.shouldChange) return;

        rt().setTemperatureUnit(execute.newUnit);
        localStorage.setItem(execute.storageKey, execute.newUnit);
        if (execute.saveBackend) saveUnitSettingsToBackend();
        if (execute.updateDisplays) rt().call.updateAllTemperatureDisplays();
        if (execute.saveSettings) rt().call.saveAllSettings();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        saveUnitSettingsToBackend: saveUnitSettingsToBackend,
        updateDistanceUnit: updateDistanceUnit,
        updateCurrencyUnit: updateCurrencyUnit,
        updateSpeedUnit: updateSpeedUnit,
        updateTemperatureUnit: updateTemperatureUnit,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrUnitsPreferencesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

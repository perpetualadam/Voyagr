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
    function SG() { return rt().speedGps(); }
    function SLW() { return rt().speedLimitWidget(); }

    function updateAllDistanceDisplays() {
        const mainEl = document.getElementById('distance');
        const previewEl = document.getElementById('previewDistance');
        const execute = U().buildUpdateAllDistanceDisplaysExecutePlan({
            distanceUnit: rt().getDistanceUnit(),
            mainDistanceKm: mainEl && mainEl.dataset.km,
            previewDistanceKm: previewEl && previewEl.dataset.km,
        });
        if (!execute.shouldUpdate) return;

        execute.elementPatches.forEach(({ id, text }) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });
    }

    function updateAllCostDisplays() {
        const fuelCostEl = document.getElementById('fuelCost');
        const tollCostEl = document.getElementById('tollCost');
        const cazCostEl = document.getElementById('cazCost');
        const execute = U().buildUpdateAllCostDisplaysExecutePlan({
            currencySymbol: getCurrencySymbol(),
            fuelCost: fuelCostEl && fuelCostEl.dataset.value,
            tollCost: tollCostEl && tollCostEl.dataset.value,
            cazCost: cazCostEl && cazCostEl.dataset.value,
        });
        if (!execute.shouldUpdate) return;

        execute.elementPatches.forEach(({ id, text }) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });
    }

    function updateAllSpeedDisplays() {
        const execute = SLW().buildUpdateAllSpeedDisplaysExecutePlan({
            apiSpeedLimitMph: rt().getCurrentSpeedLimitMph(),
            valhallaSpeedLimitMph: null,
            roadType: rt().getLastDetectedRoadType() || rt().call.getCurrentRoadType(undefined, rt().getCurrentGpsSpeedMph()),
            region: rt().getLastSpeedLimitRegion(),
            gpsSpeedMph: rt().getCurrentGpsSpeedMph(),
            speedUnit: rt().getSpeedUnit(),
        });
        if (execute.shouldUpdateWidget) {
            rt().call.updateSpeedWidget(execute.gpsSpeedMph, execute.shownLimitMph);
        }
        if (execute.shouldLog) console.log(execute.logMessage);
    }

    function updateAllTemperatureDisplays() {
        const execute = U().buildUpdateAllTemperatureDisplaysExecutePlan(rt().getTemperatureUnit());
        if (execute.shouldLog) console.log(execute.logMessage);
    }

    function convertDistance(km) {
        return U().convertDistance(km, rt().getDistanceUnit());
    }

    function getDistanceUnit() {
        return U().getDistanceUnit(rt().getDistanceUnit());
    }

    function convertSpeed(kmh) {
        const n = Number(kmh);
        if (!Number.isFinite(n)) return '0.0';
        const mph = SG().kmhToMph(n);
        const display = SG().mphToDisplaySpeed(mph, rt().getSpeedUnit());
        return display.toFixed(1);
    }

    function getSpeedUnit() {
        return SG().speedUnitLabel(rt().getSpeedUnit());
    }

    function convertTemperature(celsius) {
        return U().convertTemperature(celsius, rt().getTemperatureUnit());
    }

    function getTemperatureUnit() {
        return U().getTemperatureUnit(rt().getTemperatureUnit());
    }

    function getCurrencySymbol() {
        return U().getCurrencySymbol(rt().getCurrencyUnit());
    }

    function adjustCostForUnits(cost, costType) {
        if (costType === undefined) costType = 'fuel';
        return U().adjustCostForUnits(cost);
    }

    function getFuelEfficiencyInUnits(liters_per_100km) {
        return U().getFuelEfficiencyInUnits(liters_per_100km, rt().getDistanceUnit());
    }

    function getFuelEfficiencyLabel() {
        return U().getFuelEfficiencyLabel(rt().getDistanceUnit());
    }

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
        if (execute.updateDisplays) updateAllDistanceDisplays();
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
        if (execute.updateDisplays) updateAllCostDisplays();
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
        if (execute.updateDisplays) updateAllSpeedDisplays();
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
        if (execute.updateDisplays) updateAllTemperatureDisplays();
        if (execute.saveSettings) rt().call.saveAllSettings();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        convertDistance: convertDistance,
        getDistanceUnit: getDistanceUnit,
        convertSpeed: convertSpeed,
        getSpeedUnit: getSpeedUnit,
        convertTemperature: convertTemperature,
        getTemperatureUnit: getTemperatureUnit,
        getCurrencySymbol: getCurrencySymbol,
        adjustCostForUnits: adjustCostForUnits,
        getFuelEfficiencyInUnits: getFuelEfficiencyInUnits,
        getFuelEfficiencyLabel: getFuelEfficiencyLabel,
        saveUnitSettingsToBackend: saveUnitSettingsToBackend,
        updateDistanceUnit: updateDistanceUnit,
        updateCurrencyUnit: updateCurrencyUnit,
        updateSpeedUnit: updateSpeedUnit,
        updateTemperatureUnit: updateTemperatureUnit,
        updateAllDistanceDisplays: updateAllDistanceDisplays,
        updateAllCostDisplays: updateAllCostDisplays,
        updateAllSpeedDisplays: updateAllSpeedDisplays,
        updateAllTemperatureDisplays: updateAllTemperatureDisplays,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrUnitsPreferencesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

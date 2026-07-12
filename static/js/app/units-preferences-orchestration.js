/**
 * @file Unit preference change orchestration (distance, currency, speed, temperature).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    var distanceUnit = localStorage.getItem('unit_distance') || 'mi';
    var currencyUnit = localStorage.getItem('unit_currency') || 'GBP';
    var speedUnit = localStorage.getItem('unit_speed') || 'mph';
    var temperatureUnit = localStorage.getItem('unit_temperature') || 'celsius';

    var currencySymbols = {
        'GBP': '£',
        'USD': '$',
        'EUR': '€'
    };

    function getDistanceUnitValue() { return distanceUnit; }
    function setDistanceUnitValue(val) { distanceUnit = val; }
    function getCurrencyUnitValue() { return currencyUnit; }
    function setCurrencyUnitValue(val) { currencyUnit = val; }
    function getSpeedUnitValue() { return speedUnit; }
    function setSpeedUnitValue(val) { speedUnit = val; }
    function getTemperatureUnitValue() { return temperatureUnit; }
    function setTemperatureUnitValue(val) { temperatureUnit = val; }

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
            distanceUnit: getDistanceUnitValue(),
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
            speedUnit: getSpeedUnitValue(),
        });
        if (execute.shouldUpdateWidget) {
            rt().call.updateSpeedWidget(execute.gpsSpeedMph, execute.shownLimitMph);
        }
        if (execute.shouldLog) console.log(execute.logMessage);
    }

    function updateAllTemperatureDisplays() {
        const execute = U().buildUpdateAllTemperatureDisplaysExecutePlan(getTemperatureUnitValue());
        if (execute.shouldLog) console.log(execute.logMessage);
    }

    function convertDistance(km) {
        return U().convertDistance(km, getDistanceUnitValue());
    }

    function getDistanceUnit() {
        return U().getDistanceUnit(getDistanceUnitValue());
    }

    function convertSpeed(kmh) {
        const n = Number(kmh);
        if (!Number.isFinite(n)) return '0.0';
        const mph = SG().kmhToMph(n);
        const display = SG().mphToDisplaySpeed(mph, getSpeedUnitValue());
        return display.toFixed(1);
    }

    function getSpeedUnit() {
        return SG().speedUnitLabel(getSpeedUnitValue());
    }

    function convertTemperature(celsius) {
        return U().convertTemperature(celsius, getTemperatureUnitValue());
    }

    function getTemperatureUnit() {
        return U().getTemperatureUnit(getTemperatureUnitValue());
    }

    function getCurrencySymbol() {
        return U().getCurrencySymbol(getCurrencyUnitValue());
    }

    function adjustCostForUnits(cost, costType) {
        if (costType === undefined) costType = 'fuel';
        return U().adjustCostForUnits(cost);
    }

    function getFuelEfficiencyInUnits(liters_per_100km) {
        return U().getFuelEfficiencyInUnits(liters_per_100km, getDistanceUnitValue());
    }

    function getFuelEfficiencyLabel() {
        return U().getFuelEfficiencyLabel(getDistanceUnitValue());
    }

    function saveUnitSettingsToBackend() {
        const request = U().buildSaveUnitSettingsBackendRequestPlan({
            distanceUnit: getDistanceUnitValue(),
            currencyUnit: getCurrencyUnitValue(),
            speedUnit: getSpeedUnitValue(),
            temperatureUnit: getTemperatureUnitValue(),
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

        setDistanceUnitValue(execute.newUnit);
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

        setCurrencyUnitValue(execute.newUnit);
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

        setSpeedUnitValue(execute.newUnit);
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

        setTemperatureUnitValue(execute.newUnit);
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
        getDistanceUnitValue: getDistanceUnitValue,
        setDistanceUnitValue: setDistanceUnitValue,
        getCurrencyUnitValue: getCurrencyUnitValue,
        setCurrencyUnitValue: setCurrencyUnitValue,
        getSpeedUnitValue: getSpeedUnitValue,
        setSpeedUnitValue: setSpeedUnitValue,
        getTemperatureUnitValue: getTemperatureUnitValue,
        setTemperatureUnitValue: setTemperatureUnitValue,
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

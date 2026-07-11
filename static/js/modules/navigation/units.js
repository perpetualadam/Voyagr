/**
 * @file Pure unit-conversion helpers — distance, temperature, fuel efficiency.
 * @module modules/navigation/units
 *
 * Extracted from voyagr-app.js where each function read a global setting variable
 * (distanceUnit, temperatureUnit). The pure versions take the unit preference as an
 * explicit argument; the monolith stubs pass the global and keep existing callers working.
 * Speed conversion lives in modules/navigation/speed-gps.js and is not duplicated here.
 */
(function (root) {
    'use strict';

    /**
     * Convert kilometres to the user's display distance unit.
     * @param {number} km
     * @param {string} distanceUnit - 'mi' or 'km'
     * @returns {string} Fixed-2 decimal string
     */
    function convertDistance(km, distanceUnit) {
        if (distanceUnit === 'mi') return (km * 0.621371).toFixed(2);
        return Number(km).toFixed(2);
    }

    /**
     * Return the display label for the user's distance unit.
     * @param {string} distanceUnit - 'mi' or 'km'
     * @returns {'mi'|'km'}
     */
    function getDistanceUnit(distanceUnit) {
        return distanceUnit === 'mi' ? 'mi' : 'km';
    }

    /**
     * Convert Celsius to the user's temperature unit.
     * @param {number} celsius
     * @param {string} temperatureUnit - 'fahrenheit' or 'celsius'
     * @returns {string} Fixed-1 decimal string
     */
    function convertTemperature(celsius, temperatureUnit) {
        if (temperatureUnit === 'fahrenheit') return ((Number(celsius) * 9 / 5) + 32).toFixed(1);
        return Number(celsius).toFixed(1);
    }

    /**
     * Return the display label for the user's temperature unit.
     * @param {string} temperatureUnit - 'fahrenheit' or 'celsius'
     * @returns {'°F'|'°C'}
     */
    function getTemperatureUnit(temperatureUnit) {
        return temperatureUnit === 'fahrenheit' ? '°F' : '°C';
    }

    /**
     * Convert L/100 km fuel efficiency to the user's display unit.
     * @param {number} liters_per_100km
     * @param {string} distanceUnit - 'mi' or 'km'
     * @returns {string}
     */
    function getFuelEfficiencyInUnits(liters_per_100km, distanceUnit) {
        if (distanceUnit === 'mi') return (235.214 / liters_per_100km).toFixed(1);
        return Number(liters_per_100km).toFixed(1);
    }

    /**
     * Return the fuel-efficiency unit label.
     * @param {string} distanceUnit - 'mi' or 'km'
     * @returns {'MPG'|'L/100km'}
     */
    function getFuelEfficiencyLabel(distanceUnit) {
        return distanceUnit === 'mi' ? 'MPG' : 'L/100km';
    }

    /**
     * Canonical currency-code → symbol map.  Covers the three currencies the app
     * currently supports; unknown codes fall back to '£'.
     */
    var CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };

    /**
     * Return the symbol for a given ISO currency code.
     * @param {string} currencyCode - e.g. 'GBP', 'USD', 'EUR'
     * @returns {string}
     */
    function getCurrencySymbol(currencyCode) {
        return CURRENCY_SYMBOLS[String(currencyCode || '').toUpperCase()] || '£';
    }

    /**
     * Pass-through: currency totals from the API are absolute amounts (£/$/€) and must
     * not be rescaled when the user switches between mi and km — only distance *labels*
     * change, not prices.
     * @param {number} cost
     * @returns {number}
     */
    function adjustCostForUnits(cost) {
        return cost;
    }

    /** User-facing label when distance unit changes. */
    function distanceUnitStatusLabel(distanceUnit) {
        return distanceUnit === 'mi' ? 'miles' : 'kilometers';
    }

    /** User-facing label when speed unit changes. */
    function speedUnitStatusLabel(speedUnit) {
        return speedUnit === 'mph' ? 'mph' : 'km/h';
    }

    /** User-facing label when temperature unit changes. */
    function temperatureUnitStatusLabel(temperatureUnit) {
        return temperatureUnit === 'fahrenheit' ? 'Fahrenheit' : 'Celsius';
    }

    /**
     * Format remaining along-route distance for the journey summary bar.
     * @param {number} remainingDistanceMeters
     * @param {string} distanceUnit - 'mi' or 'km'
     * @returns {string}
     */
    function formatRemainingDistanceText(remainingDistanceMeters, distanceUnit) {
        if (distanceUnit === 'mi') {
            var miles = remainingDistanceMeters / 1609.34;
            return miles < 0.1
                ? Math.round(remainingDistanceMeters * 3.28084) + ' ft'
                : miles.toFixed(1) + ' mi';
        }
        var km = remainingDistanceMeters / 1000;
        return km < 0.1
            ? Math.round(remainingDistanceMeters) + ' m'
            : km.toFixed(1) + ' km';
    }

    /**
     * Format POI distance from metres for quick-search results.
     * @param {number} distanceM
     * @param {string} distanceUnit - 'mi' or 'km'
     * @returns {string}
     */
    function formatPoiDistanceMeters(distanceM, distanceUnit) {
        distanceM = distanceM || 0;
        if (distanceUnit === 'mi') {
            var distanceFeet = distanceM * 3.28084;
            if (distanceFeet < 5280) return Math.round(distanceFeet) + ' ft';
            return (distanceM / 1609.344).toFixed(1) + ' mi';
        }
        if (distanceM < 1000) return Math.round(distanceM) + ' m';
        return (distanceM / 1000).toFixed(1) + ' km';
    }

    var api = {
        convertDistance: convertDistance,
        getDistanceUnit: getDistanceUnit,
        convertTemperature: convertTemperature,
        getTemperatureUnit: getTemperatureUnit,
        getFuelEfficiencyInUnits: getFuelEfficiencyInUnits,
        getFuelEfficiencyLabel: getFuelEfficiencyLabel,
        getCurrencySymbol: getCurrencySymbol,
        adjustCostForUnits: adjustCostForUnits,
        distanceUnitStatusLabel: distanceUnitStatusLabel,
        speedUnitStatusLabel: speedUnitStatusLabel,
        temperatureUnitStatusLabel: temperatureUnitStatusLabel,
        formatRemainingDistanceText: formatRemainingDistanceText,
        formatPoiDistanceMeters: formatPoiDistanceMeters,
        CURRENCY_SYMBOLS: CURRENCY_SYMBOLS,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrUnits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

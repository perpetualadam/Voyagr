/**
 * @file Pure route-preference readers (toll avoidance, fuel/cost params).
 * @module modules/navigation/route-prefs
 */
(function (root) {
    'use strict';

    /** UK retail fuel/energy defaults (May 2026) — overridable via localStorage. */
    var DEFAULT_ROUTE_COST_PARAMS = {
        petrol_diesel: { fuel_price: 1.60, fuel_efficiency: 6.5, electricity_price: 0.32, energy_efficiency: 18.5 },
        electric: { fuel_price: 1.60, fuel_efficiency: 6.5, electricity_price: 0.32, energy_efficiency: 18.5 },
        hybrid: { fuel_price: 1.60, fuel_efficiency: 6.5, electricity_price: 0.32, energy_efficiency: 18.5 },
        pedestrian: { fuel_price: 1.60, fuel_efficiency: 6.5, electricity_price: 0.32, energy_efficiency: 18.5 },
        bicycle: { fuel_price: 1.60, fuel_efficiency: 6.5, electricity_price: 0.32, energy_efficiency: 18.5 },
    };

    /**
     * One-time migration: pref_avoid_tollRoads ← pref_tolls when canonical key unset.
     * @param {Storage} storage
     */
    function migrateTollPrefKey(storage) {
        try {
            var canon = storage.getItem('pref_avoid_tollRoads');
            var legacy = storage.getItem('pref_tolls');
            if (canon === null && legacy !== null) {
                var avoid = legacy !== 'false';
                storage.setItem('pref_avoid_tollRoads', avoid ? 'true' : 'false');
            }
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[Migration] Toll pref migration skipped:', e);
            }
        }
    }

    /**
     * Canonical reader for the "Avoid Toll Roads" preference.
     * @param {Storage} storage
     * @returns {boolean}
     */
    function isAvoidTollsEnabled(storage) {
        try {
            var canon = storage.getItem('pref_avoid_tollRoads');
            if (canon !== null) return canon === 'true';
            return storage.getItem('pref_tolls') !== 'false';
        } catch (e) {
            return false;
        }
    }

    /**
     * Fuel/energy params for route cost — localStorage overrides, then vehicle-type defaults.
     * @param {string} [vehicleType]
     * @param {Storage} storage
     * @returns {{fuel_efficiency: number, fuel_price: number, energy_efficiency: number, electricity_price: number}}
     */
    function getRouteCostParams(vehicleType, storage) {
        var vt = vehicleType || 'petrol_diesel';
        var defaults = DEFAULT_ROUTE_COST_PARAMS[vt] || DEFAULT_ROUTE_COST_PARAMS.petrol_diesel;
        return {
            fuel_efficiency: parseFloat(storage.getItem('fuelEfficiency') || String(defaults.fuel_efficiency)),
            fuel_price: parseFloat(storage.getItem('fuelPrice') || String(defaults.fuel_price)),
            energy_efficiency: parseFloat(storage.getItem('energyEfficiency') || String(defaults.energy_efficiency)),
            electricity_price: parseFloat(storage.getItem('electricityPrice') || String(defaults.electricity_price)),
        };
    }

    var api = {
        DEFAULT_ROUTE_COST_PARAMS: DEFAULT_ROUTE_COST_PARAMS,
        migrateTollPrefKey: migrateTollPrefKey,
        isAvoidTollsEnabled: isAvoidTollsEnabled,
        getRouteCostParams: getRouteCostParams,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoutePrefs = api;

    if (typeof localStorage !== 'undefined') {
        migrateTollPrefKey(localStorage);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);

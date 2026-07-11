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

    /** Default route preference object when routePreferences is unset in storage. */
    var DEFAULT_ROUTE_PREFERENCES = {
        avoidHighways: false,
        preferScenic: false,
        avoidTolls: true,
        avoidCAZ: true,
        preferQuiet: false,
        avoidUnpaved: false,
        routeOptimization: 'fastest',
        maxDetour: 20,
    };

    /** Map routing avoidance pref keys to settings button element ids. */
    var ROUTE_AVOIDANCE_PREF_BUTTON_IDS = {
        caz: 'avoidCAZ',
        cameras: 'avoidCameras',
        trafficLightsAvoid: 'avoidTrafficLights',
        railwayCrossingsAvoid: 'avoidRailwayCrossings',
    };

    /** Routing avoidance prefs that default to enabled when unset in storage. */
    var ROUTE_AVOIDANCE_PREFS_DEFAULT_ENABLED = [
        'caz',
        'cameras',
        'trafficLightsAvoid',
        'railwayCrossingsAvoid',
    ];

    /** Ordered routing avoidance preference keys shown in settings. */
    var ROUTE_AVOIDANCE_PREF_KEYS = ROUTE_AVOIDANCE_PREFS_DEFAULT_ENABLED.slice();

    /** Legacy route-leg avoidance prefs (toll roads, motorways, ferries). */
    var ROUTE_LEG_AVOIDANCE_PREF_KEYS = ['tollRoads', 'motorways', 'ferries'];

    /**
     * @param {string} pref
     * @returns {string}
     */
    function getRouteAvoidancePrefStorageKey(pref) {
        return 'pref_' + pref;
    }

    /**
     * @param {string} pref
     * @returns {string}
     */
    function resolveRouteAvoidanceButtonId(pref) {
        if (ROUTE_AVOIDANCE_PREF_BUTTON_IDS[pref]) {
            return ROUTE_AVOIDANCE_PREF_BUTTON_IDS[pref];
        }
        return 'avoid' + pref.charAt(0).toUpperCase() + pref.slice(1);
    }

    /**
     * @param {string} pref
     * @param {Storage} storage
     * @returns {boolean}
     */
    function isRouteAvoidancePrefEnabled(pref, storage) {
        var saved = storage.getItem(getRouteAvoidancePrefStorageKey(pref));
        if (saved === null) {
            return ROUTE_AVOIDANCE_PREFS_DEFAULT_ENABLED.indexOf(pref) >= 0;
        }
        return saved === 'true';
    }

    /**
     * Storage key for legacy route-leg avoidance prefs (pref_avoid_tollRoads, etc.).
     * @param {string} pref
     * @returns {string}
     */
    function getRouteLegAvoidancePrefStorageKey(pref) {
        return 'pref_avoid_' + pref;
    }

    /**
     * Settings button id for legacy route-leg avoidance prefs.
     * @param {string} pref
     * @returns {string}
     */
    function resolveRouteLegAvoidanceButtonId(pref) {
        return 'avoid' + pref.charAt(0).toUpperCase() + pref.slice(1);
    }

    /**
     * @param {string} pref
     * @param {Storage} storage
     * @returns {boolean}
     */
    function isRouteLegAvoidancePrefEnabled(pref, storage) {
        return storage.getItem(getRouteLegAvoidancePrefStorageKey(pref)) === 'true';
    }

    /**
     * Read saved route preferences from storage, with defaults when unset.
     * @param {Storage} storage
     * @returns {Object}
     */
    function getRoutePreferences(storage) {
        try {
            var saved = storage.getItem('routePreferences');
            if (saved) return JSON.parse(saved);
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[RoutePrefs] Failed to parse routePreferences:', e);
            }
        }
        return Object.assign({}, DEFAULT_ROUTE_PREFERENCES);
    }

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
        DEFAULT_ROUTE_PREFERENCES: DEFAULT_ROUTE_PREFERENCES,
        ROUTE_AVOIDANCE_PREF_BUTTON_IDS: ROUTE_AVOIDANCE_PREF_BUTTON_IDS,
        ROUTE_AVOIDANCE_PREFS_DEFAULT_ENABLED: ROUTE_AVOIDANCE_PREFS_DEFAULT_ENABLED,
        ROUTE_AVOIDANCE_PREF_KEYS: ROUTE_AVOIDANCE_PREF_KEYS,
        ROUTE_LEG_AVOIDANCE_PREF_KEYS: ROUTE_LEG_AVOIDANCE_PREF_KEYS,
        getRouteAvoidancePrefStorageKey: getRouteAvoidancePrefStorageKey,
        resolveRouteAvoidanceButtonId: resolveRouteAvoidanceButtonId,
        isRouteAvoidancePrefEnabled: isRouteAvoidancePrefEnabled,
        getRouteLegAvoidancePrefStorageKey: getRouteLegAvoidancePrefStorageKey,
        resolveRouteLegAvoidanceButtonId: resolveRouteLegAvoidanceButtonId,
        isRouteLegAvoidancePrefEnabled: isRouteLegAvoidancePrefEnabled,
        migrateTollPrefKey: migrateTollPrefKey,
        isAvoidTollsEnabled: isAvoidTollsEnabled,
        getRouteCostParams: getRouteCostParams,
        getRoutePreferences: getRoutePreferences,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoutePrefs = api;

    if (typeof localStorage !== 'undefined') {
        migrateTollPrefKey(localStorage);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);

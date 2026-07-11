/**
 * @file Pure recent-destination history helpers (localStorage, no network).
 * @module modules/navigation/recent-destinations
 */
(function (root) {
    'use strict';

    var STORAGE_KEY = 'voyagrRecentDestinations';
    var LIMIT = 15;

    /**
     * Load saved recent destinations from localStorage.
     * @param {string} [storageKey]
     * @returns {Array<object>}
     */
    function loadRecentDestinations(storageKey) {
        var key = storageKey || STORAGE_KEY;
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return [];
            var arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Record a destination, deduping by label+coords and capping list length.
     * @param {string} label
     * @param {number} lat
     * @param {number} lon
     * @param {string} [kind]
     * @param {string} [storageKey]
     * @param {number} [limit]
     */
    function recordRecentDestination(label, lat, lon, kind, storageKey, limit) {
        if (!label || lat == null || lon == null) return;
        var latN = parseFloat(lat);
        var lonN = parseFloat(lon);
        if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return;
        var trimmedLabel = String(label).trim();
        if (!trimmedLabel) return;

        var key = storageKey || STORAGE_KEY;
        var cap = limit || LIMIT;
        var list = loadRecentDestinations(key);
        var entry = {
            label: trimmedLabel,
            lat: latN,
            lon: lonN,
            ts: Date.now(),
            kind: kind || 'search'
        };
        var filtered = list.filter(function (x) {
            return !(
                Math.abs(x.lat - latN) < 1e-5 &&
                Math.abs(x.lon - lonN) < 1e-5 &&
                (x.label || '') === trimmedLabel
            );
        });
        filtered.unshift(entry);
        try {
            localStorage.setItem(key, JSON.stringify(filtered.slice(0, cap)));
        } catch (e) { /* quota */ }
    }

    var api = {
        STORAGE_KEY: STORAGE_KEY,
        LIMIT: LIMIT,
        loadRecentDestinations: loadRecentDestinations,
        recordRecentDestination: recordRecentDestination,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRecentDestinations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

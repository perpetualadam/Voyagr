/**
 * @file Pure Google Plus Codes search preference plans (no DOM, no network).
 * @module modules/navigation/google-plus-codes-prefs
 */
(function (root) {
    'use strict';

    var GOOGLE_PLUS_CODES_STORAGE_KEY = 'googlePlusCodesEnabled';
    var GOOGLE_PLUS_CODES_TOGGLE_ID = 'googlePlusCodesToggle';
    var GOOGLE_PLUS_CODES_DEFAULT_ENABLED = false;

    /**
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveGooglePlusCodesEnabledFromStorage(storageValue) {
        if (storageValue === null || storageValue === undefined || storageValue === '') {
            return GOOGLE_PLUS_CODES_DEFAULT_ENABLED;
        }
        return storageValue === 'true' || storageValue === '1';
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleGooglePlusCodesCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentlyEnabled;
        return { enabled: enabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleGooglePlusCodesExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: GOOGLE_PLUS_CODES_TOGGLE_ID,
            storageKey: GOOGLE_PLUS_CODES_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            toggleInactiveStyles: {
                inactiveBackground: '#ccc',
                inactiveBorder: '#ccc',
            },
            saveAllSettings: true,
            statusMessage: enabled
                ? '📍 Google Plus Codes enabled'
                : '📍 Google Plus Codes disabled',
            statusType: 'info',
            logMessage: '[Google Plus Codes] ' + (enabled ? 'Enabled' : 'Disabled'),
        };
    }

    var api = {
        GOOGLE_PLUS_CODES_STORAGE_KEY: GOOGLE_PLUS_CODES_STORAGE_KEY,
        GOOGLE_PLUS_CODES_TOGGLE_ID: GOOGLE_PLUS_CODES_TOGGLE_ID,
        GOOGLE_PLUS_CODES_DEFAULT_ENABLED: GOOGLE_PLUS_CODES_DEFAULT_ENABLED,
        resolveGooglePlusCodesEnabledFromStorage: resolveGooglePlusCodesEnabledFromStorage,
        buildToggleGooglePlusCodesCollectPlan: buildToggleGooglePlusCodesCollectPlan,
        buildToggleGooglePlusCodesExecutePlan: buildToggleGooglePlusCodesExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGooglePlusCodesPrefs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

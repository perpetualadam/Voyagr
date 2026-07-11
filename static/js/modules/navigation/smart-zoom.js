/**
 * @file Pure smart-zoom preference plans (no DOM, no network).
 * @module modules/navigation/smart-zoom
 */
(function (root) {
    'use strict';

    var SMART_ZOOM_STORAGE_KEY = 'smartZoomEnabled';
    var SMART_ZOOM_TOGGLE_ID = 'smartZoomToggle';
    var SMART_ZOOM_DEFAULT_ENABLED = true;

    /**
     * Resolve smart zoom enabled from localStorage value.
     * Default is enabled when unset (matches product default).
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveSmartZoomEnabledFromStorage(storageValue) {
        if (storageValue === null || storageValue === undefined || storageValue === '') {
            return SMART_ZOOM_DEFAULT_ENABLED;
        }
        return storageValue === '1' || storageValue === 'true';
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleSmartZoomCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentlyEnabled;
        return { enabled: enabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleSmartZoomExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggle: {
                id: SMART_ZOOM_TOGGLE_ID,
                enabled: enabled,
            },
            storageKey: SMART_ZOOM_STORAGE_KEY,
            storageValue: enabled ? '1' : '0',
            saveAllSettings: true,
            statusMessage: '🔍 Smart Zoom ' + (enabled ? 'enabled' : 'disabled'),
            statusType: 'info',
            logMessage: '[SmartZoom] Toggled to:',
        };
    }

    var api = {
        SMART_ZOOM_STORAGE_KEY: SMART_ZOOM_STORAGE_KEY,
        SMART_ZOOM_TOGGLE_ID: SMART_ZOOM_TOGGLE_ID,
        SMART_ZOOM_DEFAULT_ENABLED: SMART_ZOOM_DEFAULT_ENABLED,
        resolveSmartZoomEnabledFromStorage: resolveSmartZoomEnabledFromStorage,
        buildToggleSmartZoomCollectPlan: buildToggleSmartZoomCollectPlan,
        buildToggleSmartZoomExecutePlan: buildToggleSmartZoomExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSmartZoom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

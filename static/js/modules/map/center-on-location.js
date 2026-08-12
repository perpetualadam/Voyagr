/**
 * @file Pure center-on-location preference plans (no DOM, no network).
 * Controls whether the map flies from the default London view to the user's
 * GPS position when location is available at init / when the setting is enabled.
 * @module modules/map/center-on-location
 */
(function (root) {
    'use strict';

    var CENTER_ON_LOCATION_STORAGE_KEY = 'centerMapOnLocation';
    var CENTER_ON_LOCATION_TOGGLE_ID = 'centerOnLocationToggle';
    var CENTER_ON_LOCATION_DEFAULT_ENABLED = true;

    /**
     * Resolve center-on-location enabled from localStorage value.
     * Default is enabled when unset (matches current product behaviour).
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveCenterOnLocationEnabledFromStorage(storageValue) {
        if (storageValue === null || storageValue === undefined || storageValue === '') {
            return CENTER_ON_LOCATION_DEFAULT_ENABLED;
        }
        return storageValue === '1' || storageValue === 'true';
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleCenterOnLocationCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleCenterOnLocationExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggle: {
                id: CENTER_ON_LOCATION_TOGGLE_ID,
                enabled: enabled,
            },
            storageKey: CENTER_ON_LOCATION_STORAGE_KEY,
            storageValue: enabled ? '1' : '0',
            saveAllSettings: true,
            shouldFlyToUser: enabled,
            statusMessage: '📍 Center on my location ' + (enabled ? 'enabled' : 'disabled'),
            statusType: 'info',
            logMessage: '[CenterOnLocation] Toggled to:',
        };
    }

    /**
     * Whether init (or a scheduled fly) should move the camera to the user.
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @param {boolean} [input.hasCoordinates]
     * @returns {{ shouldFly: boolean, reason: string }}
     */
    function buildCenterOnLocationFlyDecision(input) {
        input = input || {};
        if (!input.enabled) {
            return { shouldFly: false, reason: 'disabled' };
        }
        if (!input.hasCoordinates) {
            return { shouldFly: false, reason: 'no_coordinates' };
        }
        return { shouldFly: true, reason: 'enabled' };
    }

    var api = {
        CENTER_ON_LOCATION_STORAGE_KEY: CENTER_ON_LOCATION_STORAGE_KEY,
        CENTER_ON_LOCATION_TOGGLE_ID: CENTER_ON_LOCATION_TOGGLE_ID,
        CENTER_ON_LOCATION_DEFAULT_ENABLED: CENTER_ON_LOCATION_DEFAULT_ENABLED,
        resolveCenterOnLocationEnabledFromStorage: resolveCenterOnLocationEnabledFromStorage,
        buildToggleCenterOnLocationCollectPlan: buildToggleCenterOnLocationCollectPlan,
        buildToggleCenterOnLocationExecutePlan: buildToggleCenterOnLocationExecutePlan,
        buildCenterOnLocationFlyDecision: buildCenterOnLocationFlyDecision,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrCenterOnLocation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

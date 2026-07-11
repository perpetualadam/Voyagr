/**
 * @file Pure 2D/3D map view preset plans (no DOM, no network).
 * @module modules/map/map-view-3d
 */
(function (root) {
    'use strict';

    var MAP_VIEW_3D_STORAGE_KEY = 'mapView3DEnabled';
    var DRIVER_PERSPECTIVE_STORAGE_KEY = 'driverPerspectiveEnabled';
    var MAP_VIEW_3D_TOGGLE_ID = 'mapView3DToggle';
    var DRIVER_PERSPECTIVE_TOGGLE_ID = 'driverPerspectiveToggle';
    var BUILDINGS_3D_TOGGLE_ID = 'buildings3DToggle';

    /**
     * @param {string|null|undefined} storageValue
     * @param {boolean} [fallbackFromGranular]
     * @returns {boolean}
     */
    function resolveMapView3DEnabledFromStorage(storageValue, fallbackFromGranular) {
        if (storageValue !== null && storageValue !== undefined && storageValue !== '') {
            return storageValue === 'true';
        }
        return !!fallbackFromGranular;
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.driverPerspectiveEnabled]
     * @param {boolean} [input.buildings3DEnabled]
     * @returns {Object}
     */
    function buildRecomputeMapView3DFromGranularExecutePlan(input) {
        input = input || {};
        var enabled = !!(input.driverPerspectiveEnabled || input.buildings3DEnabled);
        return {
            shouldApply: true,
            mapView3DEnabled: enabled,
            storageKey: MAP_VIEW_3D_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            syncToggleUI: true,
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleMapView3DCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleMapView3DExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            storageKey: MAP_VIEW_3D_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            saveAllSettings: true,
            statusMessage: enabled ? '🏙️ 3D map view' : '🗺️ 2D map view',
            statusType: 'info',
        };
    }

    /**
     * @param {boolean} enabled
     * @param {Object} [input]
     * @param {number} [input.heightMultiplier]
     * @param {number} [input.opacity]
     * @returns {Object}
     */
    function buildSetMapView3DExecutePlan(enabled, input) {
        input = input || {};
        var on = !!enabled;
        return {
            shouldApply: true,
            mapView3DEnabled: on,
            mapViewStorageKey: MAP_VIEW_3D_STORAGE_KEY,
            mapViewStorageValue: on ? 'true' : 'false',
            driverPerspectiveEnabled: on,
            driverPerspectiveStorageKey: DRIVER_PERSPECTIVE_STORAGE_KEY,
            driverPerspectiveStorageValue: on ? 'true' : 'false',
            buildings3DEnabled: on,
            buildings3DStorageKey: 'buildings3DEnabled',
            buildings3DStorageValue: on ? 'true' : 'false',
            heightMultiplier: input.heightMultiplier,
            opacity: input.opacity,
            applyDriverPerspective: true,
            mapBuildingsAction: on ? 'add3DBuildings' : 'remove3DBuildings',
            syncToggleUI: true,
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleDriverPerspectiveCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @param {boolean} [input.activeNavFollow]
     * @param {boolean} [input.pitched]
     * @returns {Object}
     */
    function buildToggleDriverPerspectiveExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        var statusMessage;
        if (enabled) {
            statusMessage = '🚗 Driver\'s view enabled';
        } else if (input.activeNavFollow) {
            statusMessage = '🚗 Preference saved — driver view stays on during navigation';
        } else {
            statusMessage = '🗺️ Standard view';
        }
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: DRIVER_PERSPECTIVE_TOGGLE_ID,
            storageKey: DRIVER_PERSPECTIVE_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            applyToggleWithPitchedState: true,
            pitched: !!input.pitched,
            applyDriverPerspective: true,
            recomputeMapView3D: true,
            saveAllSettings: true,
            statusMessage: statusMessage,
            statusType: 'info',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.mapView3DEnabled]
     * @param {boolean} [input.driverPerspectiveEnabled]
     * @param {boolean} [input.buildings3DEnabled]
     * @returns {Object}
     */
    function buildSyncMapView3DToggleUIPlan(input) {
        input = input || {};
        return {
            shouldApply: true,
            masterToggleId: MAP_VIEW_3D_TOGGLE_ID,
            mapView3DEnabled: !!input.mapView3DEnabled,
            clearMasterInactiveStylesWhenOff: true,
            driverPerspectiveToggleId: DRIVER_PERSPECTIVE_TOGGLE_ID,
            driverPerspectiveEnabled: !!input.driverPerspectiveEnabled,
            buildings3DToggleId: BUILDINGS_3D_TOGGLE_ID,
            buildings3DEnabled: !!input.buildings3DEnabled,
        };
    }

    var api = {
        MAP_VIEW_3D_STORAGE_KEY: MAP_VIEW_3D_STORAGE_KEY,
        DRIVER_PERSPECTIVE_STORAGE_KEY: DRIVER_PERSPECTIVE_STORAGE_KEY,
        MAP_VIEW_3D_TOGGLE_ID: MAP_VIEW_3D_TOGGLE_ID,
        DRIVER_PERSPECTIVE_TOGGLE_ID: DRIVER_PERSPECTIVE_TOGGLE_ID,
        BUILDINGS_3D_TOGGLE_ID: BUILDINGS_3D_TOGGLE_ID,
        resolveMapView3DEnabledFromStorage: resolveMapView3DEnabledFromStorage,
        buildRecomputeMapView3DFromGranularExecutePlan: buildRecomputeMapView3DFromGranularExecutePlan,
        buildToggleMapView3DCollectPlan: buildToggleMapView3DCollectPlan,
        buildToggleMapView3DExecutePlan: buildToggleMapView3DExecutePlan,
        buildSetMapView3DExecutePlan: buildSetMapView3DExecutePlan,
        buildToggleDriverPerspectiveCollectPlan: buildToggleDriverPerspectiveCollectPlan,
        buildToggleDriverPerspectiveExecutePlan: buildToggleDriverPerspectiveExecutePlan,
        buildSyncMapView3DToggleUIPlan: buildSyncMapView3DToggleUIPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapView3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

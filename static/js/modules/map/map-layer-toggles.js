/**
 * @file Pure map layer toggle plans (3D buildings, road labels; no DOM, no network).
 * @module modules/map/map-layer-toggles
 */
(function (root) {
    'use strict';

    var BUILDINGS_3D_STORAGE_KEY = 'buildings3DEnabled';
    var BUILDINGS_3D_HEIGHT_STORAGE_KEY = 'buildings3DHeight';
    var BUILDINGS_3D_OPACITY_STORAGE_KEY = 'buildings3DOpacity';
    var BUILDINGS_3D_TOGGLE_ID = 'buildings3DToggle';
    var ROAD_LABELS_STORAGE_KEY = 'roadLabelsEnabled';
    var ROAD_LABELS_TOGGLE_ID = 'roadLabelsToggle';

    var BUILDINGS_3D_DEFAULT_ENABLED = true;
    var ROAD_LABELS_DEFAULT_ENABLED = true;
    var BUILDINGS_3D_DEFAULT_HEIGHT = 1.0;
    var BUILDINGS_3D_DEFAULT_OPACITY = 0.6;
    var BUILDINGS_3D_HEIGHT_MIN = 0.5;
    var BUILDINGS_3D_HEIGHT_MAX = 3.0;
    var BUILDINGS_3D_OPACITY_MIN = 0.1;
    var BUILDINGS_3D_OPACITY_MAX = 1.0;

    var TRAFFIC_LAYER_ID = 'traffic-layer';
    var WEATHER_LAYER_ID = 'weather-layer';
    var SHOW_TRAFFIC_STORAGE_KEY = 'showTrafficEnabled';
    var SHOW_TRAFFIC_TOGGLE_ID = 'showTrafficToggle';
    var SHOW_TRAFFIC_DEFAULT_ENABLED = true;

    /**
     * Resolve a boolean preference stored as 'true'/'false' strings (default on unless 'false').
     * @param {string|null|undefined} storageValue
     * @param {boolean} defaultEnabled
     * @returns {boolean}
     */
    function resolveDefaultOnBooleanFromStorage(storageValue, defaultEnabled) {
        if (storageValue === null || storageValue === undefined || storageValue === '') {
            return defaultEnabled;
        }
        return storageValue !== 'false';
    }

    /**
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveBuildings3DEnabledFromStorage(storageValue) {
        return resolveDefaultOnBooleanFromStorage(storageValue, BUILDINGS_3D_DEFAULT_ENABLED);
    }

    /**
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveRoadLabelsEnabledFromStorage(storageValue) {
        return resolveDefaultOnBooleanFromStorage(storageValue, ROAD_LABELS_DEFAULT_ENABLED);
    }

    /**
     * @param {string|number|null|undefined} storageValue
     * @returns {number}
     */
    function parseBuildings3DHeightMultiplier(storageValue) {
        var parsed = parseFloat(storageValue);
        if (!Number.isFinite(parsed)) return BUILDINGS_3D_DEFAULT_HEIGHT;
        return Math.max(BUILDINGS_3D_HEIGHT_MIN, Math.min(BUILDINGS_3D_HEIGHT_MAX, parsed));
    }

    /**
     * @param {string|number|null|undefined} storageValue
     * @returns {number}
     */
    function parseBuildings3DOpacity(storageValue) {
        var parsed = parseFloat(storageValue);
        if (!Number.isFinite(parsed)) return BUILDINGS_3D_DEFAULT_OPACITY;
        return Math.max(BUILDINGS_3D_OPACITY_MIN, Math.min(BUILDINGS_3D_OPACITY_MAX, parsed));
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggle3DBuildingsCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentlyEnabled;
        return { enabled: enabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @param {number} [input.heightMultiplier]
     * @param {number} [input.opacity]
     * @returns {Object}
     */
    function buildToggle3DBuildingsExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: BUILDINGS_3D_TOGGLE_ID,
            storageKey: BUILDINGS_3D_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            mapAction: enabled ? 'add3DBuildings' : 'remove3DBuildings',
            heightMultiplier: input.heightMultiplier != null
                ? input.heightMultiplier
                : BUILDINGS_3D_DEFAULT_HEIGHT,
            opacity: input.opacity != null ? input.opacity : BUILDINGS_3D_DEFAULT_OPACITY,
            recomputeMapView3D: true,
            saveAllSettings: true,
            statusMessage: enabled ? '🏢 3D Buildings enabled' : '🏢 3D Buildings disabled',
            statusType: enabled ? 'success' : 'info',
            logMessage: enabled ? '[3D Buildings] Enabled' : '[3D Buildings] Disabled',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleRoadLabelsCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentlyEnabled;
        return { enabled: enabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleRoadLabelsExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: ROAD_LABELS_TOGGLE_ID,
            storageKey: ROAD_LABELS_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            mapAction: 'toggleRoadLabels',
            toggleInactiveStyles: {
                inactiveBackground: '#ccc',
                inactiveBorder: '#ccc',
            },
            saveAllSettings: true,
            statusMessage: enabled ? '🛣️ Road labels enabled' : '🛣️ Road labels disabled',
            statusType: 'info',
            logMessage: '[Road Labels] ' + (enabled ? 'Enabled' : 'Disabled'),
        };
    }

    /**
     * @param {number} multiplier
     * @returns {Object}
     */
    function buildSet3DBuildingHeightExecutePlan(multiplier) {
        var value = parseBuildings3DHeightMultiplier(multiplier);
        return {
            shouldApply: true,
            heightMultiplier: value,
            storageKey: BUILDINGS_3D_HEIGHT_STORAGE_KEY,
            storageValue: String(value),
            mapAction: 'set3DBuildingHeight',
            logMessage: '[3D Buildings] Height multiplier set to ' + value,
        };
    }

    /**
     * @param {number} opacity
     * @returns {Object}
     */
    function buildSet3DBuildingOpacityExecutePlan(opacity) {
        var value = parseBuildings3DOpacity(opacity);
        return {
            shouldApply: true,
            opacity: value,
            storageKey: BUILDINGS_3D_OPACITY_STORAGE_KEY,
            storageValue: String(value),
            mapAction: 'set3DBuildingOpacity',
            logMessage: '[3D Buildings] Opacity set to ' + value,
        };
    }

    /**
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveShowTrafficEnabledFromStorage(storageValue) {
        return resolveDefaultOnBooleanFromStorage(storageValue, SHOW_TRAFFIC_DEFAULT_ENABLED);
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleTrafficLayerCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentlyEnabled;
        return { enabled: enabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleTrafficLayerExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: SHOW_TRAFFIC_TOGGLE_ID,
            storageKey: SHOW_TRAFFIC_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            mapAction: enabled ? 'addTrafficLayer' : 'removeTrafficLayer',
            saveAllSettings: true,
            statusMessage: enabled ? '🚦 Traffic layer enabled' : '🚦 Traffic layer disabled',
            statusType: enabled ? 'success' : 'info',
            logMessage: enabled
                ? '[Traffic] Traffic flow layer enabled'
                : '[Traffic] Traffic flow layer disabled',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildInitTrafficLayerExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: SHOW_TRAFFIC_TOGGLE_ID,
            addTrafficLayer: enabled,
            deferOnBootstrapStyle: true,
            bootstrapStyleName: 'voyagr-bootstrap',
            deferLogMessage: '[Traffic] Deferring traffic flow until basemap style loads',
        };
    }

    /**
     * Plan for voyagr-vector-style-ready handler (re-apply labels, reconcile overlays).
     * @param {Object} [input]
     * @param {boolean} [input.hasMap]
     * @param {boolean} [input.hasMapLibreHelpers]
     * @param {string|null|undefined} [input.roadLabelsStorageValue]
     * @param {boolean} [input.showTrafficEnabled]
     * @param {boolean} [input.showWeatherEnabled]
     * @param {boolean} [input.hasTrafficLayerRef]
     * @param {boolean} [input.mapHasTrafficLayer]
     * @param {boolean} [input.hasWeatherLayerRef]
     * @param {boolean} [input.mapHasWeatherLayer]
     * @returns {Object}
     */
    function buildVectorStyleReadyReconcilePlan(input) {
        input = input || {};
        var roadLabelsOn = resolveRoadLabelsEnabledFromStorage(input.roadLabelsStorageValue);
        var resetTrafficRef = !!(input.hasTrafficLayerRef && !input.mapHasTrafficLayer);
        var resetWeatherRef = !!(input.hasWeatherLayerRef && !input.mapHasWeatherLayer);

        return {
            shouldRun: !!(input.hasMap && input.hasMapLibreHelpers),
            reapplyRoadLabels: true,
            roadLabelsEnabled: roadLabelsOn,
            scheduleMapRepaint: true,
            resetTrafficLayerRef: resetTrafficRef,
            resetWeatherLayerRef: resetWeatherRef,
            addTrafficLayer: !!input.showTrafficEnabled,
            addWeatherLayer: !!input.showWeatherEnabled,
            trafficLayerId: TRAFFIC_LAYER_ID,
            weatherLayerId: WEATHER_LAYER_ID,
        };
    }

    var api = {
        BUILDINGS_3D_STORAGE_KEY: BUILDINGS_3D_STORAGE_KEY,
        BUILDINGS_3D_HEIGHT_STORAGE_KEY: BUILDINGS_3D_HEIGHT_STORAGE_KEY,
        BUILDINGS_3D_OPACITY_STORAGE_KEY: BUILDINGS_3D_OPACITY_STORAGE_KEY,
        BUILDINGS_3D_TOGGLE_ID: BUILDINGS_3D_TOGGLE_ID,
        ROAD_LABELS_STORAGE_KEY: ROAD_LABELS_STORAGE_KEY,
        ROAD_LABELS_TOGGLE_ID: ROAD_LABELS_TOGGLE_ID,
        SHOW_TRAFFIC_STORAGE_KEY: SHOW_TRAFFIC_STORAGE_KEY,
        SHOW_TRAFFIC_TOGGLE_ID: SHOW_TRAFFIC_TOGGLE_ID,
        SHOW_TRAFFIC_DEFAULT_ENABLED: SHOW_TRAFFIC_DEFAULT_ENABLED,
        BUILDINGS_3D_DEFAULT_HEIGHT: BUILDINGS_3D_DEFAULT_HEIGHT,
        BUILDINGS_3D_DEFAULT_OPACITY: BUILDINGS_3D_DEFAULT_OPACITY,
        resolveDefaultOnBooleanFromStorage: resolveDefaultOnBooleanFromStorage,
        resolveBuildings3DEnabledFromStorage: resolveBuildings3DEnabledFromStorage,
        resolveRoadLabelsEnabledFromStorage: resolveRoadLabelsEnabledFromStorage,
        parseBuildings3DHeightMultiplier: parseBuildings3DHeightMultiplier,
        parseBuildings3DOpacity: parseBuildings3DOpacity,
        buildToggle3DBuildingsCollectPlan: buildToggle3DBuildingsCollectPlan,
        buildToggle3DBuildingsExecutePlan: buildToggle3DBuildingsExecutePlan,
        buildToggleRoadLabelsCollectPlan: buildToggleRoadLabelsCollectPlan,
        buildToggleRoadLabelsExecutePlan: buildToggleRoadLabelsExecutePlan,
        buildSet3DBuildingHeightExecutePlan: buildSet3DBuildingHeightExecutePlan,
        buildSet3DBuildingOpacityExecutePlan: buildSet3DBuildingOpacityExecutePlan,
        resolveShowTrafficEnabledFromStorage: resolveShowTrafficEnabledFromStorage,
        buildToggleTrafficLayerCollectPlan: buildToggleTrafficLayerCollectPlan,
        buildToggleTrafficLayerExecutePlan: buildToggleTrafficLayerExecutePlan,
        buildInitTrafficLayerExecutePlan: buildInitTrafficLayerExecutePlan,
        buildVectorStyleReadyReconcilePlan: buildVectorStyleReadyReconcilePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapLayerToggles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

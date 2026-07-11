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
    var TRAFFIC_SOURCE_ID = 'traffic-source';
    var TRAFFIC_CONFIG_API_PATH = '/api/config';
    var TRAFFIC_TILE_PROXY_PATH = '/api/tomtom/traffic-tile/{z}/{x}/{y}.png';
    var TRAFFIC_TOMTOM_TILE_TEMPLATE = 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key={key}&tileSize=256';
    var TRAFFIC_PENDING_GUARD_PROPERTY = '__voyagrTrafficLayerPending';
    var TRAFFIC_STYLE_POLL_MAX_ATTEMPTS = 40;
    var TRAFFIC_STYLE_POLL_INTERVAL_MS = 250;
    var TRAFFIC_RASTER_OPACITY = 0.6;

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
     * @param {Object} [input]
     * @param {boolean} [input.useProxy]
     * @param {string} [input.origin]
     * @param {string} [input.apiKey]
     * @returns {Object}
     */
    function buildTrafficTileUrlsPlan(input) {
        input = input || {};
        if (input.useProxy && input.origin) {
            return {
                hasTiles: true,
                tiles: [input.origin + TRAFFIC_TILE_PROXY_PATH],
            };
        }
        if (input.apiKey) {
            return {
                hasTiles: true,
                tiles: [TRAFFIC_TOMTOM_TILE_TEMPLATE.replace('{key}', input.apiKey)],
            };
        }
        return { hasTiles: false, noCredentialsLogMessage: '[Traffic] No tile URL available' };
    }

    /**
     * @param {string[]} tiles
     * @returns {Object}
     */
    function buildTrafficRasterSourceSpec(tiles) {
        return {
            type: 'raster',
            tiles: tiles,
            tileSize: 256,
            minzoom: 0,
            maxzoom: 16,
            bounds: [-180, -85.0511, 180, 85.0511],
        };
    }

    /**
     * @param {Object} [input]
     * @param {string|null} [input.beforeLayerId]
     * @returns {Object}
     */
    function buildTrafficRasterLayerSpec(input) {
        input = input || {};
        return {
            id: TRAFFIC_LAYER_ID,
            type: 'raster',
            source: TRAFFIC_SOURCE_ID,
            minzoom: 0,
            maxzoom: 16,
            paint: { 'raster-opacity': TRAFFIC_RASTER_OPACITY },
            beforeLayerId: input.beforeLayerId || null,
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.useProxy]
     * @param {boolean} [input.hasApiKey]
     * @returns {Object}
     */
    function buildTrafficLayerCredentialsFetchPlan(input) {
        input = input || {};
        if (input.useProxy || input.hasApiKey) {
            return { shouldFetch: false };
        }
        return {
            shouldFetch: true,
            url: TRAFFIC_CONFIG_API_PATH,
            fetchLogMessage: '[Traffic] Fetching config from server...',
            enableProxyFlag: 'tomtom_traffic_tile_proxy',
            apiKeyField: 'tomtom_api_key',
            noKeyLogMessage: '[Traffic] No API key from server - using route-level traffic only',
            errorLogPrefix: '[Traffic] Failed to fetch config:',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.hasMap]
     * @param {boolean} [input.pendingGuardSet]
     * @param {boolean} [input.isStyleLoaded]
     * @returns {Object}
     */
    function buildAddTrafficLayerOrchestrationPlan(input) {
        input = input || {};
        if (!input.hasMap) {
            return { shouldProceed: false, mapNotReadyLog: '[Traffic] Map not ready' };
        }
        if (input.pendingGuardSet) {
            return { shouldProceed: false, skipDueToPendingGuard: true };
        }
        return {
            shouldProceed: true,
            pendingGuardProperty: TRAFFIC_PENDING_GUARD_PROPERTY,
            removeExistingFirst: true,
            sourceId: TRAFFIC_SOURCE_ID,
            layerId: TRAFFIC_LAYER_ID,
            isStyleLoaded: !!input.isStyleLoaded,
            waitForStyleLog: '[Traffic] Waiting for style to load...',
            stylePollMaxAttempts: TRAFFIC_STYLE_POLL_MAX_ATTEMPTS,
            stylePollIntervalMs: TRAFFIC_STYLE_POLL_INTERVAL_MS,
            stylePollGiveUpLog: '[Traffic] Style not loaded after polling — giving up',
            successLog: '[Traffic] TomTom traffic layer added successfully',
            bringRoutesToTop: true,
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
        TRAFFIC_SOURCE_ID: TRAFFIC_SOURCE_ID,
        TRAFFIC_LAYER_ID: TRAFFIC_LAYER_ID,
        TRAFFIC_PENDING_GUARD_PROPERTY: TRAFFIC_PENDING_GUARD_PROPERTY,
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
        buildTrafficTileUrlsPlan: buildTrafficTileUrlsPlan,
        buildTrafficRasterSourceSpec: buildTrafficRasterSourceSpec,
        buildTrafficRasterLayerSpec: buildTrafficRasterLayerSpec,
        buildTrafficLayerCredentialsFetchPlan: buildTrafficLayerCredentialsFetchPlan,
        buildAddTrafficLayerOrchestrationPlan: buildAddTrafficLayerOrchestrationPlan,
        buildVectorStyleReadyReconcilePlan: buildVectorStyleReadyReconcilePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapLayerToggles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

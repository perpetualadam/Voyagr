/**
 * @file Pure map overlay toggle plans (cameras, OSM icons; no DOM, no network).
 * @module modules/map/map-overlay-toggles
 */
(function (root) {
    'use strict';

    var SHOW_CAMERAS_STORAGE_KEY = 'showCamerasEnabled';
    var SHOW_CAMERAS_TOGGLE_ID = 'showCamerasToggle';
    var SHOW_CAMERAS_DEFAULT_ENABLED = true;

    var SHOW_OSM_TRAFFIC_LIGHTS_STORAGE_KEY = 'showOsmTrafficLightsOnMap';
    var SHOW_OSM_TRAFFIC_LIGHTS_TOGGLE_ID = 'showOsmTrafficLightsToggle';
    var SHOW_OSM_TRAFFIC_LIGHTS_DEFAULT_ENABLED = true;

    var SHOW_OSM_RAILWAY_CROSSINGS_STORAGE_KEY = 'showOsmRailwayCrossingsOnMap';
    var SHOW_OSM_RAILWAY_CROSSINGS_TOGGLE_ID = 'showOsmRailwayCrossingsToggle';
    var SHOW_OSM_RAILWAY_CROSSINGS_DEFAULT_ENABLED = true;

    var OVERLAY_MIN_ZOOM = 10;
    var OSM_OVERLAY_MAX_BBOX_DEG = 0.35;

    var CAMERAS_AREA_API_PATH = '/api/cameras/area';
    var OSM_TRAFFIC_LIGHTS_AREA_API_PATH = '/api/traffic-lights/area';
    var OSM_RAILWAY_CROSSINGS_AREA_API_PATH = '/api/railway-crossings/area';

    /**
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
    function resolveShowCamerasEnabledFromStorage(storageValue) {
        return resolveDefaultOnBooleanFromStorage(storageValue, SHOW_CAMERAS_DEFAULT_ENABLED);
    }

    /**
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveShowOsmTrafficLightsEnabledFromStorage(storageValue) {
        return resolveDefaultOnBooleanFromStorage(storageValue, SHOW_OSM_TRAFFIC_LIGHTS_DEFAULT_ENABLED);
    }

    /**
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveShowOsmRailwayCrossingsEnabledFromStorage(storageValue) {
        return resolveDefaultOnBooleanFromStorage(storageValue, SHOW_OSM_RAILWAY_CROSSINGS_DEFAULT_ENABLED);
    }

    /**
     * @param {number} north
     * @param {number} south
     * @param {number} east
     * @param {number} west
     * @param {number} [maxDeg]
     * @returns {boolean}
     */
    function isOsmOverlayBboxTooLarge(north, south, east, west, maxDeg) {
        var limit = maxDeg != null ? maxDeg : OSM_OVERLAY_MAX_BBOX_DEG;
        return Math.abs(north - south) > limit || Math.abs(east - west) > limit;
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleShowCamerasCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleShowCamerasExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: SHOW_CAMERAS_TOGGLE_ID,
            storageKey: SHOW_CAMERAS_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            mapAction: enabled ? 'fetchCameras' : 'clearCameraMarkers',
            saveAllSettings: true,
            enabledLogMessage: '[Cameras] Camera display enabled',
            disabledLogMessage: '[Cameras] Camera display disabled',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleOsmTrafficLightsCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleOsmTrafficLightsExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: SHOW_OSM_TRAFFIC_LIGHTS_TOGGLE_ID,
            storageKey: SHOW_OSM_TRAFFIC_LIGHTS_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            useLabeledToggle: true,
            mapAction: enabled ? 'fetchOsmTrafficLights' : 'clearOsmTrafficLightMarkers',
            saveAllSettings: true,
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleOsmRailwayCrossingsCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleOsmRailwayCrossingsExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: SHOW_OSM_RAILWAY_CROSSINGS_TOGGLE_ID,
            storageKey: SHOW_OSM_RAILWAY_CROSSINGS_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            useLabeledToggle: true,
            mapAction: enabled ? 'fetchOsmRailwayCrossings' : 'clearOsmRailwayCrossingMarkers',
            saveAllSettings: true,
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @param {boolean} [input.hasMap]
     * @param {number} [input.zoom]
     * @returns {Object}
     */
    function buildFetchCamerasDispatchPlan(input) {
        input = input || {};
        if (!input.enabled || !input.hasMap) {
            return { shouldFetch: false };
        }
        var zoom = input.zoom != null ? input.zoom : 0;
        if (zoom < OVERLAY_MIN_ZOOM) {
            return {
                shouldFetch: false,
                clearMarkers: true,
                lowZoomLogMessage: '[Cameras] Zoom level too low, hiding cameras',
            };
        }
        return {
            shouldFetch: true,
            apiPath: CAMERAS_AREA_API_PATH,
            logLabel: 'Cameras',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @param {boolean} [input.hasMap]
     * @param {number} [input.zoom]
     * @param {number} [input.north]
     * @param {number} [input.south]
     * @param {number} [input.east]
     * @param {number} [input.west]
     * @param {string} [input.apiPath]
     * @param {string} [input.logLabel]
     * @returns {Object}
     */
    function buildFetchOsmOverlayDispatchPlan(input) {
        input = input || {};
        if (!input.enabled || !input.hasMap) {
            return { shouldFetch: false };
        }
        var zoom = input.zoom != null ? input.zoom : 0;
        if (zoom < OVERLAY_MIN_ZOOM) {
            return { shouldFetch: false, clearMarkers: true };
        }
        if (isOsmOverlayBboxTooLarge(input.north, input.south, input.east, input.west)) {
            return { shouldFetch: false, clearMarkers: true, bboxTooLarge: true };
        }
        return {
            shouldFetch: true,
            apiPath: input.apiPath,
            logLabel: input.logLabel,
            url: input.apiPath
                + '?north=' + input.north
                + '&south=' + input.south
                + '&east=' + input.east
                + '&west=' + input.west,
        };
    }

    /**
     * @param {number} north
     * @param {number} south
     * @param {number} east
     * @param {number} west
     * @param {string} apiPath
     * @returns {string}
     */
    function buildAreaBoundsApiUrl(north, south, east, west, apiPath) {
        return apiPath
            + '?north=' + north
            + '&south=' + south
            + '&east=' + east
            + '&west=' + west;
    }

    var api = {
        SHOW_CAMERAS_STORAGE_KEY: SHOW_CAMERAS_STORAGE_KEY,
        SHOW_CAMERAS_TOGGLE_ID: SHOW_CAMERAS_TOGGLE_ID,
        SHOW_OSM_TRAFFIC_LIGHTS_STORAGE_KEY: SHOW_OSM_TRAFFIC_LIGHTS_STORAGE_KEY,
        SHOW_OSM_TRAFFIC_LIGHTS_TOGGLE_ID: SHOW_OSM_TRAFFIC_LIGHTS_TOGGLE_ID,
        SHOW_OSM_RAILWAY_CROSSINGS_STORAGE_KEY: SHOW_OSM_RAILWAY_CROSSINGS_STORAGE_KEY,
        SHOW_OSM_RAILWAY_CROSSINGS_TOGGLE_ID: SHOW_OSM_RAILWAY_CROSSINGS_TOGGLE_ID,
        OVERLAY_MIN_ZOOM: OVERLAY_MIN_ZOOM,
        OSM_OVERLAY_MAX_BBOX_DEG: OSM_OVERLAY_MAX_BBOX_DEG,
        CAMERAS_AREA_API_PATH: CAMERAS_AREA_API_PATH,
        OSM_TRAFFIC_LIGHTS_AREA_API_PATH: OSM_TRAFFIC_LIGHTS_AREA_API_PATH,
        OSM_RAILWAY_CROSSINGS_AREA_API_PATH: OSM_RAILWAY_CROSSINGS_AREA_API_PATH,
        resolveShowCamerasEnabledFromStorage: resolveShowCamerasEnabledFromStorage,
        resolveShowOsmTrafficLightsEnabledFromStorage: resolveShowOsmTrafficLightsEnabledFromStorage,
        resolveShowOsmRailwayCrossingsEnabledFromStorage: resolveShowOsmRailwayCrossingsEnabledFromStorage,
        isOsmOverlayBboxTooLarge: isOsmOverlayBboxTooLarge,
        buildToggleShowCamerasCollectPlan: buildToggleShowCamerasCollectPlan,
        buildToggleShowCamerasExecutePlan: buildToggleShowCamerasExecutePlan,
        buildToggleOsmTrafficLightsCollectPlan: buildToggleOsmTrafficLightsCollectPlan,
        buildToggleOsmTrafficLightsExecutePlan: buildToggleOsmTrafficLightsExecutePlan,
        buildToggleOsmRailwayCrossingsCollectPlan: buildToggleOsmRailwayCrossingsCollectPlan,
        buildToggleOsmRailwayCrossingsExecutePlan: buildToggleOsmRailwayCrossingsExecutePlan,
        buildFetchCamerasDispatchPlan: buildFetchCamerasDispatchPlan,
        buildFetchOsmOverlayDispatchPlan: buildFetchOsmOverlayDispatchPlan,
        buildAreaBoundsApiUrl: buildAreaBoundsApiUrl,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapOverlayToggles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

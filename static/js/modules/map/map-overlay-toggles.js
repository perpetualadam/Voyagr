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

    function buildAreaBoundsApiUrl(north, south, east, west, apiPath) {
        return apiPath
            + '?north=' + north
            + '&south=' + south
            + '&east=' + east
            + '&west=' + west;
    }

    var CAMERA_LAYER_INIT_FLAG = '__voyagrCameraLayerInitialized';
    var CAMERA_MOVE_DEBOUNCE_MS = 500;
    var OSM_OVERLAY_MOVE_DEBOUNCE_MS = 2000;
    var CAMERA_MARKER_CLASS = 'camera-marker';
    var OSM_TRAFFIC_LIGHT_MARKER_CLASS = 'osm-traffic-light-marker';
    var OSM_RAILWAY_CROSSING_MARKER_CLASS = 'osm-railway-crossing-marker';

    /**
     * @param {number} lat
     * @param {number} lon
     * @returns {string}
     */
    function overlayLocationKey(lat, lon) {
        return Number(lat).toFixed(5) + ',' + Number(lon).toFixed(5);
    }

    /**
     * @param {Array<Object>} cameras
     * @returns {Object}
     */
    function buildDisplayCameraMarkersCollectPlan(cameras) {
        if (!cameras || !cameras.length) {
            return { shouldDisplay: false, clearMarkers: true };
        }
        var seen = Object.create(null);
        var items = [];
        (cameras || []).forEach(function (camera) {
            var key = overlayLocationKey(camera.lat, camera.lon);
            if (seen[key]) return;
            seen[key] = true;
            items.push({
                lat: camera.lat,
                lon: camera.lon,
                bucket: camera.bucket || camera.type,
                description: camera.description,
                locationKey: key,
            });
        });
        return {
            shouldDisplay: items.length > 0,
            clearMarkers: items.length === 0,
            items: items,
            markerClassName: CAMERA_MARKER_CLASS,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            markerSvgSize: 24,
            popupSvgSize: 32,
            displayedLogPrefix: '[Cameras] Displayed ',
            displayedLogSuffix: ' camera markers',
        };
    }

    /**
     * @param {Array<Object>} lights
     * @returns {Object}
     */
    function buildDisplayOsmTrafficLightMarkersCollectPlan(lights) {
        if (!lights || !lights.length) {
            return { shouldDisplay: false, clearMarkers: true };
        }
        var seen = Object.create(null);
        var items = [];
        (lights || []).forEach(function (light) {
            var key = overlayLocationKey(light.lat, light.lon);
            if (seen[key]) return;
            seen[key] = true;
            items.push({ lat: light.lat, lon: light.lon, locationKey: key });
        });
        return {
            shouldDisplay: items.length > 0,
            clearMarkers: items.length === 0,
            items: items,
            markerClassName: OSM_TRAFFIC_LIGHT_MARKER_CLASS,
            markersProperty: 'osmTrafficLightMarkers',
        };
    }

    /**
     * @param {Array<Object>} crossings
     * @returns {Object}
     */
    function buildDisplayOsmRailwayCrossingMarkersCollectPlan(crossings) {
        if (!crossings || !crossings.length) {
            return { shouldDisplay: false, clearMarkers: true };
        }
        var seen = Object.create(null);
        var items = [];
        (crossings || []).forEach(function (cx) {
            var key = overlayLocationKey(cx.lat, cx.lon);
            if (seen[key]) return;
            seen[key] = true;
            items.push({ lat: cx.lat, lon: cx.lon, locationKey: key });
        });
        return {
            shouldDisplay: items.length > 0,
            clearMarkers: items.length === 0,
            items: items,
            markerClassName: OSM_RAILWAY_CROSSING_MARKER_CLASS,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            markersProperty: 'osmRailwayCrossingMarkers',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.hasMap]
     * @param {boolean} [input.alreadyInitialized]
     * @param {boolean} [input.showCamerasEnabled]
     * @param {boolean} [input.showOsmTrafficLightsEnabled]
     * @param {boolean} [input.showOsmRailwayCrossingsEnabled]
     * @returns {Object}
     */
    function buildInitializeCameraLayerExecutePlan(input) {
        input = input || {};
        if (!input.hasMap) {
            return {
                shouldInit: false,
                mapNotReadyLog: '[Cameras] Map not ready, deferring camera layer init',
            };
        }
        if (input.alreadyInitialized) {
            return { shouldInit: false, skipDuplicateInit: true };
        }
        return {
            shouldInit: true,
            initFlagProperty: CAMERA_LAYER_INIT_FLAG,
            cameraMoveDebounceMs: CAMERA_MOVE_DEBOUNCE_MS,
            osmOverlayDebounceMs: OSM_OVERLAY_MOVE_DEBOUNCE_MS,
            mapMoveEvent: 'moveend',
            toggles: [
                { id: SHOW_CAMERAS_TOGGLE_ID, enabled: !!input.showCamerasEnabled, labeled: false },
                { id: SHOW_OSM_TRAFFIC_LIGHTS_TOGGLE_ID, enabled: !!input.showOsmTrafficLightsEnabled, labeled: true },
                { id: SHOW_OSM_RAILWAY_CROSSINGS_TOGGLE_ID, enabled: !!input.showOsmRailwayCrossingsEnabled, labeled: true },
            ],
            initialFetches: {
                cameras: !!input.showCamerasEnabled,
                osmTrafficLights: !!input.showOsmTrafficLightsEnabled,
                osmRailwayCrossings: !!input.showOsmRailwayCrossingsEnabled,
            },
            initLogMessage: '[Cameras] Camera layer initialized',
        };
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
        overlayLocationKey: overlayLocationKey,
        buildDisplayCameraMarkersCollectPlan: buildDisplayCameraMarkersCollectPlan,
        buildDisplayOsmTrafficLightMarkersCollectPlan: buildDisplayOsmTrafficLightMarkersCollectPlan,
        buildDisplayOsmRailwayCrossingMarkersCollectPlan: buildDisplayOsmRailwayCrossingMarkersCollectPlan,
        buildInitializeCameraLayerExecutePlan: buildInitializeCameraLayerExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapOverlayToggles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

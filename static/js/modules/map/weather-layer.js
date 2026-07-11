/**
 * @file Pure helpers for the OpenWeatherMap raster overlay.
 * @module modules/map/weather-layer
 *
 * The imperative add/remove/toggle logic lives in the (classic, non-module) app
 * script and is tightly coupled to the live MapLibre `map` and mutable globals.
 * The genuinely logic-bearing, side-effect-free pieces — building the tile URL and
 * the source/layer specs, and validating the layer type — are extracted here so they
 * can be unit tested for real and shared by the app via a global.
 */
(function (root) {
    'use strict';

    const WEATHER_LAYER_TYPE_NAMES = {
        precipitation_new: 'Precipitation',
        clouds_new: 'Clouds',
        temp_new: 'Temperature',
        wind_new: 'Wind',
    };

    const DEFAULT_WEATHER_LAYER_TYPE = 'precipitation_new';
    const WEATHER_SOURCE_ID = 'weather-source';
    const WEATHER_LAYER_ID = 'weather-layer';
    const SHOW_WEATHER_STORAGE_KEY = 'showWeatherEnabled';
    const WEATHER_LAYER_TYPE_STORAGE_KEY = 'weatherLayerType';
    const SHOW_WEATHER_TOGGLE_ID = 'showWeatherToggle';
    const SHOW_WEATHER_DEFAULT_ENABLED = false;

    /**
     * Build the OpenWeatherMap raster tile URL template.
     * @param {string} type - Layer type, e.g. 'precipitation_new'.
     * @param {string} apiKey - OpenWeatherMap API key.
     * @returns {string} Tile URL template with {z}/{x}/{y} placeholders.
     */
    function buildWeatherTileUrl(type, apiKey) {
        const safeType = isValidWeatherLayerType(type) ? type : DEFAULT_WEATHER_LAYER_TYPE;
        return `https://tile.openweathermap.org/map/${safeType}/{z}/{x}/{y}.png?appid=${apiKey || ''}`;
    }

    /**
     * Build the MapLibre raster source spec for the weather overlay.
     * @param {string} tileUrl - Tile URL template.
     * @returns {object} Source spec for map.addSource.
     */
    function buildWeatherSourceSpec(tileUrl) {
        return {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 18,
            bounds: [-180, -85.0511, 180, 85.0511],
        };
    }

    /**
     * Build the MapLibre raster layer spec for the weather overlay.
     * @returns {object} Layer spec for map.addLayer.
     */
    function buildWeatherLayerSpec() {
        return {
            id: WEATHER_LAYER_ID,
            type: 'raster',
            source: WEATHER_SOURCE_ID,
            minzoom: 1,
            maxzoom: 18,
            paint: { 'raster-opacity': 0.7 },
        };
    }

    /**
     * @param {string} type
     * @returns {boolean} True if the type is a known OpenWeatherMap layer.
     */
    function isValidWeatherLayerType(type) {
        return Object.prototype.hasOwnProperty.call(WEATHER_LAYER_TYPE_NAMES, type);
    }

    /**
     * Human-friendly display name for a layer type.
     * @param {string} type
     * @returns {string}
     */
    function weatherLayerDisplayName(type) {
        return WEATHER_LAYER_TYPE_NAMES[type] || type;
    }

    /**
     * @param {string|null|undefined} storageValue
     * @returns {boolean}
     */
    function resolveShowWeatherEnabledFromStorage(storageValue) {
        if (storageValue === null || storageValue === undefined || storageValue === '') {
            return SHOW_WEATHER_DEFAULT_ENABLED;
        }
        return storageValue === 'true' || storageValue === '1';
    }

    /**
     * @param {string|null|undefined} storageValue
     * @returns {string}
     */
    function resolveWeatherLayerTypeFromStorage(storageValue) {
        if (storageValue && isValidWeatherLayerType(storageValue)) {
            return storageValue;
        }
        return DEFAULT_WEATHER_LAYER_TYPE;
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleWeatherLayerCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleWeatherLayerExecutePlan(input) {
        input = input || {};
        const enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled,
            toggleId: SHOW_WEATHER_TOGGLE_ID,
            storageKey: SHOW_WEATHER_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            mapAction: enabled ? 'addWeatherLayer' : 'removeWeatherLayer',
            saveAllSettings: true,
            statusMessage: enabled ? '🌧️ Weather layer enabled' : '🌧️ Weather layer disabled',
            statusType: enabled ? 'success' : 'info',
            logMessage: enabled ? '[Weather] Weather layer enabled' : '[Weather] Weather layer disabled',
        };
    }

    /**
     * @param {string} type
     * @returns {Object}
     */
    function buildSetWeatherLayerTypeExecutePlan(type) {
        const safeType = isValidWeatherLayerType(type) ? type : DEFAULT_WEATHER_LAYER_TYPE;
        return {
            shouldApply: true,
            layerType: safeType,
            storageKey: WEATHER_LAYER_TYPE_STORAGE_KEY,
            storageValue: safeType,
            refreshLayerWhenEnabled: true,
            statusMessage: '🌧️ Weather layer: ' + weatherLayerDisplayName(safeType),
            statusType: 'info',
        };
    }

    const api = {
        WEATHER_LAYER_TYPE_NAMES,
        DEFAULT_WEATHER_LAYER_TYPE,
        WEATHER_SOURCE_ID,
        WEATHER_LAYER_ID,
        SHOW_WEATHER_STORAGE_KEY,
        WEATHER_LAYER_TYPE_STORAGE_KEY,
        SHOW_WEATHER_TOGGLE_ID,
        SHOW_WEATHER_DEFAULT_ENABLED,
        buildWeatherTileUrl,
        buildWeatherSourceSpec,
        buildWeatherLayerSpec,
        isValidWeatherLayerType,
        weatherLayerDisplayName,
        resolveShowWeatherEnabledFromStorage,
        resolveWeatherLayerTypeFromStorage,
        buildToggleWeatherLayerCollectPlan,
        buildToggleWeatherLayerExecutePlan,
        buildSetWeatherLayerTypeExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrWeatherLayer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

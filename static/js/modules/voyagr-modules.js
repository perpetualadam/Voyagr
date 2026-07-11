/**
 * @file Central registry for Voyagr frontend modules loaded via script defer tags.
 * Declares required module globals and replaces per-call typeof Voyagr* checks in
 * voyagr-app.js. Modules are loaded in templates/index.html before this script runs.
 */
(function (root) {
    'use strict';

    /** Registry key → global name exposed by each IIFE module. */
    var GLOBALS = {
        units: 'VoyagrUnits',
        tripHistory: 'VoyagrTripHistory',
        polylineCodec: 'VoyagrPolylineCodec',
        toggleUI: 'VoyagrToggleUI',
        weatherLayer: 'VoyagrWeatherLayer',
        trafficChange: 'VoyagrTrafficChange',
        routeTrafficFlow: 'VoyagrRouteTrafficFlow',
        laneGuidance: 'VoyagrLaneGuidance',
        speedGps: 'VoyagrSpeedGps',
        hazardAlerts: 'VoyagrHazardAlerts',
        speedLimitWidget: 'VoyagrSpeedLimitWidget',
        routeGeometry: 'VoyagrRouteGeometry',
        turnInstructions: 'VoyagrTurnInstructions',
        eta: 'VoyagrETA',
        voiceAnnouncements: 'VoyagrVoiceAnnouncements',
        rerouteDecision: 'VoyagrRerouteDecision',
        routingRequest: 'VoyagrRoutingRequest',
        cameraPitch: 'VoyagrCameraPitch',
        html: 'VoyagrHtml',
        recentDestinations: 'VoyagrRecentDestinations',
        domHelpers: 'VoyagrDomHelpers',
        routePrefs: 'VoyagrRoutePrefs',
        theme: 'VoyagrTheme',
        routeSelection: 'VoyagrRouteSelection',
        navigationDestination: 'VoyagrNavigationDestination',
        movementDetection: 'VoyagrMovementDetection',
        multimodalParking: 'VoyagrMultimodalParking',
        routeSharing: 'VoyagrRouteSharing',
        waypoints: 'VoyagrWaypoints',
        poiSearch: 'VoyagrPoiSearch',
        offlineNavigation: 'VoyagrOfflineNavigation',
        mlPredictions: 'VoyagrMlPredictions',
        porcupineWake: 'VoyagrPorcupineWake',
        batterySaving: 'VoyagrBatterySaving',
        smartZoom: 'VoyagrSmartZoom',
        phase3Features: 'VoyagrPhase3Features',
        searchAutocomplete: 'VoyagrSearchAutocomplete',
        geocodingLocations: 'VoyagrGeocodingLocations',
        deviceEnvironment: 'VoyagrDeviceEnvironment',
        routeProgress: 'VoyagrRouteProgress',
        settingsSnapshot: 'VoyagrSettingsSnapshot',
        appState: 'VoyagrAppState',
        gestureControl: 'VoyagrGestureControl',
        legacyPrefsRestore: 'VoyagrLegacyPrefsRestore',
        previewMarker: 'VoyagrPreviewMarker',
        favorites: 'VoyagrFavorites',
        cazInfo: 'VoyagrCazInfo',
        vehicleMarker: 'VoyagrVehicleMarker',
        osmMapIcons: 'VoyagrOsmMapIcons',
        mapControls: 'VoyagrMapControls',
        mapLayerToggles: 'VoyagrMapLayerToggles',
        mapTheme: 'VoyagrMapTheme',
        cameraMapMarkers: 'VoyagrCameraMapMarkers',
        hazardMapMarkers: 'VoyagrHazardMapMarkers',
        pwaInstall: 'VoyagrPwaInstall',
        bestTimeLeave: 'VoyagrBestTimeLeave',
        roadNameDisplay: 'VoyagrRoadNameDisplay',
        roadReport: 'VoyagrRoadReport',
    };

    var cache = {};

    /**
     * Resolve a registered module by key. Throws when the global is missing.
     * @param {string} key
     * @returns {object}
     */
    function requireModule(key) {
        if (cache[key]) return cache[key];
        var globalName = GLOBALS[key];
        if (!globalName) {
            throw new Error('[VoyagrModules] Unknown module key: ' + key);
        }
        var mod = root[globalName];
        if (!mod) {
            throw new Error('[VoyagrModules] Required module not loaded: ' + globalName);
        }
        cache[key] = mod;
        return mod;
    }

    /**
     * Validate that every declared module global is present.
     * Logs a single error listing any missing scripts (production misconfiguration).
     */
    function init() {
        var missing = [];
        for (var key in GLOBALS) {
            if (!root[GLOBALS[key]]) missing.push(GLOBALS[key]);
        }
        if (missing.length) {
            console.error('[VoyagrModules] Missing required modules:', missing.join(', '));
            return false;
        }
        console.log('[VoyagrModules] Registered ' + Object.keys(GLOBALS).length + ' modules');
        return true;
    }

    var api = {
        init: init,
        require: requireModule,
        keys: function () { return Object.keys(GLOBALS); },
    };

    for (var registryKey in GLOBALS) {
        (function (k) {
            api[k] = function () { return requireModule(k); };
        })(registryKey);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrModules = api;
    init();
})(typeof globalThis !== 'undefined' ? globalThis : this);

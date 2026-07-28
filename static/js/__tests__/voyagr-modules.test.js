/**
 * @jest-environment jsdom
 */

const VoyagrUnits = require('../modules/navigation/units');
const VoyagrTripHistory = require('../modules/navigation/trip-history');

describe('VoyagrModules registry', () => {
    beforeEach(() => {
        global.VoyagrUnits = VoyagrUnits;
        global.VoyagrTripHistory = VoyagrTripHistory;
        global.VoyagrPolylineCodec = require('../modules/navigation/polyline-codec');
        global.VoyagrToggleUI = require('../modules/ui/toggle-ui');
        global.VoyagrWeatherLayer = require('../modules/map/weather-layer');
        global.VoyagrTrafficChange = require('../modules/navigation/traffic-change');
        global.VoyagrRouteTrafficFlow = require('../modules/navigation/route-traffic-flow');
        global.VoyagrLaneGuidance = require('../modules/navigation/lane-guidance');
        global.VoyagrSpeedGps = require('../modules/navigation/speed-gps');
        global.VoyagrHazardAlerts = require('../modules/navigation/hazard-alerts');
        global.VoyagrSpeedLimitWidget = require('../modules/navigation/speed-limit-widget');
        global.VoyagrRouteGeometry = require('../modules/navigation/route-geometry');
        global.VoyagrTurnInstructions = require('../modules/navigation/turn-instructions');
        global.VoyagrETA = require('../modules/navigation/eta');
        global.VoyagrLiveDataRefresh = require('../modules/navigation/live-data-refresh');
        global.VoyagrVoiceAnnouncements = require('../modules/navigation/voice-announcements');
        global.VoyagrRerouteDecision = require('../modules/navigation/reroute-decision');
        global.VoyagrRoutingRequest = require('../modules/navigation/routing-request');
        global.VoyagrCameraPitch = require('../modules/navigation/camera-pitch');
        global.VoyagrHtml = require('../modules/util/html');
        global.VoyagrRecentDestinations = require('../modules/navigation/recent-destinations');
        global.VoyagrDomHelpers = require('../modules/ui/dom-helpers');
        global.VoyagrNavMenu = require('../modules/ui/nav-menu');
        global.VoyagrRoutePrefs = require('../modules/navigation/route-prefs');
        global.VoyagrTheme = require('../modules/ui/theme');
        global.VoyagrRouteSelection = require('../modules/navigation/route-selection');
        global.VoyagrNavigationDestination = require('../modules/navigation/navigation-destination');
        global.VoyagrMovementDetection = require('../modules/navigation/movement-detection');
        global.VoyagrMultimodalParking = require('../modules/navigation/multimodal-parking');
        global.VoyagrRouteSharing = require('../modules/navigation/route-sharing');
        global.VoyagrWaypoints = require('../modules/navigation/waypoints');
        global.VoyagrPoiSearch = require('../modules/navigation/poi-search');
        global.VoyagrOfflineNavigation = require('../modules/navigation/offline-navigation');
        global.VoyagrMlPredictions = require('../modules/navigation/ml-predictions');
        global.VoyagrPorcupineWake = require('../modules/navigation/porcupine-wake');
        global.VoyagrBatterySaving = require('../modules/navigation/battery-saving');
        global.VoyagrSmartZoom = require('../modules/navigation/smart-zoom');
        global.VoyagrPhase3Features = require('../modules/navigation/phase3-features');
        global.VoyagrAppState = require('../modules/navigation/app-state');
        global.VoyagrGestureControl = require('../modules/navigation/gesture-control');
        global.VoyagrLegacyPrefsRestore = require('../modules/navigation/legacy-prefs-restore');
        global.VoyagrSearchAutocomplete = require('../modules/navigation/search-autocomplete');
        global.VoyagrGeocodingLocations = require('../modules/navigation/geocoding-locations');
        global.VoyagrGooglePlusCodesPrefs = require('../modules/navigation/google-plus-codes-prefs');
        global.VoyagrDeviceEnvironment = require('../modules/ui/device-environment');
        global.VoyagrRouteProgress = require('../modules/navigation/route-progress');
        global.VoyagrSettingsSnapshot = require('../modules/navigation/settings-snapshot');
        global.VoyagrPreviewMarker = require('../modules/map/preview-marker');
        global.VoyagrFavorites = require('../modules/navigation/favorites');
        global.VoyagrCazInfo = require('../modules/navigation/caz-info');
        global.VoyagrVehicleMarker = require('../modules/map/vehicle-marker');
        global.VoyagrOsmMapIcons = require('../modules/map/osm-map-icons');
        global.VoyagrMapControls = require('../modules/map/map-controls');
        global.VoyagrMapLayerToggles = require('../modules/map/map-layer-toggles');
        global.VoyagrMapOverlayToggles = require('../modules/map/map-overlay-toggles');
        global.VoyagrMapView3D = require('../modules/map/map-view-3d');
        global.VoyagrMapTheme = require('../modules/map/map-theme');
        global.VoyagrMapRecovery = require('../modules/map/map-recovery');
        global.VoyagrCameraMapMarkers = require('../modules/map/camera-map-markers');
        global.VoyagrHazardMapMarkers = require('../modules/map/hazard-map-markers');
        global.VoyagrPwaInstall = require('../modules/ui/pwa-install');
        global.VoyagrVoiceControl = require('../modules/ui/voice-control');
        global.VoyagrBestTimeLeave = require('../modules/navigation/best-time-leave');
        global.VoyagrRoadNameDisplay = require('../modules/navigation/road-name-display');
        global.VoyagrRoadReport = require('../modules/navigation/road-report');
        jest.resetModules();
    });

    test('registers all declared module keys when globals are present', () => {
        const VoyagrModules = require('../modules/voyagr-modules');
        expect(VoyagrModules.init()).toBe(true);
        expect(VoyagrModules.keys().length).toBeGreaterThanOrEqual(22);
        expect(VoyagrModules.units()).toBe(VoyagrUnits);
        expect(VoyagrModules.tripHistory()).toBe(VoyagrTripHistory);
    });

    test('require throws when a module global is missing', () => {
        delete global.VoyagrUnits;
        jest.resetModules();
        const VoyagrModules = require('../modules/voyagr-modules');
        expect(() => VoyagrModules.units()).toThrow(/VoyagrUnits/);
    });
});

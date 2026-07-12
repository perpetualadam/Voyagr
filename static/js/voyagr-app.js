if (typeof window !== 'undefined' && window.ethereum) {
    try {
        Object.defineProperty(window, 'ethereum', {
            value: window.ethereum,
            writable: false,
            configurable: false
        });
    } catch (e) {
        // Ignore if property is already defined by extension
        console.log('[Init] Ethereum property already defined by extension');
    }
}

// Note: All global variables are declared in voyagr-core.js
// This file contains all the application logic and functions
// Variables: map, routeLayer, startMarker, endMarker
// Unit variables: distanceUnit, currencyUnit, speedUnit, temperatureUnit
// Currency symbols: currencySymbols
//
// VoyagrModules (modules/voyagr-modules.js) is the central registry for extracted
// navigation/UI modules. App-layer wrappers below inject live prefs from voyagr-core.

// ===== ROUTE PREFERENCE MIGRATION =====
// Toll pref migration runs in modules/navigation/route-prefs.js on module load.

function isAvoidTollsEnabled() {
    return VoyagrRoutePreferencesOrchestration.isAvoidTollsEnabled();
}
window.isAvoidTollsEnabled = isAvoidTollsEnabled;

function getRouteCostParams(vehicleType) {
    return VoyagrRoutePreferencesOrchestration.getRouteCostParams(vehicleType);
}
window.getRouteCostParams = getRouteCostParams;

// Note: All global variables are declared below
// Bottom sheet drag state lives in static/js/app/bottom-sheet-orchestration.js (bound at file end).

// ===== RECENT DESTINATIONS ORCHESTRATION =====
// Orchestration lives in static/js/app/recent-destinations-orchestration.js (bound at file end).

function getRecentDestinationsOrchestrationRuntime() {
    return {
        recentDestinations: () => _recentDestinations(),
    };
}

function loadRecentDestinations() {
    return VoyagrRecentDestinationsOrchestration.loadRecentDestinations();
}
function recordRecentDestination(label, lat, lon, kind) {
    return VoyagrRecentDestinationsOrchestration.recordRecentDestination(label, lat, lon, kind);
}

window.debugScrollIssue = function () {
    return VoyagrBottomSheetOrchestration.debugScrollIssue();
};

// ===== UNIT CONVERSION ORCHESTRATION =====
// Wrappers delegate to static/js/app/units-preferences-orchestration.js (bound at file end).

function convertDistance(km) { return VoyagrUnitsPreferencesOrchestration.convertDistance(km); }
function getDistanceUnit() { return VoyagrUnitsPreferencesOrchestration.getDistanceUnit(); }
function convertSpeed(kmh) { return VoyagrUnitsPreferencesOrchestration.convertSpeed(kmh); }
function getSpeedUnit() { return VoyagrUnitsPreferencesOrchestration.getSpeedUnit(); }
function convertTemperature(celsius) { return VoyagrUnitsPreferencesOrchestration.convertTemperature(celsius); }
function getTemperatureUnit() { return VoyagrUnitsPreferencesOrchestration.getTemperatureUnit(); }
function getCurrencySymbol() { return VoyagrUnitsPreferencesOrchestration.getCurrencySymbol(); }
function adjustCostForUnits(cost, costType = 'fuel') {
    return VoyagrUnitsPreferencesOrchestration.adjustCostForUnits(cost, costType);
}
function getFuelEfficiencyInUnits(liters_per_100km) {
    return VoyagrUnitsPreferencesOrchestration.getFuelEfficiencyInUnits(liters_per_100km);
}
function getFuelEfficiencyLabel() { return VoyagrUnitsPreferencesOrchestration.getFuelEfficiencyLabel(); }

// ===== NAVIGATION VARIABLES =====
// Smart zoom state lives in static/js/app/smart-zoom-orchestration.js (bound at file end).
// Navigation tracking state (global)
// These are now initialized in voyagr-core.js to prevent redeclaration errors
// let zoomAndFollowEnabled = ...;
// let mapFollowingActive = ...;

// ===== DARK MODE ORCHESTRATION =====
// Orchestration lives in static/js/app/dark-mode-orchestration.js (bound at file end).

function getDarkModeOrchestrationRuntime() {
    return {
        theme: () => _theme(),
        call: {
            showStatus,
            saveAllSettings,
        },
    };
}

function initializeDarkMode() { VoyagrDarkModeOrchestration.initializeDarkMode(); }
function applyTheme(theme) { VoyagrDarkModeOrchestration.applyTheme(theme); }
function toggleDarkMode() { VoyagrDarkModeOrchestration.toggleDarkMode(); }
function setTheme(theme) { VoyagrDarkModeOrchestration.setTheme(theme); }
function updateThemeButtons() { VoyagrDarkModeOrchestration.updateThemeButtons(); }

// Track previous tab for back navigation (state lives in tab-navigation-orchestration.js)

// ===== TAB NAVIGATION ORCHESTRATION =====
// Orchestration lives in static/js/app/tab-navigation-orchestration.js (bound at file end).

function getTabNavigationOrchestrationRuntime() {
    return {
        units: () => _units(),
        getDistanceUnit: () => distanceUnit,
        getCurrencyUnit: () => currencyUnit,
        getSpeedUnit: () => speedUnit,
        getTemperatureUnit: () => temperatureUnit,
        call: {
            applyDomSelectsFromPlan,
            loadRoutePreferences,
            loadMultiDropPreferences,
            loadVoicePreferences,
            loadPorcupineWakeUi,
            loadCameraAlertPreferences,
            loadAvoidancePreferences,
            loadHazardCameraTogglesFromApi,
            loadPromoEntitlementStatus,
            loadTripHistory,
            displayRouteComparison,
            prepareRouteSharing,
            loadRouteAnalytics,
            loadSavedRoutes,
        },
    };
}

function switchTab(tab) { VoyagrTabNavigationOrchestration.switchTab(tab); }
function getCurrentVisibleTab() { return VoyagrTabNavigationOrchestration.getCurrentVisibleTab(); }
function goBackToPreviousTab() { VoyagrTabNavigationOrchestration.goBackToPreviousTab(); }
function loadUnitPreferences() { VoyagrTabNavigationOrchestration.loadUnitPreferences(); }

// ===== UNITS PREFERENCES ORCHESTRATION =====
// Orchestration lives in static/js/app/units-preferences-orchestration.js (bound at file end).

function getUnitsPreferencesOrchestrationRuntime() {
    return {
        units: () => _units(),
        speedGps: () => _speedGps(),
        speedLimitWidget: () => _speedLimitWidget(),
        getDistanceUnit: () => distanceUnit,
        setDistanceUnit: (val) => { distanceUnit = val; },
        getCurrencyUnit: () => currencyUnit,
        setCurrencyUnit: (val) => { currencyUnit = val; },
        getSpeedUnit: () => speedUnit,
        setSpeedUnit: (val) => { speedUnit = val; },
        getTemperatureUnit: () => temperatureUnit,
        setTemperatureUnit: (val) => { temperatureUnit = val; },
        getCurrentSpeedLimitMph: () => VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph(),
        getLastDetectedRoadType: () => VoyagrSpeedWidgetOrchestration.getLastDetectedRoadType(),
        getLastSpeedLimitRegion: () => VoyagrSpeedWidgetOrchestration.getLastSpeedLimitRegion(),
        getCurrentGpsSpeedMph: () => VoyagrSpeedWidgetOrchestration.getCurrentGpsSpeedMph(),
        call: {
            saveAllSettings,
            showStatus,
            updateSpeedWidget: (speed, limit) => VoyagrSpeedWidgetOrchestration.updateSpeedWidget(speed, limit),
            getCurrentRoadType: (idx, mph) => VoyagrSpeedWidgetOrchestration.getCurrentRoadType(idx, mph),
        },
    };
}

function updateDistanceUnit() { VoyagrUnitsPreferencesOrchestration.updateDistanceUnit(); }
function updateCurrencyUnit() { VoyagrUnitsPreferencesOrchestration.updateCurrencyUnit(); }
function updateSpeedUnit() { VoyagrUnitsPreferencesOrchestration.updateSpeedUnit(); }
function updateTemperatureUnit() { VoyagrUnitsPreferencesOrchestration.updateTemperatureUnit(); }
function saveUnitSettingsToBackend() { VoyagrUnitsPreferencesOrchestration.saveUnitSettingsToBackend(); }
function updateAllDistanceDisplays() { VoyagrUnitsPreferencesOrchestration.updateAllDistanceDisplays(); }
function updateAllCostDisplays() { VoyagrUnitsPreferencesOrchestration.updateAllCostDisplays(); }
function updateAllSpeedDisplays() { VoyagrUnitsPreferencesOrchestration.updateAllSpeedDisplays(); }
function updateAllTemperatureDisplays() { VoyagrUnitsPreferencesOrchestration.updateAllTemperatureDisplays(); }

// ===== COMPREHENSIVE PERSISTENT SETTINGS SYSTEM =====

// =============================================================================
// Multi-profile local storage (guest vs signed-in user)
// =============================================================================
// Orchestration lives in static/js/app/profile-store-orchestration.js (bound at file end).

function getProfileStoreOrchestrationRuntime() {
    return {
        getSupabaseClient: () => VoyagrSupabaseAuthOrchestration.getSupabaseClient(),
        call: {
            loadAllSettings,
            applySettingsToUI,
            loadSavedRoutes,
        },
    };
}

function getProfileStore() {
    return VoyagrProfileStoreOrchestration.getProfileStore();
}

function persistActiveProfile() {
    return VoyagrProfileStoreOrchestration.persistActiveProfile();
}

function ensureProfileExists(profileId) {
    return VoyagrProfileStoreOrchestration.ensureProfileExists(profileId);
}

function switchActiveProfile(profileId, options) {
    return VoyagrProfileStoreOrchestration.switchActiveProfile(profileId, options);
}

function scheduleSupabaseProfileSync() {
    return VoyagrProfileStoreOrchestration.scheduleSupabaseProfileSync();
}

async function pullProfileSnapshotFromSupabase(profileId) {
    return VoyagrProfileStoreOrchestration.pullProfileSnapshotFromSupabase(profileId);
}

// =============================================================================
// Support + Supabase auth orchestration in static/js/app/supabase-auth-orchestration.js
// =============================================================================

function getSupabaseAuthOrchestrationRuntime() {
    return {
        call: {
            expandBottomSheet,
            switchTab,
            showStatus,
            ensureProfileExists,
            getProfileStore,
            switchActiveProfile,
            scheduleSupabaseProfileSync,
            pullProfileSnapshotFromSupabase,
        },
    };
}

function openVoyagerPremiumSection() {
    VoyagrSupabaseAuthOrchestration.openVoyagerPremiumSection();
}

function applySupportLinksFromConfig(cfg) {
    VoyagrSupabaseAuthOrchestration.applySupportLinksFromConfig(cfg);
}

async function startStripeSubscriptionCheckout(sessionOpt) {
    return VoyagrSupabaseAuthOrchestration.startStripeSubscriptionCheckout(sessionOpt);
}

function voyagrDismissSoftAuthBanner() {
    VoyagrSupabaseAuthOrchestration.voyagrDismissSoftAuthBanner();
}

function voyagrOpenSignInFromBanner() {
    VoyagrSupabaseAuthOrchestration.voyagrOpenSignInFromBanner();
}

async function authGateStripeContinue() {
    return VoyagrSupabaseAuthOrchestration.authGateStripeContinue();
}

async function authGateStripeSkip() {
    return VoyagrSupabaseAuthOrchestration.authGateStripeSkip();
}

async function authSignInEmailGate() {
    return VoyagrSupabaseAuthOrchestration.authSignInEmailGate();
}

async function authSignUpEmailGate() {
    return VoyagrSupabaseAuthOrchestration.authSignUpEmailGate();
}

async function initSupabaseAuth() {
    return VoyagrSupabaseAuthOrchestration.initSupabaseAuth();
}

async function authSignInEmail() {
    return VoyagrSupabaseAuthOrchestration.authSignInEmail();
}

async function authSignUpEmail() {
    return VoyagrSupabaseAuthOrchestration.authSignUpEmail();
}

async function authSignInProvider(provider) {
    return VoyagrSupabaseAuthOrchestration.authSignInProvider(provider);
}

async function authSignOut() {
    return VoyagrSupabaseAuthOrchestration.authSignOut();
}

async function redeemPromoCode() {
    return VoyagrSupabaseAuthOrchestration.redeemPromoCode();
}

async function loadPromoEntitlementStatus() {
    return VoyagrSupabaseAuthOrchestration.loadPromoEntitlementStatus();
}

async function getSupabaseAccessToken() {
    return VoyagrSupabaseAuthOrchestration.getSupabaseAccessToken();
}

async function fetchJsonWithAuth(url, options = {}) {
    return VoyagrSupabaseAuthOrchestration.fetchJsonWithAuth(url, options);
}

// ===== SETTINGS ORCHESTRATION =====
// Orchestration lives in static/js/app/settings-orchestration.js (bound at file end).

function getSettingsOrchestrationRuntime() {
    return {
        settingsSnapshot: () => _settingsSnapshot(),
        routeSelection: () => _routeSelection(),
        toggleUI: () => _toggleUI(),
        routePrefs: () => _routePrefs(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getDistanceUnit: () => distanceUnit,
        setDistanceUnit: (val) => { distanceUnit = val; },
        getCurrencyUnit: () => currencyUnit,
        setCurrencyUnit: (val) => { currencyUnit = val; },
        getSpeedUnit: () => speedUnit,
        setSpeedUnit: (val) => { speedUnit = val; },
        getTemperatureUnit: () => temperatureUnit,
        setTemperatureUnit: (val) => { temperatureUnit = val; },
        getCurrentVehicleType: () => currentVehicleType,
        setCurrentVehicleType: (val) => { currentVehicleType = val; },
        getCurrentRoutingMode: () => currentRoutingMode,
        setCurrentRoutingMode: (val) => { currentRoutingMode = val; },
        getSmartZoomEnabled: () => VoyagrSmartZoomOrchestration.getSmartZoomEnabled(),
        setSmartZoomEnabled: (val) => VoyagrSmartZoomOrchestration.setSmartZoomEnabled(val),
        getShowCamerasEnabled: () => VoyagrMapOverlayOrchestration.getShowCamerasEnabled(),
        setShowCamerasEnabled: (val) => { VoyagrMapOverlayOrchestration.setShowCamerasEnabled(val); },
        getShowOsmTrafficLightsEnabled: () => VoyagrMapOverlayOrchestration.getShowOsmTrafficLightsEnabled(),
        setShowOsmTrafficLightsEnabled: (val) => { VoyagrMapOverlayOrchestration.setShowOsmTrafficLightsEnabled(val); },
        getShowOsmRailwayCrossingsEnabled: () => VoyagrMapOverlayOrchestration.getShowOsmRailwayCrossingsEnabled(),
        setShowOsmRailwayCrossingsEnabled: (val) => { VoyagrMapOverlayOrchestration.setShowOsmRailwayCrossingsEnabled(val); },
        getShowTrafficEnabled: () => VoyagrMapLayersOrchestration.getShowTrafficEnabled(),
        setShowTrafficEnabled: (val) => VoyagrMapLayersOrchestration.setShowTrafficEnabled(val),
        getSpeedWidgetEnabled: () => VoyagrSpeedWidgetOrchestration.getSpeedWidgetEnabled(),
        setSpeedWidgetEnabled: (val) => VoyagrSpeedWidgetOrchestration.setSpeedWidgetEnabled(val),
        call: {
            persistActiveProfile,
            loadPreferences,
            setRoutingMode,
            setMapTheme,
            initializeDarkMode,
            updateThemeButtons,
            applySpeedWidgetToggleUi: () => VoyagrSpeedWidgetOrchestration.applySpeedWidgetToggleUi(),
            stopRouteTrafficUpdates,
            startRouteTrafficUpdates,
            stopAutoTrafficUpdates,
            startAutoTrafficUpdates,
            ensureLabelsOnTop,
            showStatus,
            collectRoutePreferencesFormState,
            collectParkingPreferencesFormState,
            collectMultiDropFormState,
            isAvoidTollsEnabled,
        },
    };
}

function saveAllSettings() { VoyagrSettingsOrchestration.saveAllSettings(); }
function loadAllSettings() { return VoyagrSettingsOrchestration.loadAllSettings(); }
function applyDomSelectsFromPlan(selects) { VoyagrSettingsOrchestration.applyDomSelectsFromPlan(selects); }
function applyDomChecksFromPlan(checks) { VoyagrSettingsOrchestration.applyDomChecksFromPlan(checks); }
function applyMapLayerReorderFromPlan(plan) { return VoyagrSettingsOrchestration.applyMapLayerReorderFromPlan(plan); }
function applySettingsToUI() { VoyagrSettingsOrchestration.applySettingsToUI(); }
function resetAllSettings() { VoyagrSettingsOrchestration.resetAllSettings(); }
function exportSettings() { VoyagrSettingsOrchestration.exportSettings(); }
function importSettings() { VoyagrSettingsOrchestration.importSettings(); }

// Update all distance displays
// ===== TRIP HISTORY ORCHESTRATION =====
// Orchestration lives in static/js/app/trip-history-orchestration.js (bound at file end).

function getTripHistoryOrchestrationRuntime() {
    return {
        tripHistory: () => _tripHistory(),
        html: () => _html(),
        getRoutePolyline: () => routePolyline,
        getCurrentRoutingMode: () => currentRoutingMode,
        getSpeedUnit: () => speedUnit,
        call: {
            getSupabaseAccessToken,
            fetchJsonWithAuth,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            escapeHtml,
            getSpeedUnitLabel: getSpeedUnit,
            showStatus,
            switchTab,
            calculateRoute,
        },
    };
}

function loadTripHistory() {
    return VoyagrTripHistoryOrchestration.loadTripHistory();
}

async function persistCompletedTrip(route) {
    return VoyagrTripHistoryOrchestration.persistCompletedTrip(route);
}

function displayTripHistory(trips) {
    return VoyagrTripHistoryOrchestration.displayTripHistory(trips);
}

async function recalculateTrip(tripId) {
    return VoyagrTripHistoryOrchestration.recalculateTrip(tripId);
}

async function deleteTripHistory(tripId) {
    return VoyagrTripHistoryOrchestration.deleteTripHistory(tripId);
}

// ===== ROUTE COMPARISON FUNCTIONS =====
// Route options state lives in static/js/app/route-comparison-orchestration.js (bound at file end).

// Route colors for multi-route display (via route-selection accessor)
function routeColors() {
    return VoyagrRouteComparisonOrchestration.routeColors();
}
/** Active navigation / reroute line — matches primary route color. */
function navActiveRouteColor() {
    return VoyagrRouteComparisonOrchestration.navActiveRouteColor();
}

function applyBringRoutesToTopFromPlan(plan) {
    return VoyagrRouteComparisonOrchestration.applyBringRoutesToTopFromPlan(plan);
}
function clearAllRouteLayersFromMap() { VoyagrRouteComparisonOrchestration.clearAllRouteLayersFromMap(); }
function clearRouteLayerHandlesFromPlan(plan) { VoyagrRouteComparisonOrchestration.clearRouteLayerHandlesFromPlan(plan); }
function applyMapLibreLineLayerFromMountPlan(mountPlan, opts) {
    return VoyagrRouteComparisonOrchestration.applyMapLibreLineLayerFromMountPlan(mountPlan, opts);
}
function applyDisplayAllRoutesStyleLoadScheduleFromPlan(schedule, fn) {
    VoyagrRouteComparisonOrchestration.applyDisplayAllRoutesStyleLoadScheduleFromPlan(schedule, fn);
}
function applyDoAddRouteLayersPostMountFromPlan(plan) { VoyagrRouteComparisonOrchestration.applyDoAddRouteLayersPostMountFromPlan(plan); }
function applySingleRouteMapDisplayFromPlan(plan) { VoyagrRouteComparisonOrchestration.applySingleRouteMapDisplayFromPlan(plan); }
function displayAllRoutesOnMap() { VoyagrRouteComparisonOrchestration.displayAllRoutesOnMap(); }
function applyDisplayAllRoutesOnMapFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDisplayAllRoutesOnMapFromPlan(apply); }
function applyDisplayAllRoutesPreMountFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDisplayAllRoutesPreMountFromPlan(apply); }
function applyRouteLayerFromMapLibrePlan(applyPlan) { return VoyagrRouteComparisonOrchestration.applyRouteLayerFromMapLibrePlan(applyPlan); }
function applyDoAddRouteLayersBatchFromPlan(executePlan) { VoyagrRouteComparisonOrchestration.applyDoAddRouteLayersBatchFromPlan(executePlan); }
function applyDoAddRouteLayersFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDoAddRouteLayersFromPlan(apply); }
function doAddRouteLayers() { VoyagrRouteComparisonOrchestration.doAddRouteLayers(); }
function bringRoutesToTop() { VoyagrRouteComparisonOrchestration.bringRoutesToTop(); }
function applyRouteComparisonListDomFromPlan(domPlan) { VoyagrRouteComparisonOrchestration.applyRouteComparisonListDomFromPlan(domPlan); }
function applyDisplayRouteComparisonFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyDisplayRouteComparisonFromPlan(apply); }
function displayRouteComparison() { VoyagrRouteComparisonOrchestration.displayRouteComparison(); }
function selectRoute(index) { VoyagrRouteComparisonOrchestration.selectRoute(index); }
function applyTripInfoDomFromPlan(apply) { VoyagrRouteComparisonOrchestration.applyTripInfoDomFromPlan(apply); }
function updateTripInfoFromRouteOption(route) { VoyagrRouteComparisonOrchestration.updateTripInfoFromRouteOption(route); }
function displaySingleRoute(index) { VoyagrRouteComparisonOrchestration.displaySingleRoute(index); }
function showAllRoutes() { VoyagrRouteComparisonOrchestration.showAllRoutes(); }
function useRoute(index) { VoyagrRouteComparisonOrchestration.useRoute(index); }
function syncLastCalculatedRouteFromSelection(index) {
    VoyagrRouteComparisonOrchestration.syncLastCalculatedRouteFromSelection(index);
}

function getRouteComparisonOrchestrationRuntime() {
    return {
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRouteOptions: () => VoyagrRouteComparisonOrchestration.getRouteOptions(),
        setRouteOptions: (val) => VoyagrRouteComparisonOrchestration.setRouteOptions(val),
        getSelectedRouteIndex: () => VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),
        setSelectedRouteIndex: (val) => VoyagrRouteComparisonOrchestration.setSelectedRouteIndex(val),
        getRouteLayer: () => routeLayer,
        setRouteLayer: (val) => { routeLayer = val; },
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getShowTrafficEnabled: () => VoyagrMapLayersOrchestration.getShowTrafficEnabled(),
        getTrafficLayer: () => VoyagrMapLayersOrchestration.getTrafficLayer(),
        call: {
            decodePolyline,
            displayAllRouteHazards,
            addTrafficLayer,
            displayHazardMarkers,
            clearHazardMarkers,
            fetchAndDisplayRouteTraffic,
            showRoutePreview,
            showStatus,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            routeColors,
            ensureLabelsOnTop,
            getTrafficSettingsSnapshot: () => VoyagrTrafficOrchestration.getTrafficSettingsSnapshot(),
        },
    };
}

// ===== WAYPOINTS ORCHESTRATION =====
// Orchestration lives in static/js/app/waypoints-orchestration.js (bound at file end).

function getWaypointsOrchestrationRuntime() {
    return {
        waypoints: () => _waypoints(),
        domHelpers: () => _domHelpers(),
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRoutePolyline: () => routePolyline,
        call: {
            showStatus,
            geocodeAddress,
            getAutocompleteDropdown,
            decodePolyline,
            calculateRoute,
            applyMapLibreLineLayerFromMountPlan,
            convertDistance,
            getDistanceUnit,
        },
    };
}

function toggleRouteEditing() { VoyagrWaypointsOrchestration.toggleRouteEditing(); }
function toggleAddViaPoint() { VoyagrWaypointsOrchestration.toggleAddViaPoint(); }
function toggleAddStop() { VoyagrWaypointsOrchestration.toggleAddStop(); }
function handleMapClickForWaypoints(e) { VoyagrWaypointsOrchestration.handleMapClickForWaypoints(e); }
async function addViaPointFromAddress() { return VoyagrWaypointsOrchestration.addViaPointFromAddress(); }
async function addStopFromAddress() { return VoyagrWaypointsOrchestration.addStopFromAddress(); }
function addViaPoint(lat, lon, name) { return VoyagrWaypointsOrchestration.addViaPoint(lat, lon, name); }
function addStop(lat, lon, name, duration) { return VoyagrWaypointsOrchestration.addStop(lat, lon, name, duration); }
function removeViaPoint(index) { VoyagrWaypointsOrchestration.removeViaPoint(index); }
function removeStop(index) { VoyagrWaypointsOrchestration.removeStop(index); }
function clearAllWaypoints() { VoyagrWaypointsOrchestration.clearAllWaypoints(); }
function onWaypointDragStart(e) { VoyagrWaypointsOrchestration.onWaypointDragStart(e); }
function onWaypointDragOver(e) { VoyagrWaypointsOrchestration.onWaypointDragOver(e); }
function onWaypointDrop(e) { VoyagrWaypointsOrchestration.onWaypointDrop(e); }
function moveWaypoint(type, index, direction) { VoyagrWaypointsOrchestration.moveWaypoint(type, index, direction); }
function displayMultiDropLegs(data) { VoyagrWaypointsOrchestration.displayMultiDropLegs(data); }
function clearMultiDropLayers() { VoyagrWaypointsOrchestration.clearMultiDropLayers(); }
function getOrderedWaypoints(startLat, startLon, endLat, endLon) {
    return VoyagrWaypointsOrchestration.getOrderedWaypoints(startLat, startLon, endLat, endLon);
}

// ===== ROUTE SHARING ORCHESTRATION =====
// Orchestration lives in static/js/app/route-sharing-orchestration.js (bound at file end).

function getRouteSharingOrchestrationRuntime() {
    return {
        routeSharing: () => _routeSharing(),
        call: {
            showStatus,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            updateTripInfoFromRouteOption,
            showRoutePreview,
        },
    };
}

function loadSharedRouteFromUrl() { return VoyagrRouteSharingOrchestration.loadSharedRouteFromUrl(); }
function prepareRouteSharing() { VoyagrRouteSharingOrchestration.prepareRouteSharing(); }
function generateShareLink() { VoyagrRouteSharingOrchestration.generateShareLink(); }
function generateQRCode() { VoyagrRouteSharingOrchestration.generateQRCode(); }
function copyShareLink() { VoyagrRouteSharingOrchestration.copyShareLink(); }
function downloadQRCode() { VoyagrRouteSharingOrchestration.downloadQRCode(); }
function shareViaWhatsApp() { VoyagrRouteSharingOrchestration.shareViaWhatsApp(); }
function shareViaEmail() { VoyagrRouteSharingOrchestration.shareViaEmail(); }
// ===== ROUTE ANALYTICS ORCHESTRATION =====
// Lives in static/js/app/trip-history-orchestration.js (bound at file end).

function loadRouteAnalytics() { VoyagrTripHistoryOrchestration.loadRouteAnalytics(); }
function displayAnalytics(data) { VoyagrTripHistoryOrchestration.displayAnalytics(data); }
// ===== ROUTE PREFERENCES ORCHESTRATION =====
// Orchestration lives in static/js/app/route-preferences-orchestration.js (bound at file end).

function getRoutePreferencesOrchestrationRuntime() {
    return {
        routePrefs: () => _routePrefs(),
        settingsSnapshot: () => _settingsSnapshot(),
        routeSelection: () => _routeSelection(),
        getCurrentVehicleType: () => currentVehicleType,
        call: {
            showStatus,
            saveAllSettings,
            applyDomChecksFromPlan,
            applyDomSelectsFromPlan,
            ensureDefaultTrafficAwareRouting,
            calculateRoute,
            switchTab,
        },
    };
}

function saveRoutePreferences() { VoyagrRoutePreferencesOrchestration.saveRoutePreferences(); }
function loadRoutePreferences() { VoyagrRoutePreferencesOrchestration.loadRoutePreferences(); }
function getRoutePreferences() { return VoyagrRoutePreferencesOrchestration.getRoutePreferences(); }
function collectRoutePreferencesFormState() {
    return VoyagrRoutePreferencesOrchestration.collectRoutePreferencesFormState();
}
function collectRoutePreferencesDomInput() {
    return VoyagrRoutePreferencesOrchestration.collectRoutePreferencesDomInput();
}
function updateDetourLabel() { VoyagrRoutePreferencesOrchestration.updateDetourLabel(); }
function recalculateRouteWithPreferences() {
    VoyagrRoutePreferencesOrchestration.recalculateRouteWithPreferences();
}
function saveMultiDropPreferences() { VoyagrRoutePreferencesOrchestration.saveMultiDropPreferences(); }
function loadMultiDropPreferences() { VoyagrRoutePreferencesOrchestration.loadMultiDropPreferences(); }
function clearDepartureTime() { VoyagrRoutePreferencesOrchestration.clearDepartureTime(); }
function collectMultiDropFormState() { VoyagrRoutePreferencesOrchestration.collectMultiDropFormState(); }
// ===== ROUTE SAVING ORCHESTRATION =====
// Orchestration lives in static/js/app/route-saving-orchestration.js (bound at file end).

function getRouteSavingOrchestrationRuntime() {
    return {
        routeSharing: () => _routeSharing(),
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        call: {
            showStatus,
            switchTab,
            persistActiveProfile,
            convertDistance,
            getCurrencySymbol,
            getDistanceUnit,
        },
    };
}

function saveCurrentRoute() { VoyagrRouteSavingOrchestration.saveCurrentRoute(); }
function loadSavedRoutes() { VoyagrRouteSavingOrchestration.loadSavedRoutes(); }
function useSavedRoute(routeId) { VoyagrRouteSavingOrchestration.useSavedRoute(routeId); }
function deleteSavedRoute(routeId) { VoyagrRouteSavingOrchestration.deleteSavedRoute(routeId); }

function decodePolyline(encoded, precision = 6) {
    return VoyagrCalculateRouteOrchestration.decodePolyline(encoded, precision);
}

function showStatus(message, type) {
    return _domHelpers().showStatus(message, type);
}

function collectSettingsFormState() {
    return VoyagrSettingsOrchestration.collectSettingsFormState();
}

// ===== CALCULATE ROUTE ORCHESTRATION =====
// Orchestration lives in static/js/app/calculate-route-orchestration.js (bound at file end).

function getCalculateRouteOrchestrationRuntime() {
    return {
        polylineCodec: () => _polylineCodec(),
        geocodingLocations: () => _geocodingLocations(),
        routeSelection: () => _routeSelection(),
        routeSharing: () => _routeSharing(),
        routingRequest: () => _routingRequest(),
        routeProgress: () => _routeProgress(),
        previewMarker: () => _previewMarker(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getStartMarker: () => startMarker,
        setStartMarker: (val) => { startMarker = val; },
        getEndMarker: () => endMarker,
        setEndMarker: (val) => { endMarker = val; },
        getMapPickerMode: () => VoyagrGeocodingOrchestration.getMapPickerMode(),
        setMapPickerMode: (val) => VoyagrGeocodingOrchestration.setMapPickerMode(val),
        getRouteOptions: () => VoyagrRouteComparisonOrchestration.getRouteOptions(),
        setRouteOptions: (val) => VoyagrRouteComparisonOrchestration.setRouteOptions(val),
        getRouteLayer: () => routeLayer,
        setLastZoomLevel: (val) => VoyagrSmartZoomOrchestration.setLastZoomLevel(val),
        getRouteInProgress: () => routeInProgress,
        getIsGeocoding: () => VoyagrGeocodingOrchestration.getIsGeocoding(),
        getCurrentRoutingMode: () => currentRoutingMode,
        getCurrentVehicleType: () => currentVehicleType,
        getVoiceAnnouncementsEnabled: () => VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncementsEnabled(),
        getIsTrackingActive: () => VoyagrGpsOrchestration.getIsTrackingActive(),
        getTrackingHistory: () => VoyagrGpsOrchestration.getTrackingHistory(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        call: {
            collapseBottomSheet,
            showStatus,
            handleMapClickForWaypoints,
            getAddingViaPoint: () => VoyagrWaypointsOrchestration.getAddingViaPoint(),
            getAddingStop: () => VoyagrWaypointsOrchestration.getAddingStop(),
            updateRouteOnMap,
            speakMessage,
            recordRecentDestination,
            showRoutePreview,
            updateARButtonVisibility,
            updateRoadReportFabVisibility,
            sendNotification,
            updateTripInfo,
            displayMultiDropLegs,
            displayHazardMarkers,
            decodePolyline,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            pickActiveRouteDuringNavigation,
            geocodeLocations,
            getViaPoints: () => VoyagrWaypointsOrchestration.getViaPoints(),
            getStops: () => VoyagrWaypointsOrchestration.getStops(),
            getRouteCostParams,
            isAvoidTollsEnabled,
            getRoutePreferences,
        },
    };
}

function setupMapClickHandler() { VoyagrCalculateRouteOrchestration.setupMapClickHandler(); }
async function calculateRoute() { return VoyagrCalculateRouteOrchestration.calculateRoute(); }
function showRouteProgressBar() { VoyagrCalculateRouteOrchestration.showRouteProgressBar(); }
function hideRouteProgressBar() { VoyagrCalculateRouteOrchestration.hideRouteProgressBar(); }

// ===== HAZARD MAP ORCHESTRATION =====
// Orchestration lives in static/js/app/hazard-map-orchestration.js (bound at file end).

function getHazardMapOrchestrationRuntime() {
    return {
        osmMapIcons: () => _osmMapIcons(),
        hazardMapMarkers: () => _hazardMapMarkers(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRouteOptions: () => VoyagrRouteComparisonOrchestration.getRouteOptions(),
        call: {
            getOsmTrafficLightMarkerPillHTML,
        },
    };
}

function displayHazardMarkers(hazards) { VoyagrHazardMapOrchestration.displayHazardMarkers(hazards); }
function clearHazardMarkers() { VoyagrHazardMapOrchestration.clearHazardMarkers(); }
function displayAllRouteHazards() { VoyagrHazardMapOrchestration.displayAllRouteHazards(); }

// ===== BOTTOM SHEET ORCHESTRATION =====
function toggleBottomSheet() { VoyagrBottomSheetOrchestration.toggleBottomSheet(); }
function expandBottomSheet() { VoyagrBottomSheetOrchestration.expandBottomSheet(); }
function collapseBottomSheet() { VoyagrBottomSheetOrchestration.collapseBottomSheet(); }
function initBottomSheet() { VoyagrBottomSheetOrchestration.initBottomSheet(); }
function syncBottomSheetOverlapFabs() { VoyagrBottomSheetOrchestration.syncBottomSheetOverlapFabs(); }
function applyBottomSheetStateFromPlan(execute) { VoyagrBottomSheetOrchestration.applyBottomSheetStateFromPlan(execute); }

function collapseBottomSheetForRoutePreview() { VoyagrBottomSheetOrchestration.collapseBottomSheetForRoutePreview(); }

function getBottomSheetOrchestrationRuntime() {
    return {
        domHelpers: () => _domHelpers(),
        getBottomSheetStartY: () => VoyagrBottomSheetOrchestration.getBottomSheetStartY(),
        setBottomSheetStartY: (val) => VoyagrBottomSheetOrchestration.setBottomSheetStartY(val),
        getBottomSheetCurrentY: () => VoyagrBottomSheetOrchestration.getBottomSheetCurrentY(),
        setBottomSheetCurrentY: (val) => VoyagrBottomSheetOrchestration.setBottomSheetCurrentY(val),
        getBottomSheetIsExpanded: () => VoyagrBottomSheetOrchestration.getBottomSheetIsExpanded(),
        setBottomSheetIsExpanded: (val) => VoyagrBottomSheetOrchestration.setBottomSheetIsExpanded(val),
        getRouteInProgress: () => routeInProgress,
    };
}

// ===== MAP LAYER STATE =====
// Layer prefs and refs live in static/js/app/map-layers-orchestration.js (bound at file end).

function toggle3DBuildings() { VoyagrMapLayersOrchestration.toggle3DBuildings(); }
function toggleRoadLabels() { VoyagrMapLayersOrchestration.toggleRoadLabels(); }
function toggleGooglePlusCodes() { VoyagrMapLayersOrchestration.toggleGooglePlusCodes(); }
function set3DBuildingHeight(multiplier) { VoyagrMapLayersOrchestration.set3DBuildingHeight(multiplier); }
function set3DBuildingOpacity(opacity) { VoyagrMapLayersOrchestration.set3DBuildingOpacity(opacity); }
function toggleTrafficLayer() { VoyagrMapLayersOrchestration.toggleTrafficLayer(); }
function addTrafficLayer() { VoyagrMapLayersOrchestration.addTrafficLayer(); }
function removeTrafficLayer() { VoyagrMapLayersOrchestration.removeTrafficLayer(); }
function initTrafficLayer() { VoyagrMapLayersOrchestration.initTrafficLayer(); }
function toggleWeatherLayer() { VoyagrMapLayersOrchestration.toggleWeatherLayer(); }
function setWeatherLayerType(type) { VoyagrMapLayersOrchestration.setWeatherLayerType(type); }
function addWeatherLayer() { VoyagrMapLayersOrchestration.addWeatherLayer(); }
function removeWeatherLayer() { VoyagrMapLayersOrchestration.removeWeatherLayer(); }
function initWeatherLayer() { VoyagrMapLayersOrchestration.initWeatherLayer(); }

function getMapLayersOrchestrationRuntime() {
    return {
        mapLayerToggles: () => _mapLayerToggles(),
        weatherLayer: () => _weatherLayer(),
        toggleUI: () => _toggleUI(),
        googlePlusCodesPrefs: () => _googlePlusCodesPrefs(),
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getBuildings3DEnabled: () => VoyagrMapLayersOrchestration.getBuildings3DEnabled(),
        setBuildings3DEnabled: (val) => VoyagrMapLayersOrchestration.setBuildings3DEnabled(val),
        getBuildings3DHeightMultiplier: () => VoyagrMapLayersOrchestration.getBuildings3DHeightMultiplier(),
        setBuildings3DHeightMultiplier: (val) => VoyagrMapLayersOrchestration.setBuildings3DHeightMultiplier(val),
        getBuildings3DOpacity: () => VoyagrMapLayersOrchestration.getBuildings3DOpacity(),
        setBuildings3DOpacity: (val) => VoyagrMapLayersOrchestration.setBuildings3DOpacity(val),
        getRoadLabelsEnabled: () => VoyagrMapLayersOrchestration.getRoadLabelsEnabled(),
        setRoadLabelsEnabled: (val) => VoyagrMapLayersOrchestration.setRoadLabelsEnabled(val),
        getGooglePlusCodesEnabled: () => VoyagrMapLayersOrchestration.getGooglePlusCodesEnabled(),
        setGooglePlusCodesEnabled: (val) => VoyagrMapLayersOrchestration.setGooglePlusCodesEnabled(val),
        getShowTrafficEnabled: () => VoyagrMapLayersOrchestration.getShowTrafficEnabled(),
        setShowTrafficEnabled: (val) => VoyagrMapLayersOrchestration.setShowTrafficEnabled(val),
        getTrafficLayer: () => VoyagrMapLayersOrchestration.getTrafficLayer(),
        setTrafficLayer: (val) => VoyagrMapLayersOrchestration.setTrafficLayer(val),
        getShowWeatherEnabled: () => VoyagrMapLayersOrchestration.getShowWeatherEnabled(),
        setShowWeatherEnabled: (val) => VoyagrMapLayersOrchestration.setShowWeatherEnabled(val),
        getWeatherLayer: () => VoyagrMapLayersOrchestration.getWeatherLayer(),
        setWeatherLayer: (val) => VoyagrMapLayersOrchestration.setWeatherLayer(val),
        getWeatherLayerType: () => VoyagrMapLayersOrchestration.getWeatherLayerType(),
        setWeatherLayerType: (val) => VoyagrMapLayersOrchestration.setWeatherLayerType(val),
        call: {
            showStatus,
            saveAllSettings,
            applySupportLinksFromConfig,
            bringRoutesToTop,
            recomputeMapView3DFromGranular: () => VoyagrMapView3DOrchestration.recomputeMapView3DFromGranular(),
            scheduleMapRepaintAfterUiChange: typeof scheduleMapRepaintAfterUiChange === 'function' ? scheduleMapRepaintAfterUiChange : null,
        },
    };
}


// ===== AUTO-TRAFFIC UPDATE & AUTO-REROUTE SYSTEM =====
// Traffic orchestration lives in static/js/app/traffic-orchestration.js (bound at file end).
// Reroute map update orchestration lives in static/js/app/reroute-map-orchestration.js (bound at file end).
// Reroute deviation state lives in reroute-map-orchestration.js.

function getRerouteMapOrchestrationRuntime() {
    return {
        rerouteDecision: () => _rerouteDecision(),
        routeSelection: () => _routeSelection(),
        navigationDestination: () => _navigationDestination(),
        routingRequest: () => _routingRequest(),
        routeGeometry: () => _routeGeometry(),
        routeProgress: () => _routeProgress(),
        speedGps: () => _speedGps(),
        speedLimitWidget: () => _speedLimitWidget(),
        voiceAnnouncements: () => _voiceAnnouncements(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        setLastCalculatedRoute: (val) => { window.lastCalculatedRoute = val; },
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getRouteLayer: () => routeLayer,
        setRouteLayer: (val) => { routeLayer = val; },
        getRouteInProgress: () => routeInProgress,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getCurrentRouteSteps: () => currentRouteSteps,
        setCurrentRouteSteps: (val) => { currentRouteSteps = val; },
        getCurrentStepIndex: () => currentStepIndex,
        setCurrentStepIndex: (val) => { currentStepIndex = val; },
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        setLastSnappedRouteIndex: (val) => { lastSnappedRouteIndex = val; },
        getLastTurnDetectRouteVertexIndex: () => VoyagrNavigationLifecycleOrchestration.getLastTurnDetectRouteVertexIndex(),
        setLastTurnDetectRouteVertexIndex: (val) => VoyagrNavigationLifecycleOrchestration.setLastTurnDetectRouteVertexIndex(val),
        getCurrentRoutingMode: () => currentRoutingMode,
        getCurrentVehicleType: () => currentVehicleType,
        getCurrentUserMarker: () => VoyagrGpsOrchestration.getCurrentUserMarker(),
        getSnapBlendWeightState: () => VoyagrGpsOrchestration.getSnapBlendWeightState(),
        getSmoothDisplayLat: () => VoyagrGpsOrchestration.getSmoothDisplayLat(),
        getSmoothDisplayLon: () => VoyagrGpsOrchestration.getSmoothDisplayLon(),
        getAnnouncedTurnThresholds: () => VoyagrVoiceAnnouncementsOrchestration.getAnnouncedTurnThresholds(),
        getAnnouncedExitThresholds: () => VoyagrVoiceAnnouncementsOrchestration.getAnnouncedExitThresholds(),
        getAnnouncedKeepThresholds: () => VoyagrVoiceAnnouncementsOrchestration.getAnnouncedKeepThresholds(),
        setLastETAAnnouncementTime: (val) => VoyagrLiveDataRefreshOrchestration.setLastETAAnnouncementTime(val),
        setLastAnnouncedETA: (val) => VoyagrLiveDataRefreshOrchestration.setLastAnnouncedETA(val),
        setLastDestinationAnnouncementDistance: (val) => VoyagrVoiceAnnouncementsOrchestration.setLastDestinationAnnouncementDistance(val),
        setInitialETAMovementRetries: (val) => VoyagrLiveDataRefreshOrchestration.setInitialETAMovementRetries(val),
        setVoiceAnnouncedForManeuverIndex: (val) => VoyagrVoiceAnnouncementsOrchestration.setVoiceAnnouncedForManeuverIndex(val),
        setVoiceAnnouncedCategory: (val) => VoyagrVoiceAnnouncementsOrchestration.setVoiceAnnouncedCategory(val),
        call: {
            getRouteCostParams,
            getRoutePreferences,
            isAvoidTollsEnabled,
            convertDistance,
            getDistanceUnit,
            decodePolyline,
            navActiveRouteColor,
            bringNavRouteAboveTrafficEdges,
            resetVehicleMarkerDisplayState,
            applySpeedLimitFetchResetFromPlan,
            primeVehicleMarkerOnRoute,
            resetNavigationArrivalState,
            resetRoadNameState: () => VoyagrRoadNameOrchestration.resetRoadNameState(),
            clearRerouteFailureRetries,
            updateTurnWidgetFromPosition,
            fetchRoadNameThrottled,
            updateTripInfo,
            clearInitialETAAnnouncement,
            setLastLaneVoiceKey: (val) => VoyagrLaneGuidanceOrchestration.setLastLaneVoiceKey(val),
            resolveGpsRouteSnapForTick,
            applyVehicleMarkerFromTickPlan,
        },
    };
}

function pickActiveRouteDuringNavigation(routeList, singleRoutePayload) {
    return VoyagrRerouteMapOrchestration.pickActiveRouteDuringNavigation(routeList, singleRoutePayload);
}

function resolveNavigationDestination() {
    return VoyagrRerouteMapOrchestration.resolveNavigationDestination();
}

function buildRouteRequest(startLat, startLon, destination, avoidPoints = null) {
    return VoyagrRerouteMapOrchestration.buildRouteRequest(startLat, startLon, destination, avoidPoints);
}

function applyVoiceAnnouncementStateResetFromPlan(execute) {
    return VoyagrRerouteMapOrchestration.applyVoiceAnnouncementStateResetFromPlan(execute);
}

function resetVoiceAnnouncementStateForNewRoute() {
    return VoyagrRerouteMapOrchestration.resetVoiceAnnouncementStateForNewRoute();
}

function applyRouteMapUpdateStateFromPlan(plan, newRoute) {
    return VoyagrRerouteMapOrchestration.applyRouteMapUpdateStateFromPlan(plan, newRoute);
}

function updateRouteOnMap(newRoute) {
    return VoyagrRerouteMapOrchestration.updateRouteOnMap(newRoute);
}

function getNavActiveRoutePolylineOptions() {
    return VoyagrRerouteMapOrchestration.getNavActiveRoutePolylineOptions();
}

function redrawNavigationRouteLayer(reason) {
    return VoyagrRerouteMapOrchestration.redrawNavigationRouteLayer(reason);
}

function redrawNavigationVehicleMarker(reason) {
    return VoyagrRerouteMapOrchestration.redrawNavigationVehicleMarker(reason);
}

function redrawNavigationOverlaysAfterMapRecovery(reason) {
    return VoyagrRerouteMapOrchestration.redrawNavigationOverlaysAfterMapRecovery(reason);
}

function seedNavigationProgressOnNewRoute(lat, lon) {
    return VoyagrRerouteMapOrchestration.seedNavigationProgressOnNewRoute(lat, lon);
}

// ===== CAZ ORCHESTRATION =====
// Orchestration lives in static/js/app/caz-orchestration.js (bound at file end).

function getCazOrchestrationRuntime() {
    return {
        cazInfo: () => _cazInfo(),
    };
}

function showCAZInfo() { return VoyagrCazOrchestration.showCAZInfo(); }
function getCAZPassTypes() { return VoyagrCazOrchestration.getCAZPassTypes(); }
function checkRouteCAZ(routeCoords, vehicleCazPass, vehicleType) {
    return VoyagrCazOrchestration.checkRouteCAZ(routeCoords, vehicleCazPass, vehicleType);
}

// ===== ALWAYS-ON CAMERA LAYER =====
// Orchestration lives in static/js/app/map-overlay-orchestration.js (bound at file end).

function getMapOverlayOrchestrationRuntime() {
    return {
        mapOverlayToggles: () => _mapOverlayToggles(),
        mapLayerToggles: () => _mapLayerToggles(),
        toggleUI: () => _toggleUI(),
        osmMapIcons: () => _osmMapIcons(),
        hazardMapMarkers: () => _hazardMapMarkers(),
        cameraMapMarkers: () => _cameraMapMarkers(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRoadLabelsEnabled: () => VoyagrMapLayersOrchestration.getRoadLabelsEnabled(),
        call: {
            saveAllSettings,
        },
    };
}

function getOsmTrafficLightMarkerPillHTML() {
    return VoyagrMapOverlayOrchestration.getOsmTrafficLightMarkerPillHTML();
}

function toggleShowCameras() {
    VoyagrMapOverlayOrchestration.toggleShowCameras();
}

function toggleShowOsmTrafficLights() {
    VoyagrMapOverlayOrchestration.toggleShowOsmTrafficLights();
}

function toggleShowOsmRailwayCrossings() {
    VoyagrMapOverlayOrchestration.toggleShowOsmRailwayCrossings();
}

function initializeCameraLayer() {
    VoyagrMapOverlayOrchestration.initializeCameraLayer();
}

function initializeRoadLabels() {
    VoyagrMapOverlayOrchestration.initializeRoadLabels();
}

/**
 * startNavigation function
 * @function startNavigation
 * @returns {*} Return value description
 */
function startNavigation() { VoyagrRoutePreviewOrchestration.startNavigation(); }

// ===== ROUTE PREVIEW ORCHESTRATION =====
function showRoutePreview(routeData, skipMapDisplay = false) {
    VoyagrRoutePreviewOrchestration.showRoutePreview(routeData, skipMapDisplay);
}
function showAlternativeRoutesInPreview() { VoyagrRoutePreviewOrchestration.showAlternativeRoutesInPreview(); }
function showRouteComparison() { return VoyagrRoutePreviewOrchestration.showRouteComparison(); }
function overviewRoute() { VoyagrRoutePreviewOrchestration.overviewRoute(); }
function startNavigationFromPreview() { VoyagrRoutePreviewOrchestration.startNavigationFromPreview(); }
function applyRouteUpdateDuringNavigation(routeData) {
    VoyagrRoutePreviewOrchestration.applyRouteUpdateDuringNavigation(routeData);
}
function updateTripInfo(distance, time, fuelCost, tollCost) {
    VoyagrRoutePreviewOrchestration.updateTripInfo(distance, time, fuelCost, tollCost);
}

function getRoutePreviewOrchestrationRuntime() {
    return {
        routeSelection: () => _routeSelection(),
        routingRequest: () => _routingRequest(),
        routeSharing: () => _routeSharing(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRouteOptions: () => VoyagrRouteComparisonOrchestration.getRouteOptions(),
        setRouteOptions: (val) => VoyagrRouteComparisonOrchestration.setRouteOptions(val),
        getSelectedRouteIndex: () => VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),
        setSelectedRouteIndex: (val) => VoyagrRouteComparisonOrchestration.setSelectedRouteIndex(val),
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getRouteInProgress: () => routeInProgress,
        getCurrentRoutingMode: () => currentRoutingMode,
        getCurrentVehicleType: () => currentVehicleType,
        getDistanceUnitValue: () => distanceUnit,
        getShowTrafficEnabled: () => VoyagrMapLayersOrchestration.getShowTrafficEnabled(),
        getTrafficLayer: () => VoyagrMapLayersOrchestration.getTrafficLayer(),
        call: {
            showStatus,
            switchTab,
            expandBottomSheet,
            addTrafficLayer,
            fetchAndDisplayRouteTraffic,
            displayAllRoutesOnMap,
            selectRoute,
            useRoute,
            pickActiveRouteDuringNavigation,
            updateRouteOnMap,
            decodePolyline,
            convertDistance,
            getDistanceUnit,
            getCurrencySymbol,
            syncLastCalculatedRouteFromSelection,
            startTurnByTurnNavigation,
            collapseBottomSheet,
            applyTripInfoDomFromPlan,
            routeColors,
            getTrafficSettingsSnapshot: () => VoyagrTrafficOrchestration.getTrafficSettingsSnapshot(),
        },
    };
}


// ===== PARKING INTEGRATION FEATURE =====
// Orchestration lives in static/js/app/parking-orchestration.js (bound at file end).

function getParkingOrchestrationRuntime() {
    return {
        multimodalParking: () => _multimodalParking(),
        routingRequest: () => _routingRequest(),
        getMap: () => map,
        getRouteOptionsLength: () => {
            const opts = VoyagrRouteComparisonOrchestration.getRouteOptions();
            return (opts && opts.length) || 0;
        },
        getSelectedRouteIndex: () => VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),
        getRouteOptionAt: (idx) => {
            const opts = VoyagrRouteComparisonOrchestration.getRouteOptions();
            return (opts && opts[idx]) || null;
        },
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        getCurrentVehicleType: () => currentVehicleType,
        getRouteCostParams,
        isAvoidTollsEnabled,
        decodePolyline,
        convertDistance,
        getDistanceUnit,
        showStatus,
        saveAllSettings,
        applyDomSelectsFromPlan,
        expandBottomSheet,
        showRoutePreview,
        calculateRoute,
        geocodeLocations,
    };
}

function collectParkingPreferencesFormState() {
    return VoyagrParkingOrchestration.collectParkingPreferencesFormState();
}

function saveParkingPreferences() {
    VoyagrParkingOrchestration.saveParkingPreferences();
}

function loadParkingPreferences() {
    VoyagrParkingOrchestration.loadParkingPreferences();
}

function findParkingNearDestination() {
    return VoyagrParkingOrchestration.findParkingNearDestination();
}

function clearParkingSelection() {
    VoyagrParkingOrchestration.clearParkingSelection();
}

function setParkingAsDestination(parking) {
    return VoyagrParkingOrchestration.setParkingAsDestination(parking);
}

// ===== TRAFFIC ORCHESTRATION =====
// Orchestration lives in static/js/app/traffic-orchestration.js (bound at file end).

function getTrafficOrchestrationRuntime() {
    return {
        trafficChange: () => _trafficChange(),
        routeTrafficFlow: () => _routeTrafficFlow(),
        toggleUI: () => _toggleUI(),
        routeSelection: () => _routeSelection(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRoutePolyline: () => routePolyline,
        getRouteInProgress: () => routeInProgress,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        getRouteLayer: () => routeLayer,
        getAllRouteLayers: () => VoyagrRouteComparisonOrchestration.getAllRouteLayers(),
        getVoiceAnnouncementsEnabled: () => VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncementsEnabled(),
        showStatus,
        saveAllSettings,
        sendNotification,
        speakMessage,
        convertDistance,
        getDistanceUnit,
        calculateDistanceMeters,
        buildRouteRequest,
        resolveNavigationDestination,
        updateRouteOnMap,
        applyMapLayerReorderFromPlan,
    };
}

function updateTrafficConditions() {
    VoyagrTrafficOrchestration.updateTrafficConditions();
}

function startTrafficMonitoring() {
    VoyagrTrafficOrchestration.startTrafficMonitoring();
}

function stopTrafficMonitoring() {
    VoyagrTrafficOrchestration.stopTrafficMonitoring();
}

function toggleRouteTraffic() {
    VoyagrTrafficOrchestration.toggleRouteTraffic();
}

function fetchAndDisplayRouteTraffic() {
    return VoyagrTrafficOrchestration.fetchAndDisplayRouteTraffic();
}

function bringTrafficEdgesToTop() {
    VoyagrTrafficOrchestration.bringTrafficEdgesToTop();
}

function bringNavRouteAboveTrafficEdges() {
    VoyagrTrafficOrchestration.bringNavRouteAboveTrafficEdges();
}

function ensureLabelsOnTop() {
    VoyagrTrafficOrchestration.ensureLabelsOnTop();
}

function startRouteTrafficUpdates() {
    VoyagrTrafficOrchestration.startRouteTrafficUpdates();
}

function stopRouteTrafficUpdates() {
    VoyagrTrafficOrchestration.stopRouteTrafficUpdates();
}

function toggleAutoTrafficUpdate() {
    VoyagrTrafficOrchestration.toggleAutoTrafficUpdate();
}

function toggleAutoRerouteOnDeviation() {
    VoyagrTrafficOrchestration.toggleAutoRerouteOnDeviation();
}

function startAutoTrafficUpdates() {
    VoyagrTrafficOrchestration.startAutoTrafficUpdates();
}

function stopAutoTrafficUpdates() {
    VoyagrTrafficOrchestration.stopAutoTrafficUpdates();
}

function checkTrafficAndReroute() {
    return VoyagrTrafficOrchestration.checkTrafficAndReroute();
}

function manualTrafficUpdate() {
    return VoyagrTrafficOrchestration.manualTrafficUpdate();
}

function getRouteTrafficAhead(forceFresh) {
    return VoyagrTrafficOrchestration.getRouteTrafficAhead(forceFresh);
}

function getAutoRerouteOnDeviationEnabled() {
    return VoyagrTrafficOrchestration.getTrafficSettingsSnapshot().autoRerouteOnDeviationEnabled;
}

// ===== PORCUPINE WAKE ORCHESTRATION =====
// Orchestration lives in static/js/app/porcupine-orchestration.js (bound at file end).

function getPorcupineOrchestrationRuntime() {
    return {
        porcupineWake: () => _porcupineWake(),
        toggleUI: () => _toggleUI(),
        showStatus,
        saveAllSettings,
        speakMessage,
        initVoiceRecognition,
        getVoiceRecognition: () => VoyagrVoiceControlOrchestration.getVoiceRecognition(),
        getIsListening: () => VoyagrVoiceControlOrchestration.getIsListening(),
        setIsListening: (v) => VoyagrVoiceControlOrchestration.setIsListening(v),
        setVoiceFinalTranscript: (v) => VoyagrVoiceControlOrchestration.setVoiceFinalTranscript(v),
    };
}

function picovoiceClientConfigured() {
    return VoyagrPorcupineOrchestration.picovoiceClientConfigured();
}

function loadPorcupineWakeUi() {
    VoyagrPorcupineOrchestration.loadPorcupineWakeUi();
}

function togglePorcupineWakeWord() {
    VoyagrPorcupineOrchestration.togglePorcupineWakeWord();
}

function maybeResumePorcupineWakeAfterVoice() {
    VoyagrPorcupineOrchestration.maybeResumePorcupineWakeAfterVoice();
}

function startPorcupineWakePipeline() {
    return VoyagrPorcupineOrchestration.startPorcupineWakePipeline();
}

function stopPorcupineWakePipeline() {
    return VoyagrPorcupineOrchestration.stopPorcupineWakePipeline();
}

function warmPicovoiceStaticCache() {
    VoyagrPorcupineOrchestration.warmPicovoiceStaticCache();
}


// ===== GPS ORCHESTRATION =====
// Orchestration lives in static/js/app/gps-orchestration.js (bound at file end).

function getGpsOrchestrationRuntime() {
    return {
        g: (key) => {
            switch (key) {
            case 'map': return map;
            case 'routeInProgress': return routeInProgress;
            case 'routePolyline': return routePolyline;
            case 'routeStarted': return routeStarted;
            case 'currentLat': return currentLat;
            case 'currentLon': return currentLon;
            case 'currentStepIndex': return currentStepIndex;
            case 'lastSnappedRouteIndex': return lastSnappedRouteIndex;
            case 'currentRouteSteps': return currentRouteSteps;
            case 'isTrackingActive': return VoyagrGpsOrchestration.getIsTrackingActive();
            case 'gpsWatchId': return VoyagrGpsOrchestration.getGpsWatchId();
            case 'currentUserMarker': return VoyagrGpsOrchestration.getCurrentUserMarker();
            case 'trackingHistory': return VoyagrGpsOrchestration.getTrackingHistory();
            case 'zoomAndFollowEnabled': return zoomAndFollowEnabled;
            case 'mapFollowingActive': return mapFollowingActive;
            case 'driverPerspectiveEnabled': return VoyagrDriverCameraOrchestration.getDriverPerspectiveEnabled();
            case '_snapBlendWeightState': return VoyagrGpsOrchestration.getSnapBlendWeightState();
            case '_smoothDisplayLat': return VoyagrGpsOrchestration.getSmoothDisplayLat();
            case '_smoothDisplayLon': return VoyagrGpsOrchestration.getSmoothDisplayLon();
            case 'currentSpeedLimitMph': return VoyagrSpeedWidgetOrchestration.getCurrentSpeedLimitMph();
            case 'lastSpeedLimitRegion': return VoyagrSpeedWidgetOrchestration.getLastSpeedLimitRegion();
            case 'lastDetectedRoadType': return VoyagrSpeedWidgetOrchestration.getLastDetectedRoadType();
            case '_lastActiveManeuverIdx': return VoyagrSpeedWidgetOrchestration.getLastActiveManeuverIdx();
            case '_lastGoodRawPickMph': return VoyagrSpeedWidgetOrchestration.getLastGoodRawPickMph();
            case '_consecutiveDisplacementMoves': return VoyagrSpeedWidgetOrchestration.getConsecutiveDisplacementMoves();
            case '_smoothedSpeedMph': return VoyagrSpeedWidgetOrchestration.getSmoothedSpeedMph();
            case '_smoothedSpeedInitAt': return VoyagrSpeedWidgetOrchestration.getSmoothedSpeedInitAt();
            case 'announcedTurnThresholds': return VoyagrVoiceAnnouncementsOrchestration.getAnnouncedTurnThresholds();
            case 'announcedExitThresholds': return VoyagrVoiceAnnouncementsOrchestration.getAnnouncedExitThresholds();
            case 'announcedKeepThresholds': return VoyagrVoiceAnnouncementsOrchestration.getAnnouncedKeepThresholds();
            case '_voiceAnnouncedForManeuverIndex': return VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncedForManeuverIndex();
            case '_voiceAnnouncedCategory': return VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncedCategory();
            case '_lastLaneVoiceKey': return VoyagrLaneGuidanceOrchestration.getLastLaneVoiceKey();
            case 'lastDestinationAnnouncementDistance': return VoyagrVoiceAnnouncementsOrchestration.getLastDestinationAnnouncementDistance();
            case '_navigationArrivalTriggered': return VoyagrNavigationLifecycleOrchestration.getNavigationArrivalTriggered();
            case '_navigationArrivalZoneSince': return VoyagrNavigationLifecycleOrchestration.getNavigationArrivalZoneSince();
            case '_navTraveledMeters': return VoyagrNavigationLifecycleOrchestration.getNavTraveledMeters();
            case '_navOdometerLastGeo': return VoyagrNavigationLifecycleOrchestration.getNavOdometerLastGeo();
            case '_navStartedAt': return VoyagrNavigationLifecycleOrchestration.getNavStartedAt();
            case 'lastETAAnnouncementTime': return VoyagrLiveDataRefreshOrchestration.getLastETAAnnouncementTime();
            case 'lastAnnouncedETA': return VoyagrLiveDataRefreshOrchestration.getLastAnnouncedETA();
            case 'initialETAMovementRetries': return VoyagrLiveDataRefreshOrchestration.getInitialETAMovementRetries();
            case 'initialETAAnnouncementTimeoutId': return VoyagrLiveDataRefreshOrchestration.getInitialETAAnnouncementTimeoutId();
            case 'lastNavTrafficFetchAt': return VoyagrLiveDataRefreshOrchestration.getLastNavTrafficFetchAt();
            case 'routeJoinConfirmedForDeviation': return VoyagrRerouteMapOrchestration.getRouteJoinConfirmedForDeviation();
            case 'deviationStartTimeCheck': return VoyagrRerouteMapOrchestration.getDeviationStartTimeCheck();
            case 'deviationOffRouteStreak': return VoyagrRerouteMapOrchestration.getDeviationOffRouteStreak();
            case 'rerouteAttemptCount': return VoyagrRerouteMapOrchestration.getRerouteAttemptCount();
            case 'postRerouteGraceUntil': return VoyagrRerouteMapOrchestration.getPostRerouteGraceUntil();
            case 'lastRerouteTime': return VoyagrRerouteMapOrchestration.getLastRerouteTime();
            case 'lastRerouteAttemptTime': return VoyagrRerouteMapOrchestration.getLastRerouteAttemptTime();
            case 'rerouteInProgress': return VoyagrRerouteMapOrchestration.getRerouteInProgress();
            case 'lastRerouteDeviation': return VoyagrRerouteMapOrchestration.getLastRerouteDeviation();
            case 'rerouteFailureRetryTimer': return VoyagrRerouteMapOrchestration.getRerouteFailureRetryTimer();
            case 'rerouteFailureRetryCount': return VoyagrRerouteMapOrchestration.getRerouteFailureRetryCount();
            case '_preferPrimaryRouteOnNextNavUpdate': return VoyagrRerouteMapOrchestration.getPreferPrimaryRouteOnNextNavUpdate();
            case 'lastTurnDetectRouteVertexIndex': return VoyagrNavigationLifecycleOrchestration.getLastTurnDetectRouteVertexIndex();
            case 'voiceAnnouncementsEnabled': return VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncementsEnabled();
            case 'voiceFrequencyMode': return VoyagrVoiceAnnouncementsOrchestration.getVoiceFrequencyMode();
            case 'speedWidgetEnabled': return VoyagrSpeedWidgetOrchestration.getSpeedWidgetEnabled();
            case 'userHasStartedMoving': break;
                default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'map': map = val; break;
            case 'routeInProgress': routeInProgress = val; break;
            case 'routePolyline': routePolyline = val; break;
            case 'routeStarted': routeStarted = val; break;
            case 'currentLat': currentLat = val; break;
            case 'currentLon': currentLon = val; break;
            case 'currentStepIndex': currentStepIndex = val; break;
            case 'lastSnappedRouteIndex': lastSnappedRouteIndex = val; break;
            case 'currentRouteSteps': currentRouteSteps = val; break;
            case 'isTrackingActive': VoyagrGpsOrchestration.setIsTrackingActive(val); break;
            case 'gpsWatchId': VoyagrGpsOrchestration.setGpsWatchId(val); break;
            case 'currentUserMarker': VoyagrGpsOrchestration.setCurrentUserMarker(val); break;
            case 'trackingHistory': VoyagrGpsOrchestration.setTrackingHistory(val); break;
            case 'zoomAndFollowEnabled': zoomAndFollowEnabled = val; break;
            case 'mapFollowingActive': mapFollowingActive = val; break;
            case 'driverPerspectiveEnabled': VoyagrDriverCameraOrchestration.setDriverPerspectiveEnabled(val); break;
            case '_snapBlendWeightState': VoyagrGpsOrchestration.setSnapBlendWeightState(val); break;
            case '_smoothDisplayLat': VoyagrGpsOrchestration.setSmoothDisplayLat(val); break;
            case '_smoothDisplayLon': VoyagrGpsOrchestration.setSmoothDisplayLon(val); break;
            case 'currentSpeedLimitMph': VoyagrSpeedWidgetOrchestration.setCurrentSpeedLimitMph(val); break;
            case 'lastSpeedLimitRegion': VoyagrSpeedWidgetOrchestration.setLastSpeedLimitRegion(val); break;
            case 'lastDetectedRoadType': VoyagrSpeedWidgetOrchestration.setLastDetectedRoadType(val); break;
            case '_lastActiveManeuverIdx': VoyagrSpeedWidgetOrchestration.setLastActiveManeuverIdx(val); break;
            case '_lastGoodRawPickMph': VoyagrSpeedWidgetOrchestration.setLastGoodRawPickMph(val); break;
            case '_consecutiveDisplacementMoves': VoyagrSpeedWidgetOrchestration.setConsecutiveDisplacementMoves(val); break;
            case '_smoothedSpeedMph': VoyagrSpeedWidgetOrchestration.setSmoothedSpeedMph(val); break;
            case '_smoothedSpeedInitAt': VoyagrSpeedWidgetOrchestration.setSmoothedSpeedInitAt(val); break;
            case 'announcedTurnThresholds': break;
            case 'announcedExitThresholds': break;
            case 'announcedKeepThresholds': break;
            case '_voiceAnnouncedForManeuverIndex': VoyagrVoiceAnnouncementsOrchestration.setVoiceAnnouncedForManeuverIndex(val); break;
            case '_voiceAnnouncedCategory': VoyagrVoiceAnnouncementsOrchestration.setVoiceAnnouncedCategory(val); break;
            case '_lastLaneVoiceKey': VoyagrLaneGuidanceOrchestration.setLastLaneVoiceKey(val); break;
            case 'lastDestinationAnnouncementDistance': VoyagrVoiceAnnouncementsOrchestration.setLastDestinationAnnouncementDistance(val); break;
            case '_navigationArrivalTriggered': VoyagrNavigationLifecycleOrchestration.setNavigationArrivalTriggered(val); break;
            case '_navigationArrivalZoneSince': VoyagrNavigationLifecycleOrchestration.setNavigationArrivalZoneSince(val); break;
            case '_navTraveledMeters': VoyagrNavigationLifecycleOrchestration.setNavTraveledMeters(val); break;
            case '_navOdometerLastGeo': VoyagrNavigationLifecycleOrchestration.setNavOdometerLastGeo(val); break;
            case '_navStartedAt': VoyagrNavigationLifecycleOrchestration.setNavStartedAt(val); break;
            case 'lastETAAnnouncementTime': VoyagrLiveDataRefreshOrchestration.setLastETAAnnouncementTime(val); break;
            case 'lastAnnouncedETA': VoyagrLiveDataRefreshOrchestration.setLastAnnouncedETA(val); break;
            case 'initialETAMovementRetries': VoyagrLiveDataRefreshOrchestration.setInitialETAMovementRetries(val); break;
            case 'initialETAAnnouncementTimeoutId': VoyagrLiveDataRefreshOrchestration.setInitialETAAnnouncementTimeoutId(val); break;
            case 'lastNavTrafficFetchAt': VoyagrLiveDataRefreshOrchestration.setLastNavTrafficFetchAt(val); break;
            case 'routeJoinConfirmedForDeviation': VoyagrRerouteMapOrchestration.setRouteJoinConfirmedForDeviation(val); break;
            case 'deviationStartTimeCheck': VoyagrRerouteMapOrchestration.setDeviationStartTimeCheck(val); break;
            case 'deviationOffRouteStreak': VoyagrRerouteMapOrchestration.setDeviationOffRouteStreak(val); break;
            case 'rerouteAttemptCount': VoyagrRerouteMapOrchestration.setRerouteAttemptCount(val); break;
            case 'postRerouteGraceUntil': VoyagrRerouteMapOrchestration.setPostRerouteGraceUntil(val); break;
            case 'lastRerouteTime': VoyagrRerouteMapOrchestration.setLastRerouteTime(val); break;
            case 'lastRerouteAttemptTime': VoyagrRerouteMapOrchestration.setLastRerouteAttemptTime(val); break;
            case 'rerouteInProgress': VoyagrRerouteMapOrchestration.setRerouteInProgress(val); break;
            case 'lastRerouteDeviation': VoyagrRerouteMapOrchestration.setLastRerouteDeviation(val); break;
            case 'rerouteFailureRetryTimer': VoyagrRerouteMapOrchestration.setRerouteFailureRetryTimer(val); break;
            case 'rerouteFailureRetryCount': VoyagrRerouteMapOrchestration.setRerouteFailureRetryCount(val); break;
            case '_preferPrimaryRouteOnNextNavUpdate': VoyagrRerouteMapOrchestration.setPreferPrimaryRouteOnNextNavUpdate(val); break;
            case 'lastTurnDetectRouteVertexIndex': VoyagrNavigationLifecycleOrchestration.setLastTurnDetectRouteVertexIndex(val); break;
            case 'voiceAnnouncementsEnabled': VoyagrVoiceAnnouncementsOrchestration.setVoiceAnnouncementsEnabled(val); break;
            case 'voiceFrequencyMode': VoyagrVoiceAnnouncementsOrchestration.setVoiceFrequencyMode(val); break;
            case 'speedWidgetEnabled': VoyagrSpeedWidgetOrchestration.setSpeedWidgetEnabled(val); break;
            case 'userHasStartedMoving': break;
                default: break;
            }
        },
        m: {
            speedGps: () => _speedGps(),
            cameraPitch: () => _cameraPitch(),
            routeGeometry: () => _routeGeometry(),
            routeProgress: () => _routeProgress(),
            rerouteDecision: () => _rerouteDecision(),
            eta: () => _eta(),
            voiceAnnouncements: () => _voiceAnnouncements(),
            hazardAlerts: () => _hazardAlerts(),
            speedLimitWidget: () => _speedLimitWidget(),
            mapControls: () => _mapControls(),
            toggleUI: () => _toggleUI(),
            trafficChange: () => _trafficChange(),
            routeSelection: () => _routeSelection(),
            navigationDestination: () => _navigationDestination(),
            routingRequest: () => _routingRequest(),
        },
        consts: {
            ZOOM_LEVELS,
            TURN_ZOOM_THRESHOLD,
            TURN_ANNOUNCEMENT_DISTANCES: VoyagrVoiceAnnouncementsOrchestration.getTurnAnnouncementDistances(),
            EXIT_ANNOUNCEMENT_DISTANCES: VoyagrVoiceAnnouncementsOrchestration.getExitAnnouncementDistances(),
            KEEP_ANNOUNCEMENT_DISTANCES: VoyagrVoiceAnnouncementsOrchestration.getKeepAnnouncementDistances(),
            DESTINATION_ANNOUNCEMENT_DISTANCES: VoyagrVoiceAnnouncementsOrchestration.getDestinationAnnouncementDistances(),
            ETA_CHANGE_THRESHOLD_MS: VoyagrLiveDataRefreshOrchestration.getEtaChangeThresholdMs(),
            ETA_MIN_INTERVAL_MS: VoyagrLiveDataRefreshOrchestration.getEtaMinIntervalMs(),
            HAZARD_WARNING_DISTANCE: VoyagrVoiceAnnouncementsOrchestration.getHazardWarningDistance(),
        },
        getIsOffline: () => VoyagrOfflineNavigationOrchestration.getIsOffline(),
        call: {
            smoothGpsSpeedMph: (rawMph) => VoyagrSpeedWidgetOrchestration.smoothGpsSpeedMph(rawMph),
            updateRecenterButtonVisibility,
            updateTurnWidgetFromPosition,
            fetchRoadNameThrottled: (lat, lon) => VoyagrRoadNameOrchestration.fetchRoadNameThrottled(lat, lon),
            showStatus,
            sendNotification,
            speakMessage,
            updateRouteOnMap,
            getRouteTrafficAhead,
            getAutoRerouteOnDeviationEnabled,
            pickActiveRouteDuringNavigation,
            buildRouteRequest,
            resolveNavigationDestination,
            isActiveNavigationFollow,
            shouldTiltDrivingCamera,
            shouldUsePitchedDrivingCamera,
            applySmartZoomWithAnimation,
            getCurrentRoadType: (idx, mph) => VoyagrSpeedWidgetOrchestration.getCurrentRoadType(idx, mph),
            createVehicleMarker,
            calculateDistanceMeters,
            convertDistance,
            getDistanceUnit,
            updateSpeedWidget: (speed, limit) => VoyagrSpeedWidgetOrchestration.updateSpeedWidget(speed, limit),
            updateSpeedWidgetVisibility: () => VoyagrSpeedWidgetOrchestration.updateSpeedWidgetVisibility(),
            fetchSpeedLimitThrottled: (lat, lon, speed, road, limit, heading) =>
                VoyagrSpeedWidgetOrchestration.fetchSpeedLimitThrottled(lat, lon, speed, road, limit, heading),
            updateRoadReportFabVisibility,
            hasUserStartedMoving,
            getSpeedLimitFetchState: () => VoyagrSpeedWidgetOrchestration.getSpeedLimitFetchState(),
            detectUpcomingTurn: (lat, lon) => VoyagrTurnInstructionWidgetOrchestration.detectUpcomingTurn(lat, lon),
            getFollowingManeuver: (idx) => VoyagrTurnInstructionWidgetOrchestration.getFollowingManeuver(idx),
            effectiveRoundaboutExitCount: (idx) => VoyagrTurnInstructionWidgetOrchestration.effectiveRoundaboutExitCount(idx),
        },
    };
}

function startGPSTracking() { VoyagrGpsOrchestration.startGPSTracking(); }
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    return VoyagrGpsOrchestration.calculateDistanceMeters(lat1, lon1, lat2, lon2);
}
function resolveGpsRouteSnapForTick(lat, lon) {
    return VoyagrGpsOrchestration.resolveGpsRouteSnapForTick(lat, lon);
}
function getVehicleDisplayCoordinates() {
    return VoyagrGpsOrchestration.getVehicleDisplayCoordinates();
}
function stopGPSTracking() { VoyagrGpsOrchestration.stopGPSTracking(); }
function applyVehicleMarkerFromTickPlan(markerTick) { VoyagrGpsOrchestration.applyVehicleMarkerFromTickPlan(markerTick); }
function applySpeedLimitFetchResetFromPlan(resetPlan) { VoyagrGpsOrchestration.applySpeedLimitFetchResetFromPlan(resetPlan); }
function resetVehicleMarkerDisplayState() { VoyagrGpsOrchestration.resetVehicleMarkerDisplayState(); }
function primeVehicleMarkerOnRoute(lat, lon) { VoyagrGpsOrchestration.primeVehicleMarkerOnRoute(lat, lon); }
function resetNavigationArrivalState() { VoyagrGpsOrchestration.resetNavigationArrivalState(); }
function clearRerouteFailureRetries() { VoyagrGpsOrchestration.clearRerouteFailureRetries(); }
function ensureDefaultTrafficAwareRouting() { VoyagrGpsOrchestration.ensureDefaultTrafficAwareRouting(); }
function applyTrafficRatioToBaseRemaining(baseRemainingMinutes) {
    return VoyagrGpsOrchestration.applyTrafficRatioToBaseRemaining(baseRemainingMinutes);
}
function computeBaseNavigationETAMinutes() { return VoyagrGpsOrchestration.computeBaseNavigationETAMinutes(); }
function renderTurnInfoETAPanel(baseMinutes, adjustedMinutes, progressPercent, trafficLevel, congestionPercent) {
    VoyagrGpsOrchestration.renderTurnInfoETAPanel(baseMinutes, adjustedMinutes, progressPercent, trafficLevel, congestionPercent);
}
async function refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch) {
    return VoyagrGpsOrchestration.refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch);
}
function getNavigationRemainingDistanceMeters(lat, lon) {
    return VoyagrGpsOrchestration.getNavigationRemainingDistanceMeters(lat, lon);
}
function updateNavigationFabVisibility() { VoyagrGpsOrchestration.updateNavigationFabVisibility(); }
function processNavigationHazardAlerts(lat, lon) { VoyagrGpsOrchestration.processNavigationHazardAlerts(lat, lon); }
function checkNearbyHazards(lat, lon) { VoyagrGpsOrchestration.checkNearbyHazards(lat, lon); }
function checkRouteHazardCamerasAhead(lat, lon) { VoyagrGpsOrchestration.checkRouteHazardCamerasAhead(lat, lon); }
function saveCameraAlertPreferences() { VoyagrGpsOrchestration.saveCameraAlertPreferences(); }
function loadCameraAlertPreferences() { VoyagrGpsOrchestration.loadCameraAlertPreferences(); }
function triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon) {
    return VoyagrGpsOrchestration.triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon);
}
function triggerAutomaticReroute(currentLat, currentLon) {
    return VoyagrGpsOrchestration.triggerAutomaticReroute(currentLat, currentLon);
}

// ===== VOICE ANNOUNCEMENTS ORCHESTRATION =====
// Orchestration lives in static/js/app/voice-announcements-orchestration.js (bound at file end).

function speakMessage(message, priority = 'normal') {
    return VoyagrVoiceAnnouncementsOrchestration.speakMessage(message, priority);
}

function getVoiceAnnouncementsOrchestrationRuntime() {
    return {
        voiceAnnouncements: () => _voiceAnnouncements(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
            saveAllSettings,
            applyDomSelectsFromPlan,
        },
    };
}

function saveVoicePreferences() { VoyagrVoiceAnnouncementsOrchestration.saveVoicePreferences(); }
function loadVoicePreferences() { VoyagrVoiceAnnouncementsOrchestration.loadVoicePreferences(); }
function toggleVoiceAnnouncements() { VoyagrVoiceAnnouncementsOrchestration.toggleVoiceAnnouncements(); }

// ===== FORM CLEAR ORCHESTRATION =====
// Orchestration lives in static/js/app/form-clear-orchestration.js (bound at file end).

function getFormClearOrchestrationRuntime() {
    return {
        getMap: () => map,
        getStartMarker: () => startMarker,
        getEndMarker: () => endMarker,
        getRouteLayer: () => routeLayer,
        getZoomAnimationDurationMs: () => ZOOM_ANIMATION_DURATION * 1000,
        setLastZoomLevel: (val) => VoyagrSmartZoomOrchestration.setLastZoomLevel(val),
        call: {
            clearParkingSelection,
            updateAutoGpsLocation,
        },
    };
}

function clearForm() {
    VoyagrFormClearOrchestration.clearForm();
    document.getElementById('tripInfo').classList.remove('show');
    const alongRouteBtn = document.getElementById('alongRouteSearch');
    if (alongRouteBtn) alongRouteBtn.style.display = 'none';
    hideRoadNameBar();
    clearPOIMarkers();
}

// ===== SEARCH & FAVORITES ORCHESTRATION =====
// Orchestration lives in static/js/app/search-favorites-orchestration.js (bound at file end).

function getSearchFavoritesOrchestrationRuntime() {
    return {
        favorites: () => _favorites(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        call: {
            showStatus,
            getSupabaseAccessToken,
            fetchJsonWithAuth,
            escapeHtml,
            recordRecentDestination,
            expandBottomSheet,
        },
    };
}

function addToSearchHistory(query, resultName, lat, lon) {
    VoyagrSearchFavoritesOrchestration.addToSearchHistory(query, resultName, lat, lon);
}
function loadFavorites() {
    VoyagrSearchFavoritesOrchestration.loadFavorites();
}
function editFavorite(fav) {
    VoyagrSearchFavoritesOrchestration.editFavorite(fav);
}
function deleteFavorite(fav) {
    VoyagrSearchFavoritesOrchestration.deleteFavorite(fav);
}
function addCurrentToFavorites() {
    VoyagrSearchFavoritesOrchestration.addCurrentToFavorites();
}

// ===== PHASE 2 FEATURES: LANE GUIDANCE =====
// Orchestration lives in static/js/app/lane-guidance-orchestration.js (bound at file end).

function getLaneGuidanceOrchestrationRuntime() {
    return {
        laneGuidance: () => _laneGuidance(),
        getVoiceAnnouncementsEnabled: () => VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncementsEnabled(),
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getRoutePolyline: () => routePolyline,
        call: {
            calculateDistanceMeters,
            getCurrentRoadType: (idx, mph) => VoyagrSpeedWidgetOrchestration.getCurrentRoadType(idx, mph),
            speakMessage,
        },
    };
}

function updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount) {
    return VoyagrLaneGuidanceOrchestration.updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount);
}

function renderLaneGuidanceUI(data) {
    return VoyagrLaneGuidanceOrchestration.renderLaneGuidanceUI(data);
}

// Speed widget state lives in speed-widget-orchestration.js.

// Module accessors — thin delegates to VoyagrModules (modules/voyagr-modules.js).
const _speedGps = () => VoyagrModules.speedGps();
const _hazardAlerts = () => VoyagrModules.hazardAlerts();
const _offlineNavigation = () => VoyagrModules.offlineNavigation();
const _mlPredictions = () => VoyagrModules.mlPredictions();
const _porcupineWake = () => VoyagrModules.porcupineWake();
const _batterySaving = () => VoyagrModules.batterySaving();
const _searchAutocomplete = () => VoyagrModules.searchAutocomplete();
const _deviceEnvironment = () => VoyagrModules.deviceEnvironment();
const _routeProgress = () => VoyagrModules.routeProgress();
const _settingsSnapshot = () => VoyagrModules.settingsSnapshot();
const _appState = () => VoyagrModules.appState();
const _gestureControl = () => VoyagrModules.gestureControl();
const _legacyPrefsRestore = () => VoyagrModules.legacyPrefsRestore();
const _voiceControl = () => VoyagrModules.voiceControl();
const _smartZoom = () => VoyagrModules.smartZoom();
const _phase3Features = () => VoyagrModules.phase3Features();
const _previewMarker = () => VoyagrModules.previewMarker();
const _favorites = () => VoyagrModules.favorites();
const _roadNameDisplay = () => VoyagrModules.roadNameDisplay();
const _roadReport = () => VoyagrModules.roadReport();
const _cazInfo = () => VoyagrModules.cazInfo();
const _vehicleMarker = () => VoyagrModules.vehicleMarker();
const _osmMapIcons = () => VoyagrModules.osmMapIcons();
const _mapControls = () => VoyagrModules.mapControls();
const _mapLayerToggles = () => VoyagrModules.mapLayerToggles();
const _mapOverlayToggles = () => VoyagrModules.mapOverlayToggles();
const _mapView3D = () => VoyagrModules.mapView3D();
const _mapTheme = () => VoyagrModules.mapTheme();
const _routeGeometry = () => VoyagrModules.routeGeometry();
const _eta = () => VoyagrModules.eta();
const _liveDataRefresh = () => VoyagrModules.liveDataRefresh();
const _turnInstructions = () => VoyagrModules.turnInstructions();
const _voiceAnnouncements = () => VoyagrModules.voiceAnnouncements();
const _routeSelection = () => VoyagrModules.routeSelection();
const _cameraPitch = () => VoyagrModules.cameraPitch();
const _rerouteDecision = () => VoyagrModules.rerouteDecision();
const _movementDetection = () => VoyagrModules.movementDetection();
const _domHelpers = () => VoyagrModules.domHelpers();
const _geocodingLocations = () => VoyagrModules.geocodingLocations();
const _googlePlusCodesPrefs = () => VoyagrModules.googlePlusCodesPrefs();
const _units = () => VoyagrModules.units();
const _routePrefs = () => VoyagrModules.routePrefs();
const _tripHistory = () => VoyagrModules.tripHistory();
const _toggleUI = () => VoyagrModules.toggleUI();
const _theme = () => VoyagrModules.theme();
const _html = () => VoyagrModules.html();
const _polylineCodec = () => VoyagrModules.polylineCodec();
const _waypoints = () => VoyagrModules.waypoints();
const _recentDestinations = () => VoyagrModules.recentDestinations();
const _routeTrafficFlow = () => VoyagrModules.routeTrafficFlow();
const _trafficChange = () => VoyagrModules.trafficChange();
const _routeSharing = () => VoyagrModules.routeSharing();
const _weatherLayer = () => VoyagrModules.weatherLayer();
const _navigationDestination = () => VoyagrModules.navigationDestination();
const _multimodalParking = () => VoyagrModules.multimodalParking();
const _laneGuidance = () => VoyagrModules.laneGuidance();
const _poiSearch = () => VoyagrModules.poiSearch();
const _routingRequest = () => VoyagrModules.routingRequest();
const _cameraMapMarkers = () => VoyagrModules.cameraMapMarkers();
const _hazardMapMarkers = () => VoyagrModules.hazardMapMarkers();
const _pwaInstall = () => VoyagrModules.pwaInstall();
const _bestTimeLeave = () => VoyagrModules.bestTimeLeave();
const _speedLimitWidget = () => VoyagrModules.speedLimitWidget();

// ===== SPEED WIDGET ORCHESTRATION =====
// Orchestration lives in static/js/app/speed-widget-orchestration.js (bound at file end).

function getSpeedWidgetOrchestrationRuntime() {
    return {
        speedGps: () => _speedGps(),
        speedLimitWidget: () => _speedLimitWidget(),
        routeGeometry: () => _routeGeometry(),
        toggleUI: () => _toggleUI(),
        getSpeedUnit: () => speedUnit,
        getIsTrackingActive: () => VoyagrGpsOrchestration.getIsTrackingActive(),
        getRouteInProgress: () => routeInProgress,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getIsOffline: () => VoyagrOfflineNavigationOrchestration.getIsOffline(),
        call: {
            getSpeedUnit,
            calculateDistanceMeters,
            cacheSpeedLimit,
            getCachedSpeedLimit,
            saveAllSettings,
        },
    };
}

function toggleSpeedWidget() { VoyagrSpeedWidgetOrchestration.toggleSpeedWidget(); }

// ===== MAP RECENTER ORCHESTRATION =====
// Orchestration lives in static/js/app/map-recenter-orchestration.js (bound at file end).

function getMapRecenterOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        routeGeometry: () => _routeGeometry(),
        cameraPitch: () => _cameraPitch(),
        getMap: () => map,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getRouteInProgress: () => routeInProgress,
        getIsTrackingActive: () => VoyagrGpsOrchestration.getIsTrackingActive(),
        getJourneyOverviewActive: () => VoyagrJourneyOverviewOrchestration.getJourneyOverviewActive(),
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        setZoomAndFollowEnabled: (val) => { zoomAndFollowEnabled = val; },
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        getCurrentUserMarker: () => VoyagrGpsOrchestration.getCurrentUserMarker(),
        getZoomLevels: () => ZOOM_LEVELS,
        getTurnZoomThreshold: () => TURN_ZOOM_THRESHOLD,
        call: {
            showStatus,
            getVehicleDisplayCoordinates,
            calculateDistanceMeters,
            getCurrentRoadType: (idx, mph) => VoyagrSpeedWidgetOrchestration.getCurrentRoadType(idx, mph),
            shouldTiltDrivingCamera,
            shouldUsePitchedDrivingCamera,
            exitJourneyOverviewForRecenter: () => VoyagrJourneyOverviewOrchestration.exitJourneyOverviewForRecenter(),
        },
    };
}

function toggleZoomAndFollow() { VoyagrMapRecenterOrchestration.toggleZoomAndFollow(); }
function applyZoomFollowButtonUi(btn, enabled) {
    VoyagrMapRecenterOrchestration.applyZoomFollowButtonUi(btn, enabled);
}
function updateRecenterButtonVisibility() { VoyagrMapRecenterOrchestration.updateRecenterButtonVisibility(); }
function recenterOnVehicle() { VoyagrMapRecenterOrchestration.recenterOnVehicle(); }

// ===== JOURNEY OVERVIEW ORCHESTRATION =====
// Orchestration lives in static/js/app/journey-overview-orchestration.js (bound at file end).

function getJourneyOverviewOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getRouteInProgress: () => routeInProgress,
        getRoutePolyline: () => routePolyline,
        getRouteOptions: () => VoyagrRouteComparisonOrchestration.getRouteOptions(),
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        call: {
            showStatus,
            updateRecenterButtonVisibility,
        },
    };
}

function toggleJourneyOverview() { VoyagrJourneyOverviewOrchestration.toggleJourneyOverview(); }

// ===== VEHICLE ROUTING ORCHESTRATION =====
// Orchestration lives in static/js/app/vehicle-routing-orchestration.js (bound at file end).

function getVehicleRoutingOrchestrationRuntime() {
    return {
        getVehicleIcons: () => vehicleIcons,
        getVehicleIconEmojis: () => vehicleIconEmojis,
        getCurrentVehicleType: () => currentVehicleType,
        setCurrentVehicleType: (val) => { currentVehicleType = val; },
        getCurrentRoutingMode: () => currentRoutingMode,
        setCurrentRoutingMode: (val) => { currentRoutingMode = val; },
        getCurrentUserMarker: () => VoyagrGpsOrchestration.getCurrentUserMarker(),
        setCurrentUserMarker: (val) => VoyagrGpsOrchestration.setCurrentUserMarker(val),
        setCurrentUserMarkerIcon: (val) => VoyagrGpsOrchestration.setCurrentUserMarkerIcon(val),
        getMap: () => map,
        vehicleMarker: () => _vehicleMarker(),
        getMapLibreHelpers: () => MapLibreHelpers,
        call: {
            saveAllSettings,
            showStatus,
            convertSpeed,
            getSpeedUnit,
        },
    };
}

function updateVehicleType() { VoyagrVehicleRoutingOrchestration.updateVehicleType(); }
function setRoutingMode(mode) { VoyagrVehicleRoutingOrchestration.setRoutingMode(mode); }
function createVehicleMarker(lat, lon, speed, accuracy, heading = 0) {
    return VoyagrVehicleRoutingOrchestration.createVehicleMarker(lat, lon, speed, accuracy, heading);
}

// ===== SMART ZOOM ORCHESTRATION =====
// Orchestration lives in static/js/app/smart-zoom-orchestration.js (bound at file end).

function getSmartZoomOrchestrationRuntime() {
    return {
        smartZoom: () => _smartZoom(),
        toggleUI: () => _toggleUI(),
        cameraPitch: () => _cameraPitch(),
        routeGeometry: () => _routeGeometry(),
        getSmartZoomEnabled: () => VoyagrSmartZoomOrchestration.getSmartZoomEnabled(),
        setSmartZoomEnabled: (val) => VoyagrSmartZoomOrchestration.setSmartZoomEnabled(val),
        getRouteInProgress: () => routeInProgress,
        getLastZoomLevel: () => VoyagrSmartZoomOrchestration.getLastZoomLevel(),
        setLastZoomLevel: (val) => VoyagrSmartZoomOrchestration.setLastZoomLevel(val),
        getLastTurnZoomApplied: () => VoyagrSmartZoomOrchestration.getLastTurnZoomApplied(),
        setLastTurnZoomApplied: (val) => VoyagrSmartZoomOrchestration.setLastTurnZoomApplied(val),
        getZoomLevels: () => ZOOM_LEVELS,
        getTurnZoomThreshold: () => TURN_ZOOM_THRESHOLD,
        getZoomAnimationDurationMs: () => ZOOM_ANIMATION_DURATION * 1000,
        getMap: () => map,
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        getMapFollowingActive: () => mapFollowingActive,
        getCurrentUserMarker: () => VoyagrGpsOrchestration.getCurrentUserMarker(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        call: {
            saveAllSettings,
            showStatus,
            shouldUsePitchedDrivingCamera,
            shouldTiltDrivingCamera,
        },
    };
}

function toggleSmartZoom() { VoyagrSmartZoomOrchestration.toggleSmartZoom(); }
function applySmartZoomWithAnimation(speedMph, distanceToNextTurn = null, roadType = 'urban', userLat = null, userLon = null) {
    return VoyagrSmartZoomOrchestration.applySmartZoomWithAnimation(speedMph, distanceToNextTurn, roadType, userLat, userLon);
}
function applySmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
    return VoyagrSmartZoomOrchestration.applySmartZoom(speedMph, distanceToNextTurn, roadType);
}

// ===== PHASE 3 FEATURES ORCHESTRATION =====
// Orchestration lives in static/js/app/phase3-features-orchestration.js (bound at file end).

function getPhase3FeaturesOrchestrationRuntime() {
    return {
        phase3Features: () => _phase3Features(),
        gestureControl: () => _gestureControl(),
        mapControls: () => _mapControls(),
        toggleUI: () => _toggleUI(),
        setGestureEnabled: (val) => VoyagrGestureControlOrchestration.setGestureEnabled(val),
        setGestureSensitivity: (val) => VoyagrGestureControlOrchestration.setGestureSensitivity(val),
        setGestureAction: (val) => VoyagrGestureControlOrchestration.setGestureAction(val),
        setIsAREnabled: (val) => VoyagrArNavigationOrchestration.setIsAREnabled(val),
        call: {
            updateBatteryStatus,
            loadMLPredictions,
            handleDeviceMotion,
        },
    };
}

function initPhase3Features() {
    VoyagrPhase3FeaturesOrchestration.initPhase3Features();
}

// ===== GESTURE CONTROL ORCHESTRATION =====
// Orchestration lives in static/js/app/gesture-control-orchestration.js (bound at file end).

function getGestureControlOrchestrationRuntime() {
    return {
        gestureControl: () => _gestureControl(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
            calculateRoute,
            clearForm,
        },
    };
}

function handleDeviceMotion(event) { VoyagrGestureControlOrchestration.handleDeviceMotion(event); }
function triggerGestureAction() { VoyagrGestureControlOrchestration.triggerGestureAction(); }
function toggleGestureControl() { VoyagrGestureControlOrchestration.toggleGestureControl(); }
function updateGestureSensitivity() { VoyagrGestureControlOrchestration.updateGestureSensitivity(); }
function updateGestureAction() { VoyagrGestureControlOrchestration.updateGestureAction(); }

// ===== BATTERY SAVING ORCHESTRATION =====
// Orchestration lives in static/js/app/battery-saving-orchestration.js (bound at file end).

function getBatterySavingOrchestrationRuntime() {
    return {
        batterySaving: () => _batterySaving(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
        },
    };
}

function updateBatteryStatus(battery) { VoyagrBatterySavingOrchestration.updateBatteryStatus(battery); }
function applyBatterySavingModeFromPlan(execute) {
    VoyagrBatterySavingOrchestration.applyBatterySavingModeFromPlan(execute);
}
function toggleBatterySavingMode() { VoyagrBatterySavingOrchestration.toggleBatterySavingMode(); }
function enableBatterySavingMode() { VoyagrBatterySavingOrchestration.enableBatterySavingMode(); }
function disableBatterySavingMode() { VoyagrBatterySavingOrchestration.disableBatterySavingMode(); }

// ===== MAP THEME ORCHESTRATION =====
// Orchestration lives in static/js/app/map-theme-orchestration.js (bound at file end).

function getMapThemeOrchestrationRuntime() {
    return {
        mapTheme: () => _mapTheme(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getBuildings3DEnabled: () => VoyagrMapLayersOrchestration.getBuildings3DEnabled(),
        getBuildings3DHeightMultiplier: () => VoyagrMapLayersOrchestration.getBuildings3DHeightMultiplier(),
        getBuildings3DOpacity: () => VoyagrMapLayersOrchestration.getBuildings3DOpacity(),
        call: {
            showStatus,
            saveAllSettings,
            initializeRoadLabels,
        },
    };
}

function setMapTheme(themeOrEvent) { VoyagrMapThemeOrchestration.setMapTheme(themeOrEvent); }

// ===== ML PREDICTIONS ORCHESTRATION =====
// Orchestration lives in static/js/app/ml-predictions-orchestration.js (bound at file end).

function getMlPredictionsOrchestrationRuntime() {
    return {
        mlPredictions: () => _mlPredictions(),
        toggleUI: () => _toggleUI(),
        call: {
            calculateRoute,
            showStatus,
            saveAllSettings,
        },
    };
}

function loadMLPredictions() { VoyagrMlPredictionsOrchestration.loadMLPredictions(); }
function toggleMLPredictions() { VoyagrMlPredictionsOrchestration.toggleMLPredictions(); }

// ===== MAP HINTS ORCHESTRATION =====
// Orchestration lives in static/js/app/map-hints-orchestration.js (bound at file end).

function getMapHintsOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        call: {
            syncBottomSheetOverlapFabs,
        },
    };
}

function updateRoadReportFabVisibility() {
    VoyagrMapHintsOrchestration.updateRoadReportFabVisibility();
}
function voyagrTouchHintsEnabled() {
    return VoyagrMapHintsOrchestration.voyagrTouchHintsEnabled();
}
function voyagrShowMapIconHint(message) {
    VoyagrMapHintsOrchestration.voyagrShowMapIconHint(message);
}
function openMapControlsHintModal() {
    VoyagrMapHintsOrchestration.openMapControlsHintModal();
}
function closeMapControlsHintModal() {
    VoyagrMapHintsOrchestration.closeMapControlsHintModal();
}
function initMobileMapIconHints() {
    VoyagrMapHintsOrchestration.initMobileMapIconHints();
}

// ===== ROAD REPORT ORCHESTRATION =====
// Orchestration lives in static/js/app/road-report-orchestration.js (bound at file end).

function getRoadReportOrchestrationRuntime() {
    return {
        roadReport: () => _roadReport(),
        getCurrentLat: () => (typeof currentLat !== 'undefined' ? currentLat : null),
        getCurrentLon: () => (typeof currentLon !== 'undefined' ? currentLon : null),
        call: {
            showStatus,
        },
    };
}

function openRoadReportModal() { VoyagrRoadReportOrchestration.openRoadReportModal(); }
function closeRoadReportModal() { VoyagrRoadReportOrchestration.closeRoadReportModal(); }
async function submitRoadReport() { return VoyagrRoadReportOrchestration.submitRoadReport(); }

// ===== SERVICE WORKER ORCHESTRATION =====
// Orchestration lives in static/js/app/service-worker-orchestration.js (bound at file end).

function getServiceWorkerOrchestrationRuntime() {
    return {
        pwaInstall: () => _pwaInstall(),
        getRouteInProgress: () => routeInProgress,
        call: {
            showStatus,
            saveAppState,
            scheduleAppReload,
            warmPicovoiceStaticCache,
        },
    };
}

async function safeServiceWorkerUpdate(registration, reason) {
    return VoyagrServiceWorkerOrchestration.safeServiceWorkerUpdate(registration, reason);
}

// ===== OFFLINE NAVIGATION ORCHESTRATION =====
// Orchestration lives in static/js/app/offline-navigation-orchestration.js (bound at file end).

function getOfflineNavigationOrchestrationRuntime() {
    return {
        offlineNavigation: () => _offlineNavigation(),
        speedLimitWidget: () => _speedLimitWidget(),
        routeSelection: () => _routeSelection(),
        polylineCodec: () => _polylineCodec(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getRoutePolyline: () => routePolyline,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        call: {
            showStatus,
            startTurnByTurnNavigation,
        },
    };
}

function cacheSpeedLimit(lat, lon, speedLimit, source) {
    return VoyagrOfflineNavigationOrchestration.cacheSpeedLimit(lat, lon, speedLimit, source);
}
function getCachedSpeedLimit(lat, lon) {
    return VoyagrOfflineNavigationOrchestration.getCachedSpeedLimit(lat, lon);
}
function persistActiveRoute() {
    return VoyagrOfflineNavigationOrchestration.persistActiveRoute();
}
function clearPersistedRoute() {
    return VoyagrOfflineNavigationOrchestration.clearPersistedRoute();
}
function schedulePersistRoute() {
    VoyagrOfflineNavigationOrchestration.schedulePersistRoute();
}
function precacheRouteTiles(polyline) {
    return VoyagrOfflineNavigationOrchestration.precacheRouteTiles(polyline);
}
function _tryResumeNavigation() {
    return VoyagrOfflineNavigationOrchestration.tryResumeNavigation();
}

// ===== PHASE 3: Initialize battery monitoring (bound at file end) =====

// ===== GPS TRACKING SYSTEM =====
// Variables initialized at the top level
let routeStarted = false;
let routeInProgress = false;

// ===== SCREEN WAKE LOCK (keeps screen on during navigation) =====
window.screenWakeLock = null;

// ===== TURN-BY-TURN NAVIGATION =====
let currentRouteSteps = [];
let currentStepIndex = 0;
let nextManeuverDistance = 0;
let routePolyline = null;

// ===== DRIVER'S PERSPECTIVE =====
// Preference lives in static/js/app/driver-camera-orchestration.js (bound at file end).

// ===== DRIVER CAMERA ORCHESTRATION =====
// Orchestration lives in static/js/app/driver-camera-orchestration.js (bound at file end).

function getDriverCameraOrchestrationRuntime() {
    return {
        cameraPitch: () => _cameraPitch(),
        mapView3D: () => _mapView3D(),
        toggleUI: () => _toggleUI(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        getMapFollowingActive: () => mapFollowingActive,
        getDriverPerspectiveEnabled: () => VoyagrDriverCameraOrchestration.getDriverPerspectiveEnabled(),
        setDriverPerspectiveEnabled: (val) => VoyagrDriverCameraOrchestration.setDriverPerspectiveEnabled(val),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getCurrentUserMarker: () => VoyagrGpsOrchestration.getCurrentUserMarker(),
        call: {
            showStatus,
            saveAllSettings,
            recomputeMapView3DFromGranular: () => VoyagrMapView3DOrchestration.recomputeMapView3DFromGranular(),
        },
    };
}

function isActiveNavigationFollow() { return VoyagrDriverCameraOrchestration.isActiveNavigationFollow(); }
function userPrefersFlat2D() { return VoyagrDriverCameraOrchestration.userPrefersFlat2D(); }
function decideDrivingCameraState() { return VoyagrDriverCameraOrchestration.decideDrivingCameraState(); }
function shouldUsePitchedDrivingCamera() { return VoyagrDriverCameraOrchestration.shouldUsePitchedDrivingCamera(); }
function shouldTiltDrivingCamera() { return VoyagrDriverCameraOrchestration.shouldTiltDrivingCamera(); }
function applyLiveNavigationCamera() { VoyagrDriverCameraOrchestration.applyLiveNavigationCamera(); }
function toggleDriverPerspective() { VoyagrDriverCameraOrchestration.toggleDriverPerspective(); }
function applyDriverPerspective() { VoyagrDriverCameraOrchestration.applyDriverPerspective(); }

// ===== 2D / 3D MAP VIEW (scene preset) =====
// mapView3DEnabled lives in static/js/app/map-view-3d-orchestration.js (bound at file end).

// ===== MAP VIEW 3D ORCHESTRATION =====
// Orchestration lives in static/js/app/map-view-3d-orchestration.js (bound at file end).

function getMapView3DOrchestrationRuntime() {
    return {
        mapView3D: () => _mapView3D(),
        toggleUI: () => _toggleUI(),
        getMapView3DEnabled: () => VoyagrMapView3DOrchestration.getMapView3DEnabled(),
        setMapView3DEnabled: (val) => VoyagrMapView3DOrchestration.setMapView3DEnabled(val),
        getDriverPerspectiveEnabled: () => VoyagrDriverCameraOrchestration.getDriverPerspectiveEnabled(),
        setDriverPerspectiveEnabled: (val) => VoyagrDriverCameraOrchestration.setDriverPerspectiveEnabled(val),
        getBuildings3DEnabled: () => VoyagrMapLayersOrchestration.getBuildings3DEnabled(),
        setBuildings3DEnabled: (val) => VoyagrMapLayersOrchestration.setBuildings3DEnabled(val),
        getBuildings3DHeightMultiplier: () => VoyagrMapLayersOrchestration.getBuildings3DHeightMultiplier(),
        getBuildings3DOpacity: () => VoyagrMapLayersOrchestration.getBuildings3DOpacity(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        call: {
            applyDriverPerspective,
            showStatus,
            saveAllSettings,
        },
    };
}

function syncMapView3DToggleUI() { VoyagrMapView3DOrchestration.syncMapView3DToggleUI(); }
function setMapView3D(enabled) { VoyagrMapView3DOrchestration.setMapView3D(enabled); }
function toggleMapView3D() { VoyagrMapView3DOrchestration.toggleMapView3D(); }

// ===== AR NAVIGATION ORCHESTRATION =====
// AR mode state lives in static/js/app/ar-navigation-orchestration.js (bound at file end).

function getArNavigationOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        toggleUI: () => _toggleUI(),
        turnInstructions: () => _turnInstructions(),
        getIsAREnabled: () => VoyagrArNavigationOrchestration.getIsAREnabled(),
        setIsAREnabled: (val) => VoyagrArNavigationOrchestration.setIsAREnabled(val),
        getArModeActive: () => VoyagrArNavigationOrchestration.getArModeActive(),
        setArModeActive: (val) => VoyagrArNavigationOrchestration.setArModeActive(val),
        getRouteInProgress: () => routeInProgress,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getNextManeuverDistance: () => nextManeuverDistance,
        call: {
            showStatus,
        },
    };
}

function toggleARSetting() { VoyagrArNavigationOrchestration.toggleARSetting(); }
function updateARButtonVisibility() { VoyagrArNavigationOrchestration.updateARButtonVisibility(); }
async function toggleARMode() { return VoyagrArNavigationOrchestration.toggleARMode(); }
async function stopARMode() { return VoyagrArNavigationOrchestration.stopARMode(); }
function updateARButtonState(status) { VoyagrArNavigationOrchestration.updateARButtonState(status); }
function updateARInstruction(turnInfo) { VoyagrArNavigationOrchestration.updateARInstruction(turnInfo); }

// ===== TURN INSTRUCTION WIDGET ORCHESTRATION =====
// Orchestration lives in static/js/app/turn-instruction-widget-orchestration.js (bound at file end).

function getTurnInstructionWidgetOrchestrationRuntime() {
    return {
        turnInstructions: () => _turnInstructions(),
        routeGeometry: () => _routeGeometry(),
        speedGps: () => _speedGps(),
        previewMarker: () => _previewMarker(),
        getDistanceUnit: () => distanceUnit,
        getRouteInProgress: () => routeInProgress,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        setCurrentStepIndex: (val) => { currentStepIndex = val; },
        getRoutePolyline: () => routePolyline,
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        getLastTurnDetectRouteVertexIndex: () => VoyagrNavigationLifecycleOrchestration.getLastTurnDetectRouteVertexIndex(),
        setLastTurnDetectRouteVertexIndex: (val) => VoyagrNavigationLifecycleOrchestration.setLastTurnDetectRouteVertexIndex(val),
        getMap: () => map,
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        call: {
            detectUpcomingTurn: (lat, lon) => VoyagrTurnInstructionWidgetOrchestration.detectUpcomingTurn(lat, lon),
            updateARInstruction,
            showStatus,
            schedulePersistRoute,
            getCurrentRoadDisplayName: () => VoyagrRoadNameOrchestration.getCurrentRoadDisplayName(),
            getManeuverStreetLabel: (maneuver, preferCurrentRoad) =>
                VoyagrSpeedWidgetOrchestration.getManeuverStreetLabel(maneuver, preferCurrentRoad),
        },
    };
}

function toggleInstructionsList() { VoyagrTurnInstructionWidgetOrchestration.toggleInstructionsList(); }
function showTurnInstructionWidget() { VoyagrTurnInstructionWidgetOrchestration.showTurnInstructionWidget(); }
function hideTurnInstructionWidget() { VoyagrTurnInstructionWidgetOrchestration.hideTurnInstructionWidget(); }
function updateTurnInstructionDisplay(turnInfo) {
    return VoyagrTurnInstructionWidgetOrchestration.updateTurnInstructionDisplay(turnInfo);
}
function updateThenRow(maneuverIndex, currentDistance) {
    return VoyagrTurnInstructionWidgetOrchestration.updateThenRow(maneuverIndex, currentDistance);
}
function populateInstructionsList() { VoyagrTurnInstructionWidgetOrchestration.populateInstructionsList(); }
function previewInstructionOnMap(stepIndex, shapeIndex) {
    return VoyagrTurnInstructionWidgetOrchestration.previewInstructionOnMap(stepIndex, shapeIndex);
}
function showPreviewMarker(lat, lon, label) {
    return VoyagrTurnInstructionWidgetOrchestration.showPreviewMarker(lat, lon, label);
}
function hidePreviewMarker() { VoyagrTurnInstructionWidgetOrchestration.hidePreviewMarker(); }
function updateTurnWidgetFromPosition(lat, lon, turnInfo) {
    return VoyagrTurnInstructionWidgetOrchestration.updateTurnWidgetFromPosition(lat, lon, turnInfo);
}

// ===== JOURNEY SUMMARY BAR =====
function hasUserStartedMoving() { return VoyagrJourneySummaryOrchestration.hasUserStartedMoving(); }
function showJourneySummaryBar() { VoyagrJourneySummaryOrchestration.showJourneySummaryBar(); }
function hideJourneySummaryBar() { VoyagrJourneySummaryOrchestration.hideJourneySummaryBar(); }
function startJourneySummaryUpdates() { VoyagrJourneySummaryOrchestration.startJourneySummaryUpdates(); }
function updateJourneySummaryBar() { VoyagrJourneySummaryOrchestration.updateJourneySummaryBar(); }

// ===== PWA AUTO-RELOAD SYSTEM (PHASE 2) =====
// updatePending lives in service-worker-orchestration.js.

// ===== BATTERY-AWARE REFRESH (PHASE 3) =====

// ===== VOICE CONTROL ORCHESTRATION =====
// Orchestration lives in static/js/app/voice-control-orchestration.js (bound at file end).

function getVoiceControlOrchestrationRuntime() {
    return {
        voiceControl: () => _voiceControl(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getRouteInProgress: () => routeInProgress,
        call: {
            maybeResumePorcupineWakeAfterVoice,
            stopPorcupineWakePipeline,
            calculateRoute,
            showStatus,
            speakMessage,
            triggerAutomaticReroute,
        },
    };
}

function initVoiceRecognition() { return VoyagrVoiceControlOrchestration.initVoiceRecognition(); }
function toggleVoiceInput() { return VoyagrVoiceControlOrchestration.toggleVoiceInput(); }
function speakText(text) { VoyagrVoiceControlOrchestration.speakText(text); }
function setupVoiceCommandProcessing() { VoyagrVoiceControlOrchestration.setupVoiceCommandProcessing(); }
function processVoiceCommand(command) { VoyagrVoiceControlOrchestration.processVoiceCommand(command); }
function handleVoiceAction(data) { VoyagrVoiceControlOrchestration.handleVoiceAction(data); }

let currentLat = 51.5074;
let currentLon = -0.1278;

// ===== VEHICLE TYPE & ROUTING MODE =====
let currentVehicleType = 'petrol_diesel';
let currentRoutingMode = 'auto';

// Vehicle icon mapping - now using custom SVG icons
const vehicleIcons = {
    'petrol_diesel': '/static/images/vehicles/car-aerial.svg',
    'electric': '/static/images/vehicles/electric-aerial.svg',
    'motorcycle': '/static/images/vehicles/motorcycle-aerial.svg',
    'truck': '/static/images/vehicles/truck-aerial.svg',
    'van': '/static/images/vehicles/van-aerial.svg',
    'bicycle': '/static/images/vehicles/bicycle-aerial.svg',
    'pedestrian': '/static/images/vehicles/pedestrian-aerial.svg'
};

// Vehicle icon emoji mapping (for display purposes only)
const vehicleIconEmojis = {
    'petrol_diesel': '🚗',
    'electric': '⚡',
    'motorcycle': '🏍️',
    'truck': '🚚',
    'van': '🚐',
    'bicycle': '🚴',
    'pedestrian': '🚶'
};

// Variables initialized at the top level
const ZOOM_LEVELS = {
    'motorway_high_speed': 14,      // > 100 km/h
    'main_road_medium_speed': 15,   // 50-100 km/h
    'urban_low_speed': 16,          // 20-50 km/h
    'parking_very_low_speed': 17,   // < 20 km/h
    'turn_ahead': 18                 // Upcoming turn
};
const TURN_ZOOM_THRESHOLD = 500;    // Zoom in when within 500m of turn
const ZOOM_ANIMATION_DURATION = 0.5; // 500ms smooth animation

// ===== MAP EXPLORE ORCHESTRATION =====
// Orchestration lives in static/js/app/map-explore-orchestration.js (bound at file end).

function getMapExploreOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getIsTrackingActive: () => VoyagrGpsOrchestration.getIsTrackingActive(),
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        setZoomAndFollowEnabled: (val) => { zoomAndFollowEnabled = val; },
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        getCurrentLat: () => currentLat,
        setCurrentLat: (val) => { currentLat = val; },
        getCurrentLon: () => currentLon,
        setCurrentLon: (val) => { currentLon = val; },
        call: {
            updateRecenterButtonVisibility,
        },
    };
}

function setupMapMoveHandler() {
    VoyagrMapExploreOrchestration.setupMapMoveHandler();
}

function setupMapExploreHandlers() {
    VoyagrMapExploreOrchestration.setupMapExploreHandlers();
}

// Navigation session state lives in navigation-lifecycle-orchestration.js.

// ETA announcement state lives in live-data-refresh-orchestration.js.

/** Live nav ETA + traffic snapshot (updated during navigation). */
window.navETASnapshot = _eta().createEmptyNavETASnapshot();

/** First-time default: traffic-aware ETA on; only explicit 'false' disables. */

// ===== LIVE DATA REFRESH ORCHESTRATION =====
// Orchestration lives in static/js/app/live-data-refresh-orchestration.js (bound at file end).

function getLiveDataRefreshOrchestrationRuntime() {
    return {
        liveDataRefresh: () => _liveDataRefresh(),
        eta: () => _eta(),
        getRouteInProgress: () => routeInProgress,
        getCurrentBatteryLevel: () => VoyagrBatteryMonitoringOrchestration.getCurrentBatteryLevel(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        getRoutePolyline: () => routePolyline,
        getCurrentRoutingMode: () => currentRoutingMode,
        getVoiceAnnouncementsEnabled: () => VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncementsEnabled(),
        call: {
            sendNotification,
            speakMessage,
            processNavigationHazardAlerts,
            computeBaseNavigationETAMinutes,
            applyTrafficRatioToBaseRemaining,
            renderTurnInfoETAPanel,
            refreshNavTrafficETAIfDue,
            hasUserStartedMoving,
        },
    };
}

function startLiveDataRefresh() { VoyagrLiveDataRefreshOrchestration.startLiveDataRefresh(); }
function stopLiveDataRefresh() { VoyagrLiveDataRefreshOrchestration.stopLiveDataRefresh(); }
function refreshTrafficData() { VoyagrLiveDataRefreshOrchestration.refreshTrafficData(); }
async function updateETACalculation() { return VoyagrLiveDataRefreshOrchestration.updateETACalculation(); }
function announceETAIfNeeded() { VoyagrLiveDataRefreshOrchestration.announceETAIfNeeded(); }
async function speakInitialETAAnnouncement() {
    return VoyagrLiveDataRefreshOrchestration.speakInitialETAAnnouncement();
}
function scheduleInitialETAAnnouncement() {
    VoyagrLiveDataRefreshOrchestration.scheduleInitialETAAnnouncement();
}
function clearInitialETAAnnouncement() { VoyagrLiveDataRefreshOrchestration.clearInitialETAAnnouncement(); }
function refreshWeatherData() { VoyagrLiveDataRefreshOrchestration.refreshWeatherData(); }

// ===== PWA LIFECYCLE ORCHESTRATION =====
// Orchestration lives in static/js/app/pwa-lifecycle-orchestration.js (bound at file end).

function getPwaLifecycleOrchestrationRuntime() {
    return {
        pwaInstall: () => _pwaInstall(),
        appState: () => _appState(),
        getBottomSheetExpanded: () => VoyagrBottomSheetOrchestration.getBottomSheetIsExpanded(),
        call: {
            showStatus,
            safeServiceWorkerUpdate,
            switchTab,
            expandBottomSheet,
            collapseBottomSheet,
            isAvoidTollsEnabled,
            getCurrentVisibleTab,
        },
    };
}

function scheduleAppReload(reason, delayMs) {
    return VoyagrPwaLifecycleOrchestration.scheduleAppReload(reason, delayMs);
}
function scheduleMapRepaintAfterUiChange() {
    VoyagrPwaLifecycleOrchestration.scheduleMapRepaintAfterUiChange();
}
function restoreUiStateAfterReload() {
    VoyagrPwaLifecycleOrchestration.restoreUiStateAfterReload();
}
function saveAppState() {
    VoyagrPwaLifecycleOrchestration.saveAppState();
}
function restoreAppState() {
    VoyagrPwaLifecycleOrchestration.restoreAppState();
}
function refreshApp() {
    VoyagrPwaLifecycleOrchestration.refreshApp();
}
async function checkForUpdates() {
    return VoyagrPwaLifecycleOrchestration.checkForUpdates();
}
function displayPWAVersion() {
    VoyagrPwaLifecycleOrchestration.displayPWAVersion();
}

// ===== PHASE 3: BATTERY-AWARE REFRESH INTERVALS =====
/**
 * getAdaptiveRefreshInterval function
 * @function getAdaptiveRefreshInterval
 * @param {*} baseInterval - Parameter description
 * @returns {*} Return value description
 */
function getAdaptiveRefreshInterval(baseInterval) {
    return VoyagrLiveDataRefreshOrchestration.getAdaptiveRefreshInterval(baseInterval);
}

// ===== BATTERY MONITORING ORCHESTRATION =====
// Orchestration lives in static/js/app/battery-monitoring-orchestration.js (bound at file end).

function getBatteryMonitoringOrchestrationRuntime() {
    return {
        getRouteInProgress: () => routeInProgress,
        call: {
            sendNotification,
        },
    };
}

function initBatteryMonitoring() {
    VoyagrBatteryMonitoringOrchestration.initBatteryMonitoring();
}

// ===== LOCATION ORCHESTRATION =====
// Orchestration lives in static/js/app/location-orchestration.js (bound at file end).

function getLocationOrchestrationRuntime() {
    return {
        domHelpers: () => _domHelpers(),
        getMap: () => map,
        getMapLibreHelpers: () => MapLibreHelpers,
        getStartMarker: () => startMarker,
        setStartMarker: (val) => { startMarker = val; },
        getEndMarker: () => endMarker,
        getRouteLayer: () => routeLayer,
        getCurrentLat: () => currentLat,
        setCurrentLat: (val) => { currentLat = val; },
        getCurrentLon: () => currentLon,
        setCurrentLon: (val) => { currentLon = val; },
        getZoomAnimationDuration: () => ZOOM_ANIMATION_DURATION,
        call: {
            showStatus,
            calculateRoute,
        },
    };
}

function getCurrentLocation() { VoyagrLocationOrchestration.getCurrentLocation(); }
function setCurrentLocation(field) { VoyagrLocationOrchestration.setCurrentLocation(field); }
function swapStartAndDestination() { VoyagrLocationOrchestration.swapStartAndDestination(); }

// ===== AUTO GPS ORCHESTRATION =====
// Orchestration lives in static/js/app/auto-gps-orchestration.js (bound at file end).

function getAutoGpsOrchestrationRuntime() {
    return {
        setCurrentLat: (val) => { currentLat = val; },
        setCurrentLon: (val) => { currentLon = val; },
        call: {
            showStatus,
            calculateDistanceMeters,
        },
    };
}

function toggleAutoGpsLocation() { VoyagrAutoGpsOrchestration.toggleAutoGpsLocation(); }
function startAutoGpsLocation() { VoyagrAutoGpsOrchestration.startAutoGpsLocation(); }
function stopAutoGpsLocation() { VoyagrAutoGpsOrchestration.stopAutoGpsLocation(); }
function updateAutoGpsLocation() { VoyagrAutoGpsOrchestration.updateAutoGpsLocation(); }

// ===== GEOCODING ORCHESTRATION =====
// Orchestration lives in static/js/app/geocoding-orchestration.js (bound at file end).

function escapeHtml(s) {
    return VoyagrGeocodingOrchestration.escapeHtml(s);
}

function getGeocodingOrchestrationRuntime() {
    return {
        html: () => _html(),
        geocodingLocations: () => _geocodingLocations(),
        searchAutocomplete: () => _searchAutocomplete(),
        getAutoGpsEnabled: () => VoyagrAutoGpsOrchestration.getAutoGpsEnabled(),
        g: (key) => {
            switch (key) {
            case 'mapPickerMode': return VoyagrGeocodingOrchestration.getMapPickerMode();
            case 'isGeocoding': return VoyagrGeocodingOrchestration.getIsGeocoding();
            default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'mapPickerMode': VoyagrGeocodingOrchestration.setMapPickerMode(val); break;
            case 'isGeocoding': VoyagrGeocodingOrchestration.setIsGeocoding(val); break;
            default: break;
            }
        },
        call: {
            showStatus,
            collapseBottomSheet,
            addViaPoint,
            addStop,
            recordRecentDestination,
            fetchJsonWithAuth,
            loadRecentDestinations,
            escapeHtml,
        },
    };
}

function initGeocodeCache() { VoyagrGeocodingOrchestration.initGeocodeCache(); }
async function showAutocomplete(fieldId) { return VoyagrGeocodingOrchestration.showAutocomplete(fieldId); }
async function geocodeAddress(address) { return VoyagrGeocodingOrchestration.geocodeAddress(address); }
async function geocodeLocations(startAddress, endAddress) {
    return VoyagrGeocodingOrchestration.geocodeLocations(startAddress, endAddress);
}
function pickLocationFromMap(field) { VoyagrGeocodingOrchestration.pickLocationFromMap(field); }
function getAutocompleteDropdown(fieldId) { return VoyagrGeocodingOrchestration.getAutocompleteDropdown(fieldId); }

// ===== NAVIGATION LIFECYCLE ORCHESTRATION =====
// Orchestration lives in static/js/app/navigation-lifecycle-orchestration.js (bound at file end).

function getNavigationLifecycleOrchestrationRuntime() {
    return {
        mapControls: () => _mapControls(),
        routeSelection: () => _routeSelection(),
        routeGeometry: () => _routeGeometry(),
        turnInstructions: () => _turnInstructions(),
        eta: () => _eta(),
        toggleUI: () => _toggleUI(),
        deviceEnvironment: () => _deviceEnvironment(),
        getRouteOptions: () => VoyagrRouteComparisonOrchestration.getRouteOptions(),
        getSelectedRouteIndex: () => VoyagrRouteComparisonOrchestration.getSelectedRouteIndex(),
        getRouteInProgress: () => routeInProgress,
        setRouteInProgress: (val) => { routeInProgress = val; },
        getRouteJoinConfirmedForDeviation: () => VoyagrRerouteMapOrchestration.getRouteJoinConfirmedForDeviation(),
        setRouteJoinConfirmedForDeviation: (val) => VoyagrRerouteMapOrchestration.setRouteJoinConfirmedForDeviation(val),
        getCurrentStepIndex: () => currentStepIndex,
        setCurrentStepIndex: (val) => { currentStepIndex = val; },
        getCurrentRouteSteps: () => currentRouteSteps,
        setCurrentRouteSteps: (val) => { currentRouteSteps = val; },
        getRoutePolyline: () => routePolyline,
        setRoutePolyline: (val) => { routePolyline = val; },
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        setLastSnappedRouteIndex: (val) => { lastSnappedRouteIndex = val; },
        getLastTurnDetectRouteVertexIndex: () => VoyagrNavigationLifecycleOrchestration.getLastTurnDetectRouteVertexIndex(),
        setLastTurnDetectRouteVertexIndex: (val) => VoyagrNavigationLifecycleOrchestration.setLastTurnDetectRouteVertexIndex(val),
        getMap: () => map,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getIsTrackingActive: () => VoyagrGpsOrchestration.getIsTrackingActive(),
        getZoomAndFollowEnabled: () => zoomAndFollowEnabled,
        getMapFollowingActive: () => mapFollowingActive,
        setMapFollowingActive: (val) => { mapFollowingActive = val; },
        getJourneyOverviewActive: () => VoyagrJourneyOverviewOrchestration.getJourneyOverviewActive(),
        setJourneyOverviewActive: (val) => VoyagrJourneyOverviewOrchestration.setJourneyOverviewActive(val),
        getSavedMapState: () => VoyagrJourneyOverviewOrchestration.getSavedMapState(),
        setSavedMapState: (val) => VoyagrJourneyOverviewOrchestration.setSavedMapState(val),
        getArModeActive: () => VoyagrArNavigationOrchestration.getArModeActive(),
        getDriverPerspectiveEnabled: () => VoyagrDriverCameraOrchestration.getDriverPerspectiveEnabled(),
        getUpdatePending: () => VoyagrServiceWorkerOrchestration.getUpdatePending(),
        setNavTraveledMeters: (val) => VoyagrNavigationLifecycleOrchestration.setNavTraveledMeters(val),
        setNavOdometerLastGeo: (val) => VoyagrNavigationLifecycleOrchestration.setNavOdometerLastGeo(val),
        setNavStartedAt: (val) => VoyagrNavigationLifecycleOrchestration.setNavStartedAt(val),
        setLastETAAnnouncementTime: (val) => VoyagrLiveDataRefreshOrchestration.setLastETAAnnouncementTime(val),
        setLastAnnouncedETA: (val) => VoyagrLiveDataRefreshOrchestration.setLastAnnouncedETA(val),
        setLastNavTrafficFetchAt: (val) => VoyagrLiveDataRefreshOrchestration.setLastNavTrafficFetchAt(val),
        setInitialETAMovementRetries: (val) => VoyagrLiveDataRefreshOrchestration.setInitialETAMovementRetries(val),
        call: {
            resetVoiceAnnouncementStateForNewRoute,
            resetVehicleMarkerDisplayState,
            resetNavigationArrivalState,
            decodePolyline,
            persistActiveRoute,
            precacheRouteTiles,
            primeVehicleMarkerOnRoute,
            showStatus,
            applyZoomFollowButtonUi,
            updateRoadReportFabVisibility,
            updateRecenterButtonVisibility,
            updateSpeedWidgetVisibility: () => VoyagrSpeedWidgetOrchestration.updateSpeedWidgetVisibility(),
            startGPSTracking,
            applyLiveNavigationCamera,
            startLiveDataRefresh,
            updateETACalculation,
            scheduleInitialETAAnnouncement,
            startAutoTrafficUpdates,
            startRouteTrafficUpdates,
            showTurnInstructionWidget,
            updateTurnWidgetFromPosition,
            updateTurnInstructionDisplay,
            showJourneySummaryBar,
            updateNavigationFabVisibility,
            voyagrShowMapIconHint,
            sendNotification,
            speakMessage,
            showVolumeHintForNavigation,
            clearRerouteFailureRetries,
            clearPersistedRoute,
            stopGPSTracking,
            hideRoadNameBar,
            stopLiveDataRefresh,
            clearInitialETAAnnouncement,
            stopAutoTrafficUpdates,
            stopRouteTrafficUpdates,
            hideTurnInstructionWidget,
            hideJourneySummaryBar,
            stopARMode,
            applyDriverPerspective,
            saveAppState,
            buildTraveledJourneyRoute,
            persistCompletedTrip,
            showJourneySummary,
            getTrafficSettingsSnapshot: () => VoyagrTrafficOrchestration.getTrafficSettingsSnapshot(),
            shouldUsePitchedDrivingCamera,
            convertDistance,
            getDistanceUnit,
        },
    };
}

function startTurnByTurnNavigation(routeData, navStartOpts = null) {
    return VoyagrNavigationLifecycleOrchestration.startTurnByTurnNavigation(routeData, navStartOpts);
}
function stopTurnByTurnNavigation() {
    return VoyagrNavigationLifecycleOrchestration.stopTurnByTurnNavigation();
}
function updateTurnGuidance(userLat, userLon) {
    return VoyagrNavigationLifecycleOrchestration.updateTurnGuidance(userLat, userLon);
}

// ===== POI SEARCH ORCHESTRATION =====
// Orchestration lives in static/js/app/poi-search-orchestration.js (bound at file end).

function getPoiSearchOrchestrationRuntime() {
    return {
        poiSearch: () => _poiSearch(),
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getRoutePolyline: () => routePolyline,
        s: (key, val) => {
            if (key === 'currentLat') currentLat = val;
            else if (key === 'currentLon') currentLon = val;
        },
        call: {
            showStatus,
            calculateRoute,
            formatPoiDistance: (distanceM) => _units().formatPoiDistanceMeters(distanceM, distanceUnit),
        },
    };
}

function quickSearch(type) { VoyagrPoiSearchOrchestration.quickSearch(type); }
function displayPOIResults(results, type, userLat, userLon) {
    VoyagrPoiSearchOrchestration.displayPOIResults(results, type, userLat, userLon);
}
function closePOIModal() { VoyagrPoiSearchOrchestration.closePOIModal(); }
function selectPOI(poiLat, poiLon, poiName, userLat, userLon) {
    VoyagrPoiSearchOrchestration.selectPOI(poiLat, poiLon, poiName, userLat, userLon);
}
function searchAlongRoute() { VoyagrPoiSearchOrchestration.searchAlongRoute(); }
function searchAlongRouteByType(type) { VoyagrPoiSearchOrchestration.searchAlongRouteByType(type); }
function clearPOIMarkers() { VoyagrPoiSearchOrchestration.clearPOIMarkers(); }

// ===== ROUTE AVOIDANCE ORCHESTRATION =====
// Orchestration lives in static/js/app/route-avoidance-orchestration.js (bound at file end).

function getRouteAvoidanceOrchestrationRuntime() {
    return {
        routePrefs: () => _routePrefs(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
            saveAllSettings,
        },
    };
}

function toggleAvoidancePreference(pref) {
    VoyagrRouteAvoidanceOrchestration.toggleAvoidancePreference(pref);
}
function loadAvoidancePreferences() {
    VoyagrRouteAvoidanceOrchestration.loadAvoidancePreferences();
}
function togglePreference(pref) {
    VoyagrRouteAvoidanceOrchestration.togglePreference(pref);
}

// ===== ROAD NAME ORCHESTRATION =====
// Orchestration lives in static/js/app/road-name-orchestration.js (bound at file end).

function getRoadNameOrchestrationRuntime() {
    return {
        roadNameDisplay: () => _roadNameDisplay(),
        call: {
            calculateDistanceMeters,
        },
    };
}

function fetchRoadNameThrottled(lat, lon) {
    VoyagrRoadNameOrchestration.fetchRoadNameThrottled(lat, lon);
}
function hideRoadNameBar() {
    VoyagrRoadNameOrchestration.hideRoadNameBar();
}

// ===== BEST TIME TO LEAVE ORCHESTRATION =====
// Orchestration lives in static/js/app/best-time-leave-orchestration.js (bound at file end).

function getBestTimeLeaveOrchestrationRuntime() {
    return {
        bestTimeLeave: () => _bestTimeLeave(),
        call: {
            showStatus,
        },
    };
}

function analysebestTimeToLeave() {
    VoyagrBestTimeLeaveOrchestration.analysebestTimeToLeave();
}
function applyBestDepartureTime(timeStr) {
    VoyagrBestTimeLeaveOrchestration.applyBestDepartureTime(timeStr);
}

// ===== NOTIFICATIONS ORCHESTRATION =====
// Orchestration lives in static/js/app/notifications-orchestration.js (bound at file end).

function getNotificationsOrchestrationRuntime() {
    return {
        deviceEnvironment: () => _deviceEnvironment(),
        getVoiceAnnouncementsEnabled: () => VoyagrVoiceAnnouncementsOrchestration.getVoiceAnnouncementsEnabled(),
        getRouteInProgress: () => routeInProgress,
        getNavigationArrivalTriggered: () => VoyagrNavigationLifecycleOrchestration.getNavigationArrivalTriggered(),
        s: (key, val) => {
            if (key === 'navigationArrivalTriggered') VoyagrNavigationLifecycleOrchestration.setNavigationArrivalTriggered(val);
        },
        call: {
            speakMessage,
            stopTurnByTurnNavigation,
        },
    };
}

function sendNotification(title, message, type) {
    return VoyagrNotificationsOrchestration.sendNotification(title, message, type);
}
function showInAppNotification(title, message, type, durationMs) {
    return VoyagrNotificationsOrchestration.showInAppNotification(title, message, type, durationMs);
}
function sendEnvironmentHint(channel, title, message, type) {
    return VoyagrNotificationsOrchestration.sendEnvironmentHint(channel, title, message, type);
}
function initDeviceEnvironmentNotifications() {
    VoyagrNotificationsOrchestration.initDeviceEnvironmentNotifications();
}
function showVolumeHintForNavigation() {
    VoyagrNotificationsOrchestration.showVolumeHintForNavigation();
}
function sendETANotification(eta, distance) {
    VoyagrNotificationsOrchestration.sendETANotification(eta, distance);
}
function sendArrivalNotification() {
    VoyagrNotificationsOrchestration.sendArrivalNotification();
}
// ===== HAZARD PREFERENCES ORCHESTRATION =====
// Orchestration lives in static/js/app/hazard-preferences-orchestration.js (bound at file end).

function getHazardPreferencesOrchestrationRuntime() {
    return {
        hazardAlerts: () => _hazardAlerts(),
        toggleUI: () => _toggleUI(),
        call: {
            showStatus,
            saveAllSettings,
        },
    };
}

async function loadHazardCameraTogglesFromApi() {
    return VoyagrHazardPreferencesOrchestration.loadHazardCameraTogglesFromApi();
}
async function toggleHazardPreferenceApi(hazardType, ev) {
    return VoyagrHazardPreferencesOrchestration.toggleHazardPreferenceApi(hazardType, ev);
}

window.toggleHazardPreferenceApi = toggleHazardPreferenceApi;
window.loadHazardCameraTogglesFromApi = loadHazardCameraTogglesFromApi;

// ===== PREFERENCE FUNCTIONS =====
function getLegacyPreferencesOrchestrationRuntime() {
    return {
        routePrefs: () => _routePrefs(),
        toggleUI: () => _toggleUI(),
        gestureControl: () => _gestureControl(),
        legacyPrefsRestore: () => _legacyPrefsRestore(),
        batterySaving: () => _batterySaving(),
        setGestureEnabled: (val) => VoyagrGestureControlOrchestration.setGestureEnabled(val),
        setAutoGpsEnabled: (val) => VoyagrAutoGpsOrchestration.setAutoGpsEnabled(val),
        call: {
            loadHazardCameraTogglesFromApi,
            handleDeviceMotion,
            startAutoGpsLocation,
            applyBatterySavingModeFromPlan,
            applySpeedWidgetToggleUi: () => VoyagrSpeedWidgetOrchestration.applySpeedWidgetToggleUi(),
        },
    };
}

function loadPreferences() {
    VoyagrLegacyPreferencesOrchestration.loadPreferences();
}

// ===== PAGE INIT ORCHESTRATION =====
// Orchestration lives in static/js/app/page-init-orchestration.js (bound at file end).

function getPageInitOrchestrationRuntime() {
    return {
        porcupineWake: () => _porcupineWake(),
        deviceEnvironment: () => _deviceEnvironment(),
        getMap: () => map,
        getCurrentVehicleType: () => currentVehicleType,
        getCurrentRoutingMode: () => currentRoutingMode,
        getSmartZoomEnabled: () => VoyagrSmartZoomOrchestration.getSmartZoomEnabled(),
        call: {
            initVoiceRecognition,
            setupVoiceCommandProcessing,
            initGeocodeCache,
            ensureDefaultTrafficAwareRouting,
            loadAllSettings,
            applySettingsToUI,
            loadParkingPreferences,
            loadVoicePreferences,
            loadPorcupineWakeUi,
            picovoiceClientConfigured,
            startPorcupineWakePipeline,
            loadPreferences,
            initTrafficLayer,
            initWeatherLayer,
            initializeRoadLabels,
            loadFavorites,
            initPhase3Features,
            restoreAppState,
            initSupabaseAuth,
            tryResumeNavigation: _tryResumeNavigation,
            initDeviceEnvironmentNotifications,
            showVolumeHintForNavigation,
            initMobilePwaOnPageLoad: () => VoyagrMobilePwaOrchestration.initOnPageLoad(),
        },
    };
}

// ===== MOBILE PWA ORCHESTRATION =====
// Orchestration lives in static/js/app/mobile-pwa-orchestration.js (bound at file end).

function getMobilePwaOrchestrationRuntime() {
    return {
        pwaInstall: () => _pwaInstall(),
        domHelpers: () => _domHelpers(),
        getMap: () => map,
        getIsTrackingActive: () => VoyagrGpsOrchestration.getIsTrackingActive(),
        getGpsWatchId: () => VoyagrGpsOrchestration.getGpsWatchId(),
        call: {
            collapseBottomSheet,
            startGPSTracking,
        },
    };
}

// ===== JOURNEY SUMMARY & SETTINGS CONSOLIDATION =====
function getJourneySummaryOrchestrationRuntime() {
    return {
        eta: () => _eta(),
        routeGeometry: () => _routeGeometry(),
        movementDetection: () => _movementDetection(),
        units: () => _units(),
        getTrackingHistory: () => VoyagrGpsOrchestration.getTrackingHistory(),
        getRouteInProgress: () => routeInProgress,
        getRoutePolyline: () => routePolyline,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getLastSnappedRouteIndex: () => lastSnappedRouteIndex,
        getDistanceUnit: () => distanceUnit,
        getNavTraveledMeters: () => VoyagrNavigationLifecycleOrchestration.getNavTraveledMeters(),
        getNavStartedAt: () => VoyagrNavigationLifecycleOrchestration.getNavStartedAt(),
        call: {
            applyTrafficRatioToBaseRemaining,
            convertDistance,
            getDistanceUnit,
            convertSpeed,
            getSpeedUnit,
            getCurrencySymbol,
            adjustCostForUnits,
            expandBottomSheet,
            switchTab,
            clearForm,
        },
    };
}

function buildTraveledJourneyRoute(route) {
    return VoyagrJourneySummaryOrchestration.buildTraveledJourneyRoute(route);
}
function showJourneySummary(routeData) {
    VoyagrJourneySummaryOrchestration.showJourneySummary(routeData);
}
function closeJourneySummary() {
    VoyagrJourneySummaryOrchestration.closeJourneySummary();
}

VoyagrParkingOrchestration.bind(getParkingOrchestrationRuntime());
VoyagrRerouteMapOrchestration.bind(getRerouteMapOrchestrationRuntime());
VoyagrTrafficOrchestration.bind(getTrafficOrchestrationRuntime());
VoyagrPorcupineOrchestration.bind(getPorcupineOrchestrationRuntime());
VoyagrGpsOrchestration.bind(getGpsOrchestrationRuntime());
VoyagrGpsOrchestration.initializeGpsModuleState();
VoyagrLiveDataRefreshOrchestration.bind(getLiveDataRefreshOrchestrationRuntime());
VoyagrTripHistoryOrchestration.bind(getTripHistoryOrchestrationRuntime());
VoyagrRouteSavingOrchestration.bind(getRouteSavingOrchestrationRuntime());
VoyagrGeocodingOrchestration.bind(getGeocodingOrchestrationRuntime());
VoyagrSpeedWidgetOrchestration.bind(getSpeedWidgetOrchestrationRuntime());
VoyagrWaypointsOrchestration.bind(getWaypointsOrchestrationRuntime());
VoyagrRouteSharingOrchestration.bind(getRouteSharingOrchestrationRuntime());
VoyagrNotificationsOrchestration.bind(getNotificationsOrchestrationRuntime());
VoyagrRoutePreferencesOrchestration.bind(getRoutePreferencesOrchestrationRuntime());
VoyagrOfflineNavigationOrchestration.bind(getOfflineNavigationOrchestrationRuntime());
VoyagrSearchFavoritesOrchestration.bind(getSearchFavoritesOrchestrationRuntime());
VoyagrPoiSearchOrchestration.bind(getPoiSearchOrchestrationRuntime());
VoyagrBestTimeLeaveOrchestration.bind(getBestTimeLeaveOrchestrationRuntime());
VoyagrCazOrchestration.bind(getCazOrchestrationRuntime());
VoyagrRouteAvoidanceOrchestration.bind(getRouteAvoidanceOrchestrationRuntime());
VoyagrRoadNameOrchestration.bind(getRoadNameOrchestrationRuntime());
VoyagrMobilePwaOrchestration.bind(getMobilePwaOrchestrationRuntime());
VoyagrHazardPreferencesOrchestration.bind(getHazardPreferencesOrchestrationRuntime());
VoyagrBottomSheetOrchestration.bind(getBottomSheetOrchestrationRuntime());
VoyagrSupabaseAuthOrchestration.bind(getSupabaseAuthOrchestrationRuntime());
VoyagrProfileStoreOrchestration.bind(getProfileStoreOrchestrationRuntime());
VoyagrSettingsOrchestration.bind(getSettingsOrchestrationRuntime());
VoyagrVoiceAnnouncementsOrchestration.bind(getVoiceAnnouncementsOrchestrationRuntime());
VoyagrVoiceControlOrchestration.bind(getVoiceControlOrchestrationRuntime());
VoyagrMapExploreOrchestration.bind(getMapExploreOrchestrationRuntime());
VoyagrBatteryMonitoringOrchestration.bind(getBatteryMonitoringOrchestrationRuntime());
VoyagrPhase3FeaturesOrchestration.bind(getPhase3FeaturesOrchestrationRuntime());
VoyagrGestureControlOrchestration.bind(getGestureControlOrchestrationRuntime());
VoyagrBatterySavingOrchestration.bind(getBatterySavingOrchestrationRuntime());
VoyagrUnitsPreferencesOrchestration.bind(getUnitsPreferencesOrchestrationRuntime());
VoyagrSmartZoomOrchestration.bind(getSmartZoomOrchestrationRuntime());
VoyagrMapThemeOrchestration.bind(getMapThemeOrchestrationRuntime());
VoyagrFormClearOrchestration.bind(getFormClearOrchestrationRuntime());
VoyagrMapHintsOrchestration.bind(getMapHintsOrchestrationRuntime());
VoyagrDarkModeOrchestration.bind(getDarkModeOrchestrationRuntime());
VoyagrRoadReportOrchestration.bind(getRoadReportOrchestrationRuntime());
VoyagrRecentDestinationsOrchestration.bind(getRecentDestinationsOrchestrationRuntime());
VoyagrMapView3DOrchestration.bind(getMapView3DOrchestrationRuntime());
VoyagrArNavigationOrchestration.bind(getArNavigationOrchestrationRuntime());
VoyagrTurnInstructionWidgetOrchestration.bind(getTurnInstructionWidgetOrchestrationRuntime());
VoyagrLaneGuidanceOrchestration.bind(getLaneGuidanceOrchestrationRuntime());
VoyagrNavigationLifecycleOrchestration.bind(getNavigationLifecycleOrchestrationRuntime());
VoyagrTabNavigationOrchestration.bind(getTabNavigationOrchestrationRuntime());
VoyagrDriverCameraOrchestration.bind(getDriverCameraOrchestrationRuntime());
VoyagrPwaLifecycleOrchestration.bind(getPwaLifecycleOrchestrationRuntime());
VoyagrServiceWorkerOrchestration.bind(getServiceWorkerOrchestrationRuntime());
VoyagrMlPredictionsOrchestration.bind(getMlPredictionsOrchestrationRuntime());
VoyagrVehicleRoutingOrchestration.bind(getVehicleRoutingOrchestrationRuntime());
VoyagrAutoGpsOrchestration.bind(getAutoGpsOrchestrationRuntime());
VoyagrLocationOrchestration.bind(getLocationOrchestrationRuntime());
VoyagrPageInitOrchestration.bind(getPageInitOrchestrationRuntime());
VoyagrPageInitOrchestration.registerPageLifecycleListeners();
VoyagrRoutePreviewOrchestration.bind(getRoutePreviewOrchestrationRuntime());
VoyagrLegacyPreferencesOrchestration.bind(getLegacyPreferencesOrchestrationRuntime());
VoyagrMapLayersOrchestration.bind(getMapLayersOrchestrationRuntime());
VoyagrMapOverlayOrchestration.bind(getMapOverlayOrchestrationRuntime());
VoyagrHazardMapOrchestration.bind(getHazardMapOrchestrationRuntime());
VoyagrCalculateRouteOrchestration.bind(getCalculateRouteOrchestrationRuntime());
VoyagrRouteComparisonOrchestration.bind(getRouteComparisonOrchestrationRuntime());
VoyagrJourneyOverviewOrchestration.bind(getJourneyOverviewOrchestrationRuntime());
VoyagrMapRecenterOrchestration.bind(getMapRecenterOrchestrationRuntime());
VoyagrJourneySummaryOrchestration.bind(getJourneySummaryOrchestrationRuntime());

VoyagrBatteryMonitoringOrchestration.initBatteryMonitoring();



// NOTE: toggleDriverPerspective is defined earlier in the file (around line 7711)
// This duplicate was removed to fix the driver's perspective mode conflict

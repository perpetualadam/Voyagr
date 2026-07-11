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
// Variables: map, routeLayer, startMarker, endMarker, mapPickerMode
// Unit variables: distanceUnit, currencyUnit, speedUnit, temperatureUnit
// Currency symbols: currencySymbols
//
// VoyagrModules (modules/voyagr-modules.js) is the central registry for extracted
// navigation/UI modules. App-layer wrappers below inject live prefs from voyagr-core.

// ===== ROUTE PREFERENCE MIGRATION =====
// Toll pref migration runs in modules/navigation/route-prefs.js on module load.

function isAvoidTollsEnabled() {
    return VoyagrModules.routePrefs().isAvoidTollsEnabled(localStorage);
}
window.isAvoidTollsEnabled = isAvoidTollsEnabled;

function getRouteCostParams(vehicleType) {
    const vt = vehicleType || (typeof currentVehicleType !== 'undefined' ? currentVehicleType : null);
    return VoyagrModules.routePrefs().getRouteCostParams(vt, localStorage);
}
window.getRouteCostParams = getRouteCostParams;

// Note: All global variables are declared below
// ===== BOTTOM SHEET VARIABLES =====
let bottomSheetStartY = 0;
let bottomSheetCurrentY = 0;
let bottomSheetIsExpanded = false; // Tracks logical state (expanded or collapsed)

/** Event target as Element — Text nodes have no .closest (fixes mobile taps on emoji/labels). */
function voyagrEventTargetElement(raw) {
    return VoyagrModules.domHelpers().eventTargetElement(raw);
}

function voyagrClosest(raw, selector) {
    return VoyagrModules.domHelpers().closest(raw, selector);
}

// ===== RECENT DESTINATIONS (local history; works without auth) =====
function loadRecentDestinations() {
    return VoyagrModules.recentDestinations().loadRecentDestinations();
}

function recordRecentDestination(label, lat, lon, kind) {
    return VoyagrModules.recentDestinations().recordRecentDestination(label, lat, lon, kind);
}

// ===== DEBUG SCROLL FUNCTION =====
window.debugScrollIssue = function() {
    const bsc = document.querySelector('.bottom-sheet-content');
    const rpt = document.getElementById('routePreviewTab');
    const navTab = document.getElementById('navigationTab');
    const settingsTab = document.getElementById('settingsTab');

    console.log('=== SCROLL DEBUG ===');
    console.log('bottom-sheet-content:', bsc ? {
        scrollHeight: bsc.scrollHeight,
        clientHeight: bsc.clientHeight,
        scrollTop: bsc.scrollTop,
        offsetHeight: bsc.offsetHeight,
        overflowY: getComputedStyle(bsc).overflowY,
        maxHeight: getComputedStyle(bsc).maxHeight,
        display: getComputedStyle(bsc).display
    } : 'NOT FOUND');

    console.log('routePreviewTab:', rpt ? {
        scrollHeight: rpt.scrollHeight,
        clientHeight: rpt.clientHeight,
        display: rpt.style.display,
        computedDisplay: getComputedStyle(rpt).display,
        overflow: getComputedStyle(rpt).overflow
    } : 'NOT FOUND');

    console.log('navigationTab:', navTab ? {
        display: navTab.style.display,
        computedDisplay: getComputedStyle(navTab).display
    } : 'NOT FOUND');

    console.log('settingsTab:', settingsTab ? {
        display: settingsTab.style.display,
        computedDisplay: getComputedStyle(settingsTab).display
    } : 'NOT FOUND');

    // Check all tabs
    const allTabs = document.querySelectorAll('.bottom-sheet-content > div[id$="Tab"]');
    console.log('All tabs:', Array.from(allTabs).map(t => ({
        id: t.id,
        display: t.style.display,
        computedDisplay: getComputedStyle(t).display,
        height: t.offsetHeight
    })));

    return 'Debug info logged above';
};

// ===== UNIT CONVERSION FUNCTIONS =====
/**
 * convertDistance function
 * @function convertDistance
 * @param {*} km - Parameter description
 * @returns {*} Return value description
 */
// convertDistance / getDistanceUnit / convertTemperature / getTemperatureUnit /
// getFuelEfficiencyInUnits / getFuelEfficiencyLabel moved to modules/navigation/units.js
// (VoyagrUnits). App wrappers pass the global setting as an explicit arg.
function convertDistance(km) {
    return VoyagrModules.units().convertDistance(km, distanceUnit);
}

/**
 * getDistanceUnit function
 * @function getDistanceUnit
 * @returns {*} Return value description
 */
function getDistanceUnit() {
    return VoyagrModules.units().getDistanceUnit(distanceUnit);
}

/**
 * convertSpeed function
 * @function convertSpeed
 * @param {*} kmh - Parameter description
 * @returns {*} Return value description
 */
function convertSpeed(kmh) {
    const SG = VoyagrModules.speedGps();
    const n = Number(kmh);
    if (!Number.isFinite(n)) return '0.0';
    const mph = SG.kmhToMph(n);
    const display = SG.mphToDisplaySpeed(mph, speedUnit);
    return display.toFixed(1);
}

/**
 * getSpeedUnit function
 * @function getSpeedUnit
 * @returns {*} Return value description
 */
function getSpeedUnit() {
    return VoyagrModules.speedGps().speedUnitLabel(speedUnit);
}

/**
 * convertTemperature function
 * @function convertTemperature
 * @param {*} celsius - Parameter description
 * @returns {*} Return value description
 */
function convertTemperature(celsius) {
    return VoyagrModules.units().convertTemperature(celsius, temperatureUnit);
}

/**
 * getTemperatureUnit function
 * @function getTemperatureUnit
 * @returns {*} Return value description
 */
function getTemperatureUnit() {
    return VoyagrModules.units().getTemperatureUnit(temperatureUnit);
}

/**
 * getCurrencySymbol function
 * @function getCurrencySymbol
 * @returns {*} Return value description
 */
// getCurrencySymbol / adjustCostForUnits moved to modules/navigation/units.js (VoyagrUnits).
function getCurrencySymbol() {
    return VoyagrModules.units().getCurrencySymbol(currencyUnit);
}
/**
 * adjustCostForUnits function
 * @function adjustCostForUnits
 * @param {*} cost - Parameter description
 * @param {*} costType - Parameter description
 * @returns {*} Return value description
 */
function adjustCostForUnits(cost, costType = 'fuel') {
    return VoyagrModules.units().adjustCostForUnits(cost);
}
/**
 * getFuelEfficiencyInUnits function
 * @function getFuelEfficiencyInUnits
 * @param {*} liters_per_100km - Parameter description
 * @returns {*} Return value description
 */
function getFuelEfficiencyInUnits(liters_per_100km) {
    return VoyagrModules.units().getFuelEfficiencyInUnits(liters_per_100km, distanceUnit);
}

/**
 * getFuelEfficiencyLabel function
 * @function getFuelEfficiencyLabel
 * @returns {*} Return value description
 */
function getFuelEfficiencyLabel() {
    return VoyagrModules.units().getFuelEfficiencyLabel(distanceUnit);
}

// ===== NAVIGATION VARIABLES =====
let isTrackingActive = false;
let gpsWatchId = null;
let currentUserMarker = null;
let trackingHistory = [];
let lastZoomLevel = 13;
let smartZoomEnabled = localStorage.getItem('smartZoomEnabled') === '1' || true;
// Navigation tracking state (global)
// These are now initialized in voyagr-core.js to prevent redeclaration errors
// let zoomAndFollowEnabled = ...;
// let mapFollowingActive = ...;
let navigationActive = false;

/**
 * Camera padding while following navigation: keeps the vehicle icon in the lower ~quarter of the map
 * (more road ahead visible). Top inset pushes the focal point down; bottom inset clears the bottom sheet / chrome.
 */
function getNavigationFollowPadding() {
    return VoyagrModules.cameraPitch().computeFollowPadding(window.innerHeight, window.innerWidth);
}

window.addEventListener('resize', () => {
    console.log('[Viewport] Window resized; follow padding recomputed on next frame');
    if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
        window.__voyagrMapResizeAndRepaint();
    } else if (typeof map !== 'undefined' && map && typeof map.resize === 'function') {
        map.resize();
    }
});

// ===== DARK MODE FUNCTIONS =====
let currentTheme = localStorage.getItem('ui_theme') || 'light';

/**
 * initializeDarkMode function
 * @function initializeDarkMode
 * @returns {*} Return value description
 */
function initializeDarkMode() {
    const savedTheme = localStorage.getItem('ui_theme') || 'light';
    currentTheme = savedTheme;
    applyTheme(savedTheme);
    console.log('[Dark Mode] Initialized with theme:', savedTheme);
}
/**
 * applyTheme function
 * @function applyTheme
 * @param {*} theme - Parameter description
 * @returns {*} Return value description
 */
function applyTheme(theme) {
    const body = document.body;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = VoyagrModules.theme().shouldUseDarkMode(theme, prefersDark);

    if (useDark) {
        body.classList.add('dark-mode');
        console.log('[Dark Mode] Applied', theme === 'auto' ? 'auto theme (system prefers dark)' : 'dark theme');
    } else {
        body.classList.remove('dark-mode');
        console.log('[Dark Mode] Applied', theme === 'auto' ? 'auto theme (system prefers light)' : 'light theme');
    }

    currentTheme = theme;
    localStorage.setItem('ui_theme', theme);
}

/**
 * toggleDarkMode function
 * @function toggleDarkMode
 * @returns {*} Return value description
 */
function toggleDarkMode() {
    const newTheme = VoyagrModules.theme().toggleBetweenLightAndDark(currentTheme);
    applyTheme(newTheme);
    showStatus(`🌙 Theme changed to ${newTheme} mode`, 'success');
}
/**
 * setTheme function
 * @function setTheme
 * @param {*} theme - Parameter description
 * @returns {*} Return value description
 */
function setTheme(theme) {
    applyTheme(theme);
    updateThemeButtons();  // Update button states to show which theme is active
    saveAllSettings();  // Save theme preference
    showStatus(`🎨 Theme changed to ${theme} mode`, 'success');
}

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (currentTheme === 'auto') {
            applyTheme('auto');
            console.log('[Dark Mode] System theme changed, reapplying auto theme');
        }
    });
}

/**
 * updateThemeButtons function
 * @function updateThemeButtons
 * @returns {*} Return value description
 */
function updateThemeButtons() {
    const lightBtn = document.getElementById('themeLight');
    const darkBtn = document.getElementById('themeDark');
    const autoBtn = document.getElementById('themeAuto');

    if (lightBtn) lightBtn.classList.remove('active');
    if (darkBtn) darkBtn.classList.remove('active');
    if (autoBtn) autoBtn.classList.remove('active');

    const activeId = VoyagrModules.theme().activeThemeButtonId(currentTheme);
    const activeBtn = activeId ? document.getElementById(activeId) : null;
    if (activeBtn) activeBtn.classList.add('active');

    console.log('[Dark Mode] Theme buttons updated for theme:', currentTheme);
}

// Track previous tab for back navigation
let previousTab = 'navigation';

// Tab switching function
/**
 * switchTab function
 * @function switchTab
 * @param {*} tab - Parameter description
 * @returns {*} Return value description
 */
function switchTab(tab) {
    const navigationTab = document.getElementById('navigationTab');
    const settingsTab = document.getElementById('settingsTab');
    const tripHistoryTab = document.getElementById('tripHistoryTab');
    const routeComparisonTab = document.getElementById('routeComparisonTab');
    const routeSharingTab = document.getElementById('routeSharingTab');
    const routeAnalyticsTab = document.getElementById('routeAnalyticsTab');
    const savedRoutesTab = document.getElementById('savedRoutesTab');
    const routePreviewTab = document.getElementById('routePreviewTab');
    const dashcamTab = document.getElementById('dashcamTab');
    const sheetTitle = document.getElementById('sheetTitle');
    const bottomSheetContent = document.querySelector('.bottom-sheet-content');

    console.log('[SwitchTab] Switching to tab:', tab);

    // Store current visible tab as previous tab (before switching)
    const currentTab = getCurrentVisibleTab();
    if (currentTab && currentTab !== tab) {
        previousTab = currentTab;
        console.log('[SwitchTab] Previous tab stored:', previousTab);
    }

    // Scroll to top when switching tabs to prevent scroll position issues
    if (bottomSheetContent) {
        bottomSheetContent.scrollTop = 0;
    }

    // Hide all tabs
    if (navigationTab) navigationTab.style.display = 'none';
    if (settingsTab) settingsTab.style.display = 'none';
    if (tripHistoryTab) tripHistoryTab.style.display = 'none';
    if (routeComparisonTab) routeComparisonTab.style.display = 'none';
    if (routeSharingTab) routeSharingTab.style.display = 'none';
    if (routeAnalyticsTab) routeAnalyticsTab.style.display = 'none';
    if (savedRoutesTab) savedRoutesTab.style.display = 'none';
    if (routePreviewTab) routePreviewTab.style.display = 'none';
    if (dashcamTab) dashcamTab.style.display = 'none';

    if (tab === 'settings') {
        settingsTab.style.display = 'block';
        sheetTitle.textContent = '⚙️ Settings';
        loadUnitPreferences();
        loadRoutePreferences();
        loadMultiDropPreferences();
        loadVoicePreferences();
        loadPorcupineWakeUi();
        loadCameraAlertPreferences();
        loadAvoidancePreferences();
        loadHazardCameraTogglesFromApi();
        loadPromoEntitlementStatus();
    } else if (tab === 'tripHistory') {
        tripHistoryTab.style.display = 'block';
        sheetTitle.textContent = '📋 Trip History';
        loadTripHistory();
    } else if (tab === 'routePreview') {
        console.log('[SwitchTab] Switching to routePreview tab, element:', routePreviewTab);
        if (routePreviewTab) {
            routePreviewTab.style.display = 'block';
            sheetTitle.textContent = '📍 Route Preview';
            console.log('[SwitchTab] routePreviewTab displayed successfully');
        } else {
            console.error('[SwitchTab] routePreviewTab element not found!');
        }
    } else if (tab === 'routeComparison') {
        routeComparisonTab.style.display = 'block';
        sheetTitle.textContent = '🛣️ Route Options';
        displayRouteComparison();
    } else if (tab === 'routeSharing') {
        routeSharingTab.style.display = 'block';
        sheetTitle.textContent = '🔗 Share Route';
        prepareRouteSharing();
    } else if (tab === 'routeAnalytics') {
        routeAnalyticsTab.style.display = 'block';
        sheetTitle.textContent = '📊 Analytics';
        loadRouteAnalytics();
    } else if (tab === 'savedRoutes') {
        savedRoutesTab.style.display = 'block';
        sheetTitle.textContent = '⭐ Saved Routes';
        loadSavedRoutes();
    } else if (tab === 'dashcam') {
        if (dashcamTab) dashcamTab.style.display = 'block';
        sheetTitle.textContent = '📹 Dashcam';
    } else if (tab === 'navigation') {
        if (navigationTab) navigationTab.style.display = 'block';
        sheetTitle.textContent = '🗺️ Navigation';
    } else {
        // Default to navigation tab
        if (navigationTab) navigationTab.style.display = 'block';
        sheetTitle.textContent = '🗺️ Navigation';
    }
}

/**
 * Get the currently visible tab
 * @returns {string} The ID of the currently visible tab
 */
function getCurrentVisibleTab() {
    const tabs = ['navigationTab', 'settingsTab', 'tripHistoryTab', 'routeComparisonTab',
                  'routeSharingTab', 'routeAnalyticsTab', 'savedRoutesTab', 'routePreviewTab', 'dashcamTab'];

    for (const tabId of tabs) {
        const tab = document.getElementById(tabId);
        if (tab && tab.style.display !== 'none') {
            // Return the tab name without 'Tab' suffix
            return tabId.replace('Tab', '');
        }
    }
    return 'navigation'; // Default
}

/**
 * Go back to the previous tab
 */
function goBackToPreviousTab() {
    console.log('[GoBack] Returning to previous tab:', previousTab);
    switchTab(previousTab);
}

// Load unit preferences from localStorage
/**
 * loadUnitPreferences function
 * @function loadUnitPreferences
 * @returns {*} Return value description
 */
function loadUnitPreferences() {
    document.getElementById('distanceUnit').value = distanceUnit;
    document.getElementById('currencyUnit').value = currencyUnit;
    document.getElementById('speedUnit').value = speedUnit;
    document.getElementById('temperatureUnit').value = temperatureUnit;
}

// Update distance unit
/**
 * updateDistanceUnit function
 * @function updateDistanceUnit
 * @returns {*} Return value description
 */
function updateDistanceUnit() {
    const newUnit = document.getElementById('distanceUnit').value;
    distanceUnit = newUnit;
    localStorage.setItem('unit_distance', newUnit);
    saveUnitSettingsToBackend();
    updateAllDistanceDisplays();
    saveAllSettings();
    showStatus(`Distance unit changed to ${VoyagrModules.units().distanceUnitStatusLabel(newUnit)}`, 'success');
}

// Update currency unit
/**
 * updateCurrencyUnit function
 * @function updateCurrencyUnit
 * @returns {*} Return value description
 */
function updateCurrencyUnit() {
    const newUnit = document.getElementById('currencyUnit').value;
    currencyUnit = newUnit;
    localStorage.setItem('unit_currency', newUnit);
    saveUnitSettingsToBackend();
    updateAllCostDisplays();
    saveAllSettings();
    showStatus(`Currency changed to ${newUnit}`, 'success');
}

// Update speed unit
/**
 * updateSpeedUnit function
 * @function updateSpeedUnit
 * @returns {*} Return value description
 */
function updateSpeedUnit() {
    const newUnit = document.getElementById('speedUnit').value;
    speedUnit = newUnit;
    localStorage.setItem('unit_speed', newUnit);
    saveUnitSettingsToBackend();
    updateAllSpeedDisplays();
    saveAllSettings();
    showStatus(`Speed unit changed to ${VoyagrModules.units().speedUnitStatusLabel(newUnit)}`, 'success');
}

// Update temperature unit
/**
 * updateTemperatureUnit function
 * @function updateTemperatureUnit
 * @returns {*} Return value description
 */
function updateTemperatureUnit() {
    const newUnit = document.getElementById('temperatureUnit').value;
    temperatureUnit = newUnit;
    localStorage.setItem('unit_temperature', newUnit);
    saveUnitSettingsToBackend();
    updateAllTemperatureDisplays();
    saveAllSettings();
    showStatus(`Temperature unit changed to ${VoyagrModules.units().temperatureUnitStatusLabel(newUnit)}`, 'success');
}

// Save unit settings to backend
/**
 * saveUnitSettingsToBackend function
 * @function saveUnitSettingsToBackend
 * @returns {*} Return value description
 */
function saveUnitSettingsToBackend() {
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            distance_unit: distanceUnit,
            currency_unit: currencyUnit,
            speed_unit: speedUnit,
            temperature_unit: temperatureUnit
        })
    }).catch(error => console.error('Error saving unit settings:', error));
}

// ===== COMPREHENSIVE PERSISTENT SETTINGS SYSTEM =====

// =============================================================================
// Multi-profile local storage (guest vs signed-in user)
// =============================================================================
// We keep the existing runtime keys (pref_*, voyagr_all_settings, savedRoutes, etc.)
// but snapshot/restore them per profile so multiple users on the same device stay separate.
const VOYAGR_PROFILE_STORE_KEY = 'voyagr_profiles_v1';
let activeProfileId = 'guest';
const SUPABASE_PROFILE_SNAPSHOTS_TABLE = 'voyagr_profile_snapshots';
let supabaseProfileSyncTimer = null;
let supabaseProfileSyncInFlight = false;

function getProfileStore() {
    try {
        return JSON.parse(localStorage.getItem(VOYAGR_PROFILE_STORE_KEY) || '{}');
    } catch {
        return {};
    }
}

function setProfileStore(store) {
    localStorage.setItem(VOYAGR_PROFILE_STORE_KEY, JSON.stringify(store));
}

function getRuntimeProfileSnapshot() {
    return {
        voyagr_all_settings: localStorage.getItem('voyagr_all_settings') || '',
        savedRoutes: localStorage.getItem('savedRoutes') || '[]'
    };
}

function applyRuntimeProfileSnapshot(snapshot) {
    // Restore canonical blobs first
    localStorage.setItem('voyagr_all_settings', snapshot?.voyagr_all_settings || '');
    localStorage.setItem('savedRoutes', snapshot?.savedRoutes || '[]');

    // Hydrate derived keys + in-memory vars
    loadAllSettings();
    applySettingsToUI();

    // Refresh saved routes UI (if present)
    try {
        if (typeof loadSavedRoutes === 'function') loadSavedRoutes();
    } catch (e) {
        console.log('[Profiles] loadSavedRoutes failed:', e);
    }
}

function isAccountProfileId(profileId) {
    return typeof profileId === 'string' && profileId.startsWith('sb:') && profileId.length > 5;
}

function getUserIdFromProfileId(profileId) {
    // profileId format: "sb:<uuid>"
    if (!isAccountProfileId(profileId)) return '';
    return profileId.slice(3);
}

function scheduleSupabaseProfileSync() {
    if (!supabaseClient) return;
    if (!isAccountProfileId(activeProfileId)) return;

    if (supabaseProfileSyncTimer) {
        clearTimeout(supabaseProfileSyncTimer);
    }

    supabaseProfileSyncTimer = setTimeout(async () => {
        await syncActiveProfileToSupabase();
    }, 1200);
}

async function syncActiveProfileToSupabase() {
    if (!supabaseClient) return;
    if (supabaseProfileSyncInFlight) return;
    if (!isAccountProfileId(activeProfileId)) return;

    const userId = getUserIdFromProfileId(activeProfileId);
    if (!userId) return;

    try {
        supabaseProfileSyncInFlight = true;
        const store = getProfileStore();
        const entry = store[activeProfileId] || {};

        const snapshot = getRuntimeProfileSnapshot();
        const row = {
            user_id: userId,
            profile_id: activeProfileId,
            snapshot
        };

        const { data, error } = await supabaseClient
            .from(SUPABASE_PROFILE_SNAPSHOTS_TABLE)
            .upsert(row, { onConflict: 'user_id,profile_id' })
            .select('updated_at')
            .single();

        if (error) {
            console.warn('[Supabase][Profiles] Sync failed:', error.message || error);
            return;
        }

        // Persist remote timestamp locally for simple LWW conflict handling
        const updatedAt = data?.updated_at || '';
        store[activeProfileId] = {
            ...entry,
            ...snapshot,
            supabase_updated_at: updatedAt
        };
        setProfileStore(store);
        console.log('[Supabase][Profiles] Synced profile snapshot:', activeProfileId);
    } catch (e) {
        console.warn('[Supabase][Profiles] Sync exception:', e);
    } finally {
        supabaseProfileSyncInFlight = false;
    }
}

async function pullProfileSnapshotFromSupabase(profileId) {
    if (!supabaseClient) return false;
    if (!isAccountProfileId(profileId)) return false;

    const userId = getUserIdFromProfileId(profileId);
    if (!userId) return false;

    try {
        const { data, error } = await supabaseClient
            .from(SUPABASE_PROFILE_SNAPSHOTS_TABLE)
            .select('snapshot, updated_at')
            .eq('user_id', userId)
            .eq('profile_id', profileId)
            .maybeSingle();

        if (error) {
            console.warn('[Supabase][Profiles] Pull failed:', error.message || error);
            return false;
        }
        if (!data) {
            return false;
        }

        const remoteUpdatedAt = data.updated_at || '';
        const remoteSnapshot = data.snapshot || {};

        const store = getProfileStore();
        const localEntry = store[profileId] || {};
        const localUpdatedAt = localEntry.supabase_updated_at || '';

        // LWW: only overwrite local profile if remote is newer (or local has never synced)
        const shouldApplyRemote = !localUpdatedAt || (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt);
        if (shouldApplyRemote) {
            store[profileId] = {
                ...localEntry,
                ...remoteSnapshot,
                supabase_updated_at: remoteUpdatedAt
            };
            setProfileStore(store);

            if (activeProfileId === profileId) {
                applyRuntimeProfileSnapshot(store[profileId]);
            }
            console.log('[Supabase][Profiles] Pulled profile snapshot:', profileId);
        }

        return true;
    } catch (e) {
        console.warn('[Supabase][Profiles] Pull exception:', e);
        return false;
    }
}

function persistActiveProfile() {
    const store = getProfileStore();
    store[activeProfileId] = getRuntimeProfileSnapshot();
    setProfileStore(store);
    console.log('[Profiles] Persisted profile:', activeProfileId);
    scheduleSupabaseProfileSync();
}

function ensureProfileExists(profileId) {
    const store = getProfileStore();
    if (!store[profileId]) {
        store[profileId] = { voyagr_all_settings: '', savedRoutes: '[]', supabase_updated_at: '' };
        setProfileStore(store);
    }
}

function switchActiveProfile(profileId, options = {}) {
    if (!profileId) profileId = 'guest';

    // Save current runtime state into current profile before switching
    persistActiveProfile();

    const store = getProfileStore();
    const fromProfileId = activeProfileId;

    ensureProfileExists(profileId);
    activeProfileId = profileId;

    // Optional: import previous profile into new one (first login migration)
    if (options.importFromProfileId && store[options.importFromProfileId]) {
        store[profileId] = store[options.importFromProfileId];
        setProfileStore(store);
        console.log('[Profiles] Imported profile', options.importFromProfileId, '→', profileId);
    }

    // Apply new profile state
    applyRuntimeProfileSnapshot(store[profileId]);
    console.log('[Profiles] Switched profile:', fromProfileId, '→', activeProfileId);
}

// Ensure guest profile exists on boot (maintains current behavior)
ensureProfileExists('guest');

// =============================================================================
// Support: Stripe subscription (link or Checkout) + BMC/Patreon tips from /api/config
// =============================================================================
function openVoyagerPremiumSection() {
    try {
        if (typeof expandBottomSheet === 'function') {
            expandBottomSheet();
        }
        switchTab('settings');
        setTimeout(() => {
            const el = document.getElementById('supportVoyagrSection');
            if (!el) return;
            if (el.style.display === 'none') {
                showStatus('Voyager Premium is not configured on this server yet (add Stripe or tip URLs in .env).', 'info');
                return;
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    } catch (e) {
        console.warn('[Voyager Premium] open section failed', e);
    }
}

function applySupportLinksFromConfig(cfg) {
    const section = document.getElementById('supportVoyagrSection');
    if (!section || !cfg) return;

    const pl = (cfg.stripe_payment_link_url || '').trim();
    const bmc = (cfg.buy_me_a_coffee_url || '').trim();
    const pat = (cfg.patreon_url || '').trim();
    const checkout = !!(cfg.stripe_subscription_checkout_available || cfg.stripe_checkout_available);

    const btnStripe = document.getElementById('supportStripePremiumBtn');
    const btnBmc = document.getElementById('supportBmcBtn');
    const btnPat = document.getElementById('supportPatreonBtn');

    const regionNote = (cfg.service_region_note || '').trim();

    const stripePremium = !!(pl || checkout);
    const show = !!(stripePremium || bmc || pat || regionNote);
    section.style.display = show ? 'block' : 'none';

    const regionEl = document.getElementById('serviceRegionNote');
    if (regionEl) {
        if (regionNote) {
            regionEl.style.display = 'block';
            regionEl.textContent = regionNote;
        } else {
            regionEl.style.display = 'none';
            regionEl.textContent = '';
        }
    }

    const trialNote = document.getElementById('supportStripeTrialNote');
    const trialDays = parseInt(cfg.stripe_subscription_trial_days, 10);
    const usesCheckout = !pl && checkout;
    if (trialNote) {
        if (Number.isFinite(trialDays) && trialDays > 0 && usesCheckout) {
            trialNote.style.display = 'block';
            trialNote.textContent =
                `Voyager Premium checkout includes a ${trialDays}-day free trial; billing starts after that. Set STRIPE_SUCCESS_URL to your public site (domain B) if you want users to land there after checkout.`;
        } else {
            trialNote.style.display = 'none';
            trialNote.textContent = '';
        }
    }

    if (btnStripe) {
        btnStripe.style.display = stripePremium ? 'block' : 'none';
        if (pl) {
            btnStripe.onclick = () => { window.open(pl, '_blank', 'noopener,noreferrer'); };
        } else if (checkout) {
            btnStripe.onclick = () => { void startStripeSubscriptionCheckout(); };
        } else {
            btnStripe.onclick = null;
        }
    }
    if (btnBmc) {
        btnBmc.style.display = bmc ? 'block' : 'none';
        btnBmc.onclick = bmc ? () => { window.open(bmc, '_blank', 'noopener,noreferrer'); } : null;
    }
    if (btnPat) {
        btnPat.style.display = pat ? 'block' : 'none';
        btnPat.onclick = pat ? () => { window.open(pat, '_blank', 'noopener,noreferrer'); } : null;
    }
}

async function startStripeSubscriptionCheckout(sessionOpt) {
    try {
        showStatus('Opening subscription checkout…', 'info');
        const origin = window.location.origin;
        let session = sessionOpt;
        if (session == null && supabaseClient) {
            const { data } = await supabaseClient.auth.getSession();
            session = data?.session || null;
        }
        const body = {
            success_url: `${origin}/?subscribe=success`,
            cancel_url: `${origin}/?subscribe=cancelled`,
        };
        if (session?.user?.email) body.customer_email = session.user.email;
        if (session?.user?.id) body.supabase_user_id = session.user.id;
        const res = await fetch('/api/support/stripe-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || !data.success || !data.url) {
            showStatus(data.error || 'Subscription checkout unavailable', 'error');
            return;
        }
        window.location.href = data.url;
    } catch (e) {
        console.error('[Support] Stripe subscription checkout failed', e);
        showStatus('Could not start subscription checkout', 'error');
    }
}

// =============================================================================
// Supabase Auth (optional) — Option C: map first; soft banner invites sign-in.
// =============================================================================

const _SOFT_AUTH_BANNER_DISMISS_KEY = 'voyagr_soft_auth_banner_dismissed';

/** Soft banner only on public production hosts (not staging, localhost, or raw IPs). */
function voyagrSoftAuthBannerAllowedHost() {
    try {
        const h = String(window.location.hostname || '').toLowerCase();
        return h === 'vibevoyager.org' || h === 'www.vibevoyager.org';
    } catch (e) {
        return false;
    }
}

function voyagrDismissSoftAuthBanner() {
    try {
        sessionStorage.setItem(_SOFT_AUTH_BANNER_DISMISS_KEY, 'true');
    } catch (e) { /* ignore */ }
    syncSoftAuthBannerVisibility(false);
}

function voyagrOpenSignInFromBanner() {
    try {
        if (typeof expandBottomSheet === 'function') {
            expandBottomSheet();
        }
        switchTab('settings');
        setTimeout(() => {
            const el = document.getElementById('accountSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
    } catch (e) {
        console.warn('[Auth] Open sign-in from banner failed:', e);
    }
}

/** Show when Supabase is configured and user is signed out; hide if dismissed this tab session. */
function syncSoftAuthBannerVisibility(wantGuestPrompt) {
    const el = document.getElementById('softAuthBanner');
    if (!el) return;
    if (!wantGuestPrompt) {
        el.style.display = 'none';
        return;
    }
    if (!voyagrSoftAuthBannerAllowedHost()) {
        el.style.display = 'none';
        return;
    }
    try {
        if (sessionStorage.getItem(_SOFT_AUTH_BANNER_DISMISS_KEY) === 'true') {
            el.style.display = 'none';
            return;
        }
    } catch (e) { /* ignore */ }
    el.style.display = 'flex';
}

let supabaseClient = null;
let supabasePublicConfig = null;
let _authGateStripeOffer = null;

const _STRIPE_ONBOARD_SKIP_PREFIX = 'voyagr_skip_stripe_onboard:';

function _stripeOnboardSkipKey(userId) {
    return userId ? `${_STRIPE_ONBOARD_SKIP_PREFIX}${userId}` : null;
}

/** Subscription offer for post-auth gate (trial length from STRIPE_SUBSCRIPTION_TRIAL_DAYS /api/config). */
function getStripeOnboardingOffer(cfg) {
    if (!cfg) return null;
    const pl = (cfg.stripe_payment_link_url || '').trim();
    const checkout = !!(cfg.stripe_subscription_checkout_available || cfg.stripe_checkout_available);
    const trialDays = parseInt(cfg.stripe_subscription_trial_days, 10);
    const hasTrial = Number.isFinite(trialDays) && trialDays > 0;
    if (checkout && !pl) {
        return { kind: 'checkout', trialDays: hasTrial ? trialDays : 0 };
    }
    if (pl) {
        return { kind: 'payment_link', trialDays: hasTrial ? trialDays : 0, url: pl };
    }
    return null;
}

function consumeStripeReturnQueryForUser(userId) {
    try {
        const qs = new URLSearchParams(window.location.search || '');
        const sub = qs.get('subscribe');
        if (sub === 'success' && userId) {
            const k = _stripeOnboardSkipKey(userId);
            if (k) localStorage.setItem(k, '1');
        }
        if (sub === 'success' || sub === 'cancelled') {
            const url = new URL(window.location.href);
            url.searchParams.delete('subscribe');
            url.searchParams.delete('session_id');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
    } catch (e) {
        console.warn('[Stripe gate] URL cleanup:', e);
    }
}

async function showPostAuthStripeGateIfNeeded(session) {
    const uid = session?.user?.id;
    if (!uid || !supabasePublicConfig) {
        syncAuthRequiredGate('off');
        return;
    }
    consumeStripeReturnQueryForUser(uid);
    try {
        if (localStorage.getItem(_stripeOnboardSkipKey(uid)) === '1') {
            syncAuthRequiredGate('off');
            return;
        }
    } catch (e) { /* ignore quota */ }

    const offer = getStripeOnboardingOffer(supabasePublicConfig);
    if (!offer || offer.trialDays <= 0) {
        syncAuthRequiredGate('off');
        return;
    }
    _authGateStripeOffer = offer;
    syncAuthRequiredGate('stripe_trial', offer);
}

async function authGateStripeContinue() {
    const st = document.getElementById('authGateStripeStatus');
    const setSt = (msg, kind) => {
        if (!st) return;
        st.textContent = msg || '';
        st.className = 'auth-required-gate__status';
        if (kind === 'error') st.classList.add('auth-required-gate__status--error');
    };
    const offer = _authGateStripeOffer;
    if (!offer) {
        syncAuthRequiredGate('off');
        return;
    }
    if (!supabaseClient) {
        setSt('Session unavailable. Refresh the page.', 'error');
        return;
    }
    const { data } = await supabaseClient.auth.getSession();
    const sess = data?.session || null;
    if (offer.kind === 'payment_link' && offer.url) {
        setSt('Opening Stripe checkout…', '');
        window.open(offer.url, '_blank', 'noopener,noreferrer');
        setSt(
            'Complete checkout in the new tab. Tap Skip for now below when you are finished (or to use the app without subscribing).',
            ''
        );
        return;
    }
    setSt('Opening subscription checkout…', '');
    try {
        const origin = window.location.origin;
        const res = await fetch('/api/support/stripe-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success_url: `${origin}/?subscribe=success`,
                cancel_url: `${origin}/?subscribe=cancelled`,
                customer_email: sess?.user?.email || undefined,
                supabase_user_id: sess?.user?.id || undefined,
            }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.success || !resData.url) {
            setSt(resData.error || 'Could not start checkout.', 'error');
            return;
        }
        window.location.href = resData.url;
    } catch (e) {
        console.error('[Stripe gate] checkout', e);
        setSt('Could not start checkout.', 'error');
    }
}

async function authGateStripeSkip() {
    try {
        const { data } = await supabaseClient.auth.getSession();
        const uid = data?.session?.user?.id;
        const k = _stripeOnboardSkipKey(uid);
        if (k) localStorage.setItem(k, '1');
    } catch (e) { /* ignore */ }
    _authGateStripeOffer = null;
    syncAuthRequiredGate('off');
}

function setAuthGateFormStatus(message, kind) {
    const statusEl = document.getElementById('authGateStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'auth-required-gate__status';
    if (kind === 'error') statusEl.classList.add('auth-required-gate__status--error');
    else if (kind === 'ok') statusEl.classList.add('auth-required-gate__status--ok');
}

/**
 * When Supabase URL + anon key exist, users must sign in before using the app.
 * Modes: off, loading, signin, stripe_trial (after sign-in if Stripe trial is configured).
 */
function syncAuthRequiredGate(mode, offer) {
    const gate = document.getElementById('authRequiredGate');
    const loadingEl = document.getElementById('authGateLoading');
    const formEl = document.getElementById('authGateForm');
    const stripeEl = document.getElementById('authGateStripeTrial');
    const titleEl = document.getElementById('authGateTitle');
    if (!gate) return;

    if (mode === 'off') {
        _authGateStripeOffer = null;
        gate.style.display = 'none';
        gate.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-gate-active');
        if (stripeEl) stripeEl.style.display = 'none';
        return;
    }

    gate.style.display = 'flex';
    gate.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-gate-active');

    if (stripeEl) stripeEl.style.display = 'none';

    if (mode === 'loading') {
        if (titleEl) titleEl.textContent = 'Sign in to Voyagr';
        if (loadingEl) loadingEl.style.display = 'block';
        if (formEl) formEl.style.display = 'none';
        return;
    }

    if (mode === 'signin') {
        if (titleEl) titleEl.textContent = 'Sign in to Voyagr';
        setAuthGateFormStatus('', '');
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
        return;
    }

    if (mode === 'stripe_trial' && offer && stripeEl) {
        if (titleEl) titleEl.textContent = 'Start your free trial';
        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) formEl.style.display = 'none';
        const hint = document.getElementById('authGateStripeHint');
        const td = offer.trialDays;
        if (hint) {
            hint.textContent =
                `Continue to Stripe to start your ${td}-day Voyager Premium trial. Billing begins after the trial unless you cancel in the Stripe portal.`;
        }
        const ssl = document.getElementById('authGateStripeStatus');
        if (ssl) {
            ssl.textContent = '';
            ssl.className = 'auth-required-gate__status';
        }
        const primary = document.getElementById('authGateStripePrimaryBtn');
        if (primary) {
            primary.textContent = offer.kind === 'payment_link' ? 'Open Stripe checkout' : 'Continue to Stripe';
        }
        stripeEl.style.display = 'block';
    }
}

async function authSignInEmailGate() {
    if (!supabaseClient) {
        setAuthGateFormStatus('Sign-in is unavailable. Try again later.', 'error');
        return;
    }
    const email = document.getElementById('authGateEmail')?.value?.trim();
    const password = document.getElementById('authGatePassword')?.value || '';
    if (!email || !password) {
        setAuthGateFormStatus('Enter your email and password.', 'error');
        return;
    }
    setAuthGateFormStatus('Signing in…', '');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        setAuthGateFormStatus(error.message || 'Sign-in failed', 'error');
        return;
    }
    setAuthGateFormStatus('', '');
}

async function authSignUpEmailGate() {
    if (!supabaseClient) {
        setAuthGateFormStatus('Sign-up is unavailable. Try again later.', 'error');
        return;
    }
    const email = document.getElementById('authGateEmail')?.value?.trim();
    const password = document.getElementById('authGatePassword')?.value || '';
    if (!email || !password) {
        setAuthGateFormStatus('Enter your email and password.', 'error');
        return;
    }
    setAuthGateFormStatus('Creating account…', '');
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        setAuthGateFormStatus(error.message || 'Sign-up failed', 'error');
        return;
    }
    setAuthGateFormStatus('Account created. Check your email if confirmation is required.', 'ok');
}

function setAccountUIState({ signedIn, email, message }) {
    const statusEl = document.getElementById('accountStatus');
    const signedOutEl = document.getElementById('accountSignedOut');
    const signedInEl = document.getElementById('accountSignedIn');
    const emailEl = document.getElementById('accountEmail');

    if (statusEl) statusEl.textContent = message || '';
    if (signedOutEl) signedOutEl.style.display = signedIn ? 'none' : 'block';
    if (signedInEl) signedInEl.style.display = signedIn ? 'block' : 'none';
    if (emailEl) emailEl.textContent = email || '-';
}

async function initSupabaseAuth() {
    try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        const data = await res.json();
        supabasePublicConfig = data;
        applySupportLinksFromConfig(data);

        const url = data.supabase_url;
        const anonKey = data.supabase_anon_key;

        if (!url || !anonKey || typeof supabase === 'undefined') {
            setAccountUIState({
                signedIn: false,
                message: 'Account login not configured on this server.'
            });
            const accountSection = document.getElementById('accountSection');
            if (accountSection) accountSection.style.display = 'none';
            syncAuthRequiredGate('off');
            syncSoftAuthBannerVisibility(false);
            return;
        }

        // Create client (global UMD: supabase.createClient)
        const { createClient } = supabase;
        supabaseClient = createClient(url, anonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        window.supabaseClient = supabaseClient;

        // Initial session (no full-screen loading gate — map stays usable)
        const { data: sessionData } = await supabaseClient.auth.getSession();
        await handleSupabaseSession(sessionData?.session || null);

        // Session changes (login/logout/refresh)
        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            await handleSupabaseSession(session || null);
        });
    } catch (e) {
        console.error('[Auth] initSupabaseAuth failed:', e);
        setAccountUIState({ signedIn: false, message: 'Account login unavailable (config error).' });
        syncAuthRequiredGate('off');
        syncSoftAuthBannerVisibility(false);
    }
}

async function handleSupabaseSession(session) {
    if (session && session.user) {
        syncSoftAuthBannerVisibility(false);
        const userId = session.user.id;
        const email = session.user.email || '';
        setAccountUIState({ signedIn: true, email, message: 'Signed in.' });

        const userProfileId = `sb:${userId}`;
        ensureProfileExists(userProfileId);

        // If user profile is empty but guest has data, offer import once.
        const store = getProfileStore();
        const guestSnap = store['guest'];
        const userSnap = store[userProfileId];
        const guestHasData = !!(guestSnap?.voyagr_all_settings && guestSnap.voyagr_all_settings.length > 10) ||
                             !!(guestSnap?.savedRoutes && guestSnap.savedRoutes !== '[]');
        const userHasData = !!(userSnap?.voyagr_all_settings && userSnap.voyagr_all_settings.length > 10) ||
                            !!(userSnap?.savedRoutes && userSnap.savedRoutes !== '[]');

        if (guestHasData && !userHasData) {
            const importChoice = confirm('Import your current on-device (guest) profile into this account profile?');
            if (importChoice) {
                switchActiveProfile(userProfileId, { importFromProfileId: 'guest' });
                showStatus('Imported guest profile into account profile', 'success');
                scheduleSupabaseProfileSync();
                await refreshPromoCodeSection(session || null);
                await showPostAuthStripeGateIfNeeded(session);
                return;
            }
        }

        switchActiveProfile(userProfileId);
        // Pull down latest snapshot from Supabase (if any). If remote is newer, it will apply.
        await pullProfileSnapshotFromSupabase(userProfileId);
        // If no remote snapshot exists yet, push current local snapshot.
        scheduleSupabaseProfileSync();
        await refreshPromoCodeSection(session || null);
        await showPostAuthStripeGateIfNeeded(session);
        return;
    }

    // Signed out
    setAccountUIState({ signedIn: false, message: 'Not signed in (guest profile).' });
    switchActiveProfile('guest');
    await refreshPromoCodeSection(session || null);
    syncAuthRequiredGate('off');
    syncSoftAuthBannerVisibility(!!supabaseClient);
}

async function authSignInEmail() {
    if (!supabaseClient) return showStatus('Auth not configured', 'error');
    const email = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value || '';
    if (!email || !password) return showStatus('Enter email + password', 'error');

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showStatus(error.message || 'Sign-in failed', 'error');
    showStatus('Signed in', 'success');
}

async function authSignUpEmail() {
    if (!supabaseClient) return showStatus('Auth not configured', 'error');
    const email = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value || '';
    if (!email || !password) return showStatus('Enter email + password', 'error');

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return showStatus(error.message || 'Sign-up failed', 'error');
    showStatus('Account created. Check your email if confirmation is required.', 'success');
}

async function authSignInProvider(provider) {
    if (!supabaseClient) return showStatus('Auth not configured', 'error');
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin }
    });
    if (error) return showStatus(error.message || 'OAuth sign-in failed', 'error');
}

async function authSignOut() {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) return showStatus(error.message || 'Sign-out failed', 'error');
    showStatus('Signed out', 'info');
}

async function refreshPromoCodeSection(session) {
    const block = document.getElementById('promoCodeBlock');
    const guestNote = document.getElementById('promoCodeGuestNote');
    const formWrap = document.getElementById('promoCodeFormWrap');
    if (!block || !guestNote || !formWrap) return;
    if (!supabaseClient) {
        block.style.display = 'none';
        return;
    }
    block.style.display = 'block';
    if (session?.user) {
        guestNote.style.display = 'none';
        formWrap.style.display = 'block';
        await loadPromoEntitlementStatus();
    } else {
        guestNote.style.display = 'block';
        formWrap.style.display = 'none';
        const summary = document.getElementById('promoEntitlementSummary');
        if (summary) summary.textContent = '';
    }
}

async function loadPromoEntitlementStatus() {
    const summary = document.getElementById('promoEntitlementSummary');
    if (!summary) return;
    const token = await getSupabaseAccessToken();
    if (!token) {
        summary.textContent = '';
        return;
    }
    try {
        const { res, data } = await fetchJsonWithAuth('/api/coupons/status');
        if (res.status === 401 || !res.ok || !data.success) {
            summary.textContent = '';
            return;
        }
        if (data.lifetime) {
            summary.textContent = 'Promo access: lifetime.';
            summary.style.color = '#2e7d32';
        } else if (data.trial_active && data.trial_expires_at) {
            const d = new Date(data.trial_expires_at * 1000);
            summary.textContent = `Promo access: trial until ${d.toLocaleString()}.`;
            summary.style.color = '#1565c0';
        } else {
            summary.textContent = 'Promo access: none applied.';
            summary.style.color = '#666';
        }
    } catch {
        summary.textContent = '';
    }
}

async function redeemPromoCode() {
    const input = document.getElementById('promoCodeInput');
    const statusEl = document.getElementById('promoCodeStatus');
    const code = input?.value?.trim();
    if (!code) {
        if (statusEl) statusEl.textContent = 'Enter a code.';
        return;
    }
    if (statusEl) statusEl.textContent = 'Applying…';
    try {
        const { res, data } = await fetchJsonWithAuth('/api/coupons/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        if (data.success) {
            showStatus(data.message || 'Code applied', 'success');
            if (statusEl) statusEl.textContent = data.message || 'Applied.';
            if (input) input.value = '';
            await loadPromoEntitlementStatus();
        } else {
            if (statusEl) statusEl.textContent = data.error || 'Could not apply code.';
            showStatus(data.error || 'Could not apply code', 'error');
        }
    } catch {
        if (statusEl) statusEl.textContent = 'Network error.';
        showStatus('Could not apply code', 'error');
    }
}

// Expose handlers for inline onclick buttons in HTML
window.authSignInEmail = authSignInEmail;
window.authSignUpEmail = authSignUpEmail;
window.authSignInProvider = authSignInProvider;
window.authSignOut = authSignOut;
window.redeemPromoCode = redeemPromoCode;

/**
 * saveAllSettings function
 * @function saveAllSettings
 * @returns {*} Return value description
 */
function saveAllSettings() {
    const allSettings = {
        // Unit preferences
        unit_distance: distanceUnit,
        unit_currency: currencyUnit,
        unit_speed: speedUnit,
        unit_temperature: temperatureUnit,

        // Vehicle and routing
        vehicleType: currentVehicleType,
        routingMode: currentRoutingMode,

        // Route preferences
        routePreferences: {
            avoidHighways: document.getElementById('avoidHighways')?.checked || false,
            preferScenic: document.getElementById('preferScenic')?.checked || false,
            avoidTolls: isAvoidTollsEnabled(),
            avoidCAZ: localStorage.getItem('pref_caz') !== 'false',      // Default: true
            preferQuiet: document.getElementById('preferQuiet')?.checked || false,
            avoidUnpaved: document.getElementById('avoidUnpaved')?.checked || false,
            routeOptimization: document.getElementById('routeOptimization')?.value || 'fastest',
            maxDetour: parseInt(document.getElementById('maxDetour')?.value || 20)
        },

        // Hazard avoidance
        hazardPreferences: {
            avoidTolls: isAvoidTollsEnabled(),  // now sourced from Route Preferences
            avoidCAZ: localStorage.getItem('pref_caz') !== 'false',      // Default: true
            avoidCameras: localStorage.getItem('pref_cameras') !== 'false',  // Default: true (avoid cameras)
            avoidTrafficLights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false'
        },

        // Display preferences
        mapTheme: localStorage.getItem('mapTheme') || 'standard',
        smartZoomEnabled: smartZoomEnabled,
        showCamerasEnabled: showCamerasEnabled,
        showOsmTrafficLightsEnabled: showOsmTrafficLightsEnabled,
        showOsmRailwayCrossingsEnabled: showOsmRailwayCrossingsEnabled,
        showTrafficEnabled: showTrafficEnabled,

        // Navigation automation
        autoTrafficUpdateEnabled: autoTrafficUpdateEnabled,
        autoRerouteOnDeviationEnabled: autoRerouteOnDeviationEnabled,
        speedWidgetEnabled: speedWidgetEnabled,

        // Parking preferences
        parkingPreferences: {
            maxWalkingDistance: document.getElementById('parkingMaxWalkingDistance')?.value || '10',
            preferredType: document.getElementById('parkingPreferredType')?.value || 'any',
            pricePreference: document.getElementById('parkingPricePreference')?.value || 'any'
        },

        // Multi-drop preferences
        multiDropPreferences: {
            optimizeStopOrder: localStorage.getItem('pref_optimizeStopOrder') !== 'false',
            roundTrip: localStorage.getItem('pref_roundTrip') === 'true',
            trafficAwareRouting: localStorage.getItem('pref_trafficAwareRouting') !== 'false',
            avoidRoadClosures: localStorage.getItem('pref_avoidRoadClosures') !== 'false',
            avoidIncidents: localStorage.getItem('pref_avoidIncidents') !== 'false',
            departureTime: localStorage.getItem('pref_departureTime') || ''
        },

        lastSaved: new Date().toISOString()
    };

    localStorage.setItem('voyagr_all_settings', JSON.stringify(allSettings));
    console.log('[Settings] All settings saved to localStorage', allSettings);

    // Persist this snapshot to the active profile store
    persistActiveProfile();
}

/**
 * loadAllSettings function
 * @function loadAllSettings
 * @returns {*} Return value description
 */
function loadAllSettings() {
    try {
        const saved = localStorage.getItem('voyagr_all_settings');
        if (saved) {
            const settings = JSON.parse(saved);
            console.log('[Settings] Loaded settings from localStorage', settings);

            // Restore unit preferences
            if (settings.unit_distance) {
                distanceUnit = settings.unit_distance;
                localStorage.setItem('unit_distance', distanceUnit);
            }
            if (settings.unit_currency) {
                currencyUnit = settings.unit_currency;
                localStorage.setItem('unit_currency', currencyUnit);
            }
            if (settings.unit_speed) {
                speedUnit = settings.unit_speed;
                localStorage.setItem('unit_speed', speedUnit);
            }
            if (settings.unit_temperature) {
                temperatureUnit = settings.unit_temperature;
                localStorage.setItem('unit_temperature', temperatureUnit);
            }

            // Restore vehicle type and routing mode
            if (settings.vehicleType) {
                currentVehicleType = settings.vehicleType;
                localStorage.setItem('vehicleType', currentVehicleType);
            }
            if (settings.routingMode) {
                currentRoutingMode = settings.routingMode;
                localStorage.setItem('routingMode', currentRoutingMode);
            }

            // Restore route preferences
            if (settings.routePreferences) {
                localStorage.setItem('routePreferences', JSON.stringify(settings.routePreferences));
            }

            // Restore hazard preferences
            if (settings.hazardPreferences) {
                // 'avoidTolls' from server-side settings is now stored under the canonical
                // Route Preferences key. Legacy 'pref_tolls' is also written so older app
                // builds rolling back don't lose user intent.
                const tollVal = settings.hazardPreferences.avoidTolls ? 'true' : 'false';
                localStorage.setItem('pref_avoid_tollRoads', tollVal);
                localStorage.setItem('pref_tolls', tollVal);
                localStorage.setItem('pref_caz', settings.hazardPreferences.avoidCAZ ? 'true' : 'false');
                localStorage.setItem('pref_cameras', settings.hazardPreferences.avoidCameras ? 'true' : 'false');
                if (settings.hazardPreferences.avoidTrafficLights !== undefined) {
                    localStorage.setItem('pref_trafficLightsAvoid', settings.hazardPreferences.avoidTrafficLights ? 'true' : 'false');
                }
                if (settings.hazardPreferences.avoidRailwayCrossings !== undefined) {
                    localStorage.setItem('pref_railwayCrossingsAvoid', settings.hazardPreferences.avoidRailwayCrossings ? 'true' : 'false');
                }
            }

            // Restore display preferences
            if (settings.mapTheme) {
                localStorage.setItem('mapTheme', settings.mapTheme);
            }
            if (settings.smartZoomEnabled !== undefined) {
                smartZoomEnabled = settings.smartZoomEnabled;
                localStorage.setItem('smartZoomEnabled', smartZoomEnabled ? '1' : '0');
            }
            if (settings.showCamerasEnabled !== undefined) {
                showCamerasEnabled = settings.showCamerasEnabled;
                localStorage.setItem('showCamerasEnabled', showCamerasEnabled ? 'true' : 'false');
            }
            if (settings.showOsmTrafficLightsEnabled !== undefined) {
                showOsmTrafficLightsEnabled = settings.showOsmTrafficLightsEnabled;
                localStorage.setItem('showOsmTrafficLightsOnMap', showOsmTrafficLightsEnabled ? 'true' : 'false');
            }
            if (settings.showOsmRailwayCrossingsEnabled !== undefined) {
                showOsmRailwayCrossingsEnabled = settings.showOsmRailwayCrossingsEnabled;
                localStorage.setItem('showOsmRailwayCrossingsOnMap', showOsmRailwayCrossingsEnabled ? 'true' : 'false');
            }
            if (settings.showTrafficEnabled !== undefined) {
                showTrafficEnabled = settings.showTrafficEnabled;
                localStorage.setItem('showTrafficEnabled', showTrafficEnabled ? 'true' : 'false');
            }

            // Restore navigation automation settings
            if (settings.autoTrafficUpdateEnabled !== undefined) {
                autoTrafficUpdateEnabled = settings.autoTrafficUpdateEnabled;
                localStorage.setItem('autoTrafficUpdate', autoTrafficUpdateEnabled ? 'true' : 'false');
            }
            if (settings.autoRerouteOnDeviationEnabled !== undefined) {
                autoRerouteOnDeviationEnabled = settings.autoRerouteOnDeviationEnabled;
                localStorage.setItem('autoRerouteOnDeviation', autoRerouteOnDeviationEnabled ? 'true' : 'false');
            }
            if (settings.speedWidgetEnabled !== undefined) {
                speedWidgetEnabled = !!settings.speedWidgetEnabled;
                localStorage.setItem('speedWidgetEnabled', speedWidgetEnabled ? 'true' : 'false');
            }

            // Restore parking preferences
            if (settings.parkingPreferences) {
                localStorage.setItem('parkingPreferences', JSON.stringify(settings.parkingPreferences));
            }

            console.log('[Settings] All settings restored successfully');
            return true;
        } else {
            console.log('[Settings] No saved settings found, using defaults');
            return false;
        }
    } catch (error) {
        console.error('[Settings] Error loading settings:', error);
        return false;
    }
}

/**
 * applySettingsToUI function
 * @function applySettingsToUI
 * @returns {*} Return value description
 */
function applySettingsToUI() {
    try {
        // Apply unit preferences
        const distanceUnitEl = document.getElementById('distanceUnit');
        if (distanceUnitEl) distanceUnitEl.value = distanceUnit;

        const currencyUnitEl = document.getElementById('currencyUnit');
        if (currencyUnitEl) currencyUnitEl.value = currencyUnit;

        const speedUnitEl = document.getElementById('speedUnit');
        if (speedUnitEl) speedUnitEl.value = speedUnit;

        const temperatureUnitEl = document.getElementById('temperatureUnit');
        if (temperatureUnitEl) temperatureUnitEl.value = temperatureUnit;

        // Apply vehicle type
        const vehicleTypeEl = document.getElementById('vehicleType');
        if (vehicleTypeEl) vehicleTypeEl.value = currentVehicleType;

        // Apply routing mode
        setRoutingMode(currentRoutingMode);

        // Apply route preferences
        const saved = localStorage.getItem('routePreferences');
        if (saved) {
            const prefs = JSON.parse(saved);
            const avoidHighwaysEl = document.getElementById('avoidHighways');
            if (avoidHighwaysEl) avoidHighwaysEl.checked = prefs.avoidHighways || false;

            const preferScenicEl = document.getElementById('preferScenic');
            if (preferScenicEl) preferScenicEl.checked = prefs.preferScenic || false;

            const preferQuietEl = document.getElementById('preferQuiet');
            if (preferQuietEl) preferQuietEl.checked = prefs.preferQuiet || false;

            const avoidUnpavedEl = document.getElementById('avoidUnpaved');
            if (avoidUnpavedEl) avoidUnpavedEl.checked = prefs.avoidUnpaved || false;

            const routeOptimizationEl = document.getElementById('routeOptimization');
            if (routeOptimizationEl) routeOptimizationEl.value = prefs.routeOptimization || 'fastest';

            const maxDetourEl = document.getElementById('maxDetour');
            if (maxDetourEl) {
                maxDetourEl.value = prefs.maxDetour || 20;
                updateDetourLabel();
            }
        }

        // Apply hazard preferences
        loadPreferences();

        // Apply parking preferences
        const parkingMaxWalkingEl = document.getElementById('parkingMaxWalkingDistance');
        const parkingTypeEl = document.getElementById('parkingPreferredType');
        const parkingPriceEl = document.getElementById('parkingPricePreference');
        const savedParking = localStorage.getItem('parkingPreferences');
        if (savedParking) {
            try {
                const parkingPrefs = JSON.parse(savedParking);
                if (parkingMaxWalkingEl) parkingMaxWalkingEl.value = parkingPrefs.maxWalkingDistance || '10';
                if (parkingTypeEl) parkingTypeEl.value = parkingPrefs.preferredType || 'any';
                if (parkingPriceEl) parkingPriceEl.value = parkingPrefs.pricePreference || 'any';
            } catch (e) {
                console.log('[Settings] Error applying parking preferences:', e);
            }
        }

        // Apply display preferences
        const mapTheme = localStorage.getItem('mapTheme') || 'standard';
        setMapTheme(mapTheme);

        const smartZoomToggle = document.getElementById('smartZoomToggle');
        if (smartZoomToggle) {
            VoyagrModules.toggleUI().applyToggleButton(smartZoomToggle, smartZoomEnabled);
        }

        // Apply ML predictions toggle state
        const mlPredictionsEnabled = localStorage.getItem('mlPredictionsEnabled') === 'true';
        const mlToggle = document.getElementById('mlPredictionsEnabled');
        if (mlToggle) {
            VoyagrModules.toggleUI().applyLabeledToggleButton(mlToggle, mlPredictionsEnabled);
        }

        // Apply voice announcements toggle state
        const voiceAnnouncementsEnabled = localStorage.getItem('voiceAnnouncementsEnabled') === 'true';
        const voiceToggle = document.getElementById('voiceAnnouncementsEnabled');
        if (voiceToggle) {
            VoyagrModules.toggleUI().applyLabeledToggleButton(voiceToggle, voiceAnnouncementsEnabled);
        }

        // Apply battery saving mode toggle state
        const batterySavingEnabled = localStorage.getItem('pref_batterySaving') === 'true';
        const batteryToggle = document.getElementById('batterySavingMode');
        if (batteryToggle) {
            VoyagrModules.toggleUI().applyLabeledToggleButton(batteryToggle, batterySavingEnabled);
        }

        // Apply gesture control toggle state
        const gestureControlEnabled = localStorage.getItem('gestureEnabled') === 'true';
        const gestureToggle = document.getElementById('gestureEnabled');
        if (gestureToggle) {
            VoyagrModules.toggleUI().applyLabeledToggleButton(gestureToggle, gestureControlEnabled);
        }

        // Apply UI theme preference
        initializeDarkMode();
        updateThemeButtons();

        // Apply auto-traffic update toggle state
        const autoTrafficToggle = document.getElementById('autoTrafficUpdateToggle');
        if (autoTrafficToggle) {
            VoyagrModules.toggleUI().applyToggleButton(autoTrafficToggle, autoTrafficUpdateEnabled);
        }

        // Apply auto-reroute on deviation toggle state
        const autoRerouteToggle = document.getElementById('autoRerouteDeviationToggle');
        if (autoRerouteToggle) {
            VoyagrModules.toggleUI().applyToggleButton(autoRerouteToggle, autoRerouteOnDeviationEnabled);
        }

        applySpeedWidgetToggleUi();

        console.log('[Settings] All settings applied to UI');
    } catch (error) {
        console.error('[Settings] Error applying settings to UI:', error);
    }
}

/**
 * resetAllSettings function
 * @function resetAllSettings
 * @returns {*} Return value description
 */
function resetAllSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        // Clear all settings from localStorage
        const keysToRemove = [
            'voyagr_all_settings',
            'unit_distance', 'unit_currency', 'unit_speed', 'unit_temperature',
            'vehicleType', 'routingMode',
            'routePreferences',
            'pref_avoid_tollRoads', 'pref_avoid_motorways', 'pref_avoid_ferries',
            'pref_tolls', 'pref_caz', 'pref_cameras',
            'mapTheme', 'smartZoomEnabled',
            'parkingPreferences'
        ];

        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Reset variables to defaults
        distanceUnit = 'km';
        currencyUnit = 'GBP';
        speedUnit = 'kmh';
        temperatureUnit = 'celsius';
        currentVehicleType = 'petrol_diesel';
        currentRoutingMode = 'auto';
        smartZoomEnabled = true;

        // Reload page to apply defaults
        location.reload();
        showStatus('✅ Settings reset to defaults', 'success');
    }
}

/**
 * exportSettings function
 * @function exportSettings
 * @returns {*} Return value description
 */
function exportSettings() {
    const settings = localStorage.getItem('voyagr_all_settings');
    if (settings) {
        const dataStr = JSON.stringify(JSON.parse(settings), null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `voyagr-settings-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        showStatus('✅ Settings exported', 'success');
    } else {
        showStatus('❌ No settings to export', 'error');
    }
}

/**
 * importSettings function
 * @function importSettings
 * @returns {*} Return value description
 */
function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const settings = JSON.parse(event.target.result);
                    localStorage.setItem('voyagr_all_settings', JSON.stringify(settings));
                    loadAllSettings();
                    applySettingsToUI();
                    showStatus('✅ Settings imported successfully', 'success');
                } catch (error) {
                    console.error('Error importing settings:', error);
                    showStatus('❌ Error importing settings', 'error');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

// Update all distance displays
/**
 * updateAllDistanceDisplays function
 * @function updateAllDistanceDisplays
 * @returns {*} Return value description
 */
function updateAllDistanceDisplays() {
    // Update main distance display
    const distanceElement = document.getElementById('distance');
    if (distanceElement && distanceElement.dataset.km) {
        const km = parseFloat(distanceElement.dataset.km);
        if (!isNaN(km)) {
            distanceElement.textContent = convertDistance(km) + ' ' + getDistanceUnit();
        }
    }

    // Update route preview distance if available
    const previewDistanceElement = document.getElementById('previewDistance');
    if (previewDistanceElement && previewDistanceElement.dataset.km) {
        const previewKm = parseFloat(previewDistanceElement.dataset.km);
        if (!isNaN(previewKm)) {
            previewDistanceElement.textContent = convertDistance(previewKm) + ' ' + getDistanceUnit();
        }
    }
}

// Update all cost displays
/**
 * updateAllCostDisplays function
 * @function updateAllCostDisplays
 * @returns {*} Return value description
 */
function updateAllCostDisplays() {
    const fuelCostEl = document.getElementById('fuelCost');
    const tollCostEl = document.getElementById('tollCost');
    const cazCostEl = document.getElementById('cazCost');
    const symbol = getCurrencySymbol();

    if (fuelCostEl && fuelCostEl.dataset.value) {
        fuelCostEl.textContent = symbol + fuelCostEl.dataset.value;
    }
    if (tollCostEl && tollCostEl.dataset.value) {
        tollCostEl.textContent = symbol + tollCostEl.dataset.value;
    }
    if (cazCostEl && cazCostEl.dataset.value) {
        cazCostEl.textContent = symbol + cazCostEl.dataset.value;
    }
}

// Update all speed displays
/**
 * updateAllSpeedDisplays function
 * @function updateAllSpeedDisplays
 * @returns {*} Return value description
 */
function updateAllSpeedDisplays() {
    const SL = _speedLimitWidget();
    const shownLimit = SL
        ? SL.pickDisplaySpeedLimitMph(
            currentSpeedLimitMph,
            null,
            lastDetectedRoadType || getCurrentRoadType(undefined, currentGpsSpeedMph),
            lastSpeedLimitRegion
        )
        : currentSpeedLimitMph;
    if (Number.isFinite(currentGpsSpeedMph) && currentGpsSpeedMph >= 0) {
        updateSpeedWidget(currentGpsSpeedMph, shownLimit);
    }
    console.log('[Units] Speed unit updated to', speedUnit);
}

// Update all temperature displays
/**
 * updateAllTemperatureDisplays function
 * @function updateAllTemperatureDisplays
 * @returns {*} Return value description
 */
function updateAllTemperatureDisplays() {
    // This will be called when weather updates occur
    console.log('[Units] Temperature unit updated to', temperatureUnit);
}

// ===== TRIP HISTORY FUNCTIONS =====
let allTrips = [];

const VOYAGR_LOCAL_TRIPS_KEY = 'voyagrLocalTrips';
const MAX_LOCAL_TRIPS = 50;

function loadRawLocalTrips() {
    try {
        const raw = localStorage.getItem(VOYAGR_LOCAL_TRIPS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function saveRawLocalTrips(entries) {
    try {
        localStorage.setItem(VOYAGR_LOCAL_TRIPS_KEY, JSON.stringify(entries));
    } catch (e) {
        console.warn('[TripHistory] localStorage save failed:', e);
    }
}

// parseLatLonString / mergeServerAndLocalTrips moved to
// modules/navigation/trip-history.js (VoyagrTripHistory).
function parseLatLonString(str) {
    return VoyagrModules.tripHistory().parseLatLonString(str);
}

/**
 * Build a completed-trip payload from the active route + form fields.
 * @returns {object|null}
 */
function buildCompletedTripRecord(route) {
    const startEl = document.getElementById('start');
    const endEl = document.getElementById('end');
    return VoyagrModules.tripHistory().buildCompletedTripRecord({
        route,
        startEl: startEl ? {
            value: startEl.value,
            lat: startEl.dataset.lat,
            lon: startEl.dataset.lon,
        } : null,
        endEl: endEl ? {
            value: endEl.value,
            lat: endEl.dataset.lat,
            lon: endEl.dataset.lon,
        } : null,
        routePolyline: typeof routePolyline !== 'undefined' ? routePolyline : null,
        routingMode: typeof currentRoutingMode !== 'undefined' ? currentRoutingMode : 'auto',
    });
}

function updateLocalTripServerId(localId, serverTripId) {
    const raw = loadRawLocalTrips();
    const idx = raw.findIndex((e) => e.localId === localId);
    if (idx >= 0) {
        raw[idx].serverId = serverTripId;
        saveRawLocalTrips(raw);
    }
}

/**
 * Save journey to device; POST to server when signed in.
 */
async function persistCompletedTrip(route) {
    const base = buildCompletedTripRecord(route);
    if (!base) {
        console.warn('[TripHistory] Could not build trip record — not saved');
        return;
    }

    const localId = Date.now();
    const entry = {
        localId,
        serverId: null,
        ...base
    };
    const raw = loadRawLocalTrips();
    raw.unshift(entry);
    saveRawLocalTrips(raw.slice(0, MAX_LOCAL_TRIPS));

    const token = await getSupabaseAccessToken();
    if (!token) {
        console.log('[TripHistory] Saved on device only (not signed in)');
        return;
    }

    try {
        const { res, data } = await fetchJsonWithAuth('/api/trip-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_lat: base.start_lat,
                start_lon: base.start_lon,
                end_lat: base.end_lat,
                end_lon: base.end_lon,
                start_address: base.start_address,
                end_address: base.end_address,
                distance_km: base.distance_km,
                duration_minutes: base.duration_minutes,
                fuel_cost: base.fuel_cost,
                toll_cost: base.toll_cost,
                caz_cost: base.caz_cost,
                routing_mode: base.routing_mode
            })
        });
        if (res.ok && data && data.success && data.trip_id) {
            updateLocalTripServerId(localId, data.trip_id);
            console.log('[TripHistory] Synced to account, trip_id:', data.trip_id);
        }
    } catch (e) {
        console.warn('[TripHistory] Server save failed (trip remains on device):', e);
    }
}

function mergeServerAndLocalTrips(serverTrips, rawLocal) {
    return VoyagrModules.tripHistory().mergeServerAndLocalTrips(serverTrips, rawLocal);
}

function removeLocalTripByLocalId(localId) {
    const raw = loadRawLocalTrips().filter((e) => e.localId !== localId);
    saveRawLocalTrips(raw);
}

function removeLocalTripByServerId(serverId) {
    const raw = loadRawLocalTrips().filter((e) => e.serverId !== serverId);
    saveRawLocalTrips(raw);
}

function escapeHtml(value) {
    return VoyagrModules.html().escapeHtml(value);
}

async function getSupabaseAccessToken() {
    try {
        if (!supabaseClient) return null;
        const { data } = await supabaseClient.auth.getSession();
        return data?.session?.access_token || null;
    } catch {
        return null;
    }
}

async function fetchJsonWithAuth(url, options = {}) {
    const token = await getSupabaseAccessToken();
    if (!token) {
        // Guest / signed-out: skip network (avoids noisy 401s for account-only APIs).
        return {
            res: { status: 401, ok: false, headers: { get: () => '' } },
            data: { success: false, error: 'Unauthorized' },
        };
    }
    const headers = { ...(options.headers || {}) };
    headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    return { res, data };
}

async function loadTripHistory() {
    try {
        const { res, data } = await fetchJsonWithAuth('/api/trip-history');

        if (res.status === 401) {
            allTrips = mergeServerAndLocalTrips([], loadRawLocalTrips());
            displayTripHistory(allTrips);
            const list = document.getElementById('tripHistoryList');
            if (list && list.firstChild) {
                const banner = document.createElement('div');
                const TH = VoyagrModules.tripHistory();
                banner.style.cssText = TH.getTripHistorySignInBannerStyleCssText();
                banner.textContent = TH.buildTripHistorySignInBannerText(allTrips.length > 0);
                list.insertBefore(banner, list.firstChild);
            }
            bindTripHistorySearch();
            return;
        }

        if (data && data.success && Array.isArray(data.trips)) {
            allTrips = mergeServerAndLocalTrips(data.trips, loadRawLocalTrips());
            displayTripHistory(allTrips);
        } else {
            allTrips = mergeServerAndLocalTrips([], loadRawLocalTrips());
            displayTripHistory(allTrips);
        }
    } catch (error) {
        console.error('Error loading trip history:', error);
        allTrips = [];
        const list = document.getElementById('tripHistoryList');
        if (list) {
            list.innerHTML = VoyagrModules.tripHistory().TRIP_HISTORY_ERROR_HTML;
        }
        bindTripHistorySearch();
    }
}
/**
 * displayTripHistory function
 * @function displayTripHistory
 * @param {*} trips - Parameter description
 * @returns {*} Return value description
 */
/**
 * Filter trips list when user types in trip search (safe for numeric/string timestamps).
 */
function bindTripHistorySearch() {
    const input = document.getElementById('tripSearchInput');
    if (!input) return;

    input.oninput = (e) => {
        const searchTerm = (e.target.value || '').toLowerCase().trim();
        if (!searchTerm) {
            displayTripHistory(allTrips);
            return;
        }
        displayTripHistory(VoyagrModules.tripHistory().filterTripsBySearch(allTrips, searchTerm));
    };
}

function displayTripHistory(trips) {
    const listContainer = document.getElementById('tripHistoryList');
    if (!listContainer) return;

    const TH = VoyagrModules.tripHistory();

    if (!trips || trips.length === 0) {
        listContainer.innerHTML = TH.EMPTY_TRIP_LIST_HTML;
        bindTripHistorySearch();
        return;
    }

    listContainer.innerHTML = trips.map((trip) => {
        const totalCost = (
            parseFloat(trip.fuel_cost || 0) +
            parseFloat(trip.toll_cost || 0) +
            parseFloat(trip.caz_cost || 0)
        ).toFixed(2);
        return TH.buildTripHistoryRowHtml(trip, {
            startAddr: escapeHtml(trip.start_address || 'Start'),
            endAddr: escapeHtml(trip.end_address || 'End'),
            dateStr: TH.formatTripListTimestamp(trip.timestamp),
            distance: convertDistance(trip.distance_km),
            distUnit: getDistanceUnit(),
            totalCost,
            symbol: getCurrencySymbol(),
        });
    }).join('');

    bindTripHistorySearch();
}

async function recalculateTrip(tripId) {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) return;

    // Populate form with trip data
    document.getElementById('start').value = trip.start_address || `${trip.start_lat},${trip.start_lon}`;
    document.getElementById('end').value = trip.end_address || `${trip.end_lat},${trip.end_lon}`;

    // Switch back to navigation tab
    switchTab('navigation');

    // Trigger route calculation
    setTimeout(() => {
        calculateRoute();
    }, 300);

    showStatus('Trip loaded. Recalculating route...', 'success');
}

async function deleteTripHistory(tripId) {
    if (!confirm('Are you sure you want to delete this trip?')) return;

    if (tripId < 0) {
        const localId = -tripId;
        removeLocalTripByLocalId(localId);
        allTrips = allTrips.filter((t) => t.id !== tripId);
        displayTripHistory(allTrips);
        showStatus('Trip removed from this device', 'success');
        return;
    }

    try {
        const token = await getSupabaseAccessToken();
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`/api/trip-history/${tripId}`, {
            method: 'DELETE'
            , headers
        });
        const data = await response.json();

        if (data.success) {
            removeLocalTripByServerId(tripId);
            allTrips = allTrips.filter(t => t.id !== tripId);
            displayTripHistory(allTrips);
            showStatus('Trip deleted', 'success');
        } else {
            showStatus('Error deleting trip', 'error');
        }
    } catch (error) {
        console.error('Error deleting trip:', error);
        showStatus('Error deleting trip', 'error');
    }
}

// ===== ROUTE COMPARISON FUNCTIONS =====
let routeOptions = [];
let selectedRouteIndex = 0;
let allRouteLayers = []; // Store all route polylines for multi-route display

// Route colors for multi-route display (from VoyagrRouteSelection module)
const ROUTE_COLORS = VoyagrRouteSelection.ROUTE_COLORS;
/** Active navigation / reroute line — matches ROUTE_COLORS[0], contrasts with green traffic tiles. */
const NAV_ACTIVE_ROUTE_COLOR = VoyagrRouteSelection.NAV_ACTIVE_ROUTE_COLOR;

/**
 * Clear ALL route layers from the map (including any orphaned layers)
 * This ensures no route artifacts remain when switching between routes
 */
function clearAllRouteLayersFromMap() {
    if (!map) return;

    try {
        const style = map.getStyle();
        if (!style || !style.layers) return;

        // Find and remove all route-related layers and sources
        const layersToRemove = [];
        const sourcesToRemove = [];

        style.layers.forEach(layer => {
            // Match route-layer-X, polyline-X patterns
            if (layer.id && (
                layer.id.startsWith('route-layer-') ||
                layer.id.startsWith('polyline-')
            )) {
                layersToRemove.push(layer.id);
            }
        });

        // Remove layers first
        layersToRemove.forEach(layerId => {
            try {
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
            } catch (e) {
                console.warn(`[Routes] Error removing layer ${layerId}:`, e.message);
            }
        });

        // Then remove sources
        Object.keys(style.sources || {}).forEach(sourceId => {
            if (sourceId.startsWith('route-layer-') || sourceId.startsWith('polyline-')) {
                sourcesToRemove.push(sourceId);
            }
        });

        sourcesToRemove.forEach(sourceId => {
            try {
                if (map.getSource(sourceId)) {
                    map.removeSource(sourceId);
                }
            } catch (e) {
                console.warn(`[Routes] Error removing source ${sourceId}:`, e.message);
            }
        });

        if (layersToRemove.length > 0 || sourcesToRemove.length > 0) {
            console.log(`[Routes] Cleared ${layersToRemove.length} layers and ${sourcesToRemove.length} sources from map`);
        }
    } catch (e) {
        console.error('[Routes] Error clearing route layers:', e);
    }
}

/**
 * Display all routes on map with different colors
 * @function displayAllRoutesOnMap
 * @returns {void}
 */
function displayAllRoutesOnMap() {
    console.log('[Routes] ===== displayAllRoutesOnMap called =====');
    console.log('[Routes] routeOptions:', routeOptions ? routeOptions.length : 0, 'routes');

    // Clear the main routeLayer if it exists
    if (routeLayer && typeof routeLayer.remove === 'function') {
        routeLayer.remove();
        routeLayer = null;
    }

    // Clear previous route layers
    allRouteLayers.forEach(layer => {
        if (layer && typeof layer.remove === 'function') {
            layer.remove();
        }
    });
    allRouteLayers = [];

    // CRITICAL: Clear any orphaned route layers from the map
    clearAllRouteLayersFromMap();

    if (!routeOptions || routeOptions.length === 0) {
        console.warn('[Routes] No routeOptions available!');
        return;
    }

    // Ensure all routes have valid polylines
    for (let i = 0; i < routeOptions.length; i++) {
        const route = routeOptions[i];
        if ((!route.polyline || route.polyline.length === 0) && route.geometry) {
            const source = (route.source || '').toLowerCase();
            const precision =
                Number.isFinite(route.geometry_precision)
                    ? route.geometry_precision
                    : (source.includes('osrm') ? 5 : 6);
            route.polyline = decodePolyline(route.geometry, precision);
        }
    }

    // Wait for style to load before adding layers
    const addRouteLayers = () => {
        console.log(`[Routes] Adding route layers (isStyleLoaded: ${map?.isStyleLoaded()})`);
        doAddRouteLayers();
    };

    if (!map) {
        console.error('[Routes] Map not available');
        return;
    }

    if (map.isStyleLoaded()) {
        addRouteLayers();
    } else {
        console.log('[Routes] Waiting for style to load...');
        map.once('style.load', addRouteLayers);
        // Also add a fallback timeout
        setTimeout(() => {
            if (allRouteLayers.length === 0) {
                console.log('[Routes] Fallback: adding layers after timeout');
                addRouteLayers();
            }
        }, 1000);
    }
}

/**
 * Actually add route layers to the map (called after style is loaded)
 */
function doAddRouteLayers() {
    // Add all routes using direct MapLibre API
    for (let i = routeOptions.length - 1; i >= 0; i--) {
        const route = routeOptions[i];
        const polylinePoints = route.polyline || [];

        console.log(`[Routes] Route ${i}: "${route.name}", polyline points: ${polylinePoints.length}`);

        if (polylinePoints.length > 0) {
            const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
            const weight = (i === selectedRouteIndex) ? 10 : (i === 0 ? 8 : 6);
            const opacity = (i === selectedRouteIndex) ? 1.0 : 0.85;

            console.log(`[Routes] Drawing route ${i} with color ${color}, weight ${weight}`);

            // Convert to [lon, lat] for MapLibre and validate
            const lngLatCoords = [];
            for (const p of polylinePoints) {
                if (Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) {
                    lngLatCoords.push([p[1], p[0]]); // [lat, lon] -> [lon, lat]
                }
            }

            if (lngLatCoords.length < 2) {
                console.error(`[Routes] Route ${i}: Not enough valid points (${lngLatCoords.length})`);
                continue;
            }

            // Use direct MapLibre API to add the layer
            const layerId = `route-layer-${i}`;
            const sourceId = `route-source-${i}`;

            try {
                // Remove existing layer/source if present
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
                if (map.getSource(sourceId)) {
                    map.removeSource(sourceId);
                }

                // Add source
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: lngLatCoords
                        }
                    }
                });

                // Find the first symbol layer to insert route before it
                // This ensures routes render BELOW labels/text
                const style = map.getStyle();
                let beforeId = undefined;
                if (style && style.layers) {
                    const symbolLayer = style.layers.find(layer =>
                        layer.type === 'symbol' &&
                        layer.layout &&
                        layer.layout['text-field']
                    );
                    if (symbolLayer) {
                        beforeId = symbolLayer.id;
                    }
                }

                // Add layer before symbol layers to keep labels on top
                map.addLayer({
                    id: layerId,
                    type: 'line',
                    source: sourceId,
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': color,
                        'line-width': MapLibreHelpers.buildZoomScaledLineWidth(weight),
                        'line-opacity': opacity
                    }
                }, beforeId);

                console.log(`[Routes] ✓ Route ${i} layer added directly: ${layerId}${beforeId ? ` (before ${beforeId})` : ''}`);

                // Create a simple layer object for tracking
                const layer = {
                    id: layerId,
                    remove: () => {
                        if (map.getLayer(layerId)) map.removeLayer(layerId);
                        if (map.getSource(sourceId)) map.removeSource(sourceId);
                    }
                };
                allRouteLayers.unshift(layer);

            } catch (e) {
                console.error(`[Routes] ✗ Error adding route ${i}:`, e);
            }
        } else {
            console.warn(`[Routes] Route ${i} has no polyline points!`);
        }
    }

    // Fit map to show all routes
    if (allRouteLayers.length > 0 && routeOptions[0] && routeOptions[0].polyline) {
        // Combine all coordinates for bounds
        const allCoords = routeOptions.flatMap(r => r.polyline || []);
        if (allCoords.length > 0) {
            MapLibreHelpers.fitMapBounds(map, allCoords, { padding: 50 });
        }
    }

    // Display hazards from all routes
    displayAllRouteHazards();

    // Ensure traffic layer stays visible if enabled
    if (showTrafficEnabled && !trafficLayer) {
        addTrafficLayer();
    }

    // CRITICAL: Move route layers to top of rendering order
    // Wait for all layers to be added before bringing them to top
    bringRoutesToTop();

    // Debug: Check what layers exist in MapLibre
    setTimeout(() => {
        const style = map.getStyle();
        if (style && style.layers) {
            const routeLayers = style.layers.filter(l => l.id.startsWith('route-layer-'));
            console.log('[Routes] DEBUG: MapLibre has these route layers:',
                routeLayers.map(l => ({ id: l.id, color: l.paint?.['line-color'] })));
        }
    }, 200);

    console.log(`[Routes] Displayed ${allRouteLayers.length} routes on map`);
}

/**
 * Bring all route layers to the top of the map rendering order
 * This ensures routes are visible above traffic edges and other overlays
 * NOTE: Routes are now inserted before symbol layers by default (via beforeId parameter),
 * so this function primarily ensures routes are above traffic/weather layers
 */
function bringRoutesToTop() {
    console.log('[Routes] bringRoutesToTop called, allRouteLayers:', allRouteLayers?.length || 0);

    if (!map) {
        console.warn('[Routes] bringRoutesToTop: map not available');
        return;
    }
    // Normal on startup: traffic/weather call this before any route is drawn (allRouteLayers empty).
    if (!allRouteLayers || allRouteLayers.length === 0) {
        return;
    }

    // Function to actually move the layers with retry logic
    const moveLayersToTop = (retryCount = 0) => {
        const maxRetries = 5;
        let allFound = true;
        const layerIds = allRouteLayers.map(l => l ? l.id : 'null');
        console.log(`[Routes] moveLayersToTop attempt ${retryCount}, layers:`, layerIds);

        try {
            // Move each route layer above traffic but below road labels
            // Find the first symbol layer with text (road labels) once for all routes
            const style = map.getStyle();
            let beforeId = undefined;
            if (style && style.layers) {
                const symbolLayer = style.layers.find(l =>
                    l.type === 'symbol' &&
                    l.layout &&
                    l.layout['text-field']
                );
                if (symbolLayer) {
                    beforeId = symbolLayer.id;
                }
            }

            allRouteLayers.forEach((layer, idx) => {
                if (layer && layer.id) {
                    const exists = map.getLayer(layer.id);
                    if (exists) {
                        // Move layer to just before symbol layers (above traffic, below labels)
                        map.moveLayer(layer.id, beforeId);
                        console.log(`[Routes] Moved layer ${layer.id}${beforeId ? ` before ${beforeId}` : ' to top'}`);
                    } else {
                        allFound = false;
                        console.log(`[Routes] Layer ${layer.id} not found in map yet`);
                    }
                }
            });

            // If not all layers were found and we haven't exceeded retries, try again
            if (!allFound && retryCount < maxRetries) {
                setTimeout(() => moveLayersToTop(retryCount + 1), 100);
            } else if (allFound) {
                console.log('[Routes] All route layers successfully positioned');
                // Ensure labels stay on top as a safety measure
                ensureLabelsOnTop();
            } else {
                console.warn('[Routes] Some layers not found after retries');
            }
        } catch (e) {
            console.warn('[Routes] Error bringing routes to top:', e);
        }
    };

    // Use a small delay to let MapLibre process the layers, then move them
    setTimeout(() => {
        if (map.isStyleLoaded()) {
            moveLayersToTop(0);
        } else {
            console.log('[Routes] Waiting for map idle...');
            map.once('idle', () => moveLayersToTop(0));
        }
    }, 100);
}

// ===== DRAGGABLE ROUTE EDITING =====
let routeDragMarkers = [];  // Markers for dragging route points
let routeEditingEnabled = false;

/**
 * Enable route editing by adding draggable waypoints along the route
 */
function enableRouteEditing() {
    if (!routePath || routePath.length < 2) {
        showStatus('No route to edit', 'error');
        return;
    }

    routeEditingEnabled = true;
    clearRouteDragMarkers();

    // Add drag markers at intervals along the route (every ~5km or ~20 points)
    const interval = Math.max(10, Math.floor(routePath.length / 15));

    for (let i = interval; i < routePath.length - interval; i += interval) {
        const point = routePath[i];
        addRouteDragMarker(point[0], point[1], i);
    }

    showStatus(`🖐️ Drag the orange markers to modify the route (${routeDragMarkers.length} edit points)`, 'info');
    console.log(`[Route Edit] Added ${routeDragMarkers.length} drag markers`);
}

/**
 * Add a draggable marker for route editing
 */
function addRouteDragMarker(lat, lon, routeIndex) {
    const WP = VoyagrModules.waypoints();
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'route-drag-marker',
        html: WP.buildRouteDragMarkerHtml(),
        iconSize: WP.ROUTE_DRAG_MARKER_ICON_SIZE,
        iconAnchor: [10, 10]
    }).addTo(map);

    // Note: MapLibre markers are not natively draggable like Leaflet
    // We'll use custom drag handling
    const el = marker.getElement();
    if (el) {
        el.style.cursor = 'grab';
    }

    marker.routeIndex = routeIndex;
    marker.originalLat = lat;
    marker.originalLon = lon;

    routeDragMarkers.push(marker);
}

/**
 * Add a via-point from route dragging and recalculate
 */
async function addDraggedViaPoint(lat, lon) {
    // Add as via-point
    const viaPoint = {
        lat: lat,
        lon: lon,
        name: `Drag point ${viaPoints.length + 1}`,
        type: 'via'
    };
    viaPoints.push(viaPoint);

    // Add visual marker with MapLibre
    const WP = VoyagrModules.waypoints();
    const viaIndex = viaPoints.length - 1;
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'via-point-marker',
        html: WP.buildViaPointDragAddedMarkerHtml(),
        iconSize: WP.WAYPOINT_MARKER_ICON_SIZE,
        iconAnchor: [14, 14],
        popup: WP.buildViaPointDragPopupHtml('removeViaPoint(' + viaIndex + ')')
    }).addTo(map);

    viaPointMarkers.push(marker);
    updateWaypointsList();

    // Clear drag markers and recalculate route
    clearRouteDragMarkers();
    showStatus('🔄 Recalculating route with new via-point...', 'info');

    // Recalculate route
    await calculateRoute();
}

/**
 * Clear all route drag markers
 */
function clearRouteDragMarkers() {
    routeDragMarkers.forEach(marker => {
        if (marker && typeof marker.remove === 'function') {
            marker.remove();
        }
    });
    routeDragMarkers = [];
    routeEditingEnabled = false;
}

/**
 * Toggle route editing mode
 */
function toggleRouteEditing() {
    if (routeEditingEnabled) {
        clearRouteDragMarkers();
        showStatus('Route editing disabled', 'info');
    } else {
        enableRouteEditing();
    }

    // Update button state
    const btn = document.getElementById('editRouteBtn');
    if (btn) {
        btn.classList.toggle('active', routeEditingEnabled);
        btn.textContent = routeEditingEnabled ? '✏️ Editing... (click to stop)' : '✏️ Edit Route';
    }
}

/**
 * displayRouteComparison function - Shows distinct route types with hazard counts
 * @function displayRouteComparison
 * @returns {void}
 */
function displayRouteComparison() {
    const listContainer = document.getElementById('routeComparisonList');
    if (!routeOptions || routeOptions.length === 0) {
        listContainer.innerHTML = VoyagrModules.routeSelection().buildRouteComparisonListHtml([], {});
        return;
    }

    listContainer.innerHTML = VoyagrModules.routeSelection().buildRouteComparisonListHtml(routeOptions, {
        selectedIndex: selectedRouteIndex,
        routeColors: ROUTE_COLORS,
        currencySymbol: getCurrencySymbol(),
        distUnit: getDistanceUnit(),
        distanceTexts: routeOptions.map((route) => convertDistance(route.distance_km)),
    });
}

// ===== VIA-POINTS AND STOPS FUNCTIONALITY =====
let viaPoints = [];  // Array of {lat, lon, name, type: 'via'}
let stops = [];      // Array of {lat, lon, name, type: 'stop', duration: 15}
let viaPointMarkers = [];
let stopMarkers = [];
let addingViaPoint = false;
let addingStop = false;

/**
 * Toggle via-point adding mode
 */
function toggleAddViaPoint() {
    addingViaPoint = !addingViaPoint;
    addingStop = false;

    const btn = document.getElementById('addViaPointBtn');
    if (btn) {
        btn.classList.toggle('active', addingViaPoint);
        btn.textContent = addingViaPoint ? '📍 Click map to add via-point' : '📍 Add Via-Point';
    }

    if (addingViaPoint) {
        showStatus('Click on the map to add a via-point', 'info');
        map.getContainer().style.cursor = 'crosshair';
    } else {
        map.getContainer().style.cursor = '';
    }
}

/**
 * Toggle stop adding mode
 */
function toggleAddStop() {
    addingStop = !addingStop;
    addingViaPoint = false;

    const btn = document.getElementById('addStopBtn');
    if (btn) {
        btn.classList.toggle('active', addingStop);
        btn.textContent = addingStop ? '🛑 Click map to add stop' : '🛑 Add Stop';
    }

    if (addingStop) {
        showStatus('Click on the map to add a stop', 'info');
        map.getContainer().style.cursor = 'crosshair';
    } else {
        map.getContainer().style.cursor = '';
    }
}

/**
 * Handle map click for adding via-points or stops
 */
function handleMapClickForWaypoints(e) {
    const lat = e.lngLat.lat;
    const lon = e.lngLat.lng;
    if (addingViaPoint) {
        addViaPoint(lat, lon);
        toggleAddViaPoint();
    } else if (addingStop) {
        addStop(lat, lon);
        toggleAddStop();
    }
}

async function addViaPointFromAddress() {
    const input = document.getElementById('viaPointAddress');
    if (!input) return;

    const lat = input.dataset.lat;
    const lon = input.dataset.lon;
    const name = input.dataset.displayName || input.value.trim();

    if (lat && lon) {
        addViaPoint(parseFloat(lat), parseFloat(lon), name);
        input.value = '';
        delete input.dataset.lat;
        delete input.dataset.lon;
        delete input.dataset.displayName;
        const dd = getAutocompleteDropdown('viaPointAddress');
        if (dd) dd.classList.remove('show');
        return;
    }

    const query = input.value.trim();
    if (!query) {
        showStatus('Type an address to add as via-point', 'info');
        return;
    }

    showStatus('🔍 Looking up via-point address...', 'loading');
    const result = await geocodeAddress(query);
    if (result) {
        addViaPoint(result.lat, result.lon, result.display_name || query);
        input.value = '';
        showStatus(`📍 Via-point added: ${result.display_name || query}`, 'success');
    } else {
        showStatus('❌ Could not find that address', 'error');
    }
}

async function addStopFromAddress() {
    const input = document.getElementById('stopAddress');
    if (!input) return;

    const lat = input.dataset.lat;
    const lon = input.dataset.lon;
    const name = input.dataset.displayName || input.value.trim();

    if (lat && lon) {
        addStop(parseFloat(lat), parseFloat(lon), name);
        input.value = '';
        delete input.dataset.lat;
        delete input.dataset.lon;
        delete input.dataset.displayName;
        const dd = getAutocompleteDropdown('stopAddress');
        if (dd) dd.classList.remove('show');
        return;
    }

    const query = input.value.trim();
    if (!query) {
        showStatus('Type an address to add as stop', 'info');
        return;
    }

    showStatus('🔍 Looking up stop address...', 'loading');
    const result = await geocodeAddress(query);
    if (result) {
        addStop(result.lat, result.lon, result.display_name || query);
        input.value = '';
        showStatus(`🛑 Stop added: ${result.display_name || query}`, 'success');
    } else {
        showStatus('❌ Could not find that address', 'error');
    }
}

/**
 * Add a via-point at given coordinates
 */
function addViaPoint(lat, lon, name = null) {
    const pointName = name || `Via-point ${viaPoints.length + 1}`;
    viaPoints.push({ lat, lon, name: pointName, type: 'via' });

    const WP = VoyagrModules.waypoints();
    const viaIndex = viaPoints.length - 1;
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'via-point-marker',
        html: WP.buildViaPointMarkerHtml(viaPoints.length),
        iconSize: WP.WAYPOINT_MARKER_ICON_SIZE,
        iconAnchor: [14, 14],
        popup: WP.buildViaPointPopupHtml(pointName, 'removeViaPoint(' + viaIndex + ')')
    }).addTo(map);

    viaPointMarkers.push(marker);
    updateWaypointsList();
    showStatus(`Added via-point: ${pointName}`, 'success');
}

/**
 * Add a stop at given coordinates
 */
function addStop(lat, lon, name = null, duration = 15) {
    const stopName = name || `Stop ${stops.length + 1}`;
    stops.push({ lat, lon, name: stopName, type: 'stop', duration });

    const WP = VoyagrModules.waypoints();
    const stopIndex = stops.length - 1;
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'stop-marker',
        html: WP.buildStopMarkerHtml(),
        iconSize: WP.WAYPOINT_MARKER_ICON_SIZE,
        iconAnchor: [14, 14],
        popup: WP.buildStopPopupHtml(stopName, duration, 'removeStop(' + stopIndex + ')')
    }).addTo(map);

    stopMarkers.push(marker);
    updateWaypointsList();
    showStatus(`Added stop: ${stopName} (${duration} min)`, 'success');
}

/**
 * Remove a via-point
 */
function removeViaPoint(index) {
    if (index >= 0 && index < viaPoints.length) {
        viaPoints.splice(index, 1);
        if (viaPointMarkers[index] && typeof viaPointMarkers[index].remove === 'function') {
            viaPointMarkers[index].remove();
        }
        viaPointMarkers.splice(index, 1);
        updateWaypointsList();
        refreshViaPointMarkers();
        showStatus('Via-point removed', 'info');
    }
}

/**
 * Remove a stop
 */
function removeStop(index) {
    if (index >= 0 && index < stops.length) {
        stops.splice(index, 1);
        if (stopMarkers[index] && typeof stopMarkers[index].remove === 'function') {
            stopMarkers[index].remove();
        }
        stopMarkers.splice(index, 1);
        updateWaypointsList();
        showStatus('Stop removed', 'info');
    }
}

/**
 * Refresh via-point markers (update numbers after removal)
 */
function refreshViaPointMarkers() {
    viaPointMarkers.forEach((marker, idx) => {
        if (marker && typeof marker.remove === 'function') {
            marker.remove();
        }
    });
    viaPointMarkers = [];

    viaPoints.forEach((point, idx) => {
        const WP = VoyagrModules.waypoints();
        const marker = MapLibreHelpers.createMarker(point.lat, point.lon, {
            className: 'via-point-marker',
            html: WP.buildViaPointMarkerHtml(idx + 1),
            iconSize: WP.WAYPOINT_MARKER_ICON_SIZE,
            iconAnchor: [14, 14],
            popup: WP.buildViaPointPopupHtml(point.name, 'removeViaPoint(' + idx + ')')
        }).addTo(map);

        viaPointMarkers.push(marker);
    });
}

/**
 * Clear all via-points and stops
 */
function clearAllWaypoints() {
    viaPoints = [];
    stops = [];
    viaPointMarkers.forEach(m => { if (m && typeof m.remove === 'function') m.remove(); });
    stopMarkers.forEach(m => { if (m && typeof m.remove === 'function') m.remove(); });
    viaPointMarkers = [];
    stopMarkers = [];
    clearMultiDropLayers();
    updateWaypointsList();
    showStatus('All waypoints cleared', 'info');
}

/**
 * Update the waypoints list display with drag-to-reorder
 */
function updateWaypointsList() {
    const container = document.getElementById('waypointsList');
    if (!container) return;
    container.innerHTML = VoyagrModules.waypoints().buildWaypointsListHtml(viaPoints, stops);
}

let _draggedWaypoint = null;

function onWaypointDragStart(e) {
    _draggedWaypoint = { type: e.target.dataset.type, index: parseInt(e.target.dataset.index) };
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

function onWaypointDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function onWaypointDrop(e) {
    e.preventDefault();
    const target = voyagrClosest(e.target, '.waypoint-item');
    if (!target || !_draggedWaypoint) return;

    const targetType = target.dataset.type;
    const targetIdx = parseInt(target.dataset.index);

    if (_draggedWaypoint.type === targetType) {
        const arr = _draggedWaypoint.type === 'via' ? viaPoints : stops;
        const markerArr = _draggedWaypoint.type === 'via' ? viaPointMarkers : stopMarkers;
        const item = arr.splice(_draggedWaypoint.index, 1)[0];
        const marker = markerArr.splice(_draggedWaypoint.index, 1)[0];
        arr.splice(targetIdx, 0, item);
        markerArr.splice(targetIdx, 0, marker);
        updateWaypointsList();
    }
    _draggedWaypoint = null;
    document.querySelectorAll('.waypoint-item').forEach(el => el.style.opacity = '1');
}

function moveWaypoint(type, index, direction) {
    const arr = type === 'via' ? viaPoints : stops;
    const markerArr = type === 'via' ? viaPointMarkers : stopMarkers;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= arr.length) return;
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    [markerArr[index], markerArr[newIndex]] = [markerArr[newIndex], markerArr[index]];
    updateWaypointsList();
    if (type === 'via') refreshViaPointMarkers();
}

/**
 * Display multi-drop route leg breakdown in the waypoints area
 */
function displayMultiDropLegs(data) {
    const container = document.getElementById('waypointsList');
    if (!container || !data.legs) return;

    container.innerHTML += VoyagrModules.waypoints().buildMultiDropItineraryHtml(data, {
        distUnit: getDistanceUnit(),
        totalDistanceText: convertDistance(data.total_distance_km),
        legDistanceTexts: data.legs.map((leg) => convertDistance(leg.distance_km || 0)),
        formatEtaClock: (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    // Draw multi-drop leg geometries on map with different colors
    if (data.all_geometry && data.all_geometry.length > 0) {
        drawMultiDropLegsOnMap(data);
    }
}

/**
 * Draw multi-drop route legs on the map with distinct colors per leg
 */
function drawMultiDropLegsOnMap(data) {
    if (!map || !data.all_geometry) return;

    const legColors = VoyagrModules.waypoints().MULTIDROP_LEG_COLORS;

    data.all_geometry.forEach((geom, idx) => {
        if (!geom) return;
        try {
            const precision = (data.legs && data.legs[idx]) ?
                              (data.legs[idx].geometry_precision || 6) : 6;
            const decoded = decodePolyline(geom, precision);
            if (decoded.length < 2) return;

            const coords = decoded.map(p => [p[1], p[0]]);
            const layerId = `multidrop-leg-${idx}`;
            const sourceId = `multidrop-leg-source-${idx}`;

            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);

            map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords }
                }
            });

            map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': legColors[idx % legColors.length],
                    'line-width': MapLibreHelpers.buildZoomScaledLineWidth(5),
                    'line-opacity': 0.85
                }
            });
        } catch (e) {
            console.warn(`[MultiDrop] Failed to draw leg ${idx}:`, e);
        }
    });
}

/**
 * Clear multi-drop leg layers from map
 */
function clearMultiDropLayers() {
    if (!map) return;
    for (let i = 0; i < 25; i++) {
        const layerId = `multidrop-leg-${i}`;
        const sourceId = `multidrop-leg-source-${i}`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
    }
}

/**
 * Get all waypoints for route calculation (start + viaPoints + stops + end)
 */
function getOrderedWaypoints(startLat, startLon, endLat, endLon) {
    return VoyagrModules.routeSelection().orderWaypointsGreedy(
        startLat, startLon, endLat, endLon, viaPoints, stops
    );
}

/**
 * selectRoute function - shows only the selected route and hides others
 * @function selectRoute
 * @param {number} index - Route index to select
 */
function selectRoute(index) {
    selectedRouteIndex = index;

    // Hide all route layers except the selected one
    displaySingleRoute(index);

    // Update the route list display
    displayRouteComparison();

    if (routeOptions && routeOptions[index]) {
        syncLastCalculatedRouteFromSelection(index);
        const selectedRoute = routeOptions[index];
        console.log(`[Routes] Selected route "${selectedRoute.name}" with ${(selectedRoute.maneuvers || []).length} maneuvers`);

        // Keep navigation tab trip summary aligned with the chosen alternative
        updateTripInfoFromRouteOption(selectedRoute);

        // Full API payload when available so preview hazard/cost fields stay coherent
        const previewPayload = window.lastRouteApiResponse
            ? { ...window.lastRouteApiResponse, routes: routeOptions }
            : selectedRoute;
        showRoutePreview(previewPayload, true);
    }
}

/**
 * Apply formatted trip info values to the navigation panel DOM.
 * @param {Object} display
 */
function applyTripInfoDisplayValues(display) {
    if (!display) return;

    const distanceEl = document.getElementById('distance');
    const timeEl = document.getElementById('time');
    const fuelEl = document.getElementById('fuelCost');
    const tollEl = document.getElementById('tollCost');
    if (distanceEl) {
        distanceEl.textContent = display.distanceText + ' ' + display.distUnit;
        distanceEl.dataset.km = display.distanceKm;
    }
    if (timeEl) timeEl.textContent = display.durationMinutes + ' min';
    if (fuelEl) {
        fuelEl.textContent = display.fuelCostText;
        fuelEl.dataset.value = display.fuelCost;
    }
    if (tollEl) {
        tollEl.textContent = display.tollCostText;
        tollEl.dataset.value = display.tollCost;
    }
}

/**
 * Update navigation tab distance/time/cost from a route option object.
 * @param {Object} route
 */
function updateTripInfoFromRouteOption(route) {
    if (!route) return;
    const display = VoyagrModules.routeSelection().buildTripInfoDisplayValues(route, {
        distanceText: convertDistance(route.distance_km),
        distUnit: getDistanceUnit(),
        currencySymbol: getCurrencySymbol(),
    });
    if (!display) return;

    applyTripInfoDisplayValues(display);
    console.log('[Cost] Route selected with costs:', {
        fuelCost: display.fuelCost.toFixed(2),
        tollCost: display.tollCost.toFixed(2),
        cazCost: display.cazCost.toFixed(2),
    });
}

/**
 * Display only a single route on the map
 * @param {number} index - Route index to display
 */
function displaySingleRoute(index) {
    console.log(`[Routes] displaySingleRoute(${index}) - clearing all existing routes`);

    // Clear the main routeLayer if it exists (MapLibre compatible)
    if (routeLayer) {
        if (typeof routeLayer.remove === 'function') routeLayer.remove();
        routeLayer = null;
    }

    // Clear all tracked route layers
    allRouteLayers.forEach(layer => {
        if (layer && typeof layer.remove === 'function') {
            layer.remove();
        }
    });
    allRouteLayers = [];

    // CRITICAL: Also remove any route layers directly from MapLibre
    // This catches any layers that weren't properly tracked
    clearAllRouteLayersFromMap();

    if (!routeOptions || !routeOptions[index]) return;

    const route = routeOptions[index];
    const polylinePoints = route.polyline || [];

    if (polylinePoints.length > 0) {
        const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
        const layer = MapLibreHelpers.addPolyline(map, polylinePoints, {
            color: color,
            weight: 8,
            opacity: 1.0
        });

        allRouteLayers.push(layer);

        // Fit map to the selected route
        MapLibreHelpers.fitMapBounds(map, polylinePoints, { padding: 50 });
    }

    // Display hazards for the selected route only
    if (route.hazards && route.hazards.length > 0) {
        displayHazardMarkers(route.hazards);
    } else {
        clearHazardMarkers();
    }

    // Ensure TomTom traffic layer stays visible if enabled (surrounding area traffic)
    if (showTrafficEnabled && !trafficLayer) {
        addTrafficLayer();
    }

    // Display route-specific traffic edges if enabled
    if (routeTrafficEnabled && polylinePoints.length > 0) {
        routePolyline = polylinePoints;
        fetchAndDisplayRouteTraffic();
    }

    // Traffic lights: when route hazards already include OSM signals, use hazard markers only
    // (same OSM data as /api/traffic-lights — avoids two marker styles stacked on the map).
    if (polylinePoints.length > 0) {
        const plotRouteTrafficLights =
            (typeof window !== 'undefined' &&
             window.TrafficLights &&
             typeof window.TrafficLights.plotTrafficLightsOnRoute === 'function')
                ? window.TrafficLights.plotTrafficLightsOnRoute
                : (typeof plotTrafficLightsOnRoute === 'function' ? plotTrafficLightsOnRoute : null);

        const hasOsmTlsInHazards = !!(route.hazards && route.hazards.some(h => {
            if (!h || !h.type) return false;
            const t = String(h.type);
            return t === 'traffic_light' || t === 'traffic_signals' || t === 'traffic_signal';
        }));

        const tlEnabled = window.TrafficLights && typeof window.TrafficLights.isEnabled === 'function' && window.TrafficLights.isEnabled();

        if (window.TrafficLights && typeof window.TrafficLights.clearAllTrafficLights === 'function') {
            if (hasOsmTlsInHazards || !tlEnabled) {
                window.TrafficLights.clearAllTrafficLights();
            }
        }

        if (plotRouteTrafficLights && tlEnabled && !hasOsmTlsInHazards) {
            console.log('[Routes] Plotting traffic lights on selected route (OSM via /api/traffic-lights)');
            plotRouteTrafficLights(polylinePoints);
        } else if (hasOsmTlsInHazards) {
            console.log('[Routes] Traffic lights on route from hazard markers (OSM); skipping duplicate plot');
        } else if (!plotRouteTrafficLights) {
            console.warn('[Routes] Traffic lights module not available for route plotting');
        }
    }

    console.log(`[Routes] Showing only route ${index + 1}: ${route.name}`);
}

/**
 * Show all routes on the map (called by "Show All Routes" button)
 */
function showAllRoutes() {
    displayAllRoutesOnMap();
    showStatus(`Showing all ${routeOptions.length} routes`, 'info');
}
/**
 * useRoute function
 * @function useRoute
 * @param {*} index - Parameter description
 * @returns {*} Return value description
 */
function useRoute(index) {
    const route = routeOptions[index];
    if (!route) return;

    selectedRouteIndex = index;
    syncLastCalculatedRouteFromSelection(index);
    updateTripInfoFromRouteOption(route);

    // Display traffic edges on selected route if enabled
    const polylinePoints = route.polyline || [];
    if (routeTrafficEnabled && polylinePoints.length > 0) {
        routePolyline = polylinePoints; // Temporarily set for traffic display
        fetchAndDisplayRouteTraffic();
    }

    showStatus('Route selected. Ready to navigate!', 'success');
    // switchTab('navigation'); // Removed to keep current tab (e.g. Preview) active
}

// ===== ROUTE SHARING FUNCTIONS =====
/**
 * Build encoded share URL from current route (optionally omit geometry for QR).
 * @param {boolean} [includeGeometry=true]
 * @returns {{ shareLink: string, encodedRoute: string }|null}
 */
function buildEncodedShareLink(includeGeometry) {
    if (!window.lastCalculatedRoute) return null;
    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    const sharing = VoyagrModules.routeSharing();
    const payload = sharing.buildShareableRoutePayload(route, startInput, endInput, includeGeometry);
    const encodedRoute = sharing.encodeRoutePayload(payload);
    return {
        shareLink: sharing.buildShareUrl(window.location.origin, encodedRoute),
        encodedRoute: encodedRoute,
    };
}

/**
 * Load a shared route from the `?route=` URL query param when present.
 * @returns {boolean} true when a shared route was applied
 */
function loadSharedRouteFromUrl() {
    const sharing = VoyagrModules.routeSharing();
    const encoded = sharing.extractRouteParamFromSearch(window.location.search);
    if (!encoded) return false;

    const payload = sharing.decodeRoutePayload(encoded);
    if (!payload || !payload.start || !payload.end) {
        console.warn('[RouteSharing] Invalid shared route payload in URL');
        return false;
    }

    const startEl = document.getElementById('start');
    const endEl = document.getElementById('end');
    if (startEl) startEl.value = payload.start;
    if (endEl) endEl.value = payload.end;

    window.lastCalculatedRoute = sharing.buildLastCalculatedRouteFromSharedPayload(payload);
    updateTripInfoFromRouteOption(window.lastCalculatedRoute);

    try {
        const cleanUrl = sharing.stripRouteParamFromUrl(window.location.href);
        window.history.replaceState({}, '', cleanUrl);
    } catch (e) {
        console.warn('[RouteSharing] URL cleanup failed:', e);
    }

    if (window.lastCalculatedRoute.geometry) {
        showRoutePreview(window.lastCalculatedRoute, false);
    } else {
        showStatus('Shared route loaded', 'success');
    }
    return true;
}

/**
 * prepareRouteSharing function
 * @function prepareRouteSharing
 * @returns {*} Return value description
 */
function prepareRouteSharing() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    const symbol = getCurrencySymbol();
    const summary = VoyagrModules.routeSharing().buildRouteShareSummaryValues(route, {
        startLabel: startInput,
        endLabel: endInput,
        distanceText: convertDistance(route.distance_km || 0),
        distUnit: getDistanceUnit(),
        currencySymbol: symbol,
    });

    document.getElementById('shareStart').textContent = `Start: ${summary.startLabel}`;
    document.getElementById('shareEnd').textContent = `End: ${summary.endLabel}`;
    document.getElementById('shareDistance').textContent = `Distance: ${summary.distanceText} ${summary.distUnit}`;
    document.getElementById('shareTime').textContent = `Duration: ${summary.durationText}`;
    document.getElementById('shareCost').textContent = `Total Cost: ${summary.totalCostText}`;

    console.log('[Cost] Route sharing prepared with costs:', {
        distanceUnit: distanceUnit,
        totalCost: summary.totalCost.toFixed(2),
    });
}

/**
 * generateShareLink function
 * @function generateShareLink
 * @returns {*} Return value description
 */
function generateShareLink() {
    const built = buildEncodedShareLink(true);
    if (!built) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    document.getElementById('shareLink').value = built.shareLink;
    document.getElementById('shareLinkContainer').style.display = 'block';
    document.getElementById('qrCodeContainer').style.display = 'none';

    showStatus('Share link generated!', 'success');
}

/**
 * copyShareLink function
 * @function copyShareLink
 * @returns {*} Return value description
 */
function copyShareLink() {
    const shareLink = document.getElementById('shareLink');
    shareLink.select();
    document.execCommand('copy');
    showStatus('Link copied to clipboard!', 'success');
}

/**
 * generateQRCode function
 * @function generateQRCode
 * @returns {*} Return value description
 */
function generateQRCode() {
    const built = buildEncodedShareLink(false);
    if (!built) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const shareLink = built.shareLink;
    const RS = VoyagrModules.routeSharing();

    // Clear previous QR code
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';

    const qrImageUrl = RS.buildQrCodeImageUrl(shareLink);
    const qrImage = document.createElement('img');
    qrImage.src = qrImageUrl;
    qrImage.alt = 'Route QR Code';
    qrImage.style.cssText = RS.getQrCodeImageStyleCssText();
    qrContainer.appendChild(qrImage);

    // Store QR image URL for download
    window.qrImageUrl = qrImageUrl;

    document.getElementById('qrCodeContainer').style.display = 'block';
    document.getElementById('shareLinkContainer').style.display = 'none';

    showStatus('QR code generated!', 'success');
}

/**
 * downloadQRCode function
 * @function downloadQRCode
 * @returns {*} Return value description
 */
function downloadQRCode() {
    if (!window.qrImageUrl) {
        showStatus('Generate QR code first', 'error');
        return;
    }

    const link = document.createElement('a');
    link.href = window.qrImageUrl;
    link.download = 'route-qr-code.png';
    link.click();

    showStatus('QR code downloaded!', 'success');
}

/**
 * shareViaWhatsApp function
 * @function shareViaWhatsApp
 * @returns {*} Return value description
 */
function shareViaWhatsApp() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const message = VoyagrModules.routeSharing().buildShareWhatsAppMessage(route, {
        startLabel: document.getElementById('start').value,
        endLabel: document.getElementById('end').value,
        distanceText: convertDistance(route.distance_km),
        distUnit: getDistanceUnit(),
        currencySymbol: getCurrencySymbol(),
    });

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    showStatus('Opening WhatsApp...', 'success');
}

/**
 * shareViaEmail function
 * @function shareViaEmail
 * @returns {*} Return value description
 */
function shareViaEmail() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    const sharing = VoyagrModules.routeSharing();
    const fmt = {
        startLabel: startInput,
        endLabel: endInput,
        distanceText: convertDistance(route.distance_km),
        distUnit: getDistanceUnit(),
        currencySymbol: getCurrencySymbol(),
    };
    const subject = sharing.buildShareEmailSubject(startInput, endInput);
    const body = sharing.buildShareEmailBody(route, fmt);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showStatus('Opening email client...', 'success');
}

// ===== ROUTE ANALYTICS FUNCTIONS =====
/**
 * loadRouteAnalytics function
 * @function loadRouteAnalytics
 * @returns {*} Return value description
 */
function loadRouteAnalytics() {
    fetchJsonWithAuth('/api/trip-analytics')
        .then(({ res, data }) => {
            if (res.status === 401) {
                showStatus('Sign in to view trip analytics', 'info');
                return;
            }
            if (res.status === 403 && data && data.code === 'premium_required') {
                showStatus(data.error || 'Premium access required — redeem a promo code in Settings → Account.', 'info');
                return;
            }
            if (data.success) displayAnalytics(data);
            else showStatus('Failed to load analytics', 'error');
        })
        .catch(error => {
            console.error('Analytics error:', error);
            showStatus('Error loading analytics', 'error');
        });
}
/**
 * displayAnalytics function
 * @function displayAnalytics
 * @param {*} data - Parameter description
 * @returns {*} Return value description
 */
function displayAnalytics(data) {
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();
    const display = VoyagrModules.tripHistory().buildAnalyticsDisplayValues(data, {
        currencySymbol: symbol,
        totalDistanceText: convertDistance(data.total_distance_km || 0),
        speedUnit: speedUnit,
        speedUnitLabel: getSpeedUnit(),
    });

    document.getElementById('totalTrips').textContent = display.totalTrips;
    document.getElementById('totalDistance').textContent = `${display.totalDistanceText} ${distUnit}`;
    document.getElementById('totalCost').textContent = display.totalCostText;
    document.getElementById('avgDuration').textContent = display.avgDurationText;
    document.getElementById('totalFuelCost').textContent = display.totalFuelCostText;
    document.getElementById('totalTollCost').textContent = display.totalTollCostText;
    document.getElementById('totalCAZCost').textContent = display.totalCazCostText;
    document.getElementById('totalTime').textContent = display.totalTimeText;
    document.getElementById('avgSpeed').textContent = display.avgSpeedText;

    const frequentRoutesList = document.getElementById('frequentRoutesList');
    frequentRoutesList.innerHTML = VoyagrModules.tripHistory().buildFrequentRoutesListHtml(
        data.frequent_routes || [],
        {
            escapeHtml: escapeHtml,
            currencySymbol: symbol,
            distUnit: distUnit,
            distanceTexts: (data.frequent_routes || []).map((route) => convertDistance(route.avg_distance)),
        }
    );
}

// ===== ADVANCED ROUTE PREFERENCES FUNCTIONS =====
/**
 * saveRoutePreferences function
 * @function saveRoutePreferences
 * @returns {*} Return value description
 */
function saveRoutePreferences() {
    const preferences = {
        avoidHighways: document.getElementById('avoidHighways')?.checked || false,
        preferScenic: document.getElementById('preferScenic')?.checked || false,
        avoidTolls: isAvoidTollsEnabled(),
        avoidCAZ: localStorage.getItem('pref_caz') !== 'false',
        preferQuiet: document.getElementById('preferQuiet')?.checked || false,
        avoidUnpaved: document.getElementById('avoidUnpaved')?.checked || false,
        routeOptimization: document.getElementById('routeOptimization')?.value || 'fastest',
        maxDetour: parseInt(document.getElementById('maxDetour')?.value || 20)
    };

    localStorage.setItem('routePreferences', JSON.stringify(preferences));
    saveAllSettings();
    showStatus('Route preferences saved!', 'success');
}

function saveMultiDropPreferences() {
    const optimizeEl = document.getElementById('optimizeStopOrder');
    const roundTripEl = document.getElementById('roundTrip');
    const trafficEl = document.getElementById('trafficAwareRouting');
    const closuresEl = document.getElementById('avoidRoadClosures');
    const incidentsEl = document.getElementById('avoidIncidents');
    const departureEl = document.getElementById('departureTime');

    if (optimizeEl) localStorage.setItem('pref_optimizeStopOrder', optimizeEl.checked ? 'true' : 'false');
    if (roundTripEl) localStorage.setItem('pref_roundTrip', roundTripEl.checked ? 'true' : 'false');
    if (trafficEl) localStorage.setItem('pref_trafficAwareRouting', trafficEl.checked ? 'true' : 'false');
    if (closuresEl) localStorage.setItem('pref_avoidRoadClosures', closuresEl.checked ? 'true' : 'false');
    if (incidentsEl) localStorage.setItem('pref_avoidIncidents', incidentsEl.checked ? 'true' : 'false');
    if (departureEl) localStorage.setItem('pref_departureTime', departureEl.value || '');

    saveAllSettings();
    showStatus('Multi-drop preferences saved!', 'success');
}

function loadMultiDropPreferences() {
    ensureDefaultTrafficAwareRouting();
    const optimizeEl = document.getElementById('optimizeStopOrder');
    const roundTripEl = document.getElementById('roundTrip');
    const trafficEl = document.getElementById('trafficAwareRouting');
    const closuresEl = document.getElementById('avoidRoadClosures');
    const incidentsEl = document.getElementById('avoidIncidents');
    const departureEl = document.getElementById('departureTime');

    if (optimizeEl) optimizeEl.checked = localStorage.getItem('pref_optimizeStopOrder') !== 'false';
    if (roundTripEl) roundTripEl.checked = localStorage.getItem('pref_roundTrip') === 'true';
    if (trafficEl) trafficEl.checked = localStorage.getItem('pref_trafficAwareRouting') !== 'false';
    if (closuresEl) closuresEl.checked = localStorage.getItem('pref_avoidRoadClosures') !== 'false';
    if (incidentsEl) incidentsEl.checked = localStorage.getItem('pref_avoidIncidents') !== 'false';
    if (departureEl) departureEl.value = localStorage.getItem('pref_departureTime') || '';
}

function clearDepartureTime() {
    const el = document.getElementById('departureTime');
    if (el) el.value = '';
    localStorage.removeItem('pref_departureTime');
    showStatus('Departure time cleared - using current time', 'info');
}

/**
 * loadRoutePreferences function
 * @function loadRoutePreferences
 * @returns {*} Return value description
 */
function loadRoutePreferences() {
    const saved = localStorage.getItem('routePreferences');
    if (saved) {
        const preferences = JSON.parse(saved);
        const setChecked = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!val;
        };
        const setValue = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        // avoidHighways is retained in the persisted schema for backwards compatibility,
        // but the checkbox was retired in favour of the functional "Avoid Motorways" toggle.
        setChecked('avoidHighways', preferences.avoidHighways);
        setChecked('preferScenic', preferences.preferScenic);
        // Note: avoidTolls is now sourced from Route Preferences → pref_avoid_tollRoads (via isAvoidTollsEnabled()).
        // avoidCAZ is still managed by togglePreference('caz') → pref_caz.
        setChecked('preferQuiet', preferences.preferQuiet);
        setChecked('avoidUnpaved', preferences.avoidUnpaved);
        setValue('routeOptimization', preferences.routeOptimization || 'fastest');
        setValue('maxDetour', preferences.maxDetour || 20);
        if (document.getElementById('maxDetour')) updateDetourLabel();
    }
}

/**
 * updateDetourLabel function
 * @function updateDetourLabel
 * @returns {*} Return value description
 */
function updateDetourLabel() {
    const value = document.getElementById('maxDetour').value;
    document.getElementById('detourLabel').textContent = value + '%';
    saveRoutePreferences();
}

/**
 * getRoutePreferences function
 * @function getRoutePreferences
 * @returns {*} Return value description
 */
function getRoutePreferences() {
    return VoyagrModules.routePrefs().getRoutePreferences(localStorage);
}

/**
 * recalculateRouteWithPreferences function
 * @function recalculateRouteWithPreferences
 * @returns {*} Return value description
 */
function recalculateRouteWithPreferences() {
    // Check if there's an active route to recalculate
    if (!window.lastCalculatedRoute || !window.lastCalculatedRoute.destination) {
        showStatus('No active route to recalculate. Please calculate a route first.', 'error');
        return;
    }

    // Save current preferences
    saveRoutePreferences();

    // Show loading status
    showStatus('🔄 Recalculating route with new preferences...', 'loading');

    // Switch back to navigation tab to show results
    switchTab('navigation');

    // Trigger route calculation with current start/end locations
    setTimeout(() => {
        calculateRoute();
    }, 300);
}

// ===== ROUTE SAVING FUNCTIONS =====
/**
 * saveCurrentRoute function
 * @function saveCurrentRoute
 * @returns {*} Return value description
 */
function saveCurrentRoute() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const routeName = document.getElementById('routeName').value.trim();
    if (!routeName) {
        showStatus('Please enter a route name', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    const savedRoute = {
        id: Date.now(),
        name: routeName,
        start: startInput,
        end: endInput,
        distance_km: route.distance_km,
        duration_minutes: route.time,
        fuel_cost: route.fuel_cost,
        toll_cost: route.toll_cost,
        caz_cost: route.caz_cost,
        geometry: route.geometry,
        timestamp: new Date().toISOString()
    };

    // Get existing saved routes
    let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    savedRoutes.push(savedRoute);
    localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
    persistActiveProfile();

    document.getElementById('routeName').value = '';
    showStatus(`Route "${routeName}" saved!`, 'success');
    loadSavedRoutes();
}

/**
 * loadSavedRoutes function
 * @function loadSavedRoutes
 * @returns {*} Return value description
 */
function loadSavedRoutes() {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    const savedRoutesList = document.getElementById('savedRoutesList');
    savedRoutesList.innerHTML = VoyagrModules.routeSharing().buildSavedRoutesListHtml(savedRoutes, {
        currencySymbol: getCurrencySymbol(),
        distUnit: getDistanceUnit(),
        distanceTexts: savedRoutes.map((route) => convertDistance(route.distance_km)),
    });
}
/**
 * useSavedRoute function
 * @function useSavedRoute
 * @param {*} routeId - Parameter description
 * @returns {*} Return value description
 */
function useSavedRoute(routeId) {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    const route = savedRoutes.find(r => r.id === routeId);

    if (route) {
        document.getElementById('start').value = route.start;
        document.getElementById('end').value = route.end;
        window.lastCalculatedRoute = {
            distance_km: route.distance_km,
            time: route.duration_minutes,
            fuel_cost: route.fuel_cost,
            toll_cost: route.toll_cost,
            caz_cost: route.caz_cost,
            geometry: route.geometry
        };
        showStatus(`Loaded route: ${route.name}`, 'success');
        switchTab('navigation');
    }
}
/**
 * deleteSavedRoute function
 * @function deleteSavedRoute
 * @param {*} routeId - Parameter description
 * @returns {*} Return value description
 */
function deleteSavedRoute(routeId) {
    if (confirm('Delete this saved route?')) {
        let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
        savedRoutes = savedRoutes.filter(r => r.id !== routeId);
        localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
        persistActiveProfile();
        showStatus('Route deleted', 'success');
        loadSavedRoutes();
    }
}

// ===== REAL-TIME TRAFFIC UPDATE FUNCTIONS =====
/**
 * updateTrafficConditions function
 * @function updateTrafficConditions
 * @returns {*} Return value description
 */
function updateTrafficConditions() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    showStatus('Checking traffic conditions...', 'info');

    // Fetch traffic data from backend
    fetch('/api/traffic-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start: startInput,
            end: endInput
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayTrafficUpdate(data);
            } else {
                showStatus('Could not fetch traffic data', 'error');
            }
        })
        .catch(error => {
            console.error('Traffic update error:', error);
            showStatus('Error updating traffic conditions', 'error');
        });
}
/**
 * displayTrafficUpdate function
 * @function displayTrafficUpdate
 * @param {*} data - Parameter description
 * @returns {*} Return value description
 */
function displayTrafficUpdate(data) {
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    // Update traffic status
    const trafficStatus = document.getElementById('trafficStatus');
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    trafficStatus.textContent = `Last updated: ${timeStr} | Conditions: ${data.traffic_level}`;

    // Update route information if traffic has changed
    if (data.updated_duration_minutes !== window.lastCalculatedRoute.time) {
        const oldTime = parseInt(window.lastCalculatedRoute.time);
        const newTime = data.updated_duration_minutes;
        const timeDiff = newTime - oldTime;
        const timeDiffStr = timeDiff > 0 ? `+${timeDiff}` : `${timeDiff}`;

        showStatus(`Traffic update: Duration changed from ${oldTime} to ${newTime} min (${timeDiffStr} min)`, 'warning');

        // Update route data
        window.lastCalculatedRoute.time = newTime;
        window.lastCalculatedRoute.traffic_level = data.traffic_level;
        window.lastCalculatedRoute.updated_at = new Date().toISOString();

        // Recalculate costs if distance changed
        if (data.updated_distance_km) {
            window.lastCalculatedRoute.distance_km = data.updated_distance_km;
        }
    } else {
        showStatus(`Traffic conditions: ${data.traffic_level}`, 'success');
    }

    // Display traffic details
    const trafficDetails = `
        🚦 Traffic Level: ${data.traffic_level}
        📏 Distance: ${convertDistance(data.updated_distance_km || window.lastCalculatedRoute.distance_km)} ${distUnit}
        ⏱️ Duration: ${data.updated_duration_minutes} minutes
        🚗 Congestion: ${data.congestion_percentage}%
        ⚠️ Incidents: ${data.incidents_count}
    `;

    console.log('Traffic Update:', trafficDetails);
}

// Auto-update traffic every 5 minutes during navigation
/**
 * startTrafficMonitoring function
 * @function startTrafficMonitoring
 * @returns {*} Return value description
 */
function startTrafficMonitoring() {
    if (window.trafficMonitoringInterval) {
        clearInterval(window.trafficMonitoringInterval);
    }

    window.trafficMonitoringInterval = setInterval(() => {
        if (window.lastCalculatedRoute && document.getElementById('start').value) {
            updateTrafficConditions();
        }
    }, 5 * 60 * 1000); // Update every 5 minutes

    showStatus('Traffic monitoring started', 'success');
}

/**
 * stopTrafficMonitoring function
 * @function stopTrafficMonitoring
 * @returns {*} Return value description
 */
function stopTrafficMonitoring() {
    if (window.trafficMonitoringInterval) {
        clearInterval(window.trafficMonitoringInterval);
        window.trafficMonitoringInterval = null;
        showStatus('Traffic monitoring stopped', 'info');
    }
}

/**
 * setupMapClickHandler function
 * @function setupMapClickHandler
 * @returns {void}
 */
function setupMapClickHandler() {
    if (!map) {
        console.log('[Map] Map not initialized yet, deferring click handler setup');
        return;
    }

    // Map click handler for location picker
    map.on('click', (e) => {
        // Handle via-point and stop adding first
        if (addingViaPoint || addingStop) {
            handleMapClickForWaypoints(e);
            return;
        }

        if (mapPickerMode) {
            // MapLibre uses e.lngLat (not e.latlng like Leaflet)
            const lat = e.lngLat.lat;
            const lon = e.lngLat.lng;
            document.getElementById(mapPickerMode).value = `${lat},${lon}`;

            // Add marker
            if (mapPickerMode === 'start' && startMarker && typeof startMarker.remove === 'function') startMarker.remove();
            if (mapPickerMode === 'end' && endMarker && typeof endMarker.remove === 'function') endMarker.remove();

            const marker = MapLibreHelpers.createCircleMarker(lat, lon, {
                radius: 8,
                fillColor: mapPickerMode === 'start' ? '#00ff00' : '#ff0000',
                color: '#000',
                weight: 2,
                fillOpacity: 0.8
            }).addTo(map);

            if (mapPickerMode === 'start') {
                startMarker = marker;
            } else {
                endMarker = marker;
            }

            mapPickerMode = null;
            showStatus('Location selected!', 'success');
            collapseBottomSheet();
        }
    });
}

// Decode polyline (supports both precision 5 and precision 6)
/**
 * decodePolyline function
 * @function decodePolyline
 * @param {*} encoded - Encoded polyline string
 * @param {*} precision - Precision level (5 for OSRM/GraphHopper, 6 for Valhalla). Default: 6
 * @returns {*} Array of [lat, lon] coordinates
 */
// decodePolyline / encodePolyline moved to modules/navigation/polyline-codec.js
// (VoyagrPolylineCodec global). Thin stubs below keep all existing callers working.

/**
 * Decode an encoded polyline string to [lat,lon] pairs.
 * Delegates to VoyagrPolylineCodec (pure, unit-tested). Precision 6 = Valhalla, 5 = OSRM/GH.
 * @param {string} encoded
 * @param {number} [precision=6]
 * @returns {Array<[number, number]>}
 */
function decodePolyline(encoded, precision = 6) {
    if (!encoded || typeof encoded !== 'string') {
        console.warn('[decodePolyline] Invalid input:', encoded);
        return [];
    }
    const decoded = VoyagrModules.polylineCodec().decodePolyline(encoded, precision);
    console.log(`[decodePolyline] Decoded ${decoded.length} points with precision ${precision}`);
    if (decoded.length > 0) {
        console.log(`[decodePolyline] First point: [${decoded[0][0]}, ${decoded[0][1]}]`);
        console.log(`[decodePolyline] Last point: [${decoded[decoded.length - 1][0]}, ${decoded[decoded.length - 1][1]}]`);
    }
    return decoded;
}

/**
 * Encode [lat,lon] vertex pairs to an encoded polyline string.
 * Delegates to VoyagrPolylineCodec. Used offline when only decoded points survived persistence.
 * @param {Array<[number, number]>} points
 * @param {number} [precision=6]
 * @returns {string}
 */
function encodePolyline(points, precision = 6) {
    if (!Array.isArray(points) || points.length === 0) return '';
    return VoyagrModules.polylineCodec().encodePolyline(points, precision);
}

/**
 * Before navigation decode, attach `routeOptions[selectedRouteIndex]` geometry / maneuvers so the driven line matches the UI.
 *
 * @param {Object|null|undefined} routeData
 */
function mergeNavigationRouteFromSelected(routeData) {
    return VoyagrModules.routeSelection().mergeNavigationRouteFromSelected(
        routeData, routeOptions, selectedRouteIndex
    );
}

/**
 * Apply selected route option fields to window.lastCalculatedRoute (geometry + maneuvers for TBT).
 */
function syncLastCalculatedRouteFromSelection(index) {
    if (!routeOptions || !routeOptions[index]) return;
    window.lastCalculatedRoute = VoyagrModules.routeSelection().mergeLastCalculatedRouteFromSelection(
        window.lastCalculatedRoute,
        routeOptions[index]
    );
}

/**
 * Recover `routeData` from persisted OfflineNav blob for a normal navigation bootstrap.
 *
 * @param {*} saved
 */
function buildRoutePayloadFromPersisted(saved) {
    return VoyagrModules.routeSelection().buildRoutePayloadFromPersisted(saved, encodePolyline);
}
/**
 * showStatus function
 * @function showStatus
 * @param {*} message - Parameter description
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
}

async function calculateRoute() {
    console.log('[calculateRoute] START - Function called');

    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');

    if (!startInput || !endInput) {
        showStatus('Error: Input fields not found', 'error');
        console.error('[calculateRoute] ERROR: Input fields not found');
        return;
    }

    const start = startInput.value ? startInput.value.trim() : '';
    const end = endInput.value ? endInput.value.trim() : '';

    console.log('[calculateRoute] Start:', start);
    console.log('[calculateRoute] End:', end);
    console.log('[calculateRoute] Start dataset:', startInput.dataset);
    console.log('[calculateRoute] End dataset:', endInput.dataset);

    if (!start || !end) {
        showStatus('Please enter both start and end locations', 'error');
        console.error('[calculateRoute] ERROR: Empty start or end');
        return;
    }

    // Prevent multiple simultaneous geocoding requests
    if (isGeocoding) {
        showStatus('⏳ Geocoding in progress...', 'loading');
        console.warn('[calculateRoute] WARNING: Geocoding already in progress');
        return;
    }

    console.log('[calculateRoute] Calling geocodeLocations...');

    // Geocode locations if needed
    let geocodedResult = await geocodeLocations(start, end);
    if (!geocodedResult) {
        console.error('[calculateRoute] ERROR: geocodeLocations returned null');
        return; // Error already shown by geocodeLocations
    }

    const geocodedStart = geocodedResult.start;
    const geocodedEnd = geocodedResult.end;

    console.log('[calculateRoute] Geocoded start:', geocodedStart);
    console.log('[calculateRoute] Geocoded end:', geocodedEnd);

    showStatus('📍 Calculating route...', 'loading');

    // Show route calculation progress bar
    showRouteProgressBar();

    // Check if hazard avoidance is enabled (any hazard type selected)
    const enableHazardAvoidance = VoyagrRoutingRequest.isInitialRouteHazardAvoidanceEnabled(localStorage);

    const viaPointsData = VoyagrRoutingRequest.mapViaPointsForApi(viaPoints);
    const stopsData = VoyagrRoutingRequest.mapStopsForApi(stops);
    const totalStopTime = VoyagrRoutingRequest.sumStopDurationsMinutes(stops);

    const routePrefs = getRoutePreferences();
    const optimizeOrder = localStorage.getItem('pref_optimizeStopOrder') !== 'false';
    const roundTrip = localStorage.getItem('pref_roundTrip') === 'true';
    const departureTime = localStorage.getItem('pref_departureTime') || null;

    const avoidTollRoads = isAvoidTollsEnabled();
    const avoidMotorways = localStorage.getItem('pref_avoid_motorways') === 'true';
    const avoidFerries = localStorage.getItem('pref_avoid_ferries') === 'true';

    const routeStartCoordStr = VoyagrRoutingRequest.resolveLiveGpsStartCoord({
        routeInProgress: routeInProgress,
        isTrackingActive: isTrackingActive,
        trackingHistory: trackingHistory,
        currentLat: currentLat,
        currentLon: currentLon,
        geocodedStart: geocodedStart,
    });

    const requestBody = VoyagrRoutingRequest.buildInitialRouteRequestBody({
        start: routeStartCoordStr,
        end: geocodedEnd,
        viaPoints: viaPoints,
        stops: stops,
        optimizeStopOrder: optimizeOrder,
        roundTrip: roundTrip,
        departureTime: departureTime,
        sharedOptions: {
            routingMode: currentRoutingMode,
            vehicleType: currentVehicleType,
            costParams: getRouteCostParams(currentVehicleType),
            enableHazardAvoidance: enableHazardAvoidance,
            avoidCameras: localStorage.getItem('pref_cameras') !== 'false',
            avoidCaz: localStorage.getItem('pref_caz') !== 'false',
            avoidTrafficLights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
            avoidTolls: avoidTollRoads,
            avoidMotorways: avoidMotorways,
            avoidFerries: avoidFerries,
            routePrefs: routePrefs,
        },
    });

    console.log('[calculateRoute] Making API request to /api/route with:', requestBody);
    console.log('[calculateRoute] Via-points:', viaPointsData.length, 'Stops:', stopsData.length, 'Total stop time:', totalStopTime, 'min');
    console.log('[calculateRoute] Multi-drop: optimize=' + optimizeOrder + ' roundTrip=' + roundTrip);

    fetch('/api/route', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
        .then(response => {
            console.log('[calculateRoute] API response status:', response.status);

            // Check content-type to detect HTML error pages
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('[calculateRoute] Non-JSON response received:', contentType);
                // Read as text first to get the error message
                return response.text().then(text => {
                    console.error('[calculateRoute] Response text:', text.substring(0, 200));

                    // Detect specific error types
                    let errorMsg = `Server error (HTTP ${response.status})`;
                    if (response.status === 504) {
                        errorMsg = 'Gateway Timeout (504): The route is too complex or the server is busy. Try a shorter route.';
                    } else if (response.status === 502) {
                        errorMsg = 'Bad Gateway (502): Server communication error. Please try again.';
                    } else if (response.status === 500) {
                        errorMsg = 'Internal Server Error (500). Please check server logs.';
                    } else if (text.includes('timeout') || text.includes('Timeout')) {
                        errorMsg = 'Request timed out. The route may be too long. Try a shorter route.';
                    }

                    throw new Error(errorMsg);
                });
            }

            // Check error status codes — parse body safely (408 etc. may be JSON or edge non-JSON)
            if (!response.ok) {
                return response.text().then(text => {
                    let msg = null;
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
                            msg = parsed.error.trim();
                        }
                    } catch {
                        /* ignore */
                    }
                    if (!msg) {
                        if (response.status === 408) {
                            msg =
                                'Route calculation timed out. Try a shorter route, move start and end closer, or try again in a moment.';
                        } else if (response.status === 504) {
                            msg =
                                'Gateway Timeout (504): The route is too complex or the server is busy. Try a shorter route.';
                        } else if (response.status === 502) {
                            msg = 'Bad Gateway (502): Server communication error. Please try again.';
                        } else if (response.status === 500) {
                            msg = 'Internal Server Error (500). Please check server logs.';
                        } else {
                            msg = `Server error (${response.status}). Please try again.`;
                        }
                    }
                    throw new Error(msg);
                });
            }

            return response.json();
        })
        .then(data => {
            console.log('[Route API] Response received:', {
                success: data.success,
                source: data.source,
                hasGeometry: !!data.geometry,
                geometryLength: data.geometry ? data.geometry.length : 0,
                distance: data.distance,
                time: data.time,
                routesCount: data.routes ? data.routes.length : 0
            });

            if (data.routing_degraded) {
                console.warn(
                    '[Route API] Degraded routing — local engines failed:',
                    data.routing_warning || data.source,
                    data.engines_failed || {}
                );
                showStatus(
                    '⚠️ Basic route only (Valhalla/GraphHopper offline). No camera avoidance.',
                    'warning'
                );
            }

            if (data.success) {
                // ===== FIX: If navigation is in progress, take a streamlined reroute path =====
                // This avoids clearing markers, fitting bounds, or switching to the route preview tab.
                if (routeInProgress) {
                    console.log('[calculateRoute] Navigation active — using in-nav reroute path');
                    hideRouteProgressBar();

                    const activeRoute = pickActiveRouteDuringNavigation(data.routes, data);
                    if (!activeRoute) {
                        showStatus('❌ No route returned', 'error');
                        return;
                    }
                    if (activeRoute.geometry) {
                        updateRouteOnMap(activeRoute);
                    }

                    // Update stored route data (preserve destination for future reroutes)
                    const durationMinutes = activeRoute.duration_minutes || (data.time ? parseInt(data.time) : 0);
                    window.lastCalculatedRoute = {
                        ...window.lastCalculatedRoute,
                        ...data,
                        ...activeRoute,
                        duration_minutes: durationMinutes,
                        destination: geocodedEnd,
                        destinationName: end
                    };

                    // Announce update with the CORRECT route's duration
                    if (voiceAnnouncementsEnabled) {
                        const distUnit = getDistanceUnit();
                        const displayDist = convertDistance(activeRoute.distance_km || parseFloat(data.distance) || 0);
                        speakMessage(`Route recalculated. ${displayDist} ${distUnit}, ${Math.round(durationMinutes)} minutes.`, 'high');
                    }

                    showStatus('✅ Route recalculated — continuing navigation', 'success');
                    try {
                        const ep = (geocodedEnd || '').split(',');
                        if (ep.length >= 2) {
                            const elat = parseFloat(ep[0].trim());
                            const elon = parseFloat(ep[1].trim());
                            if (Number.isFinite(elat) && Number.isFinite(elon)) {
                                recordRecentDestination(end, elat, elon, 'route');
                            }
                        }
                    } catch (_) { /* ignore */ }
                    return;
                }

                // Parse coordinates
                try {
                    const startParts = geocodedStart.split(',');
                    const endParts = geocodedEnd.split(',');

                    if (startParts.length < 2 || endParts.length < 2) {
                        showStatus('Error: Invalid coordinates format', 'error');
                        return;
                    }

                    const startCoords = [parseFloat(startParts[0].trim()), parseFloat(startParts[1].trim())];
                    const endCoords = [parseFloat(endParts[0].trim()), parseFloat(endParts[1].trim())];

                    if (isNaN(startCoords[0]) || isNaN(startCoords[1]) || isNaN(endCoords[0]) || isNaN(endCoords[1])) {
                        showStatus('Error: Invalid coordinates', 'error');
                        return;
                    }

                    // Clear previous markers and route
                    if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
                    if (endMarker && typeof endMarker.remove === 'function') endMarker.remove();
                    if (routeLayer && typeof routeLayer.remove === 'function') routeLayer.remove();

                    // Add markers with MapLibre
                    startMarker = MapLibreHelpers.createCircleMarker(startCoords[0], startCoords[1], {
                        radius: 8,
                        fillColor: '#00ff00',
                        color: '#000',
                        weight: 2,
                        fillOpacity: 0.8
                    }).addTo(map);
                    startMarker.bindPopup('Start Location');

                    endMarker = MapLibreHelpers.createCircleMarker(endCoords[0], endCoords[1], {
                        radius: 8,
                        fillColor: '#ff0000',
                        color: '#000',
                        weight: 2,
                        fillOpacity: 0.8
                    }).addTo(map);
                    endMarker.bindPopup('End Location');

                    // Draw route line
                    let routePath = [[startCoords[0], startCoords[1]], [endCoords[0], endCoords[1]]];

                    // If we have geometry from the routing service, use it
                    if (data.geometry) {
                        try {
                            // Decode polyline geometry (precision is provided by API when available)
                            const sourceLower = (data.source || '').toLowerCase();
                            const precision =
                                Number.isFinite(data.geometry_precision)
                                    ? data.geometry_precision
                                    : (sourceLower.includes('osrm') ? 5 : 6);
                            routePath = decodePolyline(data.geometry, precision);
                            console.log(`Route path decoded: ${routePath.length} points with precision ${precision} (source: ${data.source})`);

                            // Validate decoded coordinates
                            if (routePath.length === 0) {
                                console.error('[Route] Decoded polyline is empty, using straight line');
                                routePath = [[startCoords[0], startCoords[1]], [endCoords[0], endCoords[1]]];
                            } else {
                                // Check if coordinates are valid (not [0,0] or NaN)
                                const firstPoint = routePath[0];
                                if (!firstPoint || isNaN(firstPoint[0]) || isNaN(firstPoint[1]) ||
                                    (firstPoint[0] === 0 && firstPoint[1] === 0)) {
                                    console.error('[Route] Invalid decoded coordinates, using straight line');
                                    routePath = [[startCoords[0], startCoords[1]], [endCoords[0], endCoords[1]]];
                                }
                            }
                        } catch (e) {
                            console.error('Could not decode geometry, using straight line:', e);
                            routePath = [[startCoords[0], startCoords[1]], [endCoords[0], endCoords[1]]];
                        }
                    }

                    if (!map) {
                        console.error('[Route] Map not initialized');
                        showStatus('Error: Map not initialized', 'error');
                        return;
                    }

                    // NOTE: Don't draw route here - displayAllRoutesOnMap() in showRoutePreview() will handle it
                    // This prevents duplicate routes and ensures consistent multi-route display

                    // Fit map to route with smooth animation
                    MapLibreHelpers.fitMapBounds(map, routePath, { padding: 50 });

                    lastZoomLevel = map.getZoom();

                    // Update info - include stop time if present
                    let displayTime = data.time;
                    if (data.total_stop_time && data.total_stop_time > 0) {
                        displayTime = data.total_time_with_stops || data.time;
                        console.log(`[Route] Total time with ${data.stops_count} stops: ${displayTime}`);
                    }
                    updateTripInfo(data.distance, displayTime, data.fuel_cost || '-', data.toll_cost || '-');

                    // Do not surface backend routing engine names in user-facing UI
                    let statusMsg = 'Route calculated successfully!';
                    if (data.response_time_ms) {
                        statusMsg += ` (${data.response_time_ms.toFixed(0)}ms)`;
                    }
                    if (data.source && data.source.includes('Custom Router')) {
                        statusMsg += ' ⚡ Ultra-fast!';
                    }
                    if (data.via_points_count > 0 || data.stops_count > 0) {
                        statusMsg += ` 📍 ${data.via_points_count || 0} via-points, ${data.stops_count || 0} stops`;
                    }
                    if (data.multi_drop && data.optimized) {
                        statusMsg += ' (optimized order)';
                    }
                    showStatus(statusMsg, 'success');

                    // Display multi-drop leg breakdown if available
                    if (data.multi_drop && data.legs && data.legs.length > 0) {
                        displayMultiDropLegs(data);
                    }

                    const durationMinutes = (data.routes && data.routes.length > 0)
                        ? data.routes[0].duration_minutes
                        : (data.total_duration_minutes || (data.time ? parseInt(data.time) : 0));

                    window.lastRouteApiResponse = data;
                    window.lastCalculatedRoute = {
                        ...data,
                        duration_minutes: durationMinutes,  // FIXED: Ensure duration_minutes is at top level
                        destination: geocodedEnd,  // Store geocoded coordinates for automatic rerouting
                        destinationName: end  // Store human-readable name for display
                    };

                    console.log(`[Route] Stored route with duration_minutes: ${durationMinutes}`);

                    // Display hazard markers for cameras/hazards on the primary route only
                    const primaryHazards = data.routes?.[0]?.hazards;
                    if (primaryHazards && primaryHazards.length > 0) {
                        displayHazardMarkers(primaryHazards);
                    }

                    // IMPORTANT: Populate routeOptions BEFORE showing route preview
                    // so that displayAllRoutesOnMap() has routes to display
                    if (data.routes && data.routes.length > 0) {
                        // Real routes from routing engine - include source from response
                        const routeSource = data.source || 'Unknown';
                        const routeSourceLower = routeSource.toLowerCase();
                        const defaultPrecision =
                            Number.isFinite(data.geometry_precision)
                                ? data.geometry_precision
                                : (routeSourceLower.includes('osrm') ? 5 : 6);
                        console.log(`[Route API] Received ${data.routes.length} routes from ${routeSource}, default polyline precision ${defaultPrecision}`);
                        routeOptions = data.routes.map(route => ({
                            id: route.id,
                            name: route.name,
                            distance_km: route.distance_km,
                            duration_minutes: route.duration_minutes,
                            fuel_cost: route.fuel_cost,
                            fuel_litres: route.fuel_litres || 0,
                            toll_cost: route.toll_cost,
                            caz_cost: route.caz_cost,
                            hazard_count: route.hazard_count || 0,
                            cameras_near_route: route.cameras_near_route ?? route.hazard_count ?? 0,
                            geometry_precision: Number.isFinite(route.geometry_precision) ? route.geometry_precision : defaultPrecision,
                            polyline: decodePolyline(route.geometry || '', Number.isFinite(route.geometry_precision) ? route.geometry_precision : defaultPrecision),
                            geometry: route.geometry,
                            hazards: route.hazards || [],
                            maneuvers: route.maneuvers || [],  // FIXED: Include maneuvers for turn-by-turn navigation
                            source: route.source || routeSource  // Prefer per-route source if provided
                        }));
                        console.log(`[Route Comparison] Loaded ${routeOptions.length} real routes from ${data.source}:`, routeOptions.map(r => r.name));
                    } else {
                        // Fallback: single route (for backward compatibility)
                        routeOptions = [
                            {
                                id: 1,
                                name: 'Route',
                                distance_km: parseFloat(data.distance) || 0,
                                duration_minutes: parseInt(data.time) || 0,
                                fuel_cost: data.fuel_cost || 0,
                                fuel_litres: data.fuel_litres || 0,
                                toll_cost: data.toll_cost || 0,
                                caz_cost: data.caz_cost || 0,
                                hazard_count: 0,
                                polyline: routePath,
                                geometry: data.geometry,
                                maneuvers: data.maneuvers || [],  // FIXED: Include maneuvers for turn-by-turn
                                source: data.source || 'Unknown'
                            }
                        ];
                        console.log('[Route Comparison] Using single route (fallback)');
                    }

                    // Routes are already sorted by hazard count from backend
                    // NOTE: Don't display routes here - showRoutePreview() will handle it
                    // This prevents double-drawing and ensures consistent display

                    // Show route preview AFTER routeOptions is populated
                    setTimeout(() => {
                        showRoutePreview(data);
                        // Make sure AR button visibility is updated
                        updateARButtonVisibility();
                    }, 300);

                    // Hide progress bar on success
                    hideRouteProgressBar();

                    // Show start navigation buttons (both in FAB and in bottom sheet)
                    const startNavBtn = document.getElementById('startNavBtn');
                    const startNavBtnSheet = document.getElementById('startNavBtnSheet');
                    if (startNavBtn) {
                        startNavBtn.style.display = 'block';
                    }
                    if (startNavBtnSheet) {
                        startNavBtnSheet.style.display = 'block';
                    }
                    updateRoadReportFabVisibility();
                    const distanceKm = parseFloat(data.distance_km || data.distance) || 0;
                    const distUnit = getDistanceUnit();
                    const displayDistance = convertDistance(distanceKm);
                    const notificationMessage = `${displayDistance} ${distUnit} in ${data.time}. Ready to navigate?`;
                    console.log('[Route] Route ready notification:', notificationMessage);
                    sendNotification('Route Ready', notificationMessage, 'success');

                    try {
                        recordRecentDestination(end, endCoords[0], endCoords[1], 'route');
                        // Save the start location too, so it appears in the recent-locations
                        // list for both fields. Skip the live-GPS placeholder ("Current
                        // Location"), which is not a re-pickable named place.
                        if (start && !/^\s*current location\s*$/i.test(start)) {
                            recordRecentDestination(start, startCoords[0], startCoords[1], 'route');
                        }
                    } catch (_) { /* ignore */ }
                } catch (e) {
                    showStatus('Error parsing coordinates: ' + e.message, 'error');
                    console.error('Coordinate parsing error:', e);
                    hideRouteProgressBar();
                }
            } else {
                showStatus('Error: ' + data.error, 'error');
                hideRouteProgressBar();
            }
        })
        .catch(error => {
            showStatus('Error: ' + error.message, 'error');
            console.error('[Route] Fetch error:', error);
            hideRouteProgressBar();
        });
}

/**
 * Show route calculation progress bar
 */
function showRouteProgressBar() {
    const RP = _routeProgress();
    let progressContainer = document.getElementById(RP.ROUTE_PROGRESS_CONTAINER_ID);

    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = RP.ROUTE_PROGRESS_CONTAINER_ID;
        progressContainer.style.cssText = RP.getRouteProgressContainerStyleCssText();
        progressContainer.innerHTML = RP.buildRouteProgressBarInnerHtml();

        if (!document.getElementById(RP.ROUTE_PROGRESS_ANIMATION_STYLE_ID)) {
            const style = document.createElement('style');
            style.id = RP.ROUTE_PROGRESS_ANIMATION_STYLE_ID;
            style.textContent = RP.getRouteProgressAnimationKeyframes();
            document.head.appendChild(style);
        }

        document.body.appendChild(progressContainer);
    }

    progressContainer.style.display = 'block';
    console.log('[Route Progress] Showing progress bar');
}

/**
 * Hide route calculation progress bar
 */
function hideRouteProgressBar() {
    const progressContainer = document.getElementById(_routeProgress().ROUTE_PROGRESS_CONTAINER_ID);
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
    console.log('[Route Progress] Hiding progress bar');
}

/**
 * Collapse bottom sheet to show map with route preview
 * Uses the standard collapse mechanism instead of inline styles
 */
function collapseBottomSheetForRoutePreview() {
    const bottomSheet = document.getElementById('bottomSheet');
    if (!bottomSheet) return;

    // Clear any inline styles that might interfere
    bottomSheet.style.height = '';
    bottomSheet.style.transition = '';
    bottomSheet.style.transform = '';

    // Use the standard collapse function
    collapseBottomSheet();

    // Show a "swipe up for details" indicator
    const handle = bottomSheet.querySelector('.bottom-sheet-handle');
    if (handle) {
        handle.title = 'Swipe up to see route details';
    }

    console.log('[Route Preview] Collapsed bottom sheet to show map');
}

/**
 * Display hazard markers on the map
 * @param {Array} hazards - Array of hazard objects with lat, lon, type, description
 */
function displayHazardMarkers(hazards) {
    if (!hazards || hazards.length === 0) {
        console.log('[Hazards] No hazards to display');
        return;
    }

    // Clear existing hazard markers
    clearHazardMarkers();

    const HM = _hazardMapMarkers();
    const hazardConfig = HM.getHazardMarkerStyleMap();

    // Track unique locations to avoid duplicates
    const seenLocations = new Set();

    // Display each hazard
    hazards.forEach(hazard => {
        const locationKey = `${hazard.lat.toFixed(5)},${hazard.lon.toFixed(5)}`;
        if (seenLocations.has(locationKey)) return;
        seenLocations.add(locationKey);

        const hazardTypeKey = HM.normalizeCameraHazardTypeForMarker(hazard.type);
        const config = HM.resolveHazardMarkerConfig(hazardConfig, hazardTypeKey);

        let markerHtml;
        let markerIconSize;
        let popupIcon;

        if (config.useOsmTrafficLightPill) {
            const OSM = _osmMapIcons();
            const pillHtml = getOsmTrafficLightMarkerPillHTML();
            markerHtml = pillHtml;
            markerIconSize = OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE;
            popupIcon = OSM.buildOsmTrafficLightPopupIconWrapperHtml(pillHtml);
        } else if (config.svg) {
            markerHtml = HM.buildHazardSvgMarkerHtml(config, config.svg);
            markerIconSize = HM.HAZARD_MARKER_ICON_SIZE;
            popupIcon = config.svg;
        } else {
            markerHtml = HM.buildHazardEmojiMarkerHtml(config);
            markerIconSize = HM.HAZARD_MARKER_ICON_SIZE;
            popupIcon = HM.buildHazardPopupEmojiIconHtml(config.emoji);
        }

        const hazardDistanceText = HM.buildHazardDistanceAheadHtml(hazard.distance_km);

        const marker = MapLibreHelpers.createMarker(hazard.lat, hazard.lon, {
            className: 'hazard-marker',
            html: markerHtml,
            iconSize: markerIconSize,
            iconAnchor: [markerIconSize[0] / 2, markerIconSize[1] / 2],
            popup: HM.buildHazardMarkerPopupHtml({
                popupIcon,
                config,
                description: hazard.description,
                distanceHtml: hazardDistanceText,
            })
        }).addTo(map);

        window.hazardMarkers.push(marker);
    });

    console.log(`[Hazards] Displayed ${window.hazardMarkers.length} hazard markers on map`);
}

/**
 * Clear all hazard markers from the map
 */
function clearHazardMarkers() {
    if (window.hazardMarkers) {
        window.hazardMarkers.forEach(marker => {
            // MapLibre markers use remove() method instead of Leaflet's removeLayer
            if (marker && typeof marker.remove === 'function') {
                marker.remove();
            }
        });
    }
    window.hazardMarkers = [];
}

/**
 * Display hazards from all routes on the map
 */
function displayAllRouteHazards() {
    if (!routeOptions || routeOptions.length === 0) return;

    // Collect all hazards from all routes
    const allHazards = [];
    routeOptions.forEach(route => {
        if (route.hazards && route.hazards.length > 0) {
            allHazards.push(...route.hazards);
        }
    });

    if (allHazards.length > 0) {
        displayHazardMarkers(allHazards);
        console.log(`[Hazards] Displaying hazards from all ${routeOptions.length} routes: ${allHazards.length} total`);
    }
}

// ===== BOTTOM SHEET CONTROL =====

/**
 * Initialize bottom sheet interactions (drag, toggle, scroll)
 */
function initBottomSheetLogic() {
    const bottomSheet = document.getElementById('bottomSheet');
    const handle = document.querySelector('.bottom-sheet-handle');
    const header = document.querySelector('.bottom-sheet-header');

    if (!bottomSheet || !handle) {
        console.warn('Bottom Sheet elements not found');
        return;
    }

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    const DRAG_THRESHOLD = 50; // px to trigger state change

    const onDragStart = (e) => {
        // Only allow dragging from handle or header (unless content is scrolled to top)
        if (!voyagrClosest(e.target, '.bottom-sheet-handle') && !voyagrClosest(e.target, '.bottom-sheet-header')) {
            return;
        }

        isDragging = true;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        bottomSheet.style.transition = 'none'; // Disable transition during drag
    };

    const onDragMove = (e) => {
        if (!isDragging) return;

        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = y - startY;

        // Simple resistance/follow logic could go here
        // For now, we'll just track if the drag is significant
        currentY = deltaY;
    };

    const onDragEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        bottomSheet.style.transition = ''; // Re-enable transitions

        // Determine snap direction
        if (currentY < -DRAG_THRESHOLD) {
            expandBottomSheet();
        } else if (currentY > DRAG_THRESHOLD) {
            collapseBottomSheet();
        } else {
            // Revert to current state if drag wasn't far enough
            if (bottomSheetIsExpanded) {
                expandBottomSheet();
            } else {
                collapseBottomSheet();
            }
        }
        currentY = 0;
    };

    // Touch events
    try {
        handle.addEventListener('touchstart', onDragStart, { passive: true });
        if (header) header.addEventListener('touchstart', onDragStart, { passive: true });
        document.addEventListener('touchmove', onDragMove, { passive: true });
        document.addEventListener('touchend', onDragEnd);

        // Mouse events for testing
        handle.addEventListener('mousedown', onDragStart);
        if (header) header.addEventListener('mousedown', onDragStart);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);

        // Click to toggle
        handle.addEventListener('click', toggleBottomSheet);
    } catch (err) {
        console.error('Error initializing bottom sheet listeners:', err);
    }
}

/**
 * Toggle bottom sheet state
 */
function toggleBottomSheet() {
    if (bottomSheetIsExpanded) {
        collapseBottomSheet();
    } else {
        expandBottomSheet();
    }
}

// ===== TOMTOM TRAFFIC FLOW LAYER =====
// Real-time traffic visualization overlay
let trafficLayer = null;
let showTrafficEnabled = localStorage.getItem('showTrafficEnabled') !== 'false'; // Default: enabled

// ===== 3D BUILDINGS TOGGLE =====
// Controls fill-extrusion 3D building visibility
let buildings3DEnabled = localStorage.getItem('buildings3DEnabled') !== 'false'; // Default: enabled
let buildings3DHeightMultiplier = parseFloat(localStorage.getItem('buildings3DHeight')) || 1.0; // Height exaggeration
let buildings3DOpacity = parseFloat(localStorage.getItem('buildings3DOpacity')) || 0.6; // Transparency

/**
 * Toggle 3D buildings layer on/off
 * @function toggle3DBuildings
 */
function toggle3DBuildings() {
    buildings3DEnabled = !buildings3DEnabled;
    localStorage.setItem('buildings3DEnabled', buildings3DEnabled ? 'true' : 'false');

    const toggle = document.getElementById('buildings3DToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, buildings3DEnabled);

    if (buildings3DEnabled) {
        MapLibreHelpers.add3DBuildings(map, {
            heightMultiplier: buildings3DHeightMultiplier,
            opacity: buildings3DOpacity
        });
        showStatus('🏢 3D Buildings enabled', 'success');
        console.log('[3D Buildings] Enabled');
    } else {
        MapLibreHelpers.remove3DBuildings(map);
        showStatus('🏢 3D Buildings disabled', 'info');
        console.log('[3D Buildings] Disabled');
    }

    if (typeof _recomputeMapView3DFromGranular === 'function') _recomputeMapView3DFromGranular();
    saveAllSettings();
}

// ===== ROAD LABELS TOGGLE =====
// Controls road name label visibility on the map
let roadLabelsEnabled = localStorage.getItem('roadLabelsEnabled') !== 'false'; // Default: enabled

// After async style load replaces voyagr-bootstrap, re-apply saved label visibility (initializeRoadLabels may have run on empty bootstrap).
if (typeof window !== 'undefined') {
    window.addEventListener('voyagr-vector-style-ready', () => {
        try {
            if (!map || !window.MapLibreHelpers) return;
            const on = localStorage.getItem('roadLabelsEnabled') !== 'false';
            MapLibreHelpers.toggleRoadLabels(map, on);
        } catch (e) {
            /* ignore */
        }
        if (typeof scheduleMapRepaintAfterUiChange === 'function') {
            scheduleMapRepaintAfterUiChange();
        }
        // setStyle() removes raster overlays; JS handles still pointed at removed layers.
        try {
            if (!map) return;
            if (trafficLayer && !map.getLayer('traffic-layer')) {
                trafficLayer = null;
            }
            if (weatherLayer && !map.getLayer('weather-layer')) {
                weatherLayer = null;
            }
            if (showTrafficEnabled) {
                addTrafficLayer();
            }
            if (showWeatherEnabled) {
                addWeatherLayer();
            }
        } catch (e) {
            /* ignore */
        }
    });
}

/**
 * Toggle road name labels on/off
 * @function toggleRoadLabels
 */
function toggleRoadLabels() {
    roadLabelsEnabled = !roadLabelsEnabled;
    localStorage.setItem('roadLabelsEnabled', roadLabelsEnabled ? 'true' : 'false');

    const toggle = document.getElementById('roadLabelsToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, roadLabelsEnabled, {
        inactiveBackground: '#ccc',
        inactiveBorder: '#ccc',
    });

    if (map) {
        MapLibreHelpers.toggleRoadLabels(map, roadLabelsEnabled);
        showStatus(roadLabelsEnabled ? '🛣️ Road labels enabled' : '🛣️ Road labels disabled', 'info');
        console.log(`[Road Labels] ${roadLabelsEnabled ? 'Enabled' : 'Disabled'}`);
    }

    saveAllSettings();
}

// ===== GOOGLE PLUS CODES TOGGLE =====
// Controls Google Plus Codes input for destination search
let googlePlusCodesEnabled = localStorage.getItem('googlePlusCodesEnabled') === 'true'; // Default: disabled

/**
 * Toggle Google Plus Codes input on/off
 * @function toggleGooglePlusCodes
 */
function toggleGooglePlusCodes() {
    googlePlusCodesEnabled = !googlePlusCodesEnabled;
    localStorage.setItem('googlePlusCodesEnabled', googlePlusCodesEnabled ? 'true' : 'false');

    const toggle = document.getElementById('googlePlusCodesToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, googlePlusCodesEnabled, {
        inactiveBackground: '#ccc',
        inactiveBorder: '#ccc',
    });

    showStatus(googlePlusCodesEnabled ? '📍 Google Plus Codes enabled' : '📍 Google Plus Codes disabled', 'info');
    console.log(`[Google Plus Codes] ${googlePlusCodesEnabled ? 'Enabled' : 'Disabled'}`);

    saveAllSettings();
}

/**
 * Set 3D building height exaggeration
 * @function set3DBuildingHeight
 * @param {number} multiplier - Height multiplier (1.0 = normal, 2.0 = double height)
 */
function set3DBuildingHeight(multiplier) {
    buildings3DHeightMultiplier = Math.max(0.5, Math.min(3.0, multiplier));
    localStorage.setItem('buildings3DHeight', buildings3DHeightMultiplier.toString());
    MapLibreHelpers.set3DBuildingHeight(map, buildings3DHeightMultiplier);
    console.log(`[3D Buildings] Height multiplier set to ${buildings3DHeightMultiplier}`);
}

/**
 * Set 3D building opacity/transparency
 * @function set3DBuildingOpacity
 * @param {number} opacity - Opacity value (0.0 = transparent, 1.0 = opaque)
 */
function set3DBuildingOpacity(opacity) {
    buildings3DOpacity = Math.max(0.1, Math.min(1.0, opacity));
    localStorage.setItem('buildings3DOpacity', buildings3DOpacity.toString());
    MapLibreHelpers.set3DBuildingOpacity(map, buildings3DOpacity);
    console.log(`[3D Buildings] Opacity set to ${buildings3DOpacity}`);
}

/**
 * Toggle TomTom traffic flow layer on/off
 */
function toggleTrafficLayer() {
    showTrafficEnabled = !showTrafficEnabled;
    localStorage.setItem('showTrafficEnabled', showTrafficEnabled);

    const toggle = document.getElementById('showTrafficToggle');
    if (toggle) {
        toggle.classList.toggle('active', showTrafficEnabled);
    }

    if (showTrafficEnabled) {
        addTrafficLayer();
        showStatus('🚦 Traffic layer enabled', 'success');
        console.log('[Traffic] Traffic flow layer enabled');
    } else {
        removeTrafficLayer();
        showStatus('🚦 Traffic layer disabled', 'info');
        console.log('[Traffic] Traffic flow layer disabled');
    }

    saveAllSettings();
}

/**
 * Add TomTom traffic flow tile layer to map.
 *
 * Notes on race-condition handling:
 *   - The basemap style is fetched asynchronously (see voyagr-core.js: bootstrap
 *     style → setStyle(realStyle)). Until the real style is loaded, calling
 *     `map.addSource()` throws "Style is not done loading."
 *   - We previously handled this with `map.once('style.load')` *plus* a 1 s
 *     `setTimeout` fallback. On slow first paints the setTimeout fired before
 *     the style was ready (the error you're seeing in the console) and on the
 *     style.load path it then fired a second time, which is why the success
 *     line appeared 2-3 times.
 *   - This version uses a module-level reentry guard, polls `isStyleLoaded()`
 *     instead of blindly trying, and re-checks `isStyleLoaded()` inside the
 *     add path so the `style.load` listener cannot fire it in an unsafe state.
 */
function addTrafficLayer() {
    if (!map) {
        console.log('[Traffic] Map not ready');
        return;
    }

    try {
        if (trafficLayer && !map.getLayer('traffic-layer')) {
            trafficLayer = null;
        }
    } catch (e) {
        /* ignore */
    }

    // Reentry guard. addTrafficLayer() can be invoked from initTrafficLayer(),
    // the /api/config fetch resolver, the theme switcher and the network-recover
    // path; without this they pile up listeners and produce duplicate
    // "added successfully" log lines.
    if (window.__voyagrTrafficLayerPending) {
        return;
    }

    // Remove existing traffic layer (idempotent — no-op if absent)
    removeTrafficLayer();

    // TomTom Traffic Flow Tiles - relative speed coloring
    // Green = free flow, Yellow = slow, Red = congested, Black = blocked
    // Using 'relative0' style which shows all roads with traffic coloring
    const useProxy = window.VOYAGR_TOMTOM_TRAFFIC_PROXY === true;
    const tomtomApiKey = window.TOMTOM_API_KEY || '';

    console.log('[Traffic] API key / proxy check:', {
        useServerProxy: useProxy,
        windowKey: typeof window.TOMTOM_API_KEY,
        keyLength: tomtomApiKey ? tomtomApiKey.length : 0,
        hasKey: !!tomtomApiKey
    });

    // If key not available and we are not using the server tile proxy, try fetching from /api/config
    if (!useProxy && !tomtomApiKey) {
        console.log('[Traffic] Fetching config from server...');
        fetch('/api/config')
            .then(r => r.json())
            .then(data => {
                applySupportLinksFromConfig(data);
                if (data.tomtom_traffic_tile_proxy) {
                    window.VOYAGR_TOMTOM_TRAFFIC_PROXY = true;
                    console.log('[Traffic] Server tile proxy enabled — key stays off the client');
                    addTrafficLayer();
                    return;
                }
                if (data.success && data.tomtom_api_key) {
                    window.TOMTOM_API_KEY = data.tomtom_api_key;
                    console.log('[Traffic] API key loaded from server, reinitializing...');
                    addTrafficLayer();
                    return;
                }
                console.log('[Traffic] No API key from server - using route-level traffic only');
            })
            .catch(err => console.log('[Traffic] Failed to fetch config:', err));
        return;
    }

    let scheduled = false;
    const scheduleOnce = (fn) => {
        if (scheduled) return;
        scheduled = true;
        fn();
    };

    const addTrafficLayerNow = () => {
        // Safety: style may have unloaded between scheduling and execution (e.g.
        // theme switch / soft style reload). Re-check; bail to the poller below.
        if (!map || typeof map.isStyleLoaded !== 'function' || !map.isStyleLoaded()) {
            return false;
        }
        try {
            const useProxyNow = window.VOYAGR_TOMTOM_TRAFFIC_PROXY === true;
            const key = window.TOMTOM_API_KEY || '';
            let tiles;
            if (useProxyNow) {
                tiles = [`${window.location.origin}/api/tomtom/traffic-tile/{z}/{x}/{y}.png`];
            } else if (key) {
                tiles = [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${key}&tileSize=256`];
            } else {
                console.log('[Traffic] No tile URL available');
                return true;
            }

            if (!map.getSource('traffic-source')) {
                map.addSource('traffic-source', {
                    type: 'raster',
                    tiles,
                    tileSize: 256,
                    minzoom: 0,
                    maxzoom: 16,
                    bounds: [-180, -85.0511, 180, 85.0511]
                });
            }

            if (!map.getLayer('traffic-layer')) {
                // Find the first symbol layer (road labels) to insert traffic BELOW it
                // This ensures: base map → traffic → routes → road labels
                let trafficBeforeId = undefined;
                const style = map.getStyle();
                if (style && style.layers) {
                    const firstSymbolLayer = style.layers.find(l =>
                        l.type === 'symbol' &&
                        l.layout &&
                        l.layout['text-field']
                    );
                    if (firstSymbolLayer) {
                        trafficBeforeId = firstSymbolLayer.id;
                        console.log(`[Traffic] Inserting traffic layer before symbol layer: ${trafficBeforeId}`);
                    }
                }

                map.addLayer({
                    id: 'traffic-layer',
                    type: 'raster',
                    source: 'traffic-source',
                    minzoom: 0,
                    maxzoom: 16,
                    paint: { 'raster-opacity': 0.6 }
                }, trafficBeforeId);
            }

            trafficLayer = { id: 'traffic-layer' };
            console.log('[Traffic] TomTom traffic layer added successfully');

            // Ensure routes stay on top of traffic
            bringRoutesToTop();
            return true;
        } catch (e) {
            console.error('[Traffic] Error adding traffic layer:', e);
            return true;
        }
    };

    const runOnce = () => scheduleOnce(() => {
        try { addTrafficLayerNow(); } finally { window.__voyagrTrafficLayerPending = false; }
    });

    window.__voyagrTrafficLayerPending = true;

    if (map.isStyleLoaded()) {
        runOnce();
        return;
    }

    console.log('[Traffic] Waiting for style to load...');
    // 1) Listen for the next style.load event.
    map.once('style.load', runOnce);
    // 2) Bounded poll as a belt-and-braces: if the style.load event was missed
    //    (some MapLibre versions don't fire it on the initial async setStyle if
    //    the bootstrap style was already "loaded"), we still recover.
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~10s at 250ms
    const poll = () => {
        if (scheduled) return;
        if (!map) { window.__voyagrTrafficLayerPending = false; return; }
        if (map.isStyleLoaded()) {
            runOnce();
            return;
        }
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
            console.warn('[Traffic] Style not loaded after polling — giving up');
            window.__voyagrTrafficLayerPending = false;
            return;
        }
        setTimeout(poll, 250);
    };
    setTimeout(poll, 250);
}

/**
 * Remove traffic layer from map
 */
function removeTrafficLayer() {
    if (trafficLayer && map) {
        if (map.getLayer('traffic-layer')) {
            map.removeLayer('traffic-layer');
        }
        if (map.getSource('traffic-source')) {
            map.removeSource('traffic-source');
        }
        trafficLayer = null;
        console.log('[Traffic] Traffic layer removed');
    }
}

let _trafficTileErrorStreak = 0;
let _trafficLayerPausedUntil = 0;

/**
 * Back off TomTom raster traffic when the tile proxy errors (rate limit / upstream).
 * Called from voyagr-core map error handler.
 * @param {number} statusCode
 */
function voyagrOnTrafficTileLoadError(statusCode) {
    if (statusCode !== 429 && statusCode !== 500 && statusCode !== 502 && statusCode !== 503) return;
    _trafficTileErrorStreak++;
    if (_trafficTileErrorStreak < 3) return;
    if (Date.now() < _trafficLayerPausedUntil) return;
    _trafficLayerPausedUntil = Date.now() + 120000;
    _trafficTileErrorStreak = 0;
    removeTrafficLayer();
    console.warn('[Traffic] Pausing traffic overlay for 2 min after repeated tile errors');
}
if (typeof window !== 'undefined') {
    window.voyagrOnTrafficTileLoadError = voyagrOnTrafficTileLoadError;
}

/**
 * Initialize traffic layer based on saved preference
 */
function initTrafficLayer() {
    const toggle = document.getElementById('showTrafficToggle');
    if (toggle) {
        toggle.classList.toggle('active', showTrafficEnabled);
    }

    if (showTrafficEnabled && map) {
        try {
            const st = map.getStyle && map.getStyle();
            if (st && st.name === 'voyagr-bootstrap') {
                console.log('[Traffic] Deferring traffic flow until basemap style loads');
                return;
            }
        } catch (e) {
            /* ignore */
        }
        addTrafficLayer();
    }
}

// ===== WEATHER LAYER (OpenWeatherMap Tiles) =====
// Real-time weather visualization overlay showing precipitation/clouds/temperature
let weatherLayer = null;
let showWeatherEnabled = localStorage.getItem('showWeatherEnabled') === 'true'; // Default: disabled
let weatherLayerType = localStorage.getItem('weatherLayerType') || 'precipitation_new'; // precipitation_new, clouds_new, temp_new

/**
 * Toggle weather layer on/off
 */
function toggleWeatherLayer() {
    showWeatherEnabled = !showWeatherEnabled;
    const toggle = document.getElementById('showWeatherToggle');
    VoyagrModules.toggleUI().writeBoolPref('showWeatherEnabled', showWeatherEnabled);
    VoyagrModules.toggleUI().applyToggleButton(toggle, showWeatherEnabled);

    if (showWeatherEnabled) {
        addWeatherLayer();
        showStatus('🌧️ Weather layer enabled', 'success');
        console.log('[Weather] Weather layer enabled');
    } else {
        removeWeatherLayer();
        showStatus('🌧️ Weather layer disabled', 'info');
        console.log('[Weather] Weather layer disabled');
    }

    saveAllSettings();
}

/**
 * Set weather layer type (precipitation, clouds, temperature)
 * @param {string} type - Layer type: 'precipitation_new', 'clouds_new', 'temp_new', 'wind_new'
 */
function setWeatherLayerType(type) {
    weatherLayerType = type;
    localStorage.setItem('weatherLayerType', type);

    // If weather layer is enabled, refresh it with new type
    if (showWeatherEnabled && map) {
        removeWeatherLayer();
        addWeatherLayer();
    }

    const typeName = VoyagrModules.weatherLayer().weatherLayerDisplayName(type);
    showStatus(`🌧️ Weather layer: ${typeName}`, 'info');
}

/**
 * Add OpenWeatherMap weather tile layer to map
 * Uses OpenWeatherMap's free weather tile API
 */
function addWeatherLayer() {
    if (!map) {
        console.log('[Weather] Map not ready');
        return;
    }

    try {
        if (weatherLayer && !map.getLayer('weather-layer')) {
            weatherLayer = null;
        }
    } catch (e) {
        /* ignore */
    }

    // Remove existing weather layer if any
    removeWeatherLayer();

    // Get OpenWeatherMap API key (same as used for weather data)
    let owmApiKey = window.OPENWEATHERMAP_API_KEY || '';

    // If key not available from inline script, try fetching from API
    if (!owmApiKey) {
        console.log('[Weather] Fetching API key from server...');
        fetch('/api/config')
            .then(r => r.json())
            .then(data => {
                applySupportLinksFromConfig(data);
                if (data.success && data.openweathermap_api_key) {
                    window.OPENWEATHERMAP_API_KEY = data.openweathermap_api_key;
                    console.log('[Weather] API key loaded from server, reinitializing...');
                    addWeatherLayer(); // Retry with new key
                } else {
                    console.log('[Weather] No API key from server - weather layer unavailable');
                    showStatus('⚠️ Weather layer requires API key', 'warning');
                }
            })
            .catch(err => console.log('[Weather] Failed to fetch config:', err));
        return;
    }

    // Wait for style to load before adding weather layer
    const addWeatherLayerNow = () => {
        try {
            // OpenWeatherMap weather tiles via modules/map/weather-layer.js.
            // Available layers: precipitation_new, clouds_new, temp_new, wind_new, pressure_new
            const WL = VoyagrModules.weatherLayer();
            const tileUrl = WL.buildWeatherTileUrl(weatherLayerType, owmApiKey);

            if (!map.getSource('weather-source')) {
                map.addSource('weather-source', WL.buildWeatherSourceSpec(tileUrl));
            }

            if (!map.getLayer('weather-layer')) {
                // Add weather layer below route layers but above base map
                map.addLayer(WL.buildWeatherLayerSpec());
            }

            weatherLayer = { id: 'weather-layer' };
            console.log(`[Weather] OpenWeatherMap ${weatherLayerType} layer added successfully`);

            // Ensure routes stay on top of weather
            bringRoutesToTop();
        } catch (e) {
            console.error('[Weather] Error adding weather layer:', e);
        }
    };

    if (map.isStyleLoaded()) {
        addWeatherLayerNow();
    } else {
        console.log('[Weather] Waiting for style to load...');
        map.once('style.load', addWeatherLayerNow);
        setTimeout(addWeatherLayerNow, 1000);
    }
}

/**
 * Remove weather layer from map
 */
function removeWeatherLayer() {
    if (weatherLayer && map) {
        if (map.getLayer('weather-layer')) {
            map.removeLayer('weather-layer');
        }
        if (map.getSource('weather-source')) {
            map.removeSource('weather-source');
        }
        weatherLayer = null;
        console.log('[Weather] Weather layer removed');
    }
}

/**
 * Initialize weather layer based on saved preference
 */
function initWeatherLayer() {
    const toggle = document.getElementById('showWeatherToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, showWeatherEnabled);

    if (showWeatherEnabled && map) {
        try {
            const st = map.getStyle && map.getStyle();
            if (st && st.name === 'voyagr-bootstrap') {
                console.log('[Weather] Deferring weather overlay until basemap style loads');
                return;
            }
        } catch (e) {
            /* ignore */
        }
        addWeatherLayer();
    }
}

// ===== ROUTE TRAFFIC EDGE COLORING =====
// Displays traffic congestion as coloured edges along the active route.
// Only congested segments (orange/red/black) are drawn — free-flow green is omitted so
// the route line stays visible against TomTom's green traffic tiles.

let routeTrafficLayers = []; // Array of polylines for traffic segments
let routeTrafficEnabled = localStorage.getItem('routeTrafficEnabled') !== 'false'; // Default: enabled
let routeTrafficUpdateInterval = null;
const ROUTE_TRAFFIC_UPDATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// Traffic level colors (matching traffic light colors)
// These overlay on top of the route to show real-time traffic conditions
const TRAFFIC_COLORS = {
    'green': '#22CC22',   // Free flow - bright green for visibility
    'orange': '#FF8C00',  // Moderate congestion - orange
    'red': '#FF0000',     // Heavy congestion - red
    'black': '#333333'    // Blocked/severe - dark
};

/**
 * Toggle route traffic edge display on/off
 */
function toggleRouteTraffic() {
    routeTrafficEnabled = !routeTrafficEnabled;
    const toggle = document.getElementById('routeTrafficToggle');
    VoyagrModules.toggleUI().writeBoolPref('routeTrafficEnabled', routeTrafficEnabled);
    VoyagrModules.toggleUI().applyToggleButton(toggle, routeTrafficEnabled);

    if (routeTrafficEnabled) {
        showStatus('🚦 Route traffic display enabled', 'success');
        if (routeInProgress && routePolyline) {
            fetchAndDisplayRouteTraffic();
        }
    } else {
        showStatus('🚦 Route traffic display disabled', 'info');
        clearRouteTrafficLayers();
    }
}

/**
 * Clear all route traffic edge layers from the map
 */
function clearRouteTrafficLayers() {
    routeTrafficLayers.forEach(layer => {
        if (layer) {
            // MapLibre layers have a remove() method
            if (typeof layer.remove === 'function') {
                layer.remove();
            } else if (map && layer.id && map.getLayer(layer.id)) {
                // Fallback: remove by layer ID
                map.removeLayer(layer.id);
                if (map.getSource(layer.id)) {
                    map.removeSource(layer.id);
                }
            }
        }
    });
    routeTrafficLayers = [];
    console.log('[Route Traffic] Cleared traffic edge layers');
}

/**
 * Fetch traffic data for route and display colored edges
 */
async function fetchAndDisplayRouteTraffic() {
    if (!routeTrafficEnabled || !routePolyline || routePolyline.length < 2) {
        console.log('[Route Traffic] Not enabled or no route available');
        return;
    }

    console.log('[Route Traffic] Fetching traffic data for route...');

    try {
        // Sample route points (every 10th point to reduce API calls)
        const sampleInterval = Math.max(1, Math.floor(routePolyline.length / 20));

        const data = await fetchRouteTrafficFlowPayload(routePolyline, sampleInterval);
        if (!data) {
            console.debug('[Route Traffic] No traffic data (backoff or upstream unavailable)');
            return;
        }

        if (data.success && data.segments && data.segments.length > 0) {
            displayRouteTrafficEdges(data.segments);
            console.log(`[Route Traffic] Displayed ${data.segments.length} traffic segments (source: ${data.source})`);
        } else {
            console.debug('[Route Traffic] No traffic segments returned');
        }
    } catch (error) {
        console.debug('[Route Traffic] Error fetching traffic:', error);
    }
}

/**
 * Find the index of the closest point in the route polyline to a given coordinate
 */
function findClosestRoutePointIndex(targetPoint, startSearchIdx = 0) {
    if (!routePolyline || routePolyline.length === 0) return -1;

    let closestIdx = startSearchIdx;
    let minDist = Infinity;

    // Search from startSearchIdx onwards to maintain order
    for (let i = startSearchIdx; i < routePolyline.length; i++) {
        const point = routePolyline[i];
        const dist = Math.pow(point[0] - targetPoint[0], 2) + Math.pow(point[1] - targetPoint[1], 2);
        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    }
    return closestIdx;
}

/**
 * Display traffic-colored edges along the route
 * Creates polylines that follow the actual route geometry (not straight lines)
 * Traffic edges are drawn ON TOP of the route with thick, visible lines
 */
function displayRouteTrafficEdges(segments) {
    // Clear existing traffic layers
    clearRouteTrafficLayers();

    if (!map || !segments || segments.length === 0 || !routePolyline || routePolyline.length === 0) {
        console.log('[Route Traffic] Cannot display - map:', !!map, 'segments:', segments?.length, 'routePolyline:', routePolyline?.length);
        return;
    }

    // Count traffic levels for debugging
    const levelCounts = { green: 0, orange: 0, red: 0, black: 0 };
    segments.forEach(s => levelCounts[s.traffic_level] = (levelCounts[s.traffic_level] || 0) + 1);
    console.log('[Route Traffic] Segment levels:', levelCounts);

    let lastEndIdx = 0;  // Track position along route to ensure segments are in order

    segments.forEach((segment, idx) => {
        const level = segment.traffic_level || 'green';

        // Find the indices in the route polyline that correspond to this segment
        const startIdx = findClosestRoutePointIndex(segment.start, lastEndIdx);
        const endIdx = findClosestRoutePointIndex(segment.end, startIdx);

        // Skip invalid segments
        if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
            console.log(`[Route Traffic] Skipping invalid segment ${idx}: startIdx=${startIdx}, endIdx=${endIdx}`);
            return;
        }

        // Advance the cursor for EVERY valid segment (including skipped green ones) so
        // congested segments after a free-flow gap still map to the correct geometry.
        lastEndIdx = endIdx;

        // Skip free-flow: green overlays hid the active route line on top of green traffic tiles.
        if (level === 'green') {
            return;
        }
        const color = TRAFFIC_COLORS[level] || TRAFFIC_COLORS['orange'];

        // Extract all route points between start and end to follow the curved road geometry
        let segmentPoints = routePolyline.slice(startIdx, endIdx + 1);

        if (segmentPoints.length < 2) {
            // Fallback to direct line if not enough points
            segmentPoints = [segment.start, segment.end];
        }

        // Create the traffic edge polyline following the route geometry with MapLibre
        // Traffic edges are drawn ON TOP of the route line so they're visible
        const trafficLine = MapLibreHelpers.addPolyline(map, segmentPoints, {
            color: color,
            weight: 6,            // Slightly thinner than route but still visible
            opacity: 0.9          // High opacity to clearly show traffic
        });
        routeTrafficLayers.push(trafficLine);
    });

    console.log(`[Route Traffic] Added ${routeTrafficLayers.length} congested traffic edge layers`);

    // Traffic below labels; active route line stays above traffic edges.
    bringTrafficEdgesToTop();
    bringNavRouteAboveTrafficEdges();
}

/**
 * Bring traffic edge layers to top of map rendering order
 */
function bringTrafficEdgesToTop() {
    if (!map || routeTrafficLayers.length === 0) return;

    try {
        // Find the first symbol/label layer to insert traffic edges BEFORE
        // This keeps traffic edges above routes but below road labels
        const style = map.getStyle();
        let beforeId = undefined;
        if (style && style.layers) {
            const symbolLayer = style.layers.find(l =>
                l.type === 'symbol' &&
                l.layout &&
                l.layout['text-field']
            );
            if (symbolLayer) {
                beforeId = symbolLayer.id;
            }
        }

        routeTrafficLayers.forEach(layer => {
            if (layer && layer.id && map.getLayer(layer.id)) {
                map.moveLayer(layer.id, beforeId);
            }
        });
        console.log(`[Route Traffic] Traffic edge layers moved before ${beforeId || 'top'}`);

        // Ensure labels stay on top as final safety check
        ensureLabelsOnTop();
    } catch (e) {
        console.log('[Route Traffic] Error moving traffic layers to top:', e.message);
    }
}

/**
 * Keep the active navigation route (and multi-route preview lines) above route-traffic
 * edge overlays but below road labels. routeLayer is not in allRouteLayers, so reroutes
 * were previously drawn under green/orange traffic polylines.
 */
function bringNavRouteAboveTrafficEdges() {
    if (!map) return;

    try {
        const style = map.getStyle();
        let beforeId = undefined;
        if (style && style.layers) {
            const symbolLayer = style.layers.find(l =>
                l.type === 'symbol' &&
                l.layout &&
                l.layout['text-field']
            );
            if (symbolLayer) {
                beforeId = symbolLayer.id;
            }
        }

        const routeLineIds = [];
        if (routeLayer && routeLayer.id) {
            if (routeLayer.outlineId && map.getLayer(routeLayer.outlineId)) {
                routeLineIds.push(routeLayer.outlineId);
            }
            if (map.getLayer(routeLayer.id)) {
                routeLineIds.push(routeLayer.id);
            }
        }
        if (allRouteLayers && allRouteLayers.length > 0) {
            allRouteLayers.forEach(layer => {
                if (layer && layer.id && map.getLayer(layer.id)) {
                    routeLineIds.push(layer.id);
                }
            });
        }

        if (routeLineIds.length === 0) return;

        routeLineIds.forEach(layerId => {
            map.moveLayer(layerId, beforeId);
        });
        ensureLabelsOnTop();
        console.log('[Routes] Navigation route above traffic edges:', routeLineIds.join(', '));
    } catch (e) {
        console.warn('[Routes] bringNavRouteAboveTrafficEdges:', e.message);
    }
}

// Debounce timer for ensureLabelsOnTop to prevent excessive calls
let ensureLabelsTimeout = null;

/**
 * Ensure road labels are always rendered above route and traffic layers
 * This function moves all symbol layers with text-field to the top of the layer stack
 * Debounced to prevent excessive calls during rapid layer additions
 */
function ensureLabelsOnTop() {
    if (!map) return;

    // Debounce to prevent excessive calls
    clearTimeout(ensureLabelsTimeout);
    ensureLabelsTimeout = setTimeout(() => {
        try {
            const style = map.getStyle();
            if (!style || !style.layers) return;

            // Find all label/symbol layers with text content
            const labelLayers = style.layers.filter(layer =>
                layer.type === 'symbol' &&
                layer.layout &&
                layer.layout['text-field']
            );

            if (labelLayers.length === 0) {
                console.log('[Labels] No label layers found');
                return;
            }

            // Move each label layer to the top
            labelLayers.forEach(layer => {
                try {
                    if (map.getLayer(layer.id)) {
                        map.moveLayer(layer.id);
                    }
                } catch (e) {
                    // Silently skip layers that can't be moved
                }
            });

            console.log(`[Labels] Moved ${labelLayers.length} label layers to top`);
        } catch (e) {
            console.log('[Labels] Error ensuring labels on top:', e.message);
        }
    }, 50);  // 50ms debounce delay
}

/**
 * Start automatic route traffic updates during navigation
 */
function startRouteTrafficUpdates() {
    if (routeTrafficUpdateInterval) {
        clearInterval(routeTrafficUpdateInterval);
    }

    console.log('[Route Traffic] Starting updates - enabled:', routeTrafficEnabled, 'polyline:', routePolyline ? routePolyline.length : 0);

    // Immediate first update with slight delay to ensure route is drawn first
    if (routeTrafficEnabled && routePolyline && routePolyline.length > 0) {
        setTimeout(() => {
            console.log('[Route Traffic] Executing first traffic update');
            fetchAndDisplayRouteTraffic();
        }, 500);
    }

    // Set up periodic updates
    routeTrafficUpdateInterval = setInterval(() => {
        if (routeInProgress && routeTrafficEnabled && routePolyline && routePolyline.length > 0) {
            console.log('[Route Traffic] Periodic update triggered');
            fetchAndDisplayRouteTraffic();
        }
    }, ROUTE_TRAFFIC_UPDATE_INTERVAL_MS);

    console.log('[Route Traffic] Started automatic updates every', ROUTE_TRAFFIC_UPDATE_INTERVAL_MS / 1000, 'seconds');
}

/**
 * Stop automatic route traffic updates
 */
function stopRouteTrafficUpdates() {
    if (routeTrafficUpdateInterval) {
        clearInterval(routeTrafficUpdateInterval);
        routeTrafficUpdateInterval = null;
    }
    clearRouteTrafficLayers();
    console.log('[Route Traffic] Stopped automatic updates');
}

// ===== AUTO-TRAFFIC UPDATE & AUTO-REROUTE SYSTEM =====
// Feature 1: Automatic traffic updates during navigation
// Feature 2: Automatic rerouting on deviation with hazard avoidance

// Auto-traffic update settings
let autoTrafficUpdateEnabled = localStorage.getItem('autoTrafficUpdate') !== 'false'; // Default: enabled
let autoRerouteOnDeviationEnabled = localStorage.getItem('autoRerouteOnDeviation') !== 'false'; // Default: enabled
let trafficUpdateInterval = null;
const TRAFFIC_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastTrafficData = null;
let lastTrafficUpdateTime = 0;

// Deviation tracking for time-based detection
let deviationStartTime = null;
let isCurrentlyDeviated = false;
const DEVIATION_THRESHOLD_METERS = 50;
const DEVIATION_TIME_THRESHOLD_MS = 10000; // 10 seconds
// Ignore fixes worse than this (metres) for deviation — too unreliable to act on.
const DEVIATION_MAX_TRUST_ACCURACY_M = 65;
// Cap on how much GPS error can widen the deviation threshold.
const DEVIATION_ACC_EXTRA_CAP_M = 40;
/** Until GPS is this close to the route line, skip deviation alerts/reroute (e.g. start point ≠ current location). */
/** Require GPS to be this close to the polyline before deviation reroutes fire (lower = sooner real-world reroutes). */
const ROUTE_JOIN_GATE_METERS = 85;
let routeJoinConfirmedForDeviation = false;
/** After GPS deviation reroute, next in-nav route pick uses primary only (no name-based alt). */
let _preferPrimaryRouteOnNextNavUpdate = false;

/**
 * Pick which route object to apply during active navigation.
 * Name-based matching is skipped once after automatic deviation reroute.
 *
 * @param {Array<Object>|null|undefined} routeList - `data.routes` from /api/route
 * @param {Object|null|undefined} singleRoutePayload - fallback when no list
 * @returns {Object|null}
 */
function pickActiveRouteDuringNavigation(routeList, singleRoutePayload) {
    const preferPrimary = _preferPrimaryRouteOnNextNavUpdate;
    if (preferPrimary) {
        _preferPrimaryRouteOnNextNavUpdate = false;
        console.log('[Reroute] Using primary route (post-deviation; skipping name match)');
    }
    const activeRoute = VoyagrModules.routeSelection().pickActiveRouteDuringNavigation(
        routeList,
        singleRoutePayload,
        {
            preferPrimary: preferPrimary,
            previousRouteName: window.lastCalculatedRoute ? window.lastCalculatedRoute.name : '',
        }
    );
    if (!preferPrimary && routeList && routeList.length > 1 && window.lastCalculatedRoute && activeRoute !== routeList[0]) {
        console.log(`[Reroute] Matched previous route "${activeRoute.name}"`);
    }
    return activeRoute;
}

/**
 * Toggle auto-traffic update on/off
 */
function toggleAutoTrafficUpdate() {
    autoTrafficUpdateEnabled = !autoTrafficUpdateEnabled;
    localStorage.setItem('autoTrafficUpdate', autoTrafficUpdateEnabled ? 'true' : 'false');

    const toggle = document.getElementById('autoTrafficUpdateToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, autoTrafficUpdateEnabled);

    if (autoTrafficUpdateEnabled) {
        showStatus('🚦 Auto-traffic updates enabled', 'success');
        if (routeInProgress) {
            startAutoTrafficUpdates();
        }
    } else {
        showStatus('🚦 Auto-traffic updates disabled', 'info');
        stopAutoTrafficUpdates();
    }

    saveAllSettings();
}

/**
 * Toggle auto-reroute on deviation on/off
 */
function toggleAutoRerouteOnDeviation() {
    autoRerouteOnDeviationEnabled = !autoRerouteOnDeviationEnabled;
    localStorage.setItem('autoRerouteOnDeviation', autoRerouteOnDeviationEnabled ? 'true' : 'false');

    const toggle = document.getElementById('autoRerouteDeviationToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, autoRerouteOnDeviationEnabled);

    if (autoRerouteOnDeviationEnabled) {
        showStatus('🔄 Auto-reroute on deviation enabled', 'success');
    } else {
        showStatus('🔄 Auto-reroute on deviation disabled', 'info');
    }

    saveAllSettings();
}

/**
 * Start automatic traffic updates during navigation
 */
function startAutoTrafficUpdates() {
    if (!autoTrafficUpdateEnabled || trafficUpdateInterval) return;

    console.log('[Auto-Traffic] Starting automatic traffic updates (every 5 minutes)');

    // Immediate first update
    checkTrafficAndReroute();

    // Set up interval
    trafficUpdateInterval = setInterval(() => {
        if (routeInProgress && autoTrafficUpdateEnabled) {
            checkTrafficAndReroute();
        }
    }, TRAFFIC_UPDATE_INTERVAL_MS);
}

/**
 * Stop automatic traffic updates
 */
function stopAutoTrafficUpdates() {
    if (trafficUpdateInterval) {
        clearInterval(trafficUpdateInterval);
        trafficUpdateInterval = null;
        console.log('[Auto-Traffic] Stopped automatic traffic updates');
    }
}

// Shared along-route traffic sampler (Levers A + B). Samples live TomTom flow on the
// portion of the active route still ahead of the driver and returns congested-segment
// avoid points plus a realistic extra-delay estimate. Cached briefly so the ETA refresh
// and the reroute monitor don't each hit the API.
let _routeTrafficSampleCache = null; // { at: ms, result }
const ROUTE_TRAFFIC_SAMPLE_TTL_MS = 60 * 1000;
let _routeTrafficFlowBackoffUntil = 0;

async function fetchRouteTrafficFlowPayload(points, sampleInterval) {
    if (Date.now() < _routeTrafficFlowBackoffUntil) {
        return null;
    }

    let response;
    try {
        response = await fetch('/api/route-traffic-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points, sample_interval: sampleInterval })
        });
    } catch (e) {
        _routeTrafficFlowBackoffUntil = Date.now() + 60000;
        console.debug('[Route Traffic] network error:', e && e.message);
        return null;
    }

    if (!response.ok) {
        _routeTrafficFlowBackoffUntil = Date.now() + (response.status >= 500 ? 90000 : 30000);
        console.debug('[Route Traffic] HTTP', response.status);
        return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        _routeTrafficFlowBackoffUntil = Date.now() + 60000;
        console.debug('[Route Traffic] non-JSON response');
        return null;
    }

    try {
        return await response.json();
    } catch (e) {
        _routeTrafficFlowBackoffUntil = Date.now() + 60000;
        console.debug('[Route Traffic] JSON parse failed:', e && e.message);
        return null;
    }
}

async function sampleRouteTrafficAhead() {
    if (!routePolyline || routePolyline.length < 2) return null;
    const startIdx = Math.max(0, Math.min(lastSnappedRouteIndex || 0, routePolyline.length - 2));
    const ahead = routePolyline.slice(startIdx);
    if (ahead.length < 2) return null;

    // Send [lat, lon] points; sample so we get roughly 8 segments along the road ahead.
    const points = ahead.map(p => [p[0], p[1]]);
    const sampleInterval = Math.max(1, Math.floor(points.length / 8));

    let data;
    try {
        data = await fetchRouteTrafficFlowPayload(points, sampleInterval);
    } catch (e) {
        console.debug('[Auto-Traffic] route-traffic-flow fetch failed:', e);
        return null;
    }
    if (!data) return null;
    if (!data || !data.success || !Array.isArray(data.segments)) return null;

    let delaySec = 0;
    let congestedCount = 0;
    let congestionSum = 0;
    let severe = false;
    const congestedPoints = [];
    for (const seg of data.segments) {
        const lvl = seg.traffic_level;
        const cur = Number(seg.current_speed) || 0;
        const free = Number(seg.free_flow_speed) || 0;
        const s = seg.start, e = seg.end;
        if (!Array.isArray(s) || !Array.isArray(e)) continue;
        const segMeters = calculateDistanceMeters(s[0], s[1], e[0], e[1]);
        if (cur > 0 && free > 0 && cur < free && segMeters > 0) {
            const km = segMeters / 1000;
            delaySec += (km / cur - km / free) * 3600; // extra seconds vs free-flow
        }
        congestionSum += Number(seg.congestion_percent) || 0;
        if (lvl === 'orange' || lvl === 'red' || lvl === 'black') {
            congestedCount++;
            // Only red/black are worth routing around; orange is tolerable.
            if (lvl === 'red' || lvl === 'black') {
                congestedPoints.push({ lat: (s[0] + e[0]) / 2, lon: (s[1] + e[1]) / 2 });
            }
            if (lvl === 'black') severe = true;
        }
    }

    return {
        delayMin: delaySec / 60,
        congestedCount,
        avgCongestion: data.segments.length ? Math.round(congestionSum / data.segments.length) : 0,
        severe,
        congestedPoints,
        // 'TomTom' = real data; 'simulated' = no API key (must NOT drive reroutes/ETA).
        source: data.source || 'unknown'
    };
}

async function getRouteTrafficAhead(forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && _routeTrafficSampleCache && (now - _routeTrafficSampleCache.at) < ROUTE_TRAFFIC_SAMPLE_TTL_MS) {
        return _routeTrafficSampleCache.result;
    }
    const result = await sampleRouteTrafficAhead();
    if (result) _routeTrafficSampleCache = { at: now, result };
    return result;
}

/**
 * Check live traffic along the route and reroute around real congestion/closures.
 */
async function checkTrafficAndReroute() {
    if (!routeInProgress || !currentLat || !currentLon) return;

    console.log('[Auto-Traffic] Sampling live traffic along route...');

    try {
        const flow = await getRouteTrafficAhead(true);
        lastTrafficUpdateTime = Date.now();

        if (!flow) {
            console.log('[Auto-Traffic] No usable traffic data');
            return;
        }
        // Never act on simulated data (no TomTom key) — it is random and would cause
        // spurious reroutes.
        if (flow.source !== 'TomTom') {
            console.log('[Auto-Traffic] Traffic data is simulated; skipping reroute decision');
            lastTrafficData = flow;
            return;
        }

        const changeType = detectSignificantTrafficChange(lastTrafficData, flow);
        lastTrafficData = flow;

        if (changeType) {
            console.log(`[Auto-Traffic] Significant change: ${changeType} (delay ~${flow.delayMin.toFixed(1)} min, ${flow.congestedPoints.length} avoid pts)`);
            const notifMsg = flow.severe
                ? 'Severe congestion ahead. Checking for a faster route...'
                : 'Heavier traffic ahead. Checking for a better route...';
            sendNotification('🚦 Traffic Update', notifMsg, 'warning');

            await triggerTrafficBasedReroute(changeType, flow.congestedPoints, flow.delayMin);
        } else {
            console.log('[Auto-Traffic] No significant traffic change');
        }
    } catch (error) {
        console.error('[Auto-Traffic] Error checking traffic:', error);
    }
}

/**
 * Decide whether a fresh route-traffic sample warrants a reroute attempt.
 * `current`/`previous` are sampleRouteTrafficAhead() results.
 */
// detectSignificantTrafficChange moved to modules/navigation/traffic-change.js (VoyagrTrafficChange).
function detectSignificantTrafficChange(previous, current) {
    return VoyagrModules.trafficChange().detectSignificantTrafficChange(previous, current);
}

/**
 * Trigger a reroute that actively avoids the congested/closed segments (Lever A).
 * @param {string} changeType - 'severe' | 'congestion'
 * @param {Array<{lat:number,lon:number}>} avoidPoints - congested segment midpoints to avoid
 * @param {number} measuredDelayMin - realistic extra delay on the current route (Lever B)
 */
async function triggerTrafficBasedReroute(changeType, avoidPoints = [], measuredDelayMin = 0) {
    const destination = resolveNavigationDestination();
    if (!destination) {
        console.log('[Auto-Traffic] No destination stored, cannot reroute');
        return;
    }

    if (!window.lastCalculatedRoute) {
        console.log('[Auto-Traffic] No route context, cannot reroute');
        return;
    }
    const isSevere = changeType === 'severe';
    console.log(`[Auto-Traffic] Calculating new route (reason: ${changeType}, avoid pts: ${avoidPoints.length})...`);

    try {
        const routeRequest = buildRouteRequest(currentLat, currentLon, destination, avoidPoints);
        const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeRequest)
        });

        const data = await response.json();

        if (data.success && data.routes && data.routes.length > 0) {
            const newRoute = data.routes[0];
            const oldBase = window.lastCalculatedRoute.duration_minutes || 0;
            const timeSaved = VoyagrModules.trafficChange().computeTrafficRerouteTimeSaved(
                oldBase,
                measuredDelayMin,
                newRoute.duration_minutes
            );

            if (VoyagrModules.trafficChange().shouldAcceptTrafficReroute(isSevere, timeSaved)) {
                updateRouteOnMap(newRoute);
                _routeTrafficSampleCache = null;
                lastTrafficData = null;
                const reason = isSevere ? 'severe congestion' : 'traffic';
                const saveMsg = VoyagrModules.trafficChange().formatTrafficRerouteSaveMessage(timeSaved);
                sendNotification('✅ Route Updated',
                    `New route found due to ${reason}. ${saveMsg}`, 'success');
                if (voiceAnnouncementsEnabled) {
                    speakMessage(`Route updated due to ${reason}. ${saveMsg}`, 'high');
                }
            } else {
                console.log('[Auto-Traffic] Alternative not significantly faster, keeping current route');
            }
        }
    } catch (error) {
        console.error('[Auto-Traffic] Error during traffic-based reroute:', error);
    }
}

/**
 * Manual traffic update button handler
 */
async function manualTrafficUpdate() {
    showStatus('🚦 Updating traffic...', 'info');
    await checkTrafficAndReroute();
    showStatus('🚦 Traffic updated', 'success');
}

/**
 * Destination as "lat,lon" for reroute APIs — must survive useRoute() replacing lastCalculatedRoute with a bare route option.
 */
function resolveNavigationDestination() {
    const lr = window.lastCalculatedRoute;
    const endEl = document.getElementById('end');
    let polylineEnd = null;
    if (typeof routePolyline !== 'undefined' && routePolyline && routePolyline.length > 0) {
        const last = routePolyline[routePolyline.length - 1];
        polylineEnd = { lat: last[0], lon: last[1] };
    }
    return VoyagrModules.navigationDestination().resolveDestinationLatLon({
        lastRouteDestination: lr && typeof lr.destination === 'string' ? lr.destination : null,
        endCoords: endEl && endEl.dataset && endEl.dataset.lat != null && endEl.dataset.lon != null
            ? { lat: parseFloat(endEl.dataset.lat), lon: parseFloat(endEl.dataset.lon) }
            : null,
        polylineEnd: polylineEnd,
    });
}

/**
 * Build route request with current hazard avoidance settings
 */
function buildRouteRequest(startLat, startLon, destination, avoidPoints = null) {
    const routePrefs = (typeof getRoutePreferences === 'function') ? getRoutePreferences() : {};

    return VoyagrRoutingRequest.buildRerouteRequestBody({
        startLat: startLat,
        startLon: startLon,
        destination: destination,
        avoidPoints: VoyagrRoutingRequest.normalizeAvoidPoints(avoidPoints),
        includeTolls: localStorage.getItem('includeTolls') !== 'false',
        includeCaz: localStorage.getItem('includeCAZ') !== 'false',
        sharedOptions: {
            routingMode: currentRoutingMode || 'auto',
            vehicleType: currentVehicleType || 'petrol_diesel',
            costParams: getRouteCostParams(currentVehicleType),
            enableHazardAvoidance: VoyagrRoutingRequest.isRerouteHazardAvoidanceEnabled(
                localStorage,
                isAvoidTollsEnabled
            ),
            avoidCameras: localStorage.getItem('pref_cameras') !== 'false',
            avoidCaz: localStorage.getItem('pref_caz') !== 'false',
            avoidTrafficLights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
            avoidTolls: isAvoidTollsEnabled(),
            avoidMotorways: localStorage.getItem('pref_avoid_motorways') === 'true',
            avoidFerries: localStorage.getItem('pref_avoid_ferries') === 'true',
            routePrefs: routePrefs,
        },
    });
}

/**
 * Reset voice/ETA/distance announcement state when geometry changes (reroute).
 * Prevents repeating the same milestones and back-to-back ETA after "route recalculated".
 */
function resetVoiceAnnouncementStateForNewRoute() {
    const patch = VoyagrModules.voiceAnnouncements().voiceAnnouncementStateResetValues(Date.now());
    lastETAAnnouncementTime = patch.lastETAAnnouncementTime;
    lastAnnouncedETA = patch.lastAnnouncedETA;
    lastDestinationAnnouncementDistance = patch.lastDestinationAnnouncementDistance;
    lastTurnDetectRouteVertexIndex = patch.lastTurnDetectRouteVertexIndex;
    initialETAMovementRetries = patch.initialETAMovementRetries;
    _voiceAnnouncedForManeuverIndex = patch.voiceAnnouncedForManeuverIndex;
    _voiceAnnouncedCategory = patch.voiceAnnouncedCategory;
    _lastLaneVoiceKey = patch.lastLaneVoiceKey;
    announcedTurnThresholds.clear();
    announcedExitThresholds.clear();
    announcedKeepThresholds.clear();
    clearInitialETAAnnouncement();
}

/**
 * Update route on map with new route data
 */
function updateRouteOnMap(newRoute) {
    resetVoiceAnnouncementStateForNewRoute();

    // Remove old route layer
    if (routeLayer && typeof routeLayer.remove === 'function') {
        routeLayer.remove();
    }

    // Decode new route geometry
    routePolyline = decodePolyline(newRoute.geometry, 6);
    console.log(`[Reroute] Route polyline decoded: ${routePolyline.length} points`);

    // Bright blue + white casing so the line stays visible over TomTom traffic tiles.
    // Zoom-scaled widths (default) keep the line/casing proportional like the rest of
    // the app's route rendering instead of a flat width that looks thin when zoomed out.
    routeLayer = MapLibreHelpers.addPolyline(map, routePolyline, getNavActiveRoutePolylineOptions());
    bringNavRouteAboveTrafficEdges();

    // === FIX: Update maneuvers / steps so turn-by-turn stays in sync ===
    if (newRoute.maneuvers && newRoute.maneuvers.length > 0) {
        currentRouteSteps = newRoute.maneuvers;
        console.log(`[Reroute] Maneuvers updated: ${currentRouteSteps.length} steps`);
    } else if (newRoute.legs && newRoute.legs[0] && newRoute.legs[0].maneuvers) {
        currentRouteSteps = newRoute.legs[0].maneuvers;
        console.log(`[Reroute] Maneuvers from legs updated: ${currentRouteSteps.length} steps`);
    }

    // Seed progress from current GPS on the new geometry (not index 0).
    resetVehicleMarkerDisplayState();
    _lastActiveManeuverIdx = -1;
    currentSpeedLimitMph = null;
    lastDetectedRoadType = null;
    const slState = _getSpeedLimitFetchState();
    if (slState) {
        slState.lastFetchAt = 0;
        slState.lastPosition = null;
        slState.currentLimitMph = null;
    }
    if (currentLat != null && currentLon != null) {
        primeVehicleMarkerOnRoute(currentLat, currentLon);
    } else {
        currentStepIndex = 0;
        lastSnappedRouteIndex = 0;
        lastTurnDetectRouteVertexIndex = 0;
    }

    // Road-name bar was still showing the pre-reroute street until the 5 s throttle expired.
    lastRoadNameFetch = 0;
    lastRoadNamePosition = null;
    currentRoadDisplayName = '';

    resetNavigationArrivalState();

    // Reset deviation tracking so we don't immediately re-trigger reroute
    deviationStartTimeCheck = null;
    rerouteAttemptCount = 0;
    postRerouteGraceUntil = Date.now() + POST_REROUTE_GRACE_MS;
    routeJoinConfirmedForDeviation = false;
    deviationOffRouteStreak = 0;
    lastRerouteTime = Date.now();
    lastRerouteAttemptTime = Date.now();
    rerouteInProgress = false;
    clearRerouteFailureRetries();

    // Refresh the turn instruction widget immediately with new route data
    if (currentLat && currentLon) {
        updateTurnWidgetFromPosition(currentLat, currentLon);
        fetchRoadNameThrottled(currentLat, currentLon);
    }

    // Update trip info
    updateTripInfo(newRoute.distance_km, newRoute.duration_minutes, newRoute.fuel_cost, newRoute.toll_cost);

    // Store updated route with proper unit conversion
    const displayDist = convertDistance(newRoute.distance_km);
    const distUnit = getDistanceUnit();
    window.lastCalculatedRoute = {
        ...window.lastCalculatedRoute,
        ...newRoute,
        geometry: newRoute.geometry,
        distance: `${displayDist} ${distUnit}`,
        time: `${newRoute.duration_minutes} minutes`,
        destination: window.lastCalculatedRoute.destination,
        destinationName: window.lastCalculatedRoute.destinationName,
    };

    console.log('[Reroute] Route updated on map with fresh maneuvers and step tracking');
}

/**
 * Shared polyline style for the active navigation route line.
 * @returns {Object} MapLibreHelpers.addPolyline options
 */
function getNavActiveRoutePolylineOptions() {
    return {
        color: NAV_ACTIVE_ROUTE_COLOR,
        weight: 8,
        opacity: 0.95,
        outline: true,
        outlineColor: '#ffffff',
        outlineWeight: 11,
        outlineOpacity: 0.92
    };
}

/**
 * After reroute or map style recovery, re-draw the navigation route line on the map.
 * @param {string} [reason] - Log context
 */
function redrawNavigationRouteLayer(reason) {
    if (!routeInProgress || !map || !routePolyline || routePolyline.length < 2) return;
    try {
        if (routeLayer && typeof routeLayer.remove === 'function') {
            routeLayer.remove();
        }
        routeLayer = MapLibreHelpers.addPolyline(map, routePolyline, getNavActiveRoutePolylineOptions());
        bringNavRouteAboveTrafficEdges();
        if (reason) {
            console.log('[Nav] Route layer redrawn:', reason);
        }
    } catch (e) {
        console.warn('[Nav] Route layer redraw failed:', e);
    }
}

/**
 * Re-attach vehicle marker after WebGL/style recovery (layers may be wiped).
 * @param {string} [reason] - Log context
 */
function redrawNavigationVehicleMarker(reason) {
    if (!routeInProgress || !map) return;
    const lat = currentLat;
    const lon = currentLon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    try {
        let displayLat = lat;
        let displayLon = lon;
        if (routePolyline && routePolyline.length >= 2) {
            const snapped = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);
            displayLat = snapped.lat;
            displayLon = snapped.lon;
        }
        const heading = currentUserMarker && Number.isFinite(currentUserMarker.heading)
            ? currentUserMarker.heading
            : 0;
        const speed = currentUserMarker && Number.isFinite(currentUserMarker.speed)
            ? currentUserMarker.speed
            : 0;
        const acc = currentUserMarker && Number.isFinite(currentUserMarker.accuracy)
            ? currentUserMarker.accuracy
            : null;

        if (currentUserMarker && typeof currentUserMarker.setLngLat === 'function') {
            currentUserMarker.setLngLat([displayLon, displayLat]);
            if (!currentUserMarker._map && typeof currentUserMarker.addTo === 'function') {
                currentUserMarker.addTo(map);
            }
        } else {
            if (currentUserMarker && typeof currentUserMarker.remove === 'function') {
                currentUserMarker.remove();
            }
            currentUserMarker = createVehicleMarker(displayLat, displayLon, speed, acc, heading);
            currentUserMarker.addTo(map);
        }
        if (reason) {
            console.log('[Nav] Vehicle marker redrawn:', reason);
        }
    } catch (e) {
        console.warn('[Nav] Vehicle marker redraw failed:', e);
    }
}

/**
 * Called from voyagr-core after map/WebGL recovery so nav overlays survive setStyle.
 * @param {string} [reason]
 */
function redrawNavigationOverlaysAfterMapRecovery(reason) {
    if (!routeInProgress) return;
    redrawNavigationRouteLayer(reason);
    redrawNavigationVehicleMarker(reason);
    if (currentLat != null && currentLon != null) {
        updateTurnWidgetFromPosition(currentLat, currentLon);
    }
}

window.__voyagrRedrawNavigationOverlays = redrawNavigationOverlaysAfterMapRecovery;

/**
 * Snap current GPS onto the new polyline and seed progress indices (post-reroute).
 * Avoids speed limit / turn widget sticking at the start of the route.
 *
 * @param {number} lat
 * @param {number} lon
 */
function seedNavigationProgressOnNewRoute(lat, lon) {
    if (!routePolyline || routePolyline.length < 2) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const snap = snapToRoutePolyline(lat, lon, routePolyline, 0);
    const idx = Math.max(0, Math.min(snap.index, routePolyline.length - 2));
    lastSnappedRouteIndex = idx;
    lastTurnDetectRouteVertexIndex = idx;

    if (currentRouteSteps && currentRouteSteps.length > 0) {
        let stepIdx = 0;
        for (let i = 0; i < currentRouteSteps.length; i++) {
            const begin = currentRouteSteps[i].begin_shape_index || 0;
            if (begin <= idx + 5) {
                stepIdx = i;
            } else {
                break;
            }
        }
        for (let i = stepIdx; i < currentRouteSteps.length; i++) {
            const begin = currentRouteSteps[i].begin_shape_index || 0;
            if (begin >= idx - 5) {
                currentStepIndex = i;
                break;
            }
        }
    } else {
        currentStepIndex = 0;
    }

    if (snap.distance <= ROUTE_JOIN_GATE_METERS) {
        routeJoinConfirmedForDeviation = true;
    }

    console.log(
        `[Reroute] Seeded progress: snapIdx=${idx}, step=${currentStepIndex}, ` +
        `offRoute=${snap.distance.toFixed(0)}m`
    );
}

/**
 * Initialize auto-traffic and auto-reroute toggles
 */
function initAutoTrafficRerouteToggles() {
    const TU = VoyagrModules.toggleUI();
    // Auto-traffic update toggle
    TU.applyToggleButton(document.getElementById('autoTrafficUpdateToggle'), autoTrafficUpdateEnabled);

    // Auto-reroute on deviation toggle
    TU.applyToggleButton(document.getElementById('autoRerouteDeviationToggle'), autoRerouteOnDeviationEnabled);

    // Route traffic edge toggle
    TU.applyToggleButton(document.getElementById('routeTrafficToggle'), routeTrafficEnabled);
}

// ===== CAZ (CLEAN AIR ZONE) INFORMATION =====
let cazZonesData = null;
let cazPassTypes = null;

/**
 * Show CAZ zones information in settings
 */
async function showCAZInfo() {
    const container = document.getElementById('cazInfoContainer');
    if (!container) return;

    // Toggle visibility
    if (container.style.display === 'block') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = _cazInfo().buildCazLoadingHtml();

    try {
        // Fetch CAZ zones if not cached
        if (!cazZonesData) {
            const response = await fetch('/api/caz-zones');
            const data = await response.json();
            if (data.success) {
                cazZonesData = data.zones;
            } else {
                throw new Error(data.error || 'Failed to load CAZ zones');
            }
        }

        container.innerHTML = _cazInfo().buildCazZonesListHtml(cazZonesData);
    } catch (error) {
        console.error('[CAZ] Error loading zones:', error);
        container.innerHTML = _cazInfo().buildCazErrorHtml(error.message);
    }
}

/**
 * Get CAZ pass types for vehicle selection
 */
async function getCAZPassTypes() {
    if (cazPassTypes) return cazPassTypes;

    try {
        const response = await fetch('/api/caz-pass-types');
        const data = await response.json();
        if (data.success) {
            cazPassTypes = data.pass_types;
            return cazPassTypes;
        }
    } catch (error) {
        console.error('[CAZ] Error loading pass types:', error);
    }
    return [];
}

/**
 * Check if route passes through CAZ zones
 */
async function checkRouteCAZ(routeCoords, vehicleCazPass = 'none', vehicleType = 'petrol_diesel') {
    try {
        const response = await fetch('/api/caz-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                route_coords: routeCoords,
                vehicle_caz_pass: vehicleCazPass,
                vehicle_type: vehicleType
            })
        });
        const data = await response.json();
        if (data.success) {
            return data.caz_result;
        }
    } catch (error) {
        console.error('[CAZ] Error checking route:', error);
    }
    return null;
}

// ===== ALWAYS-ON CAMERA LAYER =====
// Separate layer for displaying cameras regardless of route
window.cameraMarkers = [];
let showCamerasEnabled = localStorage.getItem('showCamerasEnabled') !== 'false'; // Default: enabled
let cameraFetchTimeout = null;

window.osmTrafficLightMarkers = [];
let showOsmTrafficLightsEnabled = localStorage.getItem('showOsmTrafficLightsOnMap') !== 'false';

window.osmRailwayCrossingMarkers = [];
let showOsmRailwayCrossingsEnabled = localStorage.getItem('showOsmRailwayCrossingsOnMap') !== 'false';

/** Same vertical icon as route traffic lights (`traffic-lights.js`); fallback if module not loaded. */
function getOsmTrafficLightMarkerInnerSVG() {
    if (typeof TrafficLights !== 'undefined' && TrafficLights.createIconSVG) {
        return TrafficLights.createIconSVG('none', 14, 32);
    }
    return _osmMapIcons().buildOsmTrafficLightFallbackSvg();
}

/** Green pill + vertical SVG (OSM layer, route hazard markers — not the horizontal 🚥 emoji). */
function getOsmTrafficLightMarkerPillHTML() {
    return _osmMapIcons().buildOsmTrafficLightMarkerPillHtml(getOsmTrafficLightMarkerInnerSVG());
}

/**
 * Toggle show cameras on map
 */
function toggleShowCameras() {
    showCamerasEnabled = !showCamerasEnabled;
    localStorage.setItem('showCamerasEnabled', showCamerasEnabled);

    const toggle = document.getElementById('showCamerasToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, showCamerasEnabled);

    if (showCamerasEnabled) {
        fetchAndDisplayCameras();
        console.log('[Cameras] Camera display enabled');
    } else {
        clearCameraMarkers();
        console.log('[Cameras] Camera display disabled');
    }
}

/**
 * Clear all camera markers from the map (separate from hazard markers)
 */
function clearCameraMarkers() {
    if (window.cameraMarkers) {
        window.cameraMarkers.forEach(marker => {
            if (marker && typeof marker.remove === 'function') {
                marker.remove();
            }
        });
    }
    window.cameraMarkers = [];
}

/**
 * Fetch cameras in current map viewport and display them
 */
function fetchAndDisplayCameras() {
    if (!showCamerasEnabled || !map) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Only show cameras at zoom level 10 or higher for better mobile visibility
    if (zoom < 10) {
        clearCameraMarkers();
        console.log('[Cameras] Zoom level too low, hiding cameras');
        return;
    }

    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();

    fetch(`/api/cameras/area?north=${north}&south=${south}&east=${east}&west=${west}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.cameras) {
                displayCameraMarkers(data.cameras);
                console.log(`[Cameras] Loaded ${data.cameras.length} cameras in viewport`);
            }
        })
        .catch(error => {
            console.error('[Cameras] Error fetching cameras:', error);
        });
}

/**
 * Display camera markers on the map (separate layer from route hazards)
 */
function displayCameraMarkers(cameras) {
    if (!cameras || cameras.length === 0) {
        clearCameraMarkers();
        return;
    }

    // Clear existing camera markers
    clearCameraMarkers();

    const HM = _hazardMapMarkers();
    const styleMap = HM.getHazardMarkerStyleMap();

    const seenLocations = new Set();

    cameras.forEach(camera => {
        const locationKey = `${camera.lat.toFixed(5)},${camera.lon.toFixed(5)}`;
        if (seenLocations.has(locationKey)) return;
        seenLocations.add(locationKey);

        const bucket = HM.normalizeCameraHazardTypeForMarker(camera.bucket || camera.type);
        let config = styleMap[bucket] || styleMap.camera_speed;
        if (!config || !config.svg) {
            config = styleMap.camera_speed;
        }
        const CAM = _cameraMapMarkers();
        const svgForMarker = CAM.scaleHazardMarkerSvg(config.svg, 24, 24);
        const svgForPopup = CAM.scaleHazardMarkerSvg(config.svg, 32, 32);

        const marker = MapLibreHelpers.createMarker(camera.lat, camera.lon, {
            className: 'camera-marker',
            html: CAM.buildCameraMarkerHtml(config, svgForMarker),
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popup: CAM.buildCameraMarkerPopupHtml(config, svgForPopup, camera.description)
        }).addTo(map);

        window.cameraMarkers.push(marker);
    });

    console.log(`[Cameras] Displayed ${window.cameraMarkers.length} camera markers`);
}

function toggleShowOsmTrafficLights() {
    showOsmTrafficLightsEnabled = !showOsmTrafficLightsEnabled;
    localStorage.setItem('showOsmTrafficLightsOnMap', showOsmTrafficLightsEnabled ? 'true' : 'false');
    const toggle = document.getElementById('showOsmTrafficLightsToggle');
    VoyagrModules.toggleUI().applyLabeledToggleButton(toggle, showOsmTrafficLightsEnabled);
    if (showOsmTrafficLightsEnabled) {
        fetchAndDisplayOsmTrafficLights();
    } else {
        clearOsmTrafficLightMarkers();
    }
    if (typeof saveAllSettings === 'function') saveAllSettings();
}

function toggleShowOsmRailwayCrossings() {
    showOsmRailwayCrossingsEnabled = !showOsmRailwayCrossingsEnabled;
    localStorage.setItem('showOsmRailwayCrossingsOnMap', showOsmRailwayCrossingsEnabled ? 'true' : 'false');
    const toggle = document.getElementById('showOsmRailwayCrossingsToggle');
    VoyagrModules.toggleUI().applyLabeledToggleButton(toggle, showOsmRailwayCrossingsEnabled);
    if (showOsmRailwayCrossingsEnabled) {
        fetchAndDisplayOsmRailwayCrossings();
    } else {
        clearOsmRailwayCrossingMarkers();
    }
    if (typeof saveAllSettings === 'function') saveAllSettings();
}

function clearOsmTrafficLightMarkers() {
    if (window.osmTrafficLightMarkers) {
        window.osmTrafficLightMarkers.forEach(m => {
            if (m && typeof m.remove === 'function') m.remove();
        });
    }
    window.osmTrafficLightMarkers = [];
}

function clearOsmRailwayCrossingMarkers() {
    if (window.osmRailwayCrossingMarkers) {
        window.osmRailwayCrossingMarkers.forEach(m => {
            if (m && typeof m.remove === 'function') m.remove();
        });
    }
    window.osmRailwayCrossingMarkers = [];
}

const OSM_OVERLAY_MAX_BBOX_DEG = 0.35;

function isOsmOverlayBboxTooLarge(north, south, east, west) {
    return Math.abs(north - south) > OSM_OVERLAY_MAX_BBOX_DEG
        || Math.abs(east - west) > OSM_OVERLAY_MAX_BBOX_DEG;
}

/**
 * Fetch an OSM map-overlay endpoint; never parse HTML error pages as JSON.
 * @param {string} url
 * @param {string} logLabel
 * @returns {Promise<object|null>}
 */
function fetchOsmAreaOverlay(url, logLabel) {
    return fetch(url)
        .then((response) => {
            if (!response.ok) {
                console.warn(`[${logLabel}] HTTP ${response.status} (overlay skipped)`);
                return null;
            }
            return response.json();
        })
        .catch((err) => {
            console.warn(`[${logLabel}]`, err.message || err);
            return null;
        });
}

function fetchAndDisplayOsmTrafficLights() {
    if (!showOsmTrafficLightsEnabled || !map) return;
    const zoom = map.getZoom();
    if (zoom < 10) {
        clearOsmTrafficLightMarkers();
        return;
    }
    const bounds = map.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    if (isOsmOverlayBboxTooLarge(north, south, east, west)) {
        clearOsmTrafficLightMarkers();
        return;
    }
    fetchOsmAreaOverlay(
        `/api/traffic-lights/area?north=${north}&south=${south}&east=${east}&west=${west}`,
        'OSM Traffic Lights'
    ).then((data) => {
        if (data && data.success && data.traffic_lights) {
            displayOsmTrafficLightMarkers(data.traffic_lights);
        }
    });
}

function fetchAndDisplayOsmRailwayCrossings() {
    if (!showOsmRailwayCrossingsEnabled || !map) return;
    const zoom = map.getZoom();
    if (zoom < 10) {
        clearOsmRailwayCrossingMarkers();
        return;
    }
    const bounds = map.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    if (isOsmOverlayBboxTooLarge(north, south, east, west)) {
        clearOsmRailwayCrossingMarkers();
        return;
    }
    fetchOsmAreaOverlay(
        `/api/railway-crossings/area?north=${north}&south=${south}&east=${east}&west=${west}`,
        'OSM Railway Crossings'
    ).then((data) => {
        if (data && data.success && data.railway_crossings) {
            displayOsmRailwayCrossingMarkers(data.railway_crossings);
        }
    });
}

function displayOsmTrafficLightMarkers(lights) {
    if (!lights || lights.length === 0) {
        clearOsmTrafficLightMarkers();
        return;
    }
    clearOsmTrafficLightMarkers();
    const OSM = _osmMapIcons();
    const seen = new Set();
    lights.forEach(light => {
        const key = `${Number(light.lat).toFixed(5)},${Number(light.lon).toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const pill = getOsmTrafficLightMarkerPillHTML();
        const marker = MapLibreHelpers.createMarker(light.lat, light.lon, {
            className: 'osm-traffic-light-marker',
            html: pill,
            iconSize: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
            iconAnchor: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_ANCHOR,
            popup: OSM.buildOsmTrafficLightPopupHtml(pill)
        }).addTo(map);
        window.osmTrafficLightMarkers.push(marker);
    });
}

function displayOsmRailwayCrossingMarkers(crossings) {
    if (!crossings || crossings.length === 0) {
        clearOsmRailwayCrossingMarkers();
        return;
    }
    clearOsmRailwayCrossingMarkers();
    const OSM = _osmMapIcons();
    const crossingIcon = OSM.buildRailwayCrossingIconSvg();
    const popupHtml = OSM.buildRailwayCrossingPopupHtml(crossingIcon);
    const seen = new Set();
    crossings.forEach(cx => {
        const key = `${Number(cx.lat).toFixed(5)},${Number(cx.lon).toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const marker = MapLibreHelpers.createMarker(cx.lat, cx.lon, {
            className: 'osm-railway-crossing-marker',
            html: OSM.buildRailwayCrossingMarkerHtml(crossingIcon),
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popup: popupHtml
        }).addTo(map);
        window.osmRailwayCrossingMarkers.push(marker);
    });
}

/**
 * Initialize camera layer - called after map is ready
 */
function initializeCameraLayer() {
    if (!map) {
        console.log('[Cameras] Map not ready, deferring camera layer init');
        return;
    }

    // Prevent duplicate handler registration if init runs multiple times
    if (window.__voyagrCameraLayerInitialized) {
        return;
    }
    window.__voyagrCameraLayerInitialized = true;

    // Set toggle state based on saved preference
    const TU = VoyagrModules.toggleUI();
    TU.applyToggleButton(document.getElementById('showCamerasToggle'), showCamerasEnabled);
    TU.applyLabeledToggleButton(document.getElementById('showOsmTrafficLightsToggle'), showOsmTrafficLightsEnabled);
    TU.applyLabeledToggleButton(document.getElementById('showOsmRailwayCrossingsToggle'), showOsmRailwayCrossingsEnabled);

    // Fetch cameras on map move (with debounce)
    let osmOverlayFetchTimeout = null;
    map.on('moveend', () => {
        if (cameraFetchTimeout) {
            clearTimeout(cameraFetchTimeout);
        }
        cameraFetchTimeout = setTimeout(() => {
            fetchAndDisplayCameras();
        }, 500);
        if (osmOverlayFetchTimeout) {
            clearTimeout(osmOverlayFetchTimeout);
        }
        // OSM Overpass queries are slow — debounce longer and skip huge viewports.
        osmOverlayFetchTimeout = setTimeout(() => {
            fetchAndDisplayOsmTrafficLights();
            fetchAndDisplayOsmRailwayCrossings();
        }, 2000);
    });

    // Initial fetch if enabled
    if (showCamerasEnabled) {
        fetchAndDisplayCameras();
    }
    if (showOsmTrafficLightsEnabled) {
        fetchAndDisplayOsmTrafficLights();
    }
    if (showOsmRailwayCrossingsEnabled) {
        fetchAndDisplayOsmRailwayCrossings();
    }

    console.log('[Cameras] Camera layer initialized');
}

/**
 * Initialize road labels - called after map is ready
 */
function initializeRoadLabels() {
    if (!map) {
        console.log('[Road Labels] Map not ready, deferring road labels init');
        return;
    }

    // This can be called from multiple init paths; keep it idempotent.
    if (window.__voyagrRoadLabelsInitialized) {
        return;
    }
    window.__voyagrRoadLabelsInitialized = true;

    // Set toggle state based on saved preference
    const toggle = document.getElementById('roadLabelsToggle');
    VoyagrModules.toggleUI().applyToggleButton(toggle, roadLabelsEnabled, {
        inactiveBackground: '#ccc',
        inactiveBorder: '#ccc',
    });

    // Apply initial road labels visibility
    if (roadLabelsEnabled) {
        MapLibreHelpers.toggleRoadLabels(map, true);
    } else {
        MapLibreHelpers.toggleRoadLabels(map, false);
    }

    console.log('[Road Labels] Road labels initialized');
}

/**
 * startNavigation function
 * @function startNavigation
 * @returns {*} Return value description
 */
function startNavigation() {
    if (!window.lastCalculatedRoute) {
        showStatus('Please calculate a route first', 'error');
        return;
    }
    startTurnByTurnNavigation(window.lastCalculatedRoute);

    // UI Updates
    document.getElementById('startNavBtn').style.display = 'none';
    const startNavBtnSheet = document.getElementById('startNavBtnSheet');
    if (startNavBtnSheet) {
        startNavBtnSheet.style.display = 'none';
    }

    // FIX: Collapse bottom sheet to ensure map is interactive
    collapseBottomSheet();
}

// ===== ROUTE PREVIEW FEATURE =====
/**
 * Apply a new route during active navigation without touching preview DOM, bottom sheet, or tabs.
 * Uses the same matching logic as calculateRoute in-nav path; does not restart turn-by-turn (updateRouteOnMap syncs geometry/steps).
 * @param {Object} routeData - API route payload or single route object
 */
function applyRouteUpdateDuringNavigation(routeData) {
    console.log('[Route Preview] Navigation active — silent route update (no preview UI / no sheet)');

    const activeRoute = pickActiveRouteDuringNavigation(routeData.routes, routeData);
    if (!activeRoute) {
        showStatus('❌ No route to apply', 'error');
        return;
    }

    if (activeRoute.geometry) {
        updateRouteOnMap(activeRoute);
    }

    if (window.lastCalculatedRoute) {
        const durationMinutes = activeRoute.duration_minutes ??
            (routeData.time ? parseInt(routeData.time, 10) : null) ??
            window.lastCalculatedRoute.duration_minutes;
        const prevNav = window.lastCalculatedRoute;
        window.lastCalculatedRoute = {
            ...prevNav,
            ...routeData,
            ...activeRoute,
            duration_minutes: durationMinutes,
            destination: prevNav.destination || routeData.destination || activeRoute.destination,
            destinationName: prevNav.destinationName || routeData.destinationName || activeRoute.destinationName,
        };
    }

    showStatus('✅ Route updated — continuing navigation', 'success');
}

/**
 * Resolve the route object used for preview (full API payload or single route option).
 * @param {Object} routeData
 * @returns {Object}
 */
function resolvePreviewRoute(routeData) {
    return VoyagrModules.routeSelection().resolvePreviewRoute(routeData, selectedRouteIndex);
}

/**
 * showRoutePreview function
 * @function showRoutePreview
 * @param {*} routeData - Route data to display in preview
 * @param {boolean} skipMapDisplay - If true, skip displayAllRoutesOnMap (used when selecting a specific route)
 * @returns {*} Return value description
 */
function showRoutePreview(routeData, skipMapDisplay = false) {
    console.log('[Route Preview] showRoutePreview called with data:', routeData, 'skipMapDisplay:', skipMapDisplay);

    if (!routeData) {
        showStatus('No route data available', 'error');
        console.error('[Route Preview] No route data provided');
        return;
    }

    if (routeInProgress) {
        applyRouteUpdateDuringNavigation(routeData);
        return;
    }

    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();
    const speedUnit = getSpeedUnit();
    const selection = VoyagrModules.routeSelection();

    console.log('[Route Preview] Currency:', symbol, 'Distance Unit:', distUnit);

    const previewRouteSlice = resolvePreviewRoute(routeData);
    const distanceKm = selection.resolvePreviewDistanceKm(routeData, previewRouteSlice);

    const previewDistanceEl = document.getElementById('previewDistance');
    if (previewDistanceEl) {
        previewDistanceEl.dataset.km = distanceKm;
        previewDistanceEl.textContent = convertDistance(distanceKm) + ' ' + distUnit;
    }
    const previewCosts = selection.buildPreviewCostValues(previewRouteSlice, routeData);
    document.getElementById('previewDuration').textContent =
        (previewCosts.durationMinutes ?? 0) + ' min';

    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    document.getElementById('previewRoute').textContent = `${startInput} → ${endInput}`;

    const fuelCost = previewCosts.fuelCost;
    const fuelLitres = previewCosts.fuelLitres;
    const tollCost = previewCosts.tollCost;
    const cazCost = previewCosts.cazCost;
    const totalCost = previewCosts.totalCost;

    document.getElementById('previewFuelCost').textContent = symbol + fuelCost.toFixed(2);
    // Show fuel amount - litres for petrol/diesel/hybrid, kWh for electric
    const fuelLitresEl = document.getElementById('previewFuelLitres');
    if (fuelLitresEl) {
        if (fuelLitres > 0) {
            const isElectric = currentVehicleType === 'electric';
            const fuelUnit = isElectric ? 'kWh' : 'L';
            fuelLitresEl.textContent = '(' + fuelLitres.toFixed(1) + ' ' + fuelUnit + ')';
            fuelLitresEl.style.display = 'block';
        } else {
            fuelLitresEl.style.display = 'none';
        }
    }
    document.getElementById('previewTollCost').textContent = symbol + tollCost.toFixed(2);
    document.getElementById('previewCAZCost').textContent = symbol + cazCost.toFixed(2);
    document.getElementById('previewTotalCost').textContent = symbol + totalCost.toFixed(2);

    // Update CAZ status display (merge primary route slice — alternates carry their own caz_details)
    const cazStatusContainer = document.getElementById('cazStatusContainer');
    const primaryRouteForCaz = (routeData.routes && routeData.routes.length > 0) ? routeData.routes[0] : routeData;
    const cazDetails = primaryRouteForCaz.caz_details || routeData.caz_details || {};

    if (cazStatusContainer) {
        const cazStatus = selection.buildCazStatusHtml(cazDetails, cazCost, symbol);
        if (cazStatus.visible) {
            cazStatusContainer.innerHTML = cazStatus.html;
            cazStatusContainer.style.display = 'block';
        } else {
            cazStatusContainer.style.display = 'none';
        }
    }

    console.log('[Cost] Route preview costs:', {
        distanceUnit: distanceUnit,
        fuelCost: fuelCost.toFixed(2),
        tollCost: tollCost.toFixed(2),
        cazCost: cazCost.toFixed(2),
        totalCost: totalCost.toFixed(2),
        cazDetails: cazDetails
    });

    // Update hazard / preference information (from primary/selected route)
    const previewRoute = resolvePreviewRoute(routeData);
    const hazardCount = previewRoute.hazard_count ?? routeData.hazard_count ?? 0;
    const camerasNearRoute = previewRoute.cameras_near_route ?? hazardCount;
    const hazardPenaltySeconds = previewRoute.hazard_penalty_seconds ?? routeData.hazard_penalty_seconds ?? 0;
    const preferencesApplied = localStorage.getItem('pref_cameras') !== 'false';
    const hazardContainer = document.getElementById('hazardInfoContainer');
    const hazardTitleEl = hazardContainer ? hazardContainer.querySelector('h4') : null;
    const hazardCountLabel = hazardContainer ? hazardContainer.querySelector('[data-hazard-count-label]') : null;
    const penaltyRow = hazardContainer ? hazardContainer.querySelector('#previewHazardPenalty')?.closest('div') : null;

    if (hazardContainer) {
        const hazardState = selection.getHazardPreviewPanelState({
            preferencesApplied: preferencesApplied,
            camerasNearRoute: camerasNearRoute,
            hazardCount: hazardCount,
            hazardPenaltySeconds: hazardPenaltySeconds,
        });
        const countEl = document.getElementById('previewHazardCount');
        const penaltyEl = document.getElementById('previewHazardPenalty');
        if (hazardState.visible && countEl) {
            countEl.textContent = hazardState.count;
            if (hazardCountLabel) hazardCountLabel.textContent = hazardState.countLabel;
            if (hazardTitleEl) hazardTitleEl.textContent = hazardState.title;
            if (penaltyRow) penaltyRow.style.display = hazardState.showPenalty ? 'flex' : 'none';
            if (penaltyEl && hazardState.showPenalty) {
                penaltyEl.textContent = hazardState.penaltyMinutes + ' min';
            }
            hazardContainer.style.background = hazardState.background;
            hazardContainer.style.borderLeftColor = hazardState.borderLeftColor;
            hazardContainer.style.display = 'block';
        } else {
            hazardContainer.style.display = 'none';
        }
    }

    // Update route details (routing engine stack is hidden from the preview UI)
    document.getElementById('previewRoutingMode').textContent = currentRoutingMode.charAt(0).toUpperCase() + currentRoutingMode.slice(1);
    document.getElementById('previewVehicleType').textContent = currentVehicleType.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Show alternative routes if available
    if (routeOptions && routeOptions.length > 1) {
        showAlternativeRoutesInPreview();
        console.log('[Route Preview] Showing alternative routes panel');
    } else {
        document.getElementById('previewAlternativeRoutesContainer').style.display = 'none';
    }

    // Display routes on the map (unless skipMapDisplay is true - e.g., when selecting a specific route)
    if (!skipMapDisplay && routeOptions && routeOptions.length > 0) {
        displayAllRoutesOnMap();
        console.log(`[Route Preview] Displayed ${routeOptions.length} route(s) on map`);
    }

    // Switch to route preview tab (only when NOT navigating)
    console.log('[Route Preview] Switching to routePreview tab');
    switchTab('routePreview');

    // Expand bottom sheet to show route preview results (user can scroll to see more)
    expandBottomSheet();

    // Ensure traffic layer stays visible if enabled
    if (showTrafficEnabled && !trafficLayer) {
        addTrafficLayer();
    }

    // Display route traffic edges on preview if enabled
    if (routeTrafficEnabled && routeOptions && routeOptions.length > 0 && routeOptions[0].polyline) {
        // Temporarily set routePolyline for traffic display
        const previewPolyline = routeOptions[selectedRouteIndex || 0].polyline;
        if (previewPolyline && previewPolyline.length > 0) {
            routePolyline = previewPolyline;
            console.log('[Route Preview] Fetching traffic edges for preview route');
            fetchAndDisplayRouteTraffic();
        }
    }

    console.log('[Route Preview] Route preview displayed successfully');
    showStatus('📍 Review your route before starting navigation', 'success');
}

/**
 * showAlternativeRoutesInPreview function
 * @function showAlternativeRoutesInPreview
 * @returns {*} Return value description
 */
function showAlternativeRoutesInPreview() {
    const container = document.getElementById('previewAlternativeRoutesList');
    const parentContainer = document.getElementById('previewAlternativeRoutesContainer');

    if (!routeOptions || routeOptions.length <= 1) {
        parentContainer.style.display = 'none';
        return;
    }

    container.innerHTML = '';
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();
    const fuelUnit = currentVehicleType === 'electric' ? 'kWh' : 'L';

    routeOptions.forEach((route, index) => {
        const routeColor = ROUTE_COLORS[index % ROUTE_COLORS.length];
        const div = document.createElement('div');
        div.style.cssText = VoyagrModules.routeSelection().getPreviewAlternativeRouteCardContainerStyleCssText(routeColor);
        div.innerHTML = VoyagrModules.routeSelection().buildPreviewAlternativeRouteCardHtml(route, index, {
            routeColors: ROUTE_COLORS,
            currencySymbol: symbol,
            distUnit: distUnit,
            distanceText: convertDistance(route.distance_km),
            fuelUnit: fuelUnit,
        });
        const RS = VoyagrModules.routeSelection();
        div.onmouseover = () => {
            const hover = RS.getPreviewAlternativeRouteCardHoverStyle(routeColor);
            div.style.borderColor = hover.borderColor;
            div.style.background = hover.background;
        };
        div.onmouseout = () => {
            const rest = RS.getPreviewAlternativeRouteCardRestStyle();
            div.style.borderColor = rest.borderColor;
            div.style.background = rest.background;
        };
        div.onclick = () => {
            selectRoute(index);
            useRoute(index);
        };
        container.appendChild(div);
    });

    parentContainer.style.display = 'block';
}

async function showRouteComparison() {
    console.log('[RouteComparison] showRouteComparison called');
    console.log('[RouteComparison] routeOptions:', routeOptions);
    console.log('[RouteComparison] routeOptions length:', routeOptions ? routeOptions.length : 0);

    if (!routeOptions || routeOptions.length < 1) {
        console.error('[RouteComparison] No routes available:', routeOptions ? routeOptions.length : 0);
        showStatus('No routes available. Calculate a route first.', 'error');
        return;
    }

    // If only 1 route, show it anyway
    if (routeOptions.length < 2) {
        console.warn('[RouteComparison] Only 1 route available, showing it anyway');
        showStatus('Only 1 route available', 'info');
    }

    try {
        const selection = VoyagrModules.routeSelection();
        const routesForComparison = selection.buildRouteComparisonRequestRoutes(routeOptions);

        console.log('[RouteComparison] Sending routes to API:', routesForComparison);

        const response = await fetch('/api/route-comparison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routes: routesForComparison })
        });

        const data = await response.json();
        console.log('[RouteComparison] API response:', data);

        if (!data.success) {
            console.error('[RouteComparison] API error:', data.error);
            showStatus('Error comparing routes: ' + data.error, 'error');
            return;
        }

        const comparison = data.comparison;
        const symbol = getCurrencySymbol();
        const distUnit = getDistanceUnit();
        const comparisonHTML = selection.buildRouteComparisonReportHtml(comparison, {
            currencySymbol: symbol,
            distUnit: distUnit,
            distanceTexts: comparison.routes.map((route) => convertDistance(route.distance_km)),
        });

        const modal = document.createElement('div');
        modal.id = selection.ROUTE_COMPARISON_MODAL_ID;
        modal.style.cssText = selection.getRouteComparisonModalOverlayStyleCssText();
        modal.innerHTML = selection.buildRouteComparisonModalHtml(comparisonHTML);

        // Close modal when clicking outside the white box
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
        showStatus('📊 Route comparison displayed', 'success');
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        console.error('[Comparison] Error:', error);
    }
}

/**
 * overviewRoute function
 * @function overviewRoute
 * @returns {*} Return value description
 */
function overviewRoute() {
    // Check if we have a calculated route
    if (!window.lastCalculatedRoute || !window.lastCalculatedRoute.geometry) {
        showStatus('No route to overview', 'error');
        console.error('[Route] No route available for overview');
        return;
    }

    try {
        // Decode the route geometry to get the path
        const sourceLower = (window.lastCalculatedRoute.source || '').toLowerCase();
        const precision =
            Number.isFinite(window.lastCalculatedRoute.geometry_precision)
                ? window.lastCalculatedRoute.geometry_precision
                : (sourceLower.includes('osrm') ? 5 : 6);
        const routePath = decodePolyline(window.lastCalculatedRoute.geometry, precision);

        if (!routePath || routePath.length === 0) {
            showStatus('No route path available', 'error');
            return;
        }

        // Calculate bounds from route polyline
        let minLat = routePath[0][0];
        let maxLat = routePath[0][0];
        let minLon = routePath[0][1];
        let maxLon = routePath[0][1];

        routePath.forEach(point => {
            minLat = Math.min(minLat, point[0]);
            maxLat = Math.max(maxLat, point[0]);
            minLon = Math.min(minLon, point[1]);
            maxLon = Math.max(maxLon, point[1]);
        });

        // Create bounds object for Leaflet
        const bounds = [[minLat, minLon], [maxLat, maxLon]];

        // Fit map to bounds with padding
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

        showStatus('📍 Route overview - pan and zoom to inspect', 'success');
        console.log('[Route] Overview fitted bounds:', bounds);
    } catch (error) {
        showStatus('Error displaying route overview: ' + error.message, 'error');
        console.error('[Route] Overview error:', error);
    }
}

/**
 * startNavigationFromPreview function
 * @function startNavigationFromPreview
 * @returns {*} Return value description
 */
function startNavigationFromPreview() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route available', 'error');
        return;
    }

    syncLastCalculatedRouteFromSelection(selectedRouteIndex);

    // Hide the start navigation buttons
    const startNavBtn = document.getElementById('startNavBtn');
    const startNavBtnSheet = document.getElementById('startNavBtnSheet');
    if (startNavBtn) startNavBtn.style.display = 'none';
    if (startNavBtnSheet) startNavBtnSheet.style.display = 'none';

    // Start turn-by-turn navigation
    startTurnByTurnNavigation(window.lastCalculatedRoute);

    // Collapse bottom sheet to show full map
    collapseBottomSheet();
}

// ===== PARKING INTEGRATION FEATURE =====

let parkingMarkers = [];
let selectedParking = null;
let parkingWalkingRoute = null;
let parkingDrivingRoute = null;

/**
 * saveParkingPreferences function
 * @function saveParkingPreferences
 * @returns {*} Return value description
 */
function saveParkingPreferences() {
    const prefs = {
        maxWalkingDistance: document.getElementById('parkingMaxWalkingDistance').value,
        preferredType: document.getElementById('parkingPreferredType').value,
        pricePreference: document.getElementById('parkingPricePreference').value
    };
    localStorage.setItem('parkingPreferences', JSON.stringify(prefs));
    saveAllSettings();
    console.log('[Parking] Preferences saved:', prefs);
}

/**
 * loadParkingPreferences function
 * @function loadParkingPreferences
 * @returns {*} Return value description
 */
function loadParkingPreferences() {
    try {
        const saved = localStorage.getItem('parkingPreferences');
        if (saved) {
            const prefs = JSON.parse(saved);
            document.getElementById('parkingMaxWalkingDistance').value = prefs.maxWalkingDistance || '10';
            document.getElementById('parkingPreferredType').value = prefs.preferredType || 'any';
            document.getElementById('parkingPricePreference').value = prefs.pricePreference || 'any';
            console.log('[Parking] Preferences loaded:', prefs);
        }
    } catch (e) {
        console.log('[Parking] Error loading preferences:', e);
    }
}

/**
 * saveVoicePreferences function
 * @function saveVoicePreferences
 * @returns {*} Return value description
 */
function saveVoicePreferences() {
    const freqSelect = document.getElementById('voiceFrequencyMode');
    const freqMode = freqSelect ? freqSelect.value : 'all';

    const prefs = {
        turnDistance1: parseInt(document.getElementById('voiceTurnDistance1').value),
        turnDistance2: parseInt(document.getElementById('voiceTurnDistance2').value),
        turnDistance3: parseInt(document.getElementById('voiceTurnDistance3').value),
        hazardDistance: parseInt(document.getElementById('voiceHazardDistance').value),
        voiceFrequencyMode: freqMode,
        announcementsEnabled: typeof voiceAnnouncementsEnabled === 'boolean'
            ? voiceAnnouncementsEnabled
            : (localStorage.getItem('voiceAnnouncementsEnabled') === 'true')
    };
    localStorage.setItem('voicePreferences', JSON.stringify(prefs));
    localStorage.setItem('voiceFrequencyMode', freqMode);

    TURN_ANNOUNCEMENT_DISTANCES.length = 0;
    TURN_ANNOUNCEMENT_DISTANCES.push(prefs.turnDistance1, prefs.turnDistance2, prefs.turnDistance3, 50);
    DESTINATION_ANNOUNCEMENT_DISTANCES.length = 0;
    DESTINATION_ANNOUNCEMENT_DISTANCES.push(10000, 5000, 2000, 1000, 500, 100);
    HAZARD_WARNING_DISTANCE = prefs.hazardDistance;
    voiceAnnouncementsEnabled = prefs.announcementsEnabled;
    voiceFrequencyMode = freqMode;
    VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS = VOICE_FREQUENCY_THROTTLES[freqMode] || 10000;

    console.log('[Voice] Preferences saved:', prefs);
    showStatus('✅ Voice preferences updated', 'success');
}

/**
 * loadVoicePreferences function
 * @function loadVoicePreferences
 * @returns {*} Return value description
 */
function loadVoicePreferences() {
    try {
        const saved = localStorage.getItem('voicePreferences');
        if (saved) {
            const prefs = JSON.parse(saved);
            document.getElementById('voiceTurnDistance1').value = prefs.turnDistance1 || 500;
            document.getElementById('voiceTurnDistance2').value = prefs.turnDistance2 || 200;
            document.getElementById('voiceTurnDistance3').value = prefs.turnDistance3 || 100;
            document.getElementById('voiceHazardDistance').value = prefs.hazardDistance || 500;

            const freqSelect = document.getElementById('voiceFrequencyMode');
            if (freqSelect) {
                freqSelect.value = prefs.voiceFrequencyMode || 'all';
            }
            voiceFrequencyMode = prefs.voiceFrequencyMode || 'all';
            VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS = VOICE_FREQUENCY_THROTTLES[voiceFrequencyMode] || 10000;

            const toggleButton = document.getElementById('voiceAnnouncementsEnabled');
            const announcementsEnabled = prefs.announcementsEnabled !== false;

            VoyagrModules.toggleUI().applyLabeledToggleButton(toggleButton, announcementsEnabled);

            TURN_ANNOUNCEMENT_DISTANCES.length = 0;
            TURN_ANNOUNCEMENT_DISTANCES.push(prefs.turnDistance1, prefs.turnDistance2, prefs.turnDistance3, 50);
            HAZARD_WARNING_DISTANCE = prefs.hazardDistance || 500;
            voiceAnnouncementsEnabled = announcementsEnabled;

            console.log('[Voice] Preferences loaded:', prefs);
        } else {
            // Initialize with defaults if no saved preferences
            const toggleButton = document.getElementById('voiceAnnouncementsEnabled');
            if (toggleButton) {
                VoyagrModules.toggleUI().applyLabeledToggleButton(toggleButton, true);
                voiceAnnouncementsEnabled = true;
            }
            console.log('[Voice] No saved preferences, using defaults');
        }
    } catch (e) {
        console.log('[Voice] Error loading preferences:', e);
    }
}

// ----- Picovoice Porcupine wake word (browser / PWA). -----
const VOYAGR_PORCUPINE_WAKE_STORAGE_KEY = 'voyagrPorcupineWakeEnabled';
let porcupineWakePipelineRunning = false;
let porcupineWakeResumeAfterVoice = false;
let _porcupineWakeWorker = null;
let _porcupineWakeBridgeEngine = null;
let _porcupineWakeStarting = false;
let _porcupineWakeLastDetectionMs = 0;

function picovoiceClientConfigured() {
    return !!(
        typeof window !== 'undefined' &&
        window.VoyagrPicovoiceWebAssetsOk &&
        typeof window.PICOVOICE_ACCESS_KEY === 'string' &&
        window.PICOVOICE_ACCESS_KEY.trim().length > 0 &&
        typeof PorcupineWeb !== 'undefined' &&
        typeof WebVoiceProcessor !== 'undefined'
    );
}

function loadPorcupineWakeUi() {
    const row = document.getElementById('porcupineWakePrefRow');
    const help = document.getElementById('porcupineWakeHelp');
    const toggle = document.getElementById('porcupineWakeToggle');
    if (!row || !toggle) {
        return;
    }
    if (!picovoiceClientConfigured()) {
        row.style.display = 'none';
        if (help) help.style.display = 'none';
        return;
    }
    row.style.display = '';
    if (help) help.style.display = '';
    const enabled = localStorage.getItem(VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) === 'true';
    VoyagrModules.toggleUI().applyLabeledToggleButton(toggle, enabled);
}

function togglePorcupineWakeWord() {
    const button = document.getElementById('porcupineWakeToggle');
    if (!button || !picovoiceClientConfigured()) {
        return;
    }
    button.classList.toggle('active');
    const enabled = button.classList.contains('active');
    VoyagrModules.toggleUI().applyLabeledToggleButton(button, enabled);
    localStorage.setItem(VOYAGR_PORCUPINE_WAKE_STORAGE_KEY, enabled ? 'true' : 'false');
    if (enabled) {
        void startPorcupineWakePipeline();
        showStatus('Wake word listening enabled', 'success');
    } else {
        porcupineWakeResumeAfterVoice = false;
        void stopPorcupineWakePipeline();
        showStatus('Wake word listening disabled', 'success');
    }
    saveAllSettings();
}

function maybeResumePorcupineWakeAfterVoice() {
    if (!porcupineWakeResumeAfterVoice) {
        return;
    }
    porcupineWakeResumeAfterVoice = false;
    if (localStorage.getItem(VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) !== 'true') {
        return;
    }
    if (!picovoiceClientConfigured()) {
        return;
    }
    void startPorcupineWakePipeline();
}

async function porcupineCustomKeywordAvailable() {
    const p = typeof window.VoyagrPicovoiceKeywordPath === 'string' ? window.VoyagrPicovoiceKeywordPath.trim() : '';
    if (!p) {
        return false;
    }
    try {
        let r = await fetch(p, { method: 'HEAD', cache: 'no-store' });
        if (r.status === 405 || r.status === 501) {
            r = await fetch(p, { method: 'GET', cache: 'no-store' });
        }
        return r.ok;
    } catch (e) {
        console.warn('[Porcupine] Keyword probe failed:', e);
        return false;
    }
}

async function stopPorcupineWakePipeline() {
    if (_porcupineWakeBridgeEngine && typeof WebVoiceProcessor !== 'undefined') {
        try {
            await WebVoiceProcessor.unsubscribe(_porcupineWakeBridgeEngine);
        } catch (e) {
            console.warn('[Porcupine] unsubscribe:', e);
        }
    }
    _porcupineWakeBridgeEngine = null;
    if (_porcupineWakeWorker) {
        try {
            await _porcupineWakeWorker.release();
        } catch (e) {
            console.warn('[Porcupine] release:', e);
        }
        try {
            _porcupineWakeWorker.terminate();
        } catch (e) {
            console.warn('[Porcupine] terminate:', e);
        }
        _porcupineWakeWorker = null;
    }
    porcupineWakePipelineRunning = false;
}

async function startPorcupineWakePipeline() {
    if (!picovoiceClientConfigured() || localStorage.getItem(VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) !== 'true') {
        return;
    }
    if (porcupineWakePipelineRunning || _porcupineWakeStarting) {
        return;
    }
    if (typeof location !== 'undefined' && location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.warn('[Porcupine] Wake word needs HTTPS (or localhost) for microphone access.');
        showStatus('Wake word requires HTTPS for the microphone', 'warning');
        return;
    }
    _porcupineWakeStarting = true;
    try {
        await stopPorcupineWakePipeline();
        const accessKey = window.PICOVOICE_ACCESS_KEY.trim();
        const useCustom = await porcupineCustomKeywordAvailable();
        const keywords = useCustom
            ? [{
                publicPath: window.VoyagrPicovoiceKeywordPath.trim(),
                label: 'Hey SatNav',
                sensitivity: 0.55
            }]
            : PorcupineWeb.BuiltInKeyword.Porcupine;
        const model = { publicPath: '/static/vendor/picovoice/porcupine_params.pv' };
        const onDetection = (detection) => {
            if (!detection || typeof detection.label !== 'string') {
                return;
            }
            const now = Date.now();
            if (now - _porcupineWakeLastDetectionMs < 2200) {
                return;
            }
            _porcupineWakeLastDetectionMs = now;
            if (typeof isListening !== 'undefined' && isListening) {
                return;
            }
            console.log('[Porcupine] Wake detected:', detection.label);
            void onPorcupineWakeHotword();
        };
        const worker = await PorcupineWeb.PorcupineWorker.create(
            accessKey,
            keywords,
            onDetection,
            model,
            {
                processErrorCallback: (err) => {
                    console.error('[Porcupine] process error:', err);
                }
            }
        );
        _porcupineWakeWorker = worker;
        WebVoiceProcessor.setOptions({
            frameLength: worker.frameLength,
            outputSampleRate: worker.sampleRate
        }, false);
        const bridge = {
            onmessage: (e) => {
                if (e.data && e.data.command === 'process' && e.data.inputFrame && _porcupineWakeWorker) {
                    _porcupineWakeWorker.process(e.data.inputFrame);
                }
            }
        };
        _porcupineWakeBridgeEngine = bridge;
        await WebVoiceProcessor.subscribe(bridge);
        porcupineWakePipelineRunning = true;
        if (!useCustom) {
            console.info('[Porcupine] Using built-in keyword «Porcupine» until hey_satnav_wasm.ppn is available at', window.VoyagrPicovoiceKeywordPath);
        }
    } catch (e) {
        console.error('[Porcupine] Failed to start wake pipeline:', e);
        showStatus('Wake word could not start (check Picovoice key and assets)', 'error');
        await stopPorcupineWakePipeline();
    } finally {
        _porcupineWakeStarting = false;
    }
}

async function onPorcupineWakeHotword() {
    porcupineWakeResumeAfterVoice = true;
    await stopPorcupineWakePipeline();
    speakMessage('Say your command', 'high');
    await new Promise((r) => setTimeout(r, 450));
    if (!voiceRecognition && !initVoiceRecognition()) {
        maybeResumePorcupineWakeAfterVoice();
        return;
    }
    if (!isListening) {
        const tr = document.getElementById('voiceTranscript');
        if (tr) tr.textContent = '';
        _voiceFinalTranscript = '';
        voiceRecognition.start();
        isListening = true;
    }
}

/**
 * toggleVoiceAnnouncements function
 * @function toggleVoiceAnnouncements
 * @returns {*} Return value description
 */
function toggleVoiceAnnouncements() {
    const button = document.getElementById('voiceAnnouncementsEnabled');

    // Toggle the active class (like other toggle switches)
    button.classList.toggle('active');
    const enabled = button.classList.contains('active');

    VoyagrModules.toggleUI().applyLabeledToggleButton(button, enabled);

    // Save to localStorage
    localStorage.setItem('voiceAnnouncementsEnabled', enabled ? 'true' : 'false');

    // FIXED: Update the new boolean flag instead of voiceRecognition object
    voiceAnnouncementsEnabled = enabled;
    saveVoicePreferences();
    showStatus(enabled ? '🔊 Voice announcements enabled' : '🔇 Voice announcements disabled', 'success');
    saveAllSettings();
}

async function resolveParkingDestinationCoords(lastRoute, endInput) {
    const lr = lastRoute || {};

    if (lr.end_lat != null && lr.end_lon != null) {
        const lat = Number(lr.end_lat);
        const lon = Number(lr.end_lon);
        if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
    }

    if (lr.destination) {
        const parts = String(lr.destination).split(',');
        if (parts.length >= 2) {
            const lat = parseFloat(parts[0]);
            const lon = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
        }
    }

    if (routeOptions && routeOptions.length > 0) {
        const idx = Math.max(0, Math.min(Number(selectedRouteIndex) || 0, routeOptions.length - 1));
        const route = routeOptions[idx];
        const poly = route && route.polyline;
        if (poly && poly.length > 0) {
            const last = poly[poly.length - 1];
            if (Array.isArray(last) && last.length >= 2) {
                return { lat: last[0], lon: last[1] };
            }
            if (last && last.lat != null && last.lon != null) {
                return { lat: last.lat, lon: last.lon };
            }
        }
        if (route && route.geometry && typeof decodePolyline === 'function') {
            const precision = Number.isFinite(route.geometry_precision) ? route.geometry_precision : 6;
            const pts = decodePolyline(route.geometry, precision);
            if (pts.length > 0) {
                const last = pts[pts.length - 1];
                return { lat: last[0], lon: last[1] };
            }
        }
    }

    if (lr.routes && lr.routes[0]) {
        const route = lr.routes[0];
        if (route.end_lat != null && route.end_lon != null) {
            return { lat: Number(route.end_lat), lon: Number(route.end_lon) };
        }
        if (route.geometry && typeof decodePolyline === 'function') {
            const precision = Number.isFinite(route.geometry_precision) ? route.geometry_precision : 6;
            const pts = decodePolyline(route.geometry, precision);
            if (pts.length > 0) {
                const last = pts[pts.length - 1];
                return { lat: last[0], lon: last[1] };
            }
        }
    }

    if (lr.geometry && typeof decodePolyline === 'function') {
        const precision = Number.isFinite(lr.geometry_precision) ? lr.geometry_precision : 6;
        const pts = decodePolyline(lr.geometry, precision);
        if (pts.length > 0) {
            const last = pts[pts.length - 1];
            return { lat: last[0], lon: last[1] };
        }
    }

    const endEl = document.getElementById('end');
    if (endEl && endEl.dataset.lat && endEl.dataset.lon) {
        const lat = parseFloat(endEl.dataset.lat);
        const lon = parseFloat(endEl.dataset.lon);
        if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
    }

    if (endInput && typeof geocodeLocations === 'function') {
        const geocoded = await geocodeLocations('', endInput);
        if (geocoded && geocoded.end) {
            const parts = geocoded.end.split(',');
            if (parts.length >= 2) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
            }
        }
    }

    return null;
}

async function fetchParkingSearch(params) {
    const response = await fetch('/api/parking-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    return response.json();
}

function scrollParkingResultsIntoView() {
    const parkingSection = document.getElementById('parkingSection');
    const content = document.querySelector('.bottom-sheet-content');
    if (!parkingSection || !content) return;
    if (typeof expandBottomSheet === 'function') expandBottomSheet();
    requestAnimationFrame(() => {
        content.scrollTop = Math.max(0, parkingSection.offsetTop - 12);
    });
}

function showParkingEmptyState(message) {
    const parkingSection = document.getElementById('parkingSection');
    const parkingListDiv = document.getElementById('parkingList');
    if (!parkingSection || !parkingListDiv) return;
    parkingListDiv.innerHTML = VoyagrModules.multimodalParking().buildParkingEmptyStateHtml(message);
    parkingSection.style.display = 'block';
    scrollParkingResultsIntoView();
}

async function findParkingNearDestination() {
    console.log('[Parking] findParkingNearDestination called');
    console.log('[Parking] lastCalculatedRoute:', window.lastCalculatedRoute);

    if (!window.lastCalculatedRoute) {
        console.error('[Parking] No route calculated');
        showStatus('Calculate a route first, then tap Find Parking', 'error');
        return;
    }

    const endInput = document.getElementById('end').value;
    if (!endInput) {
        console.error('[Parking] No destination entered');
        showStatus('Please enter a destination first', 'error');
        return;
    }

    showStatus('🔍 Searching for parking near destination...', 'loading');

    try {
        const endCoords = await resolveParkingDestinationCoords(window.lastCalculatedRoute, endInput);
        console.log('[Parking] End coordinates:', endCoords);

        if (!endCoords || isNaN(endCoords.lat) || isNaN(endCoords.lon)) {
            console.error('[Parking] Could not determine destination coordinates');
            showStatus('Could not determine destination coordinates', 'error');
            return;
        }

        const maxWalkingEl = document.getElementById('parkingMaxWalkingDistance');
        const typeEl = document.getElementById('parkingPreferredType');
        const priceEl = document.getElementById('parkingPricePreference');
        const maxWalkingDist = maxWalkingEl ? parseInt(maxWalkingEl.value, 10) : 10;
        const radiusMeters = (isNaN(maxWalkingDist) ? 10 : maxWalkingDist) * 80;
        const parkingType = typeEl ? typeEl.value : 'any';
        const pricePref = priceEl ? priceEl.value : 'any';

        let searchParams = {
            lat: endCoords.lat,
            lon: endCoords.lon,
            radius: radiusMeters,
            type: parkingType,
            price: pricePref
        };

        console.log('[Parking] Search parameters:', searchParams);
        let data = await fetchParkingSearch(searchParams);
        console.log('[Parking] Response data:', data);

        if (!data.success) {
            showStatus('Parking search failed: ' + (data.error || 'Unknown error'), 'error');
            return;
        }

        if (!data.parking || data.parking.length === 0) {
            const hasStrictFilters = parkingType !== 'any' || pricePref !== 'any' || radiusMeters < 1200;
            if (hasStrictFilters) {
                showStatus('No parking with current filters — widening search…', 'info');
                searchParams = {
                    lat: endCoords.lat,
                    lon: endCoords.lon,
                    radius: Math.max(radiusMeters, 1200),
                    type: 'any',
                    price: 'any'
                };
                data = await fetchParkingSearch(searchParams);
            }
        }

        if (!data.parking || data.parking.length === 0) {
            showParkingEmptyState(
                'No parking found near your destination. Try Settings → Parking Preferences to increase walking distance or relax price/type filters.'
            );
            showStatus('No parking found nearby. Adjust Parking Preferences in Settings.', 'warning');
            return;
        }

        console.log('[Parking] Found', data.parking.length, 'parking options');
        displayParkingOptions(data.parking, endCoords);
        showStatus(`✅ Found ${data.parking.length} parking options — scroll down to choose`, 'success');
        scrollParkingResultsIntoView();

        if (typeof fitMapToParkingResults === 'function') {
            fitMapToParkingResults(data.parking, endCoords);
        }

    } catch (error) {
        console.error('[Parking] Error:', error);
        showStatus('Error searching for parking: ' + error.message, 'error');
    }
}
function fitMapToParkingResults(parkingList, destinationCoords) {
    if (!map || !parkingList || parkingList.length === 0) return;
    try {
        const coords = parkingList.slice(0, 5).map(p => [p.lat, p.lon]);
        if (destinationCoords) coords.push([destinationCoords.lat, destinationCoords.lon]);
        if (typeof MapLibreHelpers !== 'undefined' && MapLibreHelpers.fitMapBounds) {
            MapLibreHelpers.fitMapBounds(map, coords, { padding: 60, maxZoom: 16 });
        }
    } catch (e) {
        console.warn('[Parking] fitMapToParkingResults:', e);
    }
}

/**
 * displayParkingOptions function
 * @function displayParkingOptions
 * @param {*} parkingList - Parameter description
 * @param {*} destinationCoords - Parameter description
 * @returns {*} Return value description
 */
function displayParkingOptions(parkingList, destinationCoords) {
    console.log('[Parking] displayParkingOptions called with', parkingList.length, 'parking options');

    // Clear previous markers
    parkingMarkers.forEach(marker => { if (marker && typeof marker.remove === 'function') marker.remove(); });
    parkingMarkers = [];

    const parkingSection = document.getElementById('parkingSection');
    const parkingListDiv = document.getElementById('parkingList');

    if (!parkingSection || !parkingListDiv) {
        console.error('[Parking] parkingSection or parkingListDiv not found!');
        return;
    }

    parkingListDiv.innerHTML = '';

    // Sort by distance
    parkingList.sort((a, b) => a.distance_m - b.distance_m);
    console.log('[Parking] Displaying top 5 parking options');

    // Display top 5 parking options
    const parkingModule = VoyagrModules.multimodalParking();
    parkingList.slice(0, 5).forEach((parking, index) => {
        const parkingDisplayDist = convertDistance(parking.distance_m / 1000);
        const parkingDistUnit = getDistanceUnit();

        try {
            const marker = MapLibreHelpers.createMarker(parking.lat, parking.lon, {
                html: parkingModule.buildParkingMapMarkerHtml(),
                iconSize: [32, 32],
                className: 'parking-marker',
                popup: parkingModule.buildParkingMapMarkerPopupHtml(parking.name, parkingDisplayDist, parkingDistUnit)
            }).addTo(map);

            marker.parkingData = parking;
            marker.on('click', () => selectParking(parking, destinationCoords));
            parkingMarkers.push(marker);
        } catch (markerErr) {
            console.warn('[Parking] Marker error:', markerErr);
        }

        const item = document.createElement('div');
        item.style.cssText = parkingModule.getParkingOptionItemContainerStyleCssText();
        item.innerHTML = parkingModule.buildParkingOptionItemHtml(parking, index, {
            distanceText: parkingDisplayDist,
            distUnit: parkingDistUnit,
        });

        item.querySelector('.parking-show-route-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            selectParking(parking, destinationCoords);
        });
        item.querySelector('.parking-set-dest-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            setParkingAsDestination(parking);
        });
        item.addEventListener('click', () => selectParking(parking, destinationCoords));

        item.onmouseover = () => { item.style.background = parkingModule.PARKING_OPTION_ITEM_HOVER_BACKGROUND; };
        item.onmouseout = () => item.style.background = 'white';

        parkingListDiv.appendChild(item);
    });

    parkingSection.style.display = 'block';
    console.log('[Parking] Parking section displayed with', parkingList.slice(0, 5).length, 'options');
}

async function selectParking(parking, destinationCoords) {
    selectedParking = parking;
    showStatus('🅿️ Calculating routes via parking...', 'loading');

    try {
        // Get current location or start location
        const startInput = document.getElementById('start').value;
        let startCoords = null;

        if (window.lastCalculatedRoute && window.lastCalculatedRoute.start_lat) {
            startCoords = {
                lat: window.lastCalculatedRoute.start_lat,
                lon: window.lastCalculatedRoute.start_lon
            };
        } else {
            showStatus('Could not determine start location', 'error');
            return;
        }

        // Calculate driving route to parking
        const enableHazardAvoidanceParking = VoyagrRoutingRequest.isMultimodalLegHazardAvoidanceEnabled(localStorage);
        const drivingBody = VoyagrRoutingRequest.buildMultimodalDrivingLegBody({
            startLat: startCoords.lat,
            startLon: startCoords.lon,
            endLat: parking.lat,
            endLon: parking.lon,
            vehicleType: currentVehicleType,
            costParams: getRouteCostParams(currentVehicleType),
            includeTolls: localStorage.getItem('includeTolls') !== 'false',
            avoidTolls: isAvoidTollsEnabled(),
            avoidCaz: localStorage.getItem('pref_caz') !== 'false',
            enableHazardAvoidance: enableHazardAvoidanceParking,
            avoidCameras: localStorage.getItem('pref_cameras') !== 'false',
            avoidTrafficLights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
        });

        const drivingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(drivingBody)
        });

        const drivingData = await drivingResponse.json();
        if (!drivingData.success) {
            showStatus('Error calculating driving route', 'error');
            return;
        }

        // Calculate walking route from parking to destination
        const enableHazardAvoidanceWalking = VoyagrRoutingRequest.isMultimodalLegHazardAvoidanceEnabled(localStorage);
        const walkingBody = VoyagrRoutingRequest.buildMultimodalWalkingLegBody({
            startLat: parking.lat,
            startLon: parking.lon,
            endLat: destinationCoords.lat,
            endLon: destinationCoords.lon,
            enableHazardAvoidance: enableHazardAvoidanceWalking,
            avoidCameras: localStorage.getItem('pref_cameras') !== 'false',
            avoidTrafficLights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
        });

        const walkingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(walkingBody)
        });

        const walkingData = await walkingResponse.json();
        if (!walkingData.success) {
            showStatus('Error calculating walking route', 'error');
            return;
        }

        // Display both routes on map
        displayParkingRoutes(drivingData, walkingData, parking, destinationCoords);

        // Update preview with combined journey info
        updateParkingPreview(drivingData, walkingData, parking);

        showStatus('✅ Routes calculated. Driving + Walking shown on map', 'success');

    } catch (error) {
        console.error('[Parking] Error selecting parking:', error);
        showStatus('Error: ' + error.message, 'error');
    }
}
/**
 * displayParkingRoutes function
 * @function displayParkingRoutes
 * @param {*} drivingData - Parameter description
 * @param {*} walkingData - Parameter description
 * @param {*} parking - Parameter description
 * @param {*} destination - Parameter description
 * @returns {*} Return value description
 */
function displayParkingRoutes(drivingData, walkingData, parking, destination) {
    console.log('[Parking] displayParkingRoutes called');
    console.log('[Parking] drivingData:', drivingData);
    console.log('[Parking] walkingData:', walkingData);

    // Remove previous parking routes
    if (parkingDrivingRoute && typeof parkingDrivingRoute.remove === 'function') parkingDrivingRoute.remove();
    if (parkingWalkingRoute && typeof parkingWalkingRoute.remove === 'function') parkingWalkingRoute.remove();

    // Decode and display driving route (blue) with MapLibre
    if (drivingData && drivingData.geometry) {
        console.log('[Parking] Decoding driving route geometry');
        // Use precision 5 for OSRM/GraphHopper
        const drivingCoords = decodePolyline(drivingData.geometry, 5);
        console.log('[Parking] Driving route has', drivingCoords.length, 'points');
        parkingDrivingRoute = MapLibreHelpers.addPolyline(map, drivingCoords, {
            color: '#2196F3',
            weight: 5,
            opacity: 0.8
        });
    }

    // Decode and display walking route (green) with MapLibre
    if (walkingData && walkingData.geometry) {
        console.log('[Parking] Decoding walking route geometry');
        const walkingCoords = decodePolyline(walkingData.geometry, 5);
        console.log('[Parking] Walking route has', walkingCoords.length, 'points');
        parkingWalkingRoute = MapLibreHelpers.addPolyline(map, walkingCoords, {
            color: '#4CAF50',
            weight: 4,
            opacity: 0.7
        });
    }

    // Fit map to show both routes
    const allCoords = [];
    if (drivingData && drivingData.geometry) {
        allCoords.push(...decodePolyline(drivingData.geometry, 5));
    }
    if (walkingData && walkingData.geometry) {
        allCoords.push(...decodePolyline(walkingData.geometry, 5));
    }
    if (allCoords.length > 0) {
        console.log('[Parking] Fitting map to', allCoords.length, 'total points');
        MapLibreHelpers.fitMapBounds(map, allCoords, { padding: 50 });
    }
}
/**
 * updateParkingPreview function
 * @function updateParkingPreview
 * @param {*} drivingData - Parameter description
 * @param {*} walkingData - Parameter description
 * @param {*} parking - Parameter description
 * @returns {*} Return value description
 */
function updateParkingPreview(drivingData, walkingData, parking) {
    const totals = VoyagrModules.multimodalParking().computeMultimodalLegTotals(drivingData, walkingData);
    const distUnit = getDistanceUnit();
    const convertedDist = convertDistance(totals.totalDistKm);
    const startLabel = document.getElementById('start').value;
    const endLabel = document.getElementById('end').value;
    const routeLabel = VoyagrModules.multimodalParking().buildParkingRouteLabel(
        startLabel,
        parking.name,
        endLabel
    );
    const breakdown = VoyagrModules.multimodalParking().buildParkingBreakdownHtml({
        drivingDistDisplay: convertDistance(totals.drivingDistKm),
        drivingTimeMin: totals.drivingTimeMin,
        walkingDistDisplay: convertDistance(totals.walkingDistKm),
        walkingTimeMin: totals.walkingTimeMin,
        distUnit: distUnit,
    });

    document.getElementById('previewDistance').textContent = convertedDist + ' ' + distUnit;
    document.getElementById('previewDuration').textContent = Math.round(totals.totalTimeMin) + ' min';
    document.getElementById('previewRoute').innerHTML = VoyagrModules.multimodalParking().buildParkingPreviewRouteHtml(routeLabel, breakdown);
}

/**
 * clearParkingSelection function
 * @function clearParkingSelection
 * @returns {*} Return value description
 */
function clearParkingSelection() {
    selectedParking = null;
    if (parkingDrivingRoute && typeof parkingDrivingRoute.remove === 'function') parkingDrivingRoute.remove();
    if (parkingWalkingRoute && typeof parkingWalkingRoute.remove === 'function') parkingWalkingRoute.remove();
    parkingMarkers.forEach(marker => { if (marker && typeof marker.remove === 'function') marker.remove(); });
    parkingMarkers = [];

    document.getElementById('parkingSection').style.display = 'none';
    document.getElementById('parkingList').innerHTML = '';

    // Restore original route preview
    if (window.lastCalculatedRoute) {
        showRoutePreview(window.lastCalculatedRoute);
    }

    showStatus('🗺️ Parking selection cleared', 'info');
}

/**
 * Set a parking location as the new destination and recalculate route
 * @param {Object} parking - Parking location data
 */
async function setParkingAsDestination(parking) {
    console.log('[Parking] Setting parking as destination:', parking);

    try {
        // Set the destination input to the parking coordinates
        const endInput = document.getElementById('end');
        if (!endInput) {
            showStatus('Error: Destination input not found', 'error');
            return;
        }

        // Set destination to parking name and coordinates
        endInput.value = `${parking.name}`;

        // CRITICAL: Store coordinates in dataset for geocoding to use
        endInput.dataset.lat = parking.lat;
        endInput.dataset.lon = parking.lon;
        endInput.dataset.displayName = parking.name;

        showStatus('🅿️ Recalculating route to parking...', 'loading');

        // Clear parking selection
        clearParkingSelection();

        // Recalculate route to the parking location
        await calculateRoute();

        showStatus(`✅ Route calculated to ${parking.name}`, 'success');

    } catch (error) {
        console.error('[Parking] Error setting parking as destination:', error);
        showStatus('Error: ' + error.message, 'error');
    }
}

/**
 * clearForm function
 * @function clearForm
 * @returns {*} Return value description
 */
function clearForm() {
    const startEl = document.getElementById('start');
    if (startEl) {
        startEl.value = '';
        delete startEl.dataset.lat;
        delete startEl.dataset.lon;
        delete startEl.dataset.displayName;
    }
    document.getElementById('end').value = '';
    document.getElementById('result').classList.remove('show');
    document.getElementById('status').className = 'status';

    const viaInput = document.getElementById('viaPointAddress');
    if (viaInput) viaInput.value = '';
    const stopInput = document.getElementById('stopAddress');
    if (stopInput) stopInput.value = '';

    if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
    if (endMarker && typeof endMarker.remove === 'function') endMarker.remove();
    if (routeLayer && typeof routeLayer.remove === 'function') routeLayer.remove();

    clearParkingSelection();

    // Use smooth animation to return to default view (MapLibre flyTo)
    map.flyTo({
        center: [-0.1278, 51.5074],
        zoom: 13,
        duration: ZOOM_ANIMATION_DURATION * 1000
    });
    lastZoomLevel = 13;

    if (autoGpsEnabled) {
        updateAutoGpsLocation();
    }
}

// ===== PHASE 2 FEATURES: SEARCH HISTORY & FAVORITES =====

/**
 * Fill a location field's autocomplete with recent (local) + server search history when the
 * query is short. Shared by the Start and Destination inputs (and the "show history" affordance)
 * so both fields offer the same "pick a previous location" experience from one code path.
 * @param {HTMLElement} dropdown - The field's autocomplete dropdown (#autocompleteStart / #autocompleteEnd).
 * @param {string} [fieldId='end'] - Which input the chosen suggestion populates ('start' | 'end').
 */
async function renderEndDestinationSuggestions(dropdown, fieldId = 'end') {
    if (!dropdown) return;

    const SA = _searchAutocomplete();
    const recent = loadRecentDestinations();
    dropdown.innerHTML = '';

    const appendSectionTitle = (text) => {
        dropdown.insertAdjacentHTML('beforeend', SA.buildAutocompleteSectionTitleHtml(text));
    };

    if (recent.length) {
        appendSectionTitle('Recent locations');
        recent.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = SA.buildRecentDestinationItemHtml(item, { escapeHtml });
            div.onclick = () => selectAutocompleteResult(fieldId, item.lat, item.lon, item.label);
            dropdown.appendChild(div);
        });
    }

    let serverCount = 0;
    try {
        const { res, data } = await fetchJsonWithAuth('/api/search-history');
        if (res.status !== 401 && data.success && data.history && data.history.length > 0) {
            appendSectionTitle('Saved searches');
            data.history.forEach((item) => {
                const built = SA.buildServerSearchHistoryItemHtml(item, { escapeHtml });
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = built.html;
                if (built.hasCoords) {
                    div.onclick = () => selectAutocompleteResult(fieldId, built.lat, built.lon, item.result_name || item.query);
                } else {
                    div.onclick = () => {
                        const fieldInput = document.getElementById(fieldId);
                        if (fieldInput) fieldInput.value = item.query || '';
                        dropdown.classList.remove('show');
                    };
                }
                dropdown.appendChild(div);
                serverCount++;
            });
        }
    } catch (e) {
        console.error('[Search history]', e);
    }

    if (!recent.length && serverCount === 0) {
        dropdown.innerHTML = SA.buildAutocompleteNoResultsHtml();
    }
    dropdown.classList.add('show');
}

/**
 * showSearchHistory function
 * @function showSearchHistory
 * @returns {*} Return value description
 */
function showSearchHistory() {
    const dropdown = getAutocompleteDropdown('end');
    if (!dropdown) return;
    renderEndDestinationSuggestions(dropdown).catch((e) => console.error('Error loading search history:', e));
}

// Add search to history
/**
 * addToSearchHistory function
 * @function addToSearchHistory
 * @param {*} query - Parameter description
 * @param {*} resultName - Parameter description
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @returns {*} Return value description
 */
function addToSearchHistory(query, resultName, lat, lon) {
    if (query && lat != null && lon != null) {
        recordRecentDestination(resultName || query, lat, lon, 'search');
    }
    getSupabaseAccessToken().then(token => {
        if (!token) return;
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
        return fetch('/api/search-history', {
        method: 'POST',
            headers,
            body: JSON.stringify({ query, result_name: resultName, lat, lon })
        });
    }).catch(error => console.error('Error adding to search history:', error));
}

// Load and display favorite locations with edit/delete options
/**
 * loadFavorites function
 * @function loadFavorites
 * @returns {*} Return value description
 */
function loadFavorites() {
    fetchJsonWithAuth('/api/favorites')
        .then(({ res, data }) => {
            const section = document.getElementById('favoritesSection');
            const grid = document.getElementById('favoritesGrid');
            grid.innerHTML = '';

            if (res.status === 401) {
                section.style.display = 'none';
                return;
            }

            if (data.success && data.favorites.length > 0) {
                const FAV = _favorites();
                data.favorites.forEach(fav => {
                    const container = document.createElement('div');
                    container.className = 'favorite-item';
                    container.style.cssText = FAV.FAVORITE_ITEM_CONTAINER_STYLE;

                    const btn = document.createElement('button');
                    btn.className = 'favorite-btn';
                    btn.style.cssText = FAV.FAVORITE_BTN_STYLE;
                    btn.innerHTML = FAV.buildFavoriteMainButtonHtml(fav, { escapeHtml });
                    btn.onclick = () => {
                        document.getElementById('end').value = fav.name;
                        document.getElementById('end').dataset.lat = fav.lat;
                        document.getElementById('end').dataset.lon = fav.lon;
                        document.getElementById('end').dataset.displayName = fav.name;
                        addToSearchHistory(fav.name, fav.name, fav.lat, fav.lon);
                        expandBottomSheet();
                        showStatus(`📍 Destination set to ${fav.name}`, 'success');
                    };

                    const editBtn = document.createElement('button');
                    editBtn.innerHTML = FAV.buildFavoriteEditButtonHtml();
                    editBtn.title = 'Edit';
                    editBtn.style.cssText = FAV.FAVORITE_EDIT_BTN_STYLE;
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        editFavorite(fav);
                    };

                    const delBtn = document.createElement('button');
                    delBtn.innerHTML = FAV.buildFavoriteDeleteButtonHtml();
                    delBtn.title = 'Delete';
                    delBtn.style.cssText = FAV.FAVORITE_DELETE_BTN_STYLE;
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        deleteFavorite(fav);
                    };

                    container.appendChild(btn);
                    container.appendChild(editBtn);
                    container.appendChild(delBtn);
                    grid.appendChild(container);
                });

                section.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        })
        .catch(error => console.error('Error loading favorites:', error));
}

/**
 * Edit a favorite location
 */
function editFavorite(fav) {
    const newName = prompt('Edit name:', fav.name);
    if (!newName || newName === fav.name) return;

    const newCategory = prompt('Edit category:', fav.category);

    getSupabaseAccessToken().then(token => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch('/api/favorites', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                id: fav.id,
                name: newName,
                address: fav.address,
                category: newCategory || fav.category
            })
        });
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showStatus(`✅ Updated ${newName}`, 'success');
            loadFavorites();
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    })
    .catch(err => {
        console.error('Error updating favorite:', err);
        showStatus('❌ Failed to update favorite', 'error');
    });
}

/**
 * Delete a favorite location
 */
function deleteFavorite(fav) {
    if (!confirm(`Delete "${fav.name}" from favorites?`)) return;

    getSupabaseAccessToken().then(token => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch('/api/favorites', {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ id: fav.id })
        });
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showStatus(`🗑️ Removed ${fav.name}`, 'success');
            loadFavorites();
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    })
    .catch(err => {
        console.error('Error deleting favorite:', err);
        showStatus('❌ Failed to delete favorite', 'error');
    });
}

// Add current location to favorites
/**
 * addCurrentToFavorites function
 * @function addCurrentToFavorites
 * @returns {*} Return value description
 */
function addCurrentToFavorites() {
    const name = prompt('Enter name for this location (e.g., Home, Work):');
    if (!name) return;

    const category = prompt('Enter category (e.g., home, work, shopping):', 'location');

    getSupabaseAccessToken().then(token => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch('/api/favorites', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: name,
                address: document.getElementById('end').value,
                lat: currentLat,
                lon: currentLon,
                category: category || 'location'
            })
        });
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus(`Added ${name} to favorites!`, 'success');
                loadFavorites();
            } else {
                showStatus('Error adding to favorites', 'error');
            }
        })
        .catch(error => {
            showStatus('Error: ' + error.message, 'error');
        });
}

// ===== PHASE 2 FEATURES: LANE GUIDANCE =====
/**
 * updateLaneGuidance function
 * @function updateLaneGuidance
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} heading - Parameter description
 * @param {*} maneuver - Parameter description
 * @returns {*} Return value description
 */
// Lane guidance throttle to avoid API spam
let lastLaneGuidanceFetch = 0;
const LANE_GUIDANCE_FETCH_INTERVAL = 3000; // 3 seconds
let lastLaneGuidanceManeuver = '';
let lastLaneGuidancePosition = null;
let _lastLaneVoiceKey = '';

// Short client-side cache of lane-guidance responses so the overlay shows instantly when
// revisiting the same approach and so a slow/unavailable Overpass doesn't blank it out.
const _laneGuidanceCache = new Map();        // key -> { data, ts, fallback }
const LANE_GUIDANCE_CACHE_TTL = 20000;       // reuse OSM-derived guidance for 20s
const LANE_GUIDANCE_FALLBACK_TTL = 8000;     // shorter reuse for deterministic fallback (keep retrying OSM)
const LANE_GUIDANCE_FETCH_TIMEOUT = 2500;    // treat Overpass as "slow" beyond this and fall back

function _pruneLaneGuidanceCache() {
    const now = Date.now();
    for (const [k, v] of _laneGuidanceCache) {
        if (now - v.ts > LANE_GUIDANCE_CACHE_TTL) _laneGuidanceCache.delete(k);
    }
    while (_laneGuidanceCache.size > 40) {
        const firstKey = _laneGuidanceCache.keys().next().value;
        _laneGuidanceCache.delete(firstKey);
    }
}

function updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount) {
    roundaboutExitCount = roundaboutExitCount || 0;
    const now = Date.now();

    const posChanged = !lastLaneGuidancePosition ||
        calculateDistance(lat, lon, lastLaneGuidancePosition.lat, lastLaneGuidancePosition.lon) > 50;
    const maneuverChanged = maneuver !== lastLaneGuidanceManeuver;

    if (!posChanged && !maneuverChanged && (now - lastLaneGuidanceFetch) < LANE_GUIDANCE_FETCH_INTERVAL) {
        return;
    }

    let distToManeuver = 9999;
    if (routeInProgress && currentRouteSteps && currentRouteSteps.length > currentStepIndex) {
        const nextStep = currentRouteSteps[currentStepIndex];
        if (nextStep && routePolyline) {
            const shapeIdx = nextStep.begin_shape_index || 0;
            if (shapeIdx < routePolyline.length) {
                distToManeuver = calculateDistance(lat, lon, routePolyline[shapeIdx][0], routePolyline[shapeIdx][1]);
            }
        }
    }

    const roadType = getCurrentRoadType() || 'unknown';

    lastLaneGuidanceFetch = now;
    lastLaneGuidanceManeuver = maneuver;
    lastLaneGuidancePosition = { lat, lon };

    // Serve a fresh cached result instantly (key bucketed to ~110m so nearby ticks reuse it).
    const cacheKey = `${maneuver}|${roundaboutExitCount}|${roadType}|${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = _laneGuidanceCache.get(cacheKey);
    if (cached) {
        const ttl = cached.fallback ? LANE_GUIDANCE_FALLBACK_TTL : LANE_GUIDANCE_CACHE_TTL;
        if (now - cached.ts < ttl) {
            // Reuse the cached lane STRUCTURE but recompute urgency from the live distance.
            const lanePos = _laneNameFor(cached.data.recommended_lane, cached.data.total_lanes);
            renderLaneGuidanceUI({
                ...cached.data,
                ..._laneUrgencyFields(distToManeuver, lanePos, maneuver, roundaboutExitCount),
            });
            return;
        }
    }

    const url = `/api/lane-guidance?lat=${lat}&lon=${lon}&heading=${heading}&maneuver=${maneuver}&distance=${distToManeuver}&road_type=${roadType}&roundabout_exit_count=${roundaboutExitCount}`;

    // Abort (and fall back) if Overpass is slow, so the overlay never stalls.
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), LANE_GUIDANCE_FETCH_TIMEOUT) : null;

    const useFallback = (reason) => {
        const fb = _buildDeterministicLaneGuidance(maneuver, distToManeuver, roundaboutExitCount, roadType);
        _laneGuidanceCache.set(cacheKey, { data: fb, ts: Date.now(), fallback: true });
        _pruneLaneGuidanceCache();
        console.warn('[Lane Guidance] using deterministic fallback:', reason);
        renderLaneGuidanceUI(fb);
    };

    fetch(url, controller ? { signal: controller.signal } : undefined)
        .then(response => response.json())
        .then(data => {
            if (timeoutId) clearTimeout(timeoutId);
            if (data && data.success) {
                _laneGuidanceCache.set(cacheKey, { data, ts: Date.now(), fallback: false });
                _pruneLaneGuidanceCache();
                renderLaneGuidanceUI(data);
            } else {
                useFallback('no data');
            }
        })
        .catch(error => {
            if (timeoutId) clearTimeout(timeoutId);
            useFallback((error && error.name === 'AbortError') ? 'timeout' : (error && error.message) || 'error');
        });
}

/**
 * Deterministic, network-free lane guidance used when Overpass is slow/unavailable.
 * Lane count comes from the road class; the recommended lane mirrors the backend UK
 * heuristic. Single-lane roads return total_lanes=1 so the overlay stays hidden.
 */
function _buildDeterministicLaneGuidance(maneuver, distance, exitCount, roadType) {
    return VoyagrModules.laneGuidance().buildDeterministicLaneGuidance(maneuver, distance, exitCount, roadType);
}

function _ordinal(n) {
    return VoyagrModules.laneGuidance().ordinal(n);
}

/** Human-friendly name for a 1-based lane (mirrors backend _descriptive_lane_name). */
function _laneNameFor(lane, total) {
    return VoyagrModules.laneGuidance().laneNameFor(lane, total);
}

/**
 * Distance-derived urgency fields (mirrors the backend thresholds). Recomputed from the
 * live distance so a cached lane structure never shows stale urgency as you approach.
 */
function _laneUrgencyFields(distance, lanePos, maneuver, exitCount) {
    return VoyagrModules.laneGuidance().laneUrgencyFields(distance, lanePos, maneuver, exitCount);
}

function renderLaneGuidanceUI(data) {
    const display = document.getElementById('laneGuidanceDisplay');
    const visual = document.getElementById('laneVisual');
    const text = document.getElementById('laneGuidanceText');

    if (!display || !visual || !text) return;

    const LG = VoyagrModules.laneGuidance();

    // Don't show lane guidance for single-lane roads or when no maneuver is approaching
    const show = LG.shouldShow(data);
    if (!show) {
        display.classList.remove('show');
        return;
    }

    // Mark non-OSM (estimated / fallback) guidance so the driver knows it's approximate.
    const badgeEl = document.getElementById('laneGuidanceBadge');
    if (badgeEl) {
        const badge = LG.badge(data);
        badgeEl.textContent = badge.text;
        badgeEl.style.display = badge.visible ? 'inline-block' : 'none';
    }

    // Build lane visual with direction arrows
    visual.innerHTML = '';
    const indicators = LG.laneIndicators(data);

    for (const ind of indicators) {
        const lane = document.createElement('div');
        lane.className = 'lane-indicator';
        if (ind.recommended) lane.classList.add('recommended');
        lane.innerHTML = LG.buildLaneIndicatorHtml(ind.arrow);
        if (ind.hasDirection) lane.classList.add('has-direction');
        visual.appendChild(lane);
    }

    // Set urgency styling
    display.className = 'lane-guidance-display show';
    const urgencyCls = LG.urgencyClass(data.urgency);
    if (urgencyCls) display.classList.add(urgencyCls);

    // Build guidance text with distance context
    const guidanceText = LG.displayText(data);
    text.textContent = guidanceText;

    // Voice announcement for lane guidance at junctions, roundabouts, and urgent lane changes
    if (voiceAnnouncementsEnabled && data.recommended_lane && data.total_lanes > 1) {
        const announceKey = `lane_${data.next_maneuver}_${data.recommended_lane}_${data.urgency}`;
        const alreadyAnnounced = announceKey === _lastLaneVoiceKey;

        if (!alreadyAnnounced) {
            let laneMsg = '';
            const lanePos = data.recommended_lane === 1 ? 'left'
                : data.recommended_lane === data.total_lanes ? 'right'
                : data.total_lanes === 3 && data.recommended_lane === 2 ? 'middle'
                : `lane ${data.recommended_lane}`;

            const exitInfo = (data.roundabout_exit_count > 0)
                ? `, take the ${_ordinal(data.roundabout_exit_count)} exit` : '';

            if (data.urgency === 'now') {
                if (data.next_maneuver === 'roundabout') {
                    laneMsg = `At the roundabout, use the ${lanePos} lane${exitInfo}`;
                } else {
                    laneMsg = data.urgency_text || `Get in the ${lanePos} lane now`;
                }
                speakMessage(laneMsg, 'high');
                _lastLaneVoiceKey = announceKey;
            } else if (data.urgency === 'soon') {
                if (data.next_maneuver === 'roundabout') {
                    laneMsg = `At the roundabout ahead, use the ${lanePos} lane${exitInfo}`;
                } else {
                    laneMsg = data.urgency_text || `Move to the ${lanePos} lane`;
                }
                speakMessage(laneMsg, 'normal');
                _lastLaneVoiceKey = announceKey;
            } else if (data.urgency === 'ahead' && data.lane_change_needed) {
                laneMsg = `Ahead, you'll need the ${lanePos} lane`;
                speakMessage(laneMsg, 'normal');
                _lastLaneVoiceKey = announceKey;
            }
        }
    }
}

// ===== GPS SPEED WIDGET =====

// Speed widget variables - default to enabled
let speedWidgetEnabled = localStorage.getItem('speedWidgetEnabled') !== 'false';  // Default true
let currentSpeedMph = 0;

// GPS speed tracking
let currentGpsSpeedMph = 0;
let currentGpsSpeedKmh = 0;
let currentSpeedLimitMph = null;
let lastDetectedRoadType = null;
let lastSpeedLimitRegion = 'uk';
let _speedLimitFetchState = null;
let _lastActiveManeuverIdx = -1;
function _getSpeedLimitFetchState() {
    const SL = _speedLimitWidget();
    if (!_speedLimitFetchState && SL) {
        _speedLimitFetchState = SL.createFetchState();
    }
    return _speedLimitFetchState;
}
// Goals:
//   1. Hide sub-noise readings while genuinely stationary (GPS can drift to 0.2-0.5 m/s
//      while parked, which used to flicker the widget between 0 and 1 mph).
//   2. Smooth high-frequency jitter while moving without adding visible lag.
//   3. Snap straight to new value when the change is large (hard brake / acceleration)
//      so the widget stays responsive when it matters.
//   4. Fall back to derived speed (dx/dt between successive fixes) when the device does
//      not report `coords.speed` — common on some Android browsers.
/** Hard ceiling for plausible road-vehicle speeds (clamp sensor + Δfix estimates). */
const MAX_DISPLAY_GPS_SPEED_MPH = 185.0;

let _smoothedSpeedMph = 0;
let _smoothedSpeedInitAt = 0;
/** Tracks last sane raw mph accepted by {@link pickRawSpeedMph} for outlier rejection. */
let _lastGoodRawPickMph = 0;
/**
 * Count of consecutive displacement-derived speed samples while the device keeps
 * reporting coords.speed === 0. Once high enough we stop treating the device as
 * "parked" and use a lower noise floor so the speedometer wakes up faster.
 */
let _consecutiveDisplacementMoves = 0;

/** Unit-tested speed/GPS helpers (modules/navigation/speed-gps.js). */
function _speedGps() { return VoyagrModules.speedGps(); }

/** Unit-tested hazard alert helpers (modules/navigation/hazard-alerts.js). */
function _hazardAlerts() { return VoyagrModules.hazardAlerts(); }

/** Unit-tested offline/resume navigation banner helpers (modules/navigation/offline-navigation.js). */
function _offlineNavigation() { return VoyagrModules.offlineNavigation(); }

/** Unit-tested ML prediction list HTML (modules/navigation/ml-predictions.js). */
function _mlPredictions() { return VoyagrModules.mlPredictions(); }

/** Unit-tested search autocomplete row HTML (modules/navigation/search-autocomplete.js). */
function _searchAutocomplete() { return VoyagrModules.searchAutocomplete(); }

/** Unit-tested device environment hint copy and banner HTML (modules/ui/device-environment.js). */
function _deviceEnvironment() { return VoyagrModules.deviceEnvironment(); }

/** Unit-tested route calculation progress bar HTML (modules/navigation/route-progress.js). */
function _routeProgress() { return VoyagrModules.routeProgress(); }

/** Unit-tested map preview marker HTML (modules/map/preview-marker.js). */
function _previewMarker() { return VoyagrModules.previewMarker(); }

/** Unit-tested favorites list HTML (modules/navigation/favorites.js). */
function _favorites() { return VoyagrModules.favorites(); }

/** Unit-tested CAZ zones settings panel HTML (modules/navigation/caz-info.js). */
function _cazInfo() { return VoyagrModules.cazInfo(); }

/** Unit-tested vehicle marker SVG/popup HTML (modules/map/vehicle-marker.js). */
function _vehicleMarker() { return VoyagrModules.vehicleMarker(); }

/** Unit-tested OSM map layer marker HTML (modules/map/osm-map-icons.js). */
function _osmMapIcons() { return VoyagrModules.osmMapIcons(); }

/** Unit-tested navigation map control icons (modules/map/map-controls.js). */
function _mapControls() { return VoyagrModules.mapControls(); }

function applyZoomFollowButtonUi(btn, enabled) {
    if (!btn) return;
    const display = _mapControls().getZoomFollowButtonDisplay(enabled);
    btn.classList.toggle('active', display.active);
    btn.style.background = display.background;
    btn.innerHTML = display.innerHtml;
}

function applyJourneyOverviewButtonUi(btn, overviewActive) {
    if (!btn) return;
    const display = _mapControls().getJourneyOverviewButtonDisplay(overviewActive);
    btn.style.background = display.background;
    btn.innerHTML = display.innerHtml;
    btn.title = display.title;
}

/** Unit-tested camera map marker HTML (modules/map/camera-map-markers.js). */
function _cameraMapMarkers() { return VoyagrModules.cameraMapMarkers(); }

/** Unit-tested route hazard map marker HTML (modules/map/hazard-map-markers.js). */
function _hazardMapMarkers() { return VoyagrModules.hazardMapMarkers(); }

/** Unit-tested PWA install banner HTML (modules/ui/pwa-install.js). */
function _pwaInstall() { return VoyagrModules.pwaInstall(); }

/** Unit-tested best-time-to-leave panel HTML (modules/navigation/best-time-leave.js). */
function _bestTimeLeave() { return VoyagrModules.bestTimeLeave(); }

/** Unit-tested speed-limit widget helpers (modules/navigation/speed-limit-widget.js). */
function _speedLimitWidget() { return VoyagrModules.speedLimitWidget(); }

/**
 * Smooth a raw mph reading to reduce GPS jitter without sacrificing responsiveness.
 * Treats very small values as "stationary" (dead-band) and snaps through the EMA
 * when the delta is large (real acceleration / braking).
 *
 * @param {number} rawMph - Latest mph value to fold in.
 * @returns {number} Smoothed mph value to show in the widget.
 */
function smoothGpsSpeedMph(rawMph) {
    const SG = VoyagrModules.speedGps();
    const r = SG.stepSmoothGpsSpeedMph(
        { smoothedMph: _smoothedSpeedMph, initAt: _smoothedSpeedInitAt },
        rawMph,
        Date.now()
    );
    _smoothedSpeedMph = r.state.smoothedMph;
    _smoothedSpeedInitAt = r.state.initAt;
    return r.value;
}

/**
 * Pick the best GPS-speed estimate for this tick:
 *  - Trust `coords.speed` (m/s) when the device reports a finite, non-negative value.
 *  - Otherwise derive speed from displacement between the two most recent fixes — this
 *    keeps the widget useful on devices that always report `null`.
 *
 * @param {number|null|undefined} coordsSpeed - `position.coords.speed` (m/s) for this fix.
 * @param {Array<{lat:number,lon:number,timestamp:Date|number,accuracy?:number}>} history - Recent fixes.
 * @param {number|undefined|null} coordAccuracy - `coords.accuracy` (meters) for this tick.
 * @returns {number} Best-effort mph reading (still raw — caller should run through {@link smoothGpsSpeedMph}).
 */
/**
 * Reject implausible GPS speed spikes (e.g. 145 mph) before display smoothing.
 * @param {number} mph - Candidate speed in mph
 * @param {number} prevPick - Last accepted raw mph
 * @returns {number}
 */
function rejectGpsSpeedSpikeMph(mph, prevPick) {
    return VoyagrModules.speedGps().rejectGpsSpeedSpikeMph(mph, prevPick);
}

// pickRawSpeedMph body moved to modules/navigation/speed-gps.js as the pure
// stepPickRawSpeedMph step function. This orchestration wrapper holds the mutable
// state and calls it, matching the pattern of smoothGpsSpeedMph / stepSmoothGpsSpeedMph.
function pickRawSpeedMph(coordsSpeed, history, coordAccuracy) {
    const SG = VoyagrModules.speedGps();
    const r = SG.stepPickRawSpeedMph(
        { lastGoodRawPickMph: _lastGoodRawPickMph, consecutiveDisplacementMoves: _consecutiveDisplacementMoves },
        coordsSpeed, history, coordAccuracy
    );
    _lastGoodRawPickMph = r.state.lastGoodRawPickMph;
    _consecutiveDisplacementMoves = r.state.consecutiveDisplacementMoves;
    return r.value;
}
/**
 * updateSpeedWidget function
 * @function updateSpeedWidget
 * @param {number} currentSpeedInMph - Current GPS speed in MPH (always MPH internally)
 * @param {number|null} [speedLimitInMph] - Posted limit in MPH when known
 * @returns {void}
 */
function updateSpeedWidget(currentSpeedInMph, speedLimitInMph = null) {
    const widget = document.getElementById('speedWidget');
    if (!widget) return;

    currentGpsSpeedMph = currentSpeedInMph;
    currentGpsSpeedKmh = currentSpeedInMph * 1.609344;

    const SG = VoyagrModules.speedGps();
    const SL = VoyagrModules.speedLimitWidget();
    const displaySpeedUnit = getSpeedUnit();
    const gpsDisplay = SL.formatSpeedForWidget(currentSpeedInMph, speedUnit, SG);

    const speedValueEl = document.getElementById('speedValue');
    const speedUnitEl = document.getElementById('speedUnitDisplay');
    if (speedValueEl) {
        speedValueEl.textContent = String(SL.sanitizeWidgetDisplayNumber(gpsDisplay.value));
    }
    if (speedUnitEl) speedUnitEl.textContent = gpsDisplay.unitLabel;

    const limitValueEl = document.getElementById('speedLimitValue');
    const limitUnitEl = document.getElementById('speedLimitUnit');
    if (limitValueEl && limitUnitEl) {
        const resolvedLimit = (speedLimitInMph !== null && speedLimitInMph > 0)
            ? speedLimitInMph
            : null;

        if (resolvedLimit !== null && resolvedLimit > 0) {
            currentSpeedLimitMph = resolvedLimit;
            const limitDisplay = SL.formatSpeedForWidget(resolvedLimit, speedUnit, SG);
            limitValueEl.textContent = String(SL.sanitizeWidgetDisplayNumber(limitDisplay.value));
            limitUnitEl.textContent = limitDisplay.unitLabel;
            widget.style.borderLeft = '4px solid #4285F4';
        } else {
            limitValueEl.textContent = '…';
            limitUnitEl.textContent = displaySpeedUnit;
            widget.style.borderLeft = '4px solid #999';
        }
    }

    updateSpeedWidgetVisibility();
}

/**
 * Consolidated function to manage speed widget visibility
 * Shows widget when: tracking is active OR navigation is in progress AND widget is enabled
 * @returns {void}
 */
let _lastSpeedWidgetVisible = null; // Track to avoid redundant DOM writes
function updateSpeedWidgetVisibility() {
    const widget = document.getElementById('speedWidget');
    if (!widget) return;

    const shouldShow = (isTrackingActive || routeInProgress) && speedWidgetEnabled;
    // Only update DOM if state actually changed
    if (shouldShow !== _lastSpeedWidgetVisible) {
        widget.style.display = shouldShow ? 'block' : 'none';
        _lastSpeedWidgetVisible = shouldShow;
        console.log('[Speed Widget]', shouldShow ? 'Visible' : 'Hidden', '(tracking:', isTrackingActive, 'route:', routeInProgress, ')');
    }
}

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
// calculateDistanceMeters / calculateHaversineDistance / calculateDistance moved to
// modules/navigation/route-geometry.js (VoyagrRouteGeometry.haversineDistanceMeters).
// Thin stubs below keep all existing callers working.
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    return VoyagrModules.routeGeometry().haversineDistanceMeters(lat1, lon1, lat2, lon2);
}

/**
 * Map a snapped polyline vertex index to the Valhalla maneuver describing the edge
 * the driver is currently traversing.
 *
 * Valhalla maneuver i describes the road segment from `begin_shape_index[i]` (inclusive)
 * to `begin_shape_index[i+1]` (exclusive). `currentStepIndex` tracks the *upcoming*
 * maneuver (the next turn). Picking the maneuver by snapped vertex fixes turn display
 * for the road currently under the wheels.
 *
 * @param {number} snappedIndex - Index into `routePolyline` of the snapped GPS position.
 * @returns {number} Index into `currentRouteSteps`, or -1 if not available.
 */
function getActiveRouteManeuverIndex(snappedIndex) {
    return VoyagrModules.speedGps().getActiveRouteManeuverIndex(currentRouteSteps, snappedIndex);
}

/**
 * Get the road class for a specific maneuver, falling back to instruction-text inference.
 *
 * @param {Object|null} step - A Valhalla maneuver object (or null).
 * @returns {string|null} Road class string, or null when nothing useful could be inferred.
 */
// inferRoadClassFromManeuver / inferRoadClassFromStreetNames moved to
// modules/navigation/route-geometry.js. Thin stubs keep all callers working.
function inferRoadClassFromManeuver(step) {
    return VoyagrModules.routeGeometry().inferRoadClassFromManeuver(step);
}

function inferRoadClassFromStreetNames(streetNames) {
    return VoyagrModules.routeGeometry().inferRoadClassFromStreetNames(streetNames);
}

/**
 * Get current road type from route data or default to safe value.
 *
 * @param {number} [maneuverIdxOverride] - Optional maneuver index. When supplied, the road
 *   class is taken from that maneuver rather than from `currentStepIndex`.
 * @param {number} [gpsSpeedMph] - Optional GPS speed hint when route metadata is missing.
 * @returns {string} Road type (motorway, primary, residential, unknown, etc.)
 */
function getCurrentRoadType(maneuverIdxOverride, gpsSpeedMph) {
    let stepIndex = -1;
    if (Number.isFinite(maneuverIdxOverride) && maneuverIdxOverride >= 0) {
        stepIndex = maneuverIdxOverride;
    } else if (currentRouteSteps && currentStepIndex >= 0 && currentStepIndex < currentRouteSteps.length) {
        stepIndex = currentStepIndex;
    }

    if (stepIndex >= 0 && currentRouteSteps && stepIndex < currentRouteSteps.length) {
        const step = currentRouteSteps[stepIndex];
        const fromStreet = inferRoadClassFromStreetNames(
            step.begin_street_names || step.street_names
        );
        if (fromStreet) return fromStreet;
        const inferred = inferRoadClassFromManeuver(step);
        if (inferred) return inferred;
        if (step.road_class) return step.road_class;
    }

    if (lastDetectedRoadType) return lastDetectedRoadType;

    const spd = Number(gpsSpeedMph);
    if (Number.isFinite(spd) && spd >= 65) return 'motorway';
    if (Number.isFinite(spd) && spd >= 45) return 'primary';

    return 'unknown';
}

/**
 * Best street label for a Valhalla maneuver. `preferCurrentRoad` reads begin_street_names
 * (the edge being driven) instead of street_names (the road after the maneuver).
 * @param {object|null} maneuver
 * @param {boolean} [preferCurrentRoad=false]
 * @returns {string}
 */
function getManeuverStreetLabel(maneuver, preferCurrentRoad = false) {
    const SG = _speedGps();
    if (SG) return SG.getManeuverStreetLabel(maneuver, preferCurrentRoad);
    return '';
}

/**
 * Normalize a Valhalla maneuver speed_limit field to mph.
 * @param {number} rawSl
 * @param {string|null} roadClass
 * @param {number} gpsSpeedMph
 * @returns {number|null}
 */
function normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph) {
    const SG = _speedGps();
    if (SG) return SG.normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph);
    return null;
}

/**
 * Fetch posted speed limit for current GPS position (throttled, offline cache fallback).
 */
function fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType = 'residential', valhallaSpeedLimit = null, headingDeg = null) {
    const SL = _speedLimitWidget();
    const SG = _speedGps();
    const state = _getSpeedLimitFetchState();
    if (!SL || !state) return;

    const now = Date.now();
    if (!SL.shouldFetchSpeedLimit(state, lat, lon, now, calculateDistanceMeters)) {
        return;
    }

    state.inFlight = true;
    state.lastFetchAt = now;
    state.lastPosition = { lat, lon };
    const mySeq = ++state.seq;

    const acceptIfFresh = (apply) => {
        if (mySeq < state.appliedSeq) return;
        state.appliedSeq = mySeq;
        apply();
    };

    const applyLimit = (limitMph, detectedRoadType, region) => {
        if (detectedRoadType) lastDetectedRoadType = detectedRoadType;
        if (region) lastSpeedLimitRegion = region;
        const displayLimit = SL.pickDisplaySpeedLimitMph(
            limitMph, valhallaSpeedLimit,
            detectedRoadType || roadType, lastSpeedLimitRegion,
            { allowRoadTypeFallback: limitMph == null }
        );
        if (limitMph != null) {
            state.currentLimitMph = limitMph;
            currentSpeedLimitMph = limitMph;
        }
        updateSpeedWidget(currentGpsSpeedMph, displayLimit);
    };

    const url = SL.buildSpeedLimitApiUrl(lat, lon, roadType, valhallaSpeedLimit, headingDeg);
    fetch(url)
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((data) => {
            acceptIfFresh(() => {
                const parsed = SL.parseSpeedLimitApiResponse(data, roadType, currentSpeedMph, SG);
                if (parsed.roadType) lastDetectedRoadType = parsed.roadType;
                if (parsed.region) lastSpeedLimitRegion = parsed.region;
                if (parsed.limitMph != null) {
                    void cacheSpeedLimit(lat, lon, parsed.limitMph, parsed.source || 'api');
                }
                applyLimit(parsed.limitMph, parsed.roadType, parsed.region);
            });
        })
        .catch(async () => {
            let fallbackLimit = null;
            if (_voyagrIsOffline || !navigator.onLine) {
                try {
                    const cached = await getCachedSpeedLimit(lat, lon);
                    fallbackLimit = SL.readCachedLimitMph(cached, now);
                } catch (_) { /* ignore */ }
            }
            if (fallbackLimit == null && Number.isFinite(valhallaSpeedLimit) && valhallaSpeedLimit > 0) {
                fallbackLimit = valhallaSpeedLimit;
            }
            if (fallbackLimit == null) {
                const rt = lastDetectedRoadType || (roadType !== 'unknown' ? roadType : null);
                if (rt) {
                    fallbackLimit = SL.inferRoadTypeDefaultLimitMph(rt, lastSpeedLimitRegion);
                }
            }
            if (fallbackLimit != null) {
                acceptIfFresh(() => applyLimit(fallbackLimit, roadType, lastSpeedLimitRegion));
            }
        })
        .finally(() => {
            state.inFlight = false;
        });
}

/**
 * Sync the settings toggle and map widget visibility with speedWidgetEnabled.
 */
function applySpeedWidgetToggleUi() {
    const toggle = document.getElementById('speedWidgetToggle');
    VoyagrModules.toggleUI().applyLabeledToggleButton(toggle, speedWidgetEnabled);
    _lastSpeedWidgetVisible = null;
    updateSpeedWidgetVisibility();
}

/**
 * toggleSpeedWidget function
 * @function toggleSpeedWidget
 * @returns {*} Return value description
 */
function toggleSpeedWidget() {
    speedWidgetEnabled = !speedWidgetEnabled;
    localStorage.setItem('speedWidgetEnabled', speedWidgetEnabled ? 'true' : 'false');
    applySpeedWidgetToggleUi();
    saveAllSettings();
}

/**
 * toggleZoomAndFollow function
 * @function toggleZoomAndFollow
 * @returns {*} Return value description
 */
function toggleZoomAndFollow() {
    zoomAndFollowEnabled = !zoomAndFollowEnabled;
    applyZoomFollowButtonUi(document.getElementById('zoomFollowToggle'), zoomAndFollowEnabled);
    localStorage.setItem('zoomAndFollowEnabled', zoomAndFollowEnabled ? 'true' : 'false');

    if (zoomAndFollowEnabled) {
        mapFollowingActive = true;
        showStatus('📍 Zoom & Follow enabled - map will follow your vehicle', 'success');
        console.log('[Zoom & Follow] Enabled');

        // Immediately center on current position if available
        if (currentLat && currentLon && map) {
            map.flyTo({
                center: [currentLon, currentLat],
                zoom: 17,
                duration: 500
            });
        }
    } else {
        mapFollowingActive = false;
        showStatus('📍 Zoom & Follow disabled - map is free to pan', 'info');
        console.log('[Zoom & Follow] Disabled');
    }
    updateRecenterButtonVisibility();
}

const RECENTER_MIN_DISTANCE_M = 70;

/** Lat/lon for the vehicle icon (snapped to route during navigation). */
function getVehicleDisplayCoordinates() {
    let lat = currentLat;
    let lon = currentLon;
    if (
        routeInProgress &&
        routePolyline &&
        routePolyline.length >= 2 &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
    ) {
        const snapped = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);
        lat = snapped.lat;
        lon = snapped.lon;
    }
    return { lat, lon };
}

function metersMapCenterFromVehicle() {
    if (!map || currentLat == null || currentLon == null) return 0;
    const center = map.getCenter();
    const vehicle = getVehicleDisplayCoordinates();
    return calculateDistanceMeters(vehicle.lat, vehicle.lon, center.lat, center.lng);
}

function shouldShowRecenterVehicleButton() {
    if (!map || currentLat == null || currentLon == null) return false;
    if (!routeInProgress && !isTrackingActive) return false;
    if (journeyOverviewActive) return true;
    if (routeInProgress && zoomAndFollowEnabled && !mapFollowingActive) return true;
    return metersMapCenterFromVehicle() >= RECENTER_MIN_DISTANCE_M;
}

function updateRecenterButtonVisibility() {
    const btn = document.getElementById('recenterVehicleFab');
    if (!btn) return;
    btn.style.display = shouldShowRecenterVehicleButton() ? 'flex' : 'none';
}

/**
 * Waze-style recenter: return to the vehicle icon and resume follow during navigation.
 */
function recenterOnVehicle() {
    if (!map || currentLat == null || currentLon == null) {
        showStatus('Waiting for GPS position…', 'info');
        return;
    }

    if (journeyOverviewActive) {
        journeyOverviewActive = false;
        const journeyBtn = document.getElementById('journeyOverviewBtn');
        applyJourneyOverviewButtonUi(journeyBtn, false);
        savedMapState = null;
    }

    const { lat, lon } = getVehicleDisplayCoordinates();

    if (routeInProgress) {
        mapFollowingActive = true;
        const speedMps = currentUserMarker && Number.isFinite(currentUserMarker.speed)
            ? currentUserMarker.speed
            : 0;
        const speedMph = speedMps * 2.23694;
        const smartZoom = calculateSmartZoom(speedMph, null, 'motorway');
        const pitch = shouldTiltDrivingCamera() ? 60 : 0;
        const bearing = shouldUsePitchedDrivingCamera()
            ? ((currentUserMarker && Number.isFinite(currentUserMarker.heading)) ? currentUserMarker.heading : map.getBearing())
            : 0;

        window.__voyagrLastFollowCenterGeo = { lat, lon };
        window.__voyagrLastFollowEaseAt = Date.now();
        map.easeTo({
            center: [lon, lat],
            zoom: smartZoom,
            bearing,
            pitch,
            padding: getNavigationFollowPadding(),
            duration: 600,
            essential: true,
        });
        showStatus('📍 Recentered on vehicle', 'success');
    } else {
        mapFollowingActive = true;
        map.easeTo({
            center: [lon, lat],
            zoom: Math.max(map.getZoom(), 16),
            duration: 500,
            essential: true,
        });
        showStatus('📍 Recentered on your location', 'success');
    }

    updateRecenterButtonVisibility();
}

// Journey Overview state
let journeyOverviewActive = false;
let savedMapState = null;

/**
 * Toggle journey overview mode during navigation
 * Shows entire route zoomed out, then returns to following view
 */
function toggleJourneyOverview() {
    if (!routeInProgress || !routePolyline || routePolyline.length === 0) {
        showStatus('No active navigation to show overview', 'error');
        return;
    }

    const btn = document.getElementById('journeyOverviewBtn');

    if (!journeyOverviewActive) {
        // Save current map state
        savedMapState = {
            center: map.getCenter(),
            zoom: map.getZoom()
        };

        // Temporarily disable zoom and follow
        mapFollowingActive = false;

        // Fit map to show entire route using MapLibre helpers
        if (allRouteLayers.length > 0 && routeOptions && routeOptions[0] && routeOptions[0].polyline) {
            const allCoords = routeOptions.flatMap(r => r.polyline || []);
            if (allCoords.length > 0) {
                MapLibreHelpers.fitMapBounds(map, allCoords, { padding: 50 });
            }
        } else if (routePolyline.length > 0) {
            MapLibreHelpers.fitMapBounds(map, routePolyline, { padding: 50 });
        }

        journeyOverviewActive = true;
        applyJourneyOverviewButtonUi(btn, true);
        showStatus('🗺️ Journey Overview - Tap again to return', 'info');
        console.log('[Navigation] Journey overview activated');
        updateRecenterButtonVisibility();
    } else {
        // Return to navigation view
        journeyOverviewActive = false;

        // Re-enable zoom and follow if it was enabled
        if (zoomAndFollowEnabled) {
            mapFollowingActive = true;
        }

        // Return to navigation view
        if (savedMapState) {
            map.flyTo({
                center: [savedMapState.center.lng, savedMapState.center.lat],
                zoom: savedMapState.zoom,
                pitch: 55, // Restore 3D view
                duration: 1000,
                essential: true
            });
            savedMapState = null;
        }

        applyJourneyOverviewButtonUi(btn, false);
        showStatus('📍 Returned to navigation view', 'success');
        console.log('[Navigation] Journey overview deactivated');
        updateRecenterButtonVisibility();
    }
}

// ===== DISTANCE CALCULATION & TURN DETECTION =====
/**
 * calculateHaversineDistance function
 * @function calculateHaversineDistance
 * @param {*} lat1 - Parameter description
 * @param {*} lon1 - Parameter description
 * @param {*} lat2 - Parameter description
 * @param {*} lon2 - Parameter description
 * @returns {*} Return value description
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    return VoyagrModules.routeGeometry().haversineDistanceMeters(lat1, lon1, lat2, lon2);
}
/**
 * calculateBearing function
 * @function calculateBearing
 * @param {*} lat1 - Parameter description
 * @param {*} lon1 - Parameter description
 * @param {*} lat2 - Parameter description
 * @param {*} lon2 - Parameter description
 * @returns {*} Return value description
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    return VoyagrModules.routeGeometry().bearing(lat1, lon1, lat2, lon2);
}
/**
 * calculateTurnDirection function
 * @function calculateTurnDirection
 * @param {*} bearing1 - Parameter description
 * @param {*} bearing2 - Parameter description
 * @returns {*} Return value description
 */
function calculateTurnDirection(bearing1, bearing2) {
    return VoyagrModules.turnInstructions().calculateTurnDirection(bearing1, bearing2);
}
/**
 * Distance along the polyline from a snapped point (snapped onto segment i0) to
 * a target vertex, forward along the line only.
 * @param {Array} routePolyline - [lat, lon] polyline
 * @param {Object} snap - Result of snapToRoutePolyline (index, t, …)
 * @param {number} targetVertexIndex - Maneuver begin_shape_index (clamped to polyline)
 * @returns {number} Meters, >= 0
 */
// distanceAlongRouteToVertexMeters: implementation lives in route-geometry.js
// (VoyagrRouteGeometry.distanceAlongRouteToVertexMeters). Thin stub keeps all callers working.
function distanceAlongRouteToVertexMeters(routePolyline, snap, targetVertexIndex) {
    return VoyagrModules.routeGeometry().distanceAlongRouteToVertexMeters(routePolyline, snap, targetVertexIndex);
}

/**
 * Map a Valhalla maneuver type to a turn-by-turn direction key, or null when it is not
 * an announceable maneuver (start / continue / straight / ramp-straight / stay-straight).
 * Shared by the advance "Then" maneuver (widget + voice). Kept in sync with the inline
 * mappings in detectUpcomingTurn / updateTurnWidgetFromPosition.
 */
function maneuverTypeToDirectionKey(type) {
    return VoyagrModules.turnInstructions().maneuverTypeToDirectionKey(type);
}

/** Promote ramp/turn to exit phrasing when leaving motorway/trunk. */
function refineManeuverDirectionForRoute(type, direction, maneuver) {
    const roadClass = maneuver && (maneuver.road_class || inferRoadClassFromManeuver(maneuver));
    return VoyagrModules.turnInstructions().refineManeuverDirection(type, direction, roadClass);
}

/** Widget instruction line — exit/keep/roundabout phrasing over raw engine text when clearer. */
function buildTurnDisplayInstruction(turnInfo) {
    if (!turnInfo) return 'Continue on current road';
    return VoyagrModules.turnInstructions().buildTurnDisplayInstruction(
        turnInfo.direction,
        turnInfo.instruction,
        turnInfo.valhallaType,
        turnInfo.roundabout_exit_count
    );
}

/** Cumulative along-route distance (m) between two polyline vertex indices. */
// cumulativeRouteDistanceBetween: pure version (explicit polyline arg) is in
// route-geometry.js as cumulativeDistanceBetweenVertices. This wrapper still reads
// the global routePolyline — it stays as orchestration glue.
function cumulativeRouteDistanceBetween(i, j) {
    return VoyagrModules.routeGeometry().cumulativeDistanceBetweenVertices(routePolyline, i, j);
}

/**
 * Find the first announceable maneuver AFTER the given step index, plus the along-route
 * gap (m) from that step to it. Used to surface the upcoming maneuver in advance.
 * @returns {{ direction, valhallaType, streetName, gapMeters, index, maneuver } | null}
 */
function getFollowingManeuver(currentIndex) {
    if (!currentRouteSteps || currentIndex == null || currentIndex < 0) return null;
    const current = currentRouteSteps[currentIndex];
    if (!current) return null;
    const currentShapeIdx = current.begin_shape_index || 0;
    for (let j = currentIndex + 1; j < currentRouteSteps.length; j++) {
        const m = currentRouteSteps[j];
        const type = m.type || 0;
        const baseDir = maneuverTypeToDirectionKey(type);
        if (!baseDir) continue;
        const dir = refineManeuverDirectionForRoute(type, baseDir, m);
        const gapMeters = cumulativeRouteDistanceBetween(currentShapeIdx, m.begin_shape_index || 0);
        const streetName = getManeuverStreetLabel(m, false);
        return { direction: dir, valhallaType: type, streetName, gapMeters, index: j, maneuver: m };
    }
    return null;
}

/** Valhalla stores roundabout exit count on enter and/or exit maneuver — merge for UI/lane hints. */
function effectiveRoundaboutExitCount(stepIndex) {
    const steps = currentRouteSteps;
    if (!steps || stepIndex == null || stepIndex < 0 || stepIndex >= steps.length) return 0;
    const s = steps[stepIndex];
    let n = Number(s.roundabout_exit_count) || 0;
    if (n > 0) return n;
    const mt = s.type || 0;
    if (mt === 26 && stepIndex + 1 < steps.length) {
        const next = steps[stepIndex + 1];
        if ((next.type || 0) === 27) return Number(next.roundabout_exit_count) || 0;
    }
    return 0;
}

// ordinalEnglishExit / laneOrdinalEnglish / buildTurnLaneHintHtml moved to
// modules/navigation/turn-instructions.js. Thin stubs keep all callers working.

function ordinalEnglishExit(n) {
    return VoyagrModules.turnInstructions().ordinalEnglishExit(n);
}

function laneOrdinalEnglish(n) {
    return VoyagrModules.turnInstructions().laneOrdinalEnglish(n);
}

// buildTurnLaneHintHtml: the module version takes an explicit exitCount instead of a
// maneuverIndex, so callers resolve the count and pass it. The stub signature keeps
// the original (maneuverIndex) for backward compatibility and resolves the count here.
function buildTurnLaneHintHtml(maneuver, maneuverIndex, distanceMeters) {
    const TI = VoyagrModules.turnInstructions();
    const exitCt = maneuverIndex != null
        ? effectiveRoundaboutExitCount(maneuverIndex)
        : (maneuver && maneuver.roundabout_exit_count) || 0;
    return TI.buildTurnLaneHintHtml(maneuver, exitCt, distanceMeters);
}

/**
 * detectUpcomingTurn function
 * @function detectUpcomingTurn
 * @param {*} userLat - Parameter description
 * @param {*} userLon - Parameter description
 * @returns {*} Return value description
 */
function detectUpcomingTurn(userLat, userLon) {
    if (!routeInProgress || !routePolyline || routePolyline.length === 0) {
        return null;
    }

    // Snap the GPS position onto the route, then "lock" progress forward. Using the
    // nearest *vertex* alone makes distances jump on tight curves/roundabouts when the
    // closest vertex toggles to an earlier one frame-to-frame (e.g. 1600m → 2000m).
    const turnSnap = snapToRoutePolyline(
        userLat, userLon, routePolyline, lastTurnDetectRouteVertexIndex
    );
    let userRouteIndex = turnSnap.index;
    if (userRouteIndex < lastTurnDetectRouteVertexIndex) {
        userRouteIndex = lastTurnDetectRouteVertexIndex;
    } else {
        lastTurnDetectRouteVertexIndex = userRouteIndex;
    }

    // If we have maneuvers from Valhalla, use them for accurate turn instructions
    if (currentRouteSteps && currentRouteSteps.length > 0) {
        // Find the next ACTUAL turn maneuver ahead of user's position
        for (let i = 0; i < currentRouteSteps.length; i++) {
            const maneuver = currentRouteSteps[i];
            const maneuverShapeIndex = maneuver.begin_shape_index || 0;

            // Skip maneuvers that are behind the user
            if (maneuverShapeIndex < userRouteIndex - 5) {
                continue;
            }

            // Map Valhalla maneuver types to direction keys (shared with voice + "Then" row).
            const type = maneuver.type || 0;
            let direction = maneuverTypeToDirectionKey(type);
            if (direction === null) continue;
            direction = refineManeuverDirectionForRoute(type, direction, maneuver);

            const targetIndex = Math.min(maneuverShapeIndex, routePolyline.length - 1);

            // True along-route distance from snapped position to maneuver vertex
            const distanceToManeuver = distanceAlongRouteToVertexMeters(
                routePolyline, turnSnap, targetIndex
            );

            // Extend detection range for exits (2.5km) and keep/fork (1.5km)
            const isExitDir = direction === 'exit' || direction === 'exit_right' || direction === 'exit_left';
            const isKeepDir = direction === 'slight_right' || direction === 'slight_left';
            const isRb = direction === 'roundabout';
            // Detection range gives the first announcement room to fire before the turn.
            // Turns bumped 600 -> 750 m so the 500 m call still has runway at motorway speed.
            const maxDetectionDistance = isExitDir ? 2500 : isKeepDir ? 1500 : isRb ? 900 : 750;

            // Only return turns within detection range
            if (distanceToManeuver <= maxDetectionDistance) {
                currentStepIndex = i;
                schedulePersistRoute();

                console.log(`[Turn] Detected: ${direction} in ${distanceToManeuver.toFixed(0)}m (type=${type}, step=${i}, shapeIdx=${maneuverShapeIndex})`);

                return {
                    distance: distanceToManeuver,
                    direction: direction,
                    streetName: getManeuverStreetLabel(maneuver, false),
                    instruction: maneuver.instruction || maneuver.verbal_pre_transition_instruction || '',
                    verbal_transition_alert_instruction: maneuver.verbal_transition_alert_instruction || '',
                    verbal_pre_transition_instruction: maneuver.verbal_pre_transition_instruction || '',
                    verbal_post_transition_instruction: maneuver.verbal_post_transition_instruction || '',
                    roundabout_exit_count: effectiveRoundaboutExitCount(i),
                    maneuver: maneuver,
                    maneuverIndex: i,
                    valhallaType: type,
                };
            }

            // Stop searching if this maneuver is too far ahead
            if (distanceToManeuver > maxDetectionDistance) break;
        }
    }

    // Geometry fallback only when the route has no maneuvers. If maneuvers exist but the
    // next one is far away (e.g. motorway exit in 19 mi), show "Continue" — not a false
    // "turn left" from polyline bearing noise.
    if (!currentRouteSteps || currentRouteSteps.length === 0) {
    // Fallback: Use geometry-based turn detection if no maneuvers available
    // Reuse the snapped, monotonically non-decreasing index from the top of the function
    const closestIndex = lastTurnDetectRouteVertexIndex;

    // Look ahead for significant direction changes (turns)
    let nextTurnIndex = null;
    let maxBearingChange = 0;

    // Get current bearing (from closest point to next point)
    let currentBearing = null;
    if (closestIndex < routePolyline.length - 1) {
        const currPoint = routePolyline[closestIndex];
        const nextPoint = routePolyline[closestIndex + 1];
        currentBearing = calculateBearing(currPoint[0], currPoint[1], nextPoint[0], nextPoint[1]);
    }

    // Scan ahead up to 50 points to find the next significant turn
    const scanDistance = Math.min(50, routePolyline.length - closestIndex - 1);
    for (let i = closestIndex + 2; i < closestIndex + scanDistance; i++) {
        if (i >= routePolyline.length) break;

        const prevPoint = routePolyline[i - 1];
        const currPoint = routePolyline[i];
        const bearing = calculateBearing(prevPoint[0], prevPoint[1], currPoint[0], currPoint[1]);

        if (currentBearing !== null) {
            let bearingChange = bearing - currentBearing;
            // Normalize to -180 to 180
            if (bearingChange > 180) bearingChange -= 360;
            if (bearingChange < -180) bearingChange += 360;

            // Look for significant direction changes (>10 degrees)
            if (Math.abs(bearingChange) > 10 && Math.abs(bearingChange) > maxBearingChange) {
                maxBearingChange = Math.abs(bearingChange);
                nextTurnIndex = i;
            }
        }
    }

    // If no significant turn found, use the next point ahead
    if (nextTurnIndex === null) {
        nextTurnIndex = Math.min(closestIndex + 5, routePolyline.length - 1);
    }

    if (nextTurnIndex === closestIndex || nextTurnIndex === closestIndex + 1) {
        return null; // No turn ahead
    }

    const nextTurnPoint = routePolyline[nextTurnIndex];
    const distanceToTurn = distanceAlongRouteToVertexMeters(
        routePolyline, turnSnap, nextTurnIndex
    );

    // Calculate turn direction using proper bearing calculation
    let turnDirection = 'straight';
    if (closestIndex > 0 && nextTurnIndex < routePolyline.length - 1) {
        const prevPoint = routePolyline[Math.max(0, closestIndex - 1)];
        const currPoint = routePolyline[closestIndex];
        const nextPoint = routePolyline[nextTurnIndex];

        const bearing1 = calculateBearing(prevPoint[0], prevPoint[1], currPoint[0], currPoint[1]);
        const bearing2 = calculateBearing(currPoint[0], currPoint[1], nextPoint[0], nextPoint[1]);

        turnDirection = calculateTurnDirection(bearing1, bearing2);
    }

    return {
        distance: distanceToTurn,
        lat: nextTurnPoint[0],
        lon: nextTurnPoint[1],
        index: nextTurnIndex,
        direction: turnDirection,
        streetName: ''
    };
    }

    return null;
}

// ===== VEHICLE TYPE & ROUTING MODE MANAGEMENT =====

/**
 * updateVehicleType function
 * @function updateVehicleType
 * @returns {*} Return value description
 */
function updateVehicleType() {
    const select = document.getElementById('vehicleType');
    currentVehicleType = select.value;
    localStorage.setItem('vehicleType', currentVehicleType);

    // Update user marker icon
    updateUserMarkerIcon();

    console.log('[Vehicle] Type changed to:', currentVehicleType);
    saveAllSettings();
    showStatus(`🚗 Vehicle type: ${select.options[select.selectedIndex].text}`, 'info');
}
/**
 * setRoutingMode function
 * @function setRoutingMode
 * @param {*} mode - Parameter description
 * @returns {*} Return value description
 */
function setRoutingMode(mode) {
    currentRoutingMode = mode;
    localStorage.setItem('routingMode', mode);

    // Update button states
    document.getElementById('routingAuto').classList.toggle('active', mode === 'auto');
    document.getElementById('routingPedestrian').classList.toggle('active', mode === 'pedestrian');
    document.getElementById('routingBicycle').classList.toggle('active', mode === 'bicycle');

    // Update vehicle type selector visibility
    if (mode === 'pedestrian') {
        document.getElementById('vehicleType').style.display = 'none';
        currentVehicleType = 'pedestrian';
    } else if (mode === 'bicycle') {
        document.getElementById('vehicleType').style.display = 'none';
        currentVehicleType = 'bicycle';
    } else {
        document.getElementById('vehicleType').style.display = 'block';
        currentVehicleType = document.getElementById('vehicleType').value;
    }

    // Update user marker icon
    updateUserMarkerIcon();

    console.log('[Routing] Mode changed to:', mode);
    const modeNames = { 'auto': '🚗 Auto', 'pedestrian': '🚶 Pedestrian', 'bicycle': '🚴 Bicycle' };
    saveAllSettings();
    showStatus(`${modeNames[mode]} mode`, 'info');
}

/**
 * updateUserMarkerIcon function
 * @function updateUserMarkerIcon
 * @returns {*} Return value description
 */
function updateUserMarkerIcon() {
    // Determine which icon to use
    let iconPath = vehicleIcons[currentRoutingMode] || vehicleIcons[currentVehicleType] || vehicleIcons['petrol_diesel'];

    // Update the marker if it exists
    if (currentUserMarker) {
        if (typeof currentUserMarker.remove === 'function') currentUserMarker.remove();
        currentUserMarker = null;
    }

    currentUserMarkerIcon = iconPath;
    console.log('[Marker] Icon updated to:', iconPath);
}

/**
 * createVehicleMarker function
 * @function createVehicleMarker
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} speed - Parameter description
 * @param {*} accuracy - Parameter description
 * @param {*} heading - Parameter description (optional, in degrees 0-360)
 * @returns {*} Return value description
 */
function createVehicleMarker(lat, lon, speed, accuracy, heading = 0) {
    const iconEmoji = vehicleIconEmojis[currentRoutingMode] || vehicleIconEmojis[currentVehicleType] || '🚗';
    const safeHeading = Number.isFinite(heading) ? heading : 0;
    const safeAccuracy = Number.isFinite(accuracy) ? accuracy : null;
    const accuracyLabel = safeAccuracy != null ? `±${safeAccuracy.toFixed(0)}m` : '—';

    // Create a div element for the marker with an inline SVG arrowhead.
    // Larger size for better visibility in 3D aerial view
    const markerDiv = document.createElement('div');
    markerDiv.style.width = '60px';
    markerDiv.style.height = '60px';
    markerDiv.style.display = 'flex';
    markerDiv.style.alignItems = 'center';
    markerDiv.style.justifyContent = 'center';
    markerDiv.style.position = 'relative';

    const mapBr = map && typeof map.getBearing === 'function' ? map.getBearing() : 0;
    const rot = ((safeHeading - mapBr) % 360 + 360) % 360;
    markerDiv.style.transform = `rotate(${rot}deg)`;
    markerDiv.style.transition = 'transform 0.3s ease-out';

    // 3D effect: Add layered shadows for depth perception
    markerDiv.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))';

    // Enable 3D transforms
    markerDiv.style.transformStyle = 'preserve-3d';

    // Inline directional arrowhead (Starfleet-delta style). Drawn pointing "up" (north / 0°);
    // the heading rotation applied to markerDiv turns it to face the direction of travel.
    // It is a self-contained SVG (no external file fetch that can fail / 404, which is why the
    // old <img>-based icon could vanish) and carries NO text/numbers/symbols, so it can never
    // be mistaken for a regulatory road sign.
    markerDiv.innerHTML = _vehicleMarker().buildVehicleArrowSvg();

    // Create custom marker with MapLibre
    const speedKmh = Number.isFinite(speed) ? (speed * 3.6).toFixed(1) : '0.0';
    const speedUnit = getSpeedUnit();
    const displaySpeed = convertSpeed(speedKmh);

    const marker = MapLibreHelpers.createMarker(lat, lon, {
        html: markerDiv.outerHTML,
        iconSize: [60, 60],
        iconAnchor: [30, 30],
        className: 'vehicle-marker-icon',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
        popup: _vehicleMarker().buildVehicleMarkerPopupHtml({
            iconEmoji,
            displaySpeed,
            speedUnit,
            headingDegrees: Math.round(safeHeading),
            accuracyLabel,
        })
    });

    // Store heading and speed for later updates
    marker.heading = safeHeading;
    marker.speed = Number.isFinite(speed) ? speed : 0;
    marker.accuracy = safeAccuracy;

    return marker;
}

// ===== SMART ZOOM FUNCTIONALITY =====
/**
 * calculateSmartZoom function
 * @function calculateSmartZoom
 * @param {*} speedMph - Parameter description
 * @param {*} distanceToNextTurn - Parameter description
 * @param {*} roadType - Parameter description
 * @returns {*} Return value description
 */
// calculateSmartZoom moved to modules/navigation/route-geometry.js (VoyagrRouteGeometry).
// Stub passes the global constants so live behaviour is unchanged.
function calculateSmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
    return VoyagrModules.routeGeometry().calculateSmartZoom(
        speedMph, distanceToNextTurn, roadType, ZOOM_LEVELS, TURN_ZOOM_THRESHOLD
    );
}

/**
 * Calculate offset center point for driver's view perspective
 * Moves the vehicle to the bottom third of the screen with more road ahead visible
 * @param {number} lat - Current latitude
 * @param {number} lon - Current longitude
 * @param {number} heading - Current heading in degrees (0 = North, 90 = East)
 * @param {number} zoomLevel - Current zoom level
 * @returns {Array} [offsetLat, offsetLon] - Offset center coordinates
 */
// calculateDriverViewCenter moved to route-geometry.js (pure stub — MapLibre padding handles offset).
function calculateDriverViewCenter(lat, lon, heading, zoomLevel) {
    return VoyagrModules.routeGeometry().calculateDriverViewCenter(lat, lon, heading, zoomLevel);
}
/**
 * applySmartZoomWithAnimation function
 * @function applySmartZoomWithAnimation
 * @param {*} speedMph - Parameter description
 * @param {*} distanceToNextTurn - Parameter description
 * @param {*} roadType - Parameter description
 * @param {*} userLat - Parameter description
 * @param {*} userLon - Parameter description
 * @returns {*} Return value description
 */
function applySmartZoomWithAnimation(speedMph, distanceToNextTurn = null, roadType = 'urban', userLat = null, userLon = null) {
    if (!smartZoomEnabled || !routeInProgress) return;

    const newZoomLevel = calculateSmartZoom(speedMph, distanceToNextTurn, roadType);

    // Only update if zoom level changed significantly
    if (Math.abs(newZoomLevel - lastZoomLevel) >= 1) {
        // Use easeTo (not flyTo) and preserve pitch/bearing/padding — flyTo omitted pitch and reset
        // the camera to a top-down view, overriding driver's perspective during navigation.
        if (userLat !== null && userLon !== null && map) {
            const navFollow = zoomAndFollowEnabled && mapFollowingActive;
            let pitch = map.getPitch();
            let bearing = map.getBearing();
            let padding = undefined;
            if (navFollow) {
                padding = getNavigationFollowPadding();
                if (shouldUsePitchedDrivingCamera()) {
                    // Heading-up; flat (0°) when the user picked 2D map view, else tilted (60°).
                    pitch = shouldTiltDrivingCamera() ? 60 : 0;
                    bearing = (currentUserMarker && typeof currentUserMarker.heading === 'number')
                        ? currentUserMarker.heading
                        : map.getBearing();
                } else {
                    pitch = 0;
                    bearing = 0;
                }
            }
            map.easeTo({
                center: [userLon, userLat],
                zoom: newZoomLevel,
                pitch,
                bearing,
                ...(padding ? { padding } : {}),
                duration: ZOOM_ANIMATION_DURATION * 1000,
                essential: true
            });
        } else if (map) {
            map.setZoom(newZoomLevel);
        }

        lastZoomLevel = newZoomLevel;

        // Log zoom reason
        if (distanceToNextTurn !== null && distanceToNextTurn < TURN_ZOOM_THRESHOLD) {
            console.log('[SmartZoom] Turn-based zoom to level', newZoomLevel, '- Turn in', distanceToNextTurn.toFixed(0), 'm');
            lastTurnZoomApplied = true;
        } else {
            console.log('[SmartZoom] Speed-based zoom to level', newZoomLevel, 'for speed', speedMph.toFixed(1), 'mph');
            lastTurnZoomApplied = false;
        }
    }
}

// Legacy function for backward compatibility
/**
 * applySmartZoom function
 * @function applySmartZoom
 * @param {*} speedMph - Parameter description
 * @param {*} distanceToNextTurn - Parameter description
 * @param {*} roadType - Parameter description
 * @returns {*} Return value description
 */
function applySmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
    applySmartZoomWithAnimation(speedMph, distanceToNextTurn, roadType, currentLat, currentLon);
}

/**
 * toggleSmartZoom function
 * @function toggleSmartZoom
 * @returns {*} Return value description
 */
function toggleSmartZoom() {
    smartZoomEnabled = !smartZoomEnabled;
    const btn = document.getElementById('smartZoomToggle');
    VoyagrModules.toggleUI().applyToggleButton(btn, smartZoomEnabled);
    localStorage.setItem('smartZoomEnabled', smartZoomEnabled ? '1' : '0');
    saveAllSettings();
    showStatus(`🔍 Smart Zoom ${smartZoomEnabled ? 'enabled' : 'disabled'}`, 'info');
    console.log('[SmartZoom] Toggled to:', smartZoomEnabled);
}

// Initialize Phase 2 features on page load
window.addEventListener('load', () => {
    loadFavorites();
    initPhase3Features();
});

// ===== PHASE 3 FEATURES: GESTURE CONTROL =====

let lastAcceleration = { x: 0, y: 0, z: 0 };
let shakeCount = 0;
let lastShakeTime = 0;
let gestureEnabled = true;
let gestureSensitivity = 'medium';
let gestureAction = 'recalculate';

/**
 * initPhase3Features function
 * @function initPhase3Features
 * @returns {*} Return value description
 */
function initPhase3Features() {
    if (window.__voyagrPhase3Initialized) {
        return;
    }
    window.__voyagrPhase3Initialized = true;

    // Load gesture settings
    fetch('/api/app-settings')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                gestureEnabled = data.settings.gesture_enabled;
                gestureSensitivity = data.settings.gesture_sensitivity;
                gestureAction = data.settings.gesture_action;

                // Update UI
                document.getElementById('gestureEnabled').checked = gestureEnabled;
                document.getElementById('gestureSensitivity').value = gestureSensitivity;
                document.getElementById('gestureAction').value = gestureAction;
                document.getElementById('gestureSettings').style.display = gestureEnabled ? 'block' : 'none';

                // Initialize gesture detection
                if (gestureEnabled && 'DeviceMotionEvent' in window) {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                }
            }
        })
        .catch(error => console.error('Error loading app settings:', error));

    // Initialize battery monitoring
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            updateBatteryStatus(battery);
            battery.addEventListener('levelchange', () => updateBatteryStatus(battery));
            battery.addEventListener('chargingchange', () => updateBatteryStatus(battery));
        });
    }

    // Load ML predictions
    // Load ML predictions
    loadMLPredictions();

    // Load AR setting
    isAREnabled = localStorage.getItem('voyagr_ar_enabled') === 'true';
    const arToggleBtn = document.getElementById('arToggleBtn');
    if (arToggleBtn && isAREnabled) {
        arToggleBtn.classList.add('active');
    }
}
/**
 * handleDeviceMotion function
 * @function handleDeviceMotion
 * @param {*} event - Parameter description
 * @returns {*} Return value description
 */
function handleDeviceMotion(event) {
    if (!gestureEnabled) return;

    const accel = event.acceleration;
    if (!accel) return;

    // Calculate acceleration magnitude
    const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);

    // Sensitivity thresholds
    const thresholds = {
        'low': 20,
        'medium': 15,
        'high': 10
    };
    const threshold = thresholds[gestureSensitivity] || 15;

    // Detect shake
    if (magnitude > threshold) {
        const now = Date.now();
        if (now - lastShakeTime < 1000) {
            shakeCount++;
            if (shakeCount >= 2) {
                triggerGestureAction();
                shakeCount = 0;
            }
        } else {
            shakeCount = 1;
        }
        lastShakeTime = now;
    }
}

/**
 * triggerGestureAction function
 * @function triggerGestureAction
 * @returns {*} Return value description
 */
function triggerGestureAction() {
    // Show gesture indicator
    const indicator = document.getElementById('gestureIndicator');
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 500);

    // Trigger haptic feedback if available
    if ('vibrate' in navigator) {
        navigator.vibrate(100);
    }

    // Log gesture event
    fetch('/api/gesture-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_type: 'shake', action: gestureAction })
    }).catch(error => console.error('Error logging gesture:', error));

    // Execute action
    switch (gestureAction) {
        case 'recalculate':
            showStatus('🔄 Recalculating route...', 'info');
            calculateRoute();
            break;
        case 'report':
            showStatus('📍 Report hazard mode activated', 'info');
            // Would open hazard reporting UI
            break;
        case 'clear':
            showStatus('🗑️ Route cleared', 'info');
            clearForm();
            break;
    }
}

/**
 * toggleGestureControl function
 * @function toggleGestureControl
 * @returns {*} Return value description
 */
function toggleGestureControl() {
    gestureEnabled = !gestureEnabled;

    // Update UI
    const button = document.getElementById('gestureEnabled');
    VoyagrModules.toggleUI().applyToggleButton(button, gestureEnabled);

    document.getElementById('gestureSettings').style.display = gestureEnabled ? 'block' : 'none';

    // Save to localStorage
    localStorage.setItem('gestureEnabled', gestureEnabled);

    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_enabled: gestureEnabled })
    }).catch(error => console.error('Error updating gesture setting:', error));

    if (gestureEnabled && 'DeviceMotionEvent' in window) {
        window.addEventListener('devicemotion', handleDeviceMotion);
        showStatus('✅ Gesture control enabled', 'success');
    } else {
        window.removeEventListener('devicemotion', handleDeviceMotion);
        showStatus('❌ Gesture control disabled', 'info');
    }
}

/**
 * updateGestureSensitivity function
 * @function updateGestureSensitivity
 * @returns {*} Return value description
 */
function updateGestureSensitivity() {
    gestureSensitivity = document.getElementById('gestureSensitivity').value;
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_sensitivity: gestureSensitivity })
    }).catch(error => console.error('Error updating gesture sensitivity:', error));
}

/**
 * updateGestureAction function
 * @function updateGestureAction
 * @returns {*} Return value description
 */
function updateGestureAction() {
    gestureAction = document.getElementById('gestureAction').value;
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_action: gestureAction })
    }).catch(error => console.error('Error updating gesture action:', error));
}

// ===== PHASE 3 FEATURES: BATTERY SAVING MODE =====

let batterySavingMode = false;
let originalGPSFrequency = 1000; // ms
/**
 * updateBatteryStatus function
 * @function updateBatteryStatus
 * @param {*} battery - Parameter description
 * @returns {*} Return value description
 */
function updateBatteryStatus(battery) {
    const level = Math.round(battery.level * 100);

    // Update battery level for adaptive refresh intervals (no visible widget)
    currentBatteryLevel = battery.level;

    // Auto-enable battery saving if low
    if (level < 15 && !batterySavingMode) {
        enableBatterySavingMode();
    }
}

/**
 * toggleBatterySavingMode function
 * @function toggleBatterySavingMode
 * @returns {*} Return value description
 */
function toggleBatterySavingMode() {
    batterySavingMode = !batterySavingMode;
    if (batterySavingMode) {
        enableBatterySavingMode();
    } else {
        disableBatterySavingMode();
    }
}

/**
 * enableBatterySavingMode function
 * @function enableBatterySavingMode
 * @returns {*} Return value description
 */
function enableBatterySavingMode() {
    batterySavingMode = true;
    VoyagrModules.toggleUI().applyToggleButton(document.getElementById('batterySavingMode'), true);

    // NOTE: We intentionally do NOT re-create the GPS watcher here. The previous code cleared
    // the active navigation watcher (gpsWatchId) and replaced it with an EMPTY callback, which
    // silently froze all position/speed/turn updates — the vehicle marker stopped moving and
    // the speed widget stuck at 0 — whenever battery saving toggled (including the automatic
    // toggle below 15% battery). Battery is still saved via the reduced animations below; the
    // real navigation watcher keeps running so the app does not break.

    // Disable animations
    document.body.style.animation = 'none';
    document.querySelectorAll('[style*="animation"]').forEach(el => {
        el.style.animation = 'none';
    });

    showStatus('🔋 Battery saving mode enabled', 'success');
    localStorage.setItem('pref_batterySaving', 'true');
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battery_saving_mode: 1 })
    }).catch(error => console.error('Error updating battery mode:', error));
}

/**
 * disableBatterySavingMode function
 * @function disableBatterySavingMode
 * @returns {*} Return value description
 */
function disableBatterySavingMode() {
    batterySavingMode = false;
    VoyagrModules.toggleUI().applyToggleButton(document.getElementById('batterySavingMode'), false);

    // NOTE: As in enableBatterySavingMode, we no longer tear down and re-create the navigation
    // GPS watcher here. The old empty-callback replacement broke live tracking; the active
    // high-accuracy watcher created by the navigation flow stays in place.

    // Re-enable animations
    document.body.style.animation = '';

    showStatus('🔋 Battery saving mode disabled', 'info');
    localStorage.setItem('pref_batterySaving', 'false');
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battery_saving_mode: 0 })
    }).catch(error => console.error('Error updating battery mode:', error));
}

// ===== PHASE 3 FEATURES: MAP THEMES =====

let currentMapTheme =
    typeof localStorage !== 'undefined' ? localStorage.getItem('mapTheme') || 'standard' : 'standard';
/**
 * setMapTheme function
 * @function setMapTheme
 * @param {string|Event} themeOrEvent - Theme name or event object
 * @returns {void}
 */
function setMapTheme(themeOrEvent) {
    // Handle both string theme and event object
    let theme = typeof themeOrEvent === 'string' ? themeOrEvent : (themeOrEvent?.target?.dataset?.theme || 'standard');

    localStorage.setItem('mapTheme', theme);

    // Update UI (map theme row only — not UI light/dark/auto)
    const mapThemeRow = document.getElementById('mapThemeSelector');
    if (mapThemeRow) {
        mapThemeRow.querySelectorAll('.theme-option').forEach((btn) => {
            btn.classList.remove('active');
        });
    }

    // Highlight the active map theme button
    const activeBtn = document.querySelector(`#mapThemeSelector [data-theme="${theme}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    if (!map) {
        console.warn('[setMapTheme] Map not initialized yet, skipping style change');
        currentMapTheme = theme;
        return;
    }

    // Skip the style reload if we're setting the same theme that's already active
    // (e.g. during loadAllSettings on first load — the style was just initialized).
    if (theme === currentMapTheme) {
        console.log('[setMapTheme] Theme already active, skipping redundant style reload');
        return;
    }

    currentMapTheme = theme;

    // MapLibre style switching — vector themes via /map/; satellite via static raster (Esri imagery)
    const toAbs = window.__voyagrToAbsoluteOriginUrl || ((u) => u);
    const satelliteRasterUrl = toAbs('/static/map/styles/satellite/style.json');
    const styleUrls = {
        'standard': '/map/styles/liberty/style.json',
        'satellite': satelliteRasterUrl,
        'dark': '/map/styles/positron/style.json'
    };

    // If core detected missing glyphs/labels and applied OSM raster fallback, use it for vector themes.
    // Keep satellite as aerial imagery (also raster, works in PWA workers with absolute URLs).
    if (window.__voyagrPreferredFallbackStyleUrl) {
        styleUrls['standard'] = window.__voyagrPreferredFallbackStyleUrl;
        styleUrls['dark'] = window.__voyagrPreferredFallbackStyleUrl;
        styleUrls['satellite'] = satelliteRasterUrl;
    }

    // *** PWA / Web Worker fix (same approach as voyagr-core.js initializeMap) ***
    // Resolve all internal URLs to absolute so the worker never sees relative URLs.
    const resolveUrls = window.__voyagrResolveStyleUrls || ((s) => s);

    const chosenUrl = styleUrls[theme] || styleUrls['standard'];

    // Try to fetch and resolve the style synchronously (small JSON, fast).
    let resolvedStyle = null;
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', toAbs(chosenUrl), false); // synchronous
        xhr.send();
        if (xhr.status === 200) {
            resolvedStyle = JSON.parse(xhr.responseText);
            resolveUrls(resolvedStyle);
        }
    } catch (e) {
        console.warn('[setMapTheme] Sync style fetch failed, using URL with transformRequest:', e.message);
    }

    // Change map style
    map.setStyle(resolvedStyle || toAbs(chosenUrl));

    // Re-add 3D buildings and road labels after style change (style resets layers)
    map.once('style.load', () => {
        if (typeof buildings3DEnabled !== 'undefined' && buildings3DEnabled) {
            MapLibreHelpers.add3DBuildings(map, {
                heightMultiplier: buildings3DHeightMultiplier,
                opacity: buildings3DOpacity
            });
        }
        // Re-initialize road labels after theme change
        if (typeof initializeRoadLabels === 'function') {
            initializeRoadLabels();
        }
    });

    showStatus(`🗺️ Map theme changed to ${theme}`, 'success');
    saveAllSettings();

    // Save preference
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_theme: theme })
    }).catch(error => console.error('Error updating map theme:', error));
}

// ===== PHASE 3 FEATURES: ML PREDICTIONS =====

/**
 * loadMLPredictions function
 * @function loadMLPredictions
 * @returns {*} Return value description
 */
function loadMLPredictions() {
    fetch('/api/ml-predictions')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.predictions.length > 0) {
                const section = document.getElementById('mlPredictionsSection');
                const list = document.getElementById('mlPredictionsList');
                list.innerHTML = '';

                data.predictions.forEach(pred => {
                    const item = document.createElement('div');
                    item.className = 'ml-prediction-item';
                    item.innerHTML = _mlPredictions().buildMlPredictionItemHtml(pred);
                    item.onclick = () => {
                        document.getElementById('start').value = pred.start_address;
                        document.getElementById('end').value = pred.end_address;
                        calculateRoute();
                    };
                    list.appendChild(item);
                });

                section.classList.add('show');
            }
        })
        .catch(error => console.error('Error loading ML predictions:', error));
}

/**
 * toggleMLPredictions function
 * @function toggleMLPredictions
 * @returns {*} Return value description
 */
function toggleMLPredictions() {
    const button = document.getElementById('mlPredictionsEnabled');

    // Toggle the active class (like other toggle switches)
    button.classList.toggle('active');
    const enabled = button.classList.contains('active');

    VoyagrModules.toggleUI().applyLabeledToggleButton(button, enabled);

    // Save to localStorage
    localStorage.setItem('mlPredictionsEnabled', enabled ? 'true' : 'false');

    // Send to backend
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ml_predictions_enabled: enabled ? 1 : 0 })
    }).catch(error => console.error('Error updating ML predictions:', error));

    if (enabled) {
        loadMLPredictions();
        showStatus('🤖 Smart predictions enabled', 'success');
    } else {
        document.getElementById('mlPredictionsSection').classList.remove('show');
        showStatus('🤖 Smart predictions disabled', 'info');
    }

    // Save all settings
    saveAllSettings();
}

// Warm Picovoice vendor bundles after idle load (optional offline wake).
function warmPicovoiceStaticCache() {
    void (async function warm() {
        try {
            if (!('serviceWorker' in navigator)) return;
            if (!navigator.onLine) return;
            const ctrl = navigator.serviceWorker.controller;
            if (!ctrl) return;
            const probeUrls = [
                '/static/vendor/picovoice/porcupine-web.iife.js',
                '/static/vendor/picovoice/web-voice-processor.iife.js',
            ];
            for (const u of probeUrls) {
                const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
                if (!r || !r.ok) {
                    return;
                }
            }
            ctrl.postMessage({
                type: 'WARM_STATIC_URLS',
                urls: [
                    '/static/vendor/picovoice/porcupine-web.iife.js',
                    '/static/vendor/picovoice/web-voice-processor.iife.js',
                    '/static/vendor/picovoice/porcupine_params.pv',
                    '/static/vendor/picovoice/hey_satnav_wasm.ppn',
                ],
            });
        } catch (_e) {
            /* ignore */
        }
    }());
}

/** Hide map-stack FABs while the bottom sheet is fully expanded (peek mode keeps them visible). */
function syncBottomSheetOverlapFabs() {
    const bottomSheet = document.getElementById('bottomSheet');
    const sheetExpanded = !!(bottomSheet && bottomSheet.classList.contains('expanded'));

    const alwaysHideWhenExpandedIds = ['roadReportFab', 'startTrackingBtn', 'voiceFab', 'currentLocationFab', 'mapControlsHintFab', 'recenterVehicleFab'];
    for (let i = 0; i < alwaysHideWhenExpandedIds.length; i++) {
        const el = document.getElementById(alwaysHideWhenExpandedIds[i]);
        if (!el) continue;
        if (sheetExpanded) {
            el.style.display = 'none';
        } else {
            el.style.removeProperty('display');
        }
    }

    const zoomBtn = document.getElementById('zoomFollowToggle');
    const journeyBtn = document.getElementById('journeyOverviewBtn');
    const endNavBtn = document.getElementById('endNavigationBtn');
    if (sheetExpanded && routeInProgress) {
        if (zoomBtn) zoomBtn.style.display = 'none';
        if (journeyBtn) journeyBtn.style.display = 'none';
        // Keep End navigation visible even when the sheet is expanded — it is the
        // primary way to stop guidance and must stay reachable on mobile.
        if (endNavBtn) endNavBtn.style.display = 'block';
    } else if (routeInProgress) {
        if (zoomBtn) zoomBtn.style.display = 'block';
        if (journeyBtn) journeyBtn.style.display = 'block';
        if (endNavBtn) endNavBtn.style.display = 'block';
    } else {
        if (zoomBtn) zoomBtn.style.display = 'none';
        if (journeyBtn) journeyBtn.style.display = 'none';
        if (endNavBtn) endNavBtn.style.display = 'none';
    }
}

/** Road-report FAB: always available unless the bottom sheet is covering map controls. */
function updateRoadReportFabVisibility() {
    syncBottomSheetOverlapFabs();
}

/**
 * True for phones/tablets and other touch-first UIs (no reliable hover tooltips).
 */
function voyagrTouchHintsEnabled() {
    try {
        if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
        if ('ontouchstart' in window) return true;
        if (window.matchMedia) {
            if (window.matchMedia('(hover: none)').matches) return true;
            if (window.matchMedia('(pointer: coarse)').matches) return true;
        }
    } catch (e) {
        /* ignore */
    }
    return false;
}

/**
 * Short banner at bottom of screen — easier to see on phones than top-right notifications.
 */
function voyagrShowMapIconHint(message) {
    if (!message) return;
    const el = document.getElementById('mapHintToast');
    if (!el) return;
    el.textContent = message;
    el.removeAttribute('hidden');
    el.classList.add('is-visible');
    if (window.__voyagrMapHintToastT) {
        clearTimeout(window.__voyagrMapHintToastT);
    }
    window.__voyagrMapHintToastT = setTimeout(() => {
        el.classList.remove('is-visible');
        el.setAttribute('hidden', '');
    }, 4200);
}

/**
 * Modal listing visible map / toolbar buttons (mobile-friendly; desktop relies on hover titles).
 */
function openMapControlsHintModal() {
    const m = document.getElementById('mapControlsHintModal');
    const ul = document.getElementById('mapControlsHintList');
    if (!m || !ul) return;
    ul.innerHTML = '';
    const sections = [
        { title: 'Map (round buttons)', selector: '.fab-container .fab, #navControlButtons .fab' },
        { title: 'Bottom sheet toolbar', selector: '.sheet-toolbar .sheet-icon-btn' },
    ];
    for (let s = 0; s < sections.length; s++) {
        const sec = sections[s];
        const secTitle = document.createElement('li');
        secTitle.className = 'map-hint-section-title';
        secTitle.textContent = sec.title;
        ul.appendChild(secTitle);
        const nodes = document.querySelectorAll(sec.selector);
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (el.id === 'mapControlsHintFab') continue;
            const hint = el.getAttribute('title') || el.getAttribute('aria-label');
            if (!hint) continue;
            const st = window.getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') continue;
            const icon = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 6);
            const li = document.createElement('li');
            li.className = 'map-hint-item';
            li.textContent = (icon ? icon + ' \u2014 ' : '') + hint;
            ul.appendChild(li);
        }
    }

    const exTitle = document.createElement('li');
    exTitle.className = 'map-hint-section-title';
    exTitle.textContent = 'Often hidden until you need them';
    ul.appendChild(exTitle);
    const extras = [
        '\u2014 After you calculate a route, \u201cStart navigation\u201d can appear on the map.',
        '\u2014 During turn-by-turn, Zoom & follow, Recenter, and Journey overview may appear as round buttons.',
        '\u2014 Long-press any round map icon ~\u00bds for this same text as a bottom banner.',
    ];
    for (let e = 0; e < extras.length; e++) {
        const li = document.createElement('li');
        li.className = 'map-hint-item';
        li.textContent = extras[e];
        ul.appendChild(li);
    }

    m.style.display = 'block';
}

function closeMapControlsHintModal() {
    const modal = document.getElementById('mapControlsHintModal');
    if (modal) modal.style.display = 'none';
}

/**
 * Long-press (touch / pen) shows title text like a desktop hover tooltip.
 */
function initMobileMapIconHints() {
    if (!voyagrTouchHintsEnabled()) {
        console.log('[Hints] Long-press map hints skipped (touch / coarse pointer not detected)');
        return;
    }
    console.log('[Hints] Long-press map hints enabled (\u2248' + 420 + 'ms, bottom banner)');

    const roots = ['.fab-container', '#navControlButtons', '.sheet-toolbar'];
    for (let r = 0; r < roots.length; r++) {
        const root = document.querySelector(roots[r]);
        if (!root) continue;
        const buttons = root.querySelectorAll('button.fab, button.sheet-icon-btn');
        for (let i = 0; i < buttons.length; i++) {
            voyagrBindFabLongPressHint(buttons[i]);
        }
    }
}

function voyagrBindFabLongPressHint(el) {
    if (!el || el.dataset.voyagrLongPressHint === '1') return;
    el.dataset.voyagrLongPressHint = '1';

    let timer = null;
    let startX = 0;
    let startY = 0;
    const LONG_MS = 420;
    const MOVE_PX2 = 100;

    const getHint = () => {
        const t = el.getAttribute('title');
        if (t) return t.trim();
        const a = el.getAttribute('aria-label');
        return a ? a.trim() : '';
    };

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const scheduleHint = (cx, cy) => {
        startX = cx;
        startY = cy;
        clearTimer();
        timer = setTimeout(() => {
            timer = null;
            const hint = getHint();
            if (!hint) return;
            el.dataset.voyagrSuppressClick = '1';
            voyagrShowMapIconHint(hint);
            try {
                if (navigator.vibrate) navigator.vibrate(20);
            } catch (_v) {
                /* ignore */
            }
        }, LONG_MS);
    };

    const onMove = (cx, cy) => {
        if (!timer) return;
        const dx = cx - startX;
        const dy = cy - startY;
        if (dx * dx + dy * dy > MOVE_PX2) clearTimer();
    };

    if (window.PointerEvent) {
        el.addEventListener(
            'pointerdown',
            (e) => {
                if (!e.isPrimary) return;
                if (e.pointerType === 'mouse') return;
                scheduleHint(e.clientX, e.clientY);
            },
            { passive: true }
        );
        el.addEventListener(
            'pointermove',
            (e) => {
                if (!timer || !e.isPrimary) return;
                onMove(e.clientX, e.clientY);
            },
            { passive: true }
        );
        el.addEventListener('pointerup', clearTimer, { passive: true });
        el.addEventListener('pointercancel', clearTimer, { passive: true });
    } else {
        el.addEventListener(
            'touchstart',
            (e) => {
                if (e.touches.length !== 1) return;
                scheduleHint(e.touches[0].clientX, e.touches[0].clientY);
            },
            { passive: true }
        );
        el.addEventListener(
            'touchmove',
            (e) => {
                if (!e.touches[0]) return;
                onMove(e.touches[0].clientX, e.touches[0].clientY);
            },
            { passive: true }
        );
        el.addEventListener('touchend', clearTimer, { passive: true });
        el.addEventListener('touchcancel', clearTimer, { passive: true });
    }

    el.addEventListener(
        'click',
        (e) => {
            if (el.dataset.voyagrSuppressClick === '1') {
                e.preventDefault();
                e.stopPropagation();
                delete el.dataset.voyagrSuppressClick;
            }
        },
        true
    );
}

function openRoadReportModal() {
    const m = document.getElementById('roadReportModal');
    if (!m) return;
    const notes = document.getElementById('roadReportNotes');
    if (notes) notes.value = '';
    m.style.display = 'block';
}

function closeRoadReportModal() {
    const m = document.getElementById('roadReportModal');
    if (m) m.style.display = 'none';
}

async function submitRoadReport() {
    const lat = typeof currentLat !== 'undefined' ? currentLat : null;
    const lon = typeof currentLon !== 'undefined' ? currentLon : null;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        showStatus('Turn on GPS or wait for a position fix before reporting.', 'warning');
        return;
    }
    const typeEl = document.getElementById('roadReportType');
    const hazard_type = typeEl ? typeEl.value : 'other';
    const description = (document.getElementById('roadReportNotes') && document.getElementById('roadReportNotes').value) || '';
    try {
        const r = await fetch('/api/hazards/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hazard_type,
                lat,
                lon,
                description,
                severity: hazard_type === 'accident' ? 'high' : 'medium',
            }),
        });
        const data = await r.json();
        if (data.success) {
            showStatus('Thanks — report received.', 'success');
            closeRoadReportModal();
        } else {
            showStatus(data.error || 'Report failed', 'error');
        }
    } catch (e) {
        showStatus('Report failed: ' + e.message, 'error');
    }
}

// PWA Service Worker Registration
let _swUpdateInFlight = false;
let _swUpdateBackoffUntil = 0;

async function safeServiceWorkerUpdate(registration, reason) {
    if (!registration || !('serviceWorker' in navigator)) return;
    if (!navigator.onLine) return;
    if (_swUpdateInFlight || Date.now() < _swUpdateBackoffUntil) return;
    if (registration.installing) return;

    _swUpdateInFlight = true;
    try {
        await registration.update();
    } catch (e) {
        // InvalidStateError / NotFound are common when offline or mid-install.
        _swUpdateBackoffUntil = Date.now() + (5 * 60 * 1000);
        console.debug('[PWA] Service worker update skipped:', e && e.name, reason || '');
    } finally {
        _swUpdateInFlight = false;
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('[PWA] Service Worker registered:', registration);

                // Check for updates periodically (avoid aggressive polling — it spams InvalidStateError).
                setInterval(() => {
                    void safeServiceWorkerUpdate(registration, 'periodic');
                }, 30 * 60 * 1000);

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        void safeServiceWorkerUpdate(registration, 'visible');
                    }
                });

                // Kick off Picovoice vendor cache warm-up 8s after load (idle).
                // Prefer requestIdleCallback when available so we don't compete
                // with first-paint work; fall back to setTimeout on Safari.
                const scheduleWarm = (cb) => {
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(cb, { timeout: 12000 });
                    } else {
                        setTimeout(cb, 8000);
                    }
                };
                scheduleWarm(warmPicovoiceStaticCache);
            })
            .catch(error => {
                console.log('[PWA] Service Worker registration failed:', error);
            });
    });

    // ===== PHASE 2: Handle service worker updates with smart reload =====
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] New service worker activated');

        // Check if navigation is in progress
        if (routeInProgress) {
            // Queue update for after navigation
            updatePending = true;
            showStatus('✅ Update available. Will apply after navigation.', 'info');
        } else {
            // Safe to reload immediately
            showStatus('🔄 Applying app update...', 'success');
            saveAppState();
            scheduleAppReload('service-worker-update', 1000);
        }
    });
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Request persistent storage
if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(persistent => {
        console.log('[PWA] Persistent storage:', persistent ? 'granted' : 'denied');
    });
}

// ===== OFFLINE DETECTION & UI =====
let _voyagrIsOffline = !navigator.onLine;

function _createOfflineBanner() {
    const OFF = _offlineNavigation();
    if (document.getElementById(OFF.OFFLINE_BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = OFF.OFFLINE_BANNER_ID;
    banner.style.cssText = OFF.getOfflineBannerStyleCssText();
    banner.innerHTML = OFF.buildOfflineBannerInnerHtml();
    document.body.prepend(banner);
    // Push the top-anchored nav widgets (turn card + Then row + lane guidance, and the
    // speed widget) down so this full-width banner doesn't cover them (see CSS).
    document.body.classList.add('voyagr-has-offline-banner');
}

function _removeOfflineBanner() {
    const OFF = _offlineNavigation();
    const banner = document.getElementById(OFF.OFFLINE_BANNER_ID);
    if (banner) {
        banner.style.transform = 'translateY(-100%)';
        setTimeout(() => banner.remove(), 350);
    }
    document.body.classList.remove('voyagr-has-offline-banner');
}

function _handleOffline() {
    _voyagrIsOffline = true;
    console.log('[Offline] Network lost');
    _createOfflineBanner();
    if (typeof showStatus === 'function') {
        showStatus('📡 Offline mode — using cached data', 'warning');
    }
}

function _handleOnline() {
    _voyagrIsOffline = false;
    console.log('[Offline] Network restored');
    _removeOfflineBanner();
    if (typeof showStatus === 'function') {
        showStatus('✅ Back online', 'success');
    }
    if (typeof window.__voyagrMapRecoverAfterNetworkEvent === 'function') {
        window.__voyagrMapRecoverAfterNetworkEvent('window online');
    }
}

window.addEventListener('offline', _handleOffline);
window.addEventListener('online', _handleOnline);
if (!navigator.onLine) {
    window.addEventListener('load', _handleOffline);
}

// ===== OFFLINE ROUTE PERSISTENCE (IndexedDB) =====
const ROUTE_DB_NAME = 'voyagr-nav';
const ROUTE_DB_VERSION = 2;
const ROUTE_STORE = 'active_route';
const SPEED_CACHE_STORE = 'speed_limits';

function _openRouteDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(ROUTE_DB_NAME, ROUTE_DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(ROUTE_STORE)) {
                db.createObjectStore(ROUTE_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SPEED_CACHE_STORE)) {
                db.createObjectStore(SPEED_CACHE_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function cacheSpeedLimit(lat, lon, speedLimit, source) {
    const SL = _speedLimitWidget();
    if (!SL) return;
    try {
        const key = SL.speedLimitCacheKey(lat, lon);
        const db = await _openRouteDB();
        const tx = db.transaction(SPEED_CACHE_STORE, 'readwrite');
        tx.objectStore(SPEED_CACHE_STORE).put({
            key, speedLimit, source, cachedAt: Date.now()
        });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        db.close();
    } catch (e) { /* ignore */ }
}

async function getCachedSpeedLimit(lat, lon) {
    const SL = _speedLimitWidget();
    if (!SL) return null;
    try {
        const key = SL.speedLimitCacheKey(lat, lon);
        const db = await _openRouteDB();
        const tx = db.transaction(SPEED_CACHE_STORE, 'readonly');
        const req = tx.objectStore(SPEED_CACHE_STORE).get(key);
        const result = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        db.close();
        return result || null;
    } catch (e) {
        return null;
    }
}

async function persistActiveRoute() {
    if (!routeInProgress || !routePolyline) return;
    try {
        const db = await _openRouteDB();
        const tx = db.transaction(ROUTE_STORE, 'readwrite');
        tx.objectStore(ROUTE_STORE).put({
            id: 'current',
            polyline: routePolyline,
            steps: currentRouteSteps,
            stepIndex: currentStepIndex,
            destination: window.lastCalculatedRoute?.destination || null,
            routeData: window.lastCalculatedRoute || null,
            savedAt: Date.now()
        });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        db.close();
    } catch (e) {
        console.warn('[OfflineNav] Failed to persist route:', e);
    }
}

async function loadPersistedRoute() {
    try {
        const db = await _openRouteDB();
        const tx = db.transaction(ROUTE_STORE, 'readonly');
        const getReq = tx.objectStore(ROUTE_STORE).get('current');
        const result = await new Promise((res, rej) => {
            getReq.onsuccess = () => res(getReq.result);
            getReq.onerror = () => rej(getReq.error);
        });
        db.close();
        if (!result) return null;
        const age = Date.now() - (result.savedAt || 0);
        if (age > 4 * 60 * 60 * 1000) {
            await clearPersistedRoute();
            return null;
        }
        return result;
    } catch (e) {
        console.warn('[OfflineNav] Failed to load persisted route:', e);
        return null;
    }
}

async function clearPersistedRoute() {
    try {
        const db = await _openRouteDB();
        const tx = db.transaction(ROUTE_STORE, 'readwrite');
        tx.objectStore(ROUTE_STORE).delete('current');
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        db.close();
    } catch (e) {
        console.warn('[OfflineNav] Failed to clear persisted route:', e);
    }
}

let _persistRouteTimer = null;
function schedulePersistRoute() {
    if (_persistRouteTimer) return;
    _persistRouteTimer = setTimeout(() => {
        _persistRouteTimer = null;
        persistActiveRoute();
    }, 5000);
}

// ===== PHASE 2: Restore app state on page load =====
window.addEventListener('load', () => {
    restoreAppState();
    void initSupabaseAuth();
    _tryResumeNavigation();
    initDeviceEnvironmentNotifications();
    // Show a volume reminder on app open (once per tab session).
    try {
        const openVolumeHintKey = 'voyagr_volume_hint_on_open_shown';
        const alreadyShown = sessionStorage.getItem(openVolumeHintKey) === 'true';
        if (!alreadyShown) {
            sessionStorage.setItem(openVolumeHintKey, 'true');
            setTimeout(() => {
                try {
                    showVolumeHintForNavigation();
                } catch (e) {
                    console.warn('[EnvHint] open volume hint:', e);
                }
            }, 1800);
        }
    } catch (e) {
        console.warn('[EnvHint] open volume hint schedule:', e);
    }
});

// ===== TILE PRE-CACHING FOR ROUTE CORRIDORS =====
/**
 * Read vector tile URL templates plus each source minzoom/maxzoom from the active MapLibre style.
 * Prefetch clamps desired zoom to maxzoom so we do not request tiles the renderer never loads (overzoom).
 */
/**
 * @returns {Array<{ template: string, minzoom: number, maxzoom: number }>}
 */
function collectVectorTileTemplatesFromMap() {
    if (typeof map === 'undefined' || map === null) return [];
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return [];
    try {
        const style = map.getStyle();
        const entries = [];
        const sources = style && style.sources ? style.sources : {};
        for (const key of Object.keys(sources)) {
            const src = sources[key];
            if (!src || src.type !== 'vector' || !Array.isArray(src.tiles)) continue;
            const minzoom = typeof src.minzoom === 'number' ? src.minzoom : 0;
            const maxzoom = typeof src.maxzoom === 'number' ? src.maxzoom : 22;
            for (const t of src.tiles) {
                if (typeof t !== 'string') continue;
                if (/\{z\}/i.test(t) && /\{x\}/i.test(t) && /\{y\}/i.test(t)) {
                    entries.push({ template: t, minzoom, maxzoom });
                }
            }
        }
        return entries;
    } catch (e) {
        console.warn('[TilePreCache] Could not read map style:', e);
        return [];
    }
}

function expandTileTemplate(template, z, x, y) {
    return template
        .replace(/\{z\}/gi, String(z))
        .replace(/\{x\}/gi, String(x))
        .replace(/\{y\}/gi, String(y));
}

async function precacheRouteTiles(polyline) {
    if (!polyline || polyline.length < 2) return;
    if (!('caches' in window)) return;

    const templates = collectVectorTileTemplatesFromMap();
    if (templates.length === 0) {
        console.log('[TilePreCache] Style has no vector tile templates yet — skipping corridor precache');
        return;
    }

    const zoomLevels = [13, 14, 15];
    const tileUrls = new Set();
    const sampleInterval = Math.max(1, Math.floor(polyline.length / 80));

    for (let i = 0; i < polyline.length; i += sampleInterval) {
        const [lat, lon] = polyline[i];
        for (const z of zoomLevels) {
            for (const { template: tpl, minzoom: srcMin, maxzoom: srcMax } of templates) {
                // Match MapLibre: above source maxzoom it loads parent tiles (overzoom), never requests z+1 from server.
                const zFetch = Math.min(Math.max(z, srcMin), srcMax);
                const x = Math.floor((lon + 180) / 360 * Math.pow(2, zFetch));
                const latRad = lat * Math.PI / 180;
                const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zFetch));
                tileUrls.add(expandTileTemplate(tpl, zFetch, x, y));
            }
        }
    }

    const urls = [...tileUrls].map((u) =>
        (u.startsWith('http://') || u.startsWith('https://'))
            ? u
            : new URL(u, window.location.origin).href
    );

    const maxPrefetch = 180;
    const capped = urls.length > maxPrefetch ? urls.slice(0, maxPrefetch) : urls;
    if (urls.length > maxPrefetch) {
        console.log(`[TilePreCache] Capping prefetch ${urls.length} → ${maxPrefetch} URLs`);
    }

    console.log(`[TilePreCache] Pre-caching ${capped.length} tiles (${templates.length} source template(s)) along route corridor`);

    try {
        const cacheNames = await caches.keys();
        const tileCacheName = cacheNames.find(n => n.startsWith('voyagr-tiles-')) || 'voyagr-tiles-v15';
        const cache = await caches.open(tileCacheName);
        let cached = 0;
        const batchSize = 6;
        for (let i = 0; i < capped.length; i += batchSize) {
            const batch = capped.slice(i, i + batchSize);
            await Promise.allSettled(
                batch.map(async (url) => {
                    const existing = await cache.match(url);
                    if (existing) return;
                    try {
                        const resp = await fetch(url);
                        if (resp.ok) {
                            await cache.put(url, resp);
                            cached++;
                        }
                    } catch (_e) { /* tile missing or offline */ }
                })
            );
        }
        console.log(`[TilePreCache] Cached ${cached} new tiles`);
    } catch (e) {
        console.warn('[TilePreCache] Error:', e);
    }
}

async function _tryResumeNavigation() {
    try {
        const saved = await loadPersistedRoute();
        if (!saved || !saved.polyline || !saved.steps) return;
        console.log('[OfflineNav] Found persisted route, offering resume');

        const OFF = _offlineNavigation();
        const resumeBanner = document.createElement('div');
        resumeBanner.id = OFF.RESUME_NAV_BANNER_ID;
        resumeBanner.style.cssText = OFF.getResumeNavigationBannerStyleCssText();
        resumeBanner.innerHTML = OFF.buildResumeNavigationBannerHtml(saved.steps.length);
        document.body.appendChild(resumeBanner);

        document.getElementById('resumeNavYes').onclick = () => {
            resumeBanner.remove();
            const payload = buildRoutePayloadFromPersisted(saved);
            if (payload && payload.geometry) {
                startTurnByTurnNavigation(payload, {
                    fromPersistedResume: true,
                    resumeStepIndex: saved.stepIndex || 0,
                });
                console.log('[OfflineNav] Route resumed via full navigation bootstrap');
            } else {
                routePolyline = saved.polyline;
                currentRouteSteps = saved.steps;
                currentStepIndex = saved.stepIndex || 0;
                routeInProgress = true;
                if (saved.routeData) window.lastCalculatedRoute = saved.routeData;
                showStatus('🧭 Navigation resumed from saved route', 'success');
                if (typeof startGPSTracking === 'function') startGPSTracking();
                console.log('[OfflineNav] Route resumed (legacy path — missing encoded geometry)');
            }
        };
        document.getElementById('resumeNavNo').onclick = () => {
            resumeBanner.remove();
            clearPersistedRoute();
        };

        setTimeout(() => { if (document.getElementById(OFF.RESUME_NAV_BANNER_ID)) resumeBanner.remove(); }, 30000);
    } catch (e) {
        console.warn('[OfflineNav] Resume check failed:', e);
    }
}

// ===== PHASE 3: Initialize battery monitoring =====
initBatteryMonitoring();

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
// Preference when browsing. During turn-by-turn with zoom-and-follow, 60° is always used regardless.
let driverPerspectiveEnabled = localStorage.getItem('driverPerspectiveEnabled') === 'true';  // Default false (opt-in)

function isActiveNavigationFollow() {
    return !!(routeInProgress && zoomAndFollowEnabled && mapFollowingActive);
}

/**
 * True when the user has explicitly chosen the flat 2D map view (Settings → 3D Map View off).
 * Read from localStorage so it is safe to call before the in-memory flag initialises and so it
 * stays correct across the whole camera pipeline. Default (no saved value) is treated as 3D.
 */
function userPrefersFlat2D() {
    return localStorage.getItem('mapView3DEnabled') === 'false';
}

/**
 * Single source of truth for the follow/tilt decision, delegated to the pure, unit-tested
 * camera-pitch helper (static/js/modules/navigation/camera-pitch.js). The inline fallback only
 * runs if that helper script failed to load, and mirrors the same logic.
 * @returns {{ followHeading: boolean, tilt: boolean }}
 */
function decideDrivingCameraState() {
    const state = {
        activeNavFollow: isActiveNavigationFollow(),
        driverPerspectiveEnabled: driverPerspectiveEnabled,
        prefersFlat2D: userPrefersFlat2D(),
    };
    if (typeof decideDrivingCamera === 'function') {
        return decideDrivingCamera(state);
    }
    const followHeading = state.activeNavFollow || state.driverPerspectiveEnabled;
    return { followHeading: followHeading, tilt: followHeading && !state.prefersFlat2D };
}

/** Heading-up follow camera: active nav follow, or user enabled driver view while browsing */
function shouldUsePitchedDrivingCamera() {
    return decideDrivingCameraState().followHeading;
}

/**
 * Whether the follow camera should be tilted (3D pitch). This is the heading-up follow decision
 * minus an explicit 2D preference — so 2D navigation still follows/rotates with heading but stays
 * flat (pitch 0) instead of tilted (pitch 60).
 */
function shouldTiltDrivingCamera() {
    return decideDrivingCameraState().tilt;
}

/** One-shot camera after nav start or when forcing driver framing */
function applyLiveNavigationCamera() {
    if (!map || currentLat == null || currentLon == null) return;
    const heading = (typeof currentUserMarker?.heading === 'number')
        ? currentUserMarker.heading
        : map.getBearing();
    map.easeTo({
        duration: 1000,
        pitch: shouldTiltDrivingCamera() ? 60 : 0,
        bearing: heading,
        center: [currentLon, currentLat],
        padding: getNavigationFollowPadding(),
    });
    console.log(`[Driver View] ${shouldTiltDrivingCamera() ? '60°' : 'flat 2D'} navigation camera (follow padding)`);
}

/**
 * Toggle driver's perspective preference (when not navigating, or after this trip ends).
 * During active navigation with zoom-and-follow, the map stays at 60° either way.
 */
function toggleDriverPerspective() {
    driverPerspectiveEnabled = !driverPerspectiveEnabled;
    localStorage.setItem('driverPerspectiveEnabled', driverPerspectiveEnabled.toString());

    const btn = document.getElementById('driverPerspectiveToggle');
    const pitched = shouldUsePitchedDrivingCamera();
    VoyagrModules.toggleUI().applyToggleButton(btn, pitched);

    if (map) {
        applyDriverPerspective();
    }

    if (driverPerspectiveEnabled) {
        showStatus('🚗 Driver\'s view enabled', 'info');
    } else if (isActiveNavigationFollow()) {
        showStatus('🚗 Preference saved — driver view stays on during navigation', 'info');
    } else {
        showStatus('🗺️ Standard view', 'info');
    }
    if (typeof _recomputeMapView3DFromGranular === 'function') _recomputeMapView3DFromGranular();
    saveAllSettings();
}

/**
 * Apply camera from shouldUsePitchedDrivingCamera() (nav follow or user preference).
 */
function applyDriverPerspective() {
    if (!map) return;

    const heading = (typeof currentUserMarker?.heading === 'number')
        ? currentUserMarker.heading
        : ((currentUserMarker && currentUserMarker.heading) || 0);

    const easeOptions = {
        duration: 1000
    };

    if (shouldUsePitchedDrivingCamera()) {
        easeOptions.pitch = shouldTiltDrivingCamera() ? 60 : 0;
        easeOptions.bearing = heading;
        easeOptions.padding = getNavigationFollowPadding();
        if (currentLat != null && currentLon != null) {
            easeOptions.center = [currentLon, currentLat];
        }
        map.easeTo(easeOptions);
        console.log(`[Driver View] ${shouldTiltDrivingCamera() ? '60°' : 'flat 2D heading-up'} (navigation follow or preference)`);
    } else {
        easeOptions.pitch = 0;
        easeOptions.bearing = 0;
        easeOptions.padding = { top: 50, bottom: 200, left: 50, right: 50 };
        easeOptions.duration = 500;
        map.easeTo(easeOptions);
        console.log('[Driver View] Standard top-down');
    }
}

// ===== 2D / 3D MAP VIEW (scene preset) =====
// One user-facing switch that bundles the existing camera-tilt + 3D-building controls:
//   3D = tilted camera (driver perspective) + 3D building extrusions
//   2D = flat camera (pitch 0) + no building extrusions
// It reuses the existing flags/functions (no separate state). The choice applies while
// browsing AND during turn-by-turn navigation: 2D navigation still follows heading-up,
// it just stays flat instead of tilting to 60° (see shouldTiltDrivingCamera()).
let mapView3DEnabled = (localStorage.getItem('mapView3DEnabled') !== null)
    ? (localStorage.getItem('mapView3DEnabled') === 'true')
    : (driverPerspectiveEnabled || buildings3DEnabled);

/** Reflect the current 2D/3D state on the master toggle and the two granular toggles. */
function syncMapView3DToggleUI() {
    const TU = VoyagrModules.toggleUI();
    const master = document.getElementById('mapView3DToggle');
    if (master) {
        TU.applyToggleButton(master, mapView3DEnabled);
        if (!mapView3DEnabled) {
            master.style.background = '';
            master.style.borderColor = '';
        }
    }
    TU.applyToggleButton(document.getElementById('driverPerspectiveToggle'), driverPerspectiveEnabled);
    TU.applyToggleButton(document.getElementById('buildings3DToggle'), buildings3DEnabled);
}

/** Apply a 2D/3D scene preset by driving the existing tilt + buildings machinery. */
function setMapView3D(enabled) {
    mapView3DEnabled = !!enabled;
    localStorage.setItem('mapView3DEnabled', mapView3DEnabled ? 'true' : 'false');

    // Camera tilt (reuses driver-perspective flag + camera logic).
    driverPerspectiveEnabled = mapView3DEnabled;
    localStorage.setItem('driverPerspectiveEnabled', driverPerspectiveEnabled.toString());
    if (map) applyDriverPerspective();

    // 3D building extrusions follow the scene.
    buildings3DEnabled = mapView3DEnabled;
    localStorage.setItem('buildings3DEnabled', buildings3DEnabled ? 'true' : 'false');
    if (map && typeof MapLibreHelpers !== 'undefined') {
        if (buildings3DEnabled) {
            MapLibreHelpers.add3DBuildings(map, {
                heightMultiplier: buildings3DHeightMultiplier,
                opacity: buildings3DOpacity
            });
        } else {
            MapLibreHelpers.remove3DBuildings(map);
        }
    }

    syncMapView3DToggleUI();
}

/** Toggle between 2D and 3D map view (Settings → AR & 3D View). */
function toggleMapView3D() {
    setMapView3D(!mapView3DEnabled);
    showStatus(mapView3DEnabled ? '🏙️ 3D map view' : '🗺️ 2D map view', 'info');
    if (typeof saveAllSettings === 'function') saveAllSettings();
}

/**
 * Keep the 2D/3D master in sync when a granular toggle (camera tilt or 3D buildings)
 * is changed on its own. The scene reads as "3D" if either aspect is on.
 */
function _recomputeMapView3DFromGranular() {
    mapView3DEnabled = !!(driverPerspectiveEnabled || buildings3DEnabled);
    localStorage.setItem('mapView3DEnabled', mapView3DEnabled ? 'true' : 'false');
    syncMapView3DToggleUI();
}

// ===== AR NAVIGATION MODE =====
let arNavigator = null;
let arModeActive = false;
let isAREnabled = false; // Global flag for preference

/**
 * Toggle AR Setting (from Preferences)
 */
function toggleARSetting() {
    const btn = document.getElementById('arToggleBtn');
    if (btn) {
        btn.classList.toggle('active');
        isAREnabled = btn.classList.contains('active');
        localStorage.setItem('voyagr_ar_enabled', isAREnabled);

        updateARButtonVisibility();

        if (isAREnabled) {
            showStatus('AR Navigation enabled', 'success');
        } else {
            showStatus('AR Navigation disabled', 'info');
            // If AR mode was active, stop it
            if (arModeActive) stopARMode();
        }
    }
}

/**
 * Update AR FAB Visibility based on settings and route state
 */
function updateARButtonVisibility() {
    const arFab = document.getElementById('arModeBtn');
    if (!arFab) return;

    // improved logic: Only show if enabled AND (route calculated OR navigation active)
    const hasRoute = window.lastCalculatedRoute !== null;

    if (isAREnabled && (hasRoute || routeInProgress)) {
        arFab.style.display = 'flex';
        arFab.textContent = '👓'; // Use Glasses icon as requested
    } else {
        arFab.style.display = 'none';
    }
}


/**
 * Toggle AR navigation mode
 * Uses WebXR if available, falls back to camera overlay
 */
async function toggleARMode() {
    if (arModeActive) {
        await stopARMode();
        return;
    }

    // Dynamically import AR module
    try {
        const { ARNavigator } = await import('./modules/ar-navigation.js');

        if (!arNavigator) {
            arNavigator = new ARNavigator({
                onError: (err) => {
                    showStatus(`AR Error: ${err.message}`, 'error');
                },
                onStatusChange: (status) => {
                    console.log('[AR] Status:', status);
                    updateARButtonState(status);
                }
            });
        }

        showStatus('📸 Starting AR mode...', 'info');

        const result = await arNavigator.start();

        if (result.success) {
            arModeActive = true;
            showStatus(`📷 AR mode active (${result.mode})`, 'success');

            // Sync current instruction to AR
            if (currentRouteSteps && currentStepIndex < currentRouteSteps.length) {
                const step = currentRouteSteps[currentStepIndex];
                arNavigator.updateInstruction({
                    instruction: step.instruction,
                    direction: getDirectionFromType(step.type),
                    distance: nextManeuverDistance
                });
            }
        } else {
            showStatus(`AR not available: ${result.error}`, 'error');
        }
    } catch (err) {
        console.error('[AR] Failed to load module:', err);
        showStatus('AR module failed to load', 'error');
    }
}

/**
 * Stop AR mode
 */
async function stopARMode() {
    if (arNavigator) {
        await arNavigator.stop();
    }
    arModeActive = false;
    showStatus('🗺️ Returned to map view', 'info');
}

/**
 * Update AR button visual state
 */
function updateARButtonState(status) {
    const btn = document.getElementById('arModeBtn');
    if (!btn) return;

    if (status === 'active' || status === 'active-fallback') {
        btn.classList.add('active');
        btn.innerHTML = _mapControls().AR_ACTIVE_LABEL;
    } else {
        btn.classList.remove('active');
        btn.innerHTML = _mapControls().AR_INACTIVE_LABEL;
    }
}

/**
 * Update AR overlay with current navigation instruction
 */
function updateARInstruction(turnInfo) {
    if (!arModeActive || !arNavigator) return;

    arNavigator.updateInstruction({
        instruction: turnInfo?.instruction || 'Follow route',
        direction: turnInfo?.direction || 'straight',
        distance: turnInfo?.distance || 0
    });
}

/**
 * Get direction string from Valhalla maneuver type
 */
function getDirectionFromType(type) {
    const typeMap = {
        9: 'slight-right', 18: 'slight-right', 23: 'slight-right',
        10: 'right',
        11: 'sharp-right',
        16: 'slight-left', 19: 'slight-left', 24: 'slight-left',
        15: 'left',
        14: 'sharp-left',
        12: 'u-turn', 13: 'u-turn',
        20: 'exit', 21: 'exit',
        26: 'roundabout', 27: 'roundabout',
        4: 'destination', 5: 'destination', 6: 'destination'
    };
    return typeMap[type] || 'straight';
}

// ===== TURN INSTRUCTION WIDGET =====
let instructionsPanelExpanded = false;

/**
 * Toggle the instructions panel expand/collapse state
 */
function toggleInstructionsList() {
    const panel = document.getElementById('instructionsPanel');
    const expandIcon = document.getElementById('expandIcon');
    const expandIndicator = document.querySelector('.expand-indicator');

    if (!panel) return;

    instructionsPanelExpanded = !instructionsPanelExpanded;

    if (instructionsPanelExpanded) {
        panel.style.display = 'block';
        expandIndicator?.classList.add('expanded');
        expandIcon.textContent = '▲';
        populateInstructionsList();
    } else {
        panel.style.display = 'none';
        expandIndicator?.classList.remove('expanded');
        expandIcon.textContent = '▼';
    }

    console.log('[Turn Widget] Instructions panel:', instructionsPanelExpanded ? 'expanded' : 'collapsed');
}

/**
 * Show the turn instruction widget
 */
function showTurnInstructionWidget() {
    const widget = document.getElementById('turnInstructionWidget');
    if (widget) {
        widget.style.display = 'block';
        console.log('[Turn Widget] Displayed');
    }
}

/**
 * Hide the turn instruction widget
 */
function hideTurnInstructionWidget() {
    const widget = document.getElementById('turnInstructionWidget');
    if (widget) {
        widget.style.display = 'none';
        instructionsPanelExpanded = false;
        const panel = document.getElementById('instructionsPanel');
        if (panel) panel.style.display = 'none';
        const hintEl = document.getElementById('nextTurnLaneHint');
        if (hintEl) {
            hintEl.innerHTML = '';
            hintEl.style.display = 'none';
        }
        const thenEl = document.getElementById('nextTurnThen');
        if (thenEl) thenEl.style.display = 'none';
        console.log('[Turn Widget] Hidden');
    }
}

/**
 * Get turn icon based on maneuver type
 * @param {number} type - Valhalla maneuver type
 * @returns {string} Unicode arrow or icon
 */
function getTurnIcon(type) {
    return VoyagrModules.turnInstructions().getTurnIcon(type);
}

/**
 * Format distance for display using user's preferred units
 * @param {number} distanceMeters - Distance in meters
 * @returns {string} Formatted distance string
 */
function formatTurnDistance(distanceMeters) {
    return VoyagrModules.turnInstructions().formatTurnDistance(distanceMeters, distanceUnit);
}

/**
 * Update the next turn display with current turn info
 * @param {Object} turnInfo - Turn information object
 */
function updateTurnInstructionDisplay(turnInfo) {
    const distanceEl = document.getElementById('nextTurnDistance');
    const instructionEl = document.getElementById('nextTurnInstruction');
    const streetEl = document.getElementById('nextTurnStreet');
    const iconEl = document.getElementById('nextTurnIcon');
    const hintEl = document.getElementById('nextTurnLaneHint');

    if (!distanceEl || !instructionEl) return;

    if (turnInfo) {
        // "Continue"/straight keeps you on the current road (prefix "on"); real turns join
        // a new road (prefix "onto"). Show the running countdown "In <dist>" whenever we
        // have a meaningful distance (in the user's units), and only fall back to a bare
        // "On" when essentially at/using the current road (< 15 m or no distance).
        const isContinue = turnInfo.direction === 'straight';
        const hasCountdown = turnInfo.distance != null && turnInfo.distance >= 15;
        const formattedDistance = formatTurnDistance(turnInfo.distance || 0);
        distanceEl.textContent = hasCountdown ? `In ${formattedDistance}` : 'On';

        instructionEl.textContent = buildTurnDisplayInstruction(turnInfo);

        if (streetEl) {
            if (turnInfo.streetName) {
                const prefix = isContinue ? 'on' : 'onto';
                streetEl.textContent = `${prefix} ${turnInfo.streetName}`;
                streetEl.style.display = 'block';
            } else {
                streetEl.style.display = 'none';
            }
        }

        const directionToType = {
            'left': 15,
            'right': 10,
            'slight-left': 16,
            'slight_left': 16,
            'slight-right': 9,
            'slight_right': 9,
            'sharp-left': 14,
            'sharp_left': 14,
            'sharp-right': 11,
            'sharp_right': 11,
            'u-turn': 12,
            'uturn': 12,
            'straight': 8,
            'exit': 20,
            'exit-right': 20,
            'exit_right': 20,
            'exit-left': 21,
            'exit_left': 21,
            'merge': 25,
            'roundabout': 26,
            'destination': 4
        };
        const vt = turnInfo.valhallaType;
        const iconType = typeof vt === 'number' ? vt : (directionToType[turnInfo.direction] || 8);
        if (iconEl) iconEl.textContent = getTurnIcon(iconType);

        if (hintEl) {
            if (turnInfo.maneuver && turnInfo.maneuverIndex != null) {
                const hintHtml = buildTurnLaneHintHtml(turnInfo.maneuver, turnInfo.maneuverIndex, turnInfo.distance);
                if (hintHtml) {
                    hintEl.innerHTML = hintHtml;
                    hintEl.style.display = 'block';
                } else {
                    hintEl.innerHTML = '';
                    hintEl.style.display = 'none';
                }
            } else {
                hintEl.innerHTML = '';
                hintEl.style.display = 'none';
            }
        }

    } else {
        distanceEl.textContent = 'Follow Route';
        instructionEl.textContent = 'Continue on current road';
        if (streetEl) streetEl.style.display = 'none';
        if (iconEl) iconEl.textContent = '↑';
        if (hintEl) {
            hintEl.innerHTML = '';
            hintEl.style.display = 'none';
        }
    }

    // Advance "Then …" row: surface the maneuver that follows the next turn.
    updateThenRow(turnInfo ? turnInfo.maneuverIndex : null, turnInfo ? turnInfo.distance : null);

    if (instructionsPanelExpanded) {
        populateInstructionsList();
    }

    updateARInstruction(turnInfo);
}

/**
 * Show/hide the advance "Then <maneuver>" row. It appears while approaching the next
 * turn (<= 700 m) when another maneuver follows close behind (<= 900 m gap), e.g.
 * "Turn left … Then turn right".
 * @param {number|null} maneuverIndex - Index of the current/next maneuver in currentRouteSteps
 * @param {number|null} currentDistance - Distance (m) to the current maneuver
 */
function updateThenRow(maneuverIndex, currentDistance) {
    const thenEl = document.getElementById('nextTurnThen');
    if (!thenEl) return;
    const iconEl = document.getElementById('nextTurnThenIcon');
    const textEl = document.getElementById('nextTurnThenText');

    let show = false;
    if (maneuverIndex != null && typeof currentDistance === 'number' && currentDistance <= 700) {
        const follow = getFollowingManeuver(maneuverIndex);
        if (follow && follow.gapMeters <= 900) {
            let label = getTurnDirectionText(follow.direction);
            label = label.charAt(0).toUpperCase() + label.slice(1);
            if (follow.direction === 'roundabout') {
                const exitCt = effectiveRoundaboutExitCount(follow.index);
                if (exitCt > 0) label = `Roundabout, ${ordinalEnglishExit(exitCt)} exit`;
            }
            const onto = follow.streetName ? ` onto ${follow.streetName}` : '';
            // Distance to the following maneuver, formatted in the user's selected units
            // via the same helper as the main turn row (respects the mph/km UI choice).
            const thenDistance = formatTurnDistance(follow.gapMeters);
            if (iconEl) iconEl.textContent = getTurnIcon(follow.valhallaType);
            if (textEl) textEl.textContent = `In ${thenDistance} · ${label}${onto}`;
            show = true;
        }
    }
    thenEl.style.display = show ? 'flex' : 'none';
}

/**
 * Populate the full instructions list in the expanded panel
 * Enhanced with click-to-preview functionality
 */
function populateInstructionsList() {
    const listEl = document.getElementById('instructionsList');
    const countEl = document.getElementById('instructionsCount');

    if (!listEl || !currentRouteSteps || currentRouteSteps.length === 0) {
        if (listEl) listEl.innerHTML = VoyagrModules.turnInstructions().INSTRUCTIONS_EMPTY_HTML;
        if (countEl) countEl.textContent = '0 steps';
        return;
    }

    // Calculate remaining steps from current position
    const remainingSteps = currentRouteSteps.length - currentStepIndex;
    if (countEl) countEl.textContent = `${remainingSteps} of ${currentRouteSteps.length} steps remaining`;

    let html = '';
    const TI = VoyagrModules.turnInstructions();

    for (let i = 0; i < currentRouteSteps.length; i++) {
        const step = currentRouteSteps[i];
        const isCurrent = i === currentStepIndex;
        const isPassed = i < currentStepIndex;
        const type = step.type || 0;
        const icon = getTurnIcon(type);
        const instruction = step.instruction || 'Continue';
        const streetNames = step.street_names || [];
        const streetName = streetNames.length > 0 ? streetNames.join(', ') : '';
        const shapeIndex = step.begin_shape_index || 0;

        let itemClass = 'instruction-item';
        if (isCurrent) itemClass += ' current';
        if (isPassed) itemClass += ' passed';

        const exitCt = effectiveRoundaboutExitCount(i);
        const exitBadge = ((type === 26 || type === 27) && exitCt > 0)
            ? ` <span class="lane-hint-chip" style="font-size:11px;vertical-align:middle;">${ordinalEnglishExit(exitCt)} exit</span>`
            : '';

        html += TI.buildInstructionListItemHtml({
            itemClass,
            stepIndex: i,
            shapeIndex,
            icon,
            instruction,
            exitBadge,
            streetName,
            statusHtml: TI.buildInstructionStatusHtml(isPassed, isCurrent),
        });
    }

    listEl.innerHTML = html;

    // Scroll to current instruction
    const currentItem = listEl.querySelector('.instruction-item.current');
    if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * Preview instruction location on map when clicked
 * @param {number} stepIndex - Index of the step in currentRouteSteps
 * @param {number} shapeIndex - Index in the route polyline
 */
function previewInstructionOnMap(stepIndex, shapeIndex) {
    if (!routePolyline || shapeIndex >= routePolyline.length) {
        console.log('[Instructions] Cannot preview: invalid polyline index');
        return;
    }

    const point = routePolyline[shapeIndex];
    if (!point) return;

    const step = currentRouteSteps[stepIndex];
    const instruction = step?.instruction || 'Maneuver';

    console.log(`[Instructions] Previewing step ${stepIndex}: "${instruction}" at [${point[0].toFixed(4)}, ${point[1].toFixed(4)}]`);

    // Temporarily disable map following
    const wasFollowing = mapFollowingActive;
    mapFollowingActive = false;

    // Fly to the maneuver location
    if (map) {
        map.flyTo({
            center: [point[1], point[0]],  // MapLibre uses [lng, lat]
            zoom: 17,
            duration: 1000
        });

        // Show a temporary marker at the preview location
        showPreviewMarker(point[0], point[1], instruction);
    }

    // Re-enable following after 5 seconds
    setTimeout(() => {
        if (wasFollowing) {
            mapFollowingActive = true;
            hidePreviewMarker();
        }
    }, 5000);

    showStatus(`📍 Previewing: ${instruction}`, 'info');
}

// Preview marker reference
let previewMarker = null;

/**
 * Show a temporary preview marker on the map
 */
function showPreviewMarker(lat, lon, label) {
    hidePreviewMarker();

    if (!map) return;

    const PM = _previewMarker();
    const el = document.createElement('div');
    el.className = PM.PREVIEW_MARKER_CLASS;
    el.innerHTML = PM.buildPreviewMarkerInnerHtml(label);
    el.style.cssText = PM.getPreviewMarkerStyleCssText();

    // Create MapLibre marker
    previewMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);
}

/**
 * Hide the preview marker
 */
function hidePreviewMarker() {
    if (previewMarker) {
        previewMarker.remove();
        previewMarker = null;
    }
}

/**
 * Update turn widget from maneuver data (called from GPS tracking).
 * Delegates to {@link detectUpcomingTurn} so street names / distances stay in sync with
 * voice announcements — the old loop from `currentStepIndex` could show the wrong road
 * after a reroute when progress indices were re-seeded.
 *
 * @param {number} lat - Current latitude
 * @param {number} lon - Current longitude
 */
function updateTurnWidgetFromPosition(lat, lon) {
    if (!routeInProgress || !currentRouteSteps || currentRouteSteps.length === 0) {
        return;
    }
    if (!routePolyline || routePolyline.length < 2) {
        return;
    }

    const turnInfo = detectUpcomingTurn(lat, lon);
    if (turnInfo) {
        updateTurnInstructionDisplay({
            distance: turnInfo.distance,
            direction: turnInfo.direction,
            instruction: turnInfo.instruction || '',
            streetName: turnInfo.streetName || '',
            maneuver: turnInfo.maneuver,
            maneuverIndex: turnInfo.maneuverIndex,
            valhallaType: turnInfo.valhallaType,
        });
        return;
    }

    // No turn in detection range — show the road currently being driven.
    const activeIdx = getActiveRouteManeuverIndex(lastSnappedRouteIndex);
    const activeM = (activeIdx >= 0 && activeIdx < currentRouteSteps.length)
        ? currentRouteSteps[activeIdx]
        : null;
    const SGtw = _speedGps();
    const betweenTurn = SGtw
        ? SGtw.buildBetweenTurnDisplay(activeM, activeIdx, currentRoadDisplayName)
        : null;

    if (betweenTurn) {
        // The next actionable maneuver is beyond the turn-detection range, so show how
        // far until it (in the user's units) instead of a bare "On". Reuse the same snap +
        // along-route helpers detectUpcomingTurn uses (no duplicated distance logic).
        const nextManeuver = (activeIdx >= 0 && activeIdx + 1 < currentRouteSteps.length)
            ? currentRouteSteps[activeIdx + 1]
            : null;
        if (nextManeuver) {
            const snap = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);
            const targetIdx = Math.min(nextManeuver.begin_shape_index || 0, routePolyline.length - 1);
            const distToNext = distanceAlongRouteToVertexMeters(routePolyline, snap, targetIdx);
            if (Number.isFinite(distToNext) && distToNext >= 15) {
                betweenTurn.distance = distToNext;
            }
        }
        updateTurnInstructionDisplay(betweenTurn);
    } else {
        updateTurnInstructionDisplay(null);
    }
}

// ===== JOURNEY SUMMARY BAR =====
let journeySummaryUpdateInterval = null;

/**
 * Show the journey summary bar
 */
function showJourneySummaryBar() {
    const bar = document.getElementById('journeySummaryBar');
    if (bar) {
        bar.style.display = 'flex';
        console.log('[Journey Summary] Displayed');
        // Start updates
        startJourneySummaryUpdates();
    }
}

/**
 * Hide the journey summary bar
 */
function hideJourneySummaryBar() {
    const bar = document.getElementById('journeySummaryBar');
    if (bar) {
        bar.style.display = 'none';
        console.log('[Journey Summary] Hidden');
    }
    // Stop updates
    if (journeySummaryUpdateInterval) {
        clearInterval(journeySummaryUpdateInterval);
        journeySummaryUpdateInterval = null;
    }
}

/**
 * Start periodic journey summary updates
 */
function startJourneySummaryUpdates() {
    // Update immediately
    updateJourneySummaryBar();

    // Then update every 5 seconds
    if (journeySummaryUpdateInterval) {
        clearInterval(journeySummaryUpdateInterval);
    }
    journeySummaryUpdateInterval = setInterval(updateJourneySummaryBar, 5000);
}

/**
 * Format time for ETA display
 * @param {Date} date - Date object
 * @returns {string} Formatted time string
 */
function formatETATime(date) {
    const use24Hour = localStorage.getItem('use24HourFormat') !== 'false';
    return VoyagrModules.eta().formatETATime(date, use24Hour);
}

/**
 * Format remaining time for display
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted time string (e.g., "45 min" or "2h 15min")
 */
// formatRemainingTime moved to modules/navigation/eta.js (VoyagrETA).
function formatRemainingTime(minutes) {
    return VoyagrModules.eta().formatRemainingTime(minutes);
}

/**
 * Detect if the user has actually started moving.
 * Checks GPS position changes and speed to avoid false progress calculations.
 * @returns {boolean} True if user has started moving, false otherwise
 */
function hasUserStartedMoving() {
    return VoyagrModules.movementDetection().hasUserStartedMoving({
        trackingHistory: trackingHistory,
        haversineDistanceMeters: VoyagrModules.routeGeometry().haversineDistanceMeters,
        log: console.log.bind(console),
    });
}

/**
 * Update the journey summary bar with current navigation data
 * FIX: Added movement detection to prevent incorrect ETA before journey starts
 */
function updateJourneySummaryBar() {
    if (!routeInProgress || !routePolyline || routePolyline.length === 0) {
        return;
    }

    const distanceEl = document.getElementById('remainingDistance');
    const timeEl = document.getElementById('remainingTime');
    const etaEl = document.getElementById('etaTime');

    if (!distanceEl || !timeEl || !etaEl) return;

    const userHasStartedMoving = hasUserStartedMoving();

    // Remaining distance along the decoded polyline (not currentStepIndex — that is a maneuver index)
    let remainingDistanceMeters = 0;
    if (routePolyline.length >= 2) {
        if (userHasStartedMoving && currentLat != null && currentLon != null) {
            remainingDistanceMeters = computeRemainingDistanceAlongRoute(
                currentLat, currentLon, routePolyline, lastSnappedRouteIndex
            );
        } else {
            remainingDistanceMeters = getTotalPolylineLengthMeters(routePolyline);
        }
    }

    // Format remaining distance in user's preferred units
    const distanceText = VoyagrModules.units().formatRemainingDistanceText(
        remainingDistanceMeters,
        distanceUnit
    );
    distanceEl.textContent = distanceText;

    // Calculate remaining time based on route data
    let remainingTimeMinutes = 0;

    const routeDurationMin = getRouteOriginalDurationMinutes();
    const journeyMinutes = VoyagrModules.eta().computeJourneyRemainingTimeMinutes({
        lastCalculatedRoute: window.lastCalculatedRoute,
        routeDurationMin: routeDurationMin,
        userHasStartedMoving: userHasStartedMoving,
        remainingDistanceMeters: remainingDistanceMeters,
        polylineTotalM: getTotalPolylineLengthMeters(routePolyline),
    });
    if (journeyMinutes != null) {
        if (userHasStartedMoving) {
            console.log(`[ETA] Progress-based: ${(1 - remainingDistanceMeters / getTotalPolylineLengthMeters(routePolyline)).toFixed(2)} complete, ${journeyMinutes.toFixed(1)} min remaining`);
        } else {
            console.log(`[ETA] Pre-movement: Using original duration ${journeyMinutes.toFixed(1)} min`);
        }
        remainingTimeMinutes = applyTrafficRatioToBaseRemaining(journeyMinutes);
    } else {
        remainingTimeMinutes = VoyagrModules.eta().estimateRemainingTimeFromDistance(remainingDistanceMeters);
    }

    // Format remaining time
    timeEl.textContent = formatRemainingTime(remainingTimeMinutes);

    // Calculate ETA
    const now = new Date();
    const eta = new Date(now.getTime() + remainingTimeMinutes * 60000);
    etaEl.textContent = formatETATime(eta);

    console.log(`[Journey Summary] Distance: ${distanceText}, Time: ${formatRemainingTime(remainingTimeMinutes)}, ETA: ${formatETATime(eta)}`);
}

// ===== NOTIFICATIONS SYSTEM =====
let notificationQueue = [];
let lastNotificationTime = 0;
const NOTIFICATION_THROTTLE_MS = 3000; // Prevent notification spam

// ===== LIVE DATA REFRESH SYSTEM (PHASE 1) =====
let trafficRefreshInterval = null;
let etaRefreshInterval = null;
let weatherRefreshInterval = null;
let hazardRefreshInterval = null;

const REFRESH_INTERVALS = {
    traffic_navigation: 300000,    // 5 minutes during navigation
    traffic_idle: 900000,          // 15 minutes when idle
    eta: 30000,                    // 30 seconds during navigation
    weather_navigation: 1800000,   // 30 minutes during navigation
    weather_idle: 3600000,         // 60 minutes when idle
    hazards_navigation: 300000,    // 5 minutes during navigation
    hazards_idle: 600000           // 10 minutes when idle
};

// ===== PWA AUTO-RELOAD SYSTEM (PHASE 2) =====
let updatePending = false;
let appStateBeforeReload = null;

// ===== BATTERY-AWARE REFRESH (PHASE 3) =====
let currentBatteryLevel = 1.0;
let batteryStatusMonitor = null;

// ===== VOICE CONTROL SYSTEM =====
let voiceRecognition = null;
let isListening = false;
/** Latest finalized speech-to-text (interim lines are shown separately in the UI). */
let _voiceFinalTranscript = '';

function voyagrVoiceSetStatus(message) {
    const el = document.getElementById('voiceStatus');
    if (el) el.textContent = message || '';
}

function voyagrVoiceSetListeningUi(listening) {
    const btn = document.getElementById('voiceBtn');
    const btnText = document.getElementById('voiceBtnText');
    const fab = document.getElementById('voiceFab');
    if (btnText) btnText.textContent = listening ? 'Stop' : 'Listen';
    if (btn) {
        btn.classList.toggle('active', !!listening);
        btn.setAttribute('aria-pressed', listening ? 'true' : 'false');
    }
    if (fab) {
        fab.classList.toggle('fab--listening', !!listening);
        fab.setAttribute('aria-pressed', listening ? 'true' : 'false');
        fab.title = listening ? 'Stop voice input' : 'Voice control';
    }
}
let currentLat = 51.5074;
let currentLon = -0.1278;

// ===== AUTO GPS LOCATION FEATURE =====
let autoGpsEnabled = false;
let autoGpsLocationMonitor = null;
const AUTO_GPS_UPDATE_INTERVAL = 5000; // Update every 5 seconds

// ===== VEHICLE TYPE & ROUTING MODE =====
let currentVehicleType = 'petrol_diesel';
let currentRoutingMode = 'auto';
let currentUserMarkerIcon = null;

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
let lastTurnZoomApplied = false;
const ZOOM_LEVELS = {
    'motorway_high_speed': 14,      // > 100 km/h
    'main_road_medium_speed': 15,   // 50-100 km/h
    'urban_low_speed': 16,          // 20-50 km/h
    'parking_very_low_speed': 17,   // < 20 km/h
    'turn_ahead': 18                 // Upcoming turn
};
const TURN_ZOOM_THRESHOLD = 500;    // Zoom in when within 500m of turn
const ZOOM_ANIMATION_DURATION = 0.5; // 500ms smooth animation

// ===== GEOCODING FEATURE =====
let geocodingCache = {};
const GEOCODING_CACHE_KEY = 'voyagr_geocoding_cache';
// Privacy: use server-side proxy endpoints (which can point to self-hosted Nominatim)
const NOMINATIM_API = '/api/geocode';
const NOMINATIM_REVERSE_API = '/api/reverse-geocode';
let isGeocoding = false;

// Initialize Web Speech API
/**
 * initVoiceRecognition function
 * @function initVoiceRecognition
 * @returns {*} Return value description
 */
function initVoiceRecognition() {
    // Avoid re-initializing the Web Speech API multiple times (app.js + onload init).
    if (window.__voyagrVoiceInitialized && voiceRecognition) {
        return true;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.log('[Voice] Web Speech API not supported');
        voyagrVoiceSetStatus('Voice not supported in this browser (try Chrome or Edge).');
        voyagrVoiceSetListeningUi(false);
        return false;
    }

    voiceRecognition = new SpeechRecognition();
    window.__voyagrVoiceInitialized = true;
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = true;
    voiceRecognition.lang = 'en-US';

    voiceRecognition.onstart = () => {
        console.log('[Voice] Listening started');
        _voiceFinalTranscript = '';
        voyagrVoiceSetStatus('Listening… speak now.');
        voyagrVoiceSetListeningUi(true);
    };

    voiceRecognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                _voiceFinalTranscript += chunk;
            } else {
                interim += chunk;
            }
        }
        const shown = (_voiceFinalTranscript + interim).trim();
        const tr = document.getElementById('voiceTranscript');
        if (tr) tr.textContent = shown;
        console.log('[Voice] Transcript:', shown);
    };

    voiceRecognition.onerror = (event) => {
        console.log('[Voice] Error:', event.error);
        const msg =
            event.error === 'not-allowed'
                ? 'Microphone blocked — allow access in the browser bar.'
                : `Could not use the microphone (${event.error}).`;
        voyagrVoiceSetStatus(msg);
        voyagrVoiceSetListeningUi(false);
        isListening = false;
        maybeResumePorcupineWakeAfterVoice();
    };

    voiceRecognition.onend = () => {
        console.log('[Voice] Listening ended');
        voyagrVoiceSetStatus('Processing…');
        voyagrVoiceSetListeningUi(false);
        isListening = false;
    };

    return true;
}

/**
 * toggleVoiceInput function
 * @function toggleVoiceInput
 * @returns {*} Return value description
 */
async function toggleVoiceInput() {
    if (!voiceRecognition) {
        if (!initVoiceRecognition()) {
            return;
        }
    }

    if (isListening) {
        voiceRecognition.stop();
        isListening = false;
    } else {
        if (porcupineWakePipelineRunning) {
            porcupineWakeResumeAfterVoice = true;
            await stopPorcupineWakePipeline();
        }
        const tr = document.getElementById('voiceTranscript');
        if (tr) tr.textContent = '';
        _voiceFinalTranscript = '';
        voiceRecognition.start();
        isListening = true;
    }
}
/**
 * speakText function
 * @function speakText
 * @param {*} text - Parameter description
 * @returns {*} Return value description
 */
function speakText(text) {
    if (!('speechSynthesis' in window)) {
        console.log('[Voice] Speech Synthesis not supported');
        return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
        console.log('[Voice] Speaking:', text);
        voyagrVoiceSetStatus('Speaking…');
    };

    utterance.onend = () => {
        console.log('[Voice] Speech ended');
        voyagrVoiceSetStatus('Ready');
    };

    utterance.onerror = (event) => {
        console.log('[Voice] Speech error:', event.error);
        voyagrVoiceSetStatus('Speech playback error: ' + event.error);
    };

    window.speechSynthesis.speak(utterance);
}

// Override voice recognition onend to process command
/**
 * setupVoiceCommandProcessing function
 * @function setupVoiceCommandProcessing
 * @returns {*} Return value description
 */
function setupVoiceCommandProcessing() {
    if (!voiceRecognition) return;

    const originalOnEnd = voiceRecognition.onend;
    voiceRecognition.onend = function () {
        originalOnEnd.call(this);

        let transcript = (_voiceFinalTranscript || '').trim();
        if (!transcript) {
            const tr = document.getElementById('voiceTranscript');
            transcript = (tr && tr.textContent) ? String(tr.textContent).trim() : '';
        }
        if (transcript) {
            processVoiceCommand(transcript);
        } else {
            voyagrVoiceSetStatus('Ready');
            maybeResumePorcupineWakeAfterVoice();
        }
    };
}
/**
 * processVoiceCommand function
 * @function processVoiceCommand
 * @param {*} command - Parameter description
 * @returns {*} Return value description
 */
function processVoiceCommand(command) {
    if (!command) {
        maybeResumePorcupineWakeAfterVoice();
        return;
    }

    console.log('[Voice] Processing command:', command);
    voyagrVoiceSetStatus('Working on: ' + command);

    fetch('/api/voice/command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: command,
            lat: currentLat,
            lon: currentLon
        })
    })
        .then(response => response.json())
        .then(data => {
            console.log('[Voice] Command result:', data);

            if (data.success) {
                handleVoiceAction(data);
                speakText(data.message);
            } else {
                speakText(data.message || 'Command not recognized');
                voyagrVoiceSetStatus(data.message || 'Command failed');
            }
        })
        .catch(error => {
            console.log('[Voice] Error:', error);
            speakText('Error processing command');
            voyagrVoiceSetStatus('Error: ' + error.message);
        })
        .finally(() => {
            maybeResumePorcupineWakeAfterVoice();
        });
}
/**
 * handleVoiceAction function
 * @function handleVoiceAction
 * @param {*} data - Parameter description
 * @returns {*} Return value description
 */
function handleVoiceAction(data) {
    const action = data.action;

    switch (action) {
        case 'navigate':
            document.getElementById('end').value = data.location;
            calculateRoute();
            break;

        case 'search':
            document.getElementById('end').value = data.search_term;
            calculateRoute();
            break;

        case 'set_preference':
            console.log('[Voice] Setting preference:', data.preference, '=', data.value);
            // Store preference in localStorage
            localStorage.setItem('voice_pref_' + data.preference, JSON.stringify(data.value));
            break;

        case 'get_info':
            console.log('[Voice] Getting info:', data.info_type);
            // This would be handled by the app based on current route
            break;

        case 'report_hazard':
            console.log('[Voice] Reporting hazard:', data.hazard_type);
            // Report hazard to backend
            fetch('/api/hazards/report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    lat: currentLat,
                    lon: currentLon,
                    hazard_type: data.hazard_type,
                    description: data.description || '',
                    severity: 'medium'
                })
            })
                .then(r => r.json())
                .then((r) => {
                    console.log('[Voice] Hazard reported:', r);
                    if (!r.success && r.error) {
                        showStatus('Voice report: ' + r.error, 'warning');
                    }
                })
                .catch((e) => console.warn('[Voice] Hazard report failed:', e));
            break;

        case 'reroute':
            console.log('[Voice] Rerouting from current location');
            if (routeInProgress && currentLat && currentLon) {
                // Trigger automatic reroute from current position
                triggerAutomaticReroute(currentLat, currentLon);
                speakMessage('Recalculating route from your current location');
            } else {
                speakMessage('No active route to recalculate');
            }
            break;
    }
}

/**
 * setupMapMoveHandler function
 * @function setupMapMoveHandler
 * @returns {void}
 */
function setupMapMoveHandler() {
    if (!map) {
        console.log('[Map] Map not initialized yet, deferring move handler setup');
        return;
    }

    // Keep "current" position in sync with map center for voice/hazards while browsing.
    // During GPS tracking or turn-by-turn navigation, currentLat/currentLon are owned by
    // watchPosition — map pans/zooms (including follow-camera) must NOT overwrite them or
    // reroutes recalculate from the wrong place.
    map.on('move', () => {
        if (routeInProgress || isTrackingActive) return;
        const center = map.getCenter();
        currentLat = center.lat;
        currentLon = center.lng;
    });
}

/**
 * Pause follow when the user explores the map (Waze-style) and show the recenter button.
 */
function setupMapExploreHandlers() {
    if (!map) {
        console.log('[Map] Map not initialized yet, deferring explore handler setup');
        return;
    }
    if (window.__voyagrMapExploreHandlersInitialized) return;
    window.__voyagrMapExploreHandlersInitialized = true;

    const onUserMapGesture = (e) => {
        if (!e || !e.originalEvent) return;
        if (!routeInProgress && !isTrackingActive) return;
        if (routeInProgress && zoomAndFollowEnabled && mapFollowingActive) {
            mapFollowingActive = false;
            console.log('[Nav] User explored map — follow paused');
        }
        updateRecenterButtonVisibility();
    };

    map.on('dragstart', onUserMapGesture);
    map.on('zoomstart', onUserMapGesture);
    map.on('rotatestart', onUserMapGesture);
    map.on('pitchstart', onUserMapGesture);
    map.on('moveend', () => {
        updateRecenterButtonVisibility();
    });
}

// Initialize voice recognition on page load
window.addEventListener('load', () => {
    console.log('[Voice] Initializing voice system');
    initVoiceRecognition();
    setupVoiceCommandProcessing();
    // Note: initBottomSheet() is already called from app.js
    initGeocodeCache();

    // Load all persistent settings from localStorage
    console.log('[Settings] Loading all persistent settings...');
    ensureDefaultTrafficAwareRouting();
    loadAllSettings();
    applySettingsToUI();

    // Load parking preferences
    console.log('[Parking] Loading parking preferences...');
    loadParkingPreferences();

    // Load voice preferences (FIXED: was missing)
    console.log('[Voice] Loading voice preferences...');
    loadVoicePreferences();
    loadPorcupineWakeUi();

    void (async () => {
        if (
            localStorage.getItem(VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) === 'true' &&
            picovoiceClientConfigured()
        ) {
            await startPorcupineWakePipeline();
        }
    })();

    // Legacy preference loading (for backward compatibility)
    loadPreferences();

    // Initialize traffic layer based on saved preference
    console.log('[Traffic] Initializing traffic layer...');
    initTrafficLayer();

    // Initialize weather layer based on saved preference
    console.log('[Weather] Initializing weather layer...');
    initWeatherLayer();

    // Initialize road labels after map is ready
    console.log('[Road Labels] Initializing road labels...');
    if (typeof map !== 'undefined' && map) {
        if (map.isStyleLoaded()) {
            initializeRoadLabels();
        } else {
            map.once('style.load', () => {
                initializeRoadLabels();
            });
        }
    } else {
        // Map not ready yet, wait a bit and try again
        setTimeout(() => {
            if (typeof map !== 'undefined' && map) {
                initializeRoadLabels();
            }
        }, 1000);
    }

    console.log('[Init] Vehicle Type:', currentVehicleType, 'Routing Mode:', currentRoutingMode, 'Smart Zoom:', smartZoomEnabled);
    console.log('[Init] All settings loaded and applied successfully');
});

// ===== BOTTOM SHEET FUNCTIONALITY =====
/**
 * initBottomSheet function
 * @function initBottomSheet
 * @returns {*} Return value description
 */
function initBottomSheet() {
    const bottomSheet = document.getElementById('bottomSheet');
    const handle = document.querySelector('.bottom-sheet-handle');
    const header = document.querySelector('.bottom-sheet-header');
    let isDragging = false;

    console.log('[BottomSheet] Initializing...', { bottomSheet, handle, header });

    if (!bottomSheet || !handle) {
        console.error('[BottomSheet] ERROR: bottomSheet or handle not found!');
        return;
    }

    // Click on handle or header to expand/collapse
    handle.addEventListener('click', (e) => {
        console.log('[BottomSheet] Handle clicked, expanded:', bottomSheetIsExpanded);
        e.stopPropagation();
        if (bottomSheetIsExpanded) {
            collapseBottomSheet();
        } else {
            expandBottomSheet();
        }
    });

    if (header) {
        header.addEventListener('click', (e) => {
            // Don't expand if clicking on the icon buttons
            if (voyagrClosest(e.target, 'button')) return;
            e.stopPropagation();
            if (bottomSheetIsExpanded) {
                collapseBottomSheet();
            } else {
                expandBottomSheet();
            }
        });
    }

    // NEW: Allow expanding by clicking anywhere on the bottom sheet when collapsed
    // But only if clicking on handle/header, not on content (to allow scrolling)
    bottomSheet.addEventListener('click', (e) => {
        // Don't expand if clicking inside the content area (allows interaction with buttons, scroll, etc.)
        if (voyagrClosest(e.target, '.bottom-sheet-content')) {
            return;
        }
        if (!bottomSheetIsExpanded) {
            console.log('[BottomSheet] Sheet clicked while collapsed - Expanding');
            expandBottomSheet();
        }
    });

    // Touch events for dragging - supports BOTH expand (swipe up) and collapse (swipe down)
    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        bottomSheetStartY = e.touches[0].clientY;
        bottomSheetCurrentY = bottomSheetStartY;
        bottomSheet.style.transition = 'none'; // Disable transitions during drag
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        bottomSheetCurrentY = e.touches[0].clientY;
        const diff = bottomSheetCurrentY - bottomSheetStartY;

        // Visual feedback during drag
        if (bottomSheetIsExpanded && diff > 0) {
            // Dragging down while expanded - allow collapse gesture
            bottomSheet.style.transform = `translateY(${diff}px)`;
        } else if (!bottomSheetIsExpanded && diff < 0) {
            // Dragging up while collapsed - show preview of expansion
            // Limit the visual feedback to prevent over-dragging
            const clampedDiff = Math.max(diff, -100);
            bottomSheet.style.transform = `translateY(${clampedDiff}px)`;
        }
    }, { passive: true });

    handle.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = bottomSheetCurrentY - bottomSheetStartY;
        const threshold = 50; // Reduced threshold for better responsiveness

        // Re-enable transitions for smooth animation
        bottomSheet.style.transition = '';
        bottomSheet.style.transform = '';

        if (bottomSheetIsExpanded && diff > threshold) {
            // Swiped down while expanded - collapse
            collapseBottomSheet();
            console.log('[BottomSheet] Collapsed via swipe down');
        } else if (!bottomSheetIsExpanded && diff < -threshold) {
            // Swiped up while collapsed - expand
            expandBottomSheet();
            console.log('[BottomSheet] Expanded via swipe up');
        }
    }, { passive: true });

    // Mouse events for desktop browsers - supports BOTH expand and collapse
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        bottomSheetStartY = e.clientY;
        bottomSheetCurrentY = bottomSheetStartY;
        bottomSheet.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        bottomSheetCurrentY = e.clientY;
        const diff = bottomSheetCurrentY - bottomSheetStartY;

        if (bottomSheetIsExpanded && diff > 0) {
            // Dragging down while expanded
            bottomSheet.style.transform = `translateY(${diff}px)`;
        } else if (!bottomSheetIsExpanded && diff < 0) {
            // Dragging up while collapsed
            const clampedDiff = Math.max(diff, -100);
            bottomSheet.style.transform = `translateY(${clampedDiff}px)`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = bottomSheetCurrentY - bottomSheetStartY;
        const threshold = 50; // pixels

        bottomSheet.style.transition = '';
        bottomSheet.style.transform = '';

        if (bottomSheetIsExpanded && diff > threshold) {
            // Collapse
            collapseBottomSheet();
        } else if (!bottomSheetIsExpanded && diff < -threshold) {
            // Expand
            expandBottomSheet();
        }
    });

    // Expand on input focus
    document.getElementById('start').addEventListener('focus', expandBottomSheet);
    document.getElementById('end').addEventListener('focus', expandBottomSheet);

    syncBottomSheetOverlapFabs();
}

/**
 * expandBottomSheet function
 * @function expandBottomSheet
 * @returns {*} Return value description
 */
function expandBottomSheet() {
    const bottomSheet = document.getElementById('bottomSheet');
    if (!bottomSheet) return;

    console.log('[BottomSheet] Expanding...');

    // Clear any inline styles that might interfere with CSS-based expand
    bottomSheet.style.height = '';
    bottomSheet.style.transform = '';
    bottomSheet.style.transition = '';

    bottomSheet.classList.add('expanded');
    bottomSheet.setAttribute('aria-expanded', 'true');
    bottomSheetIsExpanded = true;
    console.log('[BottomSheet] Expanded, classes:', bottomSheet.className);
    syncBottomSheetOverlapFabs();
}

/**
 * collapseBottomSheet function
 * @function collapseBottomSheet
 * @returns {*} Return value description
 */
function collapseBottomSheet() {
    const bottomSheet = document.getElementById('bottomSheet');
    if (!bottomSheet) return;

    console.log('[BottomSheet] Collapsing...');

    // Clear any inline styles that might interfere with CSS-based collapse
    bottomSheet.style.height = '';
    bottomSheet.style.transform = '';
    bottomSheet.style.transition = '';

    bottomSheet.classList.remove('expanded');
    bottomSheet.setAttribute('aria-expanded', 'false');
    bottomSheetIsExpanded = false;
    const content = bottomSheet.querySelector('.bottom-sheet-content');
    if (content) content.scrollTop = 0;
    syncBottomSheetOverlapFabs();
}

// ===== GPS TRACKING FUNCTIONS =====
/**
 * startGPSTracking function
 * @function startGPSTracking
 * @returns {*} Return value description
 */
function startGPSTracking() {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    if (isTrackingActive) {
        stopGPSTracking();
        return;
    }

    isTrackingActive = true;
    trackingHistory = [];
    _lastGoodRawPickMph = 0;
    _consecutiveDisplacementMoves = 0;
    _smoothedSpeedMph = 0;
    _smoothedSpeedInitAt = 0;
    resetVehicleMarkerDisplayState();
    window.__voyagrLastFollowEaseAt = 0;
    window.__voyagrLastFollowCenterGeo = null;
    showStatus('🎯 GPS Tracking started...', 'success');

    // Watch position with high accuracy
    gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            // `coords.speed` is m/s but is `null` on some Android browsers / iOS WebViews even
            // while moving. `pickRawSpeedMph` reconstructs speed from successive fixes in that
            // case so the widget keeps reading correctly. Stored as m/s for downstream consumers
            // that still expect that unit (vehicle marker, trackingHistory, etc.).
            const rawCoordsSpeed = position.coords.speed;
            const speed = (Number.isFinite(rawCoordsSpeed) && rawCoordsSpeed >= 0) ? rawCoordsSpeed : 0;
            const deviceHeading = typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)
                ? position.coords.heading
                : null;

            currentLat = lat;
            currentLon = lon;
            updateRoadReportFabVisibility();

            // Add to tracking history
            trackingHistory.push({
                lat: lat,
                lon: lon,
                timestamp: new Date(),
                speed: speed,
                accuracy: accuracy
            });
            if (trackingHistory.length > 40) {
                trackingHistory.splice(0, trackingHistory.length - 40);
            }

            // Whole-journey odometer: sum plausible movement between raw fixes. Gating on a
            // minimum step (drops stationary GPS jitter) and a max step/speed (drops teleports)
            // keeps it close to real driven distance for the end-of-trip summary.
            if (routeInProgress) {
                const odoNow = Date.now();
                if (_navOdometerLastGeo) {
                    const segM = calculateDistanceMeters(_navOdometerLastGeo.lat, _navOdometerLastGeo.lon, lat, lon);
                    const dtS = (odoNow - _navOdometerLastGeo.t) / 1000;
                    if (dtS > 0.2 && dtS < 30) {
                        const segSpeedMph = Number.isFinite(segM) ? (segM / dtS) * 2.237 : Infinity;
                        if (Number.isFinite(segM) && segM >= 3 && segM < 400 && segSpeedMph <= 160) {
                            _navTraveledMeters += segM;
                        }
                        // Advance the anchor each sane tick so a rejected jump can't make the
                        // next segment measure from a stale point.
                        _navOdometerLastGeo = { lat, lon, t: odoNow };
                    }
                } else {
                    _navOdometerLastGeo = { lat, lon, t: odoNow };
                }
            }

            // Prefer device compass/course when moving; otherwise motion vector from recent fixes.
            let gpsHeadingForBlend = 0;
            if (deviceHeading != null && speed > 1.5) {
                gpsHeadingForBlend = (deviceHeading + 360) % 360;
            } else if (trackingHistory.length > 1) {
                const curr = trackingHistory[trackingHistory.length - 1];
                let prev = trackingHistory[trackingHistory.length - 2];
                for (let i = trackingHistory.length - 2; i >= 0 && i >= trackingHistory.length - 6; i--) {
                    const p = trackingHistory[i];
                    const segM = calculateDistanceMeters(p.lat, p.lon, curr.lat, curr.lon);
                    if (segM >= 3) {
                        prev = p;
                        break;
                    }
                }
                const dLon = curr.lon - prev.lon;
                const dLat = curr.lat - prev.lat;
                if (Math.abs(dLon) + Math.abs(dLat) > 1e-7) {
                    gpsHeadingForBlend = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
                }
            }
            let heading = gpsHeadingForBlend;

            /** Single raw-speed sample / tick (clamped inside pickRawSpeedMph) for zoom + HUD. */
            const speedMph = pickRawSpeedMph(rawCoordsSpeed, trackingHistory, accuracy);

            // SNAP TO ROUTE: blend snapped↔raw with accuracy‑widened corridor (reduces 50 m hysteresis jitter).
            let displayLat = lat;
            let displayLon = lon;

            if (routeInProgress && routePolyline && routePolyline.length >= 2) {
                const snapped = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);

                let routeBearing = gpsHeadingForBlend;
                if (snapped.index < routePolyline.length - 1) {
                    const rA = routePolyline[snapped.index];
                    const rB = routePolyline[snapped.index + 1];
                    routeBearing = calculateBearing(rA[0], rA[1], rB[0], rB[1]);
                }

                const horizAcc =
                    typeof accuracy === 'number' && accuracy > 1 && accuracy < 520 ? accuracy : null;

                // Lock the vehicle icon to the route whenever we are plausibly near it.
                // Within `snapLockMeters` the marker snaps fully (weight 1) so it rides the
                // polyline like Google/Waze instead of oscillating between the snapped point
                // and noisy raw GPS (the "jumping" that also spammed false reroutes). The lock
                // radius widens with poor GPS accuracy. Past a short release band we fall back
                // to raw GPS, because that far off the line is a genuine deviation.
                const distSnap = snapped.distance;
                const snapLockMeters = Math.max(
                    SNAP_NEAR_ROUTE_FORCE_METERS,
                    horizAcc != null ? horizAcc * SNAP_LOCK_ACC_SCALE : 0
                );
                const SGsnap = _speedGps();
                let effectiveBlend = 0;
                if (SGsnap) {
                    const snapBlend = SGsnap.computeSnapBlendWeight({
                        distSnap: distSnap,
                        snapLockMeters: snapLockMeters,
                        prevWeightState: _snapBlendWeightState
                    });
                    _snapBlendWeightState = snapBlend.weightState;
                    effectiveBlend = snapBlend.effectiveBlend;
                }

                displayLat = lat + (snapped.lat - lat) * effectiveBlend;
                displayLon = lon + (snapped.lon - lon) * effectiveBlend;
                heading = blendHeadingsCircular(gpsHeadingForBlend, routeBearing, effectiveBlend);

                // Advance along-route index when moving forward. Never jump backwards while
                // driving — that made the marker hop to an earlier polyline vertex each tick.
                const SGidx = _speedGps();
                lastSnappedRouteIndex = SGidx
                    ? SGidx.advanceSnappedRouteIndex(snapped.index, lastSnappedRouteIndex, speedMph)
                    : Math.max(lastSnappedRouteIndex, snapped.index);
            }

            // Smooth the displayed position so raw↔snap blend changes don't jerk the icon.
            let followJumpM = Number.POSITIVE_INFINITY;
            try {
                const lc = window.__voyagrLastFollowCenterGeo;
                if (lc && Number.isFinite(lc.lat) && Number.isFinite(lc.lon)) {
                    followJumpM = calculateDistanceMeters(displayLat, displayLon, lc.lat, lc.lon);
                }
            } catch (_ej) {
                /* ignore */
            }
            if (_smoothDisplayLat != null && _smoothDisplayLon != null) {
                const smoothDeltaM = calculateDistanceMeters(
                    _smoothDisplayLat, _smoothDisplayLon, displayLat, displayLon
                );
                if (Number.isFinite(smoothDeltaM)) {
                    followJumpM = Math.max(followJumpM, smoothDeltaM);
                }
            }
            if (_smoothDisplayLat == null || _smoothDisplayLon == null) {
                _smoothDisplayLat = displayLat;
                _smoothDisplayLon = displayLon;
            } else {
                const SGpos = _speedGps();
                if (SGpos) {
                    _smoothDisplayLat = SGpos.smoothDisplayCoordinate(_smoothDisplayLat, displayLat, followJumpM);
                    _smoothDisplayLon = SGpos.smoothDisplayCoordinate(_smoothDisplayLon, displayLon, followJumpM);
                } else {
                    _smoothDisplayLat = displayLat;
                    _smoothDisplayLon = displayLon;
                }
            }
            const markerLat = _smoothDisplayLat;
            const markerLon = _smoothDisplayLon;

            // Update user marker on map with vehicle icon and heading
            // FIX: Reuse the existing marker and call setLngLat for smooth movement
            // instead of removing and recreating every tick (which kills CSS transitions)
            if (currentUserMarker && typeof currentUserMarker.setLngLat === 'function') {
                // Move existing marker smoothly
                currentUserMarker.setLngLat([markerLon, markerLat]);

                // Update heading rotation on the inner element
                const markerEl = currentUserMarker.getElement ? currentUserMarker.getElement() : null;
                if (markerEl) {
                    const inner = markerEl.querySelector('div');
                    if (inner) {
                        const mapBr = map && typeof map.getBearing === 'function' ? map.getBearing() : 0;
                        const rot = ((heading - mapBr) % 360 + 360) % 360;
                        inner.style.transform = `rotate(${rot}deg)`;
                    }
                }
                // Store updated values
                currentUserMarker.heading = heading;
                currentUserMarker.speed = speed;
                currentUserMarker.accuracy = accuracy;
            } else {
                // First time or marker was cleared — create fresh
                if (currentUserMarker && typeof currentUserMarker.remove === 'function') {
                    currentUserMarker.remove();
                }
                currentUserMarker = createVehicleMarker(markerLat, markerLon, speed, accuracy, heading);
                currentUserMarker.addTo(map);
            }

            // ===== ZOOM AND FOLLOW: Center map on user with smart zoom =====
            const FOLLOW_EASE_MIN_MS = 400;
            const nowCam = Date.now();
            const followDue = nowCam - (window.__voyagrLastFollowEaseAt || 0) >= FOLLOW_EASE_MIN_MS;
            const followUrgent = followJumpM > 40;

            if (zoomAndFollowEnabled && mapFollowingActive && map) {
                const smartZoom = calculateSmartZoom(speedMph, null, 'motorway');

                // Heading-up follow during active nav (or driver-view browsing). Tilt to 60° unless
                // the user picked the flat 2D map view, in which case stay heading-up but flat.
                const pitch = shouldTiltDrivingCamera() ? 60 : 0;
                const padding = getNavigationFollowPadding();
                const bearing = shouldUsePitchedDrivingCamera() ? (heading || map.getBearing()) : 0;

                if (followDue || followUrgent) {
                    window.__voyagrLastFollowEaseAt = nowCam;
                    window.__voyagrLastFollowCenterGeo = { lat: markerLat, lon: markerLon };

                    const dur = followJumpM > 95 ? 780 : Math.min(680, FOLLOW_EASE_MIN_MS + 240);
                    map.easeTo({
                        center: [markerLon, markerLat], // MapLibre uses [lon, lat]
                        zoom: smartZoom,
                        bearing: bearing,
                        pitch: pitch,
                        padding: padding,
                        duration: dur,
                        essential: true
                    });
                }

                console.log(`[Navigation] View: pitch ${pitch}°, bearing ${Math.round(bearing)}°, zoom ${smartZoom.toFixed(1)}, pitchedNav: ${isActiveNavigationFollow()}, pref: ${driverPerspectiveEnabled}`);
                updateRecenterButtonVisibility();
            } else if (map && !zoomAndFollowEnabled && !map._userPanned) {
                if (followDue || followUrgent) {
                    window.__voyagrLastFollowEaseAt = nowCam;
                    window.__voyagrLastFollowCenterGeo = { lat: markerLat, lon: markerLon };
                    map.easeTo({
                        center: [markerLon, markerLat],
                        zoom: 16,
                        padding: routeInProgress ? getNavigationFollowPadding() : undefined,
                        duration: followJumpM > 95 ? 650 : 420
                    });
                }
            }

            // Check for route deviation
            if (routeInProgress && routePolyline) {
                checkRouteDeviation(lat, lon, accuracy);
            }

            // Hazards: route-embedded alerts work offline; nearby API when online
            processNavigationHazardAlerts(lat, lon);

            // Apply smart zoom with turn detection
            let distanceToNextTurn = null;

            // Detect upcoming turns if navigation is active
            if (routeInProgress && routePolyline && routePolyline.length > 0) {
                const turnInfo = detectUpcomingTurn(lat, lon);
                if (turnInfo) {
                    distanceToNextTurn = turnInfo.distance;

                    // Voice announcements (only at specific distance thresholds)
                    announceUpcomingTurn(turnInfo);
                }

                // Visual turn display (updates independently on every GPS update)
                // This provides continuous visual feedback regardless of voice announcement timing
                updateTurnWidgetFromPosition(lat, lon);

                // NEW: Announce distance to destination
                announceDistanceToDestination(lat, lon);

                checkNavigationArrival(lat, lon, speed);

                // FIXED: Removed announceETAUpdate() from GPS callback
                // ETA is now announced only via interval timer (every 10 minutes)
                // This prevents ETA from being announced every 1-5 seconds
            }

            applySmartZoomWithAnimation(speedMph, distanceToNextTurn, 'motorway', lat, lon);

            // Update lane guidance if navigating
            if (routeInProgress && currentRouteSteps.length > 0) {
                const nextStep = currentRouteSteps[currentStepIndex];
                let maneuverDir = 'straight';
                if (nextStep) {
                    const mType = nextStep.type || 0;
                    // Map Valhalla type to lane guidance maneuver direction
                    if ([15].includes(mType)) maneuverDir = 'left';
                    else if ([14].includes(mType)) maneuverDir = 'sharp_left';
                    else if ([16, 19, 24].includes(mType)) maneuverDir = 'slight_left';
                    else if ([10].includes(mType)) maneuverDir = 'right';
                    else if ([11].includes(mType)) maneuverDir = 'sharp_right';
                    else if ([9, 18, 23].includes(mType)) maneuverDir = 'slight_right';
                    else if ([20].includes(mType)) maneuverDir = 'exit_right';
                    else if ([21].includes(mType)) maneuverDir = 'exit_left';
                    else if ([12, 13].includes(mType)) maneuverDir = 'uturn';
                    else if ([25, 35, 36].includes(mType)) maneuverDir = 'merge';
                    else if ([26, 27].includes(mType)) maneuverDir = 'roundabout';
                    else if ([4, 5, 6].includes(mType)) maneuverDir = 'destination';
                }
                const exitCount = (maneuverDir === 'roundabout')
                    ? effectiveRoundaboutExitCount(currentStepIndex)
                    : 0;
                updateLaneGuidance(lat, lon, heading, maneuverDir, exitCount);
            }

            const displaySpeedMph = smoothGpsSpeedMph(speedMph);

            if (routeInProgress || isTrackingActive) {
                const activeManeuverIdx = (routeInProgress && routePolyline && routePolyline.length >= 2)
                    ? getActiveRouteManeuverIndex(lastSnappedRouteIndex)
                    : -1;
                const activeManeuver = (activeManeuverIdx >= 0 && currentRouteSteps && activeManeuverIdx < currentRouteSteps.length)
                    ? currentRouteSteps[activeManeuverIdx]
                    : null;
                const roadType = activeManeuverIdx >= 0
                    ? getCurrentRoadType(activeManeuverIdx, displaySpeedMph)
                    : getCurrentRoadType(undefined, displaySpeedMph);

                let valhallaSpeedLimitMph = null;
                if (activeManeuver) {
                    const rawSl = activeManeuver.speed_limit != null ? Number(activeManeuver.speed_limit) : NaN;
                    if (Number.isFinite(rawSl) && rawSl > 0) {
                        valhallaSpeedLimitMph = normalizeManeuverSpeedLimitMph(
                            rawSl, activeManeuver.road_class || roadType, displaySpeedMph
                        );
                    }
                }
                // The hint above is validated against the maneuver's own road_class, which can
                // outlast the road you're actually on (e.g. a 70 mph motorway edge lingering
                // after you turn onto a 30 mph street). This is the display fallback used when
                // the speed-limit API has no data, so re-check it against the CURRENT road type
                // and drop it if implausible — mirrors the API-side road-type sanitisation.
                if (valhallaSpeedLimitMph != null) {
                    const _sgLimit = _speedGps();
                    if (_sgLimit && typeof _sgLimit.isPlausibleEdgeSpeedLimitMph === 'function'
                        && !_sgLimit.isPlausibleEdgeSpeedLimitMph(valhallaSpeedLimitMph, roadType, displaySpeedMph)) {
                        valhallaSpeedLimitMph = null;
                    }
                }

                if (activeManeuverIdx >= 0 && activeManeuverIdx !== _lastActiveManeuverIdx) {
                    _lastActiveManeuverIdx = activeManeuverIdx;
                    const state = _getSpeedLimitFetchState();
                    if (state) {
                        state.lastFetchAt = 0;
                        state.lastPosition = null;
                    }
                }

                const SL = _speedLimitWidget();
                const shownLimit = SL
                    ? SL.pickDisplaySpeedLimitMph(
                        currentSpeedLimitMph,
                        valhallaSpeedLimitMph,
                        roadType,
                        lastSpeedLimitRegion
                    )
                    : (currentSpeedLimitMph && currentSpeedLimitMph > 0 ? currentSpeedLimitMph : valhallaSpeedLimitMph);
                updateSpeedWidget(displaySpeedMph, shownLimit);
                fetchSpeedLimitThrottled(lat, lon, displaySpeedMph, roadType, valhallaSpeedLimitMph, heading);
            } else {
                updateSpeedWidget(displaySpeedMph, null);
            }

            if (routeInProgress) {
                fetchRoadNameThrottled(lat, lon);
            }
        },
        (error) => {
            showStatus('GPS Error: ' + error.message, 'error');
            isTrackingActive = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

/**
 * stopGPSTracking function
 * @function stopGPSTracking
 * @returns {*} Return value description
 */
function stopGPSTracking() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    isTrackingActive = false;
    resetVehicleMarkerDisplayState();
    // Hide speed widget when tracking stops (use consolidated function)
    updateSpeedWidgetVisibility();
    updateRoadReportFabVisibility();
    showStatus('🛑 GPS Tracking stopped', 'info');
}

// Turn announcement variables
let announcedTurnThresholds = new Set();  // FIXED: Track each threshold independently
const TURN_ANNOUNCEMENT_DISTANCES = [500, 200, 100, 50]; // meters

// Motorway/Highway exit announcement distances (much earlier warnings at speed)
const EXIT_ANNOUNCEMENT_DISTANCES = [2000, 800, 200, 100]; // meters (2km, 800m, 200m, 100m exit now)
let announcedExitThresholds = new Set();  // Track exit announcements separately

// Keep right/left (fork/veer) announcement distances — earlier than turns, less than exits
const KEEP_ANNOUNCEMENT_DISTANCES = [1000, 400, 150, 50]; // meters
let announcedKeepThresholds = new Set();
/** Per-maneuver voice dedup — cleared when maneuver index or category changes. */
let _voiceAnnouncedForManeuverIndex = null;
let _voiceAnnouncedCategory = null;

// Distance-to-destination announcement variables
let lastDestinationAnnouncementDistance = Infinity;
const DESTINATION_ANNOUNCEMENT_DISTANCES = [10000, 5000, 2000, 1000, 500, 100]; // meters (10km, 5km, 2km, 1km, 500m, 100m)

/** Along-route remaining distance (m) at or below which navigation auto-ends. */
const NAV_ARRIVAL_END_REMAINING_M = 40;
/** Wider zone: slow/stopped dwell also ends navigation (car parks, last leg). */
const NAV_ARRIVAL_DWELL_REMAINING_M = 55;
const NAV_ARRIVAL_DWELL_MS = 3500;
const NAV_ARRIVAL_MAX_SPEED_MS = 1.2;
/** Suppress deviation reroute near destination (Waze-style parking-lot loops). */
const NAV_ARRIVAL_SUPPRESS_REROUTE_METERS = 100;
let _navigationArrivalTriggered = false;
let _navigationArrivalZoneSince = 0;

// Odometer for the whole journey actually driven. Accumulated from GPS fixes so the
// end-of-trip summary reflects real distance travelled (including reroutes/detours),
// not just the final route leg stored in window.lastCalculatedRoute.
let _navTraveledMeters = 0;
let _navOdometerLastGeo = null;
let _navStartedAt = 0;

// ETA announcement variables
let lastETAAnnouncementTime = 0;
let lastAnnouncedETA = null;
const ETA_ANNOUNCEMENT_INTERVAL_MS = 600000; // Announce ETA every 10 minutes (600,000 ms)
const ETA_INITIAL_ANNOUNCE_DELAY_MS = 30000; // First check for initial ETA voice after navigation starts
/** Initial ETA is deferred until movement; retry interval and cap (avoids repeating ETA while stationary). */
const INITIAL_ETA_MOVEMENT_RETRY_MS = 20000;
const INITIAL_ETA_MOVEMENT_MAX_RETRIES = 15; // ~5 minutes of retries, then skip initial ETA
let initialETAMovementRetries = 0;
const NAV_TRAFFIC_ETA_MIN_INTERVAL_MS = 12000; // Min time between traffic-conditions fetches (ETA refresh is ~30s)
const ETA_CHANGE_THRESHOLD_MS = 300000; // Announce if ETA changes by >5 minutes (300,000 ms)
const ETA_MIN_INTERVAL_MS = 60000; // Minimum 1 minute between any ETA announcements (prevents excessive frequency)

let initialETAAnnouncementTimeoutId = null;
let lastNavTrafficFetchAt = 0;
/** Live nav ETA + traffic snapshot (updated during navigation). */
window.navETASnapshot = {
    baseRemainingMinutes: 0,
    trafficAdjustedMinutes: null,
    trafficLevel: null,
    congestionPercent: null,
    progressPercent: 0,
    trafficFetchAt: 0,
    baseAtTrafficFetch: 0
};

/** First-time default: traffic-aware ETA on; only explicit 'false' disables. */
function ensureDefaultTrafficAwareRouting() {
    VoyagrModules.eta().ensureDefaultTrafficAwareRouting(localStorage);
}

function shouldApplyTrafficAwareETA() {
    return VoyagrModules.eta().shouldApplyTrafficAwareETA(localStorage, currentRoutingMode);
}

function getRouteOriginalDurationMinutes() {
    return VoyagrModules.eta().normalizeRouteDurationMinutes(window.lastCalculatedRoute);
}

/**
 * Progress-based remaining time (minutes) from GPS on polyline; same basis as server route duration.
 * @returns {{ originalDurationMinutes: number, timeRemainingMinutes: number, progressPercent: number } | null}
 */
function computeBaseNavigationETAMinutes() {
    return VoyagrModules.eta().computeBaseNavigationETAMinutes({
        routeInProgress: routeInProgress,
        lastCalculatedRoute: window.lastCalculatedRoute,
        polyline: routePolyline,
        originalDurationMinutes: getRouteOriginalDurationMinutes(),
        userHasStartedMoving: hasUserStartedMoving(),
        currentLat: currentLat,
        currentLon: currentLon,
        lastSnappedRouteIndex: lastSnappedRouteIndex,
        routeGeometry: VoyagrModules.routeGeometry(),
    });
}

function applyTrafficRatioToBaseRemaining(baseRemainingMinutes) {
    return VoyagrModules.eta().applyTrafficRatioToBaseRemaining(
        baseRemainingMinutes,
        window.navETASnapshot,
        Date.now(),
        shouldApplyTrafficAwareETA()
    );
}

async function refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch = false) {
    window.navETASnapshot.baseRemainingMinutes = baseRemainingMinutes;
    window.navETASnapshot.progressPercent = progressPercent;

    if (!shouldApplyTrafficAwareETA() || !currentLat || !currentLon) {
        window.navETASnapshot.trafficAdjustedMinutes = null;
        return;
    }

    const now = Date.now();
    if (!VoyagrModules.eta().shouldRefreshNavTrafficETA(
        now,
        lastNavTrafficFetchAt,
        NAV_TRAFFIC_ETA_MIN_INTERVAL_MS,
        forceFetch,
        !!window.navETASnapshot.trafficFetchAt
    )) {
        return;
    }
    lastNavTrafficFetchAt = now;

    try {
        const flow = await getRouteTrafficAhead(forceFetch);
        const trafficUpdate = VoyagrModules.eta().buildTrafficSnapshotFromFlow(
            baseRemainingMinutes,
            flow,
            Date.now()
        );
        if (trafficUpdate) {
            window.navETASnapshot = {
                ...window.navETASnapshot,
                ...trafficUpdate,
            };
        } else {
            window.navETASnapshot.trafficAdjustedMinutes = null;
        }
    } catch (e) {
        console.warn('[ETA] Traffic flow fetch failed:', e);
    }
}

function renderTurnInfoETAPanel(baseMinutes, adjustedMinutes, progressPercent, trafficLevel, congestionPercent) {
    const turnInfo = document.getElementById('turnInfo');
    if (!turnInfo) return;
    const now = Date.now();
    const displayMins = adjustedMinutes != null ? adjustedMinutes : baseMinutes;
    const eta = new Date(now + displayMins * 60000);
    const trafficLine = VoyagrModules.eta().buildTrafficStatusLine(
        shouldApplyTrafficAwareETA(),
        trafficLevel,
        congestionPercent
    );
    turnInfo.innerHTML = VoyagrModules.eta().buildTurnInfoETAPanelHtml(
        displayMins,
        progressPercent,
        eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        trafficLine
    );
}

// buildETAVoiceMessage moved to modules/navigation/eta.js (VoyagrETA).
function buildETAVoiceMessage(timeRemainingMinutes, etaDate) {
    return VoyagrModules.eta().buildETAVoiceMessage(timeRemainingMinutes, etaDate);
}

let lastVoiceAnnouncementTime = 0;
let VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS = 10000;

let voiceAnnouncementsEnabled = true;
let voiceFrequencyMode = localStorage.getItem('voiceFrequencyMode') || 'all';

const VOICE_FREQUENCY_THROTTLES = {
    'all': 10000,
    'important': 15000,
    'minimal': 30000
};

/**
 * Find the nearest point on the route polyline to the current GPS position.
 * Used for accurate ETA calculation based on actual driver progress.
 * @param {number} lat - Current latitude
 * @param {number} lon - Current longitude
 * @param {Array} polyline - Route polyline as array of [lat, lon] coordinates
 * @returns {number} Index of nearest point on route, or 0 if not found
 */
function findNearestRouteIndex(lat, lon, polyline) {
    return VoyagrModules.routeGeometry().findNearestPolylineVertexIndex(lat, lon, polyline);
}

/**
 * Interpolate clockwise from GPS-derived heading toward route-aligned bearing [0°,360°).
 * @param {number} gpsHeadingDegrees
 * @param {number} routeHeadingDegrees
 * @param {number} blendTowardRoute 0 GPS only, 1 route only
 */
function blendHeadingsCircular(gpsHeadingDegrees, routeHeadingDegrees, blendTowardRoute) {
    return VoyagrModules.routeGeometry().blendHeadingsCircular(gpsHeadingDegrees, routeHeadingDegrees, blendTowardRoute);
}

/**
 * Snap a GPS position to the closest point on the route polyline.
 * Projects the position onto each line segment and returns the closest projected point.
 * This ensures the vehicle icon follows the route line smoothly instead of jumping
 * to raw GPS coordinates that may be off-road.
 *
 * @param {number} lat - GPS latitude
 * @param {number} lon - GPS longitude
 * @param {Array} polyline - Route polyline as array of [lat, lon]
 * @param {number} [searchStartIndex=0] - Start searching from this index (performance optimisation)
 * @returns {{ lat: number, lon: number, index: number, distance: number }} Snapped position info
 */
/**
 * Project a point onto a line segment using latitude-corrected Cartesian math.
 * Raw lat/lon degrees are not equal in metres — 1° longitude is cos(lat) × 1° latitude.
 * We scale the longitude axis by cos(latitude) so the dot-product gives the true
 * perpendicular foot on the segment, producing an accurate snap.
 */
// _projectToSegment / snapToRoutePolyline / getTotalPolylineLengthMeters /
// computeRemainingDistanceAlongRoute moved to modules/navigation/route-geometry.js.
// Thin stubs delegate to VoyagrRouteGeometry; all existing callers work unchanged.

function _projectToSegment(lat, lon, ax, ay, bx, by, cosLat) {
    return VoyagrModules.routeGeometry().projectToSegment(lat, lon, ax, ay, bx, by, cosLat);
}

function snapToRoutePolyline(lat, lon, polyline, searchStartIndex = 0) {
    return VoyagrModules.routeGeometry().snapToRoutePolyline(lat, lon, polyline, searchStartIndex);
}

/**
 * Total path length along the polyline (meters).
 */
function getTotalPolylineLengthMeters(polyline) {
    return VoyagrModules.routeGeometry().totalPolylineLengthMeters(polyline);
}

/**
 * Remaining distance (meters) along the polyline from the snapped GPS position to the route end.
 */
function computeRemainingDistanceAlongRoute(lat, lon, polyline, searchStartIndex = 0) {
    return VoyagrModules.routeGeometry().computeRemainingDistanceAlongRoute(lat, lon, polyline, searchStartIndex);
}

/**
 * Remaining meters along the active route polyline (snapped progress). Shared by voice, ETA bar, and arrival.
 * @param {number} lat
 * @param {number} lon
 * @returns {number}
 */
function getNavigationRemainingDistanceMeters(lat, lon) {
    if (!routePolyline || routePolyline.length < 2) return Infinity;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Infinity;
    return computeRemainingDistanceAlongRoute(lat, lon, routePolyline, lastSnappedRouteIndex);
}

function resetNavigationArrivalState() {
    _navigationArrivalTriggered = false;
    _navigationArrivalZoneSince = 0;
}

/**
 * Auto-end navigation when the driver reaches the destination (along-route distance + optional dwell).
 * @param {number} lat
 * @param {number} lon
 * @param {number} speedMs - GPS speed in m/s
 */
function checkNavigationArrival(lat, lon, speedMs) {
    if (!routeInProgress || _navigationArrivalTriggered) return;

    const remainingM = getNavigationRemainingDistanceMeters(lat, lon);
    const speed = Number.isFinite(speedMs) && speedMs >= 0 ? speedMs : 0;

    if (remainingM <= NAV_ARRIVAL_END_REMAINING_M) {
        console.log(`[Navigation] Arrival (${remainingM.toFixed(0)}m remaining) — ending trip`);
        sendArrivalNotification();
        return;
    }

    if (remainingM <= NAV_ARRIVAL_DWELL_REMAINING_M && speed <= NAV_ARRIVAL_MAX_SPEED_MS) {
        const now = Date.now();
        if (!_navigationArrivalZoneSince) {
            _navigationArrivalZoneSince = now;
        } else if (now - _navigationArrivalZoneSince >= NAV_ARRIVAL_DWELL_MS) {
            console.log(`[Navigation] Arrival dwell (${remainingM.toFixed(0)}m, slow) — ending trip`);
            sendArrivalNotification();
        }
        return;
    }

    _navigationArrivalZoneSince = 0;
}

/** Show/hide map FABs that depend on active turn-by-turn navigation. */
function updateNavigationFabVisibility() {
    const endBtn = document.getElementById('endNavigationBtn');
    const startBtn = document.getElementById('startNavBtn');
    if (routeInProgress) {
        if (endBtn) endBtn.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
    } else {
        if (endBtn) endBtn.style.display = 'none';
    }
    syncBottomSheetOverlapFabs();
    updateRecenterButtonVisibility();
}

// Track the last snapped route index for efficient searching
let lastSnappedRouteIndex = 0;
/** For turn detection only: monotonic polyline vertex index (never goes backwards). */
let lastTurnDetectRouteVertexIndex = 0;
// Near route: snap fully; degraded GPS widens corridor and blends snapped↔raw to reduce jitter.
const SNAP_TO_ROUTE_BASE_METERS = 50;
const SNAP_ROUTE_ACC_SCALE = 0.72;
const SNAP_ROUTE_ACC_EXTRA_CAP_METERS = 48;

// Active-navigation snap lock: keep the vehicle marker glued to the polyline while it
// is plausibly near the route, so GPS noise can't make it jump off the line (which also
// triggered phantom reroutes). Lock radius scales up with poor GPS accuracy.
const SNAP_NEAR_ROUTE_FORCE_METERS = 130;
const SNAP_LOCK_ACC_SCALE = 1.5;
let _smoothDisplayLat = null;
let _smoothDisplayLon = null;
let _snapBlendWeightState = 0;

/**
 * Clear EMA-smoothed marker position and follow-camera bookkeeping.
 * Without this, a second journey in the same session inherits journey-1 coords
 * and the icon jumps while the smoother catches up.
 */
function resetVehicleMarkerDisplayState() {
    _smoothDisplayLat = null;
    _smoothDisplayLon = null;
    _snapBlendWeightState = 0;
    window.__voyagrLastFollowCenterGeo = null;
    window.__voyagrLastFollowEaseAt = 0;
}

/**
 * Seed route progress and place the vehicle icon on the new polyline immediately.
 * @param {number} lat
 * @param {number} lon
 */
function primeVehicleMarkerOnRoute(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (!routePolyline || routePolyline.length < 2) return;
    seedNavigationProgressOnNewRoute(lat, lon);
    const snapped = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);
    _smoothDisplayLat = snapped.lat;
    _smoothDisplayLon = snapped.lon;
    _snapBlendWeightState = 1;
    if (currentUserMarker && typeof currentUserMarker.setLngLat === 'function') {
        currentUserMarker.setLngLat([snapped.lon, snapped.lat]);
    }
}

/** Alias for readability in routing math that predates corridor blending. */
const SNAP_TO_ROUTE_MAX_DISTANCE = SNAP_TO_ROUTE_BASE_METERS;
/**
 * getTurnDirectionText function
 * @function getTurnDirectionText
 * @param {*} direction - Parameter description
 * @returns {*} Return value description
 */
function getTurnDirectionText(direction) {
    return VoyagrModules.turnInstructions().getTurnDirectionText(direction);
}
/**
 * announceDistanceToDestination function
 * @function announceDistanceToDestination
 * @param {*} currentLat - Parameter description
 * @param {*} currentLon - Parameter description
 * @returns {*} Return value description
 */
function announceDistanceToDestination(currentLat, currentLon) {
    // FIXED: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
    if (!routeInProgress || !routePolyline || routePolyline.length === 0 || !voiceAnnouncementsEnabled) return;

    const remainingDistance = getNavigationRemainingDistanceMeters(currentLat, currentLon);

    // Check if we should announce at this distance
    for (const announcementDistance of DESTINATION_ANNOUNCEMENT_DISTANCES) {
        // Announce when within range (with hysteresis to avoid repeated announcements)
        if (remainingDistance <= announcementDistance && lastDestinationAnnouncementDistance > announcementDistance + 100) {
            const distUnit = getDistanceUnit();
            const message = VoyagrModules.voiceAnnouncements().buildDestinationAnnouncement(
                announcementDistance, distUnit
            );

            const displayRemaining = convertDistance(remainingDistance / 1000);
            console.log(`[Voice] Distance announcement: ${message} (remaining: ${displayRemaining} ${distUnit})`);
            speakMessage(message);
            lastDestinationAnnouncementDistance = remainingDistance;
            break;
        }
    }

    // Reset announcement when destination is reached
    if (remainingDistance > 11000) {
        lastDestinationAnnouncementDistance = Infinity;
    }
}
/**
 * announceETAUpdate function
 * @function announceETAUpdate
 * @param {*} currentLat - Parameter description
 * @param {*} currentLon - Parameter description
 * @returns {*} Return value description
 * @deprecated Use announceETAIfNeeded() instead - this function is no longer called from GPS callback
 */
function announceETAUpdate(currentLat, currentLon) {
    // FIXED: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
    if (!routeInProgress || !routePolyline || routePolyline.length === 0 || !voiceAnnouncementsEnabled) return;

    const now = Date.now();

    // Calculate remaining distance
    let remainingDistance = 0;
    let closestIndex = 0;
    let closestDistance = Infinity;

    // Find closest point on route
    for (let i = 0; i < routePolyline.length; i++) {
        const point = routePolyline[i];
        const distance = calculateHaversineDistance(currentLat, currentLon, point[0], point[1]);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = i;
        }
    }

    // Calculate remaining distance from closest point to destination
    for (let i = closestIndex; i < routePolyline.length - 1; i++) {
        remainingDistance += calculateDistance(
            routePolyline[i][0], routePolyline[i][1],
            routePolyline[i + 1][0], routePolyline[i + 1][1]
        );
    }

    // Get average speed from recent tracking history with proper validation
    let avgSpeed = 40; // Default 40 km/h
    if (trackingHistory && trackingHistory.length > 5) {
        try {
            const recentSpeeds = trackingHistory.slice(-5)
                .map(t => {
                    // Handle both m/s and km/h formats
                    let speed = t.speed || 0;
                    // If speed is very small (< 1), assume it's in m/s, convert to km/h
                    if (speed < 1 && speed > 0) {
                        speed = speed * 3.6;
                    }
                    return speed;
                })
                .filter(s => s > 0 && s < 200); // Filter out invalid speeds (0 or > 200 km/h)

            if (recentSpeeds.length > 0) {
                avgSpeed = recentSpeeds.reduce((a, b) => a + b) / recentSpeeds.length;
                // Ensure avgSpeed is reasonable (5-200 km/h)
                avgSpeed = Math.max(5, Math.min(200, avgSpeed));
            }
        } catch (e) {
            console.warn('[Voice] Error calculating average speed:', e);
            avgSpeed = 40; // Fall back to default
        }
    }

    // FIXED: Correct ETA calculation with validation
    // Formula: time (hours) = distance (km) / speed (km/h)
    // Then convert to milliseconds
    const remainingDistanceKm = remainingDistance / 1000;

    // Prevent division by zero
    if (avgSpeed <= 0) {
        console.warn('[Voice] Invalid average speed:', avgSpeed, 'using default 40 km/h');
        avgSpeed = 40;
    }

    const timeRemainingHours = remainingDistanceKm / avgSpeed;
    const timeRemainingMs = timeRemainingHours * 3600000; // Convert hours to milliseconds

    // Sanity check: ETA should be reasonable (< 24 hours)
    if (timeRemainingMs > 86400000) {
        console.warn('[Voice] ETA exceeds 24 hours, skipping announcement');
        return;
    }

    const etaTime = new Date(now + timeRemainingMs);

    // Check if we should announce
    const timeSinceLastAnnouncement = now - lastETAAnnouncementTime;
    const etaChanged = lastAnnouncedETA && Math.abs(etaTime.getTime() - lastAnnouncedETA.getTime()) > ETA_CHANGE_THRESHOLD_MS;

    // FIXED: Enforce minimum interval (1 minute) to prevent excessive announcements
    // Only announce if: (1) 10 minutes have passed, OR (2) ETA changed by >5 minutes AND at least 1 minute has passed
    if ((timeSinceLastAnnouncement > ETA_ANNOUNCEMENT_INTERVAL_MS) ||
        (etaChanged && timeSinceLastAnnouncement > ETA_MIN_INTERVAL_MS)) {
        const etaHours = etaTime.getHours();
        const etaMinutes = etaTime.getMinutes();
        const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);

        let message = '';
        if (timeRemainingMinutes > 60) {
            const hours = Math.floor(timeRemainingMinutes / 60);
            const minutes = timeRemainingMinutes % 60;
            message = `You will arrive in ${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
        } else {
            message = `You will arrive in ${timeRemainingMinutes} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
        }

        console.log(`[Voice] ETA announcement: ${message} (remaining: ${remainingDistanceKm.toFixed(1)}km, avg speed: ${avgSpeed.toFixed(1)}km/h, time: ${timeRemainingMinutes}min)`);
        speakMessage(message);
        lastETAAnnouncementTime = now;
        lastAnnouncedETA = etaTime;
    }
}
/**
 * announceUpcomingTurn function
 * @function announceUpcomingTurn
 * @param {*} turnInfo - Parameter description
 * @returns {*} Return value description
 */
function announceUpcomingTurn(turnInfo) {
    // FIXED: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
    if (!turnInfo || !voiceAnnouncementsEnabled) return;

    const distance = turnInfo.distance;

    // FIXED: Validate distance is a valid number
    if (typeof distance !== 'number' || isNaN(distance) || distance < 0) {
        console.warn('[Voice] Invalid turn distance:', distance);
        return;
    }

    const direction = turnInfo.direction || 'straight';
    let directionText = getTurnDirectionText(direction);
    if (direction === 'roundabout') {
        directionText = VoyagrModules.turnInstructions().getRoundaboutDirectionText(
            turnInfo.valhallaType,
            turnInfo.roundabout_exit_count
        );
    }
    const streetName = turnInfo.streetName || '';
    const verbalAlert = (turnInfo.verbal_transition_alert_instruction || '').trim();
    const verbalPre = (turnInfo.verbal_pre_transition_instruction || '').trim();
    const VA = VoyagrModules.voiceAnnouncements();
    const isExit = VA.isExitDirection(direction);
    const isKeep = VA.isKeepDirection(direction);

    // Exits and keep-right/left on motorways need earlier warnings at highway speeds
    const announcementDistances = isExit ? EXIT_ANNOUNCEMENT_DISTANCES
        : isKeep ? KEEP_ANNOUNCEMENT_DISTANCES
        : TURN_ANNOUNCEMENT_DISTANCES;
    const thresholdSet = isExit ? announcedExitThresholds
        : isKeep ? announcedKeepThresholds
        : announcedTurnThresholds;
    const category = isExit ? 'exit' : isKeep ? 'keep' : 'turn';
    const maneuverIdx = turnInfo.maneuverIndex;
    if (maneuverIdx != null && (maneuverIdx !== _voiceAnnouncedForManeuverIndex || category !== _voiceAnnouncedCategory)) {
        thresholdSet.clear();
        _voiceAnnouncedForManeuverIndex = maneuverIdx;
        _voiceAnnouncedCategory = category;
    }
    const resetDistance = isExit ? 2500 : isKeep ? 1500 : 600;

    // Pick the most-urgent (smallest) threshold we've reached and not yet announced, then
    // suppress any larger thresholds we've already driven past. Announcing only this one
    // means a GPS tick that overshoots a window (common at motorway speed, where one fix
    // can jump 30-40 m) can no longer silently drop the earlier call — you still hear the
    // relevant, nearer announcement instead of nothing until the next threshold.
    let announcementDistance = null;
    for (const d of announcementDistances) {
        if (distance <= d && !thresholdSet.has(d)) {
            announcementDistance = d;
        }
    }
    if (announcementDistance !== null) {
        // Mark larger thresholds we've already passed as done so they don't fire late.
        for (const d of announcementDistances) {
            if (d > announcementDistance && distance <= d) {
                thresholdSet.add(d);
            }
        }

        let message = VA.buildTurnAnnouncement({
            announcementDistance: announcementDistance,
            direction: direction,
            distanceUnit: distanceUnit,
            streetName: streetName,
            directionText: directionText,
            verbalAlert: verbalAlert,
            verbalPre: verbalPre,
            valhallaType: turnInfo.valhallaType,
            roundaboutExitCount: turnInfo.roundabout_exit_count
        });

            // At the most-imminent threshold, chain the very next maneuver if it follows
            // immediately (e.g. "Turn left, then turn right") so the driver hears it in advance.
            const isImminentThreshold = announcementDistance === announcementDistances[announcementDistances.length - 1];
            if (message && isImminentThreshold && turnInfo.maneuverIndex != null) {
                const follow = getFollowingManeuver(turnInfo.maneuverIndex);
                if (follow && follow.gapMeters <= 900) {
                    let followText = getTurnDirectionText(follow.direction);
                    if (follow.direction === 'roundabout') {
                        const exitCt = effectiveRoundaboutExitCount(follow.index);
                        if (exitCt > 0) followText = `at the roundabout take the ${ordinalEnglishExit(exitCt)} exit`;
                    }
                    message += `, then ${followText}`;
                }
            }

            if (message) {
                const announceType = isExit ? 'exit' : isKeep ? 'keep' : 'turn';
                console.log(`[Voice] Announcing ${announceType}: ${message} (distance: ${distance.toFixed(0)}m)`);
                speakMessage(message, 'high');
                thresholdSet.add(announcementDistance);
            }
    }

    // Reset when turn/exit/keep is completely passed
    if (distance > resetDistance) {
        if (isExit) {
            announcedExitThresholds.clear();
        } else if (isKeep) {
            announcedKeepThresholds.clear();
        } else {
            announcedTurnThresholds.clear();
        }
    }
}

// Rerouting debounce variables
let lastRerouteTime = 0;
let lastRerouteAttemptTime = 0;
const REROUTE_DEBOUNCE_MS = 30000;
let lastRerouteDeviation = 0;
let deviationStartTimeCheck = null;
let deviationOffRouteStreak = 0;
let rerouteAttemptCount = 0;
let rerouteInProgress = false;
let postRerouteGraceUntil = 0;
const POST_REROUTE_GRACE_MS = 90000;
let lastRerouteAnnouncementTime = 0;
const REROUTE_ANNOUNCE_MIN_INTERVAL_MS = 60000;

/** After a failed deviation reroute API call, retry with backoff (does not replace GPS deviation timing). */
let rerouteFailureRetryTimer = null;
let rerouteFailureRetryCount = 0;
const REROUTE_FAILURE_RETRY_DELAYS_MS = [4000, 6500, 10000, 14000];

function clearRerouteFailureRetries() {
    if (rerouteFailureRetryTimer) {
        clearTimeout(rerouteFailureRetryTimer);
        rerouteFailureRetryTimer = null;
    }
    rerouteFailureRetryCount = 0;
}

function scheduleAutomaticRerouteRetry() {
    if (!routeInProgress || !autoRerouteOnDeviationEnabled) {
        clearRerouteFailureRetries();
        return;
    }
    if (Date.now() < postRerouteGraceUntil) {
        return;
    }
    if (rerouteInProgress) {
        return;
    }
    if (rerouteFailureRetryCount >= REROUTE_FAILURE_RETRY_DELAYS_MS.length) {
        sendNotification('❌ Rerouting failed',
            'Could not get a new route after several tries. Pull over safely and use Recalculate if needed.',
            'error');
        clearRerouteFailureRetries();
        return;
    }
    const delay = REROUTE_FAILURE_RETRY_DELAYS_MS[rerouteFailureRetryCount];
    const attemptLabel = rerouteFailureRetryCount + 1;
    rerouteFailureRetryCount++;
    if (rerouteFailureRetryTimer) clearTimeout(rerouteFailureRetryTimer);
    console.log(`[Rerouting] Scheduling failure retry ${attemptLabel}/${REROUTE_FAILURE_RETRY_DELAYS_MS.length} in ${delay}ms`);
    rerouteFailureRetryTimer = setTimeout(() => {
        rerouteFailureRetryTimer = null;
        if (!routeInProgress || !autoRerouteOnDeviationEnabled) {
            clearRerouteFailureRetries();
            return;
        }
        showStatus(`🔄 Reroute retry ${attemptLabel}/${REROUTE_FAILURE_RETRY_DELAYS_MS.length}...`, 'warning');
        void triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon);
    }, delay);
}

/**
 * checkRouteDeviation function - Enhanced with time-based detection
 * Only triggers reroute if user is >50m off-route for >10 seconds
 * Respects auto-reroute toggle setting
 */
function checkRouteDeviation(lat, lon, accuracy) {
    // Check if auto-reroute is enabled
    if (!autoRerouteOnDeviationEnabled) {
        return;
    }

    if (!routePolyline || routePolyline.length === 0) return;

    const now = Date.now();
    if (postRerouteGraceUntil > now) {
        return;
    }
    if (rerouteInProgress) {
        return;
    }

    const remainingToDest = getNavigationRemainingDistanceMeters(lat, lon);
    if (remainingToDest <= NAV_ARRIVAL_SUPPRESS_REROUTE_METERS) {
        return;
    }

    // A very inaccurate fix can read tens of metres off a road we're actually on.
    // Don't let it start or sustain a deviation — just wait for a trustworthy fix.
    const acc = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0;
    if (acc > DEVIATION_MAX_TRUST_ACCURACY_M) {
        return;
    }

    const snap = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);
    const minDistance = snap.distance;

    const VRD = VoyagrModules.rerouteDecision();
    const wasJoined = routeJoinConfirmedForDeviation;
    const decision = VRD.decideRouteDeviation({
        autoRerouteEnabled: autoRerouteOnDeviationEnabled,
        hasRoute: true,
        remainingToDest: remainingToDest,
        accuracy: accuracy,
        minDistance: minDistance,
        routeJoinConfirmed: routeJoinConfirmedForDeviation,
        deviationStartTime: deviationStartTimeCheck,
        lastRerouteTime: lastRerouteTime,
        lastRerouteAttemptTime: lastRerouteAttemptTime,
        offRouteStreak: deviationOffRouteStreak,
        now: now
    });

    routeJoinConfirmedForDeviation = decision.routeJoinConfirmed;
    deviationStartTimeCheck = decision.deviationStartTime;
    deviationOffRouteStreak = decision.offRouteStreak != null ? decision.offRouteStreak : 0;

    if (!wasJoined && decision.routeJoinConfirmed) {
        console.log('[Rerouting] Route join detected — deviation monitoring active');
    }

    if (decision.action === 'reroute') {
        lastRerouteAttemptTime = decision.lastRerouteAttemptTime || now;
        lastRerouteDeviation = minDistance;
        rerouteAttemptCount++;
        console.log(`[Rerouting] Deviation confirmed: ${minDistance.toFixed(0)}m for ${(decision.deviationDuration / 1000).toFixed(1)}s (attempt #${rerouteAttemptCount})`);

        let deviationDisplay;
        if (distanceUnit === 'mi') {
            const deviationFeet = Math.round(minDistance * 3.28084);
            deviationDisplay = `${deviationFeet} ft`;
        } else {
            deviationDisplay = `${minDistance.toFixed(0)} m`;
        }
        sendNotification('🔄 Route Deviation', `You are ${deviationDisplay} off route for ${(decision.deviationDuration / 1000).toFixed(0)}s. Recalculating...`, 'warning');
        triggerAutomaticRerouteWithHazardHandling(lat, lon);
    } else if (decision.action === 'debounced' || decision.action === 'waiting') {
        lastRerouteDeviation = minDistance;
    }
}

/**
 * Trigger automatic reroute with hazard handling
 * This enhanced version handles unavoidable hazards gracefully
 */
async function triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon) {
    const now = Date.now();
    if (rerouteInProgress) {
        console.log('[Rerouting] Already in progress — skipping duplicate trigger');
        return;
    }
    if (now - lastRerouteAttemptTime < REROUTE_DEBOUNCE_MS) {
        console.log('[Rerouting] Attempt debounced — too soon after last try');
        return;
    }
    if (now < postRerouteGraceUntil) {
        console.log('[Rerouting] Post-reroute grace active — skipping');
        return;
    }
    lastRerouteAttemptTime = now;
    if (!navigator.onLine) {
        console.log('[Rerouting] Offline — deferring automatic reroute');
        scheduleAutomaticRerouteRetry();
        return;
    }
    rerouteInProgress = true;
    try {
        const destination = resolveNavigationDestination();
        if (!destination) {
            console.log('[Rerouting] No destination stored, cannot reroute');
            rerouteInProgress = false;
            return;
        }

        if (!window.lastCalculatedRoute) {
            console.log('[Rerouting] No route context, cannot reroute');
            rerouteInProgress = false;
            return;
        }
        console.log(`[Rerouting] Starting automatic reroute from (${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}) to ${destination}`);

        // Build route request with hazard avoidance settings
        const routeRequest = buildRouteRequest(currentLat, currentLon, destination);

        const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeRequest)
        });

        const data = await response.json();

        if (data.success && data.routes && data.routes.length > 0) {
            clearRerouteFailureRetries();

            const newRoute = data.routes[0];
            console.log(`[Rerouting] New route calculated: ${newRoute.distance_km}km, ${newRoute.duration_minutes}min`);

            // Check for unavoidable hazards
            const hazardCount = newRoute.hazard_count || 0;
            const hazardsList = newRoute.hazards || newRoute.hazards_on_route || [];

            if (hazardCount > 0) {
                handleUnavoidableHazards(newRoute, hazardsList, hazardCount);
            }

            // Next in-nav calculateRoute should not re-bind an old alt by name (e.g. "Balanced").
            _preferPrimaryRouteOnNextNavUpdate = true;

            // Update route on map
            updateRouteOnMap(newRoute);

            // Log rerouting event
            logReroutingEvent(currentLat, currentLon, destination, newRoute, hazardCount);

            // Announce reroute via voice (deduped so poor GPS cannot loop "new route")
            if (voiceAnnouncementsEnabled) {
                const distUnit = getDistanceUnit();
                const displayDist = convertDistance(newRoute.distance_km);
                let voiceMsg = `Route recalculated. New distance: ${displayDist} ${distUnit}, time: ${newRoute.duration_minutes} minutes`;
                if (hazardCount > 0) {
                    voiceMsg += `. Warning: ${hazardCount} hazard${hazardCount > 1 ? 's' : ''} on route.`;
                }
                const announceNow = Date.now();
                if (announceNow - lastRerouteAnnouncementTime >= REROUTE_ANNOUNCE_MIN_INTERVAL_MS) {
                    lastRerouteAnnouncementTime = announceNow;
                    speakMessage(voiceMsg, 'high');
                } else {
                    console.log('[Voice] Skipping duplicate reroute announcement');
                }
            }

            if (hazardCount > 0) {
                sendNotification('⚠️ Route Updated', `New route with ${hazardCount} unavoidable hazard${hazardCount > 1 ? 's' : ''}`, 'warning');
            } else {
                const displayDist = convertDistance(newRoute.distance_km);
                const distUnit = getDistanceUnit();
                sendNotification('✅ Route Updated', `New route: ${displayDist} ${distUnit}, ${newRoute.duration_minutes} min`, 'success');
            }

            console.log('[Rerouting] Automatic reroute completed successfully');
        } else {
            console.log('[Rerouting] Failed to calculate new route:', data.error);
            if (rerouteFailureRetryCount === 0) {
                sendNotification('❌ Rerouting Failed', 'Could not calculate new route. Retrying automatically…', 'error');
            }
            scheduleAutomaticRerouteRetry();
            rerouteInProgress = false;
        }
    } catch (error) {
        console.error('[Rerouting] Error during automatic reroute:', error);
        if (rerouteFailureRetryCount === 0) {
            sendNotification('❌ Rerouting Error', 'Network or server error. Retrying automatically…', 'error');
        }
        scheduleAutomaticRerouteRetry();
        rerouteInProgress = false;
    }
}

/**
 * Handle unavoidable hazards on route
 * Shows user-friendly notification with hazard details
 */
function handleUnavoidableHazards(route, hazardsList, hazardCount) {
    console.log(`[Rerouting] Route has ${hazardCount} unavoidable hazards`);

    const hazardTypes = VoyagrModules.hazardAlerts().groupHazardsByType(hazardsList);
    const hazardSummary = VoyagrModules.hazardAlerts().formatHazardTypeSummary(hazardTypes);

    showUnavoidableHazardsModal(hazardTypes, hazardCount);

    console.log(`[Rerouting] Unavoidable hazards: ${hazardSummary}`);
}

/**
 * Show modal for unavoidable hazards
 */
function showUnavoidableHazardsModal(hazardTypes, totalCount) {
    const hazardAlerts = VoyagrModules.hazardAlerts();
    // Check if modal already exists
    let modal = document.getElementById(hazardAlerts.UNAVOIDABLE_HAZARDS_MODAL_ID);
    if (!modal) {
        // Create modal
        modal = document.createElement('div');
        modal.id = hazardAlerts.UNAVOIDABLE_HAZARDS_MODAL_ID;
        modal.style.cssText = hazardAlerts.getUnavoidableHazardsModalStyleCssText();
        document.body.appendChild(modal);
    }

    // Build hazard list HTML
    const hazardListHtml = hazardAlerts.buildUnavoidableHazardsListHtml(hazardTypes);
    modal.innerHTML = hazardAlerts.buildUnavoidableHazardsModalHtml(hazardListHtml, totalCount);

    // Add backdrop
    let backdrop = document.getElementById(hazardAlerts.UNAVOIDABLE_HAZARDS_BACKDROP_ID);
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = hazardAlerts.UNAVOIDABLE_HAZARDS_BACKDROP_ID;
        backdrop.style.cssText = hazardAlerts.getUnavoidableHazardsBackdropStyleCssText();
        backdrop.onclick = closeUnavoidableHazardsModal;
        document.body.appendChild(backdrop);
    }

    backdrop.style.display = 'block';
    modal.style.display = 'block';

    // Auto-close after 10 seconds
    setTimeout(closeUnavoidableHazardsModal, 10000);
}

/**
 * Close unavoidable hazards modal
 */
function closeUnavoidableHazardsModal() {
    const hazardAlerts = VoyagrModules.hazardAlerts();
    const modal = document.getElementById(hazardAlerts.UNAVOIDABLE_HAZARDS_MODAL_ID);
    const backdrop = document.getElementById(hazardAlerts.UNAVOIDABLE_HAZARDS_BACKDROP_ID);
    if (modal) modal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
}

/**
 * Open hazard settings (navigates to settings tab)
 */
function openHazardSettings() {
    closeUnavoidableHazardsModal();
    showTab('settings');
}

/**
 * Get emoji icon for hazard type
 */
function getHazardIcon(type) {
    return VoyagrModules.hazardAlerts().getHazardIcon(type);
}

/**
 * Log rerouting event for debugging and analytics
 */
function logReroutingEvent(startLat, startLon, destination, route, hazardCount) {
    const event = VoyagrModules.rerouteDecision().buildRerouteLogEvent({
        timestampIso: new Date().toISOString(),
        startLat: startLat,
        startLon: startLon,
        destination: destination,
        route: route,
        hazardCount: hazardCount,
        settings: {
            avoidCameras: localStorage.getItem('pref_cameras') !== 'false',
            avoidTolls: isAvoidTollsEnabled(),
            avoidCaz: localStorage.getItem('pref_caz') !== 'false',
        },
    });

    VoyagrModules.rerouteDecision().appendRerouteLogEntry(sessionStorage, event, 20);

    console.log('[Rerouting] Event logged:', event);
}

// Keep old function for backwards compatibility
async function triggerAutomaticReroute(currentLat, currentLon) {
    return triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon);
}
/**
 * calculateDistance function
 * @function calculateDistance
 * @param {*} lat1 - Parameter description
 * @param {*} lon1 - Parameter description
 * @param {*} lat2 - Parameter description
 * @param {*} lon2 - Parameter description
 * @returns {*} Return value description
 */
// calculateDistance moved to route-geometry (unified with calculateHaversineDistance).
function calculateDistance(lat1, lon1, lat2, lon2) {
    return VoyagrModules.routeGeometry().haversineDistanceMeters(lat1, lon1, lat2, lon2);
}

// Hazard announcement debouncing
const hazardAnnouncementDebounce = {};
const HAZARD_ANNOUNCEMENT_DEBOUNCE_MS = 30000;
let HAZARD_WARNING_DISTANCE = 500;

// Camera alert types: 'off', 'voice', 'chime', 'both'
let cameraAlertType = localStorage.getItem('pref_cameraAlertType') || 'voice';
let cameraAlertDistance = parseInt(localStorage.getItem('pref_cameraAlertDistance') || '500');

const CAMERA_HAZARD_TYPES = [
    'camera',
    'traffic_light',
    'speed_camera',
    'camera_speed',
    'camera_red_light',
    'traffic_light_camera',
    'camera_average_speed',
    'camera_bus_lane',
    'camera_mobile',
    'camera_other'
];

/**
 * Normalize /api/hazards/nearby payload to a flat list of {lat, lon, type, ...}.
 * Backend returns { cameras: [], reports: [] }; older code expected a single array.
 */
function flattenNearbyHazardsPayload(hazardsPayload) {
    const HA = _hazardAlerts();
    if (HA) return HA.flattenNearbyHazardsPayload(hazardsPayload);
    if (!hazardsPayload) return [];
    if (Array.isArray(hazardsPayload)) return hazardsPayload;
    const out = [];
    if (Array.isArray(hazardsPayload.cameras)) out.push(...hazardsPayload.cameras);
    if (Array.isArray(hazardsPayload.reports)) out.push(...hazardsPayload.reports);
    return out;
}

function isCameraHazardType(typeStr) {
    const HA = _hazardAlerts();
    if (HA) return HA.isCameraHazardType(typeStr);
    if (typeStr == null || typeStr === '') return false;
    const t = String(typeStr).toLowerCase();
    return t.includes('camera');
}

/**
 * Play a chime alert sound using Web Audio API
 */
function playCameraChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc1.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(660, ctx.currentTime);
        osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.4);
        osc2.stop(ctx.currentTime + 0.4);

        setTimeout(() => {
            const osc3 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(1320, ctx.currentTime);
            gain2.gain.setValueAtTime(0.25, ctx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc3.connect(gain2);
            gain2.connect(ctx.destination);
            osc3.start(ctx.currentTime);
            osc3.stop(ctx.currentTime + 0.3);
        }, 200);
    } catch (e) {
        console.warn('[Camera Alert] Chime failed:', e);
    }
}

function saveCameraAlertPreferences() {
    const typeEl = document.getElementById('cameraAlertType');
    const distEl = document.getElementById('cameraAlertDistance');
    if (typeEl) {
        cameraAlertType = typeEl.value;
        localStorage.setItem('pref_cameraAlertType', cameraAlertType);
    }
    if (distEl) {
        cameraAlertDistance = parseInt(distEl.value);
        localStorage.setItem('pref_cameraAlertDistance', distEl.value);
    }
    showStatus('Camera alert preferences saved', 'success');
}

function loadCameraAlertPreferences() {
    const typeEl = document.getElementById('cameraAlertType');
    const distEl = document.getElementById('cameraAlertDistance');
    cameraAlertType = localStorage.getItem('pref_cameraAlertType') || 'voice';
    cameraAlertDistance = parseInt(localStorage.getItem('pref_cameraAlertDistance') || '500');
    if (typeEl) typeEl.value = cameraAlertType;
    if (distEl) distEl.value = cameraAlertDistance.toString();
}
/**
 * checkNearbyHazards function
 * @function checkNearbyHazards
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @returns {*} Return value description
 */
/**
 * Spoken/notification string for a straight-line distance to a hazard, respecting
 * distanceUnit (miles+feet vs km+meters) like the rest of the app.
 * @param {number} distanceM
 * @returns {string}
 */
function formatHazardDistanceForUserMeters(distanceM) {
    const HA = _hazardAlerts();
    if (HA) return HA.formatHazardDistanceForUserMeters(distanceM, distanceUnit);
    const m = Math.max(0, Number(distanceM) || 0);
    if (distanceUnit === 'mi') {
        if (m < 402) return `${Math.round(m * 3.28084)} feet`;
        const miles = m / 1609.34;
        return miles < 10 ? `${miles.toFixed(1)} miles` : `${Math.round(miles)} miles`;
    }
    if (m < 1000) return `${Math.round(m)} meters`;
    return `${(m / 1000).toFixed(1)} kilometers`;
}

function announceCameraOrHazard(hazard, distanceM, opts = {}) {
    const { unavoidableRouteCamera = false } = opts;
    const friendlyType = String(hazard.type || 'hazard').replace(/_/g, ' ');
    const distStr = formatHazardDistanceForUserMeters(distanceM);
    const message = unavoidableRouteCamera
        ? `${friendlyType} on your route, ${distStr} ahead — may be unavoidable on this path`
        : `${friendlyType} ${distStr} ahead`;
    sendNotification(unavoidableRouteCamera ? 'Route hazard' : 'Hazard Alert', message, 'warning');

    const now = Date.now();
    const debounceKey = `${hazard.type}_${hazard.lat}_${hazard.lon}_${unavoidableRouteCamera ? 'route' : 'near'}`;
    const lastTime = hazardAnnouncementDebounce[debounceKey] || 0;

    if (now - lastTime <= HAZARD_ANNOUNCEMENT_DEBOUNCE_MS) return;
    hazardAnnouncementDebounce[debounceKey] = now;

    const isCamera = isCameraHazardType(hazard.type);
    if (isCamera) {
        if (cameraAlertType === 'voice' || cameraAlertType === 'both') {
            const spoken = unavoidableRouteCamera
                ? `Camera on route in ${distStr}. This path may still pass the camera.`
                : `${friendlyType}, ${distStr} ahead`;
            speakMessage(spoken, 'high');
        }
        if (cameraAlertType === 'chime' || cameraAlertType === 'both') {
            playCameraChime();
        }
    } else if (voiceAnnouncementsEnabled) {
        speakMessage(`${friendlyType}, ${distStr} ahead`);
    }
}

function evaluateAndAnnounceHazards(lat, lon, nearbyPayload, includeNearby) {
    const HA = _hazardAlerts();
    if (!HA) return;

    const alerts = HA.collectHazardsToAnnounce({
        lat,
        lon,
        route: window.lastCalculatedRoute,
        includeNearby: !!includeNearby,
        nearbyPayload,
        routePolyline: routePolyline,
        snappedRouteIndex: lastSnappedRouteIndex,
        cameraAlertDistanceM: cameraAlertDistance,
        generalHazardDistanceM: HAZARD_WARNING_DISTANCE,
        preferAlongRouteForRouteHazards: true,
        calculateDistance: calculateDistance
    });

    alerts.forEach(({ hazard, distanceM, unavoidableRouteCamera }) => {
        if (cameraAlertType === 'off' && isCameraHazardType(hazard.type)) return;
        announceCameraOrHazard(hazard, distanceM, { unavoidableRouteCamera });
    });
}

/**
 * Route-embedded hazards work offline; nearby API augments when online.
 */
function processNavigationHazardAlerts(lat, lon) {
    if (!routeInProgress && !isTrackingActive) return;

    evaluateAndAnnounceHazards(lat, lon, null, false);

    if (_voyagrIsOffline || !navigator.onLine) return;

    fetch(`/api/hazards/nearby?lat=${lat}&lon=${lon}&radius_km=0.8`)
        .then((response) => response.json())
        .then((data) => {
            if (!data.success || !data.hazards) return;
            evaluateAndAnnounceHazards(lat, lon, data.hazards, true);
        })
        .catch((error) => console.log('Hazard check error:', error));
}

/** @deprecated Use processNavigationHazardAlerts — kept for live refresh interval. */
function checkNearbyHazards(lat, lon) {
    processNavigationHazardAlerts(lat, lon);
}

/** @deprecated Merged into processNavigationHazardAlerts. */
function checkRouteHazardCamerasAhead(lat, lon) {
    /* no-op: route cameras handled in processNavigationHazardAlerts */
}

// ===== PHASE 1: LIVE DATA REFRESH FUNCTIONS =====
/**
 * startLiveDataRefresh function
 * @function startLiveDataRefresh
 * @returns {*} Return value description
 */
function startLiveDataRefresh() {
    if (routeInProgress) {
        stopLiveDataRefresh(); // Avoid stacked intervals if this runs more than once per session
        // Get adaptive intervals based on battery level (Phase 3)
        const trafficInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.traffic_navigation);
        const etaInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.eta);
        const weatherInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.weather_navigation);
        const hazardInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.hazards_navigation);

        // Traffic refresh every 5 minutes (or adaptive)
        trafficRefreshInterval = setInterval(() => {
            refreshTrafficData();
        }, trafficInterval);

        // FIXED: ETA refresh every 30 seconds (or adaptive)
        // Traffic-aware ETA fetches inside updateETACalculation; voice runs after refresh
        etaRefreshInterval = setInterval(() => {
            updateETACalculation().then(() => announceETAIfNeeded());
        }, etaInterval);

        // Weather refresh every 30 minutes (or adaptive)
        weatherRefreshInterval = setInterval(() => {
            refreshWeatherData();
        }, weatherInterval);

        // Hazard refresh every 5 minutes (or adaptive)
        hazardRefreshInterval = setInterval(() => {
            if (currentLat && currentLon) {
                checkNearbyHazards(currentLat, currentLon);
            }
        }, hazardInterval);

        console.log('[Live Data] Refresh intervals started');
    }
}

/**
 * stopLiveDataRefresh function
 * @function stopLiveDataRefresh
 * @returns {*} Return value description
 */
function stopLiveDataRefresh() {
    clearInterval(trafficRefreshInterval);
    clearInterval(etaRefreshInterval);
    clearInterval(weatherRefreshInterval);
    clearInterval(hazardRefreshInterval);
    console.log('[Live Data] Refresh intervals stopped');
}

/**
 * refreshTrafficData function
 * @function refreshTrafficData
 * @returns {*} Return value description
 */
function refreshTrafficData() {
    if (!routeInProgress || !currentLat || !currentLon) return;

    fetch(`/api/traffic-patterns?lat=${currentLat}&lon=${currentLon}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.patterns && data.patterns.length > 0) {
                const pattern = data.patterns[0];
                if (pattern.congestion > 2) {
                    sendNotification('🚗 Traffic Update',
                        `Heavy traffic ahead (Congestion: ${pattern.congestion}/5)`,
                        'warning');
                }
            }
        })
        .catch(e => console.log('[Traffic] Refresh error:', e));
}

/**
 * updateETACalculation function
 * @function updateETACalculation
 * @returns {Promise<void>}
 */
async function updateETACalculation() {
    if (!routeInProgress || !window.lastCalculatedRoute || !routePolyline) return;

    const base = computeBaseNavigationETAMinutes();
    if (!base) {
        console.warn('[ETA] No valid route duration or progress');
        return;
    }

    const { timeRemainingMinutes, progressPercent } = base;
    let adjusted = applyTrafficRatioToBaseRemaining(timeRemainingMinutes);
    renderTurnInfoETAPanel(
        timeRemainingMinutes,
        shouldApplyTrafficAwareETA() ? adjusted : null,
        progressPercent,
        window.navETASnapshot.trafficLevel,
        window.navETASnapshot.congestionPercent
    );

    await refreshNavTrafficETAIfDue(timeRemainingMinutes, progressPercent, false);

    adjusted = applyTrafficRatioToBaseRemaining(timeRemainingMinutes);
    renderTurnInfoETAPanel(
        timeRemainingMinutes,
        shouldApplyTrafficAwareETA() ? adjusted : null,
        progressPercent,
        window.navETASnapshot.trafficLevel,
        window.navETASnapshot.congestionPercent
    );
}

/**
 * announceETAIfNeeded function
 * @function announceETAIfNeeded
 * @returns {*} Return value description
 * FIX: Added movement detection to prevent incorrect ETA announcements before journey starts
 */
function announceETAIfNeeded() {
    if (!routeInProgress || !window.lastCalculatedRoute || !voiceAnnouncementsEnabled) return;

    const now = Date.now();
    const timeSinceLastAnnouncement = now - lastETAAnnouncementTime;

    if (timeSinceLastAnnouncement > ETA_ANNOUNCEMENT_INTERVAL_MS) {
        const base = computeBaseNavigationETAMinutes();
        if (!base) {
            console.warn('[ETA] No valid route duration for voice');
            return;
        }
        const timeRemainingMinutes = applyTrafficRatioToBaseRemaining(base.timeRemainingMinutes);
        const eta = new Date(now + timeRemainingMinutes * 60000);
        const message = buildETAVoiceMessage(timeRemainingMinutes, eta);
        console.log(`[Voice] ETA announcement: ${message}`);
        speakMessage(message);
        lastETAAnnouncementTime = now;
        lastAnnouncedETA = eta;
    }
}

async function speakInitialETAAnnouncement() {
    if (!routeInProgress || !window.lastCalculatedRoute || !voiceAnnouncementsEnabled) return;

    if (!hasUserStartedMoving()) {
        initialETAMovementRetries += 1;
        if (initialETAMovementRetries <= INITIAL_ETA_MOVEMENT_MAX_RETRIES) {
            if (initialETAAnnouncementTimeoutId) {
                clearTimeout(initialETAAnnouncementTimeoutId);
                initialETAAnnouncementTimeoutId = null;
            }
            initialETAAnnouncementTimeoutId = setTimeout(() => {
                initialETAAnnouncementTimeoutId = null;
                void speakInitialETAAnnouncement();
            }, INITIAL_ETA_MOVEMENT_RETRY_MS);
            console.log('[Voice] Initial ETA deferred until movement (retry %s/%s)',
                initialETAMovementRetries, INITIAL_ETA_MOVEMENT_MAX_RETRIES);
        } else {
            console.log('[Voice] Initial ETA skipped after max stationary retries; periodic ETA still applies');
        }
        return;
    }

    initialETAMovementRetries = 0;

    const base = computeBaseNavigationETAMinutes();
    if (!base) return;
    if (shouldApplyTrafficAwareETA() && currentLat != null && currentLon != null) {
        await refreshNavTrafficETAIfDue(base.timeRemainingMinutes, base.progressPercent, true);
    }
    const now = Date.now();
    const timeRemainingMinutes = applyTrafficRatioToBaseRemaining(base.timeRemainingMinutes);
    const eta = new Date(now + timeRemainingMinutes * 60000);
    const message = buildETAVoiceMessage(timeRemainingMinutes, eta);
    console.log(`[Voice] Initial ETA announcement: ${message}`);
    speakMessage(message);
    lastETAAnnouncementTime = now;
    lastAnnouncedETA = eta;
}

function scheduleInitialETAAnnouncement() {
    if (initialETAAnnouncementTimeoutId) {
        clearTimeout(initialETAAnnouncementTimeoutId);
        initialETAAnnouncementTimeoutId = null;
    }
    initialETAAnnouncementTimeoutId = setTimeout(() => {
        initialETAAnnouncementTimeoutId = null;
        speakInitialETAAnnouncement();
    }, ETA_INITIAL_ANNOUNCE_DELAY_MS);
}

function clearInitialETAAnnouncement() {
    if (initialETAAnnouncementTimeoutId) {
        clearTimeout(initialETAAnnouncementTimeoutId);
        initialETAAnnouncementTimeoutId = null;
    }
}

/**
 * refreshWeatherData function
 * @function refreshWeatherData
 * @returns {*} Return value description
 */
function refreshWeatherData() {
    if (!currentLat || !currentLon) return;

    fetch(`/api/weather?lat=${currentLat}&lon=${currentLon}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                // Check for severe weather
                if (data.description.includes('rain') ||
                    data.description.includes('storm') ||
                    data.description.includes('snow')) {
                    sendNotification('⛈️ Weather Alert',
                        `${data.description} ahead`,
                        'warning');
                }
            }
        })
        .catch(e => console.log('[Weather] Refresh error:', e));
}

// ===== PHASE 2: PWA AUTO-RELOAD FUNCTIONS =====

/** Prevent duplicate reloads when Check Updates and Refresh App fire close together. */
function scheduleAppReload(reason, delayMs) {
    if (window.__voyagrReloadScheduled) {
        console.log('[PWA] Reload already scheduled, skipping:', reason);
        return false;
    }
    window.__voyagrReloadScheduled = true;
    setTimeout(() => {
        window.location.reload();
    }, delayMs);
    return true;
}

/** Repaint map after bottom-sheet/tab layout changes (common after PWA reload). */
function scheduleMapRepaintAfterUiChange() {
    const repaint = () => {
        if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
            window.__voyagrMapResizeAndRepaint();
        }
    };
    repaint();
    requestAnimationFrame(repaint);
    setTimeout(repaint, 300);
    setTimeout(repaint, 1000);
}

/** Restore active tab and bottom-sheet state saved before a reload/update. */
function restoreUiStateAfterReload() {
    const pending = window.__voyagrPendingUiRestore;
    if (!pending) return;
    window.__voyagrPendingUiRestore = null;

    try {
        if (pending.activeTab && typeof switchTab === 'function') {
            switchTab(pending.activeTab);
        }
        if (pending.bottomSheetExpanded === true && typeof expandBottomSheet === 'function') {
            expandBottomSheet();
        } else if (pending.bottomSheetExpanded === false && typeof collapseBottomSheet === 'function') {
            collapseBottomSheet();
        }
        scheduleMapRepaintAfterUiChange();
        console.log('[PWA] UI state restored after reload:', pending);
    } catch (e) {
        console.warn('[PWA] UI restore error:', e);
    }
}

/**
 * saveAppState function
 * @function saveAppState
 * @returns {*} Return value description
 */
function saveAppState() {
    try {
        const state = {
            preferences: {
                tolls: isAvoidTollsEnabled() ? 'true' : 'false',
                caz: localStorage.getItem('pref_caz'),
                cameras: localStorage.getItem('pref_cameras'),
                policeRadars: localStorage.getItem('pref_policeRadars'),
                roadworks: localStorage.getItem('pref_roadworks'),
                accidents: localStorage.getItem('pref_accidents'),
                railwayCrossings: localStorage.getItem('pref_railwayCrossings'),
                railwayCrossingsAvoid: localStorage.getItem('pref_railwayCrossingsAvoid'),
                potholes: localStorage.getItem('pref_potholes'),
                debris: localStorage.getItem('pref_debris'),
                gestureControl: localStorage.getItem('pref_gestureControl'),
                batterySaving: localStorage.getItem('pref_batterySaving'),
                mapTheme: localStorage.getItem('pref_mapTheme'),
                mlPredictions: localStorage.getItem('pref_mlPredictions'),
                optimizeStopOrder: localStorage.getItem('pref_optimizeStopOrder'),
                roundTrip: localStorage.getItem('pref_roundTrip'),
                trafficAwareRouting: localStorage.getItem('pref_trafficAwareRouting'),
                avoidRoadClosures: localStorage.getItem('pref_avoidRoadClosures'),
                avoidIncidents: localStorage.getItem('pref_avoidIncidents')
            },
            ui: {
                activeTab: typeof getCurrentVisibleTab === 'function' ? getCurrentVisibleTab() : 'navigation',
                bottomSheetExpanded: typeof bottomSheetIsExpanded !== 'undefined' ? bottomSheetIsExpanded : true
            },
            timestamp: Date.now()
        };
        localStorage.setItem('appState', JSON.stringify(state));
        console.log('[PWA] App state saved');
    } catch (e) {
        console.log('[PWA] State save error:', e);
    }
}

/**
 * restoreAppState function
 * @function restoreAppState
 * @returns {*} Return value description
 */
function restoreAppState() {
    if (window.__voyagrAppStateRestored) {
        return;
    }
    window.__voyagrAppStateRestored = true;

    try {
        const saved = localStorage.getItem('appState');
        if (saved) {
            const state = JSON.parse(saved);
            // Restore preferences
            Object.keys(state.preferences || {}).forEach(key => {
                if (state.preferences[key]) {
                    localStorage.setItem('pref_' + key, state.preferences[key]);
                }
            });
            if (state.ui) {
                window.__voyagrPendingUiRestore = state.ui;
            }
            localStorage.removeItem('appState');
            console.log('[PWA] App state restored');
        }
    } catch (e) {
        console.log('[PWA] State restore error:', e);
    }
}

/**
 * Refresh the PWA app - saves state and reloads
 */
function refreshApp() {
    showStatus('🔄 Refreshing app...', 'info');

    // Save current app state (tab, bottom sheet, preferences)
    saveAppState();

    if (!scheduleAppReload('manual-refresh', 500)) {
        showStatus('🔄 Refresh already in progress...', 'info');
    }
}

/**
 * Check for PWA updates and apply if available
 */
async function checkForUpdates() {
    showStatus('📥 Checking for updates...', 'info');

    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.getRegistration();

            if (registration) {
                // Force service worker to check for updates
                await safeServiceWorkerUpdate(registration, 'manual');

                if (registration.waiting) {
                    // New version waiting - activate it (controllerchange will reload)
                    showStatus('📥 New update found! Reloading...', 'success');
                    saveAppState();
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                } else if (registration.installing) {
                    showStatus('📥 Update installing...', 'info');
                } else {
                    showStatus('✅ App is up to date!', 'success');
                }
            } else {
                showStatus('⚠️ Service worker not registered', 'warning');
            }
        } catch (error) {
            console.error('[PWA] Update check failed:', error);
            showStatus('❌ Update check failed', 'error');
        }
    } else {
        showStatus('⚠️ PWA not supported on this browser', 'warning');
    }
}

/**
 * Display PWA version info
 */
function displayPWAVersion() {
    const versionElement = document.getElementById('pwaVersionText');
    if (versionElement) {
        // Generate version based on service worker cache version or build date
        const buildDate = new Date().toISOString().split('T')[0];
        versionElement.textContent = `App version: PWA ${buildDate}`;
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', displayPWAVersion);

// ===== PHASE 3: BATTERY-AWARE REFRESH INTERVALS =====
/**
 * getAdaptiveRefreshInterval function
 * @function getAdaptiveRefreshInterval
 * @param {*} baseInterval - Parameter description
 * @returns {*} Return value description
 */
function getAdaptiveRefreshInterval(baseInterval) {
    // Adjust refresh intervals based on battery level
    if (!('getBattery' in navigator)) {
        return baseInterval; // Use base interval if Battery API unavailable
    }

    // If battery is low, increase intervals to save power
    if (currentBatteryLevel < 0.15) {
        // Critical battery: increase intervals by 3x
        return baseInterval * 3;
    } else if (currentBatteryLevel < 0.30) {
        // Low battery: increase intervals by 2x
        return baseInterval * 2;
    } else if (currentBatteryLevel < 0.50) {
        // Medium battery: increase intervals by 1.5x
        return baseInterval * 1.5;
    }

    return baseInterval; // Normal intervals
}

/**
 * initBatteryMonitoring function
 * @function initBatteryMonitoring
 * @returns {*} Return value description
 */
function initBatteryMonitoring() {
    // Ensure we only attach battery listeners once per page load
    if (window.__voyagrBatteryMonitoringInitialized) {
        return;
    }
    window.__voyagrBatteryMonitoringInitialized = true;

    // Monitor battery status for adaptive refresh intervals
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            currentBatteryLevel = battery.level;
            console.log('[Battery] Initial level:', (currentBatteryLevel * 100).toFixed(0) + '%');

            battery.addEventListener('levelchange', () => {
                currentBatteryLevel = battery.level;
                console.log('[Battery] Level changed:', (currentBatteryLevel * 100).toFixed(0) + '%');

                // If battery drops below 30%, notify user
                if (currentBatteryLevel < 0.30 && routeInProgress) {
                    sendNotification('🔋 Low Battery',
                        `Battery at ${(currentBatteryLevel * 100).toFixed(0)}%. Refresh intervals adjusted.`,
                        'warning');
                }
            });

            battery.addEventListener('chargingtimechange', () => {
                console.log('[Battery] Charging time changed');
            });

            battery.addEventListener('dischargingtimechange', () => {
                console.log('[Battery] Discharging time changed');
            });

            battery.addEventListener('chargingchange', () => {
                console.log('[Battery] Charging status changed:', battery.charging ? 'charging' : 'discharging');
            });
        }).catch(e => {
            console.log('[Battery] API error:', e);
        });
    } else {
        console.log('[Battery] Battery Status API not supported');
    }
}

// ===== LOCATION FUNCTIONS =====
/**
 * getCurrentLocation function
 * @function getCurrentLocation
 * @returns {*} Return value description
 */
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    showStatus('Getting location...', 'loading');
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            currentLat = lat;
            currentLon = lon;

            // Center map on current location with smooth animation
            map.flyTo([lat, lon], 15, {
                duration: ZOOM_ANIMATION_DURATION,
                easeLinearity: 0.25
            });

            // Add marker with MapLibre
            if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
            startMarker = MapLibreHelpers.createCircleMarker(lat, lon, {
                radius: 8,
                fillColor: '#667eea',
                color: '#fff',
                weight: 2,
                fillOpacity: 0.8
            }).addTo(map);
            startMarker.bindPopup('Current Location');

            showStatus('Location found!', 'success');
        },
        (error) => {
            showStatus('Error: ' + error.message, 'error');
        }
    );
}
/**
 * setCurrentLocation function
 * @function setCurrentLocation
 * @param {*} field - Parameter description
 * @returns {*} Return value description
 */
function setCurrentLocation(field) {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    showStatus('Getting location...', 'loading');
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const input = document.getElementById(field);

            // Display "Current Location" instead of coordinates
            input.value = 'Current Location';
            input.dataset.lat = lat;
            input.dataset.lon = lon;
            input.dataset.displayName = 'Current Location';

            currentLat = lat;
            currentLon = lon;
            showStatus('Location set!', 'success');
        },
        (error) => {
            showStatus('Error: ' + error.message, 'error');
        }
    );
}

/**
 * Swap start and destination locations
 * @function swapStartAndDestination
 * @returns {void}
 */
function swapStartAndDestination() {
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');

    if (!startInput || !endInput) {
        showStatus('Error: Location inputs not found', 'error');
        return;
    }

    // Store start values
    const startValue = startInput.value;
    const startLat = startInput.dataset.lat;
    const startLon = startInput.dataset.lon;
    const startDisplayName = startInput.dataset.displayName;

    // Store end values
    const endValue = endInput.value;
    const endLat = endInput.dataset.lat;
    const endLon = endInput.dataset.lon;
    const endDisplayName = endInput.dataset.displayName;

    // Swap values
    startInput.value = endValue || '';
    startInput.dataset.lat = endLat || '';
    startInput.dataset.lon = endLon || '';
    startInput.dataset.displayName = endDisplayName || '';

    endInput.value = startValue || '';
    endInput.dataset.lat = startLat || '';
    endInput.dataset.lon = startLon || '';
    endInput.dataset.displayName = startDisplayName || '';

    // Swap markers on the map if they exist
    if (startMarker && endMarker) {
        const startLatLng = startMarker.getLatLng();
        const endLatLng = endMarker.getLatLng();
        startMarker.setLatLng(endLatLng);
        endMarker.setLatLng(startLatLng);
    }

    // Visual feedback on the button
    const swapBtn = document.getElementById('swapLocationsBtn');
    if (swapBtn) {
        const DH = VoyagrModules.domHelpers();
        swapBtn.style.background = DH.SWAP_LOCATIONS_FLASH_STYLE.background;
        swapBtn.style.borderColor = DH.SWAP_LOCATIONS_FLASH_STYLE.borderColor;
        setTimeout(() => {
            swapBtn.style.background = DH.SWAP_LOCATIONS_REST_STYLE.background;
            swapBtn.style.borderColor = DH.SWAP_LOCATIONS_REST_STYLE.borderColor;
        }, DH.SWAP_LOCATIONS_FLASH_MS);
    }

    showStatus('🔄 Start and destination swapped', 'success');

    // Recalculate route if both locations have coordinates and a route exists
    const hasStart = startInput.value && startInput.dataset.lat && startInput.dataset.lon;
    const hasEnd = endInput.value && endInput.dataset.lat && endInput.dataset.lon;

    if (hasStart && hasEnd && routeLayer) {
        console.log('[Swap] Recalculating route after swap...');
        setTimeout(() => {
            calculateRoute();
        }, 100);
    }
}

// ===== AUTO GPS LOCATION FEATURE =====
/**
 * toggleAutoGpsLocation function
 * @function toggleAutoGpsLocation
 * @returns {*} Return value description
 */
function toggleAutoGpsLocation() {
    const toggle = document.getElementById('autoGpsToggle');
    autoGpsEnabled = toggle.checked;

    if (autoGpsEnabled) {
        startAutoGpsLocation();
    } else {
        stopAutoGpsLocation();
    }

    // Save preference to localStorage
    localStorage.setItem('autoGpsEnabled', autoGpsEnabled);
}

/**
 * startAutoGpsLocation function
 * @function startAutoGpsLocation
 * @returns {*} Return value description
 */
function startAutoGpsLocation() {
    if (!navigator.geolocation) {
        showStatus('❌ Geolocation not supported by your browser', 'error');
        document.getElementById('autoGpsToggle').checked = false;
        autoGpsEnabled = false;
        return;
    }

    showStatus('📍 Auto GPS location enabled. Fetching your location...', 'success');
    console.log('[Auto GPS] Starting auto location monitoring');

    // Get initial location immediately
    updateAutoGpsLocation();

    // Then update every 5 seconds
    autoGpsLocationMonitor = setInterval(() => {
        updateAutoGpsLocation();
    }, AUTO_GPS_UPDATE_INTERVAL);
}

/**
 * stopAutoGpsLocation function
 * @function stopAutoGpsLocation
 * @returns {*} Return value description
 */
function stopAutoGpsLocation() {
    if (autoGpsLocationMonitor) {
        clearInterval(autoGpsLocationMonitor);
        autoGpsLocationMonitor = null;
    }
    const startEl = document.getElementById('start');
    if (startEl && startEl.dataset.lat && startEl.dataset.lon) {
        const la = parseFloat(startEl.dataset.lat);
        const lo = parseFloat(startEl.dataset.lon);
        if (Number.isFinite(la) && Number.isFinite(lo)) {
            startEl.value = `${la.toFixed(6)},${lo.toFixed(6)}`;
            delete startEl.dataset.displayName;
        }
    }
    showStatus('📍 Auto GPS location disabled', 'info');
    console.log('[Auto GPS] Auto location monitoring stopped');
}

/**
 * updateAutoGpsLocation function
 * @function updateAutoGpsLocation
 * @returns {*} Return value description
 */
function updateAutoGpsLocation() {
    if (!autoGpsEnabled) return;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            const startEl = document.getElementById('start');
            if (startEl) {
                startEl.value = 'Current Location';
                startEl.dataset.lat = String(lat);
                startEl.dataset.lon = String(lon);
                startEl.dataset.displayName = 'Current Location';
            }
            currentLat = lat;
            currentLon = lon;

            // Log the update
            console.log(`[Auto GPS] Location updated: ${lat.toFixed(6)}, ${lon.toFixed(6)} (accuracy: ${accuracy.toFixed(0)}m)`);

            // Show subtle notification only on first update or significant change
            if (!window.lastAutoGpsLat ||
                calculateDistance(window.lastAutoGpsLat, window.lastAutoGpsLon, lat, lon) > 0.05) {
                // Only show notification if moved more than 50 meters
                showStatus(`📍 Location updated: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 'info');
                window.lastAutoGpsLat = lat;
                window.lastAutoGpsLon = lon;
            }
        },
        (error) => {
            console.log(`[Auto GPS] Error: ${error.message}`);
            // Don't show error every time - just log it
            // This prevents notification spam if GPS is temporarily unavailable
        }
    );
}
/**
 * pickLocationFromMap function
 * @function pickLocationFromMap
 * @param {*} field - Parameter description
 * @returns {*} Return value description
 */
function pickLocationFromMap(field) {
    mapPickerMode = field;
    collapseBottomSheet();
    showStatus('Click on the map to select ' + (field === 'start' ? 'start' : 'destination') + ' location', 'loading');
}

// ===== GEOCODING FUNCTIONS =====
/**
 * initGeocodeCache function
 * @function initGeocodeCache
 * @returns {*} Return value description
 */
function initGeocodeCache() {
    try {
        const cached = localStorage.getItem(GEOCODING_CACHE_KEY);
        if (cached) {
            geocodingCache = JSON.parse(cached);
            console.log('[Geocoding] Cache loaded with', Object.keys(geocodingCache).length, 'entries');
        }
    } catch (e) {
        console.log('[Geocoding] Cache load error:', e);
        geocodingCache = {};
    }
}

/**
 * saveGeocodeCache function
 * @function saveGeocodeCache
 * @returns {*} Return value description
 */
function saveGeocodeCache() {
    try {
        localStorage.setItem(GEOCODING_CACHE_KEY, JSON.stringify(geocodingCache));
    } catch (e) {
        console.log('[Geocoding] Cache save error:', e);
    }
}

let autocompleteTimeout = null;
let autocompleteCache = {};

function getAutocompleteDropdown(fieldId) {
    const mapping = {
        'start': 'autocompleteStart',
        'end': 'autocompleteEnd',
        'viaPointAddress': 'autocompleteViaPoint',
        'stopAddress': 'autocompleteStop'
    };
    return document.getElementById(mapping[fieldId] || `autocomplete_${fieldId}`);
}

async function showAutocomplete(fieldId) {
    const SA = _searchAutocomplete();
    const input = document.getElementById(fieldId);
    const dropdown = getAutocompleteDropdown(fieldId);
    if (!input || !dropdown) return;

    // Live GPS owns the start field; don't run search or wipe dataset coords on focus/input.
    if (fieldId === 'start' && autoGpsEnabled) {
        dropdown.classList.remove('show');
        return;
    }

    const query = input.value.trim();

    if (input.dataset.lat || input.dataset.lon) {
        console.log(`[Autocomplete] Clearing stored coordinates for ${fieldId} - user is typing`);
        delete input.dataset.lat;
        delete input.dataset.lon;
        delete input.dataset.displayName;
    }

    if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
    }

    if (!query || query.length < 2) {
        // Start and Destination both offer "pick a previous location" when empty. (The Start
        // field only reaches here when auto-GPS is off — the guard above hands the field to
        // live GPS otherwise.)
        if (fieldId === 'end' || fieldId === 'start') {
            const histEl = document.getElementById('searchHistoryDropdown');
            if (histEl) {
                histEl.classList.remove('show');
                histEl.innerHTML = '';
            }
            dropdown.innerHTML = SA.buildAutocompleteLoadingHtml(SA.AUTOCOMPLETE_LOADING_RECENT_TEXT);
            dropdown.classList.add('show');
            renderEndDestinationSuggestions(dropdown, fieldId).catch((err) => {
                console.error('[Recent locations]', err);
                dropdown.innerHTML = SA.buildAutocompleteNoResultsHtml(SA.AUTOCOMPLETE_RECENT_LOAD_ERROR_MESSAGE);
            });
            return;
        }
        dropdown.classList.remove('show');
        return;
    }

    dropdown.innerHTML = SA.buildAutocompleteLoadingHtml(SA.AUTOCOMPLETE_SEARCHING_TEXT);
    dropdown.classList.add('show');

    autocompleteTimeout = setTimeout(async () => {
        try {
            if (autocompleteCache[query]) {
                displayAutocompleteResults(fieldId, autocompleteCache[query]);
                return;
            }

            const response = await fetch(
                `${NOMINATIM_API}?q=${encodeURIComponent(query)}&limit=8`,
                {
                    headers: {
                        'User-Agent': 'Voyagr-PWA/1.0'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const results = await response.json();

            autocompleteCache[query] = results;

            displayAutocompleteResults(fieldId, results);
        } catch (error) {
            console.error('[Autocomplete] Error:', error);
            dropdown.innerHTML = SA.buildAutocompleteNoResultsHtml(SA.AUTOCOMPLETE_SEARCH_FAILED_MESSAGE);
        }
    }, 300); // 300ms debounce
}
/**
 * displayAutocompleteResults function
 * @function displayAutocompleteResults
 * @param {*} fieldId - Parameter description
 * @param {*} results - Parameter description
 * @returns {*} Return value description
 */
function displayAutocompleteResults(fieldId, results) {
    const SA = _searchAutocomplete();
    const dropdown = getAutocompleteDropdown(fieldId);
    if (!dropdown) return;

    if (!results || results.length === 0) {
        dropdown.innerHTML = SA.buildAutocompleteNoResultsHtml('No results found');
        return;
    }

    dropdown.innerHTML = '';

    results.forEach((result) => {
        const icon = SA.getLocationIcon(result);
        const name = SA.resolveGeocodeResultDisplayName(result);
        const shortAddress = SA.resolveGeocodeResultShortAddress(result);
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = SA.buildGeocodeAutocompleteItemHtml(icon, name, shortAddress);
        item.onclick = () => selectAutocompleteResult(fieldId, lat, lon, name);

        dropdown.appendChild(item);
    });
}
/**
 * selectAutocompleteResult function
 * @function selectAutocompleteResult
 * @param {*} fieldId - Parameter description
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} name - Parameter description
 * @returns {*} Return value description
 */
function selectAutocompleteResult(fieldId, lat, lon, name) {
    const input = document.getElementById(fieldId);
    const dropdown = getAutocompleteDropdown(fieldId);

    if (fieldId === 'viaPointAddress') {
        addViaPoint(lat, lon, name);
        if (input) input.value = '';
        if (dropdown) dropdown.classList.remove('show');
        return;
    }
    if (fieldId === 'stopAddress') {
        addStop(lat, lon, name);
        if (input) input.value = '';
        if (dropdown) dropdown.classList.remove('show');
        return;
    }

    input.value = name;
    input.dataset.lat = lat;
    input.dataset.lon = lon;
    input.dataset.displayName = name;

    if (dropdown) dropdown.classList.remove('show');

    // Save the chosen place for either endpoint so it can be re-picked from the recent
    // locations list in the Start or Destination field next time.
    if (fieldId === 'end' || fieldId === 'start') {
        recordRecentDestination(name, lat, lon, 'search');
    }

    showStatus(`✅ Selected: ${name}`, 'success');

    console.log(`[Autocomplete] Selected ${fieldId}: ${name} (${lat}, ${lon})`);
}
/**
 * isCoordinateFormat function
 * @function isCoordinateFormat
 * @param {*} input - Parameter description
 * @returns {*} Return value description
 */
function isCoordinateFormat(input) {
    // Check if input is already in "lat,lon" format
    const parts = input.trim().split(',');
    if (parts.length !== 2) return false;

    const lat = parseFloat(parts[0].trim());
    const lon = parseFloat(parts[1].trim());

    // Valid latitude: -90 to 90, Valid longitude: -180 to 180
    return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

async function geocodeAddress(address) {
    if (!address || address.trim() === '') {
        return null;
    }

    const trimmedAddress = address.trim();

    // Check if already in coordinate format
    if (isCoordinateFormat(trimmedAddress)) {
        const parts = trimmedAddress.split(',');
        const lat = parseFloat(parts[0].trim());
        const lon = parseFloat(parts[1].trim());
        console.log('[Geocoding] Input is already coordinates:', lat, lon);
        return { lat, lon, display_name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, cached: false };
    }

    // Check if Plus Codes are enabled and input is a Plus Code
    const plusCodesEnabled = localStorage.getItem('googlePlusCodesEnabled') === 'true';
    if (plusCodesEnabled && typeof GooglePlusCodesService !== 'undefined') {
        try {
            const service = new GooglePlusCodesService();
            if (service.isValidCode(trimmedAddress)) {
                console.log('[Geocoding] Detected Plus Code:', trimmedAddress);
                const decoded = service.decode(trimmedAddress);
                console.log('[Geocoding] Decoded Plus Code to:', decoded.lat, decoded.lon);
                return {
                    lat: decoded.lat,
                    lon: decoded.lon,
                    display_name: `Plus Code: ${trimmedAddress}`,
                    cached: false
                };
            }
        } catch (error) {
            console.log('[Geocoding] Plus Code decode error:', error.message);
            // Fall through to normal geocoding
        }
    }

    // Check cache first
    if (geocodingCache[trimmedAddress]) {
        console.log('[Geocoding] Cache hit for:', trimmedAddress);
        return { ...geocodingCache[trimmedAddress], cached: true };
    }

    try {
        console.log('[Geocoding] Fetching:', trimmedAddress);
        const response = await fetch(`${NOMINATIM_API}?q=${encodeURIComponent(trimmedAddress)}&limit=8`, {
            headers: {
                'User-Agent': 'Voyagr-PWA/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (data && typeof data === 'object' && data.success === false && data.error) {
            throw new Error(data.error);
        }
        if (!Array.isArray(data) || data.length === 0) {
            console.log('[Geocoding] No results for:', trimmedAddress);
            return null;
        }

        const result = data[0];
        const geocoded = {
            lat: parseFloat(result.lat),
            lon: parseFloat(result.lon),
            display_name: result.display_name
        };

        // Cache the result
        geocodingCache[trimmedAddress] = geocoded;
        saveGeocodeCache();

        console.log('[Geocoding] Success:', trimmedAddress, '→', geocoded.lat, geocoded.lon);
        return { ...geocoded, cached: false };
    } catch (error) {
        console.log('[Geocoding] Error:', error.message);
        return null;
    }
}

async function geocodeLocations(startAddress, endAddress) {
    isGeocoding = true;
    showStatus('🔍 Geocoding locations...', 'loading');

    try {
        // Check if coordinates are already stored in data attributes
        const startInput = document.getElementById('start');
        const endInput = document.getElementById('end');

        let startResult, endResult;

        // Check start location
        if (startInput.dataset.lat && startInput.dataset.lon) {
            // Use stored coordinates
            startResult = {
                lat: parseFloat(startInput.dataset.lat),
                lon: parseFloat(startInput.dataset.lon),
                display_name: startInput.dataset.displayName || startAddress,
                cached: true
            };
            console.log('[Geocoding] Using stored coordinates for start:', startResult);
        } else {
            // Geocode start location
            startResult = await geocodeAddress(startAddress);
            if (!startResult) {
                showStatus('❌ Could not find start location: ' + startAddress, 'error');
                isGeocoding = false;
                return null;
            }
        }

        // Check end location
        if (endInput.dataset.lat && endInput.dataset.lon) {
            // Use stored coordinates
            endResult = {
                lat: parseFloat(endInput.dataset.lat),
                lon: parseFloat(endInput.dataset.lon),
                display_name: endInput.dataset.displayName || endAddress,
                cached: true
            };
            console.log('[Geocoding] Using stored coordinates for end:', endResult);
        } else {
            // Geocode end location
            endResult = await geocodeAddress(endAddress);
            if (!endResult) {
                showStatus('❌ Could not find end location: ' + endAddress, 'error');
                isGeocoding = false;
                return null;
            }
        }

        // Show resolved locations
        const cacheInfo = (startResult.cached ? ' (cached)' : '') + (endResult.cached ? ' (cached)' : '');
        showStatus(`✅ Resolved: ${startResult.display_name} → ${endResult.display_name}${cacheInfo}`, 'success');

        isGeocoding = false;
        return {
            start: `${startResult.lat},${startResult.lon}`,
            end: `${endResult.lat},${endResult.lon}`,
            startName: startResult.display_name,
            endName: endResult.display_name
        };
    } catch (error) {
        console.log('[Geocoding] Error:', error);
        showStatus('❌ Geocoding error: ' + error.message, 'error');
        isGeocoding = false;
        return null;
    }
}

// ===== TURN-BY-TURN NAVIGATION FUNCTIONS =====
/**
 * startTurnByTurnNavigation function
 * @function startTurnByTurnNavigation
 * @param {*} routeData - Route payload (`geometry`, `maneuvers`, …)
 * @param {{ resumeStepIndex?: number, fromPersistedResume?: boolean }|null} [navStartOpts] - Optional resume / offline tweaks
 */
function startTurnByTurnNavigation(routeData, navStartOpts = null) {
    routeData = mergeNavigationRouteFromSelected(routeData);
    if (!routeData || !routeData.geometry) {
        showStatus('No route geometry available', 'error');
        return;
    }

    window.lastCalculatedRoute = Object.assign({}, window.lastCalculatedRoute || {}, routeData);

    const isQuietResume = !!(navStartOpts && navStartOpts.fromPersistedResume);
    if (!isQuietResume) {
        resetVoiceAnnouncementStateForNewRoute();
    }
    let resumeStepIdx = 0;
    if (navStartOpts != null && Number.isFinite(navStartOpts.resumeStepIndex)) {
        resumeStepIdx = Math.max(0, Math.floor(navStartOpts.resumeStepIndex));
    }

    routeInProgress = true;
    currentStepIndex = resumeStepIdx;
    currentRouteSteps = routeData.maneuvers || [];
    lastTurnDetectRouteVertexIndex = 0;
    routeJoinConfirmedForDeviation = false;
    resetVehicleMarkerDisplayState();
    resetNavigationArrivalState();
    _navTraveledMeters = 0;
    _navOdometerLastGeo = null;
    _navStartedAt = Date.now();
    lastETAAnnouncementTime = Date.now();
    lastAnnouncedETA = null;
    lastNavTrafficFetchAt = 0;
    initialETAMovementRetries = 0;
    window.navETASnapshot = {
        baseRemainingMinutes: 0,
        trafficAdjustedMinutes: null,
        trafficLevel: null,
        congestionPercent: null,
        progressPercent: 0,
        trafficFetchAt: 0,
        baseAtTrafficFetch: 0
    };

    try {
        const navPrecision = Number.isFinite(routeData.geometry_precision) ? routeData.geometry_precision : 6;
        routePolyline = decodePolyline(routeData.geometry, navPrecision);
        console.log('Route polyline decoded:', routePolyline.length, 'points', `(precision ${navPrecision})`);
        console.log('Route maneuvers:', currentRouteSteps.length, 'steps');

        persistActiveRoute();
        precacheRouteTiles(routePolyline);

        // Validate decoded polyline
        if (!routePolyline || routePolyline.length === 0) {
            console.error('[Navigation] Failed to decode route geometry - polyline is empty');
            showStatus('Error: Invalid route geometry', 'error');
            return;
        }

        if (currentLat != null && currentLon != null) {
            primeVehicleMarkerOnRoute(currentLat, currentLon);
        } else {
            lastSnappedRouteIndex = 0;
        }
    } catch (e) {
        console.error('Could not decode geometry:', e);
        showStatus('Error: Could not decode route geometry', 'error');
        return;
    }

    // ===== SCREEN WAKE LOCK: Keep screen on during navigation =====
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen')
            .then(wakeLock => {
                window.screenWakeLock = wakeLock;
                console.log('[Screen Wake Lock] Screen lock acquired - screen will stay on');
                showStatus('🔒 Screen lock enabled - screen will stay on', 'success');

                // Handle wake lock release
                wakeLock.addEventListener('release', () => {
                    console.log('[Screen Wake Lock] Screen lock released');
                });
            })
            .catch(err => {
                console.log('[Screen Wake Lock] Failed to acquire wake lock:', err.name, err.message);
                // This is not critical - navigation will continue without wake lock
            });
    } else {
        console.log('[Screen Wake Lock] Screen Wake Lock API not supported on this device');
    }

    // Start GPS tracking if not already active
    if (!isTrackingActive) {
        startGPSTracking();
    }

    // ===== DRIVER VIEW: 60° after first GPS fix when following (always during navigation) =====
    setTimeout(() => {
        if (!map || currentLat == null || currentLon == null) return;
        if (zoomAndFollowEnabled && mapFollowingActive) {
            applyLiveNavigationCamera();
        }
    }, 1500);

    // ===== PHASE 1: Start live data refresh =====
    startLiveDataRefresh();
    void updateETACalculation();
    scheduleInitialETAAnnouncement();

    // ===== START AUTO-TRAFFIC UPDATES =====
    if (autoTrafficUpdateEnabled) {
        startAutoTrafficUpdates();
        console.log('[Navigation] Auto-traffic updates started');
    }

    // ===== START ROUTE TRAFFIC EDGE DISPLAY =====
    if (routeTrafficEnabled) {
        startRouteTrafficUpdates();
        console.log('[Navigation] Route traffic edge display started');
    }

    // ===== SHOW ZOOM AND FOLLOW BUTTON =====
    mapFollowingActive = true;
    const zoomFollowBtn = document.getElementById('zoomFollowToggle');
    if (zoomFollowBtn) {
        zoomFollowBtn.style.display = 'block';
        applyZoomFollowButtonUi(zoomFollowBtn, zoomAndFollowEnabled);
    }

    // Show journey overview button during navigation
    const journeyOverviewBtn = document.getElementById('journeyOverviewBtn');
    if (journeyOverviewBtn) {
        journeyOverviewBtn.style.display = 'block';
    }
    updateRoadReportFabVisibility();
    updateRecenterButtonVisibility();

    // ===== SHOW SPEED WIDGET during navigation =====
    // Speed widget shows current GPS speed and road speed limit for safety (use consolidated function)
    updateSpeedWidgetVisibility();

    // ===== SHOW TURN INSTRUCTION WIDGET during navigation =====
    showTurnInstructionWidget();
    // Initialize with first instruction if available
    if (currentLat != null && currentLon != null) {
        updateTurnWidgetFromPosition(currentLat, currentLon);
    } else if (currentRouteSteps && currentRouteSteps.length > 0 && routePolyline && routePolyline.length > 0) {
        const initIdx = Math.min(Math.max(0, currentStepIndex || 0), currentRouteSteps.length - 1);
        const firstStep = currentRouteSteps[initIdx];
        const type = firstStep.type || 0;
        let direction = maneuverTypeToDirectionKey(type) || 'straight';
        direction = refineManeuverDirectionForRoute(type, direction, firstStep);
        const firstManeuverIndex = firstStep.begin_shape_index || 0;
        let distanceToFirst = firstStep.distance || 0;
        if (firstManeuverIndex > 0 && firstManeuverIndex < routePolyline.length) {
            const startPoint = routePolyline[0];
            const firstManeuverPoint = routePolyline[firstManeuverIndex];
            distanceToFirst = calculateDistance(startPoint[0], startPoint[1], firstManeuverPoint[0], firstManeuverPoint[1]);
        }
        updateTurnInstructionDisplay({
            distance: distanceToFirst,
            direction: direction,
            instruction: firstStep.instruction || '',
            streetName: (firstStep.street_names || [])[0] || '',
            maneuver: firstStep,
            maneuverIndex: initIdx,
            valhallaType: type,
            roundabout_exit_count: effectiveRoundaboutExitCount(initIdx),
        });
    }

    // ===== SHOW JOURNEY SUMMARY BAR during navigation =====
    showJourneySummaryBar();

    updateNavigationFabVisibility();
    try {
        voyagrShowMapIconHint('Tap the red ⏹ button to end navigation when you arrive.');
    } catch (_hintErr) {
        /* ignore */
    }

    // ===== SHOW AR AND 3D VIEW BUTTONS during navigation =====
    const arModeBtn = document.getElementById('arModeBtn');
    if (arModeBtn) {
        arModeBtn.style.display = 'flex';
    }
    const driverPerspectiveBtn = document.getElementById('driverPerspectiveToggle');
    if (driverPerspectiveBtn) {
        driverPerspectiveBtn.style.display = 'flex';
        VoyagrModules.toggleUI().applyToggleButton(driverPerspectiveBtn, shouldUsePitchedDrivingCamera());
    }

    sendNotification(
        isQuietResume ? 'Navigation resumed' : 'Navigation Started',
        isQuietResume ? 'Continuing your saved route.' : 'Turn-by-turn guidance activated',
        'success'
    );
    if (!isQuietResume) {
        speakMessage('Navigation started. Follow the route.');
    }
    showStatus(isQuietResume ? '🧭 Navigation resumed — following saved route' : '🧭 Turn-by-turn navigation active', 'success');
    try {
        // After wake-lock + other status messages (they overwrite #status).
        setTimeout(() => {
            try {
                showVolumeHintForNavigation();
            } catch (e) {
                console.warn('[EnvHint] volume hint:', e);
            }
        }, 2600);
    } catch (e) {
        console.warn('[EnvHint] volume hint schedule:', e);
    }
}

/**
 * stopTurnByTurnNavigation function
 * @function stopTurnByTurnNavigation
 * @returns {*} Return value description
 */
function stopTurnByTurnNavigation() {
    if (!routeInProgress && !isTrackingActive) {
        updateNavigationFabVisibility();
        return;
    }

    resetNavigationArrivalState();

    // Show summary if we have a valid route and were actually navigating.
    // Use the real driven distance/time (odometer) so reroutes/detours are reflected,
    // not just the final route leg stored in window.lastCalculatedRoute.
    if (window.lastCalculatedRoute && routeInProgress) {
        const summaryRoute = buildTraveledJourneyRoute(window.lastCalculatedRoute);
        void persistCompletedTrip(summaryRoute);
        showJourneySummary(summaryRoute);
    }

    routeInProgress = false;
    routeJoinConfirmedForDeviation = false;
    clearRerouteFailureRetries();
    currentStepIndex = 0;
    currentRouteSteps = [];
    resetVehicleMarkerDisplayState();
    clearPersistedRoute();
    stopGPSTracking();
    hideRoadNameBar();

    // ===== SCREEN WAKE LOCK: Release screen lock when navigation ends =====
    if (window.screenWakeLock) {
        window.screenWakeLock.release()
            .then(() => {
                console.log('[Screen Wake Lock] Screen lock released - screen can turn off');
                window.screenWakeLock = null;
            })
            .catch(err => {
                console.log('[Screen Wake Lock] Error releasing wake lock:', err);
            });
    }

    // ===== PHASE 1: Stop live data refresh =====
    stopLiveDataRefresh();
    clearInitialETAAnnouncement();
    initialETAMovementRetries = 0;

    // ===== STOP AUTO-TRAFFIC UPDATES =====
    stopAutoTrafficUpdates();
    console.log('[Navigation] Auto-traffic updates stopped');

    // ===== STOP ROUTE TRAFFIC EDGE DISPLAY =====
    stopRouteTrafficUpdates();
    console.log('[Navigation] Route traffic edge display stopped');

    // ===== HIDE ZOOM AND FOLLOW BUTTON =====
    mapFollowingActive = false;
    const zoomFollowBtn = document.getElementById('zoomFollowToggle');
    if (zoomFollowBtn) {
        zoomFollowBtn.style.display = 'none';
    }

    const recenterBtn = document.getElementById('recenterVehicleFab');
    if (recenterBtn) {
        recenterBtn.style.display = 'none';
    }

    // ===== HIDE JOURNEY OVERVIEW BUTTON =====
    const journeyOverviewBtn = document.getElementById('journeyOverviewBtn');
    if (journeyOverviewBtn) {
        journeyOverviewBtn.style.display = 'none';
    }
    journeyOverviewActive = false;

    updateRoadReportFabVisibility();
    updateNavigationFabVisibility();

    // ===== HIDE SPEED WIDGET (use consolidated function) =====
    updateSpeedWidgetVisibility();

    // ===== HIDE TURN INSTRUCTION WIDGET =====
    hideTurnInstructionWidget();

    // ===== HIDE JOURNEY SUMMARY BAR =====
    hideJourneySummaryBar();

    // ===== HIDE AR AND 3D VIEW BUTTONS =====
    const arModeBtn = document.getElementById('arModeBtn');
    if (arModeBtn) {
        arModeBtn.style.display = 'none';
    }
    const driverPerspectiveBtn = document.getElementById('driverPerspectiveToggle');
    if (driverPerspectiveBtn) {
        driverPerspectiveBtn.style.display = 'none';
    }
    // Stop AR mode if active
    if (arModeActive) {
        stopARMode();
    }
    // After nav, flat map unless user still wants driver view for browsing
    if (map) {
        if (driverPerspectiveEnabled) {
            applyDriverPerspective();
        } else {
            map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
        }
    }

    savedMapState = null;

    // ===== PHASE 2: Apply pending PWA update if available =====
    if (updatePending) {
        showStatus('🔄 Applying pending update...', 'success');
        saveAppState();
        setTimeout(() => {
            window.location.reload();
        }, 1000);
        return;
    }

    showStatus('Navigation stopped', 'info');
    sendNotification('Navigation Ended', 'Route guidance ended', 'info');
}
/**
 * updateTurnGuidance function
 * @function updateTurnGuidance
 * @param {*} userLat - Parameter description
 * @param {*} userLon - Parameter description
 * @returns {*} Return value description
 */
function updateTurnGuidance(userLat, userLon) {
    if (!routeInProgress || !routePolyline || routePolyline.length === 0) return;

    // Find closest point on route
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routePolyline.length; i++) {
        const distance = calculateDistance(userLat, userLon, routePolyline[i][0], routePolyline[i][1]);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }

    // Calculate distance to end of route
    let distanceToEnd = 0;
    for (let i = closestIndex; i < routePolyline.length - 1; i++) {
        distanceToEnd += calculateDistance(
            routePolyline[i][0], routePolyline[i][1],
            routePolyline[i + 1][0], routePolyline[i + 1][1]
        );
    }

    // Update turn guidance display with proper unit conversion
    const turnInfo = document.getElementById('turnInfo');
    if (turnInfo) {
        const distanceKm = distanceToEnd / 1000;
        const progressPercent = (closestIndex / routePolyline.length) * 100;
        turnInfo.innerHTML = VoyagrModules.eta().buildDestinationProgressPanelHtml(
            convertDistance(distanceKm),
            getDistanceUnit(),
            progressPercent
        );
    }

    // REMOVED: Redundant generic "Turn ahead" announcement
    // Turn announcements are now handled properly by announceUpcomingTurn() with specific directions
}

// ===== QUICK SEARCH FUNCTIONS =====
/**
 * quickSearch function - searches for POIs near current location
 * @function quickSearch
 * @param {string} type - Type of POI to search for (parking, fuel, food)
 */
function quickSearch(type) {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    console.log(`[QuickSearch] Starting search for ${type}`);
    showStatus(`🔍 Searching for ${type}...`, 'info');

    // Use cached position if available, otherwise get current position
    const searchWithPosition = async (lat, lon) => {
        console.log(`[QuickSearch] Searching at position: ${lat}, ${lon}`);
        try {
            // Use the POI search API
            const response = await fetch('/api/poi-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: lat,
                    lon: lon,
                    type: type,
                    radius: 3000  // 3km radius
                })
            });

            const data = await response.json();
            console.log(`[QuickSearch] Response:`, data);

            if (!data.success || !data.results || data.results.length === 0) {
                showStatus(`No ${type} found nearby. Try a different location.`, 'warning');
                return;
            }

            // Display POI results in a modal or list
            console.log(`[QuickSearch] Displaying ${data.results.length} results`);
            displayPOIResults(data.results, type, lat, lon);
            showStatus(`✅ Found ${data.results.length} ${type} options`, 'success');

        } catch (error) {
            console.error('[QuickSearch] Error:', error);
            showStatus('Error searching for ' + type + ': ' + error.message, 'error');
        }
    };

    // If we have a cached current position, use it immediately
    if (currentLat && currentLon) {
        console.log('[QuickSearch] Using cached position');
        searchWithPosition(currentLat, currentLon);
        return;
    }

    // Otherwise get a fresh position
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            currentLat = lat;
            currentLon = lon;
            searchWithPosition(lat, lon);
        },
        (error) => {
            console.error('[QuickSearch] GPS Error:', error);
            showStatus('Error getting location: ' + error.message, 'error');
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }  // 30s timeout, allow 1min cached position
    );
}

/**
 * Display POI search results in a modal
 * @param {Array} results - Array of POI results
 * @param {string} type - Type of POI
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 */
function displayPOIResults(results, type, userLat, userLon) {
    closePOIModal();
    document.body.insertAdjacentHTML('beforeend', VoyagrModules.poiSearch().buildPoiResultsModalHtml(results, type, {
        userLat: userLat,
        userLon: userLon,
        distanceTexts: results.map((poi) => VoyagrModules.units().formatPoiDistanceMeters(poi.distance_m, distanceUnit)),
    }));
}

/**
 * Close the POI results modal
 */
function closePOIModal() {
    const modal = document.getElementById('poiModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Select a POI and set it as destination
 * @param {number} poiLat - POI latitude
 * @param {number} poiLon - POI longitude
 * @param {string} poiName - POI name
 * @param {number} userLat - User's current latitude
 * @param {number} userLon - User's current longitude
 */
function selectPOI(poiLat, poiLon, poiName, userLat, userLon) {
    closePOIModal();

    // Set start to current location
    document.getElementById('start').value = `${userLat},${userLon}`;

    // Set end to POI location
    document.getElementById('end').value = `${poiLat},${poiLon}`;

    showStatus(`📍 Destination set: ${poiName}`, 'success');

    // Automatically calculate route
    calculateRoute();
}

// ===== ROUTE AVOIDANCE PREFERENCES =====

function toggleAvoidancePreference(pref) {
    const btn = document.getElementById('avoid' + pref.charAt(0).toUpperCase() + pref.slice(1));
    if (!btn) return;
    const isActive = btn.classList.toggle('active');
    if (isActive) {
        btn.style.background = '#4CAF50';
        btn.style.borderColor = '#4CAF50';
    } else {
        btn.style.background = '#ccc';
        btn.style.borderColor = '#ccc';
    }
    localStorage.setItem('pref_avoid_' + pref, isActive ? 'true' : 'false');
    console.log(`[Avoidance] ${pref} = ${isActive}`);
}

function loadAvoidancePreferences() {
    const prefs = ['tollRoads', 'motorways', 'ferries'];
    prefs.forEach(pref => {
        const isActive = localStorage.getItem('pref_avoid_' + pref) === 'true';
        const btn = document.getElementById('avoid' + pref.charAt(0).toUpperCase() + pref.slice(1));
        if (btn) {
            if (isActive) {
                btn.classList.add('active');
                btn.style.background = '#4CAF50';
                btn.style.borderColor = '#4CAF50';
            } else {
                btn.classList.remove('active');
                btn.style.background = '#ccc';
                btn.style.borderColor = '#ccc';
            }
        }
    });
}


// ===== ROAD NAME DISPLAY (TomTom Reverse Geocoding) =====

let lastRoadNameFetch = 0;
const ROAD_NAME_FETCH_INTERVAL = 5000;
let lastRoadNamePosition = null;
const ROAD_NAME_DISTANCE_THRESHOLD = 50;
let currentRoadDisplayName = '';

function fetchRoadNameThrottled(lat, lon) {
    const now = Date.now();
    if (now - lastRoadNameFetch < ROAD_NAME_FETCH_INTERVAL) return;

    let distanceMoved = 999;
    if (lastRoadNamePosition) {
        distanceMoved = calculateDistanceMeters(lat, lon, lastRoadNamePosition.lat, lastRoadNamePosition.lon);
    }

    if (distanceMoved < ROAD_NAME_DISTANCE_THRESHOLD && lastRoadNameFetch > 0) return;

    lastRoadNameFetch = now;
    lastRoadNamePosition = { lat, lon };

    fetch(`/api/road-info?lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.road_name) {
                currentRoadDisplayName = data.road_name;
                const bar = document.getElementById('roadNameBar');
                const label = document.getElementById('currentRoadName');
                if (bar && label) {
                    label.textContent = data.road_name;
                    bar.style.display = 'block';
                }
            }
        })
        .catch(err => {
            console.debug('[RoadName] Fetch error:', err);
        });
}

function hideRoadNameBar() {
    const bar = document.getElementById('roadNameBar');
    if (bar) bar.style.display = 'none';
    currentRoadDisplayName = '';
}


// ===== SEARCH ALONG ROUTE =====

function searchAlongRoute() {
    const cats = document.getElementById('alongRouteCategories');
    if (cats) {
        cats.style.display = cats.style.display === 'none' ? 'block' : 'none';
    }
}

function searchAlongRouteByType(type) {
    if (!routePolyline || routePolyline.length < 2) {
        showStatus('Calculate a route first', 'error');
        return;
    }

    showStatus(`Searching for ${type} along route...`, 'info');

    const routePoints = routePolyline.map(p => [p[0], p[1]]);

    fetch('/api/poi-along-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            route_points: routePoints,
            type: type,
            radius: 1000,
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.results && data.results.length > 0) {
            displayPOIResults(data.results, type, currentLat || 51.5074, currentLon || -0.1278);
            addPOIMarkersToMap(data.results, type);
            showStatus(`Found ${data.results.length} ${type} along route`, 'success');
        } else {
            showStatus(`No ${type} found along route`, 'info');
        }
    })
    .catch(err => {
        console.error('[AlongRoute] Error:', err);
        showStatus('Search failed', 'error');
    });
}

function addPOIMarkersToMap(pois, type) {
    clearPOIMarkers();

    const POI = VoyagrModules.poiSearch();
    const icon = POI.getPoiMapMarkerIcon(type);

    pois.forEach((poi, idx) => {
        if (!window.map) return;

        const el = document.createElement('div');
        el.className = 'poi-marker';
        el.style.cssText = POI.getPoiMapMarkerStyleCssText();
        el.textContent = icon;
        el.title = poi.name;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([poi.lon, poi.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(POI.buildPoiMapMarkerPopupHtml(poi)))
            .addTo(window.map);

        if (!window._poiMarkers) window._poiMarkers = [];
        window._poiMarkers.push(marker);
    });
}

function clearPOIMarkers() {
    if (window._poiMarkers) {
        window._poiMarkers.forEach(m => m.remove());
        window._poiMarkers = [];
    }
}


// ===== BEST TIME TO LEAVE =====

function analysebestTimeToLeave() {
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');

    if (!startInput || !endInput || !startInput.value || !endInput.value) {
        showStatus('Enter start and end locations first', 'error');
        return;
    }

    const startVal = startInput.value.trim();
    const endVal = endInput.value.trim();

    let startLat, startLon, endLat, endLon;

    const startDataLat = startInput.getAttribute('data-lat');
    const startDataLon = startInput.getAttribute('data-lon');
    const endDataLat = endInput.getAttribute('data-lat');
    const endDataLon = endInput.getAttribute('data-lon');

    if (startDataLat && startDataLon) {
        startLat = parseFloat(startDataLat);
        startLon = parseFloat(startDataLon);
    } else {
        const parts = startVal.split(',');
        if (parts.length === 2) {
            startLat = parseFloat(parts[0]);
            startLon = parseFloat(parts[1]);
        }
    }

    if (endDataLat && endDataLon) {
        endLat = parseFloat(endDataLat);
        endLon = parseFloat(endDataLon);
    } else {
        const parts = endVal.split(',');
        if (parts.length === 2) {
            endLat = parseFloat(parts[0]);
            endLon = parseFloat(parts[1]);
        }
    }

    if (!startLat || !endLat) {
        showStatus('Geocode locations first (calculate a route)', 'error');
        return;
    }

    showStatus('Analysing traffic patterns...', 'loading');

    fetch('/api/best-time-to-leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start_lat: startLat, start_lon: startLon,
            end_lat: endLat, end_lon: endLon,
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const container = document.getElementById('bestTimeResult');
            const slotsDiv = document.getElementById('bestTimeSlots');
            if (!container || !slotsDiv) return;

            const sortedSlots = data.all_slots.slice().sort((a, b) => {
                const timeA = a.time.split(':').map(Number);
                const timeB = b.time.split(':').map(Number);
                return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
            });

            slotsDiv.innerHTML = _bestTimeLeave().buildBestTimeSlotsPanelHtml(sortedSlots, data.best_time, {
                source: data.source,
                analysed_at: data.analysed_at,
            });
            container.style.display = 'block';
            showStatus('Traffic analysis complete', 'success');
        } else {
            showStatus(data.error || 'Analysis failed', 'error');
        }
    })
    .catch(err => {
        console.error('[BestTime] Error:', err);
        showStatus('Analysis failed', 'error');
    });
}

function applyBestDepartureTime(timeStr) {
    const today = new Date();
    const [hours, minutes] = timeStr.split(':');
    today.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    const dtInput = document.getElementById('departureTime');
    if (dtInput) {
        const formatted = today.toISOString().slice(0, 16);
        dtInput.value = formatted;
        localStorage.setItem('pref_departureTime', formatted);
        showStatus(`Departure time set to ${timeStr}`, 'success');
    }
}


// ===== NOTIFICATIONS SYSTEM FUNCTIONS =====
/**
 * sendNotification function
 * @function sendNotification
 * @param {*} title - Parameter description
 * @param {*} message - Parameter description
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function sendNotification(title, message, type = 'info') {
    // Throttle notifications to prevent spam
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) {
        return;
    }
    lastNotificationTime = now;

    // Send browser push notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const notification = new Notification(title, {
                body: message,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: type,
                requireInteraction: type === 'warning' || type === 'error'
            });

            // Auto-close after 5 seconds (unless warning/error)
            if (type !== 'warning' && type !== 'error') {
                setTimeout(() => notification.close(), 5000);
            }

            notification.onclick = () => {
                window.focus();
                notification.close();
            };
        } catch (e) {
            console.log('Notification error:', e);
        }
    }

    // Also show in-app notification
    showInAppNotification(title, message, type);
}
/**
 * showInAppNotification function
 * @function showInAppNotification
 * @param {*} title - Parameter description
 * @param {*} message - Parameter description
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function showInAppNotification(title, message, type = 'info', durationMs = 5000) {
    const notifContainer = document.getElementById('notificationContainer');
    if (!notifContainer) {
        console.log('Notification container not found');
        return;
    }

    const notif = document.createElement('div');
    notif.className = `in-app-notification notification-${type}`;
    notif.innerHTML = _deviceEnvironment().buildInAppNotificationHtml(title, message);

    notifContainer.appendChild(notif);

    const ttl = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 5000;
    setTimeout(() => {
        if (notif.parentElement) {
            notif.remove();
        }
    }, ttl);
}

/** Min interval between same-class environment hints (offline / GPS / volume). */
const _envHintLast = { offline: 0, online: 0, gps: 0, volume: 0 };

/**
 * In-app (+ system notification if permitted) for connectivity / GPS / volume reminders.
 * Uses its own throttle so it is not blocked by generic sendNotification throttling.
 * @param {'offline'|'online'|'gps'|'volume'} channel
 */
function sendEnvironmentHint(channel, title, message, type = 'warning') {
    const DE = _deviceEnvironment();
    const now = Date.now();
    if (now - (_envHintLast[channel] || 0) < DE.ENV_HINT_MIN_MS) return;
    _envHintLast[channel] = now;

    showInAppNotification(title, message, type);

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: `voyagr-env-${channel}`,
                requireInteraction: type === 'warning' || type === 'error'
            });
        } catch (e) {
            console.log('[EnvHint] Notification API:', e);
        }
    }
}

/**
 * Offline/online, GPS permission, and (when starting nav) volume reminders.
 * System volume cannot be read in a browser; we remind when voice guidance is on.
 */
function initDeviceEnvironmentNotifications() {
    try {
        const DE = _deviceEnvironment();
        const hints = DE.ENV_HINT_MESSAGES;

        const notifyOffline = () =>
            sendEnvironmentHint('offline', hints.offline.title, hints.offline.message, hints.offline.type);
        const notifyOnline = () =>
            sendEnvironmentHint('online', hints.online.title, hints.online.message, hints.online.type);

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            notifyOffline();
        }

        window.addEventListener('offline', notifyOffline);
        window.addEventListener('online', notifyOnline);

        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            try {
                navigator.permissions
                    .query({ name: 'geolocation' })
                    .then((status) => {
                        const onChange = () => {
                            if (status.state === 'denied') {
                                sendEnvironmentHint(
                                    'gps',
                                    hints.gps.title,
                                    hints.gps.message,
                                    hints.gps.type
                                );
                            }
                        };
                        onChange();
                        status.addEventListener('change', onChange);
                    })
                    .catch(() => {
                        /* Safari / older browsers: no Permissions API for geolocation */
                    });
            } catch (e) {
                console.log('[EnvHint] permissions.query not available:', e);
            }
        }
    } catch (e) {
        console.warn('[EnvHint] initDeviceEnvironmentNotifications:', e);
    }
}

/**
 * Volume reminder: textual (fixed banner + top-right toast) + optional spoken line if voice is on.
 * Does not use #status — wake lock and other code overwrite that element.
 */
function showVolumeHintForNavigation() {
    const DE = _deviceEnvironment();
    const hint = DE.VOLUME_HINT;

    if (typeof voiceAnnouncementsEnabled !== 'undefined' && voiceAnnouncementsEnabled) {
        try {
            speakMessage(hint.spokenLine, 'high');
        } catch (e) {
            console.log('[EnvHint] volume TTS:', e);
        }
    }

    let chip = document.getElementById(DE.VOLUME_HINT_BANNER_ID);
    if (chip) chip.remove();
    chip = document.createElement('div');
    chip.id = DE.VOLUME_HINT_BANNER_ID;
    chip.setAttribute('role', 'status');
    chip.style.cssText = DE.getVolumeHintBannerStyleCssText();
    chip.innerHTML = DE.buildVolumeHintBannerHtml(hint.line, hint.detail);
    document.body.appendChild(chip);
    // Must query inside `chip` (or append before getElementById): detached nodes are not in document, so getElementById returned null and clicks did nothing.
    const dismiss = chip.querySelector('#volumeHintDismiss');
    if (dismiss) dismiss.onclick = () => chip.remove();
    const ok = chip.querySelector('#volumeHintOk');
    if (ok) ok.onclick = () => chip.remove();

    setTimeout(() => {
        const el = document.getElementById(DE.VOLUME_HINT_BANNER_ID);
        if (el) el.remove();
    }, hint.autoDismissMs);

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(hint.notificationTitle, {
                body: `${hint.line} ${hint.detail}`,
                icon: '/favicon.ico',
                tag: 'voyagr-volume-hint',
                silent: true
            });
        } catch (e) {
            console.log('[EnvHint] volume Notification:', e);
        }
    }
}

/**
 * speakMessage function
 * @function speakMessage
 * @param {*} message - Parameter description
 * @returns {*} Return value description
 */
function speakMessage(message, priority = 'normal') {
    const now = Date.now();
    const timeSinceLastAnnouncement = now - lastVoiceAnnouncementTime;
    const throttle = VOICE_FREQUENCY_THROTTLES[voiceFrequencyMode] || VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS;

    if (voiceFrequencyMode === 'minimal' && priority !== 'high') {
        console.log(`[Voice] Skipped (minimal mode): "${message}"`);
        return;
    }
    if (voiceFrequencyMode === 'important' && priority !== 'high' && priority !== 'normal') {
        console.log(`[Voice] Skipped (important-only mode): "${message}"`);
        return;
    }

    if (priority !== 'high' && timeSinceLastAnnouncement < throttle) {
        console.log(`[Voice] Throttled: "${message}" (${timeSinceLastAnnouncement}ms since last, throttle=${throttle}ms)`);
        return;
    }

    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        speechSynthesis.speak(utterance);
        lastVoiceAnnouncementTime = now;
        console.log(`[Voice] Speaking: "${message}"`);
    }
}
/**
 * sendETANotification function
 * @function sendETANotification
 * @param {*} eta - Parameter description
 * @param {*} distance - Parameter description
 * @returns {*} Return value description
 */
function sendETANotification(eta, distance) {
    const etaTime = new Date(eta);
    const timeStr = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sendNotification('ETA Update', `Arriving at ${timeStr} (${distance} remaining)`, 'info');
}

/**
 * sendArrivalNotification function
 * @function sendArrivalNotification
 * @returns {*} Return value description
 */
function sendArrivalNotification() {
    if (!routeInProgress || _navigationArrivalTriggered) {
        return;
    }
    _navigationArrivalTriggered = true;
    sendNotification('🎉 Destination Reached', 'You have arrived at your destination', 'success');
    speakMessage('You have arrived at your destination');
    stopTurnByTurnNavigation();
}

// ===== PREFERENCE FUNCTIONS =====
/**
 * togglePreference function
 * @function togglePreference
 * @param {*} pref - Parameter description
 * @returns {*} Return value description
 */
function togglePreference(pref) {
    // Safety check - pref should not be undefined
    if (!pref) {
        console.error('[Preferences] togglePreference called with undefined pref');
        return;
    }

    const RP = VoyagrModules.routePrefs();
    const buttonId = RP.resolveRouteAvoidanceButtonId(pref);
    const button = document.getElementById(buttonId);

    if (!button) {
        console.warn('[Preferences] Button not found for preference:', pref, 'ID:', buttonId);
        return;
    }

    button.classList.toggle('active');
    const isActive = button.classList.contains('active');
    localStorage.setItem(RP.getRouteAvoidancePrefStorageKey(pref), isActive ? 'true' : 'false');

    VoyagrModules.toggleUI().applyLabeledToggleButton(button, isActive);

    // Handle specific preference behaviors
    if (pref === 'caz') {
        console.log('[Settings] Charge zones routing:', isActive ? 'enabled' : 'disabled');
        showStatus(`Emissions charge zones ${isActive ? 'on' : 'off'} for routing`, 'info');
    } else if (pref === 'cameras') {
        console.log('[Settings] Smarter routing:', isActive ? 'enabled' : 'disabled');
        showStatus(`Map-based routing ${isActive ? 'on' : 'off'}`, 'info');
    } else if (pref === 'trafficLightsAvoid') {
        console.log('[Settings] Traffic signals routing:', isActive ? 'enabled' : 'disabled');
        showStatus(`Traffic signals ${isActive ? 'on' : 'off'} for routing`, 'info');
    } else if (pref === 'railwayCrossingsAvoid') {
        console.log('[Settings] Level crossings routing:', isActive ? 'enabled' : 'disabled');
        showStatus(`Level crossings ${isActive ? 'on' : 'off'} for routing`, 'info');
    }

    // Save all settings to persistent storage
    saveAllSettings();
}

const HAZARD_CAMERA_SUBTYPES = VoyagrModules.hazardAlerts().HAZARD_CAMERA_PREF_SUBTYPES;

function hazardPrefEnabled(pref) {
    return VoyagrModules.hazardAlerts().isHazardPreferenceEnabled(pref);
}

function applyHazardToggleStyles(button, enabled) {
    VoyagrModules.toggleUI().applyLabeledToggleButton(button, enabled);
}

async function loadHazardCameraTogglesFromApi() {
    try {
        const res = await fetch('/api/hazard-preferences');
        const data = await res.json();
        const prefsList = data.success && data.preferences ? data.preferences : [];
        for (const ht of HAZARD_CAMERA_SUBTYPES) {
            const pref = prefsList.find(p => p.hazard_type === ht);
            const btn = document.querySelector(`button.hazard-pref-toggle[data-hazard-type="${ht}"]`);
            if (!btn) continue;
            applyHazardToggleStyles(btn, hazardPrefEnabled(pref));
        }
    } catch (e) {
        console.warn('[HAZARDS] Could not load camera hazard preferences:', e);
        for (const ht of HAZARD_CAMERA_SUBTYPES) {
            const btn = document.querySelector(`button.hazard-pref-toggle[data-hazard-type="${ht}"]`);
            if (btn) applyHazardToggleStyles(btn, true);
        }
    }
}

async function toggleHazardPreferenceApi(hazardType, ev) {
    if (ev) ev.preventDefault();
    try {
        const res = await fetch('/api/hazard-preferences');
        const data = await res.json();
        if (!data.success || !data.preferences) {
            showStatus('Could not load hazard preferences', 'error');
            return;
        }
        const pref = data.preferences.find(p => p.hazard_type === hazardType);
        const currentlyOn = hazardPrefEnabled(pref);
        const newEnabled = !currentlyOn;

        const payload = { hazard_type: hazardType, enabled: newEnabled };
        if (pref) {
            payload.penalty_seconds = pref.penalty_seconds;
            payload.proximity_threshold_meters = pref.proximity_threshold_meters;
        }

        const upd = await fetch('/api/hazard-preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const out = await upd.json();
        if (!out.success) {
            showStatus(out.error || 'Update failed', 'error');
            return;
        }
        const btn = document.querySelector(`button.hazard-pref-toggle[data-hazard-type="${hazardType}"]`);
        applyHazardToggleStyles(btn, newEnabled);
        const label = hazardType.replace(/^camera_/, '').replace(/_/g, ' ');
        showStatus(`Camera (${label}) avoidance ${newEnabled ? 'enabled' : 'disabled'}`, 'info');
        saveAllSettings();
    } catch (e) {
        console.error('[HAZARDS] toggle:', e);
        showStatus('Could not update hazard preference', 'error');
    }
}

window.toggleHazardPreferenceApi = toggleHazardPreferenceApi;
window.loadHazardCameraTogglesFromApi = loadHazardCameraTogglesFromApi;

/**
 * loadPreferences function
 * @function loadPreferences
 * @returns {*} Return value description
 */
function loadPreferences() {
    const RP = VoyagrModules.routePrefs();
    const TU = VoyagrModules.toggleUI();

    RP.ROUTE_AVOIDANCE_PREF_KEYS.forEach((pref) => {
        const button = document.getElementById(RP.resolveRouteAvoidanceButtonId(pref));

        if (button) {
            const isEnabled = RP.isRouteAvoidancePrefEnabled(pref, localStorage);
            TU.applyLabeledToggleButton(button, isEnabled);
            console.log('[Settings] Loaded preference:', pref, '=', isEnabled ? 'enabled' : 'disabled',
                localStorage.getItem(RP.getRouteAvoidancePrefStorageKey(pref)) === null ? '(default)' : '');
        } else {
            console.warn('[Settings] Button not found for preference:', pref, 'ID:', RP.resolveRouteAvoidanceButtonId(pref));
        }
    });

    loadHazardCameraTogglesFromApi();

    // ===== LOAD GESTURE CONTROL PREFERENCE =====
    const gestureSaved = localStorage.getItem('gestureEnabled');
    if (gestureSaved === 'true') {
        const button = document.getElementById('gestureEnabled');
        if (button) {
            TU.applyToggleButton(button, true);
            gestureEnabled = true;
            document.getElementById('gestureSettings').style.display = 'block';
            if ('DeviceMotionEvent' in window) {
                window.addEventListener('devicemotion', handleDeviceMotion);
            }
        }
    }

    // ===== LOAD AUTO GPS PREFERENCE =====
    const autoGpsSaved = localStorage.getItem('autoGpsEnabled');
    if (autoGpsSaved === 'true') {
        const toggle = document.getElementById('autoGpsToggle');
        if (toggle) {
            toggle.checked = true;
            autoGpsEnabled = true;
            startAutoGpsLocation();
            console.log('[Auto GPS] Preference restored from localStorage');
        }
    }

    // ===== LOAD BATTERY SAVING MODE PREFERENCE =====
    const batterySavingSaved = localStorage.getItem('pref_batterySaving');
    if (batterySavingSaved === 'true') {
        const button = document.getElementById('batterySavingMode');
        if (button) {
            TU.applyToggleButton(button, true);
            batterySavingMode = true;
            console.log('[Battery] Battery saving mode restored from localStorage');
        }
    }

    applySpeedWidgetToggleUi();
}

// Update trip info display
/**
 * updateTripInfo function
 * @function updateTripInfo
 * @param {*} distance - Parameter description (can be string like "8.64 km" or number)
 * @param {*} time - Parameter description
 * @param {*} fuelCost - Parameter description
 * @param {*} tollCost - Parameter description
 * @returns {*} Return value description
 */
function updateTripInfo(distance, time, fuelCost, tollCost) {
    const tripInfo = document.getElementById('tripInfo');
    if (!distance || !time) return;

    const distanceKm = parseFloat(distance) || 0;
    const durationMinutes = VoyagrModules.routeSharing().parseSharedRouteDurationMinutes(time);
    const display = VoyagrModules.routeSelection().buildTripInfoDisplayValues(
        {
            distance_km: distanceKm,
            duration_minutes: durationMinutes,
            fuel_cost: fuelCost === '-' ? 0 : fuelCost,
            toll_cost: tollCost === '-' ? 0 : tollCost,
        },
        {
            distanceText: convertDistance(distanceKm),
            distUnit: getDistanceUnit(),
            currencySymbol: getCurrencySymbol(),
        }
    );
    if (!display) return;

    applyTripInfoDisplayValues(display);
    if (fuelCost === '-') {
        const fuelEl = document.getElementById('fuelCost');
        if (fuelEl) fuelEl.textContent = '-';
    }
    if (tollCost === '-') {
        const tollEl = document.getElementById('tollCost');
        if (tollEl) tollEl.textContent = '-';
    }
    tripInfo.classList.add('show');
    const alongRouteBtn = document.getElementById('alongRouteSearch');
    if (alongRouteBtn) alongRouteBtn.style.display = 'block';
}

// Update clearForm to also hide trip info
const originalClearForm = clearForm;
clearForm = function () {
    originalClearForm();
    document.getElementById('tripInfo').classList.remove('show');
    const alongRouteBtn = document.getElementById('alongRouteSearch');
    if (alongRouteBtn) alongRouteBtn.style.display = 'none';
    hideRoadNameBar();
    clearPOIMarkers();
};

// Update calculateRoute to show trip info
const originalCalculateRoute = calculateRoute;
calculateRoute = function (...args) {
    // calculateRoute is async; forward its promise so `await calculateRoute()`
    // callers actually wait for the calculation to finish (and not resolve early).
    return originalCalculateRoute.apply(this, args);
}

// ===== MOBILE PWA ENHANCEMENTS =====

/**
 * Check if running in standalone PWA mode
 */
function isStandalonePWA() {
    return (window.matchMedia('(display-mode: standalone)').matches) ||
        (window.navigator.standalone === true) ||
        document.referrer.includes('android-app://');
}

/** Chrome/Edge/Android: captures install prompt for Add to Home Screen */
let voyagrDeferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    voyagrDeferredInstallPrompt = e;
    tryShowInstallBanner();
});

/**
 * Check if running on iOS
 */
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Check if running on Android
 */
function isAndroid() {
    return /Android/.test(navigator.userAgent);
}

function dismissAddToHomeScreenForDays(days) {
    const el = document.getElementById(_pwaInstall().PWA_BANNER_ID);
    if (el) el.remove();
    const ms = days * 24 * 60 * 60 * 1000;
    localStorage.setItem('voyagr_add_homescreen_dismiss_until', String(Date.now() + ms));
}

/**
 * Prompt to add Voyagr to home screen when opened in a normal browser tab (not installed PWA).
 * iOS: Safari has no install API — show Share → Add to Home Screen hint.
 * Chrome/Android: uses beforeinstallprompt when available.
 */
function tryShowInstallBanner() {
    if (typeof isStandalonePWA !== 'function' || isStandalonePWA()) return;

    const dismissUntil = parseInt(localStorage.getItem('voyagr_add_homescreen_dismiss_until') || '0', 10);
    if (dismissUntil && Date.now() < dismissUntil) return;

    const ios = typeof isIOS === 'function' && isIOS();
    const deferred = voyagrDeferredInstallPrompt;
    let mode = ios ? 'ios' : deferred ? 'install' : 'generic';

    const existing = document.getElementById(_pwaInstall().PWA_BANNER_ID);
    if (existing) {
        const cur = existing.getAttribute('data-mode');
        if (cur === mode) return;
        if (cur === 'generic' && mode === 'install') {
            existing.remove();
        } else if (cur === 'ios' || cur === 'install') {
            return;
        } else if (cur === 'generic' && mode === 'generic') {
            return;
        }
    }

    if (document.getElementById(_pwaInstall().PWA_BANNER_ID)) return;

    const PWA = _pwaInstall();
    const bar = document.createElement('div');
    bar.id = PWA.PWA_BANNER_ID;
    bar.setAttribute('data-mode', mode);
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Add Voyagr to home screen');
    bar.style.cssText = PWA.getPwaInstallBannerStyleCssText();

    const msg = document.createElement('div');
    msg.style.flex = '1';
    msg.style.minWidth = '200px';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.flexShrink = '0';

    const btnLater = document.createElement('button');
    btnLater.type = 'button';
    btnLater.textContent = 'Not now';
    btnLater.style.cssText = PWA.getPwaDismissButtonStyleCssText();
    btnLater.onclick = () => dismissAddToHomeScreenForDays(14);

    if (mode === 'ios') {
        msg.innerHTML = PWA.buildPwaInstallMessageHtml('ios');
        actions.appendChild(btnLater);
    } else if (mode === 'install') {
        msg.innerHTML = PWA.buildPwaInstallMessageHtml('install');
        const btnInstall = document.createElement('button');
        btnInstall.type = 'button';
        btnInstall.textContent = 'Add to Home screen';
        btnInstall.style.cssText = PWA.getPwaPrimaryButtonStyleCssText();
        btnInstall.onclick = async () => {
            const ev = voyagrDeferredInstallPrompt;
            if (!ev) return;
            try {
                await ev.prompt();
                await ev.userChoice;
            } catch (_) { /* ignore */ }
            voyagrDeferredInstallPrompt = null;
            dismissAddToHomeScreenForDays(365);
        };
        actions.appendChild(btnLater);
        actions.appendChild(btnInstall);
    } else {
        msg.innerHTML = PWA.buildPwaInstallMessageHtml('generic');
        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.textContent = 'Got it';
        btnOk.style.cssText = PWA.getPwaPrimaryButtonStyleCssText();
        btnOk.onclick = () => dismissAddToHomeScreenForDays(14);
        actions.appendChild(btnLater);
        actions.appendChild(btnOk);
    }

    bar.appendChild(msg);
    bar.appendChild(actions);
    document.body.appendChild(bar);
}

/**
 * Trigger haptic feedback if available
 * @param {string} type - 'light', 'medium', 'heavy', or 'selection'
 */
function triggerHaptic(type = 'light') {
    if ('vibrate' in navigator) {
        const durations = {
            'selection': 10,
            'light': 15,
            'medium': 30,
            'heavy': 50
        };
        navigator.vibrate(durations[type] || 15);
    }
}

/**
 * Initialize mobile-specific enhancements
 */
function initMobileEnhancements() {
    console.log('[Mobile] Initializing mobile enhancements');
    console.log('[Mobile] Standalone PWA:', isStandalonePWA());
    console.log('[Mobile] iOS:', isIOS());
    console.log('[Mobile] Android:', isAndroid());

    // Add haptic feedback to FABs and sheet toolbar icon buttons
    document.querySelectorAll('.fab, .sheet-icon-btn').forEach(fab => {
        fab.addEventListener('touchstart', () => {
            triggerHaptic('light');
            fab.classList.add('haptic-feedback');
        }, { passive: true });
        fab.addEventListener('touchend', () => {
            setTimeout(() => fab.classList.remove('haptic-feedback'), 150);
        }, { passive: true });
    });

    // Add haptic feedback to main action buttons
    document.querySelectorAll('.btn, .quick-btn, .toggle-btn').forEach(btn => {
        btn.addEventListener('touchstart', () => {
            triggerHaptic('selection');
        }, { passive: true });
    });

    // Note: Removed double-tap zoom prevention on buttons as it was causing issues
    // with button clicks and input focus. Modern browsers handle this better now.

    // Handle iOS standalone mode status bar
    if (isIOS() && isStandalonePWA()) {
        document.body.classList.add('ios-standalone');
        // Set viewport to account for notch
        const meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        }
    }

    // Handle Android back button in PWA
    if (isAndroid() && isStandalonePWA()) {
        window.addEventListener('popstate', (e) => {
            // Check if bottom sheet is expanded
            const bottomSheet = document.getElementById('bottomSheet');
            if (bottomSheet && bottomSheet.classList.contains('expanded')) {
                e.preventDefault();
                collapseBottomSheet();
                history.pushState(null, '', location.href);
            }
        });
        // Push initial state
        history.pushState(null, '', location.href);
    }

    // Prevent pull-to-refresh on mobile browsers
    document.body.addEventListener('touchmove', (e) => {
        if (voyagrClosest(e.target, '.bottom-sheet-content')) {
            // Allow scrolling in bottom sheet
            return;
        }
        if (window.scrollY === 0 && e.touches[0].clientY > 0) {
            e.preventDefault();
        }
    }, { passive: false });

    // Improve touch scrolling in bottom sheet and fix locking
    const bottomSheetContent = document.querySelector('.bottom-sheet-content');
    const bottomSheetElement = document.getElementById('bottomSheet');

    if (bottomSheetContent && bottomSheetElement) {
        let startY = 0;
        let isDraggingSheet = false;

        // Listeners for content scrolling vs sheet dragging
        bottomSheetContent.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            isDraggingSheet = false;

            // If we are at the top and pulling down, we might want to drag the sheet instead of scroll
            // provided the sheet handles that logic.
        }, { passive: true });

        bottomSheetContent.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const scrollTop = bottomSheetContent.scrollTop;
            const scrollHeight = bottomSheetContent.scrollHeight;
            const clientHeight = bottomSheetContent.clientHeight;
            const isAtTop = scrollTop <= 0;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight;
            const isPullingDown = currentY > startY;
            const isPullingUp = currentY < startY;

            // CRITICAL FIX: Do NOT prevent default if we are at the top and pulling down.
            // Instead, let the event propagate so the sheet drag handler (if active) can pick it up.
            // OR if strictly scrolling, we just let it hit the boundary.

            // Prevent overscroll chaining ONLY if capturing scroll
            if ((isAtTop && isPullingDown) || (isAtBottom && isPullingUp)) {
                // If we want the sheet to drag when pulling down at the top, we shouldn't prevent default blindly
                // unless we are NOT in a draggable state.
                // For now, removing the aggressive preventDefault allows the UI to 'breathe' and potentially
                // pass events to parent handlers.
            }
        }, { passive: true });
    }

    // NOTE: initBottomSheetLogic() removed - initBottomSheet() handles all bottom sheet events
    // Having both caused duplicate event listeners and state conflicts

    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
        console.log('[Mobile] Orientation changed:', screen.orientation?.type || window.orientation);
        // Delay to allow DOM to update
        setTimeout(() => {
            // MapLibre uses resize() instead of Leaflet's invalidateSize()
            if (map && typeof map.resize === 'function') {
                map.resize();
            }
        }, 200);
    });

    // Handle visibility changes (app goes to background/foreground)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('[Mobile] App came to foreground');
            // MapLibre must remeasure the canvas after tab sleep / bfcache; use double
            // rAF so mobile URL bar / 100dvh have settled (avoids blank map + lost markers).
            if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
                window.__voyagrMapResizeAndRepaint();
            } else if (map && typeof map.resize === 'function') {
                map.resize();
            }
            // Resume GPS tracking if it was active
            if (isTrackingActive && !gpsWatchId) {
                startGPSTracking();
            }
        } else {
            console.log('[Mobile] App went to background');
        }
    });

    // BFCache / back-forward: page can restore without a full reload; map WebGL
    // and dimensions must be refreshed. Run on any pageshow, not only bfcache.
    window.addEventListener('pageshow', (ev) => {
        if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
            if (ev.persisted) {
                console.log('[Mobile] pageshow (restored from bfcache) — resyncing map');
            }
            window.__voyagrMapResizeAndRepaint();
        }
    });

    // Orientation and delayed layout (safe-area / dynamic toolbars) change inner dimensions.
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (typeof window.__voyagrMapResizeAndRepaint === 'function') {
                window.__voyagrMapResizeAndRepaint();
            }
        }, 350);
    });

    // Enable smooth transitions after initial load
    setTimeout(() => {
        document.body.classList.add('transitions-enabled');
    }, 300);

    console.log('[Mobile] Mobile enhancements initialized');
}

/**
 * Request persistent storage for PWA
 */
async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        console.log('[PWA] Storage persisted:', isPersisted);
        if (!isPersisted) {
            const result = await navigator.storage.persist();
            console.log('[PWA] Persistent storage granted:', result);
        }
    }
}

/**
 * Check storage usage
 */
async function checkStorageUsage() {
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usage = (estimate.usage / estimate.quota * 100).toFixed(2);
        console.log(`[PWA] Storage used: ${usage}% (${(estimate.usage / 1024 / 1024).toFixed(2)} MB of ${(estimate.quota / 1024 / 1024).toFixed(2)} MB)`);
        return estimate;
    }
    return null;
}

// Initialize mobile enhancements on page load
window.addEventListener('load', () => {
    initMobileEnhancements();
    requestPersistentStorage();
    checkStorageUsage();
    setTimeout(() => tryShowInstallBanner(), 2200);
});

/**
 * Debug function to diagnose scroll issues
 * Run in console: debugScrollIssue()
 */
window.debugScrollIssue = function() {
    const bottomSheet = document.getElementById('bottomSheet');
    const content = document.querySelector('.bottom-sheet-content');
    const activeTab = document.querySelector('.bottom-sheet-content > div[style*="display: block"], .bottom-sheet-content > div:not([style*="display: none"])');

    console.log('=== SCROLL DEBUG ===');
    console.log('Bottom Sheet:', {
        element: bottomSheet,
        classes: bottomSheet?.className,
        height: bottomSheet?.offsetHeight,
        style: bottomSheet?.style.cssText
    });

    console.log('Content Area:', {
        element: content,
        scrollHeight: content?.scrollHeight,
        clientHeight: content?.clientHeight,
        offsetHeight: content?.offsetHeight,
        scrollTop: content?.scrollTop,
        overflowY: content ? getComputedStyle(content).overflowY : null,
        maxHeight: content ? getComputedStyle(content).maxHeight : null,
        touchAction: content ? getComputedStyle(content).touchAction : null
    });

    console.log('Active Tab:', {
        element: activeTab,
        id: activeTab?.id,
        offsetHeight: activeTab?.offsetHeight,
        scrollHeight: activeTab?.scrollHeight
    });

    console.log('Can Scroll?:', content?.scrollHeight > content?.clientHeight ? 'YES' : 'NO');

    // Try scrolling programmatically
    if (content) {
        const oldScroll = content.scrollTop;
        content.scrollTop = 100;
        console.log('Programmatic scroll test:', {
            before: oldScroll,
            after: content.scrollTop,
            worked: content.scrollTop !== oldScroll
        });
    }

    return {
        canScroll: content?.scrollHeight > content?.clientHeight,
        scrollHeight: content?.scrollHeight,
        clientHeight: content?.clientHeight
    };
};

// ===== JOURNEY SUMMARY & SETTINGS CONSOLIDATION =====

/**
 * Build the route object used for the end-of-trip summary / history, overriding the
 * planned distance and duration with what was actually driven (GPS odometer + elapsed
 * navigation time). After one or more reroutes the stored route only covers the final
 * leg, so without this the summary under-reports the whole journey.
 * @param {Object} route - The active route (window.lastCalculatedRoute)
 * @returns {Object} Route with corrected distance_km / duration_minutes when available
 */
function buildTraveledJourneyRoute(route) {
    if (!route) return route;
    const traveledKm = _navTraveledMeters / 1000;
    const out = { ...route };

    const haveRealDistance = traveledKm > 0.05;

    let elapsedMin = null;
    if (Number.isFinite(_navStartedAt) && _navStartedAt > 0) {
        const mins = (Date.now() - _navStartedAt) / 60000;
        if (mins > 0.1) elapsedMin = mins;
    }

    // Substitute the actually-driven distance and the actual elapsed time *together* only.
    // Overriding just one of them produced absurd average speeds in the summary (e.g. 520 mph):
    // when the GPS odometer captured no distance (short test, stationary, or no fixes), the
    // planned full-route distance was paired with the short real elapsed time. If we don't have
    // a real driven distance we keep BOTH planned values so distance ÷ duration stays sane.
    if (haveRealDistance && elapsedMin != null) {
        out.distance_km = Number(traveledKm.toFixed(2));
        // Keep any string display field consistent with the corrected distance.
        if ('distance' in out) {
            try {
                out.distance = `${convertDistance(out.distance_km)} ${getDistanceUnit()}`;
            } catch (_e) {
                delete out.distance;
            }
        }
        out.duration_minutes = Math.round(elapsedMin);
        if ('time' in out) out.time = `${out.duration_minutes} minutes`;
    }

    return out;
}

/**
 * showJourneySummary function
 * Displays a summary of the completed journey
 * @param {Object} routeData - The route data (from window.lastCalculatedRoute)
 */
function showJourneySummary(routeData) {
    if (!routeData) return;

    const modal = document.getElementById('journeySummaryModal');
    if (!modal) return;

    // Populate data
    const distanceKm = routeData.distance_km || 0;
    const durationMin = routeData.duration_minutes || 0;
    const cost = routeData.total_cost || 0;

    // Calculate average speed (km/h). Guard against implausible values from any residual
    // distance/duration mismatch so the summary can never show nonsense like 520 mph.
    let avgSpeed = 0;
    if (durationMin > 0 && distanceKm > 0) {
        avgSpeed = distanceKm / (durationMin / 60);
        const MAX_PLAUSIBLE_AVG_KMH = 300; // ~186 mph — above any real road-journey average
        if (!Number.isFinite(avgSpeed) || avgSpeed > MAX_PLAUSIBLE_AVG_KMH) {
            console.warn(`[Journey Summary] Implausible average speed ${avgSpeed} km/h ` +
                `(dist ${distanceKm} km, dur ${durationMin} min) — clamping`);
            avgSpeed = Math.min(Math.max(avgSpeed, 0), MAX_PLAUSIBLE_AVG_KMH);
        }
    }

    const distUnit = getDistanceUnit();
    const displayDist = convertDistance(distanceKm);

    document.getElementById('summaryDistance').textContent = `${displayDist} ${distUnit}`;
    document.getElementById('summaryTime').textContent = `${Math.round(durationMin)} min`;
    document.getElementById('summaryCost').textContent = `${getCurrencySymbol()}${adjustCostForUnits(cost).toFixed(2)}`;
    document.getElementById('summaryAvgSpeed').textContent = `${convertSpeed(avgSpeed)} ${getSpeedUnit()}`;

    // Show modal
    modal.style.display = 'block';

    // Expand bottom sheet to show the modal properly
    expandBottomSheet();

    console.log('[Journey Summary] Displayed summary');
}

/**
 * closeJourneySummary function
 * Closes the journey summary modal
 */
function closeJourneySummary() {
    const modal = document.getElementById('journeySummaryModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Return to navigation input
    switchTab('navigation');

    // Reset view
    clearForm();
}

/**
 * Updated AR Mode Toggle
 * Handles both the new toggle switch and legacy calls
 */
function toggleARMode() {
    // If not defined globally, define it
    if (typeof window.arModeActive === 'undefined') window.arModeActive = false;

    window.arModeActive = !window.arModeActive;

    // Update button state (both FAB if exists and Toggle Switch)
    const toggleBtn = document.getElementById('arModeBtn');    // New Toggle

    if (toggleBtn) {
        VoyagrModules.toggleUI().applyToggleButton(toggleBtn, window.arModeActive);
    }

    if (window.arModeActive) {
        if (typeof startARMode === 'function') startARMode();
        showStatus('📷 AR Navigation Enabled', 'success');
    } else {
        if (typeof stopARMode === 'function') stopARMode();
        showStatus('📷 AR Navigation Disabled', 'info');
    }
}

// NOTE: toggleDriverPerspective is defined earlier in the file (around line 7711)
// This duplicate was removed to fix the driver's perspective mode conflict
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
    return _routePrefs().isAvoidTollsEnabled(localStorage);
}
window.isAvoidTollsEnabled = isAvoidTollsEnabled;

function getRouteCostParams(vehicleType) {
    const vt = vehicleType || (typeof currentVehicleType !== 'undefined' ? currentVehicleType : null);
    return _routePrefs().getRouteCostParams(vt, localStorage);
}
window.getRouteCostParams = getRouteCostParams;

// Note: All global variables are declared below
// ===== BOTTOM SHEET VARIABLES =====
let bottomSheetStartY = 0;
let bottomSheetCurrentY = 0;
let bottomSheetIsExpanded = false; // Tracks logical state (expanded or collapsed)

// ===== RECENT DESTINATIONS (local history; works without auth) =====
function loadRecentDestinations() {
    return _recentDestinations().loadRecentDestinations();
}

function recordRecentDestination(label, lat, lon, kind) {
    return _recentDestinations().recordRecentDestination(label, lat, lon, kind);
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
    return _units().convertDistance(km, distanceUnit);
}

/**
 * getDistanceUnit function
 * @function getDistanceUnit
 * @returns {*} Return value description
 */
function getDistanceUnit() {
    return _units().getDistanceUnit(distanceUnit);
}

/**
 * convertSpeed function
 * @function convertSpeed
 * @param {*} kmh - Parameter description
 * @returns {*} Return value description
 */
function convertSpeed(kmh) {
    const SG = _speedGps();
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
    return _speedGps().speedUnitLabel(speedUnit);
}

/**
 * convertTemperature function
 * @function convertTemperature
 * @param {*} celsius - Parameter description
 * @returns {*} Return value description
 */
function convertTemperature(celsius) {
    return _units().convertTemperature(celsius, temperatureUnit);
}

/**
 * getTemperatureUnit function
 * @function getTemperatureUnit
 * @returns {*} Return value description
 */
function getTemperatureUnit() {
    return _units().getTemperatureUnit(temperatureUnit);
}

/**
 * getCurrencySymbol function
 * @function getCurrencySymbol
 * @returns {*} Return value description
 */
// getCurrencySymbol / adjustCostForUnits moved to modules/navigation/units.js (VoyagrUnits).
function getCurrencySymbol() {
    return _units().getCurrencySymbol(currencyUnit);
}
/**
 * adjustCostForUnits function
 * @function adjustCostForUnits
 * @param {*} cost - Parameter description
 * @param {*} costType - Parameter description
 * @returns {*} Return value description
 */
function adjustCostForUnits(cost, costType = 'fuel') {
    return _units().adjustCostForUnits(cost);
}
/**
 * getFuelEfficiencyInUnits function
 * @function getFuelEfficiencyInUnits
 * @param {*} liters_per_100km - Parameter description
 * @returns {*} Return value description
 */
function getFuelEfficiencyInUnits(liters_per_100km) {
    return _units().getFuelEfficiencyInUnits(liters_per_100km, distanceUnit);
}

/**
 * getFuelEfficiencyLabel function
 * @function getFuelEfficiencyLabel
 * @returns {*} Return value description
 */
function getFuelEfficiencyLabel() {
    return _units().getFuelEfficiencyLabel(distanceUnit);
}

// ===== NAVIGATION VARIABLES =====
let isTrackingActive = false;
let gpsWatchId = null;
let currentUserMarker = null;
let trackingHistory = [];
let lastZoomLevel = 13;
let smartZoomEnabled = (typeof VoyagrSmartZoom !== 'undefined'
    ? VoyagrSmartZoom.resolveSmartZoomEnabledFromStorage(localStorage.getItem('smartZoomEnabled'))
    : (localStorage.getItem('smartZoomEnabled') === null
        ? true
        : localStorage.getItem('smartZoomEnabled') === '1'));
// Navigation tracking state (global)
// These are now initialized in voyagr-core.js to prevent redeclaration errors
// let zoomAndFollowEnabled = ...;
// let mapFollowingActive = ...;
let navigationActive = false;

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
    const useDark = _theme().shouldUseDarkMode(theme, prefersDark);

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
    const newTheme = _theme().toggleBetweenLightAndDark(currentTheme);
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

    const activeId = _theme().activeThemeButtonId(currentTheme);
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
    const execute = _units().buildLoadUnitPreferencesDomApplyPlan({
        distanceUnit,
        currencyUnit,
        speedUnit,
        temperatureUnit,
    });
    if (!execute.shouldApply) return;
    applyDomSelectsFromPlan(execute.selects);
}

// Update distance unit
/**
 * updateDistanceUnit function
 * @function updateDistanceUnit
 * @returns {*} Return value description
 */
function updateDistanceUnit() {
    const U = _units();
    const execute = U.buildDistanceUnitChangeExecutePlan(
        document.getElementById('distanceUnit')?.value
    );
    if (!execute.shouldChange) return;

    distanceUnit = execute.newUnit;
    localStorage.setItem(execute.storageKey, execute.newUnit);
    if (execute.saveBackend) saveUnitSettingsToBackend();
    if (execute.updateDisplays) updateAllDistanceDisplays();
    if (execute.saveSettings) saveAllSettings();
    showStatus(execute.statusMessage, execute.statusType);
}

// Update currency unit
/**
 * updateCurrencyUnit function
 * @function updateCurrencyUnit
 * @returns {*} Return value description
 */
function updateCurrencyUnit() {
    const U = _units();
    const execute = U.buildCurrencyUnitChangeExecutePlan(
        document.getElementById('currencyUnit')?.value
    );
    if (!execute.shouldChange) return;

    currencyUnit = execute.newUnit;
    localStorage.setItem(execute.storageKey, execute.newUnit);
    if (execute.saveBackend) saveUnitSettingsToBackend();
    if (execute.updateDisplays) updateAllCostDisplays();
    if (execute.saveSettings) saveAllSettings();
    showStatus(execute.statusMessage, execute.statusType);
}

// Update speed unit
/**
 * updateSpeedUnit function
 * @function updateSpeedUnit
 * @returns {*} Return value description
 */
function updateSpeedUnit() {
    const U = _units();
    const execute = U.buildSpeedUnitChangeExecutePlan(
        document.getElementById('speedUnit')?.value
    );
    if (!execute.shouldChange) return;

    speedUnit = execute.newUnit;
    localStorage.setItem(execute.storageKey, execute.newUnit);
    if (execute.saveBackend) saveUnitSettingsToBackend();
    if (execute.updateDisplays) updateAllSpeedDisplays();
    if (execute.saveSettings) saveAllSettings();
    showStatus(execute.statusMessage, execute.statusType);
}

// Update temperature unit
/**
 * updateTemperatureUnit function
 * @function updateTemperatureUnit
 * @returns {*} Return value description
 */
function updateTemperatureUnit() {
    const U = _units();
    const execute = U.buildTemperatureUnitChangeExecutePlan(
        document.getElementById('temperatureUnit')?.value
    );
    if (!execute.shouldChange) return;

    temperatureUnit = execute.newUnit;
    localStorage.setItem(execute.storageKey, execute.newUnit);
    if (execute.saveBackend) saveUnitSettingsToBackend();
    if (execute.updateDisplays) updateAllTemperatureDisplays();
    if (execute.saveSettings) saveAllSettings();
    showStatus(execute.statusMessage, execute.statusType);
}

// Save unit settings to backend
/**
 * saveUnitSettingsToBackend function
 * @function saveUnitSettingsToBackend
 * @returns {*} Return value description
 */
function saveUnitSettingsToBackend() {
    const request = _units().buildSaveUnitSettingsBackendRequestPlan({
        distanceUnit,
        currencyUnit,
        speedUnit,
        temperatureUnit,
    });
    if (!request.shouldSave) return;

    fetch(request.apiPath, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
    }).catch((error) => console.error(request.errorLogPrefix, error));
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
function collectSettingsSnapshotRuntimeState() {
    const traffic = VoyagrTrafficOrchestration.getTrafficSettingsSnapshot();
    return {
        distanceUnit,
        currencyUnit,
        speedUnit,
        temperatureUnit,
        vehicleType: currentVehicleType,
        routingMode: currentRoutingMode,
        smartZoomEnabled,
        showCamerasEnabled,
        showOsmTrafficLightsEnabled,
        showOsmRailwayCrossingsEnabled,
        showTrafficEnabled,
        autoTrafficUpdateEnabled: traffic.autoTrafficUpdateEnabled,
        autoRerouteOnDeviationEnabled: traffic.autoRerouteOnDeviationEnabled,
        routeTrafficEnabled: traffic.routeTrafficEnabled,
        speedWidgetEnabled,
    };
}

function applySaveAllSettingsFromPlan(execute) {
    if (!execute || !execute.shouldSave) return;

    localStorage.setItem(execute.storageKey, execute.storageValue);
    console.log(execute.logMessage, execute.snapshot);

    if (execute.persistActiveProfile) persistActiveProfile();
}

function saveAllSettings() {
    const SS = _settingsSnapshot();
    applySaveAllSettingsFromPlan(
        SS.buildSaveAllSettingsEntryOrchestrationPlan(
            SS.buildCollectSaveAllSettingsInputPlan(
                collectSettingsSnapshotRuntimeState(),
                collectSettingsFormState()
            )
        ).execute
    );
}

/**
 * loadAllSettings function
 * @function loadAllSettings
 * @returns {*} Return value description
 */
function applySettingsRestoreFromPlan(plan) {
    const SS = _settingsSnapshot();
    const execute = SS.buildApplySettingsRestoreExecutePlan(plan);
    if (!execute.shouldRestore) return false;

    (execute.localStoragePatches || []).forEach(({ key, value }) => {
        localStorage.setItem(key, value);
    });

    applySettingsResetRuntimeFromPlan(execute.runtimeExecute);
    return true;
}

function loadAllSettings() {
    const SS = _settingsSnapshot();
    const entry = SS.buildLoadAllSettingsEntryOrchestrationPlan();
    const orch = entry.orch;
    try {
        const saved = localStorage.getItem(orch.storageKey);
        if (!saved) {
            console.log(orch.noSavedLog);
            return false;
        }

        const settings = JSON.parse(saved);
        console.log(orch.loadedLogPrefix, settings);
        const restoreEntry = SS.buildLoadAllSettingsRestoreEntryOrchestrationPlan(settings, {
            routeInProgress,
        });
        if (!applySettingsRestoreFromPlan(restoreEntry.restorePlan)) {
            return false;
        }
        applySettingsRestorePostEffectsFromPlan(restoreEntry.postEffects);

        console.log(orch.successLog);
        return true;
    } catch (error) {
        console.error(orch.errorLogPrefix, error);
        return false;
    }
}

/**
 * Apply post-restore traffic service side effects from a pure execute plan.
 * @param {Object} plan - from buildApplySettingsRestorePostEffectsExecutePlan
 */
function applySettingsRestorePostEffectsFromPlan(plan) {
    if (!plan || !plan.shouldDispatch) return;
    (plan.effects || []).forEach((effect) => {
        if (effect === 'stopRouteTrafficUpdates') stopRouteTrafficUpdates();
        else if (effect === 'startRouteTrafficUpdates') startRouteTrafficUpdates();
        else if (effect === 'stopAutoTrafficUpdates') stopAutoTrafficUpdates();
        else if (effect === 'startAutoTrafficUpdates') startAutoTrafficUpdates();
    });
}

/**
 * Apply select element values from a DOM apply patch list.
 * @param {Array<{ id: string, value: * }>} selects
 */
function applyDomSelectsFromPlan(selects) {
    (selects || []).forEach(({ id, value }) => {
        const el = document.getElementById(id);
        if (el && value != null) el.value = value;
    });
}

/**
 * Apply checkbox states from a DOM apply patch list.
 * @param {Array<{ id: string, checked: boolean }>} checks
 */
function applyDomChecksFromPlan(checks) {
    (checks || []).forEach(({ id, checked }) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!checked;
    });
}

/**
 * Apply standard toggle buttons from a DOM apply patch list.
 * @param {Array<{ id: string, enabled: boolean }>} toggles
 * @param {Object} TU - toggle UI module
 */
function applyStandardTogglesFromPlan(toggles, TU) {
    (toggles || []).forEach(({ id, enabled }) => {
        const el = document.getElementById(id);
        if (el) TU.applyToggleButton(el, enabled);
    });
}

/**
 * Apply labeled toggle buttons from a DOM apply patch list.
 * @param {Array<{ id: string, enabled: boolean }>} toggles
 * @param {Object} TU - toggle UI module
 */
function applyLabeledTogglesFromPlan(toggles, TU) {
    (toggles || []).forEach(({ id, enabled }) => {
        const el = document.getElementById(id);
        if (el) TU.applyLabeledToggleButton(el, enabled);
    });
}

/**
 * Apply map layer reorder instructions from a pure execute plan.
 * @param {Object} plan
 * @returns {boolean}
 */
function applyMapLayerReorderFromPlan(plan) {
    if (!plan || !plan.shouldApply || !map) return false;
    const RS = _routeSelection();

    try {
        const presentById = {};
        plan.layerIds.forEach((layerId) => {
            presentById[layerId] = !!map.getLayer(layerId);
        });

        plan.layerIds.forEach((layerId) => {
            if (!presentById[layerId]) {
                if (plan.logMissingLayers) {
                    const moveLog = RS.buildBringRoutesToTopLayerMoveLogPlan(
                        layerId,
                        plan.beforeId,
                        false
                    );
                    if (moveLog.notFoundLogMessage) console.log(moveLog.notFoundLogMessage);
                }
                return;
            }
            map.moveLayer(layerId, plan.beforeId);
            if (plan.logMissingLayers) {
                const moveLog = RS.buildBringRoutesToTopLayerMoveLogPlan(
                    layerId,
                    plan.beforeId,
                    true
                );
                if (moveLog.movedLogMessage) console.log(moveLog.movedLogMessage);
            }
        });

        if (plan.ensureLabelsOnTop) ensureLabelsOnTop();
        if (plan.successLogMessage) console.log(plan.successLogMessage);
        return true;
    } catch (e) {
        const prefix = plan.errorLogPrefix || '[Map] Layer reorder error:';
        if (plan.useWarnOnError) {
            console.warn(prefix, e.message);
        } else {
            console.log(prefix, e.message);
        }
        return false;
    }
}

/**
 * Apply bringRoutesToTop retry loop from a pure execute plan.
 * @param {Object} plan - from buildBringRoutesToTopExecutePlan
 */
function applyBringRoutesToTopFromPlan(plan) {
    if (!plan || !plan.shouldExecute || !map) return;

    const RS = _routeSelection();

    const moveLayersToTop = (retryCount = 0) => {
        const presentById = {};
        plan.layerIds.forEach((layerId) => {
            presentById[layerId] = !!map.getLayer(layerId);
        });

        const step = RS.buildBringRoutesToTopRetryStepApplyPlan(plan, retryCount, presentById);
        console.log(step.attemptLog.attemptLogMessage, step.attemptLog.layerIds);

        try {
            step.layerMoves.forEach((spec) => {
                if (spec.moveLog.found) {
                    map.moveLayer(spec.layerId, plan.beforeId);
                    if (spec.moveLog.movedLogMessage) console.log(spec.moveLog.movedLogMessage);
                } else if (spec.moveLog.notFoundLogMessage) {
                    console.log(spec.moveLog.notFoundLogMessage);
                }
            });

            const outcome = step.outcome;
            if (outcome.action === 'retry') {
                setTimeout(() => moveLayersToTop(outcome.nextRetryCount), outcome.retryDelayMs);
            } else if (outcome.action === 'success') {
                if (outcome.logSuccess && step.successLogMessage) console.log(step.successLogMessage);
                if (outcome.ensureLabelsOnTop) ensureLabelsOnTop();
            } else if (outcome.logPartialFailure && step.partialFailureLogMessage) {
                console.warn(step.partialFailureLogMessage);
            }
        } catch (e) {
            const prefix = step.errorLogPrefix || '[Routes] Error bringing routes to top:';
            console.warn(prefix, e);
        }
    };

    const schedule = RS.buildBringRoutesToTopStartupScheduleApplyPlan(plan, {
        isStyleLoaded: map.isStyleLoaded(),
    });
    if (!schedule.shouldSchedule) return;

    setTimeout(() => {
        if (schedule.startup.action === 'immediate') {
            moveLayersToTop(0);
        } else if (schedule.startup.action === 'wait_idle') {
            if (schedule.startup.waitForIdleLogMessage) {
                console.log(schedule.startup.waitForIdleLogMessage);
            }
            map.once('idle', () => moveLayersToTop(0));
        }
    }, schedule.startup.initialDelayMs);
}

/**
 * Apply settings form controls from a pure UI apply plan.
 * @param {Object} plan - from buildSettingsUiApplyPlan
 */
function applySettingsUiFromPlan(plan) {
    if (!plan) return;

    const domPlan = _settingsSnapshot().buildSettingsUiDomApplyPlan(plan);
    applyDomSelectsFromPlan(domPlan.unitSelects);

    if (domPlan.routingMode) {
        setRoutingMode(domPlan.routingMode);
    }

    applyDomChecksFromPlan(domPlan.routeChecks);
    applyDomSelectsFromPlan(domPlan.routeSelects);
    applyDomSelectsFromPlan(domPlan.parkingSelects);

    const side = domPlan.sideEffects || {};
    if (side.loadPreferences) loadPreferences();

    if (side.setMapTheme) {
        setMapTheme(domPlan.mapTheme || 'standard');
    }

    const TU = _toggleUI();
    applyStandardTogglesFromPlan(domPlan.standardToggles, TU);
    applyLabeledTogglesFromPlan(domPlan.labeledToggles, TU);

    if (side.initializeDarkMode) initializeDarkMode();
    if (side.updateThemeButtons) updateThemeButtons();
    if (domPlan.detourLabel) applyDetourLabelFromPlan(domPlan.detourLabel);
    if (side.applySpeedWidgetToggleUi) applySpeedWidgetToggleUi();
}

/**
 * Collect runtime globals for settings UI apply.
 * @returns {Object}
 */
function collectSettingsUiRuntimeState() {
    const SS = _settingsSnapshot();
    const extras = SS.buildCollectSettingsUiRuntimeStateInputPlan({
        mlPredictionsEnabled: localStorage.getItem('mlPredictionsEnabled') === 'true',
        voiceAnnouncementsEnabled: localStorage.getItem('voiceAnnouncementsEnabled') === 'true',
        batterySavingEnabled: localStorage.getItem('pref_batterySaving') === 'true',
        gestureControlEnabled: localStorage.getItem('gestureEnabled') === 'true',
    });
    return {
        ...collectSettingsSnapshotRuntimeState(),
        ...extras,
    };
}

/**
 * Collect stored preferences for settings UI apply.
 * @returns {Object}
 */
function collectSettingsUiStoredState() {
    const SS = _settingsSnapshot();
    const savedParking = localStorage.getItem('parkingPreferences');
    let parkingPrefs = {};
    if (savedParking) {
        try {
            parkingPrefs = JSON.parse(savedParking);
        } catch (e) {
            console.log(SS.buildCollectSettingsUiStoredStatePlan({}).parkingParseErrorLog, e);
        }
    }

    return SS.buildCollectSettingsUiStoredStatePlan({
        routePreferences: _routePrefs().getRoutePreferences(localStorage),
        parkingPreferences: parkingPrefs,
        mapTheme: localStorage.getItem('mapTheme') || 'standard',
    });
}

/**
 * applySettingsToUI function
 * @function applySettingsToUI
 * @returns {*} Return value description
 */
function applySettingsToUI() {
    const SS = _settingsSnapshot();
    const orch = SS.buildApplySettingsToUiOrchestrationPlan();
    try {
        const execute = SS.buildApplySettingsUiExecutePlan(
            SS.buildSettingsUiApplyPlan(
                SS.buildSettingsUiInputPlan(
                    collectSettingsUiRuntimeState(),
                    collectSettingsUiStoredState()
                )
            )
        );
        if (execute.shouldApply) {
            applySettingsUiFromPlan(execute.uiPlan);
        }

        console.log(orch.successLog);
    } catch (error) {
        console.error(orch.errorLogPrefix, error);
    }
}

/**
 * Apply runtime default globals from a settings reset execute plan.
 * @param {Object} execute - from buildApplySettingsResetRuntimeExecutePlan
 */
function applySettingsResetRuntimeFromPlan(execute) {
    if (!execute || !execute.shouldApply) return;

    (execute.runtimePatches || []).forEach(({ key, value }) => {
        switch (key) {
            case 'distanceUnit': distanceUnit = value; break;
            case 'currencyUnit': currencyUnit = value; break;
            case 'speedUnit': speedUnit = value; break;
            case 'temperatureUnit': temperatureUnit = value; break;
            case 'currentVehicleType': currentVehicleType = value; break;
            case 'currentRoutingMode': currentRoutingMode = value; break;
            case 'smartZoomEnabled': smartZoomEnabled = value; break;
            case 'autoTrafficUpdateEnabled':
                VoyagrTrafficOrchestration.applyTrafficSettingsPatch('autoTrafficUpdateEnabled', value);
                break;
            case 'autoRerouteOnDeviationEnabled':
                VoyagrTrafficOrchestration.applyTrafficSettingsPatch('autoRerouteOnDeviationEnabled', value);
                break;
            case 'routeTrafficEnabled':
                VoyagrTrafficOrchestration.applyTrafficSettingsPatch('routeTrafficEnabled', value);
                break;
            case 'showCamerasEnabled': showCamerasEnabled = value; break;
            case 'showOsmTrafficLightsEnabled': showOsmTrafficLightsEnabled = value; break;
            case 'showOsmRailwayCrossingsEnabled': showOsmRailwayCrossingsEnabled = value; break;
            case 'showTrafficEnabled': showTrafficEnabled = value; break;
            case 'speedWidgetEnabled': speedWidgetEnabled = value; break;
            default: break;
        }
    });
}

/**
 * Apply settings reset from a pure reset execute plan.
 * @param {Object} execute - from buildResetAllSettingsExecutePlan
 * @returns {boolean} true when reset was confirmed and applied
 */
function applyResetAllSettingsFromPlan(execute) {
    if (!execute || !execute.shouldReset) return false;
    if (!confirm(execute.confirmMessage)) return false;

    (execute.localStorageKeys || []).forEach((key) => {
        localStorage.removeItem(key);
    });

    applySettingsResetRuntimeFromPlan(
        _settingsSnapshot().buildApplySettingsResetRuntimeExecutePlan(execute.runtimeDefaults)
    );

    if (execute.reloadAfterReset) {
        location.reload();
    }
    return true;
}

/**
 * resetAllSettings function
 * @function resetAllSettings
 * @returns {*} Return value description
 */
function resetAllSettings() {
    applyResetAllSettingsFromPlan(
        _settingsSnapshot().buildResetAllSettingsEntryOrchestrationPlan().execute
    );
}

function collectExportSettingsInput() {
    const SS = _settingsSnapshot();
    return {
        rawSnapshot: localStorage.getItem(SS.SETTINGS_STORAGE_KEY),
        dateStamp: new Date().toISOString().split('T')[0],
    };
}

/**
 * exportSettings function
 * @function exportSettings
 * @returns {*} Return value description
 */
function exportSettings() {
    const SS = _settingsSnapshot();
    const input = collectExportSettingsInput();
    applyExportSettingsDownloadFromPlan(
        SS.buildExportSettingsEntryOrchestrationPlan(input.rawSnapshot, input.dateStamp).execute
    );
}

/**
 * Trigger a settings JSON download from an export execute plan.
 * @param {Object} execute - from buildExportSettingsDomExecutePlan
 */
function applyExportSettingsDownloadFromPlan(execute) {
    if (!execute || !execute.shouldExport) {
        if (execute) showStatus(execute.statusMessage, execute.statusType);
        return;
    }
    const dataBlob = new Blob([execute.blobContent], { type: execute.mimeType });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = execute.downloadFilename;
    link.click();
    URL.revokeObjectURL(url);
    showStatus(execute.statusMessage, execute.statusType);
}

/**
 * Apply a settings import orchestration plan.
 * @param {Object} plan - from buildSettingsImportOrchestrationPlan
 * @returns {boolean}
 */
function applySettingsImportFromOrchestrationPlan(plan) {
    if (!plan || !plan.shouldApply) return false;

    if (plan.writeStorage) {
        localStorage.setItem(plan.storageKey, plan.storageValue);
    }
    if (plan.restoreSettings) loadAllSettings();
    if (plan.applySettingsUi) applySettingsToUI();
    showStatus(plan.statusMessage, plan.statusType);
    return true;
}

/**
 * importSettings function
 * @function importSettings
 * @returns {*} Return value description
 */
function importSettings() {
    const SS = _settingsSnapshot();
    const picker = SS.buildImportSettingsEntryOrchestrationPlan().picker;
    const input = document.createElement('input');
    input.type = picker.inputType;
    input.accept = picker.accept;
    input.onchange = (e) => {
        const fileOrch = SS.buildImportSettingsFileSelectedOrchestrationPlan(e.target.files[0]);
        if (!fileOrch.shouldReadFile) return;
        const reader = new FileReader();
        reader.onload = (event) => applySettingsImportFileContent(event.target.result);
        reader[fileOrch.readMethod](e.target.files[0]);
    };
    input.click();
}

/**
 * Parse and apply settings JSON from an imported file.
 * @param {string} rawText
 */
function applySettingsImportFileContent(rawText) {
    const SS = _settingsSnapshot();
    const entry = SS.buildImportSettingsFileContentEntryOrchestrationPlan(rawText, { routeInProgress });
    if (!applySettingsImportFromOrchestrationPlan(entry.importOrch)) {
        showStatus(entry.parsePlan.statusMessage, entry.parsePlan.statusType);
    }
}

// Update all distance displays
/**
 * updateAllDistanceDisplays function
 * @function updateAllDistanceDisplays
 * @returns {*} Return value description
 */
function updateAllDistanceDisplays() {
    const mainEl = document.getElementById('distance');
    const previewEl = document.getElementById('previewDistance');
    const execute = _units().buildUpdateAllDistanceDisplaysExecutePlan({
        distanceUnit,
        mainDistanceKm: mainEl?.dataset.km,
        previewDistanceKm: previewEl?.dataset.km,
    });
    if (!execute.shouldUpdate) return;

    execute.elementPatches.forEach(({ id, text }) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
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
    const execute = _units().buildUpdateAllCostDisplaysExecutePlan({
        currencySymbol: getCurrencySymbol(),
        fuelCost: fuelCostEl?.dataset.value,
        tollCost: tollCostEl?.dataset.value,
        cazCost: cazCostEl?.dataset.value,
    });
    if (!execute.shouldUpdate) return;

    execute.elementPatches.forEach(({ id, text }) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

// Update all speed displays
/**
 * updateAllSpeedDisplays function
 * @function updateAllSpeedDisplays
 * @returns {*} Return value description
 */
function updateAllSpeedDisplays() {
    const execute = _speedLimitWidget().buildUpdateAllSpeedDisplaysExecutePlan({
        apiSpeedLimitMph: currentSpeedLimitMph,
        valhallaSpeedLimitMph: null,
        roadType: lastDetectedRoadType || getCurrentRoadType(undefined, currentGpsSpeedMph),
        region: lastSpeedLimitRegion,
        gpsSpeedMph: currentGpsSpeedMph,
        speedUnit,
    });
    if (execute.shouldUpdateWidget) {
        updateSpeedWidget(execute.gpsSpeedMph, execute.shownLimitMph);
    }
    if (execute.shouldLog) console.log(execute.logMessage);
}

// Update all temperature displays
/**
 * updateAllTemperatureDisplays function
 * @function updateAllTemperatureDisplays
 * @returns {*} Return value description
 */
function updateAllTemperatureDisplays() {
    const execute = _units().buildUpdateAllTemperatureDisplaysExecutePlan(temperatureUnit);
    if (execute.shouldLog) console.log(execute.logMessage);
}

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

// ===== ROUTE COMPARISON FUNCTIONS =====
let routeOptions = [];
let selectedRouteIndex = 0;
let allRouteLayers = []; // Store all route polylines for multi-route display

// Route colors for multi-route display (via route-selection accessor)
function routeColors() {
    return _routeSelection().ROUTE_COLORS;
}
/** Active navigation / reroute line — matches primary route color. */
function navActiveRouteColor() {
    return _routeSelection().NAV_ACTIVE_ROUTE_COLOR;
}

/**
 * Clear ALL route layers from the map (including any orphaned layers)
 * This ensures no route artifacts remain when switching between routes
 */
function clearAllRouteLayersFromMap() {
    if (!map) return;

    try {
        const style = map.getStyle();
        const plan = _routeSelection().buildClearAllRouteLayersFromMapPlan(style);
        if (!plan.hasArtifacts) return;

        plan.layerIds.forEach((layerId) => {
            try {
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
            } catch (e) {
                console.warn(`${plan.layerErrorLogPrefix}${layerId}:`, e.message);
            }
        });

        plan.sourceIds.forEach((sourceId) => {
            try {
                if (map.getSource(sourceId)) {
                    map.removeSource(sourceId);
                }
            } catch (e) {
                console.warn(`${plan.sourceErrorLogPrefix}${sourceId}:`, e.message);
            }
        });

        if (plan.successLogMessage) console.log(plan.successLogMessage);
    } catch (e) {
        console.error('[Routes] Error clearing route layers:', e);
    }
}

/**
 * Clear in-memory route layer handles from a pre-mount plan.
 * @param {Object} plan - from buildDisplayAllRoutesMapPreMountPlan
 */
function clearRouteLayerHandlesFromPlan(plan) {
    if (!plan) return;
    if (plan.clearRouteLayerHandle && routeLayer && typeof routeLayer.remove === 'function') {
        routeLayer.remove();
        routeLayer = null;
    }
    if (plan.clearAllRouteLayerHandles) {
        allRouteLayers.forEach((layer) => {
            if (layer && typeof layer.remove === 'function') {
                layer.remove();
            }
        });
        allRouteLayers = [];
    }
}

/**
 * Mount one MapLibre line layer from a mount execute plan.
 * @param {Object} mountPlan
 * @param {Object} [opts]
 * @returns {boolean}
 */
function applyMapLibreLineLayerFromMountPlan(mountPlan, opts) {
    opts = opts || {};
    if (!mountPlan || !mountPlan.shouldMount || !map) return false;

    try {
        const { layerId, sourceId } = mountPlan;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        map.addSource(sourceId, {
            type: 'geojson',
            data: mountPlan.geoJsonFeature,
        });

        const lineWidth = mountPlan.paint.lineWeight != null
            ? mountPlan.paint.lineWeight
            : mountPlan.paint.lineWidth;

        map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: mountPlan.layerLayout,
            paint: {
                'line-color': mountPlan.paint.lineColor,
                'line-width': MapLibreHelpers.buildZoomScaledLineWidth(lineWidth),
                'line-opacity': mountPlan.paint.lineOpacity,
            },
        }, mountPlan.beforeId);

        if (mountPlan.registerLayerHandle) {
            allRouteLayers.unshift({
                id: layerId,
                remove: () => {
                    if (map.getLayer(layerId)) map.removeLayer(layerId);
                    if (map.getSource(sourceId)) map.removeSource(sourceId);
                },
            });
        }
        return true;
    } catch (e) {
        if (mountPlan.errorLogMessage) {
            console.error(mountPlan.errorLogMessage, e);
        } else {
            const prefix = mountPlan.errorLogPrefix || '[Map] Failed to draw line layer ';
            const suffix = mountPlan.legIndex != null ? mountPlan.legIndex : '';
            console.warn(`${prefix}${suffix}:`, e);
        }
        return false;
    }
}

/**
 * Schedule route layer mounting based on a style-load schedule apply plan.
 * @param {Object} schedule - from buildDisplayAllRoutesMapStyleLoadScheduleApplyPlan
 * @param {Function} addRouteLayersFn
 */
function applyDisplayAllRoutesStyleLoadScheduleFromPlan(schedule, addRouteLayersFn) {
    if (!schedule || !schedule.shouldApply || schedule.strategy === 'immediate') {
        addRouteLayersFn();
        return;
    }

    if (schedule.waitLogMessage) console.log(schedule.waitLogMessage);
    map.once('style.load', addRouteLayersFn);
    setTimeout(() => {
        if (schedule.runFallbackOnlyIfNoLayers && allRouteLayers.length === 0) {
            if (schedule.fallbackLogMessage) console.log(schedule.fallbackLogMessage);
            addRouteLayersFn();
        }
    }, schedule.fallbackTimeoutMs);
}

/**
 * Apply post-mount side effects after doAddRouteLayers.
 * @param {Object} plan - from buildDoAddRouteLayersPostMountExecutePlan
 */
function applyDoAddRouteLayersPostMountFromPlan(plan) {
    if (!plan) return;

    if (plan.fitBounds) {
        MapLibreHelpers.fitMapBounds(
            map,
            plan.fitBounds.coords,
            { padding: plan.fitBounds.padding }
        );
    }

    if (plan.displayAllRouteHazards) {
        displayAllRouteHazards();
    }

    if (plan.ensureTomTomTrafficLayer) {
        addTrafficLayer();
    }

    if (plan.bringRoutesToTop) {
        bringRoutesToTop();
    }

    if (plan.debugInspectRouteLayers) {
        setTimeout(() => {
            const style = map.getStyle();
            if (style && style.layers) {
                const routeLayers = style.layers.filter((l) => l.id.startsWith('route-layer-'));
                console.log(plan.debugLogPrefix,
                    routeLayers.map((l) => ({ id: l.id, color: l.paint?.['line-color'] })));
            }
        }, plan.debugInspectDelayMs);
    }

    if (plan.completionLogMessage) console.log(plan.completionLogMessage);
}

/**
 * Apply displaySingleRoute side effects from a pure execute plan.
 * @param {Object} plan - from buildSingleRouteMapDisplayExecutePlan
 */
function applySingleRouteMapDisplayFromPlan(plan) {
    if (!plan || !plan.shouldExecute) return;

    if (plan.clearAllRouteLayers) {
        clearAllRouteLayersFromMap();
    }

    const polylinePoints = plan.polyline.points || [];
    if (polylinePoints.length > 0) {
        const layer = MapLibreHelpers.addPolyline(map, polylinePoints, {
            color: plan.polyline.color,
            weight: plan.polyline.weight,
            opacity: plan.polyline.opacity,
        });

        allRouteLayers.push(layer);
        MapLibreHelpers.fitMapBounds(map, polylinePoints, { padding: plan.polyline.fitBoundsPadding });
    }

    if (plan.hazards.action === 'show') {
        displayHazardMarkers(plan.hazards.list);
    } else {
        clearHazardMarkers();
    }

    if (plan.ensureTomTomTrafficLayer) {
        addTrafficLayer();
    }

    if (plan.routeTraffic.enabled) {
        routePolyline = plan.routeTraffic.polylinePoints;
        fetchAndDisplayRouteTraffic();
    }

    const tl = plan.trafficLights;
    if (tl.polylinePoints.length > 0) {
        const plotRouteTrafficLights =
            (typeof window !== 'undefined' &&
             window.TrafficLights &&
             typeof window.TrafficLights.plotTrafficLightsOnRoute === 'function')
                ? window.TrafficLights.plotTrafficLightsOnRoute
                : (typeof plotTrafficLightsOnRoute === 'function' ? plotTrafficLightsOnRoute : null);

        if (window.TrafficLights && typeof window.TrafficLights.clearAllTrafficLights === 'function') {
            if (tl.action === 'clear') {
                window.TrafficLights.clearAllTrafficLights();
            }
        }

        if (tl.action === 'plot' && plotRouteTrafficLights) {
            console.log(plan.plotTrafficLightsLogMessage);
            plotRouteTrafficLights(tl.polylinePoints);
        } else if (tl.hasOsmTlsInHazards) {
            console.log(plan.skipDuplicatePlotLogMessage);
        } else if (!plotRouteTrafficLights) {
            console.warn(plan.moduleUnavailableLogMessage);
        }
    }

    if (plan.logLine) console.log(plan.logLine);
}

/**
 * Display all routes on map with different colors
 * @function displayAllRoutesOnMap
 * @returns {void}
 */
function collectDisplayAllRoutesOnMapInput() {
    return {
        routeOptions,
        isStyleLoaded: map?.isStyleLoaded(),
    };
}

function displayAllRoutesOnMap() {
    const input = collectDisplayAllRoutesOnMapInput();
    const entry = _routeSelection().buildDisplayAllRoutesMapEntryOrchestrationPlan(
        input.routeOptions,
        { isStyleLoaded: input.isStyleLoaded }
    );
    applyDisplayAllRoutesOnMapFromPlan(entry.apply);
}

function applyDisplayAllRoutesOnMapFromPlan(apply) {
    if (!apply || !apply.shouldApply) {
        if (apply && apply.noRoutesLogMessage) console.warn(apply.noRoutesLogMessage);
        if (apply && apply.entryLogMessage) {
            console.log(apply.entryLogMessage);
            console.log(apply.routeCountLogPrefix, apply.routeCount, 'routes');
        }
        return;
    }

    console.log(apply.entryLogMessage);
    console.log(apply.routeCountLogPrefix, apply.routeCount, 'routes');

    const mount = apply.mount;
    applyDisplayAllRoutesPreMountFromPlan(mount.preMountApply);

    if (mount.requireMap && !map) {
        console.error(mount.mapMissingLogMessage);
        return;
    }

    applyDisplayAllRoutesStyleLoadScheduleFromPlan(mount.styleSchedule, () => {
        if (mount.addLayersLogMessage) console.log(mount.addLayersLogMessage);
        doAddRouteLayers();
    });
}

function applyDisplayAllRoutesPreMountFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    clearRouteLayerHandlesFromPlan(apply);
    if (apply.clearMapRouteLayers) {
        clearAllRouteLayersFromMap();
    }
    if (apply.hydratePolylines) {
        _routeSelection().hydrateRouteOptionPolylines(routeOptions, decodePolyline);
    }
}

/**
 * Actually add route layers to the map (called after style is loaded)
 */
/**
 * Apply one route line layer from a MapLibre apply plan.
 * @param {Object} applyPlan
 * @returns {boolean}
 */
function applyRouteLayerFromMapLibrePlan(applyPlan) {
    return applyMapLibreLineLayerFromMountPlan(
        _routeSelection().buildRouteLayerMapLibreMountExecutePlan(applyPlan)
    );
}

/**
 * Apply a doAddRouteLayers batch execute plan.
 * @param {Object} executePlan - from buildDoAddRouteLayersBatchExecutePlan
 */
function applyDoAddRouteLayersBatchFromPlan(executePlan) {
    if (!executePlan) return;

    (executePlan.layerSteps || []).forEach((step) => {
        if (step.startLogMessage) console.log(step.startLogMessage);
        if (!step.valid) {
            if (step.invalidLogMessage) console.error(step.invalidLogMessage);
            return;
        }
        if (step.drawLogMessage) console.log(step.drawLogMessage);
        if (applyRouteLayerFromMapLibrePlan(step.applyPlan) && step.successLogMessage) {
            console.log(step.successLogMessage);
        }
    });
}

function applyDoAddRouteLayersFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    applyDoAddRouteLayersBatchFromPlan(apply.batchExecute);
    applyDoAddRouteLayersPostMountFromPlan(apply.postMount);
}

function collectDoAddRouteLayersInput() {
    const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
    return {
        routeOptions,
        selectedRouteIndex,
        styleLayers: style && style.layers ? style.layers : [],
        showTrafficEnabled,
        hasTrafficLayer: !!trafficLayer,
        mountedLayerCount: allRouteLayers.length,
    };
}

function doAddRouteLayers() {
    applyDoAddRouteLayersFromPlan(
        _routeSelection().buildDoAddRouteLayersEntryOrchestrationPlan(
            collectDoAddRouteLayersInput()
        ).apply
    );
}

function applyBringRoutesToTopEntryFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    if (apply.entryLogPrefix != null) {
        console.log(apply.entryLogPrefix, apply.layerCount);
    }
    if (apply.requiresMap && !map) {
        if (apply.mapMissingLogMessage) console.warn(apply.mapMissingLogMessage);
        return;
    }
    applyBringRoutesToTopFromPlan(apply.execute);
}

function collectBringRoutesToTopInput() {
    const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
    return {
        layerCount: allRouteLayers?.length || 0,
        layerDescriptors: allRouteLayers,
        styleLayers: style && style.layers ? style.layers : null,
    };
}

/**
 * Bring all route layers to the top of the map rendering order
 * This ensures routes are visible above traffic edges and other overlays
 * NOTE: Routes are now inserted before symbol layers by default (via beforeId parameter),
 * so this function primarily ensures routes are above traffic/weather layers
 */
function bringRoutesToTop() {
    const RS = _routeSelection();
    const input = collectBringRoutesToTopInput();
    applyBringRoutesToTopEntryFromPlan(
        RS.buildBringRoutesToTopEntryApplyPlan(
            RS.buildBringRoutesToTopEntryOrchestrationPlan(input)
        )
    );
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
function applyRouteComparisonListDomFromPlan(domPlan) {
    if (!domPlan) return;
    const listContainer = document.getElementById(domPlan.containerId || 'routeComparisonList');
    if (!listContainer) return;
    listContainer.innerHTML = domPlan.innerHtml;
}

function applyDisplayRouteComparisonFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    applyRouteComparisonListDomFromPlan(apply.domPlan);
}

function collectDisplayRouteComparisonInput() {
    const routes = routeOptions || [];
    return {
        routes,
        selectedRouteIndex,
        routeColors: routeColors(),
        currencySymbol: getCurrencySymbol(),
        distUnit: getDistanceUnit(),
        distanceTexts: routes.map((route) => convertDistance(route.distance_km)),
    };
}

/**
 * displayRouteComparison function - Shows distinct route types with hazard counts
 * @function displayRouteComparison
 * @returns {void}
 */
function displayRouteComparison() {
    applyDisplayRouteComparisonFromPlan(
        _routeSelection().buildDisplayRouteComparisonEntryOrchestrationPlan(
            collectDisplayRouteComparisonInput()
        ).apply
    );
}

function applySelectRouteFromPlan(apply, index) {
    if (!apply || !apply.shouldApply) return;

    selectedRouteIndex = apply.selectedRouteIndex;

    if (apply.displaySingleRoute) displaySingleRoute(index);
    if (apply.displayRouteComparison) displayRouteComparison();

    if (apply.syncLastCalculatedRoute) syncLastCalculatedRouteFromSelection(index);
    console.log(
        `${apply.logPrefix} "${apply.routeName}" with ${apply.maneuverCount} maneuvers`
    );

    if (apply.updateTripInfo) updateTripInfoFromRouteOption(apply.selectedRoute);

    if (apply.showRoutePreview && apply.preview && apply.preview.shouldPreview) {
        showRoutePreview(apply.preview.previewPayload, true);
    }
}

function collectSelectRouteInput(index) {
    return {
        index,
        routeOptions,
        lastRouteApiResponse: window.lastRouteApiResponse,
    };
}

/**
 * selectRoute function - shows only the selected route and hides others
 * @function selectRoute
 * @param {number} index - Route index to select
 */
function selectRoute(index) {
    const orch = _routeSelection().buildSelectRouteEntryOrchestrationPlan(
        collectSelectRouteInput(index)
    );
    applySelectRouteFromPlan(orch.apply, index);
}

/**
 * Apply formatted trip info values to the navigation panel DOM.
 * @param {Object} display
 */
function applyTripInfoDomFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    const distanceEl = document.getElementById(apply.distanceId);
    const timeEl = document.getElementById(apply.timeId);
    const fuelEl = document.getElementById(apply.fuelCostId);
    const tollEl = document.getElementById(apply.tollCostId);
    if (distanceEl) {
        distanceEl.textContent = apply.distanceText;
        distanceEl.dataset.km = apply.distanceKm;
    }
    if (timeEl) timeEl.textContent = apply.durationMinutes + ' min';
    if (fuelEl) {
        fuelEl.textContent = apply.fuelCostText;
        fuelEl.dataset.value = apply.fuelCost;
    }
    if (tollEl) {
        tollEl.textContent = apply.tollCostText;
        tollEl.dataset.value = apply.tollCost;
    }
    if (apply.costLogMessage && apply.costLogPayload) {
        console.log(apply.costLogMessage, apply.costLogPayload);
    }
}

/**
 * Update navigation tab distance/time/cost from a route option object.
 * @param {Object} route
 */
function updateTripInfoFromRouteOption(route) {
    if (!route) return;
    const orch = _routeSelection().buildTripInfoUpdateFromRouteOrchestrationPlan(route, {
        distanceText: convertDistance(route.distance_km),
        distUnit: getDistanceUnit(),
        currencySymbol: getCurrencySymbol(),
    });
    if (!orch.shouldUpdate) return;
    applyTripInfoDomFromPlan(orch.apply);
}

function collectUseRouteInput(index) {
    const traffic = VoyagrTrafficOrchestration.getTrafficSettingsSnapshot();
    return {
        index,
        routeOptions,
        routeTrafficEnabled: traffic.routeTrafficEnabled,
    };
}

function collectDisplaySingleRouteRuntime() {
    const traffic = VoyagrTrafficOrchestration.getTrafficSettingsSnapshot();
    return {
        displayOpts: {
            routeColors: routeColors(),
            showTrafficEnabled,
            routeTrafficEnabled: traffic.routeTrafficEnabled,
            hasTrafficLayer: !!trafficLayer,
            trafficLightsEnabled: window.TrafficLights && typeof window.TrafficLights.isEnabled === 'function' && window.TrafficLights.isEnabled(),
            trafficLightsPlotAvailable: (window.TrafficLights && typeof window.TrafficLights.plotTrafficLightsOnRoute === 'function')
                || typeof plotTrafficLightsOnRoute === 'function',
        },
    };
}

function applyDisplaySingleRouteFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    console.log(apply.entryLogMessage);
    clearRouteLayerHandlesFromPlan(apply.preClear);
    applySingleRouteMapDisplayFromPlan(apply.execute);
}

function collectDisplaySingleRouteInput(index) {
    return {
        index,
        routeOptions,
        runtime: collectDisplaySingleRouteRuntime(),
    };
}

/**
 * Display only a single route on the map
 * @param {number} index - Route index to display
 */
function displaySingleRoute(index) {
    const orch = _routeSelection().buildDisplaySingleRouteEntryOrchestrationPlan(
        collectDisplaySingleRouteInput(index)
    );
    applyDisplaySingleRouteFromPlan(orch.apply);
}

/**
 * Show all routes on the map (called by "Show All Routes" button)
 */
function applyShowAllRoutesFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    if (apply.displayAllRoutes) displayAllRoutesOnMap();
    showStatus(apply.statusMessage, apply.statusType);
}

function showAllRoutes() {
    applyShowAllRoutesFromPlan(
        _routeSelection().buildShowAllRoutesEntryOrchestrationPlan(
            routeOptions ? routeOptions.length : 0
        ).apply
    );
}

function applyUseRouteFromPlan(apply, index) {
    if (!apply || !apply.shouldApply) return;

    selectedRouteIndex = apply.selectedRouteIndex;
    if (apply.syncLastCalculatedRoute) syncLastCalculatedRouteFromSelection(index);
    if (apply.updateTripInfo) updateTripInfoFromRouteOption(apply.route);

    if (apply.previewTraffic) {
        routePolyline = apply.previewPolyline;
        fetchAndDisplayRouteTraffic();
    }

    showStatus(apply.statusMessage, apply.statusType);
}

/**
 * useRoute function
 * @function useRoute
 * @param {*} index - Parameter description
 * @returns {*} Return value description
 */
function useRoute(index) {
    const orch = _routeSelection().buildUseRouteEntryOrchestrationPlan(
        collectUseRouteInput(index)
    );
    applyUseRouteFromPlan(orch.apply, index);
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
        call: {
            showStatus,
            saveAllSettings,
            applyDomChecksFromPlan,
            applyDomSelectsFromPlan,
            ensureDefaultTrafficAwareRouting,
            calculateRoute,
            switchTab,
            isAvoidTollsEnabled,
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

/**
 * setupMapClickHandler function
 * @function setupMapClickHandler
 * @returns {void}
 */
function applyMapClickLocationPickerFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    const inputEl = document.getElementById(apply.inputId);
    if (inputEl) inputEl.value = apply.inputValue;

    if (apply.removeExistingMarker) {
        if (apply.markerTarget === 'start' && startMarker && typeof startMarker.remove === 'function') {
            startMarker.remove();
        }
        if (apply.markerTarget === 'end' && endMarker && typeof endMarker.remove === 'function') {
            endMarker.remove();
        }
    }

    const marker = MapLibreHelpers.createCircleMarker(apply.lat, apply.lon, apply.markerOptions).addTo(map);
    if (apply.markerTarget === 'start') {
        startMarker = marker;
    } else {
        endMarker = marker;
    }

    if (apply.clearMapPickerMode) mapPickerMode = null;
    if (apply.collapseBottomSheet) collapseBottomSheet();
    showStatus(apply.successStatusMessage, apply.successStatusType);
}

function setupMapClickHandler() {
    if (!map) {
        console.log('[Map] Map not initialized yet, deferring click handler setup');
        return;
    }

    const GL = _geocodingLocations();
    map.on('click', (e) => {
        const dispatch = GL.buildMapClickDispatchPlan({
            addingViaPoint: VoyagrWaypointsOrchestration.getAddingViaPoint(),
            addingStop: VoyagrWaypointsOrchestration.getAddingStop(),
            mapPickerMode,
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
        });

        if (dispatch.action === 'waypoint') {
            handleMapClickForWaypoints(e);
            return;
        }

        if (dispatch.action === 'location_picker') {
            applyMapClickLocationPickerFromPlan(
                GL.buildMapClickLocationPickerApplyPlan(dispatch)
            );
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
    return _polylineCodec().decodePolyline(encoded, precision);
}

/**
 * Recover `routeData` from persisted OfflineNav blob for a normal navigation bootstrap.
 *
 * @param {*} saved
 */
function buildRoutePayloadFromPersisted(saved) {
    return _routeSelection().buildRoutePayloadFromPersisted(
        saved,
        (points, precision) => _polylineCodec().encodePolyline(points, precision)
    );
}

/**
 * Apply selected route option fields to window.lastCalculatedRoute (geometry + maneuvers for TBT).
 */
function syncLastCalculatedRouteFromSelection(index) {
    if (!routeOptions || !routeOptions[index]) return;
    window.lastCalculatedRoute = _routeSelection().mergeLastCalculatedRouteFromSelection(
        window.lastCalculatedRoute,
        routeOptions[index]
    );
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

/**
 * Collect settings form control values from the DOM for snapshot persistence.
 * @returns {Object}
 */
function collectSettingsFormState() {
    const SS = _settingsSnapshot();
    return SS.buildSettingsFormStateInputPlan(
        SS.buildCollectSettingsFormStateInputPlan({
            routePreferences: collectRoutePreferencesFormState(),
            hazardPreferences: SS.buildSettingsHazardPreferencesPlan({
                avoidTolls: isAvoidTollsEnabled(),
                getStorageItem: (key) => localStorage.getItem(key),
            }),
            parkingPreferences: collectParkingPreferencesFormState(),
            multiDropPreferences: collectMultiDropFormState(),
            mapTheme: localStorage.getItem('mapTheme') || 'standard',
        })
    );
}

/**
 * Apply in-navigation reroute outcome from a successful /api/route response.
 * @param {Object} data
 * @param {string} geocodedEnd
 * @param {string} end
 */
function applyCalculateRouteInNavRerouteFromPlan(plan) {
    if (!plan || !plan.shouldApply) {
        if (plan && plan.noRouteErrorMessage) {
            showStatus(plan.noRouteErrorMessage, 'error');
        }
        return;
    }

    if (plan.hideRouteProgressBar) hideRouteProgressBar();
    if (plan.updateRouteOnMap) updateRouteOnMap(plan.activeRoute);

    window.lastCalculatedRoute = {
        ...window.lastCalculatedRoute,
        ...plan.lastCalculatedRoutePatch,
    };

    if (plan.speakMessage) {
        speakMessage(plan.speakMessage, 'high');
    }

    showStatus(plan.statusMessage, plan.statusType);
    if (plan.recentDestination) {
        try {
            recordRecentDestination(
                plan.recentDestination.label,
                plan.recentDestination.lat,
                plan.recentDestination.lon,
                plan.recentDestination.kind
            );
        } catch (_) { /* ignore */ }
    }
}

function applyCalculateRouteInNavRerouteOutcome(data, geocodedEnd, end) {
    const RS = _routeSelection();
    const orch = RS.buildCalculateRouteInNavRerouteOrchestrationPlan({
        activeRoute: pickActiveRouteDuringNavigation(data.routes, data),
        data,
        geocodedEnd,
        destinationLabel: end,
        voiceOpts: voiceAnnouncementsEnabled
            ? { enabled: true, convertDistance, distUnit: getDistanceUnit() }
            : { enabled: false },
    });
    applyCalculateRouteInNavRerouteFromPlan(orch.execute);
}

/**
 * Post-preview UI side-effects for idle calculateRoute success.
 * @param {Object} idleUiPlan - from buildCalculateRouteIdleUiApplyPlan
 * @param {Object} data - route API response
 */
function applyCalculateRouteIdleUiFromPlan(idleUiPlan, data) {
    const plan = _routeSelection().buildCalculateRouteIdleUiOrchestrationPlan(idleUiPlan).execute;
    if (!plan.shouldExecute) return;

    const delayMs = plan.delayedPreview?.delayMs ?? 300;
    setTimeout(() => {
        showRoutePreview(data);
        if (plan.updateArButtonVisibility) {
            updateARButtonVisibility();
        }
    }, delayMs);

    if (plan.hideRouteProgressBar) hideRouteProgressBar();

    if (plan.showStartNavButtons) {
        (plan.startNavButtonIds || []).forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) btn.style.display = 'block';
        });
    }
    if (plan.updateRoadReportFabVisibility) {
        updateRoadReportFabVisibility();
    }

    const notification = plan.notification;
    if (notification) {
        console.log(plan.notificationLogPrefix, notification.message);
        sendNotification(notification.title, notification.message, notification.type);
    }

    try {
        (plan.recentDestinations || []).forEach((dest) => {
            recordRecentDestination(dest.label, dest.lat, dest.lon, dest.kind);
        });
    } catch (_) { /* ignore */ }
}

/**
 * Apply route preview map markers and bounds from a pure map apply plan.
 * @param {Object} plan - from buildRoutePreviewMapApplyPlan
 * @returns {boolean} false when map is not initialised
 */
function applyRoutePreviewMapFromPlan(plan) {
    const executePlan = _previewMarker().buildRoutePreviewMapExecutePlan(plan);
    if (!executePlan.shouldExecute) return false;

    if (executePlan.removeExistingMarkers) {
        if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
        if (endMarker && typeof endMarker.remove === 'function') endMarker.remove();
        if (routeLayer && typeof routeLayer.remove === 'function') routeLayer.remove();
    }

    const createEndpointMarker = (markerPlan) => {
        const opts = markerPlan.options;
        const marker = MapLibreHelpers.createCircleMarker(markerPlan.lat, markerPlan.lon, {
            radius: opts.radius,
            fillColor: opts.fillColor,
            color: opts.color,
            weight: opts.weight,
            fillOpacity: opts.fillOpacity,
        }).addTo(map);
        marker.bindPopup(opts.popup);
        return marker;
    };

    if (executePlan.startMarker) {
        startMarker = createEndpointMarker(executePlan.startMarker);
    }
    if (executePlan.endMarker) {
        endMarker = createEndpointMarker(executePlan.endMarker);
    }

    if (executePlan.pathLog) {
        if (executePlan.pathLog.level === 'error') {
            console.error(executePlan.pathLog.message);
        } else {
            console.log(executePlan.pathLog.message);
        }
    }

    if (executePlan.requiresMap && !map) {
        console.error(executePlan.mapMissingLogMessage);
        showStatus(executePlan.mapMissingStatusMessage, 'error');
        return false;
    }

    if (executePlan.fitBounds && map) {
        MapLibreHelpers.fitMapBounds(map, executePlan.fitBounds.routePath, { padding: executePlan.fitBounds.padding });
        lastZoomLevel = map.getZoom();
    }

    return true;
}

/**
 * Apply idle (non-navigation) calculateRoute preview outcome.
 * @param {Object} data
 * @param {{ geocodedStart: string, geocodedEnd: string, start: string, end: string }} labels
 */
function applyCalculateRouteIdlePreviewErrorFromPlan(postMap) {
    if (!postMap || postMap.shouldApply) return false;
    showStatus(postMap.errorStatusMessage, 'error');
    if (postMap.hideRouteProgressBarOnError) hideRouteProgressBar();
    return true;
}

function applyCalculateRouteIdlePreviewRouteOptionsFromPlan(routeOpts, data) {
    if (!routeOpts || !routeOpts.shouldBuild) return;

    const RS = _routeSelection();
    if (routeOpts.multiRouteLogMessage) {
        console.log(routeOpts.multiRouteLogMessage);
        routeOptions = RS.buildRouteOptionsFromApiResponse(data, decodePolyline, routeOpts.routePath);
        console.log(
            routeOpts.loadedRoutesLogPrefix + routeOptions.length + ' real routes from ' + data.source + ':',
            routeOptions.map((r) => r.name)
        );
        return;
    }

    routeOptions = RS.buildRouteOptionsFromApiResponse(data, decodePolyline, routeOpts.routePath);
    if (routeOpts.fallbackRouteLogMessage) console.log(routeOpts.fallbackRouteLogMessage);
}

function applyCalculateRouteIdlePreviewPostMapFromPlan(postMap, data, idleUiApplyPlan) {
    if (!postMap || !postMap.shouldApply) return;

    if (postMap.multiDropStopLogMessage) console.log(postMap.multiDropStopLogMessage);
    updateTripInfo(
        postMap.tripInfo.distance,
        postMap.tripInfo.displayTime,
        postMap.tripInfo.fuelCost,
        postMap.tripInfo.tollCost
    );
    showStatus(postMap.statusMessage, 'success');

    if (postMap.showMultiDropLegs) displayMultiDropLegs(data);
    if (postMap.storeLastRouteApiResponse) window.lastRouteApiResponse = data;
    window.lastCalculatedRoute = postMap.lastCalculatedRoutePatch;
    if (postMap.durationLogMessage) console.log(postMap.durationLogMessage);
    if (postMap.displayPrimaryHazards) displayHazardMarkers(postMap.primaryHazards);

    applyCalculateRouteIdlePreviewRouteOptionsFromPlan(postMap.routeOptionsApply, data);
    applyCalculateRouteIdleUiFromPlan(idleUiApplyPlan, data);
}

function applyCalculateRouteIdlePreviewFromPlan(orch, data) {
    const postMap = orch.postMapApply
        || _routeSelection().buildCalculateRouteIdlePreviewPostMapApplyPlan(orch.execute);
    if (applyCalculateRouteIdlePreviewErrorFromPlan(postMap)) return;

    const mapApplied = applyRoutePreviewMapFromPlan(
        _previewMarker().buildRoutePreviewMapApplyPlan(orch.mapApplyInput)
    );
    if (!mapApplied) return;

    applyCalculateRouteIdlePreviewPostMapFromPlan(postMap, data, orch.idleUiApplyPlan);
}

function applyCalculateRouteIdlePreviewOutcome(data, labels) {
    try {
        const GL = _geocodingLocations();
        const orch = _routeSelection().buildCalculateRouteIdlePreviewOrchestrationPlan({
            input: {
                geocodedStart: labels.geocodedStart,
                geocodedEnd: labels.geocodedEnd,
                startLabel: labels.start,
                endLabel: labels.end,
                data,
                parseLatLonPair: GL.parseLatLonPairString.bind(GL),
                invalidFormatMessage: GL.getInvalidCoordinatesFormatStatusMessage(),
                invalidCoordsMessage: GL.getInvalidCoordinatesStatusMessage(),
                decodePolyline,
                convertDistance,
                distUnit: getDistanceUnit(),
                currencySymbol: getCurrencySymbol(),
                parseDurationMinutes: _routeSharing().parseSharedRouteDurationMinutes,
            },
            data,
        });
        applyCalculateRouteIdlePreviewFromPlan(orch, data);
    } catch (e) {
        const errApply = _routeSelection().buildCalculateRouteIdlePreviewParseErrorApplyPlan(e);
        showStatus(errApply.statusMessage, errApply.statusType);
        console.error(errApply.logPrefix, e);
        if (errApply.hideRouteProgressBar) hideRouteProgressBar();
    }
}

function applyCalculateRouteResponseFromPlan(apply, data, labels) {
    if (!apply || !apply.shouldApply) return;

    console.log(apply.responseLogPrefix, apply.responseLogMeta);

    if (apply.degradedLogWarning) {
        console.warn(
            apply.degradedLogPrefix,
            apply.degradedLogWarning.warning,
            apply.degradedLogWarning.engines
        );
    }
    if (apply.degradedStatusMessage) {
        showStatus(apply.degradedStatusMessage, 'warning');
    }

    if (apply.branch === 'error') {
        showStatus(apply.statusMessage, apply.statusType);
        if (apply.hideRouteProgressBar) hideRouteProgressBar();
        return;
    }

    if (apply.branch === 'in_nav_reroute') {
        if (apply.inNavRerouteLogMessage) console.log(apply.inNavRerouteLogMessage);
        applyCalculateRouteInNavRerouteOutcome(data, labels.geocodedEnd, labels.end);
        return;
    }

    applyCalculateRouteIdlePreviewOutcome(data, labels);
}

function applyCalculateRoutePreflightFromPlan(preflightApply) {
    if (!preflightApply) return false;

    console.log(preflightApply.entryLogMessage);
    (preflightApply.debugLogs || []).forEach(({ prefix, value }) => {
        console.log(prefix, value);
    });

    if (!preflightApply.shouldProceed) {
        showStatus(preflightApply.statusMessage, preflightApply.statusType);
        if (preflightApply.missingInputsLogMessage) {
            console.error(preflightApply.missingInputsLogMessage);
        } else if (preflightApply.geocodingBusyLogMessage) {
            console.warn(preflightApply.geocodingBusyLogMessage);
        }
        return false;
    }

    console.log(preflightApply.geocodeCallLogMessage);
    return true;
}

function applyCalculateRouteLoadingFromPlan(loadingApply) {
    if (!loadingApply || !loadingApply.shouldApply) return;
    showStatus(loadingApply.statusMessage, loadingApply.statusType);
    if (loadingApply.showRouteProgressBar) showRouteProgressBar();
}

async function applyCalculateRouteFetchHttpResponse(response, fetchPlan) {
    const RR = _routingRequest();
    const plan = RR.buildCalculateRouteFetchHttpResponsePlan({
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
    }, fetchPlan);

    console.log(plan.statusLogPrefix, response.status);

    if (plan.action === 'reject_non_json') {
        const text = await response.text();
        console.error(plan.nonJsonErrorLogPrefix, plan.contentType);
        console.error(plan.responseTextLogPrefix, text.substring(0, 200));
        throw new Error(RR.buildNonJsonRouteApiErrorMessage(plan.status, text));
    }

    if (plan.action === 'reject_http_error') {
        const text = await response.text();
        throw new Error(RR.parseRouteApiErrorMessage(plan.status, text));
    }

    return response.json();
}

function collectCalculateRouteApiInput(geocodedStart, geocodedEnd) {
    return _routingRequest().buildCalculateRouteApiInputCollectPlan({
        storage: localStorage,
        geocodedStart,
        geocodedEnd,
        viaPoints: VoyagrWaypointsOrchestration.getViaPoints(),
        stops: VoyagrWaypointsOrchestration.getStops(),
        routingMode: currentRoutingMode,
        vehicleType: currentVehicleType,
        costParams: getRouteCostParams(currentVehicleType),
        avoidTolls: isAvoidTollsEnabled(),
        routePrefs: getRoutePreferences(),
        routeInProgress,
        isTrackingActive,
        trackingHistory,
        currentLat,
        currentLon,
    });
}

function applyCalculateRouteFetchErrorFromPlan(errApply, error) {
    if (!errApply) return;
    showStatus(errApply.statusMessage, errApply.statusType);
    console.error(errApply.logPrefix, error);
    if (errApply.hideRouteProgressBar) hideRouteProgressBar();
}

async function calculateRoute() {
    const RR = _routingRequest();
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const preflightOrch = RR.buildCalculateRoutePreflightOrchestrationPlan(
        RR.buildCalculateRouteInputCollectPlan({ startInput, endInput }),
        isGeocoding
    );

    if (!applyCalculateRoutePreflightFromPlan(preflightOrch.apply)) return;

    const { start, end } = preflightOrch.collect;

    let geocodedResult = await geocodeLocations(start, end);
    if (!geocodedResult) {
        console.error('[calculateRoute] ERROR: geocodeLocations returned null');
        return;
    }

    const geocodedStart = geocodedResult.start;
    const geocodedEnd = geocodedResult.end;

    console.log('[calculateRoute] Geocoded start:', geocodedStart);
    console.log('[calculateRoute] Geocoded end:', geocodedEnd);

    applyCalculateRouteLoadingFromPlan(
        RR.buildCalculateRouteLoadingApplyPlan(RR.buildCalculateRouteLoadingExecutePlan())
    );

    const apiOrch = RR.buildCalculateRouteApiOrchestrationPlan(
        collectCalculateRouteApiInput(geocodedStart, geocodedEnd)
    );
    const { routePlan, fetchPlan, requestLog } = apiOrch;

    console.log(requestLog.requestLogPrefix, fetchPlan.body);
    console.log(requestLog.viaPointsLogMessage);
    console.log(requestLog.multiDropLogMessage);

    fetch(fetchPlan.apiPath, {
        method: fetchPlan.method,
        headers: fetchPlan.headers,
        body: JSON.stringify(fetchPlan.body),
    })
        .then((response) => applyCalculateRouteFetchHttpResponse(response, fetchPlan))
        .then(data => {
            applyCalculateRouteResponseFromPlan(
                RR.buildCalculateRouteResponseApplyPlan(
                    RR.buildCalculateRouteResponseExecutePlan(data, routeInProgress)
                ),
                data,
                { geocodedStart, geocodedEnd, start, end }
            );
        })
        .catch(error => {
            applyCalculateRouteFetchErrorFromPlan(
                RR.buildCalculateRouteFetchErrorApplyPlan(error),
                error
            );
        });
}

/**
 * Show route calculation progress bar
 */
function applyRouteProgressShowFromPlan(apply) {
    if (!apply || !apply.shouldShow) return;

    let progressContainer = document.getElementById(apply.containerId);

    if (!progressContainer && apply.mountIfMissing) {
        progressContainer = document.createElement('div');
        progressContainer.id = apply.containerId;
        progressContainer.style.cssText = apply.containerStyleCssText;
        progressContainer.innerHTML = apply.innerHtml;

        if (apply.animationStyleId && apply.animationKeyframes &&
            !document.getElementById(apply.animationStyleId)) {
            const style = document.createElement('style');
            style.id = apply.animationStyleId;
            style.textContent = apply.animationKeyframes;
            document.head.appendChild(style);
        }

        document.body.appendChild(progressContainer);
    }

    if (progressContainer) progressContainer.style.display = 'block';
    if (apply.showLogMessage) console.log(apply.showLogMessage);
}

function showRouteProgressBar() {
    applyRouteProgressShowFromPlan(
        _routeProgress().buildRouteProgressShowOrchestrationPlan().apply
    );
}

/**
 * Hide route calculation progress bar
 */
function applyRouteProgressHideFromPlan(apply) {
    if (!apply || !apply.shouldHide) return;

    const progressContainer = document.getElementById(apply.containerId);
    if (progressContainer) progressContainer.style.display = 'none';
    if (apply.hideLogMessage) console.log(apply.hideLogMessage);
}

function hideRouteProgressBar() {
    applyRouteProgressHideFromPlan(
        _routeProgress().buildRouteProgressHideOrchestrationPlan().apply
    );
}

function applyCollapseBottomSheetForRoutePreviewFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    const bottomSheet = document.getElementById(apply.bottomSheetId);
    if (!bottomSheet) return;

    (apply.clearInlineStyles || []).forEach((prop) => {
        bottomSheet.style[prop] = '';
    });
    if (apply.collapse) collapseBottomSheet();

    const handle = bottomSheet.querySelector(apply.handleSelector);
    if (handle && apply.handleTitle) handle.title = apply.handleTitle;
    if (apply.logMessage) console.log(apply.logMessage);
}

/**
 * Collapse bottom sheet to show map with route preview
 * Uses the standard collapse mechanism instead of inline styles
 */
function collapseBottomSheetForRoutePreview() {
    applyCollapseBottomSheetForRoutePreviewFromPlan(
        _domHelpers().buildCollapseBottomSheetForRoutePreviewOrchestrationPlan().apply
    );
}

function collectDisplayHazardMarkersInput(hazards) {
    const OSM = _osmMapIcons();
    const pillHtml = getOsmTrafficLightMarkerPillHTML();
    return {
        hazards,
        markerOpts: {
            osmTrafficLightPillHtml: pillHtml,
            osmTrafficLightIconSize: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
            osmTrafficLightPopupIcon: OSM.buildOsmTrafficLightPopupIconWrapperHtml(pillHtml),
        },
    };
}

function applyDisplayHazardMarkersFromPlan(execute) {
    if (!execute) return;

    if (!execute.shouldDisplay) {
        if (execute.clearExisting) clearHazardMarkers();
        if (execute.emptyLogMessage) console.log(execute.emptyLogMessage);
        return;
    }

    if (execute.clearExisting) clearHazardMarkers();

    execute.markers.forEach((spec) => {
        const marker = MapLibreHelpers.createMarker(spec.lat, spec.lon, {
            className: spec.className,
            html: spec.markerHtml,
            iconSize: spec.iconSize,
            iconAnchor: spec.iconAnchor,
            popup: spec.popupHtml,
        }).addTo(map);

        if (execute.pushToMarkerArray) window.hazardMarkers.push(marker);
    });

    if (execute.successLogMessage) console.log(execute.successLogMessage);
}

/**
 * Display hazard markers on the map
 * @param {Array} hazards - Array of hazard objects with lat, lon, type, description
 */
function displayHazardMarkers(hazards) {
    applyDisplayHazardMarkersFromPlan(
        _hazardMapMarkers().buildDisplayHazardMarkersEntryOrchestrationPlan(
            collectDisplayHazardMarkersInput(hazards)
        ).execute
    );
}

function applyClearHazardMarkersFromPlan(execute) {
    if (!execute) return;

    const existing = window.hazardMarkers || [];
    if (!execute.shouldClear) {
        if (execute.resetMarkerArray) window.hazardMarkers = [];
        return;
    }

    existing.forEach((marker) => {
        if (marker && typeof marker.remove === 'function') {
            marker.remove();
        }
    });
    if (execute.resetMarkerArray) window.hazardMarkers = [];
}

/**
 * Clear all hazard markers from the map
 */
function clearHazardMarkers() {
    const existing = window.hazardMarkers || [];
    applyClearHazardMarkersFromPlan(
        _hazardMapMarkers().buildClearHazardMarkersEntryOrchestrationPlan(existing.length).execute
    );
}

function applyDisplayAllRouteHazardsFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    displayHazardMarkers(apply.hazards);
    if (apply.logMessage) console.log(apply.logMessage);
}

/**
 * Display hazards from all routes on the map
 */
function displayAllRouteHazards() {
    applyDisplayAllRouteHazardsFromPlan(
        _hazardMapMarkers().buildDisplayAllRouteHazardsEntryOrchestrationPlan(routeOptions).apply
    );
}

// ===== BOTTOM SHEET CONTROL =====

/**
 * Toggle bottom sheet state
 */
function toggleBottomSheet() {
    applyBottomSheetStateFromPlan(
        _domHelpers().buildToggleBottomSheetEntryOrchestrationPlan(bottomSheetIsExpanded).execute
    );
}

// ===== TOMTOM TRAFFIC FLOW LAYER =====
// Real-time traffic visualization overlay
let trafficLayer = null;
let showTrafficEnabled = MLT
    ? MLT.resolveShowTrafficEnabledFromStorage(localStorage.getItem('showTrafficEnabled'))
    : localStorage.getItem('showTrafficEnabled') !== 'false';

// ===== 3D BUILDINGS TOGGLE =====
// Controls fill-extrusion 3D building visibility
const MLT = typeof VoyagrMapLayerToggles !== 'undefined' ? VoyagrMapLayerToggles : null;
let buildings3DEnabled = MLT
    ? MLT.resolveBuildings3DEnabledFromStorage(localStorage.getItem('buildings3DEnabled'))
    : localStorage.getItem('buildings3DEnabled') !== 'false';
let buildings3DHeightMultiplier = MLT
    ? MLT.parseBuildings3DHeightMultiplier(localStorage.getItem('buildings3DHeight'))
    : (parseFloat(localStorage.getItem('buildings3DHeight')) || 1.0);
let buildings3DOpacity = MLT
    ? MLT.parseBuildings3DOpacity(localStorage.getItem('buildings3DOpacity'))
    : (parseFloat(localStorage.getItem('buildings3DOpacity')) || 0.6);

/**
 * Toggle 3D buildings layer on/off
 * @function toggle3DBuildings
 */
function toggle3DBuildings() {
    const layerToggles = _mapLayerToggles();
    const TU = _toggleUI();
    const collected = layerToggles.buildToggle3DBuildingsCollectPlan({ currentlyEnabled: buildings3DEnabled });
    const execute = layerToggles.buildToggle3DBuildingsExecutePlan({
        enabled: collected.enabled,
        heightMultiplier: buildings3DHeightMultiplier,
        opacity: buildings3DOpacity,
    });
    if (!execute.shouldApply) return;

    buildings3DEnabled = execute.enabled;
    localStorage.setItem(execute.storageKey, execute.storageValue);
    TU.applyToggleButton(document.getElementById(execute.toggleId), buildings3DEnabled);

    if (map) {
        if (execute.mapAction === 'add3DBuildings') {
            MapLibreHelpers.add3DBuildings(map, {
                heightMultiplier: execute.heightMultiplier,
                opacity: execute.opacity,
            });
        } else {
            MapLibreHelpers.remove3DBuildings(map);
        }
    }

    showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);

    if (execute.recomputeMapView3D && typeof _recomputeMapView3DFromGranular === 'function') {
        _recomputeMapView3DFromGranular();
    }
    if (execute.saveAllSettings) saveAllSettings();
}

// ===== ROAD LABELS TOGGLE =====
// Controls road name label visibility on the map
let roadLabelsEnabled = MLT
    ? MLT.resolveRoadLabelsEnabledFromStorage(localStorage.getItem('roadLabelsEnabled'))
    : localStorage.getItem('roadLabelsEnabled') !== 'false';

// After async style load replaces voyagr-bootstrap, re-apply saved label visibility (initializeRoadLabels may have run on empty bootstrap).
if (typeof window !== 'undefined') {
    window.addEventListener('voyagr-vector-style-ready', () => {
        const layerToggles = typeof VoyagrMapLayerToggles !== 'undefined' ? VoyagrMapLayerToggles : null;
        const reconcile = layerToggles
            ? layerToggles.buildVectorStyleReadyReconcilePlan({
                hasMap: !!map,
                hasMapLibreHelpers: !!window.MapLibreHelpers,
                roadLabelsStorageValue: localStorage.getItem('roadLabelsEnabled'),
                showTrafficEnabled: showTrafficEnabled,
                showWeatherEnabled: showWeatherEnabled,
                hasTrafficLayerRef: !!trafficLayer,
                mapHasTrafficLayer: !!(map && map.getLayer && map.getLayer('traffic-layer')),
                hasWeatherLayerRef: !!weatherLayer,
                mapHasWeatherLayer: !!(map && map.getLayer && map.getLayer('weather-layer')),
            })
            : null;

        try {
            if (reconcile && reconcile.shouldRun && reconcile.reapplyRoadLabels) {
                MapLibreHelpers.toggleRoadLabels(map, reconcile.roadLabelsEnabled);
            }
        } catch (e) {
            /* ignore */
        }
        if (typeof scheduleMapRepaintAfterUiChange === 'function') {
            scheduleMapRepaintAfterUiChange();
        }
        // setStyle() removes raster overlays; JS handles still pointed at removed layers.
        try {
            if (!map || !reconcile) return;
            if (reconcile.resetTrafficLayerRef) {
                trafficLayer = null;
            }
            if (reconcile.resetWeatherLayerRef) {
                weatherLayer = null;
            }
            if (reconcile.addTrafficLayer) {
                addTrafficLayer();
            }
            if (reconcile.addWeatherLayer) {
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
    const layerToggles = _mapLayerToggles();
    const TU = _toggleUI();
    const collected = layerToggles.buildToggleRoadLabelsCollectPlan({ currentlyEnabled: roadLabelsEnabled });
    const execute = layerToggles.buildToggleRoadLabelsExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    roadLabelsEnabled = execute.enabled;
    if (execute.useWriteBoolPref) {
        TU.writeBoolPref(execute.storageKey, roadLabelsEnabled);
    } else {
        localStorage.setItem(execute.storageKey, execute.storageValue);
    }
    TU.applyToggleButton(
        document.getElementById(execute.toggleId),
        roadLabelsEnabled,
        execute.toggleInactiveStyles
    );

    if (map) {
        MapLibreHelpers.toggleRoadLabels(map, roadLabelsEnabled);
        showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage);
    }

    if (execute.saveAllSettings) saveAllSettings();
}

// ===== GOOGLE PLUS CODES TOGGLE =====
// Controls Google Plus Codes input for destination search
const GPC = typeof VoyagrGooglePlusCodesPrefs !== 'undefined' ? VoyagrGooglePlusCodesPrefs : null;
let googlePlusCodesEnabled = GPC
    ? GPC.resolveGooglePlusCodesEnabledFromStorage(localStorage.getItem('googlePlusCodesEnabled'))
    : localStorage.getItem('googlePlusCodesEnabled') === 'true';

/**
 * Toggle Google Plus Codes input on/off
 * @function toggleGooglePlusCodes
 */
function toggleGooglePlusCodes() {
    const prefs = _googlePlusCodesPrefs();
    const TU = _toggleUI();
    const collected = prefs.buildToggleGooglePlusCodesCollectPlan({ currentlyEnabled: googlePlusCodesEnabled });
    const execute = prefs.buildToggleGooglePlusCodesExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    googlePlusCodesEnabled = execute.enabled;
    localStorage.setItem(execute.storageKey, execute.storageValue);
    TU.applyToggleButton(
        document.getElementById(execute.toggleId),
        googlePlusCodesEnabled,
        execute.toggleInactiveStyles
    );
    showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);
    if (execute.saveAllSettings) saveAllSettings();
}

/**
 * Set 3D building height exaggeration
 * @function set3DBuildingHeight
 * @param {number} multiplier - Height multiplier (1.0 = normal, 2.0 = double height)
 */
function set3DBuildingHeight(multiplier) {
    const execute = _mapLayerToggles().buildSet3DBuildingHeightExecutePlan(multiplier);
    if (!execute.shouldApply) return;
    buildings3DHeightMultiplier = execute.heightMultiplier;
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (map) MapLibreHelpers.set3DBuildingHeight(map, execute.heightMultiplier);
    console.log(execute.logMessage);
}

/**
 * Set 3D building opacity/transparency
 * @function set3DBuildingOpacity
 * @param {number} opacity - Opacity value (0.0 = transparent, 1.0 = opaque)
 */
function set3DBuildingOpacity(opacity) {
    const execute = _mapLayerToggles().buildSet3DBuildingOpacityExecutePlan(opacity);
    if (!execute.shouldApply) return;
    buildings3DOpacity = execute.opacity;
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (map) MapLibreHelpers.set3DBuildingOpacity(map, execute.opacity);
    console.log(execute.logMessage);
}

/**
 * Toggle TomTom traffic flow layer on/off
 */
function toggleTrafficLayer() {
    const layerToggles = _mapLayerToggles();
    const TU = _toggleUI();
    const collected = layerToggles.buildToggleTrafficLayerCollectPlan({ currentlyEnabled: showTrafficEnabled });
    const execute = layerToggles.buildToggleTrafficLayerExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    showTrafficEnabled = execute.enabled;
    TU.writeBoolPref(execute.storageKey, showTrafficEnabled);
    TU.applyToggleButton(document.getElementById(execute.toggleId), showTrafficEnabled);

    if (execute.mapAction === 'addTrafficLayer') {
        addTrafficLayer();
    } else {
        removeTrafficLayer();
    }
    showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);
    if (execute.saveAllSettings) saveAllSettings();
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
    const MLT = _mapLayerToggles();
    const orch = MLT.buildAddTrafficLayerOrchestrationPlan({
        hasMap: !!map,
        pendingGuardSet: !!window[MLT.TRAFFIC_PENDING_GUARD_PROPERTY],
        isStyleLoaded: !!(map && map.isStyleLoaded && map.isStyleLoaded()),
    });
    if (!orch.shouldProceed) {
        if (orch.mapNotReadyLog) console.log(orch.mapNotReadyLog);
        return;
    }

    try {
        const stale = MLT.buildTrafficLayerStaleRefResetPlan({
            hasTrafficLayerRef: !!trafficLayer,
            hasMap: !!map,
            mapHasTrafficLayer: !!(map && map.getLayer && map.getLayer(MLT.TRAFFIC_LAYER_ID)),
        });
        if (stale.shouldReset) trafficLayer = null;
    } catch (e) {
        /* ignore */
    }

    removeTrafficLayer();

    const useProxy = window.VOYAGR_TOMTOM_TRAFFIC_PROXY === true;
    const tomtomApiKey = window.TOMTOM_API_KEY || '';

    console.log('[Traffic] API key / proxy check:', {
        useServerProxy: useProxy,
        windowKey: typeof window.TOMTOM_API_KEY,
        keyLength: tomtomApiKey ? tomtomApiKey.length : 0,
        hasKey: !!tomtomApiKey,
    });

    const credFetch = MLT.buildTrafficLayerCredentialsFetchPlan({
        useProxy,
        hasApiKey: !!tomtomApiKey,
    });
    if (credFetch.shouldFetch) {
        console.log(credFetch.fetchLogMessage);
        fetch(credFetch.url)
            .then((r) => r.json())
            .then((data) => {
                applySupportLinksFromConfig(data);
                const dispatch = MLT.buildTrafficCredentialsResponseDispatchPlan(data);
                if (dispatch.action === 'retryWithProxy') {
                    window.VOYAGR_TOMTOM_TRAFFIC_PROXY = true;
                    console.log('[Traffic] Server tile proxy enabled — key stays off the client');
                    addTrafficLayer();
                    return;
                }
                if (dispatch.action === 'retryWithKey') {
                    window.TOMTOM_API_KEY = dispatch.apiKey;
                    console.log('[Traffic] API key loaded from server, reinitializing...');
                    addTrafficLayer();
                    return;
                }
                console.log(credFetch.noKeyLogMessage);
            })
            .catch((err) => console.log(credFetch.errorLogPrefix, err));
        return;
    }

    let scheduled = false;
    const scheduleOnce = (fn) => {
        if (scheduled) return;
        scheduled = true;
        fn();
    };

    const addTrafficLayerNow = () => {
        const isStyleLoaded = !!(map && map.isStyleLoaded && map.isStyleLoaded());
        const tilePlan = MLT.buildTrafficTileUrlsPlan({
            useProxy: window.VOYAGR_TOMTOM_TRAFFIC_PROXY === true,
            origin: window.location.origin,
            apiKey: window.TOMTOM_API_KEY || '',
        });
        let hasSource = false;
        let hasLayer = false;
        try {
            hasSource = !!(map && map.getSource && map.getSource(MLT.TRAFFIC_SOURCE_ID));
            hasLayer = !!(map && map.getLayer && map.getLayer(MLT.TRAFFIC_LAYER_ID));
        } catch (e) {
            /* ignore */
        }

        const execute = MLT.buildAddTrafficLayerNowExecutePlan({
            isStyleLoaded,
            hasTiles: tilePlan.hasTiles,
            hasSource,
            hasLayer,
            tiles: tilePlan.tiles,
            beforeLayerId: isStyleLoaded
                ? _routeSelection().findFirstTextSymbolLayerId(map.getStyle() && map.getStyle().layers)
                : null,
        });
        if (!execute.shouldAdd) {
            if (execute.logMessage) console.log(execute.logMessage);
            return !execute.retryLater;
        }

        try {
            if (execute.beforeLayerIdLogPrefix && execute.layerSpec.beforeLayerId) {
                console.log(execute.beforeLayerIdLogPrefix + execute.layerSpec.beforeLayerId);
            }
            if (execute.addSource) {
                map.addSource(execute.sourceId, execute.sourceSpec);
            }
            if (execute.addLayer) {
                map.addLayer({
                    id: execute.layerSpec.id,
                    type: execute.layerSpec.type,
                    source: execute.layerSpec.source,
                    minzoom: execute.layerSpec.minzoom,
                    maxzoom: execute.layerSpec.maxzoom,
                    paint: execute.layerSpec.paint,
                }, execute.layerSpec.beforeLayerId);
            }

            if (execute.setTrafficLayerRef) {
                trafficLayer = { id: execute.trafficLayerRefId };
            }
            console.log(execute.successLog);
            if (execute.bringRoutesToTop) bringRoutesToTop();
            return true;
        } catch (e) {
            console.error('[Traffic] Error adding traffic layer:', e);
            return true;
        }
    };

    const runOnce = () => scheduleOnce(() => {
        try { addTrafficLayerNow(); } finally { window[orch.pendingGuardProperty] = false; }
    });

    window[orch.pendingGuardProperty] = true;

    const styleInit = MLT.buildTrafficStyleReadyInitPlan({ isStyleLoaded: orch.isStyleLoaded });
    if (styleInit.strategy === 'immediate') {
        runOnce();
        return;
    }

    console.log(styleInit.waitForStyleLog);
    map.once(styleInit.bindStyleLoadEvent, runOnce);
    let attempts = 0;
    const poll = () => {
        const tick = MLT.buildTrafficStylePollTickPlan({
            scheduled,
            hasMap: !!map,
            isStyleLoaded: !!(map && map.isStyleLoaded && map.isStyleLoaded()),
            attempts,
            maxAttempts: orch.stylePollMaxAttempts,
            intervalMs: orch.stylePollIntervalMs,
        });
        if (tick.action === 'stop') return;
        if (tick.action === 'clearGuard') {
            window[orch.pendingGuardProperty] = false;
            return;
        }
        if (tick.action === 'runOnce') {
            runOnce();
            return;
        }
        if (tick.action === 'giveUp') {
            console.warn(tick.logMessage);
            window[orch.pendingGuardProperty] = false;
            return;
        }
        attempts = tick.nextAttempts;
        setTimeout(poll, tick.intervalMs);
    };
    setTimeout(poll, orch.stylePollIntervalMs);
}

/**
 * Remove traffic layer from map
 */
function removeTrafficLayer() {
    const MLT = _mapLayerToggles();
    const execute = MLT.buildRemoveTrafficLayerExecutePlan({
        hasTrafficLayerRef: !!trafficLayer,
        hasMap: !!map,
    });
    if (!execute.shouldRemove) return;

    if (map.getLayer(execute.layerId)) {
        map.removeLayer(execute.layerId);
    }
    if (map.getSource(execute.sourceId)) {
        map.removeSource(execute.sourceId);
    }
    if (execute.clearTrafficLayerRef) trafficLayer = null;
    console.log(execute.logMessage);
}

let _trafficTileErrorStreak = 0;
let _trafficLayerPausedUntil = 0;

/**
 * Back off TomTom raster traffic when the tile proxy errors (rate limit / upstream).
 * Called from voyagr-core map error handler.
 * @param {number} statusCode
 */
function voyagrOnTrafficTileLoadError(statusCode) {
    const backoff = _mapLayerToggles().buildTrafficTileErrorBackoffPlan({
        statusCode,
        errorStreak: _trafficTileErrorStreak,
        pausedUntil: _trafficLayerPausedUntil,
    });
    if (backoff.incrementStreak) {
        _trafficTileErrorStreak = backoff.nextStreak;
        return;
    }
    if (!backoff.shouldBackoff) return;

    _trafficLayerPausedUntil = backoff.pauseUntil;
    if (backoff.resetStreak) _trafficTileErrorStreak = 0;
    if (backoff.removeTrafficLayer) removeTrafficLayer();
    console.warn(backoff.logMessage);
}
if (typeof window !== 'undefined') {
    window.voyagrOnTrafficTileLoadError = voyagrOnTrafficTileLoadError;
}

/**
 * Initialize traffic layer based on saved preference
 */
function initTrafficLayer() {
    const execute = _mapLayerToggles().buildInitTrafficLayerExecutePlan({ enabled: showTrafficEnabled });
    if (!execute.shouldApply) return;

    _toggleUI().applyToggleButton(document.getElementById(execute.toggleId), execute.enabled);

    if (!execute.addTrafficLayer || !map) return;
    try {
        const st = map.getStyle && map.getStyle();
        if (execute.deferOnBootstrapStyle && st && st.name === execute.bootstrapStyleName) {
            console.log(execute.deferLogMessage);
            return;
        }
    } catch (e) {
        /* ignore */
    }
    addTrafficLayer();
}

// ===== WEATHER LAYER (OpenWeatherMap Tiles) =====
// Real-time weather visualization overlay showing precipitation/clouds/temperature
let weatherLayer = null;
const WL_INIT = typeof VoyagrWeatherLayer !== 'undefined' ? VoyagrWeatherLayer : null;
let showWeatherEnabled = WL_INIT
    ? WL_INIT.resolveShowWeatherEnabledFromStorage(localStorage.getItem('showWeatherEnabled'))
    : localStorage.getItem('showWeatherEnabled') === 'true';
let weatherLayerType = WL_INIT
    ? WL_INIT.resolveWeatherLayerTypeFromStorage(localStorage.getItem('weatherLayerType'))
    : (localStorage.getItem('weatherLayerType') || 'precipitation_new');

/**
 * Toggle weather layer on/off
 */
function toggleWeatherLayer() {
    const WL = _weatherLayer();
    const TU = _toggleUI();
    const collected = WL.buildToggleWeatherLayerCollectPlan({ currentlyEnabled: showWeatherEnabled });
    const execute = WL.buildToggleWeatherLayerExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    showWeatherEnabled = execute.enabled;
    TU.writeBoolPref(execute.storageKey, showWeatherEnabled);
    TU.applyToggleButton(document.getElementById(execute.toggleId), showWeatherEnabled);

    if (execute.mapAction === 'addWeatherLayer') {
        addWeatherLayer();
    } else {
        removeWeatherLayer();
    }
    showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);
    if (execute.saveAllSettings) saveAllSettings();
}

/**
 * Set weather layer type (precipitation, clouds, temperature)
 * @param {string} type - Layer type: 'precipitation_new', 'clouds_new', 'temp_new', 'wind_new'
 */
function setWeatherLayerType(type) {
    const execute = _weatherLayer().buildSetWeatherLayerTypeExecutePlan(type);
    if (!execute.shouldApply) return;

    weatherLayerType = execute.layerType;
    localStorage.setItem(execute.storageKey, execute.storageValue);

    if (execute.refreshLayerWhenEnabled && showWeatherEnabled && map) {
        removeWeatherLayer();
        addWeatherLayer();
    }

    showStatus(execute.statusMessage, execute.statusType);
}

/**
 * Add OpenWeatherMap weather tile layer to map
 * Uses OpenWeatherMap's free weather tile API
 */
function addWeatherLayer() {
    const WL = _weatherLayer();
    const orch = WL.buildAddWeatherLayerOrchestrationPlan({
        hasMap: !!map,
        isStyleLoaded: !!(map && map.isStyleLoaded && map.isStyleLoaded()),
    });
    if (!orch.shouldProceed) {
        if (orch.mapNotReadyLog) console.log(orch.mapNotReadyLog);
        return;
    }

    try {
        if (weatherLayer && map && !map.getLayer(WL.WEATHER_LAYER_ID)) {
            weatherLayer = null;
        }
    } catch (e) {
        /* ignore */
    }

    removeWeatherLayer();

    let owmApiKey = window.OPENWEATHERMAP_API_KEY || '';
    const credFetch = WL.buildWeatherCredentialsFetchPlan({ hasApiKey: !!owmApiKey });
    if (credFetch.shouldFetch) {
        console.log(credFetch.fetchLogMessage);
        fetch(credFetch.url)
            .then((r) => r.json())
            .then((data) => {
                applySupportLinksFromConfig(data);
                if (data.success && data[credFetch.apiKeyField]) {
                    window.OPENWEATHERMAP_API_KEY = data[credFetch.apiKeyField];
                    console.log(credFetch.retryLogMessage);
                    addWeatherLayer();
                } else {
                    console.log(credFetch.noKeyLogMessage);
                    showStatus(credFetch.noKeyStatusMessage, credFetch.noKeyStatusType);
                }
            })
            .catch((err) => console.log(credFetch.errorLogPrefix, err));
        return;
    }

    const addWeatherLayerNow = () => {
        try {
            const tileUrl = WL.buildWeatherTileUrl(weatherLayerType, owmApiKey);

            if (!map.getSource(orch.sourceId)) {
                map.addSource(orch.sourceId, WL.buildWeatherSourceSpec(tileUrl));
            }

            if (!map.getLayer(orch.layerId)) {
                map.addLayer(WL.buildWeatherLayerSpec());
            }

            weatherLayer = { id: orch.layerId };
            console.log(orch.successLogMessage);

            if (orch.bringRoutesToTop) bringRoutesToTop();
        } catch (e) {
            console.error('[Weather] Error adding weather layer:', e);
        }
    };

    if (orch.isStyleLoaded) {
        addWeatherLayerNow();
    } else {
        console.log(orch.waitForStyleLog);
        map.once('style.load', addWeatherLayerNow);
        setTimeout(addWeatherLayerNow, orch.styleFallbackMs);
    }
}

/**
 * Remove weather layer from map
 */
function removeWeatherLayer() {
    const execute = _weatherLayer().buildRemoveWeatherLayerExecutePlan({
        hasWeatherLayerRef: !!weatherLayer,
        hasMap: !!map,
    });
    if (!execute.shouldRemove) return;

    if (map.getLayer(execute.layerId)) {
        map.removeLayer(execute.layerId);
    }
    if (map.getSource(execute.sourceId)) {
        map.removeSource(execute.sourceId);
    }
    if (execute.clearWeatherLayerRef) weatherLayer = null;
    console.log(execute.logMessage);
}

/**
 * Initialize weather layer based on saved preference
 */
function initWeatherLayer() {
    const execute = _weatherLayer().buildInitWeatherLayerExecutePlan({ enabled: showWeatherEnabled });
    if (!execute.shouldApply) return;

    _toggleUI().applyToggleButton(document.getElementById(execute.toggleId), execute.enabled);

    if (!execute.addWeatherLayer || !map) return;
    try {
        const st = map.getStyle && map.getStyle();
        if (execute.deferOnBootstrapStyle && st && st.name === execute.bootstrapStyleName) {
            console.log(execute.deferLogMessage);
            return;
        }
    } catch (e) {
        /* ignore */
    }
    addWeatherLayer();
}


// ===== AUTO-TRAFFIC UPDATE & AUTO-REROUTE SYSTEM =====
// Traffic orchestration lives in static/js/app/traffic-orchestration.js (bound at file end).
// Deviation tracking for time-based detection (shared with GPS reroute):
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
    const activeRoute = _routeSelection().pickActiveRouteDuringNavigation(
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
 * Destination as "lat,lon" for reroute APIs — must survive useRoute() replacing lastCalculatedRoute with a bare route option.
 */
function resolveNavigationDestination() {
    const ND = _navigationDestination();
    const collect = ND.buildResolveNavigationDestinationCollectPlan({
        lastCalculatedRoute: window.lastCalculatedRoute,
        routePolyline: typeof routePolyline !== 'undefined' ? routePolyline : null,
    });
    const sources = ND.readNavigationDestinationSources({
        lastRouteDestination: collect.lastRouteDestination,
        endElement: document.getElementById(collect.endElementId),
        polylineEnd: collect.polylineEnd,
    });
    return ND.resolveDestinationLatLon(sources);
}

/**
 * Build route request with current hazard avoidance settings
 */
function buildRouteRequest(startLat, startLon, destination, avoidPoints = null) {
    const RR = _routingRequest();
    const collect = RR.buildRouteRequestCollectPlan({
        storage: localStorage,
        startLat,
        startLon,
        destination,
        avoidPoints,
        routingMode: currentRoutingMode || 'auto',
        vehicleType: currentVehicleType || 'petrol_diesel',
        costParams: getRouteCostParams(currentVehicleType),
        isAvoidTollsEnabled,
        routePrefs: (typeof getRoutePreferences === 'function') ? getRoutePreferences() : {},
    });
    return RR.buildAutomaticRerouteRequestPlan(collect.storage, collect.opts);
}

function applyVoiceAnnouncementStateResetFromPlan(execute) {
    if (!execute || !execute.shouldReset) return;
    const p = execute.patch;
    lastETAAnnouncementTime = p.lastETAAnnouncementTime;
    lastAnnouncedETA = p.lastAnnouncedETA;
    lastDestinationAnnouncementDistance = p.lastDestinationAnnouncementDistance;
    lastTurnDetectRouteVertexIndex = p.lastTurnDetectRouteVertexIndex;
    initialETAMovementRetries = p.initialETAMovementRetries;
    _voiceAnnouncedForManeuverIndex = p.voiceAnnouncedForManeuverIndex;
    _voiceAnnouncedCategory = p.voiceAnnouncedCategory;
    _lastLaneVoiceKey = p.lastLaneVoiceKey;
    if (execute.clearTurnThresholds) announcedTurnThresholds.clear();
    if (execute.clearExitThresholds) announcedExitThresholds.clear();
    if (execute.clearKeepThresholds) announcedKeepThresholds.clear();
    if (execute.clearInitialEtaAnnouncement) clearInitialETAAnnouncement();
}

/**
 * Reset voice/ETA/distance announcement state when geometry changes (reroute).
 * Prevents repeating the same milestones and back-to-back ETA after "route recalculated".
 */
function resetVoiceAnnouncementStateForNewRoute() {
    applyVoiceAnnouncementStateResetFromPlan(
        _voiceAnnouncements().buildVoiceAnnouncementStateResetExecutePlan(Date.now())
    );
}

/**
 * Apply navigation state patches after a reroute map layer update.
 * @param {Object} plan - from buildRouteMapUpdateStatePlan
 * @param {Object} newRoute
 */
function applyRouteMapUpdateStateFromPlan(plan, newRoute) {
    const RD = _rerouteDecision();
    const execute = RD.buildRouteMapUpdateStateExecutePlan(plan, {
        currentLat,
        currentLon,
        newRoute,
    });

    if (execute.maneuvers) {
        currentRouteSteps = execute.maneuvers.steps;
        if (execute.maneuvers.logMessage) console.log(execute.maneuvers.logMessage);
    }

    if (execute.vehicleMarkerReset) {
        resetVehicleMarkerDisplayState();
    }

    const speedReset = execute.speedLimitReset;
    if (speedReset && speedReset.shouldReset) {
        const SL = _speedLimitWidget();
        const resetPlan = SL
            ? SL.buildSpeedLimitFetchResetApplyPlan(
                speedReset.kind === 'full-reroute'
                    ? { kind: speedReset.kind }
                    : {
                        kind: speedReset.kind,
                        newLastActiveManeuverIdx: speedReset.newLastActiveManeuverIdx,
                        resetCurrentSpeedLimitMph: speedReset.resetCurrentSpeedLimitMph,
                        resetDetectedRoadType: speedReset.resetDetectedRoadType,
                    }
            )
            : null;
        if (resetPlan) applySpeedLimitFetchResetFromPlan(resetPlan);
    }

    const progress = execute.progress;
    if (progress.action === 'primeVehicleMarker') {
        primeVehicleMarkerOnRoute(currentLat, currentLon);
    } else if (progress.action === 'resetProgress' && progress.patch) {
        currentStepIndex = progress.patch.currentStepIndex;
        lastSnappedRouteIndex = progress.patch.lastSnappedRouteIndex;
        lastTurnDetectRouteVertexIndex = progress.patch.lastTurnDetectRouteVertexIndex;
    }

    if (execute.roadNameReset) {
        lastRoadNameFetch = 0;
        lastRoadNamePosition = null;
        currentRoadDisplayName = '';
    }
    if (execute.navigationArrivalReset) {
        resetNavigationArrivalState();
    }

    const dev = execute.deviation;
    if (dev) {
        deviationStartTimeCheck = dev.deviationStartTimeCheck;
        rerouteAttemptCount = dev.rerouteAttemptCount;
        postRerouteGraceUntil = dev.postRerouteGraceUntil;
        routeJoinConfirmedForDeviation = dev.routeJoinConfirmedForDeviation;
        deviationOffRouteStreak = dev.deviationOffRouteStreak;
        lastRerouteTime = dev.lastRerouteTime;
        lastRerouteAttemptTime = dev.lastRerouteAttemptTime;
        rerouteInProgress = dev.rerouteInProgress;
        if (dev.clearFailureRetries) clearRerouteFailureRetries();
    }

    const post = execute.post;
    if (post.refreshTurnWidget) {
        updateTurnWidgetFromPosition(currentLat, currentLon);
    }
    if (post.fetchRoadName) {
        fetchRoadNameThrottled(currentLat, currentLon);
    }
    if (execute.tripInfo) {
        updateTripInfo(
            execute.tripInfo.distance_km,
            execute.tripInfo.duration_minutes,
            execute.tripInfo.fuel_cost,
            execute.tripInfo.toll_cost
        );
    }
    if (post.patchLastCalculatedRoute) {
        window.lastCalculatedRoute = execute.lastCalculatedRoutePatch;
    }
    if (post.completeLog) console.log(post.completeLog);
}

/**
 * Update route on map with new route data
 */
function updateRouteOnMap(newRoute) {
    const RD = _rerouteDecision();
    const plan = RD.buildRouteMapUpdateStatePlan(newRoute, window.lastCalculatedRoute, {
        now: Date.now(),
        hasCurrentGps: currentLat != null && currentLon != null,
        convertDistance,
        distUnit: getDistanceUnit(),
    });
    const execute = RD.buildUpdateRouteOnMapExecutePlan(plan);

    if (execute.resetVoiceAnnouncementState) {
        resetVoiceAnnouncementStateForNewRoute();
    }

    if (execute.removeExistingRouteLayer && routeLayer && typeof routeLayer.remove === 'function') {
        routeLayer.remove();
    }

    routePolyline = decodePolyline(newRoute.geometry, execute.polylineDecodePrecision);
    console.log(`${execute.polylineLogPrefix} ${routePolyline.length} points`);

    if (execute.mountActiveNavRoute) {
        const mount = _routeSelection().buildNavActiveRouteLayerMountPlan({
            routePolyline,
            navRouteColor: navActiveRouteColor(),
        });
        routeLayer = MapLibreHelpers.addPolyline(map, mount.polyline, mount.style);
    }
    if (execute.bringNavRouteAboveTraffic) {
        bringNavRouteAboveTrafficEdges();
    }

    if (execute.applyRouteMapUpdateState) {
        applyRouteMapUpdateStateFromPlan(plan, newRoute);
    }
}

/**
 * Shared polyline style for the active navigation route line.
 * @returns {Object} MapLibreHelpers.addPolyline options
 */
function getNavActiveRoutePolylineOptions() {
    return _routeSelection().buildNavActiveRoutePolylineStyle(navActiveRouteColor());
}

/**
 * After reroute or map style recovery, re-draw the navigation route line on the map.
 * @param {string} [reason] - Log context
 */
function redrawNavigationRouteLayer(reason) {
    const RS = _routeSelection();
    const guard = RS.buildNavRouteLayerRedrawGuardPlan({ routeInProgress, map, routePolyline });
    if (!guard.shouldRedraw) return;
    try {
        if (routeLayer && typeof routeLayer.remove === 'function') {
            routeLayer.remove();
        }
        const mount = RS.buildNavActiveRouteLayerMountPlan({
            routePolyline,
            navRouteColor: navActiveRouteColor(),
        });
        routeLayer = MapLibreHelpers.addPolyline(map, mount.polyline, mount.style);
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
        const SG = _speedGps();
        const heading = currentUserMarker && Number.isFinite(currentUserMarker.heading)
            ? currentUserMarker.heading
            : 0;
        const speed = currentUserMarker && Number.isFinite(currentUserMarker.speed)
            ? currentUserMarker.speed
            : 0;
        const acc = currentUserMarker && Number.isFinite(currentUserMarker.accuracy)
            ? currentUserMarker.accuracy
            : null;

        const redraw = SG.buildNavigationVehicleMarkerRedrawPlan({
            lat,
            lon,
            accuracy: acc,
            routeInProgress,
            routePolyline,
            snapped: resolveGpsRouteSnapForTick(lat, lon),
            gpsHeadingForBlend: heading,
            lastSnappedRouteIndex,
            prevSnapBlendWeightState: _snapBlendWeightState,
            smoothDisplayLat: _smoothDisplayLat,
            smoothDisplayLon: _smoothDisplayLon,
            useSmoothCoordsOnly: _smoothDisplayLat != null && _smoothDisplayLon != null,
            speedMph: speed,
            speed,
            hasMarker: !!currentUserMarker,
            canSetLngLat: !!(currentUserMarker && typeof currentUserMarker.setLngLat === 'function'),
            markerOnMap: !!(currentUserMarker && currentUserMarker._map),
            mapBearing: map && typeof map.getBearing === 'function' ? map.getBearing() : 0,
            calculateBearing: (a, b, c, d) => _routeGeometry().bearing(a, b, c, d),
            blendHeadingsCircular: _routeGeometry().blendHeadingsCircular,
        });

        applyVehicleMarkerFromTickPlan(redraw.markerTick);
        if (redraw.reattachToMap && currentUserMarker && typeof currentUserMarker.addTo === 'function') {
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

    const snapPlan = _routeGeometry().buildGpsRouteSnapTickPlan({
        lat,
        lon,
        routeInProgress: true,
        routePolyline,
        lastSnappedRouteIndex: 0,
        searchStartIndex: 0,
    });
    const snap = snapPlan.snapped;
    if (!snap) return;
    const idx = Math.max(0, Math.min(snap.index, routePolyline.length - 2));
    const plan = _routeProgress().buildNavigationProgressSeedPlan(
        idx,
        snap.distance,
        currentRouteSteps,
        _rerouteDecision().DEFAULTS.ROUTE_JOIN_GATE_METERS
    );

    lastSnappedRouteIndex = plan.lastSnappedRouteIndex;
    lastTurnDetectRouteVertexIndex = plan.lastTurnDetectRouteVertexIndex;
    currentStepIndex = plan.currentStepIndex;
    if (plan.routeJoinConfirmedForDeviation) {
        routeJoinConfirmedForDeviation = true;
    }

    console.log(plan.logMessage);
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
const MOT = typeof VoyagrMapOverlayToggles !== 'undefined' ? VoyagrMapOverlayToggles : null;
let showCamerasEnabled = MOT
    ? MOT.resolveShowCamerasEnabledFromStorage(localStorage.getItem('showCamerasEnabled'))
    : localStorage.getItem('showCamerasEnabled') !== 'false';

window.osmTrafficLightMarkers = [];
let showOsmTrafficLightsEnabled = MOT
    ? MOT.resolveShowOsmTrafficLightsEnabledFromStorage(localStorage.getItem('showOsmTrafficLightsOnMap'))
    : localStorage.getItem('showOsmTrafficLightsOnMap') !== 'false';

window.osmRailwayCrossingMarkers = [];
let showOsmRailwayCrossingsEnabled = MOT
    ? MOT.resolveShowOsmRailwayCrossingsEnabledFromStorage(localStorage.getItem('showOsmRailwayCrossingsOnMap'))
    : localStorage.getItem('showOsmRailwayCrossingsOnMap') !== 'false';

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
    const OT = _mapOverlayToggles();
    const TU = _toggleUI();
    const collected = OT.buildToggleShowCamerasCollectPlan({ currentlyEnabled: showCamerasEnabled });
    const execute = OT.buildToggleShowCamerasExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    showCamerasEnabled = execute.enabled;
    TU.writeBoolPref(execute.storageKey, showCamerasEnabled);
    TU.applyToggleButton(document.getElementById(execute.toggleId), showCamerasEnabled);

    if (execute.mapAction === 'fetchCameras') {
        fetchAndDisplayCameras();
        console.log(execute.enabledLogMessage);
    } else {
        clearCameraMarkers();
        console.log(execute.disabledLogMessage);
    }
    if (execute.saveAllSettings) saveAllSettings();
}

function applyClearOverlayMarkersFromPlan(execute) {
    if (!execute || !execute.shouldClear) return;
    const markers = window[execute.markersProperty];
    if (markers) {
        markers.forEach((marker) => {
            if (marker && typeof marker.remove === 'function') {
                marker.remove();
            }
        });
    }
    if (execute.resetMarkerArray) {
        window[execute.markersProperty] = [];
    }
}

/**
 * Clear all camera markers from the map (separate from hazard markers)
 */
function clearCameraMarkers() {
    applyClearOverlayMarkersFromPlan(_mapOverlayToggles().buildClearCameraMarkersExecutePlan());
}

/**
 * Fetch cameras in current map viewport and display them
 */
function fetchAndDisplayCameras() {
    const OT = _mapOverlayToggles();
    const dispatch = OT.buildFetchCamerasDispatchPlan({
        enabled: showCamerasEnabled,
        hasMap: !!map,
        zoom: map ? map.getZoom() : 0,
    });
    if (!dispatch.shouldFetch) {
        if (dispatch.clearMarkers) clearCameraMarkers();
        if (dispatch.lowZoomLogMessage) console.log(dispatch.lowZoomLogMessage);
        return;
    }

    const bounds = map.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();

    fetch(OT.buildAreaBoundsApiUrl(north, south, east, west, dispatch.apiPath))
        .then((response) => response.json())
        .then((data) => {
            if (data.success && data.cameras) {
                displayCameraMarkers(data.cameras);
                console.log(`[Cameras] Loaded ${data.cameras.length} cameras in viewport`);
            }
        })
        .catch((error) => {
            console.error('[Cameras] Error fetching cameras:', error);
        });
}

/**
 * Display camera markers on the map (separate layer from route hazards)
 */
function displayCameraMarkers(cameras) {
    const OT = _mapOverlayToggles();
    const collect = OT.buildDisplayCameraMarkersCollectPlan(cameras);
    if (!collect.shouldDisplay) {
        if (collect.clearMarkers) clearCameraMarkers();
        return;
    }

    clearCameraMarkers();

    const HM = _hazardMapMarkers();
    const styleMap = HM.getHazardMarkerStyleMap();
    const CAM = _cameraMapMarkers();
    const specs = CAM.buildCameraMarkersMountSpecs(collect.items, styleMap, {
        normalizeBucket: (bucket) => HM.normalizeCameraHazardTypeForMarker(bucket),
        markerClassName: collect.markerClassName,
        markerSvgSize: collect.markerSvgSize,
        popupSvgSize: collect.popupSvgSize,
        iconSize: collect.iconSize,
        iconAnchor: collect.iconAnchor,
    });

    specs.forEach((spec) => {
        const marker = MapLibreHelpers.createMarker(spec.lat, spec.lon, {
            className: spec.className,
            html: spec.html,
            iconSize: spec.iconSize,
            iconAnchor: spec.iconAnchor,
            popup: spec.popup,
        }).addTo(map);

        window.cameraMarkers.push(marker);
    });

    console.log(collect.displayedLogPrefix + window.cameraMarkers.length + collect.displayedLogSuffix);
}

function toggleShowOsmTrafficLights() {
    const OT = _mapOverlayToggles();
    const TU = _toggleUI();
    const collected = OT.buildToggleOsmTrafficLightsCollectPlan({
        currentlyEnabled: showOsmTrafficLightsEnabled,
    });
    const execute = OT.buildToggleOsmTrafficLightsExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    showOsmTrafficLightsEnabled = execute.enabled;
    TU.writeBoolPref(execute.storageKey, showOsmTrafficLightsEnabled);
    TU.applyLabeledToggleButton(document.getElementById(execute.toggleId), showOsmTrafficLightsEnabled);

    if (execute.mapAction === 'fetchOsmTrafficLights') {
        fetchAndDisplayOsmTrafficLights();
    } else {
        clearOsmTrafficLightMarkers();
    }
    if (execute.saveAllSettings) saveAllSettings();
}

function toggleShowOsmRailwayCrossings() {
    const OT = _mapOverlayToggles();
    const TU = _toggleUI();
    const collected = OT.buildToggleOsmRailwayCrossingsCollectPlan({
        currentlyEnabled: showOsmRailwayCrossingsEnabled,
    });
    const execute = OT.buildToggleOsmRailwayCrossingsExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    showOsmRailwayCrossingsEnabled = execute.enabled;
    TU.writeBoolPref(execute.storageKey, showOsmRailwayCrossingsEnabled);
    TU.applyLabeledToggleButton(document.getElementById(execute.toggleId), showOsmRailwayCrossingsEnabled);

    if (execute.mapAction === 'fetchOsmRailwayCrossings') {
        fetchAndDisplayOsmRailwayCrossings();
    } else {
        clearOsmRailwayCrossingMarkers();
    }
    if (execute.saveAllSettings) saveAllSettings();
}

function clearOsmTrafficLightMarkers() {
    applyClearOverlayMarkersFromPlan(_mapOverlayToggles().buildClearOsmTrafficLightMarkersExecutePlan());
}

function clearOsmRailwayCrossingMarkers() {
    applyClearOverlayMarkersFromPlan(_mapOverlayToggles().buildClearOsmRailwayCrossingMarkersExecutePlan());
}

const OSM_OVERLAY_MAX_BBOX_DEG = MOT ? MOT.OSM_OVERLAY_MAX_BBOX_DEG : 0.35;

function isOsmOverlayBboxTooLarge(north, south, east, west) {
    return _mapOverlayToggles().isOsmOverlayBboxTooLarge(north, south, east, west);
}

/**
 * Fetch an OSM map-overlay endpoint; never parse HTML error pages as JSON.
 * @param {string} url
 * @param {string} logLabel
 * @returns {Promise<object|null>}
 */
function fetchOsmAreaOverlay(url, logLabel) {
    const OT = _mapOverlayToggles();
    return fetch(url)
        .then((response) => {
            const httpPlan = OT.buildOsmAreaOverlayResponsePlan({
                ok: response.ok,
                statusCode: response.status,
                logLabel,
            });
            if (!httpPlan.shouldParseJson) {
                console.warn(httpPlan.logMessage);
                return null;
            }
            return response.json();
        })
        .catch((err) => {
            const errPlan = OT.buildOsmAreaOverlayFetchErrorPlan({
                logLabel,
                errorMessage: err.message || String(err),
            });
            console.warn(errPlan.logMessage);
            return errPlan.result;
        });
}

function fetchAndDisplayOsmTrafficLights() {
    if (!map) return;
    const OT = _mapOverlayToggles();
    const bounds = map.getBounds();
    const dispatch = OT.buildFetchOsmOverlayDispatchPlan({
        enabled: showOsmTrafficLightsEnabled,
        hasMap: true,
        zoom: map.getZoom(),
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        apiPath: OT.OSM_TRAFFIC_LIGHTS_AREA_API_PATH,
        logLabel: 'OSM Traffic Lights',
    });
    if (!dispatch.shouldFetch) {
        if (dispatch.clearMarkers) clearOsmTrafficLightMarkers();
        return;
    }
    fetchOsmAreaOverlay(dispatch.url, dispatch.logLabel).then((data) => {
        if (data && data.success && data.traffic_lights) {
            displayOsmTrafficLightMarkers(data.traffic_lights);
        }
    });
}

function fetchAndDisplayOsmRailwayCrossings() {
    if (!map) return;
    const OT = _mapOverlayToggles();
    const bounds = map.getBounds();
    const dispatch = OT.buildFetchOsmOverlayDispatchPlan({
        enabled: showOsmRailwayCrossingsEnabled,
        hasMap: true,
        zoom: map.getZoom(),
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        apiPath: OT.OSM_RAILWAY_CROSSINGS_AREA_API_PATH,
        logLabel: 'OSM Railway Crossings',
    });
    if (!dispatch.shouldFetch) {
        if (dispatch.clearMarkers) clearOsmRailwayCrossingMarkers();
        return;
    }
    fetchOsmAreaOverlay(dispatch.url, dispatch.logLabel).then((data) => {
        if (data && data.success && data.railway_crossings) {
            displayOsmRailwayCrossingMarkers(data.railway_crossings);
        }
    });
}

function displayOsmTrafficLightMarkers(lights) {
    const OT = _mapOverlayToggles();
    const collect = OT.buildDisplayOsmTrafficLightMarkersCollectPlan(lights);
    if (!collect.shouldDisplay) {
        if (collect.clearMarkers) clearOsmTrafficLightMarkers();
        return;
    }
    clearOsmTrafficLightMarkers();
    const OSM = _osmMapIcons();
    const pill = getOsmTrafficLightMarkerPillHTML();
    collect.items.forEach((light) => {
        const marker = MapLibreHelpers.createMarker(light.lat, light.lon, {
            className: collect.markerClassName,
            html: pill,
            iconSize: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
            iconAnchor: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_ANCHOR,
            popup: OSM.buildOsmTrafficLightPopupHtml(pill),
        }).addTo(map);
        window.osmTrafficLightMarkers.push(marker);
    });
}

function displayOsmRailwayCrossingMarkers(crossings) {
    const OT = _mapOverlayToggles();
    const collect = OT.buildDisplayOsmRailwayCrossingMarkersCollectPlan(crossings);
    if (!collect.shouldDisplay) {
        if (collect.clearMarkers) clearOsmRailwayCrossingMarkers();
        return;
    }
    clearOsmRailwayCrossingMarkers();
    const OSM = _osmMapIcons();
    const crossingIcon = OSM.buildRailwayCrossingIconSvg();
    const popupHtml = OSM.buildRailwayCrossingPopupHtml(crossingIcon);
    collect.items.forEach((cx) => {
        const marker = MapLibreHelpers.createMarker(cx.lat, cx.lon, {
            className: collect.markerClassName,
            html: OSM.buildRailwayCrossingMarkerHtml(crossingIcon),
            iconSize: collect.iconSize,
            iconAnchor: collect.iconAnchor,
            popup: popupHtml,
        }).addTo(map);
        window.osmRailwayCrossingMarkers.push(marker);
    });
}

/**
 * Initialize camera layer - called after map is ready
 */
function initializeCameraLayer() {
    const OT = _mapOverlayToggles();
    const execute = OT.buildInitializeCameraLayerExecutePlan({
        hasMap: !!map,
        alreadyInitialized: !!window.__voyagrCameraLayerInitialized,
        showCamerasEnabled,
        showOsmTrafficLightsEnabled,
        showOsmRailwayCrossingsEnabled,
    });
    if (!execute.shouldInit) {
        if (execute.mapNotReadyLog) console.log(execute.mapNotReadyLog);
        return;
    }
    window[execute.initFlagProperty] = true;

    const TU = _toggleUI();
    (execute.toggles || []).forEach((toggle) => {
        const el = document.getElementById(toggle.id);
        if (!el) return;
        if (toggle.labeled) TU.applyLabeledToggleButton(el, toggle.enabled);
        else TU.applyToggleButton(el, toggle.enabled);
    });

    const movePlan = OT.buildCameraLayerMapMoveHandlerPlan({
        mapMoveEvent: execute.mapMoveEvent,
        cameraMoveDebounceMs: execute.cameraMoveDebounceMs,
        osmOverlayDebounceMs: execute.osmOverlayDebounceMs,
    });
    let cameraFetchTimeout = null;
    let osmOverlayFetchTimeout = null;
    map.on(movePlan.mapMoveEvent, () => {
        if (cameraFetchTimeout) clearTimeout(cameraFetchTimeout);
        cameraFetchTimeout = setTimeout(() => {
            fetchAndDisplayCameras();
        }, movePlan.cameraFetch.debounceMs);
        if (osmOverlayFetchTimeout) clearTimeout(osmOverlayFetchTimeout);
        osmOverlayFetchTimeout = setTimeout(() => {
            fetchAndDisplayOsmTrafficLights();
            fetchAndDisplayOsmRailwayCrossings();
        }, movePlan.osmOverlayFetch.debounceMs);
    });

    const initial = execute.initialFetches || {};
    if (initial.cameras) fetchAndDisplayCameras();
    if (initial.osmTrafficLights) fetchAndDisplayOsmTrafficLights();
    if (initial.osmRailwayCrossings) fetchAndDisplayOsmRailwayCrossings();

    console.log(execute.initLogMessage);
}

/**
 * Initialize road labels - called after map is ready
 */
function initializeRoadLabels() {
    const MLT = _mapLayerToggles();
    const execute = MLT.buildInitializeRoadLabelsExecutePlan({
        hasMap: !!map,
        alreadyInitialized: !!window[MLT.ROAD_LABELS_INIT_FLAG],
        roadLabelsEnabled,
    });
    if (!execute.shouldInit) {
        if (execute.mapNotReadyLog) console.log(execute.mapNotReadyLog);
        return;
    }
    window[execute.initFlagProperty] = true;

    const toggle = document.getElementById(execute.toggleId);
    _toggleUI().applyToggleButton(toggle, execute.roadLabelsEnabled, execute.toggleInactiveStyles);
    MapLibreHelpers.toggleRoadLabels(map, execute.roadLabelsEnabled);

    console.log(execute.initLogMessage);
}

/**
 * startNavigation function
 * @function startNavigation
 * @returns {*} Return value description
 */
function startNavigation() {
    const RS = _routeSelection();
    const plan = RS.buildStartNavigationExecutePlan(window.lastCalculatedRoute);
    if (!plan.shouldStart) {
        showStatus(plan.errorStatusMessage, 'error');
        return;
    }

    startTurnByTurnNavigation(window.lastCalculatedRoute);

    plan.hideStartNavButtonIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
    });

    if (plan.collapseBottomSheet) collapseBottomSheet();
}

// ===== ROUTE PREVIEW FEATURE =====
/**
 * Apply a new route during active navigation without touching preview DOM, bottom sheet, or tabs.
 * Uses the same matching logic as calculateRoute in-nav path; does not restart turn-by-turn (updateRouteOnMap syncs geometry/steps).
 * @param {Object} routeData - API route payload or single route object
 */
function applyRouteUpdateDuringNavigation(routeData) {
    const RS = _routeSelection();
    const activeRoute = pickActiveRouteDuringNavigation(routeData.routes, routeData);
    const plan = RS.buildRouteUpdateDuringNavigationExecutePlan(
        activeRoute,
        routeData,
        window.lastCalculatedRoute
    );

    console.log(plan.entryLogMessage);

    if (!plan.shouldExecute) {
        showStatus(plan.errorStatusMessage, 'error');
        return;
    }

    if (plan.updateRouteOnMap) {
        updateRouteOnMap(plan.activeRoute);
    }

    if (plan.patchLastCalculatedRoute) {
        window.lastCalculatedRoute = plan.lastCalculatedRoutePatch;
    }

    showStatus(plan.statusMessage, plan.statusType);
}

/**
 * Mount the route comparison modal from a pure DOM apply plan.
 * @param {Object} domPlan - from buildRouteComparisonModalDomApplyPlan
 * @returns {HTMLElement|null}
 */
function applyRouteComparisonModalFromPlan(domPlan) {
    const plan = _routeSelection().buildRouteComparisonModalExecutePlan(domPlan);
    if (!plan.shouldExecute) return null;
    if (plan.removeExisting) {
        const existing = document.getElementById(plan.modalId);
        if (existing) existing.remove();
    }
    const modal = document.createElement('div');
    modal.id = plan.modalId;
    modal.style.cssText = plan.overlayStyle;
    modal.innerHTML = plan.innerHtml;
    if (plan.dismissOnOverlayClick) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }
    document.body.appendChild(modal);
    return modal;
}

/**
 * Apply alternative-route preview cards from a pure DOM apply plan.
 * @param {Object} domPlan - from buildAlternativeRoutesPreviewDomApplyPlan
 */
function applyAlternativeRoutesPreviewDomFromPlan(domPlan) {
    const executePlan = _routeSelection().buildAlternativeRoutesPreviewDomExecutePlan(domPlan);
    if (!executePlan.shouldExecute) return;

    const container = document.getElementById(executePlan.listContainerId);
    const parentContainer = document.getElementById(executePlan.parentContainerId);
    if (!parentContainer || !container) return;

    if (!executePlan.showContainer) {
        parentContainer.style.display = executePlan.containerDisplay;
        return;
    }

    container.innerHTML = '';
    executePlan.cardPlans.forEach((plan, index) => {
        const div = document.createElement('div');
        div.style.cssText = plan.containerStyle;
        div.innerHTML = plan.html;
        div.onmouseover = () => {
            div.style.borderColor = plan.hoverStyle.borderColor;
            div.style.background = plan.hoverStyle.background;
        };
        div.onmouseout = () => {
            div.style.borderColor = plan.restStyle.borderColor;
            div.style.background = plan.restStyle.background;
        };
        div.onclick = () => {
            selectRoute(index);
            useRoute(index);
        };
        container.appendChild(div);
    });

    parentContainer.style.display = executePlan.containerDisplay;
}

/**
 * Run post-preview UI actions (tab, sheet, traffic) from a pure plan.
 * @param {Object} afterPlan - from buildRoutePreviewAfterDisplayPlan
 */
function applyRoutePreviewAfterDisplayFromPlan(afterPlan) {
    const plan = _routeSelection().buildRoutePreviewAfterDisplayExecutePlan(afterPlan);
    if (!plan.shouldExecute) return;

    if (plan.switchToPreviewTab) {
        switchTab('routePreview');
    }
    if (plan.expandBottomSheet) {
        expandBottomSheet();
    }
    if (plan.addTrafficLayer) {
        addTrafficLayer();
    }
    if (plan.previewTraffic && routeOptions && routeOptions.length > 0) {
        const previewPolyline = routeOptions[plan.previewPolylineRouteIndex || 0].polyline;
        if (previewPolyline && previewPolyline.length > 0) {
            routePolyline = previewPolyline;
            if (plan.previewTrafficLogMessage) console.log(plan.previewTrafficLogMessage);
            fetchAndDisplayRouteTraffic();
        }
    }
}

function collectShowRoutePreviewInput(routeData, skipMapDisplay) {
    const RS = _routeSelection();
    const previewRoute = RS.resolvePreviewRoute(routeData, selectedRouteIndex);
    return {
        routeData,
        skipMapDisplay,
        routeInProgress,
        selectedRouteIndex,
        currencySymbol: getCurrencySymbol(),
        distanceText: convertDistance(RS.resolvePreviewDistanceKm(routeData, previewRoute)) + ' ' + getDistanceUnit(),
        startLabel: document.getElementById('start').value,
        endLabel: document.getElementById('end').value,
        routingMode: currentRoutingMode,
        vehicleType: currentVehicleType,
        distanceUnit: distanceUnit,
        preferencesApplied: localStorage.getItem('pref_cameras') !== 'false',
        routeOptionsCount: routeOptions ? routeOptions.length : 0,
        routeOptions,
        showTrafficEnabled,
        hasTrafficLayer: !!trafficLayer,
        routeTrafficEnabled: VoyagrTrafficOrchestration.getTrafficSettingsSnapshot().routeTrafficEnabled,
    };
}

function applyShowRoutePreviewFromPlan(apply, routeData, skipMapDisplay) {
    if (!apply || !apply.shouldApply) {
        if (apply && apply.delegateToNavUpdate) {
            applyRouteUpdateDuringNavigation(routeData);
            return;
        }
        if (apply && apply.errorStatusMessage) {
            showStatus(apply.errorStatusMessage, 'error');
        }
        if (apply && apply.errorLogMessage) console.error(apply.errorLogMessage);
        return;
    }

    const RS = _routeSelection();
    if (apply.entryLogMessage) {
        console.log(apply.entryLogMessage, routeData, 'skipMapDisplay:', skipMapDisplay);
    }
    console.log('[Route Preview] Currency:', apply.panelInput.currencySymbol, 'Distance Unit:', getDistanceUnit());

    const panelPlan = RS.buildRoutePreviewPanelApplyPlan(apply.panelInput);
    const domPlan = RS.buildRoutePreviewPanelDomApplyPlan(panelPlan);
    applyRoutePreviewPanelDomFromPlan(domPlan);
    console.log('[Cost] Route preview costs:', domPlan.costLog);

    if (apply.showAlternativeRoutesWhenMultiple && domPlan.previewAlternativeRoutesContainer.showAlternativeRoutes) {
        showAlternativeRoutesInPreview();
        if (apply.alternativeRoutesLogMessage) console.log(apply.alternativeRoutesLogMessage);
    }

    if (apply.showMapRoutes && domPlan.showMapRoutes) {
        displayAllRoutesOnMap();
        if (apply.mapRoutesLogMessage) console.log(apply.mapRoutesLogMessage);
    }

    if (apply.switchTabLogMessage) console.log(apply.switchTabLogMessage);
    applyRoutePreviewAfterDisplayFromPlan(RS.buildRoutePreviewAfterDisplayPlan(apply.afterDisplayInput));

    if (apply.successLogMessage) console.log(apply.successLogMessage);
    showStatus(domPlan.statusMessage, 'success');
}

/**
 * showRoutePreview function
 * @function showRoutePreview
 * @param {*} routeData - Route data to display in preview
 * @param {boolean} skipMapDisplay - If true, skip displayAllRoutesOnMap (used when selecting a specific route)
 * @returns {*} Return value description
 */
function showRoutePreview(routeData, skipMapDisplay = false) {
    const orch = _routeSelection().buildShowRoutePreviewOrchestrationPlan(
        collectShowRoutePreviewInput(routeData, skipMapDisplay)
    );
    applyShowRoutePreviewFromPlan(orch.apply, routeData, skipMapDisplay);
}

function collectShowAlternativeRoutesPreviewInput() {
    return {
        routeCount: routeOptions ? routeOptions.length : 0,
        routeOptions,
        routeColors: routeColors(),
        currencySymbol: getCurrencySymbol(),
        distUnit: getDistanceUnit(),
        fuelUnit: currentVehicleType === 'electric' ? 'kWh' : 'L',
        convertDistance,
    };
}

/**
 * showAlternativeRoutesInPreview function
 * @function showAlternativeRoutesInPreview
 * @returns {*} Return value description
 */
function showAlternativeRoutesInPreview() {
    const orch = _routeSelection().buildShowAlternativeRoutesPreviewEntryOrchestrationPlan(
        collectShowAlternativeRoutesPreviewInput()
    );
    if (!orch.shouldShow) return;
    applyAlternativeRoutesPreviewDomFromPlan(orch.apply);
}

function collectShowRouteComparisonInput() {
    return {
        routeCount: routeOptions ? routeOptions.length : 0,
        routeOptions,
        currencySymbol: getCurrencySymbol(),
        distUnit: getDistanceUnit(),
        convertDistance,
    };
}

function applyShowRouteComparisonEntryFromPlan(apply) {
    if (!apply) return false;
    if (apply.entryLogMessage) console.log(apply.entryLogMessage);
    (apply.debugLogs || []).forEach((log) => console.log(log.prefix, log.value));
    if (!apply.shouldProceed) {
        if (apply.errorLogMessage) console.error(apply.errorLogMessage, apply.routeCount);
        if (apply.errorStatusMessage) showStatus(apply.errorStatusMessage, 'error');
        return false;
    }
    if (apply.singleRouteWarning) {
        if (apply.singleRouteLogMessage) console.warn(apply.singleRouteLogMessage);
        if (apply.singleRouteStatusMessage) showStatus(apply.singleRouteStatusMessage, 'info');
    }
    return true;
}

async function applyShowRouteComparisonFetchHttpResponse(response) {
    const RR = _routingRequest();
    const RS = _routeSelection();
    const contentType = response.headers.get('content-type');
    const plan = RS.buildShowRouteComparisonFetchHttpResponsePlan({
        status: response.status,
        ok: response.ok,
        contentType,
        isJson: RR.isRouteApiJsonContentType(contentType),
    });

    console.log(plan.statusLogPrefix, response.status);

    if (plan.action === 'reject_non_json') {
        const text = await response.text();
        console.error(plan.nonJsonErrorLogPrefix, plan.contentType);
        console.error(plan.responseTextLogPrefix, text.substring(0, 200));
        throw new Error(RR.buildNonJsonRouteApiErrorMessage(plan.status, text));
    }

    if (plan.action === 'reject_http_error') {
        const text = await response.text();
        throw new Error(RR.parseRouteApiErrorMessage(plan.status, text));
    }

    return response.json();
}

function applyShowRouteComparisonSuccessFromPlan(successApply) {
    if (!successApply || !successApply.shouldApply) {
        if (successApply && successApply.errorLogMessage) {
            console.error(successApply.errorLogMessage, ...(successApply.errorLogArgs || []));
        }
        if (successApply && successApply.errorStatusMessage) {
            showStatus(successApply.errorStatusMessage, 'error');
        }
        return;
    }
    applyRouteComparisonModalFromPlan(successApply.domApplyPlan);
    showStatus(successApply.successStatusMessage, 'success');
}

async function showRouteComparison() {
    const RS = _routeSelection();
    const input = collectShowRouteComparisonInput();
    const orch = RS.buildShowRouteComparisonOrchestrationPlan(input.routeCount);
    if (!applyShowRouteComparisonEntryFromPlan(
        RS.buildShowRouteComparisonEntryApplyPlan(orch, input)
    )) return;

    try {
        const requestOrch = RS.buildShowRouteComparisonRequestOrchestrationPlan(input.routeOptions);
        console.log(orch.routesLogPrefix, requestOrch.routesForComparison);

        const fetchPlan = requestOrch.fetchPlan;
        const response = await fetch(fetchPlan.apiPath, {
            method: fetchPlan.method,
            headers: fetchPlan.headers,
            body: JSON.stringify(fetchPlan.body),
        });

        const data = await applyShowRouteComparisonFetchHttpResponse(response);
        const successPlan = RS.buildShowRouteComparisonApiResultExecutePlan(data, {
            currencySymbol: input.currencySymbol,
            distUnit: input.distUnit,
            convertDistance: input.convertDistance,
        });

        if (successPlan.responseLogPrefix) console.log(successPlan.responseLogPrefix, data);

        applyShowRouteComparisonSuccessFromPlan(
            RS.buildShowRouteComparisonSuccessApplyPlan(successPlan)
        );
    } catch (error) {
        const errExecute = RS.buildShowRouteComparisonErrorExecutePlan(error);
        showStatus(errExecute.statusMessage, 'error');
        console.error(errExecute.errorLogPrefix, ...(errExecute.logArgs || []));
    }
}

function applyRouteOverviewFromPlan(apply) {
    if (!apply || !apply.shouldApply) {
        if (apply && apply.statusMessage) showStatus(apply.statusMessage, apply.statusType);
        if (apply && apply.errorLogMessage) console.error(apply.errorLogMessage);
        return;
    }

    try {
        MapLibreHelpers.fitMapBounds(map, apply.routePath, apply.fitBounds);
        showStatus(apply.statusMessage, apply.statusType);
        if (apply.successLogPrefix) {
            console.log(apply.successLogPrefix, apply.routePath.length, 'points');
        }
    } catch (error) {
        showStatus((apply.catchErrorStatusPrefix || '') + error.message, 'error');
        if (apply.catchErrorLogPrefix) console.error(apply.catchErrorLogPrefix, error);
    }
}

/**
 * overviewRoute function
 * @function overviewRoute
 * @returns {*} Return value description
 */
function overviewRoute() {
    const RS = _routeSelection();
    const orch = RS.buildRouteOverviewOrchestrationPlan(window.lastCalculatedRoute, decodePolyline);
    applyRouteOverviewFromPlan(RS.buildRouteOverviewApplyPlan(orch));
}

function collectStartNavigationFromPreviewInput() {
    return {
        lastCalculatedRoute: window.lastCalculatedRoute,
        noRouteMessage: 'No route available',
        syncFromSelection: true,
        selectedRouteIndex,
    };
}

function applyStartNavigationFromPreviewFromPlan(apply) {
    if (!apply || !apply.shouldApply) {
        if (apply && apply.errorStatusMessage) showStatus(apply.errorStatusMessage, 'error');
        return;
    }

    if (apply.syncFromSelection) {
        syncLastCalculatedRouteFromSelection(apply.selectedRouteIndex);
    }

    apply.hideStartNavButtonIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
    });

    startTurnByTurnNavigation(window.lastCalculatedRoute);

    if (apply.collapseBottomSheet) collapseBottomSheet();
}

/**
 * startNavigationFromPreview function
 * @function startNavigationFromPreview
 * @returns {*} Return value description
 */
function startNavigationFromPreview() {
    const input = collectStartNavigationFromPreviewInput();
    const orch = _routeSelection().buildStartNavigationOrchestrationPlan(
        input.lastCalculatedRoute,
        input
    );
    applyStartNavigationFromPreviewFromPlan(orch.apply);
}

// ===== PARKING INTEGRATION FEATURE =====
// Orchestration lives in static/js/app/parking-orchestration.js (bound at file end).

function getParkingOrchestrationRuntime() {
    return {
        multimodalParking: () => _multimodalParking(),
        routingRequest: () => _routingRequest(),
        getMap: () => map,
        getRouteOptionsLength: () => (routeOptions && routeOptions.length) || 0,
        getSelectedRouteIndex: () => selectedRouteIndex,
        getRouteOptionAt: (idx) => (routeOptions && routeOptions[idx]) || null,
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
        getAllRouteLayers: () => allRouteLayers,
        getVoiceAnnouncementsEnabled: () => voiceAnnouncementsEnabled,
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
        getVoiceRecognition: () => voiceRecognition,
        getIsListening: () => isListening,
        setIsListening: (v) => { isListening = !!v; },
        setVoiceFinalTranscript: (v) => { _voiceFinalTranscript = v; },
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
            case 'isTrackingActive': return isTrackingActive;
            case 'gpsWatchId': return gpsWatchId;
            case 'currentUserMarker': return currentUserMarker;
            case 'trackingHistory': return trackingHistory;
            case 'zoomAndFollowEnabled': return zoomAndFollowEnabled;
            case 'mapFollowingActive': return mapFollowingActive;
            case 'driverPerspectiveEnabled': return driverPerspectiveEnabled;
            case '_snapBlendWeightState': return _snapBlendWeightState;
            case '_smoothDisplayLat': return _smoothDisplayLat;
            case '_smoothDisplayLon': return _smoothDisplayLon;
            case 'currentSpeedLimitMph': return currentSpeedLimitMph;
            case 'lastSpeedLimitRegion': return lastSpeedLimitRegion;
            case 'lastDetectedRoadType': return lastDetectedRoadType;
            case '_lastActiveManeuverIdx': return _lastActiveManeuverIdx;
            case '_lastGoodRawPickMph': return _lastGoodRawPickMph;
            case '_consecutiveDisplacementMoves': return _consecutiveDisplacementMoves;
            case '_smoothedSpeedMph': return _smoothedSpeedMph;
            case '_smoothedSpeedInitAt': return _smoothedSpeedInitAt;
            case 'announcedTurnThresholds': return announcedTurnThresholds;
            case 'announcedExitThresholds': return announcedExitThresholds;
            case 'announcedKeepThresholds': return announcedKeepThresholds;
            case '_voiceAnnouncedForManeuverIndex': return _voiceAnnouncedForManeuverIndex;
            case '_voiceAnnouncedCategory': return _voiceAnnouncedCategory;
            case '_lastLaneVoiceKey': return _lastLaneVoiceKey;
            case 'lastDestinationAnnouncementDistance': return lastDestinationAnnouncementDistance;
            case '_navigationArrivalTriggered': return _navigationArrivalTriggered;
            case '_navigationArrivalZoneSince': return _navigationArrivalZoneSince;
            case '_navTraveledMeters': return _navTraveledMeters;
            case '_navOdometerLastGeo': return _navOdometerLastGeo;
            case '_navStartedAt': return _navStartedAt;
            case 'lastETAAnnouncementTime': return lastETAAnnouncementTime;
            case 'lastAnnouncedETA': return lastAnnouncedETA;
            case 'initialETAMovementRetries': return initialETAMovementRetries;
            case 'initialETAAnnouncementTimeoutId': return initialETAAnnouncementTimeoutId;
            case 'lastNavTrafficFetchAt': return lastNavTrafficFetchAt;
            case 'routeJoinConfirmedForDeviation': return routeJoinConfirmedForDeviation;
            case 'deviationStartTimeCheck': return deviationStartTimeCheck;
            case 'deviationOffRouteStreak': return deviationOffRouteStreak;
            case 'rerouteAttemptCount': return rerouteAttemptCount;
            case 'postRerouteGraceUntil': return postRerouteGraceUntil;
            case 'lastRerouteTime': return lastRerouteTime;
            case 'lastRerouteAttemptTime': return lastRerouteAttemptTime;
            case 'rerouteInProgress': return rerouteInProgress;
            case 'lastRerouteDeviation': return lastRerouteDeviation;
            case 'rerouteFailureRetryTimer': return rerouteFailureRetryTimer;
            case 'rerouteFailureRetryCount': return rerouteFailureRetryCount;
            case '_preferPrimaryRouteOnNextNavUpdate': return _preferPrimaryRouteOnNextNavUpdate;
            case 'lastTurnDetectRouteVertexIndex': return lastTurnDetectRouteVertexIndex;
            case 'voiceAnnouncementsEnabled': return voiceAnnouncementsEnabled;
            case 'voiceFrequencyMode': return voiceFrequencyMode;
            case 'speedWidgetEnabled': return speedWidgetEnabled;
            case 'lastRoadNameFetch': return lastRoadNameFetch;
            case 'lastRoadNamePosition': return lastRoadNamePosition;
            case 'currentRoadDisplayName': return currentRoadDisplayName;
            case 'userHasStartedMoving': return userHasStartedMoving;
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
            case 'isTrackingActive': isTrackingActive = val; break;
            case 'gpsWatchId': gpsWatchId = val; break;
            case 'currentUserMarker': currentUserMarker = val; break;
            case 'trackingHistory': trackingHistory = val; break;
            case 'zoomAndFollowEnabled': zoomAndFollowEnabled = val; break;
            case 'mapFollowingActive': mapFollowingActive = val; break;
            case 'driverPerspectiveEnabled': driverPerspectiveEnabled = val; break;
            case '_snapBlendWeightState': _snapBlendWeightState = val; break;
            case '_smoothDisplayLat': _smoothDisplayLat = val; break;
            case '_smoothDisplayLon': _smoothDisplayLon = val; break;
            case 'currentSpeedLimitMph': currentSpeedLimitMph = val; break;
            case 'lastSpeedLimitRegion': lastSpeedLimitRegion = val; break;
            case 'lastDetectedRoadType': lastDetectedRoadType = val; break;
            case '_lastActiveManeuverIdx': _lastActiveManeuverIdx = val; break;
            case '_lastGoodRawPickMph': _lastGoodRawPickMph = val; break;
            case '_consecutiveDisplacementMoves': _consecutiveDisplacementMoves = val; break;
            case '_smoothedSpeedMph': _smoothedSpeedMph = val; break;
            case '_smoothedSpeedInitAt': _smoothedSpeedInitAt = val; break;
            case 'announcedTurnThresholds': announcedTurnThresholds = val; break;
            case 'announcedExitThresholds': announcedExitThresholds = val; break;
            case 'announcedKeepThresholds': announcedKeepThresholds = val; break;
            case '_voiceAnnouncedForManeuverIndex': _voiceAnnouncedForManeuverIndex = val; break;
            case '_voiceAnnouncedCategory': _voiceAnnouncedCategory = val; break;
            case '_lastLaneVoiceKey': _lastLaneVoiceKey = val; break;
            case 'lastDestinationAnnouncementDistance': lastDestinationAnnouncementDistance = val; break;
            case '_navigationArrivalTriggered': _navigationArrivalTriggered = val; break;
            case '_navigationArrivalZoneSince': _navigationArrivalZoneSince = val; break;
            case '_navTraveledMeters': _navTraveledMeters = val; break;
            case '_navOdometerLastGeo': _navOdometerLastGeo = val; break;
            case '_navStartedAt': _navStartedAt = val; break;
            case 'lastETAAnnouncementTime': lastETAAnnouncementTime = val; break;
            case 'lastAnnouncedETA': lastAnnouncedETA = val; break;
            case 'initialETAMovementRetries': initialETAMovementRetries = val; break;
            case 'initialETAAnnouncementTimeoutId': initialETAAnnouncementTimeoutId = val; break;
            case 'lastNavTrafficFetchAt': lastNavTrafficFetchAt = val; break;
            case 'routeJoinConfirmedForDeviation': routeJoinConfirmedForDeviation = val; break;
            case 'deviationStartTimeCheck': deviationStartTimeCheck = val; break;
            case 'deviationOffRouteStreak': deviationOffRouteStreak = val; break;
            case 'rerouteAttemptCount': rerouteAttemptCount = val; break;
            case 'postRerouteGraceUntil': postRerouteGraceUntil = val; break;
            case 'lastRerouteTime': lastRerouteTime = val; break;
            case 'lastRerouteAttemptTime': lastRerouteAttemptTime = val; break;
            case 'rerouteInProgress': rerouteInProgress = val; break;
            case 'lastRerouteDeviation': lastRerouteDeviation = val; break;
            case 'rerouteFailureRetryTimer': rerouteFailureRetryTimer = val; break;
            case 'rerouteFailureRetryCount': rerouteFailureRetryCount = val; break;
            case '_preferPrimaryRouteOnNextNavUpdate': _preferPrimaryRouteOnNextNavUpdate = val; break;
            case 'lastTurnDetectRouteVertexIndex': lastTurnDetectRouteVertexIndex = val; break;
            case 'voiceAnnouncementsEnabled': voiceAnnouncementsEnabled = val; break;
            case 'voiceFrequencyMode': voiceFrequencyMode = val; break;
            case 'speedWidgetEnabled': speedWidgetEnabled = val; break;
            case 'lastRoadNameFetch': lastRoadNameFetch = val; break;
            case 'lastRoadNamePosition': lastRoadNamePosition = val; break;
            case 'currentRoadDisplayName': currentRoadDisplayName = val; break;
            case 'userHasStartedMoving': userHasStartedMoving = val; break;
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
            TURN_ANNOUNCEMENT_DISTANCES,
            EXIT_ANNOUNCEMENT_DISTANCES,
            KEEP_ANNOUNCEMENT_DISTANCES,
            DESTINATION_ANNOUNCEMENT_DISTANCES,
            ETA_CHANGE_THRESHOLD_MS,
            ETA_MIN_INTERVAL_MS,
            HAZARD_WARNING_DISTANCE,
        },
        getIsOffline: () => VoyagrOfflineNavigationOrchestration.getIsOffline(),
        call: {
            resolveGpsRouteSnapForTick,
            smoothGpsSpeedMph,
            updateRecenterButtonVisibility,
            updateTurnWidgetFromPosition,
            fetchRoadNameThrottled,
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
            getCurrentRoadType,
            createVehicleMarker,
            calculateDistanceMeters,
            convertDistance,
            getDistanceUnit,
            updateSpeedWidgetVisibility,
            updateRoadReportFabVisibility,
            hasUserStartedMoving,
            getSpeedLimitFetchState: () => VoyagrSpeedWidgetOrchestration.getSpeedLimitFetchState(),
        },
    };
}

function startGPSTracking() { VoyagrGpsOrchestration.startGPSTracking(); }
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

/**
 * Collect voice preference values from settings form controls.
 * @returns {Object}
 */
function collectVoicePreferencesDomInput() {
    return {
        turnDistance1: document.getElementById('voiceTurnDistance1')?.value,
        turnDistance2: document.getElementById('voiceTurnDistance2')?.value,
        turnDistance3: document.getElementById('voiceTurnDistance3')?.value,
        hazardDistance: document.getElementById('voiceHazardDistance')?.value,
        voiceFrequencyMode: document.getElementById('voiceFrequencyMode')?.value,
        announcementsEnabled: typeof voiceAnnouncementsEnabled === 'boolean'
            ? voiceAnnouncementsEnabled
            : (localStorage.getItem('voiceAnnouncementsEnabled') === 'true'),
    };
}

function collectVoicePreferencesFormState() {
    const VA = _voiceAnnouncements();
    return VA.buildVoicePreferencesCollectPlan(
        VA.buildCollectVoicePreferencesDomInputPlan(collectVoicePreferencesDomInput())
    );
}

/**
 * Apply voice preference runtime globals from a pure runtime apply plan.
 * @param {Object} plan
 */
function applyVoicePreferencesRuntimeFromPlan(plan) {
    if (!plan) return;
    TURN_ANNOUNCEMENT_DISTANCES.length = 0;
    TURN_ANNOUNCEMENT_DISTANCES.push(...plan.turnAnnouncementDistances);
    DESTINATION_ANNOUNCEMENT_DISTANCES.length = 0;
    DESTINATION_ANNOUNCEMENT_DISTANCES.push(...plan.destinationAnnouncementDistances);
    HAZARD_WARNING_DISTANCE = plan.hazardWarningDistance;
    voiceAnnouncementsEnabled = plan.voiceAnnouncementsEnabled;
    voiceFrequencyMode = plan.voiceFrequencyMode;
    VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS = plan.voiceAnnouncementMinIntervalMs;
}

function applySaveVoicePreferencesFromPlan(execute) {
    if (!execute || !execute.shouldSave) return;

    (execute.storagePatches || []).forEach(({ key, value }) => {
        localStorage.setItem(key, value);
    });
    if (execute.applyRuntime) {
        applyVoicePreferencesRuntimeFromPlan(execute.runtimePlan);
    }

    console.log(execute.logMessage, execute.prefs);
    showStatus(execute.successStatusMessage, execute.successStatusType);
}

/**
 * saveVoicePreferences function
 * @function saveVoicePreferences
 * @returns {*} Return value description
 */
function saveVoicePreferences() {
    const VA = _voiceAnnouncements();
    applySaveVoicePreferencesFromPlan(
        VA.buildSaveVoicePreferencesEntryOrchestrationPlan(
            collectVoicePreferencesFormState()
        ).execute
    );
}

function applyLoadVoicePreferencesSavedFromPlan(entry) {
    const execute = entry.execute;
    if (!execute || !execute.shouldApply) return;

    applyDomSelectsFromPlan(execute.domPlan.selects);
    _toggleUI().applyLabeledToggleButton(
        document.getElementById(execute.domPlan.labeledToggle.id),
        execute.domPlan.labeledToggle.enabled
    );
    applyVoicePreferencesRuntimeFromPlan(execute.runtimePlan);
    console.log(entry.orch.loadedLogMessage, execute.prefs);
}

function applyLoadVoicePreferencesDefaultsFromPlan(entry) {
    const defaults = entry.defaults;
    if (!defaults || !defaults.shouldApply) return;

    const toggleButton = document.getElementById(defaults.domPlan.labeledToggle.id);
    if (toggleButton) {
        _toggleUI().applyLabeledToggleButton(toggleButton, defaults.domPlan.labeledToggle.enabled);
        if (defaults.setAnnouncementsEnabledFromToggle) {
            voiceAnnouncementsEnabled = defaults.domPlan.labeledToggle.enabled;
        }
    }
    console.log(entry.orch.defaultsLogMessage);
}

/**
 * loadVoicePreferences function
 * @function loadVoicePreferences
 * @returns {*} Return value description
 */
function loadVoicePreferences() {
    const VA = _voiceAnnouncements();
    const orch = VA.buildLoadVoicePreferencesOrchestrationPlan();
    try {
        const saved = localStorage.getItem(orch.storageKey);
        if (saved) {
            const prefs = JSON.parse(saved);
            applyLoadVoicePreferencesSavedFromPlan(
                VA.buildLoadVoicePreferencesSavedEntryOrchestrationPlan(prefs)
            );
            return;
        }

        applyLoadVoicePreferencesDefaultsFromPlan(
            VA.buildLoadVoicePreferencesDefaultsEntryOrchestrationPlan()
        );
    } catch (e) {
        console.log(orch.errorLogPrefix, e);
    }
}


function applyToggleVoiceAnnouncementsFromPlan(execute, button) {
    if (!execute || !execute.shouldApply || !button) return;

    _toggleUI().applyLabeledToggleButton(button, execute.toggle.enabled);
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (execute.updateRuntimeFlag) voiceAnnouncementsEnabled = execute.enabled;
    if (execute.saveVoicePreferences) saveVoicePreferences();
    showStatus(execute.statusMessage, execute.statusType);
    if (execute.saveAllSettings) saveAllSettings();
}

/**
 * toggleVoiceAnnouncements function
 * @function toggleVoiceAnnouncements
 * @returns {*} Return value description
 */
function toggleVoiceAnnouncements() {
    const VA = _voiceAnnouncements();
    const button = document.getElementById(VA.VOICE_PREFS_ELEMENT_IDS.announcementsEnabled);
    if (!button) return;

    applyToggleVoiceAnnouncementsFromPlan(
        VA.buildToggleVoiceAnnouncementsEntryOrchestrationPlan(
            button.classList.contains('active')
        ).execute,
        button
    );
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
let lastLaneGuidanceManeuver = '';
let lastLaneGuidancePosition = null;
let _lastLaneVoiceKey = '';

// Short client-side cache of lane-guidance responses so the overlay shows instantly when
// revisiting the same approach and so a slow/unavailable Overpass doesn't blank it out.
const _laneGuidanceCache = new Map();        // key -> { data, ts, fallback }

function _pruneLaneGuidanceCache() {
    const LG = _laneGuidance();
    const now = Date.now();
    for (const [k, v] of _laneGuidanceCache) {
        if (now - v.ts > LG.LANE_GUIDANCE_CACHE_TTL_MS) _laneGuidanceCache.delete(k);
    }
    while (_laneGuidanceCache.size > LG.LANE_GUIDANCE_CACHE_MAX_ENTRIES) {
        const firstKey = _laneGuidanceCache.keys().next().value;
        _laneGuidanceCache.delete(firstKey);
    }
}

function updateLaneGuidance(lat, lon, heading, maneuver, roundaboutExitCount) {
    const LG = _laneGuidance();
    roundaboutExitCount = roundaboutExitCount || 0;

    const tick = LG.buildLaneGuidanceFetchTickPlan({
        lat,
        lon,
        heading,
        maneuver,
        roundaboutExitCount,
        now: Date.now(),
        lastFetch: lastLaneGuidanceFetch,
        lastPosition: lastLaneGuidancePosition,
        lastManeuver: lastLaneGuidanceManeuver,
        routeSteps: currentRouteSteps,
        currentStepIndex,
        routePolyline,
        roadType: getCurrentRoadType() || 'unknown',
        calculateDistance: calculateDistanceMeters,
        cacheLookup: (key) => _laneGuidanceCache.get(key),
    });

    if (tick.action === 'skip') return;

    const apply = LG.buildLaneGuidanceFetchStateApplyPlan(tick);
    if (apply.action === 'skip') return;

    lastLaneGuidanceFetch = apply.statePatch.lastFetch;
    lastLaneGuidanceManeuver = apply.statePatch.lastManeuver;
    lastLaneGuidancePosition = apply.statePatch.lastPosition;

    if (apply.kind === 'render-cached') {
        renderLaneGuidanceUI(apply.renderPayload);
        return;
    }

    const fetchPlan = apply.fetch;
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), fetchPlan.timeoutMs) : null;

    const useFallback = (reason) => {
        const outcome = LG.buildLaneGuidanceFetchOutcomePlan({
            apiSuccess: false,
            errorReason: reason,
            maneuver: fetchPlan.maneuver,
            distToManeuver: fetchPlan.distToManeuver,
            roundaboutExitCount: fetchPlan.roundaboutExitCount,
            roadType: fetchPlan.roadType,
        });
        _laneGuidanceCache.set(fetchPlan.cacheKey, outcome.cacheEntry);
        _pruneLaneGuidanceCache();
        if (outcome.warnLine) console.warn(outcome.warnLine);
        renderLaneGuidanceUI(outcome.renderData);
    };

    fetch(fetchPlan.url, controller ? { signal: controller.signal } : undefined)
        .then((response) => response.json())
        .then((data) => {
            if (timeoutId) clearTimeout(timeoutId);
            const outcome = LG.buildLaneGuidanceFetchOutcomePlan({
                apiSuccess: !!(data && data.success),
                apiData: data,
                maneuver: fetchPlan.maneuver,
                distToManeuver: fetchPlan.distToManeuver,
                roundaboutExitCount: fetchPlan.roundaboutExitCount,
                roadType: fetchPlan.roadType,
                errorReason: 'no data',
            });
            _laneGuidanceCache.set(fetchPlan.cacheKey, outcome.cacheEntry);
            _pruneLaneGuidanceCache();
            if (outcome.warnLine) console.warn(outcome.warnLine);
            renderLaneGuidanceUI(outcome.renderData);
        })
        .catch((error) => {
            if (timeoutId) clearTimeout(timeoutId);
            useFallback((error && error.name === 'AbortError') ? 'timeout' : (error && error.message) || 'error');
        });
}

function renderLaneGuidanceUI(data) {
    const display = document.getElementById('laneGuidanceDisplay');
    const visual = document.getElementById('laneVisual');
    const text = document.getElementById('laneGuidanceText');

    if (!display || !visual || !text) return;

    const LG = _laneGuidance();
    const domPlan = LG.buildLaneGuidanceDomApplyPlan(data, _lastLaneVoiceKey);
    const apply = LG.buildLaneGuidanceDomStateApplyPlan(domPlan, {
        voiceEnabled: voiceAnnouncementsEnabled,
    });

    if (apply.action === 'hide') {
        display.classList.remove('show');
        return;
    }

    const badgeEl = document.getElementById('laneGuidanceBadge');
    if (badgeEl && apply.badge) {
        badgeEl.textContent = apply.badge.text;
        badgeEl.style.display = apply.badge.visible ? 'inline-block' : 'none';
    }

    visual.innerHTML = '';
    for (const ind of apply.indicators) {
        const lane = document.createElement('div');
        lane.className = ind.className;
        lane.innerHTML = ind.innerHtml;
        visual.appendChild(lane);
    }

    display.className = apply.displayClassName;
    if (apply.urgencyClass) display.classList.add(apply.urgencyClass);
    text.textContent = apply.guidanceText;

    if (apply.voice) {
        speakMessage(apply.voice.message, apply.voice.priority);
        _lastLaneVoiceKey = apply.voice.announceKey;
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
let _lastActiveManeuverIdx = -1;
let _smoothedSpeedMph = 0;
let _smoothedSpeedInitAt = 0;
let _lastGoodRawPickMph = 0;
let _consecutiveDisplacementMoves = 0;

/** Unit-tested speed/GPS helpers (modules/navigation/speed-gps.js). */
function _speedGps() { return VoyagrModules.speedGps(); }

/** Unit-tested hazard alert helpers (modules/navigation/hazard-alerts.js). */
function _hazardAlerts() { return VoyagrModules.hazardAlerts(); }

/** Unit-tested offline/resume navigation banner helpers (modules/navigation/offline-navigation.js). */
function _offlineNavigation() { return VoyagrModules.offlineNavigation(); }

/** Unit-tested ML prediction list HTML (modules/navigation/ml-predictions.js). */
function _mlPredictions() { return VoyagrModules.mlPredictions(); }

/** Unit-tested Porcupine wake-word UI plans (modules/navigation/porcupine-wake.js). */
function _porcupineWake() { return VoyagrModules.porcupineWake(); }

/** Unit-tested battery-saving mode plans (modules/navigation/battery-saving.js). */
function _batterySaving() { return VoyagrModules.batterySaving(); }

/** Unit-tested search autocomplete row HTML (modules/navigation/search-autocomplete.js). */
function _searchAutocomplete() { return VoyagrModules.searchAutocomplete(); }

/** Unit-tested device environment hint copy and banner HTML (modules/ui/device-environment.js). */
function _deviceEnvironment() { return VoyagrModules.deviceEnvironment(); }

/** Unit-tested route calculation progress bar HTML (modules/navigation/route-progress.js). */
function _routeProgress() { return VoyagrModules.routeProgress(); }
function _settingsSnapshot() { return VoyagrModules.settingsSnapshot(); }
function _appState() { return VoyagrModules.appState(); }
function _gestureControl() { return VoyagrModules.gestureControl(); }
function _legacyPrefsRestore() { return VoyagrModules.legacyPrefsRestore(); }
function _smartZoom() { return VoyagrModules.smartZoom(); }
function _phase3Features() { return VoyagrModules.phase3Features(); }

/** Unit-tested map preview marker HTML (modules/map/preview-marker.js). */
function _previewMarker() { return VoyagrModules.previewMarker(); }

/** Unit-tested favorites list HTML (modules/navigation/favorites.js). */
function _favorites() { return VoyagrModules.favorites(); }

/** Unit-tested road name bar throttle/display helpers (modules/navigation/road-name-display.js). */
function _roadNameDisplay() { return VoyagrModules.roadNameDisplay(); }
function _roadReport() { return VoyagrModules.roadReport(); }

/** Unit-tested CAZ zones settings panel HTML (modules/navigation/caz-info.js). */
function _cazInfo() { return VoyagrModules.cazInfo(); }

/** Unit-tested vehicle marker SVG/popup HTML (modules/map/vehicle-marker.js). */
function _vehicleMarker() { return VoyagrModules.vehicleMarker(); }

/** Unit-tested OSM map layer marker HTML (modules/map/osm-map-icons.js). */
function _osmMapIcons() { return VoyagrModules.osmMapIcons(); }

/** Unit-tested navigation map control icons (modules/map/map-controls.js). */
function _mapControls() { return VoyagrModules.mapControls(); }
function _mapLayerToggles() { return VoyagrModules.mapLayerToggles(); }
function _mapOverlayToggles() { return VoyagrModules.mapOverlayToggles(); }
function _mapView3D() { return VoyagrModules.mapView3D(); }
function _mapTheme() { return VoyagrModules.mapTheme(); }

/** Unit-tested route geometry helpers (modules/navigation/route-geometry.js). */
function _routeGeometry() { return VoyagrModules.routeGeometry(); }

/** Unit-tested ETA helpers (modules/navigation/eta.js). */
function _eta() { return VoyagrModules.eta(); }
function _liveDataRefresh() { return VoyagrModules.liveDataRefresh(); }

/** Unit-tested turn-by-turn instruction helpers (modules/navigation/turn-instructions.js). */
function _turnInstructions() { return VoyagrModules.turnInstructions(); }

/** Unit-tested voice announcement helpers (modules/navigation/voice-announcements.js). */
function _voiceAnnouncements() { return VoyagrModules.voiceAnnouncements(); }

/** Unit-tested route selection and comparison helpers (modules/navigation/route-selection.js). */
function _routeSelection() { return VoyagrModules.routeSelection(); }

/** Unit-tested camera pitch / follow-padding helpers (modules/navigation/camera-pitch.js). */
function _cameraPitch() { return VoyagrModules.cameraPitch(); }

/** Unit-tested reroute decision helpers (modules/navigation/reroute-decision.js). */
function _rerouteDecision() { return VoyagrModules.rerouteDecision(); }

/** Unit-tested movement-detection helpers (modules/navigation/movement-detection.js). */
function _movementDetection() { return VoyagrModules.movementDetection(); }

/** Unit-tested DOM event helpers (modules/ui/dom-helpers.js). */
function _domHelpers() { return VoyagrModules.domHelpers(); }

/** Unit-tested geocoding / location parse helpers (modules/navigation/geocoding-locations.js). */
function _geocodingLocations() { return VoyagrModules.geocodingLocations(); }
function _googlePlusCodesPrefs() { return VoyagrModules.googlePlusCodesPrefs(); }

/** Unit-tested units / currency / temperature helpers (modules/navigation/units.js). */
function _units() { return VoyagrModules.units(); }

/** Unit-tested route preference helpers (modules/navigation/route-prefs.js). */
function _routePrefs() { return VoyagrModules.routePrefs(); }

/** Unit-tested trip history helpers (modules/navigation/trip-history.js). */
function _tripHistory() { return VoyagrModules.tripHistory(); }

/** Unit-tested toggle button UI helpers (modules/ui/toggle-ui.js). */
function _toggleUI() { return VoyagrModules.toggleUI(); }

/** Unit-tested theme helpers (modules/ui/theme.js). */
function _theme() { return VoyagrModules.theme(); }

/** Unit-tested HTML escape helper (modules/html.js). */
function _html() { return VoyagrModules.html(); }
function escapeHtml(s) {
    return _html().escapeHtml(s);
}

/** Unit-tested polyline encode/decode (modules/navigation/polyline-codec.js). */
function _polylineCodec() { return VoyagrModules.polylineCodec(); }

/** Unit-tested waypoints / multidrop helpers (modules/navigation/waypoints.js). */
function _waypoints() { return VoyagrModules.waypoints(); }

/** Unit-tested recent-destinations storage (modules/navigation/recent-destinations.js). */
function _recentDestinations() { return VoyagrModules.recentDestinations(); }

/** Unit-tested route traffic flow sampling (modules/navigation/route-traffic-flow.js). */
function _routeTrafficFlow() { return VoyagrModules.routeTrafficFlow(); }

/** Unit-tested traffic-change reroute helpers (modules/navigation/traffic-change.js). */
function _trafficChange() { return VoyagrModules.trafficChange(); }

/** Unit-tested route sharing helpers (modules/navigation/route-sharing.js). */
function _routeSharing() { return VoyagrModules.routeSharing(); }

/** Unit-tested weather map layer helpers (modules/map/weather-layer.js). */
function _weatherLayer() { return VoyagrModules.weatherLayer(); }

/** Unit-tested navigation destination resolution (modules/navigation/navigation-destination.js). */
function _navigationDestination() { return VoyagrModules.navigationDestination(); }

/** Unit-tested multimodal parking helpers (modules/navigation/multimodal-parking.js). */
function _multimodalParking() { return VoyagrModules.multimodalParking(); }

/** Unit-tested lane guidance helpers (modules/navigation/lane-guidance.js). */
function _laneGuidance() { return VoyagrModules.laneGuidance(); }

/** Unit-tested POI search helpers (modules/navigation/poi-search.js). */
function _poiSearch() { return VoyagrModules.poiSearch(); }

/** Unit-tested routing request builders (modules/navigation/routing-request.js). */
function _routingRequest() { return VoyagrModules.routingRequest(); }

function applyZoomFollowButtonUi(btn, enabled) {
    const plan = _mapControls().buildZoomFollowButtonUiExecutePlan(enabled);
    if (!btn || !plan.shouldApply) return;
    btn.classList.toggle('active', plan.active);
    btn.style.background = plan.background;
    btn.innerHTML = plan.innerHtml;
}

function applyJourneyOverviewButtonUi(btn, overviewActive) {
    const plan = _mapControls().buildJourneyOverviewButtonUiExecutePlan(overviewActive);
    if (!btn || !plan.shouldApply) return;
    btn.style.background = plan.background;
    btn.innerHTML = plan.innerHtml;
    btn.title = plan.title;
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

// ===== SPEED WIDGET ORCHESTRATION =====
// Orchestration lives in static/js/app/speed-widget-orchestration.js (bound at file end).

function getSpeedWidgetOrchestrationRuntime() {
    return {
        speedGps: () => _speedGps(),
        speedLimitWidget: () => _speedLimitWidget(),
        routeGeometry: () => _routeGeometry(),
        toggleUI: () => _toggleUI(),
        getSpeedUnit: () => speedUnit,
        getIsTrackingActive: () => isTrackingActive,
        getRouteInProgress: () => routeInProgress,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getIsOffline: () => VoyagrOfflineNavigationOrchestration.getIsOffline(),
        g: (key) => {
            switch (key) {
            case 'speedWidgetEnabled': return speedWidgetEnabled;
            case 'currentGpsSpeedMph': return currentGpsSpeedMph;
            case 'currentGpsSpeedKmh': return currentGpsSpeedKmh;
            case 'currentSpeedLimitMph': return currentSpeedLimitMph;
            case 'lastDetectedRoadType': return lastDetectedRoadType;
            case 'lastSpeedLimitRegion': return lastSpeedLimitRegion;
            case '_smoothedSpeedMph': return _smoothedSpeedMph;
            case '_smoothedSpeedInitAt': return _smoothedSpeedInitAt;
            default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'speedWidgetEnabled': speedWidgetEnabled = val; break;
            case 'currentGpsSpeedMph': currentGpsSpeedMph = val; break;
            case 'currentGpsSpeedKmh': currentGpsSpeedKmh = val; break;
            case 'currentSpeedLimitMph': currentSpeedLimitMph = val; break;
            case 'lastDetectedRoadType': lastDetectedRoadType = val; break;
            case 'lastSpeedLimitRegion': lastSpeedLimitRegion = val; break;
            case '_smoothedSpeedMph': _smoothedSpeedMph = val; break;
            case '_smoothedSpeedInitAt': _smoothedSpeedInitAt = val; break;
            default: break;
            }
        },
        call: {
            getSpeedUnit,
            calculateDistanceMeters,
            cacheSpeedLimit,
            getCachedSpeedLimit,
            saveAllSettings,
        },
    };
}

function smoothGpsSpeedMph(rawMph) { return VoyagrSpeedWidgetOrchestration.smoothGpsSpeedMph(rawMph); }
function updateSpeedWidget(currentSpeedInMph, speedLimitInMph) {
    return VoyagrSpeedWidgetOrchestration.updateSpeedWidget(currentSpeedInMph, speedLimitInMph);
}
function updateSpeedWidgetVisibility() { VoyagrSpeedWidgetOrchestration.updateSpeedWidgetVisibility(); }
function getCurrentRoadType(maneuverIdxOverride, gpsSpeedMph) {
    return VoyagrSpeedWidgetOrchestration.getCurrentRoadType(maneuverIdxOverride, gpsSpeedMph);
}
function getManeuverStreetLabel(maneuver, preferCurrentRoad) {
    return VoyagrSpeedWidgetOrchestration.getManeuverStreetLabel(maneuver, preferCurrentRoad);
}
function normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph) {
    return VoyagrSpeedWidgetOrchestration.normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph);
}
function applySpeedLimitFetchOutcomeFromPlan(outcomeApply) {
    VoyagrSpeedWidgetOrchestration.applySpeedLimitFetchOutcomeFromPlan(outcomeApply);
}
function fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType, valhallaSpeedLimit, headingDeg) {
    return VoyagrSpeedWidgetOrchestration.fetchSpeedLimitThrottled(
        lat, lon, currentSpeedMph, roadType, valhallaSpeedLimit, headingDeg
    );
}
function applySpeedWidgetToggleUi() { VoyagrSpeedWidgetOrchestration.applySpeedWidgetToggleUi(); }
function toggleSpeedWidget() { VoyagrSpeedWidgetOrchestration.toggleSpeedWidget(); }
function toggleZoomAndFollow() {
    const MC = _mapControls();
    const orch = MC.buildToggleZoomAndFollowOrchestrationPlan({
        currentEnabled: zoomAndFollowEnabled,
    });
    zoomAndFollowEnabled = orch.nextEnabled;
    applyZoomFollowButtonUi(document.getElementById(orch.toggleButtonId), zoomAndFollowEnabled);
    localStorage.setItem(orch.storageKey, orch.storageValue);

    if (orch.action === 'enable') {
        const execute = MC.buildToggleZoomAndFollowEnabledExecutePlan({
            hasMap: !!map,
            currentLat,
            currentLon,
        });
        mapFollowingActive = execute.mapFollowingActive;
        showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage);
        if (execute.flyTo) {
            map.flyTo(execute.flyTo);
        }
    } else {
        const execute = MC.buildToggleZoomAndFollowDisabledExecutePlan();
        mapFollowingActive = execute.mapFollowingActive;
        showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage);
    }

    if (orch.updateRecenterVisibility) {
        updateRecenterButtonVisibility();
    }
}

/**
 * Snap GPS position to the active route polyline when navigation is in progress.
 * @param {number} lat
 * @param {number} lon
 * @returns {Object|null}
 */
function resolveGpsRouteSnapForTick(lat, lon) {
    const RG = _routeGeometry();
    const plan = RG.buildGpsRouteSnapTickPlan({
        lat,
        lon,
        routeInProgress,
        routePolyline,
        lastSnappedRouteIndex,
    });
    return plan.snapped;
}

/** Lat/lon for the vehicle icon (snapped to route during navigation). */
function getVehicleDisplayCoordinates() {
    const SG = _speedGps();
    return SG.buildVehicleDisplayCoordinatesPlan({
        lat: currentLat,
        lon: currentLon,
        routeInProgress,
        routePolyline,
        snapped: resolveGpsRouteSnapForTick(currentLat, currentLon),
        lastSnappedRouteIndex,
        prevSnapBlendWeightState: _snapBlendWeightState,
        smoothDisplayLat: _smoothDisplayLat,
        smoothDisplayLon: _smoothDisplayLon,
        useSmoothCoordsOnly: _smoothDisplayLat != null && _smoothDisplayLon != null,
        calculateBearing: (a, b, c, d) => _routeGeometry().bearing(a, b, c, d),
        blendHeadingsCircular: _routeGeometry().blendHeadingsCircular,
    });
}

function metersMapCenterFromVehicle() {
    if (!map || currentLat == null || currentLon == null) return 0;
    const center = map.getCenter();
    const vehicle = getVehicleDisplayCoordinates();
    return calculateDistanceMeters(vehicle.lat, vehicle.lon, center.lat, center.lng);
}

function shouldShowRecenterVehicleButton() {
    const MC = _mapControls();
    const plan = MC.buildShouldShowRecenterVehicleButtonPlan({
        hasMap: !!map,
        currentLat,
        currentLon,
        routeInProgress,
        isTrackingActive,
        journeyOverviewActive,
        zoomAndFollowEnabled,
        mapFollowingActive,
        distanceFromCenterM: metersMapCenterFromVehicle(),
        minDistanceM: MC.RECENTER_MIN_DISTANCE_M,
    });
    return plan.shouldShow;
}

function applyRecenterButtonVisibilityFromPlan(execute) {
    if (!execute || !execute.shouldUpdate) return;
    const btn = document.getElementById(execute.buttonId);
    if (btn) btn.style.display = execute.display;
}

function updateRecenterButtonVisibility() {
    applyRecenterButtonVisibilityFromPlan(
        _mapControls().buildRecenterButtonVisibilityExecutePlan(shouldShowRecenterVehicleButton())
    );
}

function recenterOnVehicle() {
    const MC = _mapControls();
    const { lat, lon } = getVehicleDisplayCoordinates();
    const preflight = MC.buildRecenterOnVehiclePreflightPlan({
        hasMap: !!map,
        currentLat,
        currentLon,
        displayLat: lat,
        displayLon: lon,
        journeyOverviewActive,
        routeInProgress,
    });
    if (!preflight.shouldRecenter) {
        showStatus(preflight.statusMessage, preflight.statusType);
        return;
    }

    if (preflight.exitJourneyOverview) {
        const exit = MC.buildRecenterJourneyOverviewExitPlan();
        journeyOverviewActive = exit.journeyOverviewActive;
        applyJourneyOverviewButtonUi(document.getElementById(exit.journeyBtnId), false);
        if (exit.clearSavedMapState) savedMapState = null;
    }

    if (preflight.routeInProgress) {
        mapFollowingActive = true;
        const speedMps = currentUserMarker && Number.isFinite(currentUserMarker.speed)
            ? currentUserMarker.speed
            : 0;
        const speedMph = speedMps * 2.23694;
        const followInput = MC.buildRecenterNavigationFollowInputPlan({
            lat,
            lon,
            speedMph,
            roadType: getCurrentRoadType(undefined, speedMph),
            heading: (currentUserMarker && Number.isFinite(currentUserMarker.heading))
                ? currentUserMarker.heading
                : map.getBearing(),
            mapBearing: map.getBearing(),
            shouldTilt: shouldTiltDrivingCamera(),
            usePitchedDrivingCamera: shouldUsePitchedDrivingCamera(),
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
        });
        const followCamera = _cameraPitch().buildNavigationFollowCameraPlan(
            Object.assign({}, followInput, {
                computeSmartZoom: (spd, dist, rt) => _routeGeometry().calculateSmartZoom(
                    spd, dist, rt, ZOOM_LEVELS, TURN_ZOOM_THRESHOLD
                ),
            })
        );
        const complete = MC.buildRecenterNavigationCompletePlan();

        if (complete.setLastFollowCenterGeo) {
            window.__voyagrLastFollowCenterGeo = { lat, lon };
        }
        if (complete.setLastFollowEaseAt) {
            window.__voyagrLastFollowEaseAt = Date.now();
        }
        if (followCamera.easeTo) {
            map.easeTo(followCamera.easeTo);
        }
        showStatus(complete.statusMessage, complete.statusType);
    } else {
        const tracking = MC.buildRecenterTrackingEasePlan({
            lat,
            lon,
            currentZoom: map.getZoom(),
        });
        mapFollowingActive = tracking.mapFollowingActive;
        map.easeTo(tracking.easeTo);
        showStatus(tracking.statusMessage, tracking.statusType);
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
    const MC = _mapControls();
    const preflight = MC.buildToggleJourneyOverviewPreflightPlan({
        routeInProgress,
        routePolylineLength: routePolyline ? routePolyline.length : 0,
        journeyOverviewActive,
    });
    if (!preflight.shouldToggle) {
        showStatus(preflight.statusMessage, preflight.statusType);
        return;
    }

    const btn = document.getElementById(preflight.journeyBtnId);

    if (!preflight.currentlyActive) {
        const activate = MC.buildToggleJourneyOverviewActivatePlan({
            mapCenter: map.getCenter(),
            mapZoom: map.getZoom(),
            useMultiRouteCoords: allRouteLayers.length > 0
                && routeOptions
                && routeOptions[0]
                && routeOptions[0].polyline,
            allRouteCoords: (routeOptions || []).flatMap((r) => r.polyline || []),
            routePolylineLength: routePolyline.length,
            routePolyline,
        });

        savedMapState = activate.saveMapState;
        mapFollowingActive = activate.mapFollowingActive;
        if (activate.fitBounds) {
            MapLibreHelpers.fitMapBounds(
                map,
                activate.fitBounds.coords,
                { padding: activate.fitBounds.padding }
            );
        }
        journeyOverviewActive = activate.journeyOverviewActive;
        applyJourneyOverviewButtonUi(btn, activate.overviewButtonActive);
        showStatus(activate.statusMessage, activate.statusType);
        console.log(activate.logMessage);
        if (activate.updateRecenterVisibility) updateRecenterButtonVisibility();
        return;
    }

    const deactivate = MC.buildToggleJourneyOverviewDeactivatePlan({
        zoomAndFollowEnabled,
        savedMapState,
    });
    journeyOverviewActive = deactivate.journeyOverviewActive;
    if (deactivate.restoreMapFollowing) {
        mapFollowingActive = true;
    }
    if (deactivate.flyTo) {
        map.flyTo(deactivate.flyTo);
    }
    if (deactivate.clearSavedMapState) {
        savedMapState = null;
    }
    applyJourneyOverviewButtonUi(btn, deactivate.overviewButtonActive);
    showStatus(deactivate.statusMessage, deactivate.statusType);
    console.log(deactivate.logMessage);
    if (deactivate.updateRecenterVisibility) updateRecenterButtonVisibility();
}

// ===== DISTANCE CALCULATION & TURN DETECTION =====
/**
 * Calculate distance between two coordinates in meters (Haversine formula).
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    return _routeGeometry().haversineDistanceMeters(lat1, lon1, lat2, lon2);
}

/**
 * Distance along the polyline from a snapped point (snapped onto segment i0) to
 * a target vertex, forward along the line only.
 * @param {Array} routePolyline - [lat, lon] polyline
 * @param {Object} snap - Result of snapToRoutePolyline (index, t, …)
 * @param {number} targetVertexIndex - Maneuver begin_shape_index (clamped to polyline)
 * @returns {number} Meters, >= 0
 */

/**
 * Map a Valhalla maneuver type to a turn-by-turn direction key, or null when it is not
 * an announceable maneuver (start / continue / straight / ramp-straight / stay-straight).
 * Shared by the advance "Then" maneuver (widget + voice). Kept in sync with the inline
 * mappings in detectUpcomingTurn / updateTurnWidgetFromPosition.
 */
function refineManeuverDirectionForRoute(type, direction, maneuver) {
    const roadClass = maneuver && (maneuver.road_class || _routeGeometry().inferRoadClassFromManeuver(maneuver));
    return _turnInstructions().refineManeuverDirection(type, direction, roadClass);
}

/** Widget instruction line — exit/keep/roundabout phrasing over raw engine text when clearer. */
function buildTurnDisplayInstruction(turnInfo) {
    if (!turnInfo) return 'Continue on current road';
    return _turnInstructions().buildTurnDisplayInstruction(
        turnInfo.direction,
        turnInfo.instruction,
        turnInfo.valhallaType,
        turnInfo.roundabout_exit_count
    );
}


/**
 * Find the first announceable maneuver AFTER the given step index, plus the along-route
 * gap (m) from that step to it. Used to surface the upcoming maneuver in advance.
 * @returns {{ direction, valhallaType, streetName, gapMeters, index, maneuver } | null}
 */
function getFollowingManeuver(currentIndex) {
    const TI = _turnInstructions();
    const RG = _routeGeometry();
    return TI.findFollowingManeuver(currentRouteSteps, currentIndex, routePolyline, {
        cumulativeDistanceBetweenVertices: RG.cumulativeDistanceBetweenVertices,
        getManeuverStreetLabel: getManeuverStreetLabel,
        resolveRoadClass: (step) => step.road_class || _routeGeometry().inferRoadClassFromManeuver(step),
    });
}

/** Valhalla stores roundabout exit count on enter and/or exit maneuver — merge for UI/lane hints. */
function effectiveRoundaboutExitCount(stepIndex) {
    return _turnInstructions().effectiveRoundaboutExitCountFromSteps(currentRouteSteps, stepIndex);
}

// ordinalEnglishExit / laneOrdinalEnglish / buildTurnLaneHintHtml live in
// modules/navigation/turn-instructions.js — call _turnInstructions() directly.

/**
 * detectUpcomingTurn function
 * @function detectUpcomingTurn
 * @param {*} userLat - Parameter description
 * @param {*} userLon - Parameter description
 * @returns {*} Return value description
 */
function detectUpcomingTurn(userLat, userLon) {
    const TI = _turnInstructions();
    const RG = _routeGeometry();
    const tick = TI.buildDetectUpcomingTurnTickPlan({
        routeInProgress,
        routePolyline,
        routeSteps: currentRouteSteps,
        userLat,
        userLon,
        lastTurnDetectRouteVertexIndex,
        snapToRoutePolyline: (lat, lon, poly, idx) => RG.snapToRoutePolyline(lat, lon, poly, idx),
        distanceAlongRouteToVertexMeters: RG.distanceAlongRouteToVertexMeters.bind(RG),
        bearing: RG.bearing.bind(RG),
        getManeuverStreetLabel,
        resolveRoadClass: (step) => step.road_class || RG.inferRoadClassFromManeuver(step),
        effectiveRoundaboutExitCountFromSteps: TI.effectiveRoundaboutExitCountFromSteps,
    });
    if (tick.action === 'skip') return null;

    const apply = TI.buildDetectUpcomingTurnStateApplyPlan(tick);
    if (apply.action === 'skip') return null;

    if (apply.statePatch.lastTurnDetectRouteVertexIndex != null) {
        lastTurnDetectRouteVertexIndex = apply.statePatch.lastTurnDetectRouteVertexIndex;
    }
    if (apply.statePatch.currentStepIndex != null) {
        currentStepIndex = apply.statePatch.currentStepIndex;
    }
    if (apply.persistRoute) schedulePersistRoute();
    if (apply.logLine) console.log(apply.logLine);

    return apply.turnInfo;
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
    const CP = _cameraPitch();
    const easePlan = CP.buildSmartZoomEasePlan({
        smartZoomEnabled,
        routeInProgress,
        speedMph,
        distanceToNextTurn,
        roadType,
        lastZoomLevel,
        userLat,
        userLon,
        hasMap: !!map,
        zoomAndFollowEnabled,
        mapFollowingActive,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        currentPitch: map && typeof map.getPitch === 'function' ? map.getPitch() : 0,
        currentBearing: map && typeof map.getBearing === 'function' ? map.getBearing() : 0,
        vehicleHeading: currentUserMarker && typeof currentUserMarker.heading === 'number'
            ? currentUserMarker.heading
            : null,
        usePitchedDrivingCamera: shouldUsePitchedDrivingCamera(),
        shouldTilt: shouldTiltDrivingCamera(),
        zoomAnimationDurationMs: ZOOM_ANIMATION_DURATION * 1000,
        turnZoomThreshold: TURN_ZOOM_THRESHOLD,
        computeSmartZoom: (spd, dist, rt) => _routeGeometry().calculateSmartZoom(
            spd, dist, rt, ZOOM_LEVELS, TURN_ZOOM_THRESHOLD
        ),
    });

    const apply = CP.buildSmartZoomApplyPlan(easePlan);
    if (apply.action !== 'apply') return;

    if (apply.easeTo && map) {
        map.easeTo(apply.easeTo);
    } else if (apply.setZoomOnly && map) {
        map.setZoom(apply.newZoomLevel);
    }

    lastZoomLevel = apply.newZoomLevel;
    lastTurnZoomApplied = apply.lastTurnZoomApplied;
    if (apply.logLine) console.log(apply.logLine);
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
    const SZ = _smartZoom();
    const TU = _toggleUI();
    const collected = SZ.buildToggleSmartZoomCollectPlan({ currentlyEnabled: smartZoomEnabled });
    const execute = SZ.buildToggleSmartZoomExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    smartZoomEnabled = execute.enabled;
    const btn = document.getElementById(execute.toggle.id);
    if (btn) TU.applyToggleButton(btn, execute.toggle.enabled);
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (execute.saveAllSettings) saveAllSettings();
    showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage, smartZoomEnabled);
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

function applyGestureSettingsFromApiPlan(execute) {
    if (!execute || !execute.shouldApply) return;
    const TU = _toggleUI();
    gestureEnabled = execute.enabled;
    gestureSensitivity = execute.sensitivity;
    gestureAction = execute.action;

    const toggle = document.getElementById(execute.toggle.id);
    if (toggle) TU.applyToggleButton(toggle, execute.toggle.enabled);

    const sensitivityEl = document.getElementById(execute.sensitivitySelect.id);
    if (sensitivityEl) sensitivityEl.value = execute.sensitivitySelect.value;

    const actionEl = document.getElementById(execute.actionSelect.id);
    if (actionEl) actionEl.value = execute.actionSelect.value;

    const settingsPanel = document.getElementById(execute.settingsPanel.id);
    if (settingsPanel) settingsPanel.style.display = execute.settingsPanel.display;

    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (execute.addDeviceMotionListener) {
        window.addEventListener('devicemotion', handleDeviceMotion);
    }
}

/**
 * initPhase3Features function
 * @function initPhase3Features
 * @returns {*} Return value description
 */
function initPhase3Features() {
    const P3 = _phase3Features();
    const orch = P3.buildInitPhase3FeaturesOrchestrationPlan();
    if (window[orch.initFlagProperty]) {
        return;
    }
    window[orch.initFlagProperty] = true;

    if (orch.loadGestureFromApi) {
        const GC = _gestureControl();
        const fetchPlan = GC.buildLoadGestureSettingsFetchPlan();
        fetch(fetchPlan.url)
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    applyGestureSettingsFromApiPlan(
                        GC.buildApplyGestureSettingsFromApiExecutePlan(data.settings, {
                            hasDeviceMotion: 'DeviceMotionEvent' in window,
                        })
                    );
                }
            })
            .catch((error) => console.error(fetchPlan.errorLogPrefix, error));
    }

    if (orch.initBatteryMonitoring) {
        const batteryPlan = P3.buildInitBatteryMonitoringPlan({
            hasGetBattery: 'getBattery' in navigator,
        });
        if (batteryPlan.shouldInit) {
            navigator.getBattery().then((battery) => {
                updateBatteryStatus(battery);
                (batteryPlan.listeners || []).forEach((eventName) => {
                    battery.addEventListener(eventName, () => updateBatteryStatus(battery));
                });
            });
        }
    }

    if (orch.loadMlPredictions) loadMLPredictions();

    if (orch.loadArSetting) {
        const arExecute = P3.buildLoadArSettingExecutePlan();
        const MC = _mapControls();
        const TU = _toggleUI();
        if (arExecute.shouldApply) {
            isAREnabled = MC.isAREnabledInStorage(localStorage);
            const arToggleBtn = document.getElementById(arExecute.toggleId);
            if (arToggleBtn) {
                TU.applyToggleButton(arToggleBtn, isAREnabled, TU.TOGGLE_SWITCH_OPTS);
            }
        }
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

    const GC = _gestureControl();
    const accel = event.acceleration;
    if (!accel) return;

    const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
    const detection = GC.buildGestureShakeDetectionPlan({
        magnitude,
        sensitivity: gestureSensitivity,
        lastShakeTime,
        shakeCount,
        now: Date.now(),
    });
    shakeCount = detection.shakeCount;
    lastShakeTime = detection.lastShakeTime;
    if (detection.shouldTrigger) {
        triggerGestureAction();
    }
}

/**
 * triggerGestureAction function
 * @function triggerGestureAction
 * @returns {*} Return value description
 */
function triggerGestureAction() {
    const GC = _gestureControl();
    const execute = GC.buildGestureActionExecutePlan({ action: gestureAction });
    if (!execute.shouldApply) return;

    const indicator = document.getElementById(execute.indicator.id);
    if (indicator) {
        indicator.classList.add(execute.indicator.showClass);
        setTimeout(() => indicator.classList.remove(execute.indicator.showClass), execute.indicator.hideAfterMs);
    }

    if ('vibrate' in navigator) {
        navigator.vibrate(execute.vibrateMs);
    }

    fetch('/api/gesture-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execute.logApiBody),
    }).catch((error) => console.error('Error logging gesture:', error));

    if (execute.triggerRecalculate) {
        showStatus(execute.statusMessage, execute.statusType);
        calculateRoute();
    } else if (execute.triggerClear) {
        showStatus(execute.statusMessage, execute.statusType);
        clearForm();
    } else {
        showStatus(execute.statusMessage, execute.statusType);
    }
}

/**
 * toggleGestureControl function
 * @function toggleGestureControl
 * @returns {*} Return value description
 */
function toggleGestureControl() {
    const GC = _gestureControl();
    const TU = _toggleUI();
    const collected = GC.buildToggleGestureControlCollectPlan({ currentlyEnabled: gestureEnabled });
    const execute = GC.buildToggleGestureControlExecutePlan({
        enabled: collected.enabled,
        hasDeviceMotion: 'DeviceMotionEvent' in window,
    });
    if (!execute.shouldApply) return;

    gestureEnabled = execute.enabled;
    TU.applyToggleButton(document.getElementById(execute.toggle.id), execute.toggle.enabled);

    const settingsPanel = document.getElementById(execute.settingsPanel.id);
    if (settingsPanel) settingsPanel.style.display = execute.settingsPanel.display;

    localStorage.setItem(execute.storageKey, execute.storageValue);

    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execute.persistApiBody),
    }).catch((error) => console.error('Error updating gesture setting:', error));

    if (execute.addDeviceMotionListener) {
        window.addEventListener('devicemotion', handleDeviceMotion);
    }
    if (execute.removeDeviceMotionListener) {
        window.removeEventListener('devicemotion', handleDeviceMotion);
    }
    showStatus(execute.statusMessage, execute.statusType);
}

/**
 * updateGestureSensitivity function
 * @function updateGestureSensitivity
 * @returns {*} Return value description
 */
function updateGestureSensitivity() {
    const GC = _gestureControl();
    const execute = GC.buildUpdateGestureSensitivityExecutePlan({
        value: document.getElementById(GC.GESTURE_SENSITIVITY_ID).value,
    });
    if (!execute.shouldApply) return;
    gestureSensitivity = execute.sensitivity;
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execute.persistApiBody),
    }).catch((error) => console.error(execute.errorLogPrefix, error));
}

/**
 * updateGestureAction function
 * @function updateGestureAction
 * @returns {*} Return value description
 */
function updateGestureAction() {
    const GC = _gestureControl();
    const execute = GC.buildUpdateGestureActionExecutePlan({
        value: document.getElementById(GC.GESTURE_ACTION_ID).value,
    });
    if (!execute.shouldApply) return;
    gestureAction = execute.action;
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execute.persistApiBody),
    }).catch((error) => console.error(execute.errorLogPrefix, error));
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
    const BS = _batterySaving();
    const level = Math.round(battery.level * 100);

    // Update battery level for adaptive refresh intervals (no visible widget)
    currentBatteryLevel = battery.level;

    const autoEnable = BS.buildBatteryAutoEnablePlan({
        levelPercent: level,
        currentlyEnabled: batterySavingMode,
    });
    if (autoEnable.shouldEnable) {
        enableBatterySavingMode();
    }
}

/**
 * toggleBatterySavingMode function
 * @function toggleBatterySavingMode
 * @returns {*} Return value description
 */
function toggleBatterySavingMode() {
    applyBatterySavingModeFromPlan(
        _batterySaving().buildToggleBatterySavingExecutePlan(batterySavingMode)
    );
}

/**
 * enableBatterySavingMode function
 * @function enableBatterySavingMode
 * @returns {*} Return value description
 */
function applyBatterySavingModeFromPlan(execute) {
    if (!execute || !execute.shouldApply) return;
    const TU = _toggleUI();
    if (execute.setBatterySavingMode) batterySavingMode = execute.batterySavingMode;
    if (execute.toggle) {
        TU.applyToggleButton(document.getElementById(execute.toggle.id), execute.toggle.enabled);
    }
    if (execute.disableBodyAnimation) document.body.style.animation = 'none';
    if (execute.disableElementAnimations) {
        document.querySelectorAll('[style*="animation"]').forEach((el) => {
            el.style.animation = 'none';
        });
    }
    if (execute.restoreBodyAnimation) document.body.style.animation = '';
    if (execute.storageKey) localStorage.setItem(execute.storageKey, execute.storageValue);
    if (execute.persistApiBody) {
        fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.persistApiBody),
        }).catch((error) => console.error('Error updating battery mode:', error));
    }
    if (execute.statusMessage) showStatus(execute.statusMessage, execute.statusType);
    if (execute.restoreLogMessage) console.log(execute.restoreLogMessage);
}

function enableBatterySavingMode() {
    applyBatterySavingModeFromPlan(_batterySaving().buildEnableBatterySavingExecutePlan());
}

/**
 * disableBatterySavingMode function
 * @function disableBatterySavingMode
 * @returns {*} Return value description
 */
function disableBatterySavingMode() {
    applyBatterySavingModeFromPlan(_batterySaving().buildDisableBatterySavingExecutePlan());
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
    const MT = _mapTheme();
    const execute = MT.buildSetMapThemeExecutePlan({
        themeOrEvent,
        currentMapTheme,
        hasMap: !!map,
        buildings3DEnabled: typeof buildings3DEnabled !== 'undefined' && buildings3DEnabled,
        toAbs: window.__voyagrToAbsoluteOriginUrl || ((u) => u),
        preferredFallbackStyleUrl: window.__voyagrPreferredFallbackStyleUrl,
    });
    if (!execute.shouldApply) return;

    localStorage.setItem(execute.storageKey, execute.storageValue);

    const mapThemeRow = document.getElementById(execute.selectorId);
    if (mapThemeRow) {
        mapThemeRow.querySelectorAll('.theme-option').forEach((btn) => {
            btn.classList.remove('active');
        });
    }
    const activeBtn = document.querySelector(execute.activeButtonSelector);
    if (activeBtn) activeBtn.classList.add('active');

    if (!execute.hasMap) {
        console.warn(execute.mapNotReadyLog);
        currentMapTheme = execute.theme;
        return;
    }
    if (execute.skipStyleReload) {
        console.log(execute.alreadyActiveLog);
        return;
    }

    currentMapTheme = execute.theme;
    const resolveUrls = window.__voyagrResolveStyleUrls || ((s) => s);
    const toAbs = window.__voyagrToAbsoluteOriginUrl || ((u) => u);
    const chosenUrl = execute.stylePlan.chosenUrl;

    let resolvedStyle = null;
    if (execute.syncFetchStyle) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', chosenUrl, false);
            xhr.send();
            if (xhr.status === 200) {
                resolvedStyle = JSON.parse(xhr.responseText);
                resolveUrls(resolvedStyle);
            }
        } catch (e) {
            console.warn(execute.syncFetchErrorLogPrefix, e.message);
        }
    }

    map.setStyle(resolvedStyle || chosenUrl);

    map.once('style.load', () => {
        if (execute.postStyleLoad.add3DBuildings) {
            MapLibreHelpers.add3DBuildings(map, {
                heightMultiplier: buildings3DHeightMultiplier,
                opacity: buildings3DOpacity
            });
        }
        if (execute.postStyleLoad.reinitRoadLabels && typeof initializeRoadLabels === 'function') {
            initializeRoadLabels();
        }
    });

    showStatus(execute.statusMessage, execute.statusType);
    if (execute.saveAllSettings) saveAllSettings();

    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execute.persistApiBody),
    }).catch((error) => console.error('Error updating map theme:', error));
}

// ===== PHASE 3 FEATURES: ML PREDICTIONS =====

/**
 * loadMLPredictions function
 * @function loadMLPredictions
 * @returns {*} Return value description
 */
function loadMLPredictions() {
    const ML = _mlPredictions();
    const fetchPlan = ML.buildLoadMlPredictionsFetchPlan();
    if (!fetchPlan.shouldFetch) return;

    fetch(fetchPlan.url)
        .then((response) => response.json())
        .then((data) => {
            const render = ML.buildLoadMlPredictionsDomRenderPlan(data);
            if (!render.shouldRender) return;

            const section = document.getElementById(fetchPlan.sectionId);
            const list = document.getElementById(fetchPlan.listId);
            if (!section || !list) return;

            list.innerHTML = '';
            (render.items || []).forEach((item) => {
                const el = document.createElement('div');
                el.className = item.className;
                el.innerHTML = item.html;
                el.onclick = () => {
                    document.getElementById(fetchPlan.startInputId).value = item.routeInputs.start;
                    document.getElementById(fetchPlan.endInputId).value = item.routeInputs.end;
                    calculateRoute();
                };
                list.appendChild(el);
            });
            section.classList.add(render.sectionShowClass);
        })
        .catch((error) => console.error(fetchPlan.errorLogPrefix, error));
}

/**
 * toggleMLPredictions function
 * @function toggleMLPredictions
 * @returns {*} Return value description
 */
function toggleMLPredictions() {
    const ML = _mlPredictions();
    const TU = _toggleUI();
    const button = document.getElementById('mlPredictionsEnabled');
    if (!button) return;

    const collected = ML.buildToggleMlPredictionsCollectPlan({
        currentEnabled: button.classList.contains('active'),
    });
    const execute = ML.buildToggleMlPredictionsExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    TU.applyLabeledToggleButton(button, execute.toggle.enabled);
    localStorage.setItem(execute.storageKey, execute.storageValue);

    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execute.persistApiBody),
    }).catch((error) => console.error('Error updating ML predictions:', error));

    if (execute.loadPredictions) loadMLPredictions();
    if (execute.hideSection) {
        const section = document.getElementById(execute.sectionId);
        if (section) section.classList.remove(execute.sectionShowClass);
    }
    showStatus(execute.statusMessage, execute.statusType);
    if (execute.saveAllSettings) saveAllSettings();
}

// Warm Picovoice vendor bundles after idle load (optional offline wake).

/** Hide map-stack FABs while the bottom sheet is fully expanded (peek mode keeps them visible). */
function syncBottomSheetOverlapFabs() {
    const DH = _domHelpers();
    const bottomSheet = document.getElementById(DH.BOTTOM_SHEET_ID);
    const execute = DH.buildBottomSheetOverlapFabDisplayPlan({
        sheetExpanded: !!(bottomSheet && bottomSheet.classList.contains(DH.BOTTOM_SHEET_EXPANDED_CLASS)),
        routeInProgress,
    });
    if (!execute.shouldApply) return;

    (execute.alwaysHideWhenExpanded || []).forEach(({ id, action }) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (action === 'hide') {
            el.style.display = 'none';
        } else {
            el.style.removeProperty('display');
        }
    });

    (execute.navFabDisplays || []).forEach(({ id, display }) => {
        const el = document.getElementById(id);
        if (el) el.style.display = display;
    });
}

/** Road-report FAB: always available unless the bottom sheet is covering map controls. */
function updateRoadReportFabVisibility() {
    syncBottomSheetOverlapFabs();
}

/**
 * True for phones/tablets and other touch-first UIs (no reliable hover tooltips).
 */
function voyagrTouchHintsEnabled() {
    return _mapControls().isTouchHintsEnvironment({
        navigator: typeof navigator !== 'undefined' ? navigator : null,
        window: typeof window !== 'undefined' ? window : null,
    });
}

/**
 * Short banner at bottom of screen — easier to see on phones than top-right notifications.
 */
function voyagrShowMapIconHint(message) {
    const MC = _mapControls();
    const execute = MC.buildShowMapHintToastExecutePlan(message);
    if (!execute.shouldShow) return;

    const el = document.getElementById(execute.toastId);
    if (!el) return;
    el.textContent = execute.message;
    el.removeAttribute('hidden');
    el.classList.add(execute.visibleClass);
    if (execute.clearExistingTimer && window[execute.timerProperty]) {
        clearTimeout(window[execute.timerProperty]);
    }
    window[execute.timerProperty] = setTimeout(() => {
        el.classList.remove(execute.visibleClass);
        el.setAttribute('hidden', '');
    }, execute.autoDismissMs);
}

/**
 * Modal listing visible map / toolbar buttons (mobile-friendly; desktop relies on hover titles).
 */
function openMapControlsHintModal() {
    const MC = _mapControls();
    const execute = MC.buildOpenMapControlsHintModalExecutePlan();
    if (!execute.shouldOpen) return;

    const m = document.getElementById(execute.modalId);
    const ul = document.getElementById(execute.listId);
    if (!m || !ul) return;
    ul.innerHTML = '';

    (execute.sections || []).forEach((sec) => {
        const secTitle = document.createElement('li');
        secTitle.className = execute.sectionTitleClass;
        secTitle.textContent = sec.title;
        ul.appendChild(secTitle);
        const nodes = document.querySelectorAll(sec.selector);
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (MC.shouldSkipMapControlsHintElement(el.id)) continue;
            const hint = el.getAttribute('title') || el.getAttribute('aria-label');
            if (!hint) continue;
            const st = window.getComputedStyle(el);
            if (!MC.isMapControlsHintElementVisible(st.display, st.visibility)) continue;
            const li = document.createElement('li');
            li.className = execute.itemClass;
            li.textContent = MC.formatMapControlsHintItemLabel(el.textContent, hint);
            ul.appendChild(li);
        }
    });

    const exTitle = document.createElement('li');
    exTitle.className = execute.sectionTitleClass;
    exTitle.textContent = execute.extrasSectionTitle;
    ul.appendChild(exTitle);
    (execute.extras || []).forEach((extra) => {
        const li = document.createElement('li');
        li.className = execute.itemClass;
        li.textContent = extra;
        ul.appendChild(li);
    });

    m.style.display = execute.modalDisplay;
}

function closeMapControlsHintModal() {
    const execute = _mapControls().buildCloseMapControlsHintModalExecutePlan();
    if (!execute.shouldClose) return;
    const modal = document.getElementById(execute.modalId);
    if (modal) modal.style.display = execute.modalDisplay;
}

/**
 * Long-press (touch / pen) shows title text like a desktop hover tooltip.
 */
function initMobileMapIconHints() {
    const MC = _mapControls();
    const initPlan = MC.buildInitMobileMapIconHintsPlan({
        touchHintsEnabled: voyagrTouchHintsEnabled(),
    });
    if (!initPlan.shouldInit) {
        console.log(initPlan.skipLogMessage);
        return;
    }
    console.log(initPlan.enabledLogMessage);

    for (let r = 0; r < initPlan.rootSelectors.length; r++) {
        const root = document.querySelector(initPlan.rootSelectors[r]);
        if (!root) continue;
        const buttons = root.querySelectorAll(initPlan.buttonSelector);
        for (let i = 0; i < buttons.length; i++) {
            voyagrBindFabLongPressHint(buttons[i], initPlan);
        }
    }
}

function voyagrBindFabLongPressHint(el, initPlan) {
    const MC = _mapControls();
    initPlan = initPlan || MC.buildInitMobileMapIconHintsPlan({ touchHintsEnabled: true });
    const bind = MC.buildFabLongPressHintBindPlan(initPlan);
    if (!bind.shouldBind || !el || el.dataset[bind.datasetKey] === bind.datasetValue) return;
    el.dataset[bind.datasetKey] = bind.datasetValue;

    let timer = null;
    let startX = 0;
    let startY = 0;
    const LONG_MS = bind.longPressMs;
    const MOVE_PX2 = bind.moveThresholdPx2;

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
            el.dataset[bind.suppressClickDataset] = '1';
            voyagrShowMapIconHint(hint);
            try {
                if (navigator.vibrate) navigator.vibrate(bind.vibrateMs);
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
                if (bind.skipMousePointers && e.pointerType === 'mouse') return;
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
                if (bind.singleTouchOnly && e.touches.length !== 1) return;
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
            if (el.dataset[bind.suppressClickDataset] === '1') {
                e.preventDefault();
                e.stopPropagation();
                delete el.dataset[bind.suppressClickDataset];
            }
        },
        true
    );
}

function openRoadReportModal() {
    const execute = _roadReport().buildOpenRoadReportModalExecutePlan();
    if (!execute.shouldOpen) return;
    const m = document.getElementById(execute.modalId);
    if (!m) return;
    const notes = document.getElementById(execute.notesId);
    if (notes && execute.clearNotes) notes.value = '';
    m.style.display = execute.modalDisplay;
}

function closeRoadReportModal() {
    const execute = _roadReport().buildCloseRoadReportModalExecutePlan();
    if (!execute.shouldClose) return;
    const m = document.getElementById(execute.modalId);
    if (m) m.style.display = execute.modalDisplay;
}

async function submitRoadReport() {
    const RR = _roadReport();
    const collected = RR.buildSubmitRoadReportCollectPlan({
        lat: typeof currentLat !== 'undefined' ? currentLat : null,
        lon: typeof currentLon !== 'undefined' ? currentLon : null,
    });
    if (!collected.hasGpsFix) {
        const fetchPlan = RR.buildSubmitRoadReportFetchPlan();
        showStatus(fetchPlan.gpsRequiredStatusMessage, fetchPlan.gpsRequiredStatusType);
        return;
    }

    const typeEl = document.getElementById(RR.ROAD_REPORT_TYPE_ID);
    const hazard_type = typeEl ? typeEl.value : 'other';
    const description = (document.getElementById(RR.ROAD_REPORT_NOTES_ID)
        && document.getElementById(RR.ROAD_REPORT_NOTES_ID).value) || '';
    const fetchPlan = RR.buildSubmitRoadReportFetchPlan({
        lat: collected.lat,
        lon: collected.lon,
        hazardType: hazard_type,
        description,
    });

    try {
        const r = await fetch(fetchPlan.url, {
            method: fetchPlan.method,
            headers: fetchPlan.headers,
            body: JSON.stringify(fetchPlan.body),
        });
        const data = await r.json();
        if (data.success) {
            showStatus(fetchPlan.successStatusMessage, fetchPlan.successStatusType);
            if (fetchPlan.closeModalOnSuccess) closeRoadReportModal();
        } else {
            showStatus(data.error || fetchPlan.errorStatusPrefix, 'error');
        }
    } catch (e) {
        showStatus(fetchPlan.errorStatusPrefix + ': ' + e.message, 'error');
    }
}

// PWA Service Worker Registration
let _swUpdateInFlight = false;
let _swUpdateBackoffUntil = 0;

async function safeServiceWorkerUpdate(registration, reason) {
    const PWA = _pwaInstall();
    const preflight = PWA.buildServiceWorkerUpdatePreflightPlan({
        hasRegistration: !!registration,
        hasServiceWorker: 'serviceWorker' in navigator,
        isOnline: navigator.onLine,
        updateInFlight: _swUpdateInFlight,
        backoffUntil: _swUpdateBackoffUntil,
        installing: !!(registration && registration.installing),
    });
    if (!preflight.shouldUpdate) return;

    _swUpdateInFlight = true;
    try {
        await registration.update();
    } catch (e) {
        const apply = PWA.buildServiceWorkerUpdateErrorApplyPlan();
        _swUpdateBackoffUntil = apply.backoffUntil;
        console.debug(apply.logPrefix, e && e.name, reason || '');
    } finally {
        _swUpdateInFlight = false;
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const PWA = _pwaInstall();
        const regPlan = PWA.buildServiceWorkerRegistrationExecutePlan();
        navigator.serviceWorker.register(regPlan.scriptPath)
            .then(registration => {
                console.log(regPlan.successLogPrefix, registration);

                setInterval(() => {
                    void safeServiceWorkerUpdate(registration, 'periodic');
                }, regPlan.periodicUpdateIntervalMs);

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        void safeServiceWorkerUpdate(registration, 'visible');
                    }
                });

                const scheduleWarm = (cb) => {
                    if (regPlan.preferIdleCallback && typeof requestIdleCallback === 'function') {
                        requestIdleCallback(cb, { timeout: regPlan.picovoiceIdleTimeoutMs });
                    } else {
                        setTimeout(cb, regPlan.picovoiceWarmDelayMs);
                    }
                };
                scheduleWarm(warmPicovoiceStaticCache);
            })
            .catch(error => {
                console.log(regPlan.failureLogPrefix, error);
            });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        const change = _pwaInstall().buildServiceWorkerControllerChangePlan({ routeInProgress });
        console.log(change.logMessage);

        if (change.action === 'defer') {
            if (change.setUpdatePending) updatePending = true;
            showStatus(change.statusMessage, change.statusType);
        } else if (change.action === 'reload') {
            showStatus(change.statusMessage, change.statusType);
            if (change.saveAppState) saveAppState();
            scheduleAppReload(change.reloadReason, change.reloadDelayMs);
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

// ===== OFFLINE NAVIGATION ORCHESTRATION =====
// Orchestration lives in static/js/app/offline-navigation-orchestration.js (bound at file end).

function getOfflineNavigationOrchestrationRuntime() {
    return {
        offlineNavigation: () => _offlineNavigation(),
        speedLimitWidget: () => _speedLimitWidget(),
        getMap: () => map,
        getRouteInProgress: () => routeInProgress,
        getRoutePolyline: () => routePolyline,
        getCurrentRouteSteps: () => currentRouteSteps,
        getCurrentStepIndex: () => currentStepIndex,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        call: {
            showStatus,
            buildRoutePayloadFromPersisted,
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

// ===== PHASE 2: Restore app state on page load =====
window.addEventListener('load', () => {
    restoreAppState();
    void initSupabaseAuth();
    _tryResumeNavigation();
    initDeviceEnvironmentNotifications();
    // Show a volume reminder on app open (once per tab session).
    try {
        const openHint = _deviceEnvironment().buildOpenVolumeHintSchedulePlan({
            alreadyShown: sessionStorage.getItem(_deviceEnvironment().OPEN_VOLUME_HINT_SESSION_KEY) === 'true',
        });
        if (openHint.shouldSchedule) {
            sessionStorage.setItem(openHint.sessionStorageKey, openHint.sessionStorageValue);
            setTimeout(() => {
                try {
                    showVolumeHintForNavigation();
                } catch (e) {
                    console.warn(openHint.errorLogPrefix, e);
                }
            }, openHint.delayMs);
        }
    } catch (e) {
        console.warn(_deviceEnvironment().buildOpenVolumeHintSchedulePlan().scheduleErrorLogPrefix, e);
    }
});

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
    const CP = _cameraPitch();
    if (CP && typeof CP.decideDrivingCamera === 'function') {
        return CP.decideDrivingCamera(state);
    }
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
        padding: _cameraPitch().computeFollowPadding(window.innerHeight, window.innerWidth),
    });
    console.log(`[Driver View] ${shouldTiltDrivingCamera() ? '60°' : 'flat 2D'} navigation camera (follow padding)`);
}

/**
 * Toggle driver's perspective preference (when not navigating, or after this trip ends).
 * During active navigation with zoom-and-follow, the map stays at 60° either way.
 */
function toggleDriverPerspective() {
    const MV = _mapView3D();
    const TU = _toggleUI();
    const collected = MV.buildToggleDriverPerspectiveCollectPlan({
        currentlyEnabled: driverPerspectiveEnabled,
    });
    const execute = MV.buildToggleDriverPerspectiveExecutePlan({
        enabled: collected.enabled,
        activeNavFollow: isActiveNavigationFollow(),
    });
    if (!execute.shouldApply) return;

    driverPerspectiveEnabled = execute.enabled;
    localStorage.setItem(execute.storageKey, execute.storageValue);

    const btn = document.getElementById(execute.toggleId);
    if (execute.applyToggleWithPitchedState) {
        TU.applyToggleButton(btn, shouldUsePitchedDrivingCamera());
    }

    if (map && execute.applyDriverPerspective) {
        applyDriverPerspective();
    }

    showStatus(execute.statusMessage, execute.statusType);
    if (execute.recomputeMapView3D && typeof _recomputeMapView3DFromGranular === 'function') {
        _recomputeMapView3DFromGranular();
    }
    if (execute.saveAllSettings) saveAllSettings();
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
        easeOptions.padding = _cameraPitch().computeFollowPadding(window.innerHeight, window.innerWidth);
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
let mapView3DEnabled = _mapView3D().resolveMapView3DEnabledFromStorage(
    localStorage.getItem('mapView3DEnabled'),
    driverPerspectiveEnabled || buildings3DEnabled
);

/** Reflect the current 2D/3D state on the master toggle and the two granular toggles. */
function syncMapView3DToggleUI() {
    const TU = _toggleUI();
    const plan = _mapView3D().buildSyncMapView3DToggleUIPlan({
        mapView3DEnabled,
        driverPerspectiveEnabled,
        buildings3DEnabled,
    });
    if (!plan.shouldApply) return;

    const master = document.getElementById(plan.masterToggleId);
    if (master) {
        TU.applyToggleButton(master, plan.mapView3DEnabled);
        if (plan.clearMasterInactiveStylesWhenOff && !plan.mapView3DEnabled) {
            master.style.background = '';
            master.style.borderColor = '';
        }
    }
    TU.applyToggleButton(document.getElementById(plan.driverPerspectiveToggleId), plan.driverPerspectiveEnabled);
    TU.applyToggleButton(document.getElementById(plan.buildings3DToggleId), plan.buildings3DEnabled);
}

/** Apply a 2D/3D scene preset by driving the existing tilt + buildings machinery. */
function setMapView3D(enabled) {
    const execute = _mapView3D().buildSetMapView3DExecutePlan(enabled, {
        heightMultiplier: buildings3DHeightMultiplier,
        opacity: buildings3DOpacity,
    });
    if (!execute.shouldApply) return;

    mapView3DEnabled = execute.mapView3DEnabled;
    localStorage.setItem(execute.mapViewStorageKey, execute.mapViewStorageValue);

    driverPerspectiveEnabled = execute.driverPerspectiveEnabled;
    localStorage.setItem(execute.driverPerspectiveStorageKey, execute.driverPerspectiveStorageValue);
    if (map && execute.applyDriverPerspective) applyDriverPerspective();

    buildings3DEnabled = execute.buildings3DEnabled;
    localStorage.setItem(execute.buildings3DStorageKey, execute.buildings3DStorageValue);
    if (map && typeof MapLibreHelpers !== 'undefined') {
        if (execute.mapBuildingsAction === 'add3DBuildings') {
            MapLibreHelpers.add3DBuildings(map, {
                heightMultiplier: execute.heightMultiplier,
                opacity: execute.opacity,
            });
        } else {
            MapLibreHelpers.remove3DBuildings(map);
        }
    }

    if (execute.syncToggleUI) syncMapView3DToggleUI();
}

/** Toggle between 2D and 3D map view (Settings → AR & 3D View). */
function toggleMapView3D() {
    const MV = _mapView3D();
    const collected = MV.buildToggleMapView3DCollectPlan({ currentlyEnabled: mapView3DEnabled });
    const execute = MV.buildToggleMapView3DExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    setMapView3D(execute.enabled);
    showStatus(execute.statusMessage, execute.statusType);
    if (execute.saveAllSettings && typeof saveAllSettings === 'function') saveAllSettings();
}

/**
 * Keep the 2D/3D master in sync when a granular toggle (camera tilt or 3D buildings)
 * is changed on its own. The scene reads as "3D" if either aspect is on.
 */
function _recomputeMapView3DFromGranular() {
    const execute = _mapView3D().buildRecomputeMapView3DFromGranularExecutePlan({
        driverPerspectiveEnabled,
        buildings3DEnabled,
    });
    if (!execute.shouldApply) return;

    mapView3DEnabled = execute.mapView3DEnabled;
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (execute.syncToggleUI) syncMapView3DToggleUI();
}

// ===== AR NAVIGATION MODE =====
let arNavigator = null;
let arModeActive = false;
let isAREnabled = false; // Global flag for preference

/**
 * Toggle AR Setting (from Preferences)
 */
function toggleARSetting() {
    const MC = _mapControls();
    const TU = _toggleUI();
    const collected = MC.buildToggleARSettingCollectPlan({ currentlyEnabled: isAREnabled });
    const execute = MC.buildToggleARSettingExecutePlan({
        enabled: collected.enabled,
        arModeActive,
    });
    const btn = document.getElementById(execute.toggleId);
    if (!btn) return;

    isAREnabled = execute.enabled;
    TU.applyToggleButton(btn, isAREnabled, TU.TOGGLE_SWITCH_OPTS);
    MC.writeAREnabledToStorage(localStorage, isAREnabled);

    if (execute.updateFabVisibility) updateARButtonVisibility();

    showStatus(execute.statusMessage, execute.statusType);
    if (execute.stopArModeIfDisabling) stopARMode();
}

/**
 * Update AR FAB Visibility based on settings and route state
 */
function updateARButtonVisibility() {
    const MC = _mapControls();
    const arFab = document.getElementById(MC.AR_MODE_FAB_ID);
    if (!arFab) return;

    const hasRoute = window.lastCalculatedRoute !== null;
    const display = MC.getARFabVisibilityDisplay(isAREnabled, hasRoute, routeInProgress);
    arFab.style.display = display.display;
    if (display.textContent != null) {
        arFab.textContent = display.textContent;
    }
}


/**
 * Toggle AR navigation mode
 * Uses WebXR if available, falls back to camera overlay
 */
async function toggleARMode() {
    const MC = _mapControls();
    const TU = _toggleUI();
    const entry = MC.buildToggleARModeEntryPlan({ arModeActive });
    const toggleBtn = document.getElementById(entry.toggleId);

    if (entry.shouldStop) {
        await stopARMode();
        if (entry.applyToggleOff) MC.applyARModeToggleButton(toggleBtn, false, TU);
        return;
    }

    try {
        const { ARNavigator } = await import(entry.moduleImportPath);

        if (!arNavigator) {
            arNavigator = new ARNavigator({
                onError: (err) => {
                    showStatus(`AR Error: ${err.message}`, 'error');
                },
                onStatusChange: (status) => {
                    console.log('[AR] Status:', status);
                    updateARButtonState(status);
                },
            });
        }

        showStatus(entry.startingStatusMessage, entry.startingStatusType);

        const result = await arNavigator.start();
        const resultPlan = MC.buildToggleARModeStartResultPlan(result);

        if (resultPlan.shouldApply) {
            arModeActive = resultPlan.arModeActive;
            if (resultPlan.applyToggleOn) MC.applyARModeToggleButton(toggleBtn, true, TU);
            showStatus(resultPlan.statusMessage, resultPlan.statusType);

            if (resultPlan.syncCurrentInstruction && currentRouteSteps && currentStepIndex < currentRouteSteps.length) {
                const step = currentRouteSteps[currentStepIndex];
                arNavigator.updateInstruction({
                    instruction: step.instruction,
                    direction: _turnInstructions().maneuverTypeToARDirectionKey(step.type),
                    distance: nextManeuverDistance,
                });
            }
        } else {
            showStatus(resultPlan.statusMessage, resultPlan.statusType);
        }
    } catch (err) {
        console.error(entry.loadErrorLogPrefix, err);
        showStatus(entry.loadErrorStatusMessage, 'error');
    }
}

/**
 * Stop AR mode
 */
async function stopARMode() {
    if (arNavigator) {
        await arNavigator.stop();
    }
    const execute = _mapControls().buildStopARModeExecutePlan();
    arModeActive = execute.arModeActive;
    _mapControls().applyARModeToggleButton(
        document.getElementById(execute.toggleId),
        false,
        _toggleUI()
    );
    if (execute.statusMessage) showStatus(execute.statusMessage, execute.statusType);
}

/**
 * Update AR button visual state
 */
function updateARButtonState(status) {
    _mapControls().applyARModeButtonState(document.getElementById('arModeBtn'), status);
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

    const TI = _turnInstructions();
    const plan = TI.buildTurnWidgetRowDisplayPlan(turnInfo, distanceUnit, {
        roundaboutExitCount: turnInfo && turnInfo.maneuverIndex != null
            ? effectiveRoundaboutExitCount(turnInfo.maneuverIndex)
            : 0,
    });

    distanceEl.textContent = plan.distanceText;
    instructionEl.textContent = plan.instructionText;

    if (streetEl) {
        if (plan.streetVisible) {
            streetEl.textContent = plan.streetText;
            streetEl.style.display = 'block';
        } else {
            streetEl.style.display = 'none';
        }
    }

    if (iconEl) iconEl.textContent = TI.getTurnIcon(plan.iconType);

    if (hintEl) {
        if (plan.hintVisible) {
            hintEl.innerHTML = plan.hintHtml;
            hintEl.style.display = 'block';
        } else {
            hintEl.innerHTML = '';
            hintEl.style.display = 'none';
        }
    }

    // Advance "Then …" row: surface the maneuver that follows the next turn.
    updateThenRow(plan.maneuverIndex, plan.distance);

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
    const TI = _turnInstructions();
    const follow = getFollowingManeuver(maneuverIndex);
    const plan = TI.buildThenRowDisplayPlan(
        maneuverIndex,
        currentDistance,
        follow,
        distanceUnit,
        follow && follow.direction === 'roundabout' ? effectiveRoundaboutExitCount(follow.index) : 0
    );

    if (plan.visible) {
        if (iconEl) iconEl.textContent = plan.icon;
        if (textEl) textEl.textContent = plan.text;
    }
    thenEl.style.display = plan.visible ? 'flex' : 'none';
}

/**
 * Populate the full instructions list in the expanded panel
 * Enhanced with click-to-preview functionality
 */
function populateInstructionsList() {
    const listEl = document.getElementById('instructionsList');
    const countEl = document.getElementById('instructionsCount');
    const TI = _turnInstructions();

    const plan = TI.buildInstructionsListHtml(currentRouteSteps, currentStepIndex, {
        getTurnIcon: TI.getTurnIcon.bind(TI),
        effectiveRoundaboutExitCountFromSteps: TI.effectiveRoundaboutExitCountFromSteps,
    });

    if (countEl) countEl.textContent = plan.countText;
    if (!listEl) return;

    listEl.innerHTML = plan.html;

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
function updateTurnWidgetFromPosition(lat, lon, turnInfo) {
    const TI = _turnInstructions();
    const RG = _routeGeometry();
    const SG = _speedGps();

    const resolvedTurnInfo = turnInfo !== undefined
        ? turnInfo
        : detectUpcomingTurn(lat, lon);

    const tick = TI.buildTurnWidgetTickPlan({
        routeInProgress,
        routeSteps: currentRouteSteps,
        routePolyline,
        lat,
        lon,
        lastSnappedRouteIndex,
        currentRoadDisplayName,
        turnInfo: resolvedTurnInfo,
        getActiveRouteManeuverIndex: SG ? SG.getActiveRouteManeuverIndex.bind(SG) : null,
        buildBetweenTurnDisplay: SG ? SG.buildBetweenTurnDisplay.bind(SG) : null,
        snapToRoutePolyline: (a, b, c, d) => RG.snapToRoutePolyline(a, b, c, d),
        distanceAlongRouteToVertexMeters: RG.distanceAlongRouteToVertexMeters.bind(RG),
    });

    if (tick.action === 'skip') return;
    if (tick.action === 'clear') {
        updateTurnInstructionDisplay(null);
        return;
    }
    updateTurnInstructionDisplay(tick.displayPayload);
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
 * Format remaining time for display
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted time string (e.g., "45 min" or "2h 15min")
 */

/**
 * Detect if the user has actually started moving.
 * Checks GPS position changes and speed to avoid false progress calculations.
 * @returns {boolean} True if user has started moving, false otherwise
 */
function hasUserStartedMoving() {
    return _movementDetection().hasUserStartedMoving({
        trackingHistory: trackingHistory,
        haversineDistanceMeters: _routeGeometry().haversineDistanceMeters,
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
    let remainingDistanceMeters = 0;
    if (routePolyline.length >= 2) {
        if (userHasStartedMoving && currentLat != null && currentLon != null) {
            remainingDistanceMeters = _routeGeometry().computeRemainingDistanceAlongRoute(
                currentLat, currentLon, routePolyline, lastSnappedRouteIndex
            );
        } else {
            remainingDistanceMeters = _routeGeometry().totalPolylineLengthMeters(routePolyline);
        }
    }

    const ETA = _eta();
    const polylineTotalM = _routeGeometry().totalPolylineLengthMeters(routePolyline);
    const plan = ETA.buildJourneySummaryBarApplyPlan({
        remainingDistanceMeters,
        distanceUnit,
        formatRemainingDistance: (m, unit) => _units().formatRemainingDistanceText(m, unit),
        lastCalculatedRoute: window.lastCalculatedRoute,
        routeDurationMin: ETA.normalizeRouteDurationMinutes(window.lastCalculatedRoute),
        userHasStartedMoving,
        polylineTotalM,
        applyTrafficRatio: applyTrafficRatioToBaseRemaining,
        use24HourFormat: localStorage.getItem('use24HourFormat') !== 'false',
    });

    distanceEl.textContent = plan.distanceText;
    timeEl.textContent = plan.timeText;
    etaEl.textContent = plan.etaText;

    if (userHasStartedMoving && polylineTotalM > 0) {
        console.log(`[ETA] Progress-based: ${(1 - remainingDistanceMeters / polylineTotalM).toFixed(2)} complete, ${plan.remainingTimeMinutes.toFixed(1)} min remaining`);
    } else if (!userHasStartedMoving) {
        console.log(`[ETA] Pre-movement: Using original duration ${plan.remainingTimeMinutes.toFixed(1)} min`);
    }
    console.log(`[Journey Summary] Distance: ${plan.distanceText}, Time: ${plan.timeText}, ETA: ${plan.etaText}`);
}

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

function _voiceControl() { return VoyagrModules.voiceControl(); }

function applyVoiceStatusFromPlan(plan) {
    if (!plan || !plan.shouldUpdate) return;
    const el = document.getElementById(plan.elementId);
    if (el) el.textContent = plan.text;
}

function applyVoiceListeningUiFromPlan(plan) {
    if (!plan || !plan.shouldUpdate) return;
    const btnText = document.getElementById(plan.elementIds.btnText);
    const btn = document.getElementById(plan.elementIds.btn);
    const fab = document.getElementById(plan.elementIds.fab);
    if (btnText) btnText.textContent = plan.btnText;
    if (btn) {
        btn.classList.toggle('active', !!plan.btnActive);
        btn.setAttribute('aria-pressed', plan.btnAriaPressed);
    }
    if (fab) {
        fab.classList.toggle('fab--listening', !!plan.fabListeningClass);
        fab.setAttribute('aria-pressed', plan.fabAriaPressed);
        fab.title = plan.fabTitle;
    }
}

function applyVoiceTranscriptFromPlan(plan) {
    if (!plan || !plan.shouldUpdate) return;
    const el = document.getElementById(plan.elementId);
    if (el) el.textContent = plan.text;
}

function voyagrVoiceSetStatus(message) {
    applyVoiceStatusFromPlan(_voiceControl().buildVoiceSetStatusExecutePlan(message));
}

function voyagrVoiceSetListeningUi(listening) {
    applyVoiceListeningUiFromPlan(_voiceControl().buildVoiceSetListeningUiExecutePlan(listening));
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

let isGeocoding = false;

// Initialize Web Speech API
/**
 * initVoiceRecognition function
 * @function initVoiceRecognition
 * @returns {*} Return value description
 */
function initVoiceRecognition() {
    const VC = _voiceControl();
    const preflight = VC.buildVoiceRecognitionInitPreflightPlan({
        alreadyInitialized: !!window.__voyagrVoiceInitialized,
        hasRecognitionInstance: !!voiceRecognition,
        hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    });
    if (preflight.action === 'ready') {
        return true;
    }
    if (preflight.action === 'unsupported') {
        console.log(preflight.logMessage);
        voyagrVoiceSetStatus(preflight.statusMessage);
        voyagrVoiceSetListeningUi(preflight.setListeningUi);
        return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    voiceRecognition = new SpeechRecognition();
    if (preflight.markInitialized) {
        window.__voyagrVoiceInitialized = true;
    }
    const cfg = preflight.recognitionConfig;
    voiceRecognition.continuous = cfg.continuous;
    voiceRecognition.interimResults = cfg.interimResults;
    voiceRecognition.lang = cfg.lang;

    voiceRecognition.onstart = () => {
        const startPlan = VC.buildVoiceOnStartExecutePlan();
        console.log(startPlan.logMessage);
        if (startPlan.clearFinalTranscript) {
            _voiceFinalTranscript = '';
        }
        voyagrVoiceSetStatus(startPlan.statusMessage);
        voyagrVoiceSetListeningUi(startPlan.setListeningUi);
    };

    voiceRecognition.onresult = (event) => {
        const resultPlan = VC.buildVoiceTranscriptCollectPlan(event, _voiceFinalTranscript);
        _voiceFinalTranscript = resultPlan.nextFinalTranscript;
        applyVoiceTranscriptFromPlan(VC.buildVoiceTranscriptUpdateExecutePlan(resultPlan.shown));
        console.log(resultPlan.logMessage, resultPlan.shown);
    };

    voiceRecognition.onerror = (event) => {
        const errPlan = VC.buildVoiceOnErrorExecutePlan(event.error);
        console.log(errPlan.logMessage);
        voyagrVoiceSetStatus(errPlan.statusMessage);
        voyagrVoiceSetListeningUi(errPlan.setListeningUi);
        isListening = errPlan.isListening;
        if (errPlan.resumePorcupineWake) {
            maybeResumePorcupineWakeAfterVoice();
        }
    };

    voiceRecognition.onend = () => {
        const endPlan = VC.buildVoiceOnEndExecutePlan();
        console.log(endPlan.logMessage);
        voyagrVoiceSetStatus(endPlan.statusMessage);
        voyagrVoiceSetListeningUi(endPlan.setListeningUi);
        isListening = endPlan.isListening;
    };

    return true;
}

/**
 * toggleVoiceInput function
 * @function toggleVoiceInput
 * @returns {*} Return value description
 */
async function toggleVoiceInput() {
    const VC = _voiceControl();
    if (!voiceRecognition) {
        if (!initVoiceRecognition()) {
            return;
        }
    }

    const orch = VC.buildToggleVoiceInputOrchestrationPlan({
        isListening,
        porcupineWakePipelineRunning: VoyagrPorcupineOrchestration.isPipelineRunning(),
    });

    if (orch.action === 'stop') {
        voiceRecognition.stop();
        isListening = orch.isListening;
        return;
    }

    if (orch.pausePorcupineWake) {
        VoyagrPorcupineOrchestration.setResumeAfterVoice(true);
        await stopPorcupineWakePipeline();
    }
    if (orch.clearTranscript) {
        applyVoiceTranscriptFromPlan(VC.buildVoiceTranscriptUpdateExecutePlan(''));
    }
    if (orch.clearFinalTranscript) {
        _voiceFinalTranscript = '';
    }
    voiceRecognition.start();
    isListening = orch.isListening;
}
/**
 * speakText function
 * @function speakText
 * @param {*} text - Parameter description
 * @returns {*} Return value description
 */
function speakText(text) {
    const VC = _voiceControl();
    const preflight = VC.buildSpeakTextPreflightPlan({
        hasSpeechSynthesis: 'speechSynthesis' in window,
        text,
    });
    if (!preflight.shouldSpeak) {
        console.log(preflight.logMessage);
        return;
    }

    if (preflight.cancelExisting) {
        window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(preflight.utterance.text);
    utterance.rate = preflight.utterance.rate;
    utterance.pitch = preflight.utterance.pitch;
    utterance.volume = preflight.utterance.volume;

    utterance.onstart = () => {
        console.log(preflight.logStartPrefix, text);
        voyagrVoiceSetStatus(preflight.onStartStatus);
    };

    utterance.onend = () => {
        console.log(preflight.logEndMessage);
        voyagrVoiceSetStatus(preflight.onEndStatus);
    };

    utterance.onerror = (event) => {
        console.log(preflight.logErrorPrefix, event.error);
        voyagrVoiceSetStatus(preflight.onErrorStatusPrefix + event.error);
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

    const VC = _voiceControl();
    const originalOnEnd = voiceRecognition.onend;
    voiceRecognition.onend = function () {
        originalOnEnd.call(this);

        const tr = document.getElementById(VC.VOICE_TRANSCRIPT_ELEMENT_ID);
        const endPlan = VC.buildVoiceCommandEndProcessingPlan({
            finalTranscript: _voiceFinalTranscript,
            fallbackTranscript: tr && tr.textContent ? tr.textContent : '',
        });
        if (!endPlan.shouldProcess) {
            voyagrVoiceSetStatus(endPlan.statusMessage);
            if (endPlan.resumePorcupineWake) {
                maybeResumePorcupineWakeAfterVoice();
            }
            return;
        }
        processVoiceCommand(endPlan.transcript);
    };
}
/**
 * processVoiceCommand function
 * @function processVoiceCommand
 * @param {*} command - Parameter description
 * @returns {*} Return value description
 */
function processVoiceCommand(command) {
    const VC = _voiceControl();
    const orch = VC.buildVoiceCommandProcessOrchestrationPlan(command);
    if (!orch.shouldProcess) {
        if (orch.resumePorcupineWake) {
            maybeResumePorcupineWakeAfterVoice();
        }
        return;
    }

    console.log(orch.logMessage, orch.transcript);
    voyagrVoiceSetStatus(orch.statusMessage);

    fetch(orch.apiPath, {
        method: orch.method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: orch.transcript,
            lat: currentLat,
            lon: currentLon
        })
    })
        .then(response => response.json())
        .then(data => {
            console.log('[Voice] Command result:', data);
            const execute = VC.buildVoiceCommandResultExecutePlan(data);

            if (execute.shouldHandleAction) {
                handleVoiceAction(execute.payload);
                speakText(execute.speakMessage);
            } else {
                speakText(execute.speakMessage);
                voyagrVoiceSetStatus(execute.statusMessage);
            }
        })
        .catch(error => {
            const errExecute = VC.buildVoiceCommandErrorExecutePlan(error);
            console.log(errExecute.logMessage, error);
            speakText(errExecute.speakMessage);
            voyagrVoiceSetStatus(errExecute.statusMessage);
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
function applyVoiceActionFromPlan(plan) {
    if (!plan || !plan.shouldApply) return;

    if (plan.logMessage) {
        if (plan.logArgs && plan.logArgs.length) {
            console.log(plan.logMessage, ...plan.logArgs);
        } else {
            console.log(plan.logMessage);
        }
    }

    if (plan.endInputId && plan.endValue != null) {
        const endEl = document.getElementById(plan.endInputId);
        if (endEl) endEl.value = plan.endValue;
    }
    if (plan.scheduleCalculateRoute) {
        calculateRoute();
    }
    if (plan.writeStorage) {
        localStorage.setItem(plan.storageKey, plan.storageValue);
    }
    if (plan.fetchHazardReport) {
        fetch(plan.apiPath, {
            method: plan.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(plan.body)
        })
            .then(r => r.json())
            .then((responseData) => {
                const VC = _voiceControl();
                const execute = VC.buildVoiceHazardReportResponseExecutePlan(responseData);
                if (execute.logMessage) {
                    console.log(execute.logMessage, ...(execute.logArgs || []));
                }
                if (execute.shouldShowStatus) {
                    showStatus(execute.statusMessage, execute.statusType);
                }
            })
            .catch((error) => {
                const errExecute = _voiceControl().buildVoiceHazardReportErrorExecutePlan(error);
                console.warn(errExecute.warnLogPrefix, ...(errExecute.warnLogArgs || []));
            });
    }
    if (plan.triggerAutomaticReroute) {
        triggerAutomaticReroute(plan.rerouteLat, plan.rerouteLon);
    }
    if (plan.speakMessage) {
        speakMessage(plan.speakMessage);
    }
}

function handleVoiceAction(data) {
    applyVoiceActionFromPlan(_voiceControl().buildVoiceActionDispatchPlan(data, {
        currentLat,
        currentLon,
        routeInProgress,
    }));
}

/**
 * setupMapMoveHandler function
 * @function setupMapMoveHandler
 * @returns {void}
 */
function setupMapMoveHandler() {
    const MC = _mapControls();
    const setup = MC.buildMapMoveHandlerSetupPlan({ hasMap: !!map });
    if (!setup.shouldBind) {
        if (setup.deferLogMessage) console.log(setup.deferLogMessage);
        return;
    }

    map.on(setup.eventName, () => {
        const sync = MC.buildMapCenterSyncExecutePlan({
            routeInProgress,
            isTrackingActive,
            center: map.getCenter(),
        });
        if (sync.shouldSync) {
            currentLat = sync.lat;
            currentLon = sync.lng;
        }
    });
}

function setupMapExploreHandlers() {
    const MC = _mapControls();
    const setup = MC.buildMapExploreHandlersSetupPlan({
        hasMap: !!map,
        alreadyInitialized: !!window[MC.MAP_EXPLORE_HANDLERS_FLAG],
    });
    if (!setup.shouldBind) {
        if (setup.deferLogMessage) console.log(setup.deferLogMessage);
        return;
    }
    if (setup.markInitialized) {
        window[setup.initializedFlagProperty] = true;
    }

    const onUserMapGesture = (e) => {
        const gesture = MC.buildMapExploreGestureExecutePlan({
            hasOriginalEvent: !!(e && e.originalEvent),
            routeInProgress,
            isTrackingActive,
            zoomAndFollowEnabled,
            mapFollowingActive,
        });
        if (!gesture.shouldReact) return;
        if (gesture.pauseMapFollowing) {
            mapFollowingActive = false;
            console.log(gesture.pauseFollowLogMessage);
        }
        if (gesture.updateRecenterVisibility) {
            updateRecenterButtonVisibility();
        }
    };

    setup.gestureEvents.forEach((eventName) => map.on(eventName, onUserMapGesture));
    map.on(setup.moveEndEvent, () => {
        const moveEnd = MC.buildMapExploreMoveEndExecutePlan();
        if (moveEnd.updateRecenterVisibility) {
            updateRecenterButtonVisibility();
        }
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
        const PW = _porcupineWake();
        const autoStart = PW.buildPorcupineInitAutoStartPlan({
            storageEnabled: localStorage.getItem(PW.VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) === 'true',
            configured: picovoiceClientConfigured(),
        });
        if (autoStart.shouldStart) {
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

function applyBottomSheetDragVisualFromPlan(feedback, bottomSheetEl) {
    if (!feedback || !feedback.shouldApplyTransform || !bottomSheetEl) return;
    bottomSheetEl.style.transform = `translateY(${feedback.transformTranslateY}px)`;
}

function applyBottomSheetDragFinishFromPlan(entry) {
    if (!entry) return;

    const bottomSheet = document.getElementById('bottomSheet');
    if (!bottomSheet) return;

    (entry.clearInlineStyles || []).forEach((prop) => {
        bottomSheet.style[prop] = '';
    });

    if (entry.shouldCollapse) {
        collapseBottomSheet();
        if (entry.collapseLogMessage) console.log(entry.collapseLogMessage);
    } else if (entry.shouldExpand) {
        expandBottomSheet();
        if (entry.expandLogMessage) console.log(entry.expandLogMessage);
    }
}

function applyBottomSheetDragStartFromPlan(execute, bottomSheetEl) {
    if (!execute || !execute.shouldDisableTransition || !bottomSheetEl) return;
    bottomSheetEl.style.transition = execute.transitionValue;
}

function applyBottomSheetClickToggleFromPlan(entry) {
    if (!entry || !entry.shouldToggle) return;
    if (entry.logMessage != null) console.log(entry.logMessage, entry.logState);
    if (entry.action === 'collapse') collapseBottomSheet();
    else if (entry.action === 'expand') expandBottomSheet();
}

function applyBottomSheetBodyClickExpandFromPlan(entry) {
    if (!entry || !entry.shouldExpand) return;
    if (entry.logMessage) console.log(entry.logMessage);
    expandBottomSheet();
}

function applyBottomSheetFocusExpandBindingFromPlan(binding) {
    if (!binding || !binding.shouldBind) return;

    binding.inputIds.forEach((inputId) => {
        const input = document.getElementById(inputId);
        if (input) input.addEventListener('focus', expandBottomSheet);
    });
}

// ===== BOTTOM SHEET FUNCTIONALITY =====
/**
 * initBottomSheet function
 * @function initBottomSheet
 * @returns {*} Return value description
 */
function initBottomSheet() {
    const DH = _domHelpers();
    const bottomSheet = document.getElementById('bottomSheet');
    const handle = document.querySelector('.bottom-sheet-handle');
    const header = document.querySelector('.bottom-sheet-header');
    const initPlan = DH.buildBottomSheetFullInitOrchestrationPlan(!!bottomSheet, !!handle);
    let isDragging = false;

    console.log(initPlan.initLogMessage, { bottomSheet, handle, header });

    if (!initPlan.shouldInit) {
        console.error(initPlan.missingElementsErrorLog);
        return;
    }

    const applyDragVisual = (diff) => {
        applyBottomSheetDragVisualFromPlan(
            DH.buildBottomSheetDragVisualEntryOrchestrationPlan({
                diff,
                isExpanded: bottomSheetIsExpanded,
                previewMaxPx: initPlan.dragCollapsePreviewMaxPx,
            }).feedback,
            bottomSheet
        );
    };

    const finishDrag = (diff) => {
        applyBottomSheetDragFinishFromPlan(
            DH.buildBottomSheetDragFinishEntryOrchestrationPlan(diff, bottomSheetIsExpanded, {
                thresholdPx: initPlan.dragThresholdPx,
                collapseSwipeLogMessage: initPlan.collapseSwipeLogMessage,
                expandSwipeLogMessage: initPlan.expandSwipeLogMessage,
            })
        );
    };

    handle.addEventListener('click', (e) => {
        e.stopPropagation();
        applyBottomSheetClickToggleFromPlan(
            DH.buildBottomSheetHandleClickEntryOrchestrationPlan(bottomSheetIsExpanded, {
                handleClickLogMessage: initPlan.handleClickLogMessage,
            })
        );
    });

    if (header) {
        header.addEventListener('click', (e) => {
            const entry = DH.buildBottomSheetHeaderClickEntryOrchestrationPlan(
                !!DH.closest(e.target, initPlan.headerButtonIgnoreSelector),
                bottomSheetIsExpanded
            );
            if (!entry.shouldToggle) return;
            e.stopPropagation();
            applyBottomSheetClickToggleFromPlan(entry);
        });
    }

    bottomSheet.addEventListener('click', (e) => {
        applyBottomSheetBodyClickExpandFromPlan(
            DH.buildBottomSheetBodyClickEntryOrchestrationPlan(
                !!DH.closest(e.target, initPlan.contentSelector),
                bottomSheetIsExpanded,
                { sheetExpandClickLogMessage: initPlan.sheetExpandClickLogMessage }
            )
        );
    });

    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        bottomSheetStartY = e.touches[0].clientY;
        bottomSheetCurrentY = bottomSheetStartY;
        applyBottomSheetDragStartFromPlan(DH.buildBottomSheetDragStartExecutePlan(), bottomSheet);
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        bottomSheetCurrentY = e.touches[0].clientY;
        applyDragVisual(bottomSheetCurrentY - bottomSheetStartY);
    }, { passive: true });

    handle.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        finishDrag(bottomSheetCurrentY - bottomSheetStartY);
    }, { passive: true });

    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        bottomSheetStartY = e.clientY;
        bottomSheetCurrentY = bottomSheetStartY;
        applyBottomSheetDragStartFromPlan(DH.buildBottomSheetDragStartExecutePlan(), bottomSheet);
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        bottomSheetCurrentY = e.clientY;
        applyDragVisual(bottomSheetCurrentY - bottomSheetStartY);
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        finishDrag(bottomSheetCurrentY - bottomSheetStartY);
    });

    applyBottomSheetFocusExpandBindingFromPlan(
        DH.buildBottomSheetFocusExpandBindingPlan(initPlan.focusExpandInputIds)
    );

    syncBottomSheetOverlapFabs();
}

function applyBottomSheetStateFromPlan(execute) {
    const DH = _domHelpers();
    if (!execute || !execute.shouldApply) return;

    const bottomSheet = document.getElementById(execute.bottomSheetId || DH.BOTTOM_SHEET_ID);
    if (!bottomSheet) return;

    if (execute.expandLogMessage) console.log(execute.expandLogMessage);
    if (execute.collapseLogMessage) console.log(execute.collapseLogMessage);

    (execute.clearInlineStyles || []).forEach((prop) => {
        bottomSheet.style[prop] = '';
    });

    if (execute.setExpandedState) {
        bottomSheet.classList.add(execute.expandedClass || DH.BOTTOM_SHEET_EXPANDED_CLASS);
        bottomSheet.setAttribute('aria-expanded', execute.ariaExpanded || 'true');
        bottomSheetIsExpanded = true;
        if (execute.expandedLogMessage) {
            console.log(execute.expandedLogMessage, bottomSheet.className);
        }
    } else if (execute.setExpandedState === false) {
        bottomSheet.classList.remove(execute.expandedClass || DH.BOTTOM_SHEET_EXPANDED_CLASS);
        bottomSheet.setAttribute('aria-expanded', execute.ariaExpanded || 'false');
        bottomSheetIsExpanded = false;
        if (execute.resetContentScroll && execute.contentSelector) {
            const content = bottomSheet.querySelector(execute.contentSelector);
            if (content) content.scrollTop = 0;
        }
    }

    if (execute.syncOverlapFabs) syncBottomSheetOverlapFabs();
}

/**
 * expandBottomSheet function
 * @function expandBottomSheet
 * @returns {*} Return value description
 */
function expandBottomSheet() {
    applyBottomSheetStateFromPlan(
        _domHelpers().buildExpandBottomSheetEntryOrchestrationPlan().execute
    );
}

/**
 * collapseBottomSheet function
 * @function collapseBottomSheet
 * @returns {*} Return value description
 */
function collapseBottomSheet() {
    applyBottomSheetStateFromPlan(
        _domHelpers().buildCollapseBottomSheetEntryOrchestrationPlan().execute
    );
}


/**
 * Apply route preview panel DOM patches from a pure DOM apply plan.
 * @param {Object} domPlan - from buildRoutePreviewPanelDomApplyPlan
 */
function applyRoutePreviewPanelDomFromPlan(domPlan) {
    const executePlan = _routeSelection().buildRoutePreviewPanelDomExecutePlan(domPlan);
    if (!executePlan.shouldExecute) return;

    const ids = executePlan.elementIds;
    const patches = executePlan.patches;

    const previewDistanceEl = document.getElementById(ids.previewDistance);
    if (previewDistanceEl && patches.previewDistance) {
        previewDistanceEl.dataset.km = patches.previewDistance.datasetKm;
        previewDistanceEl.textContent = patches.previewDistance.textContent;
    }

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text != null) el.textContent = text;
    };
    setText(ids.previewDuration, patches.previewDuration && patches.previewDuration.textContent);
    setText(ids.previewRoute, patches.previewRoute && patches.previewRoute.textContent);
    setText(ids.previewFuelCost, patches.previewFuelCost && patches.previewFuelCost.textContent);
    setText(ids.previewTollCost, patches.previewTollCost && patches.previewTollCost.textContent);
    setText(ids.previewCAZCost, patches.previewCAZCost && patches.previewCAZCost.textContent);
    setText(ids.previewTotalCost, patches.previewTotalCost && patches.previewTotalCost.textContent);
    setText(ids.previewRoutingMode, patches.previewRoutingMode && patches.previewRoutingMode.textContent);
    setText(ids.previewVehicleType, patches.previewVehicleType && patches.previewVehicleType.textContent);

    const fuelLitresEl = document.getElementById(ids.previewFuelLitres);
    if (fuelLitresEl && patches.previewFuelLitres) {
        if (patches.previewFuelLitres.visible) {
            fuelLitresEl.textContent = patches.previewFuelLitres.textContent;
            fuelLitresEl.style.display = patches.previewFuelLitres.display;
        } else {
            fuelLitresEl.style.display = patches.previewFuelLitres.display;
        }
    }

    const cazStatusContainer = document.getElementById(ids.cazStatusContainer);
    if (cazStatusContainer && patches.cazStatusContainer) {
        if (patches.cazStatusContainer.visible) {
            cazStatusContainer.innerHTML = patches.cazStatusContainer.innerHtml;
            cazStatusContainer.style.display = patches.cazStatusContainer.display;
        } else {
            cazStatusContainer.style.display = patches.cazStatusContainer.display;
        }
    }

    const hazardContainer = document.getElementById(ids.hazardInfoContainer);
    if (hazardContainer && patches.hazardInfoContainer) {
        const plan = patches.hazardInfoContainer;
        const hazardTitleEl = hazardContainer.querySelector('h4');
        const hazardCountLabel = hazardContainer.querySelector('[data-hazard-count-label]');
        const penaltyRow = hazardContainer.querySelector('#previewHazardPenalty')?.closest('div');
        const countEl = document.getElementById('previewHazardCount');
        const penaltyEl = document.getElementById('previewHazardPenalty');
        if (plan.visible && countEl) {
            countEl.textContent = plan.count;
            if (hazardCountLabel) hazardCountLabel.textContent = plan.countLabel;
            if (hazardTitleEl) hazardTitleEl.textContent = plan.title;
            if (penaltyRow) penaltyRow.style.display = plan.penaltyRowDisplay;
            if (penaltyEl && plan.penaltyText) {
                penaltyEl.textContent = plan.penaltyText;
            }
            hazardContainer.style.background = plan.containerBackground;
            hazardContainer.style.borderLeftColor = plan.containerBorderLeftColor;
            hazardContainer.style.display = plan.containerDisplay;
        } else {
            hazardContainer.style.display = plan.containerDisplay;
        }
    }

    const altContainer = document.getElementById(ids.previewAlternativeRoutesContainer);
    if (altContainer && patches.previewAlternativeRoutesContainer
        && patches.previewAlternativeRoutesContainer.display != null) {
        altContainer.style.display = patches.previewAlternativeRoutesContainer.display;
    }
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
let lastTurnDetectRouteVertexIndex = 0;
let voiceFrequencyMode = localStorage.getItem('voiceFrequencyMode') || 'all';
let HAZARD_WARNING_DISTANCE = 500;

// Distance-to-destination announcement variables
let lastDestinationAnnouncementDistance = Infinity;
const DESTINATION_ANNOUNCEMENT_DISTANCES = [10000, 5000, 2000, 1000, 500, 100]; // meters (10km, 5km, 2km, 1km, 500m, 100m)

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
let initialETAMovementRetries = 0;
const ETA_CHANGE_THRESHOLD_MS = 300000; // Announce if ETA changes by >5 minutes (300,000 ms)
const ETA_MIN_INTERVAL_MS = 60000; // Minimum 1 minute between any ETA announcements (prevents excessive frequency)

let initialETAAnnouncementTimeoutId = null;
let lastNavTrafficFetchAt = 0;
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
        getCurrentBatteryLevel: () => currentBatteryLevel,
        getCurrentLat: () => currentLat,
        getCurrentLon: () => currentLon,
        getLastCalculatedRoute: () => window.lastCalculatedRoute,
        getRoutePolyline: () => routePolyline,
        getCurrentRoutingMode: () => currentRoutingMode,
        getVoiceAnnouncementsEnabled: () => voiceAnnouncementsEnabled,
        g: (key) => {
            switch (key) {
            case 'lastETAAnnouncementTime': return lastETAAnnouncementTime;
            case 'lastAnnouncedETA': return lastAnnouncedETA;
            case 'initialETAMovementRetries': return initialETAMovementRetries;
            case 'initialETAAnnouncementTimeoutId': return initialETAAnnouncementTimeoutId;
            default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'lastETAAnnouncementTime': lastETAAnnouncementTime = val; break;
            case 'lastAnnouncedETA': lastAnnouncedETA = val; break;
            case 'initialETAMovementRetries': initialETAMovementRetries = val; break;
            case 'initialETAAnnouncementTimeoutId': initialETAAnnouncementTimeoutId = val; break;
            default: break;
            }
        },
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

// ===== PHASE 2: PWA AUTO-RELOAD FUNCTIONS =====

/** Prevent duplicate reloads when Check Updates and Refresh App fire close together. */
function scheduleAppReload(reason, delayMs) {
    const plan = _pwaInstall().buildScheduleAppReloadPlan({
        reason,
        delayMs,
        alreadyScheduled: !!window.__voyagrReloadScheduled,
    });
    if (!plan.shouldSchedule) {
        console.log(plan.skipLogMessage, plan.reason);
        return false;
    }
    window.__voyagrReloadScheduled = true;
    setTimeout(() => {
        window.location.reload();
    }, plan.delayMs);
    return true;
}

/** Repaint map after bottom-sheet/tab layout changes (common after PWA reload). */
function scheduleMapRepaintAfterUiChange() {
    const execute = _pwaInstall().buildScheduleMapRepaintAfterUiChangePlan();
    if (!execute.shouldRepaint) return;

    const repaint = () => {
        if (typeof window[execute.handlerName] === 'function') {
            window[execute.handlerName]();
        }
    };
    if (execute.immediate) repaint();
    if (execute.requestAnimationFrame) requestAnimationFrame(repaint);
    (execute.delayedRepaintsMs || []).forEach((ms) => setTimeout(repaint, ms));
}

/** Restore active tab and bottom-sheet state saved before a reload/update. */
function restoreUiStateAfterReload() {
    const pending = window.__voyagrPendingUiRestore;
    const execute = _pwaInstall().buildRestoreUiStateAfterReloadExecutePlan(pending);
    if (!execute.shouldRestore) return;
    window.__voyagrPendingUiRestore = null;

    try {
        if (execute.activeTab && typeof switchTab === 'function') {
            switchTab(execute.activeTab);
        }
        if (execute.bottomSheetExpanded === true && typeof expandBottomSheet === 'function') {
            expandBottomSheet();
        } else if (execute.bottomSheetExpanded === false && typeof collapseBottomSheet === 'function') {
            collapseBottomSheet();
        }
        if (execute.scheduleMapRepaint) scheduleMapRepaintAfterUiChange();
        console.log(execute.restoreLogPrefix, pending);
    } catch (e) {
        console.warn(execute.errorLogPrefix, e);
    }
}

/**
 * saveAppState function
 * @function saveAppState
 * @returns {*} Return value description
 */
function applyRestoreAppStateFromPlan(apply, orch) {
    if (!apply || !apply.shouldApply) return;

    (apply.storagePatches || []).forEach(({ key, value }) => {
        localStorage.setItem(key, value);
    });
    if (apply.pendingUiRestore) {
        window[apply.pendingUiRestoreProperty] = apply.pendingUiRestore;
    }
    localStorage.removeItem(apply.removeAppStateKey);
    console.log(apply.restoredLogMessage);
}

function saveAppState() {
    const AS = _appState();
    try {
        const execute = AS.buildSaveAppStateExecutePlan({
            avoidTolls: isAvoidTollsEnabled(),
            getStorageItem: (key) => localStorage.getItem(key),
            activeTab: typeof getCurrentVisibleTab === 'function' ? getCurrentVisibleTab() : 'navigation',
            bottomSheetExpanded: typeof bottomSheetIsExpanded !== 'undefined' ? bottomSheetIsExpanded : true,
        });
        if (!execute.shouldSave) return;
        localStorage.setItem(execute.storageKey, execute.storageValue);
        console.log(execute.logMessage);
    } catch (e) {
        console.log(AS.buildSaveAppStateExecutePlan().errorLogPrefix, e);
    }
}

function restoreAppState() {
    const AS = _appState();
    const orch = AS.buildRestoreAppStateOrchestrationPlan();
    if (window[orch.restoredFlagProperty]) {
        return;
    }
    window[orch.restoredFlagProperty] = true;

    try {
        const saved = localStorage.getItem(orch.storageKey);
        if (!saved) return;

        const state = JSON.parse(saved);
        const execute = AS.buildRestoreAppStateExecutePlan(state);
        applyRestoreAppStateFromPlan(AS.buildRestoreAppStateApplyPlan(execute, orch), orch);
    } catch (e) {
        console.log(AS.buildRestoreAppStateExecutePlan().errorLogPrefix, e);
    }
}

/**
 * Refresh the PWA app - saves state and reloads
 */
function refreshApp() {
    const execute = _pwaInstall().buildRefreshAppExecutePlan();
    if (!execute.shouldRefresh) return;

    showStatus(execute.statusRefreshing.message, execute.statusRefreshing.type);
    if (execute.saveAppState) saveAppState();

    if (!scheduleAppReload(execute.reloadReason, execute.reloadDelayMs)) {
        showStatus(
            execute.alreadyScheduledStatus.message,
            execute.alreadyScheduledStatus.type
        );
    }
}

/**
 * Check for PWA updates and apply if available
 */
async function checkForUpdates() {
    const PWA = _pwaInstall();
    const preflight = PWA.buildCheckForUpdatesPreflightPlan({
        hasServiceWorker: 'serviceWorker' in navigator,
    });

    if (preflight.action === 'unsupported') {
        showStatus(preflight.statusMessage, preflight.statusType);
        return;
    }

    showStatus(preflight.statusChecking.message, preflight.statusChecking.type);

    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
            const missing = PWA.buildCheckForUpdatesRegistrationOutcomePlan({ hasRegistration: false });
            showStatus(missing.statusMessage, missing.statusType);
            return;
        }

        await safeServiceWorkerUpdate(registration, 'manual');

        const outcome = PWA.buildCheckForUpdatesRegistrationOutcomePlan({
            hasRegistration: true,
            hasWaiting: !!registration.waiting,
            hasInstalling: !!registration.installing,
        });

        if (outcome.action === 'activate-waiting') {
            showStatus(outcome.statusMessage, outcome.statusType);
            if (outcome.saveAppState) saveAppState();
            registration.waiting.postMessage({ type: outcome.skipWaitingMessageType });
            return;
        }

        showStatus(outcome.statusMessage, outcome.statusType);
    } catch (error) {
        console.error(preflight.errorLogPrefix, error);
        showStatus(preflight.errorStatus.message, preflight.errorStatus.type);
    }
}

/**
 * Display PWA version info
 */
function displayPWAVersion() {
    const execute = _pwaInstall().buildDisplayPwaVersionExecutePlan();
    if (!execute.shouldUpdate) return;
    const versionElement = document.getElementById(execute.elementId);
    if (versionElement) versionElement.textContent = execute.versionText;
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
    return VoyagrLiveDataRefreshOrchestration.getAdaptiveRefreshInterval(baseInterval);
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
        const DH = _domHelpers();
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
                calculateDistanceMeters(window.lastAutoGpsLat, window.lastAutoGpsLon, lat, lon) > 0.05) {
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
// ===== GEOCODING ORCHESTRATION =====
// Orchestration lives in static/js/app/geocoding-orchestration.js (bound at file end).

function getGeocodingOrchestrationRuntime() {
    return {
        geocodingLocations: () => _geocodingLocations(),
        searchAutocomplete: () => _searchAutocomplete(),
        getAutoGpsEnabled: () => autoGpsEnabled,
        g: (key) => {
            switch (key) {
            case 'mapPickerMode': return mapPickerMode;
            case 'isGeocoding': return isGeocoding;
            default: return undefined;
            }
        },
        s: (key, val) => {
            switch (key) {
            case 'mapPickerMode': mapPickerMode = val; break;
            case 'isGeocoding': isGeocoding = val; break;
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

// ===== TURN-BY-TURN NAVIGATION FUNCTIONS =====
function applyNavStartRuntimeFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    if (apply.resetVoiceOnStart) {
        resetVoiceAnnouncementStateForNewRoute();
    }

    routeInProgress = apply.routeInProgress;
    currentStepIndex = apply.currentStepIndex;
    currentRouteSteps = apply.maneuvers;

    if (apply.resetSessionCounters) {
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
    }

    if (apply.createEmptyEtaSnapshot) {
        window.navETASnapshot = _eta().createEmptyNavETASnapshot();
    }
}

function applyNavStartPolylineFromPlan(execute, stateInit) {
    if (!execute || !execute.shouldInit) return false;

    try {
        if (execute.usePersistedPolyline && execute.persistedPolyline) {
            routePolyline = execute.persistedPolyline;
            console.log(
                execute.polylineDecodeLogPrefix,
                routePolyline.length,
                execute.persistedPolylineLogSuffix
            );
        } else {
            routePolyline = decodePolyline(execute.geometry, execute.navPrecision);
            console.log(
                execute.polylineDecodeLogPrefix,
                routePolyline.length,
                'points',
                `(precision ${execute.navPrecision})`
            );
        }
        console.log(stateInit.maneuversLogPrefix, currentRouteSteps.length, 'steps');

        if (execute.persistActiveRoute) persistActiveRoute();
        if (execute.precacheTiles) precacheRouteTiles(routePolyline);

        if (!routePolyline || routePolyline.length === 0) {
            console.error(execute.emptyPolylineErrorLog);
            showStatus(execute.invalidGeometryStatusMessage, 'error');
            return false;
        }

        if (execute.primeVehicleWhenPositionKnown && currentLat != null && currentLon != null) {
            primeVehicleMarkerOnRoute(currentLat, currentLon);
        } else if (execute.resetSnappedIndexWhenNoPosition) {
            lastSnappedRouteIndex = 0;
        }
        return true;
    } catch (e) {
        console.error(execute.decodeGeometryErrorLogPrefix, e);
        showStatus(execute.decodeGeometryErrorStatusMessage, 'error');
        return false;
    }
}

function applyNavStartWakeLockFromPlan(MC, stateInit, wakeLockApiAvailable) {
    const wakeLockExecute = MC.buildNavStartWakeLockExecutePlan(!!wakeLockApiAvailable, stateInit);
    if (!wakeLockExecute.shouldRequest) {
        if (wakeLockExecute.unsupportedLog) console.log(wakeLockExecute.unsupportedLog);
        return;
    }

    navigator.wakeLock.request(wakeLockExecute.lockType)
        .then((wakeLock) => {
            window[wakeLockExecute.windowProperty] = wakeLock;
            console.log(wakeLockExecute.acquireLog);
            showStatus(wakeLockExecute.successStatusMessage, wakeLockExecute.successStatusType);

            wakeLock.addEventListener('release', () => {
                console.log(wakeLockExecute.releaseLog);
            });
        })
        .catch((err) => {
            console.log(wakeLockExecute.failureLogPrefix, err.name, err.message);
        });
}

function applyNavStartFabDomFromPlan(fabExecute) {
    if (!fabExecute || !fabExecute.shouldApply) return;

    mapFollowingActive = fabExecute.mapFollowingActive;
    (fabExecute.elementDisplays || []).forEach(({ id, display }) => {
        const el = document.getElementById(id);
        if (el) el.style.display = display;
    });
    const zoomFollowBtn = document.getElementById('zoomFollowToggle');
    if (zoomFollowBtn && fabExecute.applyZoomFollowButton) {
        applyZoomFollowButtonUi(zoomFollowBtn, zoomAndFollowEnabled);
    }
    const driverPerspectiveBtn = document.getElementById('driverPerspectiveToggle');
    if (driverPerspectiveBtn && fabExecute.applyDriverPerspectiveToggle) {
        _toggleUI().applyToggleButton(driverPerspectiveBtn, fabExecute.applyDriverPerspectiveToggle);
    }
    if (fabExecute.updateRoadReportFab) updateRoadReportFabVisibility();
    if (fabExecute.updateRecenterButton) updateRecenterButtonVisibility();
    if (fabExecute.updateSpeedWidget) updateSpeedWidgetVisibility();
}

function applyNavStartServicesFromPlan(services) {
    if (!services) return;

    const lifecycle = services.lifecycle || {};
    if (lifecycle.startGpsIfInactive) startGPSTracking();

    const driverViewSchedule = services.driverViewSchedule;
    if (driverViewSchedule && driverViewSchedule.shouldSchedule) {
        setTimeout(() => {
            const when = driverViewSchedule.applyWhenReady;
            if (!when.hasMap || !when.hasPosition) return;
            if (when.zoomAndFollowEnabled && when.mapFollowingActive) {
                applyLiveNavigationCamera();
            }
        }, driverViewSchedule.delayMs);
    }

    if (lifecycle.startLiveDataRefresh) startLiveDataRefresh();
    if (lifecycle.updateEta) void updateETACalculation();
    if (lifecycle.scheduleInitialEtaAnnouncement) scheduleInitialETAAnnouncement();

    if (lifecycle.startAutoTraffic) {
        startAutoTrafficUpdates();
        console.log(lifecycle.autoTrafficLogMessage);
    }
    if (lifecycle.startRouteTraffic) {
        startRouteTrafficUpdates();
        console.log(lifecycle.routeTrafficLogMessage);
    }

    applyNavStartFabDomFromPlan(services.fabExecute);

    if (lifecycle.showTurnWidget) {
        const turnExecute = _turnInstructions().buildNavStartTurnWidgetExecutePlan({
            currentLat,
            currentLon,
            steps: currentRouteSteps,
            stepIndex: currentStepIndex,
            polyline: routePolyline,
            haversineDistanceMeters: _routeGeometry().haversineDistanceMeters,
            resolveRoadClass: (step) => step.road_class || _routeGeometry().inferRoadClassFromManeuver(step),
        });
        if (turnExecute.shouldShowWidget) {
            showTurnInstructionWidget();
            if (turnExecute.updateFromGps) {
                updateTurnWidgetFromPosition(currentLat, currentLon);
            } else if (turnExecute.initFromRoute) {
                const turnInit = _turnInstructions().buildNavStartTurnInstructionInit(
                    turnExecute.steps,
                    turnExecute.stepIndex,
                    turnExecute.polyline,
                    {
                        haversineDistanceMeters: turnExecute.haversineDistanceMeters,
                        resolveRoadClass: turnExecute.resolveRoadClass,
                    }
                );
                if (turnInit) {
                    updateTurnInstructionDisplay(turnInit);
                }
            }
        }
    }

    if (lifecycle.showJourneySummaryBar) showJourneySummaryBar();
    if (lifecycle.updateNavFabVisibility) updateNavigationFabVisibility();
    try {
        voyagrShowMapIconHint(lifecycle.showMapIconHint);
    } catch (_hintErr) {
        /* ignore */
    }

    const navStartFeedback = services.userFeedback;
    if (navStartFeedback) {
        sendNotification(
            navStartFeedback.notificationTitle,
            navStartFeedback.notificationBody,
            'success'
        );
        if (navStartFeedback.speakMessage) {
            speakMessage(navStartFeedback.speakMessage);
        }
        showStatus(navStartFeedback.statusMessage, navStartFeedback.statusType);
    }

    const volumeHintSchedule = _deviceEnvironment().buildNavStartVolumeHintSchedulePlan({
        delayMs: services.volumeHintDelayMs,
    });
    try {
        if (volumeHintSchedule.shouldSchedule) {
            setTimeout(() => {
                try {
                    showVolumeHintForNavigation();
                } catch (e) {
                    console.warn(volumeHintSchedule.errorLogPrefix, e);
                }
            }, volumeHintSchedule.delayMs);
        }
    } catch (e) {
        console.warn(volumeHintSchedule.scheduleErrorLogPrefix, e);
    }
}

function applyNavStopRuntimeFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    routeInProgress = apply.routeInProgress;
    routeJoinConfirmedForDeviation = apply.routeJoinConfirmedForDeviation;
    if (apply.clearRerouteFailureRetries) clearRerouteFailureRetries();
    currentStepIndex = apply.currentStepIndex;
    if (apply.clearRouteSteps) currentRouteSteps = [];
    if (apply.resetVehicleMarker) resetVehicleMarkerDisplayState();
    if (apply.clearPersistedRoute) clearPersistedRoute();
    mapFollowingActive = apply.mapFollowingActive;
    journeyOverviewActive = apply.journeyOverviewActive;
    savedMapState = apply.savedMapState;
    initialETAMovementRetries = apply.initialETAMovementRetries;
}

function applyNavStopWakeLockReleaseFromPlan(lifecycle) {
    if (!lifecycle || !lifecycle.releaseWakeLock || !window.screenWakeLock) return;

    window.screenWakeLock.release()
        .then(() => {
            console.log(lifecycle.wakeLockReleaseLog);
            window.screenWakeLock = null;
        })
        .catch((err) => {
            console.log(lifecycle.wakeLockReleaseErrorLogPrefix, err);
        });
}

function applyNavStopFabDomFromPlan(fabExecute) {
    if (!fabExecute || !fabExecute.shouldApply) return;

    (fabExecute.elementDisplays || []).forEach(({ id, display }) => {
        const el = document.getElementById(id);
        if (el) el.style.display = display;
    });
    if (fabExecute.updateRoadReportFab) updateRoadReportFabVisibility();
    if (fabExecute.updateNavFabVisibility) updateNavigationFabVisibility();
    if (fabExecute.updateSpeedWidget) updateSpeedWidgetVisibility();
    if (fabExecute.hideTurnWidget) hideTurnInstructionWidget();
    if (fabExecute.hideJourneySummaryBar) hideJourneySummaryBar();
}

function applyNavStopServicesFromPlan(services, wasRouteInProgress) {
    if (!services) return false;

    const lifecycle = services.lifecycle || {};
    if (lifecycle.resetNavigationArrival) resetNavigationArrivalState();

    const traveled = services.traveledSummary;
    if (traveled && traveled.shouldBuild && window.lastCalculatedRoute && wasRouteInProgress) {
        const summaryRoute = buildTraveledJourneyRoute(window.lastCalculatedRoute);
        if (traveled.persistCompletedTrip) void persistCompletedTrip(summaryRoute);
        if (traveled.showJourneySummary) showJourneySummary(summaryRoute);
    }

    if (lifecycle.stopGpsTracking) stopGPSTracking();
    if (lifecycle.hideRoadNameBar) hideRoadNameBar();

    applyNavStopWakeLockReleaseFromPlan(lifecycle);

    if (lifecycle.stopLiveDataRefresh) stopLiveDataRefresh();
    if (lifecycle.clearInitialEtaAnnouncement) clearInitialETAAnnouncement();

    if (lifecycle.stopAutoTraffic) {
        stopAutoTrafficUpdates();
        console.log(lifecycle.autoTrafficStopLog);
    }
    if (lifecycle.stopRouteTraffic) {
        stopRouteTrafficUpdates();
        console.log(lifecycle.routeTrafficStopLog);
    }

    applyNavStopFabDomFromPlan(services.fabExecute);

    if (lifecycle.stopArModeIfActive && arModeActive) {
        stopARMode();
    }

    const pitch = services.mapPitchReset;
    if (pitch && pitch.shouldApply && map) {
        if (pitch.driverPerspectiveEnabled) {
            applyDriverPerspective();
        } else {
            map.easeTo({ pitch: pitch.pitch, bearing: pitch.bearing, duration: pitch.durationMs });
        }
    }

    const pwa = services.pwaUpdate;
    if (pwa && pwa.shouldApply && updatePending) {
        showStatus(pwa.statusMessage, 'success');
        saveAppState();
        setTimeout(() => {
            window.location.reload();
        }, pwa.reloadDelayMs);
        return true;
    }

    const feedback = services.userFeedback;
    if (feedback) {
        showStatus(feedback.statusMessage, feedback.statusType || 'info');
        if (feedback.notification) {
            sendNotification(feedback.notification.title, feedback.notification.body, 'info');
        }
    }
    return false;
}

/**
 * startTurnByTurnNavigation function
 * @function startTurnByTurnNavigation
 * @param {*} routeData - Route payload (`geometry`, `maneuvers`, …)
 * @param {{ resumeStepIndex?: number, fromPersistedResume?: boolean }|null} [navStartOpts] - Optional resume / offline tweaks
 */
function startTurnByTurnNavigation(routeData, navStartOpts = null) {
    const MC = _mapControls();
    const mergedRoute = _routeSelection().mergeNavigationRouteFromSelected(
        routeData, routeOptions, selectedRouteIndex
    );
    const entry = MC.buildNavStartEntryOrchestrationPlan(mergedRoute, navStartOpts);
    if (!entry.shouldStart) {
        showStatus(entry.errorStatusMessage, 'error');
        return;
    }
    routeData = entry.routeData;

    if (entry.mergeLastCalculatedRoute) {
        window.lastCalculatedRoute = Object.assign({}, window.lastCalculatedRoute || {}, routeData);
    }

    const stateInit = entry.stateInit;
    applyNavStartRuntimeFromPlan(MC.buildNavStartRuntimeApplyPlan(stateInit));

    const polylineOk = applyNavStartPolylineFromPlan(
        MC.buildNavStartPolylineInitExecutePlan(stateInit),
        stateInit
    );
    if (!polylineOk) return;

    applyNavStartWakeLockFromPlan(MC, stateInit, 'wakeLock' in navigator);

    const traffic = VoyagrTrafficOrchestration.getTrafficSettingsSnapshot();
    applyNavStartServicesFromPlan(MC.buildNavStartServicesOrchestrationPlan({
        stateInit,
        isTrackingActive,
        autoTrafficUpdateEnabled: traffic.autoTrafficUpdateEnabled,
        routeTrafficEnabled: traffic.routeTrafficEnabled,
        hasMap: !!map,
        hasPosition: currentLat != null && currentLon != null,
        zoomAndFollowEnabled,
        mapFollowingActive,
        driverPerspectiveActive: shouldUsePitchedDrivingCamera(),
        wakeLockApiAvailable: 'wakeLock' in navigator,
    }));
}

/**
 * stopTurnByTurnNavigation function
 * @function stopTurnByTurnNavigation
 * @returns {*} Return value description
 */
function stopTurnByTurnNavigation() {
    const MC = _mapControls();
    const entry = MC.buildNavStopEntryOrchestrationPlan({
        routeInProgress,
        isTrackingActive,
        lastCalculatedRoute: window.lastCalculatedRoute,
        hasWakeLock: !!window.screenWakeLock,
        arModeActive,
        driverPerspectiveEnabled,
        updatePending,
    });
    if (!entry.shouldStop) {
        if (entry.updateNavFabOnly) updateNavigationFabVisibility();
        return;
    }

    applyNavStopRuntimeFromPlan(MC.buildNavStopRuntimeApplyPlan(entry.stateReset));
    if (applyNavStopServicesFromPlan(entry.services, entry.wasRouteInProgress)) return;
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

    const progress = _routeGeometry().buildVertexDestinationProgress(userLat, userLon, routePolyline);

    const turnInfo = document.getElementById('turnInfo');
    if (turnInfo) {
        const distanceKm = progress.distanceToEndMeters / 1000;
        turnInfo.innerHTML = _eta().buildDestinationProgressPanelHtml(
            convertDistance(distanceKm),
            getDistanceUnit(),
            progress.progressPercent
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
    const POI = _poiSearch();
    closePOIModal();
    document.body.insertAdjacentHTML('beforeend', POI.buildPoiResultsModalHtml(results, type,
        POI.buildPoiResultsModalDisplayOpts(
            results,
            type,
            userLat,
            userLon,
            (distanceM) => _units().formatPoiDistanceMeters(distanceM, distanceUnit)
        )
    ));
}

/**
 * Close the POI results modal
 */
function closePOIModal() {
    const POI = _poiSearch();
    const modal = document.getElementById(POI.POI_MODAL_ID);
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

    showStatus(_poiSearch().getPoiSelectDestinationStatusMessage(poiName), 'success');

    // Automatically calculate route
    calculateRoute();
}

// ===== ROUTE AVOIDANCE PREFERENCES =====
function applyRouteLegAvoidanceToggleFromPlan(dispatch) {
    if (!dispatch) return;

    const TU = _toggleUI();
    const btn = document.getElementById(dispatch.buttonId);
    if (!btn) return;

    TU.applyToggleButton(btn, dispatch.nextEnabled, TU.TOGGLE_SWITCH_OPTS);
    localStorage.setItem(dispatch.storage.storageKey, dispatch.storage.value);
    console.log(`[Avoidance] ${dispatch.logLine}`);
}

function toggleAvoidancePreference(pref) {
    const RP = _routePrefs();
    const btn = document.getElementById(RP.resolveRouteLegAvoidanceButtonId(pref));
    if (!btn) return;

    applyRouteLegAvoidanceToggleFromPlan(
        RP.buildRouteLegAvoidanceToggleEntryOrchestrationPlan(
            pref,
            btn.classList.contains('active')
        ).dispatch
    );
}

function applyLoadRouteLegAvoidanceTogglesFromPlan(items) {
    const TU = _toggleUI();
    (items || []).forEach((item) => {
        const btn = document.getElementById(item.buttonId);
        if (btn) {
            TU.applyToggleButton(btn, item.enabled, TU.TOGGLE_SWITCH_OPTS);
        }
    });
}

function loadAvoidancePreferences() {
    applyLoadRouteLegAvoidanceTogglesFromPlan(
        _routePrefs().buildLoadRouteLegAvoidanceTogglesEntryOrchestrationPlan(localStorage).items
    );
}


// ===== ROAD NAME DISPLAY (TomTom Reverse Geocoding) =====

let lastRoadNameFetch = 0;
let lastRoadNamePosition = null;
let currentRoadDisplayName = '';

function fetchRoadNameThrottled(lat, lon) {
    const RN = _roadNameDisplay();
    const tick = RN.buildRoadNameFetchTickPlan({
        lat,
        lon,
        now: Date.now(),
        lastFetch: lastRoadNameFetch,
        lastPosition: lastRoadNamePosition,
        calculateDistance: calculateDistanceMeters,
    });
    if (tick.action === 'skip') return;

    const apply = RN.buildRoadNameFetchStateApplyPlan(tick);
    if (apply.action === 'skip') return;

    lastRoadNameFetch = apply.statePatch.lastFetch;
    lastRoadNamePosition = apply.statePatch.lastPosition;

    fetch(apply.fetch.url)
        .then(r => r.json())
        .then(data => {
            const domApply = RN.buildRoadNameApiResponseDomApplyPlan(data);
            if (domApply.action !== 'apply') return;
            currentRoadDisplayName = domApply.statePatch.currentRoadDisplayName;
            const bar = document.getElementById('roadNameBar');
            const label = document.getElementById('currentRoadName');
            if (bar && label) {
                label.textContent = domApply.roadName;
                bar.style.display = domApply.barDisplay;
            }
        })
        .catch(err => {
            console.debug('[RoadName] Fetch error:', err);
        });
}

function hideRoadNameBar() {
    const plan = _roadNameDisplay().getRoadNameBarHidePlan();
    const bar = document.getElementById('roadNameBar');
    if (bar) bar.style.display = plan.barDisplay;
    currentRoadDisplayName = plan.roadName;
}


// ===== SEARCH ALONG ROUTE =====

function searchAlongRoute() {
    const POI = _poiSearch();
    const cats = document.getElementById('alongRouteCategories');
    if (cats) {
        cats.style.display = POI.toggleAlongRouteCategoriesDisplay(cats.style.display);
    }
}

function searchAlongRouteByType(type) {
    const POI = _poiSearch();
    if (!POI.canSearchAlongRoute(routePolyline ? routePolyline.length : 0)) {
        showStatus(POI.getAlongRouteNoRouteMessage(), 'error');
        return;
    }

    showStatus(POI.getAlongRouteSearchingMessage(type), 'info');

    const routePoints = routePolyline.map(p => [p[0], p[1]]);

    fetch('/api/poi-along-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(POI.buildAlongRouteSearchBody(routePoints, type)),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.results && data.results.length > 0) {
            displayPOIResults(data.results, type, currentLat || 51.5074, currentLon || -0.1278);
            addPOIMarkersToMap(data.results, type);
            showStatus(POI.getAlongRouteResultsMessage(type, data.results.length), 'success');
        } else {
            showStatus(POI.getAlongRouteNoResultsMessage(type), 'info');
        }
    })
    .catch(err => {
        console.error('[AlongRoute] Error:', err);
        showStatus(POI.getAlongRouteSearchFailedMessage(), 'error');
    });
}

function addPOIMarkersToMap(pois, type) {
    clearPOIMarkers();

    const POI = _poiSearch();
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


// ===== NOTIFICATIONS ORCHESTRATION =====
// Orchestration lives in static/js/app/notifications-orchestration.js (bound at file end).

function getNotificationsOrchestrationRuntime() {
    return {
        deviceEnvironment: () => _deviceEnvironment(),
        getVoiceAnnouncementsEnabled: () => voiceAnnouncementsEnabled,
        getRouteInProgress: () => routeInProgress,
        getNavigationArrivalTriggered: () => _navigationArrivalTriggered,
        s: (key, val) => {
            if (key === 'navigationArrivalTriggered') _navigationArrivalTriggered = val;
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

    const RP = _routePrefs();
    const buttonId = RP.resolveRouteAvoidanceButtonId(pref);
    const button = document.getElementById(buttonId);

    if (!button) {
        console.warn('[Preferences] Button not found for preference:', pref, 'ID:', buttonId);
        return;
    }

    button.classList.toggle('active');
    const isActive = button.classList.contains('active');
    localStorage.setItem(RP.getRouteAvoidancePrefStorageKey(pref), isActive ? 'true' : 'false');

    _toggleUI().applyLabeledToggleButton(button, isActive);

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

function applyHazardToggleStyles(button, enabled) {
    _toggleUI().applyLabeledToggleButton(button, enabled);
}

async function loadHazardCameraTogglesFromApi() {
    const HA = _hazardAlerts();
    const applyTogglePlan = (items) => {
        items.forEach((item) => {
            const btn = document.querySelector(`button.hazard-pref-toggle[data-hazard-type="${item.hazardType}"]`);
            if (btn) applyHazardToggleStyles(btn, item.enabled);
        });
    };

    try {
        const res = await fetch('/api/hazard-preferences');
        const data = await res.json();
        const prefsList = data.success && data.preferences ? data.preferences : [];
        applyTogglePlan(HA.buildHazardCameraTogglesApplyPlan(prefsList));
    } catch (e) {
        console.warn('[HAZARDS] Could not load camera hazard preferences:', e);
        applyTogglePlan(HA.buildHazardCameraTogglesFallbackApplyPlan());
    }
}

async function toggleHazardPreferenceApi(hazardType, ev) {
    if (ev) ev.preventDefault();
    const HA = _hazardAlerts();
    try {
        const res = await fetch('/api/hazard-preferences');
        const data = await res.json();
        if (!data.success || !data.preferences) {
            showStatus('Could not load hazard preferences', 'error');
            return;
        }
        const pref = data.preferences.find(p => p.hazard_type === hazardType);
        const newEnabled = !HA.isHazardPreferenceEnabled(pref);
        const payload = HA.buildHazardPreferenceTogglePayload(hazardType, pref, newEnabled);

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
        showStatus(HA.buildHazardPreferenceToggleStatusMessage(hazardType, newEnabled), 'info');
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
    const RP = _routePrefs();
    const TU = _toggleUI();
    const GC = _gestureControl();
    const LPR = _legacyPrefsRestore();
    const BS = _batterySaving();
    const orch = LPR.buildLoadLegacyPreferencesOrchestrationPlan();

    if (orch.applyRouteAvoidanceToggles) {
        RP.buildRouteAvoidanceTogglesApplyPlan(localStorage).forEach((item) => {
            const button = document.getElementById(item.buttonId);

            if (button) {
                TU.applyLabeledToggleButton(button, item.enabled);
                console.log('[Settings] Loaded preference:', item.pref, '=', item.enabled ? 'enabled' : 'disabled',
                    item.usesDefault ? '(default)' : '');
            } else {
                console.warn('[Settings] Button not found for preference:', item.pref, 'ID:', item.buttonId);
            }
        });
    }

    if (orch.loadHazardCameraTogglesFromApi) loadHazardCameraTogglesFromApi();

    const gestureRestore = LPR.buildRestoreGesturePreferencePlan({
        savedValue: localStorage.getItem(GC.GESTURE_ENABLED_STORAGE_KEY),
        hasDeviceMotion: 'DeviceMotionEvent' in window,
    });
    if (gestureRestore.shouldRestore) {
        gestureEnabled = gestureRestore.gestureEnabled;
        const gestureButton = document.getElementById(gestureRestore.toggle.id);
        if (gestureButton) TU.applyToggleButton(gestureButton, gestureRestore.toggle.enabled);
        const gestureSettings = document.getElementById(gestureRestore.settingsPanel.id);
        if (gestureSettings) gestureSettings.style.display = gestureRestore.settingsPanel.display;
        if (gestureRestore.addDeviceMotionListener) {
            window.addEventListener('devicemotion', handleDeviceMotion);
        }
    }

    const autoGpsRestore = LPR.buildRestoreAutoGpsPreferencePlan({
        savedValue: localStorage.getItem(LPR.AUTO_GPS_STORAGE_KEY),
    });
    if (autoGpsRestore.shouldRestore) {
        const autoGpsToggle = document.getElementById(autoGpsRestore.toggle.id);
        if (autoGpsToggle) {
            autoGpsToggle.checked = autoGpsRestore.toggle.checked;
            autoGpsEnabled = autoGpsRestore.autoGpsEnabled;
            if (autoGpsRestore.startAutoGpsLocation) startAutoGpsLocation();
            console.log(autoGpsRestore.restoreLogMessage);
        }
    }

    const batteryRestore = BS.buildRestoreBatterySavingUiPlan({
        savedValue: localStorage.getItem(BS.BATTERY_SAVING_STORAGE_KEY),
    });
    if (batteryRestore.shouldApply) {
        applyBatterySavingModeFromPlan(batteryRestore);
    }

    if (orch.applySpeedWidgetToggleUi) applySpeedWidgetToggleUi();
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
    const plan = _routeSelection().buildTripInfoApplyPlan(
        distance,
        time,
        fuelCost,
        tollCost,
        {
            distanceText: convertDistance(parseFloat(distance) || 0),
            distUnit: getDistanceUnit(),
            currencySymbol: getCurrencySymbol(),
        },
        _routeSharing().parseSharedRouteDurationMinutes
    );
    if (!plan.visible || !tripInfo) return;

    applyTripInfoDomFromPlan(_routeSelection().buildTripInfoDomApplyPlan(plan.display));
    if (plan.dashFuel) {
        const fuelEl = document.getElementById('fuelCost');
        if (fuelEl) fuelEl.textContent = '-';
    }
    if (plan.dashToll) {
        const tollEl = document.getElementById('tollCost');
        if (tollEl) tollEl.textContent = '-';
    }
    tripInfo.classList.add('show');
    if (plan.showAlongRouteSearch) {
        const alongRouteBtn = document.getElementById('alongRouteSearch');
        if (alongRouteBtn) alongRouteBtn.style.display = 'block';
    }
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
        if (_domHelpers().closest(e.target, '.bottom-sheet-content')) {
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
    const result = _eta().buildTraveledJourneyRoutePatch(route, _navTraveledMeters, _navStartedAt);
    if (!result.patch) return route;
    const out = { ...result.patch };
    if ('distance' in out) {
        try {
            out.distance = `${convertDistance(out.distance_km)} ${getDistanceUnit()}`;
        } catch (_e) {
            delete out.distance;
        }
    }
    if ('time' in out) out.time = `${out.duration_minutes} minutes`;
    return out;
}

/**
 * showJourneySummary function
 * Displays a summary of the completed journey
 * @param {Object} routeData - The route data (from window.lastCalculatedRoute)
 */
function showJourneySummary(routeData) {
    const ETA = _eta();
    const execute = ETA.buildJourneySummaryModalExecutePlan(
        ETA.buildJourneySummaryModalApplyPlan(routeData, {
            traveledMeters: _navTraveledMeters,
            navStartedAt: _navStartedAt,
            convertDistance,
            distUnit: getDistanceUnit(),
            convertSpeed,
            speedUnit: getSpeedUnit(),
            currencySymbol: getCurrencySymbol(),
            adjustCost: adjustCostForUnits,
        })
    );
    if (!execute.shouldShow) return;

    const modal = document.getElementById(execute.modalId);
    if (!modal) return;

    const distanceEl = document.getElementById(execute.elementIds.summaryDistance);
    const timeEl = document.getElementById(execute.elementIds.summaryTime);
    const costEl = document.getElementById(execute.elementIds.summaryCost);
    const speedEl = document.getElementById(execute.elementIds.summaryAvgSpeed);
    if (distanceEl) distanceEl.textContent = execute.distanceText;
    if (timeEl) timeEl.textContent = execute.timeText;
    if (costEl) costEl.textContent = execute.costText;
    if (speedEl) speedEl.textContent = execute.avgSpeedText;

    modal.style.display = 'block';
    if (execute.expandBottomSheet) expandBottomSheet();
    if (execute.logMessage) console.log(execute.logMessage);
}

/**
 * closeJourneySummary function
 * Closes the journey summary modal
 */
function closeJourneySummary() {
    const execute = _eta().buildCloseJourneySummaryExecutePlan();
    if (!execute.shouldClose) return;

    const modal = document.getElementById(execute.modalId);
    if (modal) modal.style.display = 'none';

    if (execute.switchTab) switchTab(execute.switchTab);
    if (execute.clearForm) clearForm();
}

VoyagrParkingOrchestration.bind(getParkingOrchestrationRuntime());
VoyagrTrafficOrchestration.bind(getTrafficOrchestrationRuntime());
VoyagrPorcupineOrchestration.bind(getPorcupineOrchestrationRuntime());
VoyagrGpsOrchestration.bind(getGpsOrchestrationRuntime());
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



// NOTE: toggleDriverPerspective is defined earlier in the file (around line 7711)
// This duplicate was removed to fix the driver's perspective mode conflict

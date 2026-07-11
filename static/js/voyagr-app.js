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
let smartZoomEnabled = localStorage.getItem('smartZoomEnabled') === '1' || true;
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
    showStatus(`Distance unit changed to ${_units().distanceUnitStatusLabel(newUnit)}`, 'success');
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
    showStatus(`Speed unit changed to ${_units().speedUnitStatusLabel(newUnit)}`, 'success');
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
    showStatus(`Temperature unit changed to ${_units().temperatureUnitStatusLabel(newUnit)}`, 'success');
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
function collectSettingsSnapshotRuntimeState() {
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
        autoTrafficUpdateEnabled,
        autoRerouteOnDeviationEnabled,
        speedWidgetEnabled,
    };
}

function saveAllSettings() {
    const SS = _settingsSnapshot();
    const snapshotInput = SS.buildSettingsSnapshotInputPlan(
        collectSettingsSnapshotRuntimeState(),
        collectSettingsFormState()
    );
    const allSettings = SS.buildSettingsSnapshot(snapshotInput);

    localStorage.setItem(SS.SETTINGS_STORAGE_KEY, JSON.stringify(allSettings));
    console.log('[Settings] All settings saved to localStorage', allSettings);

    persistActiveProfile();
}

/**
 * loadAllSettings function
 * @function loadAllSettings
 * @returns {*} Return value description
 */
function applySettingsRestoreFromPlan(plan) {
    if (!plan || !plan.found) return false;

    Object.entries(plan.localStorage || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            localStorage.setItem(key, value);
        }
    });

    const rt = plan.runtime || {};
    if (rt.distanceUnit) distanceUnit = rt.distanceUnit;
    if (rt.currencyUnit) currencyUnit = rt.currencyUnit;
    if (rt.speedUnit) speedUnit = rt.speedUnit;
    if (rt.temperatureUnit) temperatureUnit = rt.temperatureUnit;
    if (rt.currentVehicleType) currentVehicleType = rt.currentVehicleType;
    if (rt.currentRoutingMode) currentRoutingMode = rt.currentRoutingMode;
    if (rt.smartZoomEnabled !== undefined) smartZoomEnabled = rt.smartZoomEnabled;
    if (rt.showCamerasEnabled !== undefined) showCamerasEnabled = rt.showCamerasEnabled;
    if (rt.showOsmTrafficLightsEnabled !== undefined) showOsmTrafficLightsEnabled = rt.showOsmTrafficLightsEnabled;
    if (rt.showOsmRailwayCrossingsEnabled !== undefined) showOsmRailwayCrossingsEnabled = rt.showOsmRailwayCrossingsEnabled;
    if (rt.showTrafficEnabled !== undefined) showTrafficEnabled = rt.showTrafficEnabled;
    if (rt.autoTrafficUpdateEnabled !== undefined) autoTrafficUpdateEnabled = rt.autoTrafficUpdateEnabled;
    if (rt.autoRerouteOnDeviationEnabled !== undefined) autoRerouteOnDeviationEnabled = rt.autoRerouteOnDeviationEnabled;
    if (rt.speedWidgetEnabled !== undefined) speedWidgetEnabled = rt.speedWidgetEnabled;

    return true;
}

function loadAllSettings() {
    const SS = _settingsSnapshot();
    try {
        const saved = localStorage.getItem(SS.SETTINGS_STORAGE_KEY);
        if (!saved) {
            console.log('[Settings] No saved settings found, using defaults');
            return false;
        }

        const settings = JSON.parse(saved);
        console.log('[Settings] Loaded settings from localStorage', settings);
        if (!applySettingsRestoreFromPlan(SS.buildSettingsRestorePlan(settings))) {
            return false;
        }

        console.log('[Settings] All settings restored successfully');
        return true;
    } catch (error) {
        console.error('[Settings] Error loading settings:', error);
        return false;
    }
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
    return {
        ...collectSettingsSnapshotRuntimeState(),
        mlPredictionsEnabled: localStorage.getItem('mlPredictionsEnabled') === 'true',
        voiceAnnouncementsEnabled: localStorage.getItem('voiceAnnouncementsEnabled') === 'true',
        batterySavingEnabled: localStorage.getItem('pref_batterySaving') === 'true',
        gestureControlEnabled: localStorage.getItem('gestureEnabled') === 'true',
    };
}

/**
 * Collect stored preferences for settings UI apply.
 * @returns {Object}
 */
function collectSettingsUiStoredState() {
    let parkingPrefs = {};
    const savedParking = localStorage.getItem('parkingPreferences');
    if (savedParking) {
        try {
            parkingPrefs = JSON.parse(savedParking);
        } catch (e) {
            console.log('[Settings] Error parsing parking preferences:', e);
        }
    }

    return {
        routePreferences: _routePrefs().getRoutePreferences(localStorage),
        parkingPreferences: parkingPrefs,
        mapTheme: localStorage.getItem('mapTheme') || 'standard',
    };
}

/**
 * applySettingsToUI function
 * @function applySettingsToUI
 * @returns {*} Return value description
 */
function applySettingsToUI() {
    try {
        const SS = _settingsSnapshot();
        const plan = SS.buildSettingsUiApplyPlan(
            SS.buildSettingsUiInputPlan(
                collectSettingsUiRuntimeState(),
                collectSettingsUiStoredState()
            )
        );
        applySettingsUiFromPlan(plan);

        console.log('[Settings] All settings applied to UI');
    } catch (error) {
        console.error('[Settings] Error applying settings to UI:', error);
    }
}

/**
 * Apply settings reset from a pure reset plan.
 * @param {Object} plan - from buildSettingsResetPlan
 * @returns {boolean} true when reset was confirmed and applied
 */
function applySettingsResetFromPlan(plan) {
    if (!plan) return false;
    if (!confirm(plan.confirmMessage)) return false;

    (plan.localStorageKeys || []).forEach((key) => {
        localStorage.removeItem(key);
    });

    const defaults = plan.runtimeDefaults || {};
    if (defaults.distanceUnit) distanceUnit = defaults.distanceUnit;
    if (defaults.currencyUnit) currencyUnit = defaults.currencyUnit;
    if (defaults.speedUnit) speedUnit = defaults.speedUnit;
    if (defaults.temperatureUnit) temperatureUnit = defaults.temperatureUnit;
    if (defaults.currentVehicleType) currentVehicleType = defaults.currentVehicleType;
    if (defaults.currentRoutingMode) currentRoutingMode = defaults.currentRoutingMode;
    if (defaults.smartZoomEnabled !== undefined) smartZoomEnabled = defaults.smartZoomEnabled;

    if (plan.reloadAfterReset) {
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
    applySettingsResetFromPlan(_settingsSnapshot().buildSettingsResetPlan());
}

/**
 * exportSettings function
 * @function exportSettings
 * @returns {*} Return value description
 */
function exportSettings() {
    const SS = _settingsSnapshot();
    const plan = SS.buildSettingsExportPlan(
        localStorage.getItem(SS.SETTINGS_STORAGE_KEY),
        new Date().toISOString().split('T')[0]
    );
    if (!plan.ok) {
        showStatus(plan.statusMessage, plan.statusType);
        return;
    }
    const dataBlob = new Blob([plan.prettyJson], { type: plan.mimeType });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = plan.downloadFilename;
    link.click();
    showStatus(plan.statusMessage, plan.statusType);
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
                const SS = _settingsSnapshot();
                const plan = SS.buildSettingsImportParsePlan(event.target.result);
                if (!plan.ok) {
                    showStatus(plan.statusMessage, plan.statusType);
                    return;
                }
                localStorage.setItem(plan.storageKey, plan.storageValue);
                if (plan.restoreAfterImport) loadAllSettings();
                if (plan.applyUiAfterImport) applySettingsToUI();
                showStatus(plan.statusMessage, plan.statusType);
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

/**
 * Build a completed-trip payload from the active route + form fields.
 * @returns {object|null}
 */
function buildCompletedTripRecord(route) {
    const startEl = document.getElementById('start');
    const endEl = document.getElementById('end');
    return _tripHistory().buildCompletedTripRecord({
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

// mergeServerAndLocalTrips — call _tripHistory() at use sites.

function removeLocalTripByLocalId(localId) {
    const raw = loadRawLocalTrips().filter((e) => e.localId !== localId);
    saveRawLocalTrips(raw);
}

function removeLocalTripByServerId(serverId) {
    const raw = loadRawLocalTrips().filter((e) => e.serverId !== serverId);
    saveRawLocalTrips(raw);
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
            allTrips = _tripHistory().mergeServerAndLocalTrips([], loadRawLocalTrips());
            displayTripHistory(allTrips);
            const list = document.getElementById('tripHistoryList');
            if (list && list.firstChild) {
                const banner = document.createElement('div');
                const TH = _tripHistory();
                banner.style.cssText = TH.getTripHistorySignInBannerStyleCssText();
                banner.textContent = TH.buildTripHistorySignInBannerText(allTrips.length > 0);
                list.insertBefore(banner, list.firstChild);
            }
            bindTripHistorySearch();
            return;
        }

        if (data && data.success && Array.isArray(data.trips)) {
            allTrips = _tripHistory().mergeServerAndLocalTrips(data.trips, loadRawLocalTrips());
            displayTripHistory(allTrips);
        } else {
            allTrips = _tripHistory().mergeServerAndLocalTrips([], loadRawLocalTrips());
            displayTripHistory(allTrips);
        }
    } catch (error) {
        console.error('Error loading trip history:', error);
        allTrips = [];
        const list = document.getElementById('tripHistoryList');
        if (list) {
            list.innerHTML = _tripHistory().TRIP_HISTORY_ERROR_HTML;
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
        displayTripHistory(_tripHistory().filterTripsBySearch(allTrips, searchTerm));
    };
}

function displayTripHistory(trips) {
    const listContainer = document.getElementById('tripHistoryList');
    if (!listContainer) return;

    const TH = _tripHistory();

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
            startAddr: _html().escapeHtml(trip.start_address || 'Start'),
            endAddr: _html().escapeHtml(trip.end_address || 'End'),
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
    const RS = _routeSelection();
    const dispatch = RS.buildDisplayAllRoutesMapDispatchPlan(routeOptions);

    console.log('[Routes] ===== displayAllRoutesOnMap called =====');
    console.log('[Routes] routeOptions:', routeOptions ? routeOptions.length : 0, 'routes');

    if (!dispatch.valid) {
        console.warn('[Routes] No routeOptions available!');
        return;
    }

    if (routeLayer && typeof routeLayer.remove === 'function') {
        routeLayer.remove();
        routeLayer = null;
    }

    allRouteLayers.forEach(layer => {
        if (layer && typeof layer.remove === 'function') {
            layer.remove();
        }
    });
    allRouteLayers = [];

    if (dispatch.clearAllRouteLayers) {
        clearAllRouteLayersFromMap();
    }

    if (dispatch.hydratePolylines) {
        RS.hydrateRouteOptionPolylines(routeOptions, decodePolyline);
    }

    const addRouteLayers = () => {
        console.log(`[Routes] Adding route layers (isStyleLoaded: ${map?.isStyleLoaded()})`);
        doAddRouteLayers();
    };

    if (dispatch.requireMap && !map) {
        console.error('[Routes] Map not available');
        return;
    }

    const styleLoad = dispatch.styleLoad || {};
    if (!styleLoad.waitIfNeeded || map.isStyleLoaded()) {
        addRouteLayers();
    } else {
        console.log('[Routes] Waiting for style to load...');
        map.once('style.load', addRouteLayers);
        setTimeout(() => {
            if (styleLoad.skipFallbackIfLayersPresent && allRouteLayers.length === 0) {
                console.log('[Routes] Fallback: adding layers after timeout');
                addRouteLayers();
            }
        }, styleLoad.fallbackTimeoutMs);
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
    if (!applyPlan || !applyPlan.valid) return false;

    try {
        if (map.getLayer(applyPlan.layerId)) {
            map.removeLayer(applyPlan.layerId);
        }
        if (map.getSource(applyPlan.sourceId)) {
            map.removeSource(applyPlan.sourceId);
        }

        map.addSource(applyPlan.sourceId, {
            type: 'geojson',
            data: applyPlan.geoJsonFeature,
        });

        map.addLayer({
            id: applyPlan.layerId,
            type: 'line',
            source: applyPlan.sourceId,
            layout: applyPlan.layerLayout,
            paint: {
                'line-color': applyPlan.paint.lineColor,
                'line-width': MapLibreHelpers.buildZoomScaledLineWidth(applyPlan.paint.lineWeight),
                'line-opacity': applyPlan.paint.lineOpacity,
            },
        }, applyPlan.beforeId);

        const layerId = applyPlan.layerId;
        const sourceId = applyPlan.sourceId;
        allRouteLayers.unshift({
            id: layerId,
            remove: () => {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            },
        });
        return true;
    } catch (e) {
        console.error(`[Routes] ✗ Error adding route ${applyPlan.routeIndex}:`, e);
        return false;
    }
}

function doAddRouteLayers() {
    const RS = _routeSelection();
    const batch = RS.buildDoAddRouteLayersBatchPlan(
        routeOptions,
        selectedRouteIndex,
        map.getStyle().layers
    );

    batch.layers.forEach((applyPlan) => {
        console.log(`[Routes] Route ${applyPlan.routeIndex}: "${applyPlan.routeName}", polyline points: ${applyPlan.polylinePointCount}`);

        if (!applyPlan.valid) {
            console.error(`[Routes] Route ${applyPlan.routeIndex}: Not enough valid points (${applyPlan.lngLatCoordCount})`);
            return;
        }

        console.log(`[Routes] Drawing route ${applyPlan.routeIndex} with color ${applyPlan.paint.lineColor}, weight ${applyPlan.paint.lineWeight}`);

        if (applyRouteLayerFromMapLibrePlan(applyPlan)) {
            console.log(`[Routes] ✓ Route ${applyPlan.routeIndex} layer added directly: ${applyPlan.layerId}${batch.beforeId ? ` (before ${batch.beforeId})` : ''}`);
        }
    });

    const sideEffects = RS.buildAllRoutesMapSideEffectsPlan(routeOptions, {
        showTrafficEnabled,
        hasTrafficLayer: !!trafficLayer,
    });

    if (sideEffects.fitBounds) {
        MapLibreHelpers.fitMapBounds(
            map,
            sideEffects.fitBounds.coords,
            { padding: sideEffects.fitBounds.padding }
        );
    }

    if (sideEffects.displayAllRouteHazards) {
        displayAllRouteHazards();
    }

    if (sideEffects.ensureTomTomTrafficLayer) {
        addTrafficLayer();
    }

    if (sideEffects.bringRoutesToTop) {
        bringRoutesToTop();
    }

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
    const RS = _routeSelection();
    const plan = RS.buildBringRoutesToTopDispatchPlan(
        allRouteLayers,
        map && map.getStyle ? map.getStyle().layers : null
    );

    console.log('[Routes] bringRoutesToTop called, allRouteLayers:', allRouteLayers?.length || 0);

    if (!map) {
        console.warn('[Routes] bringRoutesToTop: map not available');
        return;
    }
    if (!plan.shouldRun) {
        return;
    }

    const moveLayersToTop = (retryCount = 0) => {
        let allFound = true;
        console.log(`[Routes] moveLayersToTop attempt ${retryCount}, layers:`, plan.layerIds);

        try {
            plan.layerIds.forEach((layerId) => {
                if (map.getLayer(layerId)) {
                    map.moveLayer(layerId, plan.beforeId);
                    console.log(`[Routes] Moved layer ${layerId}${plan.beforeId ? ` before ${plan.beforeId}` : ' to top'}`);
                } else {
                    allFound = false;
                    console.log(`[Routes] Layer ${layerId} not found in map yet`);
                }
            });

            if (!allFound && retryCount < plan.maxRetries) {
                setTimeout(() => moveLayersToTop(retryCount + 1), plan.retryDelayMs);
            } else if (allFound) {
                console.log('[Routes] All route layers successfully positioned');
                if (plan.ensureLabelsOnTopAfterSuccess) {
                    ensureLabelsOnTop();
                }
            } else {
                console.warn('[Routes] Some layers not found after retries');
            }
        } catch (e) {
            console.warn('[Routes] Error bringing routes to top:', e);
        }
    };

    setTimeout(() => {
        if (map.isStyleLoaded()) {
            moveLayersToTop(0);
        } else if (plan.waitForIdleIfStyleNotLoaded) {
            console.log('[Routes] Waiting for map idle...');
            map.once('idle', () => moveLayersToTop(0));
        }
    }, plan.initialDelayMs);
}

// ===== DRAGGABLE ROUTE EDITING =====
let routeDragMarkers = [];  // Markers for dragging route points
let routeEditingEnabled = false;

/**
 * Enable route editing by adding draggable waypoints along the route
 */
function enableRouteEditing() {
    const WP = _waypoints();
    const plan = WP.buildRouteEditMarkersPlan(routePath);
    if (!plan.valid) {
        showStatus(plan.statusMessage, plan.statusType);
        return;
    }

    routeEditingEnabled = true;
    clearRouteDragMarkers();

    plan.markers.forEach((markerPlan) => {
        addRouteDragMarker(markerPlan.lat, markerPlan.lon, markerPlan.routeIndex);
    });

    showStatus(plan.statusMessage, plan.statusType);
    console.log(`[Route Edit] Added ${routeDragMarkers.length} drag markers`);
}

/**
 * Add a draggable marker for route editing
 */
function addRouteDragMarker(lat, lon, routeIndex) {
    const mountPlan = _waypoints().buildRouteDragMarkerMountPlan(lat, lon, routeIndex);
    const marker = MapLibreHelpers.createMarker(mountPlan.lat, mountPlan.lon, {
        className: mountPlan.className,
        html: mountPlan.markerHtml,
        iconSize: mountPlan.iconSize,
        iconAnchor: mountPlan.iconAnchor,
    }).addTo(map);

    const el = marker.getElement();
    if (el && mountPlan.cursorStyle) {
        el.style.cursor = mountPlan.cursorStyle;
    }

    marker.routeIndex = mountPlan.routeIndex;
    marker.originalLat = mountPlan.lat;
    marker.originalLon = mountPlan.lon;

    routeDragMarkers.push(marker);
}

/**
 * Add a via-point from route dragging and recalculate
 */
async function addDraggedViaPoint(lat, lon) {
    const WP = _waypoints();
    const plan = WP.buildDraggedViaPointAddPlan(lat, lon, viaPoints.length);
    viaPoints.push(plan.viaPoint);

    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: plan.marker.className,
        html: WP.buildViaPointDragAddedMarkerHtml(),
        iconSize: plan.marker.iconSize,
        iconAnchor: plan.marker.iconAnchor,
        popup: WP.buildViaPointDragPopupHtml(plan.marker.removeOnclick),
    }).addTo(map);

    viaPointMarkers.push(marker);
    if (plan.updateWaypointsList) updateWaypointsList();
    if (plan.clearRouteDragMarkers) clearRouteDragMarkers();
    showStatus(plan.statusMessage, plan.statusType);
    if (plan.recalculateRoute) await calculateRoute();
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
function applyRouteEditingToggleDomFromPlan(domPlan) {
    if (!domPlan) return;
    const btn = document.getElementById(domPlan.elementId);
    if (!btn) return;
    btn.classList.toggle('active', domPlan.active);
    btn.textContent = domPlan.text;
}

function toggleRouteEditing() {
    const WP = _waypoints();
    if (routeEditingEnabled) {
        const disablePlan = WP.buildRouteEditingDisablePlan();
        if (disablePlan.clearRouteDragMarkers) clearRouteDragMarkers();
        showStatus(disablePlan.statusMessage, disablePlan.statusType);
    } else {
        enableRouteEditing();
    }

    applyRouteEditingToggleDomFromPlan(
        WP.buildRouteEditingToggleDomApplyPlan(routeEditingEnabled)
    );
}

/**
 * Apply route comparison tab list HTML from a pure DOM apply plan.
 * @param {Object} domPlan - from buildRouteComparisonListDomApplyPlan
 */
function applyRouteComparisonListDomFromPlan(domPlan) {
    if (!domPlan) return;
    const listContainer = document.getElementById(domPlan.containerId || 'routeComparisonList');
    if (!listContainer) return;
    listContainer.innerHTML = domPlan.innerHtml;
}

/**
 * displayRouteComparison function - Shows distinct route types with hazard counts
 * @function displayRouteComparison
 * @returns {void}
 */
function displayRouteComparison() {
    const selection = _routeSelection();
    const routes = routeOptions || [];
    const domPlan = selection.buildRouteComparisonListDomApplyPlan({
        routes,
        listOpts: routes.length > 0 ? {
            selectedIndex: selectedRouteIndex,
            routeColors: routeColors(),
            currencySymbol: getCurrencySymbol(),
            distUnit: getDistanceUnit(),
            distanceTexts: routes.map((route) => convertDistance(route.distance_km)),
        } : {},
    });
    applyRouteComparisonListDomFromPlan(domPlan);
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
    const WP = _waypoints();
    const plan = WP.buildViaPointAddPlan(lat, lon, name, viaPoints.length);
    viaPoints.push(plan.viaPoint);

    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: plan.marker.className,
        html: WP.buildViaPointMarkerHtml(plan.marker.label),
        iconSize: plan.marker.iconSize,
        iconAnchor: plan.marker.iconAnchor,
        popup: WP.buildViaPointPopupHtml(plan.viaPoint.name, plan.marker.removeOnclick)
    }).addTo(map);

    viaPointMarkers.push(marker);
    if (plan.updateWaypointsList) updateWaypointsList();
    showStatus(plan.statusMessage, plan.statusType);
}

/**
 * Add a stop at given coordinates
 */
function addStop(lat, lon, name = null, duration = 15) {
    const WP = _waypoints();
    const plan = WP.buildStopAddPlan(lat, lon, name, duration, stops.length);
    stops.push(plan.stop);

    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: plan.marker.className,
        html: WP.buildStopMarkerHtml(),
        iconSize: plan.marker.iconSize,
        iconAnchor: plan.marker.iconAnchor,
        popup: WP.buildStopPopupHtml(plan.stop.name, plan.stop.duration, plan.marker.removeOnclick)
    }).addTo(map);

    stopMarkers.push(marker);
    if (plan.updateWaypointsList) updateWaypointsList();
    showStatus(plan.statusMessage, plan.statusType);
}

/**
 * Remove a via-point
 */
function removeViaPoint(index) {
    const WP = _waypoints();
    const plan = WP.buildViaPointRemovePlan(index, viaPoints.length);
    if (!plan.shouldRemove) return;

    viaPoints.splice(plan.index, 1);
    if (viaPointMarkers[plan.removeMarkerAtIndex] && typeof viaPointMarkers[plan.removeMarkerAtIndex].remove === 'function') {
        viaPointMarkers[plan.removeMarkerAtIndex].remove();
    }
    viaPointMarkers.splice(plan.removeMarkerAtIndex, 1);
    if (plan.updateWaypointsList) updateWaypointsList();
    if (plan.refreshMarkers) refreshViaPointMarkers();
    showStatus(plan.statusMessage, plan.statusType);
}

/**
 * Remove a stop
 */
function removeStop(index) {
    const WP = _waypoints();
    const plan = WP.buildStopRemovePlan(index, stops.length);
    if (!plan.shouldRemove) return;

    stops.splice(plan.index, 1);
    if (stopMarkers[plan.removeMarkerAtIndex] && typeof stopMarkers[plan.removeMarkerAtIndex].remove === 'function') {
        stopMarkers[plan.removeMarkerAtIndex].remove();
    }
    stopMarkers.splice(plan.removeMarkerAtIndex, 1);
    if (plan.updateWaypointsList) updateWaypointsList();
    showStatus(plan.statusMessage, plan.statusType);
}

/**
 * Refresh via-point markers (update numbers after removal)
 */
function refreshViaPointMarkers() {
    const WP = _waypoints();
    const plan = WP.buildViaPointMarkersRefreshPlan(viaPoints);

    viaPointMarkers.forEach((marker) => {
        if (marker && typeof marker.remove === 'function') {
            marker.remove();
        }
    });
    viaPointMarkers = [];

    plan.markers.forEach((spec) => {
        const marker = MapLibreHelpers.createMarker(spec.lat, spec.lon, {
            className: spec.className,
            html: WP.buildViaPointMarkerHtml(spec.label),
            iconSize: spec.iconSize,
            iconAnchor: spec.iconAnchor,
            popup: WP.buildViaPointPopupHtml(spec.popupName, spec.removeOnclick)
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
    container.innerHTML = _waypoints().buildWaypointsListHtml(viaPoints, stops);
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
    const target = _domHelpers().closest(e.target, '.waypoint-item');
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
    const plan = _waypoints().buildMultiDropItineraryMountPlan(data, {
        distUnit: getDistanceUnit(),
        convertDistance,
        formatEtaClock: (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    if (!container || !plan) return;

    container.innerHTML += plan.appendHtml;

    if (plan.shouldDrawLegs) {
        drawMultiDropLegsOnMap(data);
    }
}

/**
 * Draw multi-drop route legs on the map with distinct colors per leg
 */
function drawMultiDropLegsOnMap(data) {
    if (!map || !data.all_geometry) return;

    const WP = _waypoints();
    data.all_geometry.forEach((geom, idx) => {
        const leg = data.legs && data.legs[idx];
        const descriptor = WP.buildMultiDropLegLayerDescriptor(geom, idx, leg, decodePolyline);
        if (!descriptor) return;

        try {
            const { layerId, sourceId, coordinates, lineColor } = descriptor;
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);

            map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates }
                }
            });

            map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': lineColor,
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
    return _routeSelection().orderWaypointsGreedy(
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
    const display = _routeSelection().buildTripInfoDisplayValues(route, {
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
    const RS = _routeSelection();
    const plan = RS.buildSingleRouteMapDisplayPlan(routeOptions && routeOptions[index], index, {
        routeColors: routeColors(),
        showTrafficEnabled,
        routeTrafficEnabled,
        hasTrafficLayer: !!trafficLayer,
        trafficLightsEnabled: window.TrafficLights && typeof window.TrafficLights.isEnabled === 'function' && window.TrafficLights.isEnabled(),
        trafficLightsPlotAvailable: (window.TrafficLights && typeof window.TrafficLights.plotTrafficLightsOnRoute === 'function')
            || typeof plotTrafficLightsOnRoute === 'function',
    });

    console.log(`[Routes] displaySingleRoute(${index}) - clearing all existing routes`);

    if (!plan.valid) return;

    if (routeLayer) {
        if (typeof routeLayer.remove === 'function') routeLayer.remove();
        routeLayer = null;
    }

    allRouteLayers.forEach(layer => {
        if (layer && typeof layer.remove === 'function') {
            layer.remove();
        }
    });
    allRouteLayers = [];

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
            console.log('[Routes] Plotting traffic lights on selected route (OSM via /api/traffic-lights)');
            plotRouteTrafficLights(tl.polylinePoints);
        } else if (tl.hasOsmTlsInHazards) {
            console.log('[Routes] Traffic lights on route from hazard markers (OSM); skipping duplicate plot');
        } else if (!plotRouteTrafficLights) {
            console.warn('[Routes] Traffic lights module not available for route plotting');
        }
    }

    console.log(`[Routes] ${plan.logLine}`);
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
    const sharing = _routeSharing();
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
    const sharing = _routeSharing();
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
    const summary = _routeSharing().buildRouteShareSummaryValues(route, {
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
    const RS = _routeSharing();

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
    const message = _routeSharing().buildShareWhatsAppMessage(route, {
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
    const sharing = _routeSharing();
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
    const display = _tripHistory().buildAnalyticsDisplayValues(data, {
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
    frequentRoutesList.innerHTML = _tripHistory().buildFrequentRoutesListHtml(
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
    const preferences = collectRoutePreferencesFormState();

    localStorage.setItem('routePreferences', JSON.stringify(preferences));
    saveAllSettings();
    showStatus('Route preferences saved!', 'success');
}

/**
 * Read route preference controls from the DOM (source of truth for save).
 * @returns {Object}
 */
function collectRoutePreferencesFormState() {
    return {
        avoidHighways: document.getElementById('avoidHighways')?.checked || false,
        preferScenic: document.getElementById('preferScenic')?.checked || false,
        avoidTolls: isAvoidTollsEnabled(),
        avoidCAZ: localStorage.getItem('pref_caz') !== 'false',
        preferQuiet: document.getElementById('preferQuiet')?.checked || false,
        avoidUnpaved: document.getElementById('avoidUnpaved')?.checked || false,
        routeOptimization: document.getElementById('routeOptimization')?.value || 'fastest',
        maxDetour: parseInt(document.getElementById('maxDetour')?.value || 20),
    };
}

function saveMultiDropPreferences() {
    const SS = _settingsSnapshot();
    const patches = SS.buildMultiDropPreferencesStoragePlan(collectMultiDropFormState());
    Object.entries(patches).forEach(([key, value]) => {
        localStorage.setItem(key, value);
    });

    saveAllSettings();
    showStatus('Multi-drop preferences saved!', 'success');
}

/**
 * Read multi-drop preference controls from the DOM (source of truth for save).
 * @returns {Object}
 */
function collectMultiDropFormState() {
    const optimizeEl = document.getElementById('optimizeStopOrder');
    const roundTripEl = document.getElementById('roundTrip');
    const trafficEl = document.getElementById('trafficAwareRouting');
    const closuresEl = document.getElementById('avoidRoadClosures');
    const incidentsEl = document.getElementById('avoidIncidents');
    const departureEl = document.getElementById('departureTime');

    return {
        optimizeStopOrder: optimizeEl
            ? optimizeEl.checked
            : localStorage.getItem('pref_optimizeStopOrder') !== 'false',
        roundTrip: roundTripEl
            ? roundTripEl.checked
            : localStorage.getItem('pref_roundTrip') === 'true',
        trafficAwareRouting: trafficEl
            ? trafficEl.checked
            : localStorage.getItem('pref_trafficAwareRouting') !== 'false',
        avoidRoadClosures: closuresEl
            ? closuresEl.checked
            : localStorage.getItem('pref_avoidRoadClosures') !== 'false',
        avoidIncidents: incidentsEl
            ? incidentsEl.checked
            : localStorage.getItem('pref_avoidIncidents') !== 'false',
        departureTime: departureEl
            ? (departureEl.value || '')
            : (localStorage.getItem('pref_departureTime') || ''),
    };
}

/**
 * Apply multi-drop preference form controls from a pure UI apply plan.
 * @param {Object} plan - from buildMultiDropPreferencesUiApplyPlan
 */
function applyMultiDropPreferencesUiFromPlan(plan) {
    if (!plan) return;

    const domPlan = _settingsSnapshot().buildMultiDropPreferencesDomApplyPlan(plan);
    applyDomChecksFromPlan(domPlan.checks);
    applyDomSelectsFromPlan(domPlan.selects);
}

function loadMultiDropPreferences() {
    ensureDefaultTrafficAwareRouting();
    applyMultiDropPreferencesUiFromPlan(
        _settingsSnapshot().buildMultiDropPreferencesUiApplyPlan(localStorage)
    );
}

function clearDepartureTime() {
    applyClearDepartureTimeFromPlan(_settingsSnapshot().buildClearDepartureTimeApplyPlan());
}

/**
 * Clear departure time input and storage from a pure apply plan.
 * @param {Object} plan - from buildClearDepartureTimeApplyPlan
 */
function applyClearDepartureTimeFromPlan(plan) {
    if (!plan) return;
    const el = document.getElementById(plan.elementId);
    if (el) el.value = '';
    if (plan.removeStorageKey) {
        localStorage.removeItem(plan.removeStorageKey);
    }
    showStatus(plan.statusMessage, plan.statusType);
}

/**
 * loadRoutePreferences function
 * @function loadRoutePreferences
 * @returns {*} Return value description
 */
function loadRoutePreferences() {
    applyRoutePreferencesUiFromPlan(
        _routePrefs().buildRoutePreferencesUiApplyPlan(localStorage)
    );
}

/**
 * Apply route preference form controls from a pure UI apply plan.
 * @param {Object} plan - from buildRoutePreferencesUiApplyPlan
 */
function applyRoutePreferencesUiFromPlan(plan) {
    if (!plan) return;

    const domPlan = _routePrefs().buildRoutePreferencesDomApplyPlan(plan);
    applyDomChecksFromPlan(domPlan.checks);
    applyDomSelectsFromPlan(domPlan.selects);
    if (domPlan.detourLabel) {
        applyDetourLabelFromPlan(domPlan.detourLabel);
    }
}

/**
 * Apply max-detour label text from a pure apply plan (no save).
 * @param {Object} plan - from buildDetourLabelApplyPlan
 */
function applyDetourLabelFromPlan(plan) {
    if (!plan) return;
    const labelEl = document.getElementById(plan.labelElementId || 'detourLabel');
    if (labelEl && plan.text != null) {
        labelEl.textContent = plan.text;
    }
}

/**
 * updateDetourLabel function
 * @function updateDetourLabel
 * @returns {*} Return value description
 */
function updateDetourLabel() {
    const maxDetourEl = document.getElementById('maxDetour');
    if (!maxDetourEl) return;
    applyDetourLabelFromPlan(_routePrefs().buildDetourLabelApplyPlan(maxDetourEl.value));
    saveRoutePreferences();
}

/**
 * getRoutePreferences function
 * @function getRoutePreferences
 * @returns {*} Return value description
 */
function getRoutePreferences() {
    return _routePrefs().getRoutePreferences(localStorage);
}

/**
 * recalculateRouteWithPreferences function
 * @function recalculateRouteWithPreferences
 * @returns {*} Return value description
 */
function recalculateRouteWithPreferences() {
    const plan = _routeSelection().buildRecalculateRouteWithPreferencesPlan(window.lastCalculatedRoute);
    if (!plan.ok) {
        showStatus(plan.errorStatusMessage, 'error');
        return;
    }

    saveRoutePreferences();
    showStatus(plan.loadingStatusMessage, 'loading');
    switchTab(plan.switchTab);

    setTimeout(() => {
        calculateRoute();
    }, plan.recalculateDelayMs);
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
    savedRoutesList.innerHTML = _routeSharing().buildSavedRoutesListHtml(savedRoutes, {
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
    return {
        routePreferences: collectRoutePreferencesFormState(),
        hazardPreferences: {
            avoidTolls: isAvoidTollsEnabled(),
            avoidCAZ: localStorage.getItem('pref_caz') !== 'false',
            avoidCameras: localStorage.getItem('pref_cameras') !== 'false',
            avoidTrafficLights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
        },
        parkingPreferences: collectParkingPreferencesFormState(),
        multiDropPreferences: collectMultiDropFormState(),
        mapTheme: localStorage.getItem('mapTheme') || 'standard',
    };
}

/**
 * Apply in-navigation reroute outcome from a successful /api/route response.
 * @param {Object} data
 * @param {string} geocodedEnd
 * @param {string} end
 */
function applyCalculateRouteInNavRerouteOutcome(data, geocodedEnd, end) {
    hideRouteProgressBar();

    const RS = _routeSelection();
    const activeRoute = pickActiveRouteDuringNavigation(data.routes, data);
    if (!activeRoute) {
        showStatus(RS.buildInNavRerouteDispatchPlan({}, {}, '', '').noRouteErrorMessage, 'error');
        return;
    }
    if (activeRoute.geometry) {
        updateRouteOnMap(activeRoute);
    }

    const dispatch = RS.buildInNavRerouteDispatchPlan(
        activeRoute,
        data,
        geocodedEnd,
        end,
        voiceAnnouncementsEnabled
            ? { enabled: true, convertDistance, distUnit: getDistanceUnit() }
            : { enabled: false }
    );
    window.lastCalculatedRoute = {
        ...window.lastCalculatedRoute,
        ...dispatch.lastCalculatedRoutePatch,
    };

    if (dispatch.speakMessage) {
        speakMessage(dispatch.speakMessage, 'high');
    }

    showStatus(dispatch.statusMessage, dispatch.statusType);
    if (dispatch.recentDestination) {
        try {
            recordRecentDestination(
                dispatch.recentDestination.label,
                dispatch.recentDestination.lat,
                dispatch.recentDestination.lon,
                dispatch.recentDestination.kind
            );
        } catch (_) { /* ignore */ }
    }
}

/**
 * Post-preview UI side-effects for idle calculateRoute success.
 * @param {Object} idleUiPlan - from buildCalculateRouteIdleUiApplyPlan
 * @param {Object} data - route API response
 */
function applyCalculateRouteIdleUiFromPlan(idleUiPlan, data) {
    if (!idleUiPlan) return;

    const delayMs = idleUiPlan.delayedPreview?.delayMs ?? 300;
    setTimeout(() => {
        showRoutePreview(data);
        if (idleUiPlan.updateArButtonVisibility) {
            updateARButtonVisibility();
        }
    }, delayMs);

    hideRouteProgressBar();

    if (idleUiPlan.showStartNavButtons) {
        (idleUiPlan.startNavButtonIds || []).forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) btn.style.display = 'block';
        });
    }
    if (idleUiPlan.updateRoadReportFabVisibility) {
        updateRoadReportFabVisibility();
    }

    const notification = idleUiPlan.notification;
    if (notification) {
        console.log('[Route] Route ready notification:', notification.message);
        sendNotification(notification.title, notification.message, notification.type);
    }

    try {
        (idleUiPlan.recentDestinations || []).forEach((dest) => {
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
    if (!plan) return false;

    if (plan.removeExistingMarkers) {
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

    if (plan.startMarker) {
        startMarker = createEndpointMarker(plan.startMarker);
    }
    if (plan.endMarker) {
        endMarker = createEndpointMarker(plan.endMarker);
    }

    if (plan.pathLog) {
        if (plan.pathLog.level === 'error') {
            console.error(plan.pathLog.message);
        } else {
            console.log(plan.pathLog.message);
        }
    }

    if (plan.requiresMap && !map) {
        console.error('[Route] Map not initialized');
        showStatus('Error: Map not initialized', 'error');
        return false;
    }

    if (plan.fitBounds && map) {
        MapLibreHelpers.fitMapBounds(map, plan.fitBounds.routePath, { padding: plan.fitBounds.padding });
        lastZoomLevel = map.getZoom();
    }

    return true;
}

/**
 * Apply idle (non-navigation) calculateRoute preview outcome.
 * @param {Object} data
 * @param {{ geocodedStart: string, geocodedEnd: string, start: string, end: string }} labels
 */
function applyCalculateRouteIdlePreviewOutcome(data, labels) {
    try {
        const GL = _geocodingLocations();
        const RS = _routeSelection();
        const distanceKm = parseFloat(data.distance_km || data.distance) || 0;
        const previewPlan = RS.buildRoutePreviewSuccessPlan({
            geocodedStart: labels.geocodedStart,
            geocodedEnd: labels.geocodedEnd,
            startLabel: labels.start,
            endLabel: labels.end,
            data,
            parseLatLonPair: GL.parseLatLonPairString.bind(GL),
            invalidFormatMessage: GL.getInvalidCoordinatesFormatStatusMessage(),
            invalidCoordsMessage: GL.getInvalidCoordinatesStatusMessage(),
            decodePolyline,
            fmt: {
                distanceText: convertDistance(distanceKm),
                distUnit: getDistanceUnit(),
                currencySymbol: getCurrencySymbol(),
                notificationDistanceText: convertDistance(distanceKm),
            },
            parseDurationMinutes: _routeSharing().parseSharedRouteDurationMinutes,
        });

        if (!previewPlan.ok) {
            showStatus(previewPlan.errorStatusMessage, 'error');
            hideRouteProgressBar();
            return;
        }

        const { startCoords, endCoords, pathPlan, routePath } = previewPlan;

        const mapApplied = applyRoutePreviewMapFromPlan(
            _previewMarker().buildRoutePreviewMapApplyPlan({
                startCoords,
                endCoords,
                routePath,
                pathPlan,
                hasGeometry: !!data.geometry,
                geometrySource: data.source,
            })
        );
        if (!mapApplied) return;

        if (data.total_stop_time && data.total_stop_time > 0) {
            console.log(`[Route] Total time with ${data.stops_count} stops: ${previewPlan.displayTime}`);
        }
        updateTripInfo(data.distance, previewPlan.displayTime, data.fuel_cost || '-', data.toll_cost || '-');
        showStatus(previewPlan.statusMessage, 'success');

        if (previewPlan.showMultiDropLegs) {
            displayMultiDropLegs(data);
        }

        window.lastRouteApiResponse = data;
        window.lastCalculatedRoute = previewPlan.lastCalculatedRoutePatch;
        console.log(`[Route] Stored route with duration_minutes: ${previewPlan.durationMinutes}`);

        if (previewPlan.primaryHazards && previewPlan.primaryHazards.length > 0) {
            displayHazardMarkers(previewPlan.primaryHazards);
        }

        if (previewPlan.routesCount > 0) {
            console.log(`[Route API] Received ${previewPlan.routesCount} routes from ${previewPlan.routeSource}, default polyline precision ${previewPlan.defaultPrecision}`);
            routeOptions = RS.buildRouteOptionsFromApiResponse(data, decodePolyline, routePath);
            console.log(`[Route Comparison] Loaded ${routeOptions.length} real routes from ${data.source}:`, routeOptions.map(r => r.name));
        } else {
            routeOptions = RS.buildRouteOptionsFromApiResponse(data, decodePolyline, routePath);
            console.log('[Route Comparison] Using single route (fallback)');
        }

        applyCalculateRouteIdleUiFromPlan(RS.buildCalculateRouteIdleUiApplyPlan(previewPlan), data);
    } catch (e) {
        showStatus('Error parsing coordinates: ' + e.message, 'error');
        console.error('Coordinate parsing error:', e);
        hideRouteProgressBar();
    }
}

async function calculateRoute() {
    console.log('[calculateRoute] START - Function called');

    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const start = startInput?.value ? startInput.value.trim() : '';
    const end = endInput?.value ? endInput.value.trim() : '';

    const preflight = _routingRequest().buildCalculateRoutePreflightPlan({
        hasStartInput: !!startInput,
        hasEndInput: !!endInput,
        start,
        end,
        isGeocoding,
    });

    console.log('[calculateRoute] Start:', start);
    console.log('[calculateRoute] End:', end);
    console.log('[calculateRoute] Start dataset:', startInput?.dataset);
    console.log('[calculateRoute] End dataset:', endInput?.dataset);

    if (!preflight.ok) {
        showStatus(preflight.statusMessage, preflight.statusType);
        if (preflight.branch === 'missing_inputs' || preflight.branch === 'empty_locations') {
            console.error('[calculateRoute] ERROR:', preflight.statusMessage);
        } else if (preflight.branch === 'geocoding_busy') {
            console.warn('[calculateRoute] WARNING: Geocoding already in progress');
        }
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

    const RR = _routingRequest();
    const routePlan = RR.buildCalculateRouteApiPlan({
        storage: localStorage,
        geocodedStart: geocodedStart,
        geocodedEnd: geocodedEnd,
        viaPoints: viaPoints,
        stops: stops,
        routingMode: currentRoutingMode,
        vehicleType: currentVehicleType,
        costParams: getRouteCostParams(currentVehicleType),
        avoidTolls: isAvoidTollsEnabled(),
        routePrefs: getRoutePreferences(),
        routeInProgress: routeInProgress,
        isTrackingActive: isTrackingActive,
        trackingHistory: trackingHistory,
        currentLat: currentLat,
        currentLon: currentLon,
    });
    const requestBody = routePlan.requestBody;

    console.log('[calculateRoute] Making API request to /api/route with:', requestBody);
    console.log('[calculateRoute] Via-points:', routePlan.viaPointsCount, 'Stops:', routePlan.stopsCount, 'Total stop time:', routePlan.totalStopTimeMinutes, 'min');
    console.log('[calculateRoute] Multi-drop: optimize=' + routePlan.optimizeStopOrder + ' roundTrip=' + routePlan.roundTrip);

    fetch('/api/route', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
        .then(response => {
            console.log('[calculateRoute] API response status:', response.status);

            const contentType = response.headers.get('content-type');
            if (!_routingRequest().isRouteApiJsonContentType(contentType)) {
                console.error('[calculateRoute] Non-JSON response received:', contentType);
                return response.text().then(text => {
                    console.error('[calculateRoute] Response text:', text.substring(0, 200));
                    throw new Error(_routingRequest().buildNonJsonRouteApiErrorMessage(response.status, text));
                });
            }

            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(_routingRequest().parseRouteApiErrorMessage(response.status, text));
                });
            }

            return response.json();
        })
        .then(data => {
            const RR = _routingRequest();
            const apiPlan = RR.buildRouteApiResultPlan(data);
            const dispatch = RR.buildCalculateRouteDispatchPlan(apiPlan, routeInProgress);
            console.log('[Route API] Response received:', dispatch.responseLogMeta);

            if (dispatch.degradedLogWarning) {
                console.warn(
                    '[Route API] Degraded routing — local engines failed:',
                    dispatch.degradedLogWarning.warning,
                    dispatch.degradedLogWarning.engines
                );
            }
            if (dispatch.degradedStatusMessage) {
                showStatus(dispatch.degradedStatusMessage, 'warning');
            }

            if (dispatch.branch === 'error') {
                showStatus(dispatch.statusMessage, dispatch.statusType);
                hideRouteProgressBar();
                return;
            }

            if (dispatch.branch === 'in_nav_reroute') {
                console.log('[calculateRoute] Navigation active — using in-nav reroute path');
                applyCalculateRouteInNavRerouteOutcome(data, geocodedEnd, end);
                return;
            }

            applyCalculateRouteIdlePreviewOutcome(data, { geocodedStart, geocodedEnd, start, end });
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
    const mount = RP.buildRouteProgressMountPlan();
    let progressContainer = document.getElementById(mount.containerId);

    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = mount.containerId;
        progressContainer.style.cssText = mount.containerStyleCssText;
        progressContainer.innerHTML = mount.innerHtml;

        if (!document.getElementById(mount.animationStyleId)) {
            const style = document.createElement('style');
            style.id = mount.animationStyleId;
            style.textContent = mount.animationKeyframes;
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

    clearHazardMarkers();

    const HM = _hazardMapMarkers();
    const OSM = _osmMapIcons();
    const pillHtml = getOsmTrafficLightMarkerPillHTML();
    const mountPlan = HM.buildHazardMarkersMountPlans(hazards, {
        osmTrafficLightPillHtml: pillHtml,
        osmTrafficLightIconSize: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
        osmTrafficLightPopupIcon: OSM.buildOsmTrafficLightPopupIconWrapperHtml(pillHtml),
    });

    mountPlan.markers.forEach((spec) => {
        const marker = MapLibreHelpers.createMarker(spec.lat, spec.lon, {
            className: spec.className,
            html: spec.markerHtml,
            iconSize: spec.iconSize,
            iconAnchor: spec.iconAnchor,
            popup: spec.popupHtml,
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
    const hazardList = _hazardMapMarkers().buildAllRoutesHazardsList(routeOptions);
    if (hazardList.hazards.length > 0) {
        displayHazardMarkers(hazardList.hazards);
        console.log(`[Hazards] Displaying hazards from all ${hazardList.routeCount} routes: ${hazardList.hazards.length} total`);
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
        if (!_domHelpers().closest(e.target, '.bottom-sheet-handle') && !_domHelpers().closest(e.target, '.bottom-sheet-header')) {
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
    _toggleUI().applyToggleButton(toggle, buildings3DEnabled);

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
    _toggleUI().applyToggleButton(toggle, roadLabelsEnabled, {
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
    _toggleUI().applyToggleButton(toggle, googlePlusCodesEnabled, {
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
                const style = map.getStyle();
                const trafficBeforeId = _routeSelection()
                    .findFirstTextSymbolLayerId(style && style.layers);
                if (trafficBeforeId) {
                    console.log(`[Traffic] Inserting traffic layer before symbol layer: ${trafficBeforeId}`);
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
    _toggleUI().writeBoolPref('showWeatherEnabled', showWeatherEnabled);
    _toggleUI().applyToggleButton(toggle, showWeatherEnabled);

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

    const typeName = _weatherLayer().weatherLayerDisplayName(type);
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
            const WL = _weatherLayer();
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
    _toggleUI().applyToggleButton(toggle, showWeatherEnabled);

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

// Traffic level colors moved to route-traffic-flow.js (TRAFFIC_COLORS).

/**
 * Toggle route traffic edge display on/off
 */
function toggleRouteTraffic() {
    routeTrafficEnabled = !routeTrafficEnabled;
    const toggle = document.getElementById('routeTrafficToggle');
    _toggleUI().writeBoolPref('routeTrafficEnabled', routeTrafficEnabled);
    _toggleUI().applyToggleButton(toggle, routeTrafficEnabled);

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
    const RTF = _routeTrafficFlow();
    const dispatch = RTF.buildFetchRouteTrafficDispatchPlan({
        routeTrafficEnabled,
        routePolyline,
    });
    if (!dispatch.shouldFetch) {
        console.log('[Route Traffic] Not enabled or no route available');
        return;
    }

    console.log('[Route Traffic] Fetching traffic data for route...');

    try {
        const data = await fetchRouteTrafficFlowPayload(routePolyline, dispatch.sampleInterval);
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
 * Display traffic-colored edges along the route
 * Creates polylines that follow the actual route geometry (not straight lines)
 * Traffic edges are drawn ON TOP of the route with thick, visible lines
 */
function displayRouteTrafficEdges(segments) {
    clearRouteTrafficLayers();

    const RTF = _routeTrafficFlow();
    const applyPlan = RTF.buildDisplayRouteTrafficEdgesApplyPlan(segments, routePolyline);
    if (!map || !applyPlan.shouldDisplay) {
        console.log('[Route Traffic] Cannot display - map:', !!map, 'segments:', segments?.length, 'routePolyline:', routePolyline?.length);
        return;
    }

    console.log('[Route Traffic] Segment levels:', applyPlan.levelCounts);

    applyPlan.polylines.forEach((polylinePlan) => {
        const trafficLine = MapLibreHelpers.addPolyline(map, polylinePlan.points, {
            color: polylinePlan.color,
            weight: polylinePlan.weight,
            opacity: polylinePlan.opacity,
        });
        routeTrafficLayers.push(trafficLine);
    });

    console.log(`[Route Traffic] Added ${routeTrafficLayers.length} congested traffic edge layers`);

    if (applyPlan.bringTrafficEdgesToTop) {
        bringTrafficEdgesToTop();
    }
    if (applyPlan.bringNavRouteAboveTrafficEdges) {
        bringNavRouteAboveTrafficEdges();
    }
}

/**
 * Bring traffic edge layers to top of map rendering order
 */
function bringTrafficEdgesToTop() {
    if (!map || routeTrafficLayers.length === 0) return;

    const plan = _routeSelection().buildBringTrafficEdgesToTopDispatchPlan(
        routeTrafficLayers,
        map.getStyle() && map.getStyle().layers
    );
    if (!plan.shouldRun) return;

    try {
        plan.layerIds.forEach((layerId) => {
            if (map.getLayer(layerId)) {
                map.moveLayer(layerId, plan.beforeId);
            }
        });
        console.log(`[Route Traffic] Traffic edge layers moved before ${plan.beforeId || 'top'}`);

        if (plan.ensureLabelsOnTop) {
            ensureLabelsOnTop();
        }
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

    const plan = _routeSelection().buildBringNavRouteAboveTrafficEdgesDispatchPlan(
        routeLayer,
        allRouteLayers,
        map.getStyle() && map.getStyle().layers
    );
    if (!plan.shouldRun) return;

    try {
        plan.layerIds.forEach((layerId) => {
            if (map.getLayer(layerId)) {
                map.moveLayer(layerId, plan.beforeId);
            }
        });
        if (plan.ensureLabelsOnTop) {
            ensureLabelsOnTop();
        }
        console.log('[Routes] Navigation route above traffic edges:', plan.layerIds.join(', '));
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

    const plan = _routeSelection().buildEnsureLabelsOnTopDispatchPlan(
        map.getStyle() && map.getStyle().layers
    );
    if (!plan.shouldRun) {
        console.log('[Labels] No label layers found');
        return;
    }

    clearTimeout(ensureLabelsTimeout);
    ensureLabelsTimeout = setTimeout(() => {
        try {
            plan.labelLayerIds.forEach((layerId) => {
                try {
                    if (map.getLayer(layerId)) {
                        map.moveLayer(layerId);
                    }
                } catch (e) {
                    // Silently skip layers that can't be moved
                }
            });

            console.log(`[Labels] Moved ${plan.labelLayerIds.length} label layers to top`);
        } catch (e) {
            console.log('[Labels] Error ensuring labels on top:', e.message);
        }
    }, plan.debounceMs);
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
 * Toggle auto-traffic update on/off
 */
function toggleAutoTrafficUpdate() {
    autoTrafficUpdateEnabled = !autoTrafficUpdateEnabled;
    localStorage.setItem('autoTrafficUpdate', autoTrafficUpdateEnabled ? 'true' : 'false');

    const toggle = document.getElementById('autoTrafficUpdateToggle');
    _toggleUI().applyToggleButton(toggle, autoTrafficUpdateEnabled);

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
    _toggleUI().applyToggleButton(toggle, autoRerouteOnDeviationEnabled);

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
let _routeTrafficFlowBackoffUntil = 0;

async function fetchRouteTrafficFlowPayload(points, sampleInterval) {
    const RTF = _routeTrafficFlow();
    const preflight = RTF.buildRouteTrafficFlowPreflightPlan(_routeTrafficFlowBackoffUntil);
    if (!preflight.shouldRequest) {
        return null;
    }

    const requestPlan = RTF.buildRouteTrafficFlowFetchRequestPlan(points, sampleInterval);
    let response;
    try {
        response = await fetch(requestPlan.url, {
            method: requestPlan.method,
            headers: requestPlan.headers,
            body: requestPlan.body,
        });
    } catch (e) {
        const fail = RTF.buildRouteTrafficFlowResponsePlan({ errorKind: 'network' });
        _routeTrafficFlowBackoffUntil = Date.now() + fail.setBackoffMs;
        console.debug('[Route Traffic]', fail.logMessage + ':', e && e.message);
        return null;
    }

    const outcome = RTF.buildRouteTrafficFlowResponsePlan({
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
    });
    if (!outcome.ok) {
        _routeTrafficFlowBackoffUntil = Date.now() + outcome.setBackoffMs;
        console.debug('[Route Traffic]', outcome.logMessage);
        return null;
    }

    try {
        return await response.json();
    } catch (e) {
        const fail = RTF.buildRouteTrafficFlowParseFailurePlan();
        _routeTrafficFlowBackoffUntil = Date.now() + fail.setBackoffMs;
        console.debug('[Route Traffic]', fail.logMessage + ':', e && e.message);
        return null;
    }
}

async function sampleRouteTrafficAhead() {
    const RTF = _routeTrafficFlow();
    const dispatch = RTF.buildSampleRouteTrafficAheadDispatchPlan(routePolyline, lastSnappedRouteIndex);
    if (!dispatch.shouldSample) return null;

    let data;
    try {
        data = await fetchRouteTrafficFlowPayload(dispatch.points, dispatch.sampleInterval);
    } catch (e) {
        console.debug('[Auto-Traffic] route-traffic-flow fetch failed:', e);
        return null;
    }
    if (!data) return null;
    return RTF.buildTrafficAheadSnapshot(data, calculateDistanceMeters);
}

async function getRouteTrafficAhead(forceFresh = false) {
    const RTF = _routeTrafficFlow();
    const now = Date.now();
    const cachePlan = RTF.buildRouteTrafficAheadCachePlan(
        forceFresh,
        _routeTrafficSampleCache,
        now,
        RTF.ROUTE_TRAFFIC_SAMPLE_TTL_MS
    );
    if (cachePlan.useCache) {
        return cachePlan.cachedResult;
    }
    const result = await sampleRouteTrafficAhead();
    if (result) _routeTrafficSampleCache = { at: now, result };
    return result;
}

/**
 * Check live traffic along the route and reroute around real congestion/closures.
 */
async function checkTrafficAndReroute() {
    const TC = _trafficChange();
    const preflight = TC.buildCheckTrafficAndReroutePreflightPlan({
        routeInProgress,
        currentLat,
        currentLon,
    });
    if (!preflight.shouldCheck) return;

    console.log('[Auto-Traffic] Sampling live traffic along route...');

    try {
        const flow = await getRouteTrafficAhead(preflight.forceFresh);
        lastTrafficUpdateTime = Date.now();

        const dispatch = TC.buildTrafficSampleResponseDispatchPlan(flow);
        if (dispatch.action === 'none') {
            console.log('[Auto-Traffic] No usable traffic data');
            return;
        }
        if (dispatch.action === 'update_last_traffic_only') {
            console.log('[Auto-Traffic] Traffic data is simulated; skipping reroute decision');
            lastTrafficData = dispatch.flow;
            return;
        }

        const changeType = TC.detectSignificantTrafficChange(lastTrafficData, dispatch.flow);
        lastTrafficData = dispatch.flow;

        const notifPlan = TC.buildTrafficChangeNotificationPlan(changeType, dispatch.flow);
        if (notifPlan.shouldReroute) {
            console.log(`[Auto-Traffic] Significant change: ${changeType} (delay ~${dispatch.flow.delayMin.toFixed(1)} min, ${dispatch.flow.congestedPoints.length} avoid pts)`);
            sendNotification(notifPlan.notificationTitle, notifPlan.notificationMessage, notifPlan.notificationType);
            await triggerTrafficBasedReroute(notifPlan.changeType, notifPlan.avoidPoints, notifPlan.measuredDelayMin);
        } else {
            console.log('[Auto-Traffic] No significant traffic change');
        }
    } catch (error) {
        console.error('[Auto-Traffic] Error checking traffic:', error);
    }
}

/**
 * Trigger a reroute that actively avoids the congested/closed segments (Lever A).
 * @param {string} changeType - 'severe' | 'congestion'
 * @param {Array<{lat:number,lon:number}>} avoidPoints - congested segment midpoints to avoid
 * @param {number} measuredDelayMin - realistic extra delay on the current route (Lever B)
 */
async function triggerTrafficBasedReroute(changeType, avoidPoints = [], measuredDelayMin = 0) {
    const TC = _trafficChange();
    const destination = resolveNavigationDestination();
    const preflight = TC.buildTrafficReroutePreflightPlan({
        destination,
        lastCalculatedRoute: window.lastCalculatedRoute,
        changeType,
    });
    if (!preflight.shouldReroute) {
        console.log('[Auto-Traffic] ' + (preflight.reason === 'no_destination'
            ? 'No destination stored, cannot reroute'
            : 'No route context, cannot reroute'));
        return;
    }

    const isSevere = preflight.isSevere;
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
            const acceptPlan = TC.buildTrafficRerouteAcceptancePlan({
                isSevere,
                oldBaseMinutes: window.lastCalculatedRoute.duration_minutes || 0,
                measuredDelayMin,
                newRouteMinutes: newRoute.duration_minutes,
            });

            if (acceptPlan.accept) {
                updateRouteOnMap(newRoute);
                if (acceptPlan.clearTrafficCache) _routeTrafficSampleCache = null;
                if (acceptPlan.clearLastTrafficData) lastTrafficData = null;
                sendNotification(acceptPlan.notificationTitle, acceptPlan.notificationMessage, acceptPlan.notificationType);
                if (voiceAnnouncementsEnabled && acceptPlan.voiceMessage) {
                    speakMessage(acceptPlan.voiceMessage, 'high');
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
    let polylineEnd = null;
    if (typeof routePolyline !== 'undefined' && routePolyline && routePolyline.length > 0) {
        const last = routePolyline[routePolyline.length - 1];
        polylineEnd = { lat: last[0], lon: last[1] };
    }
    const ND = _navigationDestination();
    const sources = ND.readNavigationDestinationSources({
        lastRouteDestination: lr && typeof lr.destination === 'string' ? lr.destination : null,
        endElement: document.getElementById('end'),
        polylineEnd,
    });
    return ND.resolveDestinationLatLon(sources);
}

/**
 * Build route request with current hazard avoidance settings
 */
function buildRouteRequest(startLat, startLon, destination, avoidPoints = null) {
    const routePrefs = (typeof getRoutePreferences === 'function') ? getRoutePreferences() : {};
    return _routingRequest().buildAutomaticRerouteRequestPlan(localStorage, {
        startLat,
        startLon,
        destination,
        avoidPoints,
        routingMode: currentRoutingMode || 'auto',
        vehicleType: currentVehicleType || 'petrol_diesel',
        costParams: getRouteCostParams(currentVehicleType),
        isAvoidTollsEnabled,
        routePrefs,
    });
}

/**
 * Reset voice/ETA/distance announcement state when geometry changes (reroute).
 * Prevents repeating the same milestones and back-to-back ETA after "route recalculated".
 */
function resetVoiceAnnouncementStateForNewRoute() {
    const patch = _voiceAnnouncements().voiceAnnouncementStateResetValues(Date.now());
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
 * Apply navigation state patches after a reroute map layer update.
 * @param {Object} plan - from buildRouteMapUpdateStatePlan
 * @param {Object} newRoute
 */
function applyRouteMapUpdateStateFromPlan(plan, newRoute) {
    if (plan.maneuvers.steps) {
        currentRouteSteps = plan.maneuvers.steps;
        if (plan.maneuvers.logMessage) console.log(plan.maneuvers.logMessage);
    }

    if (plan.vehicleMarkerReset) {
        resetVehicleMarkerDisplayState();
        if (!plan.speedLimitReset) {
            const SL = _speedLimitWidget();
            const resetPlan = SL
                ? SL.buildSpeedLimitFetchResetApplyPlan({
                    kind: 'maneuver-change',
                    newLastActiveManeuverIdx: -1,
                    resetCurrentSpeedLimitMph: true,
                    resetDetectedRoadType: true,
                })
                : null;
            if (resetPlan) applySpeedLimitFetchResetFromPlan(resetPlan);
        }
    }
    if (plan.speedLimitReset) {
        const SL = _speedLimitWidget();
        const resetPlan = SL ? SL.buildSpeedLimitFetchResetApplyPlan({ kind: 'full-reroute' }) : null;
        if (resetPlan) applySpeedLimitFetchResetFromPlan(resetPlan);
    }
    if (plan.primeVehicleMarker) {
        primeVehicleMarkerOnRoute(currentLat, currentLon);
    } else if (plan.progressResetWithoutGps) {
        currentStepIndex = plan.progressResetWithoutGps.currentStepIndex;
        lastSnappedRouteIndex = plan.progressResetWithoutGps.lastSnappedRouteIndex;
        lastTurnDetectRouteVertexIndex = plan.progressResetWithoutGps.lastTurnDetectRouteVertexIndex;
    }

    if (plan.roadNameReset) {
        lastRoadNameFetch = 0;
        lastRoadNamePosition = null;
        currentRoadDisplayName = '';
    }
    if (plan.navigationArrivalReset) {
        resetNavigationArrivalState();
    }

    const dev = plan.deviation;
    deviationStartTimeCheck = dev.deviationStartTimeCheck;
    rerouteAttemptCount = dev.rerouteAttemptCount;
    postRerouteGraceUntil = dev.postRerouteGraceUntil;
    routeJoinConfirmedForDeviation = dev.routeJoinConfirmedForDeviation;
    deviationOffRouteStreak = dev.deviationOffRouteStreak;
    lastRerouteTime = dev.lastRerouteTime;
    lastRerouteAttemptTime = dev.lastRerouteAttemptTime;
    rerouteInProgress = dev.rerouteInProgress;
    if (dev.clearFailureRetries) clearRerouteFailureRetries();

    if (currentLat && currentLon) {
        updateTurnWidgetFromPosition(currentLat, currentLon);
        fetchRoadNameThrottled(currentLat, currentLon);
    }

    updateTripInfo(newRoute.distance_km, newRoute.duration_minutes, newRoute.fuel_cost, newRoute.toll_cost);
    window.lastCalculatedRoute = plan.lastCalculatedRoutePatch;
    console.log(plan.completeLog);
}

/**
 * Update route on map with new route data
 */
function updateRouteOnMap(newRoute) {
    resetVoiceAnnouncementStateForNewRoute();

    if (routeLayer && typeof routeLayer.remove === 'function') {
        routeLayer.remove();
    }

    const RD = _rerouteDecision();
    const plan = RD.buildRouteMapUpdateStatePlan(newRoute, window.lastCalculatedRoute, {
        now: Date.now(),
        hasCurrentGps: currentLat != null && currentLon != null,
        convertDistance,
        distUnit: getDistanceUnit(),
    });

    routePolyline = decodePolyline(newRoute.geometry, plan.polylineDecodePrecision);
    console.log(`[Reroute] Route polyline decoded: ${routePolyline.length} points`);

    const mount = _routeSelection().buildNavActiveRouteLayerMountPlan({
        routePolyline,
        navRouteColor: navActiveRouteColor(),
    });
    routeLayer = MapLibreHelpers.addPolyline(map, mount.polyline, mount.style);
    bringNavRouteAboveTrafficEdges();

    applyRouteMapUpdateStateFromPlan(plan, newRoute);
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

/**
 * Initialize auto-traffic and auto-reroute toggles
 */
function initAutoTrafficRerouteToggles() {
    const TU = _toggleUI();
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
    _toggleUI().applyToggleButton(toggle, showCamerasEnabled);

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
    _toggleUI().applyLabeledToggleButton(toggle, showOsmTrafficLightsEnabled);
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
    _toggleUI().applyLabeledToggleButton(toggle, showOsmRailwayCrossingsEnabled);
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
    const TU = _toggleUI();
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
    _toggleUI().applyToggleButton(toggle, roadLabelsEnabled, {
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
 * Mount the route comparison modal from a pure DOM apply plan.
 * @param {Object} domPlan - from buildRouteComparisonModalDomApplyPlan
 * @returns {HTMLElement|null}
 */
function applyRouteComparisonModalFromPlan(domPlan) {
    if (!domPlan || domPlan.action !== 'mount') return null;
    if (domPlan.removeExisting) {
        const existing = document.getElementById(domPlan.modalId);
        if (existing) existing.remove();
    }
    const modal = document.createElement('div');
    modal.id = domPlan.modalId;
    modal.style.cssText = domPlan.overlayStyle;
    modal.innerHTML = domPlan.innerHtml;
    if (domPlan.dismissOnOverlayClick) {
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
    if (!domPlan) return;
    const container = document.getElementById('previewAlternativeRoutesList');
    const parentContainer = document.getElementById('previewAlternativeRoutesContainer');
    if (!parentContainer || !container) return;

    if (!domPlan.showContainer) {
        parentContainer.style.display = domPlan.containerDisplay;
        return;
    }

    container.innerHTML = '';
    domPlan.cardPlans.forEach((plan, index) => {
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

    parentContainer.style.display = domPlan.containerDisplay;
}

/**
 * Run post-preview UI actions (tab, sheet, traffic) from a pure plan.
 * @param {Object} afterPlan - from buildRoutePreviewAfterDisplayPlan
 */
function applyRoutePreviewAfterDisplayFromPlan(afterPlan) {
    if (!afterPlan) return;
    if (afterPlan.switchToPreviewTab) {
        switchTab('routePreview');
    }
    if (afterPlan.expandBottomSheet) {
        expandBottomSheet();
    }
    if (afterPlan.addTrafficLayer) {
        addTrafficLayer();
    }
    if (afterPlan.previewTraffic && routeOptions && routeOptions.length > 0) {
        const previewPolyline = routeOptions[afterPlan.previewPolylineRouteIndex || 0].polyline;
        if (previewPolyline && previewPolyline.length > 0) {
            routePolyline = previewPolyline;
            console.log('[Route Preview] Fetching traffic edges for preview route');
            fetchAndDisplayRouteTraffic();
        }
    }
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
    const selection = _routeSelection();

    console.log('[Route Preview] Currency:', symbol, 'Distance Unit:', distUnit);

    const panelPlan = selection.buildRoutePreviewPanelApplyPlan({
        routeData: routeData,
        selectedRouteIndex: selectedRouteIndex,
        currencySymbol: symbol,
        distanceText: convertDistance(selection.resolvePreviewDistanceKm(
            routeData,
            selection.resolvePreviewRoute(routeData, selectedRouteIndex)
        )) + ' ' + distUnit,
        startLabel: document.getElementById('start').value,
        endLabel: document.getElementById('end').value,
        routingMode: currentRoutingMode,
        vehicleType: currentVehicleType,
        distanceUnit: distanceUnit,
        preferencesApplied: localStorage.getItem('pref_cameras') !== 'false',
        routeOptionsCount: routeOptions ? routeOptions.length : 0,
        skipMapDisplay: skipMapDisplay,
    });

    const domPlan = selection.buildRoutePreviewPanelDomApplyPlan(panelPlan);
    applyRoutePreviewPanelDomFromPlan(domPlan);
    console.log('[Cost] Route preview costs:', domPlan.costLog);

    if (domPlan.previewAlternativeRoutesContainer.showAlternativeRoutes) {
        showAlternativeRoutesInPreview();
        console.log('[Route Preview] Showing alternative routes panel');
    }

    if (domPlan.showMapRoutes) {
        displayAllRoutesOnMap();
        console.log(`[Route Preview] Displayed ${routeOptions.length} route(s) on map`);
    }

    const afterPlan = selection.buildRoutePreviewAfterDisplayPlan({
        routeOptions,
        selectedRouteIndex,
        showTrafficEnabled,
        hasTrafficLayer: !!trafficLayer,
        routeTrafficEnabled,
    });
    console.log('[Route Preview] Switching to routePreview tab');
    applyRoutePreviewAfterDisplayFromPlan(afterPlan);

    console.log('[Route Preview] Route preview displayed successfully');
    showStatus(domPlan.statusMessage, 'success');
}

/**
 * showAlternativeRoutesInPreview function
 * @function showAlternativeRoutesInPreview
 * @returns {*} Return value description
 */
function showAlternativeRoutesInPreview() {
    const RS = _routeSelection();
    const mount = RS.buildAlternativeRoutesPreviewMountPlans(routeOptions, {
        routeColors: routeColors(),
        currencySymbol: getCurrencySymbol(),
        distUnit: getDistanceUnit(),
        fuelUnit: currentVehicleType === 'electric' ? 'kWh' : 'L',
        convertDistance: convertDistance,
    });
    applyAlternativeRoutesPreviewDomFromPlan(
        RS.buildAlternativeRoutesPreviewDomApplyPlan(mount)
    );
}

async function showRouteComparison() {
    console.log('[RouteComparison] showRouteComparison called');
    console.log('[RouteComparison] routeOptions:', routeOptions);
    console.log('[RouteComparison] routeOptions length:', routeOptions ? routeOptions.length : 0);

    const selection = _routeSelection();
    const routeCount = routeOptions ? routeOptions.length : 0;
    if (!selection.hasRoutesForComparison(routeCount)) {
        console.error('[RouteComparison] No routes available:', routeCount);
        showStatus(selection.getRouteComparisonNoRoutesMessage(), 'error');
        return;
    }

    if (routeCount < 2) {
        console.warn('[RouteComparison] Only 1 route available, showing it anyway');
        showStatus(selection.getRouteComparisonSingleRouteMessage(), 'info');
    }

    try {
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
            showStatus(selection.getRouteComparisonApiErrorMessage(data.error), 'error');
            return;
        }

        const comparison = data.comparison;
        const symbol = getCurrencySymbol();
        const distUnit = getDistanceUnit();
        const mountPlan = selection.buildRouteComparisonModalMountPlan(comparison, {
            currencySymbol: symbol,
            distUnit: distUnit,
            distanceTexts: comparison.routes.map((route) => convertDistance(route.distance_km)),
        });

        applyRouteComparisonModalFromPlan(
            selection.buildRouteComparisonModalDomApplyPlan(mountPlan)
        );
        showStatus(selection.getRouteComparisonSuccessMessage(), 'success');
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
    const RS = _routeSelection();
    const plan = RS.buildRouteOverviewDispatchPlan(window.lastCalculatedRoute, decodePolyline);
    if (!plan.ok) {
        showStatus(plan.statusMessage, plan.statusType);
        console.error('[Route] No route available for overview');
        return;
    }

    try {
        MapLibreHelpers.fitMapBounds(map, plan.routePath, plan.fitBounds);
        showStatus(plan.statusMessage, plan.statusType);
        console.log('[Route] Overview fitted bounds for', plan.routePath.length, 'points');
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
 * Collect parking preference values from settings form controls.
 * @returns {Object}
 */
function collectParkingPreferencesFormState() {
    return _multimodalParking().buildParkingPreferencesCollectPlan({
        maxWalkingDistance: document.getElementById('parkingMaxWalkingDistance')?.value,
        preferredType: document.getElementById('parkingPreferredType')?.value,
        pricePreference: document.getElementById('parkingPricePreference')?.value,
    });
}

/**
 * saveParkingPreferences function
 * @function saveParkingPreferences
 * @returns {*} Return value description
 */
function saveParkingPreferences() {
    const MP = _multimodalParking();
    const prefs = collectParkingPreferencesFormState();
    const storage = MP.buildParkingPreferencesStoragePlan(prefs);
    localStorage.setItem(storage.storageKey, storage.storageValue);
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
        const MP = _multimodalParking();
        const saved = localStorage.getItem(MP.PARKING_PREFS_STORAGE_KEY);
        if (!saved) return;

        const prefs = JSON.parse(saved);
        const domPlan = MP.buildParkingPreferencesDomApplyPlan(
            MP.buildParkingPreferencesUiApplyPlan(prefs)
        );
        applyDomSelectsFromPlan(domPlan.selects);
        console.log('[Parking] Preferences loaded:', prefs);
    } catch (e) {
        console.log('[Parking] Error loading preferences:', e);
    }
}

/**
 * Collect voice preference values from settings form controls.
 * @returns {Object}
 */
function collectVoicePreferencesFormState() {
    return _voiceAnnouncements().buildVoicePreferencesCollectPlan({
        turnDistance1: document.getElementById('voiceTurnDistance1')?.value,
        turnDistance2: document.getElementById('voiceTurnDistance2')?.value,
        turnDistance3: document.getElementById('voiceTurnDistance3')?.value,
        hazardDistance: document.getElementById('voiceHazardDistance')?.value,
        voiceFrequencyMode: document.getElementById('voiceFrequencyMode')?.value,
        announcementsEnabled: typeof voiceAnnouncementsEnabled === 'boolean'
            ? voiceAnnouncementsEnabled
            : (localStorage.getItem('voiceAnnouncementsEnabled') === 'true'),
    });
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

/**
 * saveVoicePreferences function
 * @function saveVoicePreferences
 * @returns {*} Return value description
 */
function saveVoicePreferences() {
    const VA = _voiceAnnouncements();
    const prefs = collectVoicePreferencesFormState();
    const storage = VA.buildVoicePreferencesStoragePlan(prefs);
    localStorage.setItem(storage.voicePreferencesKey, storage.voicePreferencesValue);
    localStorage.setItem(storage.voiceFrequencyModeKey, storage.voiceFrequencyModeValue);
    applyVoicePreferencesRuntimeFromPlan(VA.buildVoicePreferencesRuntimeApplyPlan(prefs));

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
        const VA = _voiceAnnouncements();
        const saved = localStorage.getItem(VA.VOICE_PREFS_STORAGE_KEY);
        if (saved) {
            const prefs = JSON.parse(saved);
            const domPlan = VA.buildVoicePreferencesDomApplyPlan(
                VA.buildVoicePreferencesUiApplyPlan(prefs)
            );
            applyDomSelectsFromPlan(domPlan.selects);
            _toggleUI().applyLabeledToggleButton(
                document.getElementById(domPlan.labeledToggle.id),
                domPlan.labeledToggle.enabled
            );
            applyVoicePreferencesRuntimeFromPlan(VA.buildVoicePreferencesRuntimeApplyPlan(prefs));
            console.log('[Voice] Preferences loaded:', prefs);
        } else {
            const domPlan = VA.buildVoicePreferencesDomApplyPlan(
                VA.buildVoicePreferencesUiApplyPlan(null)
            );
            const toggleButton = document.getElementById(domPlan.labeledToggle.id);
            if (toggleButton) {
                _toggleUI().applyLabeledToggleButton(toggleButton, domPlan.labeledToggle.enabled);
                voiceAnnouncementsEnabled = domPlan.labeledToggle.enabled;
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
    _toggleUI().applyLabeledToggleButton(toggle, enabled);
}

function togglePorcupineWakeWord() {
    const button = document.getElementById('porcupineWakeToggle');
    if (!button || !picovoiceClientConfigured()) {
        return;
    }
    button.classList.toggle('active');
    const enabled = button.classList.contains('active');
    _toggleUI().applyLabeledToggleButton(button, enabled);
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

    _toggleUI().applyLabeledToggleButton(button, enabled);

    // Save to localStorage
    localStorage.setItem('voiceAnnouncementsEnabled', enabled ? 'true' : 'false');

    // FIXED: Update the new boolean flag instead of voiceRecognition object
    voiceAnnouncementsEnabled = enabled;
    saveVoicePreferences();
    showStatus(enabled ? '🔊 Voice announcements enabled' : '🔇 Voice announcements disabled', 'success');
    saveAllSettings();
}

async function resolveParkingDestinationCoords(lastRoute, endInput) {
    const MP = _multimodalParking();
    const idx = routeOptions && routeOptions.length > 0
        ? Math.max(0, Math.min(Number(selectedRouteIndex) || 0, routeOptions.length - 1))
        : 0;
    const endEl = document.getElementById('end');
    let endElementCoords = null;
    if (endEl && endEl.dataset.lat && endEl.dataset.lon) {
        const lat = parseFloat(endEl.dataset.lat);
        const lon = parseFloat(endEl.dataset.lon);
        if (!isNaN(lat) && !isNaN(lon)) {
            endElementCoords = { lat, lon };
        }
    }

    let resolved = MP.resolveParkingDestinationCoordsFromSources({
        lastRoute: lastRoute || {},
        selectedRouteOption: routeOptions && routeOptions[idx],
        endElementCoords,
        endInput,
    }, decodePolyline);

    if (resolved.needsGeocode && endInput && typeof geocodeLocations === 'function') {
        const geocoded = await geocodeLocations('', endInput);
        resolved = MP.resolveParkingDestinationCoordsFromSources({
            lastRoute: lastRoute || {},
            selectedRouteOption: routeOptions && routeOptions[idx],
            endElementCoords,
            geocodedEnd: geocoded && geocoded.end,
        }, decodePolyline);
    }

    return resolved.coords || null;
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
    parkingListDiv.innerHTML = _multimodalParking().buildParkingEmptyStateHtml(message);
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

        const parkingPrefs = collectParkingPreferencesFormState();
        const searchPlan = _multimodalParking().buildParkingSearchDispatchPlan({
            lat: endCoords.lat,
            lon: endCoords.lon,
            maxWalkingDist: parseInt(parkingPrefs.maxWalkingDistance, 10),
            parkingType: parkingPrefs.preferredType,
            pricePref: parkingPrefs.pricePreference,
        });

        let searchParams = searchPlan.initialSearch;
        console.log('[Parking] Search parameters:', searchParams);
        let data = await fetchParkingSearch(searchParams);
        console.log('[Parking] Response data:', data);

        if (!data.success) {
            showStatus('Parking search failed: ' + (data.error || 'Unknown error'), 'error');
            return;
        }

        if (!data.parking || data.parking.length === 0) {
            const widen = searchPlan.widenSearchWhenEmpty;
            if (widen.enabled) {
                showStatus(widen.statusMessage, 'info');
                searchParams = widen.params;
                data = await fetchParkingSearch(searchParams);
            }
        }

        if (!data.parking || data.parking.length === 0) {
            showParkingEmptyState(searchPlan.emptyStateMessage);
            showStatus(searchPlan.noResultsStatusMessage, 'warning');
            return;
        }

        console.log('[Parking] Found', data.parking.length, 'parking options');
        displayParkingOptions(data.parking, endCoords);
        showStatus(`✅ Found ${data.parking.length} parking options — scroll down to choose`, 'success');
        scrollParkingResultsIntoView();

        if (data.parking && data.parking.length > 0) {
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

    const parkingModule = _multimodalParking();
    const topParkingOptions = parkingModule.getParkingOptionsDisplaySlice(parkingList);
    console.log('[Parking] Displaying top', topParkingOptions.length, 'parking options');

    topParkingOptions.forEach((parking, index) => {
        const parkingDisplayDist = convertDistance(parking.distance_m / 1000);
        const parkingDistUnit = getDistanceUnit();
        const cardOpts = {
            distanceText: parkingDisplayDist,
            distUnit: parkingDistUnit,
        };

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

        const plan = parkingModule.buildParkingOptionItemMountPlan(parking, index, cardOpts);
        const item = document.createElement('div');
        item.style.cssText = plan.containerStyle;
        item.innerHTML = plan.html;

        item.querySelector('.parking-show-route-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            selectParking(parking, destinationCoords);
        });
        item.querySelector('.parking-set-dest-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            setParkingAsDestination(parking);
        });
        item.addEventListener('click', () => selectParking(parking, destinationCoords));

        item.onmouseover = () => { item.style.background = plan.hoverBackground; };
        item.onmouseout = () => { item.style.background = plan.restBackground; };

        parkingListDiv.appendChild(item);
    });

    parkingSection.style.display = 'block';
    console.log('[Parking] Parking section displayed with', topParkingOptions.length, 'options');
}

async function selectParking(parking, destinationCoords) {
    const MP = _multimodalParking();
    const RR = _routingRequest();
    selectedParking = parking;
    showStatus(MP.getParkingSelectLoadingMessage(), 'loading');

    try {
        const startCoords = MP.resolveParkingStartCoordsFromRoute(window.lastCalculatedRoute);
        if (!startCoords) {
            showStatus(MP.getParkingSelectNoStartMessage(), 'error');
            return;
        }

        const legPrefs = RR.readMultimodalLegAvoidancePrefs(localStorage);
        const drivingExtras = RR.readMultimodalDrivingLegStoragePrefs(localStorage, isAvoidTollsEnabled());
        const drivingBody = RR.buildMultimodalDrivingLegBody({
            startLat: startCoords.lat,
            startLon: startCoords.lon,
            endLat: parking.lat,
            endLon: parking.lon,
            vehicleType: currentVehicleType,
            costParams: getRouteCostParams(currentVehicleType),
            includeTolls: drivingExtras.includeTolls,
            avoidTolls: drivingExtras.avoidTolls,
            avoidCaz: drivingExtras.avoidCaz,
            enableHazardAvoidance: legPrefs.enableHazardAvoidance,
            avoidCameras: legPrefs.avoidCameras,
            avoidTrafficLights: legPrefs.avoidTrafficLights,
            avoidRailwayCrossings: legPrefs.avoidRailwayCrossings,
        });

        const drivingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(drivingBody)
        });

        const drivingData = await drivingResponse.json();
        if (!drivingData.success) {
            showStatus(MP.getParkingSelectLegErrorMessage('driving'), 'error');
            return;
        }

        const walkingBody = RR.buildMultimodalWalkingLegBody({
            startLat: parking.lat,
            startLon: parking.lon,
            endLat: destinationCoords.lat,
            endLon: destinationCoords.lon,
            enableHazardAvoidance: legPrefs.enableHazardAvoidance,
            avoidCameras: legPrefs.avoidCameras,
            avoidTrafficLights: legPrefs.avoidTrafficLights,
            avoidRailwayCrossings: legPrefs.avoidRailwayCrossings,
        });

        const walkingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(walkingBody)
        });

        const walkingData = await walkingResponse.json();
        if (!walkingData.success) {
            showStatus(MP.getParkingSelectLegErrorMessage('walking'), 'error');
            return;
        }

        displayParkingRoutes(drivingData, walkingData, parking, destinationCoords);
        updateParkingPreview(drivingData, walkingData, parking);
        showStatus(MP.getParkingSelectSuccessMessage(), 'success');

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

    const parkingModule = _multimodalParking();

    // Remove previous parking routes
    if (parkingDrivingRoute && typeof parkingDrivingRoute.remove === 'function') parkingDrivingRoute.remove();
    if (parkingWalkingRoute && typeof parkingWalkingRoute.remove === 'function') parkingWalkingRoute.remove();

    // Decode and display driving route (blue) with MapLibre
    if (drivingData && drivingData.geometry) {
        console.log('[Parking] Decoding driving route geometry');
        // Use precision 5 for OSRM/GraphHopper
        const drivingCoords = decodePolyline(drivingData.geometry, 5);
        console.log('[Parking] Driving route has', drivingCoords.length, 'points');
        parkingDrivingRoute = MapLibreHelpers.addPolyline(map, drivingCoords, parkingModule.PARKING_DRIVING_ROUTE_POLYLINE);
    }

    // Decode and display walking route (green) with MapLibre
    if (walkingData && walkingData.geometry) {
        console.log('[Parking] Decoding walking route geometry');
        const walkingCoords = decodePolyline(walkingData.geometry, 5);
        console.log('[Parking] Walking route has', walkingCoords.length, 'points');
        parkingWalkingRoute = MapLibreHelpers.addPolyline(map, walkingCoords, parkingModule.PARKING_WALKING_ROUTE_POLYLINE);
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
    const totals = _multimodalParking().computeMultimodalLegTotals(drivingData, walkingData);
    const distUnit = getDistanceUnit();
    const convertedDist = convertDistance(totals.totalDistKm);
    const startLabel = document.getElementById('start').value;
    const endLabel = document.getElementById('end').value;
    const routeLabel = _multimodalParking().buildParkingRouteLabel(
        startLabel,
        parking.name,
        endLabel
    );
    const breakdown = _multimodalParking().buildParkingBreakdownHtml({
        drivingDistDisplay: convertDistance(totals.drivingDistKm),
        drivingTimeMin: totals.drivingTimeMin,
        walkingDistDisplay: convertDistance(totals.walkingDistKm),
        walkingTimeMin: totals.walkingTimeMin,
        distUnit: distUnit,
    });

    document.getElementById('previewDistance').textContent = convertedDist + ' ' + distUnit;
    document.getElementById('previewDuration').textContent = Math.round(totals.totalTimeMin) + ' min';
    document.getElementById('previewRoute').innerHTML = _multimodalParking().buildParkingPreviewRouteHtml(routeLabel, breakdown);
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
 * Mount one favorites grid row from a module-built spec.
 * @param {HTMLElement} grid
 * @param {Object} fav
 * @param {Object} handlers
 */
function mountFavoriteGridItem(grid, fav, handlers) {
    const FAV = _favorites();
    const spec = FAV.buildFavoriteGridItemSpec(fav, { escapeHtml });
    const container = document.createElement('div');
    container.className = spec.container.className;
    container.style.cssText = spec.container.style;

    const btn = document.createElement('button');
    btn.className = spec.mainButton.className;
    btn.style.cssText = spec.mainButton.style;
    btn.innerHTML = spec.mainButton.html;
    btn.onclick = () => handlers.onSelect(fav);

    const editBtn = document.createElement('button');
    editBtn.innerHTML = spec.editButton.html;
    editBtn.title = spec.editButton.title;
    editBtn.style.cssText = spec.editButton.style;
    editBtn.onclick = (e) => {
        e.stopPropagation();
        handlers.onEdit(fav);
    };

    const delBtn = document.createElement('button');
    delBtn.innerHTML = spec.deleteButton.html;
    delBtn.title = spec.deleteButton.title;
    delBtn.style.cssText = spec.deleteButton.style;
    delBtn.onclick = (e) => {
        e.stopPropagation();
        handlers.onDelete(fav);
    };

    container.appendChild(btn);
    container.appendChild(editBtn);
    container.appendChild(delBtn);
    grid.appendChild(container);
}

/**
 * loadFavorites function
 * @function loadFavorites
 * @returns {*} Return value description
 */
function loadFavorites() {
    const FAV = _favorites();
    fetchJsonWithAuth('/api/favorites')
        .then(({ res, data }) => {
            const section = document.getElementById('favoritesSection');
            const grid = document.getElementById('favoritesGrid');
            grid.innerHTML = '';

            if (res.status === 401) {
                section.style.display = 'none';
                return;
            }

            const favorites = data.success && data.favorites ? data.favorites : [];
            if (FAV.shouldShowFavoritesSection(false, favorites.length)) {
                favorites.forEach(fav => {
                    mountFavoriteGridItem(grid, fav, {
                        onSelect: (item) => {
                            document.getElementById('end').value = item.name;
                            document.getElementById('end').dataset.lat = item.lat;
                            document.getElementById('end').dataset.lon = item.lon;
                            document.getElementById('end').dataset.displayName = item.name;
                            addToSearchHistory(item.name, item.name, item.lat, item.lon);
                            expandBottomSheet();
                            showStatus(FAV.getFavoriteSelectStatusMessage(item.name), 'success');
                        },
                        onEdit: editFavorite,
                        onDelete: deleteFavorite,
                    });
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
    const FAV = _favorites();
    const newName = prompt('Edit name:', fav.name);
    if (!newName || newName === fav.name) return;

    const newCategory = prompt('Edit category:', fav.category);

    getSupabaseAccessToken().then(token => fetch('/api/favorites', {
        method: 'PUT',
        headers: FAV.buildFavoriteAuthHeaders(token),
        body: FAV.buildFavoriteUpdateBody(fav, newName, newCategory),
    }))
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showStatus(FAV.getFavoriteUpdatedStatusMessage(newName), 'success');
            loadFavorites();
        } else {
            showStatus(FAV.getFavoriteApiErrorMessage(data.error), 'error');
        }
    })
    .catch(err => {
        console.error('Error updating favorite:', err);
        showStatus(FAV.getFavoriteActionFailedMessage('update'), 'error');
    });
}

/**
 * Delete a favorite location
 */
function deleteFavorite(fav) {
    const FAV = _favorites();
    if (!confirm(FAV.getFavoriteDeleteConfirmMessage(fav.name))) return;

    getSupabaseAccessToken().then(token => fetch('/api/favorites', {
        method: 'DELETE',
        headers: FAV.buildFavoriteAuthHeaders(token),
        body: FAV.buildFavoriteDeleteBody(fav),
    }))
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showStatus(FAV.getFavoriteRemovedStatusMessage(fav.name), 'success');
            loadFavorites();
        } else {
            showStatus(FAV.getFavoriteApiErrorMessage(data.error), 'error');
        }
    })
    .catch(err => {
        console.error('Error deleting favorite:', err);
        showStatus(FAV.getFavoriteActionFailedMessage('delete'), 'error');
    });
}

// Add current location to favorites
/**
 * addCurrentToFavorites function
 * @function addCurrentToFavorites
 * @returns {*} Return value description
 */
function addCurrentToFavorites() {
    const FAV = _favorites();
    const name = prompt('Enter name for this location (e.g., Home, Work):');
    if (!name) return;

    const category = prompt('Enter category (e.g., home, work, shopping):', 'location');

    getSupabaseAccessToken().then(token => fetch('/api/favorites', {
        method: 'POST',
        headers: FAV.buildFavoriteAuthHeaders(token),
        body: FAV.buildFavoriteCreateBody({
            name: name,
            address: document.getElementById('end').value,
            lat: currentLat,
            lon: currentLon,
            category: category || 'location',
        }),
    }))
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus(FAV.getFavoriteAddedStatusMessage(name), 'success');
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
/** Tracks last sane raw mph accepted by coord-sample tick for outlier rejection. */
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
function _settingsSnapshot() { return VoyagrModules.settingsSnapshot(); }

/** Unit-tested map preview marker HTML (modules/map/preview-marker.js). */
function _previewMarker() { return VoyagrModules.previewMarker(); }

/** Unit-tested favorites list HTML (modules/navigation/favorites.js). */
function _favorites() { return VoyagrModules.favorites(); }

/** Unit-tested road name bar throttle/display helpers (modules/navigation/road-name-display.js). */
function _roadNameDisplay() { return VoyagrModules.roadNameDisplay(); }

/** Unit-tested CAZ zones settings panel HTML (modules/navigation/caz-info.js). */
function _cazInfo() { return VoyagrModules.cazInfo(); }

/** Unit-tested vehicle marker SVG/popup HTML (modules/map/vehicle-marker.js). */
function _vehicleMarker() { return VoyagrModules.vehicleMarker(); }

/** Unit-tested OSM map layer marker HTML (modules/map/osm-map-icons.js). */
function _osmMapIcons() { return VoyagrModules.osmMapIcons(); }

/** Unit-tested navigation map control icons (modules/map/map-controls.js). */
function _mapControls() { return VoyagrModules.mapControls(); }

/** Unit-tested route geometry helpers (modules/navigation/route-geometry.js). */
function _routeGeometry() { return VoyagrModules.routeGeometry(); }

/** Unit-tested ETA helpers (modules/navigation/eta.js). */
function _eta() { return VoyagrModules.eta(); }

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
    const SG = _speedGps();
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

    const SG = _speedGps();
    const SL = _speedLimitWidget();
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

/**
 * Get the road class for a specific maneuver, falling back to instruction-text inference.
 *
 * @param {Object|null} step - A Valhalla maneuver object (or null).
 * @returns {string|null} Road class string, or null when nothing useful could be inferred.
 */
// inferRoadClassFromManeuver / inferRoadClassFromStreetNames — call _routeGeometry() at use sites.

/**
 * Get current road type from route data or default to safe value.
 *
 * @param {number} [maneuverIdxOverride] - Optional maneuver index. When supplied, the road
 *   class is taken from that maneuver rather than from `currentStepIndex`.
 * @param {number} [gpsSpeedMph] - Optional GPS speed hint when route metadata is missing.
 * @returns {string} Road type (motorway, primary, residential, unknown, etc.)
 */
function getCurrentRoadType(maneuverIdxOverride, gpsSpeedMph) {
    return _routeGeometry().resolveCurrentRoadType({
        maneuverIdxOverride,
        gpsSpeedMph,
        currentRouteSteps,
        currentStepIndex,
        lastDetectedRoadType,
    });
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
 * Apply speed-limit fetch outcome state and widget updates from a pure apply plan.
 * @param {Object} outcomeApply
 */
function applySpeedLimitFetchOutcomeFromPlan(outcomeApply) {
    if (!outcomeApply || outcomeApply.action !== 'apply') return;

    const patch = outcomeApply.statePatch || {};
    if (patch.lastDetectedRoadType) lastDetectedRoadType = patch.lastDetectedRoadType;
    if (patch.lastSpeedLimitRegion) lastSpeedLimitRegion = patch.lastSpeedLimitRegion;

    const state = _getSpeedLimitFetchState();
    if (patch.currentLimitMph != null && state) {
        state.currentLimitMph = patch.currentLimitMph;
    }
    if (patch.currentSpeedLimitMph != null) {
        currentSpeedLimitMph = patch.currentSpeedLimitMph;
    }

    if (outcomeApply.widgetUpdate) {
        updateSpeedWidget(
            outcomeApply.widgetUpdate.displaySpeedMph,
            outcomeApply.widgetUpdate.shownLimit
        );
    }

    if (outcomeApply.cacheHint) {
        void cacheSpeedLimit(
            outcomeApply.cacheHint.lat,
            outcomeApply.cacheHint.lon,
            outcomeApply.cacheHint.limitMph,
            outcomeApply.cacheHint.source || 'api'
        );
    }
}

/**
 * Fetch posted speed limit for current GPS position (throttled, offline cache fallback).
 */
function fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType = 'residential', valhallaSpeedLimit = null, headingDeg = null) {
    const SL = _speedLimitWidget();
    const SG = _speedGps();
    const state = _getSpeedLimitFetchState();
    if (!SL || !state) return;

    const tick = SL.buildSpeedLimitFetchTickPlan({
        lat,
        lon,
        roadType,
        valhallaSpeedLimit,
        headingDeg,
        now: Date.now(),
        fetchState: state,
        calculateDistance: calculateDistanceMeters,
        currentSpeedMph,
        currentGpsSpeedMph: currentGpsSpeedMph,
        lastDetectedRoadType,
        lastSpeedLimitRegion,
    });
    if (tick.action === 'skip') return;

    const apply = SL.buildSpeedLimitFetchStateApplyPlan(tick);
    if (apply.action === 'skip') return;

    state.inFlight = apply.statePatch.inFlight;
    state.lastFetchAt = apply.statePatch.lastFetchAt;
    state.lastPosition = apply.statePatch.lastPosition;
    state.seq = apply.statePatch.seq;
    const mySeq = apply.fetch.seq;
    const ctx = apply.context;

    const acceptIfFresh = (outcomeApply) => {
        if (!outcomeApply || outcomeApply.action !== 'apply') return;
        if (mySeq < state.appliedSeq) return;
        state.appliedSeq = mySeq;
        applySpeedLimitFetchOutcomeFromPlan(outcomeApply);
    };

    fetch(apply.fetch.url)
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((data) => {
            acceptIfFresh(SL.buildSpeedLimitApiSuccessApplyPlan({
                data,
                lat: ctx.lat,
                lon: ctx.lon,
                roadType: ctx.roadType,
                valhallaSpeedLimit: ctx.valhallaSpeedLimit,
                currentSpeedMph: ctx.currentSpeedMph,
                currentGpsSpeedMph: ctx.currentGpsSpeedMph,
                lastSpeedLimitRegion: ctx.lastSpeedLimitRegion,
                speedGpsModule: SG,
            }));
        })
        .catch(async () => {
            let cachedLimitMph = null;
            if (_voyagrIsOffline || !navigator.onLine) {
                try {
                    const cached = await getCachedSpeedLimit(lat, lon);
                    cachedLimitMph = SL.readCachedLimitMph(cached, Date.now());
                } catch (_) { /* ignore */ }
            }
            acceptIfFresh(SL.buildSpeedLimitFetchFallbackApplyPlan({
                cachedLimitMph,
                valhallaSpeedLimit: ctx.valhallaSpeedLimit,
                roadType: ctx.roadType,
                lastDetectedRoadType: ctx.lastDetectedRoadType,
                lastSpeedLimitRegion: ctx.lastSpeedLimitRegion,
                currentGpsSpeedMph: ctx.currentGpsSpeedMph,
            }));
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
    _toggleUI().applyLabeledToggleButton(toggle, speedWidgetEnabled);
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
        const recenterRoadType = getCurrentRoadType(undefined, speedMph);
        const followCamera = _cameraPitch().buildNavigationFollowCameraPlan({
            speedMph,
            roadType: recenterRoadType,
            heading: (currentUserMarker && Number.isFinite(currentUserMarker.heading))
                ? currentUserMarker.heading
                : map.getBearing(),
            mapBearing: map.getBearing(),
            markerLat: lat,
            markerLon: lon,
            shouldEase: true,
            durationMs: 600,
            shouldTilt: shouldTiltDrivingCamera(),
            usePitchedDrivingCamera: shouldUsePitchedDrivingCamera(),
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            computeSmartZoom: (spd, dist, rt) => _routeGeometry().calculateSmartZoom(
                spd, dist, rt, ZOOM_LEVELS, TURN_ZOOM_THRESHOLD
            ),
        });

        window.__voyagrLastFollowCenterGeo = { lat, lon };
        window.__voyagrLastFollowEaseAt = Date.now();
        if (followCamera.easeTo) {
            map.easeTo(followCamera.easeTo);
        }
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
    smartZoomEnabled = !smartZoomEnabled;
    const btn = document.getElementById('smartZoomToggle');
    _toggleUI().applyToggleButton(btn, smartZoomEnabled);
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
    const MC = _mapControls();
    const TU = _toggleUI();
    isAREnabled = MC.isAREnabledInStorage(localStorage);
    const arToggleBtn = document.getElementById('arToggleBtn');
    if (arToggleBtn) {
        TU.applyToggleButton(arToggleBtn, isAREnabled, TU.TOGGLE_SWITCH_OPTS);
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
    _toggleUI().applyToggleButton(button, gestureEnabled);

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
    _toggleUI().applyToggleButton(document.getElementById('batterySavingMode'), true);

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
    _toggleUI().applyToggleButton(document.getElementById('batterySavingMode'), false);

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
    const ML = _mlPredictions();
    fetch('/api/ml-predictions')
        .then(response => response.json())
        .then(data => {
            if (ML.hasMlPredictionsToShow(data)) {
                const section = document.getElementById('mlPredictionsSection');
                const list = document.getElementById('mlPredictionsList');
                list.innerHTML = '';

                data.predictions.forEach(pred => {
                    const item = document.createElement('div');
                    item.className = ML.ML_PREDICTION_ITEM_CLASS;
                    item.innerHTML = ML.buildMlPredictionItemHtml(pred);
                    item.onclick = () => {
                        const inputs = ML.getMlPredictionRouteInputs(pred);
                        document.getElementById('start').value = inputs.start;
                        document.getElementById('end').value = inputs.end;
                        calculateRoute();
                    };
                    list.appendChild(item);
                });

                section.classList.add(ML.ML_PREDICTIONS_SECTION_SHOW_CLASS);
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
    const ML = _mlPredictions();
    const TU = _toggleUI();
    const button = document.getElementById('mlPredictionsEnabled');

    const enabled = TU.nextToggleState(button.classList.contains('active'));
    TU.applyLabeledToggleButton(button, enabled);

    localStorage.setItem(ML.ML_PREDICTIONS_STORAGE_KEY, enabled ? 'true' : 'false');

    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ml_predictions_enabled: enabled ? 1 : 0 })
    }).catch(error => console.error('Error updating ML predictions:', error));

    if (enabled) {
        loadMLPredictions();
        showStatus(ML.getMlPredictionsEnabledStatusMessage(true), 'success');
    } else {
        document.getElementById('mlPredictionsSection').classList.remove(ML.ML_PREDICTIONS_SECTION_SHOW_CLASS);
        showStatus(ML.getMlPredictionsEnabledStatusMessage(false), 'info');
    }

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
    const MC = _mapControls();
    const m = document.getElementById('mapControlsHintModal');
    const ul = document.getElementById('mapControlsHintList');
    if (!m || !ul) return;
    ul.innerHTML = '';
    const sections = MC.MAP_CONTROLS_HINT_SECTIONS;
    for (let s = 0; s < sections.length; s++) {
        const sec = sections[s];
        const secTitle = document.createElement('li');
        secTitle.className = 'map-hint-section-title';
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
            li.className = 'map-hint-item';
            li.textContent = MC.formatMapControlsHintItemLabel(el.textContent, hint);
            ul.appendChild(li);
        }
    }

    const exTitle = document.createElement('li');
    exTitle.className = 'map-hint-section-title';
    exTitle.textContent = MC.MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE;
    ul.appendChild(exTitle);
    const extras = MC.MAP_CONTROLS_HINT_EXTRAS;
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
async function cacheSpeedLimit(lat, lon, speedLimit, source) {
    const SL = _speedLimitWidget();
    const OFF = _offlineNavigation();
    if (!SL || !OFF) return;
    try {
        const key = SL.speedLimitCacheKey(lat, lon);
        await OFF.putSpeedLimitCacheEntry(indexedDB, key, speedLimit, source);
    } catch (e) { /* ignore */ }
}

async function getCachedSpeedLimit(lat, lon) {
    const SL = _speedLimitWidget();
    const OFF = _offlineNavigation();
    if (!SL || !OFF) return null;
    try {
        const key = SL.speedLimitCacheKey(lat, lon);
        return await OFF.getSpeedLimitCacheEntry(indexedDB, key);
    } catch (e) {
        return null;
    }
}

async function persistActiveRoute() {
    const OFF = _offlineNavigation();
    if (!OFF || !routeInProgress || !routePolyline) return;
    try {
        await OFF.persistActiveRouteRecord(indexedDB, OFF.buildActiveRoutePersistRecord({
            polyline: routePolyline,
            steps: currentRouteSteps,
            stepIndex: currentStepIndex,
            destination: window.lastCalculatedRoute?.destination || null,
            routeData: window.lastCalculatedRoute || null,
        }));
    } catch (e) {
        console.warn('[OfflineNav] Failed to persist route:', e);
    }
}

async function loadPersistedRoute() {
    const OFF = _offlineNavigation();
    if (!OFF) return null;
    try {
        const result = await OFF.loadActiveRouteRecord(indexedDB);
        if (!result) return null;
        if (OFF.isPersistedRouteExpired(result.savedAt)) {
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
    const OFF = _offlineNavigation();
    if (!OFF) return;
    try {
        await OFF.clearActiveRouteRecord(indexedDB);
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
 */
function collectVectorTileTemplatesFromMap() {
    const OFF = _offlineNavigation();
    if (!OFF || typeof map === 'undefined' || map === null) return [];
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return [];
    try {
        return OFF.parseVectorTileSourcesFromStyle(map.getStyle());
    } catch (e) {
        console.warn('[TilePreCache] Could not read map style:', e);
        return [];
    }
}

async function precacheRouteTiles(polyline) {
    const OFF = _offlineNavigation();
    if (!OFF || !polyline || polyline.length < 2) return;
    if (!('caches' in window)) return;

    const templates = collectVectorTileTemplatesFromMap();
    if (templates.length === 0) {
        console.log('[TilePreCache] Style has no vector tile templates yet — skipping corridor precache');
        return;
    }

    const plan = OFF.buildRouteCorridorTileUrlPlan(polyline, templates, {
        origin: window.location.origin,
        maxUrls: OFF.TILE_PRECACHE_MAX_URLS,
        zoomLevels: OFF.TILE_PRECACHE_ZOOM_LEVELS,
    });

    if (plan.capped) {
        console.log(`[TilePreCache] Capping prefetch ${plan.originalCount} → ${plan.urls.length} URLs`);
    }

    console.log(`[TilePreCache] Pre-caching ${plan.urls.length} tiles (${templates.length} source template(s)) along route corridor`);

    try {
        const cacheNames = await caches.keys();
        const tileCacheName = cacheNames.find(n => n.startsWith('voyagr-tiles-')) || 'voyagr-tiles-v15';
        const cache = await caches.open(tileCacheName);
        let cached = 0;
        const batchSize = OFF.TILE_PRECACHE_BATCH_SIZE;
        for (let i = 0; i < plan.urls.length; i += batchSize) {
            const batch = plan.urls.slice(i, i + batchSize);
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
    driverPerspectiveEnabled = !driverPerspectiveEnabled;
    localStorage.setItem('driverPerspectiveEnabled', driverPerspectiveEnabled.toString());

    const btn = document.getElementById('driverPerspectiveToggle');
    const pitched = shouldUsePitchedDrivingCamera();
    _toggleUI().applyToggleButton(btn, pitched);

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
let mapView3DEnabled = (localStorage.getItem('mapView3DEnabled') !== null)
    ? (localStorage.getItem('mapView3DEnabled') === 'true')
    : (driverPerspectiveEnabled || buildings3DEnabled);

/** Reflect the current 2D/3D state on the master toggle and the two granular toggles. */
function syncMapView3DToggleUI() {
    const TU = _toggleUI();
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
    const MC = _mapControls();
    const TU = _toggleUI();
    const btn = document.getElementById('arToggleBtn');
    if (btn) {
        isAREnabled = TU.nextToggleState(isAREnabled);
        TU.applyToggleButton(btn, isAREnabled, TU.TOGGLE_SWITCH_OPTS);
        MC.writeAREnabledToStorage(localStorage, isAREnabled);

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
    const MC = _mapControls();
    const arFab = document.getElementById('arModeBtn');
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
    const toggleBtn = document.getElementById('arModeBtn');

    if (arModeActive) {
        await stopARMode();
        MC.applyARModeToggleButton(toggleBtn, false, TU);
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
            MC.applyARModeToggleButton(toggleBtn, true, TU);
            showStatus(`📷 AR mode active (${result.mode})`, 'success');

            // Sync current instruction to AR
            if (currentRouteSteps && currentStepIndex < currentRouteSteps.length) {
                const step = currentRouteSteps[currentStepIndex];
                arNavigator.updateInstruction({
                    instruction: step.instruction,
                    direction: _turnInstructions().maneuverTypeToARDirectionKey(step.type),
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
    _mapControls().applyARModeToggleButton(
        document.getElementById('arModeBtn'),
        false,
        _toggleUI()
    );
    showStatus('🗺️ Returned to map view', 'info');
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
            if (_domHelpers().closest(e.target, 'button')) return;
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
        if (_domHelpers().closest(e.target, '.bottom-sheet-content')) {
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
 * Apply follow-camera ease for one GPS tick; returns zoom coordination flags.
 * @param {number} markerLat
 * @param {number} markerLon
 * @param {number} followJumpM
 * @param {number} speedMph
 * @param {number} heading
 * @param {string} roadType
 * @returns {{ navigationFollowEaseApplied: boolean, navigationFollowZoom: (number|null) }}
 */
function applyGpsFollowCameraTick(markerLat, markerLon, followJumpM, speedMph, heading, roadType) {
    const CP = _cameraPitch();
    const followPlan = CP.buildNavigationFollowEasePlan({
        nowMs: Date.now(),
        lastFollowEaseAt: window.__voyagrLastFollowEaseAt || 0,
        followJumpM,
        zoomAndFollowEnabled,
        mapFollowingActive,
        mapUserPanned: !!(map && map._userPanned),
        routeInProgress,
    });

    const followCamera = (followPlan.mode === 'navigation' && map)
        ? CP.buildNavigationFollowCameraPlan({
            speedMph,
            roadType: roadType || 'unknown',
            heading: heading || map.getBearing(),
            mapBearing: map.getBearing(),
            markerLat,
            markerLon,
            shouldEase: followPlan.shouldEase,
            durationMs: followPlan.durationMs,
            shouldTilt: shouldTiltDrivingCamera(),
            usePitchedDrivingCamera: shouldUsePitchedDrivingCamera(),
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            computeSmartZoom: (spd, dist, rt) => _routeGeometry().calculateSmartZoom(
                spd, dist, rt, ZOOM_LEVELS, TURN_ZOOM_THRESHOLD
            ),
        })
        : null;

    const apply = CP.buildNavigationFollowApplyPlan({
        hasMap: !!map,
        followEasePlan: followPlan,
        followCameraPlan: followCamera,
        markerLat,
        markerLon,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        isActiveNavigationFollow: isActiveNavigationFollow(),
        driverPerspectiveEnabled,
    });

    if (apply.statePatch) {
        window.__voyagrLastFollowEaseAt = apply.statePatch.lastFollowEaseAt;
        window.__voyagrLastFollowCenterGeo = apply.statePatch.lastFollowCenterGeo;
    }
    if (apply.easeTo && map) {
        map.easeTo(apply.easeTo);
    }
    if (apply.logLine) console.log(apply.logLine);
    if (apply.updateRecenterVisibility) updateRecenterButtonVisibility();

    return {
        navigationFollowEaseApplied: !!apply.navigationFollowEaseApplied,
        navigationFollowZoom: apply.navigationFollowZoom,
    };
}

/**
 * Apply a vehicle marker tick plan (update existing or create fresh).
 * @param {Object} markerTick - from buildVehicleMarkerTickPlan
 */
function applyVehicleMarkerFromTickPlan(markerTick) {
    if (!markerTick) return;

    if (markerTick.action === 'update') {
        currentUserMarker.setLngLat(markerTick.lngLat);
        const markerEl = currentUserMarker.getElement ? currentUserMarker.getElement() : null;
        if (markerEl) {
            const inner = markerEl.querySelector('div');
            if (inner) {
                inner.style.transform = `rotate(${markerTick.rotationDeg}deg)`;
            }
        }
        currentUserMarker.heading = markerTick.heading;
        currentUserMarker.speed = markerTick.speed;
        currentUserMarker.accuracy = markerTick.accuracy;
        return;
    }

    if (currentUserMarker && typeof currentUserMarker.remove === 'function') {
        currentUserMarker.remove();
    }
    currentUserMarker = createVehicleMarker(
        markerTick.lat,
        markerTick.lon,
        markerTick.speed,
        markerTick.accuracy,
        markerTick.heading
    );
    currentUserMarker.addTo(map);
}

/**
 * Update or create the vehicle marker from a GPS tick plan.
 * @param {number} markerLat
 * @param {number} markerLon
 * @param {number} heading
 * @param {number} speed
 * @param {number} accuracy
 */
function applyGpsVehicleMarkerTick(markerLat, markerLon, heading, speed, accuracy) {
    const SGpos = _speedGps();
    const markerTick = SGpos
        ? SGpos.buildVehicleMarkerTickPlan({
            hasMarker: !!currentUserMarker,
            canSetLngLat: !!(currentUserMarker && typeof currentUserMarker.setLngLat === 'function'),
            markerLat,
            markerLon,
            heading,
            speed,
            accuracy,
            mapBearing: map && typeof map.getBearing === 'function' ? map.getBearing() : 0,
        })
        : { action: 'create', lat: markerLat, lon: markerLon, speed, accuracy, heading };

    applyVehicleMarkerFromTickPlan(markerTick);
}

/**
 * Apply GPS position state patches from a position apply plan.
 * @param {Object} apply - from buildGpsPositionStateApplyPlan
 */
function applyGpsPositionStateFromPlan(apply) {
    if (!apply || apply.action !== 'apply') return;
    const patch = apply.statePatch || {};
    if (patch.snapBlendWeightState != null) {
        _snapBlendWeightState = patch.snapBlendWeightState;
    }
    if (patch.lastSnappedRouteIndex != null) {
        lastSnappedRouteIndex = patch.lastSnappedRouteIndex;
    }
    if (patch.smoothDisplayLat != null) {
        _smoothDisplayLat = patch.smoothDisplayLat;
    }
    if (patch.smoothDisplayLon != null) {
        _smoothDisplayLon = patch.smoothDisplayLon;
    }
}

/**
 * Apply speed-limit fetch state reset from buildSpeedLimitFetchResetApplyPlan.
 * @param {Object} resetPlan
 */
function applySpeedLimitFetchResetFromPlan(resetPlan) {
    if (!resetPlan || resetPlan.action !== 'apply') return;

    if (resetPlan.newLastActiveManeuverIdx != null) {
        _lastActiveManeuverIdx = resetPlan.newLastActiveManeuverIdx;
    }

    const state = _getSpeedLimitFetchState();
    if (state) {
        if (resetPlan.resetFetchTimestamps) {
            state.lastFetchAt = 0;
        }
        if (resetPlan.resetLastPosition) {
            state.lastPosition = null;
        }
        if (resetPlan.resetCurrentLimitMph) {
            state.currentLimitMph = null;
        }
    }

    if (resetPlan.resetCurrentSpeedLimitMph) {
        currentSpeedLimitMph = null;
    }
    if (resetPlan.resetDetectedRoadType) {
        lastDetectedRoadType = null;
    }
}

/**
 * Apply speed widget update from buildSpeedWidgetApplyPlan result.
 * @param {Object} swPlan
 */
function applySpeedWidgetFromApplyPlan(swPlan) {
    if (!swPlan || swPlan.action !== 'apply') return;

    if (swPlan.resetFetchState) {
        const SL = _speedLimitWidget();
        const resetPlan = SL
            ? SL.buildSpeedLimitFetchResetApplyPlan({
                kind: 'maneuver-change',
                newLastActiveManeuverIdx: swPlan.newLastActiveManeuverIdx,
            })
            : null;
        if (resetPlan) applySpeedLimitFetchResetFromPlan(resetPlan);
    }
    updateSpeedWidget(swPlan.updateWidget.displaySpeedMph, swPlan.updateWidget.shownLimit);
    if (swPlan.fetchHint) {
        fetchSpeedLimitThrottled(
            swPlan.fetchHint.lat,
            swPlan.fetchHint.lon,
            swPlan.fetchHint.displaySpeedMph,
            swPlan.fetchHint.roadType,
            swPlan.fetchHint.valhallaSpeedLimitMph,
            swPlan.fetchHint.heading
        );
    }
}

/**
 * Turn detection, voice, and widget side-effects for one GPS tick.
 * @param {number} lat
 * @param {number} lon
 * @param {Object} turnPlan - from buildGpsNavigationSideEffectsTickPlan.turn
 * @returns {{ distanceToNextTurn: (number|null), turnInfoThisTick: (Object|null) }}
 */
function applyGpsTurnSideEffectsTick(lat, lon, turnPlan) {
    let distanceToNextTurn = null;
    let turnInfoThisTick = null;

    if (turnPlan.detect) {
        turnInfoThisTick = detectUpcomingTurn(lat, lon);
    }

    if (turnPlan.announce && turnInfoThisTick) {
        distanceToNextTurn = turnInfoThisTick.distance;
        announceUpcomingTurn(turnInfoThisTick);
    }

    if (turnPlan.updateWidget) {
        updateTurnWidgetFromPosition(lat, lon, turnInfoThisTick);
    }

    return { distanceToNextTurn, turnInfoThisTick };
}

/**
 * Route deviation and hazard side-effects for one GPS tick.
 * @param {number} lat
 * @param {number} lon
 * @param {number} accuracy
 * @param {Object} tickPlan - from buildGpsNavigationSideEffectsTickPlan
 */
function applyGpsHazardAndDeviationSideEffectsTick(lat, lon, accuracy, tickPlan) {
    if (tickPlan.checkDeviation) {
        checkRouteDeviation(lat, lon, accuracy);
    }
    if (tickPlan.processHazards) {
        processNavigationHazardAlerts(lat, lon);
    }
}

/**
 * Road name fetch side-effect for one GPS tick.
 * @param {number} lat
 * @param {number} lon
 * @param {Object} tickPlan - from buildGpsNavigationSideEffectsTickPlan
 */
function applyGpsRoadNameSideEffectTick(lat, lon, tickPlan) {
    if (tickPlan.fetchRoadName) {
        fetchRoadNameThrottled(lat, lon);
    }
}

/**
 * Destination and arrival voice side-effects for one GPS tick.
 * @param {number} lat
 * @param {number} lon
 * @param {number} speedMs
 * @param {Object} tickPlan - from buildGpsNavigationSideEffectsTickPlan
 */
function applyGpsNavigationVoiceSideEffectsTick(lat, lon, speedMs, tickPlan) {
    if (tickPlan.announceDestination) {
        announceDistanceToDestination(lat, lon);
    }
    if (tickPlan.checkArrival) {
        checkNavigationArrival(lat, lon, speedMs);
    }
}

/**
 * Smart zoom side-effects for one GPS tick.
 * @param {Object} ctx
 * @returns {void}
 */
function applyGpsZoomSideEffectsTick(ctx) {
    const {
        speedMph,
        distanceToNextTurn,
        speedLimitPlan,
        lat,
        lon,
        navigationFollowEaseApplied,
        navigationFollowZoom,
    } = ctx;

    const CP = _cameraPitch();
    const zoomTick = CP.buildNavigationZoomTickPlan({
        smartZoomEnabled,
        routeInProgress,
        navigationFollowEaseApplied,
        followZoom: navigationFollowZoom,
    });
    const zoomApply = CP.buildNavigationZoomApplyPlan(zoomTick, {
        speedMph,
        distanceToNextTurn,
        roadType: speedLimitPlan.roadType || 'unknown',
        lat,
        lon,
    });
    if (zoomApply.action !== 'apply') return;

    if (zoomApply.syncLastZoomLevel != null) {
        lastZoomLevel = zoomApply.syncLastZoomLevel;
    }
    if (zoomApply.applySmartZoom) {
        applySmartZoomWithAnimation(
            zoomApply.applySmartZoom.speedMph,
            zoomApply.applySmartZoom.distanceToNextTurn,
            zoomApply.applySmartZoom.roadType,
            zoomApply.applySmartZoom.lat,
            zoomApply.applySmartZoom.lon
        );
    }
}

/**
 * Lane guidance and speed widget side-effects for one GPS tick.
 * @param {Object} ctx
 * @param {number} ctx.lat
 * @param {number} ctx.lon
 * @param {number} ctx.heading
 * @param {Object} ctx.tickPlan - from buildGpsNavigationSideEffectsTickPlan
 * @param {Object} ctx.speedLimitPlan
 */
function applyGpsLaneAndSpeedSideEffectsTick(ctx) {
    const { lat, lon, heading, tickPlan, speedLimitPlan } = ctx;

    if (tickPlan.updateLaneGuidance) {
        const TI = _turnInstructions();
        const laneTick = TI.buildLaneGuidanceTickPlan({
            routeInProgress,
            routeSteps: currentRouteSteps,
            currentStepIndex,
        });
        const laneApply = TI.buildLaneGuidanceTickApplyPlan(laneTick);
        if (laneApply.action === 'apply') {
            updateLaneGuidance(
                lat,
                lon,
                heading,
                laneApply.maneuverDir,
                laneApply.roundaboutExitCount
            );
        }
    }

    if (tickPlan.showSpeedWidget) {
        const SL = _speedLimitWidget();
        const swPlan = SL
            ? SL.buildSpeedWidgetApplyPlan({
                showSpeedWidget: tickPlan.showSpeedWidget,
                speedLimitPlan,
                routeInProgress,
                isTrackingActive,
                lat,
                lon,
                heading,
            })
            : { action: 'skip' };
        applySpeedWidgetFromApplyPlan(swPlan);
    }
}

/**
 * Navigation side-effects for one GPS tick (deviation, voice, zoom, lane, speed).
 * @param {Object} ctx
 * @returns {{ distanceToNextTurn: (number|null) }}
 */
function applyGpsNavigationSideEffectsTick(ctx) {
    const {
        lat,
        lon,
        speed,
        accuracy,
        heading,
        speedMph,
        sideEffects,
        speedLimitPlan,
        navigationFollowEaseApplied,
        navigationFollowZoom,
    } = ctx;

    const tickPlan = _routeProgress().buildGpsNavigationSideEffectsTickPlan({ sideEffects });

    applyGpsHazardAndDeviationSideEffectsTick(lat, lon, accuracy, tickPlan);

    let distanceToNextTurn = null;

    if (tickPlan.turn.detect || tickPlan.turn.announce || tickPlan.turn.updateWidget) {
        const turnResult = applyGpsTurnSideEffectsTick(lat, lon, tickPlan.turn);
        distanceToNextTurn = turnResult.distanceToNextTurn;
    }

    if (tickPlan.announceDestination || tickPlan.checkArrival) {
        applyGpsNavigationVoiceSideEffectsTick(lat, lon, speed, tickPlan);
    }

    if (tickPlan.applyZoom) {
        applyGpsZoomSideEffectsTick({
            speedMph,
            distanceToNextTurn,
            speedLimitPlan,
            lat,
            lon,
            navigationFollowEaseApplied,
            navigationFollowZoom,
        });
    }

    if (tickPlan.updateLaneGuidance || tickPlan.showSpeedWidget) {
        applyGpsLaneAndSpeedSideEffectsTick({
            lat,
            lon,
            heading,
            tickPlan,
            speedLimitPlan,
        });
    }

    applyGpsRoadNameSideEffectTick(lat, lon, tickPlan);

    return { distanceToNextTurn };
}

/**
 * Marker, follow camera, and navigation side-effects after a position tick.
 * @param {Object} pos - from applyGpsPositionTick
 */
function applyGpsTrackingSideEffectsFromPosition(pos) {
    applyGpsVehicleMarkerTick(pos.markerLat, pos.markerLon, pos.heading, pos.speed, pos.accuracy);

    const followState = applyGpsFollowCameraTick(
        pos.markerLat,
        pos.markerLon,
        pos.followJumpM,
        pos.speedMph,
        pos.heading,
        pos.speedLimitPlan.roadType || 'unknown'
    );

    applyGpsNavigationSideEffectsTick({
        lat: pos.lat,
        lon: pos.lon,
        speed: pos.speed,
        accuracy: pos.accuracy,
        heading: pos.heading,
        speedMph: pos.speedMph,
        sideEffects: pos.sideEffects,
        speedLimitPlan: pos.speedLimitPlan,
        navigationFollowEaseApplied: followState.navigationFollowEaseApplied,
        navigationFollowZoom: followState.navigationFollowZoom,
    });
}

/**
 * Coord sample, history, raw speed, and odometer for one GPS tick.
 * @param {Object} sample - from normalizeGeolocationCoordsSample
 * @returns {Object}
 */
function applyGpsCoordSampleTick(sample) {
    const SG = _speedGps();
    const tick = SG.buildGpsCoordSampleTickPlan({
        sample,
        trackingHistory,
        pickRawSpeedState: {
            lastGoodRawPickMph: _lastGoodRawPickMph,
            consecutiveDisplacementMoves: _consecutiveDisplacementMoves,
        },
        routeInProgress,
        odometerState: { lastGeo: _navOdometerLastGeo, traveledMeters: _navTraveledMeters },
        nowMs: Date.now(),
        calculateDistanceMeters,
    });
    const apply = SG.buildGpsCoordSampleStateApplyPlan(tick);
    if (apply.action !== 'apply') {
        return {
            lat: sample.lat,
            lon: sample.lon,
            accuracy: sample.accuracy,
            speed: sample.speedMs,
            deviceHeading: sample.deviceHeading,
            speedMph: 0,
        };
    }

    currentLat = apply.lat;
    currentLon = apply.lon;
    updateRoadReportFabVisibility();

    const patch = apply.statePatch;
    if (patch.trackingHistory) {
        trackingHistory = patch.trackingHistory;
    }
    if (patch.pickRawSpeedState) {
        _lastGoodRawPickMph = patch.pickRawSpeedState.lastGoodRawPickMph;
        _consecutiveDisplacementMoves = patch.pickRawSpeedState.consecutiveDisplacementMoves;
    }
    if (patch.odometer) {
        _navOdometerLastGeo = patch.odometer.lastGeo;
        _navTraveledMeters = patch.odometer.traveledMeters;
    }

    return {
        lat: apply.lat,
        lon: apply.lon,
        accuracy: apply.accuracy,
        speed: apply.speed,
        deviceHeading: apply.deviceHeading,
        speedMph: apply.speedMph,
    };
}

/**
 * Build inputs for buildGpsPositionTickPlan from app navigation state.
 * @param {Object} coord - from applyGpsCoordSampleTick
 * @returns {Object}
 */
function buildGpsPositionTickInputs(coord) {
    const SGhead = _speedGps();
    const SL = _speedLimitWidget();
    return {
        lat: coord.lat,
        lon: coord.lon,
        accuracy: coord.accuracy,
        routeInProgress,
        routePolyline,
        snapped: resolveGpsRouteSnapForTick(coord.lat, coord.lon),
        lastSnappedRouteIndex,
        prevSnapBlendWeightState: _snapBlendWeightState,
        speedMph: coord.speedMph,
        smoothDisplayLat: _smoothDisplayLat,
        smoothDisplayLon: _smoothDisplayLon,
        lastFollowCenterGeo: window.__voyagrLastFollowCenterGeo,
        calculateDistanceMeters,
        calculateBearing: (a, b, c, d) => _routeGeometry().bearing(a, b, c, d),
        blendHeadingsCircular: _routeGeometry().blendHeadingsCircular,
        resolveGpsHeading: () => (SGhead
            ? SGhead.resolveGpsHeadingDegrees({
                deviceHeading: coord.deviceHeading,
                speed: coord.speed,
                trackingHistory,
                calculateDistanceMeters,
            })
            : 0),
        isTrackingActive,
        currentRouteSteps,
        displaySpeedMph: smoothGpsSpeedMph(coord.speedMph),
        currentSpeedLimitMph,
        lastSpeedLimitRegion,
        lastActiveManeuverIdx: _lastActiveManeuverIdx,
        resolveRoadType: (idx, spd) => _routeGeometry().resolveCurrentRoadType({
            maneuverIdxOverride: idx,
            gpsSpeedMph: spd,
            currentRouteSteps,
            currentStepIndex,
            lastDetectedRoadType,
        }),
        pickDisplaySpeedLimitMph: SL
            ? (api, val, rt, region) => SL.pickDisplaySpeedLimitMph(api, val, rt, region)
            : null,
    };
}

/**
 * Apply route preview panel DOM patches from a pure DOM apply plan.
 * @param {Object} domPlan - from buildRoutePreviewPanelDomApplyPlan
 */
function applyRoutePreviewPanelDomFromPlan(domPlan) {
    if (!domPlan) return;

    const previewDistanceEl = document.getElementById('previewDistance');
    if (previewDistanceEl && domPlan.previewDistance) {
        previewDistanceEl.dataset.km = domPlan.previewDistance.datasetKm;
        previewDistanceEl.textContent = domPlan.previewDistance.textContent;
    }

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text != null) el.textContent = text;
    };
    setText('previewDuration', domPlan.previewDuration && domPlan.previewDuration.textContent);
    setText('previewRoute', domPlan.previewRoute && domPlan.previewRoute.textContent);
    setText('previewFuelCost', domPlan.previewFuelCost && domPlan.previewFuelCost.textContent);
    setText('previewTollCost', domPlan.previewTollCost && domPlan.previewTollCost.textContent);
    setText('previewCAZCost', domPlan.previewCAZCost && domPlan.previewCAZCost.textContent);
    setText('previewTotalCost', domPlan.previewTotalCost && domPlan.previewTotalCost.textContent);
    setText('previewRoutingMode', domPlan.previewRoutingMode && domPlan.previewRoutingMode.textContent);
    setText('previewVehicleType', domPlan.previewVehicleType && domPlan.previewVehicleType.textContent);

    const fuelLitresEl = document.getElementById('previewFuelLitres');
    if (fuelLitresEl && domPlan.previewFuelLitres) {
        if (domPlan.previewFuelLitres.visible) {
            fuelLitresEl.textContent = domPlan.previewFuelLitres.textContent;
            fuelLitresEl.style.display = domPlan.previewFuelLitres.display;
        } else {
            fuelLitresEl.style.display = domPlan.previewFuelLitres.display;
        }
    }

    const cazStatusContainer = document.getElementById('cazStatusContainer');
    if (cazStatusContainer && domPlan.cazStatusContainer) {
        if (domPlan.cazStatusContainer.visible) {
            cazStatusContainer.innerHTML = domPlan.cazStatusContainer.innerHtml;
            cazStatusContainer.style.display = domPlan.cazStatusContainer.display;
        } else {
            cazStatusContainer.style.display = domPlan.cazStatusContainer.display;
        }
    }

    const hazardContainer = document.getElementById('hazardInfoContainer');
    if (hazardContainer && domPlan.hazardInfoContainer) {
        const plan = domPlan.hazardInfoContainer;
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

    const altContainer = document.getElementById('previewAlternativeRoutesContainer');
    if (altContainer && domPlan.previewAlternativeRoutesContainer
        && domPlan.previewAlternativeRoutesContainer.display != null) {
        altContainer.style.display = domPlan.previewAlternativeRoutesContainer.display;
    }
}

/**
 * Position, odometer, speed-limit, and side-effects setup for one GPS tick.
 * @param {Object} sample - from normalizeGeolocationCoordsSample
 * @returns {Object}
 */
function applyGpsPositionTick(sample) {
    const coord = applyGpsCoordSampleTick(sample);
    const SGpos = _speedGps();
    const plans = SGpos
        ? SGpos.buildGpsPositionTickPlan(buildGpsPositionTickInputs(coord))
        : {
            posApply: {
                action: 'apply',
                heading: 0,
                markerLat: coord.lat,
                markerLon: coord.lon,
                followJumpM: Number.POSITIVE_INFINITY,
                statePatch: { smoothDisplayLat: coord.lat, smoothDisplayLon: coord.lon },
            },
            speedLimitPlan: { roadType: 'unknown', shownLimit: null, resetFetchState: false, showWidget: false },
        };
    applyGpsPositionStateFromPlan(plans.posApply);

    return _routeProgress().buildGpsTrackingTickOutcomePlan({
        lat: coord.lat,
        lon: coord.lon,
        accuracy: coord.accuracy,
        speed: coord.speed,
        speedMph: coord.speedMph,
        markerLat: plans.posApply.markerLat,
        markerLon: plans.posApply.markerLon,
        heading: plans.posApply.heading,
        followJumpM: plans.posApply.followJumpM,
        speedLimitPlan: plans.speedLimitPlan,
        routeInProgress,
        routePolyline,
        routeSteps: currentRouteSteps,
        isTrackingActive,
        speedLimitShowWidget: plans.speedLimitPlan.showWidget,
    });
}

/**
 * Apply one GPS watchPosition fix: position, follow camera, navigation side-effects.
 * @param {GeolocationPosition} position
 */
function applyGpsTrackingTick(position) {
    const SGsample = _speedGps();
    const sample = SGsample.normalizeGeolocationCoordsSample(position.coords);
    const pos = applyGpsPositionTick(sample);
    applyGpsTrackingSideEffectsFromPosition(pos);
}

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
        (position) => applyGpsTrackingTick(position),
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
window.navETASnapshot = _eta().createEmptyNavETASnapshot();

/** First-time default: traffic-aware ETA on; only explicit 'false' disables. */
function ensureDefaultTrafficAwareRouting() {
    _eta().ensureDefaultTrafficAwareRouting(localStorage);
}



/**
 * Progress-based remaining time (minutes) from GPS on polyline; same basis as server route duration.
 * @returns {{ originalDurationMinutes: number, timeRemainingMinutes: number, progressPercent: number } | null}
 */
function computeBaseNavigationETAMinutes() {
    return _eta().computeBaseNavigationETAMinutes({
        routeInProgress: routeInProgress,
        lastCalculatedRoute: window.lastCalculatedRoute,
        polyline: routePolyline,
        originalDurationMinutes: _eta().normalizeRouteDurationMinutes(window.lastCalculatedRoute),
        userHasStartedMoving: hasUserStartedMoving(),
        currentLat: currentLat,
        currentLon: currentLon,
        lastSnappedRouteIndex: lastSnappedRouteIndex,
        routeGeometry: _routeGeometry(),
    });
}

function applyTrafficRatioToBaseRemaining(baseRemainingMinutes) {
    return _eta().applyTrafficRatioToBaseRemaining(
        baseRemainingMinutes,
        window.navETASnapshot,
        Date.now(),
        _eta().shouldApplyTrafficAwareETA(localStorage, currentRoutingMode)
    );
}

async function refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch = false) {
    window.navETASnapshot.baseRemainingMinutes = baseRemainingMinutes;
    window.navETASnapshot.progressPercent = progressPercent;

    if (!_eta().shouldApplyTrafficAwareETA(localStorage, currentRoutingMode) || !currentLat || !currentLon) {
        window.navETASnapshot.trafficAdjustedMinutes = null;
        return;
    }

    const now = Date.now();
    if (!_eta().shouldRefreshNavTrafficETA(
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
        const trafficUpdate = _eta().buildTrafficSnapshotFromFlow(
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
    const trafficLine = _eta().buildTrafficStatusLine(
        _eta().shouldApplyTrafficAwareETA(localStorage, currentRoutingMode),
        trafficLevel,
        congestionPercent
    );
    turnInfo.innerHTML = _eta().buildTurnInfoETAPanelHtml(
        displayMins,
        progressPercent,
        eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        trafficLine
    );
}


let lastVoiceAnnouncementTime = 0;
let VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS = 10000;

let voiceAnnouncementsEnabled = true;
let voiceFrequencyMode = localStorage.getItem('voiceFrequencyMode') || 'all';





/**
 * Remaining meters along the active route polyline (snapped progress). Shared by voice, ETA bar, and arrival.
 * @param {number} lat
 * @param {number} lon
 * @returns {number}
 */
function getNavigationRemainingDistanceMeters(lat, lon) {
    const plan = _routeGeometry().buildNavigationRemainingDistancePlan({
        lat,
        lon,
        routePolyline,
        lastSnappedRouteIndex,
    });
    return plan.remainingMeters;
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
    const remainingM = getNavigationRemainingDistanceMeters(lat, lon);
    const RP = _routeProgress();
    const tick = RP.buildNavigationArrivalTickPlan({
        routeInProgress,
        arrivalTriggered: _navigationArrivalTriggered,
        remainingM,
        speedMs,
        arrivalZoneSince: _navigationArrivalZoneSince,
        now: Date.now(),
    });
    if (tick.action === 'skip') return;

    const apply = RP.buildNavigationArrivalStateApplyPlan(tick);
    if (apply.action === 'skip') return;

    if (apply.statePatch.arrivalZoneSince != null) {
        _navigationArrivalZoneSince = apply.statePatch.arrivalZoneSince;
    }

    if (apply.endNavigation) {
        if (apply.logMessage) console.log(apply.logMessage);
        sendArrivalNotification();
    }
}

/** Show/hide map FABs that depend on active turn-by-turn navigation. */
function updateNavigationFabVisibility() {
    const MC = _mapControls();
    const plan = MC.getNavigationFabVisibilityPlan(routeInProgress);
    const endBtn = document.getElementById('endNavigationBtn');
    const startBtn = document.getElementById('startNavBtn');
    if (endBtn) endBtn.style.display = plan.endBtnDisplay;
    if (startBtn && plan.startBtnDisplay != null) startBtn.style.display = plan.startBtnDisplay;
    syncBottomSheetOverlapFabs();
    updateRecenterButtonVisibility();
}

// Track the last snapped route index for efficient searching
let lastSnappedRouteIndex = 0;
/** For turn detection only: monotonic polyline vertex index (never goes backwards). */
let lastTurnDetectRouteVertexIndex = 0;

// Active-navigation snap lock constants live in speed-gps.js (DEFAULTS).
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
 * Apply prime-vehicle-marker state and marker position from a pure apply plan.
 * @param {Object} apply - from buildPrimeVehicleMarkerOnRouteApplyPlan
 */
function applyPrimeVehicleMarkerOnRouteFromPlan(apply) {
    if (!apply || apply.action !== 'apply') return;
    const patch = apply.statePatch || {};
    if (patch.smoothDisplayLat != null) {
        _smoothDisplayLat = patch.smoothDisplayLat;
    }
    if (patch.smoothDisplayLon != null) {
        _smoothDisplayLon = patch.smoothDisplayLon;
    }
    if (patch.snapBlendWeightState != null) {
        _snapBlendWeightState = patch.snapBlendWeightState;
    }
    if (apply.markerLngLat && currentUserMarker && typeof currentUserMarker.setLngLat === 'function') {
        currentUserMarker.setLngLat(apply.markerLngLat);
    }
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
    const SG = _speedGps();
    const apply = SG.buildPrimeVehicleMarkerOnRouteApplyPlan({
        lat,
        lon,
        routePolyline,
        snapped: resolveGpsRouteSnapForTick(lat, lon),
        lastSnappedRouteIndex,
        calculateBearing: (a, b, c, d) => _routeGeometry().bearing(a, b, c, d),
        blendHeadingsCircular: _routeGeometry().blendHeadingsCircular,
    });
    applyPrimeVehicleMarkerOnRouteFromPlan(apply);
}

/**
 * announceDistanceToDestination function
 * @function announceDistanceToDestination
 * @param {*} currentLat - Parameter description
 * @param {*} currentLon - Parameter description
 * @returns {*} Return value description
 */
function announceDistanceToDestination(currentLat, currentLon) {
    if (!routeInProgress || !routePolyline || routePolyline.length === 0 || !voiceAnnouncementsEnabled) return;

    const remainingDistance = getNavigationRemainingDistanceMeters(currentLat, currentLon);
    const VA = _voiceAnnouncements();
    const tick = VA.buildDestinationAnnouncementTickPlan({
        routeInProgress,
        routePolylineLength: routePolyline.length,
        voiceAnnouncementsEnabled,
        remainingDistanceM: remainingDistance,
        lastDestinationAnnouncementDistance,
        destinationDistances: DESTINATION_ANNOUNCEMENT_DISTANCES,
        distanceUnit: getDistanceUnit(),
    });

    if (tick.action === 'skip') return;

    const apply = VA.buildDestinationAnnouncementStateApplyPlan(tick);
    if (apply.action === 'skip') return;

    if (apply.statePatch.lastDestinationAnnouncementDistance != null) {
        lastDestinationAnnouncementDistance = apply.statePatch.lastDestinationAnnouncementDistance;
    }

    if (apply.speak && apply.spokenMessage) {
        const displayRemaining = convertDistance(remainingDistance / 1000);
        console.log(`[Voice] Distance announcement: ${apply.spokenMessage} (remaining: ${displayRemaining} ${getDistanceUnit()})`);
        speakMessage(apply.spokenMessage);
    }
}
/**
 * announceUpcomingTurn function
 * @function announceUpcomingTurn
 * @param {*} turnInfo - Parameter description
 * @returns {*} Return value description
 */
function announceUpcomingTurn(turnInfo) {
    const TI = _turnInstructions();
    const VA = _voiceAnnouncements();

    const direction = turnInfo?.direction || 'straight';
    let directionText = TI.getTurnDirectionText(direction);
    if (direction === 'roundabout') {
        directionText = TI.getRoundaboutDirectionText(
            turnInfo.valhallaType,
            turnInfo.roundabout_exit_count
        );
    }

    const category = VA.resolveTurnAnnouncementCategory(direction);
    const thresholdSet = category === 'exit' ? announcedExitThresholds
        : category === 'keep' ? announcedKeepThresholds
        : announcedTurnThresholds;

    const tick = VA.buildTurnAnnouncementTickPlan({
        turnInfo,
        voiceAnnouncementsEnabled,
        distanceUnit,
        directionText,
        turnDistances: TURN_ANNOUNCEMENT_DISTANCES,
        exitDistances: EXIT_ANNOUNCEMENT_DISTANCES,
        keepDistances: KEEP_ANNOUNCEMENT_DISTANCES,
        announcedThresholdValues: Array.from(thresholdSet),
        voiceAnnouncedForManeuverIndex: _voiceAnnouncedForManeuverIndex,
        voiceAnnouncedCategory: _voiceAnnouncedCategory,
        followingManeuver: turnInfo?.maneuverIndex != null
            ? getFollowingManeuver(turnInfo.maneuverIndex)
            : null,
        chainAppendOpts: {
            getTurnDirectionText: TI.getTurnDirectionText.bind(TI),
            effectiveRoundaboutExitCount: (idx) => effectiveRoundaboutExitCount(idx),
            ordinalEnglishExit: TI.ordinalEnglishExit,
        },
    });

    if (tick.action === 'skip') {
        if (tick.warnLine) console.warn(tick.warnLine);
        return;
    }

    const apply = VA.buildTurnAnnouncementStateApplyPlan(tick);
    if (apply.action === 'skip') {
        if (apply.warnLine) console.warn(apply.warnLine);
        return;
    }

    if (apply.clearThresholds) thresholdSet.clear();
    if (apply.statePatch.voiceAnnouncedForManeuverIndex != null) {
        _voiceAnnouncedForManeuverIndex = apply.statePatch.voiceAnnouncedForManeuverIndex;
    }
    if (apply.statePatch.voiceAnnouncedCategory != null) {
        _voiceAnnouncedCategory = apply.statePatch.voiceAnnouncedCategory;
    }
    if (apply.announcedThresholdValues) {
        thresholdSet.clear();
        apply.announcedThresholdValues.forEach((d) => thresholdSet.add(d));
    }

    if (apply.speak && apply.spokenMessage) {
        if (apply.logLine) console.log(apply.logLine);
        speakMessage(apply.spokenMessage, apply.speakPriority || 'high');
    }

    if (apply.resetThresholds) {
        if (apply.resetCategory === 'exit') announcedExitThresholds.clear();
        else if (apply.resetCategory === 'keep') announcedKeepThresholds.clear();
        else announcedTurnThresholds.clear();
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
let lastRerouteAnnouncementTime = 0;

/** After a failed deviation reroute API call, retry with backoff (does not replace GPS deviation timing). */
let rerouteFailureRetryTimer = null;
let rerouteFailureRetryCount = 0;

function clearRerouteFailureRetries() {
    if (rerouteFailureRetryTimer) {
        clearTimeout(rerouteFailureRetryTimer);
        rerouteFailureRetryTimer = null;
    }
    rerouteFailureRetryCount = 0;
}

function scheduleAutomaticRerouteRetry() {
    const RD = _rerouteDecision();
    const plan = RD.buildRerouteFailureRetryPlan({
        routeInProgress,
        autoRerouteOnDeviationEnabled,
        postRerouteGraceUntil,
        rerouteInProgress,
        rerouteFailureRetryCount,
        now: Date.now(),
    });

    if (plan.action === 'clear') {
        clearRerouteFailureRetries();
        return;
    }
    if (!plan.schedule) {
        if (plan.action === 'exhausted' && plan.notification) {
            sendNotification(plan.notification.title, plan.notification.body, plan.notification.type);
            clearRerouteFailureRetries();
        }
        return;
    }

    rerouteFailureRetryCount = plan.nextRetryCount;
    if (rerouteFailureRetryTimer) clearTimeout(rerouteFailureRetryTimer);
    console.log(plan.logMessage);
    rerouteFailureRetryTimer = setTimeout(() => {
        rerouteFailureRetryTimer = null;
        if (!routeInProgress || !autoRerouteOnDeviationEnabled) {
            clearRerouteFailureRetries();
            return;
        }
        showStatus(plan.statusMessage, 'warning');
        void triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon);
    }, plan.delayMs);
}

/**
 * Apply route deviation state patches and optional reroute trigger.
 * @param {Object} stateApply - from buildRouteDeviationStateApplyPlan
 * @param {number} lat
 * @param {number} lon
 */
function applyRouteDeviationFromApplyPlan(stateApply, lat, lon) {
    if (!stateApply || stateApply.action !== 'apply') return;

    routeJoinConfirmedForDeviation = stateApply.statePatch.routeJoinConfirmedForDeviation;
    deviationStartTimeCheck = stateApply.statePatch.deviationStartTimeCheck;
    deviationOffRouteStreak = stateApply.statePatch.deviationOffRouteStreak;
    if (stateApply.statePatch.lastRerouteAttemptTime != null) {
        lastRerouteAttemptTime = stateApply.statePatch.lastRerouteAttemptTime;
    }

    if (stateApply.logJoinLine) console.log(stateApply.logJoinLine);

    if (stateApply.triggerReroute) {
        if (stateApply.incrementRerouteAttemptCount) rerouteAttemptCount++;
        if (stateApply.logDeviationLine) console.log(stateApply.logDeviationLine);
        sendNotification(
            stateApply.notification.title,
            stateApply.notification.body,
            stateApply.notification.type
        );
        triggerAutomaticRerouteWithHazardHandling(lat, lon);
    }

    if (stateApply.updateLastRerouteDeviation) {
        lastRerouteDeviation = stateApply.lastRerouteDeviation;
    }
}

/**
 * checkRouteDeviation function - Enhanced with time-based detection
 * Only triggers reroute if user is >50m off-route for >10 seconds
 * Respects auto-reroute toggle setting
 */
function checkRouteDeviation(lat, lon, accuracy) {
    const VRD = _rerouteDecision();
    const inputs = VRD.buildRouteDeviationTickInputsPlan({
        lat,
        lon,
        routePolyline,
        lastSnappedRouteIndex,
        snapFn: (a, b, c, d) => _routeGeometry().snapToRoutePolyline(a, b, c, d),
        remainingFn: getNavigationRemainingDistanceMeters,
    });
    if (inputs.action !== 'ready') return;

    const now = Date.now();
    const tick = VRD.buildRouteDeviationTickPlan({
        autoRerouteEnabled: autoRerouteOnDeviationEnabled,
        hasRoute: true,
        remainingToDest: inputs.remainingToDest,
        accuracy,
        minDistance: inputs.minDistance,
        routeJoinConfirmed: routeJoinConfirmedForDeviation,
        deviationStartTime: deviationStartTimeCheck,
        lastRerouteTime,
        lastRerouteAttemptTime,
        offRouteStreak: deviationOffRouteStreak,
        now,
        postRerouteGraceUntil,
        rerouteInProgress,
        distanceUnit,
    });

    if (tick.action === 'skip') return;

    const apply = VRD.buildRouteDeviationApplyPlan(tick, { rerouteAttemptCount });
    const stateApply = VRD.buildRouteDeviationStateApplyPlan(apply);
    applyRouteDeviationFromApplyPlan(stateApply, lat, lon);
}

/**
 * Apply automatic reroute API outcome (success or failure).
 * @param {Object} ctx
 * @param {Object} ctx.apply - from buildAutomaticRerouteResultApplyPlan
 * @param {number} ctx.startLat
 * @param {number} ctx.startLon
 * @param {string} ctx.destination
 */
function applyAutomaticRerouteResult(ctx) {
    const { apply, startLat, startLon, destination } = ctx;
    if (!apply || apply.action !== 'apply') return;

    if (apply.kind === 'failure') {
        apply.logs.forEach((line) => console.log(line));
        if (apply.notification) {
            sendNotification(apply.notification.title, apply.notification.body, apply.notification.type);
        }
        if (apply.scheduleRetry) scheduleAutomaticRerouteRetry();
        if (apply.resetRerouteInProgress) rerouteInProgress = false;
        return;
    }

    if (apply.clearFailureRetries) clearRerouteFailureRetries();
    apply.logs.forEach((line) => console.log(line));

    if (apply.showUnavoidableHazards) {
        handleUnavoidableHazards(apply.newRoute, apply.hazardsList, apply.hazardCount);
    }
    if (apply.preferPrimaryRouteOnNextNavUpdate) {
        _preferPrimaryRouteOnNextNavUpdate = true;
    }
    if (apply.updateRouteOnMap) updateRouteOnMap(apply.newRoute);
    if (apply.logRerouteEvent) {
        logReroutingEvent(startLat, startLon, destination, apply.newRoute, apply.hazardCount);
    }

    if (apply.voice && apply.voice.enabled) {
        if (apply.voice.shouldSpeak) {
            lastRerouteAnnouncementTime = apply.voice.announceAt;
            speakMessage(apply.voice.message, 'high');
        } else {
            console.log('[Voice] Skipping duplicate reroute announcement');
        }
    }

    if (apply.notification) {
        sendNotification(apply.notification.title, apply.notification.body, apply.notification.type);
    }
}

/**
 * Trigger automatic reroute with hazard handling
 * This enhanced version handles unavoidable hazards gracefully
 */
async function triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon) {
    const now = Date.now();
    const RD = _rerouteDecision();
    const destination = resolveNavigationDestination();
    const trigger = RD.buildAutomaticRerouteTriggerPlan(now, {
        rerouteInProgress,
        lastRerouteAttemptTime,
        postRerouteGraceUntil,
        debounceMs: REROUTE_DEBOUNCE_MS,
        offline: !navigator.onLine,
        destination,
        hasRouteContext: !!window.lastCalculatedRoute,
        startLat: currentLat,
        startLon: currentLon,
    });

    if (trigger.action === 'skip') {
        console.log(trigger.logMessage);
        return;
    }

    lastRerouteAttemptTime = trigger.lastRerouteAttemptTime;

    if (trigger.action === 'defer') {
        if (trigger.guard.logMessage) console.log(trigger.guard.logMessage);
        if (trigger.scheduleRetry) scheduleAutomaticRerouteRetry();
        if (trigger.resetRerouteInProgress) rerouteInProgress = false;
        return;
    }

    rerouteInProgress = true;
    try {
        console.log(trigger.guard.logMessage);

        const routeRequest = buildRouteRequest(currentLat, currentLon, destination);

        const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeRequest)
        });

        const data = await response.json();
        const outcome = RD.buildAutomaticRerouteOutcomePlan(data, {
            convertDistance,
            distUnit: getDistanceUnit(),
            voiceEnabled: voiceAnnouncementsEnabled,
            lastRerouteAnnouncementTime,
            rerouteFailureRetryCount,
            now: Date.now(),
        });
        const apply = RD.buildAutomaticRerouteResultApplyPlan(outcome);
        applyAutomaticRerouteResult({
            apply,
            startLat: currentLat,
            startLon: currentLon,
            destination,
        });
    } catch (error) {
        console.error('[Rerouting] Error during automatic reroute:', error);
        const errPlan = RD.buildAutomaticRerouteErrorPlan({ rerouteFailureRetryCount });
        const apply = RD.buildAutomaticRerouteResultApplyPlan(errPlan);
        applyAutomaticRerouteResult({
            apply,
            startLat: currentLat,
            startLon: currentLon,
            destination,
        });
    }
}

/**
 * Handle unavoidable hazards on route
 * Shows user-friendly notification with hazard details
 */
function handleUnavoidableHazards(route, hazardsList, hazardCount) {
    const plan = _hazardAlerts().buildUnavoidableHazardsHandlingPlan(hazardsList, hazardCount);
    console.log(plan.logLine);
    showUnavoidableHazardsModal(plan.hazardTypes, plan.hazardCount);
    console.log(plan.summaryLogLine);
}

/**
 * Show modal for unavoidable hazards
 */
function showUnavoidableHazardsModal(hazardTypes, totalCount) {
    const hazardAlerts = _hazardAlerts();
    const mount = hazardAlerts.buildUnavoidableHazardsModalMountPlan(hazardTypes, totalCount);

    let modal = document.getElementById(mount.modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = mount.modalId;
        modal.style.cssText = mount.modalStyle;
        document.body.appendChild(modal);
    }

    modal.innerHTML = mount.innerHtml;

    let backdrop = document.getElementById(mount.backdropId);
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = mount.backdropId;
        backdrop.style.cssText = mount.backdropStyle;
        backdrop.onclick = closeUnavoidableHazardsModal;
        document.body.appendChild(backdrop);
    }

    backdrop.style.display = mount.display;
    modal.style.display = mount.display;
    setTimeout(closeUnavoidableHazardsModal, mount.autoCloseMs);
}

/**
 * Close unavoidable hazards modal
 */
function closeUnavoidableHazardsModal() {
    const hazardAlerts = _hazardAlerts();
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
 * Log rerouting event for debugging and analytics
 */
function logReroutingEvent(startLat, startLon, destination, route, hazardCount) {
    const result = _rerouteDecision().recordAutomaticRerouteLog(sessionStorage, {
        startLat,
        startLon,
        destination,
        route,
        hazardCount,
        routePrefs: _routePrefs(),
    });
    console.log('[Rerouting] Event logged:', result.event);
}

// Keep old function for backwards compatibility
async function triggerAutomaticReroute(currentLat, currentLon) {
    return triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon);
}
// Hazard announcement debouncing
const hazardAnnouncementDebounce = {};
let HAZARD_WARNING_DISTANCE = 500;

// Camera alert types: 'off', 'voice', 'chime', 'both'
let cameraAlertType = localStorage.getItem('pref_cameraAlertType') || 'voice';
let cameraAlertDistance = parseInt(localStorage.getItem('pref_cameraAlertDistance') || '500');

function isCameraHazardType(typeStr) {
    return _hazardAlerts().isCameraHazardType(typeStr);
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
    const HA = _hazardAlerts();
    const debounceKey = `${hazard.type}_${hazard.lat}_${hazard.lon}_${unavoidableRouteCamera ? 'route' : 'near'}`;
    const plan = HA.buildHazardAnnouncementPlan(hazard, distanceM, {
        unavoidableRouteCamera,
        cameraAlertType,
        voiceAnnouncementsEnabled,
        distanceUnit,
        debounceMs: HA.HAZARD_ANNOUNCEMENT_DEBOUNCE_MS,
        lastAnnounceAt: hazardAnnouncementDebounce[debounceKey] || 0,
        now: Date.now(),
    });
    if (plan.action !== 'announce') return;

    hazardAnnouncementDebounce[plan.debounceKey] = plan.nextAnnounceAt;
    sendNotification(plan.notification.title, plan.notification.message, plan.notification.type);
    if (plan.speak) {
        speakMessage(plan.spokenMessage, plan.speakPriority || undefined);
    }
    if (plan.playChime) {
        playCameraChime();
    }
}

function evaluateAndAnnounceHazards(lat, lon, nearbyPayload, includeNearby) {
    const HA = _hazardAlerts();
    if (!HA) return;

    const params = HA.buildHazardEvaluationParams({
        lat,
        lon,
        route: window.lastCalculatedRoute,
        includeNearby: !!includeNearby,
        nearbyPayload,
        routePolyline: routePolyline,
        snappedRouteIndex: lastSnappedRouteIndex,
        cameraAlertDistanceM: cameraAlertDistance,
        generalHazardDistanceM: HAZARD_WARNING_DISTANCE,
        calculateDistance: calculateDistanceMeters,
    });
    const alerts = HA.collectHazardsToAnnounce(params);

    alerts.forEach(({ hazard, distanceM, unavoidableRouteCamera }) => {
        announceCameraOrHazard(hazard, distanceM, { unavoidableRouteCamera });
    });
}

/**
 * Route-embedded hazards work offline; nearby API augments when online.
 */
function processNavigationHazardAlerts(lat, lon) {
    const HA = _hazardAlerts();
    const tick = HA.buildNavigationHazardAlertsTickPlan({
        routeInProgress,
        isTrackingActive,
        isOffline: _voyagrIsOffline,
        navigatorOnLine: navigator.onLine,
        lat,
        lon,
        nearbyRadiusKm: HA.NEARBY_HAZARDS_RADIUS_KM,
    });
    if (tick.action === 'skip') return;

    if (tick.evaluateEmbedded) {
        evaluateAndAnnounceHazards(lat, lon, null, false);
    }

    if (!tick.fetchNearby || !tick.nearbyUrl) return;

    fetch(tick.nearbyUrl)
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
        _eta().shouldApplyTrafficAwareETA(localStorage, currentRoutingMode) ? adjusted : null,
        progressPercent,
        window.navETASnapshot.trafficLevel,
        window.navETASnapshot.congestionPercent
    );

    await refreshNavTrafficETAIfDue(timeRemainingMinutes, progressPercent, false);

    adjusted = applyTrafficRatioToBaseRemaining(timeRemainingMinutes);
    renderTurnInfoETAPanel(
        timeRemainingMinutes,
        _eta().shouldApplyTrafficAwareETA(localStorage, currentRoutingMode) ? adjusted : null,
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
        const message = _eta().buildETAVoiceMessage(timeRemainingMinutes, eta);
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
    if (_eta().shouldApplyTrafficAwareETA(localStorage, currentRoutingMode) && currentLat != null && currentLon != null) {
        await refreshNavTrafficETAIfDue(base.timeRemainingMinutes, base.progressPercent, true);
    }
    const now = Date.now();
    const timeRemainingMinutes = applyTrafficRatioToBaseRemaining(base.timeRemainingMinutes);
    const eta = new Date(now + timeRemainingMinutes * 60000);
    const message = _eta().buildETAVoiceMessage(timeRemainingMinutes, eta);
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

async function geocodeAddress(address) {
    const GL = _geocodingLocations();
    let lookup = GL.buildGeocodeAddressLookupPlan({
        address,
        cache: geocodingCache,
        nominatimBaseUrl: NOMINATIM_API,
        limit: 8,
    });

    if (lookup.action === 'empty') {
        return null;
    }

    if (lookup.action === 'resolve') {
        console.log(`[Geocoding] Resolved via ${lookup.source}:`, lookup.trimmed);
        return lookup.result;
    }

    const trimmedAddress = lookup.trimmed;
    const plusCodesEnabled = localStorage.getItem('googlePlusCodesEnabled') === 'true';
    const hasPlusCodeService = typeof GooglePlusCodesService !== 'undefined';
    let plusCodeState = { isValidCode: false, decoded: null, errorMessage: null };
    if (plusCodesEnabled && hasPlusCodeService) {
        try {
            const service = new GooglePlusCodesService();
            if (service.isValidCode(trimmedAddress)) {
                plusCodeState.isValidCode = true;
                plusCodeState.decoded = service.decode(trimmedAddress);
            }
        } catch (error) {
            plusCodeState.errorMessage = error.message;
            console.log('[Geocoding] Plus Code decode error:', error.message);
        }
    }

    const plusPlan = GL.buildGeocodePlusCodeLookupPlan({
        plusCodesEnabled,
        hasPlusCodeService,
        trimmed: trimmedAddress,
        isValidCode: plusCodeState.isValidCode,
        decoded: plusCodeState.decoded,
        errorMessage: plusCodeState.errorMessage,
    });
    if (plusPlan.action === 'resolve') {
        console.log('[Geocoding] Detected Plus Code:', trimmedAddress);
        console.log('[Geocoding] Decoded Plus Code to:', plusPlan.result.lat, plusPlan.result.lon);
        return plusPlan.result;
    }

    lookup = GL.buildGeocodeAddressLookupPlan({
        address: trimmedAddress,
        cache: geocodingCache,
        nominatimBaseUrl: NOMINATIM_API,
        limit: 8,
    });
    if (lookup.action === 'resolve') {
        console.log('[Geocoding] Cache hit for:', trimmedAddress);
        return lookup.result;
    }

    try {
        const fetchPlan = GL.buildGeocodeNominatimFetchRequestPlan(lookup);
        console.log('[Geocoding] Fetching:', fetchPlan.trimmed);
        const response = await fetch(fetchPlan.url, {
            headers: fetchPlan.headers,
        });

        if (!response.ok) {
            const httpErr = GL.buildGeocodeHttpErrorPlan(response.status);
            throw new Error(httpErr.errorMessage);
        }

        const outcome = GL.buildGeocodeNominatimResponsePlan(
            GL.parseNominatimFetchPayload(await response.json()),
            fetchPlan.trimmed
        );
        if (!outcome.ok) {
            if (outcome.branch === 'api_error') {
                throw new Error(outcome.errorMessage);
            }
            console.log('[Geocoding] No results for:', outcome.trimmed);
            return null;
        }

        const success = outcome.success;
        geocodingCache = GL.writeGeocodeCacheEntry(geocodingCache, success.cacheKey, success.cacheEntry);
        saveGeocodeCache();

        console.log('[Geocoding] Success:', fetchPlan.trimmed, '→', success.result.lat, success.result.lon);
        return success.result;
    } catch (error) {
        console.log('[Geocoding] Error:', error.message);
        return null;
    }
}

async function resolveGeocodeEndpoint(GL, endpointPlan, which, fallbackAddress) {
    if (endpointPlan.action === 'use_stored') {
        console.log(`[Geocoding] Using stored coordinates for ${which}:`, endpointPlan.result);
        return { ok: true, result: endpointPlan.result };
    }

    const result = await geocodeAddress(endpointPlan.address);
    if (!result) {
        return {
            ok: false,
            failure: GL.buildGeocodeEndpointFailurePlan(which, fallbackAddress),
        };
    }
    return { ok: true, result };
}

async function geocodeLocations(startAddress, endAddress) {
    const GL = _geocodingLocations();
    isGeocoding = true;

    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const pairPlans = GL.buildGeocodePairPlans({
        startStored: GL.readStoredLocationFromDataset(startInput?.dataset, startAddress),
        startAddress,
        endStored: GL.readStoredLocationFromDataset(endInput?.dataset, endAddress),
        endAddress,
    });
    showStatus(pairPlans.loadingStatusMessage, 'loading');

    try {
        const startResolved = await resolveGeocodeEndpoint(GL, pairPlans.startPlan, 'start', startAddress);
        if (!startResolved.ok) {
            showStatus(startResolved.failure.statusMessage, startResolved.failure.statusType);
            isGeocoding = false;
            return null;
        }

        const endResolved = await resolveGeocodeEndpoint(GL, pairPlans.endPlan, 'end', endAddress);
        if (!endResolved.ok) {
            showStatus(endResolved.failure.statusMessage, endResolved.failure.statusType);
            isGeocoding = false;
            return null;
        }

        const outcome = GL.buildGeocodePairSuccessOutcomePlan(startResolved.result, endResolved.result);
        showStatus(outcome.statusMessage, outcome.statusType);
        isGeocoding = false;
        return outcome.coords;
    } catch (error) {
        console.log('[Geocoding] Error:', error);
        const outcome = GL.buildGeocodePairErrorOutcomePlan(error.message);
        showStatus(outcome.statusMessage, outcome.statusType);
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
    const MC = _mapControls();
    routeData = _routeSelection().mergeNavigationRouteFromSelected(
        routeData, routeOptions, selectedRouteIndex
    );
    if (!routeData || !routeData.geometry) {
        showStatus(MC.getNavStartNoGeometryStatusMessage(), 'error');
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
    window.navETASnapshot = _eta().createEmptyNavETASnapshot();

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
            showStatus(MC.getNavStartInvalidGeometryStatusMessage(), 'error');
            return;
        }

        if (currentLat != null && currentLon != null) {
            primeVehicleMarkerOnRoute(currentLat, currentLon);
        } else {
            lastSnappedRouteIndex = 0;
        }
    } catch (e) {
        console.error('Could not decode geometry:', e);
        showStatus(MC.getNavStartDecodeGeometryErrorStatusMessage(), 'error');
        return;
    }

    // ===== SCREEN WAKE LOCK: Keep screen on during navigation =====
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen')
            .then(wakeLock => {
                window.screenWakeLock = wakeLock;
                console.log('[Screen Wake Lock] Screen lock acquired - screen will stay on');
                showStatus(_mapControls().getWakeLockAcquiredStatusMessage(), 'success');

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
    const navStartFabPlan = _mapControls().getNavStartFabDisplayPlan();
    mapFollowingActive = navStartFabPlan.mapFollowingActive;
    const zoomFollowBtn = document.getElementById('zoomFollowToggle');
    if (zoomFollowBtn) {
        zoomFollowBtn.style.display = navStartFabPlan.zoomFollowDisplay;
        applyZoomFollowButtonUi(zoomFollowBtn, zoomAndFollowEnabled);
    }

    const journeyOverviewBtn = document.getElementById('journeyOverviewBtn');
    if (journeyOverviewBtn) {
        journeyOverviewBtn.style.display = navStartFabPlan.journeyOverviewDisplay;
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
        const TI = _turnInstructions();
        const RG = _routeGeometry();
        const turnInit = TI.buildNavStartTurnInstructionInit(
            currentRouteSteps,
            currentStepIndex,
            routePolyline,
            {
                haversineDistanceMeters: RG.haversineDistanceMeters,
                resolveRoadClass: (step) => step.road_class || _routeGeometry().inferRoadClassFromManeuver(step),
            }
        );
        if (turnInit) {
            updateTurnInstructionDisplay(turnInit);
        }
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
    const navFabDisplay = _mapControls().getNavStartExtraFabDisplay();
    const arModeBtn = document.getElementById('arModeBtn');
    if (arModeBtn) {
        arModeBtn.style.display = navFabDisplay.arModeBtnDisplay;
    }
    const driverPerspectiveBtn = document.getElementById('driverPerspectiveToggle');
    if (driverPerspectiveBtn) {
        driverPerspectiveBtn.style.display = navFabDisplay.driverPerspectiveBtnDisplay;
        _toggleUI().applyToggleButton(driverPerspectiveBtn, shouldUsePitchedDrivingCamera());
    }

    const navStartFeedback = _mapControls().buildNavStartUserFeedbackPlan(isQuietResume);
    sendNotification(
        navStartFeedback.notificationTitle,
        navStartFeedback.notificationBody,
        'success'
    );
    if (navStartFeedback.speakMessage) {
        speakMessage(navStartFeedback.speakMessage);
    }
    showStatus(navStartFeedback.statusMessage, navStartFeedback.statusType);
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
    const navStopFabPlan = _mapControls().getNavStopFabHidePlan();
    const zoomFollowBtn = document.getElementById('zoomFollowToggle');
    if (zoomFollowBtn) {
        zoomFollowBtn.style.display = navStopFabPlan.zoomFollowDisplay;
    }

    const recenterBtn = document.getElementById('recenterVehicleFab');
    if (recenterBtn) {
        recenterBtn.style.display = navStopFabPlan.recenterDisplay;
    }

    // ===== HIDE JOURNEY OVERVIEW BUTTON =====
    const journeyOverviewBtn = document.getElementById('journeyOverviewBtn');
    if (journeyOverviewBtn) {
        journeyOverviewBtn.style.display = navStopFabPlan.journeyOverviewDisplay;
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
        arModeBtn.style.display = navStopFabPlan.arModeBtnDisplay;
    }
    const driverPerspectiveBtn = document.getElementById('driverPerspectiveToggle');
    if (driverPerspectiveBtn) {
        driverPerspectiveBtn.style.display = navStopFabPlan.driverPerspectiveDisplay;
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

    const MC = _mapControls();
    showStatus(MC.getNavStopStatusMessage(), 'info');
    const navStopNote = MC.getNavStopNotification();
    sendNotification(navStopNote.title, navStopNote.body, 'info');
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

function toggleAvoidancePreference(pref) {
    const RP = _routePrefs();
    const TU = _toggleUI();
    const btn = document.getElementById(RP.resolveRouteLegAvoidanceButtonId(pref));
    if (!btn) return;
    const dispatch = RP.buildRouteLegAvoidanceToggleDispatchPlan(pref, btn.classList.contains('active'));
    TU.applyToggleButton(btn, dispatch.nextEnabled, TU.TOGGLE_SWITCH_OPTS);
    localStorage.setItem(dispatch.storage.storageKey, dispatch.storage.value);
    console.log(`[Avoidance] ${dispatch.logLine}`);
}

function loadAvoidancePreferences() {
    const RP = _routePrefs();
    const TU = _toggleUI();
    RP.buildRouteLegAvoidanceTogglesApplyPlan(localStorage).forEach((item) => {
        const btn = document.getElementById(item.buttonId);
        if (btn) {
            TU.applyToggleButton(btn, item.enabled, TU.TOGGLE_SWITCH_OPTS);
        }
    });
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
    const throttle = _voiceAnnouncements().VOICE_FREQUENCY_THROTTLES[voiceFrequencyMode] || VOICE_ANNOUNCEMENT_MIN_INTERVAL_MS;

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

    applyTripInfoDisplayValues(plan.display);
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
    const modal = document.getElementById('journeySummaryModal');
    if (!modal) return;

    const plan = _eta().buildJourneySummaryModalApplyPlan(routeData, {
        traveledMeters: _navTraveledMeters,
        navStartedAt: _navStartedAt,
        convertDistance,
        distUnit: getDistanceUnit(),
        convertSpeed,
        speedUnit: getSpeedUnit(),
        currencySymbol: getCurrencySymbol(),
        adjustCost: adjustCostForUnits,
    });

    if (!plan.visible) return;

    document.getElementById('summaryDistance').textContent = plan.distanceText;
    document.getElementById('summaryTime').textContent = plan.timeText;
    document.getElementById('summaryCost').textContent = plan.costText;
    document.getElementById('summaryAvgSpeed').textContent = plan.avgSpeedText;

    modal.style.display = 'block';
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

// NOTE: toggleDriverPerspective is defined earlier in the file (around line 7711)
// This duplicate was removed to fix the driver's perspective mode conflict
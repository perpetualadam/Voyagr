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

// ===== ROUTE PREFERENCE MIGRATION =====
// 'pref_avoid_tollRoads' is the canonical localStorage key for the "Avoid Toll Roads"
// toggle in Route Preferences. Older builds used 'pref_tolls' (from a now-removed
// Hazard Avoidance duplicate, which defaulted to ENABLED). We run a one-time
// migration: if the new key is unset but the legacy key is present, carry the
// user's prior choice forward. After migration, only 'pref_avoid_tollRoads' is
// written; 'pref_tolls' is kept as a read-only fallback so rollbacks don't lose state.
(function migrateTollPrefKey() {
    try {
        const canon = localStorage.getItem('pref_avoid_tollRoads');
        const legacy = localStorage.getItem('pref_tolls');
        if (canon === null && legacy !== null) {
            // Old semantic: 'true' / null / missing ⇒ avoid tolls enabled; 'false' ⇒ user opted out.
            const avoid = legacy !== 'false';
            localStorage.setItem('pref_avoid_tollRoads', avoid ? 'true' : 'false');
        }
    } catch (e) {
        console.warn('[Migration] Toll pref migration skipped:', e);
    }
})();

/**
 * Canonical reader for the "Avoid Toll Roads" preference. Prefers the new key;
 * falls back to the legacy default-enabled semantic when neither is set yet.
 * @returns {boolean}
 */
function isAvoidTollsEnabled() {
    try {
        const canon = localStorage.getItem('pref_avoid_tollRoads');
        if (canon !== null) return canon === 'true';
        // Legacy default was true (avoid tolls unless user opted out).
        return localStorage.getItem('pref_tolls') !== 'false';
    } catch (e) {
        return false;
    }
}
window.isAvoidTollsEnabled = isAvoidTollsEnabled;

// Note: All global variables are declared below
// ===== BOTTOM SHEET VARIABLES =====
let bottomSheetStartY = 0;
let bottomSheetCurrentY = 0;
let bottomSheetIsExpanded = false; // Tracks logical state (expanded or collapsed)

/** Event target as Element — Text nodes have no .closest (fixes mobile taps on emoji/labels). */
function voyagrEventTargetElement(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.nodeType === Node.ELEMENT_NODE) return raw;
    if (raw.nodeType === Node.TEXT_NODE && raw.parentElement) return raw.parentElement;
    return null;
}

function voyagrClosest(raw, selector) {
    const el = voyagrEventTargetElement(raw);
    return el && typeof el.closest === 'function' ? el.closest(selector) : null;
}

// ===== RECENT DESTINATIONS (local history; works without auth) =====
const VOYAGR_RECENT_DEST_KEY = 'voyagrRecentDestinations';
const VOYAGR_RECENT_DEST_LIMIT = 15;

function loadRecentDestinations() {
    try {
        const raw = localStorage.getItem(VOYAGR_RECENT_DEST_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function recordRecentDestination(label, lat, lon, kind) {
    if (!label || lat == null || lon == null) return;
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return;
    const trimmedLabel = String(label).trim();
    if (!trimmedLabel) return;
    const list = loadRecentDestinations();
    const entry = {
        label: trimmedLabel,
        lat: latN,
        lon: lonN,
        ts: Date.now(),
        kind: kind || 'search'
    };
    const filtered = list.filter(
        (x) =>
            !(
                Math.abs(x.lat - latN) < 1e-5 &&
                Math.abs(x.lon - lonN) < 1e-5 &&
                (x.label || '') === trimmedLabel
            )
    );
    filtered.unshift(entry);
    try {
        localStorage.setItem(VOYAGR_RECENT_DEST_KEY, JSON.stringify(filtered.slice(0, VOYAGR_RECENT_DEST_LIMIT)));
    } catch (e) { /* quota */ }
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
function convertDistance(km) {
    if (distanceUnit === 'mi') {
        return (km * 0.621371).toFixed(2);
    }
    return km.toFixed(2);
}

/**
 * getDistanceUnit function
 * @function getDistanceUnit
 * @returns {*} Return value description
 */
function getDistanceUnit() {
    return distanceUnit === 'mi' ? 'mi' : 'km';
}

/**
 * convertSpeed function
 * @function convertSpeed
 * @param {*} kmh - Parameter description
 * @returns {*} Return value description
 */
function convertSpeed(kmh) {
    if (speedUnit === 'mph') {
        return (kmh * 0.621371).toFixed(1);
    }
    return kmh.toFixed(1);
}

/**
 * getSpeedUnit function
 * @function getSpeedUnit
 * @returns {*} Return value description
 */
function getSpeedUnit() {
    return speedUnit === 'mph' ? 'mph' : 'km/h';
}

/**
 * convertTemperature function
 * @function convertTemperature
 * @param {*} celsius - Parameter description
 * @returns {*} Return value description
 */
function convertTemperature(celsius) {
    if (temperatureUnit === 'fahrenheit') {
        return ((celsius * 9 / 5) + 32).toFixed(1);
    }
    return celsius.toFixed(1);
}

/**
 * getTemperatureUnit function
 * @function getTemperatureUnit
 * @returns {*} Return value description
 */
function getTemperatureUnit() {
    return temperatureUnit === 'fahrenheit' ? '°F' : '°C';
}

/**
 * getCurrencySymbol function
 * @function getCurrencySymbol
 * @returns {*} Return value description
 */
function getCurrencySymbol() {
    return currencySymbols[currencyUnit] || '£';
}
/**
 * adjustCostForUnits function
 * @function adjustCostForUnits
 * @param {*} cost - Parameter description
 * @param {*} costType - Parameter description
 * @returns {*} Return value description
 */
function adjustCostForUnits(cost, costType = 'fuel') {
    // Currency totals from the API are absolute amounts (£ / $ / €).
    // Distance unit (mi vs km) must not rescale money — only distance labels change.
    return cost;
}
/**
 * getFuelEfficiencyInUnits function
 * @function getFuelEfficiencyInUnits
 * @param {*} liters_per_100km - Parameter description
 * @returns {*} Return value description
 */
function getFuelEfficiencyInUnits(liters_per_100km) {
    if (distanceUnit === 'mi') {
        // Convert L/100km to MPG (miles per gallon)
        // 1 L/100km ≈ 235.214 / L/100km = MPG
        return (235.214 / liters_per_100km).toFixed(1);
    }
    return liters_per_100km.toFixed(1);
}

/**
 * getFuelEfficiencyLabel function
 * @function getFuelEfficiencyLabel
 * @returns {*} Return value description
 */
function getFuelEfficiencyLabel() {
    return distanceUnit === 'mi' ? 'MPG' : 'L/100km';
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
    const h = window.innerHeight;
    const w = window.innerWidth;
    const bottomUiReserve = Math.min(200, Math.max(96, h * 0.15));
    return {
        top: Math.round(h * 0.55),
        bottom: Math.round(bottomUiReserve),
        left: Math.round(Math.min(22, w * 0.03)),
        right: Math.round(Math.min(22, w * 0.03))
    };
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

    if (theme === 'auto') {
        // Use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            body.classList.add('dark-mode');
            console.log('[Dark Mode] Applied auto theme (system prefers dark)');
        } else {
            body.classList.remove('dark-mode');
            console.log('[Dark Mode] Applied auto theme (system prefers light)');
        }
    } else if (theme === 'dark') {
        body.classList.add('dark-mode');
        console.log('[Dark Mode] Applied dark theme');
    } else {
        body.classList.remove('dark-mode');
        console.log('[Dark Mode] Applied light theme');
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
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
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

    // Remove active class from all buttons
    if (lightBtn) lightBtn.classList.remove('active');
    if (darkBtn) darkBtn.classList.remove('active');
    if (autoBtn) autoBtn.classList.remove('active');

    // Add active class to current theme button
    if (currentTheme === 'light' && lightBtn) {
        lightBtn.classList.add('active');
    } else if (currentTheme === 'dark' && darkBtn) {
        darkBtn.classList.add('active');
    } else if (currentTheme === 'auto' && autoBtn) {
        autoBtn.classList.add('active');
    }

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
    showStatus(`Distance unit changed to ${newUnit === 'mi' ? 'miles' : 'kilometers'}`, 'success');
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
    showStatus(`Speed unit changed to ${newUnit === 'mph' ? 'mph' : 'km/h'}`, 'success');
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
    showStatus(`Temperature unit changed to ${newUnit === 'fahrenheit' ? 'Fahrenheit' : 'Celsius'}`, 'success');
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
            avoidRailwayCrossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
            variableSpeedAlerts: localStorage.getItem('pref_variableSpeedAlerts') === 'true'
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
                localStorage.setItem('pref_variableSpeedAlerts', settings.hazardPreferences.variableSpeedAlerts ? 'true' : 'false');
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
            if (smartZoomEnabled) {
                smartZoomToggle.classList.add('active');
            } else {
                smartZoomToggle.classList.remove('active');
            }
        }

        // Apply ML predictions toggle state
        const mlPredictionsEnabled = localStorage.getItem('mlPredictionsEnabled') === 'true';
        const mlToggle = document.getElementById('mlPredictionsEnabled');
        if (mlToggle) {
            if (mlPredictionsEnabled) {
                mlToggle.classList.add('active');
                mlToggle.style.background = '#4CAF50';
                mlToggle.style.borderColor = '#4CAF50';
                mlToggle.style.color = 'white';
            } else {
                mlToggle.classList.remove('active');
                mlToggle.style.background = '#ddd';
                mlToggle.style.borderColor = '#999';
                mlToggle.style.color = '#333';
            }
        }

        // Apply voice announcements toggle state
        const voiceAnnouncementsEnabled = localStorage.getItem('voiceAnnouncementsEnabled') === 'true';
        const voiceToggle = document.getElementById('voiceAnnouncementsEnabled');
        if (voiceToggle) {
            if (voiceAnnouncementsEnabled) {
                voiceToggle.classList.add('active');
                voiceToggle.style.background = '#4CAF50';
                voiceToggle.style.borderColor = '#4CAF50';
                voiceToggle.style.color = 'white';
            } else {
                voiceToggle.classList.remove('active');
                voiceToggle.style.background = '#ddd';
                voiceToggle.style.borderColor = '#999';
                voiceToggle.style.color = '#333';
            }
        }

        // Apply battery saving mode toggle state
        const batterySavingEnabled = localStorage.getItem('pref_batterySaving') === 'true';
        const batteryToggle = document.getElementById('batterySavingMode');
        if (batteryToggle) {
            if (batterySavingEnabled) {
                batteryToggle.classList.add('active');
                batteryToggle.style.background = '#4CAF50';
                batteryToggle.style.borderColor = '#4CAF50';
                batteryToggle.style.color = 'white';
            } else {
                batteryToggle.classList.remove('active');
                batteryToggle.style.background = '#ddd';
                batteryToggle.style.borderColor = '#999';
                batteryToggle.style.color = '#333';
            }
        }

        // Apply gesture control toggle state
        const gestureControlEnabled = localStorage.getItem('gestureEnabled') === 'true';
        const gestureToggle = document.getElementById('gestureEnabled');
        if (gestureToggle) {
            if (gestureControlEnabled) {
                gestureToggle.classList.add('active');
                gestureToggle.style.background = '#4CAF50';
                gestureToggle.style.borderColor = '#4CAF50';
                gestureToggle.style.color = 'white';
            } else {
                gestureToggle.classList.remove('active');
                gestureToggle.style.background = '#ddd';
                gestureToggle.style.borderColor = '#999';
                gestureToggle.style.color = '#333';
            }
        }

        // Apply UI theme preference
        initializeDarkMode();
        updateThemeButtons();

        // Apply auto-traffic update toggle state
        const autoTrafficToggle = document.getElementById('autoTrafficUpdateToggle');
        if (autoTrafficToggle) {
            if (autoTrafficUpdateEnabled) {
                autoTrafficToggle.classList.add('active');
                autoTrafficToggle.style.background = '#4CAF50';
                autoTrafficToggle.style.borderColor = '#4CAF50';
            } else {
                autoTrafficToggle.classList.remove('active');
                autoTrafficToggle.style.background = '#ddd';
                autoTrafficToggle.style.borderColor = '#999';
            }
        }

        // Apply auto-reroute on deviation toggle state
        const autoRerouteToggle = document.getElementById('autoRerouteDeviationToggle');
        if (autoRerouteToggle) {
            if (autoRerouteOnDeviationEnabled) {
                autoRerouteToggle.classList.add('active');
                autoRerouteToggle.style.background = '#4CAF50';
                autoRerouteToggle.style.borderColor = '#4CAF50';
            } else {
                autoRerouteToggle.classList.remove('active');
                autoRerouteToggle.style.background = '#ddd';
                autoRerouteToggle.style.borderColor = '#999';
            }
        }

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
            'pref_tolls', 'pref_caz', 'pref_cameras', 'pref_variableSpeedAlerts',
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
    // This will be called when speed updates occur
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

function parseLatLonString(str) {
    if (!str || typeof str !== 'string') return null;
    const p = str.split(',');
    if (p.length < 2) return null;
    const lat = parseFloat(p[0].trim());
    const lon = parseFloat(p[1].trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
}

/**
 * Build a completed-trip payload from the active route + form fields.
 * @returns {object|null}
 */
function buildCompletedTripRecord(route) {
    if (!route) return null;
    const startEl = document.getElementById('start');
    const endEl = document.getElementById('end');
    let start_lat;
    let start_lon;
    let end_lat;
    let end_lon;
    const start_address = (startEl && startEl.value) ? startEl.value.trim() : '';
    const end_address = (endEl && endEl.value) ? endEl.value.trim() : (route.destinationName || '');

    if (startEl && startEl.dataset.lat && startEl.dataset.lon) {
        start_lat = parseFloat(startEl.dataset.lat);
        start_lon = parseFloat(startEl.dataset.lon);
    } else if (route.start) {
        const ps = parseLatLonString(route.start);
        if (ps) {
            start_lat = ps.lat;
            start_lon = ps.lon;
        }
    }
    if (endEl && endEl.dataset.lat && endEl.dataset.lon) {
        end_lat = parseFloat(endEl.dataset.lat);
        end_lon = parseFloat(endEl.dataset.lon);
    } else if (route.destination) {
        const pe = parseLatLonString(route.destination);
        if (pe) {
            end_lat = pe.lat;
            end_lon = pe.lon;
        }
    }

    if (
        (start_lat == null || end_lat == null) &&
        typeof routePolyline !== 'undefined' &&
        routePolyline &&
        routePolyline.length > 1
    ) {
        if (start_lat == null || start_lon == null) {
            start_lat = routePolyline[0][0];
            start_lon = routePolyline[0][1];
        }
        const L = routePolyline[routePolyline.length - 1];
        if (end_lat == null || end_lon == null) {
            end_lat = L[0];
            end_lon = L[1];
        }
    }

    if (start_lat == null || start_lon == null || end_lat == null || end_lon == null) {
        return null;
    }

    const distance_km = parseFloat(route.distance_km != null ? route.distance_km : route.distance) || 0;
    const duration_minutes = parseFloat(
        route.duration_minutes != null ? route.duration_minutes : route.time
    ) || 0;

    return {
        start_lat,
        start_lon,
        end_lat,
        end_lon,
        start_address: start_address || `${start_lat},${start_lon}`,
        end_address: end_address || `${end_lat},${end_lon}`,
        distance_km,
        duration_minutes,
        fuel_cost: route.fuel_cost || 0,
        toll_cost: route.toll_cost || 0,
        caz_cost: route.caz_cost || 0,
        routing_mode: typeof currentRoutingMode !== 'undefined' ? currentRoutingMode : 'auto',
        timestamp: new Date().toISOString()
    };
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
    const out = Array.isArray(serverTrips) ? serverTrips.slice() : [];
    const serverIds = new Set(out.map((t) => t.id));

    (rawLocal || []).forEach((e) => {
        const row = {
            start_lat: e.start_lat,
            start_lon: e.start_lon,
            end_lat: e.end_lat,
            end_lon: e.end_lon,
            start_address: e.start_address,
            end_address: e.end_address,
            distance_km: e.distance_km,
            duration_minutes: e.duration_minutes,
            fuel_cost: e.fuel_cost,
            toll_cost: e.toll_cost,
            caz_cost: e.caz_cost,
            routing_mode: e.routing_mode,
            timestamp: e.timestamp
        };
        if (e.serverId != null) {
            if (serverIds.has(e.serverId)) return;
            out.push({ ...row, id: e.serverId, _localOnly: false });
            serverIds.add(e.serverId);
        } else {
            out.push({ ...row, id: -e.localId, _localOnly: true });
        }
    });

    out.sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        return tb - ta;
    });
    return out;
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
    if (value === null || value === undefined) return '';
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
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
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
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
                banner.style.cssText =
                    'padding:12px;background:#E3F2FD;border-radius:8px;margin-bottom:12px;font-size:13px;color:#1565C0;';
                banner.textContent =
                    allTrips.length > 0
                        ? '📱 Showing trips saved on this device. Sign in to sync trips with your account.'
                        : '📱 No trips on this device yet. Finish navigation to save a trip here, then sign in to sync across devices.';
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
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #f44336;">Error loading trips</div>';
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
        const filtered = (allTrips || []).filter((trip) => {
            try {
                const start = (trip.start_address || '').toLowerCase();
                const end = (trip.end_address || '').toLowerCase();
                let tsText = '';
                if (trip.timestamp != null && trip.timestamp !== '') {
                    const d = new Date(trip.timestamp);
                    tsText = Number.isNaN(d.getTime())
                        ? String(trip.timestamp)
                        : `${d.toLocaleString()} ${d.toDateString()}`;
                }
                tsText = tsText.toLowerCase();
                return (
                    start.includes(searchTerm) ||
                    end.includes(searchTerm) ||
                    tsText.includes(searchTerm)
                );
            } catch (err) {
                return false;
            }
        });
        displayTripHistory(filtered);
    };
}

function displayTripHistory(trips) {
    const listContainer = document.getElementById('tripHistoryList');
    if (!listContainer) return;

    if (!trips || trips.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trips found</div>';
        bindTripHistorySearch();
        return;
    }

    listContainer.innerHTML = trips.map((trip, index) => {
        const date = new Date(trip.timestamp);
        const dateStr = Number.isNaN(date.getTime())
            ? '—'
            : date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const distance = convertDistance(trip.distance_km);
        const distUnit = getDistanceUnit();
        const totalCost = (parseFloat(trip.fuel_cost || 0) + parseFloat(trip.toll_cost || 0) + parseFloat(trip.caz_cost || 0)).toFixed(2);
        const symbol = getCurrencySymbol();
        const startAddr = escapeHtml(trip.start_address || 'Start');
        const endAddr = escapeHtml(trip.end_address || 'End');

        return `
            <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #667eea;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        <div style="font-weight: 600; color: #333; margin-bottom: 4px;">
                            ${startAddr} → ${endAddr}
                            ${trip._localOnly ? ' <span style="font-size:11px;font-weight:500;color:#1565C0;">(this device)</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            ${dateStr}
                        </div>
                    </div>
                    <button onclick="deleteTripHistory(${trip.id})" style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;">Delete</button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #666; margin-bottom: 8px;">
                    <div>📏 ${distance} ${distUnit}</div>
                    <div>⏱️ ${trip.duration_minutes} min</div>
                    <div>💰 ${symbol}${totalCost}</div>
                    <div>🛣️ ${trip.routing_mode}</div>
                </div>
                <button onclick="recalculateTrip(${trip.id})" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Recalculate Route</button>
            </div>
        `;
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

// Route colors for multi-route display
// AVOID traffic colors (green, orange/amber, red) to prevent confusion
// Use blues, purples, pinks, and cyans that contrast with traffic overlay
const ROUTE_COLORS = [
    '#2563EB',  // Bright blue - main route (Camera-Safe)
    '#7C3AED',  // Purple - Shortest
    '#EC4899',  // Pink/Magenta - Fastest
    '#06B6D4',  // Cyan/Teal - Balanced
    '#8B5CF6'   // Violet - additional routes
];

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
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'route-drag-marker',
        html: `<div style="background: #FF9800; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: grab;"></div>`,
        iconSize: [20, 20],
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
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'via-point-marker',
        html: `<div style="background: #4CAF50; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">✓</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popup: `
            <div style="text-align: center;">
                <strong>Via Point</strong><br>
                <small>Drag to adjust</small><br>
                <button onclick="removeViaPoint(${viaPoints.length - 1})" style="background: #F44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-top: 6px; cursor: pointer;">Remove</button>
            </div>
        `
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
    if (!routeOptions || routeOptions.length === 0) {
        document.getElementById('routeComparisonList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Calculate a route to see options</div>';
        return;
    }

    // DON'T call displayAllRoutesOnMap() here - it's controlled by selectRoute/showAllRoutes

    const listContainer = document.getElementById('routeComparisonList');
    const symbol = getCurrencySymbol();

    // Add "Show All Routes" button at the top
    let html = `
        <button onclick="showAllRoutes(); event.stopPropagation();" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 8px; padding: 12px; font-size: 14px; cursor: pointer; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px;">
            🗺️ Show All ${routeOptions.length} Routes
        </button>
    `;

    html += routeOptions.map((route, index) => {
        const distance = convertDistance(route.distance_km);
        const distUnit = getDistanceUnit();
        const routeName = route.name || `Route ${index + 1}`;
        const hazardCount = route.hazard_count || 0;
        const routeColor = ROUTE_COLORS[index % ROUTE_COLORS.length];

        const fuelCost = parseFloat(route.fuel_cost || 0);
        const tollCost = parseFloat(route.toll_cost || 0);
        const cazCost = parseFloat(route.caz_cost || 0);
        const totalCost = (fuelCost + tollCost + cazCost).toFixed(2);

        const isSelected = index === selectedRouteIndex;
        const borderColor = isSelected ? routeColor : '#ddd';
        const bgColor = isSelected ? '#E8F5E9' : '#f8f9fa';

        // Hazard badge color based on count
        const hazardColor = hazardCount === 0 ? '#4CAF50' : (hazardCount <= 2 ? '#FF9800' : '#F44336');

        return `
            <div style="background: ${bgColor}; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${routeColor}; cursor: pointer;" onclick="selectRoute(${index})">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 14px; font-weight: 600; color: #333;">
                        <span style="display: inline-block; width: 12px; height: 12px; background: ${routeColor}; border-radius: 50%; margin-right: 6px;"></span>
                        ${routeName}
                    </div>
                    <div style="font-size: 11px; padding: 2px 8px; border-radius: 10px; background: ${hazardColor}; color: white;">📷 ${hazardCount} cameras</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #333; margin-bottom: 8px;">
                    <div><strong>⏱️ ${route.duration_minutes} min</strong></div>
                    <div><strong>📏 ${distance} ${distUnit}</strong></div>
                    <div>⛽ ${symbol}${fuelCost.toFixed(2)}</div>
                    <div>🛣️ ${symbol}${tollCost.toFixed(2)}</div>
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                    Total: <strong>${symbol}${totalCost}</strong>
                </div>
                <button onclick="useRoute(${index}); event.stopPropagation();" style="width: 100%; background: ${routeColor}; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Use This Route</button>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = html;
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

    // Add marker to map with MapLibre
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'via-point-marker',
        html: `<div style="background: #FF9800; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${viaPoints.length}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popup: `<b>${pointName}</b><br><button onclick="removeViaPoint(${viaPoints.length - 1})" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button>`
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

    // Add marker to map with MapLibre
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        className: 'stop-marker',
        html: `<div style="background: #E91E63; color: white; border-radius: 4px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🅿️</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popup: `<b>${stopName}</b><br>Duration: ${duration} min<br><button onclick="removeStop(${stops.length - 1})" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button>`
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
        const marker = MapLibreHelpers.createMarker(point.lat, point.lon, {
            className: 'via-point-marker',
            html: `<div style="background: #FF9800; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${idx + 1}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popup: `<b>${point.name}</b><br><button onclick="removeViaPoint(${idx})" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button>`
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

    const allItems = [
        ...viaPoints.map((p, i) => ({...p, _type: 'via', _idx: i})),
        ...stops.map((s, i) => ({...s, _type: 'stop', _idx: i}))
    ];

    if (allItems.length === 0) {
        container.innerHTML = '<div class="waypoints-empty">No waypoints yet. Add via-points or stops above.</div>';
        return;
    }

    let html = '';

    viaPoints.forEach((point, idx) => {
        html += `
            <div class="waypoint-item" draggable="true" data-type="via" data-index="${idx}"
                 ondragstart="onWaypointDragStart(event)" ondragover="onWaypointDragOver(event)" ondrop="onWaypointDrop(event)"
                 style="display: flex; align-items: center; padding: 8px; background: #FFF3E0; border-radius: 6px; margin-bottom: 6px; cursor: grab; transition: opacity 0.2s;">
                <span style="margin-right: 6px; color: #999; font-size: 14px; cursor: grab;">⠿</span>
                <span style="background: #FF9800; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">${idx + 1}</span>
                <span style="flex: 1; font-size: 13px;">${point.name}</span>
                <button onclick="moveWaypoint('via', ${idx}, -1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move up">▲</button>
                <button onclick="moveWaypoint('via', ${idx}, 1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move down">▼</button>
                <button onclick="removeViaPoint(${idx})" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 16px;">✕</button>
            </div>
        `;
    });

    stops.forEach((stop, idx) => {
        html += `
            <div class="waypoint-item" draggable="true" data-type="stop" data-index="${idx}"
                 ondragstart="onWaypointDragStart(event)" ondragover="onWaypointDragOver(event)" ondrop="onWaypointDrop(event)"
                 style="display: flex; align-items: center; padding: 8px; background: #FCE4EC; border-radius: 6px; margin-bottom: 6px; cursor: grab; transition: opacity 0.2s;">
                <span style="margin-right: 6px; color: #999; font-size: 14px; cursor: grab;">⠿</span>
                <span style="background: #E91E63; color: white; border-radius: 4px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">${idx + 1}</span>
                <span style="flex: 1; font-size: 13px;">${stop.name} (${stop.duration} min)</span>
                <button onclick="moveWaypoint('stop', ${idx}, -1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move up">▲</button>
                <button onclick="moveWaypoint('stop', ${idx}, 1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move down">▼</button>
                <button onclick="removeStop(${idx})" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 16px;">✕</button>
            </div>
        `;
    });

    const totalStopTime = stops.reduce((sum, s) => sum + s.duration, 0);
    if (totalStopTime > 0) {
        html += `<div style="font-size: 12px; color: #666; margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px;">Total stop time: <strong>${totalStopTime} min</strong></div>`;
    }

    container.innerHTML = html;
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

    const distUnit = getDistanceUnit();
    let html = '<div style="margin-top: 10px;">';
    html += '<div style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #333;">Route Itinerary' +
            (data.optimized ? ' (Optimized)' : '') + '</div>';

    data.legs.forEach((leg, idx) => {
        const legDist = convertDistance(leg.distance_km || 0);
        const legTime = Math.round(leg.duration_minutes || 0);
        const eta = leg.eta ? new Date(leg.eta).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '';
        const stopInfo = leg.stop;

        const bgColor = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
        const borderColor = stopInfo && !stopInfo.time_window_ok ? '#f44336' : '#4CAF50';

        html += `<div style="padding: 10px; background: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 4px; margin-bottom: 4px;">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
        html += `<span style="font-weight: 500; font-size: 13px;">Leg ${idx + 1}</span>`;
        html += `<span style="font-size: 12px; color: #666;">${legDist} ${distUnit} | ${legTime} min</span>`;
        html += `</div>`;

        if (stopInfo) {
            html += `<div style="margin-top: 4px; font-size: 12px;">`;
            html += `<span style="color: #E91E63; font-weight: 500;">${stopInfo.name}</span>`;
            if (stopInfo.duration_minutes > 0) {
                html += ` <span style="color: #999;">(${stopInfo.duration_minutes} min stop)</span>`;
            }
            if (eta) {
                html += ` <span style="color: #2196F3;">ETA: ${eta}</span>`;
            }
            if (!stopInfo.time_window_ok) {
                html += ' <span style="color: #f44336; font-weight: 600;">Outside time window</span>';
            }
            html += `</div>`;
        } else if (eta) {
            html += `<div style="margin-top: 4px; font-size: 12px; color: #2196F3;">ETA: ${eta}</div>`;
        }
        html += `</div>`;
    });

    html += `<div style="padding: 8px; background: #E8F5E9; border-radius: 4px; margin-top: 8px;">`;
    html += `<div style="font-weight: 600; font-size: 13px; color: #2E7D32;">`;
    html += `Total: ${convertDistance(data.total_distance_km)} ${distUnit} | `;
    html += `${Math.round(data.total_duration_minutes)} min`;
    if (data.total_stop_time_minutes > 0) {
        html += ` (incl. ${data.total_stop_time_minutes} min stops)`;
    }
    html += `</div>`;
    if (data.round_trip) {
        html += `<div style="font-size: 11px; color: #666; margin-top: 2px;">Round trip - returns to start</div>`;
    }
    html += `</div>`;

    html += '</div>';
    container.innerHTML += html;

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

    const legColors = ['#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
                       '#00BCD4', '#FF5722', '#795548', '#607D8B', '#3F51B5'];

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
    const waypoints = [];

    // Start
    waypoints.push({ lat: startLat, lon: startLon, type: 'start' });

    // Combine via-points and stops, sort by distance from start for optimization
    const intermediate = [...viaPoints, ...stops];

    if (intermediate.length > 0) {
        // Simple greedy optimization: visit closest point next
        const remaining = [...intermediate];
        let current = { lat: startLat, lon: startLon };

        while (remaining.length > 0) {
            let closestIdx = 0;
            let closestDist = Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const dist = Math.sqrt(
                    Math.pow(remaining[i].lat - current.lat, 2) +
                    Math.pow(remaining[i].lon - current.lon, 2)
                );
                if (dist < closestDist) {
                    closestDist = dist;
                    closestIdx = i;
                }
            }

            waypoints.push(remaining[closestIdx]);
            current = remaining[closestIdx];
            remaining.splice(closestIdx, 1);
        }
    }

    // End
    waypoints.push({ lat: endLat, lon: endLon, type: 'end' });

    return waypoints;
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

    // CRITICAL: Update window.lastCalculatedRoute with the selected route
    // This ensures maneuvers and all route data are available for navigation
    if (routeOptions && routeOptions[index]) {
        const selectedRoute = routeOptions[index];
        const prev = window.lastCalculatedRoute || {};
        // Preserve destination strings for auto-reroute / traffic reroute (not on per-route option objects)
        window.lastCalculatedRoute = {
            ...prev,
            ...selectedRoute,
            destination: prev.destination || selectedRoute.destination,
            destinationName: prev.destinationName || selectedRoute.destinationName
        };
        console.log(`[Routes] Selected route "${selectedRoute.name}" with ${(selectedRoute.maneuvers || []).length} maneuvers`);

        // Update the route preview with the selected route data
        // Pass skipMapDisplay=true since displaySingleRoute already handled the map
        showRoutePreview(selectedRoute, true);

        // Auto-collapse logic removed to keep Route Preview visible
        // collapseBottomSheet();
    }
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

    // NOTE: Don't draw route here - displaySingleRoute() handles map display
    // This function now just updates trip info and stores the selected route

    // Update trip info with unit-adjusted costs
    const distance = convertDistance(route.distance_km);
    const distUnit = getDistanceUnit();
    const symbol = getCurrencySymbol();

    const fuelCost = parseFloat(route.fuel_cost || 0);
    const tollCost = parseFloat(route.toll_cost || 0);
    const cazCost = parseFloat(route.caz_cost || 0);
    const totalCost = (fuelCost + tollCost + cazCost).toFixed(2);

    document.getElementById('distance').textContent = distance + ' ' + distUnit;
    document.getElementById('distance').dataset.km = route.distance_km;
    document.getElementById('time').textContent = route.duration_minutes + ' min';
    document.getElementById('fuelCost').textContent = symbol + fuelCost.toFixed(2);
    document.getElementById('fuelCost').dataset.value = fuelCost;
    document.getElementById('tollCost').textContent = symbol + tollCost.toFixed(2);
    document.getElementById('tollCost').dataset.value = tollCost;

    console.log('[Cost] Route selected with costs:', {
        distanceUnit: distanceUnit,
        fuelCost: fuelCost.toFixed(2),
        tollCost: tollCost.toFixed(2),
        cazCost: cazCost.toFixed(2),
        totalCost: totalCost
    });

    // Merge into prior route payload so reroute/traffic still have destination (single-route objects omit it).
    const prev = window.lastCalculatedRoute || {};
    window.lastCalculatedRoute = {
        ...prev,
        ...route,
        destination: prev.destination || route.destination,
        destinationName: prev.destinationName || route.destinationName,
        end_lat: prev.end_lat != null ? prev.end_lat : route.end_lat,
        end_lon: prev.end_lon != null ? prev.end_lon : route.end_lon,
    };

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
    const distUnit = getDistanceUnit();

    // Update route summary with unit-adjusted costs
    document.getElementById('shareStart').textContent = `Start: ${startInput}`;
    document.getElementById('shareEnd').textContent = `End: ${endInput}`;
    document.getElementById('shareDistance').textContent = `Distance: ${convertDistance(route.distance_km || 0)} ${distUnit}`;
    document.getElementById('shareTime').textContent = `Duration: ${route.time || 'N/A'}`;

    const fuelCost = parseFloat(route.fuel_cost || 0);
    const tollCost = parseFloat(route.toll_cost || 0);
    const cazCost = parseFloat(route.caz_cost || 0);
    const totalCost = (fuelCost + tollCost + cazCost).toFixed(2);
    document.getElementById('shareCost').textContent = `Total Cost: ${symbol}${totalCost}`;

    console.log('[Cost] Route sharing prepared with costs:', {
        distanceUnit: distanceUnit,
        totalCost: totalCost
    });
}

/**
 * generateShareLink function
 * @function generateShareLink
 * @returns {*} Return value description
 */
function generateShareLink() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    // Create shareable link with route data
    const routeData = {
        start: startInput,
        end: endInput,
        distance: route.distance_km,
        time: route.time,
        fuel_cost: route.fuel_cost,
        toll_cost: route.toll_cost,
        caz_cost: route.caz_cost,
        geometry: route.geometry
    };

    // Encode route data as base64
    const encodedRoute = btoa(JSON.stringify(routeData));
    const shareLink = `${window.location.origin}?route=${encodedRoute}`;

    // Display share link
    document.getElementById('shareLink').value = shareLink;
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
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    // Generate share link first
    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    const routeData = {
        start: startInput,
        end: endInput,
        distance: route.distance_km,
        time: route.time,
        fuel_cost: route.fuel_cost,
        toll_cost: route.toll_cost,
        caz_cost: route.caz_cost
    };

    const encodedRoute = btoa(JSON.stringify(routeData));
    const shareLink = `${window.location.origin}?route=${encodedRoute}`;

    // Clear previous QR code
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';

    // Generate QR code using QR Server API
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareLink)}`;
    const qrImage = document.createElement('img');
    qrImage.src = qrImageUrl;
    qrImage.alt = 'Route QR Code';
    qrImage.style.width = '200px';
    qrImage.style.height = '200px';
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
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    const message = `📍 Route from ${startInput} to ${endInput}\n📏 Distance: ${convertDistance(route.distance_km)} ${distUnit}\n⏱️ Duration: ${route.time}\n💰 Cost: ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}\n\nShared via Voyagr Navigation`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');

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
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    const subject = `Route: ${startInput} to ${endInput}`;
    const body = `I'm sharing a route with you:\n\nFrom: ${startInput}\nTo: ${endInput}\nDistance: ${convertDistance(route.distance_km)} ${distUnit}\nDuration: ${route.time}\nEstimated Cost: ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}\n\nShared via Voyagr Navigation`;

    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;

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

    // Update summary stats
    document.getElementById('totalTrips').textContent = data.total_trips || 0;
    document.getElementById('totalDistance').textContent = `${convertDistance(data.total_distance_km || 0)} ${distUnit}`;
    document.getElementById('totalCost').textContent = `${symbol}${(data.total_cost || 0).toFixed(2)}`;
    document.getElementById('avgDuration').textContent = `${data.avg_duration || 0} min`;

    // Update cost breakdown
    document.getElementById('totalFuelCost').textContent = `${symbol}${(data.total_fuel_cost || 0).toFixed(2)}`;
    document.getElementById('totalTollCost').textContent = `${symbol}${(data.total_toll_cost || 0).toFixed(2)}`;
    document.getElementById('totalCAZCost').textContent = `${symbol}${(data.total_caz_cost || 0).toFixed(2)}`;

    // Update time statistics
    const totalHours = Math.floor((data.total_time_minutes || 0) / 60);
    const totalMinutes = (data.total_time_minutes || 0) % 60;
    document.getElementById('totalTime').textContent = `${totalHours}h ${totalMinutes}m`;
    // avg_speed from backend is in km/h - convert based on user's speed preference
    const avgSpeedKmh = data.avg_speed || 0;
    const displayAvgSpeed = speedUnit === 'mph' ? (avgSpeedKmh * 0.621371) : avgSpeedKmh;
    document.getElementById('avgSpeed').textContent = `${displayAvgSpeed.toFixed(1)} ${getSpeedUnit()}`;

    // Display most frequent routes
    const frequentRoutesList = document.getElementById('frequentRoutesList');
    if (data.frequent_routes && data.frequent_routes.length > 0) {
        frequentRoutesList.innerHTML = data.frequent_routes.map((route, idx) => `
            <div style="background: white; padding: 10px; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #FF5722;">
                <div style="font-weight: 500; font-size: 13px; margin-bottom: 4px;">${idx + 1}. ${escapeHtml(route.start)} → ${escapeHtml(route.end)}</div>
                <div style="font-size: 12px; color: #666;">
                    <span>🔄 ${route.count} trips</span> |
                    <span>📏 ${convertDistance(route.avg_distance)} ${distUnit}</span> |
                    <span>💰 ${symbol}${route.avg_cost.toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    } else {
        frequentRoutesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trip history yet</div>';
    }
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
    const saved = localStorage.getItem('routePreferences');
    if (saved) {
        return JSON.parse(saved);
    }
    return {
        avoidHighways: false,
        preferScenic: false,
        avoidTolls: true,  // Default: avoid tolls
        avoidCAZ: true,    // Default: avoid Clean Air Zones
        preferQuiet: false,
        avoidUnpaved: false,
        routeOptimization: 'fastest',
        maxDetour: 20
    };
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

    if (savedRoutes.length === 0) {
        savedRoutesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No saved routes yet</div>';
        return;
    }

    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    savedRoutesList.innerHTML = savedRoutes.map(route => `
        <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #E91E63;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div>
                    <div style="font-weight: 500; font-size: 14px;">${route.name}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 4px;">📍 ${route.start} → ${route.end}</div>
                </div>
                <button onclick="deleteSavedRoute(${route.id})" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">✕</button>
            </div>
            <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                📏 ${convertDistance(route.distance_km)} ${distUnit} | ⏱️ ${route.duration_minutes} | 💰 ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}
            </div>
            <button onclick="useSavedRoute(${route.id})" style="width: 100%; background: #E91E63; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 13px;">🚀 Use This Route</button>
        </div>
    `).join('');
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
function decodePolyline(encoded, precision = 6) {
    if (!encoded || typeof encoded !== 'string') {
        console.warn('[decodePolyline] Invalid input:', encoded);
        return [];
    }

    // Valhalla uses precision 6 (1e6), OSRM/GraphHopper use precision 5 (1e5)
    const inv = 1.0 / Math.pow(10, precision);
    const decoded = [];
    let previous = [0, 0];
    let i = 0;

    try {
        while (i < encoded.length) {
            let ll = [0, 0];
            for (let j = 0; j < 2; j++) {
                let shift = 0;
                let result = 0;
                let byte = 0;
                do {
                    byte = encoded.charCodeAt(i++) - 63;
                    result |= (byte & 0x1f) << shift;
                    shift += 5;
                } while (byte >= 0x20);
                ll[j] = previous[j] + (result & 1 ? ~(result >> 1) : result >> 1);
                previous[j] = ll[j];
            }
            // Polyline format is [lat, lon], which is what Leaflet expects
            decoded.push([ll[0] * inv, ll[1] * inv]);
        }

        console.log(`[decodePolyline] Decoded ${decoded.length} points with precision ${precision}`);
        if (decoded.length > 0) {
            console.log(`[decodePolyline] First point: [${decoded[0][0]}, ${decoded[0][1]}]`);
            console.log(`[decodePolyline] Last point: [${decoded[decoded.length - 1][0]}, ${decoded[decoded.length - 1][1]}]`);
        }

        return decoded;
    } catch (error) {
        console.error('[decodePolyline] Error decoding polyline:', error);
        return [];
    }
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
    const enableHazardAvoidance =
        localStorage.getItem('pref_cameras') !== 'false' ||  // Default: true
        localStorage.getItem('pref_caz') !== 'false' ||
        localStorage.getItem('pref_trafficLightsAvoid') !== 'false' ||
        localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false' ||
        localStorage.getItem('pref_police') === 'true' ||
        localStorage.getItem('pref_roadworks') === 'true' ||
        localStorage.getItem('pref_accidents') === 'true';

    // Build via-points array for multi-stop routing
    const viaPointsData = viaPoints.map(vp => ({
        lat: vp.lat,
        lon: vp.lon,
        name: vp.name,
        type: 'via'
    }));

    // Build stops array with duration
    const stopsData = stops.map(s => ({
        lat: s.lat,
        lon: s.lon,
        name: s.name,
        type: 'stop',
        duration: s.duration || 15
    }));

    // Calculate total stop time for display
    const totalStopTime = stops.reduce((sum, s) => sum + (s.duration || 15), 0);

    // Multi-drop settings from route preferences
    const routePrefs = getRoutePreferences();
    const optimizeOrder = localStorage.getItem('pref_optimizeStopOrder') !== 'false';
    const roundTrip = localStorage.getItem('pref_roundTrip') === 'true';
    const departureTime = localStorage.getItem('pref_departureTime') || null;

    const avoidTollRoads = isAvoidTollsEnabled();
    const avoidMotorways = localStorage.getItem('pref_avoid_motorways') === 'true';
    const avoidFerries = localStorage.getItem('pref_avoid_ferries') === 'true';

    const liveGpsOk =
        routeInProgress &&
        isTrackingActive &&
        Array.isArray(trackingHistory) &&
        trackingHistory.length > 0 &&
        typeof currentLat === 'number' &&
        Number.isFinite(currentLat) &&
        typeof currentLon === 'number' &&
        Number.isFinite(currentLon);
    const routeStartCoordStr = liveGpsOk ? `${currentLat},${currentLon}` : geocodedStart;

    const requestBody = {
        start: routeStartCoordStr,
        end: geocodedEnd,
        routing_mode: currentRoutingMode,
        vehicle_type: currentVehicleType,
        enable_hazard_avoidance: enableHazardAvoidance,
        avoid_cameras: localStorage.getItem('pref_cameras') !== 'false',
        avoid_caz: localStorage.getItem('pref_caz') !== 'false',
        avoid_traffic_lights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
        avoid_railway_crossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
        via_points: viaPointsData,
        stops: stopsData,
        optimize_stop_order: optimizeOrder,
        round_trip: roundTrip,
        departure_time: departureTime,
        avoid_tolls: avoidTollRoads,
        avoid_motorways: avoidMotorways,
        avoid_ferries: avoidFerries,
        // Extended route preferences — translated server-side into Valhalla auto costing_options.
        prefer_scenic: !!routePrefs.preferScenic,
        prefer_quiet: !!routePrefs.preferQuiet,
        avoid_unpaved: !!routePrefs.avoidUnpaved,
        route_optimization: routePrefs.routeOptimization || 'fastest',
        max_detour: (typeof routePrefs.maxDetour === 'number') ? routePrefs.maxDetour : 20,
    };

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

            if (data.success) {
                // ===== FIX: If navigation is in progress, take a streamlined reroute path =====
                // This avoids clearing markers, fitting bounds, or switching to the route preview tab.
                if (routeInProgress) {
                    console.log('[calculateRoute] Navigation active — using in-nav reroute path');
                    hideRouteProgressBar();

                    // Pick the best-matching route: prefer same-name match as the
                    // previously selected route, then fall back to routes[0].
                    let activeRoute = (data.routes && data.routes.length > 0) ? data.routes[0] : data;
                    if (data.routes && data.routes.length > 1 && window.lastCalculatedRoute) {
                        const prevName = (window.lastCalculatedRoute.name || '').toLowerCase();
                        if (prevName) {
                            const match = data.routes.find(r => (r.name || '').toLowerCase() === prevName);
                            if (match) {
                                activeRoute = match;
                                console.log(`[Reroute] Matched previous route "${match.name}"`);
                            }
                        }
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

                    window.lastCalculatedRoute = {
                        ...data,
                        duration_minutes: durationMinutes,  // FIXED: Ensure duration_minutes is at top level
                        destination: geocodedEnd,  // Store geocoded coordinates for automatic rerouting
                        destinationName: end  // Store human-readable name for display
                    };

                    console.log(`[Route] Stored route with duration_minutes: ${durationMinutes}`);

                    // Display hazard markers if hazards are present
                    if (data.routes && data.routes.length > 0 && data.routes[0].hazards) {
                        displayHazardMarkers(data.routes[0].hazards);
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
    let progressContainer = document.getElementById('routeProgressContainer');

    if (!progressContainer) {
        // Create progress bar container
        progressContainer = document.createElement('div');
        progressContainer.id = 'routeProgressContainer';
        progressContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            background: rgba(102, 126, 234, 0.1);
            padding: 0;
        `;

        progressContainer.innerHTML = `
            <div id="routeProgressBar" style="
                height: 4px;
                background: linear-gradient(90deg, #667eea, #764ba2, #667eea);
                background-size: 200% 100%;
                animation: progressGradient 1.5s ease-in-out infinite;
                width: 100%;
            "></div>
            <div style="
                text-align: center;
                padding: 8px;
                font-size: 13px;
                color: #667eea;
                font-weight: 500;
            ">
                <span id="routeProgressText">📍 Calculating route...</span>
            </div>
        `;

        // Add animation keyframes if not already present
        if (!document.getElementById('progressAnimationStyle')) {
            const style = document.createElement('style');
            style.id = 'progressAnimationStyle';
            style.textContent = `
                @keyframes progressGradient {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
            `;
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
    const progressContainer = document.getElementById('routeProgressContainer');
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
 * Map API / legacy hazard.type strings to marker style keys (camera_* , traffic_light, …).
 */
function normalizeCameraHazardTypeForMarker(raw) {
    if (raw === 'traffic_signals' || raw === 'traffic_signal') return 'traffic_light';
    if (raw == null || raw === '') return 'camera_speed';
    const k = String(raw).toLowerCase();
    if (k === 'camera') return 'camera_speed';
    if (k === 'speed_camera') return 'camera_speed';
    if (k === 'traffic_light_camera' || k === 'traffic-light-camera') return 'camera_red_light';
    if (k.startsWith('camera_')) return k;
    if (/(red_light|red-light|traffic_light|traffic light|rlc|tlc)/i.test(String(raw))) return 'camera_red_light';
    if (/(spec|average|vec)/i.test(k)) return 'camera_average_speed';
    if (k.includes('bus')) return 'camera_bus_lane';
    if (k.includes('mobile')) return 'camera_mobile';
    if (k === 'speed' || k === 'fixed' || k === 'gatso' || k === 'truvelo') return 'camera_speed';
    return 'camera_other';
}

/**
 * Shared SVG marker styles for route hazards and “cameras on map” layer.
 */
function getHazardMarkerStyleMap() {
    const cameraSVG = `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="5" width="16" height="16" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="12" cy="13" r="4" fill="#222"/><circle cx="12" cy="13" r="2" fill="#FFD600"/><rect x="8" y="2" width="8" height="4" rx="1" fill="#222"/></svg>`;
    const cameraRedLightSVG = `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="9.5" cy="12" r="3.2" fill="#222"/><circle cx="9.5" cy="12" r="1.6" fill="#FFD600"/><circle cx="16.5" cy="9.5" r="2.2" fill="#f44336" stroke="#b71c1c" stroke-width="0.8"/><circle cx="16.5" cy="14.5" r="2.2" fill="#fbc02d" stroke="#f57f17" stroke-width="0.8"/><circle cx="16.5" cy="19.5" r="2.2" fill="#388e3c" stroke="#1b5e20" stroke-width="0.8"/></svg>`;
    const cameraAvgSVG = `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="7" width="16" height="11" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="12" cy="12.5" r="3" fill="#222"/><path d="M5 18 L19 18" stroke="#222" stroke-width="1.3" stroke-dasharray="2 2"/></svg>`;
    const cameraBusSVG = `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="7" width="16" height="12" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="12" cy="13" r="3" fill="#222"/><rect x="7" y="9" width="10" height="6" rx="1" fill="#1565c0"/></svg>`;
    const cameraMobileSVG = `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="6" width="13" height="13" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="10.5" cy="12.5" r="3" fill="#222"/><path d="M17 8 L20 7 L19 14 L16 13 Z" fill="#555"/></svg>`;

    return {
        camera: { svg: cameraSVG, color: '#FFD600', bgColor: '#fff9c4', label: 'Speed camera' },
        camera_speed: { svg: cameraSVG, color: '#FFD600', bgColor: '#fff9c4', label: 'Speed camera' },
        camera_red_light: { svg: cameraRedLightSVG, color: '#e65100', bgColor: '#fff3e0', label: 'Traffic-light camera' },
        camera_average_speed: { svg: cameraAvgSVG, color: '#6a1b9a', bgColor: '#f3e5f5', label: 'Average speed camera' },
        camera_bus_lane: { svg: cameraBusSVG, color: '#0d47a1', bgColor: '#e3f2fd', label: 'Bus lane camera' },
        camera_mobile: { svg: cameraMobileSVG, color: '#37474f', bgColor: '#eceff1', label: 'Mobile camera' },
        camera_other: { svg: cameraSVG, color: '#f57c00', bgColor: '#fff8e1', label: 'Camera' },
        traffic_light: { useOsmTrafficLightPill: true, color: '#2e7d32', bgColor: '#e8f5e9', label: 'Traffic light' },
        police: { emoji: '🚔', color: '#1976d2', bgColor: '#e3f2fd', label: 'Police' },
        roadworks: { emoji: '🚧', color: '#ffc107', bgColor: '#fff8e1', label: 'Roadworks' },
        accident: { emoji: '⚠️', color: '#f44336', bgColor: '#ffebee', label: 'Accident' },
        railway_crossing: { emoji: '🚂', color: '#795548', bgColor: '#efebe9', label: 'Railway Crossing' },
        pothole: { emoji: '🕳️', color: '#607d8b', bgColor: '#eceff1', label: 'Pothole' },
        debris: { emoji: '🪨', color: '#8d6e63', bgColor: '#efebe9', label: 'Debris' }
    };
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

    const hazardConfig = getHazardMarkerStyleMap();

    // Track unique locations to avoid duplicates
    const seenLocations = new Set();

    // Display each hazard
    hazards.forEach(hazard => {
        const locationKey = `${hazard.lat.toFixed(5)},${hazard.lon.toFixed(5)}`;
        if (seenLocations.has(locationKey)) return;
        seenLocations.add(locationKey);

        const hazardTypeKey = normalizeCameraHazardTypeForMarker(hazard.type);
        const config = hazardConfig[hazardTypeKey] || { emoji: '⚠️', color: '#ff9800', bgColor: '#fff3e0', label: 'Hazard' };

        let markerHtml;
        let markerIconSize;
        let popupIcon;

        if (config.useOsmTrafficLightPill) {
            markerHtml = getOsmTrafficLightMarkerPillHTML();
            markerIconSize = [26, 38];
            popupIcon = `<div style="width:26px;height:38px;margin:0 auto;">${getOsmTrafficLightMarkerPillHTML()}</div>`;
        } else if (config.svg) {
            const isCamera = true;
            markerHtml = `<div style="
                background: ${config.bgColor};
                border: 2px solid ${config.color};
                border-radius: ${isCamera ? '4px' : '50%'};
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                cursor: pointer;
            ">${config.svg}</div>`;
            markerIconSize = [28, 28];
            popupIcon = config.svg;
        } else {
            markerHtml = `<div style="
                background: ${config.bgColor};
                border: 2px solid ${config.color};
                border-radius: 50%;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                cursor: pointer;
            ">${config.emoji}</div>`;
            markerIconSize = [28, 28];
            popupIcon = `<span style="font-size: 24px;">${config.emoji}</span>`;
        }

        const hazardDistanceText = hazard.distance_km
            ? `<div style="font-size: 11px; color: #888; margin-top: 5px;">${hazard.distance_km.toFixed(1)} km ahead</div>`
            : '';

        const marker = MapLibreHelpers.createMarker(hazard.lat, hazard.lon, {
            className: 'hazard-marker',
            html: markerHtml,
            iconSize: markerIconSize,
            iconAnchor: [markerIconSize[0] / 2, markerIconSize[1] / 2],
            popup: `
                <div style="text-align: center; min-width: 150px;">
                    <div style="margin-bottom: 8px; display: flex; justify-content: center;">${popupIcon}</div>
                    <div style="font-weight: bold; color: ${config.color}; margin-bottom: 5px;">${config.label}</div>
                    ${hazard.description ? `<div style="font-size: 12px; color: #666;">${hazard.description}</div>` : ''}
                    ${hazardDistanceText}
                </div>
            `
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
    if (toggle) {
        toggle.classList.toggle('active', buildings3DEnabled);
    }

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
    if (toggle) {
        toggle.classList.toggle('active', roadLabelsEnabled);
        if (roadLabelsEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ccc';
            toggle.style.borderColor = '#ccc';
        }
    }

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
    if (toggle) {
        toggle.classList.toggle('active', googlePlusCodesEnabled);
        if (googlePlusCodesEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ccc';
            toggle.style.borderColor = '#ccc';
        }
    }

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
 * Add TomTom traffic flow tile layer to map
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

    // Remove existing traffic layer if any
    removeTrafficLayer();

    // TomTom Traffic Flow Tiles - relative speed coloring
    // Green = free flow, Yellow = slow, Red = congested, Black = blocked
    // Using 'relative0' style which shows all roads with traffic coloring
    let tomtomApiKey = window.TOMTOM_API_KEY || '';

    // Debug: Log API key availability
    console.log('[Traffic] API key check:', {
        windowKey: typeof window.TOMTOM_API_KEY,
        keyLength: tomtomApiKey ? tomtomApiKey.length : 0,
        hasKey: !!tomtomApiKey
    });

    // If key not available from inline script, try fetching from API
    if (!tomtomApiKey) {
        console.log('[Traffic] Fetching API key from server...');
        fetch('/api/config')
            .then(r => r.json())
            .then(data => {
                applySupportLinksFromConfig(data);
                if (data.success && data.tomtom_api_key) {
                    window.TOMTOM_API_KEY = data.tomtom_api_key;
                    console.log('[Traffic] API key loaded from server, reinitializing...');
                    addTrafficLayer(); // Retry with new key
                } else {
                    console.log('[Traffic] No API key from server - using route-level traffic only');
                }
            })
            .catch(err => console.log('[Traffic] Failed to fetch config:', err));
        return;
    }

    // Wait for style to load before adding traffic layer
    const addTrafficLayerNow = () => {
        try {
            // MapLibre raster tile source for traffic
            if (!map.getSource('traffic-source')) {
                map.addSource('traffic-source', {
                    type: 'raster',
                    tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomApiKey}&tileSize=256`],
                    tileSize: 256,
                    minzoom: 0,
                    maxzoom: 22,
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
                    maxzoom: 22,
                    paint: { 'raster-opacity': 0.6 }
                }, trafficBeforeId);  // Insert before labels so labels stay on top
            }

            trafficLayer = { id: 'traffic-layer' };
            console.log('[Traffic] TomTom traffic layer added successfully');

            // Ensure routes stay on top of traffic
            bringRoutesToTop();
        } catch (e) {
            console.error('[Traffic] Error adding traffic layer:', e);
        }
    };

    if (map.isStyleLoaded()) {
        addTrafficLayerNow();
    } else {
        console.log('[Traffic] Waiting for style to load...');
        map.once('style.load', addTrafficLayerNow);
        setTimeout(addTrafficLayerNow, 1000);
    }
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
    localStorage.setItem('showWeatherEnabled', showWeatherEnabled ? 'true' : 'false');

    const toggle = document.getElementById('showWeatherToggle');
    if (toggle) {
        toggle.classList.toggle('active', showWeatherEnabled);
        if (showWeatherEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
        }
    }

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

    const typeNames = {
        'precipitation_new': 'Precipitation',
        'clouds_new': 'Clouds',
        'temp_new': 'Temperature',
        'wind_new': 'Wind'
    };
    showStatus(`🌧️ Weather layer: ${typeNames[type] || type}`, 'info');
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
            // OpenWeatherMap weather tiles
            // Available layers: precipitation_new, clouds_new, temp_new, wind_new, pressure_new
            const tileUrl = `https://tile.openweathermap.org/map/${weatherLayerType}/{z}/{x}/{y}.png?appid=${owmApiKey}`;

            if (!map.getSource('weather-source')) {
                map.addSource('weather-source', {
                    type: 'raster',
                    tiles: [tileUrl],
                    tileSize: 256,
                    minzoom: 1,
                    maxzoom: 18,
                    bounds: [-180, -85.0511, 180, 85.0511]
                });
            }

            if (!map.getLayer('weather-layer')) {
                // Add weather layer below route layers but above base map
                map.addLayer({
                    id: 'weather-layer',
                    type: 'raster',
                    source: 'weather-source',
                    minzoom: 1,
                    maxzoom: 18,
                    paint: { 'raster-opacity': 0.7 }
                });
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
    if (toggle) {
        toggle.classList.toggle('active', showWeatherEnabled);
        if (showWeatherEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
        }
    }

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
// Displays traffic congestion as colored edges along the active route
// Only shows congested segments (orange/red/black) - green segments are hidden to reduce clutter
// Colors: orange (moderate), red (heavy), black (blocked/severe)

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
    localStorage.setItem('routeTrafficEnabled', routeTrafficEnabled ? 'true' : 'false');

    const toggle = document.getElementById('routeTrafficToggle');
    if (toggle) {
        toggle.classList.toggle('active', routeTrafficEnabled);
        if (routeTrafficEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
        }
    }

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

        const response = await fetch('/api/route-traffic-flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                points: routePolyline,
                sample_interval: sampleInterval
            })
        });

        const data = await response.json();

        if (data.success && data.segments && data.segments.length > 0) {
            displayRouteTrafficEdges(data.segments);
            console.log(`[Route Traffic] Displayed ${data.segments.length} traffic segments (source: ${data.source})`);
        } else {
            console.log('[Route Traffic] No traffic segments returned');
        }
    } catch (error) {
        console.error('[Route Traffic] Error fetching traffic:', error);
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
        const color = TRAFFIC_COLORS[segment.traffic_level] || TRAFFIC_COLORS['green'];

        // Show ALL traffic segments including green (free flow)
        // This provides full traffic visibility on the route

        // Find the indices in the route polyline that correspond to this segment
        const startIdx = findClosestRoutePointIndex(segment.start, lastEndIdx);
        const endIdx = findClosestRoutePointIndex(segment.end, startIdx);

        // Skip invalid segments
        if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
            console.log(`[Route Traffic] Skipping invalid segment ${idx}: startIdx=${startIdx}, endIdx=${endIdx}`);
            return;
        }

        // Extract all route points between start and end to follow the curved road geometry
        let segmentPoints = routePolyline.slice(startIdx, endIdx + 1);

        if (segmentPoints.length < 2) {
            // Fallback to direct line if not enough points
            segmentPoints = [segment.start, segment.end];
        }

        // Update lastEndIdx for next segment
        lastEndIdx = endIdx;

        // Create the traffic edge polyline following the route geometry with MapLibre
        // Traffic edges are drawn ON TOP of the route line so they're visible
        const trafficLine = MapLibreHelpers.addPolyline(map, segmentPoints, {
            color: color,
            weight: 6,            // Slightly thinner than route but still visible
            opacity: 0.9          // High opacity to clearly show traffic
        });
        routeTrafficLayers.push(trafficLine);
    });

    console.log(`[Route Traffic] Added ${routeTrafficLayers.length} traffic edge layers (valid segments)`);

    // Bring traffic layers to top so they're visible above routes
    bringTrafficEdgesToTop();
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
/** Until GPS is this close to the route line, skip deviation alerts/reroute (e.g. start point ≠ current location). */
/** Require GPS to be this close to the polyline before deviation reroutes fire (lower = sooner real-world reroutes). */
const ROUTE_JOIN_GATE_METERS = 85;
let routeJoinConfirmedForDeviation = false;

/**
 * Toggle auto-traffic update on/off
 */
function toggleAutoTrafficUpdate() {
    autoTrafficUpdateEnabled = !autoTrafficUpdateEnabled;
    localStorage.setItem('autoTrafficUpdate', autoTrafficUpdateEnabled ? 'true' : 'false');

    const toggle = document.getElementById('autoTrafficUpdateToggle');
    if (toggle) {
        toggle.classList.toggle('active', autoTrafficUpdateEnabled);
        if (autoTrafficUpdateEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
        }
    }

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
    if (toggle) {
        toggle.classList.toggle('active', autoRerouteOnDeviationEnabled);
        if (autoRerouteOnDeviationEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
        }
    }

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

/**
 * Check traffic conditions and reroute if significant changes detected
 */
async function checkTrafficAndReroute() {
    if (!routeInProgress || !currentLat || !currentLon) return;

    console.log('[Auto-Traffic] Checking traffic conditions...');

    try {
        // Fetch current traffic along route
        const response = await fetch('/api/traffic-patterns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: currentLat,
                lon: currentLon,
                radius: 5000
            })
        });

        const data = await response.json();
        lastTrafficUpdateTime = Date.now();

        if (!data.success) {
            console.log('[Auto-Traffic] Traffic fetch failed:', data.error);
            return;
        }

        // Compare with previous traffic data
        const changeType = detectSignificantTrafficChange(lastTrafficData, data);
        lastTrafficData = data;

        if (changeType) {
            console.log(`[Auto-Traffic] Significant traffic change detected: ${changeType}`);
            const notifMsg = changeType === 'closure'
                ? 'Road closure detected! Rerouting...'
                : 'New traffic conditions detected. Checking for better route...';
            sendNotification('🚦 Traffic Update', notifMsg, 'warning');

            await triggerTrafficBasedReroute(changeType);
        } else {
            console.log('[Auto-Traffic] No significant traffic changes');
        }
    } catch (error) {
        console.error('[Auto-Traffic] Error checking traffic:', error);
    }
}

/**
 * Detect if there's a significant traffic change
 */
function detectSignificantTrafficChange(previousData, currentData) {
    if (!previousData || !previousData.patterns) return false;
    if (!currentData || !currentData.patterns) return false;

    const prevPatterns = previousData.patterns || [];
    const currPatterns = currentData.patterns || [];

    const closureTypes = ['closure', 'road_closed', 'blocked'];
    const hasClosure = currPatterns.some(p =>
        closureTypes.includes(p.type) || (p.severity && p.severity >= 4)
    );
    if (hasClosure) {
        console.log('[Auto-Traffic] Road closure or severe incident detected on route');
        return 'closure';
    }

    const prevAvgCongestion = prevPatterns.length > 0 ?
        prevPatterns.reduce((sum, p) => sum + (p.congestion || 0), 0) / prevPatterns.length : 0;
    const currAvgCongestion = currPatterns.length > 0 ?
        currPatterns.reduce((sum, p) => sum + (p.congestion || 0), 0) / currPatterns.length : 0;

    const congestionIncrease = currAvgCongestion - prevAvgCongestion;

    if (congestionIncrease >= 1) {
        console.log(`[Auto-Traffic] Congestion increased: ${prevAvgCongestion.toFixed(1)} -> ${currAvgCongestion.toFixed(1)}`);
        return 'congestion';
    }

    const prevIncidentCount = prevPatterns.filter(p => p.type === 'incident' || p.type === 'accident').length;
    const currIncidentCount = currPatterns.filter(p => p.type === 'incident' || p.type === 'accident').length;

    if (currIncidentCount > prevIncidentCount) {
        console.log(`[Auto-Traffic] New incidents detected: ${prevIncidentCount} -> ${currIncidentCount}`);
        return 'incident';
    }

    return false;
}

/**
 * Trigger reroute based on traffic changes
 */
async function triggerTrafficBasedReroute(changeType) {
    const destination = resolveNavigationDestination();
    if (!destination) {
        console.log('[Auto-Traffic] No destination stored, cannot reroute');
        return;
    }

    if (!window.lastCalculatedRoute) {
        console.log('[Auto-Traffic] No route context, cannot reroute');
        return;
    }
    const isClosure = changeType === 'closure';
    console.log(`[Auto-Traffic] Calculating new route (reason: ${changeType})...`);

    try {
        const routeRequest = buildRouteRequest(currentLat, currentLon, destination);
        const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeRequest)
        });

        const data = await response.json();

        if (data.success && data.routes && data.routes.length > 0) {
            const newRoute = data.routes[0];
            const oldDuration = window.lastCalculatedRoute.duration_minutes || 0;
            const timeSaved = oldDuration - newRoute.duration_minutes;

            if (isClosure || timeSaved >= 2) {
                updateRouteOnMap(newRoute);
                const reason = isClosure ? 'road closure' : 'traffic';
                const saveMsg = timeSaved > 0
                    ? `Saves ${timeSaved.toFixed(0)} minutes.`
                    : '';
                sendNotification('✅ Route Updated',
                    `New route found due to ${reason}. ${saveMsg}`, 'success');
                if (voiceAnnouncementsEnabled) {
                    speakMessage(`Route updated due to ${reason}. ${saveMsg}`, 'high');
                }
            } else {
                console.log('[Auto-Traffic] New route not significantly faster, keeping current route');
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
    if (lr && typeof lr.destination === 'string') {
        const d = lr.destination.trim();
        if (d.includes(',')) return d;
    }
    const endEl = document.getElementById('end');
    if (endEl && endEl.dataset && endEl.dataset.lat != null && endEl.dataset.lon != null) {
        const lat = parseFloat(endEl.dataset.lat);
        const lon = parseFloat(endEl.dataset.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return `${lat},${lon}`;
        }
    }
    if (typeof routePolyline !== 'undefined' && routePolyline && routePolyline.length > 0) {
        const last = routePolyline[routePolyline.length - 1];
        const lat = last[0];
        const lon = last[1];
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return `${lat},${lon}`;
        }
    }
    return null;
}

/**
 * Build route request with current hazard avoidance settings
 */
function buildRouteRequest(startLat, startLon, destination) {
    const enableHazardAvoidance =
        localStorage.getItem('pref_cameras') !== 'false' ||
        localStorage.getItem('pref_trafficLightsAvoid') !== 'false' ||
        localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false' ||
        isAvoidTollsEnabled() ||
        localStorage.getItem('pref_caz') !== 'false';

    const routePrefs = (typeof getRoutePreferences === 'function') ? getRoutePreferences() : {};

    return {
        start: `${startLat},${startLon}`,
        end: destination,
        routing_mode: currentRoutingMode || 'auto',
        vehicle_type: currentVehicleType || 'petrol_diesel',
        fuel_efficiency: parseFloat(localStorage.getItem('fuelEfficiency') || '6.5'),
        fuel_price: parseFloat(localStorage.getItem('fuelPrice') || '1.40'),
        energy_efficiency: parseFloat(localStorage.getItem('energyEfficiency') || '18.5'),
        electricity_price: parseFloat(localStorage.getItem('electricityPrice') || '0.30'),
        include_tolls: localStorage.getItem('includeTolls') !== 'false',
        include_caz: localStorage.getItem('includeCAZ') !== 'false',
        enable_hazard_avoidance: enableHazardAvoidance,
        avoid_cameras: localStorage.getItem('pref_cameras') !== 'false',
        avoid_traffic_lights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
        avoid_railway_crossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false',
        avoid_tolls: isAvoidTollsEnabled(),
        avoid_motorways: localStorage.getItem('pref_avoid_motorways') === 'true',
        avoid_ferries: localStorage.getItem('pref_avoid_ferries') === 'true',
        avoid_caz: localStorage.getItem('pref_caz') !== 'false',
        // Extended route preferences — mirror calculateRoute so reroutes honour the same settings.
        prefer_scenic: !!routePrefs.preferScenic,
        prefer_quiet: !!routePrefs.preferQuiet,
        avoid_unpaved: !!routePrefs.avoidUnpaved,
        route_optimization: routePrefs.routeOptimization || 'fastest',
        max_detour: (typeof routePrefs.maxDetour === 'number') ? routePrefs.maxDetour : 20,
    };
}

/**
 * Reset voice/ETA/distance announcement state when geometry changes (reroute).
 * Prevents repeating the same milestones and back-to-back ETA after "route recalculated".
 */
function resetVoiceAnnouncementStateForNewRoute() {
    lastETAAnnouncementTime = Date.now();
    lastAnnouncedETA = null;
    lastDestinationAnnouncementDistance = Infinity;
    announcedTurnThresholds.clear();
    announcedExitThresholds.clear();
    announcedKeepThresholds.clear();
    lastTurnDetectRouteVertexIndex = 0;
    clearInitialETAAnnouncement();
    initialETAMovementRetries = 0;
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

    // Draw new route on map with MapLibre
    // NOTE: weight increased from 5 → 8 so the active route line stays clearly
    // visible at navigation zoom levels (previously the road looked too narrow).
    routeLayer = MapLibreHelpers.addPolyline(map, routePolyline, {
        color: '#667eea',
        weight: 8,
        opacity: 0.85
    });

    // === FIX: Update maneuvers / steps so turn-by-turn stays in sync ===
    if (newRoute.maneuvers && newRoute.maneuvers.length > 0) {
        currentRouteSteps = newRoute.maneuvers;
        console.log(`[Reroute] Maneuvers updated: ${currentRouteSteps.length} steps`);
    } else if (newRoute.legs && newRoute.legs[0] && newRoute.legs[0].maneuvers) {
        currentRouteSteps = newRoute.legs[0].maneuvers;
        console.log(`[Reroute] Maneuvers from legs updated: ${currentRouteSteps.length} steps`);
    }

    // Reset step tracking to the beginning of the new route
    currentStepIndex = 0;

    // Reset snap-to-route index so the vehicle snaps to the new polyline correctly
    lastSnappedRouteIndex = 0;
    lastTurnDetectRouteVertexIndex = 0;

    // Reset deviation tracking so we don't immediately re-trigger reroute
    deviationStartTimeCheck = null;
    rerouteAttemptCount = 0;

    // Refresh the turn instruction widget immediately with new route data
    if (currentLat && currentLon) {
        updateTurnWidgetFromPosition(currentLat, currentLon);
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
 * Initialize auto-traffic and auto-reroute toggles
 */
function initAutoTrafficRerouteToggles() {
    // Auto-traffic update toggle
    const trafficToggle = document.getElementById('autoTrafficUpdateToggle');
    if (trafficToggle) {
        trafficToggle.classList.toggle('active', autoTrafficUpdateEnabled);
        if (autoTrafficUpdateEnabled) {
            trafficToggle.style.background = '#4CAF50';
            trafficToggle.style.borderColor = '#4CAF50';
        }
    }

    // Auto-reroute on deviation toggle
    const rerouteToggle = document.getElementById('autoRerouteDeviationToggle');
    if (rerouteToggle) {
        rerouteToggle.classList.toggle('active', autoRerouteOnDeviationEnabled);
        if (autoRerouteOnDeviationEnabled) {
            rerouteToggle.style.background = '#4CAF50';
            rerouteToggle.style.borderColor = '#4CAF50';
        }
    }

    // Route traffic edge toggle
    const routeTrafficToggle = document.getElementById('routeTrafficToggle');
    if (routeTrafficToggle) {
        routeTrafficToggle.classList.toggle('active', routeTrafficEnabled);
        if (routeTrafficEnabled) {
            routeTrafficToggle.style.background = '#4CAF50';
            routeTrafficToggle.style.borderColor = '#4CAF50';
        } else {
            routeTrafficToggle.style.background = '#ddd';
            routeTrafficToggle.style.borderColor = '#999';
        }
    }
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
    container.innerHTML = '<p style="text-align: center; color: #666;">Loading CAZ zones...</p>';

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

        // Build HTML for CAZ zones
        let html = '';
        for (const zone of cazZonesData) {
            const passesHtml = zone.passes ? Object.entries(zone.passes).map(([type, price]) =>
                `<span style="display: inline-block; background: #e3f2fd; padding: 2px 6px; border-radius: 4px; margin: 2px; font-size: 11px;">${type}: £${price}</span>`
            ).join('') : '';

            const exemptionsHtml = zone.exemptions && zone.exemptions.length > 0 ?
                `<div style="margin-top: 5px; font-size: 11px; color: #4caf50;">✅ Exempt: ${zone.exemptions.join(', ')}</div>` : '';

            html += `
                <div style="border: 1px solid #ddd; border-radius: 8px; padding: 10px; margin-bottom: 10px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size: 14px;">${zone.name}</strong>
                        <span style="background: #ff5722; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">£${zone.daily_charge}/day</span>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        📍 ${zone.city} | ⏰ ${zone.operating_hours} | 📅 ${zone.operating_days}
                    </div>
                    ${passesHtml ? `<div style="margin-top: 8px;"><strong style="font-size: 11px;">Passes:</strong><br>${passesHtml}</div>` : ''}
                    ${exemptionsHtml}
                    ${zone.purchase_url ? `<a href="${zone.purchase_url}" target="_blank" style="display: inline-block; margin-top: 8px; font-size: 12px; color: #1976d2; text-decoration: none;">🔗 Buy Pass</a>` : ''}
                </div>
            `;
        }

        container.innerHTML = html || '<p style="text-align: center; color: #666;">No CAZ zones found</p>';
    } catch (error) {
        console.error('[CAZ] Error loading zones:', error);
        container.innerHTML = `<p style="text-align: center; color: #f44336;">Error: ${error.message}</p>`;
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

/** SVG icon: level crossing (rails + warning cross), matches hazard railway_crossing colours */
const RAILWAY_CROSSING_MAP_ICON_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="4" fill="#efebe9" stroke="#795548" stroke-width="2"/><path stroke="#424242" stroke-width="1.8" stroke-linecap="round" d="M5 9h14M5 15h14"/><path stroke="#c62828" stroke-width="2.2" stroke-linecap="round" d="M8 7l8 10M16 7l-8 10"/></svg>`;

/** Same vertical icon as route traffic lights (`traffic-lights.js`); fallback if module not loaded. */
function getOsmTrafficLightMarkerInnerSVG() {
    if (typeof TrafficLights !== 'undefined' && TrafficLights.createIconSVG) {
        return TrafficLights.createIconSVG('none', 14, 32);
    }
    return `<svg viewBox="0 0 16 36" width="14" height="32" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="display:block;flex-shrink:0;width:14px;height:32px"><rect x="1.5" y="0.5" width="13" height="35" rx="2" fill="#111827" stroke="#2e7d32" stroke-width="1.2"/><circle cx="8" cy="8.5" r="4.2" fill="#ef4444"/><circle cx="8" cy="18" r="4.2" fill="#f59e0b"/><circle cx="8" cy="27.5" r="4.2" fill="#22c55e"/></svg>`;
}

/** Green pill + vertical SVG (OSM layer, route hazard markers — not the horizontal 🚥 emoji). */
function getOsmTrafficLightMarkerPillHTML() {
    return `<div class="osm-traffic-light-pill" style="box-sizing:border-box;width:100%;height:100%;background:#e8f5e9;border:2px solid #2e7d32;border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${getOsmTrafficLightMarkerInnerSVG()}</div>`;
}

/**
 * Toggle show cameras on map
 */
function toggleShowCameras() {
    showCamerasEnabled = !showCamerasEnabled;
    localStorage.setItem('showCamerasEnabled', showCamerasEnabled);

    const toggle = document.getElementById('showCamerasToggle');
    if (toggle) {
        toggle.classList.toggle('active', showCamerasEnabled);
    }

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

    const styleMap = getHazardMarkerStyleMap();

    const seenLocations = new Set();

    cameras.forEach(camera => {
        const locationKey = `${camera.lat.toFixed(5)},${camera.lon.toFixed(5)}`;
        if (seenLocations.has(locationKey)) return;
        seenLocations.add(locationKey);

        const bucket = normalizeCameraHazardTypeForMarker(camera.bucket || camera.type);
        let config = styleMap[bucket] || styleMap.camera_speed;
        if (!config || !config.svg) {
            config = styleMap.camera_speed;
        }
        const svgForMarker = config.svg.replace('width="20"', 'width="24"').replace('height="20"', 'height="24"');
        const svgForPopup = config.svg.replace('width="20"', 'width="32"').replace('height="20"', 'height="32"');

        // Create custom HTML marker with MapLibre
        const marker = MapLibreHelpers.createMarker(camera.lat, camera.lon, {
            className: 'camera-marker',
            html: `<div style="
                background: ${config.bgColor};
                border: 2px solid ${config.color};
                border-radius: 4px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 10px rgba(0,0,0,0.4);
                cursor: pointer;
                transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            ">${svgForMarker}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popup: `
                <div style="text-align: center; min-width: 140px;">
                    <div style="margin-bottom: 8px; display: flex; justify-content: center;">${svgForPopup}</div>
                    <div style="font-weight: bold; color: ${config.color}; margin-bottom: 5px;">${config.label}</div>
                    ${camera.description ? `<div style="font-size: 11px; color: #666;">${camera.description}</div>` : ''}
                </div>
            `
        }).addTo(map);

        window.cameraMarkers.push(marker);
    });

    console.log(`[Cameras] Displayed ${window.cameraMarkers.length} camera markers`);
}

function toggleShowOsmTrafficLights() {
    showOsmTrafficLightsEnabled = !showOsmTrafficLightsEnabled;
    localStorage.setItem('showOsmTrafficLightsOnMap', showOsmTrafficLightsEnabled ? 'true' : 'false');
    const toggle = document.getElementById('showOsmTrafficLightsToggle');
    if (toggle) {
        toggle.classList.toggle('active', showOsmTrafficLightsEnabled);
        if (showOsmTrafficLightsEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
            toggle.style.color = 'white';
        } else {
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
            toggle.style.color = '#333';
        }
    }
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
    if (toggle) {
        toggle.classList.toggle('active', showOsmRailwayCrossingsEnabled);
        if (showOsmRailwayCrossingsEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
            toggle.style.color = 'white';
        } else {
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
            toggle.style.color = '#333';
        }
    }
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
    fetch(`/api/traffic-lights/area?north=${north}&south=${south}&east=${east}&west=${west}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.traffic_lights) {
                displayOsmTrafficLightMarkers(data.traffic_lights);
            }
        })
        .catch(err => console.error('[OSM Traffic Lights]', err));
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
    fetch(`/api/railway-crossings/area?north=${north}&south=${south}&east=${east}&west=${west}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.railway_crossings) {
                displayOsmRailwayCrossingMarkers(data.railway_crossings);
            }
        })
        .catch(err => console.error('[OSM Railway Crossings]', err));
}

function displayOsmTrafficLightMarkers(lights) {
    if (!lights || lights.length === 0) {
        clearOsmTrafficLightMarkers();
        return;
    }
    clearOsmTrafficLightMarkers();
    const seen = new Set();
    lights.forEach(light => {
        const key = `${Number(light.lat).toFixed(5)},${Number(light.lon).toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const pill = getOsmTrafficLightMarkerPillHTML();
        const popupPill = `<div style="width:26px;height:38px;margin:0 auto 6px;">${pill}</div>`;
        const marker = MapLibreHelpers.createMarker(light.lat, light.lon, {
            className: 'osm-traffic-light-marker',
            html: pill,
            iconSize: [26, 38],
            iconAnchor: [13, 19],
            popup: `<div style="text-align:center;font-size:12px;max-width:200px;">${popupPill}<strong>Traffic light</strong><div style="color:#666;margin-top:4px;">OpenStreetMap</div></div>`
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
    const seen = new Set();
    const popupHtml = `
        <div style="text-align:center;font-size:12px;max-width:220px;">
            <div style="margin-bottom:6px;display:flex;justify-content:center;">${RAILWAY_CROSSING_MAP_ICON_SVG}</div>
            <strong>Level crossing</strong>
            <div style="color:#666;margin-top:4px;">OpenStreetMap · <code style="font-size:10px;">railway=level_crossing</code></div>
        </div>`;
    crossings.forEach(cx => {
        const key = `${Number(cx.lat).toFixed(5)},${Number(cx.lon).toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const marker = MapLibreHelpers.createMarker(cx.lat, cx.lon, {
            className: 'osm-railway-crossing-marker',
            html: `<div style="background:#efebe9;border:2px solid #795548;border-radius:6px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${RAILWAY_CROSSING_MAP_ICON_SVG}</div>`,
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
    const toggle = document.getElementById('showCamerasToggle');
    if (toggle) {
        toggle.classList.toggle('active', showCamerasEnabled);
    }
    const osmTlToggle = document.getElementById('showOsmTrafficLightsToggle');
    if (osmTlToggle) {
        osmTlToggle.classList.toggle('active', showOsmTrafficLightsEnabled);
        if (showOsmTrafficLightsEnabled) {
            osmTlToggle.style.background = '#4CAF50';
            osmTlToggle.style.borderColor = '#4CAF50';
            osmTlToggle.style.color = 'white';
        } else {
            osmTlToggle.style.background = '#ddd';
            osmTlToggle.style.borderColor = '#999';
            osmTlToggle.style.color = '#333';
        }
    }
    const osmRxToggle = document.getElementById('showOsmRailwayCrossingsToggle');
    if (osmRxToggle) {
        osmRxToggle.classList.toggle('active', showOsmRailwayCrossingsEnabled);
        if (showOsmRailwayCrossingsEnabled) {
            osmRxToggle.style.background = '#4CAF50';
            osmRxToggle.style.borderColor = '#4CAF50';
            osmRxToggle.style.color = 'white';
        } else {
            osmRxToggle.style.background = '#ddd';
            osmRxToggle.style.borderColor = '#999';
            osmRxToggle.style.color = '#333';
        }
    }

    // Fetch cameras on map move (with debounce)
    map.on('moveend', () => {
        if (cameraFetchTimeout) {
            clearTimeout(cameraFetchTimeout);
        }
        cameraFetchTimeout = setTimeout(() => {
            fetchAndDisplayCameras();
            fetchAndDisplayOsmTrafficLights();
            fetchAndDisplayOsmRailwayCrossings();
        }, 500); // 500ms debounce
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
    if (toggle) {
        toggle.classList.toggle('active', roadLabelsEnabled);
        if (roadLabelsEnabled) {
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
        } else {
            toggle.style.background = '#ccc';
            toggle.style.borderColor = '#ccc';
        }
    }

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

    let activeRoute = (routeData.routes && routeData.routes.length > 0) ? routeData.routes[0] : routeData;
    if (routeData.routes && routeData.routes.length > 1 && window.lastCalculatedRoute) {
        const prevName = (window.lastCalculatedRoute.name || '').toLowerCase();
        if (prevName) {
            const match = routeData.routes.find(r => (r.name || '').toLowerCase() === prevName);
            if (match) activeRoute = match;
        }
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

    console.log('[Route Preview] Currency:', symbol, 'Distance Unit:', distUnit);

    // Update route preview information
    // Use distance_km from routes array if available, otherwise parse from distance string
    let distanceKm = 0;
    if (routeData.routes && routeData.routes.length > 0) {
        distanceKm = routeData.routes[0].distance_km || 0;
    } else if (routeData.distance_km) {
        distanceKm = routeData.distance_km;
    } else if (routeData.distance) {
        // Parse distance string like "1.31 km" to extract number
        distanceKm = parseFloat(routeData.distance) || 0;
    }

    // Store distance_km in data attribute for unit conversion updates
    const previewDistanceEl = document.getElementById('previewDistance');
    if (previewDistanceEl) {
        previewDistanceEl.dataset.km = distanceKm;
        previewDistanceEl.textContent = convertDistance(distanceKm) + ' ' + distUnit;
    }
    document.getElementById('previewDuration').textContent = (routeData.time || routeData.duration_minutes || 0) + ' min';

    // Build route description
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    document.getElementById('previewRoute').textContent = `${startInput} → ${endInput}`;

    // Update cost breakdown
    // NOTE: Costs are already calculated by backend based on actual distance in km
    // They should NOT be adjusted based on distance unit preference (km vs miles)
    // The distance unit is just for display - the actual cost is the same regardless
    // Get costs - check top-level first, then routes[0] fallback
    const primaryRoute = (routeData.routes && routeData.routes.length > 0) ? routeData.routes[0] : routeData;
    const fuelCost = parseFloat(routeData.fuel_cost || primaryRoute.fuel_cost || 0);
    const fuelLitres = parseFloat(routeData.fuel_litres || primaryRoute.fuel_litres || 0);
    const tollCost = parseFloat(routeData.toll_cost || primaryRoute.toll_cost || 0);
    const cazCost = parseFloat(routeData.caz_cost || primaryRoute.caz_cost || 0);
    const totalCost = fuelCost + tollCost + cazCost;

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
        const zonesCrossed = (cazDetails.zones_crossed && cazDetails.zones_crossed.length > 0);
        if (zonesCrossed) {
            let cazStatusHtml = '';
            if (cazDetails.is_exempt) {
                cazStatusHtml = `<div style="color: #4caf50; font-size: 12px;">✅ CAZ Exempt (${cazDetails.exemption_reason || 'Electric Vehicle'})</div>`;
            } else if (cazDetails.pass_covers) {
                cazStatusHtml = `<div style="color: #2196f3; font-size: 12px;">🎫 CAZ covered by ${cazDetails.pass_type || 'Pass'}</div>`;
            } else {
                const zoneNames = cazDetails.zones_crossed.join(', ');
                cazStatusHtml = `<div style="color: #ff9800; font-size: 12px;">⚠️ Passes through: ${zoneNames}</div>`;
            }
            cazStatusContainer.innerHTML = cazStatusHtml;
            cazStatusContainer.style.display = 'block';
        } else if (cazCost > 0) {
            cazStatusContainer.innerHTML = `<div style="color: #ff9800; font-size: 12px;">⚠️ CAZ charge included in total (${symbol}${cazCost.toFixed(2)}). Zone names unavailable for this route.</div>`;
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

    // Update hazard information
    const hazardCount = routeData.hazard_count || 0;
    const hazardPenaltySeconds = routeData.hazard_penalty_seconds || 0;
    const hazardContainer = document.getElementById('hazardInfoContainer');

    if (hazardCount > 0 && hazardPenaltySeconds > 0) {
        // Convert seconds to minutes
        const hazardPenaltyMinutes = Math.round(hazardPenaltySeconds / 60);
        document.getElementById('previewHazardCount').textContent = hazardCount;
        document.getElementById('previewHazardPenalty').textContent = hazardPenaltyMinutes + ' min';
        hazardContainer.style.display = 'block';
        console.log('[Hazards] Route preview hazards:', { count: hazardCount, penalty: hazardPenaltyMinutes + ' min' });
    } else {
        hazardContainer.style.display = 'none';
        console.log('[Hazards] No hazards detected for this route');
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

    routeOptions.forEach((route, index) => {
        const fuelCost = parseFloat(route.fuel_cost || 0);
        const tollCost = parseFloat(route.toll_cost || 0);
        const cazCost = parseFloat(route.caz_cost || 0);
        const totalCost = (fuelCost + tollCost + cazCost).toFixed(2);
        const routeColor = ROUTE_COLORS[index % ROUTE_COLORS.length];
        const routeName = route.name || `Route ${index + 1}`;
        const hazardCount = route.hazard_count || 0;
        const hazardColor = hazardCount === 0 ? '#4CAF50' : (hazardCount <= 2 ? '#FF9800' : '#F44336');
        const div = document.createElement('div');
        div.style.cssText = `background: white; padding: 10px; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid ${routeColor}; border: 2px solid #ddd; cursor: pointer; transition: all 0.3s ease;`;
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 12px; height: 12px; background: ${routeColor}; border-radius: 50%;"></span>
                    <strong style="color: #333;">${routeName}</strong>
                </div>
                <span style="background: ${hazardColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">📷 ${hazardCount}</span>
            </div>
            <div style="font-size: 12px; color: #666;">
                ⏱️ ${route.duration_minutes} min | 📏 ${convertDistance(route.distance_km)} ${distUnit} | ⛽ ${parseFloat(route.fuel_litres || 0).toFixed(1)} ${currentVehicleType === 'electric' ? 'kWh' : 'L'} | 💰 ${symbol}${totalCost}
            </div>
        `;
        div.onmouseover = () => { div.style.borderColor = routeColor; div.style.background = '#f0f4ff'; };
        div.onmouseout = () => { div.style.borderColor = '#ddd'; div.style.background = 'white'; };
        div.onclick = () => {
            selectedRouteIndex = index;
            displaySingleRoute(index);  // Show only the selected route on map
            useRoute(index);
            // Pass skipMapDisplay=true since displaySingleRoute already handled the map
            showRoutePreview(routeOptions[index], true);
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
        // Prepare routes data for comparison
        const routesForComparison = routeOptions.map(route => ({
            distance_km: route.distance_km || 0,
            duration_minutes: route.duration_minutes || 0,
            fuel_cost: route.fuel_cost || 0,
            toll_cost: route.toll_cost || 0,
            caz_cost: route.caz_cost || 0
        }));

        console.log('[RouteComparison] Sending routes to API:', routesForComparison);

        // Call comparison API
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

        // Create comparison table
        let comparisonHTML = '<div style="overflow-x: auto; margin: 10px 0;">';
        comparisonHTML += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
        comparisonHTML += '<thead><tr style="background: #667eea; color: white;">';
        comparisonHTML += '<th style="padding: 8px; text-align: left;">Route</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Distance</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Time</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Cost</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Cost/km</th>';
        comparisonHTML += '</tr></thead><tbody>';

        comparison.routes.forEach((route, idx) => {
            const bgColor = idx % 2 === 0 ? '#f9f9f9' : '#fff';
            comparisonHTML += `<tr style="background: ${bgColor}; border-bottom: 1px solid #ddd;">`;
            comparisonHTML += `<td style="padding: 8px;"><strong>Route ${route.route_id}</strong></td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;">${convertDistance(route.distance_km)} ${distUnit}</td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;">${Math.round(route.duration_minutes)} min</td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;"><strong>${symbol}${route.total_cost.toFixed(2)}</strong></td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;">${symbol}${route.cost_per_km.toFixed(2)}</td>`;
            comparisonHTML += '</tr>';
        });

        comparisonHTML += '</tbody></table></div>';

        // Add recommendations
        comparisonHTML += '<div style="margin-top: 15px; padding: 10px; background: #f0f4ff; border-radius: 6px;">';
        comparisonHTML += '<strong style="color: #667eea;">💡 Recommendations:</strong><br>';

        const rec = comparison.recommendations;
        comparisonHTML += `<div style="margin-top: 8px; font-size: 12px;">`;
        comparisonHTML += `<div style="margin-bottom: 6px;">💰 <strong>Cheapest:</strong> Route ${rec.cheapest.route_id} - ${rec.cheapest.reason}</div>`;
        comparisonHTML += `<div style="margin-bottom: 6px;">⚡ <strong>Fastest:</strong> Route ${rec.fastest.route_id} - ${rec.fastest.reason}</div>`;
        comparisonHTML += `<div>📍 <strong>Shortest:</strong> Route ${rec.shortest.route_id} - ${rec.shortest.reason}</div>`;
        comparisonHTML += '</div></div>';

        // Display in a modal or alert
        const modal = document.createElement('div');
        modal.id = 'routeComparisonModal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 12px; max-width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; color: #333;">Route Comparison</h3>
                    <button onclick="document.getElementById('routeComparisonModal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">×</button>
                </div>
                ${comparisonHTML}
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                    <button onclick="document.getElementById('routeComparisonModal').remove()" style="flex: 1; padding: 10px; background: #ddd; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Close</button>
                </div>
            </div>
        `;

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

            if (announcementsEnabled) {
                toggleButton.classList.add('active');
                toggleButton.style.background = '#4CAF50';
                toggleButton.style.borderColor = '#4CAF50';
            } else {
                toggleButton.classList.remove('active');
                toggleButton.style.background = '#ddd';
                toggleButton.style.borderColor = '#999';
            }

            TURN_ANNOUNCEMENT_DISTANCES.length = 0;
            TURN_ANNOUNCEMENT_DISTANCES.push(prefs.turnDistance1, prefs.turnDistance2, prefs.turnDistance3, 50);
            HAZARD_WARNING_DISTANCE = prefs.hazardDistance || 500;
            voiceAnnouncementsEnabled = announcementsEnabled;

            console.log('[Voice] Preferences loaded:', prefs);
        } else {
            // Initialize with defaults if no saved preferences
            const toggleButton = document.getElementById('voiceAnnouncementsEnabled');
            if (toggleButton) {
                toggleButton.classList.add('active');
                toggleButton.style.background = '#4CAF50';
                toggleButton.style.borderColor = '#4CAF50';
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
    if (enabled) {
        toggle.classList.add('active');
        toggle.style.background = '#4CAF50';
        toggle.style.borderColor = '#4CAF50';
        toggle.style.color = 'white';
    } else {
        toggle.classList.remove('active');
        toggle.style.background = '#ddd';
        toggle.style.borderColor = '#999';
        toggle.style.color = '#333';
    }
}

function togglePorcupineWakeWord() {
    const button = document.getElementById('porcupineWakeToggle');
    if (!button || !picovoiceClientConfigured()) {
        return;
    }
    button.classList.toggle('active');
    const enabled = button.classList.contains('active');
    if (enabled) {
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }
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

    // Update visual state
    if (enabled) {
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }

    // Save to localStorage
    localStorage.setItem('voiceAnnouncementsEnabled', enabled ? 'true' : 'false');

    // FIXED: Update the new boolean flag instead of voiceRecognition object
    voiceAnnouncementsEnabled = enabled;
    saveVoicePreferences();
    showStatus(enabled ? '🔊 Voice announcements enabled' : '🔇 Voice announcements disabled', 'success');
    saveAllSettings();
}

async function findParkingNearDestination() {
    console.log('[Parking] findParkingNearDestination called');
    console.log('[Parking] lastCalculatedRoute:', window.lastCalculatedRoute);

    if (!window.lastCalculatedRoute) {
        console.error('[Parking] No route calculated');
        showStatus('No route calculated yet', 'error');
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
        // Get destination coordinates from last route
        let endCoords = null;

        // Try multiple ways to get destination coordinates
        if (window.lastCalculatedRoute.end_lat && window.lastCalculatedRoute.end_lon) {
            // Method 1: Direct lat/lon properties
            endCoords = {
                lat: window.lastCalculatedRoute.end_lat,
                lon: window.lastCalculatedRoute.end_lon
            };
            console.log('[Parking] Method 1: Got coords from end_lat/end_lon');
        } else if (window.lastCalculatedRoute.destination) {
            // Method 2: Parse from destination string "lat,lon"
            const parts = window.lastCalculatedRoute.destination.split(',');
            if (parts.length === 2) {
                endCoords = {
                    lat: parseFloat(parts[0]),
                    lon: parseFloat(parts[1])
                };
                console.log('[Parking] Method 2: Got coords from destination string');
            }
        } else if (window.lastCalculatedRoute.routes && window.lastCalculatedRoute.routes[0]) {
            // Method 3: Get from first route's end coordinates
            const route = window.lastCalculatedRoute.routes[0];
            if (route.end_lat && route.end_lon) {
                endCoords = {
                    lat: route.end_lat,
                    lon: route.end_lon
                };
                console.log('[Parking] Method 3: Got coords from routes[0]');
            }
        } else if (window.lastCalculatedRoute.polyline && window.lastCalculatedRoute.polyline.length > 0) {
            // Method 4: Get last point from polyline (destination)
            const lastPoint = window.lastCalculatedRoute.polyline[window.lastCalculatedRoute.polyline.length - 1];
            console.log('[Parking] Method 4: Last polyline point:', lastPoint);

            // Handle both {lat, lon} and [lat, lon] formats
            if (lastPoint.lat !== undefined && lastPoint.lon !== undefined) {
                endCoords = {
                    lat: lastPoint.lat,
                    lon: lastPoint.lon
                };
            } else if (Array.isArray(lastPoint) && lastPoint.length >= 2) {
                endCoords = {
                    lat: lastPoint[0],
                    lon: lastPoint[1]
                };
            } else if (lastPoint[0] !== undefined && lastPoint[1] !== undefined) {
                endCoords = {
                    lat: lastPoint[0],
                    lon: lastPoint[1]
                };
            }

            if (endCoords) {
                console.log('[Parking] Method 4: Got coords from last polyline point');
            }
        } else {
            // Method 5: Geocode the destination input field
            console.log('[Parking] Method 5: Attempting to geocode destination input');
            const geocoded = await geocodeLocations('', endInput);
            if (geocoded && geocoded.end) {
                const parts = geocoded.end.split(',');
                if (parts.length === 2) {
                    endCoords = {
                        lat: parseFloat(parts[0]),
                        lon: parseFloat(parts[1])
                    };
                    console.log('[Parking] Method 5: Got coords from geocoding');
                }
            }
        }

        console.log('[Parking] End coordinates:', endCoords);

        if (!endCoords || isNaN(endCoords.lat) || isNaN(endCoords.lon)) {
            console.error('[Parking] Could not determine destination coordinates');
            console.error('[Parking] lastCalculatedRoute:', window.lastCalculatedRoute);
            showStatus('Could not determine destination coordinates', 'error');
            return;
        }

        // Get parking preferences
        const maxWalkingDist = parseInt(document.getElementById('parkingMaxWalkingDistance').value) || 10;
        const radiusMeters = maxWalkingDist * 80; // Approximate: 1 min walk ≈ 80m

        // Search for parking
        const searchParams = {
            lat: endCoords.lat,
            lon: endCoords.lon,
            radius: radiusMeters,
            type: document.getElementById('parkingPreferredType').value,
            price: document.getElementById('parkingPricePreference').value
        };

        console.log('[Parking] Search parameters:', searchParams);

        const response = await fetch('/api/parking-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchParams)
        });

        console.log('[Parking] Response status:', response.status);
        const data = await response.json();
        console.log('[Parking] Response data:', data);

        if (!data.success) {
            console.error('[Parking] API returned success=false:', data.error);
            showStatus('Parking search failed: ' + (data.error || 'Unknown error'), 'error');
            return;
        }

        if (!data.parking || data.parking.length === 0) {
            console.warn('[Parking] No parking found in response');
            showStatus('No parking found nearby. Try adjusting your search radius or price filter.', 'warning');
            return;
        }

        console.log('[Parking] Found', data.parking.length, 'parking options');

        // Display parking options
        displayParkingOptions(data.parking, endCoords);
        showStatus(`✅ Found ${data.parking.length} parking options`, 'success');

        // Switch to route preview tab to show parking options
        console.log('[Parking] Switching to route preview to show parking options');
        switchTab('routePreview');

    } catch (error) {
        console.error('[Parking] Error:', error);
        showStatus('Error searching for parking: ' + error.message, 'error');
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
    parkingList.slice(0, 5).forEach((parking, index) => {
        // Convert distance to display units
        const parkingDisplayDist = convertDistance(parking.distance_m / 1000); // Convert m to km first
        const parkingDistUnit = getDistanceUnit();

        // Add marker to map with MapLibre
        const marker = MapLibreHelpers.createMarker(parking.lat, parking.lon, {
            html: `<div style="background: #FF9800; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🅿️</div>`,
            iconSize: [32, 32],
            className: 'parking-marker',
            popup: `<strong>${parking.name}</strong><br>Distance: ${parkingDisplayDist} ${parkingDistUnit}`
        }).addTo(map);

        marker.parkingData = parking;
        marker.on('click', () => selectParking(parking, destinationCoords));
        parkingMarkers.push(marker);

        // Add to list
        const walkingTime = Math.round(parking.distance_m / 1.4); // 1.4 m/s walking speed
        const walkingMinutes = Math.round(walkingTime / 60);

        const item = document.createElement('div');
        item.style.cssText = 'background: white; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #ddd; cursor: pointer; transition: all 0.2s;';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                <strong style="font-size: 13px;">${parking.name}</strong>
                <span style="background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold;">${index + 1}</span>
            </div>
            <div style="font-size: 12px; color: #666;">
                📍 ${parkingDisplayDist} ${parkingDistUnit} away
                <br>🚶 ${walkingMinutes} min walk
            </div>
            <div style="display: flex; gap: 6px; margin-top: 8px;">
                <button onclick="event.stopPropagation(); selectParking(${JSON.stringify(parking).replace(/"/g, '&quot;')}, ${JSON.stringify(destinationCoords).replace(/"/g, '&quot;')})"
                        style="flex: 1; background: #2196F3; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                    🗺️ Show Route
                </button>
                <button onclick="event.stopPropagation(); setParkingAsDestination(${JSON.stringify(parking).replace(/"/g, '&quot;')})"
                        style="flex: 1; background: #4CAF50; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                    📍 Set as Destination
                </button>
            </div>
        `;

        item.onmouseover = () => item.style.background = '#FFF3E0';
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
        const enableHazardAvoidanceParking =
            localStorage.getItem('pref_cameras') !== 'false' ||
            localStorage.getItem('pref_trafficLightsAvoid') !== 'false' ||
            localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false' ||
            localStorage.getItem('pref_police') === 'true' ||
            localStorage.getItem('pref_roadworks') === 'true' ||
            localStorage.getItem('pref_accidents') === 'true';

        const drivingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: `${startCoords.lat},${startCoords.lon}`,
                end: `${parking.lat},${parking.lon}`,
                routing_mode: 'auto',
                vehicle_type: currentVehicleType,
                include_tolls: localStorage.getItem('includeTolls') !== 'false',  // Default: true (separate from avoidance)
                avoid_tolls: isAvoidTollsEnabled(),
                avoid_caz: localStorage.getItem('pref_caz') !== 'false',        // Default: true
                enable_hazard_avoidance: enableHazardAvoidanceParking,
                avoid_cameras: localStorage.getItem('pref_cameras') !== 'false',
                avoid_traffic_lights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
                avoid_railway_crossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false'
            })
        });

        const drivingData = await drivingResponse.json();
        if (!drivingData.success) {
            showStatus('Error calculating driving route', 'error');
            return;
        }

        // Calculate walking route from parking to destination
        const enableHazardAvoidanceWalking =
            localStorage.getItem('pref_cameras') !== 'false' ||
            localStorage.getItem('pref_trafficLightsAvoid') !== 'false' ||
            localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false' ||
            localStorage.getItem('pref_police') === 'true' ||
            localStorage.getItem('pref_roadworks') === 'true' ||
            localStorage.getItem('pref_accidents') === 'true';

        const walkingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: `${parking.lat},${parking.lon}`,
                end: `${destinationCoords.lat},${destinationCoords.lon}`,
                routing_mode: 'pedestrian',
                vehicle_type: 'pedestrian',
                enable_hazard_avoidance: enableHazardAvoidanceWalking,
                avoid_cameras: localStorage.getItem('pref_cameras') !== 'false',
                avoid_traffic_lights: localStorage.getItem('pref_trafficLightsAvoid') !== 'false',
                avoid_railway_crossings: localStorage.getItem('pref_railwayCrossingsAvoid') !== 'false'
            })
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
    const drivingDist = drivingData.distance_km || 0;
    const drivingTime = drivingData.duration_minutes || 0;
    const walkingDist = walkingData.distance_km || 0;
    const walkingTime = walkingData.duration_minutes || 0;
    const totalDist = drivingDist + walkingDist;
    const totalTime = drivingTime + walkingTime;

    const distUnit = getDistanceUnit();
    const convertedDist = convertDistance(totalDist);

    // Update preview info
    document.getElementById('previewDistance').textContent = convertedDist + ' ' + distUnit;
    document.getElementById('previewDuration').textContent = Math.round(totalTime) + ' min';
    document.getElementById('previewRoute').textContent = `${document.getElementById('start').value} → 🅿️ ${parking.name} → ${document.getElementById('end').value}`;

    // Show breakdown with proper unit conversion
    const drivingDisplayDist = convertDistance(drivingDist);
    const walkingDisplayDist = convertDistance(walkingDist);
    const breakdown = `
        <div style="font-size: 12px; line-height: 1.6; color: #333;">
            <div style="margin-bottom: 8px;">
                <strong>🚗 Driving:</strong> ${drivingDisplayDist} ${distUnit} / ${Math.round(drivingTime)} min
            </div>
            <div>
                <strong>🚶 Walking:</strong> ${walkingDisplayDist} ${distUnit} / ${Math.round(walkingTime)} min
            </div>
        </div>
    `;
    document.getElementById('previewRoute').innerHTML = `${document.getElementById('start').value} → 🅿️ ${parking.name} → ${document.getElementById('end').value}` + breakdown;
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
 * Fill destination autocomplete with recent (local) + server search history when query is short.
 * @param {HTMLElement} dropdown - #autocompleteEnd
 */
async function renderEndDestinationSuggestions(dropdown) {
    if (!dropdown) return;

    const recent = loadRecentDestinations();
    dropdown.innerHTML = '';

    const appendSectionTitle = (text) => {
        const title = document.createElement('div');
        title.className = 'autocomplete-section-title';
        title.textContent = text;
        title.style.cssText = 'padding:10px 14px 6px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;';
        dropdown.appendChild(title);
    };

    if (recent.length) {
        appendSectionTitle('Recent destinations');
        recent.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            const kindLabel = item.kind === 'route' ? 'Used in a route' : 'Recent search';
            const labelEsc = escapeHtml(item.label);
            div.innerHTML = `<div class="autocomplete-item-icon">🕐</div><div class="autocomplete-item-text"><div class="autocomplete-item-name">${labelEsc}</div><div class="autocomplete-item-address">${kindLabel}</div></div>`;
            div.onclick = () => selectAutocompleteResult('end', item.lat, item.lon, item.label);
            dropdown.appendChild(div);
        });
    }

    let serverCount = 0;
    try {
        const { res, data } = await fetchJsonWithAuth('/api/search-history');
        if (res.status !== 401 && data.success && data.history && data.history.length > 0) {
            appendSectionTitle('Saved searches');
            data.history.forEach((item) => {
                const lat = item.lat != null ? parseFloat(item.lat) : NaN;
                const lon = item.lon != null ? parseFloat(item.lon) : NaN;
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                const primary = escapeHtml(item.query || '');
                const meta = escapeHtml(item.result_name || '');
                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                    div.innerHTML = `<div class="autocomplete-item-icon">🔎</div><div class="autocomplete-item-text"><div class="autocomplete-item-name">${primary}</div>${meta ? `<div class="autocomplete-item-address">${meta}</div>` : ''}</div>`;
                    div.onclick = () => selectAutocompleteResult('end', lat, lon, item.result_name || item.query);
                } else {
                    div.innerHTML = `<div class="autocomplete-item-icon">🔎</div><div class="autocomplete-item-text"><div class="autocomplete-item-name">${primary}</div></div>`;
                    div.onclick = () => {
                        const endInput = document.getElementById('end');
                        if (endInput) endInput.value = item.query || '';
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
        dropdown.innerHTML = '<div class="autocomplete-no-results">Type at least 2 letters to search. Recent destinations appear here after you select places or calculate a route.</div>';
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
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
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
                data.favorites.forEach(fav => {
                    const container = document.createElement('div');
                    container.className = 'favorite-item';
                    container.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';

                    // Main button to use favorite as destination
                    const btn = document.createElement('button');
                    btn.className = 'favorite-btn';
                    btn.style.cssText = 'flex: 1; text-align: left;';
                    const favNameEsc = escapeHtml(fav.name);
                    const favCatEsc = escapeHtml(fav.category);
                    btn.innerHTML = `
                        <span class="favorite-btn-name">${favNameEsc}</span>
                        <span class="favorite-btn-category">${favCatEsc}</span>
                    `;
                    btn.onclick = () => {
                        document.getElementById('end').value = fav.name;
                        document.getElementById('end').dataset.lat = fav.lat;
                        document.getElementById('end').dataset.lon = fav.lon;
                        document.getElementById('end').dataset.displayName = fav.name;
                        addToSearchHistory(fav.name, fav.name, fav.lat, fav.lon);
                        expandBottomSheet();
                        showStatus(`📍 Destination set to ${fav.name}`, 'success');
                    };

                    // Edit button
                    const editBtn = document.createElement('button');
                    editBtn.innerHTML = '✏️';
                    editBtn.title = 'Edit';
                    editBtn.style.cssText = 'width: 36px; height: 36px; border: none; border-radius: 50%; background: #667eea; color: white; cursor: pointer; font-size: 16px;';
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        editFavorite(fav);
                    };

                    // Delete button
                    const delBtn = document.createElement('button');
                    delBtn.innerHTML = '🗑️';
                    delBtn.title = 'Delete';
                    delBtn.style.cssText = 'width: 36px; height: 36px; border: none; border-radius: 50%; background: #F44336; color: white; cursor: pointer; font-size: 16px;';
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

    fetch(`/api/lane-guidance?lat=${lat}&lon=${lon}&heading=${heading}&maneuver=${maneuver}&distance=${distToManeuver}&road_type=${roadType}&roundabout_exit_count=${roundaboutExitCount}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderLaneGuidanceUI(data);
            }
        })
        .catch(error => {
            console.error('[Lane Guidance] Error:', error);
            if (_voyagrIsOffline || !navigator.onLine) {
                _offlineLaneGuidanceFallback(maneuver, distToManeuver, roundaboutExitCount);
            }
        });
}

function _offlineLaneGuidanceFallback(maneuver, distance, exitCount) {
    const totalLanes = 2;
    let lane = 1;
    if (maneuver === 'roundabout' && exitCount > 0) {
        lane = exitCount >= 3 ? totalLanes : 1;
    } else if (['right','slight_right','sharp_right','exit_right','exit'].includes(maneuver)) {
        lane = totalLanes;
    }
    const lanePos = lane === 1 ? 'left' : 'right';
    let urgency = 'none', urgencyText = '';
    if (distance <= 100) { urgency = 'now'; urgencyText = `Get in the ${lanePos} lane now!`; }
    else if (distance <= 300) { urgency = 'soon'; urgencyText = `Move to the ${lanePos} lane`; }
    else if (distance <= 800) { urgency = 'ahead'; urgencyText = `Prepare to use the ${lanePos} lane`; }
    let guidanceText = `Use the ${lanePos} lane`;
    if (maneuver === 'roundabout' && exitCount > 0) {
        guidanceText = `Use the ${lanePos} lane, take the ${_ordinal(exitCount)} exit`;
    }
    renderLaneGuidanceUI({
        success: true, total_lanes: totalLanes, recommended_lane: lane,
        lane_arrows: [{directions:['through'],arrow:'↑',primary:'through'},{directions:['through'],arrow:'↑',primary:'through'}],
        lane_change_needed: urgency !== 'none', next_maneuver: maneuver,
        distance_to_maneuver: distance, urgency, urgency_text: urgencyText,
        guidance_text: guidanceText, road_name: '', highway_type: 'unknown',
        has_osm_data: false, has_turn_lanes: false, roundabout_exit_count: exitCount
    });
}

function _ordinal(n) {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderLaneGuidanceUI(data) {
    const display = document.getElementById('laneGuidanceDisplay');
    const visual = document.getElementById('laneVisual');
    const text = document.getElementById('laneGuidanceText');

    if (!display || !visual || !text) return;

    // Don't show lane guidance for single-lane roads or when no maneuver is approaching
    if (data.total_lanes <= 1 || data.urgency === 'none') {
        display.classList.remove('show');
        return;
    }

    // Build lane visual with direction arrows
    visual.innerHTML = '';
    const laneArrows = data.lane_arrows || [];

    for (let i = 0; i < data.total_lanes; i++) {
        const lane = document.createElement('div');
        lane.className = 'lane-indicator';
        const laneNum = i + 1;

        // Highlight recommended lane
        if (laneNum === data.recommended_lane) {
            lane.classList.add('recommended');
        }

        // Show arrow direction for each lane
        const arrowInfo = laneArrows[i];
        if (arrowInfo) {
            lane.innerHTML = `<span class="lane-arrow">${arrowInfo.arrow}</span>`;
            // Mark lanes that match the maneuver direction
            if (arrowInfo.directions && data.has_turn_lanes) {
                lane.classList.add('has-direction');
            }
        } else {
            lane.innerHTML = `<span class="lane-arrow">↑</span>`;
        }

        visual.appendChild(lane);
    }

    // Set urgency styling
    display.className = 'lane-guidance-display show';
    if (data.urgency === 'now') {
        display.classList.add('urgency-now');
    } else if (data.urgency === 'soon') {
        display.classList.add('urgency-soon');
    } else if (data.urgency === 'ahead') {
        display.classList.add('urgency-ahead');
    }

    // Build guidance text with distance context
    let displayText = data.guidance_text || '';
    if (data.urgency_text && data.urgency !== 'none' && data.urgency !== 'info') {
        displayText = data.urgency_text;
    }
    text.textContent = displayText;

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

// ===== PHASE 2 FEATURES: SPEED WARNINGS =====

// Speed widget variables - default to enabled for safety awareness
let speedWidgetEnabled = localStorage.getItem('speedWidgetEnabled') !== 'false';  // Default true
let currentSpeedMph = 0;
let currentSpeedLimitMph = 0;
let speedLimitThreshold = 3; // mph over limit to trigger warning
/** Min time between spoken speed-limit warnings while still exceeding (avoids GPS spam). */
const SPEED_WIDGET_VIOLATION_SPEAK_COOLDOWN_MS = 14000;
let _speedWidgetLastViolationSpeakAt = 0;
/** Lazily created Web Audio context for speed-alert chime (shared, reused). */
let _speedViolationAudioCtx = null;

/**
 * Short two-tone chime when exceeding speed limit (runs even if voice TTS is off).
 */
function playSpeedViolationChime() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!_speedViolationAudioCtx || _speedViolationAudioCtx.state === 'closed') {
            _speedViolationAudioCtx = new AC();
        }
        const ctx = _speedViolationAudioCtx;
        const run = () => {
            const t0 = ctx.currentTime;
            const tones = [880, 660];
            tones.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                const offset = i * 0.09;
                osc.frequency.setValueAtTime(freq, t0 + offset);
                g.gain.setValueAtTime(0.0001, t0 + offset);
                g.gain.linearRampToValueAtTime(0.14, t0 + offset + 0.015);
                g.gain.linearRampToValueAtTime(0.0001, t0 + offset + 0.075);
                osc.connect(g);
                g.connect(ctx.destination);
                osc.start(t0 + offset);
                osc.stop(t0 + offset + 0.085);
            });
        };
        if (ctx.state === 'suspended') {
            ctx.resume().then(run).catch(() => {});
        } else {
            run();
        }
    } catch (_e) {
        /* autoplay / unsupported — ignore */
    }
}

/**
 * Chime + optional speech when the speed widget shows exceeding (shared cooldown).
 * Chime plays whenever we alert; TTS only if voice announcements are enabled.
 * Speech uses high priority so minimal/important voice modes still allow safety warnings.
 */
function maybeAlertSpeedLimitViolation(speedDiffMph) {
    const now = Date.now();
    if (now - _speedWidgetLastViolationSpeakAt < SPEED_WIDGET_VIOLATION_SPEAK_COOLDOWN_MS) {
        return;
    }
    _speedWidgetLastViolationSpeakAt = now;
    playSpeedViolationChime();

    if (typeof voiceAnnouncementsEnabled === 'undefined' || !voiceAnnouncementsEnabled) {
        return;
    }
    const unit = getSpeedUnit();
    const diffDisplay = speedUnit === 'mph'
        ? Math.round(speedDiffMph)
        : Math.round(speedDiffMph * 1.60934);
    speakMessage(`Warning: you are over the speed limit by ${diffDisplay} ${unit}`, 'high');
}

// GPS speed tracking (FIX: Global variable to store current GPS speed)
let currentGpsSpeedMph = 0;
let currentGpsSpeedKmh = 0;

// Speed limit API throttling (FIX: Prevent API spam while remaining responsive)
let lastSpeedLimitFetch = 0;
let lastSpeedLimitPosition = null;
const SPEED_LIMIT_FETCH_INTERVAL = 4000;   // 4 seconds (was 10s – too sluggish on road changes)
const SPEED_LIMIT_DISTANCE_THRESHOLD = 50;  // 50 meters (was 100m – react faster to new roads)

// Speed limit API error handling
let speedLimitRetryCount = 0;
const SPEED_LIMIT_MAX_RETRIES = 3;
let speedLimitRetryTimeout = null;
/**
 * updateSpeedWidget function
 * @function updateSpeedWidget
 * @param {number} currentSpeedInMph - Current GPS speed in MPH (always MPH internally)
 * @param {number|null} speedLimitInMph - Speed limit in MPH (from API, can be null)
 * @returns {void}
 */
function updateSpeedWidget(currentSpeedInMph, speedLimitInMph = null) {
    const widget = document.getElementById('speedWidget');
    if (!widget) return;

    // Store in global variable for other functions to access
    currentGpsSpeedMph = currentSpeedInMph;
    currentGpsSpeedKmh = currentSpeedInMph * 1.60934;

    // Get user's preferred unit using global speedUnit variable
    const displaySpeedUnit = getSpeedUnit();

    // Convert from MPH to user's preferred unit
    // currentSpeedInMph is always in mph internally, convert for display
    let displaySpeed;
    if (speedUnit === 'mph') {
        displaySpeed = currentSpeedInMph;
    } else {
        // Convert mph to km/h
        displaySpeed = currentSpeedInMph * 1.60934;
    }

    // Update current speed display
    document.getElementById('speedValue').textContent = Math.round(displaySpeed);
    document.getElementById('speedUnitDisplay').textContent = displaySpeedUnit;

    // Update speed limit if provided
    if (speedLimitInMph !== null && speedLimitInMph > 0) {
        // Store in global variable
        currentSpeedLimitMph = speedLimitInMph;

        let displaySpeedLimit;
        if (speedUnit === 'mph') {
            displaySpeedLimit = speedLimitInMph;
        } else {
            // Convert mph to km/h
            displaySpeedLimit = speedLimitInMph * 1.60934;
        }
        document.getElementById('speedLimitValue').textContent = Math.round(displaySpeedLimit);
        document.getElementById('speedLimitUnit').textContent = displaySpeedUnit;

        // Check if speeding (compare in same units - mph)
        const speedDiff = currentSpeedInMph - speedLimitInMph;
        const warningElement = document.getElementById('speedWarning');
        if (speedDiff > speedLimitThreshold) {
            warningElement.style.display = 'block';
            widget.style.borderLeft = '4px solid #FF5722';
            maybeAlertSpeedLimitViolation(speedDiff);
        } else {
            warningElement.style.display = 'none';
            widget.style.borderLeft = '4px solid #4CAF50';
            _speedWidgetLastViolationSpeakAt = 0;
        }
    } else {
        // No speed limit data available - show '?' instead of '--'
        document.getElementById('speedLimitValue').textContent = '?';
        document.getElementById('speedLimitUnit').textContent = displaySpeedUnit;
        document.getElementById('speedWarning').style.display = 'none';
        widget.style.borderLeft = '4px solid #999';
        _speedWidgetLastViolationSpeakAt = 0;
        console.log('[Speed Widget] No speed limit available');
    }

    // Use consolidated visibility function
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
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

/**
 * Fetch speed limit with throttling and retry logic
 * @param {number} lat - Current latitude
 * @param {number} lon - Current longitude
 * @param {number} currentSpeedMph - Current GPS speed in mph
 * @param {string} roadType - Type of road (residential, motorway, etc.)
 * @param {number} retryAttempt - Current retry attempt (for exponential backoff)
 * @returns {void}
 */
function fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType = 'residential', retryAttempt = 0, valhallaSpeedLimit = null) {
    const now = Date.now();
    const timeSinceLastFetch = lastSpeedLimitFetch ? (now - lastSpeedLimitFetch) : 0;

    // Calculate distance moved since last fetch
    let distanceMoved = 999; // Default to large value to trigger first fetch
    if (lastSpeedLimitPosition) {
        distanceMoved = calculateDistanceMeters(
            lat, lon,
            lastSpeedLimitPosition.lat,
            lastSpeedLimitPosition.lon
        );
    }

    // Only fetch if enough time has passed OR moved significant distance
    if (timeSinceLastFetch > SPEED_LIMIT_FETCH_INTERVAL || distanceMoved > SPEED_LIMIT_DISTANCE_THRESHOLD) {
        console.log(`[Speed Limit] Fetching (time: ${timeSinceLastFetch}ms, distance: ${distanceMoved.toFixed(0)}m, attempt: ${retryAttempt + 1})`);

        const vslParam = valhallaSpeedLimit ? `&valhalla_speed_limit=${valhallaSpeedLimit}` : '';
        fetch(`/api/speed-limit?lat=${lat}&lon=${lon}&road_type=${roadType}${vslParam}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success && data.data) {
                    const speedLimitMph = data.data.speed_limit_mph || data.data.speed_limit;
                    console.log('[Speed Limit] API response:', data.data, 'Extracted limit:', speedLimitMph);

                    if (speedLimitMph && speedLimitMph > 0) {
                        currentSpeedLimitMph = speedLimitMph;
                        cacheSpeedLimit(lat, lon, speedLimitMph, data.data.source || 'api');
                    } else {
                        // Clear stale posted limit when the detector says "unknown" for this cell,
                        // so the widget can fall back to Valhalla edge speed or "?".
                        currentSpeedLimitMph = null;
                    }

                    const edge = valhallaSpeedLimit && valhallaSpeedLimit > 0 ? valhallaSpeedLimit : null;
                    const displayLimit = (speedLimitMph && speedLimitMph > 0)
                        ? speedLimitMph
                        : edge;
                    updateSpeedWidget(currentGpsSpeedMph, displayLimit);

                    lastSpeedLimitFetch = now;
                    lastSpeedLimitPosition = { lat, lon };

                    speedLimitRetryCount = 0;
                } else {
                    console.warn('[Speed Limit] No data in response:', data);
                }
            })
            .catch(async (err) => {
                console.error('[Speed Limit] API error:', err);

                if (_voyagrIsOffline || !navigator.onLine) {
                    const cached = await getCachedSpeedLimit(lat, lon);
                    if (cached) {
                        currentSpeedLimitMph = cached.speedLimit;
                        updateSpeedWidget(currentGpsSpeedMph, cached.speedLimit);
                        console.log(`[Speed Limit] Offline fallback: ${cached.speedLimit} mph (${cached.source})`);
                        lastSpeedLimitFetch = now;
                        lastSpeedLimitPosition = { lat, lon };
                        return;
                    }
                    if (valhallaSpeedLimit && valhallaSpeedLimit > 0) {
                        currentSpeedLimitMph = valhallaSpeedLimit;
                        updateSpeedWidget(currentGpsSpeedMph, valhallaSpeedLimit);
                        console.log(`[Speed Limit] Offline Valhalla fallback: ${valhallaSpeedLimit} mph`);
                        lastSpeedLimitFetch = now;
                        lastSpeedLimitPosition = { lat, lon };
                        return;
                    }
                }

                // Implement exponential backoff retry
                if (retryAttempt < SPEED_LIMIT_MAX_RETRIES) {
                    const backoffDelay = Math.pow(2, retryAttempt) * 1000; // 1s, 2s, 4s
                    console.log(`[Speed Limit] Retrying in ${backoffDelay}ms (attempt ${retryAttempt + 1}/${SPEED_LIMIT_MAX_RETRIES})`);

                    // Clear any existing retry timeout
                    if (speedLimitRetryTimeout) {
                        clearTimeout(speedLimitRetryTimeout);
                    }

                    // Schedule retry with exponential backoff
                    speedLimitRetryTimeout = setTimeout(() => {
                        fetchSpeedLimitThrottled(lat, lon, currentSpeedMph, roadType, retryAttempt + 1, valhallaSpeedLimit);
                    }, backoffDelay);
                } else {
                    console.error('[Speed Limit] Max retries reached, giving up');
                    speedLimitRetryCount = 0;
                }
            });
    }
    // NOTE: GPS speed display is now updated on every GPS tick in the main callback,
    // so we no longer need to update it in the throttle "else" branch.
}

/**
 * Get current road type from route data or default to safe value
 * @returns {string} Road type (residential, motorway, primary, etc.)
 */
function getCurrentRoadType() {
    // Try to get road type from current route step
    if (currentRouteSteps && currentStepIndex >= 0 && currentStepIndex < currentRouteSteps.length) {
        const currentStep = currentRouteSteps[currentStepIndex];

        // Check for road_class or highway type in step data
        if (currentStep.road_class) {
            return currentStep.road_class;
        }

        // Infer from instruction text (fallback)
        const instruction = (currentStep.instruction || '').toLowerCase();
        if (instruction.includes('motorway') || instruction.includes('m1') || instruction.includes('m25')) {
            return 'motorway';
        } else if (instruction.includes('a-road') || instruction.includes('a road')) {
            return 'primary';
        } else if (instruction.includes('b-road') || instruction.includes('b road')) {
            return 'secondary';
        }
    }

    // Safe default: residential (30 mph in UK) instead of motorway (70 mph)
    return 'residential';
}

/**
 * toggleSpeedWidget function
 * @function toggleSpeedWidget
 * @returns {*} Return value description
 */
function toggleSpeedWidget() {
    speedWidgetEnabled = !speedWidgetEnabled;
    const widget = document.getElementById('speedWidget');
    if (speedWidgetEnabled && isTrackingActive) {
        widget.style.display = 'block';
    } else {
        widget.style.display = 'none';
    }
    localStorage.setItem('speedWidgetEnabled', speedWidgetEnabled);
}

/**
 * toggleZoomAndFollow function
 * @function toggleZoomAndFollow
 * @returns {*} Return value description
 */
function toggleZoomAndFollow() {
    zoomAndFollowEnabled = !zoomAndFollowEnabled;
    const btn = document.getElementById('zoomFollowToggle');
    if (btn) {
        btn.classList.toggle('active', zoomAndFollowEnabled);
        // Update visual feedback - change color and icon based on state
        if (zoomAndFollowEnabled) {
            btn.style.background = '#FF9800';  // Orange when enabled
            btn.innerHTML = '📍';
        } else {
            btn.style.background = '#9E9E9E';  // Gray when disabled
            btn.innerHTML = '🔓';  // Unlocked icon when free panning
        }
    }
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
        if (btn) {
            btn.style.background = '#4CAF50';
            btn.innerHTML = '📍';
            btn.title = 'Return to Navigation View';
        }
        showStatus('🗺️ Journey Overview - Tap again to return', 'info');
        console.log('[Navigation] Journey overview activated');
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

        if (btn) {
            btn.style.background = '#9C27B0';
            btn.innerHTML = '🗺️';
            btn.title = 'Journey Overview';
        }
        showStatus('📍 Returned to navigation view', 'success');
        console.log('[Navigation] Journey overview deactivated');
    }
}

/**
 * updateSpeedWarning function
 * @function updateSpeedWarning
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} currentSpeed - Parameter description
 * @param {*} roadType - Parameter description
 * @returns {*} Return value description
 */
function updateSpeedWarning(lat, lon, currentSpeed, roadType) {
    fetch(`/api/speed-warnings?lat=${lat}&lon=${lon}&speed=${currentSpeed}&road_type=${roadType}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const display = document.getElementById('speedWarningDisplay');
                const text = document.getElementById('speedWarningText');
                const details = document.getElementById('speedWarningDetails');

                display.className = `speed-warning-display show ${data.status}`;
                text.textContent = data.message;

                // Convert speeds based on user preference
                const userSpeedUnit = getSpeedUnit();
                let displayLimit, displayCurrent;
                if (speedUnit === 'mph') {
                    displayLimit = Math.round(data.speed_limit_mph);
                    displayCurrent = Math.round(data.current_speed_mph);
                } else {
                    // Convert mph to km/h
                    displayLimit = Math.round(data.speed_limit_mph * 1.60934);
                    displayCurrent = Math.round(data.current_speed_mph * 1.60934);
                }
                details.textContent = `Limit: ${displayLimit} ${userSpeedUnit} | Current: ${displayCurrent} ${userSpeedUnit}`;
            }
        })
        .catch(error => console.error('Error updating speed warning:', error));
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
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    return bearing;
}
/**
 * calculateTurnDirection function
 * @function calculateTurnDirection
 * @param {*} bearing1 - Parameter description
 * @param {*} bearing2 - Parameter description
 * @returns {*} Return value description
 */
function calculateTurnDirection(bearing1, bearing2) {
    let bearingChange = bearing2 - bearing1;

    // Normalize to -180 to 180 range
    if (bearingChange > 180) bearingChange -= 360;
    if (bearingChange < -180) bearingChange += 360;

    // Classify turn
    if (bearingChange < -135) return 'sharp_left';
    if (bearingChange < -45) return 'left';
    if (bearingChange < -10) return 'slight_left';
    if (bearingChange <= 10) return 'straight';
    if (bearingChange <= 45) return 'slight_right';
    if (bearingChange <= 135) return 'right';
    return 'sharp_right';
}
/**
 * Distance along the polyline from a snapped point (snapped onto segment i0) to
 * a target vertex, forward along the line only.
 * @param {Array} routePolyline - [lat, lon] polyline
 * @param {Object} snap - Result of snapToRoutePolyline (index, t, …)
 * @param {number} targetVertexIndex - Maneuver begin_shape_index (clamped to polyline)
 * @returns {number} Meters, >= 0
 */
function distanceAlongRouteToVertexMeters(routePolyline, snap, targetVertexIndex) {
    if (!routePolyline || routePolyline.length < 2 || !snap) return 0;
    const n = routePolyline.length;
    const vi = Math.max(0, Math.min(Math.floor(Number(targetVertexIndex) || 0), n - 1));
    const i0 = Math.max(0, Math.min(snap.index, n - 2));
    const t = snap.t !== undefined && snap.t !== null
        ? Math.max(0, Math.min(1, Number(snap.t)))
        : 0;
    const a = routePolyline[i0];
    const b = routePolyline[i0 + 1];
    const segLen = calculateHaversineDistance(a[0], a[1], b[0], b[1]);
    if (vi < i0) {
        return 0;
    }
    let d = 0;
    if (vi > i0) {
        d += (1 - t) * segLen;
        for (let j = i0 + 1; j < vi; j++) {
            d += calculateHaversineDistance(
                routePolyline[j][0], routePolyline[j][1],
                routePolyline[j + 1][0], routePolyline[j + 1][1]
            );
        }
    } else {
        d += t * segLen;
    }
    return Math.max(0, d);
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

function ordinalEnglishExit(n) {
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return `${n}st`;
    if (j === 2 && k !== 12) return `${n}nd`;
    if (j === 3 && k !== 13) return `${n}rd`;
    return `${n}th`;
}

function laneOrdinalEnglish(n) {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return `${n}th`;
}

function buildTurnLaneHintHtml(maneuver, maneuverIndex, distanceMeters) {
    if (!maneuver) return '';
    const mt = maneuver.type || 0;
    const chips = [];
    const exitCt = maneuverIndex != null ? effectiveRoundaboutExitCount(maneuverIndex) : (Number(maneuver.roundabout_exit_count) || 0);
    if ((mt === 26 || mt === 27) && exitCt > 0) {
        chips.push(`<span class="lane-hint-chip">${ordinalEnglishExit(exitCt)} exit</span>`);
    }
    const lanes = maneuver.lanes;
    if (Array.isArray(lanes) && lanes.length > 1) {
        let idx = lanes.findIndex((l) => l && (l.active === true || l.active_indication === true));
        if (idx < 0) {
            idx = lanes.findIndex((l) => l && Array.isArray(l.valid_indications) && l.valid_indications.length > 0);
        }
        if (idx >= 0) {
            chips.push(`<span class="lane-hint-chip">${laneOrdinalEnglish(idx + 1)} lane</span>`);
        }
    }
    const multiFork = [15, 16, 9, 10, 11, 14, 20, 21, 23, 24, 25, 35, 36].includes(mt);
    if (multiFork && chips.length === 0 && typeof distanceMeters === 'number' && distanceMeters < 900) {
        if ([15, 16, 14, 21, 24].includes(mt)) {
            chips.push('<span class="lane-hint-chip">Keep left</span>');
        } else if ([9, 10, 11, 20, 23].includes(mt)) {
            chips.push('<span class="lane-hint-chip">Keep right</span>');
        }
    }
    return chips.join(' ');
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

            // Map Valhalla maneuver types to our direction system
            const type = maneuver.type || 0;
            let direction = null;  // null = skip this maneuver

            // Valhalla maneuver types: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
            // SKIP types 1-3, 7-8, 17 (Start, Becomes, Continue, Ramp straight); 27 handled as roundabout exit.
            if (type === 4 || type === 5 || type === 6) direction = 'destination';  // Destination
            else if (type === 9) direction = 'slight_right';   // Slight Right
            else if (type === 10) direction = 'right';          // Right
            else if (type === 11) direction = 'sharp_right';    // Sharp Right
            else if (type === 12) direction = 'uturn';          // U-turn Right
            else if (type === 13) direction = 'uturn';          // U-turn Left
            else if (type === 14) direction = 'sharp_left';     // Sharp Left
            else if (type === 15) direction = 'left';           // Left
            else if (type === 16) direction = 'slight_left';    // Slight Left
            else if (type === 18) direction = 'slight_right';   // Ramp Right
            else if (type === 19) direction = 'slight_left';    // Ramp Left
            else if (type === 20) direction = 'exit_right';     // Exit Right  (FIX: preserve direction)
            else if (type === 21) direction = 'exit_left';      // Exit Left   (FIX: preserve direction)
            else if (type === 22) direction = 'straight';       // Stay Straight (FIX: was slight_right)
            else if (type === 23) direction = 'slight_right';   // Stay Right  (FIX: was slight_left)
            else if (type === 24) direction = 'slight_left';    // Stay Left   (FIX: was merge)
            else if (type === 25) direction = 'merge';          // Merge
            else if (type === 26) direction = 'roundabout';     // Roundabout Enter
            else if (type === 27) direction = 'roundabout';   // Roundabout Exit
            else if (type === 35) direction = 'merge';          // Merge Right
            else if (type === 36) direction = 'merge';          // Merge Left

            // Skip non-turn maneuvers (straight, continue, etc.)
            if (direction === null) continue;

            const targetIndex = Math.min(maneuverShapeIndex, routePolyline.length - 1);

            // True along-route distance from snapped position to maneuver vertex
            const distanceToManeuver = distanceAlongRouteToVertexMeters(
                routePolyline, turnSnap, targetIndex
            );

            // Extend detection range for exits (2.5km) and keep/fork (1.5km)
            const isExitDir = direction === 'exit' || direction === 'exit_right' || direction === 'exit_left';
            const isKeepDir = direction === 'slight_right' || direction === 'slight_left';
            const isRb = direction === 'roundabout';
            const maxDetectionDistance = isExitDir ? 2500 : isKeepDir ? 1500 : isRb ? 900 : 600;

            // Only return turns within detection range
            if (distanceToManeuver <= maxDetectionDistance) {
                currentStepIndex = i;
                schedulePersistRoute();

                console.log(`[Turn] Detected: ${direction} in ${distanceToManeuver.toFixed(0)}m (type=${type}, step=${i}, shapeIdx=${maneuverShapeIndex})`);

                return {
                    distance: distanceToManeuver,
                    direction: direction,
                    streetName: maneuver.street_name || (maneuver.street_names && maneuver.street_names[0]) || maneuver.begin_street_names?.[0] || '',
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
    // Get the custom SVG icon path
    const iconPath = vehicleIcons[currentRoutingMode] || vehicleIcons[currentVehicleType] || vehicleIcons['petrol_diesel'];
    const iconEmoji = vehicleIconEmojis[currentRoutingMode] || vehicleIconEmojis[currentVehicleType] || '🚗';

    // Create a div element for the marker with custom SVG icon
    // Larger size for better visibility in 3D aerial view
    const markerDiv = document.createElement('div');
    markerDiv.style.width = '60px';
    markerDiv.style.height = '60px';
    markerDiv.style.display = 'flex';
    markerDiv.style.alignItems = 'center';
    markerDiv.style.justifyContent = 'center';
    markerDiv.style.position = 'relative';

    const mapBr = map && typeof map.getBearing === 'function' ? map.getBearing() : 0;
    const rot = ((heading - mapBr) % 360 + 360) % 360;
    markerDiv.style.transform = `rotate(${rot}deg)`;
    markerDiv.style.transition = 'transform 0.3s ease-out';

    // 3D effect: Add layered shadows for depth perception
    markerDiv.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))';

    // Enable 3D transforms
    markerDiv.style.transformStyle = 'preserve-3d';

    // Create the SVG image element
    const imgElement = document.createElement('img');
    imgElement.src = iconPath;
    imgElement.style.width = '100%';
    imgElement.style.height = '100%';
    imgElement.style.objectFit = 'contain';

    markerDiv.appendChild(imgElement);

    // Create custom marker with MapLibre
    const speedKmh = speed ? (speed * 3.6).toFixed(1) : 0;
    const speedUnit = getSpeedUnit();
    const displaySpeed = convertSpeed(speedKmh);

    // 3D AERIAL VIEW: Use 'map' for pitchAlignment so the icon tilts with the map
    // This creates a realistic 3D effect where the aerial view icon appears to lay flat on the map
    // The icon will tilt when the map is pitched, giving a true top-down perspective
    const marker = MapLibreHelpers.createMarker(lat, lon, {
        html: markerDiv.outerHTML,
        iconSize: [60, 60],              // Larger size for better visibility in 3D
        iconAnchor: [30, 30],            // Center anchor point
        className: 'vehicle-marker-icon', // Use the class for CSS transitions
        rotationAlignment: 'map',        // Align with map rotation (keeps heading correct)
        pitchAlignment: 'map',           // 3D: Align with map pitch for realistic aerial perspective
        popup: `
            <div style="font-family: Arial, sans-serif; font-size: 13px; min-width: 180px;">
                <strong style="font-size: 14px;">${iconEmoji} Current Position</strong><br>
                <div style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px;">
                    <div>Speed: <strong>${displaySpeed} ${speedUnit}</strong></div>
                    <div>Heading: <strong>${Math.round(heading)}°</strong></div>
                    <div>Accuracy: <strong>±${accuracy.toFixed(0)}m</strong></div>
                </div>
            </div>
        `
    });

    // Store heading and speed for later updates
    marker.heading = heading;
    marker.speed = speed;
    marker.accuracy = accuracy;

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
function calculateSmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
    let zoomLevel = ZOOM_LEVELS.urban_low_speed; // Default

    // Priority 1: Turn-based zoom (highest priority)
    if (distanceToNextTurn !== null && distanceToNextTurn < TURN_ZOOM_THRESHOLD) {
        // Zoom in for turn details when within 500m
        zoomLevel = ZOOM_LEVELS.turn_ahead;
        return zoomLevel;
    }

    // Priority 2: Speed-based zoom
    if (speedMph > 100) {
        // Motorway - zoom out to see more ahead
        zoomLevel = ZOOM_LEVELS.motorway_high_speed;
    } else if (speedMph > 50) {
        // Main road - medium zoom
        zoomLevel = ZOOM_LEVELS.main_road_medium_speed;
    } else if (speedMph > 20) {
        // Urban - normal zoom
        zoomLevel = ZOOM_LEVELS.urban_low_speed;
    } else {
        // Parking/very slow - zoom in
        zoomLevel = ZOOM_LEVELS.parking_very_low_speed;
    }

    return zoomLevel;
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
function calculateDriverViewCenter(lat, lon, heading, zoomLevel) {
    // MapLibre native: We use padding to offset the center, so we return the raw coords here.
    return [lat, lon];
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
                    pitch = 60;
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
    if (btn) {
        btn.classList.toggle('active', smartZoomEnabled);
    }
    localStorage.setItem('smartZoomEnabled', smartZoomEnabled ? '1' : '0');
    saveAllSettings();
    showStatus(`🔍 Smart Zoom ${smartZoomEnabled ? 'enabled' : 'disabled'}`, 'info');
    console.log('[SmartZoom] Toggled to:', smartZoomEnabled);
}

// ===== VARIABLE SPEED LIMIT DETECTION =====
/**
 * updateVariableSpeedLimit function
 * @function updateVariableSpeedLimit
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} roadType - Parameter description
 * @param {*} vehicleType - Parameter description
 * @returns {*} Return value description
 */
function updateVariableSpeedLimit(lat, lon, roadType = 'motorway', vehicleType = 'car') {
    fetch(`/api/speed-limit?lat=${lat}&lon=${lon}&road_type=${roadType}&vehicle_type=${vehicleType}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const display = document.getElementById('variableSpeedDisplay');
                const limitEl = document.getElementById('variableSpeedLimit');
                const infoEl = document.getElementById('variableSpeedInfo');

                const speedData = data.data;
                const vslMph = speedData.speed_limit_mph;
                limitEl.textContent = (vslMph != null && vslMph > 0) ? `${vslMph} mph` : '—';

                let infoHtml = '';
                if (speedData.is_smart_motorway) {
                    infoHtml += `<div class="variable-speed-info-item">🚗 Smart Motorway: ${speedData.motorway_name}</div>`;
                }
                infoHtml += `<div class="variable-speed-info-item">Road: ${speedData.road_type.replace(/_/g, ' ')}</div>`;

                infoEl.innerHTML = infoHtml;
                display.classList.add('show');
            }
        })
        .catch(error => console.error('Error updating variable speed limit:', error));
}

/**
 * Fire-and-forget log of driver feedback on the displayed speed limit (analytics).
 * @param {'confirmed'|'wrong_sign'} outcome
 * @param {{ source?: string }} [extra]
 */
function postSpeedLimitFeedback(outcome, extra) {
    if (outcome !== 'confirmed' && outcome !== 'wrong_sign') {
        return;
    }
    const lat = typeof currentLat === 'number' && Number.isFinite(currentLat) ? currentLat : null;
    const lon = typeof currentLon === 'number' && Number.isFinite(currentLon) ? currentLon : null;
    if (lat == null || lon == null) {
        return;
    }
    const mph =
        typeof currentSpeedLimitMph !== 'undefined' &&
        currentSpeedLimitMph != null &&
        Number.isFinite(currentSpeedLimitMph) &&
        currentSpeedLimitMph > 0
            ? Math.round(currentSpeedLimitMph)
            : null;
    const payload = {
        outcome,
        lat,
        lon,
        displayed_mph: mph,
        source: (extra && extra.source) || 'client',
        client_ts: Date.now()
    };
    try {
        fetch('/api/speed-limit/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch((e) => console.debug('[SpeedLimitFeedback]', e));
    } catch (e) {
        console.debug('[SpeedLimitFeedback]', e);
    }
}

/**
 * checkSpeedViolation function
 * @function checkSpeedViolation
 * @param {*} currentSpeedMph - Parameter description
 * @param {*} speedLimitMph - Parameter description
 * @param {*} threshold - Parameter description
 * @returns {*} Return value description
 */
function checkSpeedViolation(currentSpeedMph, speedLimitMph, threshold = 5) {
    fetch('/api/speed-violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            current_speed_mph: currentSpeedMph,
            speed_limit_mph: speedLimitMph,
            warning_threshold_mph: threshold
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const violation = data.data;
                console.log(`[Speed] Status: ${violation.status}, Diff: ${violation.speed_diff_mph} mph`);

                // Announce speed violations via voice if enabled
                // FIX: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
                if (violation.status === 'exceeding' && voiceAnnouncementsEnabled) {
                    speakMessage(`⚠️ Exceeding speed limit by ${violation.speed_diff_mph} mph`);
                }
            }
        })
        .catch(error => console.error('Error checking speed violation:', error));
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
    if (button) {
        button.classList.toggle('active');
        if (gestureEnabled) {
            button.style.background = '#4CAF50';
            button.style.borderColor = '#4CAF50';
        } else {
            button.style.background = '#ddd';
            button.style.borderColor = '#999';
        }
    }

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
    const button = document.getElementById('batterySavingMode');
    if (button) {
        button.classList.add('active');
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
    }

    // Reduce GPS update frequency
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                // GPS callback - will be handled by existing tracking
            },
            (error) => console.error('GPS error:', error),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
        );
    }

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
    const button = document.getElementById('batterySavingMode');
    if (button) {
        button.classList.remove('active');
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
    }

    // Restore GPS update frequency
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                // GPS callback
            },
            (error) => console.error('GPS error:', error),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

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
                    item.innerHTML = `
                        <span class="ml-prediction-label">${pred.label}</span>
                        <span class="ml-prediction-details">${pred.details}</span>
                    `;
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

    // Update visual state
    if (enabled) {
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }

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

    const alwaysHideWhenExpandedIds = ['roadReportFab', 'startTrackingBtn', 'voiceFab', 'currentLocationFab', 'mapControlsHintFab'];
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
    if (sheetExpanded && routeInProgress) {
        if (zoomBtn) zoomBtn.style.display = 'none';
        if (journeyBtn) journeyBtn.style.display = 'none';
    } else if (routeInProgress) {
        if (zoomBtn) zoomBtn.style.display = 'block';
        if (journeyBtn) journeyBtn.style.display = 'block';
    } else {
        if (zoomBtn) zoomBtn.style.display = 'none';
        if (journeyBtn) journeyBtn.style.display = 'none';
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
        '\u2014 During turn-by-turn, Zoom & follow and Journey overview may appear as round buttons.',
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

function syncRoadReportSpeedFieldsVisibility() {
    const sel = document.getElementById('roadReportType');
    const box = document.getElementById('roadReportSpeedFields');
    if (!sel || !box) return;
    box.style.display = sel.value === 'speed_limit_correction' ? 'block' : 'none';
}

function openRoadReportModal() {
    const m = document.getElementById('roadReportModal');
    if (!m) return;
    const notes = document.getElementById('roadReportNotes');
    if (notes) notes.value = '';
    const unitSel = document.getElementById('roadReportSpeedUnit');
    if (unitSel) unitSel.value = (typeof distanceUnit !== 'undefined' && distanceUnit === 'mi') ? 'mph' : 'kmh';
    syncRoadReportSpeedFieldsVisibility();
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
    let description = (document.getElementById('roadReportNotes') && document.getElementById('roadReportNotes').value) || '';
    if (hazard_type === 'speed_limit_correction') {
        const v = document.getElementById('roadReportSpeedValue');
        const u = document.getElementById('roadReportSpeedUnit');
        const num = v && v.value ? parseInt(v.value, 10) : NaN;
        if (!Number.isFinite(num) || num < 5) {
            showStatus('Enter the speed limit number you see on the road.', 'warning');
            return;
        }
        const unit = u && u.value === 'kmh' ? 'km/h' : 'mph';
        description = `Posted limit observed: ${num} ${unit}. ${description}`.trim();
    }
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
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('[PWA] Service Worker registered:', registration);

                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60000); // Check every minute

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
            // Save state before reload
            saveAppState();
            setTimeout(() => {
                window.location.reload();
            }, 1000);
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
    if (document.getElementById('offlineBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:99999;
        background:linear-gradient(135deg,#ff6b6b,#ee5a24);color:#fff;
        padding:10px 16px;text-align:center;font-size:14px;font-weight:600;
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;
        justify-content:center;gap:8px;transition:transform 0.3s ease;
    `;
    banner.innerHTML = `<span>📡</span><span>You're offline — GPS & cached map tiles still work</span>`;
    document.body.prepend(banner);
}

function _removeOfflineBanner() {
    const banner = document.getElementById('offlineBanner');
    if (banner) {
        banner.style.transform = 'translateY(-100%)';
        setTimeout(() => banner.remove(), 350);
    }
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
}

window.addEventListener('offline', _handleOffline);
window.addEventListener('online', _handleOnline);
if (!navigator.onLine) {
    window.addEventListener('load', _handleOffline);
}

// ===== OFFLINE ROUTE PERSISTENCE (IndexedDB) =====
const ROUTE_DB_NAME = 'voyagr-nav';
const ROUTE_DB_VERSION = 1;
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

// ===== OFFLINE SPEED LIMIT CACHE =====
async function cacheSpeedLimit(lat, lon, speedLimit, source) {
    try {
        const key = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
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
    try {
        const key = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
        const db = await _openRouteDB();
        const tx = db.transaction(SPEED_CACHE_STORE, 'readonly');
        const req = tx.objectStore(SPEED_CACHE_STORE).get(key);
        const result = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        db.close();
        if (!result) return null;
        if (Date.now() - result.cachedAt > 24 * 60 * 60 * 1000) return null;
        return result;
    } catch (e) { return null; }
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

        const resumeBanner = document.createElement('div');
        resumeBanner.id = 'resumeNavBanner';
        resumeBanner.style.cssText = `
            position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99998;
            background:#fff;border-radius:16px;padding:16px 20px;
            box-shadow:0 4px 20px rgba(0,0,0,0.25);max-width:340px;width:90%;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
            display:flex;flex-direction:column;gap:10px;
        `;
        resumeBanner.innerHTML = `
            <div style="font-weight:600;font-size:15px">Resume navigation?</div>
            <div style="font-size:13px;color:#666">A previous route was found (${saved.steps.length} steps).</div>
            <div style="display:flex;gap:8px">
                <button id="resumeNavYes" style="flex:1;padding:10px;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-weight:600;
                    font-size:14px;cursor:pointer">Resume</button>
                <button id="resumeNavNo" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:10px;
                    background:#fff;color:#333;font-weight:600;font-size:14px;cursor:pointer">Dismiss</button>
            </div>
        `;
        document.body.appendChild(resumeBanner);

        document.getElementById('resumeNavYes').onclick = () => {
            resumeBanner.remove();
            routePolyline = saved.polyline;
            currentRouteSteps = saved.steps;
            currentStepIndex = saved.stepIndex || 0;
            routeInProgress = true;
            if (saved.routeData) window.lastCalculatedRoute = saved.routeData;
            showStatus('🧭 Navigation resumed from saved route', 'success');
            if (typeof startGPSTracking === 'function') startGPSTracking();
            console.log('[OfflineNav] Route resumed');
        };
        document.getElementById('resumeNavNo').onclick = () => {
            resumeBanner.remove();
            clearPersistedRoute();
        };

        setTimeout(() => { if (document.getElementById('resumeNavBanner')) resumeBanner.remove(); }, 30000);
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

/** 60° + heading + padding: active nav follow, or user enabled driver view while browsing */
function shouldUsePitchedDrivingCamera() {
    return isActiveNavigationFollow() || driverPerspectiveEnabled;
}

/** One-shot camera after nav start or when forcing driver framing */
function applyLiveNavigationCamera() {
    if (!map || currentLat == null || currentLon == null) return;
    const heading = (typeof currentUserMarker?.heading === 'number')
        ? currentUserMarker.heading
        : map.getBearing();
    map.easeTo({
        duration: 1000,
        pitch: 60,
        bearing: heading,
        center: [currentLon, currentLat],
        padding: getNavigationFollowPadding(),
    });
    console.log('[Driver View] 60° navigation camera (follow padding)');
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
    if (btn) {
        btn.classList.toggle('active', pitched);
        if (pitched) {
            btn.style.background = '#4CAF50';
            btn.style.borderColor = '#4CAF50';
        } else {
            btn.style.background = '#ddd';
            btn.style.borderColor = '#999';
        }
    }

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
        easeOptions.pitch = 60;
        easeOptions.bearing = heading;
        easeOptions.padding = getNavigationFollowPadding();
        if (currentLat != null && currentLon != null) {
            easeOptions.center = [currentLon, currentLat];
        }
        map.easeTo(easeOptions);
        console.log('[Driver View] 60° (navigation follow or preference)');
    } else {
        easeOptions.pitch = 0;
        easeOptions.bearing = 0;
        easeOptions.padding = { top: 50, bottom: 200, left: 50, right: 50 };
        easeOptions.duration = 500;
        map.easeTo(easeOptions);
        console.log('[Driver View] Standard top-down');
    }
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
        btn.innerHTML = '🎯 Exit AR';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '📷 AR View';
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
        console.log('[Turn Widget] Hidden');
    }
}

/**
 * Get turn icon based on maneuver type
 * @param {number} type - Valhalla maneuver type
 * @returns {string} Unicode arrow or icon
 */
function getTurnIcon(type) {
    // Valhalla maneuver types: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
    // FIX: Corrected arrow directions - left maneuvers show left arrows, right show right
    const iconMap = {
        0: '↑',    // None/Continue
        1: '↑',    // Start
        2: '↑',    // Start Right
        3: '↑',    // Start Left
        4: '🏁',   // Destination
        5: '🏁',   // Destination Right
        6: '🏁',   // Destination Left
        7: '↑',    // Becomes
        8: '↑',    // Continue
        9: '↱',    // Slight Right       → arrow bending right
        10: '→',   // Right              → right arrow
        11: '↳',   // Sharp Right        → sharp right arrow
        12: '↩',   // U-turn Right
        13: '↩',   // U-turn Left
        14: '↲',   // Sharp Left         → sharp left arrow
        15: '←',   // Left               → left arrow
        16: '↰',   // Slight Left        → arrow bending left
        17: '↑',   // Ramp Straight
        18: '↱',   // Ramp Right         → arrow bending right
        19: '↰',   // Ramp Left          → arrow bending left
        20: '↗',   // Exit Right         → arrow upper-right
        21: '↖',   // Exit Left          → arrow upper-left (FIX: was showing right in some paths)
        22: '↑',   // Stay Straight
        23: '↱',   // Stay Right         → arrow bending right
        24: '↰',   // Stay Left          → arrow bending left
        25: '⚙️',   // Merge
        26: '🔄',  // Roundabout Enter
        27: '↗',   // Roundabout Exit
        28: '⛴️',   // Ferry Enter
        29: '🚗',  // Ferry Exit
        30: '🚇',  // Transit
        31: '🚶',  // Transit Connection Start
        32: '🚶',  // Transit Connection End
        33: '🚏',  // Transit Connection Destination
        34: '⛴️',  // Post Transit Connection Destination
        35: '⚙️',  // Merge Right
        36: '⚙️'   // Merge Left
    };
    return iconMap[type] || '↑';
}

/**
 * Format distance for display using user's preferred units
 * @param {number} distanceMeters - Distance in meters
 * @returns {string} Formatted distance string
 */
function formatTurnDistance(distanceMeters) {
    const useMiles = distanceUnit === 'mi';

    if (useMiles) {
        const miles = distanceMeters / 1609.34;
        if (miles < 0.1) {
            const feet = Math.round(distanceMeters * 3.28084);
            return `${feet} ft`;
        } else if (miles < 1) {
            return `${(miles * 5280 / 100).toFixed(0) * 100} ft`;
        } else {
            return `${miles.toFixed(1)} mi`;
        }
    } else {
        if (distanceMeters < 100) {
            return `${Math.round(distanceMeters)} m`;
        } else if (distanceMeters < 1000) {
            return `${Math.round(distanceMeters / 10) * 10} m`;
        } else {
            return `${(distanceMeters / 1000).toFixed(1)} km`;
        }
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

    if (turnInfo) {
        const formattedDistance = formatTurnDistance(turnInfo.distance);
        distanceEl.textContent = `In ${formattedDistance}`;

        if (turnInfo.instruction) {
            instructionEl.textContent = turnInfo.instruction;
        } else {
            const dirText = getTurnDirectionText(turnInfo.direction || 'straight');
            instructionEl.textContent = dirText;
        }

        if (streetEl) {
            if (turnInfo.streetName) {
                streetEl.textContent = `onto ${turnInfo.streetName}`;
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

    if (instructionsPanelExpanded) {
        populateInstructionsList();
    }

    updateARInstruction(turnInfo);
}

/**
 * Populate the full instructions list in the expanded panel
 * Enhanced with click-to-preview functionality
 */
function populateInstructionsList() {
    const listEl = document.getElementById('instructionsList');
    const countEl = document.getElementById('instructionsCount');

    if (!listEl || !currentRouteSteps || currentRouteSteps.length === 0) {
        if (listEl) listEl.innerHTML = '<div class="instruction-item"><div class="instruction-item-content"><div class="instruction-item-text">No instructions available</div></div></div>';
        if (countEl) countEl.textContent = '0 steps';
        return;
    }

    // Calculate remaining steps from current position
    const remainingSteps = currentRouteSteps.length - currentStepIndex;
    if (countEl) countEl.textContent = `${remainingSteps} of ${currentRouteSteps.length} steps remaining`;

    let html = '';

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

        // Add data attributes for click-to-preview
        html += `
            <div class="${itemClass}" data-step-index="${i}" data-shape-index="${shapeIndex}" onclick="previewInstructionOnMap(${i}, ${shapeIndex})">
                <div class="instruction-item-icon">${icon}</div>
                <div class="instruction-item-content">
                    <div class="instruction-item-text">${instruction}${exitBadge}</div>
                    ${streetName ? `<div class="instruction-item-street">${streetName}</div>` : ''}
                    ${isPassed ? '<div class="instruction-item-status">✓ Passed</div>' : (isCurrent ? '<div class="instruction-item-status current-status">→ Next</div>' : '')}
                </div>
                <div class="instruction-item-preview" title="Click to preview on map">👁️</div>
            </div>
        `;
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
    hidePreviewMarker();  // Remove existing

    if (!map) return;

    // Create preview marker element
    const el = document.createElement('div');
    el.className = 'preview-marker';
    el.innerHTML = `
        <div class="preview-marker-icon">📍</div>
        <div class="preview-marker-label">${label}</div>
    `;
    el.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translateY(-50%);
    `;

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
 * Update turn widget from maneuver data (called from GPS tracking)
 * @param {number} lat - Current latitude
 * @param {number} lon - Current longitude
 */
function updateTurnWidgetFromPosition(lat, lon) {
    if (!routeInProgress || !currentRouteSteps || currentRouteSteps.length === 0) {
        return;
    }

    // Find the next maneuver ahead of user's position
    // FIX: Pass [lat, lon] as array, not separate arguments
    const userRouteIndex = findClosestRoutePointIndex([lat, lon], 0);

    for (let i = currentStepIndex; i < currentRouteSteps.length; i++) {
        const maneuver = currentRouteSteps[i];
        const maneuverShapeIndex = maneuver.begin_shape_index || 0;

        // Skip maneuvers that are behind the user
        if (maneuverShapeIndex < userRouteIndex - 5) {
            // Update current step index as we pass maneuvers
            if (i === currentStepIndex && i < currentRouteSteps.length - 1) {
                currentStepIndex = i + 1;
            }
            continue;
        }

        // Calculate distance to this maneuver
        if (routePolyline && maneuverShapeIndex < routePolyline.length) {
            const maneuverPoint = routePolyline[maneuverShapeIndex];
            const distanceToManeuver = calculateDistance(lat, lon, maneuverPoint[0], maneuverPoint[1]);

            // Update the display with this maneuver info
            const type = maneuver.type || 0;
            let direction = 'straight';

            // Map Valhalla types to directions (FIX: corrected mappings)
            // Types 9=Slight Right, 18=Ramp Right, 23=Stay Right
            if ([9, 18, 23].includes(type)) direction = 'slight-right';
            // Type 10=Right
            else if ([10].includes(type)) direction = 'right';
            // Type 11=Sharp Right
            else if ([11].includes(type)) direction = 'sharp-right';
            // Types 16=Slight Left, 19=Ramp Left, 24=Stay Left
            else if ([16, 19, 24].includes(type)) direction = 'slight-left';
            // Type 15=Left
            else if ([15].includes(type)) direction = 'left';
            // Type 14=Sharp Left
            else if ([14].includes(type)) direction = 'sharp-left';
            // Types 12=U-turn Right, 13=U-turn Left
            else if ([12, 13].includes(type)) direction = 'u-turn';
            // Type 20=Exit Right (FIX: separate from Exit Left)
            else if ([20].includes(type)) direction = 'exit-right';
            // Type 21=Exit Left (FIX: was grouped with exit right)
            else if ([21].includes(type)) direction = 'exit-left';
            // Type 22=Stay Straight (FIX: was missing, was wrong)
            else if ([22].includes(type)) direction = 'straight';
            // Types 25,35,36=Merge
            else if ([25, 35, 36].includes(type)) direction = 'merge';
            // Types 26,27=Roundabout
            else if ([26, 27].includes(type)) direction = 'roundabout';
            // Types 4,5,6=Destination
            else if ([4, 5, 6].includes(type)) direction = 'destination';

            const streetNames = maneuver.street_names || [];
            const streetLabel = streetNames.length > 0 ? streetNames[0] : (maneuver.street_name || '');

            updateTurnInstructionDisplay({
                distance: distanceToManeuver,
                direction: direction,
                instruction: maneuver.instruction || maneuver.verbal_pre_transition_instruction || '',
                streetName: streetLabel,
                maneuver: maneuver,
                maneuverIndex: i,
                valhallaType: type,
            });

            return;
        }
    }

    // No upcoming maneuvers - near destination or following route
    updateTurnInstructionDisplay(null);
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
    const hours = date.getHours();
    const minutes = date.getMinutes();

    // Check user preference for 24-hour format (default to 24h)
    const use24Hour = localStorage.getItem('use24HourFormat') !== 'false';

    if (use24Hour) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    } else {
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
    }
}

/**
 * Format remaining time for display
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted time string (e.g., "45 min" or "2h 15min")
 */
function formatRemainingTime(minutes) {
    if (minutes < 1) return '<1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);

    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
}

/**
 * Detect if the user has actually started moving.
 * Checks GPS position changes and speed to avoid false progress calculations.
 * @returns {boolean} True if user has started moving, false otherwise
 */
function hasUserStartedMoving() {
    // Need at least 3 tracking points to detect movement
    if (trackingHistory.length < 3) {
        return false;
    }

    // Check recent tracking history (last 30 seconds)
    const now = Date.now();
    const recentHistory = trackingHistory.filter(point => {
        const age = now - point.timestamp.getTime();
        return age <= 30000; // Last 30 seconds
    });

    if (recentHistory.length < 2) {
        return false;
    }

    // Method 1: Check if speed is consistently above threshold (2 km/h = 0.56 m/s)
    const SPEED_THRESHOLD_MS = 0.56; // 2 km/h in m/s
    const speedReadings = recentHistory
        .map(point => point.speed || 0)
        .filter(speed => speed > SPEED_THRESHOLD_MS);

    if (speedReadings.length >= 2) {
        console.log('[Movement Detection] User is moving (speed detected)');
        return true;
    }

    // Method 2: Check if position has changed significantly (moved > 50 meters)
    const DISTANCE_THRESHOLD_M = 50; // 50 meters
    const firstPoint = recentHistory[0];
    const lastPoint = recentHistory[recentHistory.length - 1];

    const distanceMoved = calculateDistance(
        firstPoint.lat, firstPoint.lon,
        lastPoint.lat, lastPoint.lon
    );

    if (distanceMoved > DISTANCE_THRESHOLD_M) {
        console.log(`[Movement Detection] User is moving (moved ${distanceMoved.toFixed(0)}m)`);
        return true;
    }

    console.log('[Movement Detection] User has not started moving yet');
    return false;
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
    const useMiles = distanceUnit === 'mi';
    let distanceText;
    if (useMiles) {
        const miles = remainingDistanceMeters / 1609.34;
        distanceText = miles < 0.1 ? `${Math.round(remainingDistanceMeters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
    } else {
        const km = remainingDistanceMeters / 1000;
        distanceText = km < 0.1 ? `${Math.round(remainingDistanceMeters)} m` : `${km.toFixed(1)} km`;
    }
    distanceEl.textContent = distanceText;

    // Calculate remaining time based on route data
    let remainingTimeMinutes = 0;

    const routeDurationMin = getRouteOriginalDurationMinutes();
    if (window.lastCalculatedRoute && routeDurationMin > 0) {
        const totalDuration = routeDurationMin;
        const polylineTotalM = getTotalPolylineLengthMeters(routePolyline);
        const totalDistance =
            polylineTotalM > 0 ? polylineTotalM : (window.lastCalculatedRoute.distance_km * 1000 || 1);

        if (userHasStartedMoving) {
            // User is moving: Use progress-based calculation (same length basis as remaining distance)
            const progress = 1 - (remainingDistanceMeters / totalDistance);
            remainingTimeMinutes = totalDuration * (1 - progress);

            // Sanity check
            if (remainingTimeMinutes < 0) remainingTimeMinutes = 0;
            if (remainingTimeMinutes > 1440) remainingTimeMinutes = totalDuration; // Cap at 24h

            console.log(`[ETA] Progress-based: ${progress.toFixed(2)} complete, ${remainingTimeMinutes.toFixed(1)} min remaining`);
        } else {
            // User hasn't started moving: Use original route duration
            // This prevents GPS inaccuracy from showing incorrect progress
            remainingTimeMinutes = totalDuration;
            console.log(`[ETA] Pre-movement: Using original duration ${totalDuration.toFixed(1)} min`);
        }
        remainingTimeMinutes = applyTrafficRatioToBaseRemaining(remainingTimeMinutes);
    } else {
        // Fallback: estimate based on average speed (50 km/h)
        const avgSpeedKmh = 50;
        remainingTimeMinutes = (remainingDistanceMeters / 1000 / avgSpeedKmh) * 60;
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
            lon: currentLon,
            speed_limit_mph_hint:
                typeof currentSpeedLimitMph !== 'undefined' && currentSpeedLimitMph > 0
                    ? currentSpeedLimitMph
                    : null
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

        case 'confirm_speed_display':
            speakMessage(data.message || 'Speed limit noted.', 'high');
            postSpeedLimitFeedback('confirmed', { source: 'voice_confirm' });
            break;

        case 'reject_speed_display':
            speakMessage(data.message || 'Thanks, we noted the limit may be wrong.', 'high');
            postSpeedLimitFeedback('wrong_sign', { source: 'voice_reject' });
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
    const roadReportTypeSel = document.getElementById('roadReportType');
    if (roadReportTypeSel) {
        roadReportTypeSel.addEventListener('change', syncRoadReportSpeedFieldsVisibility);
    }
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
    showStatus('🎯 GPS Tracking started...', 'success');

    // Watch position with high accuracy
    gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            const speed = position.coords.speed || 0;
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

            // Prefer device compass/course when moving; otherwise motion vector from recent fixes.
            let heading = 0;
            if (deviceHeading != null && speed > 1.5) {
                heading = (deviceHeading + 360) % 360;
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
                    heading = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
                }
            }

            // ===== SNAP TO ROUTE: Position vehicle on the polyline during navigation =====
            let displayLat = lat;
            let displayLon = lon;

            if (routeInProgress && routePolyline && routePolyline.length >= 2) {
                const snapped = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);
                if (snapped.distance <= SNAP_TO_ROUTE_MAX_DISTANCE) {
                    displayLat = snapped.lat;
                    displayLon = snapped.lon;
                    lastSnappedRouteIndex = snapped.index;
                    // Recalculate heading from route direction at snapped point for smoother rotation
                    if (snapped.index < routePolyline.length - 1) {
                        const rA = routePolyline[snapped.index];
                        const rB = routePolyline[snapped.index + 1];
                        heading = calculateBearing(rA[0], rA[1], rB[0], rB[1]);
                    }
                } else {
                    // Too far from route — use raw GPS (driver may be off-route)
                    console.log(`[Snap] GPS ${snapped.distance.toFixed(0)}m from route, using raw position`);
                }
            }

            // Update user marker on map with vehicle icon and heading
            // FIX: Reuse the existing marker and call setLngLat for smooth movement
            // instead of removing and recreating every tick (which kills CSS transitions)
            if (currentUserMarker && typeof currentUserMarker.setLngLat === 'function') {
                // Move existing marker smoothly
                currentUserMarker.setLngLat([displayLon, displayLat]);

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
                currentUserMarker = createVehicleMarker(displayLat, displayLon, speed, accuracy, heading);
                currentUserMarker.addTo(map);
            }

            // ===== ZOOM AND FOLLOW: Center map on user with smart zoom =====
            if (zoomAndFollowEnabled && mapFollowingActive) {
                // Calculate smart zoom based on speed and route context
                const speedMph = speed ? (speed * 2.237) : 0;
                const smartZoom = calculateSmartZoom(speedMph, null, 'motorway');

                // 60° during active nav follow; preference also enables pitch when browsing with follow
                const pitch = shouldUsePitchedDrivingCamera() ? 60 : 0;
                const padding = getNavigationFollowPadding();
                const bearing = shouldUsePitchedDrivingCamera() ? (heading || map.getBearing()) : 0;

                // Smooth animation to follow vehicle
                map.easeTo({
                    center: [displayLon, displayLat], // MapLibre uses [lon, lat]
                    zoom: smartZoom,
                    bearing: bearing,
                    pitch: pitch,
                    padding: padding,
                    duration: 1000,
                    essential: true
                });

                console.log(`[Navigation] View: pitch ${pitch}°, bearing ${Math.round(bearing)}°, zoom ${smartZoom.toFixed(1)}, pitchedNav: ${isActiveNavigationFollow()}, pref: ${driverPerspectiveEnabled}`);
            } else if (!zoomAndFollowEnabled && !map._userPanned) {
                map.easeTo({
                    center: [displayLon, displayLat],
                    zoom: 16,
                    padding: routeInProgress ? getNavigationFollowPadding() : undefined,
                    duration: 1000
                });
            }

            // Check for route deviation
            if (routeInProgress && routePolyline) {
                checkRouteDeviation(lat, lon);
            }

            // Check for hazards nearby (DB) + cameras stored on the active route geometry
            checkNearbyHazards(lat, lon);
            checkRouteHazardCamerasAhead(lat, lon);

            // Check for variable speed limits
            updateVariableSpeedLimit(lat, lon, 'motorway', currentVehicleType);

            // Apply smart zoom with turn detection
            const speedMph = speed ? (speed * 2.237) : 0;
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

                // FIXED: Removed announceETAUpdate() from GPS callback
                // ETA is now announced only via interval timer (every 10 minutes)
                // This prevents ETA from being announced every 1-5 seconds
            }

            applySmartZoomWithAnimation(speedMph, distanceToNextTurn, 'motorway', lat, lon);

            // ===== PHASE 2: Update lane guidance and speed warnings =====
            // Convert speed from m/s to mph (already done above)
            const speedMphFormatted = speedMph.toFixed(1);

            // Heading already calculated above when creating vehicle marker

            // Update lane guidance if navigating (FIX: extract maneuver direction from Valhalla type)
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

            // Update speed warnings (assume local roads by default)
            updateSpeedWarning(lat, lon, speedMph, 'local');

            // ===== UPDATE SPEED WIDGET =====
            // FIX: Always update the GPS speed display on every tick so it never shows "--"
            // Show Valhalla step speed (route edge) until Overpass/TomTom API fills currentSpeedLimitMph
            const roadType = getCurrentRoadType();
            let valhallaSpeedLimitMph = null;
            if (routeInProgress && currentRouteSteps && currentStepIndex < currentRouteSteps.length) {
                const step = currentRouteSteps[currentStepIndex];
                const rawSl = step && step.speed_limit != null ? Number(step.speed_limit) : NaN;
                if (Number.isFinite(rawSl) && rawSl > 0) {
                    // Valhalla maneuver speed_limit is km/h. Guard implausible hints (bad edge / unit mixups).
                    valhallaSpeedLimitMph = Math.round(rawSl * 0.621371);
                    if (valhallaSpeedLimitMph < 10 && speedMph > 18) {
                        valhallaSpeedLimitMph = null;
                    }
                }
            }
            const shownLimit = (currentSpeedLimitMph && currentSpeedLimitMph > 0)
                ? currentSpeedLimitMph
                : (valhallaSpeedLimitMph && valhallaSpeedLimitMph > 0 ? valhallaSpeedLimitMph : null);
            updateSpeedWidget(speedMph, shownLimit);

            // Query speed limits at polyline-snapped position when on-route (aligns OSM ways with driven road)
            fetchSpeedLimitThrottled(displayLat, displayLon, speedMph, roadType, 0, valhallaSpeedLimitMph);

            if (routeInProgress) {
                fetchRoadNameThrottled(displayLat, displayLon);
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

// Distance-to-destination announcement variables
let lastDestinationAnnouncementDistance = Infinity;
const DESTINATION_ANNOUNCEMENT_DISTANCES = [10000, 5000, 2000, 1000, 500, 100]; // meters (10km, 5km, 2km, 1km, 500m, 100m)

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
    if (localStorage.getItem('pref_trafficAwareRouting') === null) {
        localStorage.setItem('pref_trafficAwareRouting', 'true');
    }
}

function shouldApplyTrafficAwareETA() {
    ensureDefaultTrafficAwareRouting();
    if (localStorage.getItem('pref_trafficAwareRouting') === 'false') return false;
    return (currentRoutingMode || 'auto') === 'auto';
}

function getRouteOriginalDurationMinutes() {
    if (!window.lastCalculatedRoute) return 0;
    let m = window.lastCalculatedRoute.duration_minutes ||
        (window.lastCalculatedRoute.time ? parseInt(window.lastCalculatedRoute.time, 10) : 0);
    if (m > 1440) m = Math.round(m / 60);
    return m;
}

/**
 * Progress-based remaining time (minutes) from GPS on polyline; same basis as server route duration.
 * @returns {{ originalDurationMinutes: number, timeRemainingMinutes: number, progressPercent: number } | null}
 */
function computeBaseNavigationETAMinutes() {
    if (!routeInProgress || !window.lastCalculatedRoute || !routePolyline || routePolyline.length === 0) {
        return null;
    }
    const originalDurationMinutes = getRouteOriginalDurationMinutes();
    if (!originalDurationMinutes || originalDurationMinutes <= 0) return null;

    const userHasStartedMoving = hasUserStartedMoving();
    const totalDistance = getTotalPolylineLengthMeters(routePolyline);
    let remainingDistance = totalDistance;
    if (userHasStartedMoving && currentLat != null && currentLon != null && routePolyline.length >= 2) {
        remainingDistance = computeRemainingDistanceAlongRoute(
            currentLat, currentLon, routePolyline, lastSnappedRouteIndex
        );
    }
    let progressPercent = 0;
    if (totalDistance > 0) {
        progressPercent = Math.max(0, Math.min(100, ((totalDistance - remainingDistance) / totalDistance) * 100));
    }
    const timeRemainingMinutes = Math.round(originalDurationMinutes * (1 - (progressPercent / 100)));
    if (timeRemainingMinutes < 0 || timeRemainingMinutes > originalDurationMinutes) return null;
    return { originalDurationMinutes, timeRemainingMinutes, progressPercent };
}

function applyTrafficRatioToBaseRemaining(baseRemainingMinutes) {
    if (!shouldApplyTrafficAwareETA()) return baseRemainingMinutes;
    const snap = window.navETASnapshot;
    if (snap.trafficAdjustedMinutes == null || snap.baseAtTrafficFetch <= 0 || !snap.trafficFetchAt) {
        return baseRemainingMinutes;
    }
    if (Date.now() - snap.trafficFetchAt > 90000) return baseRemainingMinutes;
    const ratio = snap.trafficAdjustedMinutes / snap.baseAtTrafficFetch;
    return Math.max(1, Math.round(baseRemainingMinutes * ratio));
}

async function refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch = false) {
    window.navETASnapshot.baseRemainingMinutes = baseRemainingMinutes;
    window.navETASnapshot.progressPercent = progressPercent;

    if (!shouldApplyTrafficAwareETA() || !currentLat || !currentLon) {
        window.navETASnapshot.trafficAdjustedMinutes = null;
        return;
    }

    const now = Date.now();
    if (!forceFetch && now - lastNavTrafficFetchAt < NAV_TRAFFIC_ETA_MIN_INTERVAL_MS && window.navETASnapshot.trafficFetchAt) {
        return;
    }
    lastNavTrafficFetchAt = now;

    try {
        const response = await fetch('/api/traffic-conditions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: currentLat,
                lon: currentLon,
                duration_minutes: Math.max(1, Math.round(baseRemainingMinutes))
            })
        });
        const data = await response.json();
        if (data.success) {
            const baseAt = Math.max(1, Math.round(baseRemainingMinutes));
            window.navETASnapshot = {
                ...window.navETASnapshot,
                trafficAdjustedMinutes: data.updated_duration_minutes,
                trafficLevel: data.traffic_level,
                congestionPercent: data.congestion_percentage != null ? data.congestion_percentage : null,
                trafficFetchAt: Date.now(),
                baseAtTrafficFetch: baseAt
            };
        }
    } catch (e) {
        console.warn('[ETA] Traffic conditions fetch failed:', e);
    }
}

function renderTurnInfoETAPanel(baseMinutes, adjustedMinutes, progressPercent, trafficLevel, congestionPercent) {
    const turnInfo = document.getElementById('turnInfo');
    if (!turnInfo) return;
    const now = Date.now();
    const displayMins = adjustedMinutes != null ? adjustedMinutes : baseMinutes;
    const eta = new Date(now + displayMins * 60000);
    let trafficLine = '';
    if (shouldApplyTrafficAwareETA()) {
        if (trafficLevel) {
            trafficLine = `Traffic: ${trafficLevel}`;
            if (congestionPercent != null) trafficLine += ` · ${congestionPercent}% congestion`;
        } else {
            trafficLine = 'Traffic: updating…';
        }
    }
    turnInfo.innerHTML = `
            <div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">
                <div style="font-size: 12px; color: #666;">ETA</div>
                <div style="font-size: 18px; font-weight: bold; color: #333;">
                    ${eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style="font-size: 12px; color: #999; margin-top: 5px;">
                    ${displayMins} min remaining (${progressPercent.toFixed(0)}% complete)
                </div>
                ${trafficLine ? `<div style="font-size: 11px; color: #555; margin-top: 4px;">${trafficLine}</div>` : ''}
            </div>
        `;
}

function buildETAVoiceMessage(timeRemainingMinutes, etaDate) {
    const etaHours = etaDate.getHours();
    const etaMinutes = etaDate.getMinutes();
    if (timeRemainingMinutes > 60) {
        const hours = Math.floor(timeRemainingMinutes / 60);
        const mins = timeRemainingMinutes % 60;
        return `You will arrive in ${hours} hour${hours > 1 ? 's' : ''} and ${mins} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
    }
    return `You will arrive in ${timeRemainingMinutes} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
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
    if (!polyline || polyline.length === 0) return 0;

    let minDistance = Infinity;
    let nearestIndex = 0;

    for (let i = 0; i < polyline.length; i++) {
        const routePoint = polyline[i];
        const distance = calculateDistance(lat, lon, routePoint[0], routePoint[1]);
        if (distance < minDistance) {
            minDistance = distance;
            nearestIndex = i;
        }
    }

    return nearestIndex;
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
function _projectToSegment(lat, lon, ax, ay, bx, by, cosLat) {
    // Scale lon axis so 1 unit ≈ same metres as 1 unit of lat
    const sAy = ay * cosLat;
    const sBy = by * cosLat;
    const sLon = lon * cosLat;

    const abx = bx - ax;
    const aby = sBy - sAy;
    const apx = lat - ax;
    const apy = sLon - sAy;

    const ab2 = abx * abx + aby * aby;
    let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));

    const projLat = ax + t * (bx - ax);
    const projLon = ay + t * (by - ay); // Interpolate in original lon space
    return { projLat, projLon, t };
}

function snapToRoutePolyline(lat, lon, polyline, searchStartIndex = 0) {
    if (!polyline || polyline.length < 2) {
        return { lat, lon, index: 0, distance: 0, t: 0 };
    }

    // Precompute cos(latitude) once for longitude scaling
    const cosLat = Math.cos(lat * Math.PI / 180);

    let bestLat = polyline[0][0];
    let bestLon = polyline[0][1];
    let bestDist = Infinity;
    let bestIndex = 0;
    let bestT = 0;

    // Helper: test one segment
    const testSegment = (i) => {
        const ax = polyline[i][0], ay = polyline[i][1];
        const bx = polyline[i + 1][0], by = polyline[i + 1][1];
        const { projLat, projLon, t } = _projectToSegment(lat, lon, ax, ay, bx, by, cosLat);
        const dist = calculateDistance(lat, lon, projLat, projLon);
        if (dist < bestDist) {
            bestDist = dist;
            bestLat = projLat;
            bestLon = projLon;
            bestIndex = i;
            bestT = t;
        }
    };

    // Search a window around the expected position first (fast path)
    const searchStart = Math.max(0, searchStartIndex - 15);
    const searchEnd = Math.min(polyline.length - 1, searchStartIndex + 250);
    for (let i = searchStart; i < searchEnd; i++) {
        testSegment(i);
    }

    // If nothing close found, search the full polyline
    if (bestDist > 60 && (searchStart > 0 || searchEnd < polyline.length - 1)) {
        for (let i = 0; i < polyline.length - 1; i++) {
            if (i >= searchStart && i < searchEnd) continue;
            testSegment(i);
        }
    }

    return { lat: bestLat, lon: bestLon, index: bestIndex, distance: bestDist, t: bestT };
}

/**
 * Total path length along the polyline (meters).
 */
function getTotalPolylineLengthMeters(polyline) {
    if (!polyline || polyline.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < polyline.length - 1; i++) {
        total += calculateDistance(
            polyline[i][0], polyline[i][1],
            polyline[i + 1][0], polyline[i + 1][1]
        );
    }
    return total;
}

/**
 * Remaining distance (meters) along the polyline from the snapped GPS position to the route end.
 * Uses the same snap logic as the map marker so ETA tracks progress along the line.
 */
function computeRemainingDistanceAlongRoute(lat, lon, polyline, searchStartIndex = 0) {
    if (!polyline || polyline.length < 2) return 0;
    const snap = snapToRoutePolyline(lat, lon, polyline, searchStartIndex);
    const i = snap.index;
    const t = snap.t !== undefined ? snap.t : 0;
    const segLen = calculateDistance(
        polyline[i][0], polyline[i][1],
        polyline[i + 1][0], polyline[i + 1][1]
    );
    let remaining = (1 - t) * segLen;
    for (let j = i + 1; j < polyline.length - 1; j++) {
        remaining += calculateDistance(
            polyline[j][0], polyline[j][1],
            polyline[j + 1][0], polyline[j + 1][1]
        );
    }
    return Math.max(0, remaining);
}

// Track the last snapped route index for efficient searching
let lastSnappedRouteIndex = 0;
/** For turn detection only: monotonic polyline vertex index (never goes backwards). */
let lastTurnDetectRouteVertexIndex = 0;
// Maximum distance from route to snap (meters). Beyond this, use raw GPS.
const SNAP_TO_ROUTE_MAX_DISTANCE = 50; // Increased from 40 to cover typical GPS drift
/**
 * getTurnDirectionText function
 * @function getTurnDirectionText
 * @param {*} direction - Parameter description
 * @returns {*} Return value description
 */
function getTurnDirectionText(direction) {
    const directionMap = {
        'sharp_left': 'turn sharply left',
        'sharp-left': 'turn sharply left',
        'left': 'turn left',
        'slight_left': 'keep left',
        'slight-left': 'keep left',
        'straight': 'continue straight',
        'slight_right': 'keep right',
        'slight-right': 'keep right',
        'right': 'turn right',
        'sharp_right': 'turn sharply right',
        'sharp-right': 'turn sharply right',
        'uturn': 'make a U-turn',
        'u-turn': 'make a U-turn',
        'exit': 'take the exit',
        'exit_right': 'take the exit on the right',
        'exit-right': 'take the exit on the right',
        'exit_left': 'take the exit on the left',
        'exit-left': 'take the exit on the left',
        'merge': 'merge',
        'roundabout': 'enter the roundabout',
        'destination': 'arrive at your destination'
    };
    return directionMap[direction] || 'continue';
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

    // Calculate remaining distance from current position to destination
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

    // Check if we should announce at this distance
    for (const announcementDistance of DESTINATION_ANNOUNCEMENT_DISTANCES) {
        // Announce when within range (with hysteresis to avoid repeated announcements)
        if (remainingDistance <= announcementDistance && lastDestinationAnnouncementDistance > announcementDistance + 100) {
            let message = '';
            const distUnit = getDistanceUnit();

            // Convert distances based on user preference
            if (announcementDistance === 10000) {
                const displayDist = distUnit === 'mi' ? (10 * 0.621371).toFixed(1) : '10';
                message = `${displayDist} ${distUnit} to destination`;
            } else if (announcementDistance === 5000) {
                const displayDist = distUnit === 'mi' ? (5 * 0.621371).toFixed(1) : '5';
                message = `${displayDist} ${distUnit} to destination`;
            } else if (announcementDistance === 2000) {
                const displayDist = distUnit === 'mi' ? (2 * 0.621371).toFixed(1) : '2';
                message = `${displayDist} ${distUnit} to destination`;
            } else if (announcementDistance === 1000) {
                const displayDist = distUnit === 'mi' ? (1 * 0.621371).toFixed(1) : '1';
                message = `${displayDist} ${distUnit} to destination`;
            } else if (announcementDistance === 500) {
                // 500 meters = ~1640 feet = ~0.31 miles
                if (distUnit === 'mi') {
                    message = `1600 feet to destination`;
                } else {
                    message = `500 meters to destination`;
                }
            } else if (announcementDistance === 100) {
                message = `Arriving at destination`;
            }

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
    const directionText = getTurnDirectionText(direction);
    const streetName = turnInfo.streetName || '';
    // Valhalla: verbal_transition_alert_instruction (early), verbal_pre_transition_instruction (immediately prior)
    const verbalAlert = (turnInfo.verbal_transition_alert_instruction || '').trim();
    const verbalPre = (turnInfo.verbal_pre_transition_instruction || '').trim();
    const isExit = direction === 'exit' || direction === 'exit_right' || direction === 'exit_left'
        || direction === 'exit-right' || direction === 'exit-left';
    const isKeep = direction === 'slight_right' || direction === 'slight_left'
        || direction === 'slight-right' || direction === 'slight-left';

    // Exits and keep-right/left on motorways need earlier warnings at highway speeds
    const announcementDistances = isExit ? EXIT_ANNOUNCEMENT_DISTANCES
        : isKeep ? KEEP_ANNOUNCEMENT_DISTANCES
        : TURN_ANNOUNCEMENT_DISTANCES;
    const thresholdSet = isExit ? announcedExitThresholds
        : isKeep ? announcedKeepThresholds
        : announcedTurnThresholds;
    const resetDistance = isExit ? 2500 : isKeep ? 1500 : 600;

    // Check each threshold independently
    for (const announcementDistance of announcementDistances) {
        // Calculate buffer size - use 40% of threshold or max 50m, whichever is smaller
        // This ensures small thresholds like 50m still have a reasonable window (50m -> 20m buffer)
        const bufferSize = Math.min(50, announcementDistance * 0.4);

        // Announce when: (1) within range, (2) not already announced, (3) haven't passed too far
        if (distance <= announcementDistance &&
            !thresholdSet.has(announcementDistance) &&
            distance > announcementDistance - bufferSize) {

            let message = '';
            const streetInfo = streetName ? ` toward ${streetName}` : '';

            if (isExit) {
                const exitSide = (direction === 'exit_left' || direction === 'exit-left')
                    ? ' on the left' : (direction === 'exit_right' || direction === 'exit-right') ? ' on the right' : '';
                if (announcementDistance === 2000) {
                    if (distanceUnit === 'mi') {
                        message = `In about 1 mile, take the exit${exitSide}${streetInfo}`;
                    } else {
                        message = `In 2 kilometers, take the exit${exitSide}${streetInfo}`;
                    }
                } else if (announcementDistance === 800) {
                    if (distanceUnit === 'mi') {
                        message = `In half a mile, prepare to exit${exitSide}${streetInfo}`;
                    } else {
                        message = `In 800 meters, prepare to exit${exitSide}${streetInfo}`;
                    }
                } else if (announcementDistance === 200) {
                    message = `Exit ahead${exitSide}${streetInfo}`;
                } else if (announcementDistance === 100) {
                    message = `Exit now${exitSide}${streetInfo}`;
                }
            } else if (isKeep) {
                const keepDir = (direction === 'slight_left' || direction === 'slight-left') ? 'left' : 'right';
                const streetOnto = streetName ? ` toward ${streetName}` : '';
                if (announcementDistance === 1000) {
                    if (distanceUnit === 'mi') {
                        message = `In half a mile, keep ${keepDir}${streetOnto}`;
                    } else {
                        message = `In 1 kilometer, keep ${keepDir}${streetOnto}`;
                    }
                } else if (announcementDistance === 400) {
                    if (distanceUnit === 'mi') {
                        message = `In 1300 feet, keep ${keepDir}${streetOnto}`;
                    } else {
                        message = `In 400 meters, keep ${keepDir}${streetOnto}`;
                    }
                } else if (announcementDistance === 150) {
                    message = `Keep ${keepDir}${streetOnto}`;
                } else if (announcementDistance === 50) {
                    message = `Keep ${keepDir} now`;
                }
            } else {
                const streetOnto = streetName ? ` onto ${streetName}` : '';

                if (announcementDistance === 500) {
                    if (verbalAlert) {
                        message = verbalAlert;
                    } else if (distanceUnit === 'mi') {
                        message = `In 1600 feet, ${directionText}${streetOnto}`;
                    } else {
                        message = `In 500 meters, ${directionText}${streetOnto}`;
                    }
                } else if (announcementDistance === 200) {
                    if (distanceUnit === 'mi') {
                        message = `In 600 feet, ${directionText}${streetOnto}`;
                    } else {
                        message = `In 200 meters, ${directionText}${streetOnto}`;
                    }
                } else if (announcementDistance === 100) {
                    if (verbalPre) {
                        message = verbalPre;
                    } else if (distanceUnit === 'mi') {
                        message = `In 300 feet, ${directionText}${streetOnto}`;
                    } else {
                        message = `In 100 meters, ${directionText}${streetOnto}`;
                    }
                } else if (announcementDistance === 50) {
                    message = `${directionText}${streetOnto}`;
                }
            }

            if (message) {
                const announceType = isExit ? 'exit' : isKeep ? 'keep' : 'turn';
                console.log(`[Voice] Announcing ${announceType}: ${message} (distance: ${distance.toFixed(0)}m)`);
                speakMessage(message, 'high');
                thresholdSet.add(announcementDistance);
            }
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
const REROUTE_DEBOUNCE_MS = 5000; // Wait 5 seconds between reroute attempts
let lastRerouteDeviation = 0;
let deviationStartTimeCheck = null; // Track when deviation started
let rerouteAttemptCount = 0; // Track reroute attempts for logging

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
function checkRouteDeviation(lat, lon) {
    // Check if auto-reroute is enabled
    if (!autoRerouteOnDeviationEnabled) {
        return;
    }

    if (!routePolyline || routePolyline.length === 0) return;

    const snap = snapToRoutePolyline(lat, lon, routePolyline, lastSnappedRouteIndex);
    const minDistance = snap.distance;

    if (!routeJoinConfirmedForDeviation) {
        if (minDistance <= ROUTE_JOIN_GATE_METERS) {
            routeJoinConfirmedForDeviation = true;
            if (deviationStartTimeCheck) deviationStartTimeCheck = null;
            console.log('[Rerouting] Route join detected — deviation monitoring active');
        } else {
            if (deviationStartTimeCheck) deviationStartTimeCheck = null;
            return;
        }
    }

    const now = Date.now();

    // If deviation > 50 meters
    if (minDistance > DEVIATION_THRESHOLD_METERS) {
        // Start tracking deviation time if not already
        if (!deviationStartTimeCheck) {
            deviationStartTimeCheck = now;
            console.log(`[Rerouting] Deviation started: ${minDistance.toFixed(0)}m off route`);
        }

        const deviationDuration = now - deviationStartTimeCheck;

        // Only reroute if deviated for more than 10 seconds
        if (deviationDuration >= DEVIATION_TIME_THRESHOLD_MS) {
            const timeSinceLastReroute = now - lastRerouteTime;

            // Only reroute if enough time has passed (debounce)
            if (timeSinceLastReroute > REROUTE_DEBOUNCE_MS) {
                rerouteAttemptCount++;
                console.log(`[Rerouting] Deviation confirmed: ${minDistance.toFixed(0)}m for ${(deviationDuration / 1000).toFixed(1)}s (attempt #${rerouteAttemptCount})`);

                // Convert deviation distance to user's preferred units
                let deviationDisplay;
                if (distanceUnit === 'mi') {
                    // Convert meters to feet for imperial users
                    const deviationFeet = Math.round(minDistance * 3.28084);
                    deviationDisplay = `${deviationFeet} ft`;
                } else {
                    deviationDisplay = `${minDistance.toFixed(0)} m`;
                }

                sendNotification('🔄 Route Deviation', `You are ${deviationDisplay} off route for ${(deviationDuration / 1000).toFixed(0)}s. Recalculating...`, 'warning');
                triggerAutomaticRerouteWithHazardHandling(lat, lon);
                lastRerouteTime = now;
                deviationStartTimeCheck = null; // Reset after reroute
            } else {
                console.log(`[Rerouting] Deviation ${minDistance.toFixed(0)}m for ${(deviationDuration / 1000).toFixed(1)}s - debouncing (${(REROUTE_DEBOUNCE_MS - timeSinceLastReroute).toFixed(0)}ms remaining)`);
            }
        } else {
            console.log(`[Rerouting] Deviation ${minDistance.toFixed(0)}m - waiting for ${((DEVIATION_TIME_THRESHOLD_MS - deviationDuration) / 1000).toFixed(1)}s more`);
        }

        lastRerouteDeviation = minDistance;
    } else {
        // Back on route - reset deviation tracking
        if (deviationStartTimeCheck) {
            console.log(`[Rerouting] Back on route (${minDistance.toFixed(0)}m from route)`);
            deviationStartTimeCheck = null;
        }
    }
}

/**
 * Trigger automatic reroute with hazard handling
 * This enhanced version handles unavoidable hazards gracefully
 */
async function triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon) {
    try {
        const destination = resolveNavigationDestination();
        if (!destination) {
            console.log('[Rerouting] No destination stored, cannot reroute');
            return;
        }

        if (!window.lastCalculatedRoute) {
            console.log('[Rerouting] No route context, cannot reroute');
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

            // Update route on map
            updateRouteOnMap(newRoute);

            // Log rerouting event
            logReroutingEvent(currentLat, currentLon, destination, newRoute, hazardCount);

            // Announce reroute via voice
            // FIX: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
            if (voiceAnnouncementsEnabled) {
                const distUnit = getDistanceUnit();
                const displayDist = convertDistance(newRoute.distance_km);
                let voiceMsg = `Route recalculated. New distance: ${displayDist} ${distUnit}, time: ${newRoute.duration_minutes} minutes`;
                if (hazardCount > 0) {
                    voiceMsg += `. Warning: ${hazardCount} hazard${hazardCount > 1 ? 's' : ''} on route.`;
                }
                speakMessage(voiceMsg, 'high');
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
        }
    } catch (error) {
        console.error('[Rerouting] Error during automatic reroute:', error);
        if (rerouteFailureRetryCount === 0) {
            sendNotification('❌ Rerouting Error', 'Network or server error. Retrying automatically…', 'error');
        }
        scheduleAutomaticRerouteRetry();
    }
}

/**
 * Handle unavoidable hazards on route
 * Shows user-friendly notification with hazard details
 */
function handleUnavoidableHazards(route, hazardsList, hazardCount) {
    console.log(`[Rerouting] Route has ${hazardCount} unavoidable hazards`);

    // Group hazards by type
    const hazardTypes = {};
    hazardsList.forEach(hazard => {
        const type = hazard.type || 'unknown';
        hazardTypes[type] = (hazardTypes[type] || 0) + 1;
    });

    // Build hazard summary
    const hazardSummary = Object.entries(hazardTypes)
        .map(([type, count]) => `${count}x ${type.replace(/_/g, ' ')}`)
        .join(', ') || 'See map for hazard markers along this route.';

    // Show detailed notification
    const message = `⚠️ ${hazardCount} hazard${hazardCount > 1 ? 's' : ''} cannot be avoided on any route to destination:\n${hazardSummary}`;

    // Display in UI (use a modal or prominent notification)
    showUnavoidableHazardsModal(hazardTypes, hazardCount);

    console.log(`[Rerouting] Unavoidable hazards: ${hazardSummary}`);
}

/**
 * Show modal for unavoidable hazards
 */
function showUnavoidableHazardsModal(hazardTypes, totalCount) {
    // Check if modal already exists
    let modal = document.getElementById('unavoidableHazardsModal');
    if (!modal) {
        // Create modal
        modal = document.createElement('div');
        modal.id = 'unavoidableHazardsModal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 10001;
            max-width: 320px;
            text-align: center;
        `;
        document.body.appendChild(modal);
    }

    // Build hazard list HTML
    const hazardListHtml = Object.entries(hazardTypes)
        .map(([type, count]) => {
            const icon = getHazardIcon(type);
            return `<div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #fff3e0; border-radius: 8px; margin: 5px 0;">
                <span style="font-size: 20px;">${icon}</span>
                <span style="flex: 1; text-align: left;">${type.replace(/_/g, ' ')}</span>
                <span style="font-weight: bold; color: #e65100;">${count}</span>
            </div>`;
        })
        .join('');

    modal.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
        <h3 style="margin: 0 0 10px 0; color: #e65100;">Unavoidable Hazards</h3>
        <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
            ${totalCount} hazard${totalCount > 1 ? 's' : ''} on all routes to destination
        </p>
        <div style="margin-bottom: 15px;">
            ${hazardListHtml}
        </div>
        <div style="display: flex; gap: 10px;">
            <button onclick="closeUnavoidableHazardsModal()" style="flex: 1; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                Continue Anyway
            </button>
            <button onclick="openHazardSettings()" style="flex: 1; padding: 12px; background: #2196F3; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                Adjust Settings
            </button>
        </div>
    `;

    // Add backdrop
    let backdrop = document.getElementById('unavoidableHazardsBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'unavoidableHazardsBackdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
        `;
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
    const modal = document.getElementById('unavoidableHazardsModal');
    const backdrop = document.getElementById('unavoidableHazardsBackdrop');
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
    const icons = {
        'camera': '📷',
        'traffic_light': '🚦',
        'police': '👮',
        'accident': '🚗💥',
        'roadworks': '🚧',
        'traffic_jam': '🚗',
        'hazard': '⚠️',
        'toll': '💰',
        'caz': '🏙️'
    };
    return icons[type] || '⚠️';
}

/**
 * Log rerouting event for debugging and analytics
 */
function logReroutingEvent(startLat, startLon, destination, route, hazardCount) {
    const event = {
        timestamp: new Date().toISOString(),
        type: 'automatic_reroute',
        start: { lat: startLat, lon: startLon },
        destination: destination,
        route: {
            distance_km: route.distance_km,
            duration_minutes: route.duration_minutes,
            hazard_count: hazardCount
        },
        settings: {
            avoid_cameras: localStorage.getItem('pref_cameras') !== 'false',  // Default: true
            avoid_tolls: isAvoidTollsEnabled(),
            avoid_caz: localStorage.getItem('pref_caz') !== 'false'           // Default: true
        }
    };

    // Store in sessionStorage for debugging
    const rerouteLog = JSON.parse(sessionStorage.getItem('rerouteLog') || '[]');
    rerouteLog.push(event);
    sessionStorage.setItem('rerouteLog', JSON.stringify(rerouteLog.slice(-20))); // Keep last 20 events

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
function calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula for distance calculation
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Return in meters
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
    if (!hazardsPayload) return [];
    if (Array.isArray(hazardsPayload)) return hazardsPayload;
    const out = [];
    if (Array.isArray(hazardsPayload.cameras)) out.push(...hazardsPayload.cameras);
    if (Array.isArray(hazardsPayload.reports)) out.push(...hazardsPayload.reports);
    return out;
}

function isCameraHazardType(typeStr) {
    if (typeStr == null || typeStr === '') return false;
    const t = String(typeStr).toLowerCase();
    if (CAMERA_HAZARD_TYPES.includes(t)) return true;
    return t.includes('camera') || t === 'speed_camera' || t === 'traffic_light_camera';
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
    const m = Math.max(0, Number(distanceM) || 0);
    if (distanceUnit === 'mi') {
        if (m < 402) {
            return `${Math.round(m * 3.28084)} feet`;
        }
        const miles = m / 1609.34;
        return miles < 10 ? `${miles.toFixed(1)} miles` : `${Math.round(miles)} miles`;
    }
    if (m < 1000) {
        return `${Math.round(m)} meters`;
    }
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

function checkNearbyHazards(lat, lon) {
    if (_voyagrIsOffline || !navigator.onLine) return;
    fetch(`/api/hazards/nearby?lat=${lat}&lon=${lon}&radius=0.5`)
        .then(response => response.json())
        .then(data => {
            if (!data.success || !data.hazards) return;
            const list = flattenNearbyHazardsPayload(data.hazards);
            if (list.length === 0) return;
            list.forEach(hazard => {
                if (hazard.lat == null || hazard.lon == null) return;
                const distance = hazard.distance_meters != null
                    ? Number(hazard.distance_meters)
                    : calculateDistance(lat, lon, hazard.lat, hazard.lon);
                const isCamera = isCameraHazardType(hazard.type);
                const alertDist = isCamera ? cameraAlertDistance : HAZARD_WARNING_DISTANCE;

                if (distance < alertDist) {
                    announceCameraOrHazard(hazard, distance, { unavoidableRouteCamera: false });
                }
            });
        })
        .catch(error => console.log('Hazard check error:', error));
}

/**
 * Alerts for cameras already attached to the active route (always "on path"),
 * including when nearby DB query misses due to bbox vs radius.
 */
function checkRouteHazardCamerasAhead(lat, lon) {
    if (!routeInProgress || cameraAlertType === 'off') return;
    const route = window.lastCalculatedRoute;
    const list = route && Array.isArray(route.hazards) ? route.hazards : [];
    if (list.length === 0) return;
    list.forEach(hazard => {
        if (!isCameraHazardType(hazard.type)) return;
        if (hazard.lat == null || hazard.lon == null) return;
        const distance = calculateDistance(lat, lon, hazard.lat, hazard.lon);
        if (distance < cameraAlertDistance) {
            announceCameraOrHazard(hazard, distance, { unavoidableRouteCamera: true });
        }
    });
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
            Object.keys(state.preferences).forEach(key => {
                if (state.preferences[key]) {
                    localStorage.setItem('pref_' + key, state.preferences[key]);
                }
            });
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

    // Save current app state
    saveAppState();

    // Short delay to show status message
    setTimeout(() => {
        window.location.reload(true); // Force reload from server
    }, 500);
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
                await registration.update();

                if (registration.waiting) {
                    // New version waiting - activate it
                    showStatus('📥 New update found! Installing...', 'success');
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
        swapBtn.style.background = '#e3f2fd';
        swapBtn.style.borderColor = '#2196F3';
        setTimeout(() => {
            swapBtn.style.background = '#f5f5f5';
            swapBtn.style.borderColor = '#ddd';
        }, 300);
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
        if (fieldId === 'end') {
            const histEl = document.getElementById('searchHistoryDropdown');
            if (histEl) {
                histEl.classList.remove('show');
                histEl.innerHTML = '';
            }
            dropdown.innerHTML = '<div class="autocomplete-loading">Loading…</div>';
            dropdown.classList.add('show');
            renderEndDestinationSuggestions(dropdown).catch((err) => {
                console.error('[Recent destinations]', err);
                dropdown.innerHTML = '<div class="autocomplete-no-results">Could not load recent destinations.</div>';
            });
            return;
        }
        dropdown.classList.remove('show');
        return;
    }

    dropdown.innerHTML = '<div class="autocomplete-loading">🔍 Searching...</div>';
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
            dropdown.innerHTML = '<div class="autocomplete-no-results">❌ Search failed. Try again.</div>';
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
    const dropdown = getAutocompleteDropdown(fieldId);
    if (!dropdown) return;

    if (!results || results.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-no-results">No results found</div>';
        return;
    }

    dropdown.innerHTML = '';

    results.forEach((result) => {
        const icon = getLocationIcon(result);
        let name = result.name || result.address?.road || result.address?.city || result.display_name || 'Location';
        const houseNum = result.address?.house_number;
        if (houseNum && !name.startsWith(houseNum)) {
            name = houseNum + ' ' + name;
        }
        const address = result.display_name || '';
        const shortAddress = address.length > 60 ? address.substring(0, 60) + '...' : address;
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const item = document.createElement('div');
        item.className = 'autocomplete-item';

        const iconEl = document.createElement('div');
        iconEl.className = 'autocomplete-item-icon';
        iconEl.textContent = icon;

        const textEl = document.createElement('div');
        textEl.className = 'autocomplete-item-text';

        const nameEl = document.createElement('div');
        nameEl.className = 'autocomplete-item-name';
        nameEl.textContent = name;

        const addrEl = document.createElement('div');
        addrEl.className = 'autocomplete-item-address';
        addrEl.textContent = shortAddress;

        textEl.appendChild(nameEl);
        textEl.appendChild(addrEl);
        item.appendChild(iconEl);
        item.appendChild(textEl);

        item.onclick = () => selectAutocompleteResult(fieldId, lat, lon, name);

        dropdown.appendChild(item);
    });
}
/**
 * getLocationIcon function
 * @function getLocationIcon
 * @param {*} result - Parameter description
 * @returns {*} Return value description
 */
function getLocationIcon(result) {
    const type = result.type || '';
    const category = result.category || '';

    if (type === 'house' || category === 'building') return '🏠';
    if (type === 'street' || category === 'highway') return '🛣️';
    if (type === 'city' || type === 'town' || category === 'place') return '🏙️';
    if (type === 'restaurant' || category === 'amenity') return '🍽️';
    if (type === 'parking' || category === 'parking') return '🅿️';
    if (type === 'fuel' || category === 'fuel') return '⛽';
    if (type === 'hospital' || category === 'hospital') return '🏥';
    if (type === 'school' || category === 'school') return '🏫';
    if (type === 'shop' || category === 'shop') return '🛍️';
    if (type === 'airport' || category === 'airport') return '✈️';
    if (type === 'railway' || category === 'railway') return '🚂';
    if (type === 'bus_stop' || category === 'bus') return '🚌';
    if (type === 'hotel' || category === 'hotel') return '🏨';
    if (type === 'museum' || category === 'museum') return '🏛️';
    if (type === 'park' || category === 'park') return '🌳';
    if (type === 'beach' || category === 'beach') return '🏖️';
    if (type === 'mountain' || category === 'mountain') return '⛰️';
    if (type === 'lake' || category === 'water') return '🌊';
    return '📍';
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

    if (fieldId === 'end') {
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
        const response = await fetch(`${NOMINATIM_API}?q=${encodeURIComponent(trimmedAddress)}&limit=1`, {
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
 * @param {*} routeData - Parameter description
 * @returns {*} Return value description
 */
function startTurnByTurnNavigation(routeData) {
    if (!routeData || !routeData.geometry) {
        showStatus('No route geometry available', 'error');
        return;
    }

    routeInProgress = true;
    currentStepIndex = 0;
    currentRouteSteps = routeData.maneuvers || [];
    lastSnappedRouteIndex = 0;
    lastTurnDetectRouteVertexIndex = 0;
    routeJoinConfirmedForDeviation = false;
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
        routePolyline = decodePolyline(routeData.geometry, 6);
        console.log('Route polyline decoded:', routePolyline.length, 'points');
        console.log('Route maneuvers:', currentRouteSteps.length, 'steps');

        persistActiveRoute();
        precacheRouteTiles(routePolyline);

        // Validate decoded polyline
        if (!routePolyline || routePolyline.length === 0) {
            console.error('[Navigation] Failed to decode route geometry - polyline is empty');
            showStatus('Error: Invalid route geometry', 'error');
            return;
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
        zoomFollowBtn.classList.toggle('active', zoomAndFollowEnabled);
        // Set initial visual state based on current setting
        if (zoomAndFollowEnabled) {
            zoomFollowBtn.style.background = '#FF9800';  // Orange when enabled
            zoomFollowBtn.innerHTML = '📍';
        } else {
            zoomFollowBtn.style.background = '#9E9E9E';  // Gray when disabled
            zoomFollowBtn.innerHTML = '🔓';
        }
    }

    // Show journey overview button during navigation
    const journeyOverviewBtn = document.getElementById('journeyOverviewBtn');
    if (journeyOverviewBtn) {
        journeyOverviewBtn.style.display = 'block';
    }
    updateRoadReportFabVisibility();

    // ===== SHOW SPEED WIDGET during navigation =====
    // Speed widget shows current GPS speed and road speed limit for safety (use consolidated function)
    updateSpeedWidgetVisibility();

    // ===== SHOW TURN INSTRUCTION WIDGET during navigation =====
    showTurnInstructionWidget();
    // Initialize with first instruction if available - calculate actual distance
    if (currentRouteSteps && currentRouteSteps.length > 0 && routePolyline && routePolyline.length > 0) {
        const firstStep = currentRouteSteps[0];
        // Calculate distance to first maneuver from start
        const firstManeuverIndex = firstStep.begin_shape_index || 0;
        let distanceToFirst = 0;
        if (firstManeuverIndex > 0 && firstManeuverIndex < routePolyline.length) {
            const startPoint = routePolyline[0];
            const firstManeuverPoint = routePolyline[firstManeuverIndex];
            distanceToFirst = calculateDistance(startPoint[0], startPoint[1], firstManeuverPoint[0], firstManeuverPoint[1]);
        } else {
            // Use the step's distance if available
            distanceToFirst = firstStep.distance || 0;
        }
        updateTurnInstructionDisplay({
            distance: distanceToFirst,
            direction: 'straight',
            instruction: firstStep.instruction || 'Follow the route',
            streetName: (firstStep.street_names || [])[0] || '',
            maneuver: firstStep,
            maneuverIndex: 0,
            valhallaType: firstStep.type != null ? firstStep.type : 8,
        });
    }

    // ===== SHOW JOURNEY SUMMARY BAR during navigation =====
    showJourneySummaryBar();

    // ===== SHOW AR AND 3D VIEW BUTTONS during navigation =====
    const arModeBtn = document.getElementById('arModeBtn');
    if (arModeBtn) {
        arModeBtn.style.display = 'flex';
    }
    const driverPerspectiveBtn = document.getElementById('driverPerspectiveToggle');
    if (driverPerspectiveBtn) {
        driverPerspectiveBtn.style.display = 'flex';
        driverPerspectiveBtn.classList.toggle('active', shouldUsePitchedDrivingCamera());
        if (shouldUsePitchedDrivingCamera()) {
            driverPerspectiveBtn.style.background = '#4CAF50';
            driverPerspectiveBtn.style.borderColor = '#4CAF50';
        }
    }

    sendNotification('Navigation Started', 'Turn-by-turn guidance activated', 'success');
    speakMessage('Navigation started. Follow the route.');
    showStatus('🧭 Turn-by-turn navigation active', 'success');
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
    // Show summary if we have a valid route and were actually navigating
    if (window.lastCalculatedRoute && routeInProgress) {
        void persistCompletedTrip(window.lastCalculatedRoute);
        showJourneySummary(window.lastCalculatedRoute);
    }

    routeInProgress = false;
    routeJoinConfirmedForDeviation = false;
    clearRerouteFailureRetries();
    currentStepIndex = 0;
    currentRouteSteps = [];
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

    // ===== HIDE JOURNEY OVERVIEW BUTTON =====
    const journeyOverviewBtn = document.getElementById('journeyOverviewBtn');
    if (journeyOverviewBtn) {
        journeyOverviewBtn.style.display = 'none';
    }
    journeyOverviewActive = false;

    updateRoadReportFabVisibility();

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
        const displayDistance = convertDistance(distanceKm);
        const distUnit = getDistanceUnit();
        turnInfo.innerHTML = `
            <div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">
                <div style="font-size: 14px; color: #666;">Distance to destination</div>
                <div style="font-size: 24px; font-weight: bold; color: #333;">${displayDistance} ${distUnit}</div>
                <div style="font-size: 12px; color: #999; margin-top: 5px;">Route progress: ${((closestIndex / routePolyline.length) * 100).toFixed(0)}%</div>
            </div>
        `;
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
    const icons = {
        'fuel': '⛽',
        'food': '🍽️',
        'parking': '🅿️',
        'charging': '🔌',
        'hospital': '🏥',
        'pharmacy': '💊',
        'groceries': '🛒'
    };
    const icon = icons[type] || '📍';

    // Create modal content
    let modalHTML = `
        <div id="poiModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;">
            <div style="background: white; border-radius: 12px; max-width: 400px; width: 100%; max-height: 80vh; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 18px;">${icon} Nearby ${type === 'groceries' ? 'Groceries' : (type.charAt(0).toUpperCase() + type.slice(1))}</h3>
                        <button onclick="closePOIModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0;">✕</button>
                    </div>
                    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Found ${results.length} locations</p>
                </div>
                <div style="max-height: 50vh; overflow-y: auto; padding: 12px;">
    `;

    results.forEach((poi, index) => {
        // Convert POI distance based on user's unit preference
        let distance;
        if (distanceUnit === 'mi') {
            // Convert meters to feet/miles
            const distanceFeet = poi.distance_m * 3.28084;
            if (distanceFeet < 5280) {
                distance = `${Math.round(distanceFeet)} ft`;
            } else {
                distance = `${(poi.distance_m / 1609.344).toFixed(1)} mi`;
            }
        } else {
            // Metric: meters/km
            if (poi.distance_m < 1000) {
                distance = `${Math.round(poi.distance_m)} m`;
            } else {
                distance = `${(poi.distance_m / 1000).toFixed(1)} km`;
            }
        }
        const brand = poi.brand ? `<span style="color: #667eea; font-weight: 500;">${poi.brand}</span> - ` : '';

        modalHTML += `
            <div style="padding: 12px; margin-bottom: 8px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                    <div style="font-weight: 600; color: #333; font-size: 14px;">${icon} ${brand}${poi.name}</div>
                    <div style="font-size: 12px; color: #667eea; font-weight: 500;">${distance}</div>
                </div>
                ${poi.address ? `<div style="font-size: 11px; color: #666; margin-bottom: 6px;">${poi.address}</div>` : ''}
                ${poi.opening_hours ? `<div style="font-size: 11px; color: #888;">🕒 ${poi.opening_hours}</div>` : ''}
                <button onclick="selectPOI(${poi.lat}, ${poi.lon}, '${poi.name.replace(/'/g, "\\'")}', ${userLat}, ${userLon})"
                    style="width: 100%; margin-top: 8px; background: #667eea; color: white; border: none; border-radius: 6px; padding: 10px; cursor: pointer; font-weight: 500; font-size: 13px;">
                    🚗 Navigate Here
                </button>
            </div>
        `;
    });

    modalHTML += `
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    closePOIModal();

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
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

    const icons = { fuel: '⛽', food: '🍔', parking: '🅿️', charging: '🔌', pharmacy: '💊', hospital: '🏥', groceries: '🛒' };
    const icon = icons[type] || '📍';

    pois.forEach((poi, idx) => {
        if (!window.map) return;

        const el = document.createElement('div');
        el.className = 'poi-marker';
        el.style.cssText = 'font-size: 24px; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));';
        el.textContent = icon;
        el.title = poi.name;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([poi.lon, poi.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(
                `<div style="padding: 8px;">
                    <strong>${poi.name}</strong><br>
                    <span style="font-size: 12px; color: #666;">${poi.address || ''}</span><br>
                    <span style="font-size: 11px; color: #888;">${(poi.distance_m / 1000).toFixed(1)} km away</span>
                    ${poi.phone ? `<br><a href="tel:${poi.phone}" style="font-size: 12px;">${poi.phone}</a>` : ''}
                </div>`
            ))
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

            const trafficColors = {
                low: '#4CAF50', moderate: '#FF9800', heavy: '#FF5722', severe: '#D32F2F'
            };

            let html = '';
            data.all_slots.sort((a, b) => {
                const timeA = a.time.split(':').map(Number);
                const timeB = b.time.split(':').map(Number);
                return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
            });

            data.all_slots.forEach(slot => {
                const color = trafficColors[slot.traffic_level] || '#999';
                const isBest = data.best_time && slot.time === data.best_time.time;
                const barWidth = Math.max(10, Math.min(100, slot.congestion_pct));
                html += `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 6px 8px; border-radius: 6px; ${isBest ? 'background: #e8f5e9; border: 1px solid #81C784;' : 'background: #fafafa;'}">
                        <span style="font-size: 13px; font-weight: ${isBest ? '700' : '500'}; min-width: 45px;">${slot.is_now ? 'Now' : slot.time}</span>
                        <div style="flex: 1; background: #eee; border-radius: 4px; height: 8px; overflow: hidden;">
                            <div style="width: ${barWidth}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
                        </div>
                        <span style="font-size: 11px; color: ${color}; font-weight: 600; min-width: 60px; text-align: right;">${slot.traffic_level}</span>
                        ${isBest ? '<span style="font-size: 11px; color: #388E3C; font-weight: 700;">BEST</span>' : ''}
                    </div>`;
            });

            html += `<div style="font-size: 11px; color: #888; margin-top: 8px;">Source: ${data.source} | Analysed at ${data.analysed_at}</div>`;

            if (data.best_time && !data.best_time.is_now) {
                html += `<button onclick="applyBestDepartureTime('${data.best_time.time}')" style="margin-top: 8px; width: 100%; padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                    Set departure to ${data.best_time.time}
                </button>`;
            }

            slotsDiv.innerHTML = html;
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
    // Create notification element
    const notifContainer = document.getElementById('notificationContainer');
    if (!notifContainer) {
        console.log('Notification container not found');
        return;
    }

    const notif = document.createElement('div');
    notif.className = `in-app-notification notification-${type}`;
    notif.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
                <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
                <div style="font-size: 14px; opacity: 0.9;">${message}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; cursor: pointer; font-size: 18px;">×</button>
        </div>
    `;

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
const ENV_HINT_MIN_MS = 45000;

/**
 * In-app (+ system notification if permitted) for connectivity / GPS / volume reminders.
 * Uses its own throttle so it is not blocked by generic sendNotification throttling.
 * @param {'offline'|'online'|'gps'|'volume'} channel
 */
function sendEnvironmentHint(channel, title, message, type = 'warning') {
    const now = Date.now();
    if (now - (_envHintLast[channel] || 0) < ENV_HINT_MIN_MS) return;
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
        const offlineTitle = 'No internet connection';
        const offlineMsg =
            'You are offline. New routes, search, and live data need a connection. Saved routes and GPS can still work when location is allowed.';

        const notifyOffline = () => sendEnvironmentHint('offline', offlineTitle, offlineMsg, 'warning');
        const notifyOnline = () =>
            sendEnvironmentHint('online', 'Back online', 'Connection restored. Live routing and updates are available again.', 'success');

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
                                    'Location blocked',
                                    'Enable location access for this site in your browser or system settings so GPS navigation and position updates work.',
                                    'warning'
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
    const line =
        'Turn your device volume up to hear turn-by-turn directions.';
    const detail = 'Browsers cannot detect mute or low volume.';

    if (typeof voiceAnnouncementsEnabled !== 'undefined' && voiceAnnouncementsEnabled) {
        try {
            speakMessage('Turn your device volume up to hear spoken directions.', 'high');
        } catch (e) {
            console.log('[EnvHint] volume TTS:', e);
        }
    }

    let chip = document.getElementById('volumeHintBanner');
    if (chip) chip.remove();
    chip = document.createElement('div');
    chip.id = 'volumeHintBanner';
    chip.setAttribute('role', 'status');
    chip.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:max(108px, calc(env(safe-area-inset-bottom, 0px) + 88px))',
        'transform:translateX(-50%)',
        'z-index:10001',
        'max-width:min(420px,92vw)',
        'padding:14px 16px',
        'background:#E3F2FD',
        'border:2px solid #2196F3',
        'border-radius:14px',
        'box-shadow:0 8px 28px rgba(0,0,0,.22)',
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
        'font-size:15px',
        'color:#0d47a1',
        'text-align:center'
    ].join(';');
    chip.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin:-4px -4px 4px 0;">
            <button type="button" id="volumeHintDismiss" aria-label="Dismiss" title="Dismiss"
                style="border:none;background:transparent;color:#1565c0;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;">×</button>
        </div>
        <strong style="display:block;margin-bottom:6px;">🔊 Check volume</strong>
        <span>${line}</span><br>
        <span style="font-size:13px;opacity:.9">${detail}</span>
        <div style="margin-top:10px;">
            <button type="button" id="volumeHintOk" style="padding:8px 18px;border:none;border-radius:10px;background:#2196F3;color:#fff;font-weight:600;cursor:pointer;font-size:14px;">OK</button>
        </div>
    `;
    document.body.appendChild(chip);
    // Must query inside `chip` (or append before getElementById): detached nodes are not in document, so getElementById returned null and clicks did nothing.
    const dismiss = chip.querySelector('#volumeHintDismiss');
    if (dismiss) dismiss.onclick = () => chip.remove();
    const ok = chip.querySelector('#volumeHintOk');
    if (ok) ok.onclick = () => chip.remove();

    setTimeout(() => {
        const el = document.getElementById('volumeHintBanner');
        if (el) el.remove();
    }, 14000);

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification('Voice guidance', {
                body: `${line} ${detail}`,
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

    // Map preference names to button IDs. Note: 'tolls' was removed — the canonical
    // toll avoidance toggle now lives in Route Preferences (id "avoidTollRoads") and
    // is handled by toggleAvoidancePreference('tollRoads').
    const buttonIdMap = {
        'caz': 'avoidCAZ',
        'cameras': 'avoidCameras',
        'trafficLightsAvoid': 'avoidTrafficLights',
        'railwayCrossingsAvoid': 'avoidRailwayCrossings',
        'variableSpeedAlerts': 'variableSpeedAlerts'
    };

    const buttonId = buttonIdMap[pref] || ('avoid' + pref.charAt(0).toUpperCase() + pref.slice(1));
    const button = document.getElementById(buttonId);

    if (!button) {
        console.warn('[Preferences] Button not found for preference:', pref, 'ID:', buttonId);
        return;
    }

    button.classList.toggle('active');
    const isActive = button.classList.contains('active');
    localStorage.setItem('pref_' + pref, isActive ? 'true' : 'false');

    // Update visual state with proper styling
    if (isActive) {
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }

    // Handle specific preference behaviors
    if (pref === 'caz') {
        console.log('[Settings] CAZ avoidance:', isActive ? 'enabled' : 'disabled');
        showStatus(`🚫 CAZ avoidance ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'variableSpeedAlerts') {
        console.log('[Settings] Variable speed alerts:', isActive ? 'enabled' : 'disabled');
        showStatus(`📊 Variable speed alerts ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'cameras') {
        console.log('[Settings] Optimised routing:', isActive ? 'enabled' : 'disabled');
        showStatus(`⚡ Optimised routing ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'trafficLightsAvoid') {
        console.log('[Settings] Avoid traffic lights:', isActive ? 'enabled' : 'disabled');
        showStatus(`🚦 Traffic light avoidance ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'railwayCrossingsAvoid') {
        console.log('[Settings] Avoid railway crossings:', isActive ? 'enabled' : 'disabled');
        showStatus(`🚂 Railway crossing avoidance ${isActive ? 'enabled' : 'disabled'}`, 'info');
    }

    // Save all settings to persistent storage
    saveAllSettings();
}

const HAZARD_CAMERA_SUBTYPES = [
    'camera_speed',
    'camera_red_light',
    'camera_average_speed',
    'camera_bus_lane',
    'camera_mobile',
    'camera_other'
];

function hazardPrefEnabled(pref) {
    if (!pref) return true;
    return pref.enabled === true || pref.enabled === 1;
}

function applyHazardToggleStyles(button, enabled) {
    if (!button) return;
    if (enabled) {
        button.classList.add('active');
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.classList.remove('active');
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }
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
    // 'tolls' removed from this map: the "Avoid Toll Roads" toggle now lives in
    // Route Preferences and is hydrated by loadRoutePreferences() / Route Prefs init.
    const buttonIdMap = {
        'caz': 'avoidCAZ',
        'cameras': 'avoidCameras',
        'trafficLightsAvoid': 'avoidTrafficLights',
        'railwayCrossingsAvoid': 'avoidRailwayCrossings',
        'variableSpeedAlerts': 'variableSpeedAlerts'
    };

    // Preferences that default to TRUE (enabled) when not set
    const defaultEnabledPrefs = ['caz', 'cameras', 'trafficLightsAvoid', 'railwayCrossingsAvoid'];

    const prefs = ['caz', 'cameras', 'trafficLightsAvoid', 'railwayCrossingsAvoid', 'variableSpeedAlerts'];
    prefs.forEach(pref => {
        const saved = localStorage.getItem('pref_' + pref);
        const buttonId = buttonIdMap[pref];
        const button = document.getElementById(buttonId);

        if (button) {
            // Tolls, CAZ, cameras, traffic lights, railway: default enabled if not set
            // variableSpeedAlerts: default off if not set
            const isDefaultEnabled = defaultEnabledPrefs.includes(pref);
            const isEnabled = saved === null ? isDefaultEnabled : saved === 'true';

            if (isEnabled) {
                button.classList.add('active');
                button.style.background = '#4CAF50';
                button.style.borderColor = '#4CAF50';
                button.style.color = 'white';
                console.log('[Settings] Loaded preference:', pref, '= enabled', saved === null ? '(default)' : '');
            } else {
                button.classList.remove('active');
                button.style.background = '#ddd';
                button.style.borderColor = '#999';
                button.style.color = '#333';
                console.log('[Settings] Loaded preference:', pref, '= disabled');
            }
        } else {
            console.warn('[Settings] Button not found for preference:', pref, 'ID:', buttonId);
        }
    });

    loadHazardCameraTogglesFromApi();

    // ===== LOAD GESTURE CONTROL PREFERENCE =====
    const gestureSaved = localStorage.getItem('gestureEnabled');
    if (gestureSaved === 'true') {
        const button = document.getElementById('gestureEnabled');
        if (button) {
            button.classList.add('active');
            button.style.background = '#4CAF50';
            button.style.borderColor = '#4CAF50';
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
            button.classList.add('active');
            button.style.background = '#4CAF50';
            button.style.borderColor = '#4CAF50';
            batterySavingMode = true;
            console.log('[Battery] Battery saving mode restored from localStorage');
        }
    }
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
    if (distance && time) {
        // Extract km value from distance (handle both "8.64 km" string and numeric formats)
        let distanceKm = 0;
        if (typeof distance === 'string') {
            distanceKm = parseFloat(distance) || 0;
        } else {
            distanceKm = parseFloat(distance) || 0;
        }

        // Store km value in data attribute for unit conversion
        const distanceEl = document.getElementById('distance');
        distanceEl.dataset.km = distanceKm;
        distanceEl.textContent = convertDistance(distanceKm) + ' ' + getDistanceUnit();

        document.getElementById('time').textContent = time;
        document.getElementById('fuelCost').textContent = fuelCost || '-';
        document.getElementById('tollCost').textContent = tollCost || '-';
        tripInfo.classList.add('show');
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
calculateRoute = function () {
    originalCalculateRoute();
    // Trip info will be updated when route is calculated
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
    const el = document.getElementById('voyagr-add-homescreen-banner');
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

    const existing = document.getElementById('voyagr-add-homescreen-banner');
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

    if (document.getElementById('voyagr-add-homescreen-banner')) return;

    const bar = document.createElement('div');
    bar.id = 'voyagr-add-homescreen-banner';
    bar.setAttribute('data-mode', mode);
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Add Voyagr to home screen');
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a237e;color:#fff;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;font-size:14px;box-shadow:0 -4px 16px rgba(0,0,0,0.25);';

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
    btnLater.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.5);background:transparent;color:#fff;cursor:pointer;font-size:13px;';
    btnLater.onclick = () => dismissAddToHomeScreenForDays(14);

    if (mode === 'ios') {
        msg.innerHTML = '<strong>Add Voyagr to your home screen</strong><br><span style="opacity:0.92;font-size:12px;">Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>';
        actions.appendChild(btnLater);
    } else if (mode === 'install') {
        msg.innerHTML = '<strong>Install Voyagr</strong><span style="opacity:0.92;font-size:12px;display:block;margin-top:4px;">Add this app to your home screen for quick access.</span>';
        const btnInstall = document.createElement('button');
        btnInstall.type = 'button';
        btnInstall.textContent = 'Add to Home screen';
        btnInstall.style.cssText = 'padding:8px 14px;border-radius:8px;border:none;background:#7c4dff;color:#fff;cursor:pointer;font-weight:600;font-size:13px;';
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
        msg.innerHTML = '<strong>Add Voyagr to your home screen</strong><span style="opacity:0.92;font-size:12px;display:block;margin-top:4px;">Use your browser menu: Install app or Add to Home Screen.</span>';
        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.textContent = 'Got it';
        btnOk.style.cssText = 'padding:8px 14px;border-radius:8px;border:none;background:#7c4dff;color:#fff;cursor:pointer;font-weight:600;font-size:13px;';
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

    // Calculate average speed (km/h)
    let avgSpeed = 0;
    if (durationMin > 0) {
        avgSpeed = distanceKm / (durationMin / 60);
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
        toggleBtn.classList.toggle('active', window.arModeActive);
        // Correct styling for toggle switch
        if (window.arModeActive) {
            toggleBtn.style.background = '#4CAF50';
            toggleBtn.style.borderColor = '#4CAF50';
        } else {
            toggleBtn.style.background = '#ddd';
            toggleBtn.style.borderColor = '#999';
        }
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
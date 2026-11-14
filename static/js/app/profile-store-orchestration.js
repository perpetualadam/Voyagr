/**
 * @file Multi-profile local storage orchestration (guest vs signed-in snapshots).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
  'use strict';

  var runtime = null;
  var VOYAGR_PROFILE_STORE_KEY = 'voyagr_profiles_v1';
  var activeProfileId = 'guest';
  var localProfileLoaded = false;
  var activePreferenceSnapshot = {};
  function rt() {
    if (!runtime) {
      throw new Error('[ProfileStore] Orchestration runtime not bound');
    }
    return runtime;
  }
  function getProfileStore() {
    try {
      return JSON.parse(localStorage.getItem(VOYAGR_PROFILE_STORE_KEY) || '{}');
    } catch (_e) {
      return {};
    }
  }
  function applyRuntimeProfileSnapshot(snapshot) {
    var targetSettings = {};
    try {
      targetSettings = JSON.parse(snapshot?.voyagr_all_settings || '{}');
    } catch (_e) {/* empty target */}
    targetSettings = Object.assign({
      unit_distance: 'mi',
      unit_currency: 'GBP',
      unit_speed: 'mph',
      unit_temperature: 'celsius',
      vehicleType: 'petrol_diesel',
      routingMode: 'auto',
      mapTheme: 'standard',
      uiTheme: 'light'
    }, targetSettings);
    var fp = targetSettings && targetSettings.fuelPricing;
    var validFuel = fp && ['automatic', 'manual'].indexOf(fp.mode) >= 0 && ['', 'petrol', 'diesel'].indexOf(fp.category) >= 0 && (fp.manualPrice === null || typeof fp.manualPrice === 'number' && Number.isFinite(fp.manualPrice) && fp.manualPrice >= 0 && fp.manualPrice <= 100);
    localStorage.setItem('fuelPricing', JSON.stringify(validFuel ? fp : {
      mode: 'automatic',
      category: '',
      manualPrice: null
    }));
    localStorage.setItem('voyagr_all_settings', JSON.stringify(targetSettings));
    activePreferenceSnapshot = JSON.parse(JSON.stringify(targetSettings));
    rt().call.loadAllSettings();
    rt().call.applySettingsToUI();
    try {
      if (typeof rt().call.loadSavedRoutes === 'function') {
        rt().call.loadSavedRoutes();
      }
    } catch (e) {
      console.log('[Profiles] Saved route list unavailable');
    }
  }

  // Optional cloud cannot be enabled before category-specific server enforcement exists.
  function scheduleSupabaseProfileSync() {
    return false;
  }
  async function pullProfileSnapshotFromSupabase() {
    return false;
  }
  function persistActiveProfile(nextSnapshot) {
    if (!root.VoyagrLocalData || !localProfileLoaded) return Promise.resolve(false);
    const c = root.VoyagrLocalData.capture();
    let snapshot;
    try {
      if (nextSnapshot && typeof nextSnapshot === 'object') activePreferenceSnapshot = JSON.parse(JSON.stringify(nextSnapshot));
      snapshot = JSON.parse(JSON.stringify(activePreferenceSnapshot));
    } catch (_) {
      return Promise.resolve(false);
    }
    return root.VoyagrLocalData.update('preferences', () => snapshot, c).catch(() => {
      root.VoyagrLocalData.report();
      return false;
    });
  }
  function ensureProfileExists(profileId) {
    // The legacy profile index is read-only recovery input, never a new write target.
    return root.VoyagrLocalStore?.validOwner(profileId) === true;
  }
  async function switchActiveProfile(profileId, options) {
    if (!root.VoyagrLocalData) return false;
    options = options || {};
    profileId = profileId || 'guest';
    const local = root.VoyagrLocalData;
    // Persist outgoing settings under its captured owner before any asynchronous switch.
    const saved = persistActiveProfile();
    localProfileLoaded = false;
    activeProfileId = profileId;
    const c = local.switchOwner(profileId);
    const routesList = document.getElementById('savedRoutesList');
    if (routesList) routesList.textContent = '';
    try {
      await saved;
      await local.ready();
      if (!local.current(c)) return false;
      if (options.importFromProfileId) {
        const source = options.importFromProfileId;
        if (source !== 'guest') throw Error('Only an explicit guest import is supported');
        await local.db().importGuest(profileId, () => local.current(c));
      }
      const prefs = (await local.read('preferences', c)) || {};
      if (!local.current(c)) return false;
      // Existing synchronous settings modules use these keys as a runtime projection.
      const reset = root.VoyagrSettingsSnapshot?.buildResetAllSettingsEntryOrchestrationPlan().execute;
      for (const key of reset?.localStorageKeys || []) localStorage.removeItem(key);
      applyRuntimeProfileSnapshot({
        voyagr_all_settings: JSON.stringify(prefs),
        savedRoutes: '[]'
      });
      localProfileLoaded = true;
      root.dispatchEvent(new CustomEvent('voyagr-local-data-changed'));
      return true;
    } catch (_) {
      local.report();
      return false;
    }
  }
  function resetLocalPreferences() {
    localProfileLoaded = false;
    const reset = root.VoyagrSettingsSnapshot?.buildResetAllSettingsEntryOrchestrationPlan().execute;
    for (const key of reset?.localStorageKeys || []) localStorage.removeItem(key);
    localStorage.setItem('voyagr_all_settings', '{}');
    applyRuntimeProfileSnapshot({
      voyagr_all_settings: '{}'
    });
    localProfileLoaded = true;
  }
  function getActiveProfileId() {
    return activeProfileId;
  }
  function bind(nextRuntime) {
    runtime = nextRuntime;
    // Migration runs lazily through IndexedDB; legacy data is never overwritten here.
  }
  var api = {
    bind: bind,
    resetLocalPreferences: resetLocalPreferences,
    getProfileStore: getProfileStore,
    persistActiveProfile: persistActiveProfile,
    ensureProfileExists: ensureProfileExists,
    switchActiveProfile: switchActiveProfile,
    scheduleSupabaseProfileSync: scheduleSupabaseProfileSync,
    pullProfileSnapshotFromSupabase: pullProfileSnapshotFromSupabase,
    getActiveProfileId: getActiveProfileId
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.VoyagrProfileStoreOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

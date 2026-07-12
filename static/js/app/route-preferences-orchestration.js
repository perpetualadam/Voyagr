/**
 * @file Route and multi-drop preference form orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[RoutePreferences] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RP() { return rt().routePrefs(); }
    function SS() { return rt().settingsSnapshot(); }
    function RS() { return rt().routeSelection(); }

function collectRoutePreferencesDomInput() {
    return {
        avoidHighways: document.getElementById('avoidHighways')?.checked || false,
        preferScenic: document.getElementById('preferScenic')?.checked || false,
        avoidTolls: rt().call.isAvoidTollsEnabled(),
        avoidCAZ: localStorage.getItem('pref_caz') !== 'false',
        preferQuiet: document.getElementById('preferQuiet')?.checked || false,
        avoidUnpaved: document.getElementById('avoidUnpaved')?.checked || false,
        routeOptimization: document.getElementById('routeOptimization')?.value || 'fastest',
        maxDetour: document.getElementById('maxDetour')?.value || 20,
    };
}

function applySaveRoutePreferencesFromPlan(execute) {
    if (!execute || !execute.shouldSave) return;

    localStorage.setItem(execute.storageKey, JSON.stringify(execute.preferences));
    if (execute.saveAllSettings) rt().call.saveAllSettings();
    rt().call.showStatus(execute.successStatusMessage, execute.successStatusType);
}

/**
 * saveRoutePreferences function
 * @function saveRoutePreferences
 * @returns {*} Return value description
 */
function saveRoutePreferences() {
    const routePrefs = RP();
    applySaveRoutePreferencesFromPlan(
        routePrefs.buildSaveRoutePreferencesEntryOrchestrationPlan(
            routePrefs.buildCollectRoutePreferencesInputPlan(collectRoutePreferencesDomInput())
        ).execute
    );
}

/**
 * Read route preference controls from the DOM (source of truth for save).
 * @returns {Object}
 */
function collectRoutePreferencesFormState() {
    return RP().buildRoutePreferencesFormStatePlan(
        RP().buildCollectRoutePreferencesInputPlan(collectRoutePreferencesDomInput())
    );
}

function collectMultiDropDomInput() {
    return {
        optimizeStopOrder: document.getElementById('optimizeStopOrder')?.checked,
        roundTrip: document.getElementById('roundTrip')?.checked,
        trafficAwareRouting: document.getElementById('trafficAwareRouting')?.checked,
        avoidRoadClosures: document.getElementById('avoidRoadClosures')?.checked,
        avoidIncidents: document.getElementById('avoidIncidents')?.checked,
        departureTime: document.getElementById('departureTime')?.value,
        getStorageItem: (key) => localStorage.getItem(key),
    };
}

function applySaveMultiDropPreferencesFromPlan(execute) {
    if (!execute || !execute.shouldSave) return;

    Object.entries(execute.storagePatches).forEach(([key, value]) => {
        localStorage.setItem(key, value);
    });
    if (execute.saveAllSettings) rt().call.saveAllSettings();
    rt().call.showStatus(execute.successStatusMessage, execute.successStatusType);
}

function saveMultiDropPreferences() {
    const settingsSnapshot = SS();
    applySaveMultiDropPreferencesFromPlan(
        settingsSnapshot.buildSaveMultiDropPreferencesEntryOrchestrationPlan(
            settingsSnapshot.buildCollectMultiDropInputPlan(collectMultiDropDomInput())
        ).execute
    );
}

/**
 * Read multi-drop preference controls from the DOM (source of truth for save).
 * @returns {Object}
 */
function collectMultiDropFormState() {
    const settingsSnapshot = SS();
    return settingsSnapshot.buildMultiDropFormStatePlan(
        settingsSnapshot.buildCollectMultiDropInputPlan(collectMultiDropDomInput())
    );
}

/**
 * Apply multi-drop preference form controls from a pure UI apply plan.
 * @param {Object} plan - from buildMultiDropPreferencesUiApplyPlan
 */
function applyMultiDropPreferencesUiFromPlan(plan) {
    if (!plan) return;

    const domPlan = SS().buildMultiDropPreferencesDomApplyPlan(plan);
    rt().call.applyDomChecksFromPlan(domPlan.checks);
    rt().call.applyDomSelectsFromPlan(domPlan.selects);
}

function loadMultiDropPreferences() {
    const entry = SS().buildLoadMultiDropPreferencesEntryOrchestrationPlan(localStorage);
    if (!entry.execute.shouldLoad) return;

    if (entry.execute.ensureDefaultTrafficAwareRouting) rt().call.ensureDefaultTrafficAwareRouting();
    applyMultiDropPreferencesUiFromPlan(entry.uiApply);
}

function clearDepartureTime() {
    applyClearDepartureTimeFromPlan(
        SS().buildClearDepartureTimeEntryOrchestrationPlan().apply
    );
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
    rt().call.showStatus(plan.statusMessage, plan.statusType);
}

/**
 * loadRoutePreferences function
 * @function loadRoutePreferences
 * @returns {*} Return value description
 */
function loadRoutePreferences() {
    const entry = RP().buildLoadRoutePreferencesEntryOrchestrationPlan(localStorage);
    if (!entry.execute.shouldLoad) return;
    applyRoutePreferencesUiFromPlan(entry.uiApply);
}

/**
 * Apply route preference form controls from a pure UI apply plan.
 * @param {Object} plan - from buildRoutePreferencesUiApplyPlan
 */
function applyRoutePreferencesUiFromPlan(plan) {
    if (!plan) return;

    const domPlan = RP().buildRoutePreferencesDomApplyPlan(plan);
    rt().call.applyDomChecksFromPlan(domPlan.checks);
    rt().call.applyDomSelectsFromPlan(domPlan.selects);
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

    const entry = RP().buildUpdateDetourLabelEntryOrchestrationPlan(maxDetourEl.value);
    applyDetourLabelFromPlan(entry.detourApply);
    if (entry.shouldSavePreferences) saveRoutePreferences();
}

/**
 * getRoutePreferences function
 * @function getRoutePreferences
 * @returns {*} Return value description
 */
function getRoutePreferences() {
    return RP().getRoutePreferences(localStorage);
}

function applyRecalculateRouteWithPreferencesFromPlan(execute) {
    if (!execute || !execute.shouldRecalculate) {
        if (execute && execute.errorStatusMessage) rt().call.showStatus(execute.errorStatusMessage, 'error');
        return;
    }

    if (execute.saveRoutePreferences) saveRoutePreferences();
    rt().call.showStatus(execute.loadingStatusMessage, 'loading');
    rt().call.switchTab(execute.switchTab);

    setTimeout(() => {
        rt().call.calculateRoute();
    }, execute.recalculateDelayMs);
}

/**
 * recalculateRouteWithPreferences function
 * @function recalculateRouteWithPreferences
 * @returns {*} Return value description
 */
function recalculateRouteWithPreferences() {
    applyRecalculateRouteWithPreferencesFromPlan(
        RS().buildRecalculateRouteWithPreferencesEntryOrchestrationPlan(
            window.lastCalculatedRoute
        ).execute
    );
}
    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        saveRoutePreferences: saveRoutePreferences,
        loadRoutePreferences: loadRoutePreferences,
        getRoutePreferences: getRoutePreferences,
        collectRoutePreferencesFormState: collectRoutePreferencesFormState,
        collectRoutePreferencesDomInput: collectRoutePreferencesDomInput,
        updateDetourLabel: updateDetourLabel,
        applyDetourLabelFromPlan: applyDetourLabelFromPlan,
        recalculateRouteWithPreferences: recalculateRouteWithPreferences,
        saveMultiDropPreferences: saveMultiDropPreferences,
        loadMultiDropPreferences: loadMultiDropPreferences,
        clearDepartureTime: clearDepartureTime,
        collectMultiDropFormState: collectMultiDropFormState,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoutePreferencesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

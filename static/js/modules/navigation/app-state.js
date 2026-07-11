/**
 * @file Pure PWA app-state save/restore plans (no DOM, no network).
 * @module modules/navigation/app-state
 */
(function (root) {
    'use strict';

    var APP_STATE_STORAGE_KEY = 'appState';
    var PENDING_UI_RESTORE_PROPERTY = '__voyagrPendingUiRestore';
    var RESTORED_FLAG_PROPERTY = '__voyagrAppStateRestored';

    /** Snapshot keys stored under pref_* in localStorage. */
    var PREF_SNAPSHOT_KEYS = [
        'caz',
        'cameras',
        'policeRadars',
        'roadworks',
        'accidents',
        'railwayCrossings',
        'railwayCrossingsAvoid',
        'potholes',
        'debris',
        'batterySaving',
        'optimizeStopOrder',
        'roundTrip',
        'trafficAwareRouting',
        'avoidRoadClosures',
        'avoidIncidents',
    ];

    /** Snapshot keys that map to non-pref_* localStorage keys. */
    var DIRECT_SNAPSHOT_STORAGE_KEYS = {
        mapTheme: 'mapTheme',
        mlPredictions: 'mlPredictionsEnabled',
        gestureControl: 'gestureEnabled',
    };

    /**
     * @param {string} snapshotKey
     * @returns {string}
     */
    function resolvePreferenceStorageKey(snapshotKey) {
        if (snapshotKey === 'tolls') {
            return 'pref_tolls';
        }
        if (DIRECT_SNAPSHOT_STORAGE_KEYS[snapshotKey]) {
            return DIRECT_SNAPSHOT_STORAGE_KEYS[snapshotKey];
        }
        return 'pref_' + snapshotKey;
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildSaveAppStatePlan(input) {
        input = input || {};
        var preferences = input.preferences || {};
        return {
            shouldSave: true,
            storageKey: APP_STATE_STORAGE_KEY,
            state: {
                preferences: preferences,
                ui: input.ui || {},
                timestamp: input.now != null ? input.now : Date.now(),
            },
            logMessage: '[PWA] App state saved',
            errorLogPrefix: '[PWA] State save error:',
        };
    }

    /**
     * Collect preference snapshot values from runtime/storage reads.
     * @param {Object} [input]
     * @param {boolean} [input.avoidTolls]
     * @param {function(string): string|null|undefined} [input.getStorageItem]
     * @returns {Object}
     */
    function buildSaveAppStatePreferencesCollectPlan(input) {
        input = input || {};
        var get = input.getStorageItem || function () { return null; };
        var preferences = {
            tolls: input.avoidTolls ? 'true' : 'false',
        };

        PREF_SNAPSHOT_KEYS.forEach(function (snapshotKey) {
            preferences[snapshotKey] = get(resolvePreferenceStorageKey(snapshotKey));
        });

        Object.keys(DIRECT_SNAPSHOT_STORAGE_KEYS).forEach(function (snapshotKey) {
            preferences[snapshotKey] = get(resolvePreferenceStorageKey(snapshotKey));
        });

        return preferences;
    }

    /**
     * Collect UI snapshot values for app-state persistence.
     * @param {Object} [input]
     * @param {string} [input.activeTab]
     * @param {boolean} [input.bottomSheetExpanded]
     * @returns {Object}
     */
    function buildSaveAppStateUiCollectPlan(input) {
        input = input || {};
        return {
            activeTab: input.activeTab != null ? input.activeTab : 'navigation',
            bottomSheetExpanded: input.bottomSheetExpanded !== false,
        };
    }

    /**
     * Execute plan for persisting app state to localStorage.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildSaveAppStateExecutePlan(input) {
        input = input || {};
        var savePlan = buildSaveAppStatePlan({
            preferences: input.preferences || buildSaveAppStatePreferencesCollectPlan(input),
            ui: input.ui || buildSaveAppStateUiCollectPlan(input),
            now: input.now,
        });
        return {
            shouldSave: savePlan.shouldSave,
            storageKey: savePlan.storageKey,
            storageValue: JSON.stringify(savePlan.state),
            logMessage: savePlan.logMessage,
            errorLogPrefix: savePlan.errorLogPrefix,
        };
    }

    /**
     * Apply plan for restoring persisted app state from localStorage.
     * @param {Object} execute - from buildRestoreAppStateExecutePlan
     * @param {Object} [orch] - from buildRestoreAppStateOrchestrationPlan
     * @returns {Object}
     */
    function buildRestoreAppStateApplyPlan(execute, orch) {
        execute = execute || {};
        orch = orch || {};
        return {
            shouldApply: !!execute.shouldRestore,
            storagePatches: execute.storagePatches || [],
            pendingUiRestoreProperty: orch.pendingUiRestoreProperty || PENDING_UI_RESTORE_PROPERTY,
            pendingUiRestore: execute.pendingUiRestore || null,
            removeAppStateKey: execute.removeAppStateKey || APP_STATE_STORAGE_KEY,
            restoredLogMessage: execute.restoredLogMessage,
            errorLogPrefix: execute.errorLogPrefix,
        };
    }

    /**
     * @param {Object} [parsedState]
     * @returns {Object}
     */
    function buildRestoreAppStateExecutePlan(parsedState) {
        parsedState = parsedState || {};
        var preferences = parsedState.preferences || {};
        var patches = [];

        if (preferences.tolls) {
            patches.push({ key: resolvePreferenceStorageKey('tolls'), value: preferences.tolls });
        }

        PREF_SNAPSHOT_KEYS.forEach(function (snapshotKey) {
            var value = preferences[snapshotKey];
            if (value) {
                patches.push({
                    key: resolvePreferenceStorageKey(snapshotKey),
                    value: value,
                });
            }
        });

        Object.keys(DIRECT_SNAPSHOT_STORAGE_KEYS).forEach(function (snapshotKey) {
            var value = preferences[snapshotKey];
            if (value) {
                patches.push({
                    key: resolvePreferenceStorageKey(snapshotKey),
                    value: value,
                });
            }
        });

        return {
            shouldRestore: patches.length > 0 || !!parsedState.ui,
            storagePatches: patches,
            pendingUiRestore: parsedState.ui || null,
            removeAppStateKey: APP_STATE_STORAGE_KEY,
            restoredLogMessage: '[PWA] App state restored',
            errorLogPrefix: '[PWA] State restore error:',
        };
    }

    /**
     * @returns {Object}
     */
    function buildRestoreAppStateOrchestrationPlan() {
        return {
            storageKey: APP_STATE_STORAGE_KEY,
            restoredFlagProperty: RESTORED_FLAG_PROPERTY,
            pendingUiRestoreProperty: PENDING_UI_RESTORE_PROPERTY,
        };
    }

    var api = {
        APP_STATE_STORAGE_KEY: APP_STATE_STORAGE_KEY,
        PENDING_UI_RESTORE_PROPERTY: PENDING_UI_RESTORE_PROPERTY,
        RESTORED_FLAG_PROPERTY: RESTORED_FLAG_PROPERTY,
        PREF_SNAPSHOT_KEYS: PREF_SNAPSHOT_KEYS,
        DIRECT_SNAPSHOT_STORAGE_KEYS: DIRECT_SNAPSHOT_STORAGE_KEYS,
        resolvePreferenceStorageKey: resolvePreferenceStorageKey,
        buildSaveAppStatePlan: buildSaveAppStatePlan,
        buildSaveAppStatePreferencesCollectPlan: buildSaveAppStatePreferencesCollectPlan,
        buildSaveAppStateUiCollectPlan: buildSaveAppStateUiCollectPlan,
        buildSaveAppStateExecutePlan: buildSaveAppStateExecutePlan,
        buildRestoreAppStateExecutePlan: buildRestoreAppStateExecutePlan,
        buildRestoreAppStateOrchestrationPlan: buildRestoreAppStateOrchestrationPlan,
        buildRestoreAppStateApplyPlan: buildRestoreAppStateApplyPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrAppState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

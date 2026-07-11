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
        buildRestoreAppStateExecutePlan: buildRestoreAppStateExecutePlan,
        buildRestoreAppStateOrchestrationPlan: buildRestoreAppStateOrchestrationPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrAppState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

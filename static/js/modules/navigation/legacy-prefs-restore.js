/**
 * @file Pure legacy runtime preference restore plans (no DOM, no network).
 * @module modules/navigation/legacy-prefs-restore
 */
(function (root) {
    'use strict';

    var AUTO_GPS_STORAGE_KEY = 'autoGpsEnabled';
    var AUTO_GPS_TOGGLE_ID = 'autoGpsToggle';

    /**
     * @returns {Object}
     */
    function buildLoadLegacyPreferencesOrchestrationPlan() {
        return {
            applyRouteAvoidanceToggles: true,
            loadHazardCameraTogglesFromApi: true,
            restoreGesturePreference: false,
            restoreAutoGpsPreference: true,
            restoreBatterySavingPreference: true,
            applySpeedWidgetToggleUi: true,
        };
    }

    /**
     * @param {Object} [input]
     * @param {string} [input.savedValue]
     * @param {boolean} [input.hasDeviceMotion]
     * @returns {Object}
     */
    function buildRestoreGesturePreferencePlan(input) {
        // Shake gesture removed — never restore device-motion listeners.
        input = input || {};
        return {
            shouldRestore: false,
            gestureEnabled: false,
            addDeviceMotionListener: false,
        };
    }

    /**
     * @param {Object} [input]
     * @param {string} [input.savedValue]
     * @returns {Object}
     */
    function buildRestoreAutoGpsPreferencePlan(input) {
        input = input || {};
        if (input.savedValue !== 'true') {
            return { shouldRestore: false };
        }
        return {
            shouldRestore: true,
            setAutoGpsEnabled: true,
            autoGpsEnabled: true,
            toggle: {
                id: AUTO_GPS_TOGGLE_ID,
                checked: true,
            },
            startAutoGpsLocation: true,
            restoreLogMessage: '[Auto GPS] Preference restored from localStorage',
        };
    }

    var api = {
        AUTO_GPS_STORAGE_KEY: AUTO_GPS_STORAGE_KEY,
        AUTO_GPS_TOGGLE_ID: AUTO_GPS_TOGGLE_ID,
        buildLoadLegacyPreferencesOrchestrationPlan: buildLoadLegacyPreferencesOrchestrationPlan,
        buildRestoreGesturePreferencePlan: buildRestoreGesturePreferencePlan,
        buildRestoreAutoGpsPreferencePlan: buildRestoreAutoGpsPreferencePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLegacyPrefsRestore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

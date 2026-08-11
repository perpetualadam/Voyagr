/**
 * @file Pure gesture-control plans (no DOM, no network).
 * Shake-to-recalculate/clear has been removed; plans keep APIs stable as no-ops.
 * @module modules/navigation/gesture-control
 */
(function (root) {
    'use strict';

    var GESTURE_ENABLED_STORAGE_KEY = 'gestureEnabled';
    var GESTURE_TOGGLE_ID = 'gestureEnabled';
    var GESTURE_SETTINGS_ID = 'gestureSettings';
    var GESTURE_INDICATOR_ID = 'gestureIndicator';
    var GESTURE_SENSITIVITY_ID = 'gestureSensitivity';
    var GESTURE_ACTION_ID = 'gestureAction';

    /** Retained for tests/callers; shake detection is disabled. */
    var GESTURE_SHAKE_THRESHOLDS = {
        low: 20,
        medium: 15,
        high: 10,
    };

    /**
     * Normalize gesture action for legacy persisted values.
     * @param {*} action
     * @returns {string}
     */
    function normalizeGestureAction(action) {
        if (action === 'clear') {
            return 'clear';
        }
        return 'recalculate';
    }

    /**
     * Shake detection removed — never triggers recalculate/clear.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildGestureShakeDetectionPlan(input) {
        input = input || {};
        var sensitivity = input.sensitivity || 'medium';
        var threshold = GESTURE_SHAKE_THRESHOLDS[sensitivity] || GESTURE_SHAKE_THRESHOLDS.medium;
        return {
            shouldTrigger: false,
            threshold: threshold,
            shakeCount: 0,
            lastShakeTime: input.lastShakeTime || 0,
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleGestureControlCollectPlan(input) {
        input = input || {};
        return { enabled: false, previouslyEnabled: !!input.currentlyEnabled };
    }

    /**
     * Gesture control removed — always disable and detach listeners.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleGestureControlExecutePlan(input) {
        input = input || {};
        return {
            shouldApply: true,
            enabled: false,
            toggle: {
                id: GESTURE_TOGGLE_ID,
                enabled: false,
            },
            settingsPanel: {
                id: GESTURE_SETTINGS_ID,
                display: 'none',
            },
            storageKey: GESTURE_ENABLED_STORAGE_KEY,
            storageValue: false,
            persistApiBody: { gesture_enabled: false },
            addDeviceMotionListener: false,
            removeDeviceMotionListener: true,
            statusMessage: '❌ Gesture control disabled',
            statusType: 'info',
        };
    }

    /**
     * Shake actions removed — never recalculate or clear via gesture.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildGestureActionExecutePlan(input) {
        input = input || {};
        var action = normalizeGestureAction(input.action);
        return {
            shouldApply: false,
            action: action,
            indicator: {
                id: GESTURE_INDICATOR_ID,
                showClass: 'show',
                hideAfterMs: 500,
            },
            vibrateMs: 0,
            logApiBody: { gesture_type: 'shake', action: action },
            statusMessage: '',
            statusType: 'info',
            triggerRecalculate: false,
            triggerClear: false,
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildUpdateGestureSensitivityExecutePlan(input) {
        input = input || {};
        return {
            shouldApply: false,
            sensitivity: input.value,
            persistApiBody: { gesture_sensitivity: input.value },
            errorLogPrefix: 'Error updating gesture sensitivity:',
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildUpdateGestureActionExecutePlan(input) {
        input = input || {};
        var action = normalizeGestureAction(input.value);
        return {
            shouldApply: false,
            action: action,
            persistApiBody: { gesture_action: action },
            errorLogPrefix: 'Error updating gesture action:',
        };
    }

    /**
     * @returns {Object}
     */
    function buildLoadGestureSettingsFetchPlan() {
        return {
            shouldFetch: false,
            url: '/api/app-settings',
            errorLogPrefix: 'Error loading app settings:',
        };
    }

    /**
     * API restore cannot re-enable shake; keeps storage/UI off.
     * @param {Object} [settings] - API settings payload
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildApplyGestureSettingsFromApiExecutePlan(settings, input) {
        settings = settings || {};
        input = input || {};
        var sensitivity = settings.gesture_sensitivity || 'medium';
        var action = normalizeGestureAction(settings.gesture_action);
        return {
            shouldApply: true,
            enabled: false,
            sensitivity: sensitivity,
            action: action,
            toggle: {
                id: GESTURE_TOGGLE_ID,
                enabled: false,
            },
            settingsPanel: {
                id: GESTURE_SETTINGS_ID,
                display: 'none',
            },
            sensitivitySelect: {
                id: GESTURE_SENSITIVITY_ID,
                value: sensitivity,
            },
            actionSelect: {
                id: GESTURE_ACTION_ID,
                value: action,
            },
            storageKey: GESTURE_ENABLED_STORAGE_KEY,
            storageValue: false,
            addDeviceMotionListener: false,
        };
    }

    var api = {
        GESTURE_ENABLED_STORAGE_KEY: GESTURE_ENABLED_STORAGE_KEY,
        GESTURE_TOGGLE_ID: GESTURE_TOGGLE_ID,
        GESTURE_SETTINGS_ID: GESTURE_SETTINGS_ID,
        GESTURE_SENSITIVITY_ID: GESTURE_SENSITIVITY_ID,
        GESTURE_ACTION_ID: GESTURE_ACTION_ID,
        GESTURE_SHAKE_THRESHOLDS: GESTURE_SHAKE_THRESHOLDS,
        normalizeGestureAction: normalizeGestureAction,
        buildGestureShakeDetectionPlan: buildGestureShakeDetectionPlan,
        buildToggleGestureControlCollectPlan: buildToggleGestureControlCollectPlan,
        buildToggleGestureControlExecutePlan: buildToggleGestureControlExecutePlan,
        buildGestureActionExecutePlan: buildGestureActionExecutePlan,
        buildUpdateGestureSensitivityExecutePlan: buildUpdateGestureSensitivityExecutePlan,
        buildUpdateGestureActionExecutePlan: buildUpdateGestureActionExecutePlan,
        buildLoadGestureSettingsFetchPlan: buildLoadGestureSettingsFetchPlan,
        buildApplyGestureSettingsFromApiExecutePlan: buildApplyGestureSettingsFromApiExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGestureControl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

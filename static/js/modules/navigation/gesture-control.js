/**
 * @file Pure gesture-control plans (no DOM, no network).
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

    var GESTURE_SHAKE_THRESHOLDS = {
        low: 20,
        medium: 15,
        high: 10,
    };

    /** Allowed shake actions. Hazard report is voice/FAB only (hands-free while driving). */
    var ALLOWED_GESTURE_ACTIONS = {
        recalculate: true,
        clear: true,
    };

    var GESTURE_ACTION_STATUS_MESSAGES = {
        recalculate: '🔄 Recalculating route...',
        clear: '🗑️ Route cleared',
    };

    /**
     * Normalize gesture action; legacy 'report' and unknowns fall back to recalculate.
     * @param {*} action
     * @returns {string}
     */
    function normalizeGestureAction(action) {
        if (ALLOWED_GESTURE_ACTIONS[action]) {
            return action;
        }
        return 'recalculate';
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildGestureShakeDetectionPlan(input) {
        input = input || {};
        var magnitude = input.magnitude;
        var sensitivity = input.sensitivity || 'medium';
        var threshold = GESTURE_SHAKE_THRESHOLDS[sensitivity] || GESTURE_SHAKE_THRESHOLDS.medium;
        var now = input.now != null ? input.now : Date.now();
        var lastShakeTime = input.lastShakeTime || 0;
        var shakeCount = input.shakeCount || 0;
        var withinWindow = now - lastShakeTime < 1000;

        if (!Number.isFinite(magnitude) || magnitude <= threshold) {
            return {
                shouldTrigger: false,
                threshold: threshold,
                shakeCount: withinWindow ? shakeCount : 0,
                lastShakeTime: lastShakeTime,
            };
        }

        var nextCount = withinWindow ? shakeCount + 1 : 1;
        return {
            shouldTrigger: nextCount >= 2,
            threshold: threshold,
            shakeCount: nextCount >= 2 ? 0 : nextCount,
            lastShakeTime: now,
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleGestureControlCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentlyEnabled;
        return { enabled: enabled };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleGestureControlExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        var hasDeviceMotion = !!input.hasDeviceMotion;
        return {
            shouldApply: true,
            enabled: enabled,
            toggle: {
                id: GESTURE_TOGGLE_ID,
                enabled: enabled,
            },
            settingsPanel: {
                id: GESTURE_SETTINGS_ID,
                display: enabled ? 'block' : 'none',
            },
            storageKey: GESTURE_ENABLED_STORAGE_KEY,
            storageValue: enabled,
            persistApiBody: { gesture_enabled: enabled },
            addDeviceMotionListener: enabled && hasDeviceMotion,
            removeDeviceMotionListener: !enabled || !hasDeviceMotion,
            statusMessage: enabled ? '✅ Gesture control enabled' : '❌ Gesture control disabled',
            statusType: enabled ? 'success' : 'info',
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildGestureActionExecutePlan(input) {
        input = input || {};
        var action = normalizeGestureAction(input.action);
        return {
            shouldApply: true,
            action: action,
            indicator: {
                id: GESTURE_INDICATOR_ID,
                showClass: 'show',
                hideAfterMs: 500,
            },
            vibrateMs: 100,
            logApiBody: { gesture_type: 'shake', action: action },
            statusMessage: GESTURE_ACTION_STATUS_MESSAGES[action] || GESTURE_ACTION_STATUS_MESSAGES.recalculate,
            statusType: 'info',
            triggerRecalculate: action === 'recalculate',
            triggerClear: action === 'clear',
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildUpdateGestureSensitivityExecutePlan(input) {
        input = input || {};
        return {
            shouldApply: true,
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
            shouldApply: true,
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
            shouldFetch: true,
            url: '/api/app-settings',
            errorLogPrefix: 'Error loading app settings:',
        };
    }

    /**
     * @param {Object} [settings] - API settings payload
     * @param {Object} [input]
     * @param {boolean} [input.hasDeviceMotion]
     * @returns {Object}
     */
    function buildApplyGestureSettingsFromApiExecutePlan(settings, input) {
        settings = settings || {};
        input = input || {};
        var enabled = !!settings.gesture_enabled;
        var sensitivity = settings.gesture_sensitivity || 'medium';
        var action = normalizeGestureAction(settings.gesture_action);
        return {
            shouldApply: true,
            enabled: enabled,
            sensitivity: sensitivity,
            action: action,
            toggle: {
                id: GESTURE_TOGGLE_ID,
                enabled: enabled,
            },
            settingsPanel: {
                id: GESTURE_SETTINGS_ID,
                display: enabled ? 'block' : 'none',
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
            storageValue: enabled,
            addDeviceMotionListener: enabled && !!input.hasDeviceMotion,
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

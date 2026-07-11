/**
 * @file Pure battery-saving mode plans (no DOM, no network).
 * @module modules/navigation/battery-saving
 */
(function (root) {
    'use strict';

    var BATTERY_SAVING_STORAGE_KEY = 'pref_batterySaving';
    var BATTERY_SAVING_TOGGLE_ID = 'batterySavingMode';
    var BATTERY_AUTO_ENABLE_THRESHOLD_PERCENT = 15;

    /**
     * @param {Object} [input]
     * @param {number} [input.levelPercent]
     * @param {boolean} [input.currentlyEnabled]
     * @param {number} [input.thresholdPercent]
     * @returns {Object}
     */
    function buildBatteryAutoEnablePlan(input) {
        input = input || {};
        var level = input.levelPercent;
        var threshold = input.thresholdPercent != null
            ? input.thresholdPercent
            : BATTERY_AUTO_ENABLE_THRESHOLD_PERCENT;
        var shouldEnable = (
            Number.isFinite(level) &&
            level < threshold &&
            !input.currentlyEnabled
        );
        return {
            shouldEnable: shouldEnable,
            levelPercent: level,
            thresholdPercent: threshold,
        };
    }

    /**
     * @param {boolean} [currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleBatterySavingCollectPlan(currentlyEnabled) {
        var enabled = !currentlyEnabled;
        return {
            enabled: enabled,
            enable: enabled,
            disable: !enabled,
        };
    }

    /**
     * Execute plan for toggling battery-saving mode on or off.
     * @param {boolean} [currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleBatterySavingExecutePlan(currentlyEnabled) {
        var collected = buildToggleBatterySavingCollectPlan(currentlyEnabled);
        if (collected.enable) {
            return buildEnableBatterySavingExecutePlan();
        }
        return buildDisableBatterySavingExecutePlan();
    }

    /**
     * @returns {Object}
     */
    function buildEnableBatterySavingExecutePlan() {
        return {
            shouldApply: true,
            setBatterySavingMode: true,
            batterySavingMode: true,
            toggle: {
                id: BATTERY_SAVING_TOGGLE_ID,
                enabled: true,
            },
            disableBodyAnimation: true,
            disableElementAnimations: true,
            storageKey: BATTERY_SAVING_STORAGE_KEY,
            storageValue: 'true',
            persistApiBody: { battery_saving_mode: 1 },
            statusMessage: '🔋 Battery saving mode enabled',
            statusType: 'success',
        };
    }

    /**
     * @returns {Object}
     */
    function buildDisableBatterySavingExecutePlan() {
        return {
            shouldApply: true,
            setBatterySavingMode: true,
            batterySavingMode: false,
            toggle: {
                id: BATTERY_SAVING_TOGGLE_ID,
                enabled: false,
            },
            restoreBodyAnimation: true,
            storageKey: BATTERY_SAVING_STORAGE_KEY,
            storageValue: 'false',
            persistApiBody: { battery_saving_mode: 0 },
            statusMessage: '🔋 Battery saving mode disabled',
            statusType: 'info',
        };
    }

    /**
     * Restore battery-saving UI/runtime visuals on page load (no status toast or API).
     * @param {Object} [input]
     * @param {string} [input.savedValue]
     * @returns {Object}
     */
    function buildRestoreBatterySavingUiPlan(input) {
        input = input || {};
        if (input.savedValue !== 'true') {
            return { shouldApply: false };
        }
        return {
            shouldApply: true,
            setBatterySavingMode: true,
            batterySavingMode: true,
            toggle: {
                id: BATTERY_SAVING_TOGGLE_ID,
                enabled: true,
            },
            disableBodyAnimation: true,
            disableElementAnimations: true,
            restoreLogMessage: '[Battery] Battery saving mode restored from localStorage',
        };
    }

    var api = {
        BATTERY_SAVING_STORAGE_KEY: BATTERY_SAVING_STORAGE_KEY,
        BATTERY_SAVING_TOGGLE_ID: BATTERY_SAVING_TOGGLE_ID,
        BATTERY_AUTO_ENABLE_THRESHOLD_PERCENT: BATTERY_AUTO_ENABLE_THRESHOLD_PERCENT,
        buildBatteryAutoEnablePlan: buildBatteryAutoEnablePlan,
        buildToggleBatterySavingCollectPlan: buildToggleBatterySavingCollectPlan,
        buildToggleBatterySavingExecutePlan: buildToggleBatterySavingExecutePlan,
        buildEnableBatterySavingExecutePlan: buildEnableBatterySavingExecutePlan,
        buildDisableBatterySavingExecutePlan: buildDisableBatterySavingExecutePlan,
        buildRestoreBatterySavingUiPlan: buildRestoreBatterySavingUiPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrBatterySaving = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

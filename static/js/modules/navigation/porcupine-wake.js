/**
 * @file Pure Porcupine wake-word UI plans (no DOM, no network).
 * @module modules/navigation/porcupine-wake
 */
(function (root) {
    'use strict';

    var VOYAGR_PORCUPINE_WAKE_STORAGE_KEY = 'voyagrPorcupineWakeEnabled';

    var PORCUPINE_WAKE_UI_IDS = {
        row: 'porcupineWakePrefRow',
        help: 'porcupineWakeHelp',
        toggle: 'porcupineWakeToggle',
    };

    /**
     * @param {Object} [env]
     * @param {boolean} [env.assetsOk]
     * @param {string} [env.accessKey]
     * @param {boolean} [env.hasPorcupineWeb]
     * @param {boolean} [env.hasWebVoiceProcessor]
     * @returns {boolean}
     */
    function isPicovoiceClientConfigured(env) {
        env = env || {};
        return !!(
            env.assetsOk &&
            typeof env.accessKey === 'string' &&
            env.accessKey.trim().length > 0 &&
            env.hasPorcupineWeb &&
            env.hasWebVoiceProcessor
        );
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.configured]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildLoadPorcupineWakeUiExecutePlan(input) {
        input = input || {};
        if (!input.configured) {
            return {
                shouldApply: true,
                hideRow: true,
                hideHelp: true,
            };
        }
        return {
            shouldApply: true,
            showRow: true,
            showHelp: true,
            toggle: {
                id: PORCUPINE_WAKE_UI_IDS.toggle,
                enabled: !!input.enabled,
            },
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentEnabled]
     * @returns {Object}
     */
    function buildTogglePorcupineWakeWordCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentEnabled;
        return {
            enabled: enabled,
            storageValue: enabled ? 'true' : 'false',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildTogglePorcupineWakeWordExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            storageKey: VOYAGR_PORCUPINE_WAKE_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            startPipeline: enabled,
            stopPipeline: !enabled,
            clearResumeAfterVoice: !enabled,
            saveAllSettings: true,
            statusMessage: enabled
                ? 'Wake word listening enabled'
                : 'Wake word listening disabled',
            statusType: 'success',
            toggle: {
                id: PORCUPINE_WAKE_UI_IDS.toggle,
                enabled: enabled,
            },
        };
    }

    var api = {
        VOYAGR_PORCUPINE_WAKE_STORAGE_KEY: VOYAGR_PORCUPINE_WAKE_STORAGE_KEY,
        PORCUPINE_WAKE_UI_IDS: PORCUPINE_WAKE_UI_IDS,
        isPicovoiceClientConfigured: isPicovoiceClientConfigured,
        buildLoadPorcupineWakeUiExecutePlan: buildLoadPorcupineWakeUiExecutePlan,
        buildTogglePorcupineWakeWordCollectPlan: buildTogglePorcupineWakeWordCollectPlan,
        buildTogglePorcupineWakeWordExecutePlan: buildTogglePorcupineWakeWordExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPorcupineWake = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

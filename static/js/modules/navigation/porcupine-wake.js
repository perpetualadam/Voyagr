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

    var PORCUPINE_DETECTION_DEBOUNCE_MS = 2200;
    var PORCUPINE_MODEL_PATH = '/static/vendor/picovoice/porcupine_params.pv';
    var PORCUPINE_VENDOR_PROBE_URLS = [
        '/static/vendor/picovoice/porcupine-web.iife.js',
        '/static/vendor/picovoice/web-voice-processor.iife.js',
    ];
    var PORCUPINE_WARM_CACHE_URLS = [
        '/static/vendor/picovoice/porcupine-web.iife.js',
        '/static/vendor/picovoice/web-voice-processor.iife.js',
        '/static/vendor/picovoice/porcupine_params.pv',
        '/static/vendor/picovoice/hey_satnav_wasm.ppn',
    ];

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildPorcupinePipelinePreflightPlan(input) {
        input = input || {};
        var configured = !!input.configured;
        var storageEnabled = !!input.storageEnabled;
        var pipelineRunning = !!input.pipelineRunning;
        var starting = !!input.starting;
        var protocol = input.protocol || '';
        var hostname = input.hostname || '';
        var isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        var httpsOk = protocol === 'https:' || isLocalhost;

        if (!configured || !storageEnabled) {
            return { shouldStart: false, reason: 'not_enabled' };
        }
        if (pipelineRunning || starting) {
            return { shouldStart: false, reason: 'already_running' };
        }
        if (!httpsOk) {
            return {
                shouldStart: false,
                reason: 'needs_https',
                warningLog: '[Porcupine] Wake word needs HTTPS (or localhost) for microphone access.',
                statusMessage: 'Wake word requires HTTPS for the microphone',
                statusType: 'warning',
            };
        }
        return { shouldStart: true, stopExistingFirst: true };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildPorcupineResumeAfterVoicePlan(input) {
        input = input || {};
        if (!input.resumeFlag) {
            return { shouldResume: false };
        }
        if (!input.storageEnabled || !input.configured) {
            return { shouldResume: false, clearResumeFlag: true };
        }
        return { shouldResume: true, clearResumeFlag: true, startPipeline: true };
    }

    /**
     * @returns {Object}
     */
    function buildPorcupineWakeHotwordExecutePlan() {
        return {
            shouldApply: true,
            setResumeAfterVoice: true,
            stopPipeline: true,
            speakMessage: 'Say your command',
            speakPriority: 'high',
            voiceStartDelayMs: 450,
            clearTranscript: true,
            resetFinalTranscript: true,
            startVoiceRecognition: true,
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildPorcupineStartConfigPlan(input) {
        input = input || {};
        return {
            accessKey: (input.accessKey || '').trim(),
            useCustomKeyword: !!input.useCustomKeyword,
            customKeyword: input.useCustomKeyword ? {
                publicPath: (input.keywordPath || '').trim(),
                label: 'Hey SatNav',
                sensitivity: 0.55,
            } : null,
            builtInKeyword: 'Porcupine',
            model: { publicPath: PORCUPINE_MODEL_PATH },
            detectionDebounceMs: PORCUPINE_DETECTION_DEBOUNCE_MS,
            builtInFallbackLogPrefix: '[Porcupine] Using built-in keyword «Porcupine» until hey_satnav_wasm.ppn is available at',
            failureStatusMessage: 'Wake word could not start (check Picovoice key and assets)',
            failureStatusType: 'error',
            failureLogPrefix: '[Porcupine] Failed to start wake pipeline:',
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildWarmPicovoiceStaticCachePlan(input) {
        input = input || {};
        if (!input.hasServiceWorker || !input.online || !input.controllerPresent) {
            return { shouldWarm: false };
        }
        return {
            shouldWarm: true,
            probeUrls: PORCUPINE_VENDOR_PROBE_URLS.slice(),
            warmMessageType: 'WARM_STATIC_URLS',
            warmUrls: PORCUPINE_WARM_CACHE_URLS.slice(),
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildStopPorcupineWakePipelineExecutePlan(input) {
        input = input || {};
        return {
            shouldStop: !!(input.hasBridgeEngine || input.hasWorker),
            unsubscribeBridge: !!input.hasBridgeEngine,
            releaseWorker: !!input.hasWorker,
            terminateWorker: !!input.hasWorker,
            clearBridgeEngine: true,
            clearWorker: true,
            setPipelineRunning: false,
            logPrefixes: {
                unsubscribe: '[Porcupine] unsubscribe:',
                release: '[Porcupine] release:',
                terminate: '[Porcupine] terminate:',
            },
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildPorcupineInitAutoStartPlan(input) {
        input = input || {};
        return {
            shouldStart: !!input.storageEnabled && !!input.configured,
        };
    }

    var api = {
        VOYAGR_PORCUPINE_WAKE_STORAGE_KEY: VOYAGR_PORCUPINE_WAKE_STORAGE_KEY,
        PORCUPINE_WAKE_UI_IDS: PORCUPINE_WAKE_UI_IDS,
        PORCUPINE_DETECTION_DEBOUNCE_MS: PORCUPINE_DETECTION_DEBOUNCE_MS,
        isPicovoiceClientConfigured: isPicovoiceClientConfigured,
        buildLoadPorcupineWakeUiExecutePlan: buildLoadPorcupineWakeUiExecutePlan,
        buildTogglePorcupineWakeWordCollectPlan: buildTogglePorcupineWakeWordCollectPlan,
        buildTogglePorcupineWakeWordExecutePlan: buildTogglePorcupineWakeWordExecutePlan,
        buildPorcupinePipelinePreflightPlan: buildPorcupinePipelinePreflightPlan,
        buildPorcupineResumeAfterVoicePlan: buildPorcupineResumeAfterVoicePlan,
        buildPorcupineWakeHotwordExecutePlan: buildPorcupineWakeHotwordExecutePlan,
        buildPorcupineStartConfigPlan: buildPorcupineStartConfigPlan,
        buildWarmPicovoiceStaticCachePlan: buildWarmPicovoiceStaticCachePlan,
        buildStopPorcupineWakePipelineExecutePlan: buildStopPorcupineWakePipelineExecutePlan,
        buildPorcupineInitAutoStartPlan: buildPorcupineInitAutoStartPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPorcupineWake = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

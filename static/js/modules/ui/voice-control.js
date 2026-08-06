/**
 * @file Pure voice control UI/status plans (no DOM, no network).
 * @module modules/ui/voice-control
 */
(function (root) {
    'use strict';

    var VOICE_STATUS_ELEMENT_ID = 'voiceStatus';
    var VOICE_BTN_ELEMENT_ID = 'voiceBtn';
    var VOICE_BTN_TEXT_ELEMENT_ID = 'voiceBtnText';
    var VOICE_FAB_ELEMENT_ID = 'voiceFab';
    var VOICE_TRANSCRIPT_ELEMENT_ID = 'voiceTranscript';

    /**
     * Preflight for initializing Web Speech API recognition.
     * @param {Object} [input]
     * @param {boolean} [input.alreadyInitialized]
     * @param {boolean} [input.hasRecognitionInstance]
     * @param {boolean} [input.hasSpeechRecognition]
     * @returns {Object}
     */
    function buildVoiceRecognitionInitPreflightPlan(input) {
        input = input || {};
        if (input.alreadyInitialized && input.hasRecognitionInstance) {
            return { action: 'ready', shouldInitialize: false };
        }
        if (!input.hasSpeechRecognition) {
            return {
                action: 'unsupported',
                shouldInitialize: false,
                statusMessage: 'Voice not supported in this browser (try Chrome or Edge).',
                setListeningUi: false,
                logMessage: '[Voice] Web Speech API not supported',
            };
        }
        return {
            action: 'initialize',
            shouldInitialize: true,
            markInitialized: true,
            recognitionConfig: {
                continuous: false,
                interimResults: true,
                lang: 'en-US',
            },
        };
    }

    /**
     * Execute plan for updating the voice status label.
     * @param {string} message
     * @returns {Object}
     */
    function buildVoiceSetStatusExecutePlan(message) {
        return {
            shouldUpdate: true,
            elementId: VOICE_STATUS_ELEMENT_ID,
            text: message || '',
        };
    }

    /**
     * Execute plan for voice listen/stop button and FAB state.
     * @param {boolean} listening
     * @returns {Object}
     */
    function buildVoiceSetListeningUiExecutePlan(listening) {
        var on = !!listening;
        return {
            shouldUpdate: true,
            btnText: on ? 'Stop' : 'Listen',
            btnActive: on,
            btnAriaPressed: on ? 'true' : 'false',
            fabListeningClass: on,
            fabAriaPressed: on ? 'true' : 'false',
            fabTitle: on ? 'Stop voice input' : 'Voice control',
            elementIds: {
                btn: VOICE_BTN_ELEMENT_ID,
                btnText: VOICE_BTN_TEXT_ELEMENT_ID,
                fab: VOICE_FAB_ELEMENT_ID,
            },
        };
    }

    /**
     * Execute plan when speech recognition starts.
     * @returns {Object}
     */
    function buildVoiceOnStartExecutePlan() {
        return {
            clearFinalTranscript: true,
            statusMessage: 'Listening… speak now.',
            setListeningUi: true,
            logMessage: '[Voice] Listening started',
        };
    }

    /**
     * Collect interim/final transcript chunks from a recognition result event.
     * @param {Object} event
     * @param {string} priorFinal
     * @returns {Object}
     */
    function buildVoiceTranscriptCollectPlan(event, priorFinal) {
        event = event || {};
        var interim = '';
        var finalTranscript = priorFinal || '';
        var results = event.results || [];
        var start = event.resultIndex != null ? event.resultIndex : 0;
        for (var i = start; i < results.length; i++) {
            var chunk = results[i] && results[i][0] ? results[i][0].transcript : '';
            if (results[i] && results[i].isFinal) {
                finalTranscript += chunk;
            } else {
                interim += chunk;
            }
        }
        var shown = (finalTranscript + interim).trim();
        return {
            nextFinalTranscript: finalTranscript,
            shown: shown,
            logMessage: '[Voice] Transcript:',
        };
    }

    /**
     * Execute plan for updating the live transcript panel.
     * @param {string} shown
     * @returns {Object}
     */
    function buildVoiceTranscriptUpdateExecutePlan(shown) {
        return {
            shouldUpdate: true,
            elementId: VOICE_TRANSCRIPT_ELEMENT_ID,
            text: shown || '',
        };
    }

    /**
     * Execute plan when speech recognition errors.
     * @param {string} errorCode
     * @returns {Object}
     */
    function buildVoiceOnErrorExecutePlan(errorCode) {
        var msg = errorCode === 'not-allowed'
            ? 'Microphone blocked — allow access in the browser bar.'
            : 'Could not use the microphone (' + (errorCode || 'unknown') + ').';
        return {
            statusMessage: msg,
            setListeningUi: false,
            isListening: false,
            resumePorcupineWake: true,
            logMessage: '[Voice] Error: ' + errorCode,
        };
    }

    /**
     * Execute plan when speech recognition ends.
     * @returns {Object}
     */
    function buildVoiceOnEndExecutePlan() {
        return {
            statusMessage: 'Processing…',
            setListeningUi: false,
            isListening: false,
            logMessage: '[Voice] Listening ended',
        };
    }

    /**
     * Orchestration plan for toggling voice input on/off.
     * @param {Object} [input]
     * @param {boolean} [input.isListening]
     * @param {boolean} [input.porcupineWakePipelineRunning]
     * @returns {Object}
     */
    function buildToggleVoiceInputOrchestrationPlan(input) {
        input = input || {};
        if (input.isListening) {
            return {
                action: 'stop',
                shouldStopRecognition: true,
                isListening: false,
            };
        }
        return {
            action: 'start',
            shouldStartRecognition: true,
            pausePorcupineWake: !!input.porcupineWakePipelineRunning,
            clearTranscript: true,
            clearFinalTranscript: true,
            isListening: true,
        };
    }

    /**
     * Preflight for speech synthesis playback.
     * @param {Object} [input]
     * @param {boolean} [input.hasSpeechSynthesis]
     * @param {string} [input.text]
     * @returns {Object}
     */
    function buildSpeakTextPreflightPlan(input) {
        input = input || {};
        if (!input.hasSpeechSynthesis) {
            return {
                shouldSpeak: false,
                logMessage: '[Voice] Speech Synthesis not supported',
            };
        }
        return {
            shouldSpeak: true,
            cancelExisting: true,
            utterance: {
                text: input.text || '',
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
            },
            onStartStatus: 'Speaking…',
            onEndStatus: 'Ready',
            onErrorStatusPrefix: 'Speech playback error: ',
            logStartPrefix: '[Voice] Speaking:',
            logEndMessage: '[Voice] Speech ended',
            logErrorPrefix: '[Voice] Speech error:',
        };
    }

    /**
     * Orchestration plan for processing a finalized voice command.
     * @param {string} transcript
     * @returns {Object}
     */
    function buildVoiceCommandProcessOrchestrationPlan(transcript) {
        transcript = (transcript || '').trim();
        if (!transcript) {
            return {
                shouldProcess: false,
                statusMessage: 'Ready',
                resumePorcupineWake: true,
            };
        }
        return {
            shouldProcess: true,
            transcript: transcript,
            statusMessage: 'Working on: ' + transcript,
            apiPath: '/api/voice/command',
            method: 'POST',
            logMessage: '[Voice] Processing command:',
        };
    }

    /**
     * Execute plan for a voice command API response.
     * @param {Object} data
     * @returns {Object}
     */
    function buildVoiceCommandResultExecutePlan(data) {
        data = data || {};
        if (data.success) {
            return {
                shouldHandleAction: true,
                speakMessage: data.message,
                action: data.action,
                payload: data,
            };
        }
        return {
            shouldHandleAction: false,
            speakMessage: data.message || 'Command not recognized',
            statusMessage: data.message || 'Command failed',
        };
    }

    /**
     * Execute plan when voice command fetch fails.
     * @param {Error|Object} error
     * @returns {Object}
     */
    function buildVoiceCommandErrorExecutePlan(error) {
        error = error || {};
        return {
            speakMessage: 'Error processing command',
            statusMessage: 'Error: ' + (error.message || 'unknown'),
            logMessage: '[Voice] Error:',
        };
    }

    /**
     * Orchestration plan when recognition ends and command processing should run.
     * @param {Object} input
     * @param {string} [input.finalTranscript]
     * @param {string} [input.fallbackTranscript]
     * @returns {Object}
     */
    function buildVoiceCommandEndProcessingPlan(input) {
        input = input || {};
        var transcript = (input.finalTranscript || '').trim();
        if (!transcript && input.fallbackTranscript) {
            transcript = String(input.fallbackTranscript).trim();
        }
        return buildVoiceCommandProcessOrchestrationPlan(transcript);
    }

    /**
     * Execute plan for handling a voice command action payload.
     * @param {Object} data
     * @param {Object} [runtime]
     * @param {number} [runtime.currentLat]
     * @param {number} [runtime.currentLon]
     * @param {boolean} [runtime.routeInProgress]
     * @returns {Object}
     */
    function buildVoiceActionDispatchPlan(data, runtime) {
        data = data || {};
        runtime = runtime || {};
        var action = data.action;

        if (action === 'navigate') {
            return {
                action: action,
                shouldApply: true,
                endInputId: 'end',
                endValue: data.location,
                scheduleCalculateRoute: true,
            };
        }
        if (action === 'search') {
            return {
                action: action,
                shouldApply: true,
                endInputId: 'end',
                endValue: data.search_term,
                scheduleCalculateRoute: true,
            };
        }
        if (action === 'set_preference') {
            return {
                action: action,
                shouldApply: true,
                writeStorage: true,
                storageKey: 'voice_pref_' + data.preference,
                storageValue: JSON.stringify(data.value),
                logMessage: '[Voice] Setting preference:',
                logArgs: [data.preference, data.value],
            };
        }
        if (action === 'get_info') {
            return {
                action: action,
                shouldApply: true,
                logOnly: true,
                logMessage: '[Voice] Getting info:',
                logArgs: [data.info_type],
            };
        }
        if (action === 'report_hazard') {
            var hazardType = data.hazard_type;
            return {
                action: action,
                shouldApply: true,
                fetchHazardReport: true,
                apiPath: '/api/hazards/report',
                method: 'POST',
                body: {
                    lat: runtime.currentLat,
                    lon: runtime.currentLon,
                    hazard_type: hazardType,
                    description: data.description || '',
                    // Match road-report modal: accidents are high severity
                    severity: hazardType === 'accident' ? 'high' : 'medium',
                },
                logMessage: '[Voice] Reporting hazard:',
                logArgs: [hazardType],
            };
        }
        if (action === 'reroute') {
            var canReroute = !!(runtime.routeInProgress && runtime.currentLat && runtime.currentLon);
            return {
                action: action,
                shouldApply: true,
                triggerAutomaticReroute: canReroute,
                rerouteLat: runtime.currentLat,
                rerouteLon: runtime.currentLon,
                speakMessage: canReroute
                    ? 'Recalculating route from your current location'
                    : 'No active route to recalculate',
                logMessage: '[Voice] Rerouting from current location',
            };
        }
        return {
            action: action || 'unknown',
            shouldApply: false,
        };
    }

    /**
     * Execute plan for a voice hazard-report API response.
     * @param {Object} data
     * @returns {Object}
     */
    function buildVoiceHazardReportResponseExecutePlan(data) {
        data = data || {};
        if (data.success) {
            return {
                shouldShowStatus: false,
                logMessage: '[Voice] Hazard reported:',
                logArgs: [data],
            };
        }
        return {
            shouldShowStatus: !!data.error,
            statusMessage: data.error ? 'Voice report: ' + data.error : '',
            statusType: 'warning',
            logMessage: '[Voice] Hazard reported:',
            logArgs: [data],
        };
    }

    /**
     * Execute plan when voice hazard-report fetch fails.
     * @param {Error|Object} error
     * @returns {Object}
     */
    function buildVoiceHazardReportErrorExecutePlan(error) {
        error = error || {};
        return {
            warnLogPrefix: '[Voice] Hazard report failed:',
            warnLogArgs: [error],
        };
    }

    var api = {
        VOICE_STATUS_ELEMENT_ID: VOICE_STATUS_ELEMENT_ID,
        VOICE_BTN_ELEMENT_ID: VOICE_BTN_ELEMENT_ID,
        VOICE_BTN_TEXT_ELEMENT_ID: VOICE_BTN_TEXT_ELEMENT_ID,
        VOICE_FAB_ELEMENT_ID: VOICE_FAB_ELEMENT_ID,
        VOICE_TRANSCRIPT_ELEMENT_ID: VOICE_TRANSCRIPT_ELEMENT_ID,
        buildVoiceRecognitionInitPreflightPlan: buildVoiceRecognitionInitPreflightPlan,
        buildVoiceSetStatusExecutePlan: buildVoiceSetStatusExecutePlan,
        buildVoiceSetListeningUiExecutePlan: buildVoiceSetListeningUiExecutePlan,
        buildVoiceOnStartExecutePlan: buildVoiceOnStartExecutePlan,
        buildVoiceTranscriptCollectPlan: buildVoiceTranscriptCollectPlan,
        buildVoiceTranscriptUpdateExecutePlan: buildVoiceTranscriptUpdateExecutePlan,
        buildVoiceOnErrorExecutePlan: buildVoiceOnErrorExecutePlan,
        buildVoiceOnEndExecutePlan: buildVoiceOnEndExecutePlan,
        buildToggleVoiceInputOrchestrationPlan: buildToggleVoiceInputOrchestrationPlan,
        buildSpeakTextPreflightPlan: buildSpeakTextPreflightPlan,
        buildVoiceCommandProcessOrchestrationPlan: buildVoiceCommandProcessOrchestrationPlan,
        buildVoiceCommandResultExecutePlan: buildVoiceCommandResultExecutePlan,
        buildVoiceCommandErrorExecutePlan: buildVoiceCommandErrorExecutePlan,
        buildVoiceCommandEndProcessingPlan: buildVoiceCommandEndProcessingPlan,
        buildVoiceActionDispatchPlan: buildVoiceActionDispatchPlan,
        buildVoiceHazardReportResponseExecutePlan: buildVoiceHazardReportResponseExecutePlan,
        buildVoiceHazardReportErrorExecutePlan: buildVoiceHazardReportErrorExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVoiceControl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Voice control orchestration (speech recognition, command processing, TTS).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var voiceRecognition = null;
    var isListening = false;
    /** Latest finalized speech-to-text (interim lines are shown separately in the UI). */
    var _voiceFinalTranscript = '';

    function rt() {
        if (!runtime) {
            throw new Error('[VoiceControl] Orchestration runtime not bound');
        }
        return runtime;
    }

    function VC() { return rt().voiceControl(); }

    function applyVoiceStatusFromPlan(plan) {
        if (!plan || !plan.shouldUpdate) return;
        const el = document.getElementById(plan.elementId);
        if (el) el.textContent = plan.text;
    }

    function applyVoiceListeningUiFromPlan(plan) {
        if (!plan || !plan.shouldUpdate) return;
        const btnText = document.getElementById(plan.elementIds.btnText);
        const btn = document.getElementById(plan.elementIds.btn);
        const fab = document.getElementById(plan.elementIds.fab);
        if (btnText) btnText.textContent = plan.btnText;
        if (btn) {
            btn.classList.toggle('active', !!plan.btnActive);
            btn.setAttribute('aria-pressed', plan.btnAriaPressed);
        }
        if (fab) {
            fab.classList.toggle('fab--listening', !!plan.fabListeningClass);
            fab.setAttribute('aria-pressed', plan.fabAriaPressed);
            fab.title = plan.fabTitle;
        }
    }

    function applyVoiceTranscriptFromPlan(plan) {
        if (!plan || !plan.shouldUpdate) return;
        const el = document.getElementById(plan.elementId);
        if (el) el.textContent = plan.text;
    }

    function voyagrVoiceSetStatus(message) {
        applyVoiceStatusFromPlan(VC().buildVoiceSetStatusExecutePlan(message));
    }

    function voyagrVoiceSetListeningUi(listening) {
        applyVoiceListeningUiFromPlan(VC().buildVoiceSetListeningUiExecutePlan(listening));
    }

    function initVoiceRecognition() {
        const voiceControl = VC();
        const preflight = voiceControl.buildVoiceRecognitionInitPreflightPlan({
            alreadyInitialized: !!window.__voyagrVoiceInitialized,
            hasRecognitionInstance: !!voiceRecognition,
            hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        });
        if (preflight.action === 'ready') {
            return true;
        }
        if (preflight.action === 'unsupported') {
            console.log(preflight.logMessage);
            voyagrVoiceSetStatus(preflight.statusMessage);
            voyagrVoiceSetListeningUi(preflight.setListeningUi);
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceRecognition = new SpeechRecognition();
        if (preflight.markInitialized) {
            window.__voyagrVoiceInitialized = true;
        }
        const cfg = preflight.recognitionConfig;
        voiceRecognition.continuous = cfg.continuous;
        voiceRecognition.interimResults = cfg.interimResults;
        voiceRecognition.lang = cfg.lang;

        voiceRecognition.onstart = () => {
            const startPlan = voiceControl.buildVoiceOnStartExecutePlan();
            console.log(startPlan.logMessage);
            if (startPlan.clearFinalTranscript) {
                _voiceFinalTranscript = '';
            }
            voyagrVoiceSetStatus(startPlan.statusMessage);
            voyagrVoiceSetListeningUi(startPlan.setListeningUi);
        };

        voiceRecognition.onresult = (event) => {
            const resultPlan = voiceControl.buildVoiceTranscriptCollectPlan(event, _voiceFinalTranscript);
            _voiceFinalTranscript = resultPlan.nextFinalTranscript;
            applyVoiceTranscriptFromPlan(voiceControl.buildVoiceTranscriptUpdateExecutePlan(resultPlan.shown));
            console.log(resultPlan.logMessage, resultPlan.shown);
        };

        voiceRecognition.onerror = (event) => {
            const errPlan = voiceControl.buildVoiceOnErrorExecutePlan(event.error);
            console.log(errPlan.logMessage);
            voyagrVoiceSetStatus(errPlan.statusMessage);
            voyagrVoiceSetListeningUi(errPlan.setListeningUi);
            isListening = errPlan.isListening;
            if (errPlan.resumePorcupineWake) {
                rt().call.maybeResumePorcupineWakeAfterVoice();
            }
        };

        voiceRecognition.onend = () => {
            const endPlan = voiceControl.buildVoiceOnEndExecutePlan();
            console.log(endPlan.logMessage);
            voyagrVoiceSetStatus(endPlan.statusMessage);
            voyagrVoiceSetListeningUi(endPlan.setListeningUi);
            isListening = endPlan.isListening;
        };

        return true;
    }

    async function toggleVoiceInput() {
        const voiceControl = VC();
        if (!voiceRecognition) {
            if (!initVoiceRecognition()) {
                return;
            }
        }

        const orch = voiceControl.buildToggleVoiceInputOrchestrationPlan({
            isListening,
            porcupineWakePipelineRunning: root.VoyagrPorcupineOrchestration.isPipelineRunning(),
        });

        if (orch.action === 'stop') {
            voiceRecognition.stop();
            isListening = orch.isListening;
            return;
        }

        if (orch.pausePorcupineWake) {
            root.VoyagrPorcupineOrchestration.setResumeAfterVoice(true);
            await rt().call.stopPorcupineWakePipeline();
        }
        if (orch.clearTranscript) {
            applyVoiceTranscriptFromPlan(voiceControl.buildVoiceTranscriptUpdateExecutePlan(''));
        }
        if (orch.clearFinalTranscript) {
            _voiceFinalTranscript = '';
        }
        voiceRecognition.start();
        isListening = orch.isListening;
    }

    function speakText(text) {
        const voiceControl = VC();
        const preflight = voiceControl.buildSpeakTextPreflightPlan({
            hasSpeechSynthesis: 'speechSynthesis' in window,
            text,
        });
        if (!preflight.shouldSpeak) {
            console.log(preflight.logMessage);
            return;
        }

        if (preflight.cancelExisting) {
            window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(preflight.utterance.text);
        utterance.rate = preflight.utterance.rate;
        utterance.pitch = preflight.utterance.pitch;
        utterance.volume = preflight.utterance.volume;

        utterance.onstart = () => {
            console.log(preflight.logStartPrefix, text);
            voyagrVoiceSetStatus(preflight.onStartStatus);
        };

        utterance.onend = () => {
            console.log(preflight.logEndMessage);
            voyagrVoiceSetStatus(preflight.onEndStatus);
        };

        utterance.onerror = (event) => {
            console.log(preflight.logErrorPrefix, event.error);
            voyagrVoiceSetStatus(preflight.onErrorStatusPrefix + event.error);
        };

        window.speechSynthesis.speak(utterance);
    }

    function setupVoiceCommandProcessing() {
        if (!voiceRecognition) return;

        const voiceControl = VC();
        const originalOnEnd = voiceRecognition.onend;
        voiceRecognition.onend = function () {
            originalOnEnd.call(this);

            const tr = document.getElementById(voiceControl.VOICE_TRANSCRIPT_ELEMENT_ID);
            const endPlan = voiceControl.buildVoiceCommandEndProcessingPlan({
                finalTranscript: _voiceFinalTranscript,
                fallbackTranscript: tr && tr.textContent ? tr.textContent : '',
            });
            if (!endPlan.shouldProcess) {
                voyagrVoiceSetStatus(endPlan.statusMessage);
                if (endPlan.resumePorcupineWake) {
                    rt().call.maybeResumePorcupineWakeAfterVoice();
                }
                return;
            }
            processVoiceCommand(endPlan.transcript);
        };
    }

    function processVoiceCommand(command) {
        const voiceControl = VC();
        const orch = voiceControl.buildVoiceCommandProcessOrchestrationPlan(command);
        if (!orch.shouldProcess) {
            if (orch.resumePorcupineWake) {
                rt().call.maybeResumePorcupineWakeAfterVoice();
            }
            return;
        }

        console.log(orch.logMessage, orch.transcript);
        voyagrVoiceSetStatus(orch.statusMessage);

        fetch(orch.apiPath, {
            method: orch.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: orch.transcript,
                lat: rt().getCurrentLat(),
                lon: rt().getCurrentLon()
            })
        })
            .then(response => response.json())
            .then(data => {
                console.log('[Voice] Command result:', data);
                const execute = voiceControl.buildVoiceCommandResultExecutePlan(data);

                if (execute.shouldHandleAction) {
                    handleVoiceAction(execute.payload);
                    speakText(execute.speakMessage);
                } else {
                    speakText(execute.speakMessage);
                    voyagrVoiceSetStatus(execute.statusMessage);
                }
            })
            .catch(error => {
                const errExecute = voiceControl.buildVoiceCommandErrorExecutePlan(error);
                console.log(errExecute.logMessage, error);
                speakText(errExecute.speakMessage);
                voyagrVoiceSetStatus(errExecute.statusMessage);
            })
            .finally(() => {
                rt().call.maybeResumePorcupineWakeAfterVoice();
            });
    }

    function applyVoiceActionFromPlan(plan) {
        if (!plan || !plan.shouldApply) return;

        if (plan.logMessage) {
            if (plan.logArgs && plan.logArgs.length) {
                console.log(plan.logMessage, ...plan.logArgs);
            } else {
                console.log(plan.logMessage);
            }
        }

        if (plan.endInputId && plan.endValue != null) {
            const endEl = document.getElementById(plan.endInputId);
            if (endEl) endEl.value = plan.endValue;
        }
        if (plan.scheduleCalculateRoute) {
            rt().call.calculateRoute();
        }
        if (plan.writeStorage) {
            localStorage.setItem(plan.storageKey, plan.storageValue);
        }
        if (plan.fetchHazardReport) {
            fetch(plan.apiPath, {
                method: plan.method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(plan.body)
            })
                .then(r => r.json())
                .then((responseData) => {
                    const voiceControl = VC();
                    const execute = voiceControl.buildVoiceHazardReportResponseExecutePlan(responseData);
                    if (execute.logMessage) {
                        console.log(execute.logMessage, ...(execute.logArgs || []));
                    }
                    if (execute.shouldShowStatus) {
                        rt().call.showStatus(execute.statusMessage, execute.statusType);
                    }
                    applyHazardConfirmationFromPlan(
                        voiceControl.buildVoiceHazardConfirmationDomExecutePlan(execute)
                    );
                })
                .catch((error) => {
                    const errExecute = VC().buildVoiceHazardReportErrorExecutePlan(error);
                    console.warn(errExecute.warnLogPrefix, ...(errExecute.warnLogArgs || []));
                });
        }
        if (plan.triggerAutomaticReroute) {
            rt().call.triggerAutomaticReroute(plan.rerouteLat, plan.rerouteLon);
        }
        if (plan.speakMessage) {
            rt().call.speakMessage(plan.speakMessage);
        }
    }

    function handleVoiceAction(data) {
        applyVoiceActionFromPlan(VC().buildVoiceActionDispatchPlan(data, {
            currentLat: rt().getCurrentLat(),
            currentLon: rt().getCurrentLon(),
            routeInProgress: rt().getRouteInProgress(),
        }));
    }

    function applyHazardConfirmationFromPlan(domPlan) {
        if (!domPlan || !domPlan.shouldUpdate || !domPlan.elementId) return;
        const el = document.getElementById(domPlan.elementId);
        if (!el) return;
        el.hidden = !!domPlan.hidden;
        if (domPlan.text != null) {
            el.textContent = domPlan.text;
        }
    }

    /**
     * Test/automation helper: inject a transcript as if the user spoke it.
     * @param {string} transcript
     */
    function simulateVoiceInput(transcript) {
        const plan = VC().buildSimulateVoiceInputPlan(transcript);
        if (!plan.shouldProcess) return;
        processVoiceCommand(plan.transcript);
    }

    function getVoiceRecognition() {
        return voiceRecognition;
    }

    function getIsListening() {
        return isListening;
    }

    function setIsListening(val) {
        isListening = !!val;
    }

    function setVoiceFinalTranscript(val) {
        _voiceFinalTranscript = val;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        initVoiceRecognition: initVoiceRecognition,
        toggleVoiceInput: toggleVoiceInput,
        speakText: speakText,
        setupVoiceCommandProcessing: setupVoiceCommandProcessing,
        processVoiceCommand: processVoiceCommand,
        handleVoiceAction: handleVoiceAction,
        simulateVoiceInput: simulateVoiceInput,
        getVoiceRecognition: getVoiceRecognition,
        getIsListening: getIsListening,
        setIsListening: setIsListening,
        setVoiceFinalTranscript: setVoiceFinalTranscript,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVoiceControlOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

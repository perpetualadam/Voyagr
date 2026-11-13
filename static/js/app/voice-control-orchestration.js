/**
 * @file Voice control orchestration (speech recognition, command processing, TTS).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var voiceRecognition = null;
    var isListening = false;
    var recognitionFailed = false;
    var recognitionEnded = false;
    var processingRecognition = null;
    var starting = false;
    var commandGeneration = 0;
    var inputGeneration = 0;
    var voiceBusy = false;
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
        const test = document.getElementById('voiceTestBtn'); if(test)test.disabled=!!plan.btnActive || voiceBusy;
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

    const inputIdleWaiters = new Set();
    function isVoiceInputActive() { return isListening || starting; }
    function waitForVoiceInputIdle() {
        return isVoiceInputActive() ? new Promise(resolve => inputIdleWaiters.add(resolve)) : Promise.resolve();
    }
    function notifyInputIdle() {
        if (isVoiceInputActive()) return;
        inputIdleWaiters.forEach(resolve => resolve());inputIdleWaiters.clear();
    }

    function voyagrVoiceSetListeningUi(listening) {
        applyVoiceListeningUiFromPlan(VC().buildVoiceSetListeningUiExecutePlan(listening));
        notifyInputIdle();
    }

    function setVoiceBusy(value) {
        notifyInputIdle();
        voiceBusy = value;
        ['voiceBtn','voiceFab'].forEach(id => { const el=document.getElementById(id); if(el){el.disabled=value;el.setAttribute('aria-busy',String(value));} });
        const test=document.getElementById('voiceTestBtn');if(test)test.disabled=value || isListening;
        const cancel=document.getElementById('voiceCancelBtn');if(cancel)cancel.hidden=!value;
    }

    function resumeWake() {
        if (!document.hidden) rt().call.maybeResumePorcupineWakeAfterVoice();
    }

    function provider() { return localStorage.getItem('voiceRecognitionProvider') === 'ai' ? 'ai' : 'browser'; }

    function changeProvider(value) {
        ++commandGeneration; ++inputGeneration;
        setVoiceBusy(false);
        const previous = voiceRecognition;
        voiceRecognition = null; processingRecognition = null;
        isListening = false; starting = false; _voiceFinalTranscript = '';
        if (previous && previous.abort) { try { previous.abort(); } catch (_) { /* already idle */ } }
        localStorage.setItem('voiceRecognitionProvider', value === 'ai' ? 'ai' : 'browser');
        voyagrVoiceSetListeningUi(false);
        applyVoiceTranscriptFromPlan(VC().buildVoiceTranscriptUpdateExecutePlan(''));
        initVoiceRecognition();
    }

    function initVoiceRecognition() {
        const voiceControl = VC();
        const selected = provider();
        const ai = root.VoyagrAudioRecognition;
        const factory = selected === 'ai' ? (root.VoyagrVoiceAIAvailable && ai?.supported() ? ai.AudioRecognition : null) : (window.SpeechRecognition || window.webkitSpeechRecognition);
        const select = document.getElementById('voiceRecognitionProvider');
        if (select) select.value = selected;
        const preflight = voiceControl.buildVoiceRecognitionInitPreflightPlan({
            alreadyInitialized: !!window.__voyagrVoiceInitialized,
            hasRecognitionInstance: !!voiceRecognition,
            hasSpeechRecognition: !!factory,
        });
        if (preflight.action === 'ready') {
            return true;
        }
        if (preflight.action === 'unsupported') {
            console.log(preflight.logMessage);
            voyagrVoiceSetStatus(selected === 'ai' ? 'AI speech is unavailable here. Choose browser speech or check microphone support.' : preflight.statusMessage);
            voyagrVoiceSetListeningUi(preflight.setListeningUi);
            return false;
        }

        try { voiceRecognition = new factory(); }
        catch (_) { voyagrVoiceSetStatus('Speech engine could not initialise. Choose another engine or try again.'); return false; }
        const instance = voiceRecognition;
        if (preflight.markInitialized) {
            window.__voyagrVoiceInitialized = true;
        }
        const cfg = preflight.recognitionConfig;
        voiceRecognition.continuous = cfg.continuous;
        voiceRecognition.interimResults = cfg.interimResults;
        voiceRecognition.lang = cfg.lang;

        voiceRecognition.onstart = () => {
            if (voiceRecognition !== instance || recognitionFailed) return;
            recognitionFailed = false; recognitionEnded = false;
            setVoiceBusy(false);
            const startPlan = voiceControl.buildVoiceOnStartExecutePlan();
            console.log(startPlan.logMessage);
            if (startPlan.clearFinalTranscript) {
                _voiceFinalTranscript = '';
            }
            voyagrVoiceSetStatus(startPlan.statusMessage);
            voyagrVoiceSetListeningUi(startPlan.setListeningUi);
        };

        voiceRecognition.onresult = (event) => {
            if (voiceRecognition !== instance || recognitionFailed) return;
            const resultPlan = voiceControl.buildVoiceTranscriptCollectPlan(event, _voiceFinalTranscript);
            _voiceFinalTranscript = resultPlan.nextFinalTranscript;
            applyVoiceTranscriptFromPlan(voiceControl.buildVoiceTranscriptUpdateExecutePlan(resultPlan.shown));
            console.log('[Voice] Transcript updated');
        };

        voiceRecognition.onerror = (event) => {
            if (voiceRecognition !== instance || recognitionFailed) return;
            recognitionFailed = true; _voiceFinalTranscript = "";
            const errPlan = voiceControl.buildVoiceOnErrorExecutePlan(event.error);
            console.log(errPlan.logMessage);
            voyagrVoiceSetStatus(errPlan.statusMessage);
            voyagrVoiceSetListeningUi(errPlan.setListeningUi);
            isListening = errPlan.isListening; setVoiceBusy(false);
            if (errPlan.resumePorcupineWake) {
                resumeWake();
            }
        };

        voiceRecognition.onprocessing = () => { if(voiceRecognition !== instance)return;isListening=false;voyagrVoiceSetListeningUi(false);setVoiceBusy(true);voyagrVoiceSetStatus('Transcribing…'); };
        voiceRecognition.onend = () => {
            if (voiceRecognition !== instance || recognitionFailed) return;
            const endPlan = voiceControl.buildVoiceOnEndExecutePlan();
            console.log(endPlan.logMessage);
            voyagrVoiceSetStatus(endPlan.statusMessage);
            voyagrVoiceSetListeningUi(endPlan.setListeningUi);
            isListening = endPlan.isListening; setVoiceBusy(false);
        };

        setupVoiceCommandProcessing();
        voyagrVoiceSetStatus(selected === 'ai' ? 'Ready — AI speech selected.' : 'Ready');
        return true;
    }

    async function toggleVoiceInput() {
        root.VoyagrAudioDevices?.cancelCheck?.();
        const voiceControl = VC();
        if (voiceBusy) return;
        if (starting) { cancelInput(); resumeWake(); return; }
        if (!voiceRecognition) {
            if (!initVoiceRecognition()) {
                return;
            }
        }

        const orch = voiceControl.buildToggleVoiceInputOrchestrationPlan({
            isListening,
            porcupineWakePipelineRunning: !!root.VoyagrPorcupineOrchestration?.isPipelineRunning(),
        });

        if (orch.action === 'stop') {
            setVoiceBusy(true);
            voyagrVoiceSetStatus('Finishing voice input…');
            try { voiceRecognition.stop(); } catch (_) { cancelInput(); resumeWake(); }
            return;
        }

        starting = true;
        const instance = voiceRecognition;
        const ticket = ++inputGeneration;
        try {
            if (orch.pausePorcupineWake) {
                root.VoyagrPorcupineOrchestration.setResumeAfterVoice(true);
                await rt().call.stopPorcupineWakePipeline();
            }
            if (voiceRecognition !== instance || ticket !== inputGeneration) return;
            applyVoiceTranscriptFromPlan(voiceControl.buildVoiceTranscriptUpdateExecutePlan(''));
            _voiceFinalTranscript = ''; recognitionFailed = false; recognitionEnded = false;
            isListening = true;
            voyagrVoiceSetStatus('Requesting microphone…');
            voyagrVoiceSetListeningUi(true);
            window.speechSynthesis?.cancel();
            root.VoyagrPorcupineOrchestration?.cancelSpeechOutput?.();
            await instance.start();
        } catch (_) {
            recognitionFailed = true; isListening = false;
            voyagrVoiceSetListeningUi(false);
            voyagrVoiceSetStatus('Could not start voice input. Check microphone permissions and try again.');
            resumeWake();
        } finally { if(ticket === inputGeneration) starting = false; notifyInputIdle(); }
    }

    function speakText(text) {
        if (isListening || starting) return;
        const voiceControl = VC();
        const preflight = voiceControl.buildSpeakTextPreflightPlan({
            hasSpeechSynthesis: 'speechSynthesis' in window,
            text,
        });
        if (!preflight.shouldSpeak) {
            console.log(preflight.logMessage);
            return;
        }

        const speechHold = root.VoyagrPorcupineOrchestration?.beginSpeechOutput?.();
        if (preflight.cancelExisting) {
            window.speechSynthesis.cancel();
            root.VoyagrPorcupineOrchestration?.cancelSpeechOutput?.(speechHold);
        }

        const utterance = new SpeechSynthesisUtterance(preflight.utterance.text);
        utterance.rate = preflight.utterance.rate;
        utterance.pitch = preflight.utterance.pitch;
        utterance.volume = preflight.utterance.volume;

        utterance.onstart = () => {
            if (isListening || starting) return;
            console.log('[Voice] Speech started');
            voyagrVoiceSetStatus(preflight.onStartStatus);
        };

        utterance.onend = () => {
            speechHold?.finish();
            if (isListening || starting) return;
            console.log(preflight.logEndMessage);
            voyagrVoiceSetStatus(preflight.onEndStatus);
        };

        utterance.onerror = (event) => {
            speechHold?.finish();
            if (isListening || starting) return;
            console.log(preflight.logErrorPrefix, event.error);
            voyagrVoiceSetStatus(preflight.onErrorStatusPrefix + event.error);
        };

        const speak = () => {
            if (speechHold && !speechHold.active) return;
            if (document.hidden || isListening || starting) { speechHold?.finish(); return; }
            try { window.speechSynthesis.speak(utterance); }
            catch (_) { speechHold?.finish(); }
        };
        if (speechHold) void speechHold.ready.then(speak, () => speechHold.finish());
        else speak();
    }

    function setupVoiceCommandProcessing() {
        if (!voiceRecognition || processingRecognition === voiceRecognition) return;
        processingRecognition = voiceRecognition;
        const instance = voiceRecognition;
        const voiceControl = VC();
        const originalOnEnd = voiceRecognition.onend;
        voiceRecognition.onend = function () {
            if (voiceRecognition !== instance || recognitionFailed || recognitionEnded) return;
            recognitionEnded = true;
            originalOnEnd.call(this);

            const endPlan = voiceControl.buildVoiceCommandEndProcessingPlan({
                finalTranscript: _voiceFinalTranscript,
                fallbackTranscript: '',
            });
            if (!endPlan.shouldProcess) {
                voyagrVoiceSetStatus(endPlan.statusMessage);
                if (endPlan.resumePorcupineWake) {
                    resumeWake();
                }
                return;
            }
            processVoiceCommand(endPlan.transcript);
        };
    }

    function processVoiceCommand(command) {
        const voiceControl = VC();
        const generation = ++commandGeneration;
        const orch = voiceControl.buildVoiceCommandProcessOrchestrationPlan(command);
        if (!orch.shouldProcess) {
            if (orch.resumePorcupineWake) {
                resumeWake();
            }
            return;
        }

        setVoiceBusy(true);
        console.log('[Voice] Processing command');
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
                if (generation !== commandGeneration || document.hidden) return;
                console.log('[Voice] Command response received');
                const execute = voiceControl.buildVoiceCommandResultExecutePlan(data);

                if (execute.shouldHandleAction) {
                    const actionPlan = handleVoiceAction(execute.payload);
                    speakText(
                        (actionPlan && actionPlan.speakMessageOverride) || execute.speakMessage
                    );
                } else {
                    speakText(execute.speakMessage);
                    voyagrVoiceSetStatus(execute.statusMessage);
                }
            })
            .catch(error => {
                if (generation !== commandGeneration || document.hidden) return;
                const errExecute = voiceControl.buildVoiceCommandErrorExecutePlan(error);
                console.log('[Voice] Command request failed');
                speakText(errExecute.speakMessage);
                voyagrVoiceSetStatus(errExecute.statusMessage);
            })
            .finally(() => {
                if (generation === commandGeneration) { setVoiceBusy(false); resumeWake(); }
            });
    }

    function applyVoiceActionFromPlan(plan) {
        if (!plan || !plan.shouldApply) return;

        if (plan.logMessage) {
            console.log(plan.logMessage);
        }

        if (plan.shouldShowStatus) {
            rt().call.showStatus(plan.statusMessage, plan.statusType);
        }

        if (plan.endInputId && plan.endValue != null) {
            const endEl = document.getElementById(plan.endInputId);
            if (endEl) {if(root.VoyagrLocationOrchestration)root.VoyagrLocationOrchestration.invalidateEndpointRequests('end');delete endEl.dataset.lat;delete endEl.dataset.lon;delete endEl.dataset.displayName;delete endEl.dataset.journeyOriginalSource;endEl.dataset.journeySource='searched';endEl.value=plan.endValue;}
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
                        console.log(execute.logMessage);
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
        const plan = VC().buildVoiceActionDispatchPlan(data, {
            currentLat: rt().getCurrentLat(),
            currentLon: rt().getCurrentLon(),
            routeInProgress: rt().getRouteInProgress(),
        });
        applyVoiceActionFromPlan(plan);
        return plan;
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
        recognitionFailed = false; recognitionEnded = false;
        _voiceFinalTranscript = val;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    function cancelInput() {
        root.VoyagrPorcupineOrchestration?.cancelWakeCommand?.();
        if (!isListening && !starting && !voiceBusy) return;
        ++commandGeneration; ++inputGeneration;
        if (voiceRecognition && voiceRecognition.abort) {
            recognitionFailed = true;
            try { voiceRecognition.abort(); } catch (_) { /* already idle */ }
        }
        isListening = false; starting = false; _voiceFinalTranscript = '';
        if (runtime) { setVoiceBusy(false); voyagrVoiceSetListeningUi(false); voyagrVoiceSetStatus('Voice input cancelled.'); }
    }
    if (root.addEventListener) {
        root.addEventListener('pagehide', cancelInput);
        document.addEventListener('visibilitychange', () => { if (document.hidden) cancelInput(); });
    }

    var api = {
        ENDPOINT_INTENT_PROTOCOL:1,
        endpointIntentReady:function(){return !!runtime;},
        bind: bind,
        initVoiceRecognition: initVoiceRecognition,
        changeProvider: changeProvider,
        cancelVoiceInput: function(){ cancelInput(); resumeWake(); },
        toggleVoiceInput: toggleVoiceInput,
        speakText: speakText,
        setupVoiceCommandProcessing: setupVoiceCommandProcessing,
        processVoiceCommand: processVoiceCommand,
        handleVoiceAction: handleVoiceAction,
        simulateVoiceInput: simulateVoiceInput,
        getVoiceRecognition: getVoiceRecognition,
        getIsListening: getIsListening,
        isVoiceInputActive: isVoiceInputActive,
        waitForVoiceInputIdle: waitForVoiceInputIdle,
        setIsListening: setIsListening,
        setVoiceFinalTranscript: setVoiceFinalTranscript,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVoiceControlOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

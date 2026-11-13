/**
 * @file Picovoice Porcupine wake-word pipeline orchestration (DOM + WebVoiceProcessor).
 * Extracted from voyagr-app.js; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[Porcupine] Orchestration runtime not bound');
        }
        return runtime;
    }

    function pwModule() {
        return rt().porcupineWake();
    }

    function tuModule() {
        return rt().toggleUI();
    }

    // ----- Picovoice Porcupine wake word (browser / PWA). -----
    let porcupineWakePipelineRunning = false;
    let porcupineWakeResumeAfterVoice = false;
    let _porcupineWakeWorker = null;
    let _porcupineWakeBridgeEngine = null;
    let _porcupineWakeStarting = false;
    let _porcupineWakeLastDetectionMs = 0;

        function collectPicovoiceClientConfigInput() {
        const PW = pwModule();
        return PW.buildCollectPicovoiceClientConfigInputPlan({
            assetsOk: !!(typeof window !== 'undefined' && window.VoyagrPicovoiceWebAssetsOk),
            accessKey: typeof window !== 'undefined' ? window.PICOVOICE_ACCESS_KEY : '',
            hasPorcupineWeb: typeof PorcupineWeb !== 'undefined',
            hasWebVoiceProcessor: typeof WebVoiceProcessor !== 'undefined',
        });
    }

    function picovoiceClientConfigured() {
        return pwModule().isPicovoiceClientConfigured(collectPicovoiceClientConfigInput());
    }

    function collectLoadPorcupineWakeUiInput() {
        const PW = pwModule();
        return {
            configured: picovoiceClientConfigured(),
            enabled: localStorage.getItem(PW.VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) === 'true',
        };
    }

    function applyLoadPorcupineWakeUiFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;

        const PW = pwModule();
        const TU = tuModule();
        const row = document.getElementById(PW.PORCUPINE_WAKE_UI_IDS.row);
        const help = document.getElementById(PW.PORCUPINE_WAKE_UI_IDS.help);
        const toggle = document.getElementById(PW.PORCUPINE_WAKE_UI_IDS.toggle);
        if (!row || !toggle) return;

        if (execute.hideRow) {
            row.style.display = 'none';
            if (help) help.style.display = 'none';
            return;
        }
        if (execute.showRow) row.style.display = '';
        if (execute.showHelp && help) help.style.display = '';
        if (execute.toggle) {
            TU.applyLabeledToggleButton(toggle, execute.toggle.enabled);
        }
    }

    function loadPorcupineWakeUi() {
        const PW = pwModule();
        applyLoadPorcupineWakeUiFromPlan(
            PW.buildLoadPorcupineWakeUiEntryOrchestrationPlan(collectLoadPorcupineWakeUiInput()).execute
        );
    }

    function applyTogglePorcupineWakeWordFromPlan(execute, button) {
        if (!execute || !execute.shouldApply || !button) return;

        tuModule().applyLabeledToggleButton(button, execute.toggle.enabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.clearResumeAfterVoice) porcupineWakeResumeAfterVoice = false;
        if (execute.startPipeline) void startPorcupineWakePipeline();
        if (execute.stopPipeline) void stopPorcupineWakePipeline();
        rt().showStatus(execute.statusMessage, execute.statusType);
        if (execute.saveAllSettings) rt().saveAllSettings();
    }

    function togglePorcupineWakeWord() {
        const PW = pwModule();
        const button = document.getElementById(PW.PORCUPINE_WAKE_UI_IDS.toggle);
        if (!button || !picovoiceClientConfigured()) return;

        applyTogglePorcupineWakeWordFromPlan(
            PW.buildTogglePorcupineWakeWordEntryOrchestrationPlan(
                button.classList.contains('active')
            ).execute,
            button
        );
    }

    // Shared browser TTS ownership: do not let wake detection hear our output.
    let wakeCommandPending = false;
    let wakeCommandEpoch = 0;
    const speechHolds = new Set();
    const speechWaiters = new Set();
    function beginSpeechOutput() {
        const hold = { active: true };
        speechHolds.add(hold);
        if (porcupineWakePipelineRunning || _porcupineWakeStarting) porcupineWakeResumeAfterVoice = true;
        hold.ready = (porcupineWakePipelineRunning || _porcupineWakeStarting)
            ? stopPorcupineWakePipeline() : Promise.resolve();
        hold.finish = () => {
            if (!hold.active) return;
            hold.active = false;
            speechHolds.delete(hold);
            if (!speechHolds.size) {
                speechWaiters.forEach(resolve => resolve()); speechWaiters.clear();
                if (runtime && !document.hidden) maybeResumePorcupineWakeAfterVoice();
            }
        };
        return hold;
    }
    function waitForSpeechOutput() {
        return speechHolds.size ? new Promise(resolve => speechWaiters.add(resolve)) : Promise.resolve();
    }
    function cancelWakeCommand() {
        ++wakeCommandEpoch;
        if (!wakeCommandPending) return;
        root.speechSynthesis?.cancel();
        cancelSpeechOutput();
        wakeCommandPending = false;
        if (runtime && !document.hidden) maybeResumePorcupineWakeAfterVoice();
    }
    function cancelSpeechOutput(exceptHold) {
        Array.from(speechHolds).filter(hold => hold !== exceptHold).forEach(hold => hold.finish());
    }

    function collectPorcupineResumeAfterVoiceInput() {
        const PW = pwModule();
        return {
            resumeFlag: porcupineWakeResumeAfterVoice,
            storageEnabled: localStorage.getItem(PW.VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) === 'true',
            configured: picovoiceClientConfigured(),
        };
    }

    function maybeResumePorcupineWakeAfterVoice() {
        if (speechHolds.size || document.hidden || wakeCommandPending || _porcupineWakeStarting || runtime?.getIsListening?.()) return;
        const PW = pwModule();
        const resume = PW.buildPorcupineResumeAfterVoiceEntryOrchestrationPlan(
            collectPorcupineResumeAfterVoiceInput()
        ).resume;
        if (resume.clearResumeFlag) porcupineWakeResumeAfterVoice = false;
        if (resume.shouldResume) void startPorcupineWakePipeline();
    }

    async function porcupineCustomKeywordAvailable() {
        const p = typeof window.VoyagrPicovoiceKeywordPath === 'string' ? window.VoyagrPicovoiceKeywordPath.trim() : '';
        if (!p) {
            return false;
        }
        try {
            let r = await fetch(p, { method: 'HEAD', cache: 'no-store' });
            if (r.status === 405 || r.status === 501) {
                r = await fetch(p, { method: 'GET', cache: 'no-store' });
            }
            return r.ok;
        } catch (e) {
            console.warn('[Porcupine] Keyword probe failed:', e);
            return false;
        }
    }

    let stopWakePromise = null;
    function stopPorcupineWakePipeline() {
        if (!stopWakePromise) stopWakePromise = stopPorcupineWakePipelineOnce().finally(() => { stopWakePromise = null; });
        return stopWakePromise;
    }
    async function stopPorcupineWakePipelineOnce() {
        const PW = pwModule();
        const execute = PW.buildStopPorcupineWakePipelineExecutePlan({
            hasBridgeEngine: !!_porcupineWakeBridgeEngine,
            hasWorker: !!_porcupineWakeWorker,
        });
        if (!execute.shouldStop) {
            porcupineWakePipelineRunning = false;
            return;
        }
        if (execute.unsubscribeBridge && typeof WebVoiceProcessor !== 'undefined') {
            try {
                await WebVoiceProcessor.unsubscribe(_porcupineWakeBridgeEngine);
            } catch (e) {
                console.warn(execute.logPrefixes.unsubscribe, e);
            }
        }
        if (execute.clearBridgeEngine) _porcupineWakeBridgeEngine = null;
        if (_porcupineWakeWorker) {
            if (execute.releaseWorker) {
                try {
                    await _porcupineWakeWorker.release();
                } catch (e) {
                    console.warn(execute.logPrefixes.release, e);
                }
            }
            if (execute.terminateWorker) {
                try {
                    _porcupineWakeWorker.terminate();
                } catch (e) {
                    console.warn(execute.logPrefixes.terminate, e);
                }
            }
            if (execute.clearWorker) _porcupineWakeWorker = null;
        }
        if (execute.setPipelineRunning === false) porcupineWakePipelineRunning = false;
    }

    async function startPorcupineWakePipeline() {
        if (speechHolds.size || document.hidden) return;
        const PW = pwModule();
        const preflight = PW.buildPorcupinePipelinePreflightPlan(
            PW.buildCollectPorcupinePipelinePreflightInputPlan({
                configured: picovoiceClientConfigured(),
                storageEnabled: localStorage.getItem(PW.VOYAGR_PORCUPINE_WAKE_STORAGE_KEY) === 'true',
                pipelineRunning: porcupineWakePipelineRunning,
                starting: _porcupineWakeStarting,
                protocol: typeof location !== 'undefined' ? location.protocol : '',
                hostname: typeof location !== 'undefined' ? location.hostname : '',
            })
        );
        if (!preflight.shouldStart) {
            if (preflight.reason === 'needs_https') {
                console.warn(preflight.warningLog);
                rt().showStatus(preflight.statusMessage, preflight.statusType);
            }
            return;
        }

        _porcupineWakeStarting = true;
        try {
            if (preflight.stopExistingFirst) await stopPorcupineWakePipeline();
            const useCustom = await porcupineCustomKeywordAvailable();
            const startConfig = PW.buildPorcupineStartConfigPlan({
                accessKey: window.PICOVOICE_ACCESS_KEY,
                useCustomKeyword: useCustom,
                keywordPath: window.VoyagrPicovoiceKeywordPath,
            });
            const onDetection = (detection) => {
                if (!detection || typeof detection.label !== 'string') {
                    return;
                }
                const now = Date.now();
                if (now - _porcupineWakeLastDetectionMs < startConfig.detectionDebounceMs) {
                    return;
                }
                _porcupineWakeLastDetectionMs = now;
                if (speechHolds.size || wakeCommandPending || document.hidden || rt().getIsListening()) {
                    return;
                }
                console.log('[Porcupine] Wake detected:', detection.label);
                void onPorcupineWakeHotword();
            };
            const keywords = useCustom
                ? [startConfig.customKeyword]
                : PorcupineWeb.BuiltInKeyword.Porcupine;
            const worker = await PorcupineWeb.PorcupineWorker.create(
                startConfig.accessKey,
                keywords,
                onDetection,
                startConfig.model,
                {
                    processErrorCallback: (err) => {
                        console.error('[Porcupine] process error:', err);
                    }
                }
            );
            if (speechHolds.size || document.hidden) {
                await worker.release();worker.terminate();return;
            }
            _porcupineWakeWorker = worker;
            WebVoiceProcessor.setOptions({
                frameLength: worker.frameLength,
                outputSampleRate: worker.sampleRate
            }, false);
            const bridge = {
                onmessage: (e) => {
                    if (e.data && e.data.command === 'process' && e.data.inputFrame && _porcupineWakeWorker) {
                        _porcupineWakeWorker.process(e.data.inputFrame);
                    }
                }
            };
            _porcupineWakeBridgeEngine = bridge;
            await WebVoiceProcessor.subscribe(bridge);
            if (speechHolds.size || document.hidden) { await stopPorcupineWakePipeline(); return; }
            porcupineWakePipelineRunning = true;
            if (!useCustom) {
                console.info(startConfig.builtInFallbackLogPrefix, window.VoyagrPicovoiceKeywordPath);
            }
        } catch (e) {
            const fail = PW.buildPorcupineStartConfigPlan();
            console.error(fail.failureLogPrefix, e);
            rt().showStatus(fail.failureStatusMessage, fail.failureStatusType);
            await stopPorcupineWakePipeline();
        } finally {
            _porcupineWakeStarting = false;
            if (porcupineWakeResumeAfterVoice && !porcupineWakePipelineRunning) maybeResumePorcupineWakeAfterVoice();
        }
    }

    async function onPorcupineWakeHotword() {
        const PW = pwModule();
        const execute = PW.buildPorcupineWakeHotwordEntryOrchestrationPlan().execute;
        if (execute.setResumeAfterVoice) porcupineWakeResumeAfterVoice = true;
        const epoch = ++wakeCommandEpoch;
        wakeCommandPending = true;
        if (execute.stopPipeline) await stopPorcupineWakePipeline();
        if (epoch !== wakeCommandEpoch || document.hidden) { wakeCommandPending = false; return; }
        try {
            // Browser prompt has completion events; the native bridge exposes none.
            if (execute.speakMessage && root.VoyagrVoiceControlOrchestration?.speakText) {
                root.VoyagrVoiceControlOrchestration.speakText(execute.speakMessage);
            }
            await waitForSpeechOutput();
        } finally { wakeCommandPending = false; }
        if (document.hidden || epoch !== wakeCommandEpoch) return;
        if (root.VoyagrVoiceControlOrchestration?.toggleVoiceInput) {
            await root.VoyagrVoiceControlOrchestration.toggleVoiceInput();
            return;
        }
        if (!rt().getVoiceRecognition() && !rt().initVoiceRecognition()) {
            maybeResumePorcupineWakeAfterVoice();
            return;
        }
        if (!rt().getIsListening()) {
            const tr = document.getElementById('voiceTranscript');
            if (tr && execute.clearTranscript) tr.textContent = '';
            if (execute.resetFinalTranscript) rt().setVoiceFinalTranscript('');
            rt().getVoiceRecognition() && rt().getVoiceRecognition().start();
            rt().setIsListening(true);
        }
    }

    function warmPicovoiceStaticCache() {
        void (async function warm() {
            try {
                const PW = pwModule();
                const plan = PW.buildWarmPicovoiceStaticCachePlan({
                    hasServiceWorker: 'serviceWorker' in navigator,
                    online: navigator.onLine,
                    controllerPresent: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
                });
                if (!plan.shouldWarm) return;
                for (const u of plan.probeUrls) {
                    const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
                    const probe = PW.buildWarmPicovoiceProbeResponsePlan({ ok: !!(r && r.ok) });
                    if (probe.shouldAbort) return;
                }
                const post = PW.buildWarmPicovoicePostMessagePlan(plan);
                if (post.shouldPost && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: post.messageType,
                        urls: post.urls,
                    });
                }
            } catch (_e) {
                /* ignore */
            }
        }());
    }

    if (root.addEventListener) {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) return;
            cancelWakeCommand();
            root.speechSynthesis?.cancel();
            cancelSpeechOutput();
        });
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind,
        beginSpeechOutput,
        cancelWakeCommand,
        waitForSpeechOutput,
        cancelSpeechOutput,
        picovoiceClientConfigured,
        loadPorcupineWakeUi,
        togglePorcupineWakeWord,
        maybeResumePorcupineWakeAfterVoice,
        startPorcupineWakePipeline,
        stopPorcupineWakePipeline,
        warmPicovoiceStaticCache,
        isPipelineRunning: function () { return porcupineWakePipelineRunning; },
        setResumeAfterVoice: function (v) { porcupineWakeResumeAfterVoice = !!v; },
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPorcupineOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

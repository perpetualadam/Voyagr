/**
 * @file Navigation voice announcements (TTS) and voice preference orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var lastVoiceAnnouncementTime = 0;
    var cachedSpeechVoices = [];
    var pendingSpeechRetry = null;
    var speechVoicesListenerBound = false;

    var announcedTurnThresholds = new Set();
    var turnAnnouncementDistances = [500, 200, 100, 50];
    var announcedExitThresholds = new Set();
    var exitAnnouncementDistances = [2000, 800, 200, 100];
    var announcedKeepThresholds = new Set();
    var keepAnnouncementDistances = [1000, 400, 150, 50];
    var voiceAnnouncedForManeuverIndex = null;
    var voiceAnnouncedCategory = null;
    var voiceFrequencyMode = localStorage.getItem('voiceFrequencyMode') || 'all';
    var voiceAnnouncementsEnabled = localStorage.getItem('voiceAnnouncementsEnabled') === 'true';
    var voiceAnnouncementMinIntervalMs = 10000;
    var hazardWarningDistance = 500;
    var lastDestinationAnnouncementDistance = Infinity;
    var destinationAnnouncementDistances = [10000, 5000, 2000, 1000, 500, 100];

    function getAnnouncedTurnThresholds() { return announcedTurnThresholds; }
    function getAnnouncedExitThresholds() { return announcedExitThresholds; }
    function getAnnouncedKeepThresholds() { return announcedKeepThresholds; }
    function getTurnAnnouncementDistances() { return turnAnnouncementDistances; }
    function getExitAnnouncementDistances() { return exitAnnouncementDistances; }
    function getKeepAnnouncementDistances() { return keepAnnouncementDistances; }
    function getDestinationAnnouncementDistances() { return destinationAnnouncementDistances; }
    function getVoiceAnnouncedForManeuverIndex() { return voiceAnnouncedForManeuverIndex; }
    function setVoiceAnnouncedForManeuverIndex(val) { voiceAnnouncedForManeuverIndex = val; }
    function getVoiceAnnouncedCategory() { return voiceAnnouncedCategory; }
    function setVoiceAnnouncedCategory(val) { voiceAnnouncedCategory = val; }
    function getVoiceAnnouncementsEnabled() { return voiceAnnouncementsEnabled; }
    function setVoiceAnnouncementsEnabled(val) { voiceAnnouncementsEnabled = !!val; }
    function getVoiceFrequencyMode() { return voiceFrequencyMode; }
    function setVoiceFrequencyMode(val) { voiceFrequencyMode = val; }
    function getVoiceAnnouncementMinIntervalMs() { return voiceAnnouncementMinIntervalMs; }
    function setVoiceAnnouncementMinIntervalMs(val) { voiceAnnouncementMinIntervalMs = val; }
    function getHazardWarningDistance() { return hazardWarningDistance; }
    function setHazardWarningDistance(val) { hazardWarningDistance = val; }
    function getLastDestinationAnnouncementDistance() { return lastDestinationAnnouncementDistance; }
    function setLastDestinationAnnouncementDistance(val) { lastDestinationAnnouncementDistance = val; }

    function applyVoiceRuntimeFromPlan(plan) {
        if (!plan) return;
        turnAnnouncementDistances.length = 0;
        turnAnnouncementDistances.push.apply(turnAnnouncementDistances, plan.turnAnnouncementDistances);
        destinationAnnouncementDistances.length = 0;
        destinationAnnouncementDistances.push.apply(destinationAnnouncementDistances, plan.destinationAnnouncementDistances);
        hazardWarningDistance = plan.hazardWarningDistance;
        voiceAnnouncementsEnabled = plan.voiceAnnouncementsEnabled;
        voiceFrequencyMode = plan.voiceFrequencyMode;
        voiceAnnouncementMinIntervalMs = plan.voiceAnnouncementMinIntervalMs;
    }

    function rt() {
        if (!runtime) {
            throw new Error('[VoiceAnnouncements] Orchestration runtime not bound');
        }
        return runtime;
    }

    function VA() { return rt().voiceAnnouncements(); }
    function TU() { return rt().toggleUI(); }
    function SS() {
        return root.VoyagrSpeechSynthesis || null;
    }

    function refreshCachedSpeechVoices() {
        if (!('speechSynthesis' in window)) return [];
        try {
            cachedSpeechVoices = window.speechSynthesis.getVoices() || [];
        } catch (e) {
            cachedSpeechVoices = [];
        }
        return cachedSpeechVoices;
    }

    function resolveSpeechVoice(voices, voiceName) {
        if (!voiceName || !Array.isArray(voices)) return null;
        for (var i = 0; i < voices.length; i++) {
            if (voices[i].name === voiceName) return voices[i];
        }
        return null;
    }

    function applySpeechSynthesisSpeakPlan(plan, priority) {
        if (!plan || !plan.shouldSpeak || !('speechSynthesis' in window)) return false;

        var voices = refreshCachedSpeechVoices();
        if (plan.voicesWereEmpty && voices.length === 0) {
            pendingSpeechRetry = { message: plan.utterance.text, priority: priority };
            return false;
        }

        if (plan.shouldResume && typeof window.speechSynthesis.resume === 'function') {
            try { window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
        }

        var utterance = new SpeechSynthesisUtterance(plan.utterance.text);
        utterance.rate = plan.utterance.rate;
        utterance.pitch = plan.utterance.pitch;
        utterance.volume = plan.utterance.volume;

        var voice = plan.voice || resolveSpeechVoice(voices, plan.utterance.voiceName);
        if (voice) utterance.voice = voice;

        window.speechSynthesis.speak(utterance);
        pendingSpeechRetry = null;
        console.log(plan.logLine);
        return true;
    }

    function initSpeechSynthesisWarmup() {
        if (!('speechSynthesis' in window)) return;

        var mod = SS();
        var voices = refreshCachedSpeechVoices();
        var warmup = mod
            ? mod.buildSpeechSynthesisWarmupPlan(true, voices)
            : { shouldWarmup: true, shouldPrimeVoices: voices.length === 0 };

        if (!warmup.shouldWarmup) return;

        if (warmup.shouldPrimeVoices && typeof window.speechSynthesis.resume === 'function') {
            try { window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
        }

        if (!speechVoicesListenerBound && typeof window.speechSynthesis.addEventListener === 'function') {
            speechVoicesListenerBound = true;
            window.speechSynthesis.addEventListener('voiceschanged', function () {
                var previousCount = cachedSpeechVoices.length;
                var nextVoices = refreshCachedSpeechVoices();
                var retryPlan = mod
                    ? mod.buildSpeechSynthesisVoicesChangedRetryPlan(previousCount, nextVoices)
                    : { shouldRetryPending: previousCount === 0 && nextVoices.length > 0 };

                if (retryPlan.shouldRetryPending && pendingSpeechRetry) {
                    speakMessage(pendingSpeechRetry.message, pendingSpeechRetry.priority);
                }
            });
        }
    }

    function speakMessage(message, priority) {
        if (priority === undefined) priority = 'normal';
        const now = Date.now();
        const timeSinceLastAnnouncement = now - lastVoiceAnnouncementTime;
        const voiceFrequencyMode = getVoiceFrequencyMode();
        const throttle = VA().VOICE_FREQUENCY_THROTTLES[voiceFrequencyMode]
            || getVoiceAnnouncementMinIntervalMs();

        if (voiceFrequencyMode === 'minimal' && priority !== 'high') {
            console.log('[Voice] Skipped (minimal mode): "' + message + '"');
            return;
        }
        if (voiceFrequencyMode === 'important' && priority !== 'high' && priority !== 'normal') {
            console.log('[Voice] Skipped (important-only mode): "' + message + '"');
            return;
        }

        if (priority !== 'high' && timeSinceLastAnnouncement < throttle) {
            console.log(
                '[Voice] Throttled: "' + message + '" (' + timeSinceLastAnnouncement
                + 'ms since last, throttle=' + throttle + 'ms)'
            );
            return;
        }

        var mod = SS();
        var speakPlan = mod
            ? mod.buildSpeechSynthesisSpeakPlan(message, {
                voices: refreshCachedSpeechVoices(),
                language: (typeof navigator !== 'undefined' && navigator.language) || 'en',
            })
            : { shouldSpeak: true, shouldResume: true, utterance: { text: message, rate: 1.0, pitch: 1.0, volume: 1.0 }, logLine: '[Voice] Speaking: "' + message + '"' };

        if (!speakPlan.shouldSpeak) return;

        if (applySpeechSynthesisSpeakPlan(speakPlan, priority)) {
            lastVoiceAnnouncementTime = now;
        }
    }

    function collectVoicePreferencesDomInput() {
        return {
            turnDistance1: document.getElementById('voiceTurnDistance1')?.value,
            turnDistance2: document.getElementById('voiceTurnDistance2')?.value,
            turnDistance3: document.getElementById('voiceTurnDistance3')?.value,
            hazardDistance: document.getElementById('voiceHazardDistance')?.value,
            voiceFrequencyMode: document.getElementById('voiceFrequencyMode')?.value,
            announcementsEnabled: typeof getVoiceAnnouncementsEnabled() === 'boolean'
                ? getVoiceAnnouncementsEnabled()
                : (localStorage.getItem('voiceAnnouncementsEnabled') === 'true'),
        };
    }

    function collectVoicePreferencesFormState() {
        const mod = VA();
        return mod.buildVoicePreferencesCollectPlan(
            mod.buildCollectVoicePreferencesDomInputPlan(collectVoicePreferencesDomInput())
        );
    }

    function applyVoicePreferencesRuntimeFromPlan(plan) {
        applyVoiceRuntimeFromPlan(plan);
    }

    function applySaveVoicePreferencesFromPlan(execute) {
        if (!execute || !execute.shouldSave) return;

        (execute.storagePatches || []).forEach(function (patch) {
            localStorage.setItem(patch.key, patch.value);
        });
        if (execute.applyRuntime) {
            applyVoicePreferencesRuntimeFromPlan(execute.runtimePlan);
        }

        console.log(execute.logMessage, execute.prefs);
        rt().call.showStatus(execute.successStatusMessage, execute.successStatusType);
    }

    function saveVoicePreferences() {
        const mod = VA();
        applySaveVoicePreferencesFromPlan(
            mod.buildSaveVoicePreferencesEntryOrchestrationPlan(
                collectVoicePreferencesFormState()
            ).execute
        );
    }

    function applyLoadVoicePreferencesSavedFromPlan(entry) {
        const execute = entry.execute;
        if (!execute || !execute.shouldApply) return;

        rt().call.applyDomSelectsFromPlan(execute.domPlan.selects);
        TU().applyLabeledToggleButton(
            document.getElementById(execute.domPlan.labeledToggle.id),
            execute.domPlan.labeledToggle.enabled
        );
        applyVoicePreferencesRuntimeFromPlan(execute.runtimePlan);
        console.log(entry.orch.loadedLogMessage, execute.prefs);
    }

    function applyLoadVoicePreferencesDefaultsFromPlan(entry) {
        const defaults = entry.defaults;
        if (!defaults || !defaults.shouldApply) return;

        const toggleButton = document.getElementById(defaults.domPlan.labeledToggle.id);
        if (toggleButton) {
            TU().applyLabeledToggleButton(toggleButton, defaults.domPlan.labeledToggle.enabled);
            if (defaults.setAnnouncementsEnabledFromToggle) {
                setVoiceAnnouncementsEnabled(defaults.domPlan.labeledToggle.enabled);
            }
        }
        console.log(entry.orch.defaultsLogMessage);
    }

    function loadVoicePreferences() {
        const mod = VA();
        const orch = mod.buildLoadVoicePreferencesOrchestrationPlan();
        try {
            const saved = localStorage.getItem(orch.storageKey);
            if (saved) {
                const prefs = JSON.parse(saved);
                applyLoadVoicePreferencesSavedFromPlan(
                    mod.buildLoadVoicePreferencesSavedEntryOrchestrationPlan(prefs)
                );
                return;
            }

            applyLoadVoicePreferencesDefaultsFromPlan(
                mod.buildLoadVoicePreferencesDefaultsEntryOrchestrationPlan()
            );
        } catch (e) {
            console.log(orch.errorLogPrefix, e);
        }
    }

    function applyToggleVoiceAnnouncementsFromPlan(execute, button) {
        if (!execute || !execute.shouldApply || !button) return;

        TU().applyLabeledToggleButton(button, execute.toggle.enabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.updateRuntimeFlag) setVoiceAnnouncementsEnabled(execute.enabled);
        if (execute.saveVoicePreferences) saveVoicePreferences();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
        if (execute.saveAllSettings) rt().call.saveAllSettings();
    }

    function toggleVoiceAnnouncements() {
        const mod = VA();
        const button = document.getElementById(mod.VOICE_PREFS_ELEMENT_IDS.announcementsEnabled);
        if (!button) return;

        applyToggleVoiceAnnouncementsFromPlan(
            mod.buildToggleVoiceAnnouncementsEntryOrchestrationPlan(
                button.classList.contains('active')
            ).execute,
            button
        );
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        initSpeechSynthesisWarmup();
    }

    var api = {
        bind: bind,
        speakMessage: speakMessage,
        saveVoicePreferences: saveVoicePreferences,
        loadVoicePreferences: loadVoicePreferences,
        toggleVoiceAnnouncements: toggleVoiceAnnouncements,
        getAnnouncedTurnThresholds: getAnnouncedTurnThresholds,
        getAnnouncedExitThresholds: getAnnouncedExitThresholds,
        getAnnouncedKeepThresholds: getAnnouncedKeepThresholds,
        getTurnAnnouncementDistances: getTurnAnnouncementDistances,
        getExitAnnouncementDistances: getExitAnnouncementDistances,
        getKeepAnnouncementDistances: getKeepAnnouncementDistances,
        getDestinationAnnouncementDistances: getDestinationAnnouncementDistances,
        getVoiceAnnouncedForManeuverIndex: getVoiceAnnouncedForManeuverIndex,
        setVoiceAnnouncedForManeuverIndex: setVoiceAnnouncedForManeuverIndex,
        getVoiceAnnouncedCategory: getVoiceAnnouncedCategory,
        setVoiceAnnouncedCategory: setVoiceAnnouncedCategory,
        getVoiceAnnouncementsEnabled: getVoiceAnnouncementsEnabled,
        setVoiceAnnouncementsEnabled: setVoiceAnnouncementsEnabled,
        getVoiceFrequencyMode: getVoiceFrequencyMode,
        setVoiceFrequencyMode: setVoiceFrequencyMode,
        getVoiceAnnouncementMinIntervalMs: getVoiceAnnouncementMinIntervalMs,
        setVoiceAnnouncementMinIntervalMs: setVoiceAnnouncementMinIntervalMs,
        getHazardWarningDistance: getHazardWarningDistance,
        setHazardWarningDistance: setHazardWarningDistance,
        getLastDestinationAnnouncementDistance: getLastDestinationAnnouncementDistance,
        setLastDestinationAnnouncementDistance: setLastDestinationAnnouncementDistance,
        applyVoiceRuntimeFromPlan: applyVoiceRuntimeFromPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVoiceAnnouncementsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

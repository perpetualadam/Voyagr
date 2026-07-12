/**
 * @file Navigation voice announcements (TTS) and voice preference orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var lastVoiceAnnouncementTime = 0;

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

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            speechSynthesis.speak(utterance);
            lastVoiceAnnouncementTime = now;
            console.log('[Voice] Speaking: "' + message + '"');
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

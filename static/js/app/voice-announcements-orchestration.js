/**
 * @file Navigation voice announcements (TTS) and voice preference orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var lastVoiceAnnouncementTime = 0;

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
        const voiceFrequencyMode = rt().g('voiceFrequencyMode');
        const throttle = VA().VOICE_FREQUENCY_THROTTLES[voiceFrequencyMode]
            || rt().g('voiceAnnouncementMinIntervalMs');

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
            announcementsEnabled: typeof rt().g('voiceAnnouncementsEnabled') === 'boolean'
                ? rt().g('voiceAnnouncementsEnabled')
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
        if (!plan) return;
        rt().applyVoiceRuntimeFromPlan(plan);
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
                rt().s('voiceAnnouncementsEnabled', defaults.domPlan.labeledToggle.enabled);
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
        if (execute.updateRuntimeFlag) rt().s('voiceAnnouncementsEnabled', execute.enabled);
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
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVoiceAnnouncementsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

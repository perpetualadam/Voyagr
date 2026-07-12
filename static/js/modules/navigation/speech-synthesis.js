/**
 * @file Pure browser speech-synthesis helpers for offline-capable TTS.
 * @module modules/navigation/speech-synthesis
 *
 * Browsers (especially Chrome/iOS) may return an empty voice list until
 * `voiceschanged` fires; prefer local/system voices so navigation announcements
 * work without network access.
 */
(function (root) {
    'use strict';

    var DEFAULT_UTTERANCE = {
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
    };

    /**
     * @param {string} [lang]
     * @returns {string}
     */
    function normalizeLanguageTag(lang) {
        return String(lang || 'en').trim().toLowerCase();
    }

    /**
     * @param {SpeechSynthesisVoice} voice
     * @param {string} language
     * @returns {boolean}
     */
    function voiceLanguageMatches(voice, language) {
        if (!voice || !voice.lang) return false;
        var voiceLang = normalizeLanguageTag(voice.lang);
        var target = normalizeLanguageTag(language);
        if (!target) return true;
        if (voiceLang === target) return true;
        var voiceBase = voiceLang.split('-')[0];
        var targetBase = target.split('-')[0];
        return voiceBase === targetBase;
    }

    /**
     * Prefer installed/local voices for offline reliability.
     * @param {Array<SpeechSynthesisVoice>} voices
     * @param {string} [language]
     * @returns {SpeechSynthesisVoice|null}
     */
    function pickPreferredSpeechVoice(voices, language) {
        if (!Array.isArray(voices) || voices.length === 0) return null;

        var lang = normalizeLanguageTag(language);
        var matching = voices.filter(function (voice) {
            return voiceLanguageMatches(voice, lang);
        });
        var pool = matching.length ? matching : voices;

        var local = pool.filter(function (voice) {
            return !!voice.localService;
        });
        if (local.length) pool = local;

        for (var i = 0; i < pool.length; i++) {
            if (pool[i].default) return pool[i];
        }
        return pool[0] || null;
    }

    /**
     * @param {string} message
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildSpeechSynthesisSpeakPlan(message, opts) {
        opts = opts || {};
        message = String(message || '').trim();
        if (!message) {
            return { shouldSpeak: false, reason: 'empty-message' };
        }

        var voices = Array.isArray(opts.voices) ? opts.voices : [];
        var voice = opts.voice || pickPreferredSpeechVoice(voices, opts.language);

        return {
            shouldSpeak: true,
            shouldResume: opts.shouldResume !== false,
            utterance: {
                text: message,
                rate: opts.rate != null ? opts.rate : DEFAULT_UTTERANCE.rate,
                pitch: opts.pitch != null ? opts.pitch : DEFAULT_UTTERANCE.pitch,
                volume: opts.volume != null ? opts.volume : DEFAULT_UTTERANCE.volume,
                voiceName: voice ? voice.name : null,
                voiceLang: voice ? voice.lang : null,
            },
            voice: voice,
            voicesWereEmpty: voices.length === 0,
            logLine: '[Voice] Speaking: "' + message + '"',
        };
    }

    /**
     * @param {boolean} hasSpeechSynthesis
     * @param {Array<SpeechSynthesisVoice>} [voices]
     * @returns {Object}
     */
    function buildSpeechSynthesisWarmupPlan(hasSpeechSynthesis, voices) {
        voices = Array.isArray(voices) ? voices : [];
        return {
            shouldWarmup: !!hasSpeechSynthesis,
            shouldPrimeVoices: voices.length === 0,
            voiceCount: voices.length,
        };
    }

    /**
     * @param {number} previousVoiceCount
     * @param {Array<SpeechSynthesisVoice>} newVoices
     * @returns {Object}
     */
    function buildSpeechSynthesisVoicesChangedRetryPlan(previousVoiceCount, newVoices) {
        var count = Array.isArray(newVoices) ? newVoices.length : 0;
        return {
            shouldRetryPending: previousVoiceCount === 0 && count > 0,
            voiceCount: count,
        };
    }

    var api = {
        DEFAULT_UTTERANCE: DEFAULT_UTTERANCE,
        normalizeLanguageTag: normalizeLanguageTag,
        voiceLanguageMatches: voiceLanguageMatches,
        pickPreferredSpeechVoice: pickPreferredSpeechVoice,
        buildSpeechSynthesisSpeakPlan: buildSpeechSynthesisSpeakPlan,
        buildSpeechSynthesisWarmupPlan: buildSpeechSynthesisWarmupPlan,
        buildSpeechSynthesisVoicesChangedRetryPlan: buildSpeechSynthesisVoicesChangedRetryPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeechSynthesis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

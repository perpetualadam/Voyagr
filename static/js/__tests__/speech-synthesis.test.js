/**
 * Behaviour tests for modules/navigation/speech-synthesis.js — offline TTS voice selection.
 */
const SS = require('../modules/navigation/speech-synthesis.js');

describe('speech-synthesis module', () => {
    test('pickPreferredSpeechVoice prefers local voices matching language', () => {
        const voices = [
            { name: 'Remote EN', lang: 'en-US', localService: false, default: true },
            { name: 'Local EN', lang: 'en-GB', localService: true, default: false },
            { name: 'Local FR', lang: 'fr-FR', localService: true, default: false },
        ];
        const picked = SS.pickPreferredSpeechVoice(voices, 'en-GB');
        expect(picked.name).toBe('Local EN');
    });

    test('pickPreferredSpeechVoice falls back to any local voice when language has no match', () => {
        const voices = [
            { name: 'Local DE', lang: 'de-DE', localService: true, default: false },
            { name: 'Remote FR', lang: 'fr-FR', localService: false, default: true },
        ];
        const picked = SS.pickPreferredSpeechVoice(voices, 'en-US');
        expect(picked.name).toBe('Local DE');
    });

    test('buildSpeechSynthesisSpeakPlan skips empty messages', () => {
        expect(SS.buildSpeechSynthesisSpeakPlan('   ').shouldSpeak).toBe(false);
    });

    test('buildSpeechSynthesisSpeakPlan maps utterance fields and resume flag', () => {
        const voices = [{ name: 'Local EN', lang: 'en-US', localService: true, default: true }];
        const plan = SS.buildSpeechSynthesisSpeakPlan('Turn left', {
            voices,
            language: 'en-US',
            rate: 0.9,
        });
        expect(plan.shouldSpeak).toBe(true);
        expect(plan.shouldResume).toBe(true);
        expect(plan.utterance.text).toBe('Turn left');
        expect(plan.utterance.rate).toBe(0.9);
        expect(plan.utterance.voiceName).toBe('Local EN');
        expect(plan.voicesWereEmpty).toBe(false);
    });

    test('buildSpeechSynthesisWarmupPlan primes when voice list is empty', () => {
        const warmup = SS.buildSpeechSynthesisWarmupPlan(true, []);
        expect(warmup.shouldWarmup).toBe(true);
        expect(warmup.shouldPrimeVoices).toBe(true);
        expect(SS.buildSpeechSynthesisWarmupPlan(false, []).shouldWarmup).toBe(false);
    });

    test('buildSpeechSynthesisVoicesChangedRetryPlan retries when voices load asynchronously', () => {
        const retry = SS.buildSpeechSynthesisVoicesChangedRetryPlan(0, [{ name: 'A', lang: 'en-US' }]);
        expect(retry.shouldRetryPending).toBe(true);
        expect(retry.voiceCount).toBe(1);
        expect(SS.buildSpeechSynthesisVoicesChangedRetryPlan(2, [{ name: 'A' }]).shouldRetryPending).toBe(false);
    });

    test('voiceLanguageMatches accepts base-language prefixes', () => {
        expect(SS.voiceLanguageMatches({ lang: 'en-US' }, 'en')).toBe(true);
        expect(SS.voiceLanguageMatches({ lang: 'fr-FR' }, 'en')).toBe(false);
    });
});

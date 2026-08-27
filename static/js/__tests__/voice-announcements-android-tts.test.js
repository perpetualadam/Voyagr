/**
 * @jest-environment jsdom
 * @file Navigation speakMessage must use AndroidTTS when the WebView bridge exists,
 * and keep the existing browser speechSynthesis path when it does not.
 */

const VoiceAnnouncements = require('../modules/navigation/voice-announcements.js');

function mockSpeechSynthesis() {
    const speak = jest.fn();
    const resume = jest.fn();
    const getVoices = jest.fn(() => []);
    window.speechSynthesis = { speak, resume, getVoices, addEventListener: jest.fn() };
    global.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
        this.text = text;
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
    };
    return { speak, resume, getVoices };
}

function loadOrchestration() {
    jest.resetModules();
    delete window.AndroidTTS;
    const speech = mockSpeechSynthesis();
    global.VoyagrSpeechSynthesis = require('../modules/navigation/speech-synthesis.js');
    const orchestration = require('../app/voice-announcements-orchestration.js');
    orchestration.bind({
        voiceAnnouncements: () => VoiceAnnouncements,
        toggleUI: () => ({ applyLabeledToggleButton: jest.fn() }),
        call: {
            showStatus: jest.fn(),
            applyDomSelectsFromPlan: jest.fn(),
            saveAllSettings: jest.fn(),
        },
    });
    return { orchestration, speech };
}

describe('speakMessage AndroidTTS bridge', () => {
    afterEach(() => {
        delete window.AndroidTTS;
        delete window.speechSynthesis;
        delete global.SpeechSynthesisUtterance;
        delete global.VoyagrSpeechSynthesis;
    });

    test('sends the spoken instruction to AndroidTTS and does not use speechSynthesis', () => {
        const { orchestration, speech } = loadOrchestration();
        window.AndroidTTS = { speak: jest.fn(), stop: jest.fn() };

        orchestration.speakMessage('Turn left onto North Street.', 'high');

        expect(window.AndroidTTS.speak).toHaveBeenCalledTimes(1);
        expect(window.AndroidTTS.speak).toHaveBeenCalledWith('Turn left onto North Street.');
        expect(speech.speak).not.toHaveBeenCalled();
    });

    test('uses the existing browser speech path when AndroidTTS is absent', () => {
        const { orchestration, speech } = loadOrchestration();

        orchestration.speakMessage('Turn left onto North Street.', 'high');

        expect(speech.speak).toHaveBeenCalledTimes(1);
        expect(speech.speak.mock.calls[0][0].text).toBe('Turn left onto North Street.');
    });

    test('falls back to browser speech when the Android bridge throws', () => {
        const { orchestration, speech } = loadOrchestration();
        window.AndroidTTS = {
            speak: jest.fn(() => {
                throw new Error('bridge down');
            }),
        };

        orchestration.speakMessage('Turn left onto North Street.', 'high');

        expect(window.AndroidTTS.speak).toHaveBeenCalledTimes(1);
        expect(speech.speak).toHaveBeenCalledTimes(1);
        expect(speech.speak.mock.calls[0][0].text).toBe('Turn left onto North Street.');
    });
});

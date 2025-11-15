/**
 * @file Voice Navigation Module
 * @module modules/navigation/voice
 */

/**
 * VoiceNavigator class - Handles voice guidance
 * @class VoiceNavigator
 */
export class VoiceNavigator {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.language = config.language || 'en-US';
        this.rate = config.rate || 1.0;
        this.pitch = config.pitch || 1.0;
        this.volume = config.volume || 1.0;
        this.synth = window.speechSynthesis || null;
        this.isSpeaking = false;
    }

    /**
     * Speak text
     * @param {string} text - Text to speak
     * @param {Object} options - Speech options
     */
    speak(text, options = {}) {
        if (!this.enabled || !this.synth) return;

        // Cancel any ongoing speech
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.language || this.language;
        utterance.rate = options.rate || this.rate;
        utterance.pitch = options.pitch || this.pitch;
        utterance.volume = options.volume || this.volume;

        utterance.onstart = () => {
            this.isSpeaking = true;
        };

        utterance.onend = () => {
            this.isSpeaking = false;
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            this.isSpeaking = false;
        };

        this.synth.speak(utterance);
    }

    /**
     * Announce turn
     * @param {Object} instruction - Turn instruction
     */
    announceTurn(instruction) {
        if (!this.enabled) return;

        const text = `${instruction.text}. Distance: ${instruction.distance} meters`;
        this.speak(text);
    }

    /**
     * Announce arrival
     * @param {string} destination - Destination name
     */
    announceArrival(destination) {
        if (!this.enabled) return;

        const text = `You have arrived at ${destination}`;
        this.speak(text);
    }

    /**
     * Announce reroute
     * @param {string} reason - Reroute reason
     */
    announceReroute(reason) {
        if (!this.enabled) return;

        const text = `Recalculating route. ${reason}`;
        this.speak(text);
    }

    /**
     * Stop speaking
     */
    stop() {
        if (this.synth) {
            this.synth.cancel();
            this.isSpeaking = false;
        }
    }

    /**
     * Pause speaking
     */
    pause() {
        if (this.synth && this.isSpeaking) {
            this.synth.pause();
        }
    }

    /**
     * Resume speaking
     */
    resume() {
        if (this.synth && this.isSpeaking) {
            this.synth.resume();
        }
    }

    /**
     * Enable voice
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable voice
     */
    disable() {
        this.enabled = false;
        this.stop();
    }

    /**
     * Set language
     * @param {string} language - Language code
     */
    setLanguage(language) {
        this.language = language;
    }

    /**
     * Get available voices
     * @returns {Array} Available voices
     */
    getAvailableVoices() {
        if (!this.synth) return [];
        return this.synth.getVoices();
    }

    /**
     * Check if speaking
     * @returns {boolean} Is speaking
     */
    isSpeakingNow() {
        return this.isSpeaking;
    }
}


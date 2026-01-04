/**
 * @file Voice Navigation Module
 * @module modules/navigation/voice
 */

/**
 * VoiceNavigator class - Handles voice guidance with enhanced features
 * @class VoiceNavigator
 */
export class VoiceNavigator {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.language = config.language || 'en-GB';  // UK English default
        this.rate = config.rate || 1.0;
        this.pitch = config.pitch || 1.0;
        this.volume = config.volume || 1.0;
        this.synth = window.speechSynthesis || null;
        this.isSpeaking = false;

        // Enhanced features
        this.preferredVoiceName = config.voiceName || null;  // User's selected voice
        this.lastSpokenText = null;  // For repeat functionality
        this.advanceWarningEnabled = config.advanceWarningEnabled !== false;
        this.confirmationEnabled = config.confirmationEnabled !== false;
    }

    /**
     * Speak text with voice selection
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

        // Apply preferred voice if set
        if (this.preferredVoiceName) {
            const voices = this.synth.getVoices();
            const preferredVoice = voices.find(v => v.name === this.preferredVoiceName);
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
        }

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

        this.lastSpokenText = text;  // Store for repeat
        this.synth.speak(utterance);
    }

    /**
     * Announce turn with improved phrasing
     * @param {Object} instruction - Turn instruction
     */
    announceTurn(instruction) {
        if (!this.enabled) return;

        // More natural phrasing
        const direction = instruction.direction || instruction.text;
        const distance = instruction.distance || 0;
        const street = instruction.streetName || '';

        let text = '';
        if (distance > 0) {
            const distanceText = this.formatDistance(distance);
            if (street) {
                text = `In ${distanceText}, ${direction} onto ${street}`;
            } else {
                text = `In ${distanceText}, ${direction}`;
            }
        } else {
            text = direction;
        }

        this.speak(text);
    }

    /**
     * Announce preparation/advance warning
     * @param {Object} instruction - Upcoming instruction
     */
    announcePreparation(instruction) {
        if (!this.enabled || !this.advanceWarningEnabled) return;

        const direction = instruction.direction || instruction.text || 'turn';
        const distance = instruction.distance || 0;
        const street = instruction.streetName || '';

        let text = '';
        if (distance > 200) {
            const distanceText = this.formatDistance(distance);
            if (street) {
                text = `Prepare to ${direction} in ${distanceText} onto ${street}`;
            } else {
                text = `Prepare to ${direction} in ${distanceText}`;
            }
            this.speak(text);
        }
    }

    /**
     * Announce confirmation after completing maneuver
     * @param {string} maneuver - Completed maneuver type
     */
    announceConfirmation(maneuver) {
        if (!this.enabled || !this.confirmationEnabled) return;

        const confirmations = {
            'left': 'You have turned left',
            'right': 'You have turned right',
            'straight': 'Continue straight',
            'uturn': 'You have made a U-turn',
            'merge': 'Merge complete',
            'exit': 'You have taken the exit',
            'roundabout': 'Exiting roundabout'
        };

        const text = confirmations[maneuver] || `${maneuver} complete`;
        this.speak(text);
    }

    /**
     * Repeat last instruction
     */
    repeatLastInstruction() {
        if (this.lastSpokenText) {
            this.speak(this.lastSpokenText);
        }
    }

    /**
     * Format distance for speech
     * @param {number} meters - Distance in meters
     * @returns {string} Formatted distance
     */
    formatDistance(meters) {
        if (meters >= 1000) {
            const km = (meters / 1000).toFixed(1);
            return `${km} kilometres`;
        } else if (meters >= 100) {
            return `${Math.round(meters / 10) * 10} metres`;
        } else {
            return `${Math.round(meters)} metres`;
        }
    }

    /**
     * Announce arrival
     * @param {string} destination - Destination name
     */
    announceArrival(destination) {
        if (!this.enabled) return;

        const text = `You have arrived at your destination${destination ? ': ' + destination : ''}`;
        this.speak(text);
    }

    /**
     * Announce reroute
     * @param {string} reason - Reroute reason
     */
    announceReroute(reason) {
        if (!this.enabled) return;

        const text = `Recalculating route${reason ? '. ' + reason : ''}`;
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
     * Set speech rate
     * @param {number} rate - Rate 0.5 to 2.0
     */
    setRate(rate) {
        this.rate = Math.max(0.5, Math.min(2.0, rate));
    }

    /**
     * Set preferred voice by name
     * @param {string} voiceName - Voice name
     */
    setVoice(voiceName) {
        this.preferredVoiceName = voiceName;
    }

    /**
     * Set language
     * @param {string} language - Language code
     */
    setLanguage(language) {
        this.language = language;
    }

    /**
     * Get available voices filtered by language
     * @param {string} lang - Optional language filter (e.g., 'en')
     * @returns {Array} Available voices
     */
    getAvailableVoices(lang = null) {
        if (!this.synth) return [];
        const voices = this.synth.getVoices();
        if (lang) {
            return voices.filter(v => v.lang.startsWith(lang));
        }
        return voices;
    }

    /**
     * Check if speaking
     * @returns {boolean} Is speaking
     */
    isSpeakingNow() {
        return this.isSpeaking;
    }
}



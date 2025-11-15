/**
 * @file Navigation Module Index - Exports all navigation modules
 * @module modules/navigation
 */

export { TurnByTurnNavigator } from './turn-by-turn.js';
export { VoiceNavigator } from './voice.js';
export { LocationTracker } from './tracking.js';

/**
 * Create navigation system with all components
 * @param {Object} options - Configuration options
 * @returns {Object} Navigation system object
 */
export function createNavigationSystem(options = {}) {
    const { TurnByTurnNavigator } = require('./turn-by-turn.js');
    const { VoiceNavigator } = require('./voice.js');
    const { LocationTracker } = require('./tracking.js');

    return {
        turnByTurn: new TurnByTurnNavigator(options.turnByTurn || {}),
        voice: new VoiceNavigator(options.voice || {}),
        tracker: new LocationTracker(options.tracker || {}),

        /**
         * Start full navigation
         * @param {Object} route - Route object
         */
        startNavigation(route) {
            this.turnByTurn.startNavigation(route);
            this.tracker.startTracking();
            
            // Connect tracker to turn-by-turn
            this.tracker.on('locationUpdated', (location) => {
                this.turnByTurn.updateLocation(location.lat, location.lon);
            });
        },

        /**
         * Stop full navigation
         */
        stopNavigation() {
            this.turnByTurn.stopNavigation();
            this.tracker.stopTracking();
            this.voice.stop();
        },

        /**
         * Get navigation statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                turnByTurn: {
                    isNavigating: this.turnByTurn.isNavigating,
                    currentStep: this.turnByTurn.currentStep
                },
                voice: {
                    enabled: this.voice.enabled,
                    isSpeaking: this.voice.isSpeakingNow()
                },
                tracker: {
                    isTracking: this.tracker.isTracking,
                    currentLocation: this.tracker.getCurrentLocation(),
                    historySize: this.tracker.locationHistory.length,
                    distanceTraveled: this.tracker.calculateDistanceTraveled()
                }
            };
        }
    };
}


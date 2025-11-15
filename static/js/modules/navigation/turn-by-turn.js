/**
 * @file Turn-by-Turn Navigation Module
 * @module modules/navigation/turn-by-turn
 */

/**
 * TurnByTurnNavigator class - Handles turn-by-turn navigation
 * @class TurnByTurnNavigator
 */
export class TurnByTurnNavigator {
    constructor(config = {}) {
        this.route = null;
        this.currentStep = 0;
        this.currentLocation = null;
        this.isNavigating = false;
        this.announceDistance = config.announceDistance || [500, 200, 100, 50];
        this.listeners = new Map();
    }

    /**
     * Start navigation
     * @param {Object} route - Route object
     */
    startNavigation(route) {
        this.route = route;
        this.currentStep = 0;
        this.isNavigating = true;
        this.emit('navigationStarted', { route });
    }

    /**
     * Stop navigation
     */
    stopNavigation() {
        this.isNavigating = false;
        this.route = null;
        this.currentStep = 0;
        this.emit('navigationStopped');
    }

    /**
     * Update current location
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     */
    updateLocation(lat, lon) {
        this.currentLocation = { lat, lon };
        
        if (this.isNavigating && this.route) {
            this.checkForTurns();
        }
    }

    /**
     * Check for upcoming turns
     */
    checkForTurns() {
        if (!this.route || !this.route.instructions) return;

        const instructions = this.route.instructions;
        if (this.currentStep >= instructions.length) {
            this.emit('navigationComplete');
            return;
        }

        const currentInstruction = instructions[this.currentStep];
        const distance = this.calculateDistance(
            this.currentLocation.lat,
            this.currentLocation.lon,
            currentInstruction.lat,
            currentInstruction.lon
        );

        // Check announcement distances
        this.announceDistance.forEach(dist => {
            if (distance <= dist && distance > dist - 10) {
                this.emit('turnAnnouncement', {
                    distance: dist,
                    instruction: currentInstruction.text,
                    step: this.currentStep
                });
            }
        });

        // Check if turn reached
        if (distance < 20) {
            this.currentStep++;
            this.emit('turnReached', {
                instruction: currentInstruction.text,
                nextStep: this.currentStep
            });
        }
    }

    /**
     * Calculate distance between two points (Haversine)
     * @param {number} lat1 - Start latitude
     * @param {number} lon1 - Start longitude
     * @param {number} lat2 - End latitude
     * @param {number} lon2 - End longitude
     * @returns {number} Distance in meters
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Get current instruction
     * @returns {Object} Current instruction
     */
    getCurrentInstruction() {
        if (!this.route || !this.route.instructions) return null;
        return this.route.instructions[this.currentStep] || null;
    }

    /**
     * Get next instruction
     * @returns {Object} Next instruction
     */
    getNextInstruction() {
        if (!this.route || !this.route.instructions) return null;
        return this.route.instructions[this.currentStep + 1] || null;
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }
}


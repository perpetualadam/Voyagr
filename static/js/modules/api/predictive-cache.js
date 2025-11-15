/**
 * @file Predictive Caching Module - Anticipate user needs
 * @module api/predictive-cache
 */

/**
 * PredictiveCache class - Predicts and preloads data
 * @class PredictiveCache
 */
export class PredictiveCache {
    /**
     * Initialize PredictiveCache
     * @constructor
     * @param {Object} config - Configuration
     * @param {Function} config.apiClient - API client instance
     * @param {number} config.preloadRadius - Preload radius in km (default: 5)
     * @param {number} config.preloadDelay - Preload delay in ms (default: 1000)
     */
    constructor(config = {}) {
        this.apiClient = config.apiClient;
        this.preloadRadius = config.preloadRadius || 5;
        this.preloadDelay = config.preloadDelay || 1000;
        this.preloadQueue = [];
        this.preloadTimer = null;
        this.userHistory = [];
        this.maxHistory = 50;
    }

    /**
     * Track user location
     * @function trackLocation
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     */
    trackLocation(lat, lon) {
        this.userHistory.push({ lat, lon, timestamp: Date.now() });
        if (this.userHistory.length > this.maxHistory) {
            this.userHistory.shift();
        }

        // Predict next locations
        this.predictNextLocations();
    }

    /**
     * Predict next locations based on history
     * @function predictNextLocations
     */
    predictNextLocations() {
        if (this.userHistory.length < 2) return;

        const recent = this.userHistory.slice(-5);
        const directions = this.calculateDirections(recent);

        // Predict next location
        const lastLocation = recent[recent.length - 1];
        const predictedLocations = this.extrapolateLocations(lastLocation, directions);

        // Preload data for predicted locations
        predictedLocations.forEach(location => {
            this.preloadHazards(location.lat, location.lon);
            this.preloadWeather(location.lat, location.lon);
            this.preloadCharging(location.lat, location.lon);
        });
    }

    /**
     * Calculate movement directions
     * @function calculateDirections
     * @param {Array} locations - Location history
     * @returns {Object} Direction vectors
     */
    calculateDirections(locations) {
        if (locations.length < 2) return { lat: 0, lon: 0 };

        const recent = locations[locations.length - 1];
        const previous = locations[locations.length - 2];

        return {
            lat: recent.lat - previous.lat,
            lon: recent.lon - previous.lon
        };
    }

    /**
     * Extrapolate future locations
     * @function extrapolateLocations
     * @param {Object} currentLocation - Current location
     * @param {Object} direction - Direction vector
     * @returns {Array} Predicted locations
     */
    extrapolateLocations(currentLocation, direction) {
        const predictions = [];
        const steps = 3;

        for (let i = 1; i <= steps; i++) {
            predictions.push({
                lat: currentLocation.lat + (direction.lat * i),
                lon: currentLocation.lon + (direction.lon * i)
            });
        }

        return predictions;
    }

    /**
     * Preload hazards for location
     * @function preloadHazards
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     */
    preloadHazards(lat, lon) {
        this.addToQueue({
            endpoint: '/api/hazards',
            params: { lat, lon, radius: this.preloadRadius },
            priority: 'low'
        });
    }

    /**
     * Preload weather for location
     * @function preloadWeather
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     */
    preloadWeather(lat, lon) {
        this.addToQueue({
            endpoint: '/api/weather',
            params: { lat, lon },
            priority: 'low'
        });
    }

    /**
     * Preload charging stations for location
     * @function preloadCharging
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     */
    preloadCharging(lat, lon) {
        this.addToQueue({
            endpoint: '/api/charging',
            params: { lat, lon, radius: this.preloadRadius },
            priority: 'low'
        });
    }

    /**
     * Add request to preload queue
     * @function addToQueue
     * @param {Object} request - Request object
     */
    addToQueue(request) {
        // Check if already in queue
        const exists = this.preloadQueue.some(r =>
            r.endpoint === request.endpoint &&
            JSON.stringify(r.params) === JSON.stringify(request.params)
        );

        if (!exists) {
            this.preloadQueue.push(request);
            this.schedulePreload();
        }
    }

    /**
     * Schedule preload
     * @function schedulePreload
     */
    schedulePreload() {
        if (this.preloadTimer) return;

        this.preloadTimer = setTimeout(() => {
            this.processQueue();
            this.preloadTimer = null;
        }, this.preloadDelay);
    }

    /**
     * Process preload queue
     * @async
     * @function processQueue
     */
    async processQueue() {
        while (this.preloadQueue.length > 0) {
            const request = this.preloadQueue.shift();

            try {
                if (this.apiClient) {
                    await this.apiClient.get(request.endpoint, request.params);
                    console.log(`[PredictiveCache] Preloaded: ${request.endpoint}`);
                }
            } catch (error) {
                console.error(`[PredictiveCache] Preload error:`, error);
            }
        }
    }

    /**
     * Get statistics
     * @function getStats
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            historySize: this.userHistory.length,
            queueSize: this.preloadQueue.length,
            preloadRadius: this.preloadRadius
        };
    }

    /**
     * Clear history
     * @function clear
     */
    clear() {
        this.userHistory = [];
        this.preloadQueue = [];
        if (this.preloadTimer) {
            clearTimeout(this.preloadTimer);
            this.preloadTimer = null;
        }
    }
}

export default PredictiveCache;


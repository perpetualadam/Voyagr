/**
 * @file Features Module Index - Exports all feature modules
 * @module modules/features
 */

export { HazardsManager } from './hazards.js';
export { WeatherManager } from './weather.js';
export { TrafficManager } from './traffic.js';

/**
 * Create features system with all components
 * @param {Object} options - Configuration options
 * @returns {Object} Features system object
 */
export function createFeaturesSystem(options = {}) {
    const { HazardsManager } = require('./hazards.js');
    const { WeatherManager } = require('./weather.js');
    const { TrafficManager } = require('./traffic.js');

    return {
        hazards: new HazardsManager(options.hazards || {}),
        weather: new WeatherManager(options.weather || {}),
        traffic: new TrafficManager(options.traffic || {}),

        /**
         * Initialize all features
         * @async
         * @param {number} lat - Latitude
         * @param {number} lon - Longitude
         */
        async initialize(lat, lon) {
            await Promise.all([
                this.hazards.fetchNearbyHazards(lat, lon),
                this.weather.fetchWeather(lat, lon),
                this.traffic.fetchTraffic(lat, lon)
            ]);
        },

        /**
         * Update all features
         * @async
         * @param {number} lat - Latitude
         * @param {number} lon - Longitude
         */
        async updateAll(lat, lon) {
            await this.initialize(lat, lon);
        },

        /**
         * Get features statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                hazards: {
                    count: this.hazards.getHazards().length,
                    avoidanceEnabled: this.hazards.avoidanceEnabled
                },
                weather: {
                    current: this.weather.getCurrentWeather(),
                    isSevere: this.weather.isSevereWeather()
                },
                traffic: {
                    level: this.traffic.getTrafficLevel(),
                    isHeavy: this.traffic.isHeavyTraffic(),
                    congestion: this.traffic.getCongestionPercentage()
                }
            };
        }
    };
}


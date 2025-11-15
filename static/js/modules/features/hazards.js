/**
 * @file Hazards Feature Module - Handles hazard detection and avoidance
 * @module modules/features/hazards
 */

/**
 * HazardsManager class - Manages hazard detection and reporting
 * @class HazardsManager
 */
export class HazardsManager {
    constructor(config = {}) {
        this.hazards = [];
        this.avoidanceEnabled = config.avoidanceEnabled !== false;
        this.hazardTypes = config.hazardTypes || [
            'speed_camera',
            'traffic_camera',
            'police',
            'roadworks',
            'accident',
            'railway_crossing',
            'pothole',
            'debris'
        ];
        this.cacheTime = config.cacheTime || 600000; // 10 minutes
        this.listeners = new Map();
    }

    /**
     * Fetch nearby hazards
     * @async
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} radius - Search radius in meters
     * @returns {Promise<Array>} Nearby hazards
     */
    async fetchNearbyHazards(lat, lon, radius = 1000) {
        try {
            const response = await fetch('/api/hazards/nearby', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lon, radius })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.hazards = data.hazards || [];
            this.emit('hazardsUpdated', this.hazards);
            return this.hazards;
        } catch (error) {
            this.emit('error', { message: error.message });
            return [];
        }
    }

    /**
     * Report a hazard
     * @async
     * @param {Object} hazard - Hazard object
     * @returns {Promise<Object>} Report response
     */
    async reportHazard(hazard) {
        try {
            const response = await fetch('/api/hazards/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: hazard.type,
                    lat: hazard.lat,
                    lon: hazard.lon,
                    description: hazard.description,
                    severity: hazard.severity || 'medium'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.emit('hazardReported', data);
            return data;
        } catch (error) {
            this.emit('error', { message: error.message });
            throw error;
        }
    }

    /**
     * Get hazards on route
     * @param {Array} routeCoordinates - Route coordinates
     * @returns {Array} Hazards on route
     */
    getHazardsOnRoute(routeCoordinates) {
        return this.hazards.filter(hazard => {
            return routeCoordinates.some(coord => {
                const distance = this.calculateDistance(
                    hazard.lat, hazard.lon,
                    coord[0], coord[1]
                );
                return distance < 100; // 100 meters
            });
        });
    }

    /**
     * Calculate distance between two points
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
     * Enable hazard avoidance
     */
    enableAvoidance() {
        this.avoidanceEnabled = true;
    }

    /**
     * Disable hazard avoidance
     */
    disableAvoidance() {
        this.avoidanceEnabled = false;
    }

    /**
     * Get all hazards
     * @returns {Array} All hazards
     */
    getHazards() {
        return [...this.hazards];
    }

    /**
     * Clear hazards
     */
    clearHazards() {
        this.hazards = [];
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


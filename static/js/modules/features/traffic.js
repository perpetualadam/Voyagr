/**
 * @file Traffic Feature Module - Handles traffic information
 * @module modules/features/traffic
 */

/**
 * TrafficManager class - Manages traffic information
 * @class TrafficManager
 */
export class TrafficManager {
    constructor(config = {}) {
        this.trafficData = null;
        this.updateInterval = config.updateInterval || 300000; // 5 minutes
        this.lastUpdate = null;
        this.autoUpdate = config.autoUpdate !== false;
        this.updateTimer = null;
        this.listeners = new Map();
    }

    /**
     * Fetch traffic data
     * @async
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} radius - Search radius in meters
     * @returns {Promise<Object>} Traffic data
     */
    async fetchTraffic(lat, lon, radius = 5000) {
        try {
            const response = await fetch('/api/traffic-patterns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lon, radius })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.trafficData = data;
            this.lastUpdate = Date.now();
            this.emit('trafficUpdated', data);
            return data;
        } catch (error) {
            this.emit('error', { message: error.message });
            return null;
        }
    }

    /**
     * Start auto-updating traffic
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     */
    startAutoUpdate(lat, lon) {
        if (this.autoUpdate && !this.updateTimer) {
            this.fetchTraffic(lat, lon);
            this.updateTimer = setInterval(() => {
                this.fetchTraffic(lat, lon);
            }, this.updateInterval);
        }
    }

    /**
     * Stop auto-updating traffic
     */
    stopAutoUpdate() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    /**
     * Get current traffic
     * @returns {Object} Current traffic data
     */
    getCurrentTraffic() {
        return this.trafficData;
    }

    /**
     * Get traffic level
     * @returns {string} Traffic level (free/light/moderate/heavy/congested)
     */
    getTrafficLevel() {
        if (!this.trafficData) return 'unknown';
        return this.trafficData.level || 'unknown';
    }

    /**
     * Get average speed
     * @returns {number} Average speed in km/h
     */
    getAverageSpeed() {
        if (!this.trafficData) return null;
        return this.trafficData.average_speed || null;
    }

    /**
     * Get congestion percentage
     * @returns {number} Congestion percentage (0-100)
     */
    getCongestionPercentage() {
        if (!this.trafficData) return 0;
        return this.trafficData.congestion_percentage || 0;
    }

    /**
     * Get estimated delay
     * @returns {number} Estimated delay in minutes
     */
    getEstimatedDelay() {
        if (!this.trafficData) return 0;
        return this.trafficData.estimated_delay || 0;
    }

    /**
     * Check if traffic is heavy
     * @returns {boolean} Is heavy traffic
     */
    isHeavyTraffic() {
        const level = this.getTrafficLevel();
        return level === 'heavy' || level === 'congested';
    }

    /**
     * Clear traffic data
     */
    clearTraffic() {
        this.trafficData = null;
        this.lastUpdate = null;
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


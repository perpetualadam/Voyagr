/**
 * @file Location Tracking Module
 * @module modules/navigation/tracking
 */

/**
 * LocationTracker class - Handles GPS location tracking
 * @class LocationTracker
 */
export class LocationTracker {
    constructor(config = {}) {
        this.isTracking = false;
        this.watchId = null;
        this.currentLocation = null;
        this.locationHistory = [];
        this.maxHistorySize = config.maxHistorySize || 1000;
        this.updateInterval = config.updateInterval || 1000;
        this.listeners = new Map();
        this.accuracy = config.accuracy || 10; // meters
    }

    /**
     * Start tracking location
     */
    startTracking() {
        if (this.isTracking) return;

        if (!navigator.geolocation) {
            this.emit('error', { message: 'Geolocation not supported' });
            return;
        }

        this.isTracking = true;
        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.handleLocationUpdate(position),
            (error) => this.handleLocationError(error),
            {
                enableHighAccuracy: true,
                timeout: this.updateInterval,
                maximumAge: 0
            }
        );

        this.emit('trackingStarted');
    }

    /**
     * Stop tracking location
     */
    stopTracking() {
        if (!this.isTracking) return;

        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        this.isTracking = false;
        this.emit('trackingStopped');
    }

    /**
     * Handle location update
     * @param {Object} position - Geolocation position
     */
    handleLocationUpdate(position) {
        const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;

        this.currentLocation = {
            lat: latitude,
            lon: longitude,
            accuracy,
            altitude,
            heading,
            speed,
            timestamp: Date.now()
        };

        // Add to history
        this.locationHistory.push(this.currentLocation);
        if (this.locationHistory.length > this.maxHistorySize) {
            this.locationHistory.shift();
        }

        this.emit('locationUpdated', this.currentLocation);
    }

    /**
     * Handle location error
     * @param {Object} error - Geolocation error
     */
    handleLocationError(error) {
        const errorMessage = {
            1: 'Permission denied',
            2: 'Position unavailable',
            3: 'Request timeout'
        }[error.code] || 'Unknown error';

        this.emit('error', { message: errorMessage, code: error.code });
    }

    /**
     * Get current location
     * @returns {Object} Current location
     */
    getCurrentLocation() {
        return this.currentLocation;
    }

    /**
     * Get location history
     * @returns {Array} Location history
     */
    getLocationHistory() {
        return [...this.locationHistory];
    }

    /**
     * Clear location history
     */
    clearHistory() {
        this.locationHistory = [];
    }

    /**
     * Calculate distance traveled
     * @returns {number} Distance in kilometers
     */
    calculateDistanceTraveled() {
        if (this.locationHistory.length < 2) return 0;

        let distance = 0;
        for (let i = 1; i < this.locationHistory.length; i++) {
            const prev = this.locationHistory[i - 1];
            const curr = this.locationHistory[i];
            distance += this.haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
        }

        return distance;
    }

    /**
     * Haversine distance calculation
     * @param {number} lat1 - Start latitude
     * @param {number} lon1 - Start longitude
     * @param {number} lat2 - End latitude
     * @param {number} lon2 - End longitude
     * @returns {number} Distance in kilometers
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
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


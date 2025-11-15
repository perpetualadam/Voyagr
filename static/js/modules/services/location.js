/**
 * @file Location Service Module - Handles location services
 * @module modules/services/location
 */

/**
 * LocationService class - Manages location-related services
 * @class LocationService
 */
export class LocationService {
    constructor(config = {}) {
        this.geocodingEndpoint = config.geocodingEndpoint || '/api/geocode';
        this.reverseGeocodingEndpoint = config.reverseGeocodingEndpoint || '/api/reverse-geocode';
        this.cache = new Map();
        this.cacheTTL = config.cacheTTL || 3600000; // 1 hour
    }

    /**
     * Geocode address to coordinates
     * @async
     * @param {string} address - Address to geocode
     * @returns {Promise<Object>} Coordinates {lat, lon}
     */
    async geocodeAddress(address) {
        // Check cache
        const cached = this.cache.get(`geocode_${address}`);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }

        try {
            const response = await fetch(this.geocodingEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Cache result
            this.cache.set(`geocode_${address}`, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('Geocoding error:', error);
            throw error;
        }
    }

    /**
     * Reverse geocode coordinates to address
     * @async
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {Promise<Object>} Address data
     */
    async reverseGeocode(lat, lon) {
        const cacheKey = `reverse_${lat}_${lon}`;
        
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }

        try {
            const response = await fetch(this.reverseGeocodingEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lon })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Cache result
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            throw error;
        }
    }

    /**
     * Geocode multiple addresses
     * @async
     * @param {Array} addresses - Array of addresses
     * @returns {Promise<Array>} Array of coordinates
     */
    async geocodeMultiple(addresses) {
        try {
            const results = await Promise.all(
                addresses.map(addr => this.geocodeAddress(addr))
            );
            return results;
        } catch (error) {
            console.error('Batch geocoding error:', error);
            throw error;
        }
    }

    /**
     * Clear geocoding cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }
}


/**
 * @file Routing Engine Module - Handles route calculation and management
 * @module modules/routing/engine
 */

/**
 * RoutingEngine class - Manages route calculation and caching
 * @class RoutingEngine
 */
export class RoutingEngine {
    constructor(config = {}) {
        this.routeEndpoint = config.routeEndpoint || '/api/route';
        this.comparisonEndpoint = config.comparisonEndpoint || '/api/route-comparison';
        this.cache = new Map();
        this.cacheTTL = config.cacheTTL || 600000; // 10 minutes
        this.stats = {
            requests: 0,
            cached: 0,
            errors: 0
        };
    }

    /**
     * Generate cache key from route parameters
     * @param {string} start - Start location
     * @param {string} end - End location
     * @param {string} mode - Routing mode (auto/pedestrian/bicycle)
     * @param {string} vehicle - Vehicle type
     * @returns {string} Cache key
     */
    generateCacheKey(start, end, mode, vehicle) {
        return `${start}|${end}|${mode}|${vehicle}`;
    }

    /**
     * Calculate route between two locations
     * @async
     * @param {string} start - Start coordinates (lat,lon)
     * @param {string} end - End coordinates (lat,lon)
     * @param {Object} options - Route options
     * @returns {Promise<Object>} Route data
     */
    async calculateRoute(start, end, options = {}) {
        const cacheKey = this.generateCacheKey(start, end, options.mode || 'auto', options.vehicle || 'petrol_diesel');
        
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            this.stats.cached++;
            return cached.data;
        }

        this.stats.requests++;

        try {
            const response = await fetch(this.routeEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start,
                    end,
                    routing_mode: options.mode || 'auto',
                    vehicle_type: options.vehicle || 'petrol_diesel',
                    ...options
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Cache successful response
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Compare multiple routes
     * @async
     * @param {Array} routes - Array of route objects
     * @returns {Promise<Object>} Comparison data
     */
    async compareRoutes(routes) {
        try {
            const response = await fetch(this.comparisonEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ routes })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Clear route cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = { requests: 0, cached: 0, errors: 0 };
    }
}


/**
 * @file Optimized API Client with deduplication, caching, and batching
 * @module api/client
 */

import { RequestDeduplicator } from './deduplicator.js';
import { CacheManager } from './cache.js';
import { BatchRequestManager } from './batcher.js';
import { ResponseOptimizer } from './response-optimizer.js';

/**
 * Optimized API Client
 * Integrates request deduplication, caching, and batching
 * @class APIClient
 */
export class APIClient {
    /**
     * Initialize APIClient with all optimizations
     * @constructor
     * @param {Object} config - Configuration
     * @param {boolean} config.enableDedup - Enable deduplication (default: true)
     * @param {boolean} config.enableCache - Enable caching (default: true)
     * @param {boolean} config.enableBatch - Enable batching (default: true)
     * @param {number} config.deduplicationWindow - Dedup window in ms (default: 5000)
     * @param {Object} config.cache - Cache configuration
     * @param {Object} config.batch - Batch configuration
     */
    constructor(config = {}) {
        this.deduplicator = new RequestDeduplicator(config.deduplicationWindow || 5000);
        this.cache = new CacheManager(config.cache || {});
        this.batcher = new BatchRequestManager(config.batch || {});
        this.optimizer = new ResponseOptimizer(config.optimizer || {});

        this.config = {
            enableDedup: config.enableDedup !== false,
            enableCache: config.enableCache !== false,
            enableBatch: config.enableBatch !== false,
            enableOptimization: config.enableOptimization !== false,
            ...config
        };

        this.stats = {
            requests: 0,
            cached: 0,
            deduplicated: 0,
            batched: 0,
            optimized: 0
        };
    }

    /**
     * Build full URL with query parameters
     * @function buildUrl
     * @param {string} url - Base URL
     * @param {Object} params - Query parameters
     * @returns {string} Full URL with parameters
     */
    buildUrl(url, params = {}) {
        if (Object.keys(params).length === 0) return url;
        const query = new URLSearchParams(params).toString();
        return `${url}?${query}`;
    }

    /**
     * Endpoint-specific TTL configuration
     * @type {Object}
     */
    static ENDPOINT_TTL = {
        '/api/route': 3600000,           // 1 hour - routes don't change often
        '/api/hazards': 600000,          // 10 minutes - hazards update regularly
        '/api/weather': 1800000,         // 30 minutes - weather updates periodically
        '/api/charging': 86400000,       // 24 hours - charging stations change slowly
        '/api/trip-history': 300000,     // 5 minutes - trip history updates frequently
        '/api/vehicle': 86400000,        // 24 hours - vehicle data changes rarely
        '/api/settings': 86400000,       // 24 hours - settings change rarely
        '/api/traffic': 300000           // 5 minutes - traffic updates frequently
    };

    /**
     * Get endpoint-specific TTL
     * @function getEndpointTTL
     * @param {string} url - Request URL
     * @returns {number} TTL in milliseconds
     */
    getEndpointTTL(url) {
        // Extract endpoint from URL
        const endpoint = url.split('?')[0];

        // Check for exact match
        if (APIClient.ENDPOINT_TTL[endpoint]) {
            return APIClient.ENDPOINT_TTL[endpoint];
        }

        // Check for pattern match (e.g., /api/route/123)
        for (const [pattern, ttl] of Object.entries(APIClient.ENDPOINT_TTL)) {
            if (endpoint.startsWith(pattern)) {
                return ttl;
            }
        }

        // Default TTL
        return 300000; // 5 minutes
    }

    /**
     * GET request with optimizations
     * @async
     * @function get
     * @param {string} url - Request URL
     * @param {Object} params - Query parameters
     * @param {Object} options - Cache options
     * @returns {Promise<any>} Response data
     */
    async get(url, params = {}, options = {}) {
        const fullUrl = this.buildUrl(url, params);
        const cacheKey = `GET:${fullUrl}`;

        // Use endpoint-specific TTL if not provided
        const cacheTTL = options.cacheTTL || this.getEndpointTTL(url);

        // Check cache first
        if (this.config.enableCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.stats.cached++;
                return cached;
            }
        }

        // Use deduplicator
        if (this.config.enableDedup) {
            const response = await this.deduplicator.fetch(fullUrl, { method: 'GET' });
            let data = await response.json();

            // Optimize response
            if (this.config.enableOptimization) {
                data = this.optimizer.optimize(data, url);
                this.stats.optimized++;
            }

            if (this.config.enableCache) {
                this.cache.set(cacheKey, data, cacheTTL);
            }

            this.stats.requests++;
            return data;
        }

        // Fallback to regular fetch
        const response = await fetch(fullUrl, { method: 'GET' });
        let data = await response.json();

        // Optimize response
        if (this.config.enableOptimization) {
            data = this.optimizer.optimize(data, url);
            this.stats.optimized++;
        }

        if (this.config.enableCache) {
            this.cache.set(cacheKey, data, cacheTTL);
        }

        this.stats.requests++;
        return data;
    }

    /**
     * POST request with optimizations
     * @async
     * @function post
     * @param {string} url - Request URL
     * @param {Object} data - Request body
     * @param {Object} options - Request options
     * @returns {Promise<any>} Response data
     */
    async post(url, data = {}, options = {}) {
        const cacheKey = `POST:${url}:${JSON.stringify(data)}`;
        const cacheTTL = options.cacheTTL || 0; // No cache by default for POST

        // Check cache if enabled
        if (this.config.enableCache && cacheTTL > 0) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.stats.cached++;
                return cached;
            }
        }

        // Use deduplicator
        if (this.config.enableDedup) {
            const response = await this.deduplicator.fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (this.config.enableCache && cacheTTL > 0) {
                this.cache.set(cacheKey, result, cacheTTL);
            }
            
            this.stats.requests++;
            return result;
        }

        // Fallback to regular fetch
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (this.config.enableCache && cacheTTL > 0) {
            this.cache.set(cacheKey, result, cacheTTL);
        }
        
        this.stats.requests++;
        return result;
    }

    /**
     * Invalidate cache for URL pattern
     * @function invalidateCache
     * @param {string} pattern - URL pattern to invalidate
     */
    invalidateCache(pattern) {
        this.cache.invalidatePattern(pattern);
    }

    /**
     * Get statistics
     * @function getStats
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            api: this.stats,
            deduplicator: this.deduplicator.getStats(),
            cache: this.cache.getStats(),
            batcher: this.batcher.getStats()
        };
    }

    /**
     * Reset statistics
     * @function resetStats
     */
    resetStats() {
        this.stats = { requests: 0, cached: 0, deduplicated: 0, batched: 0 };
        this.deduplicator.resetStats();
        this.cache.resetStats();
        this.batcher.resetStats();
    }

    /**
     * Clear all caches
     * @function clear
     */
    clear() {
        this.cache.clear();
        this.deduplicator.clear();
        this.batcher.clear();
    }
}

export default APIClient;


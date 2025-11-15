/**
 * @file Optimized API Client with deduplication, caching, and batching
 * @module api/client
 */

import { RequestDeduplicator } from './deduplicator.js';
import { CacheManager } from './cache.js';
import { BatchRequestManager } from './batcher.js';

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
        
        this.config = {
            enableDedup: config.enableDedup !== false,
            enableCache: config.enableCache !== false,
            enableBatch: config.enableBatch !== false,
            ...config
        };

        this.stats = {
            requests: 0,
            cached: 0,
            deduplicated: 0,
            batched: 0
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
        const cacheTTL = options.cacheTTL || 300000; // 5 min default

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
            const data = await response.json();
            
            if (this.config.enableCache) {
                this.cache.set(cacheKey, data, cacheTTL);
            }
            
            this.stats.requests++;
            return data;
        }

        // Fallback to regular fetch
        const response = await fetch(fullUrl, { method: 'GET' });
        const data = await response.json();
        
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


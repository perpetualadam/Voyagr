/**
 * Optimized API Client
 * Integrates request deduplication, caching, and batching
 * 
 * @module APIClient
 * @example
 * const api = new APIClient();
 * const route = await api.get('/api/route', { start: '51.5,-0.1', end: '51.6,-0.1' });
 */

class APIClient {
    /**
     * Initialize APIClient with all optimizations
     * @param {object} config - Configuration
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
     * GET request with optimizations
     * @param {string} url - Request URL
     * @param {object} params - Query parameters
     * @param {object} options - Cache options
     * @returns {Promise} Response data
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
                console.log(`[API] Cache hit: ${url}`);
                return cached;
            }
        }

        this.stats.requests++;

        try {
            let response;

            if (this.config.enableDedup) {
                response = await this.deduplicator.fetch(fullUrl);
            } else {
                response = await fetch(fullUrl);
            }

            const data = await response.json();

            // Cache successful response
            if (this.config.enableCache && response.ok) {
                this.cache.set(cacheKey, data, cacheTTL);
            }

            return data;
        } catch (error) {
            console.error(`[API] GET error: ${url}`, error);
            throw error;
        }
    }

    /**
     * POST request with optimizations
     * @param {string} url - Request URL
     * @param {object} data - Request body
     * @param {object} options - Request options
     * @returns {Promise} Response data
     */
    async post(url, data = {}, options = {}) {
        this.stats.requests++;

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            ...options
        };

        try {
            let response;

            if (this.config.enableDedup) {
                response = await this.deduplicator.fetch(url, fetchOptions);
            } else {
                response = await fetch(url, fetchOptions);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error(`[API] POST error: ${url}`, error);
            throw error;
        }
    }

    /**
     * Build full URL with query parameters
     * @param {string} url - Base URL
     * @param {object} params - Query parameters
     * @returns {string} Full URL
     */
    buildUrl(url, params = {}) {
        if (Object.keys(params).length === 0) return url;
        
        const query = new URLSearchParams(params).toString();
        return `${url}?${query}`;
    }

    /**
     * Invalidate cache for pattern
     * @param {string|RegExp} pattern - Pattern to match
     */
    invalidateCache(pattern) {
        this.cache.invalidatePattern(pattern);
    }

    /**
     * Get comprehensive statistics
     * @returns {object} Statistics
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
     * Reset all statistics
     */
    resetStats() {
        this.stats = {
            requests: 0,
            cached: 0,
            deduplicated: 0,
            batched: 0
        };
        this.deduplicator.resetStats();
        this.cache.resetStats();
        this.batcher.resetStats();
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIClient;
}


/**
 * Cache Manager Module
 * Manages response caching with TTL and invalidation
 * 
 * @module CacheManager
 * @example
 * const cache = new CacheManager();
 * cache.set('/api/route', data, 300000); // 5 min TTL
 * const data = cache.get('/api/route');
 */

class CacheManager {
    /**
     * Initialize CacheManager
     * @param {object} config - Configuration
     * @param {number} config.defaultTTL - Default TTL in ms (default: 300000 = 5 min)
     * @param {number} config.maxSize - Max cache entries (default: 1000)
     */
    constructor(config = {}) {
        this.defaultTTL = config.defaultTTL || 300000; // 5 minutes
        this.maxSize = config.maxSize || 1000;
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            expirations: 0
        };
        this.ttlMap = new Map(); // Store TTL for each key
    }

    /**
     * Set cache entry with TTL
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in ms (optional)
     */
    set(key, value, ttl = this.defaultTTL) {
        // Evict oldest entry if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.ttlMap.delete(firstKey);
            this.stats.evictions++;
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });

        // Set expiration timer
        if (this.ttlMap.has(key)) {
            clearTimeout(this.ttlMap.get(key).timer);
        }

        const timer = setTimeout(() => {
            this.cache.delete(key);
            this.ttlMap.delete(key);
            this.stats.expirations++;
            console.log(`[Cache] Expired: ${key}`);
        }, ttl);

        this.ttlMap.set(key, { timer, ttl, expiresAt: Date.now() + ttl });
        console.log(`[Cache] Set: ${key} (TTL: ${ttl}ms)`);
    }

    /**
     * Get cache entry
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        console.log(`[Cache] Hit: ${key}`);
        return entry.value;
    }

    /**
     * Check if key exists and is valid
     * @param {string} key - Cache key
     * @returns {boolean} True if valid
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Invalidate cache entry
     * @param {string} key - Cache key
     */
    invalidate(key) {
        if (this.ttlMap.has(key)) {
            clearTimeout(this.ttlMap.get(key).timer);
            this.ttlMap.delete(key);
        }
        this.cache.delete(key);
        console.log(`[Cache] Invalidated: ${key}`);
    }

    /**
     * Invalidate by pattern
     * @param {string|RegExp} pattern - Pattern to match
     */
    invalidatePattern(pattern) {
        const regex = typeof pattern === 'string' 
            ? new RegExp(pattern) 
            : pattern;

        let count = 0;
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.invalidate(key);
                count++;
            }
        }
        console.log(`[Cache] Invalidated ${count} entries matching: ${pattern}`);
    }

    /**
     * Clear all cache
     */
    clear() {
        for (const ttlInfo of this.ttlMap.values()) {
            clearTimeout(ttlInfo.timer);
        }
        this.cache.clear();
        this.ttlMap.clear();
        console.log('[Cache] Cleared all entries');
    }

    /**
     * Get cache statistics
     * @returns {object} Statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 
                ? ((this.stats.hits / total) * 100).toFixed(2) + '%'
                : '0%',
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            expirations: 0
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheManager;
}


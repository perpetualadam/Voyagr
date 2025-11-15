/**
 * @file Cache Manager - TTL-based caching with LRU eviction
 * @module api/cache
 */

/**
 * Cache Manager
 * Implements TTL-based caching with LRU eviction
 * @class CacheManager
 */
export class CacheManager {
    /**
     * Initialize CacheManager
     * @constructor
     * @param {Object} config - Configuration
     * @param {number} config.defaultTTL - Default TTL in milliseconds (default: 300000)
     * @param {number} config.maxSize - Maximum cache size (default: 1000)
     */
    constructor(config = {}) {
        this.defaultTTL = config.defaultTTL || 300000; // 5 minutes
        this.maxSize = config.maxSize || 1000;
        this.cache = new Map();
        this.ttlMap = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            expirations: 0,
            hitRate: 0,
            size: 0,
            maxSize: this.maxSize
        };
    }

    /**
     * Set cache value with TTL
     * @function set
     * @param {string} key - Cache key
     * @param {any} value - Cache value
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, value, ttl = this.defaultTTL) {
        // Evict oldest entry if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            const oldTimer = this.ttlMap.get(firstKey)?.timer;
            if (oldTimer) clearTimeout(oldTimer);
            this.ttlMap.delete(firstKey);
            this.stats.evictions++;
        }

        // Store value
        this.cache.set(key, { value, timestamp: Date.now() });

        // Clear old timer if exists
        const oldTimer = this.ttlMap.get(key)?.timer;
        if (oldTimer) clearTimeout(oldTimer);

        // Set new expiration timer
        const timer = setTimeout(() => {
            this.cache.delete(key);
            this.ttlMap.delete(key);
            this.stats.expirations++;
            this.stats.size = this.cache.size;
        }, ttl);

        this.ttlMap.set(key, { timer, ttl, expiresAt: Date.now() + ttl });
        this.stats.size = this.cache.size;
    }

    /**
     * Get cache value
     * @function get
     * @param {string} key - Cache key
     * @returns {any} Cache value or undefined
     */
    get(key) {
        const entry = this.cache.get(key);
        if (entry) {
            this.stats.hits++;
            this.updateHitRate();
            return entry.value;
        }
        this.stats.misses++;
        this.updateHitRate();
        return undefined;
    }

    /**
     * Check if key exists in cache
     * @function has
     * @param {string} key - Cache key
     * @returns {boolean} True if key exists
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Delete cache entry
     * @function delete
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
        const timer = this.ttlMap.get(key)?.timer;
        if (timer) clearTimeout(timer);
        this.ttlMap.delete(key);
        this.stats.size = this.cache.size;
    }

    /**
     * Invalidate cache entries matching pattern
     * @function invalidatePattern
     * @param {string} pattern - Regex pattern to match
     */
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        const keysToDelete = [];
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.delete(key));
    }

    /**
     * Update hit rate
     * @function updateHitRate
     */
    updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        if (total > 0) {
            this.stats.hitRate = (this.stats.hits / total * 100).toFixed(2);
        }
    }

    /**
     * Get statistics
     * @function getStats
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     * @function resetStats
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            expirations: 0,
            hitRate: 0,
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }

    /**
     * Clear all cache
     * @function clear
     */
    clear() {
        for (const timer of this.ttlMap.values()) {
            clearTimeout(timer.timer);
        }
        this.cache.clear();
        this.ttlMap.clear();
        this.stats.size = 0;
    }
}

export default CacheManager;


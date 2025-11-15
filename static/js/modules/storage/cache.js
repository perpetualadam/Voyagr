/**
 * @file Cache Storage Module - Handles localStorage caching
 * @module modules/storage/cache
 */

/**
 * CacheStorage class - Manages localStorage caching
 * @class CacheStorage
 */
export class CacheStorage {
    constructor(config = {}) {
        this.prefix = config.prefix || 'voyagr_';
        this.defaultTTL = config.defaultTTL || 3600000; // 1 hour
    }

    /**
     * Set cache item
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds
     */
    setItem(key, value, ttl = this.defaultTTL) {
        const item = {
            value,
            timestamp: Date.now(),
            ttl
        };

        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(item));
        } catch (error) {
            console.error('Cache storage error:', error);
        }
    }

    /**
     * Get cache item
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    getItem(key) {
        try {
            const item = localStorage.getItem(this.prefix + key);
            if (!item) return null;

            const parsed = JSON.parse(item);
            const age = Date.now() - parsed.timestamp;

            // Check if expired
            if (age > parsed.ttl) {
                this.removeItem(key);
                return null;
            }

            return parsed.value;
        } catch (error) {
            console.error('Cache retrieval error:', error);
            return null;
        }
    }

    /**
     * Remove cache item
     * @param {string} key - Cache key
     */
    removeItem(key) {
        try {
            localStorage.removeItem(this.prefix + key);
        } catch (error) {
            console.error('Cache removal error:', error);
        }
    }

    /**
     * Clear all cache items
     */
    clearAll() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.error('Cache clear error:', error);
        }
    }

    /**
     * Get cache size
     * @returns {number} Cache size in bytes
     */
    getSize() {
        let size = 0;
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    size += localStorage.getItem(key).length;
                }
            });
        } catch (error) {
            console.error('Cache size error:', error);
        }
        return size;
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        const stats = {
            itemCount: 0,
            size: 0,
            expiredCount: 0
        };

        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    const item = localStorage.getItem(key);
                    stats.size += item.length;
                    stats.itemCount++;

                    // Check if expired
                    try {
                        const parsed = JSON.parse(item);
                        const age = Date.now() - parsed.timestamp;
                        if (age > parsed.ttl) {
                            stats.expiredCount++;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            });
        } catch (error) {
            console.error('Cache stats error:', error);
        }

        return stats;
    }

    /**
     * Clean expired items
     */
    cleanExpired() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    const item = localStorage.getItem(key);
                    try {
                        const parsed = JSON.parse(item);
                        const age = Date.now() - parsed.timestamp;
                        if (age > parsed.ttl) {
                            localStorage.removeItem(key);
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            });
        } catch (error) {
            console.error('Cache clean error:', error);
        }
    }
}


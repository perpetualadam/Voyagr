/**
 * @file Request Deduplicator - Prevents duplicate API calls
 * @module api/deduplicator
 */

/**
 * Request Deduplicator
 * Prevents duplicate API calls within a time window
 * @class RequestDeduplicator
 */
export class RequestDeduplicator {
    /**
     * Initialize RequestDeduplicator
     * @constructor
     * @param {number} deduplicationWindow - Time window in milliseconds (default: 5000)
     */
    constructor(deduplicationWindow = 5000) {
        this.deduplicationWindow = deduplicationWindow;
        this.pendingRequests = new Map();
        this.requestStats = {
            total: 0,
            deduplicated: 0,
            failed: 0,
            deduplicationRate: 0,
            pendingRequests: 0
        };
    }

    /**
     * Generate cache key from URL and options
     * @function generateKey
     * @param {string} url - Request URL
     * @param {Object} options - Request options
     * @returns {string} Cache key
     */
    generateKey(url, options = {}) {
        const method = options.method || 'GET';
        const body = options.body || '';
        return `${method}:${url}:${body}`;
    }

    /**
     * Fetch with deduplication
     * @async
     * @function fetch
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async fetch(url, options = {}) {
        const key = this.generateKey(url, options);
        this.requestStats.total++;

        // Check if request is already pending
        if (this.pendingRequests.has(key)) {
            this.requestStats.deduplicated++;
            this.updateDeduplicationRate();
            return this.pendingRequests.get(key);
        }

        // Create new fetch promise
        const promise = fetch(url, options)
            .then(response => response.clone())
            .catch(error => {
                this.requestStats.failed++;
                throw error;
            })
            .finally(() => {
                // Clean up after deduplication window
                setTimeout(() => {
                    this.pendingRequests.delete(key);
                    this.requestStats.pendingRequests = this.pendingRequests.size;
                }, this.deduplicationWindow);
            });

        // Store pending request
        this.pendingRequests.set(key, promise);
        this.requestStats.pendingRequests = this.pendingRequests.size;

        return promise;
    }

    /**
     * Update deduplication rate
     * @function updateDeduplicationRate
     */
    updateDeduplicationRate() {
        if (this.requestStats.total > 0) {
            this.requestStats.deduplicationRate = 
                (this.requestStats.deduplicated / this.requestStats.total * 100).toFixed(2);
        }
    }

    /**
     * Get statistics
     * @function getStats
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.requestStats };
    }

    /**
     * Reset statistics
     * @function resetStats
     */
    resetStats() {
        this.requestStats = {
            total: 0,
            deduplicated: 0,
            failed: 0,
            deduplicationRate: 0,
            pendingRequests: this.pendingRequests.size
        };
    }

    /**
     * Clear pending requests
     * @function clear
     */
    clear() {
        this.pendingRequests.clear();
        this.requestStats.pendingRequests = 0;
    }
}

export default RequestDeduplicator;


/**
 * Request Deduplicator Module
 * Prevents duplicate API calls within a time window
 * 
 * @module RequestDeduplicator
 * @example
 * const dedup = new RequestDeduplicator(5000); // 5 second window
 * const response = await dedup.fetch('/api/route', options);
 */

class RequestDeduplicator {
    /**
     * Initialize RequestDeduplicator
     * @param {number} deduplicationWindow - Time window in ms (default: 5000)
     */
    constructor(deduplicationWindow = 5000) {
        this.deduplicationWindow = deduplicationWindow;
        this.pendingRequests = new Map();
        this.requestStats = {
            total: 0,
            deduplicated: 0,
            failed: 0
        };
    }

    /**
     * Generate cache key from URL and options
     * @param {string} url - Request URL
     * @param {object} options - Fetch options
     * @returns {string} Cache key
     */
    generateKey(url, options = {}) {
        const method = options.method || 'GET';
        const body = options.body ? JSON.stringify(JSON.parse(options.body)) : '';
        return `${method}:${url}:${body}`;
    }

    /**
     * Fetch with deduplication
     * @param {string} url - Request URL
     * @param {object} options - Fetch options
     * @returns {Promise} Response promise
     */
    async fetch(url, options = {}) {
        const key = this.generateKey(url, options);
        this.requestStats.total++;

        // Check if request is already pending
        if (this.pendingRequests.has(key)) {
            this.requestStats.deduplicated++;
            console.log(`[Dedup] Returning cached promise for: ${url}`);
            return this.pendingRequests.get(key);
        }

        // Create new request promise
        const promise = fetch(url, options)
            .then(response => {
                // Clone response for multiple consumers
                const cloned = response.clone();
                return cloned;
            })
            .catch(error => {
                this.requestStats.failed++;
                throw error;
            })
            .finally(() => {
                // Remove from pending after window expires
                setTimeout(() => {
                    this.pendingRequests.delete(key);
                }, this.deduplicationWindow);
            });

        // Store pending request
        this.pendingRequests.set(key, promise);
        console.log(`[Dedup] New request: ${url} (pending: ${this.pendingRequests.size})`);

        return promise;
    }

    /**
     * Get deduplication statistics
     * @returns {object} Statistics
     */
    getStats() {
        return {
            ...this.requestStats,
            deduplicationRate: this.requestStats.total > 0 
                ? ((this.requestStats.deduplicated / this.requestStats.total) * 100).toFixed(2) + '%'
                : '0%',
            pendingRequests: this.pendingRequests.size
        };
    }

    /**
     * Clear all pending requests
     */
    clear() {
        this.pendingRequests.clear();
        console.log('[Dedup] Cleared all pending requests');
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.requestStats = {
            total: 0,
            deduplicated: 0,
            failed: 0
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RequestDeduplicator;
}


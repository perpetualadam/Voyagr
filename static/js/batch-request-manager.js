/**
 * Batch Request Manager Module
 * Combines multiple API requests into single batch requests
 * 
 * @module BatchRequestManager
 * @example
 * const batcher = new BatchRequestManager();
 * const result = await batcher.add('/api/route', data);
 */

class BatchRequestManager {
    /**
     * Initialize BatchRequestManager
     * @param {object} config - Configuration
     * @param {number} config.batchTimeout - Time to wait before sending batch (default: 100ms)
     * @param {number} config.maxBatchSize - Max requests per batch (default: 10)
     * @param {string} config.batchEndpoint - Batch endpoint URL (default: '/api/batch')
     */
    constructor(config = {}) {
        this.batchTimeout = config.batchTimeout || 100;
        this.maxBatchSize = config.maxBatchSize || 10;
        this.batchEndpoint = config.batchEndpoint || '/api/batch';
        this.queue = [];
        this.batchTimer = null;
        this.stats = {
            batches: 0,
            requests: 0,
            saved: 0
        };
    }

    /**
     * Add request to batch queue
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request data
     * @param {object} options - Fetch options
     * @returns {Promise} Response promise
     */
    add(endpoint, data = {}, options = {}) {
        return new Promise((resolve, reject) => {
            const request = {
                endpoint,
                data,
                options,
                resolve,
                reject,
                id: Math.random().toString(36).substr(2, 9)
            };

            this.queue.push(request);
            this.stats.requests++;

            // Send immediately if batch is full
            if (this.queue.length >= this.maxBatchSize) {
                this.flush();
            } else if (!this.batchTimer) {
                // Schedule batch send
                this.batchTimer = setTimeout(() => this.flush(), this.batchTimeout);
            }
        });
    }

    /**
     * Send batched requests
     */
    async flush() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0, this.maxBatchSize);
        this.stats.batches++;
        this.stats.saved += batch.length - 1; // Saved requests

        console.log(`[Batch] Sending ${batch.length} requests in 1 batch`);

        try {
            const response = await fetch(this.batchEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requests: batch.map(r => ({
                        id: r.id,
                        endpoint: r.endpoint,
                        data: r.data
                    }))
                })
            });

            const results = await response.json();

            // Resolve individual requests
            for (const request of batch) {
                const result = results.responses?.find(r => r.id === request.id);
                if (result?.success) {
                    request.resolve(result.data);
                } else {
                    request.reject(new Error(result?.error || 'Batch request failed'));
                }
            }
        } catch (error) {
            // Reject all requests in batch
            for (const request of batch) {
                request.reject(error);
            }
        }

        // Continue processing queue
        if (this.queue.length > 0) {
            this.batchTimer = setTimeout(() => this.flush(), this.batchTimeout);
        }
    }

    /**
     * Get batch statistics
     * @returns {object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.queue.length,
            efficiency: this.stats.requests > 0
                ? ((this.stats.saved / this.stats.requests) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            batches: 0,
            requests: 0,
            saved: 0
        };
    }

    /**
     * Clear queue and cancel pending requests
     */
    clear() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        for (const request of this.queue) {
            request.reject(new Error('Batch manager cleared'));
        }

        this.queue = [];
        console.log('[Batch] Cleared queue');
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BatchRequestManager;
}


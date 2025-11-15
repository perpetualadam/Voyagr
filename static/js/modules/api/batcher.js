/**
 * @file Batch Request Manager - Combines multiple requests into batches
 * @module api/batcher
 */

/**
 * Batch Request Manager
 * Combines multiple API requests into single batch requests
 * @class BatchRequestManager
 */
export class BatchRequestManager {
    /**
     * Initialize BatchRequestManager
     * @constructor
     * @param {Object} config - Configuration
     * @param {number} config.batchTimeout - Batch timeout in milliseconds (default: 100)
     * @param {number} config.maxBatchSize - Maximum batch size (default: 10)
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
            saved: 0,
            queueSize: 0,
            efficiency: 0
        };
    }

    /**
     * Add request to batch queue
     * @async
     * @function add
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @param {Object} options - Request options
     * @returns {Promise<any>} Response data
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
            this.stats.queueSize = this.queue.length;

            // Flush if batch is full
            if (this.queue.length >= this.maxBatchSize) {
                this.flush();
            } else if (!this.batchTimer) {
                // Schedule flush after timeout
                this.batchTimer = setTimeout(() => this.flush(), this.batchTimeout);
            }
        });
    }

    /**
     * Flush batch queue
     * @async
     * @function flush
     */
    async flush() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0, this.maxBatchSize);
        this.stats.batches++;
        this.stats.saved += batch.length - 1; // Save N-1 requests
        this.stats.queueSize = this.queue.length;

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

            const result = await response.json();

            // Match responses to requests
            if (result.responses) {
                for (const response of result.responses) {
                    const request = batch.find(r => r.id === response.id);
                    if (request) {
                        if (response.success) {
                            request.resolve(response.data);
                        } else {
                            request.reject(new Error(response.error || 'Batch request failed'));
                        }
                    }
                }
            }

            this.updateEfficiency();
        } catch (error) {
            // Reject all requests in batch
            batch.forEach(request => request.reject(error));
        }

        // Continue flushing if queue has more items
        if (this.queue.length > 0) {
            this.batchTimer = setTimeout(() => this.flush(), this.batchTimeout);
        }
    }

    /**
     * Update efficiency metric
     * @function updateEfficiency
     */
    updateEfficiency() {
        if (this.stats.requests > 0) {
            this.stats.efficiency = 
                (this.stats.saved / this.stats.requests * 100).toFixed(2);
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
            batches: 0,
            requests: 0,
            saved: 0,
            queueSize: this.queue.length,
            efficiency: 0
        };
    }

    /**
     * Clear queue
     * @function clear
     */
    clear() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        this.queue = [];
        this.stats.queueSize = 0;
    }
}

export default BatchRequestManager;


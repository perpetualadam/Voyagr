/**
 * @file API module exports
 * @module api
 */

export { RequestDeduplicator } from './deduplicator.js';
export { CacheManager } from './cache.js';
export { BatchRequestManager } from './batcher.js';
export { APIClient } from './client.js';

/**
 * Create and configure API client with all optimizations
 * @function createAPIClient
 * @param {Object} options - Configuration options
 * @returns {APIClient} Configured API client instance
 */
export function createAPIClient(options = {}) {
    return new APIClient({
        enableDedup: true,
        enableCache: true,
        enableBatch: true,
        deduplicationWindow: 5000,
        cache: { defaultTTL: 300000, maxSize: 1000 },
        batch: { batchTimeout: 100, maxBatchSize: 10 },
        ...options
    });
}

export default {
    createAPIClient
};


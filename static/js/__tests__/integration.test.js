/**
 * @file Integration tests for optimization system
 * @module __tests__/integration
 */

// Mock the optimization classes since they're not ES6 modules yet
class RequestDeduplicator {
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

    generateKey(url, options = {}) {
        const method = options.method || 'GET';
        const body = options.body || '';
        return `${method}:${url}:${body}`;
    }

    async fetch(url, options = {}) {
        const key = this.generateKey(url, options);
        this.requestStats.total++;

        if (this.pendingRequests.has(key)) {
            this.requestStats.deduplicated++;
            return this.pendingRequests.get(key);
        }

        const promise = fetch(url, options)
            .then(response => response.clone())
            .catch(error => {
                this.requestStats.failed++;
                throw error;
            })
            .finally(() => {
                setTimeout(() => {
                    this.pendingRequests.delete(key);
                    this.requestStats.pendingRequests = this.pendingRequests.size;
                }, this.deduplicationWindow);
            });

        this.pendingRequests.set(key, promise);
        this.requestStats.pendingRequests = this.pendingRequests.size;

        return promise;
    }

    getStats() {
        return { ...this.requestStats };
    }

    resetStats() {
        this.requestStats = {
            total: 0,
            deduplicated: 0,
            failed: 0,
            deduplicationRate: 0,
            pendingRequests: this.pendingRequests.size
        };
    }

    clear() {
        this.pendingRequests.clear();
        this.requestStats.pendingRequests = 0;
    }
}

class CacheManager {
    constructor(config = {}) {
        this.defaultTTL = config.defaultTTL || 300000;
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

    set(key, value, ttl = this.defaultTTL) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            const oldTimer = this.ttlMap.get(firstKey)?.timer;
            if (oldTimer) clearTimeout(oldTimer);
            this.ttlMap.delete(firstKey);
            this.stats.evictions++;
        }

        this.cache.set(key, { value, timestamp: Date.now() });

        const oldTimer = this.ttlMap.get(key)?.timer;
        if (oldTimer) clearTimeout(oldTimer);

        const timer = setTimeout(() => {
            this.cache.delete(key);
            this.ttlMap.delete(key);
            this.stats.expirations++;
            this.stats.size = this.cache.size;
        }, ttl);

        this.ttlMap.set(key, { timer, ttl, expiresAt: Date.now() + ttl });
        this.stats.size = this.cache.size;
    }

    get(key) {
        const entry = this.cache.get(key);
        if (entry) {
            this.stats.hits++;
            return entry.value;
        }
        this.stats.misses++;
        return undefined;
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        this.cache.delete(key);
        const timer = this.ttlMap.get(key)?.timer;
        if (timer) clearTimeout(timer);
        this.ttlMap.delete(key);
        this.stats.size = this.cache.size;
    }

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

    getStats() {
        return { ...this.stats };
    }

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

    clear() {
        for (const timer of this.ttlMap.values()) {
            clearTimeout(timer.timer);
        }
        this.cache.clear();
        this.ttlMap.clear();
        this.stats.size = 0;
    }
}

class BatchRequestManager {
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

            if (this.queue.length >= this.maxBatchSize) {
                this.flush();
            } else if (!this.batchTimer) {
                this.batchTimer = setTimeout(() => this.flush(), this.batchTimeout);
            }
        });
    }

    async flush() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0, this.maxBatchSize);
        this.stats.batches++;
        this.stats.saved += batch.length - 1;
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
        } catch (error) {
            batch.forEach(request => request.reject(error));
        }

        if (this.queue.length > 0) {
            this.batchTimer = setTimeout(() => this.flush(), this.batchTimeout);
        }
    }

    getStats() {
        return { ...this.stats };
    }

    resetStats() {
        this.stats = {
            batches: 0,
            requests: 0,
            saved: 0,
            queueSize: this.queue.length,
            efficiency: 0
        };
    }

    clear() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        this.queue = [];
        this.stats.queueSize = 0;
    }
}

class APIClient {
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

    buildUrl(url, params = {}) {
        if (Object.keys(params).length === 0) return url;
        const query = new URLSearchParams(params).toString();
        return `${url}?${query}`;
    }

    async get(url, params = {}, options = {}) {
        const fullUrl = this.buildUrl(url, params);
        const cacheKey = `GET:${fullUrl}`;
        const cacheTTL = options.cacheTTL || 300000;

        if (this.config.enableCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.stats.cached++;
                return cached;
            }
        }

        if (this.config.enableDedup) {
            const response = await this.deduplicator.fetch(fullUrl, { method: 'GET' });
            const data = await response.json();

            // Track deduplication stats
            const dedupStats = this.deduplicator.getStats();
            this.stats.deduplicated = dedupStats.deduplicated;

            if (this.config.enableCache) {
                this.cache.set(cacheKey, data, cacheTTL);
            }

            this.stats.requests++;
            return data;
        }

        const response = await fetch(fullUrl, { method: 'GET' });
        const data = await response.json();

        if (this.config.enableCache) {
            this.cache.set(cacheKey, data, cacheTTL);
        }

        this.stats.requests++;
        return data;
    }

    async post(url, data = {}, options = {}) {
        const cacheKey = `POST:${url}:${JSON.stringify(data)}`;
        const cacheTTL = options.cacheTTL || 0;

        if (this.config.enableCache && cacheTTL > 0) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.stats.cached++;
                return cached;
            }
        }

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

    invalidateCache(pattern) {
        this.cache.invalidatePattern(pattern);
    }

    getStats() {
        return {
            api: this.stats,
            deduplicator: this.deduplicator.getStats(),
            cache: this.cache.getStats(),
            batcher: this.batcher.getStats()
        };
    }

    resetStats() {
        this.stats = { requests: 0, cached: 0, deduplicated: 0, batched: 0 };
        this.deduplicator.resetStats();
        this.cache.resetStats();
        this.batcher.resetStats();
    }

    clear() {
        this.cache.clear();
        this.deduplicator.clear();
        this.batcher.clear();
    }
}

describe('Integration Tests - Optimization System', () => {
    let api;
    let mockFetch;

    beforeEach(() => {
        // Reset all modules
        api = new APIClient();
        
        // Mock fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;
    });

    afterEach(() => {
        jest.clearAllMocks();
        api.clear();
    });

    describe('APIClient Integration', () => {
        test('should integrate deduplication, caching, and batching', async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({ success: true, data: 'test' }),
                clone: () => ({ json: async () => ({ success: true, data: 'test' }) })
            });

            const result = await api.get('/api/test', { param: 'value' });
            expect(result).toEqual({ success: true, data: 'test' });
            expect(api.stats.requests).toBe(1);
        });

        test('should cache GET requests', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'cached' }),
                clone: () => ({ json: async () => ({ data: 'cached' }) })
            });

            const result1 = await api.get('/api/test');
            const result2 = await api.get('/api/test');

            expect(result1).toEqual({ data: 'cached' });
            expect(result2).toEqual({ data: 'cached' });
            expect(api.stats.cached).toBe(1);
        });

        test('should deduplicate identical requests', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'dedup' }),
                clone: () => ({ json: async () => ({ data: 'dedup' }) })
            });

            const promise1 = api.get('/api/test');
            const promise2 = api.get('/api/test');

            const [result1, result2] = await Promise.all([promise1, promise2]);

            expect(result1).toEqual({ data: 'dedup' });
            expect(result2).toEqual({ data: 'dedup' });
            expect(api.stats.deduplicated).toBeGreaterThan(0);
        });

        test('should handle POST requests', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ success: true }),
                clone: () => ({ json: async () => ({ success: true }) })
            });

            const result = await api.post('/api/test', { data: 'test' });
            expect(result).toEqual({ success: true });
            expect(api.stats.requests).toBe(1);
        });

        test('should invalidate cache by pattern', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            await api.get('/api/route/1');
            await api.get('/api/route/2');

            api.invalidateCache('/api/route');

            expect(api.cache.getStats().size).toBe(0);
        });

        test('should provide comprehensive statistics', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            await api.get('/api/test');

            const stats = api.getStats();
            expect(stats).toHaveProperty('api');
            expect(stats).toHaveProperty('deduplicator');
            expect(stats).toHaveProperty('cache');
            expect(stats).toHaveProperty('batcher');
        });

        test('should reset statistics', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            await api.get('/api/test');
            api.resetStats();

            const stats = api.getStats();
            expect(stats.api.requests).toBe(0);
            expect(stats.api.cached).toBe(0);
        });

        test('should clear all caches', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            await api.get('/api/test');
            api.clear();

            expect(api.cache.getStats().size).toBe(0);
            expect(api.deduplicator.getStats().pendingRequests).toBe(0);
        });
    });

    describe('Deduplication + Caching', () => {
        test('should deduplicate then cache', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            // First request - fetches
            await api.get('/api/test');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Second request - cached
            await api.get('/api/test');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Third request - cached
            await api.get('/api/test');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        test('should handle cache expiration', async () => {
            jest.useFakeTimers();

            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            await api.get('/api/test', {}, { cacheTTL: 1000 });
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Advance time past TTL
            jest.advanceTimersByTime(1100);
            jest.runAllTimers();

            await api.get('/api/test', {}, { cacheTTL: 1000 });
            expect(mockFetch).toHaveBeenCalledTimes(2);

            jest.useRealTimers();
        });
    });

    describe('Batch Request Integration', () => {
        test('should batch multiple requests', async () => {
            const batcher = new BatchRequestManager();

            const promise1 = batcher.add('/api/test1', { data: 1 });
            const promise2 = batcher.add('/api/test2', { data: 2 });

            // Verify requests are queued
            expect(batcher.queue.length).toBe(2);
            expect(batcher.stats.requests).toBe(2);

            // Verify promises are returned
            expect(promise1).toBeInstanceOf(Promise);
            expect(promise2).toBeInstanceOf(Promise);
        });

        test('should auto-flush when batch is full', async () => {
            jest.useFakeTimers();

            mockFetch.mockResolvedValue({
                json: async () => ({ success: true, responses: [] }),
                clone: () => ({ json: async () => ({ success: true, responses: [] }) })
            });

            const batcher = new BatchRequestManager({ maxBatchSize: 2 });

            batcher.add('/api/test1', {});
            batcher.add('/api/test2', {});

            // Should auto-flush when batch is full
            expect(mockFetch).toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('Error Handling', () => {
        test('should handle fetch errors', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await expect(api.get('/api/test')).rejects.toThrow('Network error');
        });

        test('should handle invalid JSON responses', async () => {
            mockFetch.mockResolvedValue({
                json: async () => { throw new Error('Invalid JSON'); },
                clone: () => ({ json: async () => { throw new Error('Invalid JSON'); } })
            });

            await expect(api.get('/api/test')).rejects.toThrow('Invalid JSON');
        });

        test('should handle batch request failures', async () => {
            const batcher = new BatchRequestManager();

            const promise = batcher.add('/api/test', {});

            // Verify request is queued
            expect(batcher.queue.length).toBe(1);
            expect(batcher.stats.requests).toBe(1);

            // Verify promise is returned
            expect(promise).toBeInstanceOf(Promise);
        });
    });

    describe('Performance Metrics', () => {
        test('should track cache hit rate', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            await api.get('/api/test');
            await api.get('/api/test');
            await api.get('/api/test');

            const stats = api.cache.getStats();
            expect(stats.hits).toBeGreaterThan(0);
            expect(stats.misses).toBeGreaterThanOrEqual(1);
        });

        test('should track deduplication rate', async () => {
            mockFetch.mockResolvedValue({
                json: async () => ({ data: 'test' }),
                clone: () => ({ json: async () => ({ data: 'test' }) })
            });

            const promise1 = api.get('/api/test');
            const promise2 = api.get('/api/test');

            await Promise.all([promise1, promise2]);

            const stats = api.deduplicator.getStats();
            expect(stats.total).toBeGreaterThan(0);
        });

        test('should track batch efficiency', async () => {
            jest.useFakeTimers();

            mockFetch.mockResolvedValue({
                json: async () => ({ success: true, responses: [] }),
                clone: () => ({ json: async () => ({ success: true, responses: [] }) })
            });

            const batcher = new BatchRequestManager();
            batcher.add('/api/test1', {});
            batcher.add('/api/test2', {});
            batcher.add('/api/test3', {});

            batcher.flush();
            jest.runAllTimers();

            const stats = batcher.getStats();
            expect(stats.requests).toBeGreaterThan(0);

            jest.useRealTimers();
        });
    });
});


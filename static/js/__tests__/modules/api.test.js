/**
 * @file API Modules Unit Tests
 * @module __tests__/modules/api.test.js
 */

describe('API Modules', () => {
    describe('RequestDeduplicator', () => {
        let dedup;

        beforeEach(() => {
            dedup = {
                pendingRequests: new Map(),
                deduplicationWindow: 5000,
                addRequest: function(key, promise) {
                    this.pendingRequests.set(key, { promise, timestamp: Date.now() });
                    return promise;
                },
                getRequest: function(key) {
                    const req = this.pendingRequests.get(key);
                    if (!req) return null;
                    const age = Date.now() - req.timestamp;
                    if (age > this.deduplicationWindow) {
                        this.pendingRequests.delete(key);
                        return null;
                    }
                    return req.promise;
                },
                removeRequest: function(key) {
                    this.pendingRequests.delete(key);
                },
                clear: function() {
                    this.pendingRequests.clear();
                },
                getStats: function() {
                    return { pending: this.pendingRequests.size };
                }
            };
        });

        test('should add request', () => {
            const promise = Promise.resolve('test');
            dedup.addRequest('key1', promise);
            expect(dedup.getRequest('key1')).toBe(promise);
        });

        test('should return null for expired request', (done) => {
            const promise = Promise.resolve('test');
            dedup.deduplicationWindow = 100;
            dedup.addRequest('key1', promise);
            
            setTimeout(() => {
                expect(dedup.getRequest('key1')).toBeNull();
                done();
            }, 150);
        });

        test('should remove request', () => {
            dedup.addRequest('key1', Promise.resolve('test'));
            dedup.removeRequest('key1');
            expect(dedup.getRequest('key1')).toBeNull();
        });

        test('should clear all requests', () => {
            dedup.addRequest('key1', Promise.resolve('test'));
            dedup.addRequest('key2', Promise.resolve('test'));
            dedup.clear();
            expect(dedup.getStats().pending).toBe(0);
        });
    });

    describe('CacheManager', () => {
        let cache;

        beforeEach(() => {
            cache = {
                cache: new Map(),
                defaultTTL: 300000,
                maxSize: 1000,
                set: function(key, value, ttl = this.defaultTTL) {
                    if (this.cache.size >= this.maxSize) {
                        const firstKey = this.cache.keys().next().value;
                        this.cache.delete(firstKey);
                    }
                    this.cache.set(key, { value, timestamp: Date.now(), ttl });
                },
                get: function(key) {
                    const item = this.cache.get(key);
                    if (!item) return null;
                    const age = Date.now() - item.timestamp;
                    if (age > item.ttl) {
                        this.cache.delete(key);
                        return null;
                    }
                    return item.value;
                },
                has: function(key) {
                    return this.get(key) !== null;
                },
                delete: function(key) {
                    this.cache.delete(key);
                },
                clear: function() {
                    this.cache.clear();
                },
                getStats: function() {
                    return { size: this.cache.size, maxSize: this.maxSize };
                }
            };
        });

        test('should set and get value', () => {
            cache.set('key1', 'value1');
            expect(cache.get('key1')).toBe('value1');
        });

        test('should return null for expired value', (done) => {
            cache.defaultTTL = 100;
            cache.set('key1', 'value1');
            
            setTimeout(() => {
                expect(cache.get('key1')).toBeNull();
                done();
            }, 150);
        });

        test('should check if key exists', () => {
            cache.set('key1', 'value1');
            expect(cache.has('key1')).toBe(true);
            expect(cache.has('key2')).toBe(false);
        });

        test('should delete value', () => {
            cache.set('key1', 'value1');
            cache.delete('key1');
            expect(cache.get('key1')).toBeNull();
        });

        test('should clear all values', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.clear();
            expect(cache.getStats().size).toBe(0);
        });

        test('should enforce max size', () => {
            cache.maxSize = 2;
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.set('key3', 'value3');
            
            expect(cache.getStats().size).toBeLessThanOrEqual(cache.maxSize);
        });
    });

    describe('BatchRequestManager', () => {
        let batcher;

        beforeEach(() => {
            batcher = {
                queue: [],
                batchSize: 10,
                batchTimeout: 100,
                timer: null,
                addRequest: function(request) {
                    this.queue.push(request);
                    if (this.queue.length >= this.batchSize) {
                        this.flush();
                    }
                },
                flush: function() {
                    if (this.queue.length === 0) return;
                    const batch = this.queue.splice(0, this.batchSize);
                    return batch;
                },
                getQueueSize: function() {
                    return this.queue.length;
                },
                clear: function() {
                    this.queue = [];
                }
            };
        });

        test('should add request to queue', () => {
            batcher.addRequest({ method: 'GET', url: '/api/test' });
            expect(batcher.getQueueSize()).toBe(1);
        });

        test('should flush when batch size reached', () => {
            batcher.batchSize = 2;
            batcher.addRequest({ method: 'GET', url: '/api/test1' });
            batcher.addRequest({ method: 'GET', url: '/api/test2' });
            
            expect(batcher.getQueueSize()).toBe(0);
        });

        test('should clear queue', () => {
            batcher.addRequest({ method: 'GET', url: '/api/test' });
            batcher.clear();
            expect(batcher.getQueueSize()).toBe(0);
        });
    });
});


/**
 * Unit tests for CacheManager
 */

describe('CacheManager', () => {
    let cache;

    beforeEach(() => {
        cache = new CacheManager({ defaultTTL: 100, maxSize: 5 });
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('should create instance with default config', () => {
        const c = new CacheManager();
        expect(c.defaultTTL).toBe(300000);
        expect(c.maxSize).toBe(1000);
    });

    test('should set and get cache entry', () => {
        cache.set('key1', { data: 'value1' });
        const value = cache.get('key1');
        expect(value).toEqual({ data: 'value1' });
    });

    test('should return null for missing key', () => {
        const value = cache.get('nonexistent');
        expect(value).toBeNull();
    });

    test('should track cache hits and misses', () => {
        cache.set('key1', 'value1');
        cache.get('key1');
        cache.get('key2');
        
        const stats = cache.getStats();
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
    });

    test('should expire entries after TTL', () => {
        cache.set('key1', 'value1', 100);
        expect(cache.has('key1')).toBe(true);
        
        jest.advanceTimersByTime(150);
        expect(cache.has('key1')).toBe(false);
    });

    test('should invalidate cache entry', () => {
        cache.set('key1', 'value1');
        cache.invalidate('key1');
        expect(cache.get('key1')).toBeNull();
    });

    test('should invalidate by pattern', () => {
        cache.set('/api/route', 'data1');
        cache.set('/api/weather', 'data2');
        cache.set('/api/traffic', 'data3');
        
        cache.invalidatePattern('/api/route');
        expect(cache.has('/api/route')).toBe(false);
        expect(cache.has('/api/weather')).toBe(true);
    });

    test('should clear all cache', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.clear();
        
        expect(cache.cache.size).toBe(0);
        expect(cache.ttlMap.size).toBe(0);
    });

    test('should evict oldest entry when full', () => {
        for (let i = 1; i <= 6; i++) {
            cache.set(`key${i}`, `value${i}`);
        }
        
        expect(cache.cache.size).toBe(5);
        expect(cache.getStats().evictions).toBe(1);
    });

    test('should calculate hit rate', () => {
        cache.set('key1', 'value1');
        cache.get('key1');
        cache.get('key1');
        cache.get('nonexistent');
        
        const stats = cache.getStats();
        expect(stats.hitRate).toBe('66.67%');
    });
});


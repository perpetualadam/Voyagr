/**
 * @file CacheManager unit tests (REAL module: modules/api/cache.js)
 *
 * Behaviour-first: imports the real CacheManager and asserts TTL expiry, LRU
 * eviction, pattern invalidation and hit-rate maths against fake timers.
 */

import { CacheManager } from '../modules/api/cache.js';

describe('CacheManager (real module)', () => {
    afterEach(() => jest.useRealTimers());

    test('default config', () => {
        const c = new CacheManager();
        expect(c.defaultTTL).toBe(300000);
        expect(c.maxSize).toBe(1000);
    });

    test('set/get returns the stored value', () => {
        const c = new CacheManager();
        c.set('k', { a: 1 });
        expect(c.get('k')).toEqual({ a: 1 });
    });

    test('missing key returns undefined and counts a miss', () => {
        const c = new CacheManager();
        expect(c.get('nope')).toBeUndefined();
        expect(c.getStats().misses).toBe(1);
    });

    test('hit/miss counters and hitRate', () => {
        const c = new CacheManager();
        c.set('k', 1);
        c.get('k');      // hit
        c.get('absent'); // miss
        const s = c.getStats();
        expect(s.hits).toBe(1);
        expect(s.misses).toBe(1);
        expect(parseFloat(s.hitRate)).toBeCloseTo(50, 1);
    });

    test('entries expire after their TTL', () => {
        jest.useFakeTimers();
        const c = new CacheManager();
        c.set('k', 'v', 1000);
        expect(c.get('k')).toBe('v');
        jest.advanceTimersByTime(1001);
        expect(c.get('k')).toBeUndefined();
        expect(c.getStats().expirations).toBe(1);
    });

    test('delete removes an entry', () => {
        const c = new CacheManager();
        c.set('k', 'v');
        c.delete('k');
        expect(c.has('k')).toBe(false);
    });

    test('invalidatePattern removes matching keys only', () => {
        const c = new CacheManager();
        c.set('GET:/api/route/1', 'a');
        c.set('GET:/api/route/2', 'b');
        c.set('GET:/api/weather', 'c');
        c.invalidatePattern('/api/route');
        expect(c.has('GET:/api/route/1')).toBe(false);
        expect(c.has('GET:/api/route/2')).toBe(false);
        expect(c.has('GET:/api/weather')).toBe(true);
    });

    test('evicts the oldest entry when full', () => {
        const c = new CacheManager({ maxSize: 2 });
        c.set('a', 1);
        c.set('b', 2);
        c.set('c', 3); // evicts 'a' (oldest)
        expect(c.has('a')).toBe(false);
        expect(c.has('b')).toBe(true);
        expect(c.has('c')).toBe(true);
        expect(c.getStats().evictions).toBe(1);
    });

    test('clear empties the cache', () => {
        const c = new CacheManager();
        c.set('a', 1);
        c.clear();
        expect(c.has('a')).toBe(false);
        expect(c.getStats().size).toBe(0);
    });
});

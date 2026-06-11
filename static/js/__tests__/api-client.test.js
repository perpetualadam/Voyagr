/**
 * @file APIClient unit tests (REAL module: modules/api/client.js)
 *
 * Behaviour-first: imports the real APIClient (which wires the real deduplicator,
 * cache, batcher and optimizer) and asserts caching/stat behaviour against a mocked
 * global.fetch. URLs use an unmapped endpoint so the optimizer passes data through.
 */

import { APIClient } from '../modules/api/client.js';

/** Build a fetch mock whose response works through the deduplicator's clone() step. */
function mockFetchJson(data) {
    const res = { ok: true, json: async () => data, clone: () => res };
    return jest.fn().mockResolvedValue(res);
}

describe('APIClient (real module)', () => {
    afterEach(() => {
        delete global.fetch;
    });

    test('constructs with all optimizations enabled by default', () => {
        const c = new APIClient();
        expect(c.config.enableDedup).toBe(true);
        expect(c.config.enableCache).toBe(true);
        expect(c.config.enableBatch).toBe(true);
    });

    test('buildUrl with and without params', () => {
        const c = new APIClient();
        expect(c.buildUrl('/api/test')).toBe('/api/test');
        expect(c.buildUrl('/api/test', { a: 1, b: 'x' })).toBe('/api/test?a=1&b=x');
    });

    test('getEndpointTTL: known endpoint vs default', () => {
        const c = new APIClient();
        expect(c.getEndpointTTL('/api/route')).toBe(3600000);
        expect(c.getEndpointTTL('/api/unknown')).toBe(300000);
    });

    test('GET caches: second identical call serves from cache (one fetch)', async () => {
        global.fetch = mockFetchJson({ value: 42 });
        const c = new APIClient();

        const a = await c.get('/api/test');
        const b = await c.get('/api/test');

        expect(a).toEqual({ value: 42 });
        expect(b).toEqual({ value: 42 });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(c.getStats().api.cached).toBe(1);
    });

    test('invalidateCache drops the entry so a later call refetches (dedup off to isolate cache)', async () => {
        global.fetch = mockFetchJson({ value: 1 });
        const c = new APIClient({ enableDedup: false });

        await c.get('/api/test');
        expect(c.cache.has('GET:/api/test')).toBe(true);
        c.invalidateCache('/api/test');
        expect(c.cache.has('GET:/api/test')).toBe(false);
        await c.get('/api/test');

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('POST is not cached by default (TTL 0)', async () => {
        global.fetch = mockFetchJson({ ok: true });
        const c = new APIClient({ enableDedup: false });

        await c.post('/api/test', { a: 1 });
        await c.post('/api/test', { a: 1 });

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('within the dedup window, repeat GETs collapse to a single fetch even after cache invalidation', async () => {
        // Documents the real interaction: invalidating the cache does NOT bypass the
        // still-pending deduplicated request inside the dedup window.
        global.fetch = mockFetchJson({ value: 1 });
        const c = new APIClient(); // dedup ON

        await c.get('/api/test');
        c.invalidateCache('/api/test');
        await c.get('/api/test');

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('getStats exposes nested component stats', () => {
        const c = new APIClient();
        const s = c.getStats();
        expect(s).toHaveProperty('api');
        expect(s).toHaveProperty('deduplicator');
        expect(s).toHaveProperty('cache');
        expect(s).toHaveProperty('batcher');
    });

    test('resetStats and clear restore a clean slate', async () => {
        global.fetch = mockFetchJson({ v: 1 });
        const c = new APIClient();
        await c.get('/api/test');
        c.resetStats();
        c.clear();
        expect(c.getStats().api.requests).toBe(0);
        // cache cleared -> next get refetches
        await c.get('/api/test');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('surfaces fetch errors', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('boom'));
        const c = new APIClient();
        await expect(c.get('/api/test')).rejects.toThrow('boom');
    });
});

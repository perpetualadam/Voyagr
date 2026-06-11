/**
 * @file Integration tests for the optimization system (REAL modules)
 *
 * Exercises the real APIClient end-to-end (deduplicator + cache + optimizer) plus the
 * real CacheManager / RequestDeduplicator / BatchRequestManager working together,
 * against a mocked global.fetch.
 */

import { APIClient } from '../modules/api/client.js';
import { CacheManager } from '../modules/api/cache.js';
import { RequestDeduplicator } from '../modules/api/deduplicator.js';
import { BatchRequestManager } from '../modules/api/batcher.js';

function mockFetchJson(data) {
    const res = { ok: true, json: async () => data, clone: () => res };
    return jest.fn().mockResolvedValue(res);
}

describe('Integration: APIClient', () => {
    afterEach(() => {
        delete global.fetch;
        jest.useRealTimers();
    });

    test('caches GET results across calls', async () => {
        global.fetch = mockFetchJson({ data: 'ok' });
        const client = new APIClient();

        const first = await client.get('/api/test', { id: 1 });
        const second = await client.get('/api/test', { id: 1 });

        expect(first).toEqual({ data: 'ok' });
        expect(second).toEqual(first);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('different query params are cached separately', async () => {
        global.fetch = mockFetchJson({ data: 'ok' });
        const client = new APIClient();

        await client.get('/api/test', { id: 1 });
        await client.get('/api/test', { id: 2 });

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('clear() drops caches so the next call refetches', async () => {
        global.fetch = mockFetchJson({ data: 'ok' });
        const client = new APIClient();

        await client.get('/api/test');
        client.clear();
        await client.get('/api/test');

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('comprehensive statistics are reported and resettable', async () => {
        global.fetch = mockFetchJson({ data: 'ok' });
        const client = new APIClient();
        await client.get('/api/test');

        const stats = client.getStats();
        expect(stats.api.requests).toBeGreaterThanOrEqual(1);

        client.resetStats();
        expect(client.getStats().api.requests).toBe(0);
    });
});

describe('Integration: deduplication + caching', () => {
    afterEach(() => {
        delete global.fetch;
    });

    test('dedup collapses concurrent calls, cache serves later ones', async () => {
        global.fetch = mockFetchJson({ ok: 1 });
        const dedup = new RequestDeduplicator();
        const cache = new CacheManager();

        // Two concurrent -> one network call
        await Promise.all([dedup.fetch('/api/x'), dedup.fetch('/api/x')]);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(dedup.getStats().deduplicated).toBe(1);

        // Cache a derived value and read it back
        cache.set('GET:/api/x', { ok: 1 });
        expect(cache.get('GET:/api/x')).toEqual({ ok: 1 });
    });
});

describe('Integration: batch manager', () => {
    afterEach(() => {
        delete global.fetch;
    });

    test('auto-flushes a full batch and resolves each request', async () => {
        global.fetch = jest.fn().mockImplementation((url, init) => {
            const reqs = JSON.parse(init.body).requests;
            return Promise.resolve({
                json: async () => ({
                    responses: reqs.map(r => ({ id: r.id, success: true, data: r.endpoint })),
                }),
            });
        });
        const batcher = new BatchRequestManager({ maxBatchSize: 2 });

        const r1 = batcher.add('/api/a');
        const r2 = batcher.add('/api/b');

        await expect(r1).resolves.toBe('/api/a');
        await expect(r2).resolves.toBe('/api/b');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

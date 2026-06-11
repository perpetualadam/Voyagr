/**
 * @file API barrel + factory Unit Tests (REAL module: modules/api/index.js)
 *
 * Verifies the public API surface (re-exports) and the createAPIClient factory
 * actually constructs a configured APIClient wired to the real sub-components.
 * The individual classes are exercised in depth in their dedicated test files.
 */

import {
    RequestDeduplicator,
    CacheManager,
    BatchRequestManager,
    APIClient,
    createAPIClient,
} from '../../modules/api/index.js';

function mockFetchJson(data) {
    const res = { ok: true, json: async () => data, clone: () => res };
    return jest.fn().mockResolvedValue(res);
}

describe('api barrel (real module)', () => {
    test('re-exports the real classes', () => {
        expect(typeof RequestDeduplicator).toBe('function');
        expect(typeof CacheManager).toBe('function');
        expect(typeof BatchRequestManager).toBe('function');
        expect(typeof APIClient).toBe('function');
        expect(typeof createAPIClient).toBe('function');
    });
});

describe('createAPIClient (real factory)', () => {
    afterEach(() => { delete global.fetch; });

    test('returns an APIClient with optimizations enabled by default', () => {
        const client = createAPIClient();
        expect(client).toBeInstanceOf(APIClient);
        expect(client.config.enableDedup).toBe(true);
        expect(client.config.enableCache).toBe(true);
        expect(client.config.enableBatch).toBe(true);
        expect(client.deduplicator).toBeInstanceOf(RequestDeduplicator);
        expect(client.cache).toBeInstanceOf(CacheManager);
        expect(client.batcher).toBeInstanceOf(BatchRequestManager);
    });

    test('applies the documented default cache/batch config', () => {
        const client = createAPIClient();
        expect(client.cache.defaultTTL).toBe(300000);
        expect(client.cache.maxSize).toBe(1000);
        expect(client.batcher.maxBatchSize).toBe(10);
    });

    test('caller options override defaults', () => {
        const client = createAPIClient({ enableCache: false });
        expect(client.config.enableCache).toBe(false);
    });

    test('the produced client performs a real cached GET', async () => {
        global.fetch = mockFetchJson({ value: 7 });
        const client = createAPIClient();
        const a = await client.get('/api/test');
        const b = await client.get('/api/test');
        expect(a).toEqual({ value: 7 });
        expect(b).toEqual({ value: 7 });
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

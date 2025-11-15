/**
 * Unit tests for APIClient
 */

describe('APIClient', () => {
    let api;

    beforeEach(() => {
        api = new APIClient({
            enableDedup: true,
            enableCache: true,
            enableBatch: true
        });
        
        // Mock fetch
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should create instance with all optimizations enabled', () => {
        expect(api.config.enableDedup).toBe(true);
        expect(api.config.enableCache).toBe(true);
        expect(api.config.enableBatch).toBe(true);
    });

    test('should build URL with query parameters', () => {
        const url = api.buildUrl('/api/route', { start: '51.5,-0.1', end: '51.6,-0.1' });
        expect(url).toContain('/api/route?');
        expect(url).toContain('start=51.5');
    });

    test('should build URL without parameters', () => {
        const url = api.buildUrl('/api/route', {});
        expect(url).toBe('/api/route');
    });

    test('should track request statistics', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true })
        });

        await api.get('/api/route', {});
        expect(api.stats.requests).toBe(1);
    });

    test('should cache GET responses', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: 'test' })
        });

        await api.get('/api/route', {});
        const stats1 = api.stats.cached;

        // Second call should use cache
        const result = await api.get('/api/route', {});
        expect(result).toEqual({ data: 'test' });
        expect(api.stats.cached).toBe(stats1 + 1);
    });

    test('should invalidate cache by pattern', () => {
        api.cache.set('GET:/api/route', { data: 1 });
        api.cache.set('GET:/api/weather', { data: 2 });
        
        api.invalidateCache('/api/route');
        expect(api.cache.has('GET:/api/route')).toBe(false);
        expect(api.cache.has('GET:/api/weather')).toBe(true);
    });

    test('should get comprehensive statistics', () => {
        const stats = api.getStats();
        expect(stats).toHaveProperty('api');
        expect(stats).toHaveProperty('deduplicator');
        expect(stats).toHaveProperty('cache');
        expect(stats).toHaveProperty('batcher');
    });

    test('should reset all statistics', () => {
        api.stats.requests = 10;
        api.cache.stats.hits = 5;
        
        api.resetStats();
        
        expect(api.stats.requests).toBe(0);
        expect(api.cache.stats.hits).toBe(0);
    });

    test('should handle POST requests', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true })
        });

        const result = await api.post('/api/route', { start: '51.5,-0.1' });
        expect(result.success).toBe(true);
        expect(api.stats.requests).toBe(1);
    });

    test('should handle API errors', async () => {
        global.fetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(api.get('/api/route')).rejects.toThrow('Network error');
    });
});


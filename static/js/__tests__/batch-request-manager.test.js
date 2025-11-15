/**
 * Unit tests for BatchRequestManager
 */

describe('BatchRequestManager', () => {
    let batcher;

    beforeEach(() => {
        batcher = new BatchRequestManager({ batchTimeout: 50, maxBatchSize: 3 });
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('should create instance with default config', () => {
        const b = new BatchRequestManager();
        expect(b.batchTimeout).toBe(100);
        expect(b.maxBatchSize).toBe(10);
        expect(b.batchEndpoint).toBe('/api/batch');
    });

    test('should create instance with custom config', () => {
        expect(batcher.batchTimeout).toBe(50);
        expect(batcher.maxBatchSize).toBe(3);
    });

    test('should add request to queue', () => {
        batcher.add('/api/route', { test: 1 });
        expect(batcher.queue.length).toBe(1);
    });

    test('should track request statistics', () => {
        batcher.add('/api/route', { test: 1 });
        expect(batcher.stats.requests).toBe(1);
    });

    test('should flush when batch is full', () => {
        const flushSpy = jest.spyOn(batcher, 'flush');
        
        batcher.add('/api/route', { test: 1 });
        batcher.add('/api/route', { test: 2 });
        batcher.add('/api/route', { test: 3 });
        
        expect(flushSpy).toHaveBeenCalled();
        flushSpy.mockRestore();
    });

    test('should schedule batch send', () => {
        batcher.add('/api/route', { test: 1 });
        expect(batcher.batchTimer).not.toBeNull();
    });

    test('should clear queue and cancel requests', async () => {
        const promise = batcher.add('/api/route', { test: 1 });
        batcher.clear();
        
        expect(batcher.queue.length).toBe(0);
        expect(batcher.batchTimer).toBeNull();
        
        await expect(promise).rejects.toThrow('Batch manager cleared');
    });

    test('should calculate efficiency', () => {
        batcher.stats.requests = 10;
        batcher.stats.saved = 5;
        
        const stats = batcher.getStats();
        expect(stats.efficiency).toBe('50.00%');
    });

    test('should reset statistics', () => {
        batcher.stats.requests = 10;
        batcher.stats.batches = 5;
        batcher.resetStats();
        
        expect(batcher.stats.requests).toBe(0);
        expect(batcher.stats.batches).toBe(0);
    });

    test('should track queue size', () => {
        batcher.add('/api/route', { test: 1 });
        batcher.add('/api/route', { test: 2 });
        
        const stats = batcher.getStats();
        expect(stats.queueSize).toBe(2);
    });
});


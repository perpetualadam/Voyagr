/**
 * Unit tests for RequestDeduplicator
 */

describe('RequestDeduplicator', () => {
    let dedup;

    beforeEach(() => {
        dedup = new RequestDeduplicator(100); // 100ms window for testing
    });

    test('should create instance with default window', () => {
        const d = new RequestDeduplicator();
        expect(d.deduplicationWindow).toBe(5000);
    });

    test('should create instance with custom window', () => {
        expect(dedup.deduplicationWindow).toBe(100);
    });

    test('should generate unique keys for different URLs', () => {
        const key1 = dedup.generateKey('/api/route');
        const key2 = dedup.generateKey('/api/weather');
        expect(key1).not.toBe(key2);
    });

    test('should generate same key for same URL and options', () => {
        const options = { method: 'POST', body: JSON.stringify({ test: 1 }) };
        const key1 = dedup.generateKey('/api/route', options);
        const key2 = dedup.generateKey('/api/route', options);
        expect(key1).toBe(key2);
    });

    test('should track statistics correctly', () => {
        expect(dedup.getStats().total).toBe(0);
        expect(dedup.getStats().deduplicated).toBe(0);
    });

    test('should clear pending requests', () => {
        dedup.pendingRequests.set('test', Promise.resolve());
        expect(dedup.pendingRequests.size).toBe(1);
        dedup.clear();
        expect(dedup.pendingRequests.size).toBe(0);
    });

    test('should reset statistics', () => {
        dedup.requestStats.total = 10;
        dedup.resetStats();
        expect(dedup.requestStats.total).toBe(0);
    });

    test('should calculate deduplication rate', () => {
        dedup.requestStats.total = 10;
        dedup.requestStats.deduplicated = 5;
        const stats = dedup.getStats();
        expect(stats.deduplicationRate).toBe('50.00%');
    });
});


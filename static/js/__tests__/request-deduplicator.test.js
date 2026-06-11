/**
 * @file RequestDeduplicator unit tests (REAL module: modules/api/deduplicator.js)
 *
 * Behaviour-first: imports the real class and asserts real dedup behaviour against a
 * mocked global.fetch, rather than re-implementing the logic inline.
 */

import { RequestDeduplicator } from '../modules/api/deduplicator.js';

describe('RequestDeduplicator (real module)', () => {
    afterEach(() => {
        delete global.fetch;
        jest.useRealTimers();
    });

    test('default and custom deduplication window', () => {
        expect(new RequestDeduplicator().deduplicationWindow).toBe(5000);
        expect(new RequestDeduplicator(1234).deduplicationWindow).toBe(1234);
    });

    test('generateKey combines method, url and body', () => {
        const d = new RequestDeduplicator();
        expect(d.generateKey('/api/x')).toBe('GET:/api/x:');
        expect(d.generateKey('/api/x', { method: 'POST', body: '{"a":1}' }))
            .toBe('POST:/api/x:{"a":1}');
    });

    test('concurrent identical requests share one underlying fetch', async () => {
        global.fetch = jest.fn().mockResolvedValue({ clone: () => ({ ok: true }) });
        const d = new RequestDeduplicator();

        const p1 = d.fetch('/api/x');
        const p2 = d.fetch('/api/x'); // same key, still pending -> deduplicated

        await Promise.all([p1, p2]);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const stats = d.getStats();
        expect(stats.total).toBe(2);
        expect(stats.deduplicated).toBe(1);
        expect(parseFloat(stats.deduplicationRate)).toBeCloseTo(50, 1);
    });

    test('pending request is cleared after the dedup window', async () => {
        jest.useFakeTimers();
        global.fetch = jest.fn().mockResolvedValue({ clone: () => ({ ok: true }) });
        const d = new RequestDeduplicator(5000);

        await d.fetch('/api/x');
        expect(d.getStats().pendingRequests).toBe(1);

        jest.advanceTimersByTime(5000);
        expect(d.pendingRequests.size).toBe(0);
    });

    test('failed fetch increments the failed counter and rejects', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
        const d = new RequestDeduplicator();

        await expect(d.fetch('/api/x')).rejects.toThrow('network down');
        expect(d.getStats().failed).toBe(1);
    });

    test('clear empties pending requests', async () => {
        global.fetch = jest.fn().mockResolvedValue({ clone: () => ({ ok: true }) });
        const d = new RequestDeduplicator();
        d.fetch('/api/x');
        d.clear();
        expect(d.pendingRequests.size).toBe(0);
        expect(d.getStats().pendingRequests).toBe(0);
    });

    test('resetStats zeroes counters but keeps pending count', async () => {
        global.fetch = jest.fn().mockResolvedValue({ clone: () => ({ ok: true }) });
        const d = new RequestDeduplicator();
        d.fetch('/api/x'); // 1 pending
        d.resetStats();
        const s = d.getStats();
        expect(s.total).toBe(0);
        expect(s.deduplicated).toBe(0);
        expect(s.pendingRequests).toBe(1);
    });
});

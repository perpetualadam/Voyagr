/**
 * @file BatchRequestManager unit tests (REAL module: modules/api/batcher.js)
 *
 * Behaviour-first: imports the real BatchRequestManager and asserts queueing,
 * size-triggered flush, batch POST shape and request resolution against a mocked
 * global.fetch.
 */

import { BatchRequestManager } from '../modules/api/batcher.js';

describe('BatchRequestManager (real module)', () => {
    afterEach(() => {
        delete global.fetch;
        jest.useRealTimers();
    });

    test('default and custom config', () => {
        const b = new BatchRequestManager();
        expect(b.batchTimeout).toBe(100);
        expect(b.maxBatchSize).toBe(10);
        expect(b.batchEndpoint).toBe('/api/batch');

        const c = new BatchRequestManager({ batchTimeout: 50, maxBatchSize: 3, batchEndpoint: '/x' });
        expect(c.maxBatchSize).toBe(3);
        expect(c.batchEndpoint).toBe('/x');
    });

    test('add enqueues and tracks queue size before flush', () => {
        jest.useFakeTimers();
        const b = new BatchRequestManager();
        b.add('/api/a', { x: 1 });
        b.add('/api/b', { y: 2 });
        expect(b.getStats().requests).toBe(2);
        expect(b.getStats().queueSize).toBe(2);
    });

    test('flushes automatically when batch is full, sending one POST', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            json: async () => ({ responses: [] }),
        });
        const b = new BatchRequestManager({ maxBatchSize: 2 });

        b.add('/api/a', { x: 1 });
        b.add('/api/b', { y: 2 }); // hits maxBatchSize -> flush()
        await Promise.resolve();
        await Promise.resolve();

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/batch');
        const body = JSON.parse(init.body);
        expect(body.requests).toHaveLength(2);
        expect(body.requests[0]).toHaveProperty('endpoint', '/api/a');
        expect(b.getStats().batches).toBe(1);
        expect(b.getStats().saved).toBe(1); // N-1
    });

    test('resolves each queued request with its matched response', async () => {
        let captured;
        global.fetch = jest.fn().mockImplementation((url, init) => {
            const reqs = JSON.parse(init.body).requests;
            captured = reqs;
            return Promise.resolve({
                json: async () => ({
                    responses: reqs.map((r, i) => ({ id: r.id, success: true, data: { i } })),
                }),
            });
        });
        const b = new BatchRequestManager({ maxBatchSize: 2 });

        const r1 = b.add('/api/a');
        const r2 = b.add('/api/b');

        await expect(r1).resolves.toEqual({ i: 0 });
        await expect(r2).resolves.toEqual({ i: 1 });
        expect(captured).toHaveLength(2);
    });

    test('clear cancels the timer and empties the queue', () => {
        jest.useFakeTimers();
        const b = new BatchRequestManager();
        b.add('/api/a');
        b.clear();
        expect(b.queue).toHaveLength(0);
        expect(b.getStats().queueSize).toBe(0);
    });

    test('updateEfficiency reflects saved/requests', async () => {
        global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ responses: [] }) });
        const b = new BatchRequestManager({ maxBatchSize: 2 });
        b.add('/api/a');
        b.add('/api/b');
        await Promise.resolve();
        await Promise.resolve();
        expect(parseFloat(b.getStats().efficiency)).toBeGreaterThanOrEqual(0);
    });
});

/**
 * @file Service Modules Unit Tests (REAL modules)
 *
 * Imports the real LocationService, NotificationsService and AnalyticsService and
 * asserts their actual behaviour (geocode caching, notification lifecycle, event
 * batching) against mocked fetch / timers.
 */

import { LocationService } from '../../modules/services/location.js';
import { NotificationsService } from '../../modules/services/notifications.js';
import { AnalyticsService } from '../../modules/services/analytics.js';

function mockFetchJson(data, ok = true, status = 200) {
    return jest.fn().mockResolvedValue({ ok, status, json: async () => data });
}

describe('LocationService (real module)', () => {
    afterEach(() => { delete global.fetch; });

    test('geocodeAddress POSTs and returns parsed data', async () => {
        global.fetch = mockFetchJson({ lat: 51.5, lon: -0.1 });
        const s = new LocationService();
        const res = await s.geocodeAddress('London');
        expect(res).toEqual({ lat: 51.5, lon: -0.1 });
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/geocode');
        expect(JSON.parse(init.body)).toEqual({ address: 'London' });
    });

    test('geocodeAddress caches results (second call hits no network)', async () => {
        global.fetch = mockFetchJson({ lat: 1, lon: 2 });
        const s = new LocationService();
        await s.geocodeAddress('X');
        await s.geocodeAddress('X');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(s.getCacheStats().size).toBe(1);
    });

    test('reverseGeocode caches per lat/lon', async () => {
        global.fetch = mockFetchJson({ name: 'Somewhere' });
        const s = new LocationService();
        await s.reverseGeocode(51.5, -0.1);
        await s.reverseGeocode(51.5, -0.1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('throws on non-ok response', async () => {
        global.fetch = mockFetchJson({}, false, 500);
        const s = new LocationService();
        await expect(s.geocodeAddress('X')).rejects.toThrow('HTTP 500');
    });

    test('clearCache empties the cache', async () => {
        global.fetch = mockFetchJson({ lat: 1, lon: 2 });
        const s = new LocationService();
        await s.geocodeAddress('X');
        s.clearCache();
        expect(s.getCacheStats().size).toBe(0);
    });
});

describe('NotificationsService (real module)', () => {
    afterEach(() => jest.useRealTimers());

    test('show returns an id and stores the notification', () => {
        const n = new NotificationsService();
        const id = n.show('Hi', 'info', { duration: 0 });
        expect(typeof id).toBe('string');
        expect(n.getAll()).toHaveLength(1);
        expect(n.getAll()[0]).toMatchObject({ message: 'Hi', type: 'info' });
    });

    test('typed helpers set the type', () => {
        const n = new NotificationsService();
        n.error('boom', { duration: 0 });
        expect(n.getAll()[0].type).toBe('error');
    });

    test('disabled service returns null and stores nothing', () => {
        const n = new NotificationsService({ enabled: false });
        expect(n.show('x')).toBeNull();
        expect(n.getAll()).toHaveLength(0);
    });

    test('caps stored notifications at maxNotifications', () => {
        const n = new NotificationsService({ maxNotifications: 2 });
        n.show('a', 'info', { duration: 0 });
        n.show('b', 'info', { duration: 0 });
        n.show('c', 'info', { duration: 0 });
        expect(n.getAll()).toHaveLength(2);
        expect(n.getAll().map(x => x.message)).toEqual(['b', 'c']);
    });

    test('auto-dismiss removes after duration', () => {
        jest.useFakeTimers();
        const n = new NotificationsService();
        const id = n.show('temp', 'info', { duration: 1000 });
        expect(n.getAll()).toHaveLength(1);
        jest.advanceTimersByTime(1000);
        expect(n.getAll().find(x => x.id === id)).toBeUndefined();
    });

    test('dismissAll clears everything', () => {
        const n = new NotificationsService();
        n.show('a', 'info', { duration: 0 });
        n.dismissAll();
        expect(n.getAll()).toHaveLength(0);
    });
});

describe('AnalyticsService (real module)', () => {
    afterEach(() => {
        delete global.fetch;
        jest.useRealTimers();
    });

    test('trackEvent queues events when disabled does nothing', () => {
        const a = new AnalyticsService({ enabled: false });
        a.trackEvent('x');
        expect(a.getPendingEvents()).toHaveLength(0);
    });

    test('trackEvent enriches with session id and queues', () => {
        jest.useFakeTimers();
        const a = new AnalyticsService();
        a.trackEvent('click', { btn: 'go' });
        const ev = a.getPendingEvents()[0];
        expect(ev).toMatchObject({ name: 'click', data: { btn: 'go' } });
        expect(ev.sessionId).toBe(a.sessionId);
    });

    test('flushes a full batch over fetch', async () => {
        global.fetch = mockFetchJson({ ok: true });
        const a = new AnalyticsService({ batchSize: 2 });
        a.trackEvent('a');
        a.trackEvent('b'); // hits batchSize -> sendBatch
        await Promise.resolve();
        await Promise.resolve();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.events).toHaveLength(2);
    });

    test('re-queues events when the network fails', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
        const a = new AnalyticsService({ batchSize: 1 });
        a.trackEvent('a');
        await Promise.resolve();
        await Promise.resolve();
        expect(a.getPendingEvents().length).toBeGreaterThanOrEqual(1);
    });

    test('convenience trackers map to event names', () => {
        jest.useFakeTimers();
        const a = new AnalyticsService();
        a.trackPageView('home');
        a.trackAction('save');
        a.trackError('bad');
        const names = a.getPendingEvents().map(e => e.name);
        expect(names).toEqual(['pageView', 'userAction', 'error']);
    });
});

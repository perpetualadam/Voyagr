/**
 * @file Core Modules Unit Tests
 * @module __tests__/modules/core.test.js
 *
 * Behaviour-first: these import the REAL modules (core/utils.js, core/constants.js)
 * and assert their actual contract. The previous version re-declared local copies of
 * the functions/constants and tested those — which not only proved nothing, it baked
 * in WRONG assumptions (e.g. formatDuration treated its arg as minutes when the real
 * one takes seconds, and ROUTING_MODES/VEHICLE_TYPES were asserted as arrays when they
 * are objects).
 */

import {
    calculateDistance,
    formatDistance,
    formatDuration,
    formatCurrency,
    debounce,
    throttle,
    deepClone,
    mergeObjects,
    isMobile,
    isOnline,
    getOrientation,
    sleep,
} from '../../modules/core/utils.js';

import {
    API_CONFIG,
    CACHE_CONFIG,
    ROUTING_MODES,
    VEHICLE_TYPES,
} from '../../modules/core/constants.js';

describe('core/constants (real module)', () => {
    test('API_CONFIG endpoints', () => {
        expect(API_CONFIG.ROUTE_ENDPOINT).toBe('/api/route');
        expect(API_CONFIG.BATCH_ENDPOINT).toBe('/api/batch');
    });

    test('CACHE_CONFIG has numeric TTLs', () => {
        expect(CACHE_CONFIG.DEFAULT_TTL).toBe(300000);
        expect(typeof CACHE_CONFIG.MAX_SIZE).toBe('number');
    });

    test('ROUTING_MODES is an object keyed by mode (not an array)', () => {
        expect(Array.isArray(ROUTING_MODES)).toBe(false);
        expect(ROUTING_MODES.AUTO).toBe('auto');
        expect(ROUTING_MODES.PEDESTRIAN).toBe('pedestrian');
        expect(ROUTING_MODES.BICYCLE).toBe('bicycle');
    });

    test('VEHICLE_TYPES is an object (no legacy "petrol_diesel" key)', () => {
        expect(VEHICLE_TYPES.CAR).toBe('car');
        expect(Object.values(VEHICLE_TYPES)).not.toContain('petrol_diesel');
    });
});

describe('core/utils calculateDistance (Haversine)', () => {
    test('London -> Manchester is ~262 km', () => {
        const d = calculateDistance(51.5074, -0.1278, 53.4808, -2.2426);
        expect(d).toBeGreaterThan(250);
        expect(d).toBeLessThan(270);
    });

    test('identical points -> 0 km', () => {
        expect(calculateDistance(51.5, -0.1, 51.5, -0.1)).toBeCloseTo(0, 6);
    });
});

describe('core/utils formatDistance (metric defaults, sub-km in metres)', () => {
    test('>= 1 km shows km to 1 dp', () => {
        expect(formatDistance(1.5)).toBe('1.5 km');
    });

    test('< 1 km shows rounded metres (not "0.5 km")', () => {
        expect(formatDistance(0.5)).toBe('500 m');
    });

    test('imperial branch', () => {
        expect(formatDistance(1, 'imperial')).toBe('0.6 mi');
        expect(formatDistance(0.01, 'imperial')).toBe('33 ft');
    });
});

describe('core/utils formatDuration (input is SECONDS)', () => {
    test('60 seconds -> "1m" (not "1h 0m")', () => {
        expect(formatDuration(60)).toBe('1m');
    });

    test('30 seconds rounds down to "0m"', () => {
        expect(formatDuration(30)).toBe('0m');
    });

    test('3600 seconds -> "1h 0m"', () => {
        expect(formatDuration(3600)).toBe('1h 0m');
    });

    test('5400 seconds -> "1h 30m"', () => {
        expect(formatDuration(5400)).toBe('1h 30m');
    });
});

describe('core/utils formatCurrency (Intl en-GB)', () => {
    test('GBP', () => {
        expect(formatCurrency(10.5, 'GBP')).toBe('£10.50');
    });

    test('USD still renders the amount', () => {
        expect(formatCurrency(20, 'USD')).toMatch(/\$20\.00$/);
    });
});

describe('core/utils misc helpers', () => {
    test('deepClone produces a structurally-equal but independent copy', () => {
        const original = { a: 1, b: { c: 2 } };
        const cloned = deepClone(original);
        expect(cloned).toEqual(original);
        expect(cloned).not.toBe(original);
        expect(cloned.b).not.toBe(original.b);
    });

    test('mergeObjects: source overrides target', () => {
        expect(mergeObjects({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('isMobile / isOnline return booleans', () => {
        expect(typeof isMobile()).toBe('boolean');
        expect(typeof isOnline()).toBe('boolean');
    });

    test('getOrientation returns portrait or landscape', () => {
        expect(['portrait', 'landscape']).toContain(getOrientation());
    });
});

describe('core/utils debounce', () => {
    test('collapses rapid calls into one trailing call', (done) => {
        let calls = 0;
        const fn = debounce(() => { calls++; }, 100);
        fn(); fn(); fn();
        expect(calls).toBe(0);
        setTimeout(() => {
            expect(calls).toBe(1);
            done();
        }, 150);
    });
});

describe('core/utils throttle', () => {
    test('runs immediately, then again only after the window', (done) => {
        let calls = 0;
        const fn = throttle(() => { calls++; }, 100);
        fn(); fn(); fn();
        expect(calls).toBe(1);
        setTimeout(() => {
            fn();
            expect(calls).toBe(2);
            done();
        }, 150);
    });
});

describe('core/utils sleep', () => {
    test('resolves after roughly the requested delay', async () => {
        const start = Date.now();
        await sleep(100);
        expect(Date.now() - start).toBeGreaterThanOrEqual(90);
    });
});

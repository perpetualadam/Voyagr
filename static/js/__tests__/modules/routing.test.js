/**
 * @file Routing Modules Unit Tests
 * @module __tests__/modules/routing.test.js
 *
 * Behaviour-first: imports the REAL RoutingEngine and RouteCalculator and asserts
 * their actual behaviour (cache hits, stats, sorting, cost maths). Network calls are
 * exercised against a mocked global.fetch so the cache/stat logic is genuinely tested
 * rather than re-implemented inline.
 */

import { RoutingEngine } from '../../modules/routing/engine.js';
import { RouteCalculator } from '../../modules/routing/calculator.js';

describe('RoutingEngine (real module)', () => {
    let engine;

    beforeEach(() => {
        engine = new RoutingEngine({ cacheTTL: 600000 });
    });

    afterEach(() => {
        delete global.fetch;
    });

    test('generateCacheKey joins params with pipes', () => {
        expect(engine.generateCacheKey('51.5,-0.1', '53.4,-2.2', 'auto', 'petrol'))
            .toBe('51.5,-0.1|53.4,-2.2|auto|petrol');
    });

    test('calculateRoute fetches once, then serves from cache and bumps "cached"', async () => {
        const payload = { routes: [{ id: 0 }] };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => payload,
        });

        const first = await engine.calculateRoute('A', 'B', { mode: 'auto' });
        const second = await engine.calculateRoute('A', 'B', { mode: 'auto' });

        expect(first).toEqual(payload);
        expect(second).toEqual(payload);
        expect(global.fetch).toHaveBeenCalledTimes(1); // 2nd call hit the cache
        expect(engine.getStats()).toEqual({ requests: 1, cached: 1, errors: 0 });
    });

    test('calculateRoute records an error and rethrows on non-OK response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(engine.calculateRoute('A', 'B')).rejects.toThrow('HTTP 500');
        expect(engine.getStats().errors).toBe(1);
    });

    test('clearCache forces a refetch', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });

        await engine.calculateRoute('A', 'B');
        engine.clearCache();
        await engine.calculateRoute('A', 'B');

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('resetStats zeroes counters and getStats returns a copy', () => {
        engine.stats.requests = 5;
        const snap = engine.getStats();
        engine.resetStats();
        expect(snap.requests).toBe(5); // copy, unaffected by reset
        expect(engine.getStats()).toEqual({ requests: 0, cached: 0, errors: 0 });
    });
});

describe('RouteCalculator (real module)', () => {
    const routes = [
        { id: 'a', duration_minutes: 30, distance_km: 40, fuel_cost: 6, toll_cost: 2, caz_cost: 0 },
        { id: 'b', duration_minutes: 25, distance_km: 50, fuel_cost: 9, toll_cost: 0, caz_cost: 0 },
        { id: 'c', duration_minutes: 35, distance_km: 35, fuel_cost: 4, toll_cost: 0, caz_cost: 5 },
    ];

    let calc;
    beforeEach(() => {
        calc = new RouteCalculator();
        calc.addRoutes(routes);
    });

    test('sortRoutes("fastest") orders by duration', () => {
        expect(calc.sortRoutes('fastest').map(r => r.id)).toEqual(['b', 'a', 'c']);
    });

    test('sortRoutes("shortest") orders by distance', () => {
        expect(calc.sortRoutes('shortest').map(r => r.id)).toEqual(['c', 'a', 'b']);
    });

    test('sortRoutes("cheapest") orders by total cost (fuel+toll+caz)', () => {
        // a=8, b=9, c=9 -> a first; b/c tie keeps stable order
        expect(calc.sortRoutes('cheapest')[0].id).toBe('a');
    });

    test('sortRoutes("eco") orders by fuel cost only', () => {
        expect(calc.sortRoutes('eco').map(r => r.id)).toEqual(['c', 'a', 'b']);
    });

    test('sortRoutes does not mutate the stored order', () => {
        calc.sortRoutes('fastest');
        expect(calc.getRoutes().map(r => r.id)).toEqual(['a', 'b', 'c']);
    });

    test('calculateTotalCost sums the three cost components', () => {
        expect(calc.calculateTotalCost(routes[0])).toBe(8);
        expect(calc.calculateTotalCost(routes[2])).toBe(9);
    });

    test('calculateCostPerKm and calculateCostPerMinute', () => {
        expect(calc.calculateCostPerKm(routes[0])).toBeCloseTo(8 / 40, 6);
        expect(calc.calculateCostPerMinute(routes[0])).toBeCloseTo(8 / 30, 6);
    });

    test('selectRoute returns the route in range, null out of range', () => {
        expect(calc.selectRoute(1).id).toBe('b');
        expect(calc.getSelectedRoute().id).toBe('b');
        expect(calc.selectRoute(99)).toBeNull();
    });

    test('clearRoutes empties routes and selection', () => {
        calc.selectRoute(0);
        calc.clearRoutes();
        expect(calc.getRouteCount()).toBe(0);
        expect(calc.getSelectedRoute()).toBeNull();
    });

    test('missing cost/metric fields are treated as 0 (no NaN)', () => {
        const c2 = new RouteCalculator();
        c2.addRoutes([{ id: 'x' }, { id: 'y', duration_minutes: 10 }]);
        expect(c2.calculateTotalCost({ id: 'x' })).toBe(0);
        expect(c2.sortRoutes('fastest').map(r => r.id)).toEqual(['x', 'y']);
    });
});

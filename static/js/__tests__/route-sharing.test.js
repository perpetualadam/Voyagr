/**
 * Tests for modules/navigation/route-sharing.js
 */
const RS = require('../modules/navigation/route-sharing.js');

describe('route-sharing module', () => {
    test('buildShareableRoutePayload includes geometry by default', () => {
        const payload = RS.buildShareableRoutePayload(
            { distance_km: 12, time: '20 min', fuel_cost: 5, toll_cost: 1, caz_cost: 0.5, geometry: 'abc' },
            'A',
            'B'
        );
        expect(payload.start).toBe('A');
        expect(payload.end).toBe('B');
        expect(payload.distance).toBe(12);
        expect(payload.geometry).toBe('abc');
    });

    test('buildShareableRoutePayload omits geometry when includeGeometry is false', () => {
        const payload = RS.buildShareableRoutePayload(
            { geometry: 'abc' },
            'A',
            'B',
            false
        );
        expect(payload.geometry).toBeUndefined();
    });

    test('encodeRoutePayload and buildShareUrl produce shareable URL', () => {
        const encoded = RS.encodeRoutePayload({ start: 'A', end: 'B' });
        const url = RS.buildShareUrl('https://voyagr.test', encoded);
        expect(url).toMatch(/^https:\/\/voyagr\.test\?route=/);
        expect(encoded.length).toBeGreaterThan(0);
    });

    test('buildRouteShareSummaryValues sums costs and formats labels', () => {
        const summary = RS.buildRouteShareSummaryValues(
            { time: '25 min', fuel_cost: 10, toll_cost: 2, caz_cost: 1 },
            {
                startLabel: 'Home',
                endLabel: 'Work',
                distanceText: '15.2',
                distUnit: 'mi',
                currencySymbol: '£',
            }
        );
        expect(summary.startLabel).toBe('Home');
        expect(summary.durationText).toBe('25 min');
        expect(summary.totalCostText).toBe('£13.00');
        expect(summary.totalCost).toBe(13);
    });

    test('buildShareWhatsAppMessage and email helpers format social share text', () => {
        const route = { time: '20 min', fuel_cost: 5, toll_cost: 1, caz_cost: 0.5, distance_km: 10 };
        const fmt = {
            startLabel: 'A',
            endLabel: 'B',
            distanceText: '6.2',
            distUnit: 'mi',
            currencySymbol: '£',
        };
        expect(RS.buildShareWhatsAppMessage(route, fmt)).toContain('Route from A to B');
        expect(RS.buildShareEmailSubject('A', 'B')).toBe('Route: A to B');
        expect(RS.buildShareEmailBody(route, fmt)).toContain('Estimated Cost: £6.50');
    });
});

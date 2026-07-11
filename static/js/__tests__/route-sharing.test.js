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

    test('decodeRoutePayload round-trips encoded payloads', () => {
        const payload = { start: 'A', end: 'B', distance: 10, time: '20 min' };
        const encoded = RS.encodeRoutePayload(payload);
        expect(RS.decodeRoutePayload(encoded)).toEqual(payload);
        expect(RS.decodeRoutePayload('not-valid')).toBeNull();
    });

    test('extractRouteParamFromSearch and stripRouteParamFromUrl handle share links', () => {
        const encoded = RS.encodeRoutePayload({ start: 'A', end: 'B' });
        const search = '?route=' + encoded + '&foo=1';
        expect(RS.extractRouteParamFromSearch(search)).toBe(encoded);
        expect(RS.stripRouteParamFromUrl('https://voyagr.test/path' + search + '#x'))
            .toBe('/path?foo=1#x');
    });

    test('buildLastCalculatedRouteFromSharedPayload maps share fields', () => {
        const route = RS.buildLastCalculatedRouteFromSharedPayload({
            start: 'A',
            end: 'B',
            distance: 12,
            time: '25 min',
            fuel_cost: 5,
            geometry: 'abc',
        });
        expect(route.distance_km).toBe(12);
        expect(route.duration_minutes).toBe(25);
        expect(route.geometry).toBe('abc');
        expect(RS.parseSharedRouteDurationMinutes('18 min')).toBe(18);
    });

    test('buildSavedRoutesListHtml renders rows or empty state', () => {
        expect(RS.buildSavedRoutesListHtml([], {})).toContain('No saved routes yet');
        const html = RS.buildSavedRoutesListHtml(
            [{ id: 1, name: 'Commute', start: 'A', end: 'B', distance_km: 10, duration_minutes: '20 min', fuel_cost: 5, toll_cost: 1, caz_cost: 0 }],
            { currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.21'] }
        );
        expect(html).toContain('Commute');
        expect(html).toContain('useSavedRoute(1)');
        expect(RS.computeSavedRouteTotalCost({ fuel_cost: 5, toll_cost: 1, caz_cost: 0.5 })).toBe(6.5);
    });

    test('buildSaveCurrentRoutePlan validates inputs and builds payload', () => {
        expect(RS.buildSaveCurrentRoutePlan({}).ok).toBe(false);
        const plan = RS.buildSaveCurrentRoutePlan({
            lastCalculatedRoute: { distance_km: 10, time: '20 min', geometry: 'abc' },
            routeName: 'Commute',
            startLabel: 'A',
            endLabel: 'B',
            now: 1000,
        });
        expect(plan.ok).toBe(true);
        expect(plan.savedRoute.name).toBe('Commute');
        expect(RS.buildSaveCurrentRouteExecutePlan(plan).shouldSave).toBe(true);
    });

    test('buildUseSavedRoutePlan includes destination for recalculate', () => {
        const plan = RS.buildUseSavedRoutePlan(1, [{
            id: 1,
            name: 'Commute',
            start: 'A',
            end: 'B',
            distance_km: 10,
            duration_minutes: 20,
            fuel_cost: 5,
            toll_cost: 0,
            caz_cost: 0,
            geometry: 'abc',
        }]);
        expect(plan.ok).toBe(true);
        expect(plan.lastCalculatedRoutePatch.destination).toBe('B');
        expect(plan.lastCalculatedRoutePatch.destinationName).toBe('B');
    });

    test('buildDeleteSavedRouteExecutePlan filters route list', () => {
        const execute = RS.buildDeleteSavedRouteExecutePlan(
            RS.buildDeleteSavedRoutePlan(2),
            [{ id: 1 }, { id: 2 }, { id: 3 }]
        );
        expect(execute.nextRoutes).toHaveLength(2);
        expect(execute.nextRoutes.map((r) => r.id)).toEqual([1, 3]);
    });

    test('buildQrCodeImageUrl encodes share link and style sets dimensions', () => {
        const url = RS.buildQrCodeImageUrl('https://voyagr.test?route=abc', 200);
        expect(url).toContain('api.qrserver.com');
        expect(url).toContain('200x200');
        expect(url).toContain(encodeURIComponent('https://voyagr.test?route=abc'));
        expect(RS.getQrCodeImageStyleCssText()).toBe('width: 200px; height: 200px;');
        expect(RS.getQrCodeImageStyleCssText(128)).toBe('width: 128px; height: 128px;');
    });
});

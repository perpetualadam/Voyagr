/**
 * Tests for modules/navigation/route-selection.js
 */
const RS = require('../modules/navigation/route-selection.js');

describe('route-selection module', () => {
    test('mergeNavigationRouteFromSelected uses selected option fields', () => {
        const out = RS.mergeNavigationRouteFromSelected(
            { geometry: 'old', maneuvers: [], distance_km: 1 },
            [{ geometry: 'new', maneuvers: [{ type: 1 }], distance_km: 5, name: 'Fast' }],
            0
        );
        expect(out.geometry).toBe('new');
        expect(out.maneuvers).toHaveLength(1);
        expect(out.distance_km).toBe(5);
        expect(out.name).toBe('Fast');
    });

    test('mergeLastCalculatedRouteFromSelection preserves destination from prev', () => {
        const out = RS.mergeLastCalculatedRouteFromSelection(
            { destination: '51,0', destinationName: 'Home' },
            { geometry: 'abc', duration_minutes: 20 }
        );
        expect(out.destination).toBe('51,0');
        expect(out.geometry).toBe('abc');
    });

    test('buildRoutePayloadFromPersisted encodes polyline when geometry missing', () => {
        const encode = jest.fn(() => 'encoded');
        const out = RS.buildRoutePayloadFromPersisted({
            polyline: [[51.5, -0.1], [51.6, -0.2]],
            steps: [{ type: 8 }],
        }, encode);
        expect(encode).toHaveBeenCalledWith([[51.5, -0.1], [51.6, -0.2]], 6);
        expect(out.geometry).toBe('encoded');
        expect(out.maneuvers).toHaveLength(1);
    });
});

describe('route comparison and selection helpers', () => {
    test('hazardBadgeColor thresholds', () => {
        expect(RS.hazardBadgeColor(0)).toBe('#4CAF50');
        expect(RS.hazardBadgeColor(2)).toBe('#FF9800');
        expect(RS.hazardBadgeColor(5)).toBe('#F44336');
    });

    test('computeRouteTotalCost sums fuel toll and caz', () => {
        expect(RS.computeRouteTotalCost({ fuel_cost: 10, toll_cost: 2, caz_cost: 1.5 })).toBe(13.5);
    });

    test('buildTripInfoDisplayValues formats cost strings', () => {
        const d = RS.buildTripInfoDisplayValues(
            { distance_km: 12, duration_minutes: 25, fuel_cost: 5, toll_cost: 2, caz_cost: 0 },
            { distanceText: '7.46', distUnit: 'mi', currencySymbol: '£' }
        );
        expect(d.fuelCostText).toBe('£5.00');
        expect(d.durationMinutes).toBe(25);
    });

    test('buildRouteComparisonListHtml includes show-all button and route card', () => {
        const html = RS.buildRouteComparisonListHtml(
            [{ name: 'Fast', distance_km: 10, duration_minutes: 20, hazard_count: 1, fuel_cost: 5, toll_cost: 0 }],
            { selectedIndex: 0, currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.21'] }
        );
        expect(html).toContain('Show All 1 Routes');
        expect(html).toContain('Fast');
        expect(html).toContain('Use This Route');
    });

    test('pickActiveRouteDuringNavigation prefers primary when flagged', () => {
        const routes = [{ name: 'A' }, { name: 'B' }];
        expect(RS.pickActiveRouteDuringNavigation(routes, null, { preferPrimary: true }).name).toBe('A');
    });

    test('pickActiveRouteDuringNavigation matches previous route name', () => {
        const routes = [{ name: 'Balanced' }, { name: 'Fastest' }];
        expect(RS.pickActiveRouteDuringNavigation(routes, null, { previousRouteName: 'Fastest' }).name)
            .toBe('Fastest');
    });

    test('orderWaypointsGreedy visits nearest intermediate points', () => {
        const ordered = RS.orderWaypointsGreedy(0, 0, 10, 10, [
            { lat: 1, lon: 1, type: 'via' },
            { lat: 5, lon: 5, type: 'via' },
        ], []);
        expect(ordered).toHaveLength(4);
        expect(ordered[0].type).toBe('start');
        expect(ordered[3].type).toBe('end');
        expect(ordered[1].lat).toBe(1);
    });
});

describe('route preview helpers', () => {
    test('resolvePreviewRoute picks selected alternative', () => {
        const route = RS.resolvePreviewRoute({
            routes: [{ distance_km: 1 }, { distance_km: 9 }],
        }, 1);
        expect(route.distance_km).toBe(9);
    });

    test('resolvePreviewDistanceKm falls back through payload shapes', () => {
        expect(RS.resolvePreviewDistanceKm({ distance_km: 7 }, {})).toBe(7);
        expect(RS.resolvePreviewDistanceKm({ routes: [{ distance_km: 4 }] }, {})).toBe(4);
        expect(RS.resolvePreviewDistanceKm({ distance: '12.5' }, {})).toBe(12.5);
    });

    test('buildPreviewCostValues sums fuel toll and caz', () => {
        const costs = RS.buildPreviewCostValues(
            { fuel_cost: 5, toll_cost: 2, caz_cost: 1, duration_minutes: 30 },
            {}
        );
        expect(costs.totalCost).toBe(8);
        expect(costs.durationMinutes).toBe(30);
    });

    test('buildCazStatusHtml shows exempt message', () => {
        const caz = RS.buildCazStatusHtml(
            { zones_crossed: ['London'], is_exempt: true, exemption_reason: 'EV' },
            0,
            '£'
        );
        expect(caz.visible).toBe(true);
        expect(caz.html).toContain('CAZ Exempt');
    });

    test('getHazardPreviewPanelState prefers preferences-applied branch', () => {
        const state = RS.getHazardPreviewPanelState({
            preferencesApplied: true,
            camerasNearRoute: 0,
            hazardCount: 3,
            hazardPenaltySeconds: 0,
        });
        expect(state.visible).toBe(true);
        expect(state.background).toBe('#E8F5E9');
    });
});

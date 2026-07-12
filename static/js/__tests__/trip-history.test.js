/**
 * Tests for modules/navigation/trip-history.js
 * Asserts pure coordinate parsing and server/local trip merge (no DOM/storage).
 */
const T = require('../modules/navigation/trip-history.js');

describe('trip-history module surface', () => {
    test('exposes core trip-history helpers', () => {
        expect(typeof T.parseLatLonString).toBe('function');
        expect(typeof T.mergeServerAndLocalTrips).toBe('function');
        expect(typeof T.buildCompletedTripRecord).toBe('function');
        expect(typeof T.filterTripsBySearch).toBe('function');
        expect(typeof T.buildTripHistoryRowHtml).toBe('function');
    });
});

describe('parseLatLonString', () => {
    test('parses a valid "lat,lon" string', () => {
        expect(T.parseLatLonString('51.5074, -0.1278')).toEqual({ lat: 51.5074, lon: -0.1278 });
    });
    test('trims whitespace around each part', () => {
        expect(T.parseLatLonString('  1.5 ,  2.5 ')).toEqual({ lat: 1.5, lon: 2.5 });
    });
    test('returns null for empty/non-string input', () => {
        expect(T.parseLatLonString('')).toBeNull();
        expect(T.parseLatLonString(null)).toBeNull();
        expect(T.parseLatLonString(42)).toBeNull();
    });
    test('returns null when fewer than two parts', () => {
        expect(T.parseLatLonString('51.5')).toBeNull();
    });
    test('returns null when a part is non-numeric', () => {
        expect(T.parseLatLonString('abc,def')).toBeNull();
        expect(T.parseLatLonString('51.5,def')).toBeNull();
    });
});

describe('mergeServerAndLocalTrips', () => {
    test('returns [] for empty inputs', () => {
        expect(T.mergeServerAndLocalTrips([], [])).toEqual([]);
        expect(T.mergeServerAndLocalTrips(null, null)).toEqual([]);
    });

    test('local-only trip gets negative synthetic id and _localOnly flag', () => {
        const out = T.mergeServerAndLocalTrips([], [
            { localId: 123, serverId: null, timestamp: '2026-01-01T00:00:00Z', distance_km: 5 },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe(-123);
        expect(out[0]._localOnly).toBe(true);
        expect(out[0].distance_km).toBe(5);
    });

    test('drops a local trip already present on the server (by serverId)', () => {
        const server = [{ id: 7, timestamp: '2026-01-02T00:00:00Z' }];
        const local = [{ localId: 1, serverId: 7, timestamp: '2026-01-02T00:00:00Z' }];
        const out = T.mergeServerAndLocalTrips(server, local);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe(7);
    });

    test('synced local trip (unique serverId) is added with _localOnly false', () => {
        const out = T.mergeServerAndLocalTrips([], [
            { localId: 2, serverId: 42, timestamp: '2026-01-03T00:00:00Z' },
        ]);
        expect(out[0].id).toBe(42);
        expect(out[0]._localOnly).toBe(false);
    });

    test('sorts newest-first by timestamp', () => {
        const server = [
            { id: 1, timestamp: '2026-01-01T00:00:00Z' },
            { id: 2, timestamp: '2026-03-01T00:00:00Z' },
        ];
        const out = T.mergeServerAndLocalTrips(server, [
            { localId: 9, serverId: null, timestamp: '2026-02-01T00:00:00Z' },
        ]);
        expect(out.map((t) => t.id)).toEqual([2, -9, 1]);
    });

    test('does not mutate the input server array', () => {
        const server = [{ id: 1, timestamp: '2026-01-01T00:00:00Z' }];
        T.mergeServerAndLocalTrips(server, [{ localId: 5, serverId: null, timestamp: '2026-02-01T00:00:00Z' }]);
        expect(server).toHaveLength(1);
    });
});

describe('buildCompletedTripRecord', () => {
    test('builds record from form dataset coords', () => {
        const out = T.buildCompletedTripRecord({
            route: { distance_km: 12, duration_minutes: 20, fuel_cost: 1 },
            startEl: { value: 'A', lat: '51.5', lon: '-0.1' },
            endEl: { value: 'B', lat: '51.6', lon: '-0.2' },
            routingMode: 'auto',
        });
        expect(out).toMatchObject({
            start_lat: 51.5,
            end_lat: 51.6,
            start_address: 'A',
            end_address: 'B',
            distance_km: 12,
            routing_mode: 'auto',
        });
        expect(out.timestamp).toBeTruthy();
    });

    test('falls back to polyline endpoints when coords missing', () => {
        const out = T.buildCompletedTripRecord({
            route: { distance: 5, time: 10 },
            routePolyline: [[51.1, -0.1], [51.2, -0.2]],
        });
        expect(out.start_lat).toBe(51.1);
        expect(out.end_lat).toBe(51.2);
    });

    test('returns null when coords cannot be resolved', () => {
        expect(T.buildCompletedTripRecord({ route: {} })).toBeNull();
    });
});

describe('filterTripsBySearch', () => {
    const trips = [
        { start_address: 'London', end_address: 'Brighton', timestamp: '2026-01-01T10:00:00Z' },
        { start_address: 'Manchester', end_address: 'Leeds', timestamp: '2026-02-01T10:00:00Z' },
    ];

    test('returns all trips for empty search', () => {
        expect(T.filterTripsBySearch(trips, '')).toEqual(trips);
    });

    test('filters by start address', () => {
        expect(T.filterTripsBySearch(trips, 'london')).toHaveLength(1);
    });
});

describe('buildTripHistoryRowHtml', () => {
    test('includes trip id in action handlers', () => {
        const html = T.buildTripHistoryRowHtml(
            { id: 42, duration_minutes: 30, routing_mode: 'auto', _localOnly: false },
            {
                startAddr: 'A',
                endAddr: 'B',
                dateStr: '1 Jan',
                distance: '10',
                distUnit: 'mi',
                totalCost: '5.00',
                symbol: '£',
            }
        );
        expect(html).toContain('deleteTripHistory(42)');
        expect(html).toContain('recalculateTrip(42)');
        expect(html).toContain('A → B');
    });
});

describe('analytics display helpers', () => {
    test('buildAnalyticsDisplayValues converts mph and formats summary', () => {
        const display = T.buildAnalyticsDisplayValues(
            {
                total_trips: 5,
                total_cost: 42.5,
                avg_duration: 18,
                total_fuel_cost: 30,
                total_toll_cost: 10,
                total_caz_cost: 2.5,
                total_time_minutes: 125,
                avg_speed: 80,
            },
            {
                currencySymbol: '£',
                totalDistanceText: '120',
                speedUnit: 'mph',
                speedUnitLabel: 'mph',
            }
        );
        expect(display.totalTrips).toBe(5);
        expect(display.totalCostText).toBe('£42.50');
        expect(display.totalTimeText).toBe('2h 5m');
        expect(display.avgSpeedText).toMatch(/mph$/);
    });

    test('buildFrequentRoutesListHtml renders rows or empty state', () => {
        const empty = T.buildFrequentRoutesListHtml([], {});
        expect(empty).toContain('No trip history yet');

        const html = T.buildFrequentRoutesListHtml(
            [{ start: 'A', end: 'B', count: 3, avg_distance: 10, avg_cost: 4.5 }],
            { currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.21'], escapeHtml: (s) => s }
        );
        expect(html).toContain('A → B');
        expect(html).toContain('3 trips');
    });

    test('TRIP_HISTORY_ERROR_HTML shows load failure message', () => {
        expect(T.TRIP_HISTORY_ERROR_HTML).toContain('Error loading trips');
    });

    test('sign-in banner helpers match 401 offline copy', () => {
        expect(T.getTripHistorySignInBannerStyleCssText()).toContain('#E3F2FD');
        expect(T.buildTripHistorySignInBannerText(true)).toContain('Showing trips saved on this device');
        expect(T.buildTripHistorySignInBannerText(false)).toContain('No trips on this device yet');
    });

    test('buildLoadRouteAnalyticsOrchestrationPlan exposes API path and status copy', () => {
        const orch = T.buildLoadRouteAnalyticsOrchestrationPlan();
        expect(orch.apiPath).toBe('/api/trip-analytics');
        expect(orch.authRequiredStatusMessage).toContain('Sign in');
    });

    test('buildLoadRouteAnalyticsResponseExecutePlan maps auth, premium, and success', () => {
        const orch = T.buildLoadRouteAnalyticsOrchestrationPlan();
        expect(T.buildLoadRouteAnalyticsResponseExecutePlan({ status: 401 }, {}, orch).shouldDisplay).toBe(false);
        expect(
            T.buildLoadRouteAnalyticsResponseExecutePlan(
                { status: 403 },
                { code: 'premium_required', error: 'Premium only' },
                orch
            ).statusMessage
        ).toBe('Premium only');
        const ok = T.buildLoadRouteAnalyticsResponseExecutePlan(
            { status: 200 },
            { success: true, total_trips: 3 },
            orch
        );
        expect(ok.shouldDisplay).toBe(true);
        expect(ok.data.total_trips).toBe(3);
    });

    test('buildLoadRouteAnalyticsEntryOrchestrationPlan and fetch error execute plan', () => {
        const entry = T.buildLoadRouteAnalyticsEntryOrchestrationPlan();
        expect(entry.orch.apiPath).toBe('/api/trip-analytics');

        const fetchErr = T.buildLoadRouteAnalyticsFetchErrorExecutePlan(entry.orch);
        expect(fetchErr.shouldDisplay).toBe(false);
        expect(fetchErr.statusType).toBe('error');
        expect(fetchErr.errorLogPrefix).toBe(entry.orch.errorLogPrefix);
    });

    test('buildAnalyticsDisplayEntryOrchestrationPlan bundles execute plan', () => {
        const entry = T.buildAnalyticsDisplayEntryOrchestrationPlan(
            { total_trips: 1, frequent_routes: [] },
            {
                currencySymbol: '£',
                totalDistanceText: '10',
                speedUnit: 'mph',
                speedUnitLabel: 'mph',
                distUnit: 'mi',
                escapeHtml: (s) => s,
                convertDistance: (km) => String(km),
            }
        );
        expect(entry.execute.shouldRender).toBe(true);
        expect(entry.execute.elementPatches.totalTrips).toBe(1);
    });

    test('buildAnalyticsDisplayExecutePlan patches dashboard element ids', () => {
        const input = T.buildAnalyticsDisplayInputPlan(
            {
                total_trips: 2,
                total_distance_km: 40,
                total_cost: 10,
                avg_duration: 20,
                total_fuel_cost: 6,
                total_toll_cost: 3,
                total_caz_cost: 1,
                total_time_minutes: 40,
                avg_speed: 50,
                frequent_routes: [{ start: 'A', end: 'B', count: 2, avg_distance: 10, avg_cost: 5 }],
            },
            {
                currencySymbol: '£',
                totalDistanceText: '25',
                speedUnit: 'mph',
                speedUnitLabel: 'mph',
                distUnit: 'mi',
                escapeHtml: (s) => s,
                convertDistance: (km) => String(km),
            }
        );
        const execute = T.buildAnalyticsDisplayExecutePlan(input);
        expect(execute.shouldRender).toBe(true);
        expect(execute.elementPatches.totalTrips).toBe(2);
        expect(execute.frequentRoutesListId).toBe('frequentRoutesList');
        expect(execute.frequentRoutesHtml).toContain('A → B');
    });

    test('buildLoadTripHistoryResponseExecutePlan maps auth and success', () => {
        const orch = T.buildLoadTripHistoryOrchestrationPlan();
        expect(orch.apiPath).toBe('/api/trip-history');
        expect(T.buildLoadTripHistoryResponseExecutePlan({ status: 401 }, {}).action).toBe('auth');
        const ok = T.buildLoadTripHistoryResponseExecutePlan(
            { status: 200 },
            { success: true, trips: [{ id: 1 }] }
        );
        expect(ok.action).toBe('success');
        expect(ok.serverTrips).toHaveLength(1);
    });

    test('buildDisplayTripHistoryExecutePlan renders rows or empty state', () => {
        const empty = T.buildDisplayTripHistoryExecutePlan(
            T.buildDisplayTripHistoryInputPlan([], {})
        );
        expect(empty.listInnerHtml).toContain('No trips found');

        const execute = T.buildDisplayTripHistoryExecutePlan(
            T.buildDisplayTripHistoryInputPlan(
                [{ id: 1, start_address: 'A', end_address: 'B', distance_km: 10, duration_minutes: 20, routing_mode: 'auto', timestamp: Date.now(), fuel_cost: 1, toll_cost: 0, caz_cost: 0 }],
                { escapeHtml: (s) => s, convertDistance: (km) => String(km), distUnit: 'mi', currencySymbol: '£' }
            )
        );
        expect(execute.rows).toHaveLength(1);
        expect(execute.rows[0].display.totalCost).toBe('1.00');
    });

    test('buildRecalculateTripExecutePlan populates form from trip row', () => {
        const execute = T.buildRecalculateTripExecutePlan(2, [
            { id: 2, start_address: 'Home', end_address: 'Work' },
        ]);
        expect(execute.shouldRecalculate).toBe(true);
        expect(execute.startValue).toBe('Home');
        expect(execute.switchTab).toBe('navigation');

        const dom = T.buildRecalculateTripDomApplyPlan(execute);
        expect(dom.shouldApply).toBe(true);
        expect(dom.inputPatches).toHaveLength(2);
        expect(dom.scheduleCalculateRoute).toBe(true);
    });

    test('buildDeleteTripHistory plans distinguish local and server deletes', () => {
        const orch = T.buildDeleteTripHistoryOrchestrationPlan(-3);
        expect(orch.isLocalOnly).toBe(true);
        const local = T.buildDeleteTripHistoryLocalExecutePlan(orch, [{ id: -3 }, { id: 1 }]);
        expect(local.shouldDeleteLocal).toBe(true);
        expect(local.nextTrips).toHaveLength(1);

        const localDom = T.buildDeleteTripHistoryLocalDomApplyPlan(local);
        expect(localDom.refreshTripList).toBe(true);
        expect(localDom.statusMessage).toContain('device');

        expect(T.buildDeleteTripHistoryResponseExecutePlan({ success: true }).shouldRemove).toBe(true);
        expect(T.buildDeleteTripHistoryResponseExecutePlan({ success: false }).shouldRemove).toBe(false);

        const successDom = T.buildDeleteTripHistoryResponseDomApplyPlan(
            T.buildDeleteTripHistoryResponseExecutePlan({ success: true })
        );
        expect(successDom.refreshTripList).toBe(true);
        const errorDom = T.buildDeleteTripHistoryResponseDomApplyPlan(
            T.buildDeleteTripHistoryResponseExecutePlan({ success: false })
        );
        expect(errorDom.refreshTripList).toBe(false);
    });

    test('buildBindTripHistorySearchExecutePlan and search filter plan', () => {
        const bind = T.buildBindTripHistorySearchExecutePlan();
        expect(bind.shouldBind).toBe(true);
        expect(bind.searchInputId).toBe('tripSearchInput');
        expect(T.buildTripHistorySearchFilterPlan('  London ').searchTerm).toBe('london');
        expect(T.buildTripHistorySearchFilterPlan('').showAll).toBe(true);
    });

    test('buildLoadTripHistoryAuthBannerMountExecutePlan requires list children', () => {
        const auth = T.buildLoadTripHistoryAuthExecutePlan([{ id: 1 }]);
        expect(T.buildLoadTripHistoryAuthBannerMountExecutePlan(auth, { listHasChildren: false }).shouldMount)
            .toBe(false);
        const mount = T.buildLoadTripHistoryAuthBannerMountExecutePlan(auth, { listHasChildren: true });
        expect(mount.shouldMount).toBe(true);
        expect(mount.bannerText).toContain('device');
    });

    test('buildLoadTripHistoryErrorDomExecutePlan maps error list html', () => {
        const orch = T.buildLoadTripHistoryOrchestrationPlan();
        const dom = T.buildLoadTripHistoryErrorDomExecutePlan(
            T.buildLoadTripHistoryErrorExecutePlan(),
            orch
        );
        expect(dom.shouldApply).toBe(true);
        expect(dom.listContainerId).toBe('tripHistoryList');
        expect(dom.listInnerHtml).toContain('Error loading trips');
    });

    test('buildLoadTripHistoryEntryOrchestrationPlan and fetch error execute plan', () => {
        const entry = T.buildLoadTripHistoryEntryOrchestrationPlan();
        expect(entry.orch.apiPath).toBe('/api/trip-history');

        const fetchErr = T.buildLoadTripHistoryFetchErrorExecutePlan(entry.orch);
        expect(fetchErr.errorLogPrefix).toBe(entry.orch.errorLogPrefix);
        expect(fetchErr.errorEntry.dom.shouldApply).toBe(true);
        expect(fetchErr.errorEntry.dom.listInnerHtml).toContain('Error loading trips');
    });

    test('buildDisplayTripHistoryEntryOrchestrationPlan bundles execute plan', () => {
        const entry = T.buildDisplayTripHistoryEntryOrchestrationPlan([], {
            escapeHtml: (s) => s,
            convertDistance: (km) => String(km),
            distUnit: 'mi',
            currencySymbol: '£',
        });
        expect(entry.execute.shouldRender).toBe(true);
        expect(entry.execute.listInnerHtml).toBe(T.EMPTY_TRIP_LIST_HTML);
    });
});

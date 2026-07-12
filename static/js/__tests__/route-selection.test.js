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

    test('buildTripInfoApplyPlan hides panel when distance or time missing', () => {
        expect(RS.buildTripInfoApplyPlan(null, 30, 5, 2, {}, () => 30)).toEqual({ visible: false });
        expect(RS.buildTripInfoApplyPlan(10, null, 5, 2, {}, () => 30)).toEqual({ visible: false });
    });

    test('buildTripInfoApplyPlan returns display and dash flags for calculateRoute payload', () => {
        const plan = RS.buildTripInfoApplyPlan(
            12.5,
            '45 min',
            '-',
            3.5,
            { distanceText: '7.77', distUnit: 'mi', currencySymbol: '£' },
            (t) => (t === '45 min' ? 45 : 0)
        );
        expect(plan.visible).toBe(true);
        expect(plan.dashFuel).toBe(true);
        expect(plan.dashToll).toBe(false);
        expect(plan.showAlongRouteSearch).toBe(true);
        expect(plan.display.distanceText).toBe('7.77');
        expect(plan.display.durationMinutes).toBe(45);
        expect(plan.display.fuelCost).toBe(0);
        expect(plan.display.tollCost).toBe(3.5);
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

    test('buildRouteOptionsFromApiResponse normalises multi-route payloads', () => {
        const decode = jest.fn((geom, prec) => (geom ? [[51.5, -0.1], [51.6, -0.2]] : []));
        const options = RS.buildRouteOptionsFromApiResponse({
            source: 'OSRM',
            geometry_precision: 5,
            routes: [{
                id: 2,
                name: 'Fast',
                distance_km: 10,
                duration_minutes: 15,
                geometry: 'abc',
                hazard_count: 3,
                maneuvers: [{ type: 10 }],
            }],
        }, decode);
        expect(options).toHaveLength(1);
        expect(options[0].name).toBe('Fast');
        expect(options[0].geometry_precision).toBe(5);
        expect(options[0].polyline).toHaveLength(2);
        expect(decode).toHaveBeenCalledWith('abc', 5);
        expect(options[0].cameras_near_route).toBe(3);
    });

    test('buildRouteOptionsFromApiResponse falls back to single route shape', () => {
        const fallback = [[51.5, -0.1], [51.6, -0.2]];
        const options = RS.buildRouteOptionsFromApiResponse({
            distance: '8.5',
            time: '22',
            fuel_cost: 4,
            geometry: 'geom',
            maneuvers: [{ type: 8 }],
            source: 'Valhalla',
        }, jest.fn(), fallback);
        expect(options).toHaveLength(1);
        expect(options[0].distance_km).toBe(8.5);
        expect(options[0].duration_minutes).toBe(22);
        expect(options[0].polyline).toBe(fallback);
    });

    test('hydrateRouteOptionPolylines decodes missing polylines in place', () => {
        const decode = jest.fn(() => [[1, 2]]);
        const options = [{ geometry: 'x', source: 'osrm' }];
        RS.hydrateRouteOptionPolylines(options, decode);
        expect(options[0].polyline).toEqual([[1, 2]]);
        expect(decode).toHaveBeenCalledWith('x', 5);
    });

    test('buildRouteLayerMountPlan converts polyline and assigns style by selection', () => {
        const plan = RS.buildRouteLayerMountPlan(
            { name: 'Fast', polyline: [[51.5, -0.1], [51.6, -0.2]] },
            1,
            1
        );
        expect(plan.valid).toBe(true);
        expect(plan.layerId).toBe('route-layer-1');
        expect(plan.lngLatCoords).toEqual([[-0.1, 51.5], [-0.2, 51.6]]);
        expect(plan.style.weight).toBe(10);
        expect(plan.geoJsonFeature.geometry.coordinates).toHaveLength(2);
    });

    test('findFirstTextSymbolLayerId returns first label layer id', () => {
        expect(RS.findFirstTextSymbolLayerId([
            { id: 'roads', type: 'line' },
            { id: 'labels', type: 'symbol', layout: { 'text-field': '{name}' } },
        ])).toBe('labels');
    });

    test('collectTextSymbolLayerIds returns all label layer ids in order', () => {
        expect(RS.collectTextSymbolLayerIds([
            { id: 'roads', type: 'line' },
            { id: 'a-labels', type: 'symbol', layout: { 'text-field': '{name}' } },
            { id: 'b-labels', type: 'symbol', layout: { 'text-field': '{ref}' } },
        ])).toEqual(['a-labels', 'b-labels']);
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

    test('buildHazardPreviewPanelApplyPlan maps state to DOM apply plan', () => {
        const plan = RS.buildHazardPreviewPanelApplyPlan({
            visible: true,
            title: '✓ Route preferences applied',
            countLabel: 'Route score:',
            count: '2',
            showPenalty: true,
            penaltyMinutes: 3,
            background: '#FFF3E0',
            borderLeftColor: '#FF9800',
        });
        expect(plan.visible).toBe(true);
        expect(plan.containerDisplay).toBe('block');
        expect(plan.penaltyRowDisplay).toBe('flex');
        expect(plan.penaltyText).toBe('3 min');
        expect(plan.containerBackground).toBe('#FFF3E0');
        expect(RS.buildHazardPreviewPanelApplyPlan({ visible: false }).containerDisplay).toBe('none');
    });

    test('buildPreviewRouteCoordsPlan validates coordinate strings', () => {
        const parse = (s) => {
            const parts = String(s).split(',');
            if (parts.length < 2) return { valid: false };
            const lat = parseFloat(parts[0]);
            const lon = parseFloat(parts[1]);
            if (isNaN(lat) || isNaN(lon)) return { valid: false };
            return { valid: true, coords: [lat, lon] };
        };
        expect(RS.buildPreviewRouteCoordsPlan('51.5,-0.1', '52,-1', parse, {}).ok).toBe(true);
        expect(RS.buildPreviewRouteCoordsPlan('bad', '52,-1', parse, { invalidFormat: 'fmt' }).errorStatusMessage).toBe('fmt');
    });

    test('buildRoutePreviewSuccessInputPlan assembles formatters for preview plan', () => {
        const input = RS.buildRoutePreviewSuccessInputPlan({
            geocodedStart: '51.5,-0.1',
            geocodedEnd: '52,-1',
            startLabel: 'Start',
            endLabel: 'End',
            data: { distance_km: 10, time: '20 min' },
            parseLatLonPair: () => ({ valid: true, coords: [51.5, -0.1] }),
            decodePolyline: () => [],
            convertDistance: (km) => (km * 0.62).toFixed(1),
            distUnit: 'mi',
            currencySymbol: '£',
            parseDurationMinutes: () => 20,
        });
        expect(input.fmt.distanceText).toBe('6.2');
        expect(input.fmt.distUnit).toBe('mi');
        expect(input.fmt.currencySymbol).toBe('£');
        const plan = RS.buildRoutePreviewSuccessPlan(input);
        expect(plan.ok).toBe(true);
    });

    test('buildRoutePreviewSuccessPlan assembles preview apply metadata', () => {
        const plan = RS.buildRoutePreviewSuccessPlan({
            geocodedStart: '51.5,-0.1',
            geocodedEnd: '52,-1',
            startLabel: 'Start',
            endLabel: 'End',
            data: {
                success: true,
                distance: '12',
                time: '20 min',
                fuel_cost: 5,
                toll_cost: 1,
                geometry: 'enc',
                routes: [{ hazards: [{ id: 1 }] }],
                source: 'valhalla',
            },
            parseLatLonPair: (s) => {
                const p = String(s).split(',');
                return { valid: true, coords: [parseFloat(p[0]), parseFloat(p[1])] };
            },
            decodePolyline: () => [[51.5, -0.1], [52, -1]],
            fmt: { distanceText: '7.5', distUnit: 'mi', currencySymbol: '£' },
            parseDurationMinutes: () => 20,
        });
        expect(plan.ok).toBe(true);
        expect(plan.statusMessage).toContain('Route calculated successfully');
        expect(plan.notification.message).toContain('Ready to navigate?');
        expect(plan.recentDestinations).toHaveLength(2);
        expect(plan.primaryHazards).toHaveLength(1);
        expect(plan.routesCount).toBe(1);
    });

    test('isCurrentLocationPlaceholder matches live GPS label only', () => {
        expect(RS.isCurrentLocationPlaceholder('Current Location')).toBe(true);
        expect(RS.isCurrentLocationPlaceholder('  current location  ')).toBe(true);
        expect(RS.isCurrentLocationPlaceholder('Leeds')).toBe(false);
    });
});

describe('route comparison modal helpers', () => {
    test('buildRouteComparisonRequestRoutes normalizes route option fields', () => {
        const out = RS.buildRouteComparisonRequestRoutes([
            { distance_km: 12, duration_minutes: 25, fuel_cost: 5, toll_cost: 1, caz_cost: 0.5 },
        ]);
        expect(out).toEqual([{
            distance_km: 12,
            duration_minutes: 25,
            fuel_cost: 5,
            toll_cost: 1,
            caz_cost: 0.5,
        }]);
    });

    test('buildRouteComparisonReportHtml includes table and recommendations', () => {
        const html = RS.buildRouteComparisonReportHtml({
            routes: [
                { route_id: 1, distance_km: 10, duration_minutes: 20, total_cost: 8, cost_per_km: 0.8 },
            ],
            recommendations: {
                cheapest: { route_id: 1, reason: 'Lowest fuel' },
                fastest: { route_id: 2, reason: 'Shortest time' },
                shortest: { route_id: 3, reason: 'Fewest km' },
            },
        }, { currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.21'] });
        expect(html).toContain('Route 1');
        expect(html).toContain('Cheapest');
        expect(html).toContain('Fastest');
        expect(html).toContain('Shortest');
    });

    test('buildRouteComparisonModalHtml wraps report with close controls', () => {
        const html = RS.buildRouteComparisonModalHtml('<p>report</p>');
        expect(html).toContain('Route Comparison');
        expect(html).toContain('report');
        expect(html).toContain('routeComparisonModal');
        expect(html).toContain('Close');
    });

    test('getPreviewAlternativeRouteCardContainerStyleCssText includes route colour', () => {
        const style = RS.getPreviewAlternativeRouteCardContainerStyleCssText('#2563EB');
        expect(style).toContain('border-left: 4px solid #2563EB');
        expect(style).toContain('cursor: pointer');
    });

    test('preview alternative route card hover and rest styles', () => {
        const hover = RS.getPreviewAlternativeRouteCardHoverStyle('#2563EB');
        expect(hover.borderColor).toBe('#2563EB');
        expect(hover.background).toBe('#f0f4ff');
        expect(RS.getPreviewAlternativeRouteCardRestStyle()).toEqual({
            borderColor: '#ddd',
            background: 'white',
        });
    });

    test('shouldShowPreviewAlternativeRoutes and mount plan', () => {
        expect(RS.shouldShowPreviewAlternativeRoutes(2)).toBe(true);
        expect(RS.shouldShowPreviewAlternativeRoutes(1)).toBe(false);
        const plan = RS.buildPreviewAlternativeRouteCardMountPlan(
            { name: 'Fast', distance_km: 10, duration_minutes: 20, fuel_litres: 1.2, hazard_count: 0 },
            0,
            { routeColors: RS.ROUTE_COLORS, currencySymbol: '£', distUnit: 'mi', distanceText: '6.2', fuelUnit: 'L' }
        );
        expect(plan.containerStyle).toContain(RS.ROUTE_COLORS[0]);
        expect(plan.html).toContain('Fast');
        expect(plan.hoverStyle.borderColor).toBe(RS.ROUTE_COLORS[0]);
    });

    test('route comparison modal overlay exposes id and fullscreen style', () => {
        expect(RS.ROUTE_COMPARISON_MODAL_ID).toBe('routeComparisonModal');
        expect(RS.getRouteComparisonModalOverlayStyleCssText()).toContain('z-index: 10000');
        expect(RS.getRouteComparisonModalOverlayStyleCssText()).toContain('rgba(0,0,0,0.5)');
    });

    test('route comparison modal mount plan and status messages', () => {
        expect(RS.hasRoutesForComparison(1)).toBe(true);
        expect(RS.hasRoutesForComparison(0)).toBe(false);
        const plan = RS.buildRouteComparisonModalMountPlan(
            { routes: [{ route_id: 1, distance_km: 10, duration_minutes: 20, total_cost: 8, cost_per_km: 0.8 }] },
            { currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.2'] }
        );
        expect(plan.modalId).toBe('routeComparisonModal');
        expect(plan.innerHtml).toContain('Route Comparison');
        expect(RS.getRouteComparisonNoRoutesMessage()).toContain('Calculate a route');
        expect(RS.getRouteComparisonSuccessMessage()).toContain('comparison');
    });

    test('buildRouteComparisonModalDomApplyPlan maps mount plan to DOM apply', () => {
        const mount = RS.buildRouteComparisonModalMountPlan(
            { routes: [{ route_id: 1, distance_km: 10, duration_minutes: 20, total_cost: 8, cost_per_km: 0.8 }] },
            { currencySymbol: '£', distUnit: 'mi', distanceTexts: ['6.2'] }
        );
        const dom = RS.buildRouteComparisonModalDomApplyPlan(mount);
        expect(dom.action).toBe('mount');
        expect(dom.modalId).toBe('routeComparisonModal');
        expect(dom.dismissOnOverlayClick).toBe(true);
        expect(RS.buildRouteComparisonModalDomApplyPlan(null).action).toBe('skip');
    });

    test('buildRoutePreviewAfterDisplayPlan enables traffic preview when configured', () => {
        const plan = RS.buildRoutePreviewAfterDisplayPlan({
            routeOptions: [{ polyline: [[51.5, -0.1], [51.6, -0.2]] }],
            selectedRouteIndex: 0,
            showTrafficEnabled: true,
            hasTrafficLayer: false,
            routeTrafficEnabled: true,
        });
        expect(plan.switchToPreviewTab).toBe(true);
        expect(plan.addTrafficLayer).toBe(true);
        expect(plan.previewTraffic).toBe(true);
        expect(plan.previewPolylineRouteIndex).toBe(0);
    });

    test('buildRoutePreviewAfterDisplayExecutePlan wraps after-display flags', () => {
        const execute = RS.buildRoutePreviewAfterDisplayExecutePlan({
            switchToPreviewTab: true,
            previewTraffic: true,
            previewPolylineRouteIndex: 1,
        });
        expect(execute.shouldExecute).toBe(true);
        expect(execute.switchToPreviewTab).toBe(true);
        expect(execute.previewTraffic).toBe(true);
        expect(execute.previewPolylineRouteIndex).toBe(1);
    });

    test('buildShowRoutePreviewOrchestrationPlan gates nav update and missing data', () => {
        expect(RS.buildShowRoutePreviewOrchestrationPlan({ routeData: null }).shouldShow).toBe(false);
        expect(RS.buildShowRoutePreviewOrchestrationPlan({
            routeData: { distance_km: 10 },
            routeInProgress: true,
        }).delegateToNavUpdate).toBe(true);

        const orch = RS.buildShowRoutePreviewOrchestrationPlan({
            routeData: { distance_km: 10, routes: [{}, {}] },
            routeOptionsCount: 2,
            currencySymbol: '£',
            distanceText: '10 km',
        });
        expect(orch.shouldShow).toBe(true);
        expect(orch.showAlternativeRoutesWhenMultiple).toBe(true);
        expect(orch.panelInput.currencySymbol).toBe('£');
    });

    test('buildAlternativeRoutesPreviewDomApplyPlan maps mount to DOM apply', () => {
        const mount = RS.buildAlternativeRoutesPreviewMountPlans(
            [{ distance_km: 10, duration_minutes: 20, fuel_cost: 4, toll_cost: 0, caz_cost: 0, name: 'A' }],
            { routeColors: ['#f00'], currencySymbol: '£', distUnit: 'mi', convertDistance: (km) => String(km) }
        );
        const dom = RS.buildAlternativeRoutesPreviewDomApplyPlan(mount);
        expect(dom.showContainer).toBe(false);
        expect(dom.containerDisplay).toBe('none');
    });

    test('buildAlternativeRoutesPreviewDomExecutePlan lists container ids', () => {
        const execute = RS.buildAlternativeRoutesPreviewDomExecutePlan({
            showContainer: true,
            containerDisplay: 'block',
            cardPlans: [{ html: '<div/>' }],
        });
        expect(execute.shouldExecute).toBe(true);
        expect(execute.listContainerId).toBe('previewAlternativeRoutesList');
        expect(execute.cardPlans).toHaveLength(1);
    });

    test('buildShowAlternativeRoutesPreviewOrchestrationPlan gates on route count', () => {
        expect(RS.buildShowAlternativeRoutesPreviewOrchestrationPlan(0).shouldShow).toBe(false);
        expect(RS.buildShowAlternativeRoutesPreviewOrchestrationPlan(2).shouldShow).toBe(true);
    });

    test('buildRouteComparisonListDomApplyPlan maps routes to list container HTML', () => {
        const dom = RS.buildRouteComparisonListDomApplyPlan({
            routes: [{ name: 'Fast', distance_km: 10, duration_minutes: 20, fuel_cost: 4, toll_cost: 0, caz_cost: 0 }],
            listOpts: {
                selectedIndex: 0,
                routeColors: ['#f00'],
                currencySymbol: '£',
                distUnit: 'mi',
                distanceTexts: ['6.2'],
            },
        });
        expect(dom.containerId).toBe('routeComparisonList');
        expect(dom.innerHtml).toContain('Show All 1 Routes');
    });

    test('buildDisplayRouteComparisonOrchestrationPlan bundles list opts for non-empty routes', () => {
        const orch = RS.buildDisplayRouteComparisonOrchestrationPlan({
            routes: [{ distance_km: 5, duration_minutes: 10 }],
            selectedRouteIndex: 1,
            routeColors: ['#00f'],
            currencySymbol: '$',
            distUnit: 'km',
            distanceTexts: ['5.0'],
        });
        expect(orch.shouldDisplay).toBe(true);
        expect(orch.domPlan.containerId).toBe('routeComparisonList');
        expect(orch.domPlan.innerHtml).toContain('Show All 1 Routes');
    });

    test('buildUseRouteOrchestrationPlan gates invalid index and previews traffic when enabled', () => {
        expect(RS.buildUseRouteOrchestrationPlan(0, [], {}).shouldUse).toBe(false);

        const withTraffic = RS.buildUseRouteOrchestrationPlan(
            0,
            [{ polyline: [[51, -1], [52, -1]] }],
            { routeTrafficEnabled: true }
        );
        expect(withTraffic.shouldUse).toBe(true);
        expect(withTraffic.previewTraffic).toBe(true);
        expect(withTraffic.previewPolyline).toHaveLength(2);

        const noTraffic = RS.buildUseRouteOrchestrationPlan(
            0,
            [{ polyline: [[51, -1]] }],
            { routeTrafficEnabled: false }
        );
        expect(noTraffic.previewTraffic).toBe(false);
    });

    test('buildShowAllRoutesOrchestrationPlan gates empty route list', () => {
        expect(RS.buildShowAllRoutesOrchestrationPlan(0).shouldShow).toBe(false);
        const orch = RS.buildShowAllRoutesOrchestrationPlan(3);
        expect(orch.shouldShow).toBe(true);
        expect(orch.statusMessage).toContain('3 routes');
    });

    test('buildShowRouteComparisonRequestOrchestrationPlan and API result execute', () => {
        const request = RS.buildShowRouteComparisonRequestOrchestrationPlan([
            { distance_km: 10, duration_minutes: 20, fuel_cost: 1, toll_cost: 0, caz_cost: 0 },
        ]);
        expect(request.fetchPlan.apiPath).toBe('/api/route-comparison');
        expect(request.routesForComparison).toHaveLength(1);

        const success = RS.buildShowRouteComparisonApiResultExecutePlan(
            {
                success: true,
                comparison: {
                    routes: [{
                        route_id: 1,
                        distance_km: 10,
                        duration_minutes: 20,
                        total_cost: 8,
                        cost_per_km: 0.8,
                        name: 'A',
                    }],
                    recommendations: [],
                },
            },
            { currencySymbol: '£', distUnit: 'mi', convertDistance: (km) => String(km) }
        );
        expect(success.shouldMountModal).toBe(true);

        const fail = RS.buildShowRouteComparisonApiResultExecutePlan(
            { success: false, error: 'bad' },
            {}
        );
        expect(fail.shouldMountModal).toBe(false);
    });
});

describe('buildInNavRerouteSuccessPlan', () => {
    test('merges route payload and builds voice announcement when enabled', () => {
        const plan = RS.buildInNavRerouteSuccessPlan(
            { geometry: 'abc', duration_minutes: 25, distance_km: 12 },
            { success: true, time: '30', distance: '15' },
            '52.0,-1.0',
            'Leeds',
            { enabled: true, convertDistance: (km) => km * 0.62, distUnit: 'mi' }
        );
        expect(plan.lastCalculatedRoutePatch.geometry).toBe('abc');
        expect(plan.lastCalculatedRoutePatch.destination).toBe('52.0,-1.0');
        expect(plan.lastCalculatedRoutePatch.destinationName).toBe('Leeds');
        expect(plan.durationMinutes).toBe(25);
        expect(plan.speakMessage).toContain('Route recalculated');
        expect(plan.speakMessage).toContain('mi');
        expect(plan.statusMessage).toContain('continuing navigation');
    });

    test('omits speak message when voice disabled', () => {
        const plan = RS.buildInNavRerouteSuccessPlan(
            { duration_minutes: 10 },
            { time: '10' },
            '51,0',
            'Home',
            { enabled: false }
        );
        expect(plan.speakMessage).toBeNull();
        expect(plan.noRouteErrorMessage).toContain('No route returned');
    });
});

describe('preview route path and status helpers', () => {
    const start = [51.5, -0.1];
    const end = [51.6, -0.2];
    const decode = jest.fn(() => [[51.5, -0.1], [51.55, -0.15], [51.6, -0.2]]);

    test('resolveRouteGeometryPrecision prefers API value and OSRM default', () => {
        expect(RS.resolveRouteGeometryPrecision({ geometry_precision: 5 })).toBe(5);
        expect(RS.resolveRouteGeometryPrecision({ source: 'osrm' })).toBe(5);
        expect(RS.resolveRouteGeometryPrecision({ source: 'valhalla' })).toBe(6);
    });

    test('resolvePreviewRoutePath decodes geometry or falls back to straight line', () => {
        const ok = RS.resolvePreviewRoutePath(start, end, { geometry: 'abc', source: 'valhalla' }, decode);
        expect(ok.usedFallback).toBe(false);
        expect(ok.routePath).toHaveLength(3);
        const bad = RS.resolvePreviewRoutePath(start, end, { geometry: 'bad' }, () => []);
        expect(bad.usedFallback).toBe(true);
        expect(bad.routePath).toEqual([[51.5, -0.1], [51.6, -0.2]]);
    });

    test('buildRouteCalculatedStatusMessage includes timing and multi-drop hints', () => {
        const msg = RS.buildRouteCalculatedStatusMessage({
            response_time_ms: 42.7,
            via_points_count: 2,
            stops_count: 1,
            multi_drop: true,
            optimized: true,
        });
        expect(msg).toContain('successfully');
        expect(msg).toContain('43ms');
        expect(msg).toContain('via-points');
        expect(msg).toContain('optimized');
    });
});

describe('route result patch helpers', () => {
    test('resolveRouteDisplayTime prefers total_time_with_stops when stops present', () => {
        expect(RS.resolveRouteDisplayTime({ time: 30, total_stop_time: 10, total_time_with_stops: 40 })).toBe(40);
        expect(RS.resolveRouteDisplayTime({ time: 30 })).toBe(30);
    });

    test('resolveInitialRouteDurationMinutes and buildLastCalculatedRoutePatch', () => {
        const data = { routes: [{ duration_minutes: 22 }], time: '25', distance: 10 };
        expect(RS.resolveInitialRouteDurationMinutes(data)).toBe(22);
        const patch = RS.buildLastCalculatedRoutePatch(data, '52,-1', 'Leeds');
        expect(patch.duration_minutes).toBe(22);
        expect(patch.destination).toBe('52,-1');
        expect(patch.destinationName).toBe('Leeds');
        expect(patch.distance).toBe(10);
    });
});

describe('route preview panel and in-nav dispatch helpers', () => {
    test('formatPreviewVehicleTypeLabel title-cases underscored types', () => {
        expect(RS.formatPreviewVehicleTypeLabel('electric_car')).toBe('Electric Car');
        expect(RS.formatPreviewVehicleTypeLabel('')).toBe('');
    });

    test('formatPreviewRoutingModeLabel capitalises routing mode', () => {
        expect(RS.formatPreviewRoutingModeLabel('fastest')).toBe('Fastest');
    });

    test('parseRecentDestinationFromCoordString returns route record or null', () => {
        expect(RS.parseRecentDestinationFromCoordString('52.1, -1.2', 'Leeds')).toEqual({
            label: 'Leeds',
            lat: 52.1,
            lon: -1.2,
            kind: 'route',
        });
        expect(RS.parseRecentDestinationFromCoordString('bad', 'X')).toBeNull();
        expect(RS.parseRecentDestinationFromCoordString('', 'X')).toBeNull();
    });

    test('buildInNavRerouteDispatchPlan extends success plan with recent destination', () => {
        const plan = RS.buildInNavRerouteDispatchPlan(
            { geometry: 'abc', duration_minutes: 18 },
            { time: '18' },
            '51.5,-0.1',
            'London',
            { enabled: false }
        );
        expect(plan.lastCalculatedRoutePatch.geometry).toBe('abc');
        expect(plan.recentDestination).toEqual({
            label: 'London',
            lat: 51.5,
            lon: -0.1,
            kind: 'route',
        });
        expect(plan.speakMessage).toBeNull();
    });

    test('buildCalculateRouteIdleUiApplyPlan assembles post-preview UI actions', () => {
        const plan = RS.buildCalculateRouteIdleUiApplyPlan({
            notification: { title: 'Route Ready', message: '12 km in 20 min', type: 'success' },
            recentDestinations: [{ label: 'London', lat: 51.5, lon: -0.1, kind: 'route' }],
        });
        expect(plan.showStartNavButtons).toBe(true);
        expect(plan.startNavButtonIds).toContain('startNavBtn');
        expect(plan.delayedPreview.delayMs).toBe(300);
        expect(plan.notification.title).toBe('Route Ready');
        expect(plan.recentDestinations).toHaveLength(1);
    });

    test('buildCalculateRouteIdleUiExecutePlan wraps apply plan with execute flags', () => {
        const apply = RS.buildCalculateRouteIdleUiApplyPlan({
            notification: { title: 'Ready', message: 'Go', type: 'success' },
        });
        const execute = RS.buildCalculateRouteIdleUiExecutePlan(apply);
        expect(execute.shouldExecute).toBe(true);
        expect(execute.hideRouteProgressBar).toBe(true);
        expect(execute.updateArButtonVisibility).toBe(true);
        expect(execute.notification.title).toBe('Ready');
    });

    test('buildInNavRerouteOutcomeExecutePlan gates on active route', () => {
        const dispatch = RS.buildInNavRerouteDispatchPlan(
            { name: 'Fastest', duration_minutes: 20 },
            { routes: [{ name: 'Fastest' }] },
            '51.5,-0.1',
            'London'
        );
        const ok = RS.buildInNavRerouteOutcomeExecutePlan(dispatch, { name: 'Fastest', geometry: 'abc' });
        expect(ok.shouldApply).toBe(true);
        expect(ok.updateRouteOnMap).toBe(true);
        expect(ok.statusMessage).toBeTruthy();

        const fail = RS.buildInNavRerouteOutcomeExecutePlan(dispatch, null);
        expect(fail.shouldApply).toBe(false);
        expect(fail.noRouteErrorMessage).toContain('No route');
    });

    test('buildRecalculateRouteWithPreferencesPlan guards missing route', () => {
        expect(RS.buildRecalculateRouteWithPreferencesPlan(null).ok).toBe(false);
        expect(RS.buildRecalculateRouteWithPreferencesPlan({}).ok).toBe(false);
        const plan = RS.buildRecalculateRouteWithPreferencesPlan({ destination: 'London' });
        expect(plan.ok).toBe(true);
        expect(plan.switchTab).toBe('navigation');
        expect(plan.recalculateDelayMs).toBe(300);
    });

    test('buildRoutePreviewPanelApplyPlan returns formatted preview values', () => {
        const plan = RS.buildRoutePreviewPanelApplyPlan({
            routeData: {
                routes: [{
                    distance_km: 10,
                    duration_minutes: 25,
                    fuel_cost: 5,
                    toll_cost: 2,
                    caz_cost: 1,
                    hazard_count: 3,
                    cameras_near_route: 3,
                }],
            },
            selectedRouteIndex: 0,
            currencySymbol: '£',
            distanceText: '6.2 mi',
            startLabel: 'Home',
            endLabel: 'Work',
            routingMode: 'fastest',
            vehicleType: 'petrol',
            distanceUnit: 'mi',
            preferencesApplied: true,
            routeOptionsCount: 2,
        });
        expect(plan.distanceKm).toBe(10);
        expect(plan.durationText).toBe('25 min');
        expect(plan.routeLabel).toBe('Home → Work');
        expect(plan.fuelCostText).toBe('£5.00');
        expect(plan.totalCostText).toBe('£8.00');
        expect(plan.routingModeText).toBe('Fastest');
        expect(plan.vehicleTypeText).toBe('Petrol');
        expect(plan.showAlternativeRoutes).toBe(true);
        expect(plan.showMapRoutes).toBe(true);
        expect(plan.hazardPlan.visible).toBe(true);
    });

    test('buildRoutePreviewPanelDomApplyPlan maps panel plan to DOM patches', () => {
        const panelPlan = RS.buildRoutePreviewPanelApplyPlan({
            routeData: {
                routes: [{
                    distance_km: 8,
                    duration_minutes: 18,
                    fuel_cost: 4,
                    toll_cost: 1,
                    caz_cost: 0,
                    hazard_count: 0,
                    cameras_near_route: 0,
                }],
            },
            selectedRouteIndex: 0,
            currencySymbol: '£',
            distanceText: '5 mi',
            startLabel: 'A',
            endLabel: 'B',
            routingMode: 'fastest',
            vehicleType: 'petrol',
            routeOptionsCount: 1,
        });
        const dom = RS.buildRoutePreviewPanelDomApplyPlan(panelPlan);
        expect(dom.previewDistance.textContent).toBe('5 mi');
        expect(dom.previewDuration.textContent).toBe('18 min');
        expect(dom.previewRoute.textContent).toBe('A → B');
        expect(dom.previewFuelCost.textContent).toBe('£4.00');
        expect(dom.previewAlternativeRoutesContainer.showAlternativeRoutes).toBe(false);
        expect(dom.showMapRoutes).toBe(true);
    });

    test('buildRoutePreviewPanelDomExecutePlan wraps panel patches with element ids', () => {
        const dom = RS.buildRoutePreviewPanelDomApplyPlan({
            distanceKm: 10,
            distanceText: '6 mi',
            durationText: '20 min',
            routeLabel: 'A → B',
            fuelCostText: '£4',
            tollCostText: '£0',
            cazCostText: '£0',
            totalCostText: '£4',
            routingModeText: 'Auto',
            vehicleTypeText: 'Petrol',
            hazardPlan: { visible: false, containerDisplay: 'none' },
            showAlternativeRoutes: false,
            showMapRoutes: true,
            statusMessage: 'ok',
            costLog: {},
        });
        const execute = RS.buildRoutePreviewPanelDomExecutePlan(dom);
        expect(execute.shouldExecute).toBe(true);
        expect(execute.elementIds.previewDistance).toBe('previewDistance');
        expect(execute.patches.previewDistance.textContent).toBe('6 mi');
    });

    test('buildCalculateRouteIdlePreviewExecutePlan lists preview side effects', () => {
        const preview = {
            ok: true,
            startCoords: [51.5, -0.1],
            endCoords: [51.6, -0.2],
            pathPlan: { routePath: [[51.5, -0.1], [51.6, -0.2]] },
            routePath: [[51.5, -0.1], [51.6, -0.2]],
            displayTime: '20 min',
            statusMessage: 'Route calculated',
            lastCalculatedRoutePatch: { destination: 'London' },
            durationMinutes: 20,
            primaryHazards: [{ lat: 1, lon: 2 }],
            routesCount: 2,
            routeSource: 'valhalla',
            defaultPrecision: 6,
        };
        const execute = RS.buildCalculateRouteIdlePreviewExecutePlan(preview, { geometry: 'abc', distance: '10 km' });
        expect(execute.shouldExecute).toBe(true);
        expect(execute.displayPrimaryHazards).toBe(true);
        expect(execute.multiRouteLogMessage).toContain('2 routes');
        expect(RS.buildCalculateRouteIdlePreviewExecutePlan({ ok: false, errorStatusMessage: 'bad' }).shouldExecute)
            .toBe(false);
    });

    test('buildRouteUpdateDuringNavigationExecutePlan patches lastCalculatedRoute', () => {
        const execute = RS.buildRouteUpdateDuringNavigationExecutePlan(
            { name: 'Fastest', geometry: 'abc', duration_minutes: 25 },
            { time: '25 min', destination: '52,0' },
            { destination: '51,0', destinationName: 'Old', duration_minutes: 20, name: 'Fastest' }
        );
        expect(execute.shouldExecute).toBe(true);
        expect(execute.updateRouteOnMap).toBe(true);
        expect(execute.patchLastCalculatedRoute).toBe(true);
        expect(execute.lastCalculatedRoutePatch.duration_minutes).toBe(25);
        expect(execute.lastCalculatedRoutePatch.destination).toBe('51,0');
        expect(RS.buildRouteUpdateDuringNavigationExecutePlan(null, {}, {}).shouldExecute).toBe(false);
    });

    test('buildShowRouteComparisonOrchestrationPlan blocks empty route lists', () => {
        const blocked = RS.buildShowRouteComparisonOrchestrationPlan(0);
        expect(blocked.shouldProceed).toBe(false);
        expect(blocked.errorStatusMessage).toContain('Calculate a route');

        const ok = RS.buildShowRouteComparisonOrchestrationPlan(2);
        expect(ok.shouldProceed).toBe(true);
        expect(ok.singleRouteWarning).toBe(false);

        const single = RS.buildShowRouteComparisonOrchestrationPlan(1);
        expect(single.shouldProceed).toBe(true);
        expect(single.singleRouteWarning).toBe(true);
    });

    test('buildShowRouteComparisonSuccessExecutePlan mounts modal on API success', () => {
        const success = RS.buildShowRouteComparisonSuccessExecutePlan({
            apiSuccess: true,
            comparison: {
                routes: [{
                    route_id: 1,
                    distance_km: 10,
                    duration_minutes: 20,
                    total_cost: 8,
                    cost_per_km: 0.8,
                    name: 'A',
                }],
                recommendations: [],
            },
            currencySymbol: '£',
            distUnit: 'mi',
            convertDistance: (km) => String(km),
        });
        expect(success.shouldMountModal).toBe(true);
        expect(success.domApplyPlan.action).toBe('mount');

        const fail = RS.buildShowRouteComparisonSuccessExecutePlan({
            apiSuccess: false,
            apiError: 'bad',
        });
        expect(fail.shouldMountModal).toBe(false);
        expect(fail.errorStatusMessage).toContain('bad');
    });

    test('buildShowRouteComparisonFetchPlan and select-route dispatch plans', () => {
        const fetchPlan = RS.buildShowRouteComparisonFetchPlan([{ name: 'A' }]);
        expect(fetchPlan.shouldFetch).toBe(true);
        expect(fetchPlan.apiPath).toBe('/api/route-comparison');

        const err = RS.buildShowRouteComparisonErrorExecutePlan(new Error('network'));
        expect(err.statusMessage).toContain('network');

        const dispatch = RS.buildSelectRouteDispatchPlan(0, [
            { name: 'Scenic', maneuvers: [1, 2] },
        ]);
        expect(dispatch.shouldSelect).toBe(true);
        expect(dispatch.maneuverCount).toBe(2);

        const preview = RS.buildSelectRoutePreviewPayloadPlan(
            [{ name: 'A' }, { name: 'B' }],
            1,
            { success: true, source: 'valhalla' }
        );
        expect(preview.shouldPreview).toBe(true);
        expect(preview.previewPayload.routes).toHaveLength(2);
        expect(RS.buildSelectRouteDispatchPlan(9, [{ name: 'A' }]).shouldSelect).toBe(false);
    });

    test('buildSelectRouteOrchestrationPlan bundles dispatch and preview', () => {
        const orch = RS.buildSelectRouteOrchestrationPlan(0, [
            { name: 'Fastest', maneuvers: [1] },
        ], { success: true });
        expect(orch.shouldSelect).toBe(true);
        expect(orch.dispatch.routeName).toBe('Fastest');
        expect(orch.preview.shouldPreview).toBe(true);
        expect(RS.buildSelectRouteOrchestrationPlan(2, [{ name: 'A' }], null).shouldSelect)
            .toBe(false);
    });

    test('buildDisplaySingleRouteOrchestrationPlan wraps execute and pre-clear', () => {
        const orch = RS.buildDisplaySingleRouteOrchestrationPlan(0, [
            { name: 'Fastest', polyline: [[51.5, -0.1], [51.6, -0.2]], hazards: [] },
        ], { displayOpts: { routeColors: ['#000'] } });
        expect(orch.shouldExecute).toBe(true);
        expect(orch.preClear.clearAllRouteLayerHandles).toBe(true);
        expect(orch.entryLogMessage).toContain('displaySingleRoute(0)');
    });

    test('buildRouteComparisonModalExecutePlan wraps DOM mount fields', () => {
        const execute = RS.buildRouteComparisonModalExecutePlan({
            action: 'mount',
            modalId: 'routeComparisonModal',
            overlayStyle: 'position:fixed',
            innerHtml: '<div>report</div>',
            dismissOnOverlayClick: true,
            removeExisting: true,
        });
        expect(execute.shouldExecute).toBe(true);
        expect(execute.modalId).toBe('routeComparisonModal');
        expect(RS.buildRouteComparisonModalExecutePlan({ action: 'skip' }).shouldExecute).toBe(false);
    });

    test('buildAlternativeRoutesPreviewMountPlans builds card plans with converted distance', () => {
        const mount = RS.buildAlternativeRoutesPreviewMountPlans(
            [
                { distance_km: 10, duration_minutes: 20, fuel_cost: 4, toll_cost: 0, caz_cost: 0, name: 'A' },
                { distance_km: 12, duration_minutes: 22, fuel_cost: 5, toll_cost: 0, caz_cost: 0, name: 'B' },
            ],
            {
                routeColors: ['#f00', '#0f0'],
                currencySymbol: '£',
                distUnit: 'mi',
                fuelUnit: 'L',
                convertDistance: (km) => (km * 0.62).toFixed(1),
            }
        );
        expect(mount.showContainer).toBe(true);
        expect(mount.cardPlans).toHaveLength(2);
        expect(mount.cardPlans[0].html).toContain('A');
    });
});

describe('navigation route polyline style', () => {
    test('buildNavActiveRoutePolylineStyle uses nav color with outline', () => {
        const style = RS.buildNavActiveRoutePolylineStyle('#2563EB');
        expect(style.color).toBe('#2563EB');
        expect(style.outline).toBe(true);
        expect(style.weight).toBe(8);
    });

    test('buildNavActiveRouteLayerMountPlan returns polyline and style', () => {
        const mount = RS.buildNavActiveRouteLayerMountPlan({
            routePolyline: [[51.5, -0.1], [51.6, -0.2]],
            navRouteColor: '#f00',
        });
        expect(mount.valid).toBe(true);
        expect(mount.polyline).toHaveLength(2);
        expect(mount.style.color).toBe('#f00');
    });

    test('buildNavRouteLayerRedrawGuardPlan requires nav context', () => {
        expect(RS.buildNavRouteLayerRedrawGuardPlan({
            routeInProgress: true,
            map: {},
            routePolyline: [[1, 2], [3, 4]],
        }).shouldRedraw).toBe(true);
        expect(RS.buildNavRouteLayerRedrawGuardPlan({
            routeInProgress: false,
            map: {},
            routePolyline: [[1, 2], [3, 4]],
        }).shouldRedraw).toBe(false);
    });
});

describe('route overview and single-route display plans', () => {
    const decode = jest.fn(() => [[51.5, -0.1], [51.55, -0.15], [51.6, -0.2]]);

    test('buildRouteOverviewDispatchPlan decodes geometry and requests MapLibre fitBounds', () => {
        const plan = RS.buildRouteOverviewDispatchPlan(
            { geometry: 'abc', source: 'valhalla' },
            decode
        );
        expect(plan.ok).toBe(true);
        expect(plan.routePath).toHaveLength(3);
        expect(plan.fitBounds).toEqual({ padding: 50, maxZoom: 16 });
        expect(plan.statusType).toBe('success');
    });

    test('buildRouteOverviewDispatchPlan rejects missing geometry', () => {
        expect(RS.buildRouteOverviewDispatchPlan(null, decode).ok).toBe(false);
        expect(RS.buildRouteOverviewDispatchPlan({ geometry: 'x' }, () => []).ok).toBe(false);
    });

    test('routeHazardsIncludeOsmTrafficLights detects OSM signal types', () => {
        expect(RS.routeHazardsIncludeOsmTrafficLights([{ type: 'camera' }])).toBe(false);
        expect(RS.routeHazardsIncludeOsmTrafficLights([{ type: 'traffic_signals' }])).toBe(true);
    });

    test('buildSingleRouteMapDisplayPlan skips duplicate traffic-light plot when hazards include OSM signals', () => {
        const plan = RS.buildSingleRouteMapDisplayPlan(
            {
                name: 'Fastest',
                polyline: [[51.5, -0.1], [51.6, -0.2]],
                hazards: [{ type: 'traffic_light', lat: 51.55, lon: -0.15 }],
            },
            0,
            {
                routeColors: ['#f00', '#0f0'],
                showTrafficEnabled: true,
                routeTrafficEnabled: true,
                hasTrafficLayer: false,
                trafficLightsEnabled: true,
                trafficLightsPlotAvailable: true,
            }
        );
        expect(plan.valid).toBe(true);
        expect(plan.polyline.color).toBe('#f00');
        expect(plan.hazards.action).toBe('show');
        expect(plan.ensureTomTomTrafficLayer).toBe(true);
        expect(plan.routeTraffic.enabled).toBe(true);
        expect(plan.trafficLights.action).toBe('clear');
        expect(plan.trafficLights.hasOsmTlsInHazards).toBe(true);
    });

    test('buildSingleRouteMapDisplayPlan plots traffic lights when hazards omit OSM signals', () => {
        const plan = RS.buildSingleRouteMapDisplayPlan(
            {
                name: 'Shortest',
                polyline: [[51.5, -0.1], [51.6, -0.2]],
                hazards: [{ type: 'camera', lat: 51.55, lon: -0.15 }],
            },
            1,
            {
                trafficLightsEnabled: true,
                trafficLightsPlotAvailable: true,
            }
        );
        expect(plan.trafficLights.action).toBe('plot');
        expect(plan.hazards.action).toBe('show');
    });

    test('buildAllRoutesMapSideEffectsPlan requests fit bounds and hazard display', () => {
        const plan = RS.buildAllRoutesMapSideEffectsPlan(
            [
                { polyline: [[51.5, -0.1], [51.6, -0.2]] },
                { polyline: [[51.55, -0.15]] },
            ],
            { showTrafficEnabled: true, hasTrafficLayer: false }
        );
        expect(plan.fitBounds.coords).toHaveLength(3);
        expect(plan.fitBounds.padding).toBe(50);
        expect(plan.displayAllRouteHazards).toBe(true);
        expect(plan.ensureTomTomTrafficLayer).toBe(true);
        expect(plan.bringRoutesToTop).toBe(true);
    });

    test('buildDisplayAllRoutesMapDispatchPlan requires routes and schedules style fallback', () => {
        expect(RS.buildDisplayAllRoutesMapDispatchPlan([]).valid).toBe(false);
        const plan = RS.buildDisplayAllRoutesMapDispatchPlan([{ polyline: [[1, 2]] }]);
        expect(plan.valid).toBe(true);
        expect(plan.hydratePolylines).toBe(true);
        expect(plan.styleLoad.fallbackTimeoutMs).toBe(RS.DISPLAY_ALL_ROUTES_STYLE_FALLBACK_MS);
    });

    test('buildDisplayAllRoutesMapOrchestrationPlan logs route count', () => {
        const orch = RS.buildDisplayAllRoutesMapOrchestrationPlan(3);
        expect(orch.routeCount).toBe(3);
        expect(orch.entryLogMessage).toContain('displayAllRoutesOnMap');
    });

    test('buildDisplayAllRoutesMapExecutePlan combines pre-mount and style scheduling', () => {
        const dispatch = RS.buildDisplayAllRoutesMapDispatchPlan([{ polyline: [[1, 2]] }]);
        const execute = RS.buildDisplayAllRoutesMapExecutePlan(dispatch, { isStyleLoaded: false });
        expect(execute.shouldExecute).toBe(true);
        expect(execute.preMount.hydratePolylines).toBe(true);
        expect(execute.stylePlan.strategy).toBe('wait');
        expect(RS.buildDisplayAllRoutesMapExecutePlan({ valid: false }).shouldExecute).toBe(false);
    });

    test('buildDisplayAllRoutesMapMountApplyPlan bundles mount sequence fields', () => {
        const dispatch = RS.buildDisplayAllRoutesMapDispatchPlan([{ polyline: [[1, 2]] }]);
        const execute = RS.buildDisplayAllRoutesMapExecutePlan(dispatch, { isStyleLoaded: true });
        const orch = RS.buildDisplayAllRoutesMapOrchestrationPlan(1);
        const mount = RS.buildDisplayAllRoutesMapMountApplyPlan(execute, orch);
        expect(mount.shouldMount).toBe(true);
        expect(mount.preMount.hydratePolylines).toBe(true);
        expect(mount.mapMissingLogMessage).toContain('Map not available');
    });

    test('buildDoAddRouteLayersExecutePlan bundles batch and post-mount plans', () => {
        const execute = RS.buildDoAddRouteLayersExecutePlan(
            RS.buildDoAddRouteLayersOrchestrationPlan({
                routeOptions: [{ polyline: [[51, -0.1], [51.1, -0.2]], name: 'A' }],
                selectedRouteIndex: 0,
                styleLayers: [{ id: 'road-label', type: 'symbol', layout: { 'text-field': 'x' } }],
                showTrafficEnabled: false,
                hasTrafficLayer: false,
                mountedLayerCount: 1,
            })
        );
        expect(execute.shouldExecute).toBe(true);
        expect(execute.batchExecute.layerSteps.length).toBeGreaterThan(0);
        expect(execute.postMount.bringRoutesToTop).toBe(true);
        expect(RS.buildBringRoutesToTopOrchestrationPlan(2).layerCount).toBe(2);
    });

    test('buildRecalculateRouteWithPreferencesExecutePlan schedules delayed recalc', () => {
        const execute = RS.buildRecalculateRouteWithPreferencesExecutePlan({
            ok: true,
            loadingStatusMessage: 'loading',
            switchTab: 'navigation',
            recalculateDelayMs: 300,
        });
        expect(execute.shouldRecalculate).toBe(true);
        expect(execute.saveRoutePreferences).toBe(true);
        expect(RS.buildRecalculateRouteWithPreferencesExecutePlan({ ok: false }).shouldRecalculate)
            .toBe(false);
    });

    test('buildStartNavigationExecutePlan hides nav buttons and collapses sheet', () => {
        const execute = RS.buildStartNavigationExecutePlan({ destination: 'London' });
        expect(execute.shouldStart).toBe(true);
        expect(execute.hideStartNavButtonIds).toContain('startNavBtn');
        expect(execute.collapseBottomSheet).toBe(true);

        const preview = RS.buildStartNavigationExecutePlan({ destination: 'London' }, {
            syncFromSelection: true,
            selectedRouteIndex: 1,
        });
        expect(preview.syncFromSelection).toBe(true);
        expect(RS.buildStartNavigationExecutePlan(null).shouldStart).toBe(false);
    });

    test('buildClearAllRouteLayersFromMapPlan lists route and polyline artifacts', () => {
        const plan = RS.buildClearAllRouteLayersFromMapPlan({
            layers: [
                { id: 'route-layer-0' },
                { id: 'polyline-1' },
                { id: 'background' },
            ],
            sources: {
                'route-layer-0': {},
                'polyline-1': {},
                'tomtom-traffic': {},
            },
        });
        expect(plan.layerIds).toEqual(['route-layer-0', 'polyline-1']);
        expect(plan.sourceIds).toEqual(['route-layer-0', 'polyline-1']);
        expect(plan.hasArtifacts).toBe(true);
    });

    test('buildDisplayAllRoutesMapStyleLoadExecutePlan chooses immediate or wait strategy', () => {
        const dispatch = RS.buildDisplayAllRoutesMapDispatchPlan([{ polyline: [[1, 2]] }]);
        expect(RS.buildDisplayAllRoutesMapStyleLoadExecutePlan(dispatch, { isStyleLoaded: true }).strategy)
            .toBe('immediate');
        const wait = RS.buildDisplayAllRoutesMapStyleLoadExecutePlan(dispatch, { isStyleLoaded: false });
        expect(wait.strategy).toBe('wait');
        expect(wait.fallbackTimeoutMs).toBe(RS.DISPLAY_ALL_ROUTES_STYLE_FALLBACK_MS);
    });

    test('buildDoAddRouteLayersPostMountExecutePlan requests hazards and z-order side effects', () => {
        const side = RS.buildAllRoutesMapSideEffectsPlan([{ polyline: [[1, 2]] }], {
            showTrafficEnabled: true,
            hasTrafficLayer: false,
        });
        const plan = RS.buildDoAddRouteLayersPostMountExecutePlan(side, { mountedLayerCount: 2 });
        expect(plan.displayAllRouteHazards).toBe(true);
        expect(plan.bringRoutesToTop).toBe(true);
        expect(plan.ensureTomTomTrafficLayer).toBe(true);
        expect(plan.completionLogMessage).toContain('2');
    });

    test('buildSingleRouteMapDisplayExecutePlan wraps valid display plan', () => {
        const display = RS.buildSingleRouteMapDisplayPlan(
            { name: 'Fastest', polyline: [[51.5, -0.1], [51.6, -0.2]], hazards: [] },
            0,
            { routeTrafficEnabled: true }
        );
        const plan = RS.buildSingleRouteMapDisplayExecutePlan(display);
        expect(plan.shouldExecute).toBe(true);
        expect(plan.routeTraffic.enabled).toBe(true);
        expect(RS.buildSingleRouteMapDisplayExecutePlan({ valid: false }).shouldExecute).toBe(false);
    });

    test('buildBringRoutesToTopDispatchPlan lists layer ids and label anchor', () => {
        const layers = [{ id: 'a' }, { type: 'symbol', layout: { 'text-field': 'x' }, id: 'label' }];
        const plan = RS.buildBringRoutesToTopDispatchPlan(
            [{ id: 'route-layer-0' }, { id: 'route-layer-1' }],
            layers
        );
        expect(plan.shouldRun).toBe(true);
        expect(plan.layerIds).toEqual(['route-layer-0', 'route-layer-1']);
        expect(plan.beforeId).toBe('label');
        expect(plan.maxRetries).toBe(5);
    });

    test('buildBringRoutesToTopExecutePlan wraps dispatch with retry metadata', () => {
        const plan = RS.buildBringRoutesToTopExecutePlan(
            [{ id: 'route-layer-0' }],
            [{ type: 'symbol', layout: { 'text-field': 'x' }, id: 'label' }]
        );
        expect(plan.shouldExecute).toBe(true);
        expect(plan.layerIds).toEqual(['route-layer-0']);
        expect(plan.beforeId).toBe('label');
        expect(plan.maxRetries).toBe(5);
        expect(plan.ensureLabelsOnTopAfterSuccess).toBe(true);
        expect(plan.successLogMessage).toContain('successfully positioned');
        expect(RS.buildBringRoutesToTopExecutePlan([], []).shouldExecute).toBe(false);
    });

    test('buildBringRoutesToTopRetryOutcomePlan schedules retry then partial failure', () => {
        expect(RS.buildBringRoutesToTopRetryOutcomePlan({
            allFound: true,
            ensureLabelsOnTopAfterSuccess: true,
        })).toEqual({
            action: 'success',
            logSuccess: true,
            ensureLabelsOnTop: true,
        });
        const retry = RS.buildBringRoutesToTopRetryOutcomePlan({
            allFound: false,
            retryCount: 1,
            maxRetries: 5,
        });
        expect(retry.action).toBe('retry');
        expect(retry.nextRetryCount).toBe(2);
        expect(retry.retryDelayMs).toBeGreaterThan(0);
        expect(RS.buildBringRoutesToTopRetryOutcomePlan({
            allFound: false,
            retryCount: 5,
            maxRetries: 5,
        }).action).toBe('partial_failure');
    });

    test('buildBringRoutesToTopStartupPlan chooses immediate or wait_idle', () => {
        expect(RS.buildBringRoutesToTopStartupPlan({ isStyleLoaded: true }).action).toBe('immediate');
        expect(RS.buildBringRoutesToTopStartupPlan({
            isStyleLoaded: false,
            waitForIdleIfStyleNotLoaded: true,
        }).action).toBe('wait_idle');
        expect(RS.buildBringRoutesToTopStartupPlan({
            isStyleLoaded: false,
            waitForIdleIfStyleNotLoaded: false,
        }).action).toBe('skip');
    });

    test('buildBringRoutesToTopLayerPresencePlan tracks missing layer ids', () => {
        const presence = RS.buildBringRoutesToTopLayerPresencePlan(
            ['route-layer-0', 'route-layer-1'],
            { 'route-layer-0': true, 'route-layer-1': false }
        );
        expect(presence.allFound).toBe(false);
        expect(presence.missingLayerIds).toEqual(['route-layer-1']);
    });

    test('buildRouteLayerMapLibreApplyPlan maps mount plan to MapLibre layer spec', () => {
        const mount = RS.buildRouteLayerMountPlan(
            { name: 'Fastest', polyline: [[51.5, -0.1], [51.6, -0.2]] },
            0,
            0
        );
        const apply = RS.buildRouteLayerMapLibreApplyPlan(mount, 'label-layer');
        expect(apply.valid).toBe(true);
        expect(apply.layerId).toBe('route-layer-0');
        expect(apply.paint.lineColor).toBeTruthy();
        expect(apply.beforeId).toBe('label-layer');
    });

    test('buildDoAddRouteLayersBatchPlan returns reverse-order apply layers', () => {
        const batch = RS.buildDoAddRouteLayersBatchPlan(
            [
                { name: 'A', polyline: [[1, 2], [3, 4]] },
                { name: 'B', polyline: [[5, 6], [7, 8]] },
            ],
            1,
            [{ type: 'symbol', layout: { 'text-field': 'x' }, id: 'labels' }]
        );
        expect(batch.layers).toHaveLength(2);
        expect(batch.layers[0].routeIndex).toBe(1);
        expect(batch.layers[1].routeIndex).toBe(0);
    });

    test('buildDoAddRouteLayersBatchExecutePlan adds log metadata per layer step', () => {
        const batch = RS.buildDoAddRouteLayersBatchPlan(
            [{ name: 'Fast', polyline: [[51.5, -0.1], [51.6, -0.2]] }],
            0,
            [{ type: 'symbol', layout: { 'text-field': 'x' }, id: 'labels' }]
        );
        const execute = RS.buildDoAddRouteLayersBatchExecutePlan(batch);
        expect(execute.layerCount).toBe(1);
        expect(execute.layerSteps[0].valid).toBe(true);
        expect(execute.layerSteps[0].startLogMessage).toContain('Fast');
        expect(execute.layerSteps[0].successLogMessage).toContain('route-layer-0');
    });

    test('buildRouteLayerMapLibreMountExecutePlan wraps valid apply plan', () => {
        const mount = RS.buildRouteLayerMountPlan(
            { name: 'Fast', polyline: [[51.5, -0.1], [51.6, -0.2]] },
            0,
            0
        );
        const apply = RS.buildRouteLayerMapLibreApplyPlan(mount, 'label-layer');
        apply.routeIndex = 0;
        const execute = RS.buildRouteLayerMapLibreMountExecutePlan(apply);
        expect(execute.shouldMount).toBe(true);
        expect(execute.layerId).toBe('route-layer-0');
        expect(execute.registerLayerHandle).toBe(true);
        expect(RS.buildRouteLayerMapLibreMountExecutePlan({ valid: false }).shouldMount).toBe(false);
    });

    test('buildEnsureLabelsOnTopDispatchPlan collects text symbol layer ids', () => {
        const plan = RS.buildEnsureLabelsOnTopDispatchPlan([
            { id: 'route-layer-0', type: 'line' },
            { id: 'road-label', type: 'symbol', layout: { 'text-field': 'name' } },
        ]);
        expect(plan.shouldRun).toBe(true);
        expect(plan.labelLayerIds).toEqual(['road-label']);
        expect(plan.debounceMs).toBe(RS.ENSURE_LABELS_ON_TOP_DEBOUNCE_MS);
    });

    test('buildBringTrafficEdgesToTopDispatchPlan orders traffic layers before labels', () => {
        const plan = RS.buildBringTrafficEdgesToTopDispatchPlan(
            [{ id: 'traffic-edge-0' }],
            [{ id: 'labels', type: 'symbol', layout: { 'text-field': 'name' } }]
        );
        expect(plan.shouldRun).toBe(true);
        expect(plan.layerIds).toEqual(['traffic-edge-0']);
        expect(plan.beforeId).toBe('labels');
    });

    test('buildBringNavRouteAboveTrafficEdgesDispatchPlan dedupes route line ids', () => {
        const plan = RS.buildBringNavRouteAboveTrafficEdgesDispatchPlan(
            { id: 'nav-route', outlineId: 'nav-route-outline' },
            [{ id: 'route-layer-0' }, { id: 'route-layer-0' }],
            [{ id: 'labels', type: 'symbol', layout: { 'text-field': 'name' } }]
        );
        expect(plan.shouldRun).toBe(true);
        expect(plan.layerIds).toEqual(['nav-route-outline', 'nav-route', 'route-layer-0']);
    });

    test('buildBringTrafficEdgesToTopExecutePlan wraps dispatch with log messages', () => {
        const plan = RS.buildBringTrafficEdgesToTopExecutePlan(
            [{ id: 'traffic-edge-0' }],
            [{ id: 'labels', type: 'symbol', layout: { 'text-field': 'name' } }]
        );
        expect(plan.shouldExecute).toBe(true);
        expect(plan.successLogMessage).toContain('Traffic edge');
        expect(plan.useWarnOnError).toBe(false);
    });

    test('buildBringNavRouteAboveTrafficEdgesExecutePlan warns on errors', () => {
        const plan = RS.buildBringNavRouteAboveTrafficEdgesExecutePlan(
            { id: 'nav-route' },
            [],
            [{ id: 'labels', type: 'symbol', layout: { 'text-field': 'name' } }]
        );
        expect(plan.shouldExecute).toBe(true);
        expect(plan.useWarnOnError).toBe(true);
        expect(plan.successLogMessage).toContain('nav-route');
    });

    test('buildEnsureLabelsOnTopExecutePlan debounces label layer moves', () => {
        const plan = RS.buildEnsureLabelsOnTopExecutePlan([
            { id: 'labels', type: 'symbol', layout: { 'text-field': 'name' } },
        ]);
        expect(plan.shouldExecute).toBe(true);
        expect(plan.debounceMs).toBeGreaterThan(0);
        expect(plan.movedLogMessage).toContain('label layers');
        expect(RS.buildEnsureLabelsOnTopExecutePlan([]).shouldExecute).toBe(false);
    });

    test('buildEnsureLabelsOnTopOrchestrationPlan guards missing map', () => {
        expect(RS.buildEnsureLabelsOnTopOrchestrationPlan({ hasMap: false }).shouldRun).toBe(false);
        const orch = RS.buildEnsureLabelsOnTopOrchestrationPlan({
            hasMap: true,
            styleLayers: [{ id: 'labels', type: 'symbol', layout: { 'text-field': 'name' } }],
        });
        expect(orch.shouldRun).toBe(true);
        expect(orch.styleLayers).toHaveLength(1);
    });

    test('buildEnsureLabelsOnTopApplyPlan combines orchestration and debounce apply', () => {
        const apply = RS.buildEnsureLabelsOnTopApplyPlan({
            hasMap: true,
            styleLayers: [{ id: 'labels', type: 'symbol', layout: { 'text-field': 'name' } }],
        });
        expect(apply.shouldApply).toBe(true);
        expect(apply.clearExistingTimer).toBe(true);
        expect(apply.labelLayerIds).toEqual(['labels']);
        expect(RS.buildEnsureLabelsOnTopApplyPlan({ hasMap: false }).shouldApply).toBe(false);
        expect(RS.buildEnsureLabelsOnTopApplyPlan({
            hasMap: true,
            styleLayers: [],
        }).noLabelsLogMessage).toContain('No label layers');
    });

    test('buildBringTrafficEdgesToTopOrchestrationPlan guards map and empty layers', () => {
        expect(RS.buildBringTrafficEdgesToTopOrchestrationPlan({
            hasMap: false,
            trafficLayers: [{ id: 'traffic-edge-0' }],
        }).shouldRun).toBe(false);
        expect(RS.buildBringTrafficEdgesToTopOrchestrationPlan({
            hasMap: true,
            trafficLayers: [],
        }).shouldRun).toBe(false);
        const orch = RS.buildBringTrafficEdgesToTopOrchestrationPlan({
            hasMap: true,
            trafficLayers: [{ id: 'traffic-edge-0' }],
        });
        expect(orch.shouldRun).toBe(true);
        expect(orch.trafficLayers).toHaveLength(1);
    });

    test('buildBringNavRouteAboveTrafficEdgesOrchestrationPlan guards missing map', () => {
        expect(RS.buildBringNavRouteAboveTrafficEdgesOrchestrationPlan({
            hasMap: false,
        }).shouldRun).toBe(false);
        const orch = RS.buildBringNavRouteAboveTrafficEdgesOrchestrationPlan({
            hasMap: true,
            routeLayer: { id: 'nav-route' },
            allRouteLayers: [{ id: 'route-layer-0' }],
        });
        expect(orch.shouldRun).toBe(true);
        expect(orch.routeLayer.id).toBe('nav-route');
    });

    test('buildMapLayerReorderApplyPlan wraps execute plan with missing-layer logging', () => {
        const apply = RS.buildMapLayerReorderApplyPlan({
            shouldExecute: true,
            layerIds: ['traffic-edge-0'],
            beforeId: 'labels',
            ensureLabelsOnTop: true,
        });
        expect(apply.shouldApply).toBe(true);
        expect(apply.logMissingLayers).toBe(true);
        expect(RS.buildMapLayerReorderApplyPlan({ shouldExecute: false }).shouldApply).toBe(false);
    });
});

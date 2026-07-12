/**
 * Tests for modules/navigation/waypoints.js
 */
const W = require('../modules/navigation/waypoints.js');

describe('waypoints module', () => {
    test('buildWaypointsListHtml returns empty state when no points', () => {
        expect(W.buildWaypointsListHtml([], [])).toContain('No waypoints yet');
    });

    test('buildWaypointsListHtml includes via and stop items with drag handlers', () => {
        const html = W.buildWaypointsListHtml(
            [{ name: 'Via 1' }],
            [{ name: 'Stop A', duration: 10 }]
        );
        expect(html).toContain('Via 1');
        expect(html).toContain('Stop A (10 min)');
        expect(html).toContain('ondragstart="onWaypointDragStart(event)"');
        expect(html).toContain('Total stop time');
    });

    test('buildMultiDropItineraryHtml renders legs and total summary', () => {
        const html = W.buildMultiDropItineraryHtml(
            {
                optimized: true,
                legs: [
                    { distance_km: 5, duration_minutes: 12, eta: '2026-07-11T14:30:00Z' },
                    { distance_km: 3, duration_minutes: 8, stop: { name: 'Coffee', duration_minutes: 5, time_window_ok: true } },
                ],
                total_distance_km: 8,
                total_duration_minutes: 25,
                total_stop_time_minutes: 5,
                round_trip: true,
            },
            {
                distUnit: 'mi',
                totalDistanceText: '4.97',
                legDistanceTexts: ['3.11', '1.86'],
                formatEtaClock: () => '14:30',
            }
        );
        expect(html).toContain('Route Itinerary (Optimized)');
        expect(html).toContain('Leg 1');
        expect(html).toContain('Coffee');
        expect(html).toContain('Round trip');
        expect(html).toContain('incl. 5 min stops');
    });

    test('MULTIDROP_LEG_COLORS has distinct palette entries', () => {
        expect(W.MULTIDROP_LEG_COLORS.length).toBeGreaterThanOrEqual(5);
        expect(W.MULTIDROP_LEG_COLORS[0]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('map marker HTML builders include remove handlers', () => {
        expect(W.buildRouteDragMarkerHtml()).toContain('cursor: grab');
        expect(W.buildViaPointMarkerHtml(2)).toContain('>2<');
        expect(W.buildViaPointDragAddedMarkerHtml()).toContain('✓');
        expect(W.buildStopMarkerHtml()).toContain('🅿️');
        expect(W.buildViaPointPopupHtml('Via A', 'removeViaPoint(0)')).toContain('removeViaPoint(0)');
        expect(W.buildViaPointDragPopupHtml('removeViaPoint(1)')).toContain('Drag to adjust');
        expect(W.buildStopPopupHtml('Coffee', 15, 'removeStop(0)')).toContain('15 min');
    });

    test('buildMultiDropItineraryMountPlan returns null without legs', () => {
        expect(W.buildMultiDropItineraryMountPlan(null, {})).toBeNull();
        expect(W.buildMultiDropItineraryMountPlan({ legs: null }, {})).toBeNull();
    });

    test('buildMultiDropItineraryMountPlan builds append HTML and draw flag', () => {
        const plan = W.buildMultiDropItineraryMountPlan(
            {
                legs: [{ distance_km: 4, duration_minutes: 10 }],
                total_distance_km: 4,
                all_geometry: ['geom1'],
            },
            {
                distUnit: 'mi',
                convertDistance: (km) => (km * 0.621371).toFixed(2),
            }
        );
        expect(plan.appendHtml).toContain('Leg 1');
        expect(plan.shouldDrawLegs).toBe(true);
    });

    test('buildMultiDropLegLayerDescriptor decodes geometry for map layers', () => {
        const decode = jest.fn(() => [[51.5, -0.1], [51.6, -0.2]]);
        const desc = W.buildMultiDropLegLayerDescriptor('encoded', 1, { geometry_precision: 6 }, decode);
        expect(desc.layerId).toBe('multidrop-leg-1');
        expect(desc.coordinates).toEqual([[-0.1, 51.5], [-0.2, 51.6]]);
        expect(desc.lineColor).toBe(W.MULTIDROP_LEG_COLORS[1]);
        expect(W.buildMultiDropLegLayerDescriptor('', 0, null, decode)).toBeNull();
    });

    test('buildRouteEditMarkersPlan spaces markers along route path', () => {
        const routePath = Array.from({ length: 40 }, (_, i) => [51.5 + i * 0.001, -0.1]);
        const plan = W.buildRouteEditMarkersPlan(routePath);
        expect(plan.valid).toBe(true);
        expect(plan.markers.length).toBeGreaterThan(0);
        expect(plan.markers[0].routeIndex).toBeGreaterThanOrEqual(W.ROUTE_EDIT_MARKER_INTERVAL_MIN);
    });

    test('buildRouteDragMarkerMountPlan includes marker html and anchor', () => {
        const mount = W.buildRouteDragMarkerMountPlan(51.5, -0.1, 12);
        expect(mount.className).toBe('route-drag-marker');
        expect(mount.markerHtml).toContain('FF9800');
        expect(mount.routeIndex).toBe(12);
        expect(mount.draggable).toBe(true);
        expect(mount.dragEndAction).toBe('addDraggedViaPoint');
    });

    test('buildRouteDragMarkerApplyPlan wraps mount and drag-end wiring', () => {
        const apply = W.buildRouteDragMarkerApplyPlan(51.5, -0.1, 8);
        expect(apply.shouldMount).toBe(true);
        expect(apply.routeIndex).toBe(8);
        expect(apply.markerMount.draggable).toBe(true);
        expect(apply.dragEndAction).toBe('addDraggedViaPoint');
        expect(apply.registerInRouteDragMarkers).toBe(true);
    });

    test('buildRouteDragMarkerDragEndDispatchPlan validates coordinates', () => {
        const ok = W.buildRouteDragMarkerDragEndDispatchPlan(51.5, -0.1);
        expect(ok.shouldAddViaPoint).toBe(true);
        expect(ok.dragEndAction).toBe('addDraggedViaPoint');
        expect(W.buildRouteDragMarkerDragEndDispatchPlan('bad', null).shouldAddViaPoint).toBe(false);
    });

    test('buildDraggedViaPointAddPlan prepares via point and recalc status', () => {
        const plan = W.buildDraggedViaPointAddPlan(51.5, -0.1, 2);
        expect(plan.viaPoint.name).toBe('Drag point 3');
        expect(plan.marker.removeOnclick).toBe('removeViaPoint(2)');
        expect(plan.recalculateRoute).toBe(true);
    });

    test('buildDraggedViaPointApplyPlan wraps marker mount and side effects', () => {
        const apply = W.buildDraggedViaPointApplyPlan(51.5, -0.1, 1);
        expect(apply.viaPoint.name).toBe('Drag point 2');
        expect(apply.markerMount.markerHtml).toContain('4CAF50');
        expect(apply.markerMount.popupHtml).toContain('removeViaPoint(1)');
        expect(apply.clearRouteDragMarkers).toBe(true);
        expect(apply.recalculateRoute).toBe(true);
    });

    test('buildRouteEditingToggleDomApplyPlan maps edit button label', () => {
        const dom = W.buildRouteEditingToggleDomApplyPlan(true);
        expect(dom.elementId).toBe(W.ROUTE_EDIT_TOGGLE_ELEMENT_ID);
        expect(dom.active).toBe(true);
        expect(dom.text).toContain('Editing');
    });

    test('buildToggleRouteEditingOrchestrationPlan disables with clear markers', () => {
        const disable = W.buildToggleRouteEditingOrchestrationPlan({ currentlyEnabled: true });
        expect(disable.action).toBe('disable');
        expect(disable.disableRouteEditing).toBe(true);
        expect(W.buildToggleRouteEditingOrchestrationPlan({ currentlyEnabled: false }).action).toBe('enable');
    });

    test('buildRouteEditEnableExecutePlan wraps marker mount plans', () => {
        const execute = W.buildRouteEditEnableExecutePlan({
            valid: true,
            markers: [{ lat: 1, lon: 2, routeIndex: 5 }],
            statusMessage: 'ok',
            statusType: 'info',
        });
        expect(execute.shouldEnable).toBe(true);
        expect(execute.markers).toHaveLength(1);
        expect(W.buildRouteEditEnableExecutePlan({ valid: false, statusMessage: 'bad' }).shouldEnable).toBe(false);
        expect(W.buildClearRouteDragMarkersExecutePlan().disableRouteEditing).toBe(true);
        expect(W.buildClearRouteDragMarkersApplyPlan().removeAllMarkers).toBe(true);
    });

    test('buildViaPointAddPlan prepares marker label and status', () => {
        const plan = W.buildViaPointAddPlan(51.5, -0.1, null, 1);
        expect(plan.viaPoint.name).toBe('Via-point 2');
        expect(plan.marker.label).toBe(2);
        expect(plan.marker.removeOnclick).toBe('removeViaPoint(1)');
        expect(plan.statusType).toBe('success');
    });

    test('buildViaPointApplyPlan wraps marker mount html and popup', () => {
        const apply = W.buildViaPointApplyPlan(51.5, -0.1, 'Custom', 0);
        expect(apply.viaPoint.name).toBe('Custom');
        expect(apply.markerMount.markerHtml).toContain('1');
        expect(apply.markerMount.popupHtml).toContain('Custom');
        expect(apply.updateWaypointsList).toBe(true);
    });

    test('buildViaPointRemovePlan rejects invalid index and refreshes markers', () => {
        expect(W.buildViaPointRemovePlan(-1, 2).shouldRemove).toBe(false);
        const plan = W.buildViaPointRemovePlan(0, 2);
        expect(plan.shouldRemove).toBe(true);
        expect(plan.refreshMarkers).toBe(true);
    });

    test('buildViaPointRemoveApplyPlan skips single marker removal when refreshing', () => {
        const apply = W.buildViaPointRemoveApplyPlan(0, 2);
        expect(apply.shouldRemove).toBe(true);
        expect(apply.removeSingleMarker).toBe(false);
        expect(apply.removeMarkerAtIndex).toBeNull();
        expect(apply.refreshMarkers).toBe(true);
        expect(W.buildViaPointRemoveApplyPlan(-1, 2).shouldRemove).toBe(false);
    });

    test('buildViaPointMarkersRefreshPlan renumbers markers after removal', () => {
        const plan = W.buildViaPointMarkersRefreshPlan([
            { lat: 51.5, lon: -0.1, name: 'Via A' },
            { lat: 51.6, lon: -0.2, name: 'Via B' },
        ]);
        expect(plan.markers).toHaveLength(2);
        expect(plan.markers[1].label).toBe(2);
        expect(plan.markers[1].removeOnclick).toBe('removeViaPoint(1)');
    });

    test('buildViaPointMarkersRefreshApplyPlan prebuilds marker html and popup', () => {
        const apply = W.buildViaPointMarkersRefreshApplyPlan([
            { lat: 51.5, lon: -0.1, name: 'Via A' },
        ]);
        expect(apply.shouldRefresh).toBe(true);
        expect(apply.removeAllExistingMarkers).toBe(true);
        expect(apply.markers[0].markerHtml).toContain('1');
        expect(apply.markers[0].popupHtml).toContain('Via A');
    });

    test('buildStopAddPlan and buildStopRemovePlan mirror via-point patterns', () => {
        const add = W.buildStopAddPlan(51.5, -0.1, 'Coffee', 20, 0);
        expect(add.stop.duration).toBe(20);
        expect(add.marker.removeOnclick).toBe('removeStop(0)');
        expect(add.statusMessage).toContain('Coffee');

        expect(W.buildStopRemovePlan(3, 2).shouldRemove).toBe(false);
        expect(W.buildStopRemovePlan(1, 2).shouldRemove).toBe(true);
    });

    test('buildStopApplyPlan wraps stop marker mount and popup', () => {
        const apply = W.buildStopApplyPlan(51.5, -0.1, 'Coffee', 20, 1);
        expect(apply.stop.name).toBe('Coffee');
        expect(apply.markerMount.markerHtml).toContain('E91E63');
        expect(apply.markerMount.popupHtml).toContain('20 min');
    });

    test('buildStopRemoveApplyPlan removes marker and splices marker array', () => {
        const apply = W.buildStopRemoveApplyPlan(1, 3);
        expect(apply.shouldRemove).toBe(true);
        expect(apply.removeSingleMarker).toBe(true);
        expect(apply.spliceMarkerArray).toBe(true);
        expect(W.buildStopRemoveApplyPlan(5, 2).shouldRemove).toBe(false);
    });

    test('buildClearAllWaypointsPlan clears markers and multidrop layers', () => {
        const plan = W.buildClearAllWaypointsPlan();
        expect(plan.removeAllMarkers).toBe(true);
        expect(plan.clearMultiDropLayers).toBe(true);
        expect(plan.statusMessage).toContain('cleared');
    });

    test('buildClearAllWaypointsApplyPlan resets marker arrays', () => {
        const apply = W.buildClearAllWaypointsApplyPlan();
        expect(apply.shouldClear).toBe(true);
        expect(apply.resetViaMarkerArray).toBe(true);
        expect(apply.resetStopMarkerArray).toBe(true);
        expect(apply.clearMultiDropLayers).toBe(true);
    });

    test('buildWaypointMovePlan and buildWaypointReorderPlan refresh via markers', () => {
        expect(W.buildWaypointMovePlan('via', 0, 1, 2).refreshViaMarkers).toBe(true);
        expect(W.buildWaypointMovePlan('stop', 0, 1, 2).refreshViaMarkers).toBe(false);
        expect(W.buildWaypointMovePlan('via', 0, -1, 2).shouldMove).toBe(false);

        const reorder = W.buildWaypointReorderPlan('via', 0, 1, 2);
        expect(reorder.shouldReorder).toBe(true);
        expect(reorder.refreshViaMarkers).toBe(true);
        expect(W.buildWaypointReorderPlan('via', 1, 1, 2).shouldReorder).toBe(false);
    });

    test('buildWaypointMoveApplyPlan skips marker swap when refreshing via markers', () => {
        const viaMove = W.buildWaypointMoveApplyPlan('via', 0, 1, 2);
        expect(viaMove.shouldMove).toBe(true);
        expect(viaMove.swapMarkers).toBe(false);
        expect(viaMove.refreshViaMarkers).toBe(true);
        const stopMove = W.buildWaypointMoveApplyPlan('stop', 0, 1, 2);
        expect(stopMove.swapMarkers).toBe(true);
    });

    test('buildWaypointReorderApplyPlan splices stop markers but refreshes via markers', () => {
        const viaReorder = W.buildWaypointReorderApplyPlan('via', 0, 1, 2);
        expect(viaReorder.spliceMarkers).toBe(false);
        expect(viaReorder.refreshViaMarkers).toBe(true);
        const stopReorder = W.buildWaypointReorderApplyPlan('stop', 0, 1, 2);
        expect(stopReorder.spliceMarkers).toBe(true);
    });

    test('buildWaypointAddressAddDispatchPlan resolves coords or geocodes query', () => {
        const resolved = W.buildWaypointAddressAddDispatchPlan({
            lat: '51.5',
            lon: '-0.1',
            displayName: 'London',
            query: 'London',
        }, 'via');
        expect(resolved.action).toBe('add_resolved');
        expect(resolved.lat).toBeCloseTo(51.5);

        expect(W.buildWaypointAddressAddDispatchPlan({ query: '' }, 'stop').action).toBe('prompt');
        expect(W.buildWaypointAddressAddDispatchPlan({ query: 'Oxford' }, 'via').action).toBe('geocode');
    });

    test('buildWaypointAddressGeocodeSuccessPlan and failure plan set status', () => {
        expect(W.buildWaypointAddressGeocodeSuccessPlan('via', 'A').statusMessage).toContain('Via-point');
        expect(W.buildWaypointAddressGeocodeFailurePlan().statusType).toBe('error');
    });

    test('buildWaypointAddressResolvedDomApplyPlan clears dataset keys', () => {
        const dom = W.buildWaypointAddressResolvedDomApplyPlan({
            inputId: W.VIA_POINT_ADDRESS_INPUT_ID,
            clearInput: true,
            hideAutocomplete: true,
        });
        expect(dom.clearDatasetKeys).toEqual(['lat', 'lon', 'displayName']);
        expect(dom.hideAutocomplete).toBe(true);
    });

    test('buildWaypointAddressGeocodeOutcomeApplyPlan maps success and failure', () => {
        const success = W.buildWaypointAddressGeocodeOutcomeApplyPlan('via', {
            lat: 51.5,
            lon: -0.1,
            display_name: 'London',
        }, 'London');
        expect(success.shouldAdd).toBe(true);
        expect(success.name).toBe('London');
        const failure = W.buildWaypointAddressGeocodeOutcomeApplyPlan('stop', null, 'Nowhere');
        expect(failure.shouldAdd).toBe(false);
        expect(failure.statusType).toBe('error');
    });

    test('buildAddViaPointTogglePlan and map click dispatch toggle modes', () => {
        const toggle = W.buildAddViaPointTogglePlan(true);
        expect(toggle.buttonId).toBe(W.ADD_VIA_POINT_BTN_ID);
        expect(toggle.mapCursor).toBe('crosshair');
        expect(W.buildMapClickWaypointDispatchPlan({ addingViaPoint: true, lat: 1, lon: 2 }).action)
            .toBe('add_via');
        expect(W.buildMapClickWaypointDispatchPlan({ addingStop: true, lat: 1, lon: 2 }).action)
            .toBe('add_stop');
    });

    test('buildAddViaPointToggleApplyPlan wraps button DOM and map cursor flags', () => {
        const apply = W.buildAddViaPointToggleApplyPlan(true);
        expect(apply.shouldApply).toBe(true);
        expect(apply.buttonDom.elementId).toBe(W.ADD_VIA_POINT_BTN_ID);
        expect(apply.requireMapForCursor).toBe(true);
        expect(W.buildAddStopToggleApplyPlan(false).addingStop).toBe(false);
    });

    test('buildWaypointsListDomApplyPlan targets list container', () => {
        const plan = W.buildWaypointsListDomApplyPlan([{ name: 'Via' }], []);
        expect(plan.containerId).toBe(W.WAYPOINTS_LIST_CONTAINER_ID);
        expect(plan.innerHtml).toContain('Via');
    });

    test('buildWaypointDragStartPlan captures drag state and opacity', () => {
        const plan = W.buildWaypointDragStartPlan('via', 1);
        expect(plan.shouldDrag).toBe(true);
        expect(plan.dragState).toEqual({ type: 'via', index: 1 });
        expect(W.buildWaypointDragStartPlan('', NaN).shouldDrag).toBe(false);
    });

    test('buildWaypointDragEventContextPlan reads dataset from event target', () => {
        const ctx = W.buildWaypointDragEventContextPlan({
            dataset: { type: 'stop', index: '2' },
        });
        expect(ctx.type).toBe('stop');
        expect(ctx.index).toBe(2);
        expect(ctx.dragStartPlan.shouldDrag).toBe(true);
        expect(ctx.dragStartPlan.dragState).toEqual({ type: 'stop', index: 2 });

        const invalid = W.buildWaypointDragEventContextPlan({ dataset: {} });
        expect(invalid.dragStartPlan.shouldDrag).toBe(false);
    });

    test('buildWaypointDragOverPlan sets move drop effect', () => {
        const plan = W.buildWaypointDragOverPlan();
        expect(plan.preventDefault).toBe(true);
        expect(plan.dropEffect).toBe('move');
    });

    test('buildWaypointDropDispatchPlan reorders matching waypoint types', () => {
        const reorder = W.buildWaypointDropDispatchPlan(
            { type: 'via', index: 0 },
            'via',
            1,
            2,
            0
        );
        expect(reorder.action).toBe('reorder');
        expect(reorder.reorderPlan.refreshViaMarkers).toBe(true);

        expect(W.buildWaypointDropDispatchPlan({ type: 'via', index: 0 }, 'stop', 0, 2, 1).action)
            .toBe('none');
    });

    test('buildWaypointDropApplyPlan wraps reorder apply for drag-and-drop', () => {
        const apply = W.buildWaypointDropApplyPlan(
            { type: 'via', index: 0 },
            'via',
            1,
            2,
            0
        );
        expect(apply.action).toBe('reorder');
        expect(apply.reorder.shouldReorder).toBe(true);
        expect(apply.reorder.spliceMarkers).toBe(false);
        expect(W.buildWaypointDropApplyPlan(null, 'via', 0, 2, 1).resetOpacity).toBe(true);
    });

    test('buildMultiDropLegsMapApplyPlan builds layer specs from geometry', () => {
        const decode = jest.fn(() => [[51.5, -0.1], [51.6, -0.2]]);
        const plan = W.buildMultiDropLegsMapApplyPlan({
            all_geometry: ['geom'],
            legs: [{ geometry_precision: 6 }],
        }, decode);
        expect(plan.shouldDraw).toBe(true);
        expect(plan.layers[0].layerId).toBe('multidrop-leg-0');
        expect(plan.layers[0].lineOpacity).toBe(0.85);
    });

    test('buildMultiDropLegsMapExecutePlan builds MapLibre apply specs', () => {
        const decode = jest.fn(() => [[51.5, -0.1], [51.6, -0.2]]);
        const apply = W.buildMultiDropLegsMapApplyPlan({
            all_geometry: ['geom'],
            legs: [{ geometry_precision: 6 }],
        }, decode);
        const execute = W.buildMultiDropLegsMapExecutePlan(apply);
        expect(execute.shouldExecute).toBe(true);
        expect(execute.layers[0].geoJsonFeature.geometry.type).toBe('LineString');
        expect(execute.layers[0].paint.lineColor).toBeTruthy();
        expect(W.buildMultiDropLegsMapExecutePlan({ shouldDraw: false }).shouldExecute).toBe(false);
    });

    test('buildClearMultiDropLayersPlan enumerates leg layer ids', () => {
        const plan = W.buildClearMultiDropLayersPlan(3);
        expect(plan.layerSpecs).toHaveLength(3);
        expect(plan.layerSpecs[2].sourceId).toBe('multidrop-leg-source-2');
    });

    test('buildClearMultiDropLayersApplyPlan wraps clear layer specs', () => {
        const apply = W.buildClearMultiDropLayersApplyPlan(2);
        expect(apply.shouldClear).toBe(true);
        expect(apply.layerSpecs).toHaveLength(2);
    });

    test('buildDrawMultiDropLegsOrchestrationPlan guards missing map', () => {
        const decode = jest.fn(() => [[51.5, -0.1], [51.6, -0.2]]);
        expect(W.buildDrawMultiDropLegsOrchestrationPlan({
            hasMap: false,
            data: { all_geometry: ['geom'] },
            decodePolyline: decode,
        }).shouldDraw).toBe(false);
        const orch = W.buildDrawMultiDropLegsOrchestrationPlan({
            hasMap: true,
            data: { all_geometry: ['geom'], legs: [{ geometry_precision: 6 }] },
            decodePolyline: decode,
        });
        expect(orch.shouldDraw).toBe(true);
        expect(orch.execute.layers.length).toBeGreaterThan(0);
    });

    test('buildMultiDropLegsDisplayDomApplyPlan appends itinerary to waypoints list', () => {
        const plan = W.buildMultiDropLegsDisplayDomApplyPlan({
            legs: [{ distance_km: 4, duration_minutes: 10 }],
            total_distance_km: 4,
            all_geometry: ['geom1'],
        }, {
            distUnit: 'mi',
            convertDistance: (km) => (km * 0.621371).toFixed(2),
        });
        expect(plan.shouldDisplay).toBe(true);
        expect(plan.containerId).toBe(W.WAYPOINTS_LIST_CONTAINER_ID);
        expect(plan.appendHtml).toContain('Leg 1');
        expect(plan.shouldDrawLegs).toBe(true);
        expect(W.buildMultiDropLegsDisplayDomApplyPlan(null, {}).shouldDisplay).toBe(false);
    });
});

/**
 * @file Via-points, stops, draggable route editing, and multi-drop leg orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var routeDragMarkers = [];
    var routeEditingEnabled = false;
    var viaPoints = [];
    var stops = [];
    var viaPointMarkers = [];
    var stopMarkers = [];
    var addingViaPoint = false;
    var addingStop = false;
    var _draggedWaypoint = null;

    function rt() {
        if (!runtime) {
            throw new Error('[Waypoints] Orchestration runtime not bound');
        }
        return runtime;
    }

    function WP() { return rt().waypoints(); }
    function DH() { return rt().domHelpers(); }
    function RS() { return rt().routeSelection(); }

/**
 * Enable route editing by adding draggable waypoints along the route
 */
function applyRouteEditEnableFromPlan(runtimeApply) {
    if (!runtimeApply || !runtimeApply.shouldApply) {
        if (runtimeApply && runtimeApply.errorStatusMessage) {
            rt().call.showStatus(runtimeApply.errorStatusMessage, runtimeApply.statusType);
        }
        return;
    }

    routeEditingEnabled = runtimeApply.routeEditingEnabled;
    if (runtimeApply.clearMarkersBeforeMount) clearRouteDragMarkers();

    (runtimeApply.markers || []).forEach((markerPlan) => {
        addRouteDragMarker(markerPlan.lat, markerPlan.lon, markerPlan.routeIndex);
    });

    rt().call.showStatus(runtimeApply.statusMessage, runtimeApply.statusType);
    console.log(runtimeApply.addedLogPrefix + routeDragMarkers.length + runtimeApply.addedLogSuffix);
}

function enableRouteEditing() {
    const orch = WP().buildRouteEditEnableOrchestrationPlan(rt().getRoutePolyline());
    applyRouteEditEnableFromPlan(orch.runtimeApply);
}

/**
 * Add a draggable marker for route editing
 */
function applyRouteDragMarkerFromPlan(apply) {
    if (!apply || !apply.shouldMount) return;

    const marker = rt().getMapLibreHelpers().createMarker(apply.lat, apply.lon, {
        className: apply.markerMount.className,
        html: apply.markerMount.markerHtml,
        iconSize: apply.markerMount.iconSize,
        iconAnchor: apply.markerMount.iconAnchor,
        draggable: apply.markerMount.draggable,
    }).addTo(rt().getMap());

    const el = marker.getElement();
    if (el && apply.cursorStyle) {
        el.style.cursor = apply.cursorStyle;
    }

    marker.routeIndex = apply.routeIndex;
    marker.originalLat = apply.originalLat;
    marker.originalLon = apply.originalLon;

    if (apply.markerMount.draggable && typeof marker.on === 'function') {
        marker.on(apply.dragEndEvent, () => {
            const lngLat = marker.getLngLat && marker.getLngLat();
            const dispatch = WP().buildRouteDragMarkerDragEndDispatchPlan(
                lngLat ? lngLat.lat : null,
                lngLat ? lngLat.lng : null
            );
            if (dispatch.shouldAddViaPoint && dispatch.dragEndAction === apply.dragEndAction) {
                addDraggedViaPoint(dispatch.lat, dispatch.lon);
            }
        });
    }

    if (apply.registerInRouteDragMarkers) routeDragMarkers.push(marker);
}

function addRouteDragMarker(lat, lon, routeIndex) {
    applyRouteDragMarkerFromPlan(
        WP().buildRouteDragMarkerEntryOrchestrationPlan(lat, lon, routeIndex).apply
    );
}

/**
 * Add a via-point from route dragging and recalculate
 */
async function applyDraggedViaPointFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    viaPoints.push(apply.viaPoint);

    const marker = rt().getMapLibreHelpers().createMarker(apply.lat, apply.lon, {
        className: apply.markerMount.className,
        html: apply.markerMount.markerHtml,
        iconSize: apply.markerMount.iconSize,
        iconAnchor: apply.markerMount.iconAnchor,
        popup: apply.markerMount.popupHtml,
    }).addTo(rt().getMap());

    viaPointMarkers.push(marker);
    if (apply.updateWaypointsList) updateWaypointsList();
    if (apply.clearRouteDragMarkers) clearRouteDragMarkers();
    rt().call.showStatus(apply.statusMessage, apply.statusType);
    if (apply.recalculateRoute) await rt().call.calculateRoute();
}

async function addDraggedViaPoint(lat, lon) {
    await applyDraggedViaPointFromPlan(
        WP().buildDraggedViaPointOrchestrationPlan(lat, lon, viaPoints.length).apply
    );
}

/**
 * Clear all route drag markers
 */
function clearRouteDragMarkers() {
    const apply = WP().buildClearRouteDragMarkersApplyPlan();
    if (!apply.shouldClear) return;

    if (apply.removeAllMarkers) {
        routeDragMarkers.forEach(marker => {
            if (marker && typeof marker.remove === 'function') {
                marker.remove();
            }
        });
        routeDragMarkers = [];
    }
    if (apply.disableRouteEditing) routeEditingEnabled = false;
}

/**
 * Toggle route editing mode
 */
function applyRouteEditingToggleDomFromPlan(domPlan) {
    if (!domPlan) return;
    const btn = document.getElementById(domPlan.elementId);
    if (!btn) return;
    btn.classList.toggle('active', domPlan.active);
    btn.textContent = domPlan.text;
}

function applyToggleRouteEditingDisableFromPlan(disableApply) {
    if (!disableApply || !disableApply.shouldApply) return;

    if (disableApply.clearRouteDragMarkers) clearRouteDragMarkers();
    else if (disableApply.disableRouteEditing) routeEditingEnabled = false;
    rt().call.showStatus(disableApply.statusMessage, disableApply.statusType);
}

function toggleRouteEditing() {
    const WP = WP();
    const entryApply = WP.buildToggleRouteEditingEntryApplyPlan(
        WP.buildToggleRouteEditingOrchestrationPlan({ currentlyEnabled: routeEditingEnabled })
    );
    if (!entryApply.shouldToggle) return;

    if (entryApply.action === 'disable') {
        applyToggleRouteEditingDisableFromPlan(entryApply.disableApply);
    } else {
        enableRouteEditing();
    }

    if (entryApply.updateToggleDom) {
        applyRouteEditingToggleDomFromPlan(
            WP.buildRouteEditingToggleDomApplyPlan(routeEditingEnabled)
        );
    }
}


/**
 * Apply waypoint map-pick toggle UI from a pure apply plan.
 * @param {Object} apply - from buildAddViaPointToggleApplyPlan or buildAddStopToggleApplyPlan
 */
function applyWaypointMapPickToggleFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    addingViaPoint = apply.addingViaPoint;
    addingStop = apply.addingStop;

    const btn = document.getElementById(apply.buttonDom.elementId);
    if (btn) {
        btn.classList.toggle('active', apply.buttonDom.active);
        btn.textContent = apply.buttonDom.text;
    }

    if (apply.statusMessage) {
        rt().call.showStatus(apply.statusMessage, apply.statusType);
    }

    if (apply.requireMapForCursor && rt().getMap() && typeof rt().getMap().getContainer === 'function') {
        rt().getMap().getContainer().style.cursor = apply.mapCursor;
    }
}

/**
 * Toggle via-point adding mode
 */
function toggleAddViaPoint() {
    applyWaypointMapPickToggleFromPlan(
        WP().buildAddViaPointToggleApplyPlan(!addingViaPoint)
    );
}

/**
 * Toggle stop adding mode
 */
function toggleAddStop() {
    applyWaypointMapPickToggleFromPlan(
        WP().buildAddStopToggleApplyPlan(!addingStop)
    );
}

/**
 * Handle map click for adding via-points or stops
 */
function applyMapClickWaypointFromPlan(apply) {
    if (!apply || apply.action === 'none') return;

    if (apply.action === 'add_via') {
        addViaPoint(apply.lat, apply.lon);
        if (apply.toggleOffVia) toggleAddViaPoint();
    } else if (apply.action === 'add_stop') {
        addStop(apply.lat, apply.lon);
        if (apply.toggleOffStop) toggleAddStop();
    }
}

function handleMapClickForWaypoints(e) {
    applyMapClickWaypointFromPlan(
        WP().buildMapClickWaypointEntryOrchestrationPlan({
            addingViaPoint,
            addingStop,
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
        }).apply
    );
}

async function addViaPointFromAddress() {
    await addWaypointFromAddress('via');
}

async function addStopFromAddress() {
    await addWaypointFromAddress('stop');
}

/**
 * Apply resolved waypoint address input DOM changes from a pure plan.
 * @param {Object} domPlan - from buildWaypointAddressResolvedDomApplyPlan
 * @param {HTMLInputElement} input
 */
function applyWaypointAddressResolvedDomFromPlan(domPlan, input) {
    if (!domPlan || !input) return;
    if (domPlan.clearInput) input.value = '';
    (domPlan.clearDatasetKeys || []).forEach((key) => {
        delete input.dataset[key];
    });
    if (domPlan.hideAutocomplete) {
        const dd = rt().call.getAutocompleteDropdown(domPlan.inputId);
        if (dd) dd.classList.remove('show');
    }
}

/**
 * Add a via-point or stop from an address input field.
 * @param {'via'|'stop'} waypointKind
 */
async function addWaypointFromAddress(waypointKind) {
    const WP = WP();
    const inputId = waypointKind === 'via'
        ? WP.VIA_POINT_ADDRESS_INPUT_ID
        : WP.STOP_ADDRESS_INPUT_ID;
    const input = document.getElementById(inputId);
    if (!input) return;

    const dispatch = WP.buildWaypointAddressAddDispatchPlan({
        lat: input.dataset.lat,
        lon: input.dataset.lon,
        displayName: input.dataset.displayName,
        query: input.value,
    }, waypointKind);

    if (dispatch.action === 'prompt') {
        rt().call.showStatus(dispatch.statusMessage, dispatch.statusType);
        return;
    }

    if (dispatch.action === 'add_resolved') {
        if (waypointKind === 'via') addViaPoint(dispatch.lat, dispatch.lon, dispatch.name);
        else addStop(dispatch.lat, dispatch.lon, dispatch.name);
        applyWaypointAddressResolvedDomFromPlan(
            WP.buildWaypointAddressResolvedDomApplyPlan(dispatch),
            input
        );
        return;
    }

    rt().call.showStatus(dispatch.loadingMessage, 'loading');
    const result = await rt().call.geocodeAddress(dispatch.query);
    const outcome = WP.buildWaypointAddressGeocodeOutcomeApplyPlan(
        waypointKind,
        result,
        dispatch.query
    );
    if (outcome.shouldAdd) {
        if (waypointKind === 'via') addViaPoint(outcome.lat, outcome.lon, outcome.name);
        else addStop(outcome.lat, outcome.lon, outcome.name);
        if (outcome.clearInput) input.value = '';
    }
    rt().call.showStatus(outcome.statusMessage, outcome.statusType);
}

/**
 * Add a via-point at given coordinates
 */
function applyViaPointFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    viaPoints.push(apply.viaPoint);

    const marker = rt().getMapLibreHelpers().createMarker(apply.lat, apply.lon, {
        className: apply.markerMount.className,
        html: apply.markerMount.markerHtml,
        iconSize: apply.markerMount.iconSize,
        iconAnchor: apply.markerMount.iconAnchor,
        popup: apply.markerMount.popupHtml,
    }).addTo(rt().getMap());

    viaPointMarkers.push(marker);
    if (apply.updateWaypointsList) updateWaypointsList();
    rt().call.showStatus(apply.statusMessage, apply.statusType);
}

function addViaPoint(lat, lon, name = null) {
    applyViaPointFromPlan(
        WP().buildViaPointEntryOrchestrationPlan(lat, lon, name, viaPoints.length).apply
    );
}

/**
 * Add a stop at given coordinates
 */
function applyStopFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    stops.push(apply.stop);

    const marker = rt().getMapLibreHelpers().createMarker(apply.lat, apply.lon, {
        className: apply.markerMount.className,
        html: apply.markerMount.markerHtml,
        iconSize: apply.markerMount.iconSize,
        iconAnchor: apply.markerMount.iconAnchor,
        popup: apply.markerMount.popupHtml,
    }).addTo(rt().getMap());

    stopMarkers.push(marker);
    if (apply.updateWaypointsList) updateWaypointsList();
    rt().call.showStatus(apply.statusMessage, apply.statusType);
}

function addStop(lat, lon, name = null, duration = 15) {
    applyStopFromPlan(
        WP().buildStopEntryOrchestrationPlan(lat, lon, name, duration, stops.length).apply
    );
}

/**
 * Remove a via-point
 */
function applyViaPointRemoveFromPlan(apply) {
    if (!apply || !apply.shouldRemove) return;

    viaPoints.splice(apply.index, 1);
    if (apply.removeSingleMarker && apply.removeMarkerAtIndex != null) {
        const marker = viaPointMarkers[apply.removeMarkerAtIndex];
        if (marker && typeof marker.remove === 'function') {
            marker.remove();
        }
        viaPointMarkers.splice(apply.removeMarkerAtIndex, 1);
    }
    if (apply.updateWaypointsList) updateWaypointsList();
    if (apply.refreshMarkers) refreshViaPointMarkers();
    rt().call.showStatus(apply.statusMessage, apply.statusType);
}

function removeViaPoint(index) {
    applyViaPointRemoveFromPlan(
        WP().buildViaPointRemoveEntryOrchestrationPlan(index, viaPoints.length).apply
    );
}

/**
 * Remove a stop
 */
function applyStopRemoveFromPlan(apply) {
    if (!apply || !apply.shouldRemove) return;

    stops.splice(apply.index, 1);
    if (apply.removeSingleMarker && apply.removeMarkerAtIndex != null) {
        const marker = stopMarkers[apply.removeMarkerAtIndex];
        if (marker && typeof marker.remove === 'function') {
            marker.remove();
        }
        if (apply.spliceMarkerArray) {
            stopMarkers.splice(apply.removeMarkerAtIndex, 1);
        }
    }
    if (apply.updateWaypointsList) updateWaypointsList();
    rt().call.showStatus(apply.statusMessage, apply.statusType);
}

function removeStop(index) {
    applyStopRemoveFromPlan(
        WP().buildStopRemoveEntryOrchestrationPlan(index, stops.length).apply
    );
}

/**
 * Refresh via-point markers (update numbers after removal)
 */
function applyViaPointMarkersRefreshFromPlan(apply) {
    if (!apply || !apply.shouldRefresh) return;

    if (apply.removeAllExistingMarkers) {
        viaPointMarkers.forEach((marker) => {
            if (marker && typeof marker.remove === 'function') {
                marker.remove();
            }
        });
    }
    if (apply.resetMarkerArray) viaPointMarkers = [];

    apply.markers.forEach((spec) => {
        const marker = rt().getMapLibreHelpers().createMarker(spec.lat, spec.lon, {
            className: spec.className,
            html: spec.markerHtml,
            iconSize: spec.iconSize,
            iconAnchor: spec.iconAnchor,
            popup: spec.popupHtml,
        }).addTo(rt().getMap());

        viaPointMarkers.push(marker);
    });
}

function refreshViaPointMarkers() {
    applyViaPointMarkersRefreshFromPlan(
        WP().buildViaPointMarkersRefreshEntryOrchestrationPlan(viaPoints).apply
    );
}

/**
 * Clear all via-points and stops
 */
function applyClearAllWaypointsFromPlan(apply) {
    if (!apply || !apply.shouldClear) return;

    if (apply.clearViaPoints) viaPoints = [];
    if (apply.clearStops) stops = [];
    if (apply.removeAllMarkers) {
        viaPointMarkers.forEach(m => { if (m && typeof m.remove === 'function') m.remove(); });
        stopMarkers.forEach(m => { if (m && typeof m.remove === 'function') m.remove(); });
    }
    if (apply.resetViaMarkerArray) viaPointMarkers = [];
    if (apply.resetStopMarkerArray) stopMarkers = [];
    if (apply.clearMultiDropLayers) clearMultiDropLayers();
    if (apply.updateWaypointsList) updateWaypointsList();
    rt().call.showStatus(apply.statusMessage, apply.statusType);
}

function clearAllWaypoints() {
    applyClearAllWaypointsFromPlan(
        WP().buildClearAllWaypointsEntryOrchestrationPlan().apply
    );
}

/**
 * Update the waypoints list display with drag-to-reorder
 */
function applyWaypointsListDomFromPlan(apply) {
    if (!apply || !apply.shouldUpdate) return;
    const container = document.getElementById(apply.containerId);
    if (!container) return;
    container.innerHTML = apply.innerHtml;
}

function updateWaypointsList() {
    applyWaypointsListDomFromPlan(
        WP().buildWaypointsListUpdateApplyPlan(viaPoints, stops)
    );
}

function applyWaypointDragStartFromPlan(apply, event) {
    if (!apply || !apply.shouldDrag || !event) return;

    _draggedWaypoint = apply.dragState;
    if (event.target) event.target.style.opacity = apply.itemOpacity;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = apply.dataTransferEffect;
}

function onWaypointDragStart(e) {
    applyWaypointDragStartFromPlan(
        WP().buildWaypointDragStartEntryOrchestrationPlan(e.target).apply,
        e
    );
}

function applyWaypointDragOverFromPlan(apply, event) {
    if (!apply || !apply.shouldHandle || !event) return;
    if (apply.preventDefault) event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = apply.dropEffect;
}

function onWaypointDragOver(e) {
    applyWaypointDragOverFromPlan(
        WP().buildWaypointDragOverEntryOrchestrationPlan().apply,
        e
    );
}

function onWaypointDrop(e) {
    e.preventDefault();
    const target = DH().closest(e.target, '.waypoint-item');
    applyWaypointDropFromPlan(
        WP().buildWaypointDropEntryOrchestrationPlan({
            draggedWaypoint: _draggedWaypoint,
            targetType: target ? target.dataset.type : null,
            targetIndex: target ? parseInt(target.dataset.index, 10) : NaN,
            viaCount: viaPoints.length,
            stopsCount: stops.length,
        }).apply
    );
}

function applyWaypointReorderFromPlan(reorder) {
    if (!reorder || !reorder.shouldReorder) return;

    const arr = reorder.type === 'via' ? viaPoints : stops;
    const markerArr = reorder.type === 'via' ? viaPointMarkers : stopMarkers;
    const item = arr.splice(reorder.fromIndex, 1)[0];
    if (reorder.spliceMarkers) {
        const marker = markerArr.splice(reorder.fromIndex, 1)[0];
        arr.splice(reorder.toIndex, 0, item);
        markerArr.splice(reorder.toIndex, 0, marker);
    } else {
        arr.splice(reorder.toIndex, 0, item);
    }
    if (reorder.updateWaypointsList) updateWaypointsList();
    if (reorder.refreshViaMarkers) refreshViaPointMarkers();
}

function applyWaypointDropFromPlan(apply) {
    if (!apply) return;

    if (apply.action === 'reorder' && apply.reorder) {
        applyWaypointReorderFromPlan(apply.reorder);
    }

    if (apply.clearDragState) _draggedWaypoint = null;
    if (apply.resetOpacity) {
        const resetApply = WP().buildWaypointDragOpacityResetApplyPlan();
        document.querySelectorAll(resetApply.selector).forEach(
            (el) => { el.style.opacity = resetApply.opacity; }
        );
    }
}

function applyWaypointMoveFromPlan(apply) {
    if (!apply || !apply.shouldMove) return;

    const arr = apply.type === 'via' ? viaPoints : stops;
    const markerArr = apply.type === 'via' ? viaPointMarkers : stopMarkers;
    [arr[apply.fromIndex], arr[apply.toIndex]] = [arr[apply.toIndex], arr[apply.fromIndex]];
    if (apply.swapMarkers) {
        [markerArr[apply.fromIndex], markerArr[apply.toIndex]] =
            [markerArr[apply.toIndex], markerArr[apply.fromIndex]];
    }
    if (apply.updateWaypointsList) updateWaypointsList();
    if (apply.refreshViaMarkers) refreshViaPointMarkers();
}

function moveWaypoint(type, index, direction) {
    applyWaypointMoveFromPlan(
        WP().buildWaypointMoveEntryOrchestrationPlan(
            type,
            index,
            direction,
            type === 'via' ? viaPoints.length : stops.length
        ).apply
    );
}

function collectMultiDropLegsDisplayInput(data) {
    return {
        data,
        fmt: {
            distUnit: rt().call.getDistanceUnit(),
            convertDistance: rt().call.convertDistance,
            formatEtaClock: (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
    };
}

function applyMultiDropLegsDisplayFromPlan(apply, data) {
    if (!apply || !apply.shouldDisplay) return;

    const container = document.getElementById(apply.containerId);
    if (!container) return;

    container.innerHTML += apply.appendHtml;

    if (apply.shouldDrawLegs) drawMultiDropLegsOnMap(data);
}

/**
 * Display multi-drop route leg breakdown in the waypoints area
 */
function displayMultiDropLegs(data) {
    const input = collectMultiDropLegsDisplayInput(data);
    applyMultiDropLegsDisplayFromPlan(
        WP().buildMultiDropLegsDisplayEntryOrchestrationPlan(input.data, input.fmt).apply,
        data
    );
}

/**
 * Apply one multi-drop leg layer from a MapLibre apply plan.
 * @param {Object} applyPlan
 * @returns {boolean}
 */
function applyMultiDropLegLayerFromMapLibrePlan(applyPlan) {
    return rt().call.applyMapLibreLineLayerFromMountPlan(
        WP().buildMultiDropLegLayerMountExecutePlan(applyPlan)
    );
}

function applyDrawMultiDropLegsFromPlan(orch) {
    if (!orch || !orch.shouldDraw) return;

    orch.execute.layers.forEach((layerPlan) => {
        applyMultiDropLegLayerFromMapLibrePlan(layerPlan);
    });
}

/**
 * Draw multi-drop route legs on the map with distinct colors per leg
 */
function drawMultiDropLegsOnMap(data) {
    applyDrawMultiDropLegsFromPlan(
        WP().buildDrawMultiDropLegsEntryOrchestrationPlan({
            hasMap: !!rt().getMap(),
            data,
            decodePolyline: rt().call.decodePolyline,
        })
    );
}

function applyClearMultiDropLayersFromPlan(apply) {
    if (!apply || !apply.shouldClear || !map) return;

    apply.layerSpecs.forEach((spec) => {
        if (rt().getMap().getLayer(spec.layerId)) rt().getMap().removeLayer(spec.layerId);
        if (rt().getMap().getSource(spec.sourceId)) rt().getMap().removeSource(spec.sourceId);
    });
}

/**
 * Clear multi-drop leg layers from map
 */
function clearMultiDropLayers() {
    const entry = WP().buildClearMultiDropLayersEntryOrchestrationPlan();
    if (!entry.requiresMap || !rt().getMap()) return;
    applyClearMultiDropLayersFromPlan(entry.apply);
}
    function getOrderedWaypoints(startLat, startLon, endLat, endLon) {
        return RS().orderWaypointsGreedy(
            startLat, startLon, endLat, endLon, viaPoints, stops
        );
    }

    function getViaPoints() { return viaPoints; }
    function getStops() { return stops; }
    function getAddingViaPoint() { return addingViaPoint; }
    function getAddingStop() { return addingStop; }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        getViaPoints: getViaPoints,
        getStops: getStops,
        getAddingViaPoint: getAddingViaPoint,
        getAddingStop: getAddingStop,
        toggleAddViaPoint: toggleAddViaPoint,
        toggleAddStop: toggleAddStop,
        handleMapClickForWaypoints: handleMapClickForWaypoints,
        addViaPointFromAddress: addViaPointFromAddress,
        addStopFromAddress: addStopFromAddress,
        addViaPoint: addViaPoint,
        addStop: addStop,
        removeViaPoint: removeViaPoint,
        removeStop: removeStop,
        clearAllWaypoints: clearAllWaypoints,
        updateWaypointsList: updateWaypointsList,
        onWaypointDragStart: onWaypointDragStart,
        onWaypointDragOver: onWaypointDragOver,
        onWaypointDrop: onWaypointDrop,
        moveWaypoint: moveWaypoint,
        displayMultiDropLegs: displayMultiDropLegs,
        clearMultiDropLayers: clearMultiDropLayers,
        getOrderedWaypoints: getOrderedWaypoints,
        toggleRouteEditing: toggleRouteEditing,
        enableRouteEditing: enableRouteEditing,
        clearRouteDragMarkers: clearRouteDragMarkers,
        addDraggedViaPoint: addDraggedViaPoint,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrWaypointsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Multi-route map display and route comparison/selection orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var allRouteLayers = [];
    var routeOptions = [];
    var selectedRouteIndex = 0;

    function getRouteOptions() { return routeOptions; }
    function setRouteOptions(val) { routeOptions = val; }
    function getSelectedRouteIndex() { return selectedRouteIndex; }
    function setSelectedRouteIndex(val) { selectedRouteIndex = val; }

    function rt() {
        if (!runtime) {
            throw new Error('[RouteComparison] Orchestration runtime not bound');
        }
        return runtime;
    }

    function RS() { return rt().routeSelection(); }

    function MT() { return root.VoyagrMapTheme; }

    function storedMapTheme() {
        var mod = MT();
        return mod && typeof mod.readStoredMapTheme === 'function'
            ? mod.readStoredMapTheme()
            : 'standard';
    }

    function routeColors() {
        var mod = MT();
        if (mod && typeof mod.resolveRouteColorsForTheme === 'function') {
            return mod.resolveRouteColorsForTheme(storedMapTheme(), RS().ROUTE_COLORS);
        }
        return RS().ROUTE_COLORS;
    }

    function navActiveRouteColor() {
        var mod = MT();
        if (mod && typeof mod.resolveNavRouteColorForTheme === 'function') {
            return mod.resolveNavRouteColorForTheme(
                storedMapTheme(),
                RS().NAV_ACTIVE_ROUTE_COLOR
            );
        }
        return RS().NAV_ACTIVE_ROUTE_COLOR;
    }

function applyBringRoutesToTopFromPlan(plan) {
    const map = rt().getMap();
    if (!plan || !plan.shouldExecute || !map) return;

    const routeSel = RS();

    const moveLayersToTop = (retryCount = 0) => {
        const presentById = {};
        plan.layerIds.forEach((layerId) => {
            presentById[layerId] = !!map.getLayer(layerId);
        });

        const step = routeSel.buildBringRoutesToTopRetryStepApplyPlan(plan, retryCount, presentById);
        console.log(step.attemptLog.attemptLogMessage, step.attemptLog.layerIds);

        try {
            step.layerMoves.forEach((spec) => {
                if (spec.moveLog.found) {
                    map.moveLayer(spec.layerId, plan.beforeId);
                    if (spec.moveLog.movedLogMessage) console.log(spec.moveLog.movedLogMessage);
                } else if (spec.moveLog.notFoundLogMessage) {
                    console.log(spec.moveLog.notFoundLogMessage);
                }
            });

            const outcome = step.outcome;
            if (outcome.action === 'retry') {
                setTimeout(() => moveLayersToTop(outcome.nextRetryCount), outcome.retryDelayMs);
            } else if (outcome.action === 'success') {
                if (outcome.logSuccess && step.successLogMessage) console.log(step.successLogMessage);
                if (outcome.ensureLabelsOnTop) rt().call.ensureLabelsOnTop();
            } else if (outcome.logPartialFailure && step.partialFailureLogMessage) {
                console.warn(step.partialFailureLogMessage);
            }
        } catch (e) {
            const prefix = step.errorLogPrefix || '[Routes] Error bringing routes to top:';
            console.warn(prefix, e);
        }
    };

    const schedule = routeSel.buildBringRoutesToTopStartupScheduleApplyPlan(plan, {
        isStyleLoaded: map.isStyleLoaded(),
    });
    if (!schedule.shouldSchedule) return;

    setTimeout(() => {
        if (schedule.startup.action === 'immediate') {
            moveLayersToTop(0);
        } else if (schedule.startup.action === 'wait_idle') {
            if (schedule.startup.waitForIdleLogMessage) {
                console.log(schedule.startup.waitForIdleLogMessage);
            }
            map.once('idle', () => moveLayersToTop(0));
        }
    }, schedule.startup.initialDelayMs);
}
function clearAllRouteLayersFromMap() {
    const map = rt().getMap();
    if (!map) return;

    try {
        const style = map.getStyle();
        const plan = RS().buildClearAllRouteLayersFromMapPlan(style);
        if (!plan.hasArtifacts) return;

        plan.layerIds.forEach((layerId) => {
            try {
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
            } catch (e) {
                console.warn(`${plan.layerErrorLogPrefix}${layerId}:`, e.message);
            }
        });

        plan.sourceIds.forEach((sourceId) => {
            try {
                if (map.getSource(sourceId)) {
                    map.removeSource(sourceId);
                }
            } catch (e) {
                console.warn(`${plan.sourceErrorLogPrefix}${sourceId}:`, e.message);
            }
        });

        if (plan.successLogMessage) console.log(plan.successLogMessage);
    } catch (e) {
        console.error('[Routes] Error clearing route layers:', e);
    }
}

/**
 * Clear in-memory route layer handles from a pre-mount plan.
 * @param {Object} plan - from buildDisplayAllRoutesMapPreMountPlan
 */
function clearRouteLayerHandlesFromPlan(plan) {
    if (!plan) return;
    if (plan.clearRouteLayerHandle && rt().getRouteLayer() && typeof rt().getRouteLayer().remove === 'function') {
        rt().getRouteLayer().remove();
        rt().setRouteLayer(null);
    }
    if (plan.clearAllRouteLayerHandles) {
        allRouteLayers.forEach((layer) => {
            if (layer && typeof layer.remove === 'function') {
                layer.remove();
            }
        });
        allRouteLayers = [];
    }
}

/**
 * Mount one MapLibre line layer from a mount execute plan.
 * @param {Object} mountPlan
 * @param {Object} [opts]
 * @returns {boolean}
 */
function applyMapLibreLineLayerFromMountPlan(mountPlan, opts) {
    const map = rt().getMap();
    opts = opts || {};
    if (!mountPlan || !mountPlan.shouldMount || !map) return false;

    try {
        const { layerId, sourceId } = mountPlan;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        map.addSource(sourceId, {
            type: 'geojson',
            data: mountPlan.geoJsonFeature,
        });

        const lineWidth = mountPlan.paint.lineWeight != null
            ? mountPlan.paint.lineWeight
            : mountPlan.paint.lineWidth;

        map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: mountPlan.layerLayout,
            paint: {
                'line-color': mountPlan.paint.lineColor,
                'line-width': rt().getMapLibreHelpers().buildZoomScaledLineWidth(lineWidth),
                'line-opacity': mountPlan.paint.lineOpacity,
            },
        }, mountPlan.beforeId);

        if (mountPlan.registerLayerHandle) {
            allRouteLayers.unshift({
                id: layerId,
                remove: () => {
                    if (map.getLayer(layerId)) map.removeLayer(layerId);
                    if (map.getSource(sourceId)) map.removeSource(sourceId);
                },
            });
        }
        return true;
    } catch (e) {
        if (mountPlan.errorLogMessage) {
            console.error(mountPlan.errorLogMessage, e);
        } else {
            const prefix = mountPlan.errorLogPrefix || '[Map] Failed to draw line layer ';
            const suffix = mountPlan.legIndex != null ? mountPlan.legIndex : '';
            console.warn(`${prefix}${suffix}:`, e);
        }
        return false;
    }
}

/**
 * Schedule route layer mounting based on a style-load schedule apply plan.
 * @param {Object} schedule - from buildDisplayAllRoutesMapStyleLoadScheduleApplyPlan
 * @param {Function} addRouteLayersFn
 */
function applyDisplayAllRoutesStyleLoadScheduleFromPlan(schedule, addRouteLayersFn) {
    const map = rt().getMap();
    if (!schedule || !schedule.shouldApply || schedule.strategy === 'immediate') {
        addRouteLayersFn();
        return;
    }

    if (schedule.waitLogMessage) console.log(schedule.waitLogMessage);
    map.once('style.load', addRouteLayersFn);
    setTimeout(() => {
        if (schedule.runFallbackOnlyIfNoLayers && allRouteLayers.length === 0) {
            if (schedule.fallbackLogMessage) console.log(schedule.fallbackLogMessage);
            addRouteLayersFn();
        }
    }, schedule.fallbackTimeoutMs);
}

/**
 * Apply post-mount side effects after doAddRouteLayers.
 * @param {Object} plan - from buildDoAddRouteLayersPostMountExecutePlan
 */
function applyDoAddRouteLayersPostMountFromPlan(plan) {
    if (!plan) return;
    const map = rt().getMap();

    if (plan.fitBounds) {
        rt().getMapLibreHelpers().fitMapBounds(
            map,
            plan.fitBounds.coords,
            { padding: plan.fitBounds.padding }
        );
    }

    if (plan.displayAllRouteHazards) {
        rt().call.displayAllRouteHazards();
    }

    if (plan.ensureTomTomTrafficLayer) {
        rt().call.addTrafficLayer();
    }

    if (plan.bringRoutesToTop) {
        bringRoutesToTop();
    }

    if (plan.debugInspectRouteLayers) {
        setTimeout(() => {
            const style = map.getStyle();
            if (style && style.layers) {
                const routeLayers = style.layers.filter((l) => l.id.startsWith('route-layer-'));
                console.log(plan.debugLogPrefix,
                    routeLayers.map((l) => ({ id: l.id, color: l.paint?.['line-color'] })));
            }
        }, plan.debugInspectDelayMs);
    }

    if (plan.completionLogMessage) console.log(plan.completionLogMessage);
}

/**
 * Apply displaySingleRoute side effects from a pure execute plan.
 * @param {Object} plan - from buildSingleRouteMapDisplayExecutePlan
 */
function applySingleRouteMapDisplayFromPlan(plan) {
    const map = rt().getMap();
    if (!plan || !plan.shouldExecute) return;

    if (plan.clearAllRouteLayers) {
        clearAllRouteLayersFromMap();
    }

    const polylinePoints = plan.polyline.points || [];
    if (polylinePoints.length > 0) {
        const layer = rt().getMapLibreHelpers().addPolyline(map, polylinePoints, {
            color: plan.polyline.color,
            weight: plan.polyline.weight,
            opacity: plan.polyline.opacity,
        });

        allRouteLayers.push(layer);
        rt().getMapLibreHelpers().fitMapBounds(map, polylinePoints, { padding: plan.polyline.fitBoundsPadding });
    }

    if (plan.hazards.action === 'show') {
        rt().call.displayHazardMarkers(plan.hazards.list);
    } else {
        rt().call.clearHazardMarkers();
    }

    if (plan.ensureTomTomTrafficLayer) {
        rt().call.addTrafficLayer();
    }

    if (plan.routeTraffic.enabled) {
        rt().setRoutePolyline(plan.routeTraffic.polylinePoints);
        rt().call.fetchAndDisplayRouteTraffic();
    }

    const tl = plan.trafficLights;
    if (tl.polylinePoints.length > 0) {
        const plotRouteTrafficLights =
            (typeof window !== 'undefined' &&
             window.TrafficLights &&
             typeof window.TrafficLights.plotTrafficLightsOnRoute === 'function')
                ? window.TrafficLights.plotTrafficLightsOnRoute
                : (typeof plotTrafficLightsOnRoute === 'function' ? plotTrafficLightsOnRoute : null);

        if (window.TrafficLights && typeof window.TrafficLights.clearAllTrafficLights === 'function') {
            if (tl.action === 'clear') {
                window.TrafficLights.clearAllTrafficLights();
            }
        }

        if (tl.action === 'plot' && plotRouteTrafficLights) {
            console.log(plan.plotTrafficLightsLogMessage);
            plotRouteTrafficLights(tl.polylinePoints);
        } else if (tl.hasOsmTlsInHazards) {
            console.log(plan.skipDuplicatePlotLogMessage);
        } else if (!plotRouteTrafficLights) {
            console.warn(plan.moduleUnavailableLogMessage);
        }
    }

    if (plan.logLine) console.log(plan.logLine);
}

/**
 * Display all routes on map with different colors
 * @function displayAllRoutesOnMap
 * @returns {void}
 */
function collectDisplayAllRoutesOnMapInput() {
    const map = rt().getMap();
    return {
        routeOptions: getRouteOptions(),
        isStyleLoaded: map && map.isStyleLoaded && map.isStyleLoaded(),
    };
}

function displayAllRoutesOnMap() {
    const input = collectDisplayAllRoutesOnMapInput();
    const entry = RS().buildDisplayAllRoutesMapEntryOrchestrationPlan(
        input.routeOptions,
        { isStyleLoaded: input.isStyleLoaded }
    );
    applyDisplayAllRoutesOnMapFromPlan(entry.apply);
}

function applyDisplayAllRoutesOnMapFromPlan(apply) {
    const map = rt().getMap();
    if (!apply || !apply.shouldApply) {
        if (apply && apply.noRoutesLogMessage) console.warn(apply.noRoutesLogMessage);
        if (apply && apply.entryLogMessage) {
            console.log(apply.entryLogMessage);
            console.log(apply.routeCountLogPrefix, apply.routeCount, 'routes');
        }
        return;
    }

    console.log(apply.entryLogMessage);
    console.log(apply.routeCountLogPrefix, apply.routeCount, 'routes');

    const mount = apply.mount;
    applyDisplayAllRoutesPreMountFromPlan(mount.preMountApply);

    if (mount.requireMap && !map) {
        console.error(mount.mapMissingLogMessage);
        return;
    }

    applyDisplayAllRoutesStyleLoadScheduleFromPlan(mount.styleSchedule, () => {
        if (mount.addLayersLogMessage) console.log(mount.addLayersLogMessage);
        doAddRouteLayers();
    });
}

function applyDisplayAllRoutesPreMountFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    clearRouteLayerHandlesFromPlan(apply);
    if (apply.clearMapRouteLayers) {
        clearAllRouteLayersFromMap();
    }
    if (apply.hydratePolylines) {
        RS().hydrateRouteOptionPolylines(getRouteOptions(), rt().call.decodePolyline);
    }
}

/**
 * Actually add route layers to the map (called after style is loaded)
 */
/**
 * Apply one route line layer from a MapLibre apply plan.
 * @param {Object} applyPlan
 * @returns {boolean}
 */
function applyRouteLayerFromMapLibrePlan(applyPlan) {
    const map = rt().getMap();
    return applyMapLibreLineLayerFromMountPlan(
        RS().buildRouteLayerMapLibreMountExecutePlan(applyPlan)
    );
}

/**
 * Apply a doAddRouteLayers batch execute plan.
 * @param {Object} executePlan - from buildDoAddRouteLayersBatchExecutePlan
 */
function applyDoAddRouteLayersBatchFromPlan(executePlan) {
    if (!executePlan) return;

    (executePlan.layerSteps || []).forEach((step) => {
        if (step.startLogMessage) console.log(step.startLogMessage);
        if (!step.valid) {
            if (step.invalidLogMessage) console.error(step.invalidLogMessage);
            return;
        }
        if (step.drawLogMessage) console.log(step.drawLogMessage);
        if (applyRouteLayerFromMapLibrePlan(step.applyPlan) && step.successLogMessage) {
            console.log(step.successLogMessage);
        }
    });
}

function applyDoAddRouteLayersFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    applyDoAddRouteLayersBatchFromPlan(apply.batchExecute);
    applyDoAddRouteLayersPostMountFromPlan(apply.postMount);
}

function collectDoAddRouteLayersInput() {
    const map = rt().getMap();
    const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
    const mapTheme = storedMapTheme();
    return {
        routeOptions: getRouteOptions(),
        selectedRouteIndex: getSelectedRouteIndex(),
        styleLayers: style && style.layers ? style.layers : [],
        mapTheme: mapTheme,
        routeColors: routeColors(),
        showTrafficEnabled: rt().getShowTrafficEnabled(),
        hasTrafficLayer: !!rt().getTrafficLayer(),
        mountedLayerCount: allRouteLayers.length,
    };
}

function doAddRouteLayers() {
    applyDoAddRouteLayersFromPlan(
        RS().buildDoAddRouteLayersEntryOrchestrationPlan(
            collectDoAddRouteLayersInput()
        ).apply
    );
}

function applyBringRoutesToTopEntryFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    const map = rt().getMap();
    if (apply.entryLogPrefix != null) {
        console.log(apply.entryLogPrefix, apply.layerCount);
    }
    if (apply.requiresMap && !map) {
        if (apply.mapMissingLogMessage) console.warn(apply.mapMissingLogMessage);
        return;
    }
    applyBringRoutesToTopFromPlan(apply.execute);
}

function collectBringRoutesToTopInput() {
    const map = rt().getMap();
    const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
    return {
        layerCount: allRouteLayers?.length || 0,
        layerDescriptors: allRouteLayers,
        styleLayers: style && style.layers ? style.layers : null,
    };
}

/**
 * Bring all route layers to the top of the map rendering order
 * This ensures routes are visible above traffic edges and other overlays
 * NOTE: Routes are now inserted before symbol layers by default (via beforeId parameter),
 * so this function primarily ensures routes are above traffic/weather layers
 */
function bringRoutesToTop() {
    const routeSel = RS();
    const input = collectBringRoutesToTopInput();
    applyBringRoutesToTopEntryFromPlan(
        routeSel.buildBringRoutesToTopEntryApplyPlan(
            routeSel.buildBringRoutesToTopEntryOrchestrationPlan(input)
        )
    );
}
function applyRouteComparisonListDomFromPlan(domPlan) {
    if (!domPlan) return;
    const listContainer = document.getElementById(domPlan.containerId || 'routeComparisonList');
    if (!listContainer) return;
    listContainer.innerHTML = domPlan.innerHtml;
}

function applyDisplayRouteComparisonFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    applyRouteComparisonListDomFromPlan(apply.domPlan);
}

function collectDisplayRouteComparisonInput() {
    const routes = getRouteOptions() || [];
    return {
        routes,
        selectedRouteIndex: getSelectedRouteIndex(),
        routeColors: routeColors(),
        currencySymbol: rt().call.getCurrencySymbol(),
        distUnit: rt().call.getDistanceUnit(),
        distanceTexts: routes.map((route) => rt().call.convertDistance(route.distance_km)),
    };
}

/**
 * displayRouteComparison function - Shows distinct route types with hazard counts
 * @function displayRouteComparison
 * @returns {void}
 */
function displayRouteComparison() {
    applyDisplayRouteComparisonFromPlan(
        RS().buildDisplayRouteComparisonEntryOrchestrationPlan(
            collectDisplayRouteComparisonInput()
        ).apply
    );
}

function applySelectRouteFromPlan(apply, index) {
    if (!apply || !apply.shouldApply) return;

    setSelectedRouteIndex(apply.selectedRouteIndex);

    if (apply.displaySingleRoute) displaySingleRoute(index);
    if (apply.displayRouteComparison) displayRouteComparison();

    if (apply.syncLastCalculatedRoute) syncLastCalculatedRouteFromSelection(index);
    console.log(
        `${apply.logPrefix} "${apply.routeName}" with ${apply.maneuverCount} maneuvers`
    );

    if (apply.updateTripInfo) updateTripInfoFromRouteOption(apply.selectedRoute);

    if (apply.showRoutePreview && apply.preview && apply.preview.shouldPreview) {
        rt().call.showRoutePreview(apply.preview.previewPayload, true);
    }
}

function collectSelectRouteInput(index) {
    return {
        index,
        routeOptions: getRouteOptions(),
        lastRouteApiResponse: window.lastRouteApiResponse,
    };
}

/**
 * selectRoute function - shows only the selected route and hides others
 * @function selectRoute
 * @param {number} index - Route index to select
 */
function selectRoute(index) {
    const orch = RS().buildSelectRouteEntryOrchestrationPlan(
        collectSelectRouteInput(index)
    );
    applySelectRouteFromPlan(orch.apply, index);
}

/**
 * Apply formatted trip info values to the navigation panel DOM.
 * @param {Object} display
 */
function applyTripInfoDomFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    const distanceEl = document.getElementById(apply.distanceId);
    const timeEl = document.getElementById(apply.timeId);
    const fuelEl = document.getElementById(apply.fuelCostId);
    const tollEl = document.getElementById(apply.tollCostId);
    if (distanceEl) {
        distanceEl.textContent = apply.distanceText;
        distanceEl.dataset.km = apply.distanceKm;
    }
    if (timeEl) timeEl.textContent = apply.durationMinutes + ' min';
    if (fuelEl) {
        fuelEl.textContent = apply.fuelCostText;
        fuelEl.dataset.value = apply.fuelCost;
    }
    if (tollEl) {
        tollEl.textContent = apply.tollCostText;
        tollEl.dataset.value = apply.tollCost;
    }
    if (apply.costLogMessage && apply.costLogPayload) {
        console.log(apply.costLogMessage, apply.costLogPayload);
    }
}

/**
 * Update navigation tab distance/time/cost from a route option object.
 * @param {Object} route
 */
function updateTripInfoFromRouteOption(route) {
    if (!route) return;
    const orch = RS().buildTripInfoUpdateFromRouteOrchestrationPlan(route, {
        distanceText: rt().call.convertDistance(route.distance_km),
        distUnit: rt().call.getDistanceUnit(),
        currencySymbol: rt().call.getCurrencySymbol(),
    });
    if (!orch.shouldUpdate) return;
    applyTripInfoDomFromPlan(orch.apply);
}

function collectUseRouteInput(index) {
    const traffic = rt().call.getTrafficSettingsSnapshot();
    return {
        index,
        routeOptions: getRouteOptions(),
        routeTrafficEnabled: traffic.routeTrafficEnabled,
    };
}

function collectDisplaySingleRouteRuntime() {
    const traffic = rt().call.getTrafficSettingsSnapshot();
    return {
        displayOpts: {
            routeColors: routeColors(),
            showTrafficEnabled: rt().getShowTrafficEnabled(),
            routeTrafficEnabled: traffic.routeTrafficEnabled,
            hasTrafficLayer: !!rt().getTrafficLayer(),
            trafficLightsEnabled: window.TrafficLights && typeof window.TrafficLights.isEnabled === 'function' && window.TrafficLights.isEnabled(),
            trafficLightsPlotAvailable: (window.TrafficLights && typeof window.TrafficLights.plotTrafficLightsOnRoute === 'function')
                || typeof plotTrafficLightsOnRoute === 'function',
        },
    };
}

function applyDisplaySingleRouteFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;

    console.log(apply.entryLogMessage);
    clearRouteLayerHandlesFromPlan(apply.preClear);
    applySingleRouteMapDisplayFromPlan(apply.execute);
}

function collectDisplaySingleRouteInput(index) {
    return {
        index,
        routeOptions: getRouteOptions(),
        runtime: collectDisplaySingleRouteRuntime(),
    };
}

/**
 * Display only a single route on the map
 * @param {number} index - Route index to display
 */
function displaySingleRoute(index) {
    const orch = RS().buildDisplaySingleRouteEntryOrchestrationPlan(
        collectDisplaySingleRouteInput(index)
    );
    applyDisplaySingleRouteFromPlan(orch.apply);
}

/**
 * Show all routes on the map (called by "Show All Routes" button)
 */
function applyShowAllRoutesFromPlan(apply) {
    if (!apply || !apply.shouldApply) return;
    if (apply.displayAllRoutes) displayAllRoutesOnMap();
    rt().call.showStatus(apply.statusMessage, apply.statusType);
}

function showAllRoutes() {
    applyShowAllRoutesFromPlan(
        RS().buildShowAllRoutesEntryOrchestrationPlan(
            (function () { var ro = getRouteOptions(); return ro ? ro.length : 0; })()
        ).apply
    );
}

function applyUseRouteFromPlan(apply, index) {
    if (!apply || !apply.shouldApply) return;

    setSelectedRouteIndex(apply.selectedRouteIndex);
    if (apply.syncLastCalculatedRoute) syncLastCalculatedRouteFromSelection(index);
    if (apply.updateTripInfo) updateTripInfoFromRouteOption(apply.route);

    if (apply.previewTraffic) {
        rt().setRoutePolyline(apply.previewPolyline);
        rt().call.fetchAndDisplayRouteTraffic();
    }

    rt().call.showStatus(apply.statusMessage, apply.statusType);
}

/**
 * useRoute function
 * @function useRoute
 * @param {*} index - Parameter description
 * @returns {*} Return value description
 */
function useRoute(index) {
    const orch = RS().buildUseRouteEntryOrchestrationPlan(
        collectUseRouteInput(index)
    );
    applyUseRouteFromPlan(orch.apply, index);
}
function syncLastCalculatedRouteFromSelection(index) {
    if (!getRouteOptions() || !getRouteOptions()[index]) return;
    window.lastCalculatedRoute = RS().mergeLastCalculatedRouteFromSelection(
        window.lastCalculatedRoute,
        getRouteOptions()[index]
    );
}
    function getAllRouteLayers() {
        return allRouteLayers;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        routeColors: routeColors,
        navActiveRouteColor: navActiveRouteColor,
        getAllRouteLayers: getAllRouteLayers,
        applyBringRoutesToTopFromPlan: applyBringRoutesToTopFromPlan,
        clearAllRouteLayersFromMap: clearAllRouteLayersFromMap,
        clearRouteLayerHandlesFromPlan: clearRouteLayerHandlesFromPlan,
        applyMapLibreLineLayerFromMountPlan: applyMapLibreLineLayerFromMountPlan,
        applyDisplayAllRoutesStyleLoadScheduleFromPlan: applyDisplayAllRoutesStyleLoadScheduleFromPlan,
        applyDoAddRouteLayersPostMountFromPlan: applyDoAddRouteLayersPostMountFromPlan,
        applySingleRouteMapDisplayFromPlan: applySingleRouteMapDisplayFromPlan,
        collectDisplayAllRoutesOnMapInput: collectDisplayAllRoutesOnMapInput,
        displayAllRoutesOnMap: displayAllRoutesOnMap,
        applyDisplayAllRoutesOnMapFromPlan: applyDisplayAllRoutesOnMapFromPlan,
        applyDisplayAllRoutesPreMountFromPlan: applyDisplayAllRoutesPreMountFromPlan,
        applyRouteLayerFromMapLibrePlan: applyRouteLayerFromMapLibrePlan,
        applyDoAddRouteLayersBatchFromPlan: applyDoAddRouteLayersBatchFromPlan,
        applyDoAddRouteLayersFromPlan: applyDoAddRouteLayersFromPlan,
        collectDoAddRouteLayersInput: collectDoAddRouteLayersInput,
        doAddRouteLayers: doAddRouteLayers,
        applyBringRoutesToTopEntryFromPlan: applyBringRoutesToTopEntryFromPlan,
        collectBringRoutesToTopInput: collectBringRoutesToTopInput,
        bringRoutesToTop: bringRoutesToTop,
        applyRouteComparisonListDomFromPlan: applyRouteComparisonListDomFromPlan,
        applyDisplayRouteComparisonFromPlan: applyDisplayRouteComparisonFromPlan,
        collectDisplayRouteComparisonInput: collectDisplayRouteComparisonInput,
        displayRouteComparison: displayRouteComparison,
        applySelectRouteFromPlan: applySelectRouteFromPlan,
        collectSelectRouteInput: collectSelectRouteInput,
        selectRoute: selectRoute,
        applyTripInfoDomFromPlan: applyTripInfoDomFromPlan,
        updateTripInfoFromRouteOption: updateTripInfoFromRouteOption,
        collectUseRouteInput: collectUseRouteInput,
        collectDisplaySingleRouteRuntime: collectDisplaySingleRouteRuntime,
        applyDisplaySingleRouteFromPlan: applyDisplaySingleRouteFromPlan,
        collectDisplaySingleRouteInput: collectDisplaySingleRouteInput,
        displaySingleRoute: displaySingleRoute,
        applyShowAllRoutesFromPlan: applyShowAllRoutesFromPlan,
        showAllRoutes: showAllRoutes,
        applyUseRouteFromPlan: applyUseRouteFromPlan,
        useRoute: useRoute,
        syncLastCalculatedRouteFromSelection: syncLastCalculatedRouteFromSelection,
        getRouteOptions: getRouteOptions,
        setRouteOptions: setRouteOptions,
        getSelectedRouteIndex: getSelectedRouteIndex,
        setSelectedRouteIndex: setSelectedRouteIndex,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteComparisonOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
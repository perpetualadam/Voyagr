/**
 * @file Multi-route map display and route comparison/selection orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var allRouteLayers = [];
    var previewMountGeneration = 0;
    const previewBatchTokens = new WeakSet();
    const previewHandleTokens = new WeakMap();
    const previewResourceOwners = new WeakMap();
    const previewCleanupInProgress = new WeakSet();
    var routeOptions = [];
    var selectedRouteIndex = 0;

    function getRouteOptions() { return routeOptions; }
    function setRouteOptions(val) {
        if (!allowSelectionWrite()) { allowPreviewMutation(); return false; }
        routeOptions = val; return true;
    }
    function getSelectedRouteIndex() { return selectedRouteIndex; }
    function setSelectedRouteIndex(val) {
        if (!allowSelectionWrite()) { allowPreviewMutation(); return false; }
        selectedRouteIndex = val; return true;
    }

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

function applyBringRoutesToTopFromPlan(plan, batchToken) {
    const map = rt().getMap();
    if (!plan || !plan.shouldExecute || !map) return;

    const batch=batchToken===undefined ? null : capturePreviewBatch(batchToken);
    const current=()=>batchToken===undefined || previewBatchCurrent(batch);
    const routeSel = RS();

    const moveLayersToTop = (retryCount = 0) => {
        if (!current()) return;
        const presentById = {};
        plan.layerIds.forEach((layerId) => {
            presentById[layerId] = !!map.getLayer(layerId);
        });

        const step = routeSel.buildBringRoutesToTopRetryStepApplyPlan(plan, retryCount, presentById);
        console.log(step.attemptLog.attemptLogMessage, step.attemptLog.layerIds);

        try {
            step.layerMoves.forEach((spec) => {
                if (!current()) return;
                if (spec.moveLog.found) {
                    map.moveLayer(spec.layerId, plan.beforeId);
                    if (spec.moveLog.movedLogMessage) console.log(spec.moveLog.movedLogMessage);
                } else if (spec.moveLog.notFoundLogMessage) {
                    console.log(spec.moveLog.notFoundLogMessage);
                }
            });

            if (!current()) return;
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
        if (!current()) return;
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
function capturePreviewBatch(token) {
    if (token !== undefined) return previewBatchTokens.has(token) ? token : null;
    const batch=Object.freeze({map:rt().getMap(),generation:previewMountGeneration});
    previewBatchTokens.add(batch);return batch;
}

function previewBatchCurrent(batch) {
    try {
        return !!runtime && !!batch && previewBatchTokens.has(batch) &&
            typeof runtime.getMap==='function' && batch.map===runtime.getMap() &&
            batch.generation===previewMountGeneration && knownInactiveLifecycle();
    } catch (_) {return false;}
}

function resourceOwners(map) {
    let owners=previewResourceOwners.get(map);
    if (!owners) {owners=new Map();previewResourceOwners.set(map,owners);}
    return owners;
}

function ownsPreviewResource(handle,kind,id) {
    const token=previewHandleTokens.get(handle);
    const owner=resourceOwners(handle._map).get(kind+':'+id);
    return !!token && !!owner && owner.handle===handle && owner.token===token &&
        owner.token.generation===handle._generation;
}

function forgetPreviewHandle(handle) {
    // Always edit the live list by identity. A renderer callback may have
    // installed an entirely new list while a removal was running.
    allRouteLayers=allRouteLayers.filter(layer=>layer!==handle);
}

function previewResourcesReleased(handle) {
    return !ownsPreviewResource(handle,'layer',handle.id) && !ownsPreviewResource(handle,'source',handle.sourceId);
}

function removePreviewResources(handle) {
    if (previewCleanupInProgress.has(handle)) return false;
    previewCleanupInProgress.add(handle);
    try {
        const map=handle._map;
        for (const [kind,id] of [['layer',handle.id],['source',handle.sourceId]]) {
            if (!ownsPreviewResource(handle,kind,id)) continue;
            const read=kind==='layer' ? ()=>map.getLayer(id) : ()=>map.getSource(id);
            const remove=kind==='layer' ? ()=>map.removeLayer(id) : ()=>map.removeSource(id);
            try {
                const present=read();
                // Recheck immediately before mutation, not merely before reading
                // an ID. Reentrant cleanup may have transferred that ID already.
                if (present && ownsPreviewResource(handle,kind,id)) remove();
            } catch (_) { /* Actual ownership/resource state is checked below. */ }
            // A successor owns its own resources. Obsolete cleanup cannot clear
            // that successor's slot, delete its resource, or declare it orphaned.
            if (ownsPreviewResource(handle,kind,id)) {
                try { if (!read() && ownsPreviewResource(handle,kind,id)) resourceOwners(map).delete(kind+':'+id); }
                catch (_) { /* Retain unresolved ownership. */ }
            }
        }
        const released=previewResourcesReleased(handle);
        if (released) {handle._added=false;forgetPreviewHandle(handle);}
        return released;
    } finally {previewCleanupInProgress.delete(handle);}
}

function removeComparisonHandle(handle) {
    if (previewHandleTokens.has(handle)) return removePreviewResources(handle);
    handle.remove();
    return rt().getMapLibreHelpers().isPolylineLayerRemoved(rt().getMap(),handle)===true;
}

function clearAllRouteLayersFromMap() {
    // Ownership, not a route-like identifier, grants permission to remove.
    return clearRouteLayerHandlesFromPlan({clearRouteLayerHandle:true,clearAllRouteLayerHandles:true});
}

function clearRouteLayerHandlesFromPlan(plan) {
    if (!allowPreviewMutation()) return false;
    const generation=++previewMountGeneration;
    if (!plan) return true;
    const owned=rt().getRouteLayer();
    if (plan.clearRouteLayerHandle && owned) {
        try {
            owned.remove();
            if (rt().getMapLibreHelpers().isPolylineLayerRemoved(rt().getMap(),owned) !== true) throw new Error('Resources remain');
            if (rt().getRouteLayer()===owned) rt().setRouteLayer(null);
        } catch (_) {
            try {rt().call.showStatus('Preview map cleanup failed; previous resources retained for recovery.','error');} catch (_) { /* retain ownership */ }
            return false;
        }
    }
    if (generation!==previewMountGeneration) return false;
    if (plan.clearAllRouteLayerHandles && clearComparisonRouteLayers() !== true) return false;
    return true;
}

/**
 * Mount one MapLibre line layer from a mount execute plan.
 * @param {Object} mountPlan
 * @param {Object} [opts]
 * @returns {boolean}
 */
function applyMapLibreLineLayerFromMountPlan(mountPlan, opts) {
    if (!allowPreviewMutation()) return false;
    const map = rt().getMap();
    opts = opts || {};
    if (!mountPlan || !mountPlan.shouldMount || !map) return false;

    const batch=capturePreviewBatch(opts.batchToken);
    if (!previewBatchCurrent(batch)) return false;
    const {layerId,sourceId} = mountPlan;
    const helpers=rt().getMapLibreHelpers();
    let handle,cleanupBlocked=false;
    try {
        const previous=allRouteLayers.find(layer=>layer && layer._map===map && layer.id===layerId && layer.sourceId===sourceId);
        if (previous) {
            if (previous.remove() !== true) {cleanupBlocked=true;throw new Error('Previous preview resources remain');}
            forgetPreviewHandle(previous);
        }
        if (!previewBatchCurrent(batch)) throw new Error('Preview batch revoked');
        // A coincident ID is not authority to remove another owner's resources.
        if (map.getLayer(layerId) || map.getSource(sourceId)) throw new Error('Map resource ID already owned');
        if (resourceOwners(map).has('layer:'+layerId) || resourceOwners(map).has('source:'+sourceId)) throw new Error('Unresolved preview owner');
        handle={id:layerId,sourceId:sourceId,_map:map,_added:false,remove:()=>removePreviewResources(handle)};
        Object.defineProperty(handle,'_generation',{value:batch.generation,enumerable:true});
        previewHandleTokens.set(handle,batch);
        resourceOwners(map).set('layer:'+layerId,{handle,token:batch});
        resourceOwners(map).set('source:'+sourceId,{handle,token:batch});
        allRouteLayers.push(handle);
        const assertOwnership=()=>{
            if(!previewBatchCurrent(batch) || !allRouteLayers.includes(handle) ||
                !ownsPreviewResource(handle,'layer',layerId) || !ownsPreviewResource(handle,'source',sourceId))throw new Error('Preview ownership revoked');
        };
        assertOwnership();
        map.addSource(sourceId,{type:'geojson',data:mountPlan.geoJsonFeature});
        const lineWidth=mountPlan.paint.lineWeight!=null ? mountPlan.paint.lineWeight : mountPlan.paint.lineWidth;
        assertOwnership();
        map.addLayer({id:layerId,type:'line',source:sourceId,layout:mountPlan.layerLayout,paint:{
            'line-color':mountPlan.paint.lineColor,'line-width':helpers.buildZoomScaledLineWidth(lineWidth),
            'line-opacity':mountPlan.paint.lineOpacity,
        }},mountPlan.beforeId);
        assertOwnership();
        if (!map.getLayer(layerId) || !map.getSource(sourceId)) throw new Error('Preview mount incomplete');
        handle._added=true;
        return true;
    } catch (_) {
        const cleaned=handle ? handle.remove() : !cleanupBlocked;
        if (handle && cleaned)forgetPreviewHandle(handle);
        if(handle && !cleaned && !allRouteLayers.includes(handle))allRouteLayers.push(handle);
        // Failed cleanup stays owned so a later start/transition must reconcile it.
        try { if (!cleaned || previewBatchCurrent(batch)) rt().call.showStatus(cleaned ? 'Preview route could not be displayed; no new route selected.' :
            'Preview map cleanup failed. Recover the map before starting navigation.',cleaned ? 'warning' : 'error'); } catch (_) { /* status unavailable never drops ownership */ }
        return false;
    }
}

/**
 * Schedule route layer mounting based on a style-load schedule apply plan.
 * @param {Object} schedule - from buildDisplayAllRoutesMapStyleLoadScheduleApplyPlan
 * @param {Function} addRouteLayersFn
 */
function applyDisplayAllRoutesStyleLoadScheduleFromPlan(schedule, addRouteLayersFn, batchToken) {
    if (!allowPreviewMutation()) return false;
    const map=rt().getMap(),batch=capturePreviewBatch(batchToken);
    const mountCurrent=()=>{
        if (!previewBatchCurrent(batch) || !allowPreviewMutation()) return false;
        return addRouteLayersFn(batch) !== false;
    };
    if (!schedule || !schedule.shouldApply || schedule.strategy==='immediate') return mountCurrent();
    map.once('style.load',mountCurrent);
    setTimeout(()=>{
        if(schedule.runFallbackOnlyIfNoLayers && allRouteLayers.length===0)mountCurrent();
    },schedule.fallbackTimeoutMs);
}

/**
 * Apply post-mount side effects after doAddRouteLayers.
 * @param {Object} plan - from buildDoAddRouteLayersPostMountExecutePlan
 */
function applyDoAddRouteLayersPostMountFromPlan(plan, batchToken) {
    if (!allowPreviewMutation()) return false;
    if (!plan) return;
    const batch=capturePreviewBatch(batchToken);
    if (!previewBatchCurrent(batch)) return false;
    const map = rt().getMap();

    if (plan.fitBounds) {
        rt().getMapLibreHelpers().fitMapBounds(
            map,
            plan.fitBounds.coords,
            { padding: plan.fitBounds.padding }
        );
    }

    if (!previewBatchCurrent(batch)) return false;
    if (plan.displayAllRouteHazards) {
        rt().call.displayAllRouteHazards();
    }

    if (!previewBatchCurrent(batch)) return false;
    if (plan.ensureTomTomTrafficLayer) {
        rt().call.addTrafficLayer();
    }

    if (!previewBatchCurrent(batch)) return false;
    if (plan.bringRoutesToTop) {
        bringRoutesToTop(batch);
    }

    if (!previewBatchCurrent(batch)) return false;
    if (plan.debugInspectRouteLayers) {
        setTimeout(() => {
            if (!previewBatchCurrent(batch)) return;
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
    if (!allowPreviewMutation()) return false;
    const map = rt().getMap();
    if (!plan || !plan.shouldExecute) return;

    if (plan.clearAllRouteLayers) {
        if (clearAllRouteLayersFromMap() === false) return false;
    }

    const batch=capturePreviewBatch();
    const polylinePoints = plan.polyline.points || [];
    if (polylinePoints.length > 0) {
        const layer = rt().getMapLibreHelpers().addPolyline(map, polylinePoints, {
            color: plan.polyline.color,
            weight: plan.polyline.weight,
            opacity: plan.polyline.opacity,
        });

        const helpers=rt().getMapLibreHelpers();
        if (!previewBatchCurrent(batch) || !helpers.isPolylineLayerMountOk(layer)) {
            let cleaned=false;
            try {layer.remove();cleaned=helpers.isPolylineLayerRemoved(map,layer)===true;} catch (_) { /* retain unresolved resources */ }
            if (!cleaned) {
                if(!allRouteLayers.includes(layer))allRouteLayers.push(layer);
                const lifecycle=root.VoyagrNavigationLifecycleOrchestration;
                if(lifecycle && lifecycle.failNavigation)lifecycle.failNavigation('inconsistent_map');
            }
            return false;
        }
        allRouteLayers.push(layer);
        rt().getMapLibreHelpers().fitMapBounds(map, polylinePoints, { padding: plan.polyline.fitBoundsPadding });
    }

    if (!previewBatchCurrent(batch)) return false;
    if (plan.hazards.action === 'show') {
        rt().call.displayHazardMarkers(plan.hazards.list);
    } else {
        rt().call.clearHazardMarkers();
    }

    if (!previewBatchCurrent(batch)) return false;
    if (plan.ensureTomTomTrafficLayer) {
        rt().call.addTrafficLayer();
    }

    if (!previewBatchCurrent(batch)) return false;
    if (plan.routeTraffic.enabled) {
        rt().setRoutePolyline(plan.routeTraffic.polylinePoints);
        if (!previewBatchCurrent(batch)) return false;
        rt().call.fetchAndDisplayRouteTraffic();
    }

    if (!previewBatchCurrent(batch)) return false;
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
            if (!previewBatchCurrent(batch)) return false;
            plotRouteTrafficLights(tl.polylinePoints);
        } else if (tl.hasOsmTlsInHazards) {
            console.log(plan.skipDuplicatePlotLogMessage);
        } else if (!plotRouteTrafficLights) {
            console.warn(plan.moduleUnavailableLogMessage);
        }
    }

    if (plan.logLine) console.log(plan.logLine);
    return previewBatchCurrent(batch);
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
    if (!allowPreviewMutation()) return false;
    const input = collectDisplayAllRoutesOnMapInput();
    const entry = RS().buildDisplayAllRoutesMapEntryOrchestrationPlan(
        input.routeOptions,
        { isStyleLoaded: input.isStyleLoaded }
    );
    return applyDisplayAllRoutesOnMapFromPlan(entry.apply);
}

function applyDisplayAllRoutesOnMapFromPlan(apply) {
    if (!allowPreviewMutation()) return false;
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
    if (applyDisplayAllRoutesPreMountFromPlan(mount.preMountApply) === false) return false;

    if (mount.requireMap && !map) {
        console.error(mount.mapMissingLogMessage);
        return;
    }

    return applyDisplayAllRoutesStyleLoadScheduleFromPlan(mount.styleSchedule, batch => {
        if (mount.addLayersLogMessage) console.log(mount.addLayersLogMessage);
        return doAddRouteLayers(batch);
    });
}

function applyDisplayAllRoutesPreMountFromPlan(apply) {
    if (!allowPreviewMutation()) return false;
    if (!apply || !apply.shouldApply) return;
    if (clearRouteLayerHandlesFromPlan(apply) === false) return false;
    if (apply.clearMapRouteLayers) {
        if (clearAllRouteLayersFromMap() === false) return false;
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
function applyRouteLayerFromMapLibrePlan(applyPlan, batchToken) {
    if (!allowPreviewMutation()) return false;
    const map = rt().getMap();
    return applyMapLibreLineLayerFromMountPlan(
        RS().buildRouteLayerMapLibreMountExecutePlan(applyPlan), {batchToken}
    );
}

/**
 * Apply a doAddRouteLayers batch execute plan.
 * @param {Object} executePlan - from buildDoAddRouteLayersBatchExecutePlan
 */
function applyDoAddRouteLayersBatchFromPlan(executePlan, batchToken) {
    if (!allowPreviewMutation() || !executePlan) return false;
    const batch=capturePreviewBatch(batchToken);
    let complete=true;
    for (const step of executePlan.layerSteps || []) {
        if (!previewBatchCurrent(batch)) return false;
        if (step.startLogMessage) console.log(step.startLogMessage);
        if (!step.valid) {
            complete=false;
            if (step.invalidLogMessage) console.error(step.invalidLogMessage);
            continue;
        }
        if (step.drawLogMessage) console.log(step.drawLogMessage);
        const mounted=applyRouteLayerFromMapLibrePlan(step.applyPlan,batch);
        if (!previewBatchCurrent(batch)) return false;
        if (!mounted)complete=false;
        if (mounted && step.successLogMessage) console.log(step.successLogMessage);
    }
    return complete;
}

function applyDoAddRouteLayersFromPlan(apply, batchToken) {
    if (!allowPreviewMutation() || !apply || !apply.shouldApply) return false;
    const batch=capturePreviewBatch(batchToken);
    if (!previewBatchCurrent(batch) || applyDoAddRouteLayersBatchFromPlan(apply.batchExecute,batch)===false) return false;
    if (!previewBatchCurrent(batch)) return false;
    applyDoAddRouteLayersPostMountFromPlan(apply.postMount,batch);
    return previewBatchCurrent(batch);
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

function doAddRouteLayers(batchToken) {
    if (!allowPreviewMutation()) return false;
    const batch=capturePreviewBatch(batchToken);
    if (!previewBatchCurrent(batch)) return false;
    return applyDoAddRouteLayersFromPlan(
        RS().buildDoAddRouteLayersEntryOrchestrationPlan(
            collectDoAddRouteLayersInput()
        ).apply,batch
    );
}

function applyBringRoutesToTopEntryFromPlan(apply, batchToken) {
    if (!apply || !apply.shouldApply) return;
    const map = rt().getMap();
    if (apply.entryLogPrefix != null) {
        console.log(apply.entryLogPrefix, apply.layerCount);
    }
    if (apply.requiresMap && !map) {
        if (apply.mapMissingLogMessage) console.warn(apply.mapMissingLogMessage);
        return;
    }
    applyBringRoutesToTopFromPlan(apply.execute,batchToken);
}

function collectBringRoutesToTopInput() {
    const map = rt().getMap();
    const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
    return {
        layerCount: allRouteLayers?.length || 0,
        layerDescriptors: allRouteLayers,
        styleLayers: style && style.layers ? style.layers : null,
        selectedRouteIndex: getSelectedRouteIndex(),
    };
}

/**
 * Bring all route layers to the top of the map rendering order
 * This ensures routes are visible above traffic edges and other overlays
 * NOTE: Routes are now inserted before symbol layers by default (via beforeId parameter),
 * so this function primarily ensures routes are above traffic/weather layers
 */
function bringRoutesToTop(batchToken) {
    const routeSel = RS();
    const input = collectBringRoutesToTopInput();
    applyBringRoutesToTopEntryFromPlan(
        routeSel.buildBringRoutesToTopEntryApplyPlan(
            routeSel.buildBringRoutesToTopEntryOrchestrationPlan(input)
        ),batchToken
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

function allowSelectionWrite() {
    // Only the verifier-backed synchronous transition may write an active
    // selection. The capability is read-only and scoped inside that operation.
    const updater = root.VoyagrRerouteMapOrchestration;
    if (updater && typeof updater.isCommittingVerifiedTransition === 'function' &&
            updater.isCommittingVerifiedTransition() === true) return true;
    return !!runtime && knownInactiveLifecycle();
}

function knownInactiveLifecycle() {
    try {
        const lifecycle=root.VoyagrNavigationLifecycleOrchestration;
        return !!lifecycle && typeof lifecycle.getRouteInProgress==='function' && lifecycle.getRouteInProgress()===false &&
            typeof lifecycle.getNavigationStarting==='function' && lifecycle.getNavigationStarting()===false &&
            typeof lifecycle.getNavigationFailure==='function' && lifecycle.getNavigationFailure()===null;
    } catch (_) { return false; }
}

function allowPreviewMutation() {
    if (runtime && knownInactiveLifecycle()) return true;
    try { if (runtime && runtime.call && typeof runtime.call.showStatus === 'function') {
        runtime.call.showStatus('Preview display unavailable during navigation or incomplete startup. Select a verified route instead.', 'warning');
    } } catch (_) { /* A missing status sink must not enable mutation. */ }
    return false;
}

// Only comparison handles are eligible; never remove the owned guidance layer.
// Used by a verified navigation transaction after its new line is mounted.
function clearComparisonRouteLayers() {
    if (!runtime) return false;
    const generation=++previewMountGeneration;
    const owned=rt().getRouteLayer();
    let ok=true;
    for (const layer of allRouteLayers.slice()) {
        if (generation!==previewMountGeneration) return false;
        if (!layer || layer===owned || (owned && layer.id && layer.id===owned.id)) {forgetPreviewHandle(layer);continue;}
        try {
            if (removeComparisonHandle(layer)) forgetPreviewHandle(layer);
            else ok=false;
        } catch (_) {ok=false;}
        if (generation!==previewMountGeneration) return false;
    }
    return ok;
}

// null means an inactive preview; active selection must use the single route
// transition operation rather than any of the preview mutation helpers.
function replaceActiveSelection(route, index) {
    try {
        const lifecycle = root.VoyagrNavigationLifecycleOrchestration;
        if (!lifecycle || typeof lifecycle.getRouteInProgress !== 'function') throw new Error('Lifecycle unavailable');
        const activeState=lifecycle.getRouteInProgress();
        if (activeState===false && knownInactiveLifecycle()) return null;
        if (activeState!==true) throw new Error('Lifecycle state unknown');
        const updater = root.VoyagrRerouteMapOrchestration;
        if (updater && typeof updater.updateRouteOnMap==='function') {
            const result = updater.updateRouteOnMap(route, {selectionIndex:index});
            if (result && result.ok===true) {
                try { displayRouteComparison(); }
                catch (_) { rt().call.showStatus('Route updated; route list could not refresh.', 'warning'); }
                return true;
            }
        }
    } catch (_) { /* Broken modules and nonboolean results never authorize mutation. */ }
    try { rt().call.showStatus('Route safety verification unavailable or unresolved; current route retained. Recalculate online.', 'warning'); } catch (_) { /* unavailable UI is not permission */ }
    return false;
}

function applySelectRouteFromPlan(apply, index) {
    if (!apply || !apply.shouldApply) return false;
    const active = replaceActiveSelection(apply.selectedRoute || apply.route, index);
    if (active!==null) return active;

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
    return true;
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
    if (!runtime) return false;
    const orch = RS().buildSelectRouteEntryOrchestrationPlan(
        collectSelectRouteInput(index)
    );
    return applySelectRouteFromPlan(orch.apply, index);
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
    if (!allowPreviewMutation()) return false;
    if (!apply || !apply.shouldApply) return;

    console.log(apply.entryLogMessage);
    if (clearRouteLayerHandlesFromPlan(apply.preClear) === false) return false;
    return applySingleRouteMapDisplayFromPlan(apply.execute);
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
    if (!allowPreviewMutation()) return false;
    const orch = RS().buildDisplaySingleRouteEntryOrchestrationPlan(
        collectDisplaySingleRouteInput(index)
    );
    return applyDisplaySingleRouteFromPlan(orch.apply);
}

/**
 * Show all routes on the map (called by "Show All Routes" button)
 */
function applyShowAllRoutesFromPlan(apply) {
    if (!allowPreviewMutation()) return false;
    if (!apply || !apply.shouldApply) return;
    if (apply.displayAllRoutes && displayAllRoutesOnMap() === false) return false;
    rt().call.showStatus(apply.statusMessage, apply.statusType);
    return true;
}

function showAllRoutes() {
    if (!allowPreviewMutation()) return false;
    return applyShowAllRoutesFromPlan(
        RS().buildShowAllRoutesEntryOrchestrationPlan(
            (function () { var ro = getRouteOptions(); return ro ? ro.length : 0; })()
        ).apply
    );
}

function applyUseRouteFromPlan(apply, index) {
    if (!apply || !apply.shouldApply) return false;
    const active = replaceActiveSelection(apply.selectedRoute || apply.route, index);
    if (active!==null) return active;

    setSelectedRouteIndex(apply.selectedRouteIndex);
    if (apply.syncLastCalculatedRoute) syncLastCalculatedRouteFromSelection(index);
    if (apply.updateTripInfo) updateTripInfoFromRouteOption(apply.route);

    if (apply.previewTraffic) {
        rt().setRoutePolyline(apply.previewPolyline);
        rt().call.fetchAndDisplayRouteTraffic();
    }

    rt().call.showStatus(apply.statusMessage, apply.statusType);
    return true;
}

/**
 * useRoute function
 * @function useRoute
 * @param {*} index - Parameter description
 * @returns {*} Return value description
 */
function useRoute(index) {
    if (!runtime) return false;
    const orch = RS().buildUseRouteEntryOrchestrationPlan(
        collectUseRouteInput(index)
    );
    return applyUseRouteFromPlan(orch.apply, index);
}
function syncLastCalculatedRouteFromSelection(index) {
    if (!allowPreviewMutation()) return false;
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
        clearComparisonRouteLayers: clearComparisonRouteLayers,
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

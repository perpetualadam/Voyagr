/**
 * @file Real-time traffic, route edge coloring, and auto-traffic reroute orchestration.
 * Extracted from voyagr-app.js; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[Traffic] Orchestration runtime not bound');
        }
        return runtime;
    }

    function tcModule() { return rt().trafficChange(); }
    function rtfModule() { return rt().routeTrafficFlow(); }
    function tuModule() { return rt().toggleUI(); }
    function rsModule() { return rt().routeSelection(); }

    // ===== REAL-TIME TRAFFIC UPDATE FUNCTIONS =====
    function collectUpdateTrafficConditionsInput() {
        const TC = tcModule();
        const startEl = document.getElementById(TC.TRAFFIC_CONDITIONS_START_ELEMENT_ID);
        const endEl = document.getElementById(TC.TRAFFIC_CONDITIONS_END_ELEMENT_ID);
        return {
            lastCalculatedRoute: window.lastCalculatedRoute,
            startLabel: startEl ? startEl.value : '',
            endLabel: endEl ? endEl.value : '',
        };
    }

    /**
     * updateTrafficConditions function
     * @function updateTrafficConditions
     * @returns {*} Return value description
     */
    function updateTrafficConditions() {
        const TC = tcModule();
        const orch = TC.buildUpdateTrafficConditionsEntryOrchestrationPlan(
            collectUpdateTrafficConditionsInput()
        );
        if (!orch.shouldFetch) {
            rt().showStatus(orch.errorStatusMessage, 'error');
            return;
        }

        rt().showStatus(orch.loadingStatusMessage, orch.loadingStatusType);

        fetch(orch.apiPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orch.requestBody),
        })
            .then(response => response.json())
            .then(data => {
                const dispatch = TC.buildUpdateTrafficConditionsResponseDispatchPlan(data, orch);
                if (dispatch.action === 'display') {
                    displayTrafficUpdate(dispatch.data);
                } else {
                    rt().showStatus(dispatch.statusMessage, dispatch.statusType);
                }
            })
            .catch(error => {
                const err = TC.buildUpdateTrafficConditionsFetchErrorPlan(orch);
                console.error(err.logPrefix, error);
                rt().showStatus(err.statusMessage, err.statusType);
            });
    }
    /**
     * displayTrafficUpdate function
     * @function displayTrafficUpdate
     * @param {*} data - Parameter description
     * @returns {*} Return value description
     */
    function applyDisplayTrafficUpdateFromPlan(execute) {
        if (!execute) return;

        if (execute.shouldUpdateStatusElement) {
            const trafficStatus = document.getElementById(execute.trafficStatusElementId);
            if (trafficStatus) trafficStatus.textContent = execute.trafficStatusText;
        }

        if (execute.durationChanged) {
            rt().showStatus(execute.durationChangedStatusMessage, execute.durationChangedStatusType);
        } else {
            rt().showStatus(execute.unchangedStatusMessage, execute.unchangedStatusType);
        }

        if (window.lastCalculatedRoute && execute.patchLastCalculatedRoute) {
            if (execute.lastRoutePatchMode === 'merge') {
                window.lastCalculatedRoute = Object.assign(
                    {},
                    window.lastCalculatedRoute,
                    execute.patchLastCalculatedRoute
                );
            } else if (execute.lastRoutePatchMode === 'mutate' && execute.mutateFieldKeys) {
                execute.mutateFieldKeys.forEach((key) => {
                    if (execute.patchLastCalculatedRoute[key] !== undefined) {
                        window.lastCalculatedRoute[key] = execute.patchLastCalculatedRoute[key];
                    }
                });
            }
        }

        console.log(execute.detailsLogPrefix, execute.detailsLogMessage);
    }

    function collectDisplayTrafficUpdateFmt() {
        return {
            convertDistance: rt().convertDistance,
            distUnit: rt().getDistanceUnit(),
        };
    }

    function displayTrafficUpdate(data) {
        const entry = tcModule().buildDisplayTrafficUpdateEntryOrchestrationPlan(
            data,
            window.lastCalculatedRoute,
            collectDisplayTrafficUpdateFmt(),
            new Date().toLocaleTimeString()
        );
        if (!entry.shouldApply) return;
        applyDisplayTrafficUpdateFromPlan(entry.execute);
    }

    // Auto-update traffic every 5 minutes during navigation
    /**
     * startTrafficMonitoring function
     * @function startTrafficMonitoring
     * @returns {*} Return value description
     */
    function applyStartTrafficMonitoringFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        if (apply.clearExistingInterval) {
            clearInterval(window[apply.intervalProperty]);
        }

        const TC = tcModule();
        window[apply.intervalProperty] = setInterval(() => {
            const startEl = document.getElementById(apply.startElementId);
            const tick = TC.buildTrafficMonitoringTickPlan(
                window.lastCalculatedRoute,
                startEl ? startEl.value : ''
            );
            if (tick.shouldUpdate) {
                updateTrafficConditions();
            }
        }, apply.intervalMs);

        rt().showStatus(apply.successStatusMessage, apply.successStatusType);
    }

    function applyStopTrafficMonitoringFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        if (apply.clearInterval) {
            clearInterval(window[apply.intervalProperty]);
            if (apply.resetIntervalHandle) {
                window[apply.intervalProperty] = null;
            }
        }
        rt().showStatus(apply.statusMessage, apply.statusType);
    }

    function startTrafficMonitoring() {
        const TC = tcModule();
        applyStartTrafficMonitoringFromPlan(
            TC.buildStartTrafficMonitoringApplyPlan(
                TC.buildStartTrafficMonitoringOrchestrationPlan(
                    !!window[TC.TRAFFIC_MONITORING_INTERVAL_PROPERTY]
                )
            )
        );
    }

    /**
     * stopTrafficMonitoring function
     * @function stopTrafficMonitoring
     * @returns {*} Return value description
     */
    function stopTrafficMonitoring() {
        const TC = tcModule();
        applyStopTrafficMonitoringFromPlan(
            TC.buildStopTrafficMonitoringApplyPlan(
                TC.buildStopTrafficMonitoringOrchestrationPlan(
                    !!window[TC.TRAFFIC_MONITORING_INTERVAL_PROPERTY]
                )
            )
        );
    }
    // ===== ROUTE TRAFFIC EDGE COLORING =====
    // Displays traffic congestion as coloured edges along the active route.
    // Only congested segments (orange/red/black) are drawn — free-flow green is omitted so
    // the route line stays visible against TomTom's green traffic tiles.

    let routeTrafficLayers = []; // Array of polylines for traffic segments
    let routeTrafficEnabled = localStorage.getItem('routeTrafficEnabled') !== 'false'; // Default: enabled
    let routeTrafficUpdateInterval = null;

    // Traffic level colors moved to route-traffic-flow.js (TRAFFIC_COLORS).

    function applyRouteTrafficToggleFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;
        const TU = tuModule();
        routeTrafficEnabled = execute.nextEnabled;
        if (execute.useWriteBoolPref) {
            TU.writeBoolPref(execute.storageKey, routeTrafficEnabled);
        }
        TU.applyToggleButton(document.getElementById(execute.toggle.id), execute.toggle.enabled);
        rt().showStatus(execute.statusMessage, execute.statusType);
        if (execute.fetchRouteTraffic) {
            fetchAndDisplayRouteTraffic();
        } else if (execute.clearLayersOnDisable) {
            clearRouteTrafficLayers();
        }
        if (execute.saveAllSettings) rt().saveAllSettings();
    }

    /**
     * Toggle route traffic edge display on/off
     */
    function toggleRouteTraffic() {
        applyRouteTrafficToggleFromPlan(
            rtfModule().buildRouteTrafficToggleExecutePlan(
                routeTrafficEnabled,
                rt().getRouteInProgress(),
                !!(rt().getRoutePolyline() && rt().getRoutePolyline().length > 0)
            )
        );
    }

    /**
     * Clear all route traffic edge layers from the map
     */
    function applyClearRouteTrafficLayersFromPlan(plan) {
        if (!plan) return;

        plan.layers.forEach((spec) => {
            const layer = routeTrafficLayers[spec.index];
            if (!layer) return;
            if (spec.hasRemove) {
                layer.remove();
            } else if (rt().getMap() && spec.layerId && rt().getMap().getLayer(spec.layerId)) {
                rt().getMap().removeLayer(spec.layerId);
                if (rt().getMap().getSource(spec.layerId)) {
                    rt().getMap().removeSource(spec.layerId);
                }
            }
        });

        if (plan.resetLayersArray) routeTrafficLayers = [];
        if (plan.shouldClear || plan.resetLayersArray) {
            console.log(plan.logMessage);
        }
    }

    function clearRouteTrafficLayers() {
        applyClearRouteTrafficLayersFromPlan(
            rtfModule().buildClearRouteTrafficLayersApplyPlan(routeTrafficLayers)
        );
    }

    function applyFetchAndDisplayRouteTrafficResultFromPlan(result) {
        if (!result) return;
        if (result.shouldDisplay) {
            displayRouteTrafficEdges(result.segments);
            console.log(result.displayLogMessage);
        } else if (result.debugMessage) {
            console.debug(result.debugMessage);
        }
    }

    function collectFetchAndDisplayRouteTrafficInput() {
        return {
            routeTrafficEnabled,
            routePolyline: rt().getRoutePolyline(),
        };
    }

    /**
     * Fetch traffic data for route and display colored edges
     */
    async function fetchAndDisplayRouteTraffic() {
        const RTF = rtfModule();
        const entry = RTF.buildFetchAndDisplayRouteTrafficEntryOrchestrationPlan(
            collectFetchAndDisplayRouteTrafficInput()
        );
        const orchestration = entry.orchestration;
        if (!orchestration.shouldFetch) {
            console.log(orchestration.logMessage);
            return;
        }

        console.log(orchestration.fetchLogMessage);

        try {
            const data = await fetchRouteTrafficFlowPayload(rt().getRoutePolyline(), orchestration.sampleInterval);
            applyFetchAndDisplayRouteTrafficResultFromPlan(
                RTF.buildFetchAndDisplayRouteTrafficResultPipelinePlan(data).resultApply
            );
        } catch (error) {
            const errPrefix = RTF.buildFetchAndDisplayRouteTrafficResultApplyPlan({}).errorDebugPrefix;
            console.debug(errPrefix, error);
        }
    }

    function applyDisplayRouteTrafficEdgesMountFromPlan(apply) {
        if (!apply || !apply.shouldApply) {
            if (apply && apply.cannotDisplayLog) {
                const log = apply.cannotDisplayLog;
                console.log(
                    apply.cannotDisplayLogMessage,
                    log.map,
                    'segments:',
                    log.segmentCount,
                    'rt().getRoutePolyline():',
                    log.polylineLength
                );
            }
            return;
        }

        console.log(apply.levelCountsLogPrefix, apply.levelCounts);

        (apply.mountApply.polylines || []).forEach((polylinePlan) => {
            const trafficLine = rt().getMapLibreHelpers().addPolyline(rt().getMap(), polylinePlan.points, {
                color: polylinePlan.color,
                weight: polylinePlan.weight,
                opacity: polylinePlan.opacity,
            });
            if (polylinePlan.registerInRouteTrafficLayers) {
                routeTrafficLayers.push(trafficLine);
            }
        });

        const postDisplay = apply.postDisplay || {};
        if (postDisplay.logMessage) console.log(postDisplay.logMessage);

        if (postDisplay.bringTrafficEdgesToTop) {
            bringTrafficEdgesToTop();
        }
        if (postDisplay.bringNavRouteAboveTrafficEdges) {
            bringNavRouteAboveTrafficEdges();
        }
    }

    function displayRouteTrafficEdges(segments) {
        clearRouteTrafficLayers();

        applyDisplayRouteTrafficEdgesMountFromPlan(
            rtfModule().buildDisplayRouteTrafficEdgesMountApplyPlan(
                rtfModule().buildRouteTrafficEdgesDisplayOrchestrationPlan({
                    segments,
                    polyline: rt().getRoutePolyline(),
                    hasMap: !!rt().getMap(),
                    layersBeforeMount: routeTrafficLayers.length,
                })
            )
        );
    }

    /**
     * Bring traffic edge layers to top of map rendering order
     */
    function applyMapLayerReorderEntryFromPlan(entry) {
        if (!entry || !entry.shouldReorder) return;
        rt().applyMapLayerReorderFromPlan(entry.reorderApply);
    }

    function collectBringTrafficEdgesToTopInput() {
        const map = rt().getMap();
        const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
        return {
            hasMap: !!map,
            trafficLayers: routeTrafficLayers,
            styleLayers: style && style.layers ? style.layers : null,
        };
    }

    function bringTrafficEdgesToTop() {
        applyMapLayerReorderEntryFromPlan(
            rsModule().buildBringTrafficEdgesToTopEntryOrchestrationPlan(
                collectBringTrafficEdgesToTopInput()
            )
        );
    }

    function collectBringNavRouteAboveTrafficEdgesInput() {
        const map = rt().getMap();
        const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
        return {
            hasMap: !!map,
            routeLayer: rt().getRouteLayer(),
            allRouteLayers: rt().getAllRouteLayers(),
            styleLayers: style && style.layers ? style.layers : null,
        };
    }

    function bringNavRouteAboveTrafficEdges() {
        applyMapLayerReorderEntryFromPlan(
            rsModule().buildBringNavRouteAboveTrafficEdgesEntryOrchestrationPlan(
                collectBringNavRouteAboveTrafficEdgesInput()
            )
        );
    }

    // Debounce timer for ensureLabelsOnTop to prevent excessive calls
    let ensureLabelsTimeout = null;

    function applyEnsureLabelsOnTopFromPlan(plan) {
        const map = rt().getMap();
        if (!plan || !plan.shouldApply || !map) return false;
        if (plan.clearExistingTimer) clearTimeout(ensureLabelsTimeout);
        ensureLabelsTimeout = setTimeout(() => {
            try {
                plan.labelLayerIds.forEach((layerId) => {
                    try {
                        if (map.getLayer(layerId)) {
                            map.moveLayer(layerId);
                        }
                    } catch (_e) {
                        if (!plan.skipMoveErrors) throw _e;
                    }
                });
                if (plan.movedLogMessage) console.log(plan.movedLogMessage);
            } catch (e) {
                console.log(plan.errorLogPrefix, e.message);
            }
        }, plan.debounceMs);
        return true;
    }

    function collectEnsureLabelsOnTopInput() {
        const map = rt().getMap();
        const style = map && typeof map.getStyle === 'function' ? map.getStyle() : null;
        return {
            hasMap: !!map,
            styleLayers: style && style.layers ? style.layers : null,
        };
    }

    /**
     * Ensure road labels are always rendered above route and traffic layers
     * This function moves all symbol layers with text-field to the top of the layer stack
     * Debounced to prevent excessive calls during rapid layer additions
     */
    function ensureLabelsOnTop() {
        const entry = rsModule().buildEnsureLabelsOnTopEntryOrchestrationPlan(
            collectEnsureLabelsOnTopInput()
        );
        if (!entry.apply.shouldApply) {
            if (entry.apply.noLabelsLogMessage) console.log(entry.apply.noLabelsLogMessage);
            return;
        }

        applyEnsureLabelsOnTopFromPlan(entry.apply);
    }

    /**
     * Start automatic route traffic updates during navigation
     */
    function applyStartRouteTrafficUpdatesFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        if (apply.clearExistingInterval && routeTrafficUpdateInterval) {
            clearInterval(routeTrafficUpdateInterval);
        }

        if (apply.startLogMessage) console.log(apply.startLogMessage);

        if (apply.immediateUpdate) {
            setTimeout(() => {
                console.log('[Route Traffic] Executing first traffic update');
                fetchAndDisplayRouteTraffic();
            }, apply.immediateDelayMs);
        }

        const RTF = rtfModule();
        routeTrafficUpdateInterval = setInterval(() => {
            const tick = RTF.buildRouteTrafficIntervalTickPlan({
                routeInProgress: rt().getRouteInProgress(),
                routeTrafficEnabled: routeTrafficEnabled,
                routePolyline: rt().getRoutePolyline(),
            });
            if (tick.shouldFetch) {
                console.log(tick.tickLogMessage);
                fetchAndDisplayRouteTraffic();
            }
        }, apply.intervalMs);

        if (apply.logMessage) console.log(apply.logMessage);
    }

    function applyStopRouteTrafficUpdatesFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        if (apply.shouldStopInterval) {
            clearInterval(routeTrafficUpdateInterval);
            routeTrafficUpdateInterval = null;
        }
        if (apply.clearTrafficLayers) clearRouteTrafficLayers();
        if (apply.logMessage) console.log(apply.logMessage);
    }

    function startRouteTrafficUpdates() {
        const RTF = rtfModule();
        applyStartRouteTrafficUpdatesFromPlan(
            RTF.buildStartRouteTrafficUpdatesApplyPlan(
                RTF.buildStartRouteTrafficUpdatesDispatchPlan({
                    routeTrafficUpdateInterval: routeTrafficUpdateInterval,
                    routeTrafficEnabled: routeTrafficEnabled,
                    routePolyline: rt().getRoutePolyline(),
                })
            )
        );
    }

    function stopRouteTrafficUpdates() {
        const RTF = rtfModule();
        applyStopRouteTrafficUpdatesFromPlan(
            RTF.buildStopRouteTrafficUpdatesApplyPlan(
                RTF.buildStopRouteTrafficUpdatesDispatchPlan(routeTrafficUpdateInterval)
            )
        );
    }
    // ===== AUTO-TRAFFIC UPDATE & AUTO-REROUTE SYSTEM =====
    // Feature 1: Automatic traffic updates during navigation
    // Feature 2: Automatic rerouting on deviation with hazard avoidance

    // Auto-traffic update settings
    let autoTrafficUpdateEnabled = localStorage.getItem('autoTrafficUpdate') !== 'false'; // Default: enabled
    let autoRerouteOnDeviationEnabled = localStorage.getItem('autoRerouteOnDeviation') !== 'false'; // Default: enabled
    let trafficUpdateInterval = null;
    let lastTrafficData = null;
    let lastTrafficUpdateTime = 0;

    function applyAutoTrafficUpdateToggleFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;
        const TU = tuModule();
        autoTrafficUpdateEnabled = execute.nextEnabled;
        TU.writeBoolPref(execute.storageKey, autoTrafficUpdateEnabled);
        TU.applyToggleButton(document.getElementById(execute.toggle.id), execute.toggle.enabled);
        rt().showStatus(execute.statusMessage, execute.statusType);
        if (execute.startAutoTrafficUpdates) startAutoTrafficUpdates();
        else if (execute.stopAutoTrafficUpdates) stopAutoTrafficUpdates();
        if (execute.saveAllSettings) rt().saveAllSettings();
    }

    function applyAutoRerouteOnDeviationToggleFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;
        const TU = tuModule();
        autoRerouteOnDeviationEnabled = execute.nextEnabled;
        TU.writeBoolPref(execute.storageKey, autoRerouteOnDeviationEnabled);
        TU.applyToggleButton(document.getElementById(execute.toggle.id), execute.toggle.enabled);
        rt().showStatus(execute.statusMessage, execute.statusType);
        if (execute.saveAllSettings) rt().saveAllSettings();
    }

    /**
     * Toggle auto-traffic update on/off
     */
    function toggleAutoTrafficUpdate() {
        applyAutoTrafficUpdateToggleFromPlan(
            tcModule().buildAutoTrafficUpdateToggleExecutePlan(
                autoTrafficUpdateEnabled,
                rt().getRouteInProgress()
            )
        );
    }

    /**
     * Toggle auto-reroute on deviation on/off
     */
    function toggleAutoRerouteOnDeviation() {
        applyAutoRerouteOnDeviationToggleFromPlan(
            tcModule().buildAutoRerouteOnDeviationToggleExecutePlan(
                autoRerouteOnDeviationEnabled
            )
        );
    }

    /**
     * Start automatic traffic updates during navigation
     */
    function applyStartAutoTrafficUpdatesFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        console.log(apply.logMessage);
        if (apply.immediateCheck) checkTrafficAndReroute();

        const TC = tcModule();
        trafficUpdateInterval = setInterval(() => {
            const tick = TC.buildAutoTrafficIntervalTickPlan({
                routeInProgress: rt().getRouteInProgress(),
                autoTrafficUpdateEnabled: autoTrafficUpdateEnabled,
            });
            if (tick.shouldCheck) checkTrafficAndReroute();
        }, apply.intervalMs);
    }

    function applyStopAutoTrafficUpdatesFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        if (apply.clearInterval) clearInterval(trafficUpdateInterval);
        if (apply.resetIntervalHandle) trafficUpdateInterval = null;
        if (apply.logMessage) console.log(apply.logMessage);
    }

    function startAutoTrafficUpdates() {
        const TC = tcModule();
        applyStartAutoTrafficUpdatesFromPlan(
            TC.buildStartAutoTrafficUpdatesApplyPlan(
                TC.buildStartAutoTrafficUpdatesOrchestrationPlan({
                    autoTrafficUpdateEnabled,
                    trafficUpdateInterval,
                })
            )
        );
    }

    function stopAutoTrafficUpdates() {
        const TC = tcModule();
        applyStopAutoTrafficUpdatesFromPlan(
            TC.buildStopAutoTrafficUpdatesApplyPlan(
                TC.buildStopAutoTrafficUpdatesOrchestrationPlan(trafficUpdateInterval)
            )
        );
    }

    // Shared along-route traffic sampler (Levers A + B). Samples live TomTom flow on the
    // portion of the active route still ahead of the driver and returns congested-segment
    // avoid points plus a realistic extra-delay estimate. Cached briefly so the ETA refresh
    // and the reroute monitor don't each hit the API.
    let _routeTrafficSampleCache = null; // { at: ms, result }
    let _routeTrafficFlowBackoffUntil = 0;

    async function fetchRouteTrafficFlowPayload(points, sampleInterval) {
        const RTF = rtfModule();
        const preflight = RTF.buildRouteTrafficFlowPreflightPlan(_routeTrafficFlowBackoffUntil);
        if (!preflight.shouldRequest) {
            return null;
        }

        const requestPlan = RTF.buildRouteTrafficFlowFetchRequestPlan(points, sampleInterval);
        let response;
        try {
            response = await fetch(requestPlan.url, {
                method: requestPlan.method,
                headers: requestPlan.headers,
                body: requestPlan.body,
            });
        } catch (e) {
            const apply = RTF.buildRouteTrafficFlowFailedFetchApplyPlan(
                RTF.buildRouteTrafficFlowResponsePlan({ errorKind: 'network' })
            );
            _routeTrafficFlowBackoffUntil = apply.backoffUntil;
            console.debug(apply.logPrefix, apply.logMessage + ':', e && e.message);
            return apply.result;
        }

        const outcome = RTF.buildRouteTrafficFlowResponsePlan({
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get('content-type') || '',
        });
        if (!outcome.ok) {
            const apply = RTF.buildRouteTrafficFlowFailedFetchApplyPlan(outcome);
            _routeTrafficFlowBackoffUntil = apply.backoffUntil;
            console.debug(apply.logPrefix, apply.logMessage);
            return apply.result;
        }

        try {
            return await response.json();
        } catch (e) {
            const apply = RTF.buildRouteTrafficFlowFailedFetchApplyPlan(
                RTF.buildRouteTrafficFlowParseFailurePlan()
            );
            _routeTrafficFlowBackoffUntil = apply.backoffUntil;
            console.debug(apply.logPrefix, apply.logMessage + ':', e && e.message);
            return apply.result;
        }
    }

    async function sampleRouteTrafficAhead() {
        const RTF = rtfModule();
        const dispatch = RTF.buildSampleRouteTrafficAheadDispatchPlan(rt().getRoutePolyline(), rt().getLastSnappedRouteIndex());
        if (!dispatch.shouldSample) return null;

        let data;
        try {
            data = await fetchRouteTrafficFlowPayload(dispatch.points, dispatch.sampleInterval);
        } catch (e) {
            console.debug('[Auto-Traffic] route-traffic-flow fetch failed:', e);
            return null;
        }
        if (!data) return null;
        return RTF.buildTrafficAheadSnapshot(data, rt().calculateDistanceMeters);
    }

    async function getRouteTrafficAhead(forceFresh = false) {
        const RTF = rtfModule();
        const now = Date.now();
        const cachePlan = RTF.buildRouteTrafficAheadCachePlan(
            forceFresh,
            _routeTrafficSampleCache,
            now,
            RTF.ROUTE_TRAFFIC_SAMPLE_TTL_MS
        );
        if (cachePlan.useCache) {
            return cachePlan.cachedResult;
        }
        const result = await sampleRouteTrafficAhead();
        const cacheUpdate = RTF.buildRouteTrafficAheadCacheUpdatePlan(result, now);
        if (cacheUpdate.shouldUpdateCache) {
            _routeTrafficSampleCache = cacheUpdate.cacheEntry;
        }
        return result;
    }

    /**
     * Check live traffic along the route and reroute around real congestion/closures.
     */
    async function checkTrafficAndReroute() {
        const TC = tcModule();
        const entry = TC.buildCheckTrafficAndRerouteEntryOrchestrationPlan({
            routeInProgress: rt().getRouteInProgress(),
            currentLat: rt().getCurrentLat(),
            currentLon: rt().getCurrentLon(),
        });
        if (!entry.preflight.shouldCheck) return;

        console.log(entry.applyBase.samplingLogMessage);

        try {
            const flow = await getRouteTrafficAhead(entry.preflight.forceFresh);
            lastTrafficUpdateTime = Date.now();

            const orch = TC.buildCheckTrafficAndRerouteOrchestrationPlan({
                flow,
                lastTrafficData,
            });
            const apply = TC.buildCheckTrafficAndRerouteApplyPlan(orch);
            if (apply.updateLastTrafficData !== undefined) {
                lastTrafficData = apply.updateLastTrafficData;
            }
            if (apply.logMessage) console.log(apply.logMessage);

            if (apply.shouldReroute && apply.notifPlan) {
                const notifPlan = apply.notifPlan;
                rt().sendNotification(notifPlan.notificationTitle, notifPlan.notificationMessage, notifPlan.notificationType);
                await triggerTrafficBasedReroute(
                    notifPlan.changeType,
                    notifPlan.avoidPoints,
                    notifPlan.measuredDelayMin
                );
            }
        } catch (error) {
            console.error(entry.applyBase.errorLogPrefix, error);
        }
    }

    /**
     * Apply accepted traffic-based reroute side effects from a pure apply plan.
     * @param {Object} apply - from buildTriggerTrafficBasedRerouteAcceptApplyPlan
     */
    function applyTriggerTrafficBasedRerouteAcceptFromPlan(apply) {
        if (!apply || !apply.shouldApply) {
            if (apply && apply.logMessage) console.log(apply.logMessage);
            return;
        }

        rt().updateRouteOnMap(apply.newRoute);
        if (apply.clearTrafficCache) _routeTrafficSampleCache = null;
        if (apply.clearLastTrafficData) lastTrafficData = null;
        rt().sendNotification(apply.notificationTitle, apply.notificationMessage, apply.notificationType);
        if (rt().getVoiceAnnouncementsEnabled() && apply.voiceMessage) {
            rt().speakMessage(apply.voiceMessage, apply.speakPriority || 'high');
        }
    }

    function collectTriggerTrafficBasedRerouteInput(changeType, avoidPoints) {
        return {
            destination: rt().resolveNavigationDestination(),
            lastCalculatedRoute: window.lastCalculatedRoute,
            changeType,
            avoidPoints,
        };
    }

    /**
     * Trigger a reroute that actively avoids the congested/closed segments (Lever A).
     * @param {string} changeType - 'severe' | 'congestion'
     * @param {Array<{lat:number,lon:number}>} avoidPoints - congested segment midpoints to avoid
     * @param {number} measuredDelayMin - realistic extra delay on the current route (Lever B)
     */
    async function triggerTrafficBasedReroute(changeType, avoidPoints = [], measuredDelayMin = 0) {
        const TC = tcModule();
        const entry = TC.buildTriggerTrafficBasedRerouteEntryOrchestrationPlan(
            collectTriggerTrafficBasedRerouteInput(changeType, avoidPoints)
        );
        if (!entry.shouldReroute) {
            console.log(entry.blockedLog.logMessage);
            return;
        }

        console.log(entry.fetchOrch.logMessage);

        try {
            const routeRequest = rt().buildRouteRequest(rt().getCurrentLat(), rt().getCurrentLon(), entry.destination, avoidPoints);
            const response = await fetch(entry.fetchOrch.apiPath, {
                method: entry.fetchOrch.method,
                headers: entry.fetchOrch.headers,
                body: JSON.stringify(routeRequest),
            });

            const data = await response.json();
            const dispatch = TC.buildTrafficRerouteApiResponseDispatchPlan({
                data,
                isSevere: entry.preflight.isSevere,
                oldBaseMinutes: window.lastCalculatedRoute.duration_minutes || 0,
                measuredDelayMin,
                previousRouteName: window.lastCalculatedRoute ? window.lastCalculatedRoute.name : '',
            });

            if (dispatch.action === 'accept') {
                applyTriggerTrafficBasedRerouteAcceptFromPlan(
                    TC.buildTriggerTrafficBasedRerouteAcceptApplyPlan(dispatch)
                );
            } else if (dispatch.action === 'reject' && dispatch.logMessage) {
                console.log(dispatch.logMessage);
            }
        } catch (error) {
            console.error(entry.errorLogPrefix, error);
        }
    }

    /**
     * Manual traffic update button handler
     */
    async function manualTrafficUpdate() {
        const entry = tcModule().buildManualTrafficUpdateEntryOrchestrationPlan();
        rt().showStatus(entry.startStatus.statusMessage, entry.startStatus.statusType);
        await checkTrafficAndReroute();
        rt().showStatus(entry.completeStatus.statusMessage, entry.completeStatus.statusType);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    function getTrafficSettingsSnapshot() {
        return {
            autoTrafficUpdateEnabled: autoTrafficUpdateEnabled,
            autoRerouteOnDeviationEnabled: autoRerouteOnDeviationEnabled,
            routeTrafficEnabled: routeTrafficEnabled,
        };
    }

    function applyTrafficSettingsPatch(key, value) {
        switch (key) {
            case 'autoTrafficUpdateEnabled': autoTrafficUpdateEnabled = value; break;
            case 'autoRerouteOnDeviationEnabled': autoRerouteOnDeviationEnabled = value; break;
            case 'routeTrafficEnabled': routeTrafficEnabled = value; break;
            default: break;
        }
    }

    var api = {
        bind: bind,
        getTrafficSettingsSnapshot: getTrafficSettingsSnapshot,
        applyTrafficSettingsPatch: applyTrafficSettingsPatch,
        updateTrafficConditions: updateTrafficConditions,
        displayTrafficUpdate: displayTrafficUpdate,
        startTrafficMonitoring: startTrafficMonitoring,
        stopTrafficMonitoring: stopTrafficMonitoring,
        toggleRouteTraffic: toggleRouteTraffic,
        clearRouteTrafficLayers: clearRouteTrafficLayers,
        fetchAndDisplayRouteTraffic: fetchAndDisplayRouteTraffic,
        displayRouteTrafficEdges: displayRouteTrafficEdges,
        bringTrafficEdgesToTop: bringTrafficEdgesToTop,
        bringNavRouteAboveTrafficEdges: bringNavRouteAboveTrafficEdges,
        ensureLabelsOnTop: ensureLabelsOnTop,
        startRouteTrafficUpdates: startRouteTrafficUpdates,
        stopRouteTrafficUpdates: stopRouteTrafficUpdates,
        toggleAutoTrafficUpdate: toggleAutoTrafficUpdate,
        toggleAutoRerouteOnDeviation: toggleAutoRerouteOnDeviation,
        startAutoTrafficUpdates: startAutoTrafficUpdates,
        stopAutoTrafficUpdates: stopAutoTrafficUpdates,
        checkTrafficAndReroute: checkTrafficAndReroute,
        triggerTrafficBasedReroute: triggerTrafficBasedReroute,
        manualTrafficUpdate: manualTrafficUpdate,
        fetchRouteTrafficFlowPayload: fetchRouteTrafficFlowPayload,
        getRouteTrafficAhead: getRouteTrafficAhead,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTrafficOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

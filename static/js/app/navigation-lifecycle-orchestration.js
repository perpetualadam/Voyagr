/**
 * @file Turn-by-turn navigation start/stop lifecycle orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    var navigationFailure = null;
    var startEpoch = 0;
    var navigationStarting = false;
    var routeStarted = false;
    var routeInProgress = false;
    var currentRouteSteps = [];
    var currentStepIndex = 0;
    var nextManeuverDistance = 0;
    var routePolyline = null;
    var lastSnappedRouteIndex = 0;

    var lastTurnDetectRouteVertexIndex = 0;
    var navigationArrivalTriggered = false;
    var navigationArrivalZoneSince = 0;
    var navTraveledMeters = 0;
    var navOdometerLastGeo = null;
    var navStartedAt = 0;

    function getRouteStarted() { return routeStarted; }
    function setRouteStarted(val) { routeStarted = !!val; }
    function getRouteInProgress() { return routeInProgress; }
    function setRouteInProgress(val) { routeInProgress = !!val; }
    function getCurrentRouteSteps() { return currentRouteSteps; }
    function setCurrentRouteSteps(val) { currentRouteSteps = val; }
    function getCurrentStepIndex() { return currentStepIndex; }
    function setCurrentStepIndex(val) { currentStepIndex = val; }
    function getNextManeuverDistance() { return nextManeuverDistance; }
    function setNextManeuverDistance(val) { nextManeuverDistance = val; }
    function getRoutePolyline() { return routePolyline; }
    function setRoutePolyline(val) { routePolyline = val; }
    function getLastSnappedRouteIndex() { return lastSnappedRouteIndex; }
    function setLastSnappedRouteIndex(val) { lastSnappedRouteIndex = val; }

    function getLastTurnDetectRouteVertexIndex() { return lastTurnDetectRouteVertexIndex; }
    function setLastTurnDetectRouteVertexIndex(val) { lastTurnDetectRouteVertexIndex = val; }
    function getNavigationArrivalTriggered() { return navigationArrivalTriggered; }
    function setNavigationArrivalTriggered(val) { navigationArrivalTriggered = !!val; }
    function getNavigationArrivalZoneSince() { return navigationArrivalZoneSince; }
    function setNavigationArrivalZoneSince(val) { navigationArrivalZoneSince = val; }
    function getNavTraveledMeters() { return navTraveledMeters; }
    function setNavTraveledMeters(val) { navTraveledMeters = val; }
    function getNavOdometerLastGeo() { return navOdometerLastGeo; }
    function setNavOdometerLastGeo(val) { navOdometerLastGeo = val; }
    function getNavStartedAt() { return navStartedAt; }
    function setNavStartedAt(val) { navStartedAt = val; }

    function resetNavigationArrivalState() {
        setNavigationArrivalTriggered(false);
        setNavigationArrivalZoneSince(0);
    }

    function rt() {
        if (!runtime) {
            throw new Error('[NavigationLifecycle] Orchestration runtime not bound');
        }
        return runtime;
    }

    function getNavigationStarting() { return navigationStarting; }
    function getNavigationFailure() { return navigationFailure; }
    function failNavigation(reason) {
        navigationFailure = reason || 'navigation_initialization_failed';
        if (root.VoyagrNavigationSafetyUX) root.VoyagrNavigationSafetyUX.reset();
        startEpoch++; navigationStarting = false;
        setRouteInProgress(false); setRouteStarted(false);
        setCurrentRouteSteps([]); setCurrentStepIndex(0); setNextManeuverDistance(0);
        resetNavigationArrivalState();
        const call = runtime && runtime.call;
        for (const name of ['stopLiveDataRefresh','stopAutoTrafficUpdates','stopRouteTrafficUpdates',
            'clearInitialETAAnnouncement','clearRerouteFailureRetries','hideTurnInstructionWidget',
            'hideJourneySummaryBar','updateNavigationFabVisibility','cancelNavigationSpeech','clearPersistedRoute']) {
            try { if (call && typeof call[name] === 'function') call[name](); } catch (_) { /* bounded best effort after synchronous guidance stop */ }
        }
        try { if (root.VoyagrVoiceAnnouncementsOrchestration) root.VoyagrVoiceAnnouncementsOrchestration.cancelNavigationSpeech(); } catch (_) { /* state already stopped */ }
        try { if (call && call.showStatus) call.showStatus('Navigation stopped: initialization or map recovery failed. Recover the map and recalculate.', 'error'); } catch (_) { /* unavailable UI */ }
        return false;
    }

    function recoverNavigationMap() {
        if (getRouteInProgress() !== false || navigationStarting || !navigationFailure) return false;
        try {
            const map = rt().getMap(), helpers = rt().getMapLibreHelpers();
            if (!map || !map.isStyleLoaded() || helpers.reconcilePolylineLayers(map) !== true ||
                    rt().call.clearAllRouteLayerHandles() !== true) return false;
            const oldLayer = rt().getRouteLayer();
            if (oldLayer) {
                oldLayer.remove();
                if (!helpers.isPolylineLayerRemoved(map,oldLayer)) return false;
            }
            rt().setRouteLayer(null);setRoutePolyline(null);setCurrentRouteSteps([]);
            if (window.lastCalculatedRoute) window.lastCalculatedRoute = Object.assign({},window.lastCalculatedRoute,
                {navigation_resume_requires_fresh_gps:true});
            navigationFailure = null;
            const comparison = root.VoyagrRouteComparisonOrchestration;
            if (comparison) { comparison.setRouteOptions([]); comparison.setSelectedRouteIndex(0); }
            rt().call.showStatus('Map recovered. Recalculate from your actual location before starting navigation.', 'warning');
            return true;
        } catch (_) { return false; }
    }

    function MC() { return rt().mapControls(); }

    function applyNavStartRuntimeFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        if (apply.resetVoiceOnStart) {
            rt().call.resetVoiceAnnouncementStateForNewRoute();
        }

        setRouteInProgress(apply.routeInProgress);
        setCurrentStepIndex(apply.currentStepIndex);
        setCurrentRouteSteps(apply.maneuvers);

        if (apply.resetSessionCounters) {
            setLastTurnDetectRouteVertexIndex(0);
            VoyagrRerouteMapOrchestration.setRouteJoinConfirmedForDeviation(false);
            rt().call.resetVehicleMarkerDisplayState();
            resetNavigationArrivalState();
            setNavTraveledMeters(0);
            setNavOdometerLastGeo(null);
            setNavStartedAt(Date.now());
            rt().setLastETAAnnouncementTime(Date.now());
            rt().setLastAnnouncedETA(null);
            rt().setLastNavTrafficFetchAt(0);
            rt().setInitialETAMovementRetries(0);
            if (typeof rt().clearLastDistanceToNextTurn === 'function') {
                rt().clearLastDistanceToNextTurn();
            }
        }

        if (apply.createEmptyEtaSnapshot) {
            rt().call.resetNavETASnapshot();
        }
    }

    function requestWakeLockFromExecutePlan(wakeLockExecute) {
        if (!wakeLockExecute || !wakeLockExecute.shouldRequest) {
            if (wakeLockExecute && wakeLockExecute.unsupportedLog) {
                console.log(wakeLockExecute.unsupportedLog);
            }
            return;
        }

        navigator.wakeLock.request(wakeLockExecute.lockType)
            .then((wakeLock) => {
                window[wakeLockExecute.windowProperty] = wakeLock;
                console.log(wakeLockExecute.acquireLog);
                if (wakeLockExecute.successStatusMessage && !wakeLockExecute.quietStatus) {
                    rt().call.showStatus(
                        wakeLockExecute.successStatusMessage,
                        wakeLockExecute.successStatusType || 'success'
                    );
                }

                wakeLock.addEventListener('release', () => {
                    console.log(wakeLockExecute.releaseLog);
                    if (window[wakeLockExecute.windowProperty] === wakeLock) {
                        window[wakeLockExecute.windowProperty] = null;
                    }
                    // Screen/system can release the lock while nav continues; retry if still visible.
                    if (typeof document !== 'undefined' &&
                        document.visibilityState === 'visible' &&
                        getRouteInProgress()) {
                        setTimeout(function () {
                            try { ensureNavWakeLock(); } catch (_) { /* ignore */ }
                        }, 500);
                    }
                });
            })
            .catch((err) => {
                console.log(wakeLockExecute.failureLogPrefix, err.name, err.message);
            });
    }

    function applyNavStartWakeLockFromPlan(stateInit, wakeLockApiAvailable) {
        const wakeLockExecute = MC().buildNavStartWakeLockExecutePlan(!!wakeLockApiAvailable, stateInit);
        requestWakeLockFromExecutePlan(wakeLockExecute);
    }

    /**
     * Reacquire wake lock after app foreground / screen wake during navigation.
     * @param {Object} [opts]
     * @param {boolean} [opts.documentVisible]
     */
    function ensureNavWakeLock(opts) {
        opts = opts || {};
        const plan = MC().buildNavForegroundWakeLockEnsurePlan({
            documentVisible: opts.documentVisible !== false &&
                (typeof document === 'undefined' || document.visibilityState !== 'hidden'),
            routeInProgress: getRouteInProgress(),
            wakeLockApiAvailable: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
            hasWakeLock: !!window.screenWakeLock,
        });
        requestWakeLockFromExecutePlan(plan);
        return plan;
    }

    function applyNavStartFabDomFromPlan(fabExecute) {
        if (!fabExecute || !fabExecute.shouldApply) return;

        rt().setMapFollowingActive(fabExecute.mapFollowingActive);
        (fabExecute.elementDisplays || []).forEach(({ id, display }) => {
            const el = document.getElementById(id);
            if (el) el.style.display = display;
        });
        const zoomFollowBtn = document.getElementById('zoomFollowToggle');
        if (zoomFollowBtn && fabExecute.applyZoomFollowButton) {
            rt().call.applyZoomFollowButtonUi(zoomFollowBtn, rt().getZoomAndFollowEnabled());
        }
        const driverPerspectiveBtn = document.getElementById('driverPerspectiveToggle');
        if (driverPerspectiveBtn && fabExecute.applyDriverPerspectiveToggle) {
            rt().toggleUI().applyToggleButton(driverPerspectiveBtn, fabExecute.applyDriverPerspectiveToggle);
        }
        if (fabExecute.updateRoadReportFab) rt().call.updateRoadReportFabVisibility();
        if (fabExecute.updateRecenterButton) rt().call.updateRecenterButtonVisibility();
        if (fabExecute.updateSpeedWidget) rt().call.updateSpeedWidgetVisibility();
    }

    function applyNavStartServicesFromPlan(services, options) {
        if (!services) return;
        options = options || {};

        const epoch = startEpoch;
        const lifecycle = services.lifecycle || {};
        if (lifecycle.startGpsIfInactive) rt().call.startGPSTracking();

        const driverViewSchedule = services.driverViewSchedule;
        if (driverViewSchedule && driverViewSchedule.shouldSchedule) {
            setTimeout(() => {
                if (!getRouteInProgress() || epoch !== startEpoch) return;
                const when = driverViewSchedule.applyWhenReady;
                if (!when.hasMap || !when.hasPosition) return;
                if (when.zoomAndFollowEnabled && when.mapFollowingActive) {
                    rt().call.applyLiveNavigationCamera();
                }
            }, driverViewSchedule.delayMs);
        }

        if (lifecycle.startLiveDataRefresh) rt().call.startLiveDataRefresh();
        if (lifecycle.updateEta) void rt().call.updateETACalculation();
        if (lifecycle.scheduleInitialEtaAnnouncement) rt().call.scheduleInitialETAAnnouncement();

        if (lifecycle.startAutoTraffic) {
            rt().call.startAutoTrafficUpdates();
            console.log(lifecycle.autoTrafficLogMessage);
        }
        if (lifecycle.startRouteTraffic) {
            rt().call.startRouteTrafficUpdates();
            console.log(lifecycle.routeTrafficLogMessage);
        }

        applyNavStartFabDomFromPlan(services.fabExecute);

        if (lifecycle.showTurnWidget) {
            const TI = rt().turnInstructions();
            const RG = rt().routeGeometry();
            const turnExecute = TI.buildNavStartTurnWidgetExecutePlan({
                currentLat: rt().getCurrentLat(),
                currentLon: rt().getCurrentLon(),
                steps: getCurrentRouteSteps(),
                stepIndex: getCurrentStepIndex(),
                polyline: getRoutePolyline(),
                haversineDistanceMeters: RG.haversineDistanceMeters,
                resolveRoadClass: (step) => step.road_class || RG.inferRoadClassFromManeuver(step),
            });
            if (turnExecute.shouldShowWidget) {
                rt().call.showTurnInstructionWidget();
                if (turnExecute.updateFromGps) {
                    rt().call.updateTurnWidgetFromPosition(rt().getCurrentLat(), rt().getCurrentLon());
                } else if (turnExecute.initFromRoute) {
                    const turnInit = TI.buildNavStartTurnInstructionInit(
                        turnExecute.steps,
                        turnExecute.stepIndex,
                        turnExecute.polyline,
                        {
                            haversineDistanceMeters: turnExecute.haversineDistanceMeters,
                            resolveRoadClass: turnExecute.resolveRoadClass,
                        }
                    );
                    if (turnInit) {
                        rt().call.updateTurnInstructionDisplay(turnInit);
                    }
                }
            }
        }

        if (lifecycle.showJourneySummaryBar) rt().call.showJourneySummaryBar();
        if (lifecycle.updateNavFabVisibility) rt().call.updateNavigationFabVisibility();
        try {
            rt().call.voyagrShowMapIconHint(lifecycle.showMapIconHint);
        } catch (_hintErr) {
            /* ignore */
        }

        const volumeHintSchedule = rt().deviceEnvironment().buildNavStartVolumeHintSchedulePlan({
            delayMs: services.volumeHintDelayMs,
        });
        try {
            if (volumeHintSchedule.shouldSchedule) {
                setTimeout(() => {
                    try {
                        if (!getRouteInProgress() || epoch !== startEpoch) return;
                        rt().call.showVolumeHintForNavigation();
                    } catch (e) {
                        console.warn(volumeHintSchedule.errorLogPrefix, e);
                    }
                }, volumeHintSchedule.delayMs);
            }
        } catch (e) {
            console.warn(volumeHintSchedule.scheduleErrorLogPrefix, e);
        }
    }

    function applyNavStopRuntimeFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        setRouteInProgress(apply.routeInProgress);
        VoyagrRerouteMapOrchestration.setRouteJoinConfirmedForDeviation(apply.routeJoinConfirmedForDeviation);
        if (apply.clearRerouteFailureRetries) rt().call.clearRerouteFailureRetries();
        setCurrentStepIndex(apply.currentStepIndex);
        if (apply.clearRouteSteps) setCurrentRouteSteps([]);
        if (apply.resetVehicleMarker) rt().call.resetVehicleMarkerDisplayState();
        if (apply.clearPersistedRoute) rt().call.clearPersistedRoute();
        rt().setMapFollowingActive(apply.mapFollowingActive);
        rt().setJourneyOverviewActive(apply.journeyOverviewActive);
        rt().setSavedMapState(apply.savedMapState);
        rt().setInitialETAMovementRetries(apply.initialETAMovementRetries);
        if (typeof rt().clearLastDistanceToNextTurn === 'function') {
            rt().clearLastDistanceToNextTurn();
        }
    }

    function applyNavStopWakeLockReleaseFromPlan(lifecycle) {
        if (!lifecycle || !lifecycle.releaseWakeLock || !window.screenWakeLock) return;

        window.screenWakeLock.release()
            .then(() => {
                console.log(lifecycle.wakeLockReleaseLog);
                window.screenWakeLock = null;
            })
            .catch((err) => {
                console.log(lifecycle.wakeLockReleaseErrorLogPrefix, err);
            });
    }

    function applyNavStopFabDomFromPlan(fabExecute) {
        if (!fabExecute || !fabExecute.shouldApply) return;

        (fabExecute.elementDisplays || []).forEach(({ id, display }) => {
            const el = document.getElementById(id);
            if (el) el.style.display = display;
        });
        if (fabExecute.updateRoadReportFab) rt().call.updateRoadReportFabVisibility();
        if (fabExecute.updateNavFabVisibility) rt().call.updateNavigationFabVisibility();
        if (fabExecute.updateSpeedWidget) rt().call.updateSpeedWidgetVisibility();
        if (fabExecute.hideTurnWidget) rt().call.hideTurnInstructionWidget();
        if (fabExecute.hideJourneySummaryBar) rt().call.hideJourneySummaryBar();
    }

    function applyNavStopServicesFromPlan(services, wasRouteInProgress) {
        if (!services) return false;

        const lifecycle = services.lifecycle || {};
        if (lifecycle.resetNavigationArrival) resetNavigationArrivalState();

        const traveled = services.traveledSummary;
        if (traveled && traveled.shouldBuild && window.lastCalculatedRoute && wasRouteInProgress) {
            const summaryRoute = rt().call.buildTraveledJourneyRoute(window.lastCalculatedRoute);
            if (traveled.persistCompletedTrip) void rt().call.persistCompletedTrip(summaryRoute);
            if (traveled.showJourneySummary) rt().call.showJourneySummary(summaryRoute);
        }

        if (lifecycle.stopGpsTracking) rt().call.stopGPSTracking();
        if (lifecycle.hideRoadNameBar) rt().call.hideRoadNameBar();

        applyNavStopWakeLockReleaseFromPlan(lifecycle);

        if (lifecycle.stopLiveDataRefresh) rt().call.stopLiveDataRefresh();
        if (lifecycle.clearInitialEtaAnnouncement) rt().call.clearInitialETAAnnouncement();

        if (lifecycle.stopAutoTraffic) {
            rt().call.stopAutoTrafficUpdates();
            console.log(lifecycle.autoTrafficStopLog);
        }
        if (lifecycle.stopRouteTraffic) {
            rt().call.stopRouteTrafficUpdates();
            console.log(lifecycle.routeTrafficStopLog);
        }

        applyNavStopFabDomFromPlan(services.fabExecute);

        if (lifecycle.stopArModeIfActive && rt().getArModeActive()) {
            rt().call.stopARMode();
        }

        const pitch = services.mapPitchReset;
        const map = rt().getMap();
        if (pitch && pitch.shouldApply && map) {
            if (pitch.driverPerspectiveEnabled) {
                rt().call.applyDriverPerspective();
            } else {
                map.easeTo({ pitch: pitch.pitch, bearing: pitch.bearing, duration: pitch.durationMs });
            }
        }

        const pwa = services.pwaUpdate;
        if (pwa && pwa.shouldApply && rt().getUpdatePending()) {
            rt().call.showStatus(pwa.statusMessage, 'success');
            rt().call.saveAppState();
            setTimeout(() => {
                window.location.reload();
            }, pwa.reloadDelayMs);
            return true;
        }

        const feedback = services.userFeedback;
        if (feedback) {
            rt().call.showStatus(feedback.statusMessage, feedback.statusType || 'info');
            if (feedback.notification) {
                rt().call.sendNotification(feedback.notification.title, feedback.notification.body, 'info');
            }
        }
        return false;
    }

    function startTurnByTurnNavigation(routeData, navStartOpts) {
        if (!getRouteInProgress() && (root.VOYAGR_JOURNEY_PROTOCOL===1 || routeData && routeData.journey_context || root.VoyagrJourneyModes)) {
            var modes=root.VoyagrJourneyModes;
            if (!modes || modes.PROTOCOL!==1 || typeof modes.liveStartPermitted!=='function' || modes.liveStartPermitted(routeData)!==true) {
                if (runtime && runtime.call && runtime.call.showStatus) runtime.call.showStatus('Choose Navigate From My Location, or inspect the journey in simulation. Reload if journey controls are unavailable.','warning');
                return false;
            }
        }
        if (navStartOpts === undefined) navStartOpts = null;
        const refuse = message => {
            try { if (runtime && runtime.call && runtime.call.showStatus) runtime.call.showStatus(message, 'warning'); } catch (_) { /* fail closed during partial startup */ }
            return false;
        };
        // No persisted assessment establishes a fresh complete request context.
        // Refuse before selection can replace its geometry, destination or evidence.
        if ((navStartOpts && (navStartOpts.fromPersistedResume || navStartOpts.persistedPolyline!==undefined)) ||
            (routeData && (routeData.navigation_resume_requires_fresh_gps ||
                (routeData.avoidance_assessment && routeData.avoidance_assessment.resume_state)))) {
            return refuse('Saved journey is preview only. Recalculate from your actual location and destination before navigation.');
        }
        if (navigationFailure) return refuse('Navigation is stopped after an initialization or map failure. Recover the map and recalculate.');
        let mergedRoute;
        try {
            const integrity = root.VoyagrAvoidanceIntegrity;
            if (!integrity || typeof integrity.gate!=='function' || typeof integrity.prepareNavigationCandidate!=='function') {
                return refuse('Safety verification unavailable; navigation not started. Reload online and recalculate.');
            }
            mergedRoute = rt().routeSelection().mergeNavigationRouteFromSelected(
                routeData, rt().getRouteOptions(), rt().getSelectedRouteIndex()
            );
            if (getRouteInProgress()) {
                const updater = root.VoyagrRerouteMapOrchestration;
                if (!updater || typeof updater.updateRouteOnMap!=='function') return refuse('Route replacement unavailable; current route retained.');
                const result = updater.updateRouteOnMap(mergedRoute);
                return !!result && result.ok===true;
            }
            mergedRoute = integrity.prepareNavigationCandidate(mergedRoute);
            if (!mergedRoute) return refuse('Route geometry or instructions are incomplete; recalculate before navigation.');
            // The gate contract is synchronous boolean permission, never a truthy
            // object, promise, legacy metadata flag or confirmation substitute.
            if (integrity.gate(mergedRoute, {
                storage:localStorage, offline:navigator.onLine===false,
                showStatus:rt().call.showStatus,
            })!==true) return refuse('Route safety is not established; navigation not started. Recalculate with the current requirements.');
        } catch (_) {
            return refuse('Safety verification unavailable; navigation not started. Reload online and recalculate.');
        }
        if (navigationStarting) return refuse('Navigation initialization is already in progress.');
        const previous = {last:window.lastCalculatedRoute, polyline:getRoutePolyline(), steps:getCurrentRouteSteps(),
            step:getCurrentStepIndex(), snap:getLastSnappedRouteIndex(), turn:getLastTurnDetectRouteVertexIndex(),
            next:getNextManeuverDistance(), started:getRouteStarted(), layer:null};
        let staged = null, helpers, map, mutated = false, oldRemoved = false, stateInit;
        const epoch = ++startEpoch;
        const abortStart = () => {
            // A cancelled persistence completion owns only its staged resource;
            // it must never roll an unrelated newer session back to its preview.
            if (epoch !== startEpoch) {
                let clean = true;
                if (staged) {
                    try { staged.remove(); clean = helpers.isPolylineLayerRemoved(map,staged) === true; }
                    catch (_) { clean = false; }
                }
                if (!clean) failNavigation('inconsistent_map');
                return refuse('Navigation initialization was cancelled; no new guidance started.');
            }
            navigationStarting = false;
            let clean = true;
            if (staged) {
                try { staged.remove(); clean = helpers.isPolylineLayerRemoved(map,staged) === true; }
                catch (_) { clean = false; }
            }
            if (previous.layer && helpers && staged && !helpers.isPolylineLayerMounted(map,previous.layer,previous.polyline)) clean=false;
            if (mutated) failNavigation('navigation_initialization_failed');
            if (clean && !oldRemoved && (mutated || staged)) {
                window.lastCalculatedRoute = previous.last;
                setRoutePolyline(previous.polyline); setCurrentRouteSteps(previous.steps);
                setCurrentStepIndex(previous.step); setLastSnappedRouteIndex(previous.snap);
                setLastTurnDetectRouteVertexIndex(previous.turn); setNextManeuverDistance(previous.next);
                setRouteStarted(previous.started); setRouteInProgress(false);
                try { if (runtime && runtime.setRouteLayer) runtime.setRouteLayer(previous.layer); } catch (_) { clean = false; }
            }
            if (!clean || oldRemoved) failNavigation('inconsistent_map');
            return refuse('Navigation start failed; guidance is stopped. Recover the map and recalculate before retrying.');
        };
        const completeStart = persisted => {
            try {
                if (persisted !== true || epoch !== startEpoch) throw new Error('Persistence or startup cancelled');
                const integrity = root.VoyagrAvoidanceIntegrity;
                const selected = rt().routeSelection().mergeNavigationRouteFromSelected(routeData,rt().getRouteOptions(),rt().getSelectedRouteIndex());
                if (JSON.stringify(integrity.prepareNavigationCandidate(selected)) !== JSON.stringify(mergedRoute) ||
                    integrity.gate(mergedRoute,{storage:localStorage,offline:navigator.onLine===false,quiet:true}) !== true ||
                    !helpers.isPolylineLayerMounted(map,staged,mergedRoute.polyline)) throw new Error('Startup context changed');
                mutated = true;
                window.lastCalculatedRoute = mergedRoute;
                applyNavStartRuntimeFromPlan(MC().buildNavStartRuntimeApplyPlan(stateInit));
                setRoutePolyline(mergedRoute.polyline);
                if (previous.layer) {
                    previous.layer.remove();
                    if (!helpers.isPolylineLayerRemoved(map,previous.layer)) throw new Error('Old line cleanup failed');
                    oldRemoved = true;
                }
                rt().setRouteLayer(staged);
                if (rt().call.clearAllRouteLayerHandles() !== true) throw new Error('Preview cleanup failed');
                const traffic = rt().call.getTrafficSettingsSnapshot();
                const services = MC().buildNavStartServicesOrchestrationPlan({stateInit,
                    isTrackingActive:rt().getIsTrackingActive(),autoTrafficUpdateEnabled:traffic.autoTrafficUpdateEnabled,
                    routeTrafficEnabled:traffic.routeTrafficEnabled,hasMap:true,
                    hasPosition:rt().getCurrentLat()!=null && rt().getCurrentLon()!=null,
                    zoomAndFollowEnabled:rt().getZoomAndFollowEnabled(),mapFollowingActive:rt().getMapFollowingActive(),
                    driverPerspectiveActive:rt().call.shouldUsePitchedDrivingCamera(),wakeLockApiAvailable:'wakeLock' in navigator});
                applyNavStartServicesFromPlan(services);
                if (rt().getRouteLayer() !== staged || !helpers.isPolylineLayerMounted(map,staged,mergedRoute.polyline)) throw new Error('Map changed during startup');
                if (!root.VoyagrRerouteMapOrchestration.authoriseCurrentRouteRedraw()) throw new Error('Recovery context unavailable');
                navigationFailure = null; navigationStarting = false; setRouteStarted(true);
                try { if (root.VoyagrNavigationSafetyUX) root.VoyagrNavigationSafetyUX.committed(mergedRoute); } catch (_) { /* Presentation cannot change gate permission. */ }
                applyNavStartWakeLockFromPlan(stateInit,'wakeLock' in navigator);
                if (services.userFeedback) {
                    const feedback = services.userFeedback;
                    rt().call.sendNotification(feedback.notificationTitle,feedback.notificationBody,'success');
                    if (feedback.speakMessage) rt().call.speakMessage(feedback.speakMessage);
                    rt().call.showStatus(feedback.statusMessage,feedback.statusType);
                }
                return true;
            } catch (_) { return abortStart(); }
        };
        try {
            const entry = MC().buildNavStartEntryOrchestrationPlan(mergedRoute, navStartOpts);
            if (!entry.shouldStart) return refuse(entry.errorStatusMessage);
            stateInit = entry.stateInit;
            map = rt().getMap(); helpers = rt().getMapLibreHelpers();
            previous.layer = rt().getRouteLayer();
            if (!map || !map.isStyleLoaded() || !helpers ||
                    typeof helpers.isPolylineLayerMounted !== 'function' ||
                    typeof helpers.isPolylineLayerRemoved !== 'function') throw new Error('Map verification unavailable');
            const MT = root.VoyagrMapTheme;
            const mount = rt().routeSelection().buildNavActiveRouteLayerMountPlan({routePolyline:mergedRoute.polyline,
                navRouteColor:rt().call.navActiveRouteColor(),mapTheme:MT && MT.readStoredMapTheme ? MT.readStoredMapTheme() : 'standard'});
            if (!mount.valid) throw new Error('Invalid mount');
            if (rt().getMapLibreHelpers().invalidateDeferredPolylineMounts(map) !== true) throw new Error('Deferred map ownership unavailable');
            staged = helpers.addPolyline(map,mount.polyline,mount.style);
            if (!helpers.isPolylineLayerMounted(map,staged,mergedRoute.polyline)) throw new Error('Map mount failed');
            navigationStarting = true;
            const persisted = rt().call.persistActiveRoute(mergedRoute);
            if (persisted && typeof persisted.then === 'function') {
                // Bounded pending start: flags/guidance/services remain inactive.
                let timer;
                const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(false),5000); });
                return Promise.race([Promise.resolve(persisted).catch(() => false),timeout])
                    .then(completeStart).finally(() => clearTimeout(timer));
            }
            return completeStart(persisted);
        } catch (_) { return abortStart(); }
    }

    function stopTurnByTurnNavigation() {
        if (navigationStarting) { failNavigation('navigation_start_cancelled'); return false; }
        startEpoch++;
        const entry = MC().buildNavStopEntryOrchestrationPlan({
            routeInProgress: getRouteInProgress(),
            isTrackingActive: rt().getIsTrackingActive(),
            lastCalculatedRoute: window.lastCalculatedRoute,
            hasWakeLock: !!window.screenWakeLock,
            arModeActive: rt().getArModeActive(),
            driverPerspectiveEnabled: rt().getDriverPerspectiveEnabled(),
            updatePending: root.VoyagrServiceWorkerOrchestration.getUpdatePending(),
        });
        if (!entry.shouldStop) {
            if (entry.updateNavFabOnly) rt().call.updateNavigationFabVisibility();
            return;
        }

        applyNavStopRuntimeFromPlan(MC().buildNavStopRuntimeApplyPlan(entry.stateReset));
        applyNavStopServicesFromPlan(entry.services, entry.wasRouteInProgress);
        if (root.VoyagrNavigationSafetyUX) root.VoyagrNavigationSafetyUX.reset();
        if (root.VoyagrJourneyModes) root.VoyagrJourneyModes.liveStopped();
    }

    function updateTurnGuidance(userLat, userLon) {
        const activeRoutePolyline = getRoutePolyline();
        if (!getRouteInProgress() || !activeRoutePolyline || activeRoutePolyline.length === 0) return;

        const progress = rt().routeGeometry().buildVertexDestinationProgress(userLat, userLon, activeRoutePolyline);

        const turnInfo = document.getElementById('turnInfo');
        if (turnInfo) {
            const distanceKm = progress.distanceToEndMeters / 1000;
            turnInfo.innerHTML = rt().eta().buildDestinationProgressPanelHtml(
                rt().call.convertDistance(distanceKm),
                rt().call.getDistanceUnit(),
                progress.progressPercent
            );
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        getNavigationFailure:getNavigationFailure,
        getNavigationStarting:getNavigationStarting,
        failNavigation:failNavigation,
        recoverNavigationMap:recoverNavigationMap,
        startTurnByTurnNavigation: startTurnByTurnNavigation,
        stopTurnByTurnNavigation: stopTurnByTurnNavigation,
        ensureNavWakeLock: ensureNavWakeLock,
        updateTurnGuidance: updateTurnGuidance,
        getRouteStarted: getRouteStarted,
        setRouteStarted: setRouteStarted,
        getRouteInProgress: getRouteInProgress,
        setRouteInProgress: setRouteInProgress,
        getCurrentRouteSteps: getCurrentRouteSteps,
        setCurrentRouteSteps: setCurrentRouteSteps,
        getCurrentStepIndex: getCurrentStepIndex,
        setCurrentStepIndex: setCurrentStepIndex,
        getNextManeuverDistance: getNextManeuverDistance,
        setNextManeuverDistance: setNextManeuverDistance,
        getRoutePolyline: getRoutePolyline,
        setRoutePolyline: setRoutePolyline,
        getLastSnappedRouteIndex: getLastSnappedRouteIndex,
        setLastSnappedRouteIndex: setLastSnappedRouteIndex,
        getLastTurnDetectRouteVertexIndex: getLastTurnDetectRouteVertexIndex,
        setLastTurnDetectRouteVertexIndex: setLastTurnDetectRouteVertexIndex,
        getNavigationArrivalTriggered: getNavigationArrivalTriggered,
        setNavigationArrivalTriggered: setNavigationArrivalTriggered,
        getNavigationArrivalZoneSince: getNavigationArrivalZoneSince,
        setNavigationArrivalZoneSince: setNavigationArrivalZoneSince,
        getNavTraveledMeters: getNavTraveledMeters,
        setNavTraveledMeters: setNavTraveledMeters,
        getNavOdometerLastGeo: getNavOdometerLastGeo,
        setNavOdometerLastGeo: setNavOdometerLastGeo,
        getNavStartedAt: getNavStartedAt,
        setNavStartedAt: setNavStartedAt,
        resetNavigationArrivalState: resetNavigationArrivalState,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrNavigationLifecycleOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Turn-by-turn navigation start/stop lifecycle orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[NavigationLifecycle] Orchestration runtime not bound');
        }
        return runtime;
    }

    function MC() { return rt().mapControls(); }

    function applyNavStartRuntimeFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;

        if (apply.resetVoiceOnStart) {
            rt().call.resetVoiceAnnouncementStateForNewRoute();
        }

        rt().setRouteInProgress(apply.routeInProgress);
        rt().setCurrentStepIndex(apply.currentStepIndex);
        rt().setCurrentRouteSteps(apply.maneuvers);

        if (apply.resetSessionCounters) {
            rt().setLastTurnDetectRouteVertexIndex(0);
            rt().setRouteJoinConfirmedForDeviation(false);
            rt().call.resetVehicleMarkerDisplayState();
            rt().call.resetNavigationArrivalState();
            rt().setNavTraveledMeters(0);
            rt().setNavOdometerLastGeo(null);
            rt().setNavStartedAt(Date.now());
            rt().setLastETAAnnouncementTime(Date.now());
            rt().setLastAnnouncedETA(null);
            rt().setLastNavTrafficFetchAt(0);
            rt().setInitialETAMovementRetries(0);
        }

        if (apply.createEmptyEtaSnapshot) {
            window.navETASnapshot = rt().eta().createEmptyNavETASnapshot();
        }
    }

    function applyNavStartPolylineFromPlan(execute, stateInit) {
        if (!execute || !execute.shouldInit) return false;

        try {
            if (execute.usePersistedPolyline && execute.persistedPolyline) {
                rt().setRoutePolyline(execute.persistedPolyline);
                console.log(
                    execute.polylineDecodeLogPrefix,
                    rt().getRoutePolyline().length,
                    execute.persistedPolylineLogSuffix
                );
            } else {
                rt().setRoutePolyline(rt().call.decodePolyline(execute.geometry, execute.navPrecision));
                console.log(
                    execute.polylineDecodeLogPrefix,
                    rt().getRoutePolyline().length,
                    'points',
                    '(precision ' + execute.navPrecision + ')'
                );
            }
            console.log(stateInit.maneuversLogPrefix, rt().getCurrentRouteSteps().length, 'steps');

            if (execute.persistActiveRoute) rt().call.persistActiveRoute();
            if (execute.precacheTiles) rt().call.precacheRouteTiles(rt().getRoutePolyline());

            const routePolyline = rt().getRoutePolyline();
            if (!routePolyline || routePolyline.length === 0) {
                console.error(execute.emptyPolylineErrorLog);
                rt().call.showStatus(execute.invalidGeometryStatusMessage, 'error');
                return false;
            }

            if (execute.primeVehicleWhenPositionKnown && rt().getCurrentLat() != null && rt().getCurrentLon() != null) {
                rt().call.primeVehicleMarkerOnRoute(rt().getCurrentLat(), rt().getCurrentLon());
            } else if (execute.resetSnappedIndexWhenNoPosition) {
                rt().setLastSnappedRouteIndex(0);
            }
            return true;
        } catch (e) {
            console.error(execute.decodeGeometryErrorLogPrefix, e);
            rt().call.showStatus(execute.decodeGeometryErrorStatusMessage, 'error');
            return false;
        }
    }

    function applyNavStartWakeLockFromPlan(stateInit, wakeLockApiAvailable) {
        const wakeLockExecute = MC().buildNavStartWakeLockExecutePlan(!!wakeLockApiAvailable, stateInit);
        if (!wakeLockExecute.shouldRequest) {
            if (wakeLockExecute.unsupportedLog) console.log(wakeLockExecute.unsupportedLog);
            return;
        }

        navigator.wakeLock.request(wakeLockExecute.lockType)
            .then((wakeLock) => {
                window[wakeLockExecute.windowProperty] = wakeLock;
                console.log(wakeLockExecute.acquireLog);
                rt().call.showStatus(wakeLockExecute.successStatusMessage, wakeLockExecute.successStatusType);

                wakeLock.addEventListener('release', () => {
                    console.log(wakeLockExecute.releaseLog);
                });
            })
            .catch((err) => {
                console.log(wakeLockExecute.failureLogPrefix, err.name, err.message);
            });
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

    function applyNavStartServicesFromPlan(services) {
        if (!services) return;

        const lifecycle = services.lifecycle || {};
        if (lifecycle.startGpsIfInactive) rt().call.startGPSTracking();

        const driverViewSchedule = services.driverViewSchedule;
        if (driverViewSchedule && driverViewSchedule.shouldSchedule) {
            setTimeout(() => {
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
                steps: rt().getCurrentRouteSteps(),
                stepIndex: rt().getCurrentStepIndex(),
                polyline: rt().getRoutePolyline(),
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

        const navStartFeedback = services.userFeedback;
        if (navStartFeedback) {
            rt().call.sendNotification(
                navStartFeedback.notificationTitle,
                navStartFeedback.notificationBody,
                'success'
            );
            if (navStartFeedback.speakMessage) {
                rt().call.speakMessage(navStartFeedback.speakMessage);
            }
            rt().call.showStatus(navStartFeedback.statusMessage, navStartFeedback.statusType);
        }

        const volumeHintSchedule = rt().deviceEnvironment().buildNavStartVolumeHintSchedulePlan({
            delayMs: services.volumeHintDelayMs,
        });
        try {
            if (volumeHintSchedule.shouldSchedule) {
                setTimeout(() => {
                    try {
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

        rt().setRouteInProgress(apply.routeInProgress);
        rt().setRouteJoinConfirmedForDeviation(apply.routeJoinConfirmedForDeviation);
        if (apply.clearRerouteFailureRetries) rt().call.clearRerouteFailureRetries();
        rt().setCurrentStepIndex(apply.currentStepIndex);
        if (apply.clearRouteSteps) rt().setCurrentRouteSteps([]);
        if (apply.resetVehicleMarker) rt().call.resetVehicleMarkerDisplayState();
        if (apply.clearPersistedRoute) rt().call.clearPersistedRoute();
        rt().setMapFollowingActive(apply.mapFollowingActive);
        rt().setJourneyOverviewActive(apply.journeyOverviewActive);
        rt().setSavedMapState(apply.savedMapState);
        rt().setInitialETAMovementRetries(apply.initialETAMovementRetries);
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
        if (lifecycle.resetNavigationArrival) rt().call.resetNavigationArrivalState();

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
        if (navStartOpts === undefined) navStartOpts = null;
        const mergedRoute = rt().routeSelection().mergeNavigationRouteFromSelected(
            routeData, rt().getRouteOptions(), rt().getSelectedRouteIndex()
        );
        const entry = MC().buildNavStartEntryOrchestrationPlan(mergedRoute, navStartOpts);
        if (!entry.shouldStart) {
            rt().call.showStatus(entry.errorStatusMessage, 'error');
            return;
        }
        routeData = entry.routeData;

        if (entry.mergeLastCalculatedRoute) {
            window.lastCalculatedRoute = Object.assign({}, window.lastCalculatedRoute || {}, routeData);
        }

        const stateInit = entry.stateInit;
        applyNavStartRuntimeFromPlan(MC().buildNavStartRuntimeApplyPlan(stateInit));

        const polylineOk = applyNavStartPolylineFromPlan(
            MC().buildNavStartPolylineInitExecutePlan(stateInit),
            stateInit
        );
        if (!polylineOk) return;

        applyNavStartWakeLockFromPlan(stateInit, 'wakeLock' in navigator);

        const traffic = rt().call.getTrafficSettingsSnapshot();
        applyNavStartServicesFromPlan(MC().buildNavStartServicesOrchestrationPlan({
            stateInit: stateInit,
            isTrackingActive: rt().getIsTrackingActive(),
            autoTrafficUpdateEnabled: traffic.autoTrafficUpdateEnabled,
            routeTrafficEnabled: traffic.routeTrafficEnabled,
            hasMap: !!rt().getMap(),
            hasPosition: rt().getCurrentLat() != null && rt().getCurrentLon() != null,
            zoomAndFollowEnabled: rt().getZoomAndFollowEnabled(),
            mapFollowingActive: rt().getMapFollowingActive(),
            driverPerspectiveActive: rt().call.shouldUsePitchedDrivingCamera(),
            wakeLockApiAvailable: 'wakeLock' in navigator,
        }));
    }

    function stopTurnByTurnNavigation() {
        const entry = MC().buildNavStopEntryOrchestrationPlan({
            routeInProgress: rt().getRouteInProgress(),
            isTrackingActive: rt().getIsTrackingActive(),
            lastCalculatedRoute: window.lastCalculatedRoute,
            hasWakeLock: !!window.screenWakeLock,
            arModeActive: rt().getArModeActive(),
            driverPerspectiveEnabled: rt().getDriverPerspectiveEnabled(),
            updatePending: rt().getUpdatePending(),
        });
        if (!entry.shouldStop) {
            if (entry.updateNavFabOnly) rt().call.updateNavigationFabVisibility();
            return;
        }

        applyNavStopRuntimeFromPlan(MC().buildNavStopRuntimeApplyPlan(entry.stateReset));
        applyNavStopServicesFromPlan(entry.services, entry.wasRouteInProgress);
    }

    function updateTurnGuidance(userLat, userLon) {
        const routePolyline = rt().getRoutePolyline();
        if (!rt().getRouteInProgress() || !routePolyline || routePolyline.length === 0) return;

        const progress = rt().routeGeometry().buildVertexDestinationProgress(userLat, userLon, routePolyline);

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
        startTurnByTurnNavigation: startTurnByTurnNavigation,
        stopTurnByTurnNavigation: stopTurnByTurnNavigation,
        updateTurnGuidance: updateTurnGuidance,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrNavigationLifecycleOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

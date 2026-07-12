/**
 * @file Reroute map update orchestration (route pick, map layer refresh, overlay redraw).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var win = root;

    var routeJoinConfirmedForDeviation = false;
    var preferPrimaryRouteOnNextNavUpdate = false;
    var deviationStartTimeCheck = null;
    var deviationOffRouteStreak = 0;
    var rerouteAttemptCount = 0;
    var postRerouteGraceUntil = 0;
    var lastRerouteTime = 0;
    var lastRerouteAttemptTime = 0;
    var rerouteInProgress = false;
    var lastRerouteDeviation = 0;
    var rerouteFailureRetryTimer = null;
    var rerouteFailureRetryCount = 0;

    function getRouteJoinConfirmedForDeviation() { return routeJoinConfirmedForDeviation; }
    function setRouteJoinConfirmedForDeviation(val) { routeJoinConfirmedForDeviation = !!val; }
    function getPreferPrimaryRouteOnNextNavUpdate() { return preferPrimaryRouteOnNextNavUpdate; }
    function setPreferPrimaryRouteOnNextNavUpdate(val) { preferPrimaryRouteOnNextNavUpdate = !!val; }
    function getDeviationStartTimeCheck() { return deviationStartTimeCheck; }
    function setDeviationStartTimeCheck(val) { deviationStartTimeCheck = val; }
    function getDeviationOffRouteStreak() { return deviationOffRouteStreak; }
    function setDeviationOffRouteStreak(val) { deviationOffRouteStreak = val; }
    function getRerouteAttemptCount() { return rerouteAttemptCount; }
    function setRerouteAttemptCount(val) { rerouteAttemptCount = val; }
    function getPostRerouteGraceUntil() { return postRerouteGraceUntil; }
    function setPostRerouteGraceUntil(val) { postRerouteGraceUntil = val; }
    function getLastRerouteTime() { return lastRerouteTime; }
    function setLastRerouteTime(val) { lastRerouteTime = val; }
    function getLastRerouteAttemptTime() { return lastRerouteAttemptTime; }
    function setLastRerouteAttemptTime(val) { lastRerouteAttemptTime = val; }
    function getRerouteInProgress() { return rerouteInProgress; }
    function setRerouteInProgress(val) { rerouteInProgress = !!val; }
    function getLastRerouteDeviation() { return lastRerouteDeviation; }
    function setLastRerouteDeviation(val) { lastRerouteDeviation = val; }
    function getRerouteFailureRetryTimer() { return rerouteFailureRetryTimer; }
    function setRerouteFailureRetryTimer(val) { rerouteFailureRetryTimer = val; }
    function getRerouteFailureRetryCount() { return rerouteFailureRetryCount; }
    function setRerouteFailureRetryCount(val) { rerouteFailureRetryCount = val; }

    function rt() {
        if (!runtime) {
            throw new Error('[RerouteMap] Orchestration runtime not bound');
        }
        return runtime;
    }

    function pickActiveRouteDuringNavigation(routeList, singleRoutePayload) {
        var preferPrimary = getPreferPrimaryRouteOnNextNavUpdate();
        if (preferPrimary) {
            setPreferPrimaryRouteOnNextNavUpdate(false);
            console.log('[Reroute] Using primary route (post-deviation; skipping name match)');
        }
        var activeRoute = rt().routeSelection().pickActiveRouteDuringNavigation(
            routeList,
            singleRoutePayload,
            {
                preferPrimary: preferPrimary,
                previousRouteName: rt().getLastCalculatedRoute() ? rt().getLastCalculatedRoute().name : '',
            }
        );
        if (!preferPrimary && routeList && routeList.length > 1 && rt().getLastCalculatedRoute() && activeRoute !== routeList[0]) {
            console.log('[Reroute] Matched previous route "' + activeRoute.name + '"');
        }
        return activeRoute;
    }

    function resolveNavigationDestination() {
        var ND = rt().navigationDestination();
        var collect = ND.buildResolveNavigationDestinationCollectPlan({
            lastCalculatedRoute: rt().getLastCalculatedRoute(),
            routePolyline: rt().getRoutePolyline(),
        });
        var sources = ND.readNavigationDestinationSources({
            lastRouteDestination: collect.lastRouteDestination,
            endElement: document.getElementById(collect.endElementId),
            polylineEnd: collect.polylineEnd,
        });
        return ND.resolveDestinationLatLon(sources);
    }

    function buildRouteRequest(startLat, startLon, destination, avoidPoints) {
        if (avoidPoints === undefined) avoidPoints = null;
        var RR = rt().routingRequest();
        var collect = RR.buildRouteRequestCollectPlan({
            storage: localStorage,
            startLat: startLat,
            startLon: startLon,
            destination: destination,
            avoidPoints: avoidPoints,
            routingMode: rt().getCurrentRoutingMode() || 'auto',
            vehicleType: rt().getCurrentVehicleType() || 'petrol_diesel',
            costParams: rt().call.getRouteCostParams(rt().getCurrentVehicleType()),
            isAvoidTollsEnabled: rt().call.isAvoidTollsEnabled(),
            routePrefs: (typeof rt().call.getRoutePreferences === 'function') ? rt().call.getRoutePreferences() : {},
        });
        return RR.buildAutomaticRerouteRequestPlan(collect.storage, collect.opts);
    }

    function applyDeviationRerouteState(dev) {
        setDeviationStartTimeCheck(dev.deviationStartTimeCheck);
        setRerouteAttemptCount(dev.rerouteAttemptCount);
        setPostRerouteGraceUntil(dev.postRerouteGraceUntil);
        setRouteJoinConfirmedForDeviation(dev.routeJoinConfirmedForDeviation);
        setDeviationOffRouteStreak(dev.deviationOffRouteStreak);
        setLastRerouteTime(dev.lastRerouteTime);
        setLastRerouteAttemptTime(dev.lastRerouteAttemptTime);
        setRerouteInProgress(dev.rerouteInProgress);
        if (dev.clearFailureRetries) rt().call.clearRerouteFailureRetries();
    }

    function applyVoiceAnnouncementStateResetFromPlan(execute) {
        if (!execute || !execute.shouldReset) return;
        var p = execute.patch;
        rt().setLastETAAnnouncementTime(p.lastETAAnnouncementTime);
        rt().setLastAnnouncedETA(p.lastAnnouncedETA);
        rt().setLastDestinationAnnouncementDistance(p.lastDestinationAnnouncementDistance);
        rt().setLastTurnDetectRouteVertexIndex(p.lastTurnDetectRouteVertexIndex);
        rt().setInitialETAMovementRetries(p.initialETAMovementRetries);
        rt().setVoiceAnnouncedForManeuverIndex(p.voiceAnnouncedForManeuverIndex);
        rt().setVoiceAnnouncedCategory(p.voiceAnnouncedCategory);
        if (execute.clearTurnThresholds) rt().getAnnouncedTurnThresholds().clear();
        if (execute.clearExitThresholds) rt().getAnnouncedExitThresholds().clear();
        if (execute.clearKeepThresholds) rt().getAnnouncedKeepThresholds().clear();
        if (execute.clearInitialEtaAnnouncement) rt().call.clearInitialETAAnnouncement();
        if (p.lastLaneVoiceKey !== undefined) {
            rt().call.setLastLaneVoiceKey(p.lastLaneVoiceKey);
        }
    }

    function resetVoiceAnnouncementStateForNewRoute() {
        applyVoiceAnnouncementStateResetFromPlan(
            rt().voiceAnnouncements().buildVoiceAnnouncementStateResetExecutePlan(Date.now())
        );
    }

    function applyRouteMapUpdateStateFromPlan(plan, newRoute) {
        var RD = rt().rerouteDecision();
        var execute = RD.buildRouteMapUpdateStateExecutePlan(plan, {
            currentLat: rt().getCurrentLat(),
            currentLon: rt().getCurrentLon(),
            newRoute: newRoute,
        });

        if (execute.maneuvers) {
            rt().setCurrentRouteSteps(execute.maneuvers.steps);
            if (execute.maneuvers.logMessage) console.log(execute.maneuvers.logMessage);
        }

        if (execute.vehicleMarkerReset) {
            rt().call.resetVehicleMarkerDisplayState();
        }

        var speedReset = execute.speedLimitReset;
        if (speedReset && speedReset.shouldReset) {
            var SL = rt().speedLimitWidget();
            var resetPlan = SL
                ? SL.buildSpeedLimitFetchResetApplyPlan(
                    speedReset.kind === 'full-reroute'
                        ? { kind: speedReset.kind }
                        : {
                            kind: speedReset.kind,
                            newLastActiveManeuverIdx: speedReset.newLastActiveManeuverIdx,
                            resetCurrentSpeedLimitMph: speedReset.resetCurrentSpeedLimitMph,
                            resetDetectedRoadType: speedReset.resetDetectedRoadType,
                        }
                )
                : null;
            if (resetPlan) rt().call.applySpeedLimitFetchResetFromPlan(resetPlan);
        }

        var progress = execute.progress;
        if (progress.action === 'primeVehicleMarker') {
            rt().call.primeVehicleMarkerOnRoute(rt().getCurrentLat(), rt().getCurrentLon());
        } else if (progress.action === 'resetProgress' && progress.patch) {
            rt().setCurrentStepIndex(progress.patch.currentStepIndex);
            rt().setLastSnappedRouteIndex(progress.patch.lastSnappedRouteIndex);
            rt().setLastTurnDetectRouteVertexIndex(progress.patch.lastTurnDetectRouteVertexIndex);
        }

        if (execute.roadNameReset) {
            rt().call.resetRoadNameState();
        }
        if (execute.navigationArrivalReset) {
            rt().call.resetNavigationArrivalState();
        }

        var dev = execute.deviation;
        if (dev) {
            applyDeviationRerouteState(dev);
        }

        var post = execute.post;
        if (post.refreshTurnWidget) {
            rt().call.updateTurnWidgetFromPosition(rt().getCurrentLat(), rt().getCurrentLon());
        }
        if (post.fetchRoadName) {
            rt().call.fetchRoadNameThrottled(rt().getCurrentLat(), rt().getCurrentLon());
        }
        if (execute.tripInfo) {
            rt().call.updateTripInfo(
                execute.tripInfo.distance_km,
                execute.tripInfo.duration_minutes,
                execute.tripInfo.fuel_cost,
                execute.tripInfo.toll_cost
            );
        }
        if (post.patchLastCalculatedRoute) {
            rt().setLastCalculatedRoute(execute.lastCalculatedRoutePatch);
        }
        if (post.completeLog) console.log(post.completeLog);
    }

    function updateRouteOnMap(newRoute) {
        var RD = rt().rerouteDecision();
        var plan = RD.buildRouteMapUpdateStatePlan(newRoute, rt().getLastCalculatedRoute(), {
            now: Date.now(),
            hasCurrentGps: rt().getCurrentLat() != null && rt().getCurrentLon() != null,
            convertDistance: rt().call.convertDistance,
            distUnit: rt().call.getDistanceUnit(),
        });
        var execute = RD.buildUpdateRouteOnMapExecutePlan(plan);

        if (execute.resetVoiceAnnouncementState) {
            resetVoiceAnnouncementStateForNewRoute();
        }

        var routeLayer = rt().getRouteLayer();
        if (execute.removeExistingRouteLayer && routeLayer && typeof routeLayer.remove === 'function') {
            routeLayer.remove();
        }

        var routePolyline = rt().call.decodePolyline(newRoute.geometry, execute.polylineDecodePrecision);
        rt().setRoutePolyline(routePolyline);
        console.log(execute.polylineLogPrefix + ' ' + routePolyline.length + ' points');

        if (execute.mountActiveNavRoute) {
            var mapTheme = typeof localStorage !== 'undefined'
                ? localStorage.getItem('mapTheme') || 'standard'
                : 'standard';
            var mount = rt().routeSelection().buildNavActiveRouteLayerMountPlan({
                routePolyline: routePolyline,
                navRouteColor: rt().call.navActiveRouteColor(),
                mapTheme: mapTheme,
            });
            rt().setRouteLayer(
                rt().getMapLibreHelpers().addPolyline(rt().getMap(), mount.polyline, mount.style)
            );
        }
        if (execute.bringNavRouteAboveTraffic) {
            rt().call.bringNavRouteAboveTrafficEdges();
        }

        if (execute.applyRouteMapUpdateState) {
            applyRouteMapUpdateStateFromPlan(plan, newRoute);
        }
    }

    function getNavActiveRoutePolylineOptions() {
        var mapTheme = typeof localStorage !== 'undefined'
            ? localStorage.getItem('mapTheme') || 'standard'
            : 'standard';
        return rt().routeSelection().buildNavActiveRoutePolylineStyle(
            rt().call.navActiveRouteColor(),
            mapTheme
        );
    }

    function redrawNavigationRouteLayer(reason) {
        var RS = rt().routeSelection();
        var guard = RS.buildNavRouteLayerRedrawGuardPlan({
            routeInProgress: rt().getRouteInProgress(),
            map: rt().getMap(),
            routePolyline: rt().getRoutePolyline(),
        });
        if (!guard.shouldRedraw) return;
        try {
            var routeLayer = rt().getRouteLayer();
            if (routeLayer && typeof routeLayer.remove === 'function') {
                routeLayer.remove();
            }
            var mapTheme = typeof localStorage !== 'undefined'
                ? localStorage.getItem('mapTheme') || 'standard'
                : 'standard';
            var mount = RS.buildNavActiveRouteLayerMountPlan({
                routePolyline: rt().getRoutePolyline(),
                navRouteColor: rt().call.navActiveRouteColor(),
                mapTheme: mapTheme,
            });
            rt().setRouteLayer(
                rt().getMapLibreHelpers().addPolyline(rt().getMap(), mount.polyline, mount.style)
            );
            rt().call.bringNavRouteAboveTrafficEdges();
            if (reason) {
                console.log('[Nav] Route layer redrawn:', reason);
            }
        } catch (e) {
            console.warn('[Nav] Route layer redraw failed:', e);
        }
    }

    function redrawNavigationVehicleMarker(reason) {
        if (!rt().getRouteInProgress() || !rt().getMap()) return;
        var lat = rt().getCurrentLat();
        var lon = rt().getCurrentLon();
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        try {
            var SG = rt().speedGps();
            var currentUserMarker = rt().getCurrentUserMarker();
            var heading = currentUserMarker && Number.isFinite(currentUserMarker.heading)
                ? currentUserMarker.heading
                : 0;
            var speed = currentUserMarker && Number.isFinite(currentUserMarker.speed)
                ? currentUserMarker.speed
                : 0;
            var acc = currentUserMarker && Number.isFinite(currentUserMarker.accuracy)
                ? currentUserMarker.accuracy
                : null;
            var map = rt().getMap();

            var redraw = SG.buildNavigationVehicleMarkerRedrawPlan({
                lat: lat,
                lon: lon,
                accuracy: acc,
                routeInProgress: rt().getRouteInProgress(),
                routePolyline: rt().getRoutePolyline(),
                snapped: rt().call.resolveGpsRouteSnapForTick(lat, lon),
                gpsHeadingForBlend: heading,
                lastSnappedRouteIndex: rt().getLastSnappedRouteIndex(),
                prevSnapBlendWeightState: root.VoyagrGpsOrchestration.getSnapBlendWeightState(),
                smoothDisplayLat: root.VoyagrGpsOrchestration.getSmoothDisplayLat(),
                smoothDisplayLon: root.VoyagrGpsOrchestration.getSmoothDisplayLon(),
                useSmoothCoordsOnly: root.VoyagrGpsOrchestration.getSmoothDisplayLat() != null
                    && root.VoyagrGpsOrchestration.getSmoothDisplayLon() != null,
                speedMph: speed,
                speed: speed,
                hasMarker: !!currentUserMarker,
                canSetLngLat: !!(currentUserMarker && typeof currentUserMarker.setLngLat === 'function'),
                markerOnMap: !!(currentUserMarker && currentUserMarker._map),
                mapBearing: map && typeof map.getBearing === 'function' ? map.getBearing() : 0,
                calculateBearing: function (a, b, c, d) { return rt().routeGeometry().bearing(a, b, c, d); },
                blendHeadingsCircular: rt().routeGeometry().blendHeadingsCircular,
            });

            rt().call.applyVehicleMarkerFromTickPlan(redraw.markerTick);
            if (redraw.reattachToMap && currentUserMarker && typeof currentUserMarker.addTo === 'function') {
                currentUserMarker.addTo(map);
            }
            if (reason) {
                console.log('[Nav] Vehicle marker redrawn:', reason);
            }
        } catch (e) {
            console.warn('[Nav] Vehicle marker redraw failed:', e);
        }
    }

    function redrawNavigationOverlaysAfterMapRecovery(reason) {
        if (!rt().getRouteInProgress()) return;
        redrawNavigationRouteLayer(reason);
        redrawNavigationVehicleMarker(reason);
        var lat = rt().getCurrentLat();
        var lon = rt().getCurrentLon();
        if (lat != null && lon != null) {
            rt().call.updateTurnWidgetFromPosition(lat, lon);
        }
    }

    function seedNavigationProgressOnNewRoute(lat, lon) {
        var routePolyline = rt().getRoutePolyline();
        if (!routePolyline || routePolyline.length < 2) return;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        var snapPlan = rt().routeGeometry().buildGpsRouteSnapTickPlan({
            lat: lat,
            lon: lon,
            routeInProgress: true,
            routePolyline: routePolyline,
            lastSnappedRouteIndex: 0,
            searchStartIndex: 0,
        });
        var snap = snapPlan.snapped;
        if (!snap) return;
        var idx = Math.max(0, Math.min(snap.index, routePolyline.length - 2));
        var plan = rt().routeProgress().buildNavigationProgressSeedPlan(
            idx,
            snap.distance,
            rt().getCurrentRouteSteps(),
            rt().rerouteDecision().DEFAULTS.ROUTE_JOIN_GATE_METERS
        );

        rt().setLastSnappedRouteIndex(plan.lastSnappedRouteIndex);
        rt().setLastTurnDetectRouteVertexIndex(plan.lastTurnDetectRouteVertexIndex);
        rt().setCurrentStepIndex(plan.currentStepIndex);
        if (plan.routeJoinConfirmedForDeviation) {
            setRouteJoinConfirmedForDeviation(true);
        }

        console.log(plan.logMessage);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        win.__voyagrRedrawNavigationOverlays = redrawNavigationOverlaysAfterMapRecovery;
    }

    var api = {
        bind: bind,
        pickActiveRouteDuringNavigation: pickActiveRouteDuringNavigation,
        resolveNavigationDestination: resolveNavigationDestination,
        buildRouteRequest: buildRouteRequest,
        applyVoiceAnnouncementStateResetFromPlan: applyVoiceAnnouncementStateResetFromPlan,
        resetVoiceAnnouncementStateForNewRoute: resetVoiceAnnouncementStateForNewRoute,
        applyRouteMapUpdateStateFromPlan: applyRouteMapUpdateStateFromPlan,
        updateRouteOnMap: updateRouteOnMap,
        getNavActiveRoutePolylineOptions: getNavActiveRoutePolylineOptions,
        redrawNavigationRouteLayer: redrawNavigationRouteLayer,
        redrawNavigationVehicleMarker: redrawNavigationVehicleMarker,
        redrawNavigationOverlaysAfterMapRecovery: redrawNavigationOverlaysAfterMapRecovery,
        seedNavigationProgressOnNewRoute: seedNavigationProgressOnNewRoute,
        getRouteJoinConfirmedForDeviation: getRouteJoinConfirmedForDeviation,
        setRouteJoinConfirmedForDeviation: setRouteJoinConfirmedForDeviation,
        getPreferPrimaryRouteOnNextNavUpdate: getPreferPrimaryRouteOnNextNavUpdate,
        setPreferPrimaryRouteOnNextNavUpdate: setPreferPrimaryRouteOnNextNavUpdate,
        getDeviationStartTimeCheck: getDeviationStartTimeCheck,
        setDeviationStartTimeCheck: setDeviationStartTimeCheck,
        getDeviationOffRouteStreak: getDeviationOffRouteStreak,
        setDeviationOffRouteStreak: setDeviationOffRouteStreak,
        getRerouteAttemptCount: getRerouteAttemptCount,
        setRerouteAttemptCount: setRerouteAttemptCount,
        getPostRerouteGraceUntil: getPostRerouteGraceUntil,
        setPostRerouteGraceUntil: setPostRerouteGraceUntil,
        getLastRerouteTime: getLastRerouteTime,
        setLastRerouteTime: setLastRerouteTime,
        getLastRerouteAttemptTime: getLastRerouteAttemptTime,
        setLastRerouteAttemptTime: setLastRerouteAttemptTime,
        getRerouteInProgress: getRerouteInProgress,
        setRerouteInProgress: setRerouteInProgress,
        getLastRerouteDeviation: getLastRerouteDeviation,
        setLastRerouteDeviation: setLastRerouteDeviation,
        getRerouteFailureRetryTimer: getRerouteFailureRetryTimer,
        setRerouteFailureRetryTimer: setRerouteFailureRetryTimer,
        getRerouteFailureRetryCount: getRerouteFailureRetryCount,
        setRerouteFailureRetryCount: setRerouteFailureRetryCount,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRerouteMapOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

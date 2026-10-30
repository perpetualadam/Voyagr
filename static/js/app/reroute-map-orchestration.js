/**
 * @file Reroute map update orchestration (route pick, map layer refresh, overlay redraw).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var authorisedCurrentRoute = null;
    var committingVerifiedTransition = false;
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

    function storedMapTheme() {
        var MT = root.VoyagrMapTheme;
        return MT && typeof MT.readStoredMapTheme === 'function'
            ? MT.readStoredMapTheme()
            : 'standard';
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
                previousRouteSource: rt().getLastCalculatedRoute() ? rt().getLastCalculatedRoute().source : '',
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
            isAvoidTollsEnabled: rt().call.isAvoidTollsEnabled,
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
        if (root.VoyagrVoiceAnnouncementsOrchestration && root.VoyagrVoiceAnnouncementsOrchestration.cancelNavigationSpeech) root.VoyagrVoiceAnnouncementsOrchestration.cancelNavigationSpeech();
        if (root.VoyagrLaneGuidanceOrchestration &&
                typeof root.VoyagrLaneGuidanceOrchestration.resetLaneGuidanceForNewRoute === 'function') {
            root.VoyagrLaneGuidanceOrchestration.resetLaneGuidanceForNewRoute();
        }
        applyVoiceAnnouncementStateResetFromPlan(
            rt().voiceAnnouncements().buildVoiceAnnouncementStateResetExecutePlan(Date.now())
        );
    }

    // Private post-commit effects. Protected route state is committed together
    // below; no caller can apply a partial state plan as a public mutation API.
    function applyRouteMapUpdateEffects(execute) {
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
        }

        if (execute.roadNameReset) {
            rt().call.resetRoadNameState();
        }
        if (execute.navigationArrivalReset) {
            rt().call.resetNavigationArrivalState();
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
        if (post.completeLog) console.log(post.completeLog);
    }

    function authoriseCurrentRouteRedraw() {
        try {
            const integrity = root.VoyagrAvoidanceIntegrity;
            const candidate = integrity.prepareNavigationCandidate(rt().getLastCalculatedRoute());
            if (!candidate || integrity.gate(candidate,{storage:localStorage,offline:navigator.onLine===false,quiet:true}) !== true ||
                    JSON.stringify(candidate.polyline) !== JSON.stringify(rt().getRoutePolyline()) ||
                    JSON.stringify(candidate.maneuvers) !== JSON.stringify(rt().getCurrentRouteSteps())) return false;
            authorisedCurrentRoute = JSON.parse(JSON.stringify(candidate));
            return true;
        } catch (_) { return false; }
    }

    function mounted(layer, points) {
        try { return rt().getMapLibreHelpers().isPolylineLayerMounted(rt().getMap(), layer, points) === true; }
        catch (_) { return false; }
    }
    function removeOwnedLayer(layer) {
        if (!layer) return true;
        try { layer.remove(); }
        catch (_) { /* Verify after the attempt, including swallowed renderer errors. */ }
        try { return rt().getMapLibreHelpers().isPolylineLayerRemoved(rt().getMap(), layer) === true; }
        catch (_) { return false; }
    }
    function inconsistentMap() {
        const lifecycle = root.VoyagrNavigationLifecycleOrchestration;
        if (lifecycle && typeof lifecycle.failNavigation === 'function') {
            lifecycle.failNavigation('inconsistent_map');
        }
        setRerouteInProgress(false);
        try { rt().call.showStatus('Navigation stopped: map resources are inconsistent. Recover the map and recalculate before starting again.', 'error'); } catch (_) { /* guidance already stopped */ }
        return {ok:false, scheduleRetry:false, reason:'inconsistent_map'};
    }
    function restoreTransition(pairs, previous) {
        committingVerifiedTransition = true;
        try {
            pairs.forEach(function(pair) {
                try { rt()['set'+pair[0]](previous[pair[0]]); } catch (_) { /* inspect state below */ }
            });
            return pairs.every(function(pair) { return rt()['get'+pair[0]]() === previous[pair[0]]; });
        } catch (_) { return false; }
        finally { committingVerifiedTransition = false; }
    }

    function updateRouteOnMap(newRoute, options) {
        options = options || {};
        var life = root.VoyagrNavigationLifecycleOrchestration;
        try {
            if (!life || typeof life.failNavigation!=='function' || typeof life.getNavigationFailure!=='function' ||
                    typeof life.getRouteInProgress!=='function' || typeof life.getRouteInProgress()!=='boolean') throw new Error('Lifecycle unavailable');
            if (life.getNavigationFailure()) throw new Error('Recovery required');
        } catch (_) {
            try { rt().call.showStatus('Navigation state unavailable or recovery required; route not replaced.', 'warning'); } catch (_) { /* unbound runtime */ }
            return {ok:false,reason:'navigation_recovery_required',scheduleRetry:false};
        }
        var verified = false;
        var candidate;
        try {
            var integrity = root.VoyagrAvoidanceIntegrity;
            candidate = newRoute && JSON.parse(JSON.stringify(newRoute));
            verified = !!candidate && !!integrity && typeof integrity.gate==='function' && integrity.gate(candidate, {
                storage:localStorage,automatic:true,quiet:true,offline:navigator.onLine===false,showStatus:rt().call.showStatus,
            })===true;
            candidate = verified && typeof integrity.prepareNavigationCandidate==='function'
                ? integrity.prepareNavigationCandidate(candidate) : null;
            verified = !!candidate;
        } catch (_) { /* Missing/broken verifier never authorizes replacement. */ }
        if (!verified) {
            rt().call.showStatus('Safety verification unavailable or route safety unresolved; current route retained.','warning');
            setRerouteInProgress(false);
            return {ok:false,scheduleRetry:false,reason:'avoidance_not_established'};
        }
        var staged = null;
        var previous;
        var previousDeviation;
        var state;
        var plan;
        var nextOptions;
        var nextIndex;
        var pairs = [
            ['RoutePolyline',candidate.polyline], ['CurrentRouteSteps',candidate.maneuvers],
            ['CurrentStepIndex',0], ['LastSnappedRouteIndex',0], ['LastTurnDetectRouteVertexIndex',0],
            ['LastCalculatedRoute',candidate], ['RouteOptions',null], ['SelectedRouteIndex',null], ['RouteLayer',null],
            ['NextManeuverDistance',0], ['NavigationArrivalTriggered',false], ['NavigationArrivalZoneSince',0],
        ];
        try {
            // All dependencies, plans, progress resets and map inputs are checked
            // before touching the current route. Never inherit old instructions.
            previousDeviation = {deviationStartTimeCheck:getDeviationStartTimeCheck(),rerouteAttemptCount:getRerouteAttemptCount(),
                postRerouteGraceUntil:getPostRerouteGraceUntil(),routeJoinConfirmedForDeviation:getRouteJoinConfirmedForDeviation(),
                deviationOffRouteStreak:getDeviationOffRouteStreak(),lastRerouteTime:getLastRerouteTime(),
                lastRerouteAttemptTime:getLastRerouteAttemptTime(),rerouteInProgress:getRerouteInProgress()};
            previous = {};
            pairs.forEach(function(pair) {
                if (typeof rt()['get'+pair[0]]!=='function' || typeof rt()['set'+pair[0]]!=='function') throw new Error('Incomplete runtime');
                previous[pair[0]] = rt()['get'+pair[0]]();
            });
            if (previous.RouteLayer && typeof previous.RouteLayer.remove!=='function') throw new Error('Invalid current layer');
            if (typeof rt().call.clearAllRouteLayerHandles!=='function') throw new Error('Map cleanup unavailable');
            if (!candidate.destination) candidate.destination = candidate.polyline[candidate.polyline.length-1].join(',');
            if (!candidate.destinationName) candidate.destinationName = candidate.destination;
            nextIndex = options.selectionIndex;
            if (nextIndex!==undefined) {
                if (!Number.isInteger(nextIndex) || !Array.isArray(previous.RouteOptions) || !previous.RouteOptions[nextIndex] || previous.RouteOptions[nextIndex]!==newRoute) throw new Error('Selection context changed');
                nextOptions = previous.RouteOptions.slice();
                nextOptions[nextIndex] = candidate;
            } else { nextOptions = [candidate]; nextIndex = 0; }
            pairs[6][1]=nextOptions; pairs[7][1]=nextIndex;
            var RD = rt().rerouteDecision();
            var hasCurrentGps = rt().getCurrentLat() != null && rt().getCurrentLon() != null;
            // During active navigation, automatic/traffic/in-nav recalcs start from GPS.
            // Seed join so GraphHopper Optimised hard-block snaps cannot leave monitoring
            // stuck in awaiting-join after a successful map update.
            var seedRouteJoinConfirmed = !!(rt().getRouteInProgress() && hasCurrentGps);
            plan = RD.buildRouteMapUpdateStatePlan(candidate, previous.LastCalculatedRoute, {
                now: Date.now(),
                hasCurrentGps: hasCurrentGps,
                seedRouteJoinConfirmed: seedRouteJoinConfirmed,
                convertDistance: rt().call.convertDistance,
                distUnit: rt().call.getDistanceUnit(),
                polylineDecodePrecision: candidate.geometry_precision,
            });
            // Use one candidate for identity/endpoints, geometry, evidence and steps.
            plan.lastCalculatedRoutePatch = candidate;
            state = RD.buildRouteMapUpdateStateExecutePlan(plan, {currentLat:rt().getCurrentLat(),currentLon:rt().getCurrentLon(),newRoute:candidate});
            if (!state || !state.deviation) throw new Error('Incomplete state plan');
            var map = rt().getMap();
            if (!map || typeof map.isStyleLoaded!=='function' || !map.isStyleLoaded()) throw new Error('Map not ready');
            var mount = rt().routeSelection().buildNavActiveRouteLayerMountPlan({
                    routePolyline: candidate.polyline,
                    navRouteColor: rt().call.navActiveRouteColor(),
                    mapTheme: storedMapTheme(),
                });
            if (!mount.valid) throw new Error('Invalid mount');
            if (rt().getMapLibreHelpers().invalidateDeferredPolylineMounts(map) !== true) throw new Error('Deferred map ownership unavailable');
            // Stage the new owned line while the old line remains available. No
            // asynchronous/pending mount may authorize an active-route transition.
            staged = rt().getMapLibreHelpers().addPolyline(map, mount.polyline, mount.style);
            if (!mounted(staged, candidate.polyline)) throw new Error('Map mount failed');
            pairs[8][1]=staged;
            try {
                // Synchronous setters only: no render/service callbacks or awaits
                // can observe a half-committed maneuver/geometry/progress context.
                committingVerifiedTransition = true;
                try {
                    pairs.forEach(function(pair) { rt()['set'+pair[0]](pair[1]); });
                    if (!pairs.every(function(pair) { return rt()['get'+pair[0]]() === pair[1]; })) throw new Error('State commitment incomplete');
                }
                finally { committingVerifiedTransition = false; }
                applyDeviationRerouteState(state.deviation);
            } catch (error) {
                if (!restoreTransition(pairs, previous)) {
                    removeOwnedLayer(staged);
                    return inconsistentMap();
                }
                applyDeviationRerouteState(previousDeviation);
                throw error;
            }
        } catch (_) {
            if (staged && !removeOwnedLayer(staged)) return inconsistentMap();
            setRerouteInProgress(false);
            rt().call.showStatus('Route update incomplete; current route retained. Recalculate when the map is ready.', 'warning');
            return {ok:false,scheduleRetry:false,reason:'route_transition_unavailable'};
        }
        // Cleanup is part of the transition outcome. If the old verified line
        // remains intact, bounded rollback can restore the old route. Otherwise
        // stop guidance; a blank/contradictory map is never successful navigation.
        if (previous.RouteLayer && previous.RouteLayer !== staged && !removeOwnedLayer(previous.RouteLayer)) {
            var oldIntact = mounted(previous.RouteLayer, previous.RoutePolyline);
            var stageRemoved = removeOwnedLayer(staged);
            if (oldIntact && stageRemoved && restoreTransition(pairs, previous)) {
                applyDeviationRerouteState(previousDeviation);
                rt().call.showStatus('Route replacement refused: the previous map line could not be removed. Current route retained.', 'warning');
                return {ok:false,reason:'route_cleanup_failed',scheduleRetry:false};
            }
            return inconsistentMap();
        }
        try {
            if (rt().call.clearAllRouteLayerHandles() !== true || !mounted(staged,candidate.polyline)) return inconsistentMap();
        } catch (_) { return inconsistentMap(); }
        authorisedCurrentRoute = JSON.parse(JSON.stringify(candidate));
        window.lastRouteApiResponse = null;
        try {
            if (state.deviation.clearFailureRetries) rt().call.clearRerouteFailureRetries();
            resetVoiceAnnouncementStateForNewRoute();
            applyRouteMapUpdateEffects(state);
            rt().call.bringNavRouteAboveTrafficEdges();
            rt().call.clearRouteTrafficLayers();
            rt().call.fetchAndDisplayRouteTraffic();
        } catch (_) { rt().call.showStatus('Route updated; some display services could not refresh.', 'warning'); }
        return { ok: true };
    }

    function getNavActiveRoutePolylineOptions() {
        var mapTheme = storedMapTheme();
        return rt().routeSelection().buildNavActiveRoutePolylineStyle(
            rt().call.navActiveRouteColor(),
            mapTheme
        );
    }

    function redrawNavigationRouteLayer(reason) {
        var previous, staged;
        try {
            const life = root.VoyagrNavigationLifecycleOrchestration;
            if (!life || life.getRouteInProgress() !== true || (life.getNavigationFailure && life.getNavigationFailure())) return false;
            const candidate = authorisedCurrentRoute;
            // Immutable context recorded only after the real verifier authorises
            // a complete route. A redraw can outlive assessment freshness and
            // connectivity, but cannot authorise a different route or assessment.
            if (!candidate || JSON.stringify(candidate) !== JSON.stringify(rt().getLastCalculatedRoute()) ||
                    JSON.stringify(candidate.polyline) !== JSON.stringify(rt().getRoutePolyline()) ||
                    JSON.stringify(candidate.maneuvers) !== JSON.stringify(rt().getCurrentRouteSteps())) return inconsistentMap();
            previous = rt().getRouteLayer();
            const map = rt().getMap();
            if (!map || !map.isStyleLoaded()) return false;
            const mount = rt().routeSelection().buildNavActiveRouteLayerMountPlan({
                routePolyline:candidate.polyline,navRouteColor:rt().call.navActiveRouteColor(),mapTheme:storedMapTheme(),
            });
            if (!mount.valid) return false;
            staged = rt().getMapLibreHelpers().addPolyline(map,mount.polyline,mount.style);
            if (!mounted(staged,candidate.polyline)) throw new Error('Recovery mount failed');
            if (previous && !removeOwnedLayer(previous)) {
                const intact = mounted(previous,candidate.polyline);
                if (removeOwnedLayer(staged) && intact) return false;
                return inconsistentMap();
            }
            rt().setRouteLayer(staged);
            if (rt().getRouteLayer() !== staged) throw new Error('Recovery handle commitment failed');
            rt().call.bringNavRouteAboveTrafficEdges();
            if (reason) console.log('[Nav] Route layer redrawn:',reason);
            return true;
        } catch (_) {
            const clean = !staged || removeOwnedLayer(staged);
            if (!clean || !mounted(previous,rt().getRoutePolyline())) return inconsistentMap();
            try { rt().call.showStatus('Map recovery failed; previous verified route retained.', 'warning'); } catch (_) { /* optional display */ }
            return false;
        }
    }

    function redrawNavigationVehicleMarker(reason) {
        if ((!rt().getRouteInProgress() && !rt().getIsTrackingActive()) || !rt().getMap()) return;
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

            // Prefer current GPS/route-snap coords on recovery. Using smooth-only
            // re-pins the icon at a pre-pause location after screen-off/background.
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
                useSmoothCoordsOnly: false,
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
        const life = root.VoyagrNavigationLifecycleOrchestration;
        if (life && life.getNavigationFailure && life.getNavigationFailure() && life.recoverNavigationMap) {
            life.recoverNavigationMap();
        }
        if (!rt().getRouteInProgress() && !rt().getIsTrackingActive()) return;
        if (rt().getRouteInProgress()) {
            redrawNavigationRouteLayer(reason);
            // Soft style reload / radio-swap recover often races style.load; retry
            // remount so the nav polyline is not left blank after basemap returns.
            var MR = root.VoyagrMapRecovery;
            var retryDelays = MR && typeof MR.buildNavOverlayRedrawRetryDelaysMs === 'function'
                ? MR.buildNavOverlayRedrawRetryDelaysMs()
                : [700, 2000];
            for (var ri = 0; ri < retryDelays.length; ri++) {
                (function (delayMs) {
                    setTimeout(function () {
                        try {
                            if (!rt().getRouteInProgress()) return;
                            redrawNavigationRouteLayer(
                                (reason || 'map recover') + ' retry+' + delayMs + 'ms'
                            );
                        } catch (_) { /* ignore */ }
                    }, delayMs);
                })(retryDelays[ri]);
            }
        }
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
        authorisedCurrentRoute = null;
        win.__voyagrRedrawNavigationOverlays = redrawNavigationOverlaysAfterMapRecovery;
    }

    var api = {
        bind: bind,
        authoriseCurrentRouteRedraw:authoriseCurrentRouteRedraw,
        isCommittingVerifiedTransition:function() { return committingVerifiedTransition; },
        pickActiveRouteDuringNavigation: pickActiveRouteDuringNavigation,
        resolveNavigationDestination: resolveNavigationDestination,
        buildRouteRequest: buildRouteRequest,
        applyVoiceAnnouncementStateResetFromPlan: applyVoiceAnnouncementStateResetFromPlan,
        resetVoiceAnnouncementStateForNewRoute: resetVoiceAnnouncementStateForNewRoute,
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

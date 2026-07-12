/**
 * @file GPS tracking tick pipeline, navigation side-effects, deviation reroute, hazard alerts.
 * Extracted from voyagr-app.js; shared state stays in the monolith via bind(runtime).
 */
(function (root) {
    'use strict';

    var runtime = null;

    var snapBlendWeightState = 0;
    var smoothDisplayLat = null;
    var smoothDisplayLon = null;
    var trackingHistory = [];
    var isTrackingActive = false;
    var gpsWatchId = null;
    var currentUserMarker = null;
    var currentUserMarkerIcon = null;

    function getTrackingHistory() { return trackingHistory; }
    function setTrackingHistory(val) { trackingHistory = val; }
    function getIsTrackingActive() { return isTrackingActive; }
    function setIsTrackingActive(val) { isTrackingActive = !!val; }
    function getGpsWatchId() { return gpsWatchId; }
    function setGpsWatchId(val) { gpsWatchId = val; }
    function getCurrentUserMarker() { return currentUserMarker; }
    function setCurrentUserMarker(val) { currentUserMarker = val; }
    function getCurrentUserMarkerIcon() { return currentUserMarkerIcon; }
    function setCurrentUserMarkerIcon(val) { currentUserMarkerIcon = val; }

    function getSnapBlendWeightState() { return snapBlendWeightState; }
    function setSnapBlendWeightState(val) { snapBlendWeightState = val; }
    function getSmoothDisplayLat() { return smoothDisplayLat; }
    function setSmoothDisplayLat(val) { smoothDisplayLat = val; }
    function getSmoothDisplayLon() { return smoothDisplayLon; }
    function setSmoothDisplayLon(val) { smoothDisplayLon = val; }

    function rt() {
        if (!runtime) {
            throw new Error('[GPS] Orchestration runtime not bound');
        }
        return runtime;
    }

    function sgModule() { return rt().m.speedGps(); }
    function cpModule() { return rt().m.cameraPitch(); }
    function rgModule() { return rt().m.routeGeometry(); }
    function rpModule() { return rt().m.routeProgress(); }
    function rdModule() { return rt().m.rerouteDecision(); }
    function etaModule() { return rt().m.eta(); }
    function vaModule() { return rt().m.voiceAnnouncements(); }
    function haModule() { return rt().m.hazardAlerts(); }
    function slModule() { return rt().m.speedLimitWidget(); }
    function mcModule() { return rt().m.mapControls(); }
    function tuModule() { return rt().m.toggleUI(); }
    function tcModule() { return rt().m.trafficChange(); }
    function rsModule() { return rt().m.routeSelection(); }
    function ndModule() { return rt().m.navigationDestination(); }
    function rrModule() { return rt().m.routingRequest(); }

    function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
        return rgModule().haversineDistanceMeters(lat1, lon1, lat2, lon2);
    }

    function resolveGpsRouteSnapForTick(lat, lon) {
        const RG = rgModule();
        const plan = RG.buildGpsRouteSnapTickPlan({
            lat: lat,
            lon: lon,
            routeInProgress: rt().g('routeInProgress'),
            routePolyline: rt().g('routePolyline'),
            lastSnappedRouteIndex: rt().g('lastSnappedRouteIndex'),
        });
        return plan.snapped;
    }

    function getVehicleDisplayCoordinates() {
        const SG = sgModule();
        const RG = rgModule();
        const currentLat = rt().g('currentLat');
        const currentLon = rt().g('currentLon');
        return SG.buildVehicleDisplayCoordinatesPlan({
            lat: currentLat,
            lon: currentLon,
            routeInProgress: rt().g('routeInProgress'),
            routePolyline: rt().g('routePolyline'),
            snapped: resolveGpsRouteSnapForTick(currentLat, currentLon),
            lastSnappedRouteIndex: rt().g('lastSnappedRouteIndex'),
            prevSnapBlendWeightState: getSnapBlendWeightState(),
            smoothDisplayLat: getSmoothDisplayLat(),
            smoothDisplayLon: getSmoothDisplayLon(),
            useSmoothCoordsOnly: getSmoothDisplayLat() != null && getSmoothDisplayLon() != null,
            calculateBearing: (a, b, c, d) => RG.bearing(a, b, c, d),
            blendHeadingsCircular: RG.blendHeadingsCircular,
        });
    }

    // ===== GPS TRACKING FUNCTIONS =====
    /**
     * Apply follow-camera ease for one GPS tick; returns zoom coordination flags.
     * @param {number} markerLat
     * @param {number} markerLon
     * @param {number} followJumpM
     * @param {number} speedMph
     * @param {number} heading
     * @param {string} roadType
     * @returns {{ navigationFollowEaseApplied: boolean, navigationFollowZoom: (number|null) }}
     */
    function applyGpsFollowCameraTick(markerLat, markerLon, followJumpM, speedMph, heading, roadType) {
        const CP = cpModule();
        const followPlan = CP.buildNavigationFollowEasePlan({
            nowMs: Date.now(),
            lastFollowEaseAt: window.__voyagrLastFollowEaseAt || 0,
            followJumpM,
            zoomAndFollowEnabled: rt().g('zoomAndFollowEnabled'),
            mapFollowingActive: rt().g('mapFollowingActive'),
            mapUserPanned: !!(rt().g('map') && rt().g('map')._userPanned),
            routeInProgress: rt().g('routeInProgress'),
        });

        const followCamera = (followPlan.mode === 'navigation' && rt().g('map'))
            ? CP.buildNavigationFollowCameraPlan({
                speedMph,
                roadType: roadType || 'unknown',
                heading: heading || rt().g('map').getBearing(),
                mapBearing: rt().g('map').getBearing(),
                markerLat,
                markerLon,
                shouldEase: followPlan.shouldEase,
                durationMs: followPlan.durationMs,
                shouldTilt: rt().call.shouldTiltDrivingCamera(),
                usePitchedDrivingCamera: rt().call.shouldUsePitchedDrivingCamera(),
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
                computeSmartZoom: (spd, dist, roadType) => rgModule().calculateSmartZoom(
                    spd, dist, roadType, rt().consts.ZOOM_LEVELS, rt().consts.TURN_ZOOM_THRESHOLD
                ),
            })
            : null;

        const apply = CP.buildNavigationFollowApplyPlan({
            hasMap: !!rt().g('map'),
            followEasePlan: followPlan,
            followCameraPlan: followCamera,
            markerLat,
            markerLon,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            isActiveNavigationFollow: rt().call.isActiveNavigationFollow(),
            driverPerspectiveEnabled: rt().g('driverPerspectiveEnabled'),
        });

        if (apply.statePatch) {
            window.__voyagrLastFollowEaseAt = apply.statePatch.lastFollowEaseAt;
            window.__voyagrLastFollowCenterGeo = apply.statePatch.lastFollowCenterGeo;
        }
        if (apply.easeTo && rt().g('map')) {
            rt().g('map').easeTo(apply.easeTo);
        }
        if (apply.logLine) console.log(apply.logLine);
        if (apply.updateRecenterVisibility) rt().call.updateRecenterButtonVisibility();

        return {
            navigationFollowEaseApplied: !!apply.navigationFollowEaseApplied,
            navigationFollowZoom: apply.navigationFollowZoom,
        };
    }

    /**
     * Apply a vehicle marker tick plan (update existing or create fresh).
     * @param {Object} markerTick - from buildVehicleMarkerTickPlan
     */
    function applyVehicleMarkerFromTickPlan(markerTick) {
        if (!markerTick) return;

        if (markerTick.action === 'update') {
            getCurrentUserMarker().setLngLat(markerTick.lngLat);
            const markerEl = getCurrentUserMarker().getElement ? getCurrentUserMarker().getElement() : null;
            if (markerEl) {
                const inner = markerEl.querySelector('div');
                if (inner) {
                    inner.style.transform = `rotate(${markerTick.rotationDeg}deg)`;
                }
            }
            getCurrentUserMarker().heading = markerTick.heading;
            getCurrentUserMarker().speed = markerTick.speed;
            getCurrentUserMarker().accuracy = markerTick.accuracy;
            return;
        }

        if (getCurrentUserMarker() && typeof getCurrentUserMarker().remove === 'function') {
            getCurrentUserMarker().remove();
        }
        setCurrentUserMarker(rt().call.createVehicleMarker(
            markerTick.lat,
            markerTick.lon,
            markerTick.speed,
            markerTick.accuracy,
            markerTick.heading
        ));
        getCurrentUserMarker().addTo(rt().g('map'));
    }

    /**
     * Update or create the vehicle marker from a GPS tick plan.
     * @param {number} markerLat
     * @param {number} markerLon
     * @param {number} heading
     * @param {number} speed
     * @param {number} accuracy
     */
    function applyGpsVehicleMarkerTick(markerLat, markerLon, heading, speed, accuracy) {
        const SGpos = sgModule();
        const markerTick = SGpos
            ? SGpos.buildVehicleMarkerTickPlan({
                hasMarker: !!getCurrentUserMarker(),
                canSetLngLat: !!(getCurrentUserMarker() && typeof getCurrentUserMarker().setLngLat === 'function'),
                markerLat,
                markerLon,
                heading,
                speed,
                accuracy,
                mapBearing: rt().g('map') && typeof rt().g('map').getBearing === 'function' ? rt().g('map').getBearing() : 0,
            })
            : { action: 'create', lat: markerLat, lon: markerLon, speed, accuracy, heading };

        applyVehicleMarkerFromTickPlan(markerTick);
    }

    /**
     * Apply GPS position state patches from a position apply plan.
     * @param {Object} apply - from buildGpsPositionStateApplyPlan
     */
    function applyGpsPositionStateFromPlan(apply) {
        if (!apply || apply.action !== 'apply') return;
        const patch = apply.statePatch || {};
        if (patch.snapBlendWeightState != null) {
            setSnapBlendWeightState(patch.snapBlendWeightState);
        }
        if (patch.lastSnappedRouteIndex != null) {
            rt().s('lastSnappedRouteIndex',  patch.lastSnappedRouteIndex);
        }
        if (patch.smoothDisplayLat != null) {
            setSmoothDisplayLat(patch.smoothDisplayLat);
        }
        if (patch.smoothDisplayLon != null) {
            setSmoothDisplayLon(patch.smoothDisplayLon);
        }
    }

    /**
     * Apply speed-limit fetch state reset from buildSpeedLimitFetchResetApplyPlan.
     * @param {Object} resetPlan
     */
    function applySpeedLimitFetchResetFromPlan(resetPlan) {
        if (!resetPlan || resetPlan.action !== 'apply') return;

        if (resetPlan.newLastActiveManeuverIdx != null) {
            rt().s('_lastActiveManeuverIdx',  resetPlan.newLastActiveManeuverIdx);
        }

        const state = rt().call.getSpeedLimitFetchState();
        if (state) {
            if (resetPlan.resetFetchTimestamps) {
                state.lastFetchAt = 0;
            }
            if (resetPlan.resetLastPosition) {
                state.lastPosition = null;
            }
            if (resetPlan.resetCurrentLimitMph) {
                state.currentLimitMph = null;
            }
        }

        if (resetPlan.resetCurrentSpeedLimitMph) {
            rt().s('currentSpeedLimitMph',  null);
        }
        if (resetPlan.resetDetectedRoadType) {
            rt().s('lastDetectedRoadType',  null);
        }
    }

    /**
     * Apply speed widget update from buildSpeedWidgetApplyPlan result.
     * @param {Object} swPlan
     */
    function applySpeedWidgetFromApplyPlan(swPlan) {
        if (!swPlan || swPlan.action !== 'apply') return;

        if (swPlan.resetFetchState) {
            const SL = slModule();
            const resetPlan = SL
                ? SL.buildSpeedLimitFetchResetApplyPlan({
                    kind: 'maneuver-change',
                    newLastActiveManeuverIdx: swPlan.newLastActiveManeuverIdx,
                })
                : null;
            if (resetPlan) applySpeedLimitFetchResetFromPlan(resetPlan);
        }
        if (swPlan.updateWidget) {
            rt().call.updateSpeedWidget(swPlan.updateWidget.displaySpeedMph, swPlan.updateWidget.shownLimit);
        }
        if (swPlan.fetchHint) {
            rt().call.fetchSpeedLimitThrottled(
                swPlan.fetchHint.lat,
                swPlan.fetchHint.lon,
                swPlan.fetchHint.displaySpeedMph,
                swPlan.fetchHint.roadType,
                swPlan.fetchHint.valhallaSpeedLimitMph,
                swPlan.fetchHint.heading
            );
        }
    }

    /**
     * Turn detection, voice, and widget side-effects for one GPS tick.
     * @param {number} lat
     * @param {number} lon
     * @param {Object} turnPlan - from buildGpsNavigationSideEffectsTickPlan.turn
     * @returns {{ distanceToNextTurn: (number|null), turnInfoThisTick: (Object|null) }}
     */
    function applyGpsTurnSideEffectsTick(lat, lon, turnPlan) {
        let distanceToNextTurn = null;
        let turnInfoThisTick = null;

        if (turnPlan.detect) {
            turnInfoThisTick = rt().call.detectUpcomingTurn(lat, lon);
        }

        if (turnPlan.announce && turnInfoThisTick) {
            distanceToNextTurn = turnInfoThisTick.distance;
            announceUpcomingTurn(turnInfoThisTick);
        }

        if (turnPlan.updateWidget) {
            rt().call.updateTurnWidgetFromPosition(lat, lon, turnInfoThisTick);
        }

        return { distanceToNextTurn, turnInfoThisTick };
    }

    /**
     * Route deviation and hazard side-effects for one GPS tick.
     * @param {number} lat
     * @param {number} lon
     * @param {number} accuracy
     * @param {Object} tickPlan - from buildGpsNavigationSideEffectsTickPlan
     */
    function applyGpsHazardAndDeviationSideEffectsTick(lat, lon, accuracy, tickPlan) {
        if (tickPlan.checkDeviation) {
            checkRouteDeviation(lat, lon, accuracy);
        }
        if (tickPlan.processHazards) {
            processNavigationHazardAlerts(lat, lon);
        }
    }

    /**
     * Road name fetch side-effect for one GPS tick.
     * @param {number} lat
     * @param {number} lon
     * @param {Object} tickPlan - from buildGpsNavigationSideEffectsTickPlan
     */
    function applyGpsRoadNameSideEffectTick(lat, lon, tickPlan) {
        if (tickPlan.fetchRoadName) {
            rt().call.fetchRoadNameThrottled(lat, lon);
        }
    }

    /**
     * Destination and arrival voice side-effects for one GPS tick.
     * @param {number} lat
     * @param {number} lon
     * @param {number} speedMs
     * @param {Object} tickPlan - from buildGpsNavigationSideEffectsTickPlan
     */
    function applyGpsNavigationVoiceSideEffectsTick(lat, lon, speedMs, tickPlan) {
        if (tickPlan.announceDestination) {
            announceDistanceToDestination(lat, lon);
        }
        if (tickPlan.checkArrival) {
            checkNavigationArrival(lat, lon, speedMs);
        }
    }

    /**
     * Smart zoom side-effects for one GPS tick.
     * @param {Object} ctx
     * @returns {void}
     */
    function applyGpsZoomSideEffectsTick(ctx) {
        const {
            speedMph,
            distanceToNextTurn,
            speedLimitPlan,
            lat,
            lon,
            navigationFollowEaseApplied,
            navigationFollowZoom,
        } = ctx;

        const CP = cpModule();
        const zoomTick = CP.buildNavigationZoomTickPlan({
            smartZoomEnabled: VoyagrSmartZoomOrchestration.getSmartZoomEnabled(),
            routeInProgress: rt().g('routeInProgress'),
            navigationFollowEaseApplied,
            followZoom: navigationFollowZoom,
        });
        const zoomApply = CP.buildNavigationZoomApplyPlan(zoomTick, {
            speedMph,
            distanceToNextTurn,
            roadType: speedLimitPlan.roadType || 'unknown',
            lat,
            lon,
        });
        if (zoomApply.action !== 'apply') return;

        if (zoomApply.syncLastZoomLevel != null) {
            VoyagrSmartZoomOrchestration.setLastZoomLevel(zoomApply.syncLastZoomLevel);
        }
        if (zoomApply.applySmartZoom) {
            rt().call.applySmartZoomWithAnimation(
                zoomApply.applySmartZoom.speedMph,
                zoomApply.applySmartZoom.distanceToNextTurn,
                zoomApply.applySmartZoom.roadType,
                zoomApply.applySmartZoom.lat,
                zoomApply.applySmartZoom.lon
            );
        }
    }

    /**
     * Lane guidance and speed widget side-effects for one GPS tick.
     * @param {Object} ctx
     * @param {number} ctx.lat
     * @param {number} ctx.lon
     * @param {number} ctx.heading
     * @param {Object} ctx.tickPlan - from buildGpsNavigationSideEffectsTickPlan
     * @param {Object} ctx.speedLimitPlan
     */
    function applyGpsLaneAndSpeedSideEffectsTick(ctx) {
        const { lat, lon, heading, tickPlan, speedLimitPlan } = ctx;

        if (tickPlan.updateLaneGuidance) {
            const TI = _turnInstructions();
            const laneTick = TI.buildLaneGuidanceTickPlan({
                routeInProgress: rt().g('routeInProgress'),
                routeSteps: rt().g('currentRouteSteps'),
                currentStepIndex: rt().g('currentStepIndex'),
            });
            const laneApply = TI.buildLaneGuidanceTickApplyPlan(laneTick);
            if (laneApply.action === 'apply') {
                updateLaneGuidance(
                    lat,
                    lon,
                    heading,
                    laneApply.maneuverDir,
                    laneApply.roundaboutExitCount
                );
            }
        }

        if (tickPlan.showSpeedWidget) {
            const SL = slModule();
            const swPlan = SL
                ? SL.buildSpeedWidgetApplyPlan({
                    showSpeedWidget: tickPlan.showSpeedWidget,
                    speedLimitPlan,
                    routeInProgress: rt().g('routeInProgress'),
                    isTrackingActive: getIsTrackingActive(),
                    lat,
                    lon,
                    heading,
                })
                : { action: 'skip' };
            applySpeedWidgetFromApplyPlan(swPlan);
        }
    }

    /**
     * Navigation side-effects for one GPS tick (deviation, voice, zoom, lane, speed).
     * @param {Object} ctx
     * @returns {{ distanceToNextTurn: (number|null) }}
     */
    function applyGpsNavigationSideEffectsTick(ctx) {
        const {
            lat,
            lon,
            speed,
            accuracy,
            heading,
            speedMph,
            sideEffects,
            speedLimitPlan,
            navigationFollowEaseApplied,
            navigationFollowZoom,
        } = ctx;

        const tickPlan = rpModule().buildGpsNavigationSideEffectsTickPlan({ sideEffects });

        applyGpsHazardAndDeviationSideEffectsTick(lat, lon, accuracy, tickPlan);

        let distanceToNextTurn = null;

        if (tickPlan.turn.detect || tickPlan.turn.announce || tickPlan.turn.updateWidget) {
            const turnResult = applyGpsTurnSideEffectsTick(lat, lon, tickPlan.turn);
            distanceToNextTurn = turnResult.distanceToNextTurn;
        }

        if (tickPlan.announceDestination || tickPlan.checkArrival) {
            applyGpsNavigationVoiceSideEffectsTick(lat, lon, speed, tickPlan);
        }

        if (tickPlan.applyZoom) {
            applyGpsZoomSideEffectsTick({
                speedMph,
                distanceToNextTurn,
                speedLimitPlan,
                lat,
                lon,
                navigationFollowEaseApplied,
                navigationFollowZoom,
            });
        }

        if (tickPlan.updateLaneGuidance || tickPlan.showSpeedWidget) {
            applyGpsLaneAndSpeedSideEffectsTick({
                lat,
                lon,
                heading,
                tickPlan,
                speedLimitPlan,
            });
        }

        applyGpsRoadNameSideEffectTick(lat, lon, tickPlan);

        return { distanceToNextTurn };
    }

    /**
     * Marker, follow camera, and navigation side-effects after a position tick.
     * @param {Object} pos - from applyGpsPositionTick
     */
    function applyGpsTrackingSideEffectsFromPosition(pos) {
        applyGpsVehicleMarkerTick(pos.markerLat, pos.markerLon, pos.heading, pos.speed, pos.accuracy);

        const followState = applyGpsFollowCameraTick(
            pos.markerLat,
            pos.markerLon,
            pos.followJumpM,
            pos.speedMph,
            pos.heading,
            pos.speedLimitPlan.roadType || 'unknown'
        );

        applyGpsNavigationSideEffectsTick({
            lat: pos.lat,
            lon: pos.lon,
            speed: pos.speed,
            accuracy: pos.accuracy,
            heading: pos.heading,
            speedMph: pos.speedMph,
            sideEffects: pos.sideEffects,
            speedLimitPlan: pos.speedLimitPlan,
            navigationFollowEaseApplied: followState.navigationFollowEaseApplied,
            navigationFollowZoom: followState.navigationFollowZoom,
        });
    }

    /**
     * Coord sample, history, raw speed, and odometer for one GPS tick.
     * @param {Object} sample - from normalizeGeolocationCoordsSample
     * @returns {Object}
     */
    function applyGpsCoordSampleTick(sample) {
        const SG = sgModule();
        const tick = SG.buildGpsCoordSampleTickPlan({
            sample,
            trackingHistory: getTrackingHistory(),
            pickRawSpeedState: {
                lastGoodRawPickMph: rt().g('_lastGoodRawPickMph'),
                consecutiveDisplacementMoves: rt().g('_consecutiveDisplacementMoves'),
            },
            routeInProgress: rt().g('routeInProgress'),
            odometerState: { lastGeo: rt().g('_navOdometerLastGeo'), traveledMeters: rt().g('_navTraveledMeters') },
            nowMs: Date.now(),
            calculateDistanceMeters: calculateDistanceMeters,
        });
        const apply = SG.buildGpsCoordSampleStateApplyPlan(tick);
        if (apply.action !== 'apply') {
            return {
                lat: sample.lat,
                lon: sample.lon,
                accuracy: sample.accuracy,
                speed: sample.speedMs,
                deviceHeading: sample.deviceHeading,
                speedMph: 0,
            };
        }

        rt().s('currentLat',  apply.lat);
        rt().s('currentLon',  apply.lon);
        rt().call.updateRoadReportFabVisibility();

        const patch = apply.statePatch;
        if (patch.trackingHistory) {
            setTrackingHistory(patch.trackingHistory);
        }
        if (patch.pickRawSpeedState) {
            rt().s('_lastGoodRawPickMph',  patch.pickRawSpeedState.lastGoodRawPickMph);
            rt().s('_consecutiveDisplacementMoves',  patch.pickRawSpeedState.consecutiveDisplacementMoves);
        }
        if (patch.odometer) {
            rt().s('_navOdometerLastGeo',  patch.odometer.lastGeo);
            rt().s('_navTraveledMeters',  patch.odometer.traveledMeters);
        }

        return {
            lat: apply.lat,
            lon: apply.lon,
            accuracy: apply.accuracy,
            speed: apply.speed,
            deviceHeading: apply.deviceHeading,
            speedMph: apply.speedMph,
        };
    }

    /**
     * Build inputs for buildGpsPositionTickPlan from app navigation state.
     * @param {Object} coord - from applyGpsCoordSampleTick
     * @returns {Object}
     */
    function buildGpsPositionTickInputs(coord) {
        const SGhead = sgModule();
        const SL = slModule();
        return {
            lat: coord.lat,
            lon: coord.lon,
            accuracy: coord.accuracy,
            routeInProgress: rt().g('routeInProgress'),
            routePolyline: rt().g('routePolyline'),
            snapped: resolveGpsRouteSnapForTick(coord.lat, coord.lon),
            lastSnappedRouteIndex: rt().g('lastSnappedRouteIndex'),
            prevSnapBlendWeightState: getSnapBlendWeightState(),
            speedMph: coord.speedMph,
            smoothDisplayLat: getSmoothDisplayLat(),
            smoothDisplayLon: getSmoothDisplayLon(),
            lastFollowCenterGeo: window.__voyagrLastFollowCenterGeo,
            calculateDistanceMeters: calculateDistanceMeters,
            calculateBearing: (a, b, c, d) => rgModule().bearing(a, b, c, d),
            blendHeadingsCircular: rgModule().blendHeadingsCircular,
            resolveGpsHeading: () => (SGhead
                ? SGhead.resolveGpsHeadingDegrees({
                    deviceHeading: coord.deviceHeading,
                    speed: coord.speed,
                    trackingHistory: getTrackingHistory(),
                    calculateDistanceMeters: calculateDistanceMeters,
                })
                : 0),
            isTrackingActive: getIsTrackingActive(),
            currentRouteSteps: rt().g('currentRouteSteps'),
            displaySpeedMph: rt().call.smoothGpsSpeedMph(coord.speedMph),
            currentSpeedLimitMph: rt().g('currentSpeedLimitMph'),
            lastSpeedLimitRegion: rt().g('lastSpeedLimitRegion'),
            lastActiveManeuverIdx: rt().g('_lastActiveManeuverIdx'),
            resolveRoadType: (idx, spd) => rgModule().resolveCurrentRoadType({
                maneuverIdxOverride: idx,
                gpsSpeedMph: spd,
                currentRouteSteps: rt().g('currentRouteSteps'),
                currentStepIndex: rt().g('currentStepIndex'),
                lastDetectedRoadType: rt().g('lastDetectedRoadType'),
            }),
            pickDisplaySpeedLimitMph: SL
                ? (api, val, rt, region) => SL.pickDisplaySpeedLimitMph(api, val, rt, region)
                : null,
        };
    }

    /**
     * Position, odometer, speed-limit, and side-effects setup for one GPS tick.
     * @param {Object} sample - from normalizeGeolocationCoordsSample
     * @returns {Object}
     */
    function applyGpsPositionTick(sample) {
        const coord = applyGpsCoordSampleTick(sample);
        const SGpos = sgModule();
        const plans = SGpos
            ? SGpos.buildGpsPositionTickPlan(buildGpsPositionTickInputs(coord))
            : {
                posApply: {
                    action: 'apply',
                    heading: 0,
                    markerLat: coord.lat,
                    markerLon: coord.lon,
                    followJumpM: Number.POSITIVE_INFINITY,
                    statePatch: { smoothDisplayLat: coord.lat, smoothDisplayLon: coord.lon },
                },
                speedLimitPlan: { roadType: 'unknown', shownLimit: null, resetFetchState: false, showWidget: false },
            };
        applyGpsPositionStateFromPlan(plans.posApply);

        return rpModule().buildGpsTrackingTickOutcomePlan({
            lat: coord.lat,
            lon: coord.lon,
            accuracy: coord.accuracy,
            speed: coord.speed,
            speedMph: coord.speedMph,
            markerLat: plans.posApply.markerLat,
            markerLon: plans.posApply.markerLon,
            heading: plans.posApply.heading,
            followJumpM: plans.posApply.followJumpM,
            speedLimitPlan: plans.speedLimitPlan,
            routeInProgress: rt().g('routeInProgress'),
            routePolyline: rt().g('routePolyline'),
            routeSteps: rt().g('currentRouteSteps'),
            isTrackingActive: getIsTrackingActive(),
            speedLimitShowWidget: plans.speedLimitPlan.showWidget,
        });
    }

    /**
     * Apply one GPS watchPosition fix: position, follow camera, navigation side-effects.
     * @param {GeolocationPosition} position
     */
    function applyGpsTrackingTick(position) {
        const SGsample = sgModule();
        const sample = SGsample.normalizeGeolocationCoordsSample(position.coords);
        const pos = applyGpsPositionTick(sample);
        applyGpsTrackingSideEffectsFromPosition(pos);
    }

    /**
     * startGPSTracking function
     * @function startGPSTracking
     * @returns {*} Return value description
     */
    function startGPSTracking() {
        if (!navigator.geolocation) {
            rt().call.showStatus('Geolocation not supported', 'error');
            return;
        }

        if (getIsTrackingActive()) {
            stopGPSTracking();
            return;
        }

        setIsTrackingActive(true);
        setTrackingHistory([]);
        rt().s('_lastGoodRawPickMph',  0);
        rt().s('_consecutiveDisplacementMoves',  0);
        rt().s('_smoothedSpeedMph',  0);
        rt().s('_smoothedSpeedInitAt',  0);
        resetVehicleMarkerDisplayState();
        window.__voyagrLastFollowEaseAt = 0;
        window.__voyagrLastFollowCenterGeo = null;
        rt().call.showStatus('🎯 GPS Tracking started...', 'success');

        // Watch position with high accuracy
        setGpsWatchId(navigator.geolocation.watchPosition(
            (position) => applyGpsTrackingTick(position),
            (error) => {
                rt().call.showStatus('GPS Error: ' + error.message, 'error');
                setIsTrackingActive(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        ));
    }

    /**
     * stopGPSTracking function
     * @function stopGPSTracking
     * @returns {*} Return value description
     */
    function stopGPSTracking() {
        if (getGpsWatchId() !== null) {
            navigator.geolocation.clearWatch(getGpsWatchId());
            setGpsWatchId(null);
        }
        setIsTrackingActive(false);
        resetVehicleMarkerDisplayState();
        // Hide speed widget when tracking stops (use consolidated function)
        rt().call.updateSpeedWidgetVisibility();
        rt().call.updateRoadReportFabVisibility();
        rt().call.showStatus('🛑 GPS Tracking stopped', 'info');
    }


    function ensureDefaultTrafficAwareRouting() {
        etaModule().ensureDefaultTrafficAwareRouting(localStorage);
    }



    /**
     * Progress-based remaining time (minutes) from GPS on polyline; same basis as server route duration.
     * @returns {{ originalDurationMinutes: number, timeRemainingMinutes: number, progressPercent: number } | null}
     */
    function computeBaseNavigationETAMinutes() {
        return etaModule().computeBaseNavigationETAMinutes({
            routeInProgress: rt().g('routeInProgress'),
            lastCalculatedRoute: window.lastCalculatedRoute,
            polyline: rt().g('routePolyline'),
            originalDurationMinutes: etaModule().normalizeRouteDurationMinutes(window.lastCalculatedRoute),
            userHasStartedMoving: rt().call.hasUserStartedMoving(),
            currentLat: rt().g('currentLat'),
            currentLon: rt().g('currentLon'),
            lastSnappedRouteIndex: rt().g('lastSnappedRouteIndex'),
            routeGeometry: rgModule(),
        });
    }

    function applyTrafficRatioToBaseRemaining(baseRemainingMinutes) {
        return etaModule().applyTrafficRatioToBaseRemaining(
            baseRemainingMinutes,
            window.navETASnapshot,
            Date.now(),
            etaModule().shouldApplyTrafficAwareETA(localStorage, VoyagrVehicleRoutingOrchestration.getCurrentRoutingMode())
        );
    }

    async function refreshNavTrafficETAIfDue(baseRemainingMinutes, progressPercent, forceFetch = false) {
        const ETA = etaModule();
        const preflight = ETA.buildRefreshNavTrafficETAPreflightPlan({
            baseRemainingMinutes,
            progressPercent,
            applyTrafficAware: ETA.shouldApplyTrafficAwareETA(localStorage, VoyagrVehicleRoutingOrchestration.getCurrentRoutingMode()),
            lat: rt().g('currentLat'),
            lon: rt().g('currentLon'),
            now: Date.now(),
            lastFetchAt: rt().g('lastNavTrafficFetchAt'),
            minIntervalMs: ETA.NAV_TRAFFIC_ETA_MIN_INTERVAL_MS,
            forceFetch,
            hasPriorTrafficFetch: !!window.navETASnapshot.trafficFetchAt,
        });

        window.navETASnapshot.baseRemainingMinutes = preflight.snapshotPatch.baseRemainingMinutes;
        window.navETASnapshot.progressPercent = preflight.snapshotPatch.progressPercent;

        if (preflight.action !== 'fetch') {
            if (preflight.clearTrafficAdjusted) {
                window.navETASnapshot.trafficAdjustedMinutes = null;
            }
            return;
        }

        rt().s('lastNavTrafficFetchAt',  preflight.updateLastFetchAt);

        try {
            const flow = await rt().call.getRouteTrafficAhead(preflight.forceFetch);
            const apply = ETA.buildRefreshNavTrafficETASnapshotApplyPlan(
                flow,
                baseRemainingMinutes,
                Date.now()
            );
            if (apply.shouldMerge) {
                window.navETASnapshot = {
                    ...window.navETASnapshot,
                    ...apply.patch,
                };
            } else if (apply.clearTrafficAdjusted) {
                window.navETASnapshot.trafficAdjustedMinutes = null;
            }
        } catch (e) {
            console.warn(preflight.errorLogPrefix, e);
        }
    }

    function applyTurnInfoETAPanelFromPlan(render) {
        if (!render || !render.shouldRender) return;
        const turnInfo = document.getElementById(render.targetId);
        if (turnInfo) turnInfo.innerHTML = render.panelHtml;
    }

    function renderTurnInfoETAPanel(baseMinutes, adjustedMinutes, progressPercent, trafficLevel, congestionPercent) {
        const ETA = etaModule();
        const displayMins = adjustedMinutes != null ? adjustedMinutes : baseMinutes;
        const render = ETA.buildTurnInfoETAPanelRenderPlan({
            baseMinutes,
            adjustedMinutes,
            progressPercent,
            trafficLevel,
            congestionPercent,
            showTraffic: ETA.shouldApplyTrafficAwareETA(localStorage, VoyagrVehicleRoutingOrchestration.getCurrentRoutingMode()),
            etaClockText: new Date(Date.now() + displayMins * 60000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            }),
        });
        applyTurnInfoETAPanelFromPlan(render);
    }

    /**
     * Remaining meters along the active route polyline (snapped progress). Shared by voice, ETA bar, and arrival.
     * @param {number} lat
     * @param {number} lon
     * @returns {number}
     */
    function getNavigationRemainingDistanceMeters(lat, lon) {
        const plan = rgModule().buildNavigationRemainingDistancePlan({
            lat,
            lon,
            routePolyline: rt().g('routePolyline'),
            lastSnappedRouteIndex: rt().g('lastSnappedRouteIndex'),
        });
        return plan.remainingMeters;
    }

    function resetNavigationArrivalState() {
        root.VoyagrNavigationLifecycleOrchestration.resetNavigationArrivalState();
    }

    /**
     * Auto-end navigation when the driver reaches the destination (along-route distance + optional dwell).
     * @param {number} lat
     * @param {number} lon
     * @param {number} speedMs - GPS speed in m/s
     */
    function checkNavigationArrival(lat, lon, speedMs) {
        const remainingM = getNavigationRemainingDistanceMeters(lat, lon);
        const RP = rpModule();
        const NL = root.VoyagrNavigationLifecycleOrchestration;
        const tick = RP.buildNavigationArrivalTickPlan({
            routeInProgress: rt().g('routeInProgress'),
            arrivalTriggered: NL.getNavigationArrivalTriggered(),
            remainingM,
            speedMs,
            arrivalZoneSince: NL.getNavigationArrivalZoneSince(),
            now: Date.now(),
        });
        if (tick.action === 'skip') return;

        const apply = RP.buildNavigationArrivalStateApplyPlan(tick);
        if (apply.action === 'skip') return;

        if (apply.statePatch.arrivalZoneSince != null) {
            NL.setNavigationArrivalZoneSince(apply.statePatch.arrivalZoneSince);
        }

        if (apply.endNavigation) {
            if (apply.logMessage) console.log(apply.logMessage);
            sendArrivalNotification();
        }
    }

    /** Show/hide rt().g('map') FABs that depend on active turn-by-turn navigation. */
    function updateNavigationFabVisibility() {
        const MC = mcModule();
        const plan = MC.getNavigationFabVisibilityPlan(rt().g('routeInProgress'));
        const endBtn = document.getElementById('endNavigationBtn');
        const startBtn = document.getElementById('startNavBtn');
        if (endBtn) endBtn.style.display = plan.endBtnDisplay;
        if (startBtn && plan.startBtnDisplay != null) startBtn.style.display = plan.startBtnDisplay;
        syncBottomSheetOverlapFabs();
        rt().call.updateRecenterButtonVisibility();
    }

    function initializeGpsModuleState() {
        rt().s('lastSnappedRouteIndex', 0);
        rt().s('lastTurnDetectRouteVertexIndex', 0);
        setSmoothDisplayLat(null);
        setSmoothDisplayLon(null);
        setSnapBlendWeightState(0);
        rt().s('lastRerouteTime', 0);
        rt().s('lastRerouteAttemptTime', 0);
        rt().s('lastRerouteDeviation', 0);
        rt().s('deviationStartTimeCheck', null);
        rt().s('deviationOffRouteStreak', 0);
        rt().s('rerouteAttemptCount', 0);
        rt().s('rerouteInProgress', false);
        rt().s('postRerouteGraceUntil', 0);
        rt().s('rerouteFailureRetryTimer', null);
        rt().s('rerouteFailureRetryCount', 0);
    }

    /**
     * Clear EMA-smoothed marker position and follow-camera bookkeeping.
     * Without this, a second journey in the same session inherits journey-1 coords
     * and the icon jumps while the smoother catches up.
     */
    function resetVehicleMarkerDisplayState() {
        setSmoothDisplayLat(null);
        setSmoothDisplayLon(null);
        setSnapBlendWeightState(0);
        window.__voyagrLastFollowCenterGeo = null;
        window.__voyagrLastFollowEaseAt = 0;
    }

    /**
     * Apply prime-vehicle-marker state and marker position from a pure apply plan.
     * @param {Object} apply - from buildPrimeVehicleMarkerOnRouteApplyPlan
     */
    function applyPrimeVehicleMarkerOnRouteFromPlan(apply) {
        if (!apply || apply.action !== 'apply') return;
        const patch = apply.statePatch || {};
        if (patch.smoothDisplayLat != null) {
            setSmoothDisplayLat(patch.smoothDisplayLat);
        }
        if (patch.smoothDisplayLon != null) {
            setSmoothDisplayLon(patch.smoothDisplayLon);
        }
        if (patch.snapBlendWeightState != null) {
            setSnapBlendWeightState(patch.snapBlendWeightState);
        }
        if (apply.markerLngLat && getCurrentUserMarker() && typeof getCurrentUserMarker().setLngLat === 'function') {
            getCurrentUserMarker().setLngLat(apply.markerLngLat);
        }
    }

    /**
     * Seed route progress and place the vehicle icon on the new polyline immediately.
     * @param {number} lat
     * @param {number} lon
     */
    function primeVehicleMarkerOnRoute(lat, lon) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        if (!rt().g('routePolyline') || rt().g('routePolyline').length < 2) return;
        seedNavigationProgressOnNewRoute(lat, lon);
        const SG = sgModule();
        const apply = SG.buildPrimeVehicleMarkerOnRouteApplyPlan({
            lat,
            lon,
            routePolyline: rt().g('routePolyline'),
            snapped: resolveGpsRouteSnapForTick(lat, lon),
            lastSnappedRouteIndex: rt().g('lastSnappedRouteIndex'),
            calculateBearing: (a, b, c, d) => rgModule().bearing(a, b, c, d),
            blendHeadingsCircular: rgModule().blendHeadingsCircular,
        });
        applyPrimeVehicleMarkerOnRouteFromPlan(apply);
    }

    /**
     * announceDistanceToDestination function
     * @function announceDistanceToDestination
     * @param {*} rt().g('currentLat') - Parameter description
     * @param {*} rt().g('currentLon') - Parameter description
     * @returns {*} Return value description
     */
    function announceDistanceToDestination(currentLat, currentLon) {
        if (!rt().g('routeInProgress') || !rt().g('routePolyline') || rt().g('routePolyline').length === 0 || !rt().g('voiceAnnouncementsEnabled')) return;

        const remainingDistance = getNavigationRemainingDistanceMeters(rt().g('currentLat'), rt().g('currentLon'));
        const VA = vaModule();
        const tick = VA.buildDestinationAnnouncementTickPlan({
            routeInProgress: rt().g('routeInProgress'),
            routePolylineLength: rt().g('routePolyline').length,
            voiceAnnouncementsEnabled: rt().g('voiceAnnouncementsEnabled'),
            remainingDistanceM: remainingDistance,
            lastDestinationAnnouncementDistance: rt().g('lastDestinationAnnouncementDistance'),
            destinationDistances: rt().consts.DESTINATION_ANNOUNCEMENT_DISTANCES,
            distanceUnit: rt().call.getDistanceUnit(),
        });

        if (tick.action === 'skip') return;

        const apply = VA.buildDestinationAnnouncementStateApplyPlan(tick);
        if (apply.action === 'skip') return;

        if (apply.statePatch.lastDestinationAnnouncementDistance != null) {
            rt().s('lastDestinationAnnouncementDistance',  apply.statePatch.lastDestinationAnnouncementDistance);
        }

        if (apply.speak && apply.spokenMessage) {
            const displayRemaining = rt().call.convertDistance(remainingDistance / 1000);
            console.log(`[Voice] Distance announcement: ${apply.spokenMessage} (remaining: ${displayRemaining} ${rt().call.getDistanceUnit()})`);
            rt().call.speakMessage(apply.spokenMessage);
        }
    }
    /**
     * announceUpcomingTurn function
     * @function announceUpcomingTurn
     * @param {*} turnInfo - Parameter description
     * @returns {*} Return value description
     */
    function announceUpcomingTurn(turnInfo) {
        const TI = _turnInstructions();
        const VA = vaModule();

        const direction = turnInfo?.direction || 'straight';
        let directionText = TI.getTurnDirectionText(direction);
        if (direction === 'roundabout') {
            directionText = TI.getRoundaboutDirectionText(
                turnInfo.valhallaType,
                turnInfo.roundabout_exit_count
            );
        }

        const category = VA.resolveTurnAnnouncementCategory(direction);
        const thresholdSet = category === 'exit' ? rt().g('announcedExitThresholds')
            : category === 'keep' ? rt().g('announcedKeepThresholds')
            : rt().g('announcedTurnThresholds');

        const tick = VA.buildTurnAnnouncementTickPlan({
            turnInfo,
            voiceAnnouncementsEnabled: rt().g('voiceAnnouncementsEnabled'),
            distanceUnit,
            directionText,
            turnDistances: rt().consts.TURN_ANNOUNCEMENT_DISTANCES,
            exitDistances: rt().consts.EXIT_ANNOUNCEMENT_DISTANCES,
            keepDistances: rt().consts.KEEP_ANNOUNCEMENT_DISTANCES,
            announcedThresholdValues: Array.from(thresholdSet),
            voiceAnnouncedForManeuverIndex: rt().g('_voiceAnnouncedForManeuverIndex'),
            voiceAnnouncedCategory: rt().g('_voiceAnnouncedCategory'),
            followingManeuver: turnInfo?.maneuverIndex != null
                ? rt().call.getFollowingManeuver(turnInfo.maneuverIndex)
                : null,
            chainAppendOpts: {
                getTurnDirectionText: TI.getTurnDirectionText.bind(TI),
                effectiveRoundaboutExitCount: (idx) => rt().call.effectiveRoundaboutExitCount(idx),
                ordinalEnglishExit: TI.ordinalEnglishExit,
            },
        });

        if (tick.action === 'skip') {
            if (tick.warnLine) console.warn(tick.warnLine);
            return;
        }

        const apply = VA.buildTurnAnnouncementStateApplyPlan(tick);
        if (apply.action === 'skip') {
            if (apply.warnLine) console.warn(apply.warnLine);
            return;
        }

        if (apply.clearThresholds) thresholdSet.clear();
        if (apply.statePatch.voiceAnnouncedForManeuverIndex != null) {
            rt().s('_voiceAnnouncedForManeuverIndex',  apply.statePatch.voiceAnnouncedForManeuverIndex);
        }
        if (apply.statePatch.voiceAnnouncedCategory != null) {
            rt().s('_voiceAnnouncedCategory',  apply.statePatch.voiceAnnouncedCategory);
        }
        if (apply.announcedThresholdValues) {
            thresholdSet.clear();
            apply.announcedThresholdValues.forEach((d) => thresholdSet.add(d));
        }

        if (apply.speak && apply.spokenMessage) {
            if (apply.logLine) console.log(apply.logLine);
            rt().call.speakMessage(apply.spokenMessage, apply.speakPriority || 'high');
        }

        if (apply.resetThresholds) {
            if (apply.resetCategory === 'exit') rt().g('announcedExitThresholds').clear();
            else if (apply.resetCategory === 'keep') rt().g('announcedKeepThresholds').clear();
            else rt().g('announcedTurnThresholds').clear();
        }
    }

    const REROUTE_DEBOUNCE_MS = 30000;
    let lastRerouteAnnouncementTime = 0;

    function clearRerouteFailureRetries() {
        if (rt().g('rerouteFailureRetryTimer')) {
            clearTimeout(rt().g('rerouteFailureRetryTimer'));
            rt().s('rerouteFailureRetryTimer',  null);
        }
        rt().s('rerouteFailureRetryCount',  0);
    }

    function scheduleAutomaticRerouteRetry() {
        const RD = rdModule();
        const plan = RD.buildRerouteFailureRetryPlan({
            routeInProgress: rt().g('routeInProgress'),
            autoRerouteOnDeviationEnabled: rt().call.getAutoRerouteOnDeviationEnabled(),
            postRerouteGraceUntil: rt().g('postRerouteGraceUntil'),
            rerouteInProgress: rt().g('rerouteInProgress'),
            rerouteFailureRetryCount: rt().g('rerouteFailureRetryCount'),
            now: Date.now(),
        });

        if (plan.action === 'clear') {
            clearRerouteFailureRetries();
            return;
        }
        if (!plan.schedule) {
            if (plan.action === 'exhausted' && plan.notification) {
                rt().call.sendNotification(plan.notification.title, plan.notification.body, plan.notification.type);
                clearRerouteFailureRetries();
            }
            return;
        }

        rt().s('rerouteFailureRetryCount',  plan.nextRetryCount);
        if (rt().g('rerouteFailureRetryTimer')) clearTimeout(rt().g('rerouteFailureRetryTimer'));
        console.log(plan.logMessage);
        rt().s('rerouteFailureRetryTimer', setTimeout(() => {
            rt().s('rerouteFailureRetryTimer', null);
            if (!rt().g('routeInProgress') || !rt().call.getAutoRerouteOnDeviationEnabled()) {
                clearRerouteFailureRetries();
                return;
            }
            rt().call.showStatus(plan.statusMessage, 'warning');
            void triggerAutomaticRerouteWithHazardHandling(rt().g('currentLat'), rt().g('currentLon'));
        }, plan.delayMs));
    }

    /**
     * Apply route deviation state patches and optional reroute trigger.
     * @param {Object} stateApply - from buildRouteDeviationStateApplyPlan
     * @param {number} lat
     * @param {number} lon
     */
    function applyRouteDeviationFromApplyPlan(stateApply, lat, lon) {
        if (!stateApply || stateApply.action !== 'apply') return;

        rt().s('routeJoinConfirmedForDeviation',  stateApply.statePatch.routeJoinConfirmedForDeviation);
        rt().s('deviationStartTimeCheck',  stateApply.statePatch.deviationStartTimeCheck);
        rt().s('deviationOffRouteStreak',  stateApply.statePatch.deviationOffRouteStreak);
        if (stateApply.statePatch.lastRerouteAttemptTime != null) {
            rt().s('lastRerouteAttemptTime',  stateApply.statePatch.lastRerouteAttemptTime);
        }

        if (stateApply.logJoinLine) console.log(stateApply.logJoinLine);

        if (stateApply.triggerReroute) {
            if (stateApply.incrementRerouteAttemptCount) rt().g('rerouteAttemptCount')++;
            if (stateApply.logDeviationLine) console.log(stateApply.logDeviationLine);
            rt().call.sendNotification(
                stateApply.notification.title,
                stateApply.notification.body,
                stateApply.notification.type
            );
            triggerAutomaticRerouteWithHazardHandling(lat, lon);
        }

        if (stateApply.updateLastRerouteDeviation) {
            rt().s('lastRerouteDeviation',  stateApply.lastRerouteDeviation);
        }
    }

    /**
     * checkRouteDeviation function - Enhanced with time-based detection
     * Only triggers reroute if user is >50m off-route for >10 seconds
     * Respects auto-reroute toggle setting
     */
    function checkRouteDeviation(lat, lon, accuracy) {
        const VRD = rdModule();
        const inputs = VRD.buildRouteDeviationTickInputsPlan({
            lat,
            lon,
            routePolyline: rt().g('routePolyline'),
            lastSnappedRouteIndex: rt().g('lastSnappedRouteIndex'),
            snapFn: (a, b, c, d) => rgModule().snapToRoutePolyline(a, b, c, d),
            remainingFn: getNavigationRemainingDistanceMeters,
        });
        if (inputs.action !== 'ready') return;

        const now = Date.now();
        const tick = VRD.buildRouteDeviationTickPlan({
            autoRerouteEnabled: rt().call.getAutoRerouteOnDeviationEnabled(),
            hasRoute: true,
            remainingToDest: inputs.remainingToDest,
            accuracy,
            minDistance: inputs.minDistance,
            routeJoinConfirmed: rt().g('routeJoinConfirmedForDeviation'),
            deviationStartTime: rt().g('deviationStartTimeCheck'),
            lastRerouteTime: rt().g('lastRerouteTime'),
            lastRerouteAttemptTime: rt().g('lastRerouteAttemptTime'),
            offRouteStreak: rt().g('deviationOffRouteStreak'),
            now,
            postRerouteGraceUntil: rt().g('postRerouteGraceUntil'),
            rerouteInProgress: rt().g('rerouteInProgress'),
            distanceUnit,
        });

        if (tick.action === 'skip') return;

        const apply = VRD.buildRouteDeviationApplyPlan(tick, { rerouteAttemptCount: rt().g('rerouteAttemptCount') });
        const stateApply = VRD.buildRouteDeviationStateApplyPlan(apply);
        applyRouteDeviationFromApplyPlan(stateApply, lat, lon);
    }

    /**
     * Apply automatic reroute API outcome (success or failure).
     * @param {Object} ctx
     * @param {Object} ctx.apply - from buildAutomaticRerouteResultApplyPlan
     * @param {number} ctx.startLat
     * @param {number} ctx.startLon
     * @param {string} ctx.destination
     */
    function applyAutomaticRerouteResult(ctx) {
        const { apply, startLat, startLon, destination } = ctx;
        const execute = rdModule().buildAutomaticRerouteResultExecutePlan(apply);
        if (!execute.shouldApply) return;

        if (execute.kind === 'failure') {
            execute.logs.forEach((line) => console.log(line));
            if (execute.notification) {
                rt().call.sendNotification(execute.notification.title, execute.notification.body, execute.notification.type);
            }
            if (execute.scheduleRetry) scheduleAutomaticRerouteRetry();
            if (execute.resetRerouteInProgress) rt().s('rerouteInProgress',  false);
            return;
        }

        if (execute.clearFailureRetries) clearRerouteFailureRetries();
        execute.logs.forEach((line) => console.log(line));

        if (execute.showUnavoidableHazards) {
            handleUnavoidableHazards(execute.newRoute, execute.hazardsList, execute.hazardCount);
        }
        if (execute.preferPrimaryRouteOnNextNavUpdate) {
            rt().s('_preferPrimaryRouteOnNextNavUpdate',  true);
        }
        if (execute.updateRouteOnMap) rt().call.updateRouteOnMap(execute.newRoute);
        if (execute.logRerouteEvent) {
            logReroutingEvent(startLat, startLon, destination, execute.newRoute, execute.hazardCount);
        }

        if (execute.voice && execute.voice.enabled) {
            if (execute.voice.shouldSpeak) {
                lastRerouteAnnouncementTime = execute.voice.announceAt;
                rt().call.speakMessage(execute.voice.message, 'high');
            } else {
                console.log('[Voice] Skipping duplicate reroute announcement');
            }
        }

        if (execute.notification) {
            rt().call.sendNotification(execute.notification.title, execute.notification.body, execute.notification.type);
        }
    }

    /**
     * Trigger automatic reroute with hazard handling
     * This enhanced version handles unavoidable hazards gracefully
     */
    async function triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon) {
        const now = Date.now();
        const RD = rdModule();
        const destination = rt().call.resolveNavigationDestination();
        const trigger = RD.buildAutomaticRerouteTriggerPlan(now, {
            rerouteInProgress: rt().g('rerouteInProgress'),
            lastRerouteAttemptTime: rt().g('lastRerouteAttemptTime'),
            postRerouteGraceUntil: rt().g('postRerouteGraceUntil'),
            debounceMs: REROUTE_DEBOUNCE_MS,
            offline: !navigator.onLine,
            destination,
            hasRouteContext: !!window.lastCalculatedRoute,
            startLat: rt().g('currentLat'),
            startLon: rt().g('currentLon'),
        });
        const triggerExecute = RD.buildAutomaticRerouteTriggerExecutePlan(trigger);

        if (triggerExecute.action === 'skip') {
            console.log(triggerExecute.logMessage);
            return;
        }

        rt().s('lastRerouteAttemptTime',  triggerExecute.lastRerouteAttemptTime);

        if (triggerExecute.action === 'defer') {
            if (triggerExecute.logMessage) console.log(triggerExecute.logMessage);
            if (triggerExecute.scheduleRetry) scheduleAutomaticRerouteRetry();
            if (triggerExecute.resetRerouteInProgress) rt().s('rerouteInProgress',  false);
            return;
        }

        rt().s('rerouteInProgress',  triggerExecute.rerouteInProgress);
        try {
            if (triggerExecute.logMessage) console.log(triggerExecute.logMessage);

            const routeRequest = rt().call.buildRouteRequest(rt().g('currentLat'), rt().g('currentLon'), destination);
            const fetchOrch = RD.buildAutomaticRerouteFetchOrchestrationPlan();

            const response = await fetch(fetchOrch.apiPath, {
                method: fetchOrch.method,
                headers: fetchOrch.headers,
                body: JSON.stringify(routeRequest),
            });

            const data = await response.json();
            const responsePlans = RD.buildAutomaticRerouteResponsePlans(data, {
                convertDistance: rt().call.convertDistance,
                distUnit: rt().call.getDistanceUnit(),
                voiceEnabled: rt().g('voiceAnnouncementsEnabled'),
                lastRerouteAnnouncementTime,
                rerouteFailureRetryCount: rt().g('rerouteFailureRetryCount'),
                now: Date.now(),
            });
            applyAutomaticRerouteResult({
                apply: responsePlans.apply,
                startLat: rt().g('currentLat'),
                startLon: rt().g('currentLon'),
                destination,
            });
        } catch (error) {
            console.error('[Rerouting] Error during automatic reroute:', error);
            const errorPlans = RD.buildAutomaticRerouteErrorResponsePlans({ rerouteFailureRetryCount: rt().g('rerouteFailureRetryCount') });
            applyAutomaticRerouteResult({
                apply: errorPlans.apply,
                startLat: rt().g('currentLat'),
                startLon: rt().g('currentLon'),
                destination,
            });
        }
    }

    /**
     * Handle unavoidable hazards on route
     * Shows user-friendly notification with hazard details
     */
    function handleUnavoidableHazards(route, hazardsList, hazardCount) {
        const plan = haModule().buildUnavoidableHazardsHandlingPlan(hazardsList, hazardCount);
        console.log(plan.logLine);
        showUnavoidableHazardsModal(plan.hazardTypes, plan.hazardCount);
        console.log(plan.summaryLogLine);
    }

    /**
     * Show modal for unavoidable hazards
     */
    function showUnavoidableHazardsModal(hazardTypes, totalCount) {
        const hazardAlerts = haModule();
        const mount = hazardAlerts.buildUnavoidableHazardsModalMountPlan(hazardTypes, totalCount);

        let modal = document.getElementById(mount.modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = mount.modalId;
            modal.style.cssText = mount.modalStyle;
            document.body.appendChild(modal);
        }

        modal.innerHTML = mount.innerHtml;

        let backdrop = document.getElementById(mount.backdropId);
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = mount.backdropId;
            backdrop.style.cssText = mount.backdropStyle;
            backdrop.onclick = closeUnavoidableHazardsModal;
            document.body.appendChild(backdrop);
        }

        backdrop.style.display = mount.display;
        modal.style.display = mount.display;
        setTimeout(closeUnavoidableHazardsModal, mount.autoCloseMs);
    }

    /**
     * Close unavoidable hazards modal
     */
    function closeUnavoidableHazardsModal() {
        const hazardAlerts = haModule();
        const modal = document.getElementById(hazardAlerts.UNAVOIDABLE_HAZARDS_MODAL_ID);
        const backdrop = document.getElementById(hazardAlerts.UNAVOIDABLE_HAZARDS_BACKDROP_ID);
        if (modal) modal.style.display = 'none';
        if (backdrop) backdrop.style.display = 'none';
    }

    /**
     * Open hazard settings (navigates to settings tab)
     */
    function openHazardSettings() {
        closeUnavoidableHazardsModal();
        showTab('settings');
    }

    /**
     * Log rerouting event for debugging and analytics
     */
    function logReroutingEvent(startLat, startLon, destination, route, hazardCount) {
        const result = rdModule().recordAutomaticRerouteLog(sessionStorage, {
            startLat,
            startLon,
            destination,
            route,
            hazardCount,
            routePrefs: _routePrefs(),
        });
        console.log('[Rerouting] Event logged:', result.event);
    }

    // Keep old function for backwards compatibility
    async function triggerAutomaticReroute(currentLat, currentLon) {
        return triggerAutomaticRerouteWithHazardHandling(currentLat, currentLon);
    }
    // Hazard announcement debouncing
    const hazardAnnouncementDebounce = {};
    let HAZARD_WARNING_DISTANCE = 500;

    // Camera alert types: 'off', 'voice', 'chime', 'both'
    let cameraAlertType = localStorage.getItem('pref_cameraAlertType') || 'voice';
    let cameraAlertDistance = parseInt(localStorage.getItem('pref_cameraAlertDistance') || '500');

    function isCameraHazardType(typeStr) {
        return haModule().isCameraHazardType(typeStr);
    }

    /**
     * Play a chime alert sound using Web Audio API
     */
    function playCameraChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime);
            osc1.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);

            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(660, ctx.currentTime);
            osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(ctx.currentTime);
            osc2.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.4);
            osc2.stop(ctx.currentTime + 0.4);

            setTimeout(() => {
                const osc3 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc3.type = 'sine';
                osc3.frequency.setValueAtTime(1320, ctx.currentTime);
                gain2.gain.setValueAtTime(0.25, ctx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc3.connect(gain2);
                gain2.connect(ctx.destination);
                osc3.start(ctx.currentTime);
                osc3.stop(ctx.currentTime + 0.3);
            }, 200);
        } catch (e) {
            console.warn('[Camera Alert] Chime failed:', e);
        }
    }

    function saveCameraAlertPreferences() {
        const typeEl = document.getElementById('cameraAlertType');
        const distEl = document.getElementById('cameraAlertDistance');
        if (typeEl) {
            cameraAlertType = typeEl.value;
            localStorage.setItem('pref_cameraAlertType', cameraAlertType);
        }
        if (distEl) {
            cameraAlertDistance = parseInt(distEl.value);
            localStorage.setItem('pref_cameraAlertDistance', distEl.value);
        }
        rt().call.showStatus('Camera alert preferences saved', 'success');
    }

    function loadCameraAlertPreferences() {
        const typeEl = document.getElementById('cameraAlertType');
        const distEl = document.getElementById('cameraAlertDistance');
        cameraAlertType = localStorage.getItem('pref_cameraAlertType') || 'voice';
        cameraAlertDistance = parseInt(localStorage.getItem('pref_cameraAlertDistance') || '500');
        if (typeEl) typeEl.value = cameraAlertType;
        if (distEl) distEl.value = cameraAlertDistance.toString();
    }
    function announceCameraOrHazard(hazard, distanceM, opts = {}) {
        const { unavoidableRouteCamera = false } = opts;
        const HA = haModule();
        const debounceKey = HA.buildHazardAnnouncementDebounceKey(hazard, unavoidableRouteCamera);
        const plan = HA.buildHazardAnnouncementPlan(hazard, distanceM, {
            unavoidableRouteCamera,
            cameraAlertType,
            voiceAnnouncementsEnabled: rt().g('voiceAnnouncementsEnabled'),
            distanceUnit,
            debounceMs: HA.HAZARD_ANNOUNCEMENT_DEBOUNCE_MS,
            lastAnnounceAt: hazardAnnouncementDebounce[debounceKey] || 0,
            now: Date.now(),
        });
        const execute = HA.buildHazardAnnouncementExecutePlan(plan);
        if (!execute.shouldExecute) return;

        hazardAnnouncementDebounce[execute.debounceKey] = execute.nextAnnounceAt;
        rt().call.sendNotification(execute.notification.title, execute.notification.message, execute.notification.type);
        if (execute.speak) {
            rt().call.speakMessage(execute.spokenMessage, execute.speakPriority || undefined);
        }
        if (execute.playChime) {
            playCameraChime();
        }
    }

    function evaluateAndAnnounceHazards(lat, lon, nearbyPayload, includeNearby) {
        const HA = haModule();
        if (!HA) return;

        const params = HA.buildHazardEvaluationParams({
            lat,
            lon,
            route: window.lastCalculatedRoute,
            includeNearby: !!includeNearby,
            nearbyPayload,
            routePolyline: rt().g('routePolyline'),
            snappedRouteIndex: rt().g('lastSnappedRouteIndex'),
            cameraAlertDistanceM: cameraAlertDistance,
            generalHazardDistanceM: rt().consts.HAZARD_WARNING_DISTANCE,
            calculateDistance: calculateDistanceMeters,
        });
        const alerts = HA.collectHazardsToAnnounce(params);

        alerts.forEach(({ hazard, distanceM, unavoidableRouteCamera }) => {
            announceCameraOrHazard(hazard, distanceM, { unavoidableRouteCamera });
        });
    }

    /**
     * Route-embedded hazards work offline; nearby API augments when online.
     */
    function processNavigationHazardAlerts(lat, lon) {
        const HA = haModule();
        const tick = HA.buildNavigationHazardAlertsTickPlan({
            routeInProgress: rt().g('routeInProgress'),
            isTrackingActive: getIsTrackingActive(),
            isOffline: rt().getIsOffline(),
            navigatorOnLine: navigator.onLine,
            lat,
            lon,
            nearbyRadiusKm: HA.NEARBY_HAZARDS_RADIUS_KM,
        });
        if (tick.action === 'skip') return;

        if (tick.evaluateEmbedded) {
            evaluateAndAnnounceHazards(lat, lon, null, false);
        }

        const fetchPlan = HA.buildNavigationHazardAlertsNearbyFetchPlan(tick);
        if (!fetchPlan.shouldFetch) return;

        fetch(fetchPlan.url)
            .then((response) => response.json())
            .then((data) => {
                if (!data.success || !data.hazards) return;
                evaluateAndAnnounceHazards(lat, lon, data.hazards, true);
            })
            .catch((error) => console.log(fetchPlan.errorLogPrefix, error));
    }

    /** @deprecated Use processNavigationHazardAlerts — kept for live refresh interval. */
    function checkNearbyHazards(lat, lon) {
        processNavigationHazardAlerts(lat, lon);
    }

    /** @deprecated Merged into processNavigationHazardAlerts. */
    function checkRouteHazardCamerasAhead(lat, lon) {
        processNavigationHazardAlerts(lat, lon);
    }


    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        initializeGpsModuleState: initializeGpsModuleState,
        calculateDistanceMeters: calculateDistanceMeters,
        resolveGpsRouteSnapForTick: resolveGpsRouteSnapForTick,
        getVehicleDisplayCoordinates: getVehicleDisplayCoordinates,
        startGPSTracking: startGPSTracking,
        stopGPSTracking: stopGPSTracking,
        applyVehicleMarkerFromTickPlan: applyVehicleMarkerFromTickPlan,
        applySpeedLimitFetchResetFromPlan: applySpeedLimitFetchResetFromPlan,
        resetVehicleMarkerDisplayState: resetVehicleMarkerDisplayState,
        primeVehicleMarkerOnRoute: primeVehicleMarkerOnRoute,
        resetNavigationArrivalState: resetNavigationArrivalState,
        clearRerouteFailureRetries: clearRerouteFailureRetries,
        ensureDefaultTrafficAwareRouting: ensureDefaultTrafficAwareRouting,
        applyTrafficRatioToBaseRemaining: applyTrafficRatioToBaseRemaining,
        refreshNavTrafficETAIfDue: refreshNavTrafficETAIfDue,
        computeBaseNavigationETAMinutes: computeBaseNavigationETAMinutes,
        renderTurnInfoETAPanel: renderTurnInfoETAPanel,
        getNavigationRemainingDistanceMeters: getNavigationRemainingDistanceMeters,
        updateNavigationFabVisibility: updateNavigationFabVisibility,
        processNavigationHazardAlerts: processNavigationHazardAlerts,
        checkNearbyHazards: checkNearbyHazards,
        checkRouteHazardCamerasAhead: checkRouteHazardCamerasAhead,
        saveCameraAlertPreferences: saveCameraAlertPreferences,
        loadCameraAlertPreferences: loadCameraAlertPreferences,
        triggerAutomaticRerouteWithHazardHandling: triggerAutomaticRerouteWithHazardHandling,
        triggerAutomaticReroute: triggerAutomaticReroute,
        getSnapBlendWeightState: getSnapBlendWeightState,
        setSnapBlendWeightState: setSnapBlendWeightState,
        getSmoothDisplayLat: getSmoothDisplayLat,
        setSmoothDisplayLat: setSmoothDisplayLat,
        getSmoothDisplayLon: getSmoothDisplayLon,
        setSmoothDisplayLon: setSmoothDisplayLon,
        getTrackingHistory: getTrackingHistory,
        setTrackingHistory: setTrackingHistory,
        getIsTrackingActive: getIsTrackingActive,
        setIsTrackingActive: setIsTrackingActive,
        getGpsWatchId: getGpsWatchId,
        setGpsWatchId: setGpsWatchId,
        getCurrentUserMarker: getCurrentUserMarker,
        setCurrentUserMarker: setCurrentUserMarker,
        getCurrentUserMarkerIcon: getCurrentUserMarkerIcon,
        setCurrentUserMarkerIcon: setCurrentUserMarkerIcon,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGpsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Map recenter and zoom-and-follow controls during navigation.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    var zoomAndFollowEnabled = (typeof VoyagrMapControls !== 'undefined'
        && typeof VoyagrMapControls.resolveZoomAndFollowEnabledFromStorage === 'function')
        ? VoyagrMapControls.resolveZoomAndFollowEnabledFromStorage(
            localStorage.getItem('zoomAndFollowEnabled')
        )
        : (localStorage.getItem('zoomAndFollowEnabled') !== 'false');
    var mapFollowingActive = false;

    function getZoomAndFollowEnabled() { return zoomAndFollowEnabled; }
    function setZoomAndFollowEnabled(val) { zoomAndFollowEnabled = !!val; }
    function getMapFollowingActive() { return mapFollowingActive; }
    function setMapFollowingActive(val) { mapFollowingActive = !!val; }

    function rt() {
        if (!runtime) {
            throw new Error('[MapRecenter] Orchestration runtime not bound');
        }
        return runtime;
    }

    function applyZoomFollowButtonUi(btn, enabled) {
        var plan = rt().mapControls().buildZoomFollowButtonUiExecutePlan(enabled);
        if (!btn || !plan.shouldApply) return;
        btn.classList.toggle('active', plan.active);
        btn.style.background = plan.background;
        btn.innerHTML = plan.innerHtml;
    }

    function metersMapCenterFromVehicle() {
        var map = rt().getMap();
        var currentLat = rt().getCurrentLat();
        var currentLon = rt().getCurrentLon();
        if (!map || currentLat == null || currentLon == null) return 0;
        var center = map.getCenter();
        var vehicle = rt().call.getVehicleDisplayCoordinates();
        return rt().call.calculateDistanceMeters(
            vehicle.lat, vehicle.lon, center.lat, center.lng
        );
    }

    function shouldShowRecenterVehicleButton() {
        var MC = rt().mapControls();
        var plan = MC.buildShouldShowRecenterVehicleButtonPlan({
            hasMap: !!rt().getMap(),
            currentLat: rt().getCurrentLat(),
            currentLon: rt().getCurrentLon(),
            routeInProgress: rt().getRouteInProgress(),
            isTrackingActive: rt().getIsTrackingActive(),
            journeyOverviewActive: rt().getJourneyOverviewActive(),
            zoomAndFollowEnabled: getZoomAndFollowEnabled(),
            mapFollowingActive: getMapFollowingActive(),
            distanceFromCenterM: metersMapCenterFromVehicle(),
            minDistanceM: MC.RECENTER_MIN_DISTANCE_M,
        });
        return plan.shouldShow;
    }

    function applyRecenterButtonVisibilityFromPlan(execute) {
        if (!execute || !execute.shouldUpdate) return;
        var btn = document.getElementById(execute.buttonId);
        if (btn) btn.style.display = execute.display;
    }

    function updateRecenterButtonVisibility() {
        applyRecenterButtonVisibilityFromPlan(
            rt().mapControls().buildRecenterButtonVisibilityExecutePlan(shouldShowRecenterVehicleButton())
        );
    }

    function toggleZoomAndFollow() {
        var MC = rt().mapControls();
        var orch = MC.buildToggleZoomAndFollowOrchestrationPlan({
            currentEnabled: getZoomAndFollowEnabled(),
        });
        setZoomAndFollowEnabled(orch.nextEnabled);
        applyZoomFollowButtonUi(document.getElementById(orch.toggleButtonId), getZoomAndFollowEnabled());
        localStorage.setItem(orch.storageKey, orch.storageValue);

        var map = rt().getMap();
        if (orch.action === 'enable') {
            var execute = MC.buildToggleZoomAndFollowEnabledExecutePlan({
                hasMap: !!map,
                currentLat: rt().getCurrentLat(),
                currentLon: rt().getCurrentLon(),
                followPadding: rt().cameraPitch().resolveFollowPadding({ map: map }),
            });
            setMapFollowingActive(execute.mapFollowingActive);
            rt().call.showStatus(execute.statusMessage, execute.statusType);
            console.log(execute.logMessage);
            if (execute.flyTo && map) {
                map.flyTo(execute.flyTo);
            }
        } else {
            var disabled = MC.buildToggleZoomAndFollowDisabledExecutePlan();
            setMapFollowingActive(disabled.mapFollowingActive);
            rt().call.showStatus(disabled.statusMessage, disabled.statusType);
            console.log(disabled.logMessage);
        }

        if (orch.updateRecenterVisibility) {
            updateRecenterButtonVisibility();
        }
    }

    function recenterOnVehicle() {
        var MC = rt().mapControls();
        var coords = rt().call.getVehicleDisplayCoordinates();
        var lat = coords.lat;
        var lon = coords.lon;
        var preflight = MC.buildRecenterOnVehiclePreflightPlan({
            hasMap: !!rt().getMap(),
            currentLat: rt().getCurrentLat(),
            currentLon: rt().getCurrentLon(),
            displayLat: lat,
            displayLon: lon,
            journeyOverviewActive: rt().getJourneyOverviewActive(),
            routeInProgress: rt().getRouteInProgress(),
        });
        if (!preflight.shouldRecenter) {
            rt().call.showStatus(preflight.statusMessage, preflight.statusType);
            return;
        }

        if (preflight.exitJourneyOverview) {
            rt().call.exitJourneyOverviewForRecenter();
        }

        var map = rt().getMap();
        if (preflight.routeInProgress) {
            setMapFollowingActive(true);
            var currentUserMarker = rt().getCurrentUserMarker();
            var speedMps = currentUserMarker && Number.isFinite(currentUserMarker.speed)
                ? currentUserMarker.speed
                : 0;
            var speedMph = speedMps * 2.23694;
            var viewport = rt().cameraPitch().resolveFollowViewportSize({ map: map });
            var followInput = MC.buildRecenterNavigationFollowInputPlan({
                lat: lat,
                lon: lon,
                speedMph: speedMph,
                roadType: rt().call.getCurrentRoadType(undefined, speedMph),
                heading: (currentUserMarker && Number.isFinite(currentUserMarker.heading))
                    ? currentUserMarker.heading
                    : map.getBearing(),
                mapBearing: map.getBearing(),
                shouldTilt: rt().call.shouldTiltDrivingCamera(),
                usePitchedDrivingCamera: rt().call.shouldUsePitchedDrivingCamera(),
                viewportHeight: viewport.height,
                viewportWidth: viewport.width,
            });
            var followCamera = rt().cameraPitch().buildNavigationFollowCameraPlan(
                Object.assign({}, followInput, {
                    computeSmartZoom: function (spd, dist, roadType) {
                        return rt().routeGeometry().calculateSmartZoom(
                            spd,
                            dist,
                            roadType,
                            rt().getZoomLevels(),
                            rt().getTurnZoomThreshold()
                        );
                    },
                })
            );
            var complete = MC.buildRecenterNavigationCompletePlan();

            if (complete.setLastFollowCenterGeo) {
                window.__voyagrLastFollowCenterGeo = { lat: lat, lon: lon };
            }
            if (complete.setLastFollowEaseAt) {
                window.__voyagrLastFollowEaseAt = Date.now();
            }
            if (followCamera.easeTo) {
                map.easeTo(followCamera.easeTo);
            }
            rt().call.showStatus(complete.statusMessage, complete.statusType);
        } else {
            var tracking = MC.buildRecenterTrackingEasePlan({
                lat: lat,
                lon: lon,
                currentZoom: map.getZoom(),
            });
            setMapFollowingActive(tracking.mapFollowingActive);
            map.easeTo(tracking.easeTo);
            rt().call.showStatus(tracking.statusMessage, tracking.statusType);
        }

        updateRecenterButtonVisibility();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        getZoomAndFollowEnabled: getZoomAndFollowEnabled,
        setZoomAndFollowEnabled: setZoomAndFollowEnabled,
        getMapFollowingActive: getMapFollowingActive,
        setMapFollowingActive: setMapFollowingActive,
        applyZoomFollowButtonUi: applyZoomFollowButtonUi,
        toggleZoomAndFollow: toggleZoomAndFollow,
        updateRecenterButtonVisibility: updateRecenterButtonVisibility,
        recenterOnVehicle: recenterOnVehicle,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapRecenterOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

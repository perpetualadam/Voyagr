/**
 * @file Journey overview map mode (zoom-out full route during navigation).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[JourneyOverview] Orchestration runtime not bound');
        }
        return runtime;
    }

    function applyJourneyOverviewButtonUi(btn, overviewActive) {
        var plan = rt().mapControls().buildJourneyOverviewButtonUiExecutePlan(overviewActive);
        if (!btn || !plan.shouldApply) return;
        btn.style.background = plan.background;
        btn.innerHTML = plan.innerHtml;
        btn.title = plan.title;
    }

    function exitJourneyOverviewForRecenter() {
        var MC = rt().mapControls();
        var exit = MC.buildRecenterJourneyOverviewExitPlan();
        rt().setJourneyOverviewActive(exit.journeyOverviewActive);
        applyJourneyOverviewButtonUi(document.getElementById(exit.journeyBtnId), false);
        if (exit.clearSavedMapState) rt().setSavedMapState(null);
    }

    function toggleJourneyOverview() {
        var MC = rt().mapControls();
        var routePolyline = rt().getRoutePolyline();
        var preflight = MC.buildToggleJourneyOverviewPreflightPlan({
            routeInProgress: rt().getRouteInProgress(),
            routePolylineLength: routePolyline ? routePolyline.length : 0,
            journeyOverviewActive: rt().getJourneyOverviewActive(),
        });
        if (!preflight.shouldToggle) {
            rt().call.showStatus(preflight.statusMessage, preflight.statusType);
            return;
        }

        var btn = document.getElementById(preflight.journeyBtnId);
        var map = rt().getMap();
        var mapLibre = rt().getMapLibreHelpers();

        if (!preflight.currentlyActive) {
            var routeOptions = rt().getRouteOptions();
            var activate = MC.buildToggleJourneyOverviewActivatePlan({
                mapCenter: map.getCenter(),
                mapZoom: map.getZoom(),
                useMultiRouteCoords: root.VoyagrRouteComparisonOrchestration.getAllRouteLayers().length > 0
                    && routeOptions
                    && routeOptions[0]
                    && routeOptions[0].polyline,
                allRouteCoords: (routeOptions || []).flatMap(function (r) { return r.polyline || []; }),
                routePolylineLength: routePolyline.length,
                routePolyline: routePolyline,
            });

            rt().setSavedMapState(activate.saveMapState);
            rt().setMapFollowingActive(activate.mapFollowingActive);
            if (activate.fitBounds) {
                mapLibre.fitMapBounds(
                    map,
                    activate.fitBounds.coords,
                    { padding: activate.fitBounds.padding }
                );
            }
            rt().setJourneyOverviewActive(activate.journeyOverviewActive);
            applyJourneyOverviewButtonUi(btn, activate.overviewButtonActive);
            rt().call.showStatus(activate.statusMessage, activate.statusType);
            console.log(activate.logMessage);
            if (activate.updateRecenterVisibility) rt().call.updateRecenterButtonVisibility();
            return;
        }

        var deactivate = MC.buildToggleJourneyOverviewDeactivatePlan({
            zoomAndFollowEnabled: rt().getZoomAndFollowEnabled(),
            savedMapState: rt().getSavedMapState(),
        });
        rt().setJourneyOverviewActive(deactivate.journeyOverviewActive);
        if (deactivate.restoreMapFollowing) {
            rt().setMapFollowingActive(true);
        }
        if (deactivate.flyTo) {
            map.flyTo(deactivate.flyTo);
        }
        if (deactivate.clearSavedMapState) {
            rt().setSavedMapState(null);
        }
        applyJourneyOverviewButtonUi(btn, deactivate.overviewButtonActive);
        rt().call.showStatus(deactivate.statusMessage, deactivate.statusType);
        console.log(deactivate.logMessage);
        if (deactivate.updateRecenterVisibility) rt().call.updateRecenterButtonVisibility();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleJourneyOverview: toggleJourneyOverview,
        applyJourneyOverviewButtonUi: applyJourneyOverviewButtonUi,
        exitJourneyOverviewForRecenter: exitJourneyOverviewForRecenter,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrJourneyOverviewOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

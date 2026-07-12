/**
 * @file Map explore gesture orchestration (move sync, follow pause, recenter visibility).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[MapExplore] Orchestration runtime not bound');
        }
        return runtime;
    }

    function MC() { return rt().mapControls(); }

    function setupMapMoveHandler() {
        const mapControls = MC();
        const map = rt().getMap();
        const setup = mapControls.buildMapMoveHandlerSetupPlan({ hasMap: !!map });
        if (!setup.shouldBind) {
            if (setup.deferLogMessage) console.log(setup.deferLogMessage);
            return;
        }

        map.on(setup.eventName, () => {
            const sync = mapControls.buildMapCenterSyncExecutePlan({
                routeInProgress: rt().getRouteInProgress(),
                isTrackingActive: rt().getIsTrackingActive(),
                center: map.getCenter(),
            });
            if (sync.shouldSync) {
                rt().setCurrentLat(sync.lat);
                rt().setCurrentLon(sync.lng);
            }
        });
    }

    function setupMapExploreHandlers() {
        const mapControls = MC();
        const map = rt().getMap();
        const setup = mapControls.buildMapExploreHandlersSetupPlan({
            hasMap: !!map,
            alreadyInitialized: !!window[mapControls.MAP_EXPLORE_HANDLERS_FLAG],
        });
        if (!setup.shouldBind) {
            if (setup.deferLogMessage) console.log(setup.deferLogMessage);
            return;
        }
        if (setup.markInitialized) {
            window[setup.initializedFlagProperty] = true;
        }

        const onUserMapGesture = (e) => {
            const gesture = mapControls.buildMapExploreGestureExecutePlan({
                hasOriginalEvent: !!(e && e.originalEvent),
                routeInProgress: rt().getRouteInProgress(),
                isTrackingActive: rt().getIsTrackingActive(),
                zoomAndFollowEnabled: rt().getZoomAndFollowEnabled(),
                mapFollowingActive: rt().getMapFollowingActive(),
            });
            if (!gesture.shouldReact) return;
            if (gesture.pauseMapFollowing) {
                rt().setMapFollowingActive(false);
                console.log(gesture.pauseFollowLogMessage);
            }
            if (gesture.updateRecenterVisibility) {
                rt().call.updateRecenterButtonVisibility();
            }
        };

        setup.gestureEvents.forEach((eventName) => map.on(eventName, onUserMapGesture));
        map.on(setup.moveEndEvent, () => {
            const moveEnd = mapControls.buildMapExploreMoveEndExecutePlan();
            if (moveEnd.updateRecenterVisibility) {
                rt().call.updateRecenterButtonVisibility();
            }
        });
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        setupMapMoveHandler: setupMapMoveHandler,
        setupMapExploreHandlers: setupMapExploreHandlers,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapExploreOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Smart zoom toggle orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[SmartZoom] Orchestration runtime not bound');
        }
        return runtime;
    }

    function toggleSmartZoom() {
        const smartZoom = rt().smartZoom();
        const toggleUi = rt().toggleUI();
        const collected = smartZoom.buildToggleSmartZoomCollectPlan({
            currentlyEnabled: rt().getSmartZoomEnabled(),
        });
        const execute = smartZoom.buildToggleSmartZoomExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        rt().setSmartZoomEnabled(execute.enabled);
        const btn = document.getElementById(execute.toggle.id);
        if (btn) toggleUi.applyToggleButton(btn, execute.toggle.enabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.saveAllSettings) rt().call.saveAllSettings();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage, rt().getSmartZoomEnabled());
    }

    function applySmartZoomWithAnimation(speedMph, distanceToNextTurn, roadType, userLat, userLon) {
        if (distanceToNextTurn === undefined) distanceToNextTurn = null;
        if (roadType === undefined) roadType = 'urban';
        if (userLat === undefined) userLat = null;
        if (userLon === undefined) userLon = null;

        const CP = rt().cameraPitch();
        const map = rt().getMap();
        const currentUserMarker = rt().getCurrentUserMarker();
        const easePlan = CP.buildSmartZoomEasePlan({
            smartZoomEnabled: rt().getSmartZoomEnabled(),
            routeInProgress: rt().getRouteInProgress(),
            speedMph: speedMph,
            distanceToNextTurn: distanceToNextTurn,
            roadType: roadType,
            lastZoomLevel: rt().getLastZoomLevel(),
            userLat: userLat,
            userLon: userLon,
            hasMap: !!map,
            zoomAndFollowEnabled: rt().getZoomAndFollowEnabled(),
            mapFollowingActive: rt().getMapFollowingActive(),
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            currentPitch: map && typeof map.getPitch === 'function' ? map.getPitch() : 0,
            currentBearing: map && typeof map.getBearing === 'function' ? map.getBearing() : 0,
            vehicleHeading: currentUserMarker && typeof currentUserMarker.heading === 'number'
                ? currentUserMarker.heading
                : null,
            usePitchedDrivingCamera: rt().call.shouldUsePitchedDrivingCamera(),
            shouldTilt: rt().call.shouldTiltDrivingCamera(),
            zoomAnimationDurationMs: rt().getZoomAnimationDurationMs(),
            turnZoomThreshold: rt().getTurnZoomThreshold(),
            computeSmartZoom: (spd, dist, rtName) => rt().routeGeometry().calculateSmartZoom(
                spd, dist, rtName, rt().getZoomLevels(), rt().getTurnZoomThreshold()
            ),
        });

        const apply = CP.buildSmartZoomApplyPlan(easePlan);
        if (apply.action !== 'apply') return;

        if (apply.easeTo && map) {
            map.easeTo(apply.easeTo);
        } else if (apply.setZoomOnly && map) {
            map.setZoom(apply.newZoomLevel);
        }

        rt().setLastZoomLevel(apply.newZoomLevel);
        rt().setLastTurnZoomApplied(apply.lastTurnZoomApplied);
        if (apply.logLine) console.log(apply.logLine);
    }

    function applySmartZoom(speedMph, distanceToNextTurn, roadType) {
        if (distanceToNextTurn === undefined) distanceToNextTurn = null;
        if (roadType === undefined) roadType = 'urban';
        applySmartZoomWithAnimation(speedMph, distanceToNextTurn, roadType, rt().getCurrentLat(), rt().getCurrentLon());
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleSmartZoom: toggleSmartZoom,
        applySmartZoomWithAnimation: applySmartZoomWithAnimation,
        applySmartZoom: applySmartZoom,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSmartZoomOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

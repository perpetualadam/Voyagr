/**
 * @file Driver perspective and navigation camera orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[DriverCamera] Orchestration runtime not bound');
        }
        return runtime;
    }

    function isActiveNavigationFollow() {
        return !!(rt().getRouteInProgress() && rt().getZoomAndFollowEnabled() && rt().getMapFollowingActive());
    }

    function userPrefersFlat2D() {
        return localStorage.getItem('mapView3DEnabled') === 'false';
    }

    function decideDrivingCameraState() {
        const state = {
            activeNavFollow: isActiveNavigationFollow(),
            driverPerspectiveEnabled: rt().getDriverPerspectiveEnabled(),
            prefersFlat2D: userPrefersFlat2D(),
        };
        const CP = rt().cameraPitch();
        if (CP && typeof CP.decideDrivingCamera === 'function') {
            return CP.decideDrivingCamera(state);
        }
        if (typeof decideDrivingCamera === 'function') {
            return decideDrivingCamera(state);
        }
        const followHeading = state.activeNavFollow || state.driverPerspectiveEnabled;
        return { followHeading: followHeading, tilt: followHeading && !state.prefersFlat2D };
    }

    function shouldUsePitchedDrivingCamera() {
        return decideDrivingCameraState().followHeading;
    }

    function shouldTiltDrivingCamera() {
        return decideDrivingCameraState().tilt;
    }

    function applyLiveNavigationCamera() {
        const map = rt().getMap();
        const currentLat = rt().getCurrentLat();
        const currentLon = rt().getCurrentLon();
        if (!map || currentLat == null || currentLon == null) return;

        const currentUserMarker = rt().getCurrentUserMarker();
        const heading = (typeof currentUserMarker?.heading === 'number')
            ? currentUserMarker.heading
            : map.getBearing();
        map.easeTo({
            duration: 1000,
            pitch: shouldTiltDrivingCamera() ? 60 : 0,
            bearing: heading,
            center: [currentLon, currentLat],
            padding: rt().cameraPitch().computeFollowPadding(window.innerHeight, window.innerWidth),
        });
        console.log('[Driver View] ' + (shouldTiltDrivingCamera() ? '60°' : 'flat 2D') + ' navigation camera (follow padding)');
    }

    function applyDriverPerspective() {
        const map = rt().getMap();
        if (!map) return;

        const currentUserMarker = rt().getCurrentUserMarker();
        const heading = (typeof currentUserMarker?.heading === 'number')
            ? currentUserMarker.heading
            : ((currentUserMarker && currentUserMarker.heading) || 0);

        const easeOptions = { duration: 1000 };

        if (shouldUsePitchedDrivingCamera()) {
            easeOptions.pitch = shouldTiltDrivingCamera() ? 60 : 0;
            easeOptions.bearing = heading;
            easeOptions.padding = rt().cameraPitch().computeFollowPadding(window.innerHeight, window.innerWidth);
            const currentLat = rt().getCurrentLat();
            const currentLon = rt().getCurrentLon();
            if (currentLat != null && currentLon != null) {
                easeOptions.center = [currentLon, currentLat];
            }
            map.easeTo(easeOptions);
            console.log('[Driver View] ' + (shouldTiltDrivingCamera() ? '60°' : 'flat 2D heading-up') + ' (navigation follow or preference)');
        } else {
            easeOptions.pitch = 0;
            easeOptions.bearing = 0;
            easeOptions.padding = { top: 50, bottom: 200, left: 50, right: 50 };
            easeOptions.duration = 500;
            map.easeTo(easeOptions);
            console.log('[Driver View] Standard top-down');
        }
    }

    function toggleDriverPerspective() {
        const MV = rt().mapView3D();
        const TU = rt().toggleUI();
        const collected = MV.buildToggleDriverPerspectiveCollectPlan({
            currentlyEnabled: rt().getDriverPerspectiveEnabled(),
        });
        const execute = MV.buildToggleDriverPerspectiveExecutePlan({
            enabled: collected.enabled,
            activeNavFollow: isActiveNavigationFollow(),
        });
        if (!execute.shouldApply) return;

        rt().setDriverPerspectiveEnabled(execute.enabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);

        const btn = document.getElementById(execute.toggleId);
        if (execute.applyToggleWithPitchedState) {
            TU.applyToggleButton(btn, shouldUsePitchedDrivingCamera());
        }

        if (rt().getMap() && execute.applyDriverPerspective) {
            applyDriverPerspective();
        }

        rt().call.showStatus(execute.statusMessage, execute.statusType);
        if (execute.recomputeMapView3D) rt().call.recomputeMapView3DFromGranular();
        if (execute.saveAllSettings) rt().call.saveAllSettings();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        isActiveNavigationFollow: isActiveNavigationFollow,
        userPrefersFlat2D: userPrefersFlat2D,
        decideDrivingCameraState: decideDrivingCameraState,
        shouldUsePitchedDrivingCamera: shouldUsePitchedDrivingCamera,
        shouldTiltDrivingCamera: shouldTiltDrivingCamera,
        applyLiveNavigationCamera: applyLiveNavigationCamera,
        applyDriverPerspective: applyDriverPerspective,
        toggleDriverPerspective: toggleDriverPerspective,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDriverCameraOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

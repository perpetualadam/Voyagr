/**
 * @file Center-on-location toggle orchestration.
 * Extracted to keep voyagr-app.js as wiring only; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    var centerMapOnLocationEnabled = (typeof VoyagrCenterOnLocation !== 'undefined'
        ? VoyagrCenterOnLocation.resolveCenterOnLocationEnabledFromStorage(
            localStorage.getItem('centerMapOnLocation')
        )
        : (localStorage.getItem('centerMapOnLocation') === null
            ? true
            : localStorage.getItem('centerMapOnLocation') === '1'
                || localStorage.getItem('centerMapOnLocation') === 'true'));

    function getCenterMapOnLocationEnabled() { return centerMapOnLocationEnabled; }
    function setCenterMapOnLocationEnabled(val) { centerMapOnLocationEnabled = !!val; }

    function rt() {
        if (!runtime) {
            throw new Error('[CenterOnLocation] Orchestration runtime not bound');
        }
        return runtime;
    }

    function flyToUserLocationIfPossible() {
        var map = rt().getMap();
        if (!map || typeof map.flyTo !== 'function') return;
        if (!navigator.geolocation) return;

        // Prefer a fresh geolocation fix over getCurrentLat/Lon, which default to
        // London until GPS has actually reported a position.
        navigator.geolocation.getCurrentPosition(
            function (position) {
                try {
                    if (!getCenterMapOnLocationEnabled()) return;
                    var lat = position.coords.latitude;
                    var lon = position.coords.longitude;
                    var decision = rt().centerOnLocation().buildCenterOnLocationFlyDecision({
                        enabled: true,
                        hasCoordinates: Number.isFinite(lat) && Number.isFinite(lon),
                    });
                    if (!decision.shouldFly) return;
                    map.flyTo({
                        center: [lon, lat],
                        zoom: 15,
                        duration: 2000,
                    });
                } catch (_) {
                    /* ignore */
                }
            },
            function () { /* ignore */ },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
    }

    function toggleCenterOnLocation() {
        var centerOnLocation = rt().centerOnLocation();
        var toggleUi = rt().toggleUI();
        var collected = centerOnLocation.buildToggleCenterOnLocationCollectPlan({
            currentlyEnabled: getCenterMapOnLocationEnabled(),
        });
        var execute = centerOnLocation.buildToggleCenterOnLocationExecutePlan({
            enabled: collected.enabled,
        });
        if (!execute.shouldApply) return;

        setCenterMapOnLocationEnabled(execute.enabled);
        var btn = document.getElementById(execute.toggle.id);
        if (btn) toggleUi.applyToggleButton(btn, execute.toggle.enabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.saveAllSettings) rt().call.saveAllSettings();
        if (execute.shouldFlyToUser) flyToUserLocationIfPossible();
        rt().call.showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage, getCenterMapOnLocationEnabled());
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleCenterOnLocation: toggleCenterOnLocation,
        flyToUserLocationIfPossible: flyToUserLocationIfPossible,
        getCenterMapOnLocationEnabled: getCenterMapOnLocationEnabled,
        setCenterMapOnLocationEnabled: setCenterMapOnLocationEnabled,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrCenterOnLocationOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

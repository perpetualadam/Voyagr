/**
 * @file Vehicle type and routing mode orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[VehicleRouting] Orchestration runtime not bound');
        }
        return runtime;
    }

    function updateUserMarkerIcon() {
        const vehicleIcons = rt().getVehicleIcons();
        const iconPath = vehicleIcons[rt().getCurrentRoutingMode()]
            || vehicleIcons[rt().getCurrentVehicleType()]
            || vehicleIcons.petrol_diesel;

        const currentUserMarker = rt().getCurrentUserMarker();
        if (currentUserMarker) {
            if (typeof currentUserMarker.remove === 'function') currentUserMarker.remove();
            rt().setCurrentUserMarker(null);
        }

        rt().setCurrentUserMarkerIcon(iconPath);
        console.log('[Marker] Icon updated to:', iconPath);
    }

    function updateVehicleType() {
        const select = document.getElementById('vehicleType');
        rt().setCurrentVehicleType(select.value);
        localStorage.setItem('vehicleType', rt().getCurrentVehicleType());

        updateUserMarkerIcon();

        console.log('[Vehicle] Type changed to:', rt().getCurrentVehicleType());
        rt().call.saveAllSettings();
        rt().call.showStatus('🚗 Vehicle type: ' + select.options[select.selectedIndex].text, 'info');
    }

    function setRoutingMode(mode) {
        rt().setCurrentRoutingMode(mode);
        localStorage.setItem('routingMode', mode);

        document.getElementById('routingAuto').classList.toggle('active', mode === 'auto');
        document.getElementById('routingPedestrian').classList.toggle('active', mode === 'pedestrian');
        document.getElementById('routingBicycle').classList.toggle('active', mode === 'bicycle');

        if (mode === 'pedestrian') {
            document.getElementById('vehicleType').style.display = 'none';
            rt().setCurrentVehicleType('pedestrian');
        } else if (mode === 'bicycle') {
            document.getElementById('vehicleType').style.display = 'none';
            rt().setCurrentVehicleType('bicycle');
        } else {
            document.getElementById('vehicleType').style.display = 'block';
            rt().setCurrentVehicleType(document.getElementById('vehicleType').value);
        }

        updateUserMarkerIcon();

        console.log('[Routing] Mode changed to:', mode);
        const modeNames = { auto: '🚗 Auto', pedestrian: '🚶 Pedestrian', bicycle: '🚴 Bicycle' };
        rt().call.saveAllSettings();
        rt().call.showStatus(modeNames[mode] + ' mode', 'info');
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        updateVehicleType: updateVehicleType,
        setRoutingMode: setRoutingMode,
        updateUserMarkerIcon: updateUserMarkerIcon,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVehicleRoutingOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

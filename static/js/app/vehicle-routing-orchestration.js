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

    function createVehicleMarker(lat, lon, speed, accuracy, heading) {
        if (heading === undefined) heading = 0;
        const vehicleIconEmojis = rt().getVehicleIconEmojis();
        const iconEmoji = vehicleIconEmojis[rt().getCurrentRoutingMode()]
            || vehicleIconEmojis[rt().getCurrentVehicleType()]
            || '🚗';
        const safeHeading = Number.isFinite(heading) ? heading : 0;
        const safeAccuracy = Number.isFinite(accuracy) ? accuracy : null;
        const accuracyLabel = safeAccuracy != null ? '±' + safeAccuracy.toFixed(0) + 'm' : '—';

        const markerDiv = document.createElement('div');
        markerDiv.style.width = '60px';
        markerDiv.style.height = '60px';
        markerDiv.style.display = 'flex';
        markerDiv.style.alignItems = 'center';
        markerDiv.style.justifyContent = 'center';
        markerDiv.style.position = 'relative';

        const map = rt().getMap();
        const mapBr = map && typeof map.getBearing === 'function' ? map.getBearing() : 0;
        const rot = ((safeHeading - mapBr) % 360 + 360) % 360;
        markerDiv.style.transform = 'rotate(' + rot + 'deg)';
        markerDiv.style.transition = 'transform 0.3s ease-out';
        markerDiv.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))';
        markerDiv.style.transformStyle = 'preserve-3d';
        markerDiv.innerHTML = rt().vehicleMarker().buildVehicleArrowSvg();

        const speedKmh = Number.isFinite(speed) ? (speed * 3.6).toFixed(1) : '0.0';
        const speedUnit = rt().call.getSpeedUnit();
        const displaySpeed = rt().call.convertSpeed(speedKmh);

        const marker = rt().getMapLibreHelpers().createMarker(lat, lon, {
            html: markerDiv.outerHTML,
            iconSize: [60, 60],
            iconAnchor: [30, 30],
            className: 'vehicle-marker-icon',
            rotationAlignment: 'map',
            pitchAlignment: 'map',
            popup: rt().vehicleMarker().buildVehicleMarkerPopupHtml({
                iconEmoji: iconEmoji,
                displaySpeed: displaySpeed,
                speedUnit: speedUnit,
                headingDegrees: Math.round(safeHeading),
                accuracyLabel: accuracyLabel,
            }),
        });

        marker.heading = safeHeading;
        marker.speed = Number.isFinite(speed) ? speed : 0;
        marker.accuracy = safeAccuracy;

        return marker;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        updateVehicleType: updateVehicleType,
        setRoutingMode: setRoutingMode,
        updateUserMarkerIcon: updateUserMarkerIcon,
        createVehicleMarker: createVehicleMarker,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrVehicleRoutingOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

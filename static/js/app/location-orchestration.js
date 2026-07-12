/**
 * @file Location picker orchestration (current location FAB and form fields).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[Location] Orchestration runtime not bound');
        }
        return runtime;
    }

    function getCurrentLocation() {
        if (!navigator.geolocation) {
            rt().call.showStatus('Geolocation not supported', 'error');
            return;
        }

        rt().call.showStatus('Getting location...', 'loading');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                rt().setCurrentLat(lat);
                rt().setCurrentLon(lon);

                const map = rt().getMap();
                map.flyTo([lat, lon], 15, {
                    duration: rt().getZoomAnimationDuration(),
                    easeLinearity: 0.25
                });

                const startMarker = rt().getStartMarker();
                if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
                const marker = rt().getMapLibreHelpers().createCircleMarker(lat, lon, {
                    radius: 8,
                    fillColor: '#667eea',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 0.8
                }).addTo(map);
                marker.bindPopup('Current Location');
                rt().setStartMarker(marker);

                rt().call.showStatus('Location found!', 'success');
            },
            (error) => {
                rt().call.showStatus('Error: ' + error.message, 'error');
            }
        );
    }

    function setCurrentLocation(field) {
        if (!navigator.geolocation) {
            rt().call.showStatus('Geolocation not supported', 'error');
            return;
        }

        rt().call.showStatus('Getting location...', 'loading');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const input = document.getElementById(field);

                input.value = 'Current Location';
                input.dataset.lat = lat;
                input.dataset.lon = lon;
                input.dataset.displayName = 'Current Location';

                rt().setCurrentLat(lat);
                rt().setCurrentLon(lon);
                rt().call.showStatus('Location set!', 'success');
            },
            (error) => {
                rt().call.showStatus('Error: ' + error.message, 'error');
            }
        );
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        getCurrentLocation: getCurrentLocation,
        setCurrentLocation: setCurrentLocation,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLocationOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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

    function swapStartAndDestination() {
        const startInput = document.getElementById('start');
        const endInput = document.getElementById('end');

        if (!startInput || !endInput) {
            rt().call.showStatus('Error: Location inputs not found', 'error');
            return;
        }

        const startValue = startInput.value;
        const startLat = startInput.dataset.lat;
        const startLon = startInput.dataset.lon;
        const startDisplayName = startInput.dataset.displayName;

        const endValue = endInput.value;
        const endLat = endInput.dataset.lat;
        const endLon = endInput.dataset.lon;
        const endDisplayName = endInput.dataset.displayName;

        startInput.value = endValue || '';
        startInput.dataset.lat = endLat || '';
        startInput.dataset.lon = endLon || '';
        startInput.dataset.displayName = endDisplayName || '';

        endInput.value = startValue || '';
        endInput.dataset.lat = startLat || '';
        endInput.dataset.lon = startLon || '';
        endInput.dataset.displayName = startDisplayName || '';

        const startMarker = rt().getStartMarker();
        const endMarker = rt().getEndMarker();
        if (startMarker && endMarker) {
            const startLatLng = startMarker.getLatLng();
            const endLatLng = endMarker.getLatLng();
            startMarker.setLatLng(endLatLng);
            endMarker.setLatLng(startLatLng);
        }

        const swapBtn = document.getElementById('swapLocationsBtn');
        if (swapBtn) {
            const domHelpers = rt().domHelpers();
            swapBtn.style.background = domHelpers.SWAP_LOCATIONS_FLASH_STYLE.background;
            swapBtn.style.borderColor = domHelpers.SWAP_LOCATIONS_FLASH_STYLE.borderColor;
            setTimeout(() => {
                swapBtn.style.background = domHelpers.SWAP_LOCATIONS_REST_STYLE.background;
                swapBtn.style.borderColor = domHelpers.SWAP_LOCATIONS_REST_STYLE.borderColor;
            }, domHelpers.SWAP_LOCATIONS_FLASH_MS);
        }

        rt().call.showStatus('🔄 Start and destination swapped', 'success');

        const hasStart = startInput.value && startInput.dataset.lat && startInput.dataset.lon;
        const hasEnd = endInput.value && endInput.dataset.lat && endInput.dataset.lon;

        if (hasStart && hasEnd && rt().getRouteLayer()) {
            console.log('[Swap] Recalculating route after swap...');
            setTimeout(() => {
                rt().call.calculateRoute();
            }, 100);
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        getCurrentLocation: getCurrentLocation,
        setCurrentLocation: setCurrentLocation,
        swapStartAndDestination: swapStartAndDestination,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLocationOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

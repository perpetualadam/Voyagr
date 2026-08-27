/**
 * @file Auto GPS location orchestration (periodic start-field updates).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var autoGpsEnabled = false;
    var autoGpsLocationMonitor = null;
    var AUTO_GPS_UPDATE_INTERVAL = 5000;

    function rt() {
        if (!runtime) {
            throw new Error('[AutoGps] Orchestration runtime not bound');
        }
        return runtime;
    }

    function toggleAutoGpsLocation() {
        const toggle = document.getElementById('autoGpsToggle');
        autoGpsEnabled = toggle.checked;

        if (autoGpsEnabled) {
            startAutoGpsLocation();
        } else {
            stopAutoGpsLocation();
        }

        localStorage.setItem('autoGpsEnabled', autoGpsEnabled);
    }

    function startAutoGpsLocation() {
        if (!navigator.geolocation) {
            rt().call.showStatus('❌ Geolocation not supported by your browser', 'error');
            document.getElementById('autoGpsToggle').checked = false;
            autoGpsEnabled = false;
            return;
        }

        if (autoGpsLocationMonitor != null) {
            console.log('[Auto GPS] Location monitor already running');
            return;
        }

        rt().call.showStatus('📍 Auto GPS location enabled. Fetching your location...', 'success');
        console.log('[Auto GPS] Starting auto location monitoring');

        updateAutoGpsLocation();

        autoGpsLocationMonitor = setInterval(() => {
            updateAutoGpsLocation();
        }, AUTO_GPS_UPDATE_INTERVAL);
    }

    function stopAutoGpsLocation() {
        if (autoGpsLocationMonitor) {
            clearInterval(autoGpsLocationMonitor);
            autoGpsLocationMonitor = null;
        }
        const startEl = document.getElementById('start');
        if (startEl && startEl.dataset.lat && startEl.dataset.lon) {
            const la = parseFloat(startEl.dataset.lat);
            const lo = parseFloat(startEl.dataset.lon);
            if (Number.isFinite(la) && Number.isFinite(lo)) {
                startEl.value = la.toFixed(6) + ',' + lo.toFixed(6);
                delete startEl.dataset.displayName;
            }
        }
        rt().call.showStatus('📍 Auto GPS location disabled', 'info');
        console.log('[Auto GPS] Auto location monitoring stopped');
    }

    function updateAutoGpsLocation() {
        if (!autoGpsEnabled) return;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const accuracy = position.coords.accuracy;

                const startEl = document.getElementById('start');
                if (startEl) {
                    startEl.value = 'Current Location';
                    startEl.dataset.lat = String(lat);
                    startEl.dataset.lon = String(lon);
                    startEl.dataset.displayName = 'Current Location';
                }
                rt().setCurrentLat(lat);
                rt().setCurrentLon(lon);

                console.log('[Auto GPS] Location updated: ' + lat.toFixed(6) + ', ' + lon.toFixed(6) + ' (accuracy: ' + accuracy.toFixed(0) + 'm)');

                if (!window.lastAutoGpsLat ||
                    rt().call.calculateDistanceMeters(window.lastAutoGpsLat, window.lastAutoGpsLon, lat, lon) > 0.05) {
                    rt().call.showStatus('📍 Location updated: ' + lat.toFixed(4) + ', ' + lon.toFixed(4), 'info');
                    window.lastAutoGpsLat = lat;
                    window.lastAutoGpsLon = lon;
                }
            },
            (error) => {
                console.log('[Auto GPS] Error: ' + error.message);
            }
        );
    }

    function getAutoGpsEnabled() {
        return autoGpsEnabled;
    }

    function setAutoGpsEnabled(val) {
        autoGpsEnabled = !!val;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleAutoGpsLocation: toggleAutoGpsLocation,
        startAutoGpsLocation: startAutoGpsLocation,
        stopAutoGpsLocation: stopAutoGpsLocation,
        updateAutoGpsLocation: updateAutoGpsLocation,
        getAutoGpsEnabled: getAutoGpsEnabled,
        setAutoGpsEnabled: setAutoGpsEnabled,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrAutoGpsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

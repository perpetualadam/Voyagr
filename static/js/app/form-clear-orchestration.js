/**
 * @file Form clear orchestration (reset inputs, markers, map view).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[FormClear] Orchestration runtime not bound');
        }
        return runtime;
    }

    function clearForm() {
        const startEl = document.getElementById('start');
        if (startEl) {
            startEl.value = '';
            delete startEl.dataset.lat;
            delete startEl.dataset.lon;
            delete startEl.dataset.displayName;
        }
        document.getElementById('end').value = '';
        document.getElementById('result').classList.remove('show');
        document.getElementById('status').className = 'status';

        const viaInput = document.getElementById('viaPointAddress');
        if (viaInput) viaInput.value = '';
        const stopInput = document.getElementById('stopAddress');
        if (stopInput) stopInput.value = '';

        const startMarker = rt().getStartMarker();
        const endMarker = rt().getEndMarker();
        const routeLayer = rt().getRouteLayer();
        if (startMarker && typeof startMarker.remove === 'function') startMarker.remove();
        if (endMarker && typeof endMarker.remove === 'function') endMarker.remove();
        if (routeLayer && typeof routeLayer.remove === 'function') routeLayer.remove();

        rt().call.clearParkingSelection();

        const map = rt().getMap();
        map.flyTo({
            center: [-0.1278, 51.5074],
            zoom: 13,
            duration: rt().getZoomAnimationDurationMs()
        });
        rt().setLastZoomLevel(13);

        if (root.VoyagrAutoGpsOrchestration.getAutoGpsEnabled()) {
            rt().call.updateAutoGpsLocation();
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        clearForm: clearForm,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrFormClearOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Clean Air Zone (CAZ) information and route-check orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var cazZonesData = null;
    var cazPassTypes = null;

    function rt() {
        if (!runtime) {
            throw new Error('[CazInfo] Orchestration runtime not bound');
        }
        return runtime;
    }

    function CAZ() { return rt().cazInfo(); }

    async function showCAZInfo() {
        const container = document.getElementById('cazInfoContainer');
        if (!container) return;

        if (container.style.display === 'block') {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = CAZ().buildCazLoadingHtml();

        try {
            if (!cazZonesData) {
                const response = await fetch('/api/caz-zones');
                const data = await response.json();
                if (data.success) {
                    cazZonesData = data.zones;
                } else {
                    throw new Error(data.error || 'Failed to load CAZ zones');
                }
            }

            container.innerHTML = CAZ().buildCazZonesListHtml(cazZonesData);
        } catch (error) {
            console.error('[CAZ] Error loading zones:', error);
            container.innerHTML = CAZ().buildCazErrorHtml(error.message);
        }
    }

    async function getCAZPassTypes() {
        if (cazPassTypes) return cazPassTypes;

        try {
            const response = await fetch('/api/caz-pass-types');
            const data = await response.json();
            if (data.success) {
                cazPassTypes = data.pass_types;
                return cazPassTypes;
            }
        } catch (error) {
            console.error('[CAZ] Error loading pass types:', error);
        }
        return [];
    }

    async function checkRouteCAZ(routeCoords, vehicleCazPass, vehicleType) {
        if (vehicleCazPass === undefined) vehicleCazPass = 'none';
        if (vehicleType === undefined) vehicleType = 'petrol_diesel';

        try {
            const response = await fetch('/api/caz-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    route_coords: routeCoords,
                    vehicle_caz_pass: vehicleCazPass,
                    vehicle_type: vehicleType,
                }),
            });
            const data = await response.json();
            if (data.success) {
                return data.caz_result;
            }
        } catch (error) {
            console.error('[CAZ] Error checking route:', error);
        }
        return null;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        showCAZInfo: showCAZInfo,
        getCAZPassTypes: getCAZPassTypes,
        checkRouteCAZ: checkRouteCAZ,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrCazOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

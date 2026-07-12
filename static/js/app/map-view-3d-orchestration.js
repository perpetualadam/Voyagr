/**
 * @file 2D/3D map view scene preset orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[MapView3D] Orchestration runtime not bound');
        }
        return runtime;
    }

    function syncMapView3DToggleUI() {
        const TU = rt().toggleUI();
        const plan = rt().mapView3D().buildSyncMapView3DToggleUIPlan({
            mapView3DEnabled: rt().getMapView3DEnabled(),
            driverPerspectiveEnabled: rt().getDriverPerspectiveEnabled(),
            buildings3DEnabled: rt().getBuildings3DEnabled(),
        });
        if (!plan.shouldApply) return;

        const master = document.getElementById(plan.masterToggleId);
        if (master) {
            TU.applyToggleButton(master, plan.mapView3DEnabled);
            if (plan.clearMasterInactiveStylesWhenOff && !plan.mapView3DEnabled) {
                master.style.background = '';
                master.style.borderColor = '';
            }
        }
        TU.applyToggleButton(document.getElementById(plan.driverPerspectiveToggleId), plan.driverPerspectiveEnabled);
        TU.applyToggleButton(document.getElementById(plan.buildings3DToggleId), plan.buildings3DEnabled);
    }

    function setMapView3D(enabled) {
        const execute = rt().mapView3D().buildSetMapView3DExecutePlan(enabled, {
            heightMultiplier: rt().getBuildings3DHeightMultiplier(),
            opacity: rt().getBuildings3DOpacity(),
        });
        if (!execute.shouldApply) return;

        rt().setMapView3DEnabled(execute.mapView3DEnabled);
        localStorage.setItem(execute.mapViewStorageKey, execute.mapViewStorageValue);

        rt().setDriverPerspectiveEnabled(execute.driverPerspectiveEnabled);
        localStorage.setItem(execute.driverPerspectiveStorageKey, execute.driverPerspectiveStorageValue);
        if (rt().getMap() && execute.applyDriverPerspective) rt().call.applyDriverPerspective();

        rt().setBuildings3DEnabled(execute.buildings3DEnabled);
        localStorage.setItem(execute.buildings3DStorageKey, execute.buildings3DStorageValue);
        const map = rt().getMap();
        const mapLibreHelpers = rt().getMapLibreHelpers();
        if (map && mapLibreHelpers) {
            if (execute.mapBuildingsAction === 'add3DBuildings') {
                mapLibreHelpers.add3DBuildings(map, {
                    heightMultiplier: execute.heightMultiplier,
                    opacity: execute.opacity,
                });
            } else {
                mapLibreHelpers.remove3DBuildings(map);
            }
        }

        if (execute.syncToggleUI) syncMapView3DToggleUI();
    }

    function toggleMapView3D() {
        const MV = rt().mapView3D();
        const collected = MV.buildToggleMapView3DCollectPlan({
            currentlyEnabled: rt().getMapView3DEnabled(),
        });
        const execute = MV.buildToggleMapView3DExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        setMapView3D(execute.enabled);
        rt().call.showStatus(execute.statusMessage, execute.statusType);
        if (execute.saveAllSettings) rt().call.saveAllSettings();
    }

    function recomputeMapView3DFromGranular() {
        const execute = rt().mapView3D().buildRecomputeMapView3DFromGranularExecutePlan({
            driverPerspectiveEnabled: rt().getDriverPerspectiveEnabled(),
            buildings3DEnabled: rt().getBuildings3DEnabled(),
        });
        if (!execute.shouldApply) return;

        rt().setMapView3DEnabled(execute.mapView3DEnabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.syncToggleUI) syncMapView3DToggleUI();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        syncMapView3DToggleUI: syncMapView3DToggleUI,
        setMapView3D: setMapView3D,
        toggleMapView3D: toggleMapView3D,
        recomputeMapView3DFromGranular: recomputeMapView3DFromGranular,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapView3DOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

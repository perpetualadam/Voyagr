/**
 * @file Route hazard map marker orchestration (display/clear on map).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var win = root;

    function rt() {
        if (!runtime) {
            throw new Error('[HazardMap] Orchestration runtime not bound');
        }
        return runtime;
    }

    function collectDisplayHazardMarkersInput(hazards) {
        var OSM = rt().osmMapIcons();
        var pillHtml = rt().call.getOsmTrafficLightMarkerPillHTML();
        return {
            hazards: hazards,
            markerOpts: {
                osmTrafficLightPillHtml: pillHtml,
                osmTrafficLightIconSize: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
                osmTrafficLightPopupIcon: OSM.buildOsmTrafficLightPopupIconWrapperHtml(pillHtml),
            },
        };
    }

    function applyDisplayHazardMarkersFromPlan(execute) {
        if (!execute) return;

        if (!execute.shouldDisplay) {
            if (execute.clearExisting) clearHazardMarkers();
            if (execute.emptyLogMessage) console.log(execute.emptyLogMessage);
            return;
        }

        if (execute.clearExisting) clearHazardMarkers();

        var map = rt().getMap();
        var mapLibre = rt().getMapLibreHelpers();
        execute.markers.forEach(function (spec) {
            var marker = mapLibre.createMarker(spec.lat, spec.lon, {
                className: spec.className,
                html: spec.markerHtml,
                iconSize: spec.iconSize,
                iconAnchor: spec.iconAnchor,
                popup: spec.popupHtml,
            }).addTo(map);

            if (execute.pushToMarkerArray) win.hazardMarkers.push(marker);
        });

        if (execute.successLogMessage) console.log(execute.successLogMessage);
    }

    function displayHazardMarkers(hazards) {
        applyDisplayHazardMarkersFromPlan(
            rt().hazardMapMarkers().buildDisplayHazardMarkersEntryOrchestrationPlan(
                collectDisplayHazardMarkersInput(hazards)
            ).execute
        );
    }

    function applyClearHazardMarkersFromPlan(execute) {
        if (!execute) return;

        var existing = win.hazardMarkers || [];
        if (!execute.shouldClear) {
            if (execute.resetMarkerArray) win.hazardMarkers = [];
            return;
        }

        existing.forEach(function (marker) {
            if (marker && typeof marker.remove === 'function') {
                marker.remove();
            }
        });
        if (execute.resetMarkerArray) win.hazardMarkers = [];
    }

    function clearHazardMarkers() {
        var existing = win.hazardMarkers || [];
        applyClearHazardMarkersFromPlan(
            rt().hazardMapMarkers().buildClearHazardMarkersEntryOrchestrationPlan(existing.length).execute
        );
    }

    function applyDisplayAllRouteHazardsFromPlan(apply) {
        if (!apply || !apply.shouldApply) return;
        displayHazardMarkers(apply.hazards);
        if (apply.logMessage) console.log(apply.logMessage);
    }

    function displayAllRouteHazards() {
        applyDisplayAllRouteHazardsFromPlan(
            rt().hazardMapMarkers().buildDisplayAllRouteHazardsEntryOrchestrationPlan(
                rt().getRouteOptions()
            ).apply
        );
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        if (!win.hazardMarkers) win.hazardMarkers = [];
    }

    var api = {
        bind: bind,
        displayHazardMarkers: displayHazardMarkers,
        clearHazardMarkers: clearHazardMarkers,
        displayAllRouteHazards: displayAllRouteHazards,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrHazardMapOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

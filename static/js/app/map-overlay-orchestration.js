/**
 * @file Always-on map overlays orchestration (cameras, OSM traffic lights, railway crossings, road labels init).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var MOT = typeof VoyagrMapOverlayToggles !== 'undefined' ? VoyagrMapOverlayToggles : null;
    var showCamerasEnabled = MOT
        ? MOT.resolveShowCamerasEnabledFromStorage(localStorage.getItem('showCamerasEnabled'))
        : localStorage.getItem('showCamerasEnabled') !== 'false';
    var showOsmTrafficLightsEnabled = MOT
        ? MOT.resolveShowOsmTrafficLightsEnabledFromStorage(localStorage.getItem('showOsmTrafficLightsOnMap'))
        : localStorage.getItem('showOsmTrafficLightsOnMap') !== 'false';
    var showOsmRailwayCrossingsEnabled = MOT
        ? MOT.resolveShowOsmRailwayCrossingsEnabledFromStorage(localStorage.getItem('showOsmRailwayCrossingsOnMap'))
        : localStorage.getItem('showOsmRailwayCrossingsOnMap') !== 'false';

    var win = root;
    win.cameraMarkers = win.cameraMarkers || [];
    win.osmTrafficLightMarkers = win.osmTrafficLightMarkers || [];
    win.osmRailwayCrossingMarkers = win.osmRailwayCrossingMarkers || [];

    function rt() {
        if (!runtime) {
            throw new Error('[MapOverlay] Orchestration runtime not bound');
        }
        return runtime;
    }

    function OT() { return rt().mapOverlayToggles(); }
    function TU() { return rt().toggleUI(); }

    function getOsmTrafficLightMarkerInnerSVG() {
        if (typeof TrafficLights !== 'undefined' && TrafficLights.createIconSVG) {
            return TrafficLights.createIconSVG('none', OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_WIDTH, OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_HEIGHT);
        }
        return rt().osmMapIcons().buildOsmTrafficLightFallbackSvg();
    }

    function getOsmTrafficLightMarkerPillHTML() {
        return rt().osmMapIcons().buildOsmTrafficLightMarkerPillHtml(getOsmTrafficLightMarkerInnerSVG());
    }

    function applyClearOverlayMarkersFromPlan(execute) {
        if (!execute || !execute.shouldClear) return;
        var markers = win[execute.markersProperty];
        if (markers) {
            markers.forEach(function (marker) {
                if (marker && typeof marker.remove === 'function') {
                    marker.remove();
                }
            });
        }
        if (execute.resetMarkerArray) {
            win[execute.markersProperty] = [];
        }
    }

    function clearCameraMarkers() {
        applyClearOverlayMarkersFromPlan(OT().buildClearCameraMarkersExecutePlan());
    }

    function displayCameraMarkers(cameras) {
        var map = rt().getMap();
        var mapLibre = rt().getMapLibreHelpers();
        var collect = OT().buildDisplayCameraMarkersCollectPlan(cameras);
        if (!collect.shouldDisplay) {
            if (collect.clearMarkers) clearCameraMarkers();
            return;
        }

        clearCameraMarkers();

        var HM = rt().hazardMapMarkers();
        var styleMap = HM.getHazardMarkerStyleMap();
        var CAM = rt().cameraMapMarkers();
        var MT = root.VoyagrMapTheme;
        var markerCtx = MT && typeof MT.buildBasemapMarkerContext === 'function'
            ? MT.buildBasemapMarkerContext()
            : { darkBasemap: false };
        var specs = CAM.buildCameraMarkersMountSpecs(collect.items, styleMap, {
            normalizeBucket: function (bucket) { return HM.normalizeCameraHazardTypeForMarker(bucket); },
            markerClassName: collect.markerClassName,
            markerSvgSize: collect.markerSvgSize,
            popupSvgSize: collect.popupSvgSize,
            iconSize: collect.iconSize,
            iconAnchor: collect.iconAnchor,
            darkBasemap: markerCtx.darkBasemap,
        });

        specs.forEach(function (spec) {
            var marker = mapLibre.createMarker(spec.lat, spec.lon, {
                className: spec.className,
                html: spec.html,
                iconSize: spec.iconSize,
                iconAnchor: spec.iconAnchor,
                popup: spec.popup,
            }).addTo(map);
            win.cameraMarkers.push(marker);
        });

        console.log(collect.displayedLogPrefix + win.cameraMarkers.length + collect.displayedLogSuffix);
    }

    function fetchAndDisplayCameras() {
        var map = rt().getMap();
        var dispatch = OT().buildFetchCamerasDispatchPlan({
            enabled: showCamerasEnabled,
            hasMap: !!map,
            zoom: map ? map.getZoom() : 0,
        });
        if (!dispatch.shouldFetch) {
            if (dispatch.clearMarkers) clearCameraMarkers();
            if (dispatch.lowZoomLogMessage) console.log(dispatch.lowZoomLogMessage);
            return;
        }

        var bounds = map.getBounds();
        var north = bounds.getNorth();
        var south = bounds.getSouth();
        var east = bounds.getEast();
        var west = bounds.getWest();

        var url = OT().buildAreaBoundsApiUrl(north, south, east, west, dispatch.apiPath);

        fetchOsmAreaOverlay(url, dispatch.logLabel || 'Cameras')
            .then(function (data) {
                if (data && data.success && data.cameras) {
                    displayCameraMarkers(data.cameras);
                    console.log('[Cameras] Loaded ' + data.cameras.length + ' cameras in viewport');
                }
            });
    }

    function toggleShowCameras() {
        var collected = OT().buildToggleShowCamerasCollectPlan({ currentlyEnabled: showCamerasEnabled });
        var execute = OT().buildToggleShowCamerasExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        showCamerasEnabled = execute.enabled;
        TU().writeBoolPref(execute.storageKey, showCamerasEnabled);
        TU().applyToggleButton(document.getElementById(execute.toggleId), showCamerasEnabled);
        (execute.fabToggleIds || []).forEach(function (fabId) {
            TU().applyToggleButton(document.getElementById(fabId), showCamerasEnabled);
        });

        if (execute.mapAction === 'fetchCameras') {
            fetchAndDisplayCameras();
            console.log(execute.enabledLogMessage);
        } else {
            clearCameraMarkers();
            console.log(execute.disabledLogMessage);
        }
        if (execute.saveAllSettings) rt().call.saveAllSettings();
    }

    function clearOsmTrafficLightMarkers() {
        applyClearOverlayMarkersFromPlan(OT().buildClearOsmTrafficLightMarkersExecutePlan());
    }

    function clearOsmRailwayCrossingMarkers() {
        applyClearOverlayMarkersFromPlan(OT().buildClearOsmRailwayCrossingMarkersExecutePlan());
    }

    function fetchOsmAreaOverlay(url, logLabel) {
        return fetch(url)
            .then(function (response) {
                var httpPlan = OT().buildOsmAreaOverlayResponsePlan({
                    ok: response.ok,
                    statusCode: response.status,
                    logLabel: logLabel,
                });
                if (!httpPlan.shouldParseJson) {
                    console.warn(httpPlan.logMessage);
                    return null;
                }
                return response.json();
            })
            .catch(function (err) {
                var errPlan = OT().buildOsmAreaOverlayFetchErrorPlan({
                    logLabel: logLabel,
                    errorMessage: err.message || String(err),
                });
                console.warn(errPlan.logMessage);
                return errPlan.result;
            });
    }

    function displayOsmTrafficLightMarkers(lights) {
        var map = rt().getMap();
        var mapLibre = rt().getMapLibreHelpers();
        var collect = OT().buildDisplayOsmTrafficLightMarkersCollectPlan(lights);
        if (!collect.shouldDisplay) {
            if (collect.clearMarkers) clearOsmTrafficLightMarkers();
            return;
        }
        clearOsmTrafficLightMarkers();
        var OSM = rt().osmMapIcons();
        var pill = getOsmTrafficLightMarkerPillHTML();
        collect.items.forEach(function (light) {
            var marker = mapLibre.createMarker(light.lat, light.lon, {
                className: collect.markerClassName,
                html: pill,
                iconSize: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_SIZE,
                iconAnchor: OSM.OSM_TRAFFIC_LIGHT_MARKER_ICON_ANCHOR,
                popup: OSM.buildOsmTrafficLightPopupHtml(pill),
            }).addTo(map);
            win.osmTrafficLightMarkers.push(marker);
        });
    }

    function displayOsmRailwayCrossingMarkers(crossings) {
        var map = rt().getMap();
        var mapLibre = rt().getMapLibreHelpers();
        var collect = OT().buildDisplayOsmRailwayCrossingMarkersCollectPlan(crossings);
        if (!collect.shouldDisplay) {
            if (collect.clearMarkers) clearOsmRailwayCrossingMarkers();
            return;
        }
        clearOsmRailwayCrossingMarkers();
        var OSM = rt().osmMapIcons();
        var crossingIcon = OSM.buildRailwayCrossingIconSvg();
        var popupHtml = OSM.buildRailwayCrossingPopupHtml(crossingIcon);
        collect.items.forEach(function (cx) {
            var marker = mapLibre.createMarker(cx.lat, cx.lon, {
                className: collect.markerClassName,
                html: OSM.buildRailwayCrossingMarkerHtml(crossingIcon),
                iconSize: collect.iconSize,
                iconAnchor: collect.iconAnchor,
                popup: popupHtml,
            }).addTo(map);
            win.osmRailwayCrossingMarkers.push(marker);
        });
    }

    function fetchAndDisplayOsmTrafficLights() {
        var map = rt().getMap();
        if (!map) return;
        var bounds = map.getBounds();
        var dispatch = OT().buildFetchOsmOverlayDispatchPlan({
            enabled: showOsmTrafficLightsEnabled,
            hasMap: true,
            zoom: map.getZoom(),
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
            apiPath: OT().OSM_TRAFFIC_LIGHTS_AREA_API_PATH,
            logLabel: 'OSM Traffic Lights',
        });
        if (!dispatch.shouldFetch) {
            if (dispatch.clearMarkers) clearOsmTrafficLightMarkers();
            return;
        }
        fetchOsmAreaOverlay(dispatch.url, dispatch.logLabel).then(function (data) {
            if (data && data.success && data.traffic_lights) {
                displayOsmTrafficLightMarkers(data.traffic_lights);
            }
        });
    }

    function fetchAndDisplayOsmRailwayCrossings() {
        var map = rt().getMap();
        if (!map) return;
        var bounds = map.getBounds();
        var dispatch = OT().buildFetchOsmOverlayDispatchPlan({
            enabled: showOsmRailwayCrossingsEnabled,
            hasMap: true,
            zoom: map.getZoom(),
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
            apiPath: OT().OSM_RAILWAY_CROSSINGS_AREA_API_PATH,
            logLabel: 'OSM Railway Crossings',
        });
        if (!dispatch.shouldFetch) {
            if (dispatch.clearMarkers) clearOsmRailwayCrossingMarkers();
            return;
        }
        fetchOsmAreaOverlay(dispatch.url, dispatch.logLabel).then(function (data) {
            if (data && data.success && data.railway_crossings) {
                displayOsmRailwayCrossingMarkers(data.railway_crossings);
            }
        });
    }

    function toggleShowOsmTrafficLights() {
        var collected = OT().buildToggleOsmTrafficLightsCollectPlan({
            currentlyEnabled: showOsmTrafficLightsEnabled,
        });
        var execute = OT().buildToggleOsmTrafficLightsExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        showOsmTrafficLightsEnabled = execute.enabled;
        TU().writeBoolPref(execute.storageKey, showOsmTrafficLightsEnabled);
        TU().applyLabeledToggleButton(document.getElementById(execute.toggleId), showOsmTrafficLightsEnabled);

        if (execute.mapAction === 'fetchOsmTrafficLights') {
            fetchAndDisplayOsmTrafficLights();
        } else {
            clearOsmTrafficLightMarkers();
        }
        if (execute.saveAllSettings) rt().call.saveAllSettings();
    }

    function toggleShowOsmRailwayCrossings() {
        var collected = OT().buildToggleOsmRailwayCrossingsCollectPlan({
            currentlyEnabled: showOsmRailwayCrossingsEnabled,
        });
        var execute = OT().buildToggleOsmRailwayCrossingsExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        showOsmRailwayCrossingsEnabled = execute.enabled;
        TU().writeBoolPref(execute.storageKey, showOsmRailwayCrossingsEnabled);
        TU().applyLabeledToggleButton(document.getElementById(execute.toggleId), showOsmRailwayCrossingsEnabled);

        if (execute.mapAction === 'fetchOsmRailwayCrossings') {
            fetchAndDisplayOsmRailwayCrossings();
        } else {
            clearOsmRailwayCrossingMarkers();
        }
        if (execute.saveAllSettings) rt().call.saveAllSettings();
    }

    function initializeCameraLayer() {
        var map = rt().getMap();
        var execute = OT().buildInitializeCameraLayerExecutePlan({
            hasMap: !!map,
            alreadyInitialized: !!win.__voyagrCameraLayerInitialized,
            showCamerasEnabled: showCamerasEnabled,
            showOsmTrafficLightsEnabled: showOsmTrafficLightsEnabled,
            showOsmRailwayCrossingsEnabled: showOsmRailwayCrossingsEnabled,
        });
        if (!execute.shouldInit) {
            if (execute.mapNotReadyLog) console.log(execute.mapNotReadyLog);
            return;
        }
        win[execute.initFlagProperty] = true;

        (execute.toggles || []).forEach(function (toggle) {
            var el = document.getElementById(toggle.id);
            if (!el) return;
            if (toggle.labeled) TU().applyLabeledToggleButton(el, toggle.enabled);
            else TU().applyToggleButton(el, toggle.enabled);
        });

        var movePlan = OT().buildCameraLayerMapMoveHandlerPlan({
            mapMoveEvent: execute.mapMoveEvent,
            cameraMoveDebounceMs: execute.cameraMoveDebounceMs,
            osmOverlayDebounceMs: execute.osmOverlayDebounceMs,
        });
        var cameraFetchTimeout = null;
        var osmOverlayFetchTimeout = null;
        map.on(movePlan.mapMoveEvent, function () {
            if (cameraFetchTimeout) clearTimeout(cameraFetchTimeout);
            cameraFetchTimeout = setTimeout(function () {
                fetchAndDisplayCameras();
            }, movePlan.cameraFetch.debounceMs);
            if (osmOverlayFetchTimeout) clearTimeout(osmOverlayFetchTimeout);
            osmOverlayFetchTimeout = setTimeout(function () {
                fetchAndDisplayOsmTrafficLights();
                fetchAndDisplayOsmRailwayCrossings();
            }, movePlan.osmOverlayFetch.debounceMs);
        });

        var initial = execute.initialFetches || {};
        if (initial.cameras) fetchAndDisplayCameras();
        if (initial.osmTrafficLights) fetchAndDisplayOsmTrafficLights();
        if (initial.osmRailwayCrossings) fetchAndDisplayOsmRailwayCrossings();

        console.log(execute.initLogMessage);
    }

    function configureRoadLabelsForMapTheme() {
        var map = rt().getMap();
        if (!map || !rt().getMapLibreHelpers()) return;
        var MT = root.VoyagrMapTheme;
        var mapTheme = MT && typeof MT.readStoredMapTheme === 'function'
            ? MT.readStoredMapTheme()
            : 'standard';
        var labelPaint = MT && typeof MT.buildRoadLabelPaintPlan === 'function'
            ? MT.buildRoadLabelPaintPlan(mapTheme)
            : { textColor: '#1a1a1a', textHaloColor: '#ffffff', textHaloWidth: 1.5, textSize: 12 };
        rt().getMapLibreHelpers().configureRoadLabels(map, {
            enabled: rt().getRoadLabelsEnabled(),
            minZoom: 10,
            maxZoom: 22,
            textColor: labelPaint.textColor,
            textHaloColor: labelPaint.textHaloColor,
            textHaloWidth: labelPaint.textHaloWidth,
            textSize: labelPaint.textSize,
        });
    }

    function initializeRoadLabels() {
        var map = rt().getMap();
        var MLT = rt().mapLayerToggles();
        var execute = MLT.buildInitializeRoadLabelsExecutePlan({
            hasMap: !!map,
            alreadyInitialized: !!win[MLT.ROAD_LABELS_INIT_FLAG],
            roadLabelsEnabled: rt().getRoadLabelsEnabled(),
        });
        if (!execute.shouldInit) {
            if (execute.mapNotReadyLog) console.log(execute.mapNotReadyLog);
            return;
        }
        win[execute.initFlagProperty] = true;

        var toggle = document.getElementById(execute.toggleId);
        TU().applyToggleButton(toggle, execute.roadLabelsEnabled, execute.toggleInactiveStyles);
        configureRoadLabelsForMapTheme();

        console.log(execute.initLogMessage);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleShowCameras: toggleShowCameras,
        toggleShowOsmTrafficLights: toggleShowOsmTrafficLights,
        toggleShowOsmRailwayCrossings: toggleShowOsmRailwayCrossings,
        initializeCameraLayer: initializeCameraLayer,
        initializeRoadLabels: initializeRoadLabels,
        getOsmTrafficLightMarkerPillHTML: getOsmTrafficLightMarkerPillHTML,
        getShowCamerasEnabled: function () { return showCamerasEnabled; },
        setShowCamerasEnabled: function (val) { showCamerasEnabled = val; },
        getShowOsmTrafficLightsEnabled: function () { return showOsmTrafficLightsEnabled; },
        setShowOsmTrafficLightsEnabled: function (val) { showOsmTrafficLightsEnabled = val; },
        getShowOsmRailwayCrossingsEnabled: function () { return showOsmRailwayCrossingsEnabled; },
        setShowOsmRailwayCrossingsEnabled: function (val) { showOsmRailwayCrossingsEnabled = val; },
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapOverlayOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

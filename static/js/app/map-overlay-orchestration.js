/**
 * @file Always-on map overlays orchestration (cameras, OSM traffic lights, railway crossings, road labels init).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var trafficLightAreaGeneration = 0;
    var railwayAreaGeneration = 0;
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
        var OSM = rt().osmMapIcons();
        if (typeof TrafficLights !== 'undefined' && TrafficLights.createIconSVG) {
            return TrafficLights.createIconSVG('none', OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_WIDTH, OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_HEIGHT);
        }
        return OSM.buildOsmTrafficLightFallbackSvg();
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
        trafficLightAreaGeneration++;
        applyClearOverlayMarkersFromPlan(OT().buildClearOsmTrafficLightMarkersExecutePlan());
    }

    function clearOsmRailwayCrossingMarkers() {
        railwayAreaGeneration++;
        applyClearOverlayMarkersFromPlan(OT().buildClearOsmRailwayCrossingMarkersExecutePlan());
    }

    function fetchOsmAreaOverlay(url, logLabel) {
        var plans=OT();
        return fetch(url)
            .then(function (response) {
                var httpPlan = plans.buildOsmAreaOverlayResponsePlan({
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
                var errPlan = plans.buildOsmAreaOverlayFetchErrorPlan({
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
        var generation=++trafficLightAreaGeneration;
        var map = rt().getMap();
        if (!map) {clearOsmTrafficLightMarkers();return;}
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
        var status=document.getElementById('osmTrafficLightDataStatus');
        if (!dispatch.shouldFetch) {
            if(status)status.textContent=showOsmTrafficLightsEnabled?'Zoom in to load mapped traffic-light locations.':'Map traffic-light overlay is off.';
            if (dispatch.clearMarkers) clearOsmTrafficLightMarkers();
            return;
        }
        clearOsmTrafficLightMarkers();generation=trafficLightAreaGeneration;
        if(status)status.textContent='Loading mapped traffic-light locations…';
        return fetchOsmAreaOverlay(dispatch.url, dispatch.logLabel).then(function (data) {
            if(!runtime||generation!==trafficLightAreaGeneration||!showOsmTrafficLightsEnabled||rt().getMap()!==map)return;
            const boundsNow=map.getBounds();
            if([boundsNow.getNorth(),boundsNow.getSouth(),boundsNow.getEast(),boundsNow.getWest()].join(',')!==[bounds.getNorth(),bounds.getSouth(),bounds.getEast(),bounds.getWest()].join(','))return;
            const lights=data&&data.success&&Array.isArray(data.traffic_lights)?data.traffic_lights.filter(light=>light&&Number.isFinite(light.lat)&&Number.isFinite(light.lon)&&Math.abs(light.lat)<=90&&Math.abs(light.lon)<=180).slice(0,200):[];
            displayOsmTrafficLightMarkers(lights);
            if(status)status.textContent=root.TrafficLights&&root.TrafficLights.describeCoverage?root.TrafficLights.describeCoverage(data,win.osmTrafficLightMarkers.length,'area'):'Traffic-light coverage is unverified.';
        });
    }

    function describeRailwayCoverage(data, count) {
        var coverage=data&&data.coverage||{};
        if(coverage.reason==='area_too_large')return 'Level-crossing area is too large; zoom in. Coverage is partial.';
        if(!data||data.success!==true||(!count&&['UNKNOWN','UNAVAILABLE'].includes(coverage.status)))return 'Level-crossing data unavailable. Coverage is unknown; an empty overlay does not mean there are no crossings.';
        var text=count?count+' mapped level-crossing locations shown.':'No mapped level crossings returned for this area. This does not establish that there are no crossings.';
        return text+' Coverage is '+(coverage.status==='STALE'?'stale':coverage.status==='AVAILABLE'?'limited to mapped data':'partial or unverified')+'. Live barrier or train state is unavailable.';
    }

    function fetchAndDisplayOsmRailwayCrossings() {
        var generation=++railwayAreaGeneration;
        var map = rt().getMap();
        if (!map) {clearOsmRailwayCrossingMarkers();return;}
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
        var status=document.getElementById('osmRailwayCrossingDataStatus');
        if (!dispatch.shouldFetch) {
            if(status)status.textContent=showOsmRailwayCrossingsEnabled?'Zoom in to load mapped level crossings.':'Map level-crossing overlay is off.';
            if (dispatch.clearMarkers) clearOsmRailwayCrossingMarkers();
            return;
        }
        clearOsmRailwayCrossingMarkers();generation=railwayAreaGeneration;
        if(status)status.textContent='Loading mapped level-crossing locations…';
        return fetchOsmAreaOverlay(dispatch.url, dispatch.logLabel).then(function (data) {
            if(!runtime||generation!==railwayAreaGeneration||!showOsmRailwayCrossingsEnabled||rt().getMap()!==map)return;
            var current=map.getBounds();
            if([current.getNorth(),current.getSouth(),current.getEast(),current.getWest()].join(',')!==[bounds.getNorth(),bounds.getSouth(),bounds.getEast(),bounds.getWest()].join(','))return;
            var valid=data&&data.success===true&&Array.isArray(data.railway_crossings);
            var crossings=valid?data.railway_crossings.filter(point=>point&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)&&Math.abs(point.lat)<=90&&Math.abs(point.lon)<=180).slice(0,200):[];
            displayOsmRailwayCrossingMarkers(crossings);
            if(status)status.textContent=describeRailwayCoverage(valid?data:null,win.osmRailwayCrossingMarkers.length);
        });
    }

    function toggleShowOsmTrafficLights() {
        var collected = OT().buildToggleOsmTrafficLightsCollectPlan({
            currentlyEnabled: showOsmTrafficLightsEnabled,
        });
        var execute = OT().buildToggleOsmTrafficLightsExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        showOsmTrafficLightsEnabled = execute.enabled;
        var status=document.getElementById('osmTrafficLightDataStatus');if(status&&!execute.enabled)status.textContent='Map traffic-light overlay is off.';
        TU().writeBoolPref(execute.storageKey, showOsmTrafficLightsEnabled);
        TU().applyLabeledToggleButton(document.getElementById(execute.toggleId), showOsmTrafficLightsEnabled);

        var pending;
        if (execute.mapAction === 'fetchOsmTrafficLights') {
            pending=fetchAndDisplayOsmTrafficLights();
        } else {
            clearOsmTrafficLightMarkers();
        }
        if (execute.saveAllSettings) rt().call.saveAllSettings();
        return pending;
    }

    function toggleShowOsmRailwayCrossings() {
        var collected = OT().buildToggleOsmRailwayCrossingsCollectPlan({
            currentlyEnabled: showOsmRailwayCrossingsEnabled,
        });
        var execute = OT().buildToggleOsmRailwayCrossingsExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        showOsmRailwayCrossingsEnabled = execute.enabled;
        var status=document.getElementById('osmRailwayCrossingDataStatus');if(status&&!execute.enabled)status.textContent='Map level-crossing overlay is off.';
        TU().writeBoolPref(execute.storageKey, showOsmRailwayCrossingsEnabled);
        TU().applyLabeledToggleButton(document.getElementById(execute.toggleId), showOsmRailwayCrossingsEnabled);

        var pending;
        if (execute.mapAction === 'fetchOsmRailwayCrossings') {
            pending=fetchAndDisplayOsmRailwayCrossings();
        } else {
            clearOsmRailwayCrossingMarkers();
        }
        if (execute.saveAllSettings) rt().call.saveAllSettings();
        return pending;
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
        trafficLightAreaGeneration++;
        railwayAreaGeneration++;
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
        setShowOsmTrafficLightsEnabled: function (val) { if(val!==showOsmTrafficLightsEnabled)trafficLightAreaGeneration++; showOsmTrafficLightsEnabled = val; },
        getShowOsmRailwayCrossingsEnabled: function () { return showOsmRailwayCrossingsEnabled; },
        setShowOsmRailwayCrossingsEnabled: function (val) {
            if(val!==showOsmRailwayCrossingsEnabled)railwayAreaGeneration++;
            showOsmRailwayCrossingsEnabled=val;
            if(!val&&runtime){
                clearOsmRailwayCrossingMarkers();
                var status=document.getElementById('osmRailwayCrossingDataStatus');
                if(status)status.textContent='Map level-crossing overlay is off.';
            }
        },
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapOverlayOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

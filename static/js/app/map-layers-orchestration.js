/**
 * @file Map overlay layer toggles orchestration (traffic, weather, 3D buildings, road labels).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var vectorStyleListenerRegistered = false;
    var trafficTileErrorStreak = 0;
    var trafficLayerPausedUntil = 0;

    var MLT_INIT = typeof VoyagrMapLayerToggles !== 'undefined' ? VoyagrMapLayerToggles : null;
    var GPC_INIT = typeof VoyagrGooglePlusCodesPrefs !== 'undefined' ? VoyagrGooglePlusCodesPrefs : null;
    var WL_INIT = typeof VoyagrWeatherLayer !== 'undefined' ? VoyagrWeatherLayer : null;

    var trafficLayer = null;
    var showTrafficEnabled = MLT_INIT
        ? MLT_INIT.resolveShowTrafficEnabledFromStorage(localStorage.getItem('showTrafficEnabled'))
        : localStorage.getItem('showTrafficEnabled') !== 'false';
    var buildings3DEnabled = MLT_INIT
        ? MLT_INIT.resolveBuildings3DEnabledFromStorage(localStorage.getItem('buildings3DEnabled'))
        : localStorage.getItem('buildings3DEnabled') !== 'false';
    var buildings3DHeightMultiplier = MLT_INIT
        ? MLT_INIT.parseBuildings3DHeightMultiplier(localStorage.getItem('buildings3DHeight'))
        : (parseFloat(localStorage.getItem('buildings3DHeight')) || 1.0);
    var buildings3DOpacity = MLT_INIT
        ? MLT_INIT.parseBuildings3DOpacity(localStorage.getItem('buildings3DOpacity'))
        : (parseFloat(localStorage.getItem('buildings3DOpacity')) || 0.6);
    var roadLabelsEnabled = MLT_INIT
        ? MLT_INIT.resolveRoadLabelsEnabledFromStorage(localStorage.getItem('roadLabelsEnabled'))
        : localStorage.getItem('roadLabelsEnabled') !== 'false';
    var googlePlusCodesEnabled = GPC_INIT
        ? GPC_INIT.resolveGooglePlusCodesEnabledFromStorage(localStorage.getItem('googlePlusCodesEnabled'))
        : localStorage.getItem('googlePlusCodesEnabled') === 'true';
    var weatherLayer = null;
    var showWeatherEnabled = WL_INIT
        ? WL_INIT.resolveShowWeatherEnabledFromStorage(localStorage.getItem('showWeatherEnabled'))
        : localStorage.getItem('showWeatherEnabled') === 'true';
    var weatherLayerType = WL_INIT
        ? WL_INIT.resolveWeatherLayerTypeFromStorage(localStorage.getItem('weatherLayerType'))
        : (localStorage.getItem('weatherLayerType') || 'precipitation_new');

    function getBuildings3DEnabled() { return buildings3DEnabled; }
    function setBuildings3DEnabled(val) { buildings3DEnabled = !!val; }
    function getBuildings3DHeightMultiplier() { return buildings3DHeightMultiplier; }
    function setBuildings3DHeightMultiplier(val) { buildings3DHeightMultiplier = val; }
    function getBuildings3DOpacity() { return buildings3DOpacity; }
    function setBuildings3DOpacity(val) { buildings3DOpacity = val; }
    function getRoadLabelsEnabled() { return roadLabelsEnabled; }
    function setRoadLabelsEnabled(val) { roadLabelsEnabled = !!val; }
    function getGooglePlusCodesEnabled() { return googlePlusCodesEnabled; }
    function setGooglePlusCodesEnabled(val) { googlePlusCodesEnabled = !!val; }
    function getShowTrafficEnabled() { return showTrafficEnabled; }
    function setShowTrafficEnabled(val) { showTrafficEnabled = !!val; }
    function getTrafficLayer() { return trafficLayer; }
    function setTrafficLayer(val) { trafficLayer = val; }
    function getShowWeatherEnabled() { return showWeatherEnabled; }
    function setShowWeatherEnabled(val) { showWeatherEnabled = !!val; }
    function getWeatherLayer() { return weatherLayer; }
    function setWeatherLayer(val) { weatherLayer = val; }
    function getWeatherLayerType() { return weatherLayerType; }
    function setWeatherLayerType(val) { weatherLayerType = val; }

    function rt() {
        if (!runtime) {
            throw new Error('[MapLayers] Orchestration runtime not bound');
        }
        return runtime;
    }

    function MLT() { return rt().mapLayerToggles(); }
    function WL() { return rt().weatherLayer(); }
    function TU() { return rt().toggleUI(); }
    function GPC() { return rt().googlePlusCodesPrefs(); }
    function RS() { return rt().routeSelection(); }

    function registerVectorStyleReadyListener() {
        if (vectorStyleListenerRegistered || typeof window === 'undefined') return;
        vectorStyleListenerRegistered = true;
        window.addEventListener('voyagr-vector-style-ready', onVectorStyleReady);
    }

    function onVectorStyleReady() {
        const layerToggles = typeof VoyagrMapLayerToggles !== 'undefined' ? VoyagrMapLayerToggles : null;
        const map = rt().getMap();
        const reconcile = layerToggles
            ? layerToggles.buildVectorStyleReadyReconcilePlan({
                hasMap: !!map,
                hasMapLibreHelpers: !!window.MapLibreHelpers,
                roadLabelsStorageValue: localStorage.getItem('roadLabelsEnabled'),
                showTrafficEnabled: getShowTrafficEnabled(),
                showWeatherEnabled: getShowWeatherEnabled(),
                hasTrafficLayerRef: !!getTrafficLayer(),
                mapHasTrafficLayer: !!(map && map.getLayer && map.getLayer('traffic-layer')),
                hasWeatherLayerRef: !!getWeatherLayer(),
                mapHasWeatherLayer: !!(map && map.getLayer && map.getLayer('weather-layer')),
            })
            : null;

        try {
            if (reconcile && reconcile.shouldRun && reconcile.reapplyRoadLabels) {
                rt().getMapLibreHelpers().toggleRoadLabels(map, reconcile.roadLabelsEnabled);
            }
        } catch (e) {
            /* ignore */
        }
        if (typeof rt().call.scheduleMapRepaintAfterUiChange === 'function') {
            rt().call.scheduleMapRepaintAfterUiChange();
        }
        try {
            if (!map || !reconcile) return;
            if (reconcile.resetTrafficLayerRef) {
                setTrafficLayer(null);
            }
            if (reconcile.resetWeatherLayerRef) {
                setWeatherLayer(null);
            }
            if (reconcile.addTrafficLayer) {
                addTrafficLayer();
            }
            if (reconcile.addWeatherLayer) {
                addWeatherLayer();
            }
        } catch (e) {
            /* ignore */
        }
    }

function toggle3DBuildings() {
    const map = rt().getMap();
    const layerToggles = MLT();
    const toggleUi = TU();
    const collected = layerToggles.buildToggle3DBuildingsCollectPlan({ currentlyEnabled: getBuildings3DEnabled() });
    const execute = layerToggles.buildToggle3DBuildingsExecutePlan({
        enabled: collected.enabled,
        heightMultiplier: getBuildings3DHeightMultiplier(),
        opacity: getBuildings3DOpacity(),
    });
    if (!execute.shouldApply) return;

    setBuildings3DEnabled(execute.enabled);
    localStorage.setItem(execute.storageKey, execute.storageValue);
    toggleUi.applyToggleButton(document.getElementById(execute.toggleId), getBuildings3DEnabled());

    if (map) {
        if (execute.mapAction === 'add3DBuildings') {
            rt().getMapLibreHelpers().add3DBuildings(map, {
                heightMultiplier: execute.heightMultiplier,
                opacity: execute.opacity,
            });
        } else {
            rt().getMapLibreHelpers().remove3DBuildings(map);
        }
    }

    rt().call.showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);

    if (execute.recomputeMapView3D && typeof rt().call.recomputeMapView3DFromGranular === 'function') {
        rt().call.recomputeMapView3DFromGranular();
    }
    if (execute.saveAllSettings) rt().call.saveAllSettings();
}
function toggleRoadLabels() {
    const map = rt().getMap();
    const layerToggles = MLT();
    const toggleUi = TU();
    const collected = layerToggles.buildToggleRoadLabelsCollectPlan({ currentlyEnabled: getRoadLabelsEnabled() });
    const execute = layerToggles.buildToggleRoadLabelsExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    setRoadLabelsEnabled(execute.enabled);
    if (execute.useWriteBoolPref) {
        toggleUi.writeBoolPref(execute.storageKey, getRoadLabelsEnabled());
    } else {
        localStorage.setItem(execute.storageKey, execute.storageValue);
    }
    toggleUi.applyToggleButton(
        document.getElementById(execute.toggleId),
        getRoadLabelsEnabled(),
        execute.toggleInactiveStyles
    );

    if (map) {
        rt().getMapLibreHelpers().toggleRoadLabels(map, roadLabelsEnabled);
        rt().call.showStatus(execute.statusMessage, execute.statusType);
        console.log(execute.logMessage);
    }

    if (execute.saveAllSettings) rt().call.saveAllSettings();
}
function toggleGooglePlusCodes() {
    const prefs = GPC();
    const toggleUi = TU();
    const collected = prefs.buildToggleGooglePlusCodesCollectPlan({ currentlyEnabled: getGooglePlusCodesEnabled() });
    const execute = prefs.buildToggleGooglePlusCodesExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    setGooglePlusCodesEnabled(execute.enabled);
    localStorage.setItem(execute.storageKey, execute.storageValue);
    toggleUi.applyToggleButton(
        document.getElementById(execute.toggleId),
        getGooglePlusCodesEnabled(),
        execute.toggleInactiveStyles
    );
    rt().call.showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);
    if (execute.saveAllSettings) rt().call.saveAllSettings();
}
function set3DBuildingHeight(multiplier) {
    const map = rt().getMap();
    const execute = MLT().buildSet3DBuildingHeightExecutePlan(multiplier);
    if (!execute.shouldApply) return;
    setBuildings3DHeightMultiplier(execute.heightMultiplier);
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (map) rt().getMapLibreHelpers().set3DBuildingHeight(map, execute.heightMultiplier);
    console.log(execute.logMessage);
}

/**
 * Set 3D building opacity/transparency
 * @function set3DBuildingOpacity
 * @param {number} opacity - Opacity value (0.0 = transparent, 1.0 = opaque)
 */
function set3DBuildingOpacity(opacity) {
    const map = rt().getMap();
    const execute = MLT().buildSet3DBuildingOpacityExecutePlan(opacity);
    if (!execute.shouldApply) return;
    setBuildings3DOpacity(execute.opacity);
    localStorage.setItem(execute.storageKey, execute.storageValue);
    if (map) rt().getMapLibreHelpers().set3DBuildingOpacity(map, execute.opacity);
    console.log(execute.logMessage);
}
function toggleTrafficLayer() {
    const layerToggles = MLT();
    const toggleUi = TU();
    const collected = layerToggles.buildToggleTrafficLayerCollectPlan({ currentlyEnabled: getShowTrafficEnabled() });
    const execute = layerToggles.buildToggleTrafficLayerExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    setShowTrafficEnabled(execute.enabled);
    toggleUi.writeBoolPref(execute.storageKey, getShowTrafficEnabled());
    toggleUi.applyToggleButton(document.getElementById(execute.toggleId), getShowTrafficEnabled());

    if (execute.mapAction === 'addTrafficLayer') {
        addTrafficLayer();
    } else {
        removeTrafficLayer();
    }
    rt().call.showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);
    if (execute.saveAllSettings) rt().call.saveAllSettings();
}

/**
 * Add TomTom traffic flow tile layer to map.
 *
 * Notes on race-condition handling:
 *   - The basemap style is fetched asynchronously (see voyagr-core.js: bootstrap
 *     style → setStyle(realStyle)). Until the real style is loaded, calling
 *     `map.addSource()` throws "Style is not done loading."
 *   - We previously handled this with `map.once('style.load')` *plus* a 1 s
 *     `setTimeout` fallback. On slow first paints the setTimeout fired before
 *     the style was ready (the error you're seeing in the console) and on the
 *     style.load path it then fired a second time, which is why the success
 *     line appeared 2-3 times.
 *   - This version uses a module-level reentry guard, polls `isStyleLoaded()`
 *     instead of blindly trying, and re-checks `isStyleLoaded()` inside the
 *     add path so the `style.load` listener cannot fire it in an unsafe state.
 */
function addTrafficLayer() {
    const map = rt().getMap();
    const layerToggles = MLT();
    const orch = layerToggles.buildAddTrafficLayerOrchestrationPlan({
        hasMap: !!map,
        pendingGuardSet: !!window[layerToggles.TRAFFIC_PENDING_GUARD_PROPERTY],
        isStyleLoaded: !!(map && map.isStyleLoaded && map.isStyleLoaded()),
    });
    if (!orch.shouldProceed) {
        if (orch.mapNotReadyLog) console.log(orch.mapNotReadyLog);
        return;
    }

    try {
        const stale = layerToggles.buildTrafficLayerStaleRefResetPlan({
            hasTrafficLayerRef: !!getTrafficLayer(),
            hasMap: !!map,
            mapHasTrafficLayer: !!(map && map.getLayer && map.getLayer(layerToggles.TRAFFIC_LAYER_ID)),
        });
        if (stale.shouldReset) setTrafficLayer(null);
    } catch (e) {
        /* ignore */
    }

    removeTrafficLayer();

    const useProxy = window.VOYAGR_TOMTOM_TRAFFIC_PROXY === true;
    const tomtomApiKey = window.TOMTOM_API_KEY || '';

    console.log('[Traffic] API key / proxy check:', {
        useServerProxy: useProxy,
        windowKey: typeof window.TOMTOM_API_KEY,
        keyLength: tomtomApiKey ? tomtomApiKey.length : 0,
        hasKey: !!tomtomApiKey,
    });

    const credFetch = layerToggles.buildTrafficLayerCredentialsFetchPlan({
        useProxy,
        hasApiKey: !!tomtomApiKey,
    });
    if (credFetch.shouldFetch) {
        console.log(credFetch.fetchLogMessage);
        fetch(credFetch.url)
            .then((r) => r.json())
            .then((data) => {
                rt().call.applySupportLinksFromConfig(data);
                const dispatch = layerToggles.buildTrafficCredentialsResponseDispatchPlan(data);
                if (dispatch.action === 'retryWithProxy') {
                    window.VOYAGR_TOMTOM_TRAFFIC_PROXY = true;
                    console.log('[Traffic] Server tile proxy enabled — key stays off the client');
                    addTrafficLayer();
                    return;
                }
                if (dispatch.action === 'retryWithKey') {
                    window.TOMTOM_API_KEY = dispatch.apiKey;
                    console.log('[Traffic] API key loaded from server, reinitializing...');
                    addTrafficLayer();
                    return;
                }
                console.log(credFetch.noKeyLogMessage);
            })
            .catch((err) => console.log(credFetch.errorLogPrefix, err));
        return;
    }

    let scheduled = false;
    const scheduleOnce = (fn) => {
        if (scheduled) return;
        scheduled = true;
        fn();
    };

    const addTrafficLayerNow = () => {
        const isStyleLoaded = !!(map && map.isStyleLoaded && map.isStyleLoaded());
        const tilePlan = layerToggles.buildTrafficTileUrlsPlan({
            useProxy: window.VOYAGR_TOMTOM_TRAFFIC_PROXY === true,
            origin: window.location.origin,
            apiKey: window.TOMTOM_API_KEY || '',
        });
        let hasSource = false;
        let hasLayer = false;
        try {
            hasSource = !!(map && map.getSource && map.getSource(layerToggles.TRAFFIC_SOURCE_ID));
            hasLayer = !!(map && map.getLayer && map.getLayer(layerToggles.TRAFFIC_LAYER_ID));
        } catch (e) {
            /* ignore */
        }

        const execute = layerToggles.buildAddTrafficLayerNowExecutePlan({
            isStyleLoaded,
            hasTiles: tilePlan.hasTiles,
            hasSource,
            hasLayer,
            tiles: tilePlan.tiles,
            beforeLayerId: isStyleLoaded
                ? RS().findFirstTextSymbolLayerId(map.getStyle() && map.getStyle().layers)
                : null,
        });
        if (!execute.shouldAdd) {
            if (execute.logMessage) console.log(execute.logMessage);
            return !execute.retryLater;
        }

        try {
            if (execute.beforeLayerIdLogPrefix && execute.layerSpec.beforeLayerId) {
                console.log(execute.beforeLayerIdLogPrefix + execute.layerSpec.beforeLayerId);
            }
            if (execute.addSource) {
                map.addSource(execute.sourceId, execute.sourceSpec);
            }
            if (execute.addLayer) {
                map.addLayer({
                    id: execute.layerSpec.id,
                    type: execute.layerSpec.type,
                    source: execute.layerSpec.source,
                    minzoom: execute.layerSpec.minzoom,
                    maxzoom: execute.layerSpec.maxzoom,
                    paint: execute.layerSpec.paint,
                }, execute.layerSpec.beforeLayerId);
            }

            if (execute.setTrafficLayerRef) {
                setTrafficLayer({ id: execute.trafficLayerRefId });
            }
            console.log(execute.successLog);
            if (execute.bringRoutesToTop) rt().call.bringRoutesToTop();
            return true;
        } catch (e) {
            console.error('[Traffic] Error adding traffic layer:', e);
            return true;
        }
    };

    const runOnce = () => scheduleOnce(() => {
        try { addTrafficLayerNow(); } finally { window[orch.pendingGuardProperty] = false; }
    });

    window[orch.pendingGuardProperty] = true;

    const styleInit = layerToggles.buildTrafficStyleReadyInitPlan({ isStyleLoaded: orch.isStyleLoaded });
    if (styleInit.strategy === 'immediate') {
        runOnce();
        return;
    }

    console.log(styleInit.waitForStyleLog);
    map.once(styleInit.bindStyleLoadEvent, runOnce);
    let attempts = 0;
    const poll = () => {
        const tick = layerToggles.buildTrafficStylePollTickPlan({
            scheduled,
            hasMap: !!map,
            isStyleLoaded: !!(map && map.isStyleLoaded && map.isStyleLoaded()),
            attempts,
            maxAttempts: orch.stylePollMaxAttempts,
            intervalMs: orch.stylePollIntervalMs,
        });
        if (tick.action === 'stop') return;
        if (tick.action === 'clearGuard') {
            window[orch.pendingGuardProperty] = false;
            return;
        }
        if (tick.action === 'runOnce') {
            runOnce();
            return;
        }
        if (tick.action === 'giveUp') {
            console.warn(tick.logMessage);
            window[orch.pendingGuardProperty] = false;
            return;
        }
        attempts = tick.nextAttempts;
        setTimeout(poll, tick.intervalMs);
    };
    setTimeout(poll, orch.stylePollIntervalMs);
}

/**
 * Remove traffic layer from map
 */
function removeTrafficLayer() {
    const map = rt().getMap();
    const layerToggles = MLT();
    const execute = layerToggles.buildRemoveTrafficLayerExecutePlan({
        hasTrafficLayerRef: !!getTrafficLayer(),
        hasMap: !!map,
    });
    if (!execute.shouldRemove) return;

    if (map.getLayer(execute.layerId)) {
        map.removeLayer(execute.layerId);
    }
    if (map.getSource(execute.sourceId)) {
        map.removeSource(execute.sourceId);
    }
    if (execute.clearTrafficLayerRef) setTrafficLayer(null);
    console.log(execute.logMessage);
}


/**
 * Back off TomTom raster traffic when the tile proxy errors (rate limit / upstream).
 * Called from voyagr-core map error handler.
 * @param {number} statusCode
 */
function voyagrOnTrafficTileLoadError(statusCode) {
    const backoff = MLT().buildTrafficTileErrorBackoffPlan({
        statusCode,
        errorStreak: trafficTileErrorStreak,
        pausedUntil: trafficLayerPausedUntil,
    });
    if (backoff.incrementStreak) {
        trafficTileErrorStreak = backoff.nextStreak;
        return;
    }
    if (!backoff.shouldBackoff) return;

    trafficLayerPausedUntil = backoff.pauseUntil;
    if (backoff.resetStreak) trafficTileErrorStreak = 0;
    if (backoff.removeTrafficLayer) removeTrafficLayer();
    console.warn(backoff.logMessage);
}


/**
 * Initialize traffic layer based on saved preference
 */
function initTrafficLayer() {
    const map = rt().getMap();
    const execute = MLT().buildInitTrafficLayerExecutePlan({ enabled: getShowTrafficEnabled() });
    if (!execute.shouldApply) return;

    TU().applyToggleButton(document.getElementById(execute.toggleId), execute.enabled);

    if (!execute.addTrafficLayer || !map) return;
    try {
        const st = map.getStyle && map.getStyle();
        if (execute.deferOnBootstrapStyle && st && st.name === execute.bootstrapStyleName) {
            console.log(execute.deferLogMessage);
            return;
        }
    } catch (e) {
        /* ignore */
    }
    addTrafficLayer();
}
function toggleWeatherLayer() {
    const weatherMod = WL();
    const toggleUi = TU();
    const collected = weatherMod.buildToggleWeatherLayerCollectPlan({ currentlyEnabled: getShowWeatherEnabled() });
    const execute = weatherMod.buildToggleWeatherLayerExecutePlan({ enabled: collected.enabled });
    if (!execute.shouldApply) return;

    setShowWeatherEnabled(execute.enabled);
    toggleUi.writeBoolPref(execute.storageKey, getShowWeatherEnabled());
    toggleUi.applyToggleButton(document.getElementById(execute.toggleId), getShowWeatherEnabled());

    if (execute.mapAction === 'addWeatherLayer') {
        addWeatherLayer();
    } else {
        removeWeatherLayer();
    }
    rt().call.showStatus(execute.statusMessage, execute.statusType);
    console.log(execute.logMessage);
    if (execute.saveAllSettings) rt().call.saveAllSettings();
}

/**
 * Set weather layer type (precipitation, clouds, temperature)
 * @param {string} type - Layer type: 'precipitation_new', 'clouds_new', 'temp_new', 'wind_new'
 */
function setWeatherLayerType(type) {
    const map = rt().getMap();
    const execute = WL().buildSetWeatherLayerTypeExecutePlan(type);
    if (!execute.shouldApply) return;

    setWeatherLayerType(execute.layerType);
    localStorage.setItem(execute.storageKey, execute.storageValue);

    if (execute.refreshLayerWhenEnabled && getShowWeatherEnabled() && map) {
        removeWeatherLayer();
        addWeatherLayer();
    }

    rt().call.showStatus(execute.statusMessage, execute.statusType);
}

/**
 * Add OpenWeatherMap weather tile layer to map
 * Uses OpenWeatherMap's free weather tile API
 */
function addWeatherLayer() {
    const map = rt().getMap();
    const weatherMod = WL();
    const orch = weatherMod.buildAddWeatherLayerOrchestrationPlan({
        hasMap: !!map,
        isStyleLoaded: !!(map && map.isStyleLoaded && map.isStyleLoaded()),
    });
    if (!orch.shouldProceed) {
        if (orch.mapNotReadyLog) console.log(orch.mapNotReadyLog);
        return;
    }

    try {
        if (getWeatherLayer() && map && !map.getLayer(weatherMod.WEATHER_LAYER_ID)) {
            setWeatherLayer(null);
        }
    } catch (e) {
        /* ignore */
    }

    removeWeatherLayer();

    let owmApiKey = window.OPENWEATHERMAP_API_KEY || '';
    const credFetch = weatherMod.buildWeatherCredentialsFetchPlan({ hasApiKey: !!owmApiKey });
    if (credFetch.shouldFetch) {
        console.log(credFetch.fetchLogMessage);
        fetch(credFetch.url)
            .then((r) => r.json())
            .then((data) => {
                rt().call.applySupportLinksFromConfig(data);
                if (data.success && data[credFetch.apiKeyField]) {
                    window.OPENWEATHERMAP_API_KEY = data[credFetch.apiKeyField];
                    console.log(credFetch.retryLogMessage);
                    addWeatherLayer();
                } else {
                    console.log(credFetch.noKeyLogMessage);
                    rt().call.showStatus(credFetch.noKeyStatusMessage, credFetch.noKeyStatusType);
                }
            })
            .catch((err) => console.log(credFetch.errorLogPrefix, err));
        return;
    }

    const addWeatherLayerNow = () => {
        try {
            const tileUrl = weatherMod.buildWeatherTileUrl(getWeatherLayerType(), owmApiKey);

            if (!map.getSource(orch.sourceId)) {
                map.addSource(orch.sourceId, weatherMod.buildWeatherSourceSpec(tileUrl));
            }

            if (!map.getLayer(orch.layerId)) {
                map.addLayer(weatherMod.buildWeatherLayerSpec());
            }

            setWeatherLayer({ id: orch.layerId });
            console.log(orch.successLogMessage);

            if (orch.bringRoutesToTop) rt().call.bringRoutesToTop();
        } catch (e) {
            console.error('[Weather] Error adding weather layer:', e);
        }
    };

    if (orch.isStyleLoaded) {
        addWeatherLayerNow();
    } else {
        console.log(orch.waitForStyleLog);
        map.once('style.load', addWeatherLayerNow);
        setTimeout(addWeatherLayerNow, orch.styleFallbackMs);
    }
}

/**
 * Remove weather layer from map
 */
function removeWeatherLayer() {
    const map = rt().getMap();
    const execute = WL().buildRemoveWeatherLayerExecutePlan({
        hasWeatherLayerRef: !!getWeatherLayer(),
        hasMap: !!map,
    });
    if (!execute.shouldRemove) return;

    if (map.getLayer(execute.layerId)) {
        map.removeLayer(execute.layerId);
    }
    if (map.getSource(execute.sourceId)) {
        map.removeSource(execute.sourceId);
    }
    if (execute.clearWeatherLayerRef) setWeatherLayer(null);
    console.log(execute.logMessage);
}

/**
 * Initialize weather layer based on saved preference
 */
function initWeatherLayer() {
    const map = rt().getMap();
    const execute = WL().buildInitWeatherLayerExecutePlan({ enabled: getShowWeatherEnabled() });
    if (!execute.shouldApply) return;

    TU().applyToggleButton(document.getElementById(execute.toggleId), execute.enabled);

    if (!execute.addWeatherLayer || !map) return;
    try {
        const st = map.getStyle && map.getStyle();
        if (execute.deferOnBootstrapStyle && st && st.name === execute.bootstrapStyleName) {
            console.log(execute.deferLogMessage);
            return;
        }
    } catch (e) {
        /* ignore */
    }
    addWeatherLayer();
}

    function bind(nextRuntime) {
        runtime = nextRuntime;
        registerVectorStyleReadyListener();
        if (typeof window !== 'undefined') {
            window.voyagrOnTrafficTileLoadError = voyagrOnTrafficTileLoadError;
        }
    }

    var api = {
        bind: bind,
        addTrafficLayer: addTrafficLayer,
        addWeatherLayer: addWeatherLayer,
        initTrafficLayer: initTrafficLayer,
        initWeatherLayer: initWeatherLayer,
        removeTrafficLayer: removeTrafficLayer,
        removeWeatherLayer: removeWeatherLayer,
        set3DBuildingHeight: set3DBuildingHeight,
        set3DBuildingOpacity: set3DBuildingOpacity,
        setWeatherLayerType: setWeatherLayerType,
        toggle3DBuildings: toggle3DBuildings,
        toggleGooglePlusCodes: toggleGooglePlusCodes,
        toggleRoadLabels: toggleRoadLabels,
        toggleTrafficLayer: toggleTrafficLayer,
        toggleWeatherLayer: toggleWeatherLayer,
        voyagrOnTrafficTileLoadError: voyagrOnTrafficTileLoadError,
        getBuildings3DEnabled: getBuildings3DEnabled,
        setBuildings3DEnabled: setBuildings3DEnabled,
        getBuildings3DHeightMultiplier: getBuildings3DHeightMultiplier,
        setBuildings3DHeightMultiplier: setBuildings3DHeightMultiplier,
        getBuildings3DOpacity: getBuildings3DOpacity,
        setBuildings3DOpacity: setBuildings3DOpacity,
        getRoadLabelsEnabled: getRoadLabelsEnabled,
        setRoadLabelsEnabled: setRoadLabelsEnabled,
        getGooglePlusCodesEnabled: getGooglePlusCodesEnabled,
        setGooglePlusCodesEnabled: setGooglePlusCodesEnabled,
        getShowTrafficEnabled: getShowTrafficEnabled,
        setShowTrafficEnabled: setShowTrafficEnabled,
        getTrafficLayer: getTrafficLayer,
        setTrafficLayer: setTrafficLayer,
        getShowWeatherEnabled: getShowWeatherEnabled,
        setShowWeatherEnabled: setShowWeatherEnabled,
        getWeatherLayer: getWeatherLayer,
        setWeatherLayer: setWeatherLayer,
        getWeatherLayerType: getWeatherLayerType,
        setWeatherLayerType: setWeatherLayerType,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapLayersOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

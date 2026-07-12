/**
 * Voyagr Navigation App - Core Module
 * Handles map initialization, core variables, and utility functions
 * @module voyagr-core
 */

// ===== CORE VARIABLES =====
let map = null;
/** @type {ReturnType<typeof setInterval> | null} */
let _mapRenderHeartbeatId = null;
let routeLayer = null;
let startMarker = null;
let endMarker = null;
// mapPickerMode lives in static/js/app/geocoding-orchestration.js (bound at file end).

// ===== ZOOM AND FOLLOW VARIABLES =====
// zoomAndFollowEnabled and mapFollowingActive live in
// static/js/app/map-recenter-orchestration.js (bound at file end).

// ===== UNIT CONVERSION VARIABLES =====
// distanceUnit, currencyUnit, speedUnit, temperatureUnit live in
// static/js/app/units-preferences-orchestration.js (bound at file end).

/**
 * Initialize the map with Leaflet
 * @function initializeMap
 * @returns {void}
 */
function initializeMap() {
    // Check if map is already initialized
    if (map !== null) {
        console.log('[Init] Map already initialized, skipping');
        return;
    }

    // Suppress ethereum property redefinition warning from browser extensions
    if (typeof window !== 'undefined' && window.ethereum) {
        try {
            Object.defineProperty(window, 'ethereum', {
                value: window.ethereum,
                writable: false,
                configurable: false
            });
        } catch (e) {
            console.log('[Init] Ethereum property already defined by extension');
        }
    }

    // Initialize map with MapLibre GL JS - using self-hosted OpenMapTiles-compatible styles
    //
    // *** PWA / Web Worker fix ***
    // MapLibre runs tile fetching in a Web Worker. In PWAs the worker is often loaded from a
    // `blob:` URL, which means root-relative paths like "/map/data/gb/12/2032/1324.pbf" cannot
    // be resolved (the worker has no origin). This causes:
    //   "Failed to construct 'Request': Failed to parse URL from /map/data/..."
    // and all vector tiles, glyphs and sprites silently fail → blank map with no labels.
    //
    // Fix: we fetch the style JSON ourselves, rewrite EVERY relative URL inside it (sources,
    // glyphs, sprites) to fully-qualified absolute URLs, then pass the resolved *object* to
    // MapLibre. Combined with `transformRequest` as a safety net this guarantees the worker
    // never receives a relative URL.

    /** Convert any relative/root-relative URL to an absolute origin URL.
     *  Preserves MapLibre template placeholders like {z}, {x}, {y}
     *  which new URL() would percent-encode to %7Bz%7D etc. */
    const toAbsoluteOriginUrl = (url) => {
        try {
            if (!url || typeof url !== 'string') return url;
            if (/^(data|blob|chrome-extension|moz-extension):/.test(url)) return url;
            if (url.startsWith('http://') || url.startsWith('https://')) return url;
            const resolved = new URL(url, window.location.origin).toString();
            // Restore curly-brace template tokens that URL() percent-encodes.
            return resolved.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
        } catch (e) {
            return url;
        }
    };

    /**
     * Resolve all relative URLs inside a MapLibre style object so the worker
     * never has to deal with root-relative paths.
     */
    function resolveStyleUrls(style) {
        if (!style || typeof style !== 'object') return style;

        // Glyphs (font PBFs)
        if (style.glyphs) {
            style.glyphs = toAbsoluteOriginUrl(style.glyphs);
        }
        // Sprite (image + JSON atlas)
        if (style.sprite) {
            if (typeof style.sprite === 'string') {
                style.sprite = toAbsoluteOriginUrl(style.sprite);
            } else if (Array.isArray(style.sprite)) {
                style.sprite = style.sprite.map(s => {
                    if (typeof s === 'string') return toAbsoluteOriginUrl(s);
                    if (s && typeof s === 'object' && s.url) {
                        s.url = toAbsoluteOriginUrl(s.url);
                    }
                    return s;
                });
            }
        }
        // Sources (tile endpoints, TileJSON URLs)
        if (style.sources) {
            for (const key of Object.keys(style.sources)) {
                const src = style.sources[key];
                if (!src) continue;
                if (src.url) {
                    src.url = toAbsoluteOriginUrl(src.url);
                }
                if (Array.isArray(src.tiles)) {
                    src.tiles = src.tiles.map(t => toAbsoluteOriginUrl(t));
                }
            }
        }
        return style;
    }

    // Expose helper globally so voyagr-app.js (theme switcher) can reuse it.
    window.__voyagrResolveStyleUrls = resolveStyleUrls;
    window.__voyagrToAbsoluteOriginUrl = toAbsoluteOriginUrl;

    function showMapLoadingOverlay() {
        try {
            let el = document.getElementById('mapLoadingOverlay');
            if (!el) {
                el = document.createElement('div');
                el.id = 'mapLoadingOverlay';
                el.setAttribute('aria-live', 'polite');
                el.setAttribute('aria-busy', 'true');
                el.style.cssText = [
                    'position:absolute',
                    'top:0',
                    'left:0',
                    'right:0',
                    'bottom:0',
                    'z-index:5',
                    'display:flex',
                    'align-items:center',
                    'justify-content:center',
                    'flex-direction:column',
                    'gap:10px',
                    'background:#d4dbe8',
                    'color:#334',
                    'font:600 14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif',
                    'pointer-events:none'
                ].join(';');
                el.innerHTML = '<div style="font-size:28px;line-height:1">🗺️</div><div>Loading map…</div>';
                const host = document.querySelector('.app-container') || document.getElementById('map')?.parentElement;
                if (host) host.appendChild(el);
            }
            el.style.display = 'flex';
        } catch (e) {
            /* non-fatal */
        }
    }

    function hideMapLoadingOverlay() {
        try {
            const el = document.getElementById('mapLoadingOverlay');
            if (el) {
                el.style.display = 'none';
                el.setAttribute('aria-busy', 'false');
            }
        } catch (e) {
            /* non-fatal */
        }
    }
    window.__voyagrShowMapLoadingOverlay = showMapLoadingOverlay;
    window.__voyagrHideMapLoadingOverlay = hideMapLoadingOverlay;

    /** Set once the real vector/raster style (not bootstrap shell) has loaded. */
    window.__voyagrMainStyleReady = false;
    window.__voyagrMapInitAt = Date.now();

    const MAP_INIT_GRACE_MS = 22000;

    function voyagrMapIsBootstrapStyle() {
        try {
            const st = map && map.getStyle && map.getStyle();
            return !st || st.name === 'voyagr-bootstrap';
        } catch (_) {
            return true;
        }
    }

    function voyagrMapStillInInitGracePeriod() {
        return Date.now() - (window.__voyagrMapInitAt || 0) < MAP_INIT_GRACE_MS;
    }

    /** During first load the bootstrap shell is grey — skip soft reload / escalate. */
    function voyagrMapShouldSkipAggressiveRecovery() {
        if (window.__voyagrMainStyleReady) return false;
        return voyagrMapStillInInitGracePeriod() || voyagrMapIsBootstrapStyle();
    }

    function voyagrMapCancelRecoverTimers() {
        if (window.__voyagrMapRecoverVerifyTimer) {
            clearTimeout(window.__voyagrMapRecoverVerifyTimer);
            window.__voyagrMapRecoverVerifyTimer = null;
        }
        if (window.__voyagrMapRecoverEscalateTimer) {
            clearTimeout(window.__voyagrMapRecoverEscalateTimer);
            window.__voyagrMapRecoverEscalateTimer = null;
        }
    }
    window.__voyagrMapCancelRecoverTimers = voyagrMapCancelRecoverTimers;

    function voyagrMapFlyToUserWhenReady(lat, lon) {
        const doFly = () => {
            try {
                if (!map || typeof map.flyTo !== 'function') return;
                console.log(`[Init] Centering on user: [${lat}, ${lon}]`);
                map.flyTo({
                    center: [lon, lat],
                    zoom: 15,
                    duration: 2000
                });
            } catch (_) {
                /* ignore */
            }
        };
        // Let London (default center) paint briefly once the real style is ready.
        const scheduleFly = () => setTimeout(doFly, 900);
        if (window.__voyagrMainStyleReady) {
            scheduleFly();
            return;
        }
        const onReady = () => scheduleFly();
        window.addEventListener('voyagr-vector-style-ready', onReady, { once: true });
        setTimeout(() => {
            window.removeEventListener('voyagr-vector-style-ready', onReady);
            if (!window.__voyagrMainStyleReady) scheduleFly();
        }, 15000);
    }

    // Minimal style so `new Map` returns immediately (map non-null after initializeMap).
    // Real vector/raster style is fetched asynchronously and applied via setStyle — avoids
    // blocking the main thread on a synchronous XHR.
    const VOYAGR_BOOTSTRAP_STYLE = {
        version: 8,
        name: 'voyagr-bootstrap',
        sources: {},
        layers: [
            {
                id: 'voyagr-bootstrap-bg',
                type: 'background',
                paint: { 'background-color': '#d4dbe8' }
            }
        ]
    };

    const mapTheme =
        typeof localStorage !== 'undefined'
            ? localStorage.getItem('mapTheme') || 'standard'
            : 'standard';
    let VECTOR_STYLE_PATH;
    if (mapTheme === 'satellite') {
        VECTOR_STYLE_PATH = '/static/map/styles/satellite/style.json';
    } else if (mapTheme === 'dark') {
        VECTOR_STYLE_PATH = '/map/styles/positron/style.json';
    } else {
        VECTOR_STYLE_PATH = '/map/styles/liberty/style.json';
    }
    const vectorStyleUrlAbs = toAbsoluteOriginUrl(VECTOR_STYLE_PATH);

    map = new maplibregl.Map({
        container: 'map',
        style: VOYAGR_BOOTSTRAP_STYLE,
        // Belt-and-suspenders: also rewrite any URL MapLibre constructs at runtime.
        transformRequest: (url /*, resourceType */) => {
            return { url: toAbsoluteOriginUrl(url) };
        },
        center: [-0.1278, 51.5074], // Default: London [lon, lat]
        zoom: 13,
        pitch: 0, // Start flat, will tilt for driving mode
        bearing: 0,
        maxPitch: 85, // Allow steep pitch for driving perspective
        pitchWithRotate: true // Enable pitch control with mouse/touch
    });
    showMapLoadingOverlay();

    // Log MapLibre errors with useful context. Some style/tile combinations can produce
    // expression evaluation errors like "Expected value to be of type number, but found null instead."
    // When this happens, it is typically triggered by optional layers like 3D buildings.
    function maybeFallbackToRasterStyle(reason) {
        try {
            // Only do this once per session.
            if (window.__voyagrRasterStyleFallbackApplied) return;
            window.__voyagrRasterStyleFallbackApplied = true;

            const msg = `[MapLibre] Falling back to raster map (labels built-in): ${reason}`;
            console.warn(msg);

            // Surface to UI if available (defined in voyagr-app.js)
            if (typeof showStatus === 'function') {
                showStatus('🗺️ Map labels unavailable (fonts/glyphs). Switching to raster map with labels.', 'info');
            }

            // Persist for the session; allow theme changes to respect this.
            // Use absolute URL so the worker can resolve it in PWA (blob: origin).
            window.__voyagrPreferredFallbackStyleUrl = toAbsoluteOriginUrl('/static/map/styles/osm-raster/style.json');

            if (map && typeof map.setStyle === 'function') {
                map.setStyle(window.__voyagrPreferredFallbackStyleUrl);
            }
        } catch (e) {
            // never crash
        }
    }

    function validateStyleHasLabels() {
        try {
            if (!map || !map.getStyle) return;
            const style = map.getStyle();
            if (!style) return;
            if (style.name === 'voyagr-bootstrap') return;
            const sources = style?.sources || {};
            const sourceVals = Object.values(sources);
            if (
                sourceVals.length > 0 &&
                sourceVals.every((s) => s && s.type === 'raster')
            ) {
                return;
            }
            const layers = style?.layers || [];
            const textLayers = layers.filter(l =>
                l &&
                l.type === 'symbol' &&
                l.layout &&
                l.layout['text-field']
            );
            const hasTextLayers = textLayers.length > 0;
            const hasGlyphs = !!style?.glyphs;

            // If a style has no glyph endpoint, MapLibre cannot render any text labels.
            if (!hasGlyphs) {
                maybeFallbackToRasterStyle('style has no "glyphs" endpoint');
                return;
            }
            // Some styles may omit all text layers (no labels at all).
            if (!hasTextLayers) {
                maybeFallbackToRasterStyle('style has no symbol text layers');
                return;
            }
        } catch (e) {
            // ignore
        }
    }

    function getMapWebGLContext() {
        try {
            const c = map.getCanvas && map.getCanvas();
            if (!c) return null;
            return c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
        } catch (e) {
            return null;
        }
    }

    function getMapRenderDiagnostics() {
        const c = map.getCanvas && map.getCanvas();
        const cont = map.getContainer && map.getContainer();
        const gl = getMapWebGLContext();
        let isStyleLoaded = null;
        let mapLoaded = null;
        try {
            isStyleLoaded = typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : null;
        } catch (e) {
            isStyleLoaded = null;
        }
        try {
            mapLoaded = typeof map.loaded === 'function' ? map.loaded() : null;
        } catch (e) {
            mapLoaded = null;
        }
        return {
            isStyleLoaded,
            mapLoaded,
            contextLost: gl ? gl.isContextLost() : null,
            canvas: c
                ? { width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight }
                : null,
            container: cont ? { w: cont.offsetWidth, h: cont.offsetHeight } : null
        };
    }
    window.__voyagrMapGetDiagnostics = getMapRenderDiagnostics;

    // Track how many errors we've seen so we can throttle logging.
    let _mapErrorCount = 0;
    const _MAX_LOGGED_ERRORS = 5; // Only log the first few, then go silent.

    map.on('error', (evt) => {
        try {
            const msg = evt?.error?.message || evt?.message || '';
            if (!msg) return;

            _mapErrorCount++;

            // Only log the first few errors to avoid flooding the console with
            // routine tile 404s (e.g. tiles outside server coverage).
            if (_mapErrorCount <= _MAX_LOGGED_ERRORS) {
                console.warn(
                    '[MapLibre][Error]',
                    msg,
                    Object.assign(
                        { sourceId: evt?.sourceId, type: evt?.type },
                        getMapRenderDiagnostics()
                    )
                );
            } else if (_mapErrorCount === _MAX_LOGGED_ERRORS + 1) {
                console.warn(`[MapLibre] Suppressing further error logs (${_mapErrorCount}+ errors). Map may have tile coverage gaps.`);
            } else if (_mapErrorCount > _MAX_LOGGED_ERRORS && _mapErrorCount % 25 === 0) {
                console.warn(`[MapLibre][Error] periodic #${_mapErrorCount}`, getMapRenderDiagnostics());
            }

            // TomTom traffic tile proxy errors — back off instead of hammering the server.
            if (evt?.sourceId === 'traffic-source') {
                const m = String(msg || '');
                const codeMatch = m.match(/\((\d{3})\)/);
                const code = codeMatch ? parseInt(codeMatch[1], 10) : 0;
                if (code >= 429 && typeof window.voyagrOnTrafficTileLoadError === 'function') {
                    window.voyagrOnTrafficTileLoadError(code);
                }
            }

            // PWA worker URL resolution failure — switch to raster fallback.
            if (
                msg.includes('Failed to parse URL') ||
                msg.includes("Failed to construct 'Request'") ||
                msg.includes('Failed to construct "Request"')
            ) {
                maybeFallbackToRasterStyle(msg);
            }

            // Glyph/font loading failure — labels won't render.
            if (
                msg.includes('Failed to load glyph') ||
                (msg.includes('Failed to load') && (msg.includes('.pbf') || msg.includes('glyphs')))
            ) {
                maybeFallbackToRasterStyle(msg);
            }

            // Numeric expression error from 3D building layer — disable it.
            if (
                msg.includes('Expected value to be of type number') ||
                msg.includes('number expected')
            ) {
                if (map && map.getLayer && map.getLayer('3d-buildings')) {
                    console.warn('[MapLibre][3D Buildings] Disabling due to tile expression error');
                    try {
                        localStorage.setItem('buildings3DEnabled', 'false');
                    } catch (_) { /* ignore */ }
                    if (window.MapLibreHelpers && typeof window.MapLibreHelpers.remove3DBuildings === 'function') {
                        window.MapLibreHelpers.remove3DBuildings(map);
                    } else {
                        try { map.removeLayer('3d-buildings'); } catch (_) { /* ignore */ }
                    }
                }
            }
        } catch (e) {
            // Never let error handling crash init
        }
    });

    function onVoyagrStyleLoaded() {
        try {
            const st = map.getStyle && map.getStyle();
            if (!st || st.name === 'voyagr-bootstrap') return;

            window.__voyagrMainStyleReady = true;
            voyagrMapCancelRecoverTimers();

            hideMapLoadingOverlay();
            if (typeof voyagrMapResizeAndRepaint === 'function') {
                voyagrMapResizeAndRepaint();
                requestAnimationFrame(voyagrMapResizeAndRepaint);
                setTimeout(voyagrMapResizeAndRepaint, 300);
            }

            validateStyleHasLabels();

            try {
                if (window.MapLibreHelpers && typeof window.MapLibreHelpers.applyTransportationRoadLineWidthScale === 'function') {
                    window.MapLibreHelpers.applyTransportationRoadLineWidthScale(map);
                }
            } catch (e) {
                /* non-fatal */
            }

            const buildings3DEnabled = localStorage.getItem('buildings3DEnabled') !== 'false';
            if (buildings3DEnabled && window.MapLibreHelpers) {
                const heightMultiplier = parseFloat(localStorage.getItem('buildings3DHeight')) || 1.0;
                const opacity = parseFloat(localStorage.getItem('buildings3DOpacity')) || 0.6;
                MapLibreHelpers.add3DBuildings(map, { heightMultiplier, opacity });
            }

            // Reflect saved 2D/3D scene preference on the Settings toggle.
            if (typeof syncMapView3DToggleUI === 'function') {
                try { syncMapView3DToggleUI(); } catch (_) { /* ignore */ }
            }

            if (window.MapLibreHelpers) {
                MapLibreHelpers.configureRoadLabels(map, {
                    enabled: true,
                    minZoom: 10,
                    maxZoom: 22,
                    textColor: '#000000',
                    textHaloColor: '#ffffff',
                    textHaloWidth: 1.5,
                    textSize: 12
                });
                MapLibreHelpers.setRoadLabelZoomFilters(map, {
                    motorwayMinZoom: 4,
                    mainRoadMinZoom: 8,
                    streetMinZoom: 10
                });
            }

            try {
                window.dispatchEvent(new Event('voyagr-vector-style-ready'));
            } catch (_) {
                /* ignore */
            }

            // Nav route line + vehicle marker are custom layers — restore after setStyle / WebGL recovery.
            try {
                if (typeof window.__voyagrRedrawNavigationOverlays === 'function') {
                    window.__voyagrRedrawNavigationOverlays('style.load');
                }
            } catch (_) {
                /* ignore */
            }
        } catch (e) {
            console.warn('[Init] Post vector style setup failed:', e);
        }
    }

    map.on('style.load', onVoyagrStyleLoaded);

    // Handle missing images (POI icons) by providing a transparent placeholder
    // This suppresses "Image 'x' could not be loaded" errors in the console
    map.on('styleimagemissing', (e) => {
        const id = e.id;
        if (!map.hasImage(id)) {
            // Create a 1x1 transparent image
            const width = 1;
            const height = 1;
            const bytes = new Uint8Array(width * height * 4); // RGBA
            map.addImage(id, { width, height, data: bytes });
        }
    });

    // PWA / mobile: WebGL can be lost under memory or GPU pressure. The canvas
    // can also have stale dimensions when the mobile browser chrome shows or hides
    // (100dvh / innerHeight change without a full reload). Both cases produce a
    // blank basemap, no road labels, and vehicle markers that look "gone" (wrong transform).
    function voyagrMapResizeAndRepaint() {
        if (!map || typeof map.resize !== 'function') return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    map.resize();
                    if (typeof map.triggerRepaint === 'function') {
                        map.triggerRepaint();
                    }
                } catch (e) {
                    /* ignore */
                }
            });
        });
    }
    window.__voyagrMapResizeAndRepaint = voyagrMapResizeAndRepaint;

    /**
     * Force every map source to re-issue its tile (or TileJSON) requests.
     *
     * Why this exists: when a phone switches radio (e.g. 4G→5G, WiFi↔cellular)
     * the OS tears down active TCP connections. Any in-flight MapLibre tile
     * fetches abort silently, MapLibre marks those tiles as errored, and the
     * basemap goes blank — but `isStyleLoaded()` still returns true, so the
     * existing heartbeat-based recovery never fires. Resize/repaint alone do
     * not re-request those tiles; we have to nudge the sources themselves.
     *
     * Uses MapLibre's stable public API:
     *   - `source.setTiles(tiles)` for inline-tile vector/raster sources
     *   - `source.setUrl(url)`     for TileJSON-backed sources
     * Both reset the source's internal tile cache and re-fetch.
     *
     * Has its own 1.5s debounce so multiple recovery triggers don't spam.
     */
    function voyagrMapForceReloadAllSources(reason) {
        try {
            if (!map || typeof map.getStyle !== 'function' || typeof map.getSource !== 'function') return 0;
            const now = Date.now();
            if (now - (window.__voyagrSourceReloadLastAt || 0) < 1500) return 0;
            window.__voyagrSourceReloadLastAt = now;
            const style = map.getStyle();
            if (!style || !style.sources) return 0;
            let reloaded = 0;
            for (const id of Object.keys(style.sources)) {
                try {
                    const def = style.sources[id];
                    if (!def) continue;
                    const source = map.getSource(id);
                    if (!source) continue;
                    if (Array.isArray(def.tiles) && def.tiles.length > 0 && typeof source.setTiles === 'function') {
                        source.setTiles(def.tiles);
                        reloaded++;
                    } else if (def.url && typeof source.setUrl === 'function') {
                        source.setUrl(def.url);
                        reloaded++;
                    }
                } catch (_) {
                    /* ignore per-source failures — keep going */
                }
            }
            if (reloaded > 0 && reason) {
                console.log('[Map] forced source reload (' + reloaded + ') reason:', reason);
            }
            return reloaded;
        } catch (_) {
            return 0;
        }
    }
    window.__voyagrMapForceReloadAllSources = voyagrMapForceReloadAllSources;

    /**
     * After flaky mobile data (e.g. 4G↔5G) MapLibre can stop drawing basemap lines while
     * overlays/nav keep working. Resize + repaint + a no-op jumpTo nudges the renderer,
     * and `voyagrMapForceReloadAllSources` re-fetches any tiles that were aborted mid-flight
     * when the network swapped. A delayed verification escalates to a soft style reload
     * if the map is still not painting tiles a few seconds later.
     */
    function voyagrMapRecoverAfterNetworkEvent(reason) {
        try {
            if (!map || typeof map.getStyle !== 'function') return;
            if (voyagrMapShouldSkipAggressiveRecovery()) {
                if (reason) {
                    console.log('[Map] recover skipped during init:', reason);
                }
                return;
            }
            const now = Date.now();
            if (now - (window.__voyagrMapRecoverLastAt || 0) < 650) {
                return;
            }
            window.__voyagrMapRecoverLastAt = now;
            voyagrMapResizeAndRepaint();
            const kickRepaint = () => {
                try {
                    if (typeof map.triggerRepaint === 'function') {
                        map.triggerRepaint();
                    }
                } catch (_) {
                    /* ignore */
                }
            };
            requestAnimationFrame(() => {
                kickRepaint();
                requestAnimationFrame(() => {
                    kickRepaint();
                    try {
                        const c = map.getCenter();
                        map.jumpTo({
                            center: [c.lng, c.lat],
                            zoom: map.getZoom(),
                            bearing: map.getBearing(),
                            pitch: map.getPitch()
                        });
                    } catch (_) {
                        /* ignore */
                    }
                    kickRepaint();
                });
            });

            // Re-fetch tiles that may have been aborted by the network swap.
            // Small delay so the radio has a moment to settle on the new network.
            setTimeout(() => {
                try { voyagrMapForceReloadAllSources(reason); } catch (_) { /* ignore */ }
                try {
                    if (typeof window.__voyagrRedrawNavigationOverlays === 'function') {
                        window.__voyagrRedrawNavigationOverlays(reason || 'map recover');
                    }
                } catch (_) {
                    /* ignore */
                }
            }, 250);

            // Verification pass: if the map still hasn't finished loading tiles
            // a few seconds later, try one more forced reload, then escalate
            // to a soft style reload as a last resort. The soft reload has
            // its own internal rate limits, so this can't loop.
            if (window.__voyagrMapRecoverVerifyTimer) {
                clearTimeout(window.__voyagrMapRecoverVerifyTimer);
            }
            window.__voyagrMapRecoverVerifyTimer = setTimeout(() => {
                window.__voyagrMapRecoverVerifyTimer = null;
                try {
                    if (!map) return;
                    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
                    if (voyagrMapShouldSkipAggressiveRecovery()) return;
                    const styleOk = typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : true;
                    const allLoaded = typeof map.loaded === 'function' ? map.loaded() : true;
                    if (styleOk && allLoaded) return; // healthy, nothing to do
                    voyagrMapForceReloadAllSources((reason || 'verify') + ' (retry)');
                    if (window.__voyagrMapRecoverEscalateTimer) {
                        clearTimeout(window.__voyagrMapRecoverEscalateTimer);
                    }
                    window.__voyagrMapRecoverEscalateTimer = setTimeout(() => {
                        window.__voyagrMapRecoverEscalateTimer = null;
                        try {
                            if (!map) return;
                            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
                            if (voyagrMapShouldSkipAggressiveRecovery()) return;
                            const styleOk2 = typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : true;
                            const allLoaded2 = typeof map.loaded === 'function' ? map.loaded() : true;
                            if (styleOk2 && allLoaded2) return;
                            if (typeof voyagrMapSoftStyleReload === 'function') {
                                voyagrMapSoftStyleReload((reason || 'verify') + ' (escalate)');
                            }
                        } catch (_) { /* ignore */ }
                    }, 6000);
                } catch (_) { /* ignore */ }
            }, 4000);

            if (reason) {
                console.log('[Map] recover after connectivity:', reason);
            }
        } catch (_) {
            /* ignore */
        }
    }
    window.__voyagrMapRecoverAfterNetworkEvent = voyagrMapRecoverAfterNetworkEvent;

    const __MAP_STYLE_RELOAD_MIN_GAP_MS = 120000;
    const __MAP_MAX_STYLE_RELOADS = 4;
    function voyagrMapSoftStyleReload(reason) {
        if (!map || typeof map.getStyle !== 'function' || typeof map.setStyle !== 'function') return;
        if (voyagrMapIsBootstrapStyle()) return;
        const now = Date.now();
        if (now - (window.__voyagrLastMapStyleReloadTime || 0) < __MAP_STYLE_RELOAD_MIN_GAP_MS) {
            return;
        }
        if ((window.__voyagrMapStyleReloadCount || 0) >= __MAP_MAX_STYLE_RELOADS) {
            if (!window.__voyagrMapStyleReloadsExhaustedLogged) {
                window.__voyagrMapStyleReloadsExhaustedLogged = true;
                console.warn('[Map] Max soft style reloads reached; not retrying until page reload');
            }
            return;
        }
        window.__voyagrLastMapStyleReloadTime = now;
        window.__voyagrMapStyleReloadCount = (window.__voyagrMapStyleReloadCount || 0) + 1;
        console.warn(
            '[Map] Soft style reload:',
            reason,
            `(${window.__voyagrMapStyleReloadCount}/${__MAP_MAX_STYLE_RELOADS})`
        );
        try {
            let savedView = null;
            try {
                const c = map.getCenter();
                savedView = {
                    center: [c.lng, c.lat],
                    zoom: map.getZoom(),
                    bearing: map.getBearing(),
                    pitch: map.getPitch()
                };
            } catch (_) {
                savedView = null;
            }
            const style = map.getStyle();
            if (style) {
                const clone = JSON.parse(JSON.stringify(style));
                map.setStyle(clone, { diff: false });
            } else if (window.__voyagrPreferredFallbackStyleUrl) {
                map.setStyle(window.__voyagrPreferredFallbackStyleUrl, { diff: false });
            }
            requestAnimationFrame(() => voyagrMapResizeAndRepaint());
            map.once('style.load', () => {
                try {
                    if (savedView) {
                        map.jumpTo(savedView);
                    }
                    if (typeof window.__voyagrRedrawNavigationOverlays === 'function') {
                        window.__voyagrRedrawNavigationOverlays('soft style reload');
                    }
                } catch (_) {
                    /* ignore */
                }
            });
        } catch (e) {
            console.warn('[Map] Soft style reload failed', e);
        }
    }
    window.__voyagrMapSoftStyleReload = voyagrMapSoftStyleReload;

    try {
        const glCanvas = typeof map.getCanvas === 'function' ? map.getCanvas() : null;
        if (glCanvas && glCanvas.addEventListener) {
            glCanvas.addEventListener(
                'webglcontextlost',
                (e) => {
                    try {
                        window.__voyagrMapWebGLLastLostAt = Date.now();
                    } catch (err) {
                        /* ignore */
                    }
                    console.warn('[MapLibre] WebGL context lost; browser may restore it', e);
                    try {
                        e.preventDefault();
                    } catch (err) {
                        /* must preventDefault to allow webglcontextrestored on some UAs */
                    }
                },
                false
            );
            glCanvas.addEventListener(
                'webglcontextrestored',
                () => {
                    try {
                        window.__voyagrMapWebGLLastLostAt = 0;
                    } catch (err) {
                        /* ignore */
                    }
                    console.warn('[MapLibre] WebGL context restored — resyncing map size and repaint');
                    voyagrMapResizeAndRepaint();
                    voyagrMapRecoverAfterNetworkEvent('webglcontextrestored');
                },
                false
            );
        }
    } catch (e) {
        /* non-fatal */
    }

    // Long drive / mobile: WebGL and canvas size can drift or stall without user interaction
    // (no visibility toggle). A periodic resize+repaint prevents "map vanished after ~10+ min" reports.
    if (!window.__voyagrMapFocusHandlerAdded) {
        window.__voyagrMapFocusHandlerAdded = true;
        window.addEventListener(
            'focus',
            () => {
                try {
                    voyagrMapResizeAndRepaint();
                    voyagrMapRecoverAfterNetworkEvent('window focus');
                } catch (e) {
                    /* ignore */
                }
            },
            { passive: true }
        );
    }
    if (!window.__voyagrMapVisibilityHandlerAdded) {
        window.__voyagrMapVisibilityHandlerAdded = true;
        document.addEventListener(
            'visibilitychange',
            () => {
                try {
                    if (document.visibilityState === 'visible') {
                        // Immediate (RAF×2) — catches the common case fast.
                        voyagrMapResizeAndRepaint();
                        voyagrMapRecoverAfterNetworkEvent('document visible');
                        // Delayed second resize: on Android Chrome (and iOS Safari) the
                        // address bar can show/hide a few hundred ms after the tab
                        // becomes visible, changing innerHeight after our first resize.
                        // A 150 ms follow-up captures the settled viewport so the
                        // canvas doesn't render at the wrong size (a known cause of
                        // "map looks blank / cropped after resuming the PWA").
                        setTimeout(() => {
                            try {
                                if (
                                    typeof document !== 'undefined' &&
                                    document.visibilityState === 'visible'
                                ) {
                                    voyagrMapResizeAndRepaint();
                                }
                            } catch (e) {
                                /* ignore */
                            }
                        }, 150);
                    }
                } catch (e) {
                    /* ignore */
                }
            },
            { passive: true }
        );
    }
    if (!window.__voyagrPageShowHandlerAdded) {
        window.__voyagrPageShowHandlerAdded = true;
        window.addEventListener(
            'pageshow',
            (ev) => {
                try {
                    if (ev && ev.persisted) {
                        voyagrMapRecoverAfterNetworkEvent('pageshow bfcache');
                    }
                } catch (e) {
                    /* ignore */
                }
            },
            { passive: true }
        );
    }
    if (!window.__voyagrNetworkInformationHandlerAdded) {
        try {
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (conn && typeof conn.addEventListener === 'function') {
                window.__voyagrNetworkInformationHandlerAdded = true;
                let _connRecoverTimer = null;
                conn.addEventListener(
                    'change',
                    () => {
                        try {
                            if (_connRecoverTimer) {
                                clearTimeout(_connRecoverTimer);
                            }
                            _connRecoverTimer = setTimeout(() => {
                                _connRecoverTimer = null;
                                voyagrMapRecoverAfterNetworkEvent(
                                    'networkinformation ' +
                                        String(conn.effectiveType || conn.type || 'change')
                                );
                            }, 450);
                        } catch (e) {
                            /* ignore */
                        }
                    },
                    { passive: true }
                );
            }
        } catch (e) {
            /* ignore */
        }
    }
    if (_mapRenderHeartbeatId) {
        clearInterval(_mapRenderHeartbeatId);
        _mapRenderHeartbeatId = null;
    }
    // 45s heartbeat. Long drives on mobile Chrome occasionally land in a state
    // where the GL canvas is alive but no tiles are being painted (sources
    // silently errored, render loop paused after a GPU process restart, etc.).
    // 45s caps the worst-case blank window at ~45s while still being cheap —
    // map.resize() + triggerRepaint() is a few dozen microseconds when nothing
    // needs to change.
    const MAP_RENDER_HEARTBEAT_MS = 45000;
    _mapRenderHeartbeatId = setInterval(() => {
        try {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            if (!map) return;
            const el = map.getContainer && map.getContainer();
            if (el && (el.offsetWidth < 2 || el.offsetHeight < 2)) {
                console.warn('[Map] #map container has near-zero size; forcing resize');
            }
            voyagrMapResizeAndRepaint();

            const gl = getMapWebGLContext();
            if (gl && gl.isContextLost()) {
                if (!window.__voyagrMapContextStuckAt) {
                    window.__voyagrMapContextStuckAt = Date.now();
                } else if (Date.now() - window.__voyagrMapContextStuckAt > 5000) {
                    voyagrMapSoftStyleReload('webgl context lost >5s (heartbeat)');
                    window.__voyagrMapContextStuckAt = 0;
                }
            } else {
                window.__voyagrMapContextStuckAt = 0;
            }

            if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) {
                if (!window.__voyagrMapStyleStuckAt) {
                    window.__voyagrMapStyleStuckAt = Date.now();
                } else if (Date.now() - window.__voyagrMapStyleStuckAt > 45000) {
                    voyagrMapSoftStyleReload('isStyleLoaded false for 45s+ (heartbeat)');
                    window.__voyagrMapStyleStuckAt = 0;
                }
            } else {
                window.__voyagrMapStyleStuckAt = 0;
            }

            // Tiles-stuck detector. `areTilesLoaded()` returning false is
            // normal during pan/zoom, but on long drives we sometimes see
            // sources silently stop completing tile requests (CDN session
            // expired, mobile NAT swapped, etc.). isStyleLoaded() stays true
            // and the GL context is fine, so neither check above fires — yet
            // the user sees a blank/partial basemap. If tiles stay unloaded
            // for two consecutive heartbeats (~90s) while the tab is visible,
            // re-issue every source's tile requests. This is cheaper than a
            // soft style reload and usually enough.
            try {
                if (typeof map.areTilesLoaded === 'function') {
                    const tilesLoaded = map.areTilesLoaded();
                    if (!tilesLoaded) {
                        if (!window.__voyagrMapTilesStuckAt) {
                            window.__voyagrMapTilesStuckAt = Date.now();
                        } else if (
                            Date.now() - window.__voyagrMapTilesStuckAt >
                            MAP_RENDER_HEARTBEAT_MS + 5000 /* one full heartbeat + slack */
                        ) {
                            const reloaded = voyagrMapForceReloadAllSources(
                                'tiles unloaded for >' +
                                    Math.round(MAP_RENDER_HEARTBEAT_MS / 1000) +
                                    's (heartbeat)'
                            );
                            if (reloaded === 0) {
                                // Force reload was debounced or no sources matched —
                                // try the cheap repaint nudge instead.
                                voyagrMapResizeAndRepaint();
                            }
                            window.__voyagrMapTilesStuckAt = 0;
                        }
                    } else {
                        window.__voyagrMapTilesStuckAt = 0;
                    }
                }
            } catch (e) {
                /* ignore — areTilesLoaded() can throw on transitional state */
            }
        } catch (e) {
            /* ignore */
        }
    }, MAP_RENDER_HEARTBEAT_MS);
    window.addEventListener(
        'beforeunload',
        () => {
            if (_mapRenderHeartbeatId) {
                clearInterval(_mapRenderHeartbeatId);
                _mapRenderHeartbeatId = null;
            }
        },
        { once: true, capture: true }
    );

    // Attempt to center on current location after the basemap has painted (London default first).
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                voyagrMapFlyToUserWhenReady(
                    position.coords.latitude,
                    position.coords.longitude
                );
            },
            (error) => {
                console.log('[Init] Geolocation failed or denied:', error.message);
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
    }
    // Add navigation controls (zoom and rotation) - positioned bottom-left to avoid
    // collision with speed widget and notifications in top-right
    map.addControl(new maplibregl.NavigationControl(), 'bottom-left');

    fetch(vectorStyleUrlAbs)
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then((styleJson) => {
            resolveStyleUrls(styleJson);
            map.setStyle(styleJson, { diff: false });
            console.log('[Init] Main map style applied (async)');
        })
        .catch((err) => {
            console.warn('[Init] Async style fetch failed, using style URL + transformRequest:', err);
            try {
                map.setStyle(vectorStyleUrlAbs, { diff: false });
            } catch (e2) {
                console.error('[Init] setStyle URL fallback failed:', e2);
                hideMapLoadingOverlay();
            }
        });

    console.log('[Init] Map shell ready (vector style loading async)');
}

// NOTE: convertDistance / getDistanceUnit / convertSpeed / getSpeedUnit /
// convertTemperature / getTemperatureUnit / calculateDistance are defined in
// voyagr-app.js (loaded after this file). The canonical copies live there to
// avoid duplicate global declarations. calculateDistance() returns METRES.

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', initializeMap);


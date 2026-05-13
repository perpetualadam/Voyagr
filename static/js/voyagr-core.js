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
let mapPickerMode = null; // 'start' or 'end' when picking location from map

// ===== ZOOM AND FOLLOW VARIABLES =====
let zoomAndFollowEnabled = localStorage.getItem('zoomAndFollowEnabled') === 'true' || true; // Default: enabled
let mapFollowingActive = false; // Whether we're currently following the vehicle

// ===== UNIT CONVERSION VARIABLES =====
let distanceUnit = localStorage.getItem('unit_distance') || 'mi';  // Default: miles
let currencyUnit = localStorage.getItem('unit_currency') || 'GBP';
let speedUnit = localStorage.getItem('unit_speed') || 'mph';  // Default: mph
let temperatureUnit = localStorage.getItem('unit_temperature') || 'celsius';

const currencySymbols = {
    'GBP': '£',
    'USD': '$',
    'EUR': '€'
};

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

            validateStyleHasLabels();

            try {
                if (window.MapLibreHelpers && typeof window.MapLibreHelpers.applyTransportationRoadLineWidthScale === 'function') {
                    window.MapLibreHelpers.applyTransportationRoadLineWidthScale(map, 2);
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
     * After flaky mobile data (e.g. 4G↔5G) MapLibre can stop drawing basemap lines while
     * overlays/nav keep working. Resize + repaint + a no-op jumpTo nudges tile loading.
     */
    function voyagrMapRecoverAfterNetworkEvent(reason) {
        try {
            if (!map || typeof map.getStyle !== 'function') return;
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
            const style = map.getStyle();
            if (style) {
                const clone = JSON.parse(JSON.stringify(style));
                map.setStyle(clone, { diff: false });
            } else if (window.__voyagrPreferredFallbackStyleUrl) {
                map.setStyle(window.__voyagrPreferredFallbackStyleUrl, { diff: false });
            }
            requestAnimationFrame(() => voyagrMapResizeAndRepaint());
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
                        voyagrMapResizeAndRepaint();
                        voyagrMapRecoverAfterNetworkEvent('document visible');
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
    const MAP_RENDER_HEARTBEAT_MS = 90000; // 90s — balance battery vs recovery on long sessions
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

    // Attempt to center on current location on load
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                console.log(`[Init] Centering on user: [${lat}, ${lon}]`);
                map.flyTo({
                    center: [lon, lat],
                    zoom: 15,
                    duration: 2000
                });
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
            }
        });

    console.log('[Init] Map shell ready (vector style loading async)');
}

/**
 * Convert distance from kilometers to selected unit
 * @function convertDistance
 * @param {number} km - Distance in kilometers
 * @returns {string} Converted distance
 */
function convertDistance(km) {
    if (distanceUnit === 'mi') {
        return (km * 0.621371).toFixed(2);
    }
    return km.toFixed(2);
}

/**
 * Get the current distance unit
 * @function getDistanceUnit
 * @returns {string} Distance unit ('km' or 'mi')
 */
function getDistanceUnit() {
    return distanceUnit === 'mi' ? 'mi' : 'km';
}

/**
 * Convert speed from km/h to selected unit
 * @function convertSpeed
 * @param {number} kmh - Speed in kilometers per hour
 * @returns {string} Converted speed
 */
function convertSpeed(kmh) {
    if (speedUnit === 'mph') {
        return (kmh * 0.621371).toFixed(1);
    }
    return kmh.toFixed(1);
}

/**
 * Get the current speed unit
 * @function getSpeedUnit
 * @returns {string} Speed unit ('km/h' or 'mph')
 */
function getSpeedUnit() {
    return speedUnit === 'mph' ? 'mph' : 'km/h';
}

/**
 * Convert temperature from Celsius to selected unit
 * @function convertTemperature
 * @param {number} celsius - Temperature in Celsius
 * @returns {string} Converted temperature
 */
function convertTemperature(celsius) {
    if (temperatureUnit === 'fahrenheit') {
        return ((celsius * 9 / 5) + 32).toFixed(1);
    }
    return celsius.toFixed(1);
}

/**
 * Get the current temperature unit
 * @function getTemperatureUnit
 * @returns {string} Temperature unit ('°C' or '°F')
 */
function getTemperatureUnit() {
    return temperatureUnit === 'fahrenheit' ? '°F' : '°C';
}

/**
 * Calculate Haversine distance between two coordinates
 * @function calculateDistance
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', initializeMap);


/**
 * @file Offline navigation helpers: banner HTML, route persistence, tile precache planning.
 * @module modules/navigation/offline-navigation
 */
(function (root) {
    'use strict';

    var OFFLINE_BANNER_ID = 'offlineBanner';
    var RESUME_NAV_BANNER_ID = 'resumeNavBanner';
    var RESUME_NAV_YES_ID = 'resumeNavYes';
    var RESUME_NAV_NO_ID = 'resumeNavNo';
    var RESUME_NAV_AUTO_DISMISS_MS = 30000;

    var ROUTE_DB_NAME = 'voyagr-nav';
    var ROUTE_DB_VERSION = 2;
    var ROUTE_STORE = 'active_route';
    var SPEED_CACHE_STORE = 'speed_limits';
    var ROUTE_PERSIST_MAX_AGE_MS = 4 * 60 * 60 * 1000;
    var TILE_PRECACHE_ZOOM_LEVELS = [13, 14, 15];
    var TILE_PRECACHE_MAX_URLS = 180;
    var TILE_PRECACHE_BATCH_SIZE = 6;
    var TILE_PRECACHE_SAMPLE_POINTS = 80;

    /**
     * Inline style for the fixed offline connectivity banner.
     * @returns {string}
     */
    function getOfflineBannerStyleCssText() {
        return [
            'position:fixed;top:0;left:0;right:0;z-index:99999;',
            'background:linear-gradient(135deg,#ff6b6b,#ee5a24);color:#fff;',
            'padding:10px 16px;text-align:center;font-size:14px;font-weight:600;',
            'font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
            'box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;',
            'justify-content:center;gap:8px;transition:transform 0.3s ease;',
        ].join('');
    }

    /**
     * @returns {string}
     */
    function buildOfflineBannerInnerHtml() {
        return '<span>📡</span><span>You\'re offline — GPS & cached map tiles still work</span>';
    }

    /**
     * @returns {string}
     */
    function getResumeNavigationBannerStyleCssText() {
        return [
            'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99998;',
            'background:#fff;border-radius:16px;padding:16px 20px;',
            'box-shadow:0 4px 20px rgba(0,0,0,0.25);max-width:340px;width:90%;',
            'font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
            'display:flex;flex-direction:column;gap:10px;',
        ].join('');
    }

    /**
     * @param {number} stepCount
     * @returns {string}
     */
    function buildResumeNavigationBannerHtml(stepCount) {
        stepCount = stepCount || 0;
        return (
            '<div style="font-weight:600;font-size:15px">Resume navigation?</div>' +
            '<div style="font-size:13px;color:#666">A previous route was found (' + stepCount + ' steps).</div>' +
            '<div style="display:flex;gap:8px">' +
                '<button id="resumeNavYes" style="flex:1;padding:10px;border:none;border-radius:10px;' +
                    'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-weight:600;' +
                    'font-size:14px;cursor:pointer">Resume</button>' +
                '<button id="resumeNavNo" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:10px;' +
                    'background:#fff;color:#333;font-weight:600;font-size:14px;cursor:pointer">Dismiss</button>' +
            '</div>'
        );
    }

    /**
     * @param {number} savedAt
     * @param {number} [now]
     * @param {number} [maxAgeMs]
     * @returns {boolean}
     */
    function isPersistedRouteExpired(savedAt, now, maxAgeMs) {
        now = now != null ? now : Date.now();
        maxAgeMs = maxAgeMs != null ? maxAgeMs : ROUTE_PERSIST_MAX_AGE_MS;
        return (now - (savedAt || 0)) > maxAgeMs;
    }

    /**
     * @param {Object} snapshot
     * @returns {Object}
     */
    function buildActiveRoutePersistRecord(snapshot) {
        snapshot = snapshot || {};
        return {
            id: 'current',
            polyline: snapshot.polyline,
            steps: snapshot.steps,
            stepIndex: snapshot.stepIndex,
            destination: snapshot.destination || null,
            routeData: snapshot.routeData || null,
            savedAt: snapshot.savedAt != null ? snapshot.savedAt : Date.now(),
        };
    }

    /**
     * @param {IDBFactory} [idb]
     * @returns {Promise<IDBDatabase>}
     */
    function openRouteDB(idb) {
        idb = idb || (typeof indexedDB !== 'undefined' ? indexedDB : null);
        if (!idb) {
            return Promise.reject(new Error('indexedDB unavailable'));
        }
        return new Promise(function (resolve, reject) {
            var req = idb.open(ROUTE_DB_NAME, ROUTE_DB_VERSION);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(ROUTE_STORE)) {
                    db.createObjectStore(ROUTE_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(SPEED_CACHE_STORE)) {
                    db.createObjectStore(SPEED_CACHE_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /**
     * @param {IDBFactory} idb
     * @param {string} key
     * @param {number} speedLimit
     * @param {string} source
     * @returns {Promise<void>}
     */
    function putSpeedLimitCacheEntry(idb, key, speedLimit, source) {
        return openRouteDB(idb).then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(SPEED_CACHE_STORE, 'readwrite');
                tx.objectStore(SPEED_CACHE_STORE).put({
                    key: key,
                    speedLimit: speedLimit,
                    source: source,
                    cachedAt: Date.now(),
                });
                tx.oncomplete = function () { db.close(); resolve(); };
                tx.onerror = function () { db.close(); reject(tx.error); };
            });
        });
    }

    /**
     * @param {IDBFactory} idb
     * @param {string} key
     * @returns {Promise<Object|null>}
     */
    function getSpeedLimitCacheEntry(idb, key) {
        return openRouteDB(idb).then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(SPEED_CACHE_STORE, 'readonly');
                var req = tx.objectStore(SPEED_CACHE_STORE).get(key);
                req.onsuccess = function () {
                    db.close();
                    resolve(req.result || null);
                };
                req.onerror = function () {
                    db.close();
                    reject(req.error);
                };
            });
        });
    }

    /**
     * @param {IDBFactory} idb
     * @param {Object} record
     * @returns {Promise<void>}
     */
    function persistActiveRouteRecord(idb, record) {
        return openRouteDB(idb).then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(ROUTE_STORE, 'readwrite');
                tx.objectStore(ROUTE_STORE).put(record);
                tx.oncomplete = function () { db.close(); resolve(); };
                tx.onerror = function () { db.close(); reject(tx.error); };
            });
        });
    }

    /**
     * @param {IDBFactory} idb
     * @returns {Promise<Object|null>}
     */
    function loadActiveRouteRecord(idb) {
        return openRouteDB(idb).then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(ROUTE_STORE, 'readonly');
                var req = tx.objectStore(ROUTE_STORE).get('current');
                req.onsuccess = function () {
                    db.close();
                    resolve(req.result || null);
                };
                req.onerror = function () {
                    db.close();
                    reject(req.error);
                };
            });
        });
    }

    /**
     * @param {IDBFactory} idb
     * @returns {Promise<void>}
     */
    function clearActiveRouteRecord(idb) {
        return openRouteDB(idb).then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(ROUTE_STORE, 'readwrite');
                tx.objectStore(ROUTE_STORE).delete('current');
                tx.oncomplete = function () { db.close(); resolve(); };
                tx.onerror = function () { db.close(); reject(tx.error); };
            });
        });
    }

    /**
     * @param {Object|null|undefined} style
     * @returns {Array<{ template: string, minzoom: number, maxzoom: number }>}
     */
    function parseVectorTileSourcesFromStyle(style) {
        var entries = [];
        var sources = style && style.sources ? style.sources : {};
        for (var key of Object.keys(sources)) {
            var src = sources[key];
            if (!src || src.type !== 'vector' || !Array.isArray(src.tiles)) continue;
            var minzoom = typeof src.minzoom === 'number' ? src.minzoom : 0;
            var maxzoom = typeof src.maxzoom === 'number' ? src.maxzoom : 22;
            for (var i = 0; i < src.tiles.length; i++) {
                var t = src.tiles[i];
                if (typeof t !== 'string') continue;
                if (/\{z\}/i.test(t) && /\{x\}/i.test(t) && /\{y\}/i.test(t)) {
                    entries.push({ template: t, minzoom: minzoom, maxzoom: maxzoom });
                }
            }
        }
        return entries;
    }

    /**
     * @param {string} template
     * @param {number} z
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    function expandTileTemplate(template, z, x, y) {
        return String(template)
            .replace(/\{z\}/gi, String(z))
            .replace(/\{x\}/gi, String(x))
            .replace(/\{y\}/gi, String(y));
    }

    /**
     * @param {number} lat
     * @param {number} lon
     * @param {number} z
     * @returns {{ x: number, y: number }}
     */
    function latLonToTileXY(lat, lon, z) {
        var x = Math.floor((lon + 180) / 360 * Math.pow(2, z));
        var latRad = lat * Math.PI / 180;
        var y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z));
        return { x: x, y: y };
    }

    /**
     * @param {number} z
     * @param {number} srcMin
     * @param {number} srcMax
     * @returns {number}
     */
    function clampTileFetchZoom(z, srcMin, srcMax) {
        return Math.min(Math.max(z, srcMin), srcMax);
    }

    /**
     * @param {string} url
     * @param {string} [origin]
     * @returns {string}
     */
    function normalizePrefetchTileUrl(url, origin) {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        origin = origin || (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost');
        return new URL(url, origin).href;
    }

    /**
     * Build deduplicated tile URLs along a route corridor.
     * @param {Array<[number, number]>} polyline
     * @param {Array<{ template: string, minzoom: number, maxzoom: number }>} templates
     * @param {Object} [opts]
     * @returns {{ urls: string[], originalCount: number, capped: boolean }}
     */
    function buildRouteCorridorTileUrlPlan(polyline, templates, opts) {
        opts = opts || {};
        var zoomLevels = opts.zoomLevels || TILE_PRECACHE_ZOOM_LEVELS;
        var maxUrls = opts.maxUrls != null ? opts.maxUrls : TILE_PRECACHE_MAX_URLS;
        var samplePoints = opts.samplePoints != null ? opts.samplePoints : TILE_PRECACHE_SAMPLE_POINTS;
        var origin = opts.origin;
        var routes = polyline || [];
        var tpls = templates || [];
        if (routes.length < 2 || tpls.length === 0) {
            return { urls: [], originalCount: 0, capped: false };
        }

        var tileUrls = new Set();
        var sampleInterval = Math.max(1, Math.floor(routes.length / samplePoints));

        for (var i = 0; i < routes.length; i += sampleInterval) {
            var lat = routes[i][0];
            var lon = routes[i][1];
            for (var zi = 0; zi < zoomLevels.length; zi++) {
                var z = zoomLevels[zi];
                for (var ti = 0; ti < tpls.length; ti++) {
                    var tpl = tpls[ti];
                    var zFetch = clampTileFetchZoom(z, tpl.minzoom, tpl.maxzoom);
                    var tile = latLonToTileXY(lat, lon, zFetch);
                    tileUrls.add(expandTileTemplate(tpl.template, zFetch, tile.x, tile.y));
                }
            }
        }

        var raw = Array.from(tileUrls).map(function (u) {
            return normalizePrefetchTileUrl(u, origin);
        });
        var capped = raw.length > maxUrls;
        return {
            urls: capped ? raw.slice(0, maxUrls) : raw,
            originalCount: raw.length,
            capped: capped,
        };
    }

    /**
     * Preflight plan for offering navigation resume from persisted route data.
     * @param {Object} [saved]
     * @returns {Object}
     */
    function buildTryResumeNavigationPreflightPlan(saved) {
        saved = saved || {};
        if (!saved.polyline || !saved.steps) {
            return { shouldOffer: false };
        }
        return {
            shouldOffer: true,
            stepCount: (saved.steps || []).length,
            resumeStepIndex: saved.stepIndex || 0,
            bannerId: RESUME_NAV_BANNER_ID,
            resumeYesId: RESUME_NAV_YES_ID,
            resumeNoId: RESUME_NAV_NO_ID,
            autoDismissMs: RESUME_NAV_AUTO_DISMISS_MS,
            foundLogMessage: '[OfflineNav] Found persisted route, offering resume',
            resumedFullLogMessage: '[OfflineNav] Route resumed via full navigation bootstrap',
            resumedLegacyLogMessage: '[OfflineNav] Route resumed (legacy path — missing encoded geometry)',
            legacyResumeStatusMessage: '🧭 Navigation resumed from saved route',
            legacyResumeStatusType: 'success',
            errorLogPrefix: '[OfflineNav] Resume check failed:',
        };
    }

    /**
     * Preflight for reading vector tile templates from the active map style.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildCollectVectorTileTemplatesPreflightPlan(input) {
        input = input || {};
        if (!input.hasOfflineModule || !input.hasMap) {
            return { canCollect: false, templates: [] };
        }
        if (input.styleLoaded === false) {
            return { canCollect: false, templates: [] };
        }
        return {
            canCollect: true,
            errorLogPrefix: '[TilePreCache] Could not read map style:',
        };
    }

    /**
     * Execute plan for corridor tile precache after URL plan is built.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildPrecacheRouteTilesExecutePlan(input) {
        input = input || {};
        var urlCount = (input.urls || []).length;
        return {
            shouldPrecache: (input.polylineLength || 0) >= 2 && !!input.hasCaches && urlCount > 0,
            hasTemplates: (input.templateCount || 0) > 0,
            skipNoTemplatesLog: '[TilePreCache] Style has no vector tile templates yet — skipping corridor precache',
            capped: !!input.capped,
            originalCount: input.originalCount || 0,
            urlCount: urlCount,
            templateCount: input.templateCount || 0,
            cappedLogPrefix: '[TilePreCache] Capping prefetch',
            startLogPrefix: '[TilePreCache] Pre-caching',
            completeLogPrefix: '[TilePreCache] Cached',
            errorLogPrefix: '[TilePreCache] Error:',
            tileCacheNamePrefix: 'voyagr-tiles-',
            defaultTileCacheName: 'voyagr-tiles-v15',
            batchSize: TILE_PRECACHE_BATCH_SIZE,
            urls: input.urls || [],
        };
    }

    var api = {
        OFFLINE_BANNER_ID: OFFLINE_BANNER_ID,
        RESUME_NAV_BANNER_ID: RESUME_NAV_BANNER_ID,
        RESUME_NAV_YES_ID: RESUME_NAV_YES_ID,
        RESUME_NAV_NO_ID: RESUME_NAV_NO_ID,
        RESUME_NAV_AUTO_DISMISS_MS: RESUME_NAV_AUTO_DISMISS_MS,
        ROUTE_DB_NAME: ROUTE_DB_NAME,
        ROUTE_DB_VERSION: ROUTE_DB_VERSION,
        ROUTE_STORE: ROUTE_STORE,
        SPEED_CACHE_STORE: SPEED_CACHE_STORE,
        ROUTE_PERSIST_MAX_AGE_MS: ROUTE_PERSIST_MAX_AGE_MS,
        TILE_PRECACHE_ZOOM_LEVELS: TILE_PRECACHE_ZOOM_LEVELS,
        TILE_PRECACHE_MAX_URLS: TILE_PRECACHE_MAX_URLS,
        TILE_PRECACHE_BATCH_SIZE: TILE_PRECACHE_BATCH_SIZE,
        getOfflineBannerStyleCssText: getOfflineBannerStyleCssText,
        buildOfflineBannerInnerHtml: buildOfflineBannerInnerHtml,
        getResumeNavigationBannerStyleCssText: getResumeNavigationBannerStyleCssText,
        buildResumeNavigationBannerHtml: buildResumeNavigationBannerHtml,
        buildTryResumeNavigationPreflightPlan: buildTryResumeNavigationPreflightPlan,
        isPersistedRouteExpired: isPersistedRouteExpired,
        buildActiveRoutePersistRecord: buildActiveRoutePersistRecord,
        openRouteDB: openRouteDB,
        putSpeedLimitCacheEntry: putSpeedLimitCacheEntry,
        getSpeedLimitCacheEntry: getSpeedLimitCacheEntry,
        persistActiveRouteRecord: persistActiveRouteRecord,
        loadActiveRouteRecord: loadActiveRouteRecord,
        clearActiveRouteRecord: clearActiveRouteRecord,
        parseVectorTileSourcesFromStyle: parseVectorTileSourcesFromStyle,
        expandTileTemplate: expandTileTemplate,
        latLonToTileXY: latLonToTileXY,
        clampTileFetchZoom: clampTileFetchZoom,
        normalizePrefetchTileUrl: normalizePrefetchTileUrl,
        buildRouteCorridorTileUrlPlan: buildRouteCorridorTileUrlPlan,
        buildCollectVectorTileTemplatesPreflightPlan: buildCollectVectorTileTemplatesPreflightPlan,
        buildPrecacheRouteTilesExecutePlan: buildPrecacheRouteTilesExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrOfflineNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

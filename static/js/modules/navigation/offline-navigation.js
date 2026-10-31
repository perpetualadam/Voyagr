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
        return '<span>📡</span><span>You\'re offline — voice guidance needs reliable GPS and available resources. Cached maps may be incomplete; avoidance cannot be refreshed.</span>';
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
            '<div style="font-weight:600;font-size:15px">Inspect saved journey?</div>' +
            '<div style="font-size:13px;color:#666">A previous route was found (' + stepCount + ' steps). Recalculate before navigation.</div>' +
            '<div style="display:flex;gap:8px">' +
                '<button id="resumeNavYes" style="flex:1;padding:10px;border:none;border-radius:10px;' +
                    'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-weight:600;' +
                    'font-size:14px;cursor:pointer">View journey</button>' +
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
        return !Number.isFinite(savedAt) || savedAt>now || (now-savedAt)>maxAgeMs;
    }

    /**
     * @param {Object} snapshot
     * @returns {Object}
     */
    function buildActiveRoutePersistRecord(snapshot) {
        snapshot = snapshot || {};
        if(snapshot.ownership!=null&&!validOwnership(snapshot.ownership))throw Error('Invalid durable journey ownership');
        var journeyId=snapshot.ownership?snapshot.ownership.journey_id:newIdentity('journey-');
        var selected=snapshot.routeData ? Object.assign({},snapshot.routeData) : null;
        if (selected) {delete selected.routes;delete selected.durable_journey_id;} // Ownership lives on the durable record, never provider/route data.
        return {
            journey_id:journeyId,
            persistence_owner:newIdentity('owner-'),
            navigation_schema_version:3,
            progress_hint:snapshot.progressHint || null,
            continuation:snapshot.continuation ? Object.assign(JSON.parse(JSON.stringify(snapshot.continuation)),{journey_id:journeyId}) : null,
            id: 'current',
            polyline: snapshot.polyline,
            steps: snapshot.steps,
            stepIndex: snapshot.stepIndex,
            destination: snapshot.destination || null,
            routeData: selected,
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
    function newIdentity(prefix){
        if(!root.crypto||typeof root.crypto.getRandomValues!=='function')throw Error('Durable identity unavailable');
        var values=new Uint32Array(4);root.crypto.getRandomValues(values);
        return prefix+Array.from(values,function(value){return value.toString(16).padStart(8,'0');}).join('');
    }
    function validOwnership(value){return !!value&&typeof value.journey_id==='string'&&typeof value.persistence_owner==='string'&&/^journey-[0-9a-f]{32}$/.test(value.journey_id)&&/^(owner|pending|checkpoint)-[0-9a-f]{32}$/.test(value.persistence_owner);}
    function ownershipOf(value){return validOwnership(value)?{journey_id:value.journey_id,persistence_owner:value.persistence_owner}:null;}
    function matchesOwnership(value,expected){
        if(expected===null)return value==null;
        return validOwnership(expected)&&validOwnership(value)&&value.journey_id===expected.journey_id&&value.persistence_owner===expected.persistence_owner;
    }
    function persistActiveRouteRecord(idb, record, guard, onCancel, expectedOwnership) {
        record=Object.assign({},record); // Freeze identity values at invocation.
        var expected=ownershipOf(expectedOwnership);
        if(!validOwnership(record)||(expectedOwnership!=null&&!expected))return Promise.resolve(false);
        return openRouteDB(idb).then(function(db){return new Promise(function(resolve,reject){
            if(guard&&guard()!==true){db.close();resolve(false);return;}
            var tx=db.transaction(ROUTE_STORE,'readwrite'),store=tx.objectStore(ROUTE_STORE),ok=true;
            var unsubscribe=onCancel?onCancel(function(){try{tx.abort();}catch(_){/* Already complete. */}}):function(){};
            tx.oncomplete=function(){unsubscribe();db.close();resolve(ok?undefined:false);};
            tx.onerror=tx.onabort=function(){unsubscribe();db.close();reject(tx.error||Error('Persistence aborted'));};
            function put(){if(guard&&guard()!==true){ok=false;return;}store.put(record);}
            // No expected owner means creation into an empty slot, never an
            // unguarded overwrite of a known or legacy journey.
            var read=store.get('current');read.onsuccess=function(){if(!matchesOwnership(read.result,expected)){ok=false;return;}put();};
        });});
    }
    function visibleJourney(record){
        var depth=0;while(record&&record.planning_pending&&depth++<8)record=record.previous_journey||null;
        return record&&(record.planning_pending||record.abandoned)?null:record;
    }
    function stageActiveRouteRecord(idb, record, options) {
        options=Object.assign({},options||{});
        record=Object.assign({},record);
        var explicit=Object.prototype.hasOwnProperty.call(options,'expectedOwnership');
        var expected=ownershipOf(options.expectedOwnership); // Captured once, before async work.
        if(!validOwnership(record)||(explicit&&options.expectedOwnership!=null&&!expected)||(options.abandon&&!expected))return Promise.resolve(null);
        var id=newIdentity('pending-'),previous=null,previousOwner=null,aborted=false,activeTx=null,ownershipFailure=false;
        var committedOwner={journey_id:record.journey_id,persistence_owner:id};
        function write(action,guard){
            return openRouteDB(idb).then(function(db){return new Promise(function(resolve,reject){
                if(action==='stage'&&options.guard&&options.guard()!==true){db.close();resolve(false);return;}
                if((action==='commit'||action==='finalize')&&(aborted||!guard||guard()!==true)){db.close();resolve(false);return;}
                var tx=db.transaction(ROUTE_STORE,'readwrite'),store=tx.objectStore(ROUTE_STORE),ok=true;
                activeTx=tx;
                tx.oncomplete=function(){if(activeTx===tx)activeTx=null;db.close();resolve(ok);};
                tx.onerror=tx.onabort=function(){if(activeTx===tx)activeTx=null;db.close();reject(tx.error||Error('Persistence aborted'));};
                if(action==='discard'){store.delete(id);return;}
                var read=store.get('current');read.onsuccess=function(){
                    try{
                        var current=read.result||null;
                        if(action==='stage'){
                            // Legacy data is inspectable, never ownership evidence.
                            if(current&&!validOwnership(current)||explicit&&!matchesOwnership(current,expected)){ownershipFailure=true;ok=false;return;}
                            if(options.guard&&options.guard()!==true){ok=false;return;}
                            previous=current;previousOwner=ownershipOf(current);
                            if(options.abandon&&!current.abandoned){
                                // The caller supplied the exact durable owner before this
                                // operation began. Never adopt an owner by route equality.
                                if(record.journey_id!==expected.journey_id){ok=false;return;}
                                previous=Object.assign({},record,{id:'current',persistence_owner:newIdentity('checkpoint-')});
                                previousOwner=ownershipOf(previous);store.put(previous);
                            }
                            store.put(Object.assign({},record,{id:id}));return;
                        }
                        if(action==='commit'){
                            if(!matchesOwnership(current,previousOwner)||guard()!==true){ok=false;return;}
                            store.put(Object.assign({},record,committedOwner,{id:'current'},options.planning||options.abandon?{planning_pending:true,previous_journey:previous}:{}));store.delete(id);return;
                        }
                        if(guard&&guard()!==true){ok=false;return;}
                        if(!matchesOwnership(current,committedOwner)){
                            ok=action==='rollback'&&matchesOwnership(current,previousOwner);return;
                        }
                        if(action==='rollback'){if(previous)store.put(previous);else store.delete('current');}
                        else store.put(options.abandon?Object.assign({id:'current',abandoned:true},committedOwner):Object.assign({},record,committedOwner,{id:'current'}));
                    }catch(_){try{tx.abort();}catch(__){/* Already complete. */}}
                };
            });});
        }
        return write('stage').then(function(ok){if(ownershipFailure)return {ownershipMismatch:true,discard:function(){return Promise.resolve(true);}};return !ok?null:{
            DURABLE_OWNERSHIP_PROTOCOL:1,ABANDONMENT_PROTOCOL:2,
            previousOwnership:function(){return ownershipOf(previousOwner);},
            committedOwnership:function(){return ownershipOf(committedOwner);},
            commit:function(guard){return write('commit',guard);},
            finalize:function(guard){return write('finalize',guard);},
            rollback:function(guard){return write('rollback',guard);},
            discard:function(){return write('discard');},
            abort:function(){aborted=true;if(activeTx){try{activeTx.abort();}catch(_){/* Transaction already completed. */}}},
        };});
    }

    /**
     * @param {IDBFactory} idb
     * @returns {Promise<Object|null>}
     */
    function loadJourneyState(idb){
        return openRouteDB(idb).then(function(db){return new Promise(function(resolve,reject){
            var tx=db.transaction(ROUTE_STORE,'readonly'),read=tx.objectStore(ROUTE_STORE).get('current'),state;
            read.onsuccess=function(){var raw=read.result||null;state={route:visibleJourney(raw),ownership:ownershipOf(raw)};};
            tx.oncomplete=function(){db.close();resolve(state);};
            tx.onerror=tx.onabort=function(){db.close();reject(tx.error||Error('Persistence read aborted'));};
        });});
    }
    function loadActiveRouteRecord(idb){return loadJourneyState(idb).then(function(state){return state.route;});}

    /**
     * @param {IDBFactory} idb
     * @returns {Promise<void>}
     */
    function clearActiveRouteRecord(idb, expectedOwnership) {
        var expected=ownershipOf(expectedOwnership);
        if(!expected)return Promise.resolve(false);
        return openRouteDB(idb).then(function(db){return new Promise(function(resolve,reject){
            var tx=db.transaction(ROUTE_STORE,'readwrite'),store=tx.objectStore(ROUTE_STORE),ok=true;
            var read=store.get('current');read.onsuccess=function(){if(!matchesOwnership(read.result,expected)){ok=false;return;}store.delete('current');};
            tx.oncomplete=function(){db.close();resolve(ok);};
            tx.onerror=tx.onabort=function(){db.close();reject(tx.error||Error('Persistence aborted'));};
        });});
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

    /**
     * Resolve which Cache Storage bucket to use for corridor tile precache.
     * @param {string[]} cacheNames
     * @param {Object} execute - from buildPrecacheRouteTilesExecutePlan
     * @returns {string}
     */
    function resolvePrecacheTileCacheName(cacheNames, execute) {
        execute = execute || {};
        var names = cacheNames || [];
        var match = names.find(function (n) {
            return n.indexOf(execute.tileCacheNamePrefix || 'voyagr-tiles-') === 0;
        });
        return match || execute.defaultTileCacheName || 'voyagr-tiles-v15';
    }

    /**
     * Slice tile URLs into fixed-size batches for parallel fetch.
     * @param {string[]} urls
     * @param {number} batchSize
     * @returns {string[][]}
     */
    function slicePrecacheUrlsIntoBatches(urls, batchSize) {
        var list = urls || [];
        var size = batchSize > 0 ? batchSize : TILE_PRECACHE_BATCH_SIZE;
        var batches = [];
        for (var i = 0; i < list.length; i += size) {
            batches.push(list.slice(i, i + size));
        }
        return batches;
    }

    /**
     * Whether a fetched tile should increment the new-cache counter.
     * @param {Object} [input]
     * @param {boolean} [input.hadExisting]
     * @param {boolean} [input.responseOk]
     * @returns {{ shouldStore: boolean, shouldIncrement: boolean }}
     */
    function buildPrecacheTileStoreOutcomePlan(input) {
        input = input || {};
        if (input.hadExisting) {
            return { shouldStore: false, shouldIncrement: false };
        }
        if (!input.responseOk) {
            return { shouldStore: false, shouldIncrement: false };
        }
        return { shouldStore: true, shouldIncrement: true };
    }

    /**
     * Mount execute plan for the resume-navigation banner.
     * @param {Object} preflight - from buildTryResumeNavigationPreflightPlan
     * @returns {Object}
     */
    function buildTryResumeNavigationMountExecutePlan(preflight) {
        preflight = preflight || {};
        return {
            shouldMount: !!preflight.shouldOffer,
            bannerId: preflight.bannerId,
            resumeYesId: preflight.resumeYesId,
            resumeNoId: preflight.resumeNoId,
            autoDismissMs: preflight.autoDismissMs,
            stepCount: preflight.stepCount,
            useResumeBannerStyle: true,
            useResumeBannerHtml: true,
            appendToBody: true,
        };
    }

    /**
     * Resume action when the user accepts the persisted-route offer.
     * @param {Object} [input]
     * @param {Object} [input.saved]
     * @param {Object} [input.preflight]
     * @param {boolean} [input.hasEncodableGeometry]
     * @returns {Object}
     */
    function buildTryResumeNavigationYesActionPlan(input) {
        input = input || {};
        var preflight = input.preflight || {};
        var saved = input.saved || {};
        var payload = input.payload;
        var resumeStepIndex = preflight.resumeStepIndex;
        var navStartOpts = {
            fromPersistedResume: true,
            resumeStepIndex: resumeStepIndex,
        };

        if (payload && payload.geometry) {
            return {
                action: 'fullBootstrap',
                payload: payload,
                navStartOpts: navStartOpts,
                resumeStepIndex: resumeStepIndex,
                logMessage: preflight.resumedFullLogMessage,
            };
        }

        if (Array.isArray(saved.polyline) && saved.polyline.length >= 2 && Array.isArray(saved.steps)) {
            var routeData = saved.routeData && typeof saved.routeData === 'object'
                ? Object.assign({}, saved.routeData)
                : {};
            routeData.maneuvers = saved.steps;
            return {
                action: 'polylineResume',
                payload: routeData,
                navStartOpts: Object.assign({}, navStartOpts, {
                    persistedPolyline: saved.polyline,
                }),
                resumeStepIndex: resumeStepIndex,
                logMessage: preflight.resumedLegacyLogMessage,
            };
        }

        return {
            action: 'unrecoverable',
            logMessage: '[OfflineNav] Could not resume — persisted route data incomplete',
            statusMessage: 'Could not resume saved navigation',
            statusType: 'error',
        };
    }

    /**
     * Dismiss action when the user declines resume or the banner auto-expires.
     * @returns {Object}
     */
    function buildTryResumeNavigationNoActionPlan() {
        return {
            action: 'dismiss',
            clearPersistedRoute: true,
        };
    }

    var OFFLINE_BANNER_BODY_CLASS = 'voyagr-has-offline-banner';
    var OFFLINE_BANNER_REMOVE_DELAY_MS = 350;

    /**
     * Execute plan for mounting the offline connectivity banner.
     * @returns {Object}
     */
    function buildMountOfflineBannerExecutePlan() {
        return {
            shouldMount: true,
            bannerId: OFFLINE_BANNER_ID,
            skipIfExists: true,
            prependToBody: true,
            bodyClass: OFFLINE_BANNER_BODY_CLASS,
            useOfflineBannerStyle: true,
            useOfflineBannerInnerHtml: true,
        };
    }

    /**
     * Execute plan for removing the offline connectivity banner.
     * @returns {Object}
     */
    function buildUnmountOfflineBannerExecutePlan() {
        return {
            shouldUnmount: true,
            bannerId: OFFLINE_BANNER_ID,
            hideTransform: 'translateY(-100%)',
            removeDelayMs: OFFLINE_BANNER_REMOVE_DELAY_MS,
            removeBodyClass: OFFLINE_BANNER_BODY_CLASS,
        };
    }

    /**
     * Plan for browser online/offline connectivity events.
     * @param {boolean} isOffline
     * @returns {Object}
     */
    function buildOfflineConnectivityEventPlan(isOffline) {
        if (isOffline) {
            return {
                action: 'offline',
                setOfflineFlag: true,
                mountBanner: true,
                logMessage: '[Offline] Network lost',
                statusMessage: '📡 Offline mode — using cached data',
                statusType: 'warning',
            };
        }
        return {
            action: 'online',
            setOfflineFlag: false,
            unmountBanner: true,
            logMessage: '[Offline] Network restored',
            statusMessage: '✅ Back online',
            statusType: 'success',
            recoverMap: true,
            recoverMapReason: 'window online',
        };
    }

    var api = {
        ABANDONMENT_PROTOCOL:2,
        DURABLE_OWNERSHIP_PROTOCOL:1,
        ownershipOf:ownershipOf,
        matchesOwnership:matchesOwnership,
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
        stageActiveRouteRecord: stageActiveRouteRecord,
        loadJourneyState:loadJourneyState,
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
        resolvePrecacheTileCacheName: resolvePrecacheTileCacheName,
        slicePrecacheUrlsIntoBatches: slicePrecacheUrlsIntoBatches,
        buildPrecacheTileStoreOutcomePlan: buildPrecacheTileStoreOutcomePlan,
        buildTryResumeNavigationMountExecutePlan: buildTryResumeNavigationMountExecutePlan,
        buildTryResumeNavigationYesActionPlan: buildTryResumeNavigationYesActionPlan,
        buildTryResumeNavigationNoActionPlan: buildTryResumeNavigationNoActionPlan,
        OFFLINE_BANNER_BODY_CLASS: OFFLINE_BANNER_BODY_CLASS,
        buildMountOfflineBannerExecutePlan: buildMountOfflineBannerExecutePlan,
        buildUnmountOfflineBannerExecutePlan: buildUnmountOfflineBannerExecutePlan,
        buildOfflineConnectivityEventPlan: buildOfflineConnectivityEventPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrOfflineNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Offline connectivity UI, route persistence, tile pre-cache, and resume navigation.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var voyagrIsOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
    var persistRouteTimer = null;
    var connectivityListenersBound = false;

    function rt() {
        if (!runtime) {
            throw new Error('[OfflineNavigation] Orchestration runtime not bound');
        }
        return runtime;
    }

    function OFF() { return rt().offlineNavigation(); }
    function SL() { return rt().speedLimitWidget(); }

    function buildRoutePayloadFromPersisted(saved) {
        return rt().routeSelection().buildRoutePayloadFromPersisted(
            saved,
            function (points, precision) {
                return rt().polylineCodec().encodePolyline(points, precision);
            }
        );
    }

    function createOfflineBanner() {
        const off = OFF();
        const execute = off.buildMountOfflineBannerExecutePlan();
        if (!execute.shouldMount) return;
        if (execute.skipIfExists && document.getElementById(execute.bannerId)) return;

        const banner = document.createElement('div');
        banner.id = execute.bannerId;
        if (execute.useOfflineBannerStyle) {
            banner.style.cssText = off.getOfflineBannerStyleCssText();
        }
        if (execute.useOfflineBannerInnerHtml) {
            banner.innerHTML = off.buildOfflineBannerInnerHtml();
        }
        if (execute.prependToBody) {
            document.body.prepend(banner);
        }
        if (execute.bodyClass) {
            document.body.classList.add(execute.bodyClass);
        }
    }

    function removeOfflineBanner() {
        const off = OFF();
        const execute = off.buildUnmountOfflineBannerExecutePlan();
        if (!execute.shouldUnmount) return;

        const banner = document.getElementById(execute.bannerId);
        if (banner) {
            banner.style.transform = execute.hideTransform;
            setTimeout(() => banner.remove(), execute.removeDelayMs);
        }
        if (execute.removeBodyClass) {
            document.body.classList.remove(execute.removeBodyClass);
        }
    }

    function handleOffline() {
        const event = OFF().buildOfflineConnectivityEventPlan(true);
        if (event.setOfflineFlag) voyagrIsOffline = true;
        console.log(event.logMessage);
        if (event.mountBanner) createOfflineBanner();
        if (event.statusMessage) rt().call.showStatus(event.statusMessage, event.statusType);
    }

    function handleOnline() {
        const event = OFF().buildOfflineConnectivityEventPlan(false);
        if (event.setOfflineFlag === false) voyagrIsOffline = false;
        console.log(event.logMessage);
        if (event.unmountBanner) removeOfflineBanner();
        if (event.statusMessage) rt().call.showStatus(event.statusMessage, event.statusType);
        if (event.recoverMap && typeof window.__voyagrMapRecoverAfterNetworkEvent === 'function') {
            window.__voyagrMapRecoverAfterNetworkEvent(event.recoverMapReason);
        }
    }

    function initConnectivityListeners() {
        if (connectivityListenersBound || typeof window === 'undefined') return;
        connectivityListenersBound = true;
        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            window.addEventListener('load', handleOffline);
        }
    }

    function getIsOffline() {
        return voyagrIsOffline;
    }

    async function cacheSpeedLimit(lat, lon, speedLimit, source) {
        const sl = SL();
        const off = OFF();
        if (!sl || !off) return;
        try {
            const key = sl.speedLimitCacheKey(lat, lon);
            await off.putSpeedLimitCacheEntry(indexedDB, key, speedLimit, source);
        } catch (e) { /* ignore */ }
    }

    async function getCachedSpeedLimit(lat, lon) {
        const sl = SL();
        const off = OFF();
        if (!sl || !off) return null;
        try {
            const key = sl.speedLimitCacheKey(lat, lon);
            return await off.getSpeedLimitCacheEntry(indexedDB, key);
        } catch (e) {
            return null;
        }
    }

    // Local ownership comes only from an observed commit/load in this session.
    // An abandonment captures this value; it never reads whichever newer owner
    // happens to be in IndexedDB when a delayed callback resumes.
    var committedOwnership=null;
    function getJourneyOwnership(){const off=OFF();return off&&off.DURABLE_OWNERSHIP_PROTOCOL===1?off.ownershipOf(committedOwnership):null;}
    function sameOwner(a,b){return a===null?b===null:OFF().matchesOwnership(a,b);}
    function adoptOwnership(expected,next){
        if(!sameOwner(committedOwnership,expected))return false;
        committedOwnership=OFF().ownershipOf(next);return true;
    }
    function ownedHandle(handle,expected,options){
        if(!handle||handle.ownershipMismatch)return handle;
        var registered=expected;
        function adopt(next){if(adoptOwnership(registered,next))registered=OFF().ownershipOf(next);}
        if(options.abandon)adopt(handle.previousOwnership());
        function action(name){return async function(guard){
            const ok=await handle[name](guard);
            if(ok===true){
                if(name==='rollback')adopt(handle.previousOwnership());
                else if(name==='finalize'||name==='commit'&&!options.planning&&!options.abandon)adopt(handle.committedOwnership());
            }
            return ok;
        };}
        return Object.assign({},handle,{commit:action('commit'),finalize:action('finalize'),rollback:action('rollback')});
    }
    async function persistActiveRoute(pendingCandidate) {
        const off=OFF(),route=pendingCandidate||rt().getLastCalculatedRoute(),polyline=pendingCandidate?pendingCandidate.polyline:rt().getRoutePolyline();
        if(!off||off.DURABLE_OWNERSHIP_PROTOCOL!==1||(!pendingCandidate&&!rt().getRouteInProgress())||!route||!polyline)return false;
        try{
            const owner=root.VoyagrJourneyModes,token=owner&&owner.captureIntent?owner.captureIntent():null,expected=getJourneyOwnership();
            const current=()=>!owner||root.VoyagrJourneyModes===owner&&!!(owner.intentCurrent&&owner.intentCurrent(token));
            const record=off.buildActiveRoutePersistRecord({ownership:pendingCandidate?null:expected,polyline,steps:pendingCandidate?pendingCandidate.maneuvers:rt().getCurrentRouteSteps(),stepIndex:pendingCandidate?0:rt().getCurrentStepIndex(),
                progressHint:!pendingCandidate&&root.VoyagrGpsOrchestration&&root.VoyagrGpsOrchestration.getNavigationPositionEvidence?root.VoyagrGpsOrchestration.getNavigationPositionEvidence():null,
                destination:route.destination||null,routeData:route,continuation:!pendingCandidate&&owner&&owner.getContinuation?owner.getContinuation(route):null});
            const saved=await off.persistActiveRouteRecord(indexedDB,record,current,owner&&owner.onIntentCancelled?callback=>owner.onIntentCancelled(token,callback):null,expected);
            return saved!==false&&current()&&adoptOwnership(expected,record);
        }catch(e){console.warn('[OfflineNav] Failed to persist route:',e);return false;}
    }
    async function stageActiveRoute(candidate,options){
        const off=OFF();if(!off||off.DURABLE_OWNERSHIP_PROTOCOL!==1||!candidate||!candidate.polyline)return null;
        const expected=getJourneyOwnership();options=Object.assign({},options,{expectedOwnership:expected});
        const handle=await off.stageActiveRouteRecord(indexedDB,off.buildActiveRoutePersistRecord({polyline:candidate.polyline,steps:candidate.maneuvers,stepIndex:0,destination:candidate.destination,routeData:candidate}),options);
        return ownedHandle(handle,expected,options);
    }
    async function persistJourneySnapshot(route,continuation,guard){
        const off=OFF(),integrity=root.VoyagrAvoidanceIntegrity,points=integrity&&integrity.geometryPoints(route);
        if(!off||off.DURABLE_OWNERSHIP_PROTOCOL!==1||!points)return false;
        const expected=getJourneyOwnership();
        if(expected&&(!continuation||continuation.journey_id!==expected.journey_id)&&route.durable_journey_id!==expected.journey_id)return false;
        const record=off.buildActiveRoutePersistRecord({ownership:expected,polyline:points,steps:route.maneuvers,stepIndex:0,destination:route.destination,routeData:route,continuation:continuation});
        const saved=await off.persistActiveRouteRecord(indexedDB,record,guard,null,expected);return saved!==false&&adoptOwnership(expected,record);
    }
    async function stageAbandonJourney(route,continuation,guard,expectedOwnership){
        const off=OFF(),integrity=root.VoyagrAvoidanceIntegrity,points=integrity&&integrity.geometryPoints(route);
        const expected=off&&off.ownershipOf(expectedOwnership);
        if(!off||off.DURABLE_OWNERSHIP_PROTOCOL!==1||off.ABANDONMENT_PROTOCOL!==2||!expected||!points)return null;
        const options={abandon:true,guard:guard,expectedOwnership:expected};
        const handle=await off.stageActiveRouteRecord(indexedDB,off.buildActiveRoutePersistRecord({ownership:expected,polyline:points,steps:route.maneuvers,stepIndex:0,destination:route.destination,routeData:route,continuation:continuation}),options);
        return ownedHandle(handle,expected,options);
    }
    async function clearJourneyPersistence(){return OFF().clearActiveRouteRecord(indexedDB,getJourneyOwnership());}

    async function loadPersistedRoute() {
        const off = OFF();
        if (!off) return null;
        try {
            const state=off.DURABLE_OWNERSHIP_PROTOCOL===1?await off.loadJourneyState(indexedDB):{route:await off.loadActiveRouteRecord(indexedDB),ownership:null};
            const result=state.route;
            const observed=state.ownership&&(!result||result.journey_id===state.ownership.journey_id)?state.ownership:null;
            if(committedOwnership===null&&(!rt().getRouteInProgress||rt().getRouteInProgress()===false))committedOwnership=off.ownershipOf?off.ownershipOf(observed):null;
            if (!result) return null;
            if (off.isPersistedRouteExpired(result.savedAt)) {
                if(observed&&await off.clearActiveRouteRecord(indexedDB,observed)===true)adoptOwnership(observed,null);
                return null;
            }
            return result;
        } catch (e) {
            console.warn('[OfflineNav] Failed to load persisted route:', e);
            return null;
        }
    }

    async function clearPersistedRoute() {
        const off = OFF();
        if (!off) return;
        try {
            const expected=getJourneyOwnership();
            if(await off.clearActiveRouteRecord(indexedDB,expected)===true)adoptOwnership(expected,null);
        } catch (e) {
            console.warn('[OfflineNav] Failed to clear persisted route:', e);
        }
    }

    function schedulePersistRoute() {
        if (persistRouteTimer) return;
        persistRouteTimer = setTimeout(() => {
            persistRouteTimer = null;
            void persistActiveRoute();
        }, 5000);
    }

    function collectVectorTileTemplatesFromMap() {
        const off = OFF();
        const map = rt().getMap();
        const preflight = off.buildCollectVectorTileTemplatesPreflightPlan({
            hasOfflineModule: !!off,
            hasMap: typeof map !== 'undefined' && map !== null,
            styleLoaded: typeof map !== 'undefined' && map !== null && typeof map.isStyleLoaded === 'function'
                ? map.isStyleLoaded()
                : true,
        });
        if (!preflight.canCollect) return [];
        try {
            return off.parseVectorTileSourcesFromStyle(map.getStyle());
        } catch (e) {
            console.warn(preflight.errorLogPrefix, e);
            return [];
        }
    }

    async function precacheRouteTiles(polyline) {
        const off = OFF();
        if (!off || !polyline || polyline.length < 2) return;
        if (!('caches' in window)) return;

        const templates = collectVectorTileTemplatesFromMap();
        const urlPlan = templates.length > 0
            ? off.buildRouteCorridorTileUrlPlan(polyline, templates, {
                origin: window.location.origin,
                maxUrls: off.TILE_PRECACHE_MAX_URLS,
                zoomLevels: off.TILE_PRECACHE_ZOOM_LEVELS,
            })
            : { urls: [], originalCount: 0, capped: false };

        const execute = off.buildPrecacheRouteTilesExecutePlan({
            polylineLength: polyline.length,
            hasCaches: true,
            urls: urlPlan.urls,
            capped: urlPlan.capped,
            originalCount: urlPlan.originalCount,
            templateCount: templates.length,
        });

        if (!execute.hasTemplates) {
            console.log(execute.skipNoTemplatesLog);
            return;
        }
        if (!execute.shouldPrecache) return;

        if (execute.capped) {
            console.log(`${execute.cappedLogPrefix} ${execute.originalCount} → ${execute.urlCount} URLs`);
        }

        console.log(`${execute.startLogPrefix} ${execute.urlCount} tiles (${execute.templateCount} source template(s)) along route corridor`);

        try {
            const cacheNames = await caches.keys();
            const tileCacheName = off.resolvePrecacheTileCacheName(cacheNames, execute);
            const cache = await caches.open(tileCacheName);
            let cached = 0;
            const batches = off.slicePrecacheUrlsIntoBatches(execute.urls, execute.batchSize);
            for (const batch of batches) {
                await Promise.allSettled(
                    batch.map(async (url) => {
                        const existing = await cache.match(url);
                        if (existing) return;
                        try {
                            const resp = await fetch(url);
                            const outcome = off.buildPrecacheTileStoreOutcomePlan({
                                hadExisting: false,
                                responseOk: resp.ok,
                            });
                            if (outcome.shouldStore) {
                                await cache.put(url, resp);
                                if (outcome.shouldIncrement) cached++;
                            }
                        } catch (_e) { /* tile missing or offline */ }
                    })
                );
            }
            console.log(`${execute.completeLogPrefix} ${cached} new tiles`);
        } catch (e) {
            console.warn(execute.errorLogPrefix, e);
        }
    }

    async function tryResumeNavigation() {
        const off = OFF();
        try {
            const saved = await loadPersistedRoute();
            const preflight = off.buildTryResumeNavigationPreflightPlan(saved);
            if (!preflight.shouldOffer) return;

            console.log(preflight.foundLogMessage);

            const mount = off.buildTryResumeNavigationMountExecutePlan(preflight);
            const resumeBanner = document.createElement('div');
            resumeBanner.id = mount.bannerId;
            resumeBanner.style.cssText = off.getResumeNavigationBannerStyleCssText();
            resumeBanner.innerHTML = off.buildResumeNavigationBannerHtml(mount.stepCount);
            document.body.appendChild(resumeBanner);

            document.getElementById(mount.resumeYesId).onclick = () => {
                resumeBanner.remove();
                let payload;
                try { payload = buildRoutePayloadFromPersisted(saved); }
                catch (_) {
                    rt().call.showStatus('Saved journey verification unavailable; navigation not started. Reload online and recalculate.','warning');
                    return;
                }
                if (!payload) {rt().call.showStatus('Saved route geometry is inconsistent; calculate a new route.','warning');return;}
                rt().call.showStatus('Saved journey is preview only; recalculate before navigation.','warning');
                const yesAction = off.buildTryResumeNavigationYesActionPlan({
                    saved,
                    preflight,
                    payload,
                });
                if (yesAction.action === 'fullBootstrap' || yesAction.action === 'polylineResume') {
                    const started = rt().call.startTurnByTurnNavigation(yesAction.payload, yesAction.navStartOpts);
                    if (started===false && typeof rt().call.showRestoredRoutePreview==='function') {
                        rt().call.showRestoredRoutePreview(payload);
                    }
                } else {
                    rt().call.showStatus(yesAction.statusMessage, yesAction.statusType);
                    console.warn(yesAction.logMessage);
                }
            };
            document.getElementById(mount.resumeNoId).onclick = () => {
                resumeBanner.remove();
                const noAction = off.buildTryResumeNavigationNoActionPlan();
                if (noAction.clearPersistedRoute) clearPersistedRoute();
            };

            setTimeout(() => {
                if (document.getElementById(mount.bannerId)) resumeBanner.remove();
            }, mount.autoDismissMs);
        } catch (e) {
            console.warn('[OfflineNav] Resume check failed:', e);
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        initConnectivityListeners();
    }

    var api = {
        bind: bind,
        getIsOffline: getIsOffline,
        cacheSpeedLimit: cacheSpeedLimit,
        getCachedSpeedLimit: getCachedSpeedLimit,
        persistActiveRoute: persistActiveRoute,
        stageActiveRoute: stageActiveRoute,
        DURABLE_OWNERSHIP_PROTOCOL:1,ownershipReady:function(){return !!runtime;},getJourneyOwnership:getJourneyOwnership,stageAbandonJourney:stageAbandonJourney,persistJourneySnapshot:persistJourneySnapshot,clearJourneyPersistence:clearJourneyPersistence,
        loadPersistedRoute: loadPersistedRoute,
        clearPersistedRoute: clearPersistedRoute,
        schedulePersistRoute: schedulePersistRoute,
        precacheRouteTiles: precacheRouteTiles,
        tryResumeNavigation: tryResumeNavigation,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrOfflineNavigationOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

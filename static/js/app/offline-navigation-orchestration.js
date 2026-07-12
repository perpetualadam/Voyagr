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

    async function persistActiveRoute() {
        const off = OFF();
        if (!off || !rt().getRouteInProgress() || !rt().getRoutePolyline()) return;
        try {
            await off.persistActiveRouteRecord(indexedDB, off.buildActiveRoutePersistRecord({
                polyline: rt().getRoutePolyline(),
                steps: rt().getCurrentRouteSteps(),
                stepIndex: rt().getCurrentStepIndex(),
                destination: rt().getLastCalculatedRoute()?.destination || null,
                routeData: rt().getLastCalculatedRoute() || null,
            }));
        } catch (e) {
            console.warn('[OfflineNav] Failed to persist route:', e);
        }
    }

    async function loadPersistedRoute() {
        const off = OFF();
        if (!off) return null;
        try {
            const result = await off.loadActiveRouteRecord(indexedDB);
            if (!result) return null;
            if (off.isPersistedRouteExpired(result.savedAt)) {
                await clearPersistedRoute();
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
            await off.clearActiveRouteRecord(indexedDB);
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
                const payload = rt().call.buildRoutePayloadFromPersisted(saved);
                const yesAction = off.buildTryResumeNavigationYesActionPlan({
                    saved,
                    preflight,
                    payload,
                });
                if (yesAction.action === 'fullBootstrap' || yesAction.action === 'polylineResume') {
                    rt().call.startTurnByTurnNavigation(yesAction.payload, yesAction.navStartOpts);
                    console.log(yesAction.logMessage);
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

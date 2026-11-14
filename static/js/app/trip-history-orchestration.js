/**
 * @file Trip history list, persistence, and recalculate/delete orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var allTrips = [];

    var VOYAGR_LOCAL_TRIPS_KEY = 'voyagrLocalTrips';
    var MAX_LOCAL_TRIPS = 50;

    function rt() {
        if (!runtime) {
            throw new Error('[TripHistory] Orchestration runtime not bound');
        }
        return runtime;
    }

    function TH() {
        return rt().tripHistory();
    }

    function loadRawLocalTrips() {
        try {
            const raw = localStorage.getItem(VOYAGR_LOCAL_TRIPS_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveRawLocalTrips(entries) {
        return false; // Legacy storage is recovery input, not a write target.
    }

    function buildCompletedTripRecord(route) {
        const startEl = document.getElementById('start');
        const endEl = document.getElementById('end');
        return TH().buildCompletedTripRecord({
            route,
            startEl: startEl ? {
                value: startEl.value,
                lat: startEl.dataset.lat,
                lon: startEl.dataset.lon,
            } : null,
            endEl: endEl ? {
                value: endEl.value,
                lat: endEl.dataset.lat,
                lon: endEl.dataset.lon,
            } : null,
            routePolyline: rt().getRoutePolyline(),
            routingMode: rt().getCurrentRoutingMode(),
        });
    }

    function updateLocalTripServerId(localId, serverTripId) {
        const raw = loadRawLocalTrips();
        const idx = raw.findIndex((e) => e.localId === localId);
        if (idx >= 0) {
            raw[idx].serverId = serverTripId;
            saveRawLocalTrips(raw);
        }
    }

    async function persistCompletedTrip(route) {
        const local=root.VoyagrLocalData;if(!local)return;
        const c=local.capture(),base=buildCompletedTripRecord(route);if(!base)return;
        try{if(!await local.historyEnabled(c))return;
            const entry={localId:Date.now()*1000+Math.floor(Math.random()*1000),serverId:null,...base};
            await local.record('history',rows=>[entry,...(rows||[])].slice(0,50),c);
        }catch(_){local.report();}
    }

    function removeLocalTripByLocalId(localId) {
        const raw = loadRawLocalTrips().filter((e) => e.localId !== localId);
        saveRawLocalTrips(raw);
    }

    function removeLocalTripByServerId(serverId) {
        const raw = loadRawLocalTrips().filter((e) => e.serverId !== serverId);
        saveRawLocalTrips(raw);
    }

    async function loadTripHistory() {
        const local=root.VoyagrLocalData;if(!local)return;
        const c=local.capture();allTrips=[];displayTripHistory([]);
        try{const rows=await local.read('history',c)||[];if(!local.current(c))return;allTrips=TH().mergeServerAndLocalTrips([],rows.map(x=>({...x,serverId:null})));displayTripHistory(allTrips);}catch(_){local.report();}
    }

    function applyTripHistoryAuthBannerFromPlan(auth, orch) {
        const list = document.getElementById(orch.listContainerId);
        const mount = TH().buildLoadTripHistoryAuthBannerMountExecutePlan(auth, {
            listHasChildren: !!(list && list.firstChild),
        });
        if (!mount.shouldMount || !list) return;
        const banner = document.createElement('div');
        banner.style.cssText = mount.bannerStyle;
        banner.textContent = mount.bannerText;
        list.insertBefore(banner, list.firstChild);
    }

    function applyTripHistoryErrorListFromPlan(dom) {
        if (!dom || !dom.shouldApply) return;
        const list = document.getElementById(dom.listContainerId);
        if (list) list.innerHTML = dom.listInnerHtml;
    }

    function collectDisplayTripHistoryFmt() {
        return {
            escapeHtml: rt().html().escapeHtml,
            convertDistance: rt().call.convertDistance,
            distUnit: rt().call.getDistanceUnit(),
            currencySymbol: rt().call.getCurrencySymbol(),
        };
    }

    function applyDisplayTripHistoryFromPlan(execute) {
        if (!execute || !execute.shouldRender) return;

        const listContainer = document.getElementById('tripHistoryList');
        if (!listContainer) return;

        if (execute.listInnerHtml) {
            listContainer.innerHTML = execute.listInnerHtml;
        } else if (execute.rows) {
            listContainer.innerHTML = execute.rows.map((row) =>
                TH().buildTripHistoryRowHtml(row.trip, row.display)
            ).join('');
        }

        if (execute.bindSearch) bindTripHistorySearch();
    }

    function applyLoadTripHistoryAuthOutcomeFromPlan(orch) {
        allTrips = TH().mergeServerAndLocalTrips([], loadRawLocalTrips());
        displayTripHistory(allTrips);
        const auth = TH().buildLoadTripHistoryAuthExecutePlan(allTrips);
        applyTripHistoryAuthBannerFromPlan(auth, orch);
        if (auth.bindSearch) bindTripHistorySearch();
    }

    function applyLoadTripHistorySuccessOutcomeFromPlan(serverTrips) {
        allTrips = TH().mergeServerAndLocalTrips(serverTrips || [], loadRawLocalTrips());
        displayTripHistory(allTrips);
    }

    function applyLoadTripHistoryErrorOutcomeFromPlan(errorEntry) {
        if (!errorEntry || !errorEntry.dom) return;
        const dom = errorEntry.dom;
        if (dom.clearAllTrips) allTrips = [];
        applyTripHistoryErrorListFromPlan(dom);
        if (dom.bindSearch) bindTripHistorySearch();
    }

    function applyLoadTripHistoryFetchErrorFromPlan(errorExecute, error) {
        if (errorExecute && errorExecute.errorLogPrefix) {
            console.error(errorExecute.errorLogPrefix, error);
        }
        applyLoadTripHistoryErrorOutcomeFromPlan(errorExecute && errorExecute.errorEntry);
    }

    function bindTripHistorySearch() {
        const execute = TH().buildBindTripHistorySearchExecutePlan();
        if (!execute.shouldBind) return;

        const input = document.getElementById(execute.searchInputId);
        if (!input) return;

        input.oninput = (e) => {
            const filter = TH().buildTripHistorySearchFilterPlan(e.target.value);
            if (filter.showAll) {
                displayTripHistory(allTrips);
                return;
            }
            displayTripHistory(TH().filterTripsBySearch(allTrips, filter.searchTerm));
        };
    }

    function displayTripHistory(trips) {
        applyDisplayTripHistoryFromPlan(
            TH().buildDisplayTripHistoryEntryOrchestrationPlan(
                trips,
                collectDisplayTripHistoryFmt()
            ).execute
        );
    }

    function applyRecalculateTripDomFromPlan(dom) {
        if (!dom || !dom.shouldApply) return;
        (dom.inputPatches || []).forEach(({ id, property, value }) => {
            const el = document.getElementById(id);
            if (el) {
                if(id==='start'||id==='end'){if(root.VoyagrLocationOrchestration)root.VoyagrLocationOrchestration.invalidateEndpointRequests(id);delete el.dataset.lat;delete el.dataset.lon;delete el.dataset.displayName;delete el.dataset.journeyOriginalSource;el.dataset.journeySource='saved';}
                el[property] = value;
            }
        });
        if (dom.switchTab) rt().call.switchTab(dom.switchTab);
        if (dom.scheduleCalculateRoute) {
            setTimeout(() => rt().call.calculateRoute(), dom.calculateDelayMs);
        }
        rt().call.showStatus(dom.statusMessage, dom.statusType);
    }

    function applyDeleteTripHistoryOutcomeFromPlan(dom, nextTrips) {
        if (!dom || !dom.shouldApply) return;
        if (dom.refreshTripList && nextTrips) {
            allTrips = nextTrips;
            displayTripHistory(allTrips);
        }
        rt().call.showStatus(dom.statusMessage, dom.statusType);
    }

    async function recalculateTrip(tripId) {
        applyRecalculateTripDomFromPlan(
            TH().buildRecalculateTripEntryOrchestrationPlan(tripId, allTrips).apply
        );
    }

    function applyDeleteTripHistoryFetchErrorFromPlan(errorExecute, error) {
        if (errorExecute && errorExecute.errorLogPrefix) {
            console.error(errorExecute.errorLogPrefix, error);
        }
        if (errorExecute && errorExecute.statusMessage) {
            rt().call.showStatus(errorExecute.statusMessage, errorExecute.statusType);
        }
    }

    async function deleteTripHistory(tripId) {
        const local=root.VoyagrLocalData;if(!local)return;const c=local.capture();
        if(!confirm('Delete this journey from this device profile?'))return;
        try{await local.update('history',rows=>(rows||[]).filter(x=>-x.localId!==tripId),c);if(local.current(c))await loadTripHistory();}catch(_){local.report();}
    }

    function collectAnalyticsDisplayFmt(data) {
        return {
            currencySymbol: rt().call.getCurrencySymbol(),
            totalDistanceText: rt().call.convertDistance(data.total_distance_km || 0),
            speedUnit: rt().getSpeedUnit(),
            speedUnitLabel: rt().call.getSpeedUnitLabel(),
            distUnit: rt().call.getDistanceUnit(),
            escapeHtml: rt().call.escapeHtml,
            convertDistance: rt().call.convertDistance,
        };
    }

    function applyAnalyticsDisplayFromPlan(execute) {
        if (!execute || !execute.shouldRender) return;

        Object.entries(execute.elementPatches).forEach(([id, text]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });

        const meta = execute.unitMetadata || {};
        const totalDistance = document.getElementById('totalDistance'), avgSpeed = document.getElementById('avgSpeed');
        if (totalDistance) {
            delete totalDistance.dataset.distanceMeters;
            if (typeof meta.distanceKm === 'number' && Number.isFinite(meta.distanceKm) && meta.distanceKm >= 0) {
                totalDistance.dataset.distanceMeters = String(meta.distanceKm * 1000);
                totalDistance.dataset.distanceStyle = 'route';
            }
        }
        if (avgSpeed) {
            delete avgSpeed.dataset.speedKmh;
            if (typeof meta.averageSpeedKmh === 'number' && Number.isFinite(meta.averageSpeedKmh) && meta.averageSpeedKmh >= 0)
                avgSpeed.dataset.speedKmh = String(meta.averageSpeedKmh);
        }

        const frequentRoutesList = document.getElementById(execute.frequentRoutesListId);
        if (frequentRoutesList) frequentRoutesList.innerHTML = execute.frequentRoutesHtml;
    }

    function applyLoadRouteAnalyticsResponseFromPlan(execute) {
        if (!execute || !execute.shouldDisplay) {
            if (execute && execute.statusMessage) rt().call.showStatus(execute.statusMessage, execute.statusType);
            return;
        }
        displayAnalytics(execute.data);
    }

    function applyLoadRouteAnalyticsFetchErrorFromPlan(errorExecute, error) {
        if (errorExecute && errorExecute.errorLogPrefix) {
            console.error(errorExecute.errorLogPrefix, error);
        }
        if (errorExecute && errorExecute.statusMessage) {
            rt().call.showStatus(errorExecute.statusMessage, errorExecute.statusType);
        }
    }

    async function loadRouteAnalytics() {
        const local=root.VoyagrLocalData;if(!local)return;const c=local.capture();
        try{const rows=await local.read('history',c)||[];if(!local.current(c))return;
            const sum=key=>rows.reduce((n,r)=>n+(Number.isFinite(+r[key])?+r[key]:0),0),count=rows.length;
            const distance=sum('distance_km'),minutes=sum('duration_minutes'),fuel=sum('fuel_cost'),tolls=sum('toll_cost'),caz=sum('caz_cost');
            const groups=new Map();for(const row of rows){const key=JSON.stringify([row.start_address,row.end_address]);let g=groups.get(key);if(!g){g={start:row.start_address,end:row.end_address,count:0,duration:0,cost:0};groups.set(key,g);}g.count++;g.duration+=+row.duration_minutes||0;g.cost+=(+row.fuel_cost||0)+(+row.toll_cost||0)+(+row.caz_cost||0);}
            displayAnalytics({total_trips:count,total_distance_km:distance,total_time_minutes:minutes,avg_duration:count?minutes/count:0,total_cost:fuel+tolls+caz,total_fuel_cost:fuel,total_toll_cost:tolls,total_caz_cost:caz,avg_speed:minutes?distance/(minutes/60):0,frequent_routes:[...groups.values()].sort((a,b)=>b.count-a.count).slice(0,5).map(g=>({...g,avg_duration:g.duration/g.count,avg_cost:g.cost/g.count}))});
        }catch(_){local.report();}
    }

    function displayAnalytics(data) {
        applyAnalyticsDisplayFromPlan(
            TH().buildAnalyticsDisplayEntryOrchestrationPlan(
                data,
                collectAnalyticsDisplayFmt(data)
            ).execute
        );
    }

    if(typeof window!=='undefined'){window.addEventListener('voyagr-local-owner-change',()=>{allTrips=[];const el=document.getElementById('tripHistoryList');if(el)el.textContent='';const frequent=document.getElementById('frequentRoutesList');if(frequent)frequent.textContent='';for(const metric of document.querySelectorAll('#routeAnalyticsTab dd')){metric.textContent='—';for(const attribute of [...metric.attributes])if(attribute.name.startsWith('data-'))metric.removeAttribute(attribute.name);}});window.addEventListener('voyagr-local-data-changed',()=>{if(runtime)void loadTripHistory();});}
    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        ENDPOINT_INTENT_PROTOCOL:1,
        endpointIntentReady:function(){return !!runtime;},
        bind: bind,
        loadTripHistory: loadTripHistory,
        persistCompletedTrip: persistCompletedTrip,
        displayTripHistory: displayTripHistory,
        recalculateTrip: recalculateTrip,
        deleteTripHistory: deleteTripHistory,
        loadRouteAnalytics: loadRouteAnalytics,
        displayAnalytics: displayAnalytics,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTripHistoryOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

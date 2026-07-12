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
        try {
            localStorage.setItem(VOYAGR_LOCAL_TRIPS_KEY, JSON.stringify(entries));
        } catch (e) {
            console.warn('[TripHistory] localStorage save failed:', e);
        }
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
        const base = buildCompletedTripRecord(route);
        if (!base) {
            console.warn('[TripHistory] Could not build trip record — not saved');
            return;
        }

        const localId = Date.now();
        const entry = {
            localId,
            serverId: null,
            ...base
        };
        const raw = loadRawLocalTrips();
        raw.unshift(entry);
        saveRawLocalTrips(raw.slice(0, MAX_LOCAL_TRIPS));

        const token = await rt().call.getSupabaseAccessToken();
        if (!token) {
            console.log('[TripHistory] Saved on device only (not signed in)');
            return;
        }

        try {
            const { res, data } = await rt().call.fetchJsonWithAuth('/api/trip-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_lat: base.start_lat,
                    start_lon: base.start_lon,
                    end_lat: base.end_lat,
                    end_lon: base.end_lon,
                    start_address: base.start_address,
                    end_address: base.end_address,
                    distance_km: base.distance_km,
                    duration_minutes: base.duration_minutes,
                    fuel_cost: base.fuel_cost,
                    toll_cost: base.toll_cost,
                    caz_cost: base.caz_cost,
                    routing_mode: base.routing_mode
                })
            });
            if (res.ok && data && data.success && data.trip_id) {
                updateLocalTripServerId(localId, data.trip_id);
                console.log('[TripHistory] Synced to account, trip_id:', data.trip_id);
            }
        } catch (e) {
            console.warn('[TripHistory] Server save failed (trip remains on device):', e);
        }
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
        const entry = TH().buildLoadTripHistoryEntryOrchestrationPlan();
        const orch = entry.orch;
        try {
            const { res, data } = await rt().call.fetchJsonWithAuth(orch.apiPath);
            const response = TH().buildLoadTripHistoryResponseExecutePlan(res, data);

            if (response.action === 'auth') {
                applyLoadTripHistoryAuthOutcomeFromPlan(orch);
                return;
            }

            applyLoadTripHistorySuccessOutcomeFromPlan(response.serverTrips);
        } catch (error) {
            applyLoadTripHistoryFetchErrorFromPlan(
                TH().buildLoadTripHistoryFetchErrorExecutePlan(orch),
                error
            );
        }
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
            if (el) el[property] = value;
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
        const entry = TH().buildDeleteTripHistoryEntryOrchestrationPlan(tripId);
        const orch = entry.orch;
        if (!confirm(orch.confirmMessage)) return;

        const localEntry = TH().buildDeleteTripHistoryLocalEntryOrchestrationPlan(orch, allTrips);
        if (localEntry.localExecute.shouldDeleteLocal) {
            removeLocalTripByLocalId(localEntry.localExecute.localId);
            applyDeleteTripHistoryOutcomeFromPlan(localEntry.apply, localEntry.nextTrips);
            return;
        }

        try {
            const token = await rt().call.getSupabaseAccessToken();
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const response = await fetch(orch.apiPath, {
                method: 'DELETE',
                headers,
            });
            const data = await response.json();
            const serverEntry = TH().buildDeleteTripHistoryServerResponseEntryOrchestrationPlan(
                data,
                tripId,
                allTrips
            );

            if (serverEntry.execute.shouldRemove) {
                removeLocalTripByServerId(tripId);
            }
            applyDeleteTripHistoryOutcomeFromPlan(serverEntry.apply, serverEntry.nextTrips);
        } catch (error) {
            applyDeleteTripHistoryFetchErrorFromPlan(
                TH().buildDeleteTripHistoryFetchErrorExecutePlan(),
                error
            );
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        loadTripHistory: loadTripHistory,
        persistCompletedTrip: persistCompletedTrip,
        displayTripHistory: displayTripHistory,
        recalculateTrip: recalculateTrip,
        deleteTripHistory: deleteTripHistory,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTripHistoryOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

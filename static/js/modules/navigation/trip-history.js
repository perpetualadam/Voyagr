/**
 * @file Pure trip-history data helpers — coordinate parsing and server/local merge.
 * @module modules/navigation/trip-history
 *
 * Extracted from voyagr-app.js. These are side-effect free (no DOM, no
 * localStorage, no globals): the monolith keeps the storage/DOM wrappers and
 * delegates the pure logic here.
 */
(function (root) {
    'use strict';

    /**
     * Parse a "lat,lon" string into { lat, lon }.
     * @param {string} str
     * @returns {{lat:number, lon:number}|null} null when malformed / non-finite.
     */
    function parseLatLonString(str) {
        if (!str || typeof str !== 'string') return null;
        const p = str.split(',');
        if (p.length < 2) return null;
        const lat = parseFloat(p[0].trim());
        const lon = parseFloat(p[1].trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return { lat, lon };
    }

    /**
     * Merge server-side trips with device-local trips into one de-duplicated,
     * newest-first list.
     *
     * - Local rows already synced to the server (matching serverId) are dropped.
     * - Unsynced local rows get a negative synthetic id and `_localOnly: true`.
     * - Synced local rows carry their server id and `_localOnly: false`.
     * - Result is sorted by timestamp descending.
     *
     * @param {Array<object>} serverTrips - rows from /api/trip-history (each with `id`).
     * @param {Array<object>} rawLocal - device-local trip entries (localId/serverId + fields).
     * @returns {Array<object>}
     */
    function mergeServerAndLocalTrips(serverTrips, rawLocal) {
        const out = Array.isArray(serverTrips) ? serverTrips.slice() : [];
        const serverIds = new Set(out.map((t) => t.id));

        (rawLocal || []).forEach((e) => {
            const row = {
                start_lat: e.start_lat,
                start_lon: e.start_lon,
                end_lat: e.end_lat,
                end_lon: e.end_lon,
                start_address: e.start_address,
                end_address: e.end_address,
                distance_km: e.distance_km,
                duration_minutes: e.duration_minutes,
                fuel_cost: e.fuel_cost,
                toll_cost: e.toll_cost,
                caz_cost: e.caz_cost,
                routing_mode: e.routing_mode,
                timestamp: e.timestamp
            };
            if (e.serverId != null) {
                if (serverIds.has(e.serverId)) return;
                out.push({ ...row, id: e.serverId, _localOnly: false });
                serverIds.add(e.serverId);
            } else {
                out.push({ ...row, id: -e.localId, _localOnly: true });
            }
        });

        out.sort((a, b) => {
            const ta = new Date(a.timestamp).getTime();
            const tb = new Date(b.timestamp).getTime();
            return tb - ta;
        });
        return out;
    }

    /**
     * Build a completed-trip payload from route + form/polyline inputs (pure).
     * @param {object} params
     * @param {object|null} params.route
     * @param {{value?:string, lat?:string, lon?:string}|null} [params.startEl]
     * @param {{value?:string, lat?:string, lon?:string}|null} [params.endEl]
     * @param {Array<[number,number]>|null} [params.routePolyline]
     * @param {string} [params.routingMode]
     * @returns {object|null}
     */
    function buildCompletedTripRecord(params) {
        var route = params && params.route;
        if (!route) return null;

        var startEl = params.startEl;
        var endEl = params.endEl;
        var routePolyline = params.routePolyline;
        var routingMode = params.routingMode || 'auto';

        var start_lat;
        var start_lon;
        var end_lat;
        var end_lon;
        var start_address = (startEl && startEl.value) ? String(startEl.value).trim() : '';
        var end_address = (endEl && endEl.value) ? String(endEl.value).trim() : (route.destinationName || '');

        if (startEl && startEl.lat && startEl.lon) {
            start_lat = parseFloat(startEl.lat);
            start_lon = parseFloat(startEl.lon);
        } else if (route.start) {
            var ps = parseLatLonString(route.start);
            if (ps) {
                start_lat = ps.lat;
                start_lon = ps.lon;
            }
        }
        if (endEl && endEl.lat && endEl.lon) {
            end_lat = parseFloat(endEl.lat);
            end_lon = parseFloat(endEl.lon);
        } else if (route.destination) {
            var pe = parseLatLonString(route.destination);
            if (pe) {
                end_lat = pe.lat;
                end_lon = pe.lon;
            }
        }

        if (
            (start_lat == null || end_lat == null) &&
            routePolyline &&
            routePolyline.length > 1
        ) {
            if (start_lat == null || start_lon == null) {
                start_lat = routePolyline[0][0];
                start_lon = routePolyline[0][1];
            }
            var L = routePolyline[routePolyline.length - 1];
            if (end_lat == null || end_lon == null) {
                end_lat = L[0];
                end_lon = L[1];
            }
        }

        if (start_lat == null || start_lon == null || end_lat == null || end_lon == null) {
            return null;
        }

        var distance_km = parseFloat(route.distance_km != null ? route.distance_km : route.distance) || 0;
        var duration_minutes = parseFloat(
            route.duration_minutes != null ? route.duration_minutes : route.time
        ) || 0;

        return {
            start_lat: start_lat,
            start_lon: start_lon,
            end_lat: end_lat,
            end_lon: end_lon,
            start_address: start_address || (start_lat + ',' + start_lon),
            end_address: end_address || (end_lat + ',' + end_lon),
            distance_km: distance_km,
            duration_minutes: duration_minutes,
            fuel_cost: route.fuel_cost || 0,
            toll_cost: route.toll_cost || 0,
            caz_cost: route.caz_cost || 0,
            routing_mode: routingMode,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format trip timestamp for the history list row.
     * @param {*} timestamp
     * @returns {string}
     */
    function formatTripListTimestamp(timestamp) {
        var date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Filter trips by search term (addresses + timestamp text).
     * @param {Array<object>} trips
     * @param {string} searchTerm - lowercased trim applied by caller
     * @returns {Array<object>}
     */
    function filterTripsBySearch(trips, searchTerm) {
        if (!searchTerm) return trips || [];
        return (trips || []).filter(function (trip) {
            try {
                var start = (trip.start_address || '').toLowerCase();
                var end = (trip.end_address || '').toLowerCase();
                var tsText = '';
                if (trip.timestamp != null && trip.timestamp !== '') {
                    var d = new Date(trip.timestamp);
                    tsText = Number.isNaN(d.getTime())
                        ? String(trip.timestamp)
                        : (d.toLocaleString() + ' ' + d.toDateString());
                }
                tsText = tsText.toLowerCase();
                return start.includes(searchTerm) || end.includes(searchTerm) || tsText.includes(searchTerm);
            } catch (err) {
                return false;
            }
        });
    }

    var EMPTY_TRIP_LIST_HTML =
        '<div style="text-align: center; padding: 20px; color: #999;">No trips found</div>';

    var TRIP_HISTORY_ERROR_HTML =
        '<div style="text-align: center; padding: 20px; color: #f44336;">Error loading trips</div>';

    /**
     * Inline style for the 401 sign-in banner in trip history.
     * @returns {string}
     */
    function getTripHistorySignInBannerStyleCssText() {
        return 'padding:12px;background:#E3F2FD;border-radius:8px;margin-bottom:12px;font-size:13px;color:#1565C0;';
    }

    /**
     * Copy for the 401 sign-in banner when server trips are unavailable.
     * @param {boolean} hasTrips
     * @returns {string}
     */
    function buildTripHistorySignInBannerText(hasTrips) {
        return hasTrips
            ? '📱 Showing trips saved on this device. Sign in to sync trips with your account.'
            : '📱 No trips on this device yet. Finish navigation to save a trip here, then sign in to sync across devices.';
    }

    /**
     * Sum fuel, toll, and CAZ costs for a trip row.
     * @param {Object} trip
     * @returns {string}
     */
    function computeTripTotalCost(trip) {
        trip = trip || {};
        return (
            parseFloat(trip.fuel_cost || 0) +
            parseFloat(trip.toll_cost || 0) +
            parseFloat(trip.caz_cost || 0)
        ).toFixed(2);
    }

    /**
     * Orchestration plan for loading trip history from the API.
     * @returns {Object}
     */
    function buildLoadTripHistoryOrchestrationPlan() {
        return {
            apiPath: '/api/trip-history',
            listContainerId: 'tripHistoryList',
            searchInputId: 'tripSearchInput',
            errorLogPrefix: 'Error loading trip history:',
        };
    }

    /**
     * Execute plan for a 401 trip-history response (device-local fallback).
     * @param {Array<Object>} allTrips
     * @returns {Object}
     */
    function buildLoadTripHistoryAuthExecutePlan(allTrips) {
        return {
            shouldShowSignInBanner: true,
            bannerStyle: getTripHistorySignInBannerStyleCssText(),
            bannerText: buildTripHistorySignInBannerText((allTrips || []).length > 0),
            insertBannerBeforeFirstChild: true,
            bindSearch: true,
        };
    }

    /**
     * DOM mount execute plan for the 401 trip-history sign-in banner.
     * @param {Object} authExecute - from buildLoadTripHistoryAuthExecutePlan
     * @param {Object} [input]
     * @param {boolean} [input.listHasChildren]
     * @returns {Object}
     */
    function buildLoadTripHistoryAuthBannerMountExecutePlan(authExecute, input) {
        authExecute = authExecute || {};
        input = input || {};
        return {
            shouldMount: !!authExecute.shouldShowSignInBanner && !!input.listHasChildren,
            bannerStyle: authExecute.bannerStyle,
            bannerText: authExecute.bannerText,
            insertBeforeFirstChild: !!authExecute.insertBannerBeforeFirstChild,
        };
    }

    /**
     * DOM apply plan when trip-history loading fails.
     * @param {Object} execute - from buildLoadTripHistoryErrorExecutePlan
     * @param {Object} [orch]
     * @returns {Object}
     */
    function buildLoadTripHistoryErrorDomExecutePlan(execute, orch) {
        execute = execute || {};
        orch = orch || {};
        return {
            shouldApply: !!execute.shouldRenderError,
            listContainerId: orch.listContainerId || 'tripHistoryList',
            listInnerHtml: execute.listInnerHtml,
            clearAllTrips: !!execute.clearAllTrips,
            bindSearch: !!execute.bindSearch,
        };
    }

    /**
     * Execute plan for a trip-history API response.
     * @param {{ status?: number }} res
     * @param {Object} data
     * @returns {Object}
     */
    function buildLoadTripHistoryResponseExecutePlan(res, data) {
        res = res || {};
        data = data || {};
        if (res.status === 401) {
            return { action: 'auth' };
        }
        if (data && data.success && Array.isArray(data.trips)) {
            return { action: 'success', serverTrips: data.trips };
        }
        return { action: 'empty', serverTrips: [] };
    }

    /**
     * Execute plan when trip-history loading fails.
     * @returns {Object}
     */
    function buildLoadTripHistoryErrorExecutePlan() {
        return {
            shouldRenderError: true,
            listInnerHtml: TRIP_HISTORY_ERROR_HTML,
            clearAllTrips: true,
            bindSearch: true,
        };
    }

    /**
     * Entry orchestration plan for loadTripHistory handler.
     * @returns {Object}
     */
    function buildLoadTripHistoryEntryOrchestrationPlan() {
        return {
            orch: buildLoadTripHistoryOrchestrationPlan(),
        };
    }

    /**
     * Execute plan when trip-history fetch fails.
     * @param {Object} [orch] - from buildLoadTripHistoryOrchestrationPlan
     * @returns {Object}
     */
    function buildLoadTripHistoryFetchErrorExecutePlan(orch) {
        orch = orch || buildLoadTripHistoryOrchestrationPlan();
        return {
            errorLogPrefix: orch.errorLogPrefix,
            errorEntry: buildLoadTripHistoryErrorEntryOrchestrationPlan(orch),
        };
    }

    /**
     * Entry orchestration plan for trip-history load error handling.
     * @param {Object} [orch]
     * @returns {Object}
     */
    function buildLoadTripHistoryErrorEntryOrchestrationPlan(orch) {
        orch = orch || buildLoadTripHistoryOrchestrationPlan();
        var execute = buildLoadTripHistoryErrorExecutePlan();
        return {
            execute: execute,
            dom: buildLoadTripHistoryErrorDomExecutePlan(execute, orch),
        };
    }

    /**
     * Entry orchestration plan for displayTripHistory handler.
     * @param {Array<Object>} trips
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildDisplayTripHistoryEntryOrchestrationPlan(trips, fmt) {
        return {
            execute: buildDisplayTripHistoryExecutePlan(buildDisplayTripHistoryInputPlan(trips, fmt)),
        };
    }

    /**
     * Input assembly for rendering the trip history list.
     * @param {Array<Object>} trips
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildDisplayTripHistoryInputPlan(trips, fmt) {
        return {
            trips: trips || [],
            fmt: fmt || {},
        };
    }

    /**
     * Execute plan for rendering the trip history list.
     * @param {Object} input - from buildDisplayTripHistoryInputPlan
     * @returns {Object}
     */
    function buildDisplayTripHistoryExecutePlan(input) {
        input = input || {};
        var trips = input.trips || [];
        if (!trips.length) {
            return {
                shouldRender: true,
                listInnerHtml: EMPTY_TRIP_LIST_HTML,
                bindSearch: true,
            };
        }
        var fmt = input.fmt || {};
        return {
            shouldRender: true,
            rows: trips.map(function (trip) {
                return {
                    trip: trip,
                    display: {
                        startAddr: typeof fmt.escapeHtml === 'function'
                            ? fmt.escapeHtml(trip.start_address || 'Start')
                            : (trip.start_address || 'Start'),
                        endAddr: typeof fmt.escapeHtml === 'function'
                            ? fmt.escapeHtml(trip.end_address || 'End')
                            : (trip.end_address || 'End'),
                        dateStr: formatTripListTimestamp(trip.timestamp),
                        distance: typeof fmt.convertDistance === 'function'
                            ? fmt.convertDistance(trip.distance_km)
                            : String(trip.distance_km || ''),
                        distUnit: fmt.distUnit || '',
                        totalCost: computeTripTotalCost(trip),
                        symbol: fmt.currencySymbol || '',
                    },
                };
            }),
            bindSearch: true,
        };
    }

    /**
     * Execute plan for recalculating a trip from history.
     * @param {number} tripId
     * @param {Array<Object>} allTrips
     * @returns {Object}
     */
    function buildRecalculateTripExecutePlan(tripId, allTrips) {
        var trip = (allTrips || []).find(function (t) { return t.id === tripId; });
        if (!trip) {
            return { shouldRecalculate: false };
        }
        return {
            shouldRecalculate: true,
            startInputId: 'start',
            endInputId: 'end',
            startValue: trip.start_address || (trip.start_lat + ',' + trip.start_lon),
            endValue: trip.end_address || (trip.end_lat + ',' + trip.end_lon),
            switchTab: 'navigation',
            calculateDelayMs: 300,
            successStatusMessage: 'Trip loaded. Recalculating route...',
            successStatusType: 'success',
        };
    }

    /**
     * Orchestration plan for deleting a trip from history.
     * @param {number} tripId
     * @returns {Object}
     */
    function buildDeleteTripHistoryOrchestrationPlan(tripId) {
        return {
            tripId: tripId,
            confirmMessage: 'Are you sure you want to delete this trip?',
            apiPath: '/api/trip-history/' + tripId,
            localId: tripId < 0 ? -tripId : null,
            isLocalOnly: tripId < 0,
        };
    }

    /**
     * Execute plan for deleting a device-local trip row.
     * @param {Object} orch - from buildDeleteTripHistoryOrchestrationPlan
     * @param {Array<Object>} allTrips
     * @returns {Object}
     */
    function buildDeleteTripHistoryLocalExecutePlan(orch, allTrips) {
        orch = orch || {};
        if (!orch.isLocalOnly) {
            return { shouldDeleteLocal: false };
        }
        return {
            shouldDeleteLocal: true,
            localId: orch.localId,
            nextTrips: (allTrips || []).filter(function (t) { return t.id !== orch.tripId; }),
            successStatusMessage: 'Trip removed from this device',
            successStatusType: 'success',
        };
    }

    /**
     * Execute plan for a trip-history delete API response.
     * @param {Object} data
     * @returns {Object}
     */
    function buildDeleteTripHistoryResponseExecutePlan(data) {
        data = data || {};
        if (data.success) {
            return {
                shouldRemove: true,
                successStatusMessage: 'Trip deleted',
                successStatusType: 'success',
            };
        }
        return {
            shouldRemove: false,
            errorStatusMessage: 'Error deleting trip',
            errorStatusType: 'error',
        };
    }

    /**
     * DOM apply plan for recalculating a trip from history.
     * @param {Object} execute - from buildRecalculateTripExecutePlan
     * @returns {Object}
     */
    function buildRecalculateTripDomApplyPlan(execute) {
        execute = execute || {};
        if (!execute.shouldRecalculate) {
            return { shouldApply: false };
        }
        return {
            shouldApply: true,
            inputPatches: [
                { id: execute.startInputId, property: 'value', value: execute.startValue },
                { id: execute.endInputId, property: 'value', value: execute.endValue },
            ],
            switchTab: execute.switchTab,
            scheduleCalculateRoute: true,
            calculateDelayMs: execute.calculateDelayMs,
            statusMessage: execute.successStatusMessage,
            statusType: execute.successStatusType,
        };
    }

    /**
     * Entry orchestration plan for recalculateTrip handler.
     * @param {number} tripId
     * @param {Array<Object>} allTrips
     * @returns {Object}
     */
    function buildRecalculateTripEntryOrchestrationPlan(tripId, allTrips) {
        var execute = buildRecalculateTripExecutePlan(tripId, allTrips);
        return {
            execute: execute,
            apply: buildRecalculateTripDomApplyPlan(execute),
        };
    }

    /**
     * Entry orchestration plan for deleteTripHistory handler.
     * @param {number} tripId
     * @returns {Object}
     */
    function buildDeleteTripHistoryEntryOrchestrationPlan(tripId) {
        return {
            orch: buildDeleteTripHistoryOrchestrationPlan(tripId),
        };
    }

    /**
     * Entry orchestration plan for deleting a device-local trip row.
     * @param {Object} orch
     * @param {Array<Object>} allTrips
     * @returns {Object}
     */
    function buildDeleteTripHistoryLocalEntryOrchestrationPlan(orch, allTrips) {
        var localExecute = buildDeleteTripHistoryLocalExecutePlan(orch, allTrips);
        return {
            localExecute: localExecute,
            apply: buildDeleteTripHistoryLocalDomApplyPlan(localExecute),
            nextTrips: localExecute.nextTrips,
        };
    }

    /**
     * Entry orchestration plan for a trip-history delete API response.
     * @param {Object} data
     * @param {number} tripId
     * @param {Array<Object>} allTrips
     * @returns {Object}
     */
    function buildDeleteTripHistoryServerResponseEntryOrchestrationPlan(data, tripId, allTrips) {
        var execute = buildDeleteTripHistoryResponseExecutePlan(data);
        return {
            execute: execute,
            apply: buildDeleteTripHistoryResponseDomApplyPlan(execute),
            nextTrips: execute.shouldRemove
                ? (allTrips || []).filter(function (t) { return t.id !== tripId; })
                : null,
        };
    }

    /**
     * Execute plan when trip-history delete fetch fails.
     * @returns {Object}
     */
    function buildDeleteTripHistoryFetchErrorExecutePlan() {
        return {
            statusMessage: 'Error deleting trip',
            statusType: 'error',
            errorLogPrefix: 'Error deleting trip:',
        };
    }

    /**
     * DOM apply plan after a trip-history delete outcome.
     * @param {Object} input
     * @param {boolean} [input.refreshTripList]
     * @param {string} [input.statusMessage]
     * @param {string} [input.statusType]
     * @returns {Object}
     */
    function buildDeleteTripHistoryOutcomeDomApplyPlan(input) {
        input = input || {};
        return {
            shouldApply: true,
            refreshTripList: !!input.refreshTripList,
            statusMessage: input.statusMessage,
            statusType: input.statusType,
        };
    }

    /**
     * DOM apply plan for deleting a device-local trip row.
     * @param {Object} localExecute - from buildDeleteTripHistoryLocalExecutePlan
     * @returns {Object}
     */
    function buildDeleteTripHistoryLocalDomApplyPlan(localExecute) {
        localExecute = localExecute || {};
        if (!localExecute.shouldDeleteLocal) {
            return { shouldApply: false };
        }
        return buildDeleteTripHistoryOutcomeDomApplyPlan({
            refreshTripList: true,
            statusMessage: localExecute.successStatusMessage,
            statusType: localExecute.successStatusType,
        });
    }

    /**
     * DOM apply plan for a trip-history delete API response.
     * @param {Object} execute - from buildDeleteTripHistoryResponseExecutePlan
     * @returns {Object}
     */
    function buildDeleteTripHistoryResponseDomApplyPlan(execute) {
        execute = execute || {};
        if (execute.shouldRemove) {
            return buildDeleteTripHistoryOutcomeDomApplyPlan({
                refreshTripList: true,
                statusMessage: execute.successStatusMessage,
                statusType: execute.successStatusType,
            });
        }
        return buildDeleteTripHistoryOutcomeDomApplyPlan({
            refreshTripList: false,
            statusMessage: execute.errorStatusMessage,
            statusType: execute.errorStatusType,
        });
    }

    /**
     * Execute plan for binding trip-history search input filtering.
     * @returns {Object}
     */
    function buildBindTripHistorySearchExecutePlan() {
        return {
            shouldBind: true,
            searchInputId: 'tripSearchInput',
        };
    }

    /**
     * Filter plan for trip-history search input changes.
     * @param {string} searchTerm
     * @returns {Object}
     */
    function buildTripHistorySearchFilterPlan(searchTerm) {
        var term = String(searchTerm || '').toLowerCase().trim();
        return {
            searchTerm: term,
            showAll: !term,
        };
    }

    /**
     * Build one trip-history list row HTML string.
     * @param {object} trip
     * @param {object} display - pre-formatted/escaped display fields
     * @returns {string}
     */
    function buildTripHistoryRowHtml(trip, display) {
        var localBadge = trip._localOnly
            ? ' <span style="font-size:11px;font-weight:500;color:#1565C0;">(this device)</span>'
            : '';
        return (
            '<div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #667eea;">' +
                '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">' +
                    '<div>' +
                        '<div style="font-weight: 600; color: #333; margin-bottom: 4px;">' +
                            display.startAddr + ' → ' + display.endAddr + localBadge +
                        '</div>' +
                        '<div style="font-size: 12px; color: #666;">' + display.dateStr + '</div>' +
                    '</div>' +
                    '<button onclick="deleteTripHistory(' + trip.id + ')" style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;">Delete</button>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #666; margin-bottom: 8px;">' +
                    '<div>📏 ' + display.distance + ' ' + display.distUnit + '</div>' +
                    '<div>⏱️ ' + trip.duration_minutes + ' min</div>' +
                    '<div>💰 ' + display.symbol + display.totalCost + '</div>' +
                    '<div>🛣️ ' + trip.routing_mode + '</div>' +
                '</div>' +
                '<button onclick="recalculateTrip(' + trip.id + ')" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Recalculate Route</button>' +
            '</div>'
        );
    }

    /**
     * Display values for the analytics dashboard summary.
     * @param {Object} data
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildAnalyticsDisplayValues(data, fmt) {
        data = data || {};
        fmt = fmt || {};
        var totalHours = Math.floor((data.total_time_minutes || 0) / 60);
        var totalMinutes = (data.total_time_minutes || 0) % 60;
        var avgSpeedKmh = data.avg_speed || 0;
        var displayAvgSpeed = fmt.speedUnit === 'mph' ? (avgSpeedKmh * 0.621371) : avgSpeedKmh;
        return {
            totalTrips: data.total_trips || 0,
            totalDistanceText: fmt.totalDistanceText,
            totalCostText: fmt.currencySymbol + (data.total_cost || 0).toFixed(2),
            avgDurationText: (data.avg_duration || 0) + ' min',
            totalFuelCostText: fmt.currencySymbol + (data.total_fuel_cost || 0).toFixed(2),
            totalTollCostText: fmt.currencySymbol + (data.total_toll_cost || 0).toFixed(2),
            totalCazCostText: fmt.currencySymbol + (data.total_caz_cost || 0).toFixed(2),
            totalTimeText: totalHours + 'h ' + totalMinutes + 'm',
            avgSpeedText: displayAvgSpeed.toFixed(1) + ' ' + fmt.speedUnitLabel,
        };
    }

    /**
     * @param {Object} route
     * @param {number} index
     * @param {Object} opts
     * @returns {string}
     */
    function buildFrequentRouteRowHtml(route, index, opts) {
        opts = opts || {};
        var escape = opts.escapeHtml || function (s) { return String(s); };
        return (
            '<div style="background: white; padding: 10px; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #FF5722;">' +
                '<div style="font-weight: 500; font-size: 13px; margin-bottom: 4px;">' +
                    (index + 1) + '. ' + escape(route.start) + ' → ' + escape(route.end) +
                '</div>' +
                '<div style="font-size: 12px; color: #666;">' +
                    '<span>🔄 ' + route.count + ' trips</span> | ' +
                    '<span>📏 ' + opts.distanceText + ' ' + opts.distUnit + '</span> | ' +
                    '<span>💰 ' + opts.currencySymbol + route.avg_cost.toFixed(2) + '</span>' +
                '</div>' +
            '</div>'
        );
    }

    /**
     * @param {Array<Object>} routes
     * @param {Object} opts
     * @returns {string}
     */
    function buildFrequentRoutesListHtml(routes, opts) {
        if (!routes || routes.length === 0) {
            return '<div style="text-align: center; padding: 20px; color: #999;">No trip history yet</div>';
        }
        opts = opts || {};
        var html = '';
        for (var i = 0; i < routes.length; i++) {
            html += buildFrequentRouteRowHtml(routes[i], i, {
                escapeHtml: opts.escapeHtml,
                distanceText: opts.distanceTexts ? opts.distanceTexts[i] : opts.distanceText,
                distUnit: opts.distUnit,
                currencySymbol: opts.currencySymbol,
            });
        }
        return html;
    }

    /**
     * Orchestration plan for loading trip analytics from the API.
     * @returns {Object}
     */
    function buildLoadRouteAnalyticsOrchestrationPlan() {
        return {
            apiPath: '/api/trip-analytics',
            authRequiredStatusMessage: 'Sign in to view trip analytics',
            authRequiredStatusType: 'info',
            premiumFallbackStatusMessage: 'Premium access required — redeem a promo code in Settings → Account.',
            loadFailureStatusMessage: 'Failed to load analytics',
            loadFailureStatusType: 'error',
            fetchErrorStatusMessage: 'Error loading analytics',
            fetchErrorStatusType: 'error',
            errorLogPrefix: 'Analytics error:',
        };
    }

    /**
     * Execute plan for a trip-analytics API response.
     * @param {{ status?: number }} res
     * @param {Object} data
     * @param {Object} orch - from buildLoadRouteAnalyticsOrchestrationPlan
     * @returns {Object}
     */
    function buildLoadRouteAnalyticsResponseExecutePlan(res, data, orch) {
        res = res || {};
        data = data || {};
        orch = orch || {};
        if (res.status === 401) {
            return {
                shouldDisplay: false,
                statusMessage: orch.authRequiredStatusMessage,
                statusType: orch.authRequiredStatusType,
            };
        }
        if (res.status === 403 && data.code === 'premium_required') {
            return {
                shouldDisplay: false,
                statusMessage: data.error || orch.premiumFallbackStatusMessage,
                statusType: orch.authRequiredStatusType,
            };
        }
        if (data.success) {
            return { shouldDisplay: true, data: data };
        }
        return {
            shouldDisplay: false,
            statusMessage: orch.loadFailureStatusMessage,
            statusType: orch.loadFailureStatusType,
        };
    }

    /**
     * Input assembly for analytics dashboard display.
     * @param {Object} data
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildAnalyticsDisplayInputPlan(data, fmt) {
        fmt = fmt || {};
        var routes = (data && data.frequent_routes) || [];
        return {
            data: data || {},
            currencySymbol: fmt.currencySymbol,
            totalDistanceText: fmt.totalDistanceText,
            speedUnit: fmt.speedUnit,
            speedUnitLabel: fmt.speedUnitLabel,
            distUnit: fmt.distUnit,
            escapeHtml: fmt.escapeHtml,
            distanceTexts: routes.map(function (route) {
                return typeof fmt.convertDistance === 'function'
                    ? fmt.convertDistance(route.avg_distance)
                    : String(route.avg_distance);
            }),
        };
    }

    /**
     * Execute plan for rendering analytics dashboard values.
     * @param {Object} input - from buildAnalyticsDisplayInputPlan
     * @returns {Object}
     */
    function buildAnalyticsDisplayExecutePlan(input) {
        input = input || {};
        var display = buildAnalyticsDisplayValues(input.data, input);
        var routes = input.data.frequent_routes || [];
        return {
            shouldRender: true,
            elementPatches: {
                totalTrips: display.totalTrips,
                totalDistance: display.totalDistanceText + ' ' + (input.distUnit || ''),
                totalCost: display.totalCostText,
                avgDuration: display.avgDurationText,
                totalFuelCost: display.totalFuelCostText,
                totalTollCost: display.totalTollCostText,
                totalCAZCost: display.totalCazCostText,
                totalTime: display.totalTimeText,
                avgSpeed: display.avgSpeedText,
            },
            frequentRoutesListId: 'frequentRoutesList',
            frequentRoutesHtml: buildFrequentRoutesListHtml(routes, {
                escapeHtml: input.escapeHtml,
                currencySymbol: input.currencySymbol,
                distUnit: input.distUnit,
                distanceTexts: input.distanceTexts,
            }),
        };
    }

    /**
     * Entry orchestration plan for loadRouteAnalytics handler.
     * @returns {Object}
     */
    function buildLoadRouteAnalyticsEntryOrchestrationPlan() {
        return {
            orch: buildLoadRouteAnalyticsOrchestrationPlan(),
        };
    }

    /**
     * Execute plan when trip-analytics fetch fails.
     * @param {Object} [orch] - from buildLoadRouteAnalyticsOrchestrationPlan
     * @returns {Object}
     */
    function buildLoadRouteAnalyticsFetchErrorExecutePlan(orch) {
        orch = orch || buildLoadRouteAnalyticsOrchestrationPlan();
        return {
            shouldDisplay: false,
            statusMessage: orch.fetchErrorStatusMessage,
            statusType: orch.fetchErrorStatusType,
            errorLogPrefix: orch.errorLogPrefix,
        };
    }

    /**
     * Entry orchestration plan for displayAnalytics handler.
     * @param {Object} data
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildAnalyticsDisplayEntryOrchestrationPlan(data, fmt) {
        return {
            execute: buildAnalyticsDisplayExecutePlan(buildAnalyticsDisplayInputPlan(data, fmt)),
        };
    }

    var api = {
        parseLatLonString: parseLatLonString,
        mergeServerAndLocalTrips: mergeServerAndLocalTrips,
        buildCompletedTripRecord: buildCompletedTripRecord,
        formatTripListTimestamp: formatTripListTimestamp,
        filterTripsBySearch: filterTripsBySearch,
        buildTripHistoryRowHtml: buildTripHistoryRowHtml,
        buildAnalyticsDisplayValues: buildAnalyticsDisplayValues,
        computeTripTotalCost: computeTripTotalCost,
        buildLoadTripHistoryOrchestrationPlan: buildLoadTripHistoryOrchestrationPlan,
        buildLoadTripHistoryAuthExecutePlan: buildLoadTripHistoryAuthExecutePlan,
        buildLoadTripHistoryAuthBannerMountExecutePlan: buildLoadTripHistoryAuthBannerMountExecutePlan,
        buildLoadTripHistoryErrorDomExecutePlan: buildLoadTripHistoryErrorDomExecutePlan,
        buildLoadTripHistoryResponseExecutePlan: buildLoadTripHistoryResponseExecutePlan,
        buildLoadTripHistoryErrorExecutePlan: buildLoadTripHistoryErrorExecutePlan,
        buildLoadTripHistoryEntryOrchestrationPlan: buildLoadTripHistoryEntryOrchestrationPlan,
        buildLoadTripHistoryFetchErrorExecutePlan: buildLoadTripHistoryFetchErrorExecutePlan,
        buildLoadTripHistoryErrorEntryOrchestrationPlan: buildLoadTripHistoryErrorEntryOrchestrationPlan,
        buildDisplayTripHistoryInputPlan: buildDisplayTripHistoryInputPlan,
        buildDisplayTripHistoryExecutePlan: buildDisplayTripHistoryExecutePlan,
        buildDisplayTripHistoryEntryOrchestrationPlan: buildDisplayTripHistoryEntryOrchestrationPlan,
        buildRecalculateTripExecutePlan: buildRecalculateTripExecutePlan,
        buildRecalculateTripDomApplyPlan: buildRecalculateTripDomApplyPlan,
        buildRecalculateTripEntryOrchestrationPlan: buildRecalculateTripEntryOrchestrationPlan,
        buildDeleteTripHistoryOrchestrationPlan: buildDeleteTripHistoryOrchestrationPlan,
        buildDeleteTripHistoryLocalExecutePlan: buildDeleteTripHistoryLocalExecutePlan,
        buildDeleteTripHistoryResponseExecutePlan: buildDeleteTripHistoryResponseExecutePlan,
        buildDeleteTripHistoryEntryOrchestrationPlan: buildDeleteTripHistoryEntryOrchestrationPlan,
        buildDeleteTripHistoryLocalEntryOrchestrationPlan: buildDeleteTripHistoryLocalEntryOrchestrationPlan,
        buildDeleteTripHistoryServerResponseEntryOrchestrationPlan:
            buildDeleteTripHistoryServerResponseEntryOrchestrationPlan,
        buildDeleteTripHistoryFetchErrorExecutePlan: buildDeleteTripHistoryFetchErrorExecutePlan,
        buildDeleteTripHistoryOutcomeDomApplyPlan: buildDeleteTripHistoryOutcomeDomApplyPlan,
        buildDeleteTripHistoryLocalDomApplyPlan: buildDeleteTripHistoryLocalDomApplyPlan,
        buildDeleteTripHistoryResponseDomApplyPlan: buildDeleteTripHistoryResponseDomApplyPlan,
        buildBindTripHistorySearchExecutePlan: buildBindTripHistorySearchExecutePlan,
        buildTripHistorySearchFilterPlan: buildTripHistorySearchFilterPlan,
        buildLoadRouteAnalyticsOrchestrationPlan: buildLoadRouteAnalyticsOrchestrationPlan,
        buildLoadRouteAnalyticsResponseExecutePlan: buildLoadRouteAnalyticsResponseExecutePlan,
        buildLoadRouteAnalyticsEntryOrchestrationPlan: buildLoadRouteAnalyticsEntryOrchestrationPlan,
        buildLoadRouteAnalyticsFetchErrorExecutePlan: buildLoadRouteAnalyticsFetchErrorExecutePlan,
        buildAnalyticsDisplayInputPlan: buildAnalyticsDisplayInputPlan,
        buildAnalyticsDisplayExecutePlan: buildAnalyticsDisplayExecutePlan,
        buildAnalyticsDisplayEntryOrchestrationPlan: buildAnalyticsDisplayEntryOrchestrationPlan,
        buildFrequentRouteRowHtml: buildFrequentRouteRowHtml,
        buildFrequentRoutesListHtml: buildFrequentRoutesListHtml,
        getTripHistorySignInBannerStyleCssText: getTripHistorySignInBannerStyleCssText,
        buildTripHistorySignInBannerText: buildTripHistorySignInBannerText,
        EMPTY_TRIP_LIST_HTML: EMPTY_TRIP_LIST_HTML,
        TRIP_HISTORY_ERROR_HTML: TRIP_HISTORY_ERROR_HTML,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTripHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

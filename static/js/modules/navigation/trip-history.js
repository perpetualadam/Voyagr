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

    var api = {
        parseLatLonString: parseLatLonString,
        mergeServerAndLocalTrips: mergeServerAndLocalTrips,
        buildCompletedTripRecord: buildCompletedTripRecord,
        formatTripListTimestamp: formatTripListTimestamp,
        filterTripsBySearch: filterTripsBySearch,
        buildTripHistoryRowHtml: buildTripHistoryRowHtml,
        buildAnalyticsDisplayValues: buildAnalyticsDisplayValues,
        buildFrequentRouteRowHtml: buildFrequentRouteRowHtml,
        buildFrequentRoutesListHtml: buildFrequentRoutesListHtml,
        EMPTY_TRIP_LIST_HTML: EMPTY_TRIP_LIST_HTML,
        TRIP_HISTORY_ERROR_HTML: TRIP_HISTORY_ERROR_HTML,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTripHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

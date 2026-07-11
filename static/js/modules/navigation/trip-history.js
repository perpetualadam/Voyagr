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

    var api = {
        parseLatLonString: parseLatLonString,
        mergeServerAndLocalTrips: mergeServerAndLocalTrips,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTripHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

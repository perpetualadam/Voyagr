/**
 * @file Pure route-selection helpers — merge selected option into navigation payload.
 * @module modules/navigation/route-selection
 */
(function (root) {
    'use strict';

    /**
     * Attach selected route option geometry/maneuvers before navigation decode.
     * @param {object|null|undefined} routeData
     * @param {Array<object>|null|undefined} routeOptions
     * @param {number} selectedRouteIndex
     * @returns {object|null|undefined}
     */
    function mergeNavigationRouteFromSelected(routeData, routeOptions, selectedRouteIndex) {
        if (!routeData || typeof routeData !== 'object') return routeData;
        try {
            if (!routeOptions || routeOptions.length === 0) return routeData;
            var idx = Math.max(0, Math.min(Number(selectedRouteIndex) || 0, routeOptions.length - 1));
            var sel = routeOptions[idx];
            if (!sel) return routeData;
            var prec = Number.isFinite(sel.geometry_precision) ? sel.geometry_precision : 6;
            return Object.assign({}, routeData, {
                geometry: sel.geometry || routeData.geometry,
                geometry_precision: prec,
                maneuvers: (sel.maneuvers && sel.maneuvers.length > 0)
                    ? sel.maneuvers
                    : (routeData.maneuvers || []),
                name: sel.name || routeData.name,
                distance_km: sel.distance_km != null ? sel.distance_km : routeData.distance_km,
                duration_minutes: sel.duration_minutes != null ? sel.duration_minutes : routeData.duration_minutes,
                fuel_cost: sel.fuel_cost != null ? sel.fuel_cost : routeData.fuel_cost,
                fuel_litres: sel.fuel_litres != null ? sel.fuel_litres : routeData.fuel_litres,
                toll_cost: sel.toll_cost != null ? sel.toll_cost : routeData.toll_cost,
                caz_cost: sel.caz_cost != null ? sel.caz_cost : routeData.caz_cost,
                source: sel.source || routeData.source,
                hazards: sel.hazards || routeData.hazards || [],
            });
        } catch (_e) {
            return routeData;
        }
    }

    /**
     * Merge a selected route option into lastCalculatedRoute shape (pure).
     * @param {object} prev
     * @param {object} route
     * @returns {object}
     */
    function mergeLastCalculatedRouteFromSelection(prev, route) {
        if (!route) return prev || {};
        var p = prev || {};
        return {
            ...p,
            ...route,
            geometry: route.geometry || p.geometry,
            geometry_precision: Number.isFinite(route.geometry_precision)
                ? route.geometry_precision
                : (p.geometry_precision || 6),
            maneuvers: route.maneuvers || p.maneuvers || [],
            destination: p.destination || route.destination,
            destinationName: p.destinationName || route.destinationName,
            end_lat: p.end_lat != null ? p.end_lat : route.end_lat,
            end_lon: p.end_lon != null ? p.end_lon : route.end_lon,
        };
    }

    /**
     * Recover routeData from persisted OfflineNav blob.
     * @param {object|null} saved
     * @param {function(Array, number): string} encodePolyline
     * @returns {object|null}
     */
    function buildRoutePayloadFromPersisted(saved, encodePolyline) {
        if (!saved || !Array.isArray(saved.polyline) || saved.polyline.length < 2) return null;
        var base = saved.routeData && typeof saved.routeData === 'object' ? { ...saved.routeData } : {};
        base.maneuvers = saved.steps || base.maneuvers || [];
        if (!base.geometry || typeof base.geometry !== 'string') {
            base.geometry = encodePolyline(saved.polyline, 6);
            if (!base.geometry) return null;
        }
        return base;
    }

    var api = {
        mergeNavigationRouteFromSelected: mergeNavigationRouteFromSelected,
        mergeLastCalculatedRouteFromSelection: mergeLastCalculatedRouteFromSelection,
        buildRoutePayloadFromPersisted: buildRoutePayloadFromPersisted,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSelection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

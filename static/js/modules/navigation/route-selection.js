/**
 * @file Pure route-selection helpers — merge selected option into navigation payload.
 * @module modules/navigation/route-selection
 */
(function (root) {
    'use strict';

    /** Route colours for multi-route display (contrast with traffic overlay). */
    var ROUTE_COLORS = [
        '#2563EB',
        '#7C3AED',
        '#EC4899',
        '#06B6D4',
        '#8B5CF6',
    ];

    /** Active navigation / reroute line — matches ROUTE_COLORS[0]. */
    var NAV_ACTIVE_ROUTE_COLOR = '#2563EB';

    /**
     * @param {number} hazardCount
     * @returns {string} CSS colour
     */
    function hazardBadgeColor(hazardCount) {
        if (hazardCount === 0) return '#4CAF50';
        if (hazardCount <= 2) return '#FF9800';
        return '#F44336';
    }

    /**
     * @param {{ fuel_cost?: number|string, toll_cost?: number|string, caz_cost?: number|string }} route
     * @returns {number}
     */
    function computeRouteTotalCost(route) {
        route = route || {};
        return parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
    }

    /**
     * @param {number} index
     * @param {string[]} [routeColors]
     * @returns {string}
     */
    function resolveRouteColor(index, routeColors) {
        var colors = routeColors || ROUTE_COLORS;
        return colors[index % colors.length];
    }

    /**
     * Display values for navigation tab trip info from a route option.
     * @param {Object} route
     * @param {Object} fmt
     * @param {string} fmt.distanceText - Already converted distance string
     * @param {string} fmt.distUnit
     * @param {string} fmt.currencySymbol
     * @returns {Object|null}
     */
    function buildTripInfoDisplayValues(route, fmt) {
        if (!route) return null;
        fmt = fmt || {};
        var fuelCost = parseFloat(route.fuel_cost || 0);
        var tollCost = parseFloat(route.toll_cost || 0);
        var cazCost = parseFloat(route.caz_cost || 0);
        return {
            distanceText: fmt.distanceText,
            distUnit: fmt.distUnit,
            distanceKm: route.distance_km,
            durationMinutes: route.duration_minutes,
            fuelCostText: fmt.currencySymbol + fuelCost.toFixed(2),
            tollCostText: fmt.currencySymbol + tollCost.toFixed(2),
            fuelCost: fuelCost,
            tollCost: tollCost,
            cazCost: cazCost,
        };
    }

    /**
     * HTML for one route-comparison list card.
     * @param {Object} route
     * @param {number} index
     * @param {Object} opts
     * @returns {string}
     */
    function buildRouteComparisonCardHtml(route, index, opts) {
        opts = opts || {};
        var routeColor = resolveRouteColor(index, opts.routeColors);
        var routeName = route.name || ('Route ' + (index + 1));
        var hazardCount = route.hazard_count || 0;
        var hazardColor = hazardBadgeColor(hazardCount);
        var fuelCost = parseFloat(route.fuel_cost || 0);
        var tollCost = parseFloat(route.toll_cost || 0);
        var totalCost = computeRouteTotalCost(route).toFixed(2);
        var isSelected = index === opts.selectedIndex;
        var bgColor = isSelected ? '#E8F5E9' : '#f8f9fa';
        var hazardLabel = opts.hazardLabel || 'cameras';

        return (
            '<div style="background: ' + bgColor + '; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ' + routeColor + '; cursor: pointer;" onclick="selectRoute(' + index + ')">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
                    '<div style="font-size: 14px; font-weight: 600; color: #333;">' +
                        '<span style="display: inline-block; width: 12px; height: 12px; background: ' + routeColor + '; border-radius: 50%; margin-right: 6px;"></span>' +
                        routeName +
                    '</div>' +
                    '<div style="font-size: 11px; padding: 2px 8px; border-radius: 10px; background: ' + hazardColor + '; color: white;">📷 ' + hazardCount + ' ' + hazardLabel + '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #333; margin-bottom: 8px;">' +
                    '<div><strong>⏱️ ' + route.duration_minutes + ' min</strong></div>' +
                    '<div><strong>📏 ' + opts.distanceText + ' ' + opts.distUnit + '</strong></div>' +
                    '<div>⛽ ' + opts.currencySymbol + fuelCost.toFixed(2) + '</div>' +
                    '<div>🛣️ ' + opts.currencySymbol + tollCost.toFixed(2) + '</div>' +
                '</div>' +
                '<div style="font-size: 12px; color: #666; margin-bottom: 8px;">' +
                    'Total: <strong>' + opts.currencySymbol + totalCost + '</strong>' +
                '</div>' +
                '<button onclick="useRoute(' + index + '); event.stopPropagation();" style="width: 100%; background: ' + routeColor + '; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Use This Route</button>' +
            '</div>'
        );
    }

    /**
     * Full route comparison panel HTML (show-all button + cards).
     * @param {Array<Object>} routes
     * @param {Object} opts
     * @returns {string}
     */
    function buildRouteComparisonListHtml(routes, opts) {
        if (!routes || routes.length === 0) {
            return '<div style="text-align: center; padding: 20px; color: #999;">Calculate a route to see options</div>';
        }
        opts = opts || {};
        var html = (
            '<button onclick="showAllRoutes(); event.stopPropagation();" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 8px; padding: 12px; font-size: 14px; cursor: pointer; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px;">' +
                '🗺️ Show All ' + routes.length + ' Routes' +
            '</button>'
        );
        for (var i = 0; i < routes.length; i++) {
            html += buildRouteComparisonCardHtml(routes[i], i, Object.assign({}, opts, {
                distanceText: opts.distanceTexts ? opts.distanceTexts[i] : opts.distanceText,
            }));
        }
        return html;
    }

    /**
     * Inner HTML for a preview alternative-route row.
     * @param {Object} route
     * @param {number} index
     * @param {Object} opts
     * @returns {string}
     */
    function buildPreviewAlternativeRouteCardHtml(route, index, opts) {
        opts = opts || {};
        var routeColor = resolveRouteColor(index, opts.routeColors);
        var routeName = route.name || ('Route ' + (index + 1));
        var hazardCount = route.cameras_near_route != null ? route.cameras_near_route : (route.hazard_count || 0);
        var hazardColor = hazardBadgeColor(hazardCount);
        var totalCost = computeRouteTotalCost(route).toFixed(2);
        var fuelLitres = parseFloat(route.fuel_litres || 0).toFixed(1);
        var fuelUnit = opts.fuelUnit || 'L';

        return (
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px; min-width: 0;">' +
                '<div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">' +
                    '<span style="display: inline-block; width: 12px; height: 12px; background: ' + routeColor + '; border-radius: 50%; flex-shrink: 0;"></span>' +
                    '<strong style="color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + routeName + '</strong>' +
                '</div>' +
                '<span style="background: ' + hazardColor + '; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; flex-shrink: 0;">Score ' + hazardCount + '</span>' +
            '</div>' +
            '<div style="font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' +
                '⏱️ ' + route.duration_minutes + ' min | 📏 ' + opts.distanceText + ' ' + opts.distUnit +
                ' | ⛽ ' + fuelLitres + ' ' + fuelUnit +
                ' | 💰 ' + opts.currencySymbol + totalCost +
            '</div>'
        );
    }

    /**
     * Pick which route option to use during navigation after a reroute response.
     * @param {Array<Object>|null|undefined} routeList
     * @param {Object|null|undefined} singleRoutePayload
     * @param {Object} [opts]
     * @param {boolean} [opts.preferPrimary]
     * @param {string} [opts.previousRouteName]
     * @returns {Object|null}
     */
    function pickActiveRouteDuringNavigation(routeList, singleRoutePayload, opts) {
        opts = opts || {};
        if (!routeList || routeList.length === 0) {
            return singleRoutePayload || null;
        }
        if (opts.preferPrimary) {
            return routeList[0];
        }
        var activeRoute = routeList[0];
        if (routeList.length > 1 && opts.previousRouteName) {
            var prevName = String(opts.previousRouteName).toLowerCase();
            if (prevName) {
                for (var i = 0; i < routeList.length; i++) {
                    var name = (routeList[i].name || '').toLowerCase();
                    if (name === prevName) {
                        return routeList[i];
                    }
                }
            }
        }
        return activeRoute;
    }

    /**
     * Greedy nearest-neighbour ordering of via-points and stops between start and end.
     * @param {number} startLat
     * @param {number} startLon
     * @param {number} endLat
     * @param {number} endLon
     * @param {Array<Object>} viaPoints
     * @param {Array<Object>} stops
     * @returns {Array<Object>}
     */
    function orderWaypointsGreedy(startLat, startLon, endLat, endLon, viaPoints, stops) {
        var waypoints = [{ lat: startLat, lon: startLon, type: 'start' }];
        var intermediate = (viaPoints || []).concat(stops || []);

        if (intermediate.length > 0) {
            var remaining = intermediate.slice();
            var current = { lat: startLat, lon: startLon };

            while (remaining.length > 0) {
                var closestIdx = 0;
                var closestDist = Infinity;
                for (var i = 0; i < remaining.length; i++) {
                    var dist = Math.sqrt(
                        Math.pow(remaining[i].lat - current.lat, 2) +
                        Math.pow(remaining[i].lon - current.lon, 2)
                    );
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestIdx = i;
                    }
                }
                waypoints.push(remaining[closestIdx]);
                current = remaining[closestIdx];
                remaining.splice(closestIdx, 1);
            }
        }

        waypoints.push({ lat: endLat, lon: endLon, type: 'end' });
        return waypoints;
    }

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
        ROUTE_COLORS: ROUTE_COLORS,
        NAV_ACTIVE_ROUTE_COLOR: NAV_ACTIVE_ROUTE_COLOR,
        hazardBadgeColor: hazardBadgeColor,
        computeRouteTotalCost: computeRouteTotalCost,
        resolveRouteColor: resolveRouteColor,
        buildTripInfoDisplayValues: buildTripInfoDisplayValues,
        buildRouteComparisonCardHtml: buildRouteComparisonCardHtml,
        buildRouteComparisonListHtml: buildRouteComparisonListHtml,
        buildPreviewAlternativeRouteCardHtml: buildPreviewAlternativeRouteCardHtml,
        pickActiveRouteDuringNavigation: pickActiveRouteDuringNavigation,
        orderWaypointsGreedy: orderWaypointsGreedy,
        mergeNavigationRouteFromSelected: mergeNavigationRouteFromSelected,
        mergeLastCalculatedRouteFromSelection: mergeLastCalculatedRouteFromSelection,
        buildRoutePayloadFromPersisted: buildRoutePayloadFromPersisted,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSelection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

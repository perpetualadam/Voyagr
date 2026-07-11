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

    var ROUTE_COMPARISON_MODAL_ID = 'routeComparisonModal';

    /**
     * Full-screen overlay style for the route comparison modal.
     * @returns {string}
     */
    function getRouteComparisonModalOverlayStyleCssText() {
        return 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    }

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
     * Normalize route options for POST /api/route-comparison.
     * @param {Array<Object>} routes
     * @returns {Array<Object>}
     */
    function buildRouteComparisonRequestRoutes(routes) {
        routes = routes || [];
        var out = [];
        for (var i = 0; i < routes.length; i++) {
            var route = routes[i] || {};
            out.push({
                distance_km: route.distance_km || 0,
                duration_minutes: route.duration_minutes || 0,
                fuel_cost: route.fuel_cost || 0,
                toll_cost: route.toll_cost || 0,
                caz_cost: route.caz_cost || 0,
            });
        }
        return out;
    }

    /**
     * @param {Object} route
     * @param {number} index
     * @param {Object} opts
     * @returns {string}
     */
    function buildRouteComparisonTableRowHtml(route, index, opts) {
        opts = opts || {};
        var bgColor = index % 2 === 0 ? '#f9f9f9' : '#fff';
        return (
            '<tr style="background: ' + bgColor + '; border-bottom: 1px solid #ddd;">' +
                '<td style="padding: 8px;"><strong>Route ' + route.route_id + '</strong></td>' +
                '<td style="padding: 8px; text-align: center;">' + opts.distanceText + ' ' + opts.distUnit + '</td>' +
                '<td style="padding: 8px; text-align: center;">' + Math.round(route.duration_minutes || 0) + ' min</td>' +
                '<td style="padding: 8px; text-align: center;"><strong>' + opts.currencySymbol + route.total_cost.toFixed(2) + '</strong></td>' +
                '<td style="padding: 8px; text-align: center;">' + opts.currencySymbol + route.cost_per_km.toFixed(2) + '</td>' +
            '</tr>'
        );
    }

    /**
     * @param {Array<Object>} routes
     * @param {Object} opts
     * @returns {string}
     */
    function buildRouteComparisonTableHtml(routes, opts) {
        routes = routes || [];
        opts = opts || {};
        var html = '<div style="overflow-x: auto; margin: 10px 0;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
        html += '<thead><tr style="background: #667eea; color: white;">';
        html += '<th style="padding: 8px; text-align: left;">Route</th>';
        html += '<th style="padding: 8px; text-align: center;">Distance</th>';
        html += '<th style="padding: 8px; text-align: center;">Time</th>';
        html += '<th style="padding: 8px; text-align: center;">Cost</th>';
        html += '<th style="padding: 8px; text-align: center;">Cost/km</th>';
        html += '</tr></thead><tbody>';
        for (var i = 0; i < routes.length; i++) {
            html += buildRouteComparisonTableRowHtml(routes[i], i, {
                currencySymbol: opts.currencySymbol,
                distUnit: opts.distUnit,
                distanceText: opts.distanceTexts ? opts.distanceTexts[i] : opts.distanceText,
            });
        }
        html += '</tbody></table></div>';
        return html;
    }

    /**
     * @param {Object} recommendations
     * @returns {string}
     */
    function buildRouteComparisonRecommendationsHtml(recommendations) {
        recommendations = recommendations || {};
        var html = '<div style="margin-top: 15px; padding: 10px; background: #f0f4ff; border-radius: 6px;">';
        html += '<strong style="color: #667eea;">💡 Recommendations:</strong><br>';
        html += '<div style="margin-top: 8px; font-size: 12px;">';
        if (recommendations.cheapest) {
            html += '<div style="margin-bottom: 6px;">💰 <strong>Cheapest:</strong> Route ' +
                recommendations.cheapest.route_id + ' - ' + recommendations.cheapest.reason + '</div>';
        }
        if (recommendations.fastest) {
            html += '<div style="margin-bottom: 6px;">⚡ <strong>Fastest:</strong> Route ' +
                recommendations.fastest.route_id + ' - ' + recommendations.fastest.reason + '</div>';
        }
        if (recommendations.shortest) {
            html += '<div>📍 <strong>Shortest:</strong> Route ' +
                recommendations.shortest.route_id + ' - ' + recommendations.shortest.reason + '</div>';
        }
        html += '</div></div>';
        return html;
    }

    /**
     * Full comparison report (table + recommendations).
     * @param {Object} comparison
     * @param {Object} opts
     * @returns {string}
     */
    function buildRouteComparisonReportHtml(comparison, opts) {
        comparison = comparison || {};
        opts = opts || {};
        var html = buildRouteComparisonTableHtml(comparison.routes, opts);
        if (comparison.recommendations) {
            html += buildRouteComparisonRecommendationsHtml(comparison.recommendations);
        }
        return html;
    }

    /**
     * Modal shell HTML for the route comparison report.
     * @param {string} reportHtml
     * @returns {string}
     */
    function buildRouteComparisonModalHtml(reportHtml) {
        return (
            '<div style="background: white; padding: 20px; border-radius: 12px; max-width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">' +
                    '<h3 style="margin: 0; color: #333;">Route Comparison</h3>' +
                    '<button onclick="document.getElementById(\'routeComparisonModal\').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">×</button>' +
                '</div>' +
                reportHtml +
                '<div style="margin-top: 15px; display: flex; gap: 10px;">' +
                    '<button onclick="document.getElementById(\'routeComparisonModal\').remove()" style="flex: 1; padding: 10px; background: #ddd; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Close</button>' +
                '</div>' +
            '</div>'
        );
    }

    /**
     * @param {number} routeCount
     * @returns {boolean}
     */
    function hasRoutesForComparison(routeCount) {
        return routeCount >= 1;
    }

    /**
     * @param {Object} comparison
     * @param {Object} opts
     * @returns {Object}
     */
    function buildRouteComparisonModalMountPlan(comparison, opts) {
        opts = opts || {};
        var reportHtml = buildRouteComparisonReportHtml(comparison, opts);
        return {
            modalId: ROUTE_COMPARISON_MODAL_ID,
            overlayStyle: getRouteComparisonModalOverlayStyleCssText(),
            innerHtml: buildRouteComparisonModalHtml(reportHtml),
        };
    }

    /**
     * @returns {string}
     */
    function getRouteComparisonNoRoutesMessage() {
        return 'No routes available. Calculate a route first.';
    }

    /**
     * @returns {string}
     */
    function getRouteComparisonSingleRouteMessage() {
        return 'Only 1 route available';
    }

    /**
     * @returns {string}
     */
    function getRouteComparisonSuccessMessage() {
        return '📊 Route comparison displayed';
    }

    /**
     * @param {string} error
     * @returns {string}
     */
    function getRouteComparisonApiErrorMessage(error) {
        return 'Error comparing routes: ' + (error || 'Unknown error');
    }

    /**
     * Container style for a preview alternative-route card.
     * @param {string} routeColor
     * @returns {string}
     */
    function getPreviewAlternativeRouteCardContainerStyleCssText(routeColor) {
        return 'background: white; padding: 10px; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid ' +
            routeColor + '; border: 2px solid #ddd; cursor: pointer; transition: all 0.3s ease; overflow: hidden;';
    }

    /**
     * Hover style for a preview alternative-route card.
     * @param {string} routeColor
     * @returns {{ borderColor: string, background: string }}
     */
    function getPreviewAlternativeRouteCardHoverStyle(routeColor) {
        return { borderColor: routeColor, background: '#f0f4ff' };
    }

    /**
     * Rest style after hover for a preview alternative-route card.
     * @returns {{ borderColor: string, background: string }}
     */
    function getPreviewAlternativeRouteCardRestStyle() {
        return { borderColor: '#ddd', background: 'white' };
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
     * @param {number} routeCount
     * @returns {boolean}
     */
    function shouldShowPreviewAlternativeRoutes(routeCount) {
        return routeCount > 1;
    }

    /**
     * Mount plan for one preview alternative-route card.
     * @param {Object} route
     * @param {number} index
     * @param {Object} opts
     * @returns {Object}
     */
    function buildPreviewAlternativeRouteCardMountPlan(route, index, opts) {
        opts = opts || {};
        var routeColor = resolveRouteColor(index, opts.routeColors);
        return {
            routeColor: routeColor,
            containerStyle: getPreviewAlternativeRouteCardContainerStyleCssText(routeColor),
            html: buildPreviewAlternativeRouteCardHtml(route, index, opts),
            hoverStyle: getPreviewAlternativeRouteCardHoverStyle(routeColor),
            restStyle: getPreviewAlternativeRouteCardRestStyle(),
        };
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
     * Apply plan after a successful in-navigation `/api/route` reroute response.
     * @param {Object} activeRoute - Selected route option from pickActiveRouteDuringNavigation
     * @param {Object} data - Full API response payload
     * @param {string} geocodedEnd - Destination "lat,lon" string
     * @param {string} destinationLabel - Human-readable end address/name
     * @param {Object} [voiceOpts]
     * @param {boolean} [voiceOpts.enabled]
     * @param {function(number): number} [voiceOpts.convertDistance]
     * @param {string} [voiceOpts.distUnit]
     * @returns {Object}
     */
    function buildInNavRerouteSuccessPlan(activeRoute, data, geocodedEnd, destinationLabel, voiceOpts) {
        activeRoute = activeRoute || {};
        data = data || {};
        voiceOpts = voiceOpts || {};
        var durationMinutes = activeRoute.duration_minutes || (data.time ? parseInt(data.time, 10) : 0);
        var lastCalculatedRoutePatch = {};
        for (var k in data) {
            if (Object.prototype.hasOwnProperty.call(data, k)) {
                lastCalculatedRoutePatch[k] = data[k];
            }
        }
        for (var ak in activeRoute) {
            if (Object.prototype.hasOwnProperty.call(activeRoute, ak)) {
                lastCalculatedRoutePatch[ak] = activeRoute[ak];
            }
        }
        lastCalculatedRoutePatch.duration_minutes = durationMinutes;
        lastCalculatedRoutePatch.destination = geocodedEnd;
        lastCalculatedRoutePatch.destinationName = destinationLabel;

        var speakMessage = null;
        if (voiceOpts.enabled && typeof voiceOpts.convertDistance === 'function') {
            var displayDist = voiceOpts.convertDistance(
                activeRoute.distance_km || parseFloat(data.distance) || 0
            );
            var distUnit = voiceOpts.distUnit || '';
            speakMessage = 'Route recalculated. ' + displayDist + ' ' + distUnit + ', ' +
                Math.round(durationMinutes) + ' minutes.';
        }

        return {
            lastCalculatedRoutePatch: lastCalculatedRoutePatch,
            durationMinutes: durationMinutes,
            speakMessage: speakMessage,
            statusMessage: '✅ Route recalculated — continuing navigation',
            statusType: 'success',
            noRouteErrorMessage: '❌ No route returned',
        };
    }

    /**
     * Resolve polyline decode precision from API payload (OSRM uses 5, default 6).
     * @param {Object} data
     * @returns {number}
     */
    function resolveRouteGeometryPrecision(data) {
        data = data || {};
        if (Number.isFinite(data.geometry_precision)) {
            return data.geometry_precision;
        }
        var sourceLower = String(data.source || '').toLowerCase();
        return sourceLower.indexOf('osrm') >= 0 ? 5 : 6;
    }

    /**
     * @param {[number,number]|null|undefined} point
     * @returns {boolean}
     */
    function isValidDecodedRoutePoint(point) {
        if (!point || isNaN(point[0]) || isNaN(point[1])) return false;
        if (point[0] === 0 && point[1] === 0) return false;
        return true;
    }

    /**
     * @param {[number,number]} startCoords
     * @param {[number,number]} endCoords
     * @returns {Array<[number,number]>}
     */
    function buildStraightLineRoutePath(startCoords, endCoords) {
        return [[startCoords[0], startCoords[1]], [endCoords[0], endCoords[1]]];
    }

    /**
     * Decode route geometry for map preview, falling back to a straight line when invalid.
     * @param {[number,number]} startCoords
     * @param {[number,number]} endCoords
     * @param {Object} data
     * @param {function(string, number): Array<[number,number]>} decodePolyline
     * @returns {{ routePath: Array<[number,number]>, precision: (number|null), usedFallback: boolean }}
     */
    function resolvePreviewRoutePath(startCoords, endCoords, data, decodePolyline) {
        var fallback = buildStraightLineRoutePath(startCoords, endCoords);
        data = data || {};
        if (!data.geometry || typeof decodePolyline !== 'function') {
            return { routePath: fallback, precision: null, usedFallback: true };
        }
        try {
            var precision = resolveRouteGeometryPrecision(data);
            var routePath = decodePolyline(data.geometry, precision);
            if (!routePath || routePath.length === 0 || !isValidDecodedRoutePoint(routePath[0])) {
                return { routePath: fallback, precision: precision, usedFallback: true };
            }
            return { routePath: routePath, precision: precision, usedFallback: false };
        } catch (_e) {
            return {
                routePath: fallback,
                precision: resolveRouteGeometryPrecision(data),
                usedFallback: true,
            };
        }
    }

    /**
     * Success status banner after calculateRoute returns a valid route.
     * @param {Object} data
     * @returns {string}
     */
    function buildRouteCalculatedStatusMessage(data) {
        data = data || {};
        var statusMsg = 'Route calculated successfully!';
        if (data.response_time_ms) {
            statusMsg += ' (' + Math.round(data.response_time_ms) + 'ms)';
        }
        if (data.source && String(data.source).indexOf('Custom Router') >= 0) {
            statusMsg += ' ⚡ Ultra-fast!';
        }
        if (data.via_points_count > 0 || data.stops_count > 0) {
            statusMsg += ' 📍 ' + (data.via_points_count || 0) + ' via-points, ' + (data.stops_count || 0) + ' stops';
        }
        if (data.multi_drop && data.optimized) {
            statusMsg += ' (optimized order)';
        }
        return statusMsg;
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

    /**
     * Resolve the route object used for preview (full API payload or single route option).
     * @param {Object|null|undefined} routeData
     * @param {number} [selectedRouteIndex]
     * @returns {Object}
     */
    function resolvePreviewRoute(routeData, selectedRouteIndex) {
        if (!routeData) return {};
        if (routeData.routes && routeData.routes.length > 0) {
            var idx = Math.max(0, Math.min(Number(selectedRouteIndex) || 0, routeData.routes.length - 1));
            return routeData.routes[idx];
        }
        return routeData;
    }

    /**
     * Resolve preview distance in km from route payload fallbacks.
     * @param {Object} routeData
     * @param {Object} previewSlice
     * @returns {number}
     */
    function resolvePreviewDistanceKm(routeData, previewSlice) {
        routeData = routeData || {};
        previewSlice = previewSlice || {};
        var distanceKm = previewSlice.distance_km || 0;
        if (!distanceKm && routeData.routes && routeData.routes.length > 0) {
            distanceKm = routeData.routes[0].distance_km || 0;
        } else if (!distanceKm && routeData.distance_km) {
            distanceKm = routeData.distance_km;
        } else if (!distanceKm && routeData.distance) {
            distanceKm = parseFloat(routeData.distance) || 0;
        }
        return distanceKm;
    }

    /**
     * Cost breakdown values for route preview panel.
     * @param {Object} previewSlice
     * @param {Object} routeData
     * @returns {Object}
     */
    function buildPreviewCostValues(previewSlice, routeData) {
        previewSlice = previewSlice || {};
        routeData = routeData || {};
        var fuelCost = parseFloat(previewSlice.fuel_cost != null ? previewSlice.fuel_cost : (routeData.fuel_cost || 0));
        var fuelLitres = parseFloat(previewSlice.fuel_litres != null ? previewSlice.fuel_litres : (routeData.fuel_litres || 0));
        var tollCost = parseFloat(previewSlice.toll_cost != null ? previewSlice.toll_cost : (routeData.toll_cost || 0));
        var cazCost = parseFloat(previewSlice.caz_cost != null ? previewSlice.caz_cost : (routeData.caz_cost || 0));
        return {
            fuelCost: fuelCost,
            fuelLitres: fuelLitres,
            tollCost: tollCost,
            cazCost: cazCost,
            totalCost: fuelCost + tollCost + cazCost,
            durationMinutes: previewSlice.duration_minutes != null
                ? previewSlice.duration_minutes
                : (routeData.time != null ? routeData.time : routeData.duration_minutes),
        };
    }

    /**
     * CAZ status HTML for route preview.
     * @param {Object} cazDetails
     * @param {number} cazCost
     * @param {string} currencySymbol
     * @returns {{ html: string, visible: boolean }}
     */
    function buildCazStatusHtml(cazDetails, cazCost, currencySymbol) {
        cazDetails = cazDetails || {};
        var zonesCrossed = cazDetails.zones_crossed && cazDetails.zones_crossed.length > 0;
        if (zonesCrossed) {
            if (cazDetails.is_exempt) {
                return {
                    visible: true,
                    html: '<div style="color: #4caf50; font-size: 12px;">✅ CAZ Exempt (' + (cazDetails.exemption_reason || 'Electric Vehicle') + ')</div>',
                };
            }
            if (cazDetails.pass_covers) {
                return {
                    visible: true,
                    html: '<div style="color: #2196f3; font-size: 12px;">🎫 CAZ covered by ' + (cazDetails.pass_type || 'Pass') + '</div>',
                };
            }
            return {
                visible: true,
                html: '<div style="color: #ff9800; font-size: 12px;">⚠️ Passes through: ' + cazDetails.zones_crossed.join(', ') + '</div>',
            };
        }
        if (cazCost > 0) {
            return {
                visible: true,
                html: '<div style="color: #ff9800; font-size: 12px;">⚠️ CAZ charge included in total (' + currencySymbol + cazCost.toFixed(2) + '). Zone names unavailable for this route.</div>',
            };
        }
        return { visible: false, html: '' };
    }

    /**
     * Hazard preview panel display state for route preview.
     * @param {Object} o
     * @returns {Object}
     */
    function getHazardPreviewPanelState(o) {
        o = o || {};
        if (o.preferencesApplied && o.camerasNearRoute != null) {
            return {
                visible: true,
                title: '✓ Route preferences applied',
                countLabel: 'Route score:',
                count: String(o.camerasNearRoute),
                showPenalty: o.hazardPenaltySeconds > 0,
                penaltyMinutes: o.hazardPenaltySeconds > 0 ? Math.round(o.hazardPenaltySeconds / 60) : 0,
                background: o.camerasNearRoute === 0 ? '#E8F5E9' : '#FFF3E0',
                borderLeftColor: o.camerasNearRoute === 0 ? '#4CAF50' : '#FF9800',
            };
        }
        if (o.hazardCount > 0 && o.hazardPenaltySeconds > 0) {
            return {
                visible: true,
                title: '⚠️ Route alerts',
                countLabel: 'Route score:',
                count: String(o.hazardCount),
                showPenalty: true,
                penaltyMinutes: Math.round(o.hazardPenaltySeconds / 60),
                background: '#FFF3E0',
                borderLeftColor: '#FF9800',
            };
        }
        return { visible: false };
    }

    /**
     * DOM apply plan for the route-preview hazard info panel.
     * @param {Object} state - Output from {@link getHazardPreviewPanelState}.
     * @returns {Object}
     */
    function buildHazardPreviewPanelApplyPlan(state) {
        state = state || {};
        if (!state.visible) {
            return { visible: false, containerDisplay: 'none' };
        }
        return {
            visible: true,
            containerDisplay: 'block',
            containerBackground: state.background,
            containerBorderLeftColor: state.borderLeftColor,
            count: state.count,
            countLabel: state.countLabel,
            title: state.title,
            penaltyRowDisplay: state.showPenalty ? 'flex' : 'none',
            penaltyText: state.showPenalty ? String(state.penaltyMinutes) + ' min' : null,
        };
    }

    var api = {
        ROUTE_COLORS: ROUTE_COLORS,
        NAV_ACTIVE_ROUTE_COLOR: NAV_ACTIVE_ROUTE_COLOR,
        ROUTE_COMPARISON_MODAL_ID: ROUTE_COMPARISON_MODAL_ID,
        getRouteComparisonModalOverlayStyleCssText: getRouteComparisonModalOverlayStyleCssText,
        hazardBadgeColor: hazardBadgeColor,
        computeRouteTotalCost: computeRouteTotalCost,
        resolveRouteColor: resolveRouteColor,
        buildTripInfoDisplayValues: buildTripInfoDisplayValues,
        buildRouteComparisonCardHtml: buildRouteComparisonCardHtml,
        buildRouteComparisonListHtml: buildRouteComparisonListHtml,
        buildRouteComparisonRequestRoutes: buildRouteComparisonRequestRoutes,
        buildRouteComparisonTableRowHtml: buildRouteComparisonTableRowHtml,
        buildRouteComparisonTableHtml: buildRouteComparisonTableHtml,
        buildRouteComparisonRecommendationsHtml: buildRouteComparisonRecommendationsHtml,
        buildRouteComparisonReportHtml: buildRouteComparisonReportHtml,
        buildRouteComparisonModalHtml: buildRouteComparisonModalHtml,
        hasRoutesForComparison: hasRoutesForComparison,
        buildRouteComparisonModalMountPlan: buildRouteComparisonModalMountPlan,
        getRouteComparisonNoRoutesMessage: getRouteComparisonNoRoutesMessage,
        getRouteComparisonSingleRouteMessage: getRouteComparisonSingleRouteMessage,
        getRouteComparisonSuccessMessage: getRouteComparisonSuccessMessage,
        getRouteComparisonApiErrorMessage: getRouteComparisonApiErrorMessage,
        getPreviewAlternativeRouteCardContainerStyleCssText: getPreviewAlternativeRouteCardContainerStyleCssText,
        getPreviewAlternativeRouteCardHoverStyle: getPreviewAlternativeRouteCardHoverStyle,
        getPreviewAlternativeRouteCardRestStyle: getPreviewAlternativeRouteCardRestStyle,
        buildPreviewAlternativeRouteCardHtml: buildPreviewAlternativeRouteCardHtml,
        shouldShowPreviewAlternativeRoutes: shouldShowPreviewAlternativeRoutes,
        buildPreviewAlternativeRouteCardMountPlan: buildPreviewAlternativeRouteCardMountPlan,
        pickActiveRouteDuringNavigation: pickActiveRouteDuringNavigation,
        buildInNavRerouteSuccessPlan: buildInNavRerouteSuccessPlan,
        resolveRouteGeometryPrecision: resolveRouteGeometryPrecision,
        isValidDecodedRoutePoint: isValidDecodedRoutePoint,
        buildStraightLineRoutePath: buildStraightLineRoutePath,
        resolvePreviewRoutePath: resolvePreviewRoutePath,
        buildRouteCalculatedStatusMessage: buildRouteCalculatedStatusMessage,
        orderWaypointsGreedy: orderWaypointsGreedy,
        resolvePreviewRoute: resolvePreviewRoute,
        resolvePreviewDistanceKm: resolvePreviewDistanceKm,
        buildPreviewCostValues: buildPreviewCostValues,
        buildCazStatusHtml: buildCazStatusHtml,
        getHazardPreviewPanelState: getHazardPreviewPanelState,
        buildHazardPreviewPanelApplyPlan: buildHazardPreviewPanelApplyPlan,
        mergeNavigationRouteFromSelected: mergeNavigationRouteFromSelected,
        mergeLastCalculatedRouteFromSelection: mergeLastCalculatedRouteFromSelection,
        buildRoutePayloadFromPersisted: buildRoutePayloadFromPersisted,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSelection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

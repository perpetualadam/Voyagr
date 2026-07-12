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
     * Line style for a route preview/alternative layer on the map.
     * @param {number} index
     * @param {number} selectedRouteIndex
     * @param {string[]} [routeColors]
     * @returns {{ color: string, weight: number, opacity: number }}
     */
    function buildRouteLayerStyle(index, selectedRouteIndex, routeColors) {
        return {
            color: resolveRouteColor(index, routeColors),
            weight: (index === selectedRouteIndex) ? 10 : (index === 0 ? 8 : 6),
            opacity: (index === selectedRouteIndex) ? 1.0 : 0.85,
        };
    }

    /**
     * Convert [lat, lon] polyline to MapLibre [lon, lat] coordinates.
     * @param {Array<[number,number]>} polylinePoints
     * @returns {Array<[number,number]>}
     */
    function latLonPolylineToLngLatCoords(polylinePoints) {
        polylinePoints = polylinePoints || [];
        var out = [];
        for (var i = 0; i < polylinePoints.length; i++) {
            var p = polylinePoints[i];
            if (Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) {
                out.push([p[1], p[0]]);
            }
        }
        return out;
    }

    /**
     * GeoJSON Feature for a route line source.
     * @param {Array<[number,number]>} lngLatCoords
     * @returns {Object}
     */
    function buildRouteLineGeoJsonFeature(lngLatCoords) {
        return {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: lngLatCoords,
            },
        };
    }

    /**
     * First symbol layer with a text field — insert map layers before labels.
     * @param {Array<Object>} styleLayers
     * @returns {string|undefined}
     */
    function findFirstTextSymbolLayerId(styleLayers) {
        if (!styleLayers || !styleLayers.length) return undefined;
        for (var i = 0; i < styleLayers.length; i++) {
            var layer = styleLayers[i];
            if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                return layer.id;
            }
        }
        return undefined;
    }

    /**
     * All symbol layer ids with text fields (for label z-order fixes).
     * @param {Array<Object>} styleLayers
     * @returns {string[]}
     */
    function collectTextSymbolLayerIds(styleLayers) {
        if (!styleLayers || !styleLayers.length) return [];
        var ids = [];
        for (var i = 0; i < styleLayers.length; i++) {
            var layer = styleLayers[i];
            if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                ids.push(layer.id);
            }
        }
        return ids;
    }

    /**
     * Mount plan for one route line layer (pure; app performs map.addSource/addLayer).
     * @param {Object} route
     * @param {number} index
     * @param {number} selectedRouteIndex
     * @param {Object} [opts]
     * @param {string[]} [opts.routeColors]
     * @returns {Object}
     */
    function buildRouteLayerMountPlan(route, index, selectedRouteIndex, opts) {
        opts = opts || {};
        route = route || {};
        var polylinePoints = route.polyline || [];
        var lngLatCoords = latLonPolylineToLngLatCoords(polylinePoints);
        return {
            layerId: 'route-layer-' + index,
            sourceId: 'route-source-' + index,
            routeName: route.name,
            polylinePointCount: polylinePoints.length,
            lngLatCoords: lngLatCoords,
            geoJsonFeature: buildRouteLineGeoJsonFeature(lngLatCoords),
            style: buildRouteLayerStyle(index, selectedRouteIndex, opts.routeColors),
            valid: lngLatCoords.length >= 2,
        };
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
     * Apply plan for the trip-info panel after calculateRoute or similar.
     * @param {*} distance - km number or string
     * @param {*} time - duration string/number
     * @param {*} fuelCost
     * @param {*} tollCost
     * @param {Object} fmt - { distanceText, distUnit, currencySymbol }
     * @param {function(*): number} parseDurationMinutes
     * @returns {{ visible: boolean, display?: Object, dashFuel?: boolean, dashToll?: boolean, showAlongRouteSearch?: boolean }}
     */
    function buildTripInfoApplyPlan(distance, time, fuelCost, tollCost, fmt, parseDurationMinutes) {
        if (!distance || !time) return { visible: false };
        var distanceKm = parseFloat(distance) || 0;
        var durationMinutes = typeof parseDurationMinutes === 'function'
            ? parseDurationMinutes(time)
            : (parseInt(time, 10) || 0);
        var display = buildTripInfoDisplayValues({
            distance_km: distanceKm,
            duration_minutes: durationMinutes,
            fuel_cost: fuelCost === '-' ? 0 : fuelCost,
            toll_cost: tollCost === '-' ? 0 : tollCost,
        }, fmt);
        if (!display) return { visible: false };
        return {
            visible: true,
            display: display,
            dashFuel: fuelCost === '-',
            dashToll: tollCost === '-',
            showAlongRouteSearch: true,
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
     * DOM apply plan for the route comparison tab list panel.
     * @param {Object} opts
     * @param {Array<Object>} [opts.routes]
     * @param {Object} [opts.listOpts] - passed to buildRouteComparisonListHtml
     * @returns {Object}
     */
    function buildRouteComparisonListDomApplyPlan(opts) {
        opts = opts || {};
        var routes = opts.routes || [];
        return {
            containerId: 'routeComparisonList',
            innerHtml: buildRouteComparisonListHtml(routes, opts.listOpts || {}),
        };
    }

    /**
     * Orchestration plan for refreshing the route comparison tab list panel.
     * @param {Object} [opts]
     * @param {Array<Object>} [opts.routes]
     * @param {number} [opts.selectedRouteIndex]
     * @param {string[]} [opts.routeColors]
     * @param {string} [opts.currencySymbol]
     * @param {string} [opts.distUnit]
     * @param {string[]} [opts.distanceTexts]
     * @returns {Object}
     */
    function buildDisplayRouteComparisonOrchestrationPlan(opts) {
        opts = opts || {};
        var routes = opts.routes || [];
        var listOpts = {};
        if (routes.length > 0) {
            listOpts = {
                selectedIndex: opts.selectedRouteIndex != null ? opts.selectedRouteIndex : 0,
                routeColors: opts.routeColors,
                currencySymbol: opts.currencySymbol,
                distUnit: opts.distUnit,
                distanceTexts: opts.distanceTexts,
            };
        }
        return {
            shouldDisplay: true,
            domPlan: buildRouteComparisonListDomApplyPlan({
                routes: routes,
                listOpts: listOpts,
            }),
        };
    }

    /**
     * Orchestration plan for selecting a route from the comparison list.
     * @param {number} index
     * @param {Array<Object>} routeOptions
     * @param {Object} [runtime]
     * @returns {Object}
     */
    function buildUseRouteOrchestrationPlan(index, routeOptions, runtime) {
        runtime = runtime || {};
        var route = routeOptions && routeOptions[index];
        if (!route) {
            return { shouldUse: false };
        }
        var polylinePoints = route.polyline || [];
        var previewTraffic = !!(
            runtime.routeTrafficEnabled &&
            polylinePoints.length > 0
        );
        return {
            shouldUse: true,
            selectedRouteIndex: index,
            route: route,
            statusMessage: 'Route selected. Ready to navigate!',
            statusType: 'success',
            previewTraffic: previewTraffic,
            previewPolyline: previewTraffic ? polylinePoints : null,
        };
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
     * DOM apply plan for mounting the route comparison modal overlay.
     * @param {Object|null|undefined} mountPlan - from buildRouteComparisonModalMountPlan
     * @returns {Object}
     */
    function buildRouteComparisonModalDomApplyPlan(mountPlan) {
        if (!mountPlan) {
            return { action: 'skip' };
        }
        return {
            action: 'mount',
            modalId: mountPlan.modalId,
            overlayStyle: mountPlan.overlayStyle,
            innerHtml: mountPlan.innerHtml,
            dismissOnOverlayClick: true,
            removeExisting: true,
        };
    }

    /**
     * Execute plan for mounting the route comparison modal overlay.
     * @param {Object|null|undefined} domPlan - from buildRouteComparisonModalDomApplyPlan
     * @returns {Object}
     */
    function buildRouteComparisonModalExecutePlan(domPlan) {
        domPlan = domPlan || {};
        return {
            shouldExecute: domPlan.action === 'mount',
            modalId: domPlan.modalId,
            overlayStyle: domPlan.overlayStyle,
            innerHtml: domPlan.innerHtml,
            dismissOnOverlayClick: !!domPlan.dismissOnOverlayClick,
            removeExisting: !!domPlan.removeExisting,
        };
    }

    /**
     * Orchestration plan for showRouteComparison entry validation.
     * @param {number} [routeCount]
     * @returns {Object}
     */
    function buildShowRouteComparisonOrchestrationPlan(routeCount) {
        var count = routeCount || 0;
        var base = {
            entryLogMessage: '[RouteComparison] showRouteComparison called',
            routeCount: count,
        };
        if (!hasRoutesForComparison(count)) {
            return Object.assign({}, base, {
                shouldProceed: false,
                errorStatusMessage: getRouteComparisonNoRoutesMessage(),
                errorLogMessage: '[RouteComparison] No routes available:',
            });
        }
        return Object.assign({}, base, {
            shouldProceed: true,
            singleRouteWarning: count < 2,
            singleRouteStatusMessage: getRouteComparisonSingleRouteMessage(),
            singleRouteLogMessage: '[RouteComparison] Only 1 route available, showing it anyway',
            routesLogPrefix: '[RouteComparison] Sending routes to API:',
        });
    }

    /**
     * Execute plan after a successful route-comparison API response.
     * @param {Object} o
     * @param {boolean} o.apiSuccess
     * @param {string} [o.apiError]
     * @param {Object} [o.comparison]
     * @param {string} o.currencySymbol
     * @param {string} o.distUnit
     * @param {function(number): string} o.convertDistance
     * @returns {Object}
     */
    function buildShowRouteComparisonSuccessExecutePlan(o) {
        o = o || {};
        if (!o.apiSuccess) {
            return {
                shouldMountModal: false,
                errorStatusMessage: getRouteComparisonApiErrorMessage(o.apiError),
                errorLogMessage: '[RouteComparison] API error:',
            };
        }
        var comparison = o.comparison || {};
        var routes = comparison.routes || [];
        var mountPlan = buildRouteComparisonModalMountPlan(comparison, {
            currencySymbol: o.currencySymbol,
            distUnit: o.distUnit,
            distanceTexts: routes.map(function (route) {
                return typeof o.convertDistance === 'function'
                    ? o.convertDistance(route.distance_km)
                    : String(route.distance_km);
            }),
        });
        return {
            shouldMountModal: true,
            domApplyPlan: buildRouteComparisonModalDomApplyPlan(mountPlan),
            successStatusMessage: getRouteComparisonSuccessMessage(),
            responseLogPrefix: '[RouteComparison] API response:',
        };
    }

    /**
     * Fetch plan for route-comparison API request.
     * @param {Array<Object>} routesForComparison
     * @returns {Object}
     */
    function buildShowRouteComparisonFetchPlan(routesForComparison) {
        var routes = routesForComparison || [];
        return {
            shouldFetch: routes.length > 0,
            apiPath: '/api/route-comparison',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { routes: routes },
        };
    }

    /**
     * Execute plan when route-comparison fetch fails.
     * @param {Error|Object} error
     * @returns {Object}
     */
    function buildShowRouteComparisonErrorExecutePlan(error) {
        error = error || {};
        return {
            statusMessage: 'Error: ' + (error.message || 'unknown'),
            errorLogPrefix: '[Comparison] Error:',
            logArgs: [error],
        };
    }

    /**
     * Request orchestration plan for route-comparison API fetch.
     * @param {Array<Object>} [routeOptions]
     * @returns {Object}
     */
    function buildShowRouteComparisonRequestOrchestrationPlan(routeOptions) {
        var routesForComparison = buildRouteComparisonRequestRoutes(routeOptions || []);
        return {
            routesForComparison: routesForComparison,
            fetchPlan: buildShowRouteComparisonFetchPlan(routesForComparison),
        };
    }

    /**
     * Execute plan from a route-comparison API JSON response.
     * @param {Object} [data]
     * @param {Object} [fmt]
     * @param {string} [fmt.currencySymbol]
     * @param {string} [fmt.distUnit]
     * @param {function(number): string} [fmt.convertDistance]
     * @returns {Object}
     */
    function buildShowRouteComparisonApiResultExecutePlan(data, fmt) {
        data = data || {};
        fmt = fmt || {};
        return buildShowRouteComparisonSuccessExecutePlan({
            apiSuccess: !!data.success,
            apiError: data.error,
            comparison: data.comparison,
            currencySymbol: fmt.currencySymbol,
            distUnit: fmt.distUnit,
            convertDistance: fmt.convertDistance,
        });
    }

    /**
     * Orchestration plan for the "Show All Routes" button handler.
     * @param {number} [routeCount]
     * @returns {Object}
     */
    function buildShowAllRoutesOrchestrationPlan(routeCount) {
        var count = routeCount || 0;
        return {
            shouldShow: count > 0,
            displayAllRoutes: true,
            statusMessage: 'Showing all ' + count + ' routes',
            statusType: 'info',
        };
    }

    /**
     * Dispatch plan for selecting an alternative route.
     * @param {number} index
     * @param {Array<Object>} routeOptions
     * @returns {Object}
     */
    function buildSelectRouteDispatchPlan(index, routeOptions) {
        var routes = routeOptions || [];
        var route = routes[index];
        if (!route) {
            return { shouldSelect: false, selectedRouteIndex: index };
        }
        return {
            shouldSelect: true,
            selectedRouteIndex: index,
            displaySingleRoute: true,
            displayRouteComparison: true,
            syncLastCalculatedRoute: true,
            updateTripInfo: true,
            showRoutePreview: true,
            routeName: route.name || '',
            maneuverCount: Array.isArray(route.maneuvers) ? route.maneuvers.length : 0,
            logPrefix: '[Routes] Selected route',
        };
    }

    /**
     * Preview payload plan for a selected route option.
     * @param {Array<Object>} routeOptions
     * @param {number} index
     * @param {Object|null|undefined} lastRouteApiResponse
     * @returns {Object}
     */
    function buildSelectRoutePreviewPayloadPlan(routeOptions, index, lastRouteApiResponse) {
        var routes = routeOptions || [];
        var selectedRoute = routes[index];
        if (!selectedRoute) {
            return { shouldPreview: false };
        }
        return {
            shouldPreview: true,
            selectedRoute: selectedRoute,
            previewPayload: lastRouteApiResponse
                ? Object.assign({}, lastRouteApiResponse, { routes: routes })
                : selectedRoute,
        };
    }

    /**
     * Orchestration plan for selecting an alternative route.
     * @param {number} index
     * @param {Array<Object>} routeOptions
     * @param {Object|null|undefined} lastRouteApiResponse
     * @returns {Object}
     */
    function buildSelectRouteOrchestrationPlan(index, routeOptions, lastRouteApiResponse) {
        var dispatch = buildSelectRouteDispatchPlan(index, routeOptions);
        if (!dispatch.shouldSelect) {
            return {
                shouldSelect: false,
                selectedRouteIndex: dispatch.selectedRouteIndex,
            };
        }
        return {
            shouldSelect: true,
            selectedRouteIndex: dispatch.selectedRouteIndex,
            dispatch: dispatch,
            preview: buildSelectRoutePreviewPayloadPlan(
                routeOptions,
                index,
                lastRouteApiResponse
            ),
            selectedRoute: routeOptions[index],
        };
    }

    /**
     * Orchestration plan for displaying a single selected route on the map.
     * @param {number} index
     * @param {Array<Object>} routeOptions
     * @param {Object} [runtime]
     * @returns {Object}
     */
    function buildDisplaySingleRouteOrchestrationPlan(index, routeOptions, runtime) {
        runtime = runtime || {};
        var displayPlan = buildSingleRouteMapDisplayPlan(
            routeOptions && routeOptions[index],
            index,
            runtime.displayOpts || {}
        );
        var execute = buildSingleRouteMapDisplayExecutePlan(displayPlan);
        return {
            shouldExecute: execute.shouldExecute,
            entryLogMessage: '[Routes] displaySingleRoute(' + index + ') - clearing all existing routes',
            preClear: {
                clearRouteLayerHandle: true,
                clearAllRouteLayerHandles: true,
            },
            execute: execute,
        };
    }

    /**
     * Post-panel UI plan after route preview values are written to the DOM.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildRoutePreviewAfterDisplayPlan(opts) {
        opts = opts || {};
        var routes = opts.routeOptions || [];
        var selectedIdx = opts.selectedRouteIndex != null ? opts.selectedRouteIndex : 0;
        var previewPolyline = routes[selectedIdx] && routes[selectedIdx].polyline;
        return {
            switchToPreviewTab: true,
            expandBottomSheet: true,
            addTrafficLayer: !!opts.showTrafficEnabled && !opts.hasTrafficLayer,
            previewTraffic: !!(
                opts.routeTrafficEnabled &&
                routes.length > 0 &&
                previewPolyline &&
                previewPolyline.length > 0
            ),
            previewPolylineRouteIndex: selectedIdx,
        };
    }

    /**
     * Execute plan for post-preview tab, sheet, and traffic side effects.
     * @param {Object} afterPlan - from buildRoutePreviewAfterDisplayPlan
     * @returns {Object}
     */
    function buildRoutePreviewAfterDisplayExecutePlan(afterPlan) {
        afterPlan = afterPlan || {};
        return {
            shouldExecute: true,
            switchToPreviewTab: !!afterPlan.switchToPreviewTab,
            expandBottomSheet: !!afterPlan.expandBottomSheet,
            addTrafficLayer: !!afterPlan.addTrafficLayer,
            previewTraffic: !!afterPlan.previewTraffic,
            previewPolylineRouteIndex: afterPlan.previewPolylineRouteIndex != null
                ? afterPlan.previewPolylineRouteIndex
                : 0,
            previewTrafficLogMessage: '[Route Preview] Fetching traffic edges for preview route',
        };
    }

    /**
     * Orchestration plan for showRoutePreview entry and side-effect sequencing.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildShowRoutePreviewOrchestrationPlan(opts) {
        opts = opts || {};
        if (!opts.routeData) {
            return {
                shouldShow: false,
                errorStatusMessage: 'No route data available',
                errorLogMessage: '[Route Preview] No route data provided',
            };
        }
        if (opts.routeInProgress) {
            return {
                shouldShow: false,
                delegateToNavUpdate: true,
            };
        }
        var routeOptionsCount = opts.routeOptionsCount || 0;
        return {
            shouldShow: true,
            entryLogMessage: '[Route Preview] showRoutePreview called with data:',
            panelInput: {
                routeData: opts.routeData,
                selectedRouteIndex: opts.selectedRouteIndex != null ? opts.selectedRouteIndex : 0,
                currencySymbol: opts.currencySymbol,
                distanceText: opts.distanceText,
                startLabel: opts.startLabel,
                endLabel: opts.endLabel,
                routingMode: opts.routingMode,
                vehicleType: opts.vehicleType,
                distanceUnit: opts.distanceUnit,
                preferencesApplied: !!opts.preferencesApplied,
                routeOptionsCount: routeOptionsCount,
                skipMapDisplay: !!opts.skipMapDisplay,
            },
            showAlternativeRoutesWhenMultiple: routeOptionsCount > 1,
            showMapRoutes: !opts.skipMapDisplay && routeOptionsCount > 0,
            afterDisplayInput: {
                routeOptions: opts.routeOptions,
                selectedRouteIndex: opts.selectedRouteIndex,
                showTrafficEnabled: !!opts.showTrafficEnabled,
                hasTrafficLayer: !!opts.hasTrafficLayer,
                routeTrafficEnabled: !!opts.routeTrafficEnabled,
            },
            switchTabLogMessage: '[Route Preview] Switching to routePreview tab',
            mapRoutesLogMessage: '[Route Preview] Displayed ' + routeOptionsCount + ' route(s) on map',
            alternativeRoutesLogMessage: '[Route Preview] Showing alternative routes panel',
            successLogMessage: '[Route Preview] Route preview displayed successfully',
        };
    }

    /**
     * DOM apply plan for alternative-route cards in the preview panel.
     * @param {Object|null|undefined} mount - from buildAlternativeRoutesPreviewMountPlans
     * @returns {Object}
     */
    function buildAlternativeRoutesPreviewDomApplyPlan(mount) {
        mount = mount || {};
        return {
            showContainer: !!mount.showContainer,
            containerDisplay: mount.showContainer ? 'block' : 'none',
            cardPlans: mount.cardPlans || [],
        };
    }

    /**
     * Execute plan for alternative-route preview card DOM apply.
     * @param {Object} domPlan - from buildAlternativeRoutesPreviewDomApplyPlan
     * @returns {Object}
     */
    function buildAlternativeRoutesPreviewDomExecutePlan(domPlan) {
        domPlan = domPlan || {};
        return {
            shouldExecute: !!domPlan,
            listContainerId: 'previewAlternativeRoutesList',
            parentContainerId: 'previewAlternativeRoutesContainer',
            showContainer: !!domPlan.showContainer,
            containerDisplay: domPlan.containerDisplay || 'none',
            cardPlans: domPlan.cardPlans || [],
        };
    }

    /**
     * Orchestration plan for showAlternativeRoutesInPreview.
     * @param {number} [routeCount]
     * @returns {Object}
     */
    function buildShowAlternativeRoutesPreviewOrchestrationPlan(routeCount) {
        var count = routeCount || 0;
        return {
            shouldShow: count > 0,
            routeCount: count,
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
     * Patch plan for silent in-navigation route updates (no preview UI).
     * @param {Object|null|undefined} activeRoute
     * @param {Object} routeData
     * @param {Object|null|undefined} prevLastCalculatedRoute
     * @returns {Object}
     */
    function buildNavRouteSilentUpdatePatchPlan(activeRoute, routeData, prevLastCalculatedRoute) {
        routeData = routeData || {};
        if (!prevLastCalculatedRoute || !activeRoute) {
            return { shouldPatch: false };
        }
        var durationMinutes = activeRoute.duration_minutes ||
            (routeData.time ? parseInt(routeData.time, 10) : null) ||
            prevLastCalculatedRoute.duration_minutes;
        var patch = {};
        var key;
        for (key in prevLastCalculatedRoute) {
            if (Object.prototype.hasOwnProperty.call(prevLastCalculatedRoute, key)) {
                patch[key] = prevLastCalculatedRoute[key];
            }
        }
        for (key in routeData) {
            if (Object.prototype.hasOwnProperty.call(routeData, key)) {
                patch[key] = routeData[key];
            }
        }
        for (key in activeRoute) {
            if (Object.prototype.hasOwnProperty.call(activeRoute, key)) {
                patch[key] = activeRoute[key];
            }
        }
        patch.duration_minutes = durationMinutes;
        patch.destination = prevLastCalculatedRoute.destination ||
            routeData.destination ||
            activeRoute.destination;
        patch.destinationName = prevLastCalculatedRoute.destinationName ||
            routeData.destinationName ||
            activeRoute.destinationName;
        return { shouldPatch: true, patch: patch };
    }

    /**
     * Execute plan for silent in-navigation route updates during preview delegation.
     * @param {Object|null|undefined} activeRoute
     * @param {Object} routeData
     * @param {Object|null|undefined} prevLastCalculatedRoute
     * @returns {Object}
     */
    function buildRouteUpdateDuringNavigationExecutePlan(activeRoute, routeData, prevLastCalculatedRoute) {
        routeData = routeData || {};
        var entryLogMessage = '[Route Preview] Navigation active — silent route update (no preview UI / no sheet)';
        if (!activeRoute) {
            return {
                shouldExecute: false,
                entryLogMessage: entryLogMessage,
                errorStatusMessage: '❌ No route to apply',
            };
        }
        var patchPlan = buildNavRouteSilentUpdatePatchPlan(activeRoute, routeData, prevLastCalculatedRoute);
        return {
            shouldExecute: true,
            entryLogMessage: entryLogMessage,
            updateRouteOnMap: !!activeRoute.geometry,
            activeRoute: activeRoute,
            patchLastCalculatedRoute: patchPlan.shouldPatch,
            lastCalculatedRoutePatch: patchPlan.patch,
            statusMessage: '✅ Route updated — continuing navigation',
            statusType: 'success',
        };
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
     * Per-route polyline precision from route fields or API default.
     * @param {Object} route
     * @param {number} [defaultPrecision]
     * @returns {number}
     */
    function resolvePerRouteGeometryPrecision(route, defaultPrecision) {
        route = route || {};
        if (Number.isFinite(route.geometry_precision)) return route.geometry_precision;
        if (Number.isFinite(defaultPrecision)) return defaultPrecision;
        var sourceLower = String(route.source || '').toLowerCase();
        return sourceLower.indexOf('osrm') >= 0 ? 5 : 6;
    }

    /**
     * Canonical route option object for map display and selection.
     * @param {Object} route
     * @param {Object} opts
     * @param {function(string, number): Array<[number,number]>} opts.decodePolyline
     * @param {string} [opts.routeSource]
     * @param {number} [opts.defaultPrecision]
     * @returns {Object}
     */
    function normalizeRouteOption(route, opts) {
        opts = opts || {};
        route = route || {};
        var routeSource = opts.routeSource || 'Unknown';
        var defaultPrecision = Number.isFinite(opts.defaultPrecision)
            ? opts.defaultPrecision
            : resolveRouteGeometryPrecision({ source: routeSource });
        var precision = resolvePerRouteGeometryPrecision(route, defaultPrecision);
        var polyline = [];
        if (typeof opts.decodePolyline === 'function') {
            polyline = opts.decodePolyline(route.geometry || '', precision);
        }
        return {
            id: route.id,
            name: route.name,
            distance_km: route.distance_km,
            duration_minutes: route.duration_minutes,
            fuel_cost: route.fuel_cost,
            fuel_litres: route.fuel_litres || 0,
            toll_cost: route.toll_cost,
            caz_cost: route.caz_cost,
            hazard_count: route.hazard_count || 0,
            cameras_near_route: route.cameras_near_route != null
                ? route.cameras_near_route
                : (route.hazard_count != null ? route.hazard_count : 0),
            geometry_precision: precision,
            polyline: polyline,
            geometry: route.geometry,
            hazards: route.hazards || [],
            maneuvers: route.maneuvers || [],
            source: route.source || routeSource,
        };
    }

    /**
     * Build routeOptions from a calculateRoute API payload (multi-route or single fallback).
     * @param {Object} data
     * @param {function(string, number): Array<[number,number]>} decodePolyline
     * @param {Array<[number,number]>} [routePathFallback]
     * @returns {Array<Object>}
     */
    function buildRouteOptionsFromApiResponse(data, decodePolyline, routePathFallback) {
        data = data || {};
        if (data.routes && data.routes.length > 0) {
            var routeSource = data.source || 'Unknown';
            var defaultPrecision = resolveRouteGeometryPrecision(data);
            return data.routes.map(function (route) {
                return normalizeRouteOption(route, {
                    decodePolyline: decodePolyline,
                    routeSource: routeSource,
                    defaultPrecision: defaultPrecision,
                });
            });
        }
        return [{
            id: 1,
            name: 'Route',
            distance_km: parseFloat(data.distance) || 0,
            duration_minutes: parseInt(data.time, 10) || 0,
            fuel_cost: data.fuel_cost || 0,
            fuel_litres: data.fuel_litres || 0,
            toll_cost: data.toll_cost || 0,
            caz_cost: data.caz_cost || 0,
            hazard_count: 0,
            polyline: routePathFallback || [],
            geometry: data.geometry,
            maneuvers: data.maneuvers || [],
            source: data.source || 'Unknown',
        }];
    }

    /**
     * Decode missing polylines on route options in place.
     * @param {Array<Object>} routeOptions
     * @param {function(string, number): Array<[number,number]>} decodePolyline
     * @returns {Array<Object>}
     */
    function hydrateRouteOptionPolylines(routeOptions, decodePolyline) {
        if (!routeOptions || typeof decodePolyline !== 'function') return routeOptions;
        for (var i = 0; i < routeOptions.length; i++) {
            var route = routeOptions[i];
            if ((!route.polyline || route.polyline.length === 0) && route.geometry) {
                var precision = resolvePerRouteGeometryPrecision(route, null);
                route.polyline = decodePolyline(route.geometry, precision);
            }
        }
        return routeOptions;
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
     * Trip time string for the trip-info panel, including stop dwell when present.
     * @param {Object} data
     * @returns {*}
     */
    function resolveRouteDisplayTime(data) {
        data = data || {};
        if (data.total_stop_time && data.total_stop_time > 0) {
            return data.total_time_with_stops || data.time;
        }
        return data.time;
    }

    /**
     * Duration in minutes from an initial `/api/route` success payload.
     * @param {Object} data
     * @returns {number}
     */
    function resolveInitialRouteDurationMinutes(data) {
        data = data || {};
        if (data.routes && data.routes.length > 0) {
            return data.routes[0].duration_minutes;
        }
        return data.total_duration_minutes || (data.time ? parseInt(data.time, 10) : 0);
    }

    /**
     * Fields merged into `window.lastCalculatedRoute` after a successful calculateRoute.
     * @param {Object} data
     * @param {string} geocodedEnd
     * @param {string} destinationLabel
     * @returns {Object}
     */
    function buildLastCalculatedRoutePatch(data, geocodedEnd, destinationLabel) {
        data = data || {};
        var patch = {};
        for (var k in data) {
            if (Object.prototype.hasOwnProperty.call(data, k)) {
                patch[k] = data[k];
            }
        }
        patch.duration_minutes = resolveInitialRouteDurationMinutes(data);
        patch.destination = geocodedEnd;
        patch.destinationName = destinationLabel;
        return patch;
    }

    /**
     * Validate geocoded start/end strings for route preview marker placement.
     * @param {string} geocodedStart
     * @param {string} geocodedEnd
     * @param {function(string): { valid: boolean, coords?: [number, number] }} parseLatLonPair
     * @param {{ invalidFormat?: string, invalidCoords?: string }} [msgs]
     * @returns {{ ok: true, startCoords: [number, number], endCoords: [number, number] }|{ ok: false, errorStatusMessage: string }}
     */
    function buildPreviewRouteCoordsPlan(geocodedStart, geocodedEnd, parseLatLonPair, msgs) {
        msgs = msgs || {};
        if (typeof parseLatLonPair !== 'function') {
            return { ok: false, errorStatusMessage: msgs.invalidFormat || 'Error: Invalid coordinates format' };
        }
        var startParsed = parseLatLonPair(geocodedStart);
        var endParsed = parseLatLonPair(geocodedEnd);
        if (!startParsed || !startParsed.valid || !endParsed || !endParsed.valid) {
            return { ok: false, errorStatusMessage: msgs.invalidFormat || 'Error: Invalid coordinates format' };
        }
        var startCoords = startParsed.coords;
        var endCoords = endParsed.coords;
        if (!startCoords || !endCoords ||
            isNaN(startCoords[0]) || isNaN(startCoords[1]) ||
            isNaN(endCoords[0]) || isNaN(endCoords[1])) {
            return { ok: false, errorStatusMessage: msgs.invalidCoords || 'Error: Invalid coordinates' };
        }
        return { ok: true, startCoords: startCoords, endCoords: endCoords };
    }

    /**
     * @param {string} label
     * @returns {boolean}
     */
    function isCurrentLocationPlaceholder(label) {
        return /^\s*current location\s*$/i.test(String(label || ''));
    }

    /**
     * Input assembly for buildRoutePreviewSuccessPlan from runtime labels and formatters.
     * @param {Object} o
     * @param {string} o.geocodedStart
     * @param {string} o.geocodedEnd
     * @param {string} o.startLabel
     * @param {string} o.endLabel
     * @param {Object} o.data
     * @param {function(string): { valid: boolean, coords?: [number, number] }} o.parseLatLonPair
     * @param {string} [o.invalidFormatMessage]
     * @param {string} [o.invalidCoordsMessage]
     * @param {function(string, number): Array<[number,number]>} o.decodePolyline
     * @param {function(number): string} o.convertDistance
     * @param {string} o.distUnit
     * @param {string} o.currencySymbol
     * @param {function(*): number} o.parseDurationMinutes
     * @returns {Object}
     */
    function buildRoutePreviewSuccessInputPlan(o) {
        o = o || {};
        var data = o.data || {};
        var distanceKm = parseFloat(data.distance_km || data.distance) || 0;
        var distanceText = typeof o.convertDistance === 'function'
            ? o.convertDistance(distanceKm)
            : String(distanceKm);
        return {
            geocodedStart: o.geocodedStart,
            geocodedEnd: o.geocodedEnd,
            startLabel: o.startLabel,
            endLabel: o.endLabel,
            data: data,
            parseLatLonPair: o.parseLatLonPair,
            invalidFormatMessage: o.invalidFormatMessage,
            invalidCoordsMessage: o.invalidCoordsMessage,
            decodePolyline: o.decodePolyline,
            fmt: {
                distanceText: distanceText,
                distUnit: o.distUnit || '',
                currencySymbol: o.currencySymbol || '',
                notificationDistanceText: distanceText,
            },
            parseDurationMinutes: o.parseDurationMinutes,
        };
    }

    /**
     * Apply plan for a successful calculateRoute preview (non-navigation) response.
     * @param {Object} o
     * @param {string} o.geocodedStart
     * @param {string} o.geocodedEnd
     * @param {string} o.startLabel
     * @param {string} o.endLabel
     * @param {Object} o.data
     * @param {function(string): { valid: boolean, coords?: [number, number] }} o.parseLatLonPair
     * @param {string} [o.invalidFormatMessage]
     * @param {string} [o.invalidCoordsMessage]
     * @param {function(string, number): Array<[number,number]>} o.decodePolyline
     * @param {{ distanceText: string, distUnit: string, currencySymbol: string, notificationDistanceText?: string }} o.fmt
     * @param {function(*): number} o.parseDurationMinutes
     * @returns {Object}
     */
    function buildRoutePreviewSuccessPlan(o) {
        o = o || {};
        var data = o.data || {};
        var fmt = o.fmt || {};
        var coordsPlan = buildPreviewRouteCoordsPlan(
            o.geocodedStart,
            o.geocodedEnd,
            o.parseLatLonPair,
            {
                invalidFormat: o.invalidFormatMessage,
                invalidCoords: o.invalidCoordsMessage,
            }
        );
        if (!coordsPlan.ok) {
            return coordsPlan;
        }
        var pathPlan = resolvePreviewRoutePath(
            coordsPlan.startCoords,
            coordsPlan.endCoords,
            data,
            o.decodePolyline
        );
        var displayTime = resolveRouteDisplayTime(data);
        var tripInfoApplyPlan = buildTripInfoApplyPlan(
            data.distance,
            displayTime,
            data.fuel_cost || '-',
            data.toll_cost || '-',
            {
                distanceText: fmt.distanceText,
                distUnit: fmt.distUnit,
                currencySymbol: fmt.currencySymbol,
            },
            o.parseDurationMinutes
        );
        var notificationDist = fmt.notificationDistanceText != null
            ? fmt.notificationDistanceText
            : fmt.distanceText;
        var recentDestinations = [{
            label: o.endLabel,
            lat: coordsPlan.endCoords[0],
            lon: coordsPlan.endCoords[1],
            kind: 'route',
        }];
        if (o.startLabel && !isCurrentLocationPlaceholder(o.startLabel)) {
            recentDestinations.push({
                label: o.startLabel,
                lat: coordsPlan.startCoords[0],
                lon: coordsPlan.startCoords[1],
                kind: 'route',
            });
        }
        return {
            ok: true,
            startCoords: coordsPlan.startCoords,
            endCoords: coordsPlan.endCoords,
            pathPlan: pathPlan,
            tripInfoApplyPlan: tripInfoApplyPlan,
            statusMessage: buildRouteCalculatedStatusMessage(data),
            lastCalculatedRoutePatch: buildLastCalculatedRoutePatch(data, o.geocodedEnd, o.endLabel),
            durationMinutes: resolveInitialRouteDurationMinutes(data),
            displayTime: displayTime,
            notification: {
                title: 'Route Ready',
                message: notificationDist + ' ' + (fmt.distUnit || '') + ' in ' + data.time + '. Ready to navigate?',
                type: 'success',
            },
            recentDestinations: recentDestinations,
            showMultiDropLegs: !!(data.multi_drop && data.legs && data.legs.length > 0),
            primaryHazards: (data.routes && data.routes[0] && data.routes[0].hazards) || null,
            routeSource: data.source || 'Unknown',
            defaultPrecision: resolveRouteGeometryPrecision(data),
            routesCount: data.routes ? data.routes.length : 0,
            routePath: pathPlan.routePath,
        };
    }

    /**
     * Execute plan for idle calculateRoute preview outcome side effects.
     * @param {Object} previewPlan - from buildRoutePreviewSuccessPlan
     * @param {Object} [data] - route API response
     * @returns {Object}
     */
    function buildCalculateRouteIdlePreviewExecutePlan(previewPlan, data) {
        previewPlan = previewPlan || {};
        data = data || {};
        if (!previewPlan.ok) {
            return {
                shouldExecute: false,
                errorStatusMessage: previewPlan.errorStatusMessage,
                hideRouteProgressBarOnError: true,
            };
        }
        var routesCount = previewPlan.routesCount || 0;
        return {
            shouldExecute: true,
            startCoords: previewPlan.startCoords,
            endCoords: previewPlan.endCoords,
            pathPlan: previewPlan.pathPlan,
            routePath: previewPlan.routePath,
            hasGeometry: !!data.geometry,
            geometrySource: data.source,
            multiDropStopLogMessage: data.total_stop_time && data.total_stop_time > 0
                ? '[Route] Total time with ' + data.stops_count + ' stops: ' + previewPlan.displayTime
                : null,
            tripInfo: {
                distance: data.distance,
                displayTime: previewPlan.displayTime,
                fuelCost: data.fuel_cost || '-',
                tollCost: data.toll_cost || '-',
            },
            statusMessage: previewPlan.statusMessage,
            showMultiDropLegs: !!previewPlan.showMultiDropLegs,
            storeLastRouteApiResponse: true,
            lastCalculatedRoutePatch: previewPlan.lastCalculatedRoutePatch,
            durationLogMessage: '[Route] Stored route with duration_minutes: ' + previewPlan.durationMinutes,
            displayPrimaryHazards: !!(previewPlan.primaryHazards && previewPlan.primaryHazards.length),
            primaryHazards: previewPlan.primaryHazards,
            routesCount: routesCount,
            routeSource: previewPlan.routeSource,
            defaultPrecision: previewPlan.defaultPrecision,
            multiRouteLogMessage: routesCount > 0
                ? '[Route API] Received ' + routesCount + ' routes from ' + previewPlan.routeSource +
                    ', default polyline precision ' + previewPlan.defaultPrecision
                : null,
            fallbackRouteLogMessage: '[Route Comparison] Using single route (fallback)',
            loadedRoutesLogPrefix: '[Route Comparison] Loaded ',
            idleUiApplyInput: previewPlan,
        };
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

    /**
     * @param {string} vehicleType
     * @returns {string}
     */
    function formatPreviewVehicleTypeLabel(vehicleType) {
        return String(vehicleType || '').replace(/_/g, ' ').split(' ').map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
    }

    /**
     * @param {string} routingMode
     * @returns {string}
     */
    function formatPreviewRoutingModeLabel(routingMode) {
        var mode = String(routingMode || '');
        return mode.charAt(0).toUpperCase() + mode.slice(1);
    }

    /**
     * Parse a "lat,lon" coord string into a recent-destination record.
     * @param {string} coordString
     * @param {string} label
     * @returns {{ label: string, lat: number, lon: number, kind: string }|null}
     */
    function parseRecentDestinationFromCoordString(coordString, label) {
        if (!coordString || !label) return null;
        var parts = String(coordString).split(',');
        if (parts.length < 2) return null;
        var lat = parseFloat(parts[0].trim());
        var lon = parseFloat(parts[1].trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return { label: label, lat: lat, lon: lon, kind: 'route' };
    }

    /**
     * In-navigation reroute dispatch plan (voice, status, patch, recent destination).
     * @param {Object} activeRoute
     * @param {Object} data
     * @param {string} geocodedEnd
     * @param {string} destinationLabel
     * @param {Object} [voiceOpts]
     * @returns {Object}
     */
    function buildInNavRerouteDispatchPlan(activeRoute, data, geocodedEnd, destinationLabel, voiceOpts) {
        var plan = buildInNavRerouteSuccessPlan(activeRoute, data, geocodedEnd, destinationLabel, voiceOpts);
        return {
            lastCalculatedRoutePatch: plan.lastCalculatedRoutePatch,
            durationMinutes: plan.durationMinutes,
            speakMessage: plan.speakMessage,
            statusMessage: plan.statusMessage,
            statusType: plan.statusType,
            noRouteErrorMessage: plan.noRouteErrorMessage,
            recentDestination: parseRecentDestinationFromCoordString(geocodedEnd, destinationLabel),
        };
    }

    /**
     * Post-preview UI apply plan for idle (non-navigation) calculateRoute success.
     * @param {Object} previewPlan - from buildRoutePreviewSuccessPlan
     * @returns {Object}
     */
    function buildCalculateRouteIdleUiApplyPlan(previewPlan) {
        previewPlan = previewPlan || {};
        return {
            showStartNavButtons: true,
            startNavButtonIds: ['startNavBtn', 'startNavBtnSheet'],
            updateRoadReportFabVisibility: true,
            updateArButtonVisibility: true,
            notification: previewPlan.notification || null,
            recentDestinations: previewPlan.recentDestinations || [],
            delayedPreview: { delayMs: 300 },
        };
    }

    /**
     * Execute plan for idle calculateRoute post-preview UI side effects.
     * @param {Object} idleUiPlan - from buildCalculateRouteIdleUiApplyPlan
     * @returns {Object}
     */
    function buildCalculateRouteIdleUiExecutePlan(idleUiPlan) {
        idleUiPlan = idleUiPlan || {};
        return {
            shouldExecute: true,
            hideRouteProgressBar: true,
            delayedPreview: idleUiPlan.delayedPreview || { delayMs: 300 },
            showStartNavButtons: !!idleUiPlan.showStartNavButtons,
            startNavButtonIds: idleUiPlan.startNavButtonIds || [],
            updateRoadReportFabVisibility: !!idleUiPlan.updateRoadReportFabVisibility,
            updateArButtonVisibility: !!idleUiPlan.updateArButtonVisibility,
            notification: idleUiPlan.notification || null,
            recentDestinations: idleUiPlan.recentDestinations || [],
            notificationLogPrefix: '[Route] Route ready notification:',
        };
    }

    /**
     * Execute plan for in-navigation reroute outcome side effects.
     * @param {Object} dispatch - from buildInNavRerouteDispatchPlan
     * @param {Object|null|undefined} activeRoute
     * @returns {Object}
     */
    function buildInNavRerouteOutcomeExecutePlan(dispatch, activeRoute) {
        dispatch = dispatch || {};
        if (!activeRoute) {
            return {
                shouldApply: false,
                noRouteErrorMessage: dispatch.noRouteErrorMessage || '❌ No route returned',
            };
        }
        return {
            shouldApply: true,
            hideRouteProgressBar: true,
            updateRouteOnMap: !!activeRoute.geometry,
            activeRoute: activeRoute,
            lastCalculatedRoutePatch: dispatch.lastCalculatedRoutePatch,
            speakMessage: dispatch.speakMessage,
            statusMessage: dispatch.statusMessage,
            statusType: dispatch.statusType,
            recentDestination: dispatch.recentDestination,
        };
    }

    /**
     * Dispatch plan for recalculateRouteWithPreferences.
     * @param {Object|null|undefined} lastCalculatedRoute
     * @returns {Object}
     */
    function buildRecalculateRouteWithPreferencesPlan(lastCalculatedRoute) {
        if (!lastCalculatedRoute || !lastCalculatedRoute.destination) {
            return {
                ok: false,
                errorStatusMessage: 'No active route to recalculate. Please calculate a route first.',
            };
        }
        return {
            ok: true,
            loadingStatusMessage: '🔄 Recalculating route with new preferences...',
            switchTab: 'navigation',
            recalculateDelayMs: 300,
        };
    }

    /**
     * Apply plan for the route preview bottom-sheet panel (values only; app writes DOM).
     * @param {Object} o
     * @returns {Object}
     */
    function buildRoutePreviewPanelApplyPlan(o) {
        o = o || {};
        var routeData = o.routeData || {};
        var selectedIndex = o.selectedRouteIndex != null ? o.selectedRouteIndex : 0;
        var previewRouteSlice = resolvePreviewRoute(routeData, selectedIndex);
        var distanceKm = resolvePreviewDistanceKm(routeData, previewRouteSlice);
        var previewCosts = buildPreviewCostValues(previewRouteSlice, routeData);
        var symbol = o.currencySymbol || '£';
        var primaryRouteForCaz = (routeData.routes && routeData.routes.length > 0)
            ? routeData.routes[0]
            : routeData;
        var cazDetails = primaryRouteForCaz.caz_details || routeData.caz_details || {};
        var cazStatus = buildCazStatusHtml(cazDetails, previewCosts.cazCost, symbol);
        var previewRoute = resolvePreviewRoute(routeData, selectedIndex);
        var hazardCount = previewRoute.hazard_count != null ? previewRoute.hazard_count : (routeData.hazard_count || 0);
        var camerasNearRoute = previewRoute.cameras_near_route != null ? previewRoute.cameras_near_route : hazardCount;
        var hazardPenaltySeconds = previewRoute.hazard_penalty_seconds != null
            ? previewRoute.hazard_penalty_seconds
            : (routeData.hazard_penalty_seconds || 0);
        var hazardPlan = buildHazardPreviewPanelApplyPlan(getHazardPreviewPanelState({
            preferencesApplied: !!o.preferencesApplied,
            camerasNearRoute: camerasNearRoute,
            hazardCount: hazardCount,
            hazardPenaltySeconds: hazardPenaltySeconds,
        }));
        var isElectric = o.vehicleType === 'electric';
        var fuelUnit = isElectric ? 'kWh' : 'L';
        var routeOptionsCount = o.routeOptionsCount || 0;
        return {
            distanceKm: distanceKm,
            distanceText: o.distanceText,
            durationText: String(previewCosts.durationMinutes != null ? previewCosts.durationMinutes : 0) + ' min',
            routeLabel: String(o.startLabel || '') + ' → ' + String(o.endLabel || ''),
            fuelCostText: symbol + previewCosts.fuelCost.toFixed(2),
            tollCostText: symbol + previewCosts.tollCost.toFixed(2),
            cazCostText: symbol + previewCosts.cazCost.toFixed(2),
            totalCostText: symbol + previewCosts.totalCost.toFixed(2),
            fuelLitres: previewCosts.fuelLitres > 0
                ? { visible: true, text: '(' + previewCosts.fuelLitres.toFixed(1) + ' ' + fuelUnit + ')' }
                : { visible: false, text: '' },
            cazStatus: cazStatus,
            hazardPlan: hazardPlan,
            routingModeText: formatPreviewRoutingModeLabel(o.routingMode),
            vehicleTypeText: formatPreviewVehicleTypeLabel(o.vehicleType),
            showAlternativeRoutes: routeOptionsCount > 1,
            showMapRoutes: !o.skipMapDisplay && routeOptionsCount > 0,
            statusMessage: '📍 Review your route before starting navigation',
            costLog: {
                distanceUnit: o.distanceUnit,
                fuelCost: previewCosts.fuelCost.toFixed(2),
                tollCost: previewCosts.tollCost.toFixed(2),
                cazCost: previewCosts.cazCost.toFixed(2),
                totalCost: previewCosts.totalCost.toFixed(2),
                cazDetails: cazDetails,
            },
        };
    }

    /**
     * DOM apply plan for route preview panel fields (app maps element ids to patches).
     * @param {Object} panelPlan - from buildRoutePreviewPanelApplyPlan
     * @returns {Object}
     */
    function buildRoutePreviewPanelDomApplyPlan(panelPlan) {
        panelPlan = panelPlan || {};
        var hazard = panelPlan.hazardPlan || {};
        var fuelLitres = panelPlan.fuelLitres || { visible: false, text: '' };
        var caz = panelPlan.cazStatus || { visible: false, html: '' };
        return {
            previewDistance: {
                datasetKm: panelPlan.distanceKm,
                textContent: panelPlan.distanceText,
            },
            previewDuration: { textContent: panelPlan.durationText },
            previewRoute: { textContent: panelPlan.routeLabel },
            previewFuelCost: { textContent: panelPlan.fuelCostText },
            previewFuelLitres: {
                visible: fuelLitres.visible,
                textContent: fuelLitres.text,
                display: fuelLitres.visible ? 'block' : 'none',
            },
            previewTollCost: { textContent: panelPlan.tollCostText },
            previewCAZCost: { textContent: panelPlan.cazCostText },
            previewTotalCost: { textContent: panelPlan.totalCostText },
            cazStatusContainer: {
                visible: caz.visible,
                innerHtml: caz.html,
                display: caz.visible ? 'block' : 'none',
            },
            hazardInfoContainer: hazard,
            previewRoutingMode: { textContent: panelPlan.routingModeText },
            previewVehicleType: { textContent: panelPlan.vehicleTypeText },
            previewAlternativeRoutesContainer: {
                showAlternativeRoutes: !!panelPlan.showAlternativeRoutes,
                display: panelPlan.showAlternativeRoutes ? null : 'none',
            },
            showMapRoutes: !!panelPlan.showMapRoutes,
            statusMessage: panelPlan.statusMessage,
            costLog: panelPlan.costLog,
        };
    }

    /** Element ids for route preview panel DOM patches. */
    var ROUTE_PREVIEW_PANEL_ELEMENT_IDS = {
        previewDistance: 'previewDistance',
        previewDuration: 'previewDuration',
        previewRoute: 'previewRoute',
        previewFuelCost: 'previewFuelCost',
        previewFuelLitres: 'previewFuelLitres',
        previewTollCost: 'previewTollCost',
        previewCAZCost: 'previewCAZCost',
        previewTotalCost: 'previewTotalCost',
        previewRoutingMode: 'previewRoutingMode',
        previewVehicleType: 'previewVehicleType',
        cazStatusContainer: 'cazStatusContainer',
        hazardInfoContainer: 'hazardInfoContainer',
        previewAlternativeRoutesContainer: 'previewAlternativeRoutesContainer',
    };

    /**
     * Execute plan for applying route preview panel DOM patches.
     * @param {Object} domPlan - from buildRoutePreviewPanelDomApplyPlan
     * @returns {Object}
     */
    function buildRoutePreviewPanelDomExecutePlan(domPlan) {
        domPlan = domPlan || {};
        return {
            shouldExecute: !!domPlan,
            elementIds: ROUTE_PREVIEW_PANEL_ELEMENT_IDS,
            patches: domPlan,
        };
    }

    /**
     * Mount plans for alternative-route cards in the preview panel.
     * @param {Array<Object>} routeOptions
     * @param {Object} opts
     * @returns {{ showContainer: boolean, cardPlans: Array<Object> }}
     */
    function buildAlternativeRoutesPreviewMountPlans(routeOptions, opts) {
        opts = opts || {};
        var routes = routeOptions || [];
        var cardPlans = [];
        for (var i = 0; i < routes.length; i++) {
            cardPlans.push(buildPreviewAlternativeRouteCardMountPlan(routes[i], i, Object.assign({}, opts, {
                distanceText: typeof opts.convertDistance === 'function'
                    ? opts.convertDistance(routes[i].distance_km)
                    : String(routes[i].distance_km),
            })));
        }
        return {
            showContainer: shouldShowPreviewAlternativeRoutes(routes.length),
            cardPlans: cardPlans,
        };
    }

    /**
     * MapLibre polyline style for the active navigation route line.
     * @param {string} [color]
     * @returns {Object}
     */
    function buildNavActiveRoutePolylineStyle(color) {
        return {
            color: color || NAV_ACTIVE_ROUTE_COLOR,
            weight: 8,
            opacity: 0.95,
            outline: true,
            outlineColor: '#ffffff',
            outlineWeight: 11,
            outlineOpacity: 0.92,
        };
    }

    /**
     * Guard for re-drawing the active navigation route layer.
     * @param {Object} opts
     * @returns {{ shouldRedraw: boolean }}
     */
    function buildNavRouteLayerRedrawGuardPlan(opts) {
        opts = opts || {};
        var polyline = opts.routePolyline || [];
        return {
            shouldRedraw: !!(opts.routeInProgress && opts.map && polyline.length >= 2),
        };
    }

    /**
     * Mount plan for the single active navigation route polyline layer.
     * @param {Object} opts
     * @returns {{ valid: boolean, polyline: Array, style: Object }}
     */
    function buildNavActiveRouteLayerMountPlan(opts) {
        opts = opts || {};
        var polyline = opts.routePolyline || [];
        return {
            valid: polyline.length >= 2,
            polyline: polyline,
            style: buildNavActiveRoutePolylineStyle(opts.navRouteColor),
        };
    }

    /**
     * True when route hazards already include OSM traffic-light signals.
     * @param {Array<Object>} hazards
     * @returns {boolean}
     */
    function routeHazardsIncludeOsmTrafficLights(hazards) {
        if (!hazards || !hazards.length) return false;
        return hazards.some(function (h) {
            if (!h || !h.type) return false;
            var t = String(h.type);
            return t === 'traffic_light' || t === 'traffic_signals' || t === 'traffic_signal';
        });
    }

    /**
     * Dispatch plan for fitting the map to the active calculated route overview.
     * @param {Object|null|undefined} lastCalculatedRoute
     * @param {function(string, number): Array<[number,number]>} decodePolyline
     * @returns {Object}
     */
    function buildRouteOverviewDispatchPlan(lastCalculatedRoute, decodePolyline) {
        if (!lastCalculatedRoute || !lastCalculatedRoute.geometry) {
            return {
                ok: false,
                statusMessage: 'No route to overview',
                statusType: 'error',
            };
        }
        var precision = resolveRouteGeometryPrecision(lastCalculatedRoute);
        var routePath = typeof decodePolyline === 'function'
            ? decodePolyline(lastCalculatedRoute.geometry, precision)
            : [];
        if (!routePath || routePath.length === 0) {
            return {
                ok: false,
                statusMessage: 'No route path available',
                statusType: 'error',
            };
        }
        return {
            ok: true,
            routePath: routePath,
            fitBounds: { padding: 50, maxZoom: 16 },
            statusMessage: '📍 Route overview - pan and zoom to inspect',
            statusType: 'success',
        };
    }

    /**
     * Map display plan for showing a single selected route (comparison / preview).
     * @param {Object|null|undefined} route
     * @param {number} index
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildSingleRouteMapDisplayPlan(route, index, opts) {
        opts = opts || {};
        if (!route) {
            return { valid: false };
        }
        var polylinePoints = route.polyline || [];
        var color = resolveRouteColor(index, opts.routeColors);
        var hazards = route.hazards || [];
        var hasOsmTlsInHazards = routeHazardsIncludeOsmTrafficLights(hazards);
        var tlEnabled = !!opts.trafficLightsEnabled;
        var trafficLightsAction = 'skip';
        if (polylinePoints.length > 0) {
            if (tlEnabled && !hasOsmTlsInHazards) {
                trafficLightsAction = 'plot';
            } else if (hasOsmTlsInHazards || !tlEnabled) {
                trafficLightsAction = 'clear';
            }
        }
        return {
            valid: true,
            clearAllRouteLayers: true,
            polyline: {
                points: polylinePoints,
                color: color,
                weight: 8,
                opacity: 1.0,
                fitBoundsPadding: 50,
            },
            hazards: {
                action: hazards.length > 0 ? 'show' : 'clear',
                list: hazards,
            },
            ensureTomTomTrafficLayer: !!opts.showTrafficEnabled && !opts.hasTrafficLayer,
            routeTraffic: {
                enabled: !!opts.routeTrafficEnabled && polylinePoints.length > 0,
                polylinePoints: polylinePoints,
            },
            trafficLights: {
                action: trafficLightsAction,
                polylinePoints: polylinePoints,
                hasOsmTlsInHazards: hasOsmTlsInHazards,
                plotAvailable: !!opts.trafficLightsPlotAvailable,
            },
            logLine: 'Showing only route ' + (index + 1) + ': ' + (route.name || ''),
        };
    }

    /**
     * Side-effect plan after all route layers are mounted on the map.
     * @param {Array<Object>} routeOptions
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildAllRoutesMapSideEffectsPlan(routeOptions, opts) {
        opts = opts || {};
        var routes = routeOptions || [];
        var allCoords = [];
        routes.forEach(function (route) {
            if (route && route.polyline && route.polyline.length > 0) {
                allCoords = allCoords.concat(route.polyline);
            }
        });
        return {
            fitBounds: allCoords.length > 0 ? { coords: allCoords, padding: 50 } : null,
            displayAllRouteHazards: routes.length > 0,
            ensureTomTomTrafficLayer: !!opts.showTrafficEnabled && !opts.hasTrafficLayer,
            bringRoutesToTop: true,
            routeCount: routes.length,
        };
    }

    /**
     * Pure plan for clearing orphaned route-layer / polyline map artifacts.
     * @param {Object|null|undefined} style - MapLibre style object
     * @returns {Object}
     */
    function buildClearAllRouteLayersFromMapPlan(style) {
        style = style || {};
        var layers = style.layers || [];
        var sources = style.sources || {};
        var layerIds = [];
        var sourceIds = [];

        layers.forEach(function (layer) {
            if (layer && layer.id && (
                layer.id.indexOf('route-layer-') === 0 ||
                layer.id.indexOf('polyline-') === 0
            )) {
                layerIds.push(layer.id);
            }
        });

        Object.keys(sources).forEach(function (sourceId) {
            if (sourceId.indexOf('route-layer-') === 0 || sourceId.indexOf('polyline-') === 0) {
                sourceIds.push(sourceId);
            }
        });

        return {
            layerIds: layerIds,
            sourceIds: sourceIds,
            hasArtifacts: layerIds.length > 0 || sourceIds.length > 0,
            successLogMessage: '[Routes] Cleared ' + layerIds.length +
                ' layers and ' + sourceIds.length + ' sources from map',
            layerErrorLogPrefix: '[Routes] Error removing layer ',
            sourceErrorLogPrefix: '[Routes] Error removing source ',
            fatalErrorLogPrefix: '[Routes] Error clearing route layers:',
        };
    }

    /**
     * Pre-mount plan before adding route comparison layers.
     * @param {Object} dispatch - from buildDisplayAllRoutesMapDispatchPlan
     * @returns {Object}
     */
    function buildDisplayAllRoutesMapPreMountPlan(dispatch) {
        dispatch = dispatch || {};
        return {
            clearRouteLayerHandle: true,
            clearAllRouteLayerHandles: true,
            clearMapRouteLayers: !!dispatch.clearAllRouteLayers,
            hydratePolylines: !!dispatch.hydratePolylines,
        };
    }

    /**
     * Style-load execute plan for deferred route layer mounting.
     * @param {Object} dispatch - from buildDisplayAllRoutesMapDispatchPlan
     * @param {Object} [opts]
     * @param {boolean} [opts.isStyleLoaded]
     * @returns {Object}
     */
    function buildDisplayAllRoutesMapStyleLoadExecutePlan(dispatch, opts) {
        dispatch = dispatch || {};
        opts = opts || {};
        var styleLoad = dispatch.styleLoad || {};
        if (!styleLoad.waitIfNeeded || opts.isStyleLoaded) {
            return { strategy: 'immediate' };
        }
        return {
            strategy: 'wait',
            waitForStyleLoadEvent: true,
            fallbackTimeoutMs: styleLoad.fallbackTimeoutMs,
            runFallbackOnlyIfNoLayers: !!styleLoad.skipFallbackIfLayersPresent,
            waitLogMessage: '[Routes] Waiting for style to load...',
            fallbackLogMessage: '[Routes] Fallback: adding layers after timeout',
            addLayersLogMessage: '[Routes] Adding route layers (isStyleLoaded: false)',
        };
    }

    /**
     * Post-mount execute plan after doAddRouteLayers batch apply.
     * @param {Object} sideEffects - from buildAllRoutesMapSideEffectsPlan
     * @param {Object} [opts]
     * @param {number} [opts.mountedLayerCount]
     * @returns {Object}
     */
    function buildDoAddRouteLayersPostMountExecutePlan(sideEffects, opts) {
        sideEffects = sideEffects || {};
        opts = opts || {};
        return {
            fitBounds: sideEffects.fitBounds || null,
            displayAllRouteHazards: !!sideEffects.displayAllRouteHazards,
            ensureTomTomTrafficLayer: !!sideEffects.ensureTomTomTrafficLayer,
            bringRoutesToTop: !!sideEffects.bringRoutesToTop,
            debugInspectRouteLayers: true,
            debugInspectDelayMs: 200,
            completionLogMessage: '[Routes] Displayed ' + (opts.mountedLayerCount || 0) + ' routes on map',
            debugLogPrefix: '[Routes] DEBUG: MapLibre has these route layers:',
        };
    }

    /**
     * Execute plan for displaySingleRoute side effects after map mount.
     * @param {Object} displayPlan - from buildSingleRouteMapDisplayPlan
     * @returns {Object}
     */
    function buildSingleRouteMapDisplayExecutePlan(displayPlan) {
        displayPlan = displayPlan || {};
        if (!displayPlan.valid) {
            return { shouldExecute: false };
        }
        var tl = displayPlan.trafficLights || {};
        return {
            shouldExecute: true,
            clearAllRouteLayers: !!displayPlan.clearAllRouteLayers,
            polyline: displayPlan.polyline,
            hazards: displayPlan.hazards,
            ensureTomTomTrafficLayer: !!displayPlan.ensureTomTomTrafficLayer,
            routeTraffic: displayPlan.routeTraffic || {},
            trafficLights: {
                action: tl.action || 'skip',
                polylinePoints: tl.polylinePoints || [],
                hasOsmTlsInHazards: !!tl.hasOsmTlsInHazards,
                plotAvailable: !!tl.plotAvailable,
            },
            logLine: displayPlan.logLine,
            plotTrafficLightsLogMessage: '[Routes] Plotting traffic lights on selected route (OSM via /api/traffic-lights)',
            skipDuplicatePlotLogMessage: '[Routes] Traffic lights on route from hazard markers (OSM); skipping duplicate plot',
            moduleUnavailableLogMessage: '[Routes] Traffic lights module not available for route plotting',
        };
    }

    var DISPLAY_ALL_ROUTES_STYLE_FALLBACK_MS = 1000;
    var BRING_ROUTES_TO_TOP_INITIAL_DELAY_MS = 100;
    var BRING_ROUTES_TO_TOP_RETRY_DELAY_MS = 100;
    var BRING_ROUTES_TO_TOP_MAX_RETRIES = 5;

    /**
     * Dispatch plan for displaying all route comparison layers on the map.
     * @param {Array<Object>} routeOptions
     * @returns {Object}
     */
    function buildDisplayAllRoutesMapDispatchPlan(routeOptions) {
        var routes = routeOptions || [];
        if (routes.length === 0) {
            return { valid: false, reason: 'no_routes' };
        }
        return {
            valid: true,
            clearAllRouteLayers: true,
            hydratePolylines: true,
            requireMap: true,
            styleLoad: {
                waitIfNeeded: true,
                fallbackTimeoutMs: DISPLAY_ALL_ROUTES_STYLE_FALLBACK_MS,
                skipFallbackIfLayersPresent: true,
            },
            routeCount: routes.length,
        };
    }

    /**
     * Orchestration plan for displayAllRoutesOnMap entry logging.
     * @param {number} [routeCount]
     * @returns {Object}
     */
    function buildDisplayAllRoutesMapOrchestrationPlan(routeCount) {
        var count = routeCount || 0;
        return {
            entryLogMessage: '[Routes] ===== displayAllRoutesOnMap called =====',
            routeCountLogPrefix: '[Routes] routeOptions:',
            routeCount: count,
            noRoutesLogMessage: '[Routes] No routeOptions available!',
            mapMissingLogMessage: '[Routes] Map not available',
        };
    }

    /**
     * Execute plan combining pre-mount and style-load scheduling for all routes.
     * @param {Object} dispatch - from buildDisplayAllRoutesMapDispatchPlan
     * @param {Object} [opts]
     * @param {boolean} [opts.isStyleLoaded]
     * @returns {Object}
     */
    function buildDisplayAllRoutesMapExecutePlan(dispatch, opts) {
        dispatch = dispatch || {};
        opts = opts || {};
        if (!dispatch.valid) {
            return { shouldExecute: false, reason: dispatch.reason || 'invalid' };
        }
        return {
            shouldExecute: true,
            preMount: buildDisplayAllRoutesMapPreMountPlan(dispatch),
            stylePlan: buildDisplayAllRoutesMapStyleLoadExecutePlan(dispatch, {
                isStyleLoaded: !!opts.isStyleLoaded,
            }),
            requireMap: !!dispatch.requireMap,
            addLayersLogMessage: '[Routes] Adding route layers (isStyleLoaded: ' + !!opts.isStyleLoaded + ')',
        };
    }

    /**
     * Mount apply plan for displayAllRoutesOnMap pre-mount and style scheduling.
     * @param {Object} execute - from buildDisplayAllRoutesMapExecutePlan
     * @param {Object} [orch] - from buildDisplayAllRoutesMapOrchestrationPlan
     * @returns {Object}
     */
    function buildDisplayAllRoutesMapMountApplyPlan(execute, orch) {
        execute = execute || {};
        orch = orch || {};
        if (!execute.shouldExecute) {
            return { shouldMount: false };
        }
        return {
            shouldMount: true,
            preMount: execute.preMount,
            stylePlan: execute.stylePlan,
            addLayersLogMessage: execute.addLayersLogMessage,
            requireMap: !!execute.requireMap,
            mapMissingLogMessage: orch.mapMissingLogMessage,
        };
    }

    /**
     * Entry orchestration plan for displayAllRoutesOnMap.
     * @param {Array<Object>} [routeOptions]
     * @param {Object} [opts]
     * @param {boolean} [opts.isStyleLoaded]
     * @returns {Object}
     */
    function buildDisplayAllRoutesMapEntryOrchestrationPlan(routeOptions, opts) {
        opts = opts || {};
        var routes = routeOptions || [];
        var routeCount = routes.length;
        var orch = buildDisplayAllRoutesMapOrchestrationPlan(routeCount);
        var dispatch = buildDisplayAllRoutesMapDispatchPlan(routes);
        if (!dispatch.valid) {
            return {
                shouldDisplay: false,
                orch: orch,
                routeCount: routeCount,
                noRoutesLogMessage: orch.noRoutesLogMessage,
            };
        }
        var execute = buildDisplayAllRoutesMapExecutePlan(dispatch, {
            isStyleLoaded: !!opts.isStyleLoaded,
        });
        var mount = buildDisplayAllRoutesMapMountApplyPlan(execute, orch);
        return {
            shouldDisplay: mount.shouldMount,
            orch: orch,
            routeCount: routeCount,
            mount: mount,
        };
    }

    /**
     * Execute plan for recalculateRouteWithPreferences side effects.
     * @param {Object} plan - from buildRecalculateRouteWithPreferencesPlan
     * @returns {Object}
     */
    function buildRecalculateRouteWithPreferencesExecutePlan(plan) {
        plan = plan || {};
        if (!plan.ok) {
            return {
                shouldRecalculate: false,
                errorStatusMessage: plan.errorStatusMessage,
            };
        }
        return {
            shouldRecalculate: true,
            saveRoutePreferences: true,
            loadingStatusMessage: plan.loadingStatusMessage,
            switchTab: plan.switchTab,
            recalculateDelayMs: plan.recalculateDelayMs != null ? plan.recalculateDelayMs : 300,
        };
    }

    /**
     * Execute plan for startNavigation / startNavigationFromPreview UI side effects.
     * @param {Object|null|undefined} lastCalculatedRoute
     * @param {Object} [opts]
     * @param {string} [opts.noRouteMessage]
     * @param {boolean} [opts.syncFromSelection]
     * @param {number} [opts.selectedRouteIndex]
     * @returns {Object}
     */
    function buildStartNavigationExecutePlan(lastCalculatedRoute, opts) {
        opts = opts || {};
        if (!lastCalculatedRoute) {
            return {
                shouldStart: false,
                errorStatusMessage: opts.noRouteMessage || 'Please calculate a route first',
            };
        }
        return {
            shouldStart: true,
            syncFromSelection: !!opts.syncFromSelection,
            selectedRouteIndex: opts.selectedRouteIndex,
            hideStartNavButtonIds: ['startNavBtn', 'startNavBtnSheet'],
            collapseBottomSheet: true,
        };
    }

    /**
     * Layer reorder plan to keep route lines above traffic overlays.
     * @param {Array<{ id?: string }>} layerDescriptors
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildBringRoutesToTopDispatchPlan(layerDescriptors, styleLayers) {
        var layers = layerDescriptors || [];
        var layerIds = [];
        layers.forEach(function (layer) {
            if (layer && layer.id) layerIds.push(layer.id);
        });
        if (layerIds.length === 0) {
            return { shouldRun: false };
        }
        return {
            shouldRun: true,
            layerIds: layerIds,
            beforeId: findFirstTextSymbolLayerId(styleLayers),
            initialDelayMs: BRING_ROUTES_TO_TOP_INITIAL_DELAY_MS,
            retryDelayMs: BRING_ROUTES_TO_TOP_RETRY_DELAY_MS,
            maxRetries: BRING_ROUTES_TO_TOP_MAX_RETRIES,
            waitForIdleIfStyleNotLoaded: true,
            ensureLabelsOnTopAfterSuccess: true,
        };
    }

    /**
     * Execute plan for bringRoutesToTop retry loop and label anchoring.
     * @param {Array<{ id?: string }>} layerDescriptors
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildBringRoutesToTopExecutePlan(layerDescriptors, styleLayers) {
        var dispatch = buildBringRoutesToTopDispatchPlan(layerDescriptors, styleLayers);
        if (!dispatch.shouldRun) {
            return { shouldExecute: false };
        }
        return {
            shouldExecute: true,
            layerIds: dispatch.layerIds,
            beforeId: dispatch.beforeId,
            initialDelayMs: dispatch.initialDelayMs,
            retryDelayMs: dispatch.retryDelayMs,
            maxRetries: dispatch.maxRetries,
            waitForIdleIfStyleNotLoaded: dispatch.waitForIdleIfStyleNotLoaded,
            ensureLabelsOnTopAfterSuccess: dispatch.ensureLabelsOnTopAfterSuccess,
            successLogMessage: '[Routes] All route layers successfully positioned',
            partialFailureLogMessage: '[Routes] Some layers not found after retries',
            errorLogPrefix: '[Routes] Error bringing routes to top:',
            waitForIdleLogMessage: '[Routes] Waiting for map idle...',
        };
    }

    /**
     * MapLibre apply spec for one route line layer.
     * @param {Object} mountPlan - from buildRouteLayerMountPlan
     * @param {string|undefined} beforeId
     * @returns {Object}
     */
    function buildRouteLayerMapLibreApplyPlan(mountPlan, beforeId) {
        mountPlan = mountPlan || {};
        if (!mountPlan.valid) {
            return {
                valid: false,
                routeName: mountPlan.routeName,
                polylinePointCount: mountPlan.polylinePointCount,
                lngLatCoordCount: mountPlan.lngLatCoords ? mountPlan.lngLatCoords.length : 0,
            };
        }
        return {
            valid: true,
            layerId: mountPlan.layerId,
            sourceId: mountPlan.sourceId,
            beforeId: beforeId,
            routeName: mountPlan.routeName,
            polylinePointCount: mountPlan.polylinePointCount,
            geoJsonFeature: mountPlan.geoJsonFeature,
            layerLayout: {
                'line-join': 'round',
                'line-cap': 'round',
            },
            paint: {
                lineColor: mountPlan.style.color,
                lineWeight: mountPlan.style.weight,
                lineOpacity: mountPlan.style.opacity,
            },
        };
    }

    /**
     * Mount execute plan for applying one route line layer on MapLibre.
     * @param {Object} applyPlan - from buildRouteLayerMapLibreApplyPlan
     * @returns {Object}
     */
    function buildRouteLayerMapLibreMountExecutePlan(applyPlan) {
        applyPlan = applyPlan || {};
        if (!applyPlan.valid) {
            return { shouldMount: false };
        }
        return {
            shouldMount: true,
            layerId: applyPlan.layerId,
            sourceId: applyPlan.sourceId,
            beforeId: applyPlan.beforeId,
            geoJsonFeature: applyPlan.geoJsonFeature,
            layerLayout: applyPlan.layerLayout,
            paint: applyPlan.paint,
            routeIndex: applyPlan.routeIndex,
            errorLogMessage: '[Routes] ✗ Error adding route ' + applyPlan.routeIndex + ':',
            registerLayerHandle: true,
        };
    }

    /**
     * Batch apply plans for doAddRouteLayers (reverse index order).
     * @param {Array<Object>} routeOptions
     * @param {number} selectedRouteIndex
     * @param {Array<Object>} [styleLayers]
     * @returns {{ beforeId: string|undefined, layers: Array<Object> }}
     */
    function buildDoAddRouteLayersBatchPlan(routeOptions, selectedRouteIndex, styleLayers) {
        var routes = routeOptions || [];
        var beforeId = findFirstTextSymbolLayerId(styleLayers);
        var layers = [];
        for (var i = routes.length - 1; i >= 0; i--) {
            var mountPlan = buildRouteLayerMountPlan(routes[i], i, selectedRouteIndex);
            var applyPlan = buildRouteLayerMapLibreApplyPlan(mountPlan, beforeId);
            applyPlan.routeIndex = i;
            layers.push(applyPlan);
        }
        return {
            beforeId: beforeId,
            layers: layers,
        };
    }

    /**
     * Execute plan for applying a doAddRouteLayers batch with log metadata.
     * @param {Object} batch - from buildDoAddRouteLayersBatchPlan
     * @returns {Object}
     */
    function buildDoAddRouteLayersBatchExecutePlan(batch) {
        batch = batch || {};
        var layers = batch.layers || [];
        var beforeId = batch.beforeId;
        var layerSteps = layers.map(function (applyPlan) {
            var idx = applyPlan.routeIndex;
            var valid = !!applyPlan.valid;
            return {
                applyPlan: applyPlan,
                valid: valid,
                startLogMessage: '[Routes] Route ' + idx + ': "' + applyPlan.routeName +
                    '", polyline points: ' + applyPlan.polylinePointCount,
                invalidLogMessage: valid ? null :
                    '[Routes] Route ' + idx + ': Not enough valid points (' +
                    (applyPlan.lngLatCoordCount || 0) + ')',
                drawLogMessage: valid ?
                    '[Routes] Drawing route ' + idx + ' with color ' + applyPlan.paint.lineColor +
                    ', weight ' + applyPlan.paint.lineWeight : null,
                successLogMessage: valid ?
                    '[Routes] ✓ Route ' + idx + ' layer added directly: ' + applyPlan.layerId +
                    (beforeId ? ' (before ' + beforeId + ')' : '') : null,
            };
        });
        return {
            beforeId: beforeId,
            layerSteps: layerSteps,
            layerCount: layerSteps.length,
        };
    }

    /**
     * Orchestration plan for doAddRouteLayers batch mount and post-mount effects.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildDoAddRouteLayersOrchestrationPlan(input) {
        input = input || {};
        return {
            shouldExecute: true,
            routeOptions: input.routeOptions || [],
            selectedRouteIndex: input.selectedRouteIndex != null ? input.selectedRouteIndex : 0,
            styleLayers: input.styleLayers || [],
            showTrafficEnabled: !!input.showTrafficEnabled,
            hasTrafficLayer: !!input.hasTrafficLayer,
            mountedLayerCount: input.mountedLayerCount != null ? input.mountedLayerCount : 0,
        };
    }

    /**
     * Execute plan for doAddRouteLayers batch apply and post-mount side effects.
     * @param {Object} orch - from buildDoAddRouteLayersOrchestrationPlan
     * @returns {Object}
     */
    function buildDoAddRouteLayersExecutePlan(orch) {
        orch = orch || {};
        var batch = buildDoAddRouteLayersBatchPlan(
            orch.routeOptions,
            orch.selectedRouteIndex,
            orch.styleLayers
        );
        var sideEffects = buildAllRoutesMapSideEffectsPlan(orch.routeOptions, {
            showTrafficEnabled: orch.showTrafficEnabled,
            hasTrafficLayer: orch.hasTrafficLayer,
        });
        return {
            shouldExecute: true,
            batchExecute: buildDoAddRouteLayersBatchExecutePlan(batch),
            postMount: buildDoAddRouteLayersPostMountExecutePlan(sideEffects, {
                mountedLayerCount: orch.mountedLayerCount,
            }),
        };
    }

    /**
     * Entry orchestration plan for doAddRouteLayers from runtime map state.
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildDoAddRouteLayersEntryOrchestrationPlan(opts) {
        opts = opts || {};
        return buildDoAddRouteLayersExecutePlan(
            buildDoAddRouteLayersOrchestrationPlan({
                routeOptions: opts.routeOptions,
                selectedRouteIndex: opts.selectedRouteIndex,
                styleLayers: opts.styleLayers,
                showTrafficEnabled: opts.showTrafficEnabled,
                hasTrafficLayer: opts.hasTrafficLayer,
                mountedLayerCount: opts.mountedLayerCount,
            })
        );
    }

    /**
     * Entry orchestration plan for bringRoutesToTop.
     * @param {Object} [opts]
     * @param {number} [opts.layerCount]
     * @param {Array<{ id?: string }>} [opts.layerDescriptors]
     * @param {Array<Object>} [opts.styleLayers]
     * @returns {Object}
     */
    function buildBringRoutesToTopEntryOrchestrationPlan(opts) {
        opts = opts || {};
        var layerCount = opts.layerCount || 0;
        return {
            orch: buildBringRoutesToTopOrchestrationPlan(layerCount),
            execute: buildBringRoutesToTopExecutePlan(opts.layerDescriptors, opts.styleLayers),
            requiresMap: true,
        };
    }

    /**
     * Orchestration plan for bringRoutesToTop entry logging.
     * @param {number} [layerCount]
     * @returns {Object}
     */
    function buildBringRoutesToTopOrchestrationPlan(layerCount) {
        return {
            entryLogPrefix: '[Routes] bringRoutesToTop called, allRouteLayers:',
            layerCount: layerCount || 0,
            mapMissingLogMessage: '[Routes] bringRoutesToTop: map not available',
        };
    }

    /**
     * Log plan for one bringRoutesToTop retry attempt.
     * @param {number} retryCount
     * @param {Array<string>} [layerIds]
     * @returns {Object}
     */
    function buildBringRoutesToTopAttemptLogPlan(retryCount, layerIds) {
        return {
            attemptLogMessage: '[Routes] moveLayersToTop attempt ' + (retryCount || 0) + ', layers:',
            layerIds: layerIds || [],
        };
    }

    /**
     * Log plan for moving one route layer during bringRoutesToTop.
     * @param {string} layerId
     * @param {string|undefined} beforeId
     * @param {boolean} found
     * @returns {Object}
     */
    function buildBringRoutesToTopLayerMoveLogPlan(layerId, beforeId, found) {
        if (found) {
            return {
                found: true,
                movedLogMessage: '[Routes] Moved layer ' + layerId +
                    (beforeId ? ' before ' + beforeId : ' to top'),
            };
        }
        return {
            found: false,
            notFoundLogMessage: '[Routes] Layer ' + layerId + ' not found in map yet',
        };
    }

    /**
     * Presence summary for route layers on the current map style.
     * @param {Array<string>} layerIds
     * @param {Object<string, boolean>} [presentById]
     * @returns {Object}
     */
    function buildBringRoutesToTopLayerPresencePlan(layerIds, presentById) {
        var ids = layerIds || [];
        var present = presentById || {};
        var missingLayerIds = [];
        var allFound = ids.length > 0;
        ids.forEach(function (layerId) {
            if (!present[layerId]) {
                allFound = false;
                missingLayerIds.push(layerId);
            }
        });
        if (ids.length === 0) {
            allFound = false;
        }
        return {
            allFound: allFound,
            missingLayerIds: missingLayerIds,
        };
    }

    /**
     * Outcome plan after one bringRoutesToTop layer-move attempt.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildBringRoutesToTopRetryOutcomePlan(input) {
        input = input || {};
        var retryCount = input.retryCount || 0;
        var maxRetries = input.maxRetries != null
            ? input.maxRetries
            : BRING_ROUTES_TO_TOP_MAX_RETRIES;
        if (input.allFound) {
            return {
                action: 'success',
                logSuccess: true,
                ensureLabelsOnTop: !!input.ensureLabelsOnTopAfterSuccess,
            };
        }
        if (retryCount < maxRetries) {
            return {
                action: 'retry',
                nextRetryCount: retryCount + 1,
                retryDelayMs: input.retryDelayMs != null
                    ? input.retryDelayMs
                    : BRING_ROUTES_TO_TOP_RETRY_DELAY_MS,
            };
        }
        return {
            action: 'partial_failure',
            logPartialFailure: true,
        };
    }

    /**
     * Startup plan for deferred bringRoutesToTop execution.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildBringRoutesToTopStartupPlan(input) {
        input = input || {};
        var initialDelayMs = input.initialDelayMs != null
            ? input.initialDelayMs
            : BRING_ROUTES_TO_TOP_INITIAL_DELAY_MS;
        if (input.isStyleLoaded) {
            return {
                action: 'immediate',
                initialDelayMs: initialDelayMs,
            };
        }
        if (input.waitForIdleIfStyleNotLoaded) {
            return {
                action: 'wait_idle',
                initialDelayMs: initialDelayMs,
                waitForIdleLogMessage: input.waitForIdleLogMessage ||
                    '[Routes] Waiting for map idle...',
            };
        }
        return { action: 'skip' };
    }

    var ENSURE_LABELS_ON_TOP_DEBOUNCE_MS = 50;

    /**
     * Orchestration plan for ensureLabelsOnTop entry guards.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildEnsureLabelsOnTopOrchestrationPlan(input) {
        input = input || {};
        if (!input.hasMap) {
            return { shouldRun: false };
        }
        return {
            shouldRun: true,
            styleLayers: input.styleLayers || [],
        };
    }

    /**
     * Dispatch plan to move road label symbol layers above route overlays.
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildEnsureLabelsOnTopDispatchPlan(styleLayers) {
        var labelLayerIds = collectTextSymbolLayerIds(styleLayers);
        if (labelLayerIds.length === 0) {
            return { shouldRun: false };
        }
        return {
            shouldRun: true,
            labelLayerIds: labelLayerIds,
            debounceMs: ENSURE_LABELS_ON_TOP_DEBOUNCE_MS,
        };
    }

    /**
     * Execute plan for debounced label layer reordering above route overlays.
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildEnsureLabelsOnTopExecutePlan(styleLayers) {
        var dispatch = buildEnsureLabelsOnTopDispatchPlan(styleLayers);
        if (!dispatch.shouldRun) {
            return {
                shouldExecute: false,
                noLabelsLogMessage: '[Labels] No label layers found',
            };
        }
        return {
            shouldExecute: true,
            labelLayerIds: dispatch.labelLayerIds,
            debounceMs: dispatch.debounceMs,
            movedLogMessage: '[Labels] Moved ' + dispatch.labelLayerIds.length + ' label layers to top',
            errorLogPrefix: '[Labels] Error ensuring labels on top:',
            skipMoveErrors: true,
        };
    }

    /**
     * Debounced apply plan for ensureLabelsOnTop layer moves.
     * @param {Object} [executePlan] - from buildEnsureLabelsOnTopExecutePlan
     * @returns {Object}
     */
    function buildEnsureLabelsOnTopDebounceApplyPlan(executePlan) {
        executePlan = executePlan || {};
        if (!executePlan.shouldExecute) {
            return {
                shouldSchedule: false,
                noLabelsLogMessage: executePlan.noLabelsLogMessage,
            };
        }
        return {
            shouldSchedule: true,
            clearExistingTimer: true,
            debounceMs: executePlan.debounceMs,
            labelLayerIds: executePlan.labelLayerIds,
            movedLogMessage: executePlan.movedLogMessage,
            errorLogPrefix: executePlan.errorLogPrefix,
            skipMoveErrors: executePlan.skipMoveErrors,
        };
    }

    /**
     * Combined orchestration + debounced apply plan for ensureLabelsOnTop.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildEnsureLabelsOnTopApplyPlan(input) {
        var orch = buildEnsureLabelsOnTopOrchestrationPlan(input);
        if (!orch.shouldRun) {
            return { shouldApply: false };
        }
        var debounce = buildEnsureLabelsOnTopDebounceApplyPlan(
            buildEnsureLabelsOnTopExecutePlan(orch.styleLayers)
        );
        if (!debounce.shouldSchedule) {
            return {
                shouldApply: false,
                noLabelsLogMessage: debounce.noLabelsLogMessage,
            };
        }
        return {
            shouldApply: true,
            clearExistingTimer: debounce.clearExistingTimer,
            debounceMs: debounce.debounceMs,
            labelLayerIds: debounce.labelLayerIds,
            movedLogMessage: debounce.movedLogMessage,
            errorLogPrefix: debounce.errorLogPrefix,
            skipMoveErrors: debounce.skipMoveErrors,
        };
    }

    /**
     * Layer reorder plan for route-traffic edge overlays.
     * @param {Array<{ id?: string }>} trafficLayers
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildBringTrafficEdgesToTopDispatchPlan(trafficLayers, styleLayers) {
        var layerIds = [];
        (trafficLayers || []).forEach(function (layer) {
            if (layer && layer.id) layerIds.push(layer.id);
        });
        if (layerIds.length === 0) {
            return { shouldRun: false };
        }
        return {
            shouldRun: true,
            layerIds: layerIds,
            beforeId: findFirstTextSymbolLayerId(styleLayers),
            ensureLabelsOnTop: true,
        };
    }

    /**
     * Layer reorder plan to keep navigation route lines above traffic edges.
     * @param {{ id?: string, outlineId?: string }|null|undefined} routeLayer
     * @param {Array<{ id?: string }>} allRouteLayers
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildBringNavRouteAboveTrafficEdgesDispatchPlan(routeLayer, allRouteLayers, styleLayers) {
        var routeLineIds = [];
        if (routeLayer && routeLayer.outlineId) {
            routeLineIds.push(routeLayer.outlineId);
        }
        if (routeLayer && routeLayer.id) {
            routeLineIds.push(routeLayer.id);
        }
        (allRouteLayers || []).forEach(function (layer) {
            if (layer && layer.id) routeLineIds.push(layer.id);
        });
        var uniqueIds = routeLineIds.filter(function (id, index) {
            return id && routeLineIds.indexOf(id) === index;
        });
        if (uniqueIds.length === 0) {
            return { shouldRun: false };
        }
        return {
            shouldRun: true,
            layerIds: uniqueIds,
            beforeId: findFirstTextSymbolLayerId(styleLayers),
            ensureLabelsOnTop: true,
        };
    }

    /**
     * Execute plan for moving route-traffic edge layers above basemap features.
     * @param {Array<{ id?: string }>} trafficLayers
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildBringTrafficEdgesToTopExecutePlan(trafficLayers, styleLayers) {
        var dispatch = buildBringTrafficEdgesToTopDispatchPlan(trafficLayers, styleLayers);
        if (!dispatch.shouldRun) {
            return { shouldExecute: false };
        }
        return {
            shouldExecute: true,
            layerIds: dispatch.layerIds,
            beforeId: dispatch.beforeId,
            ensureLabelsOnTop: dispatch.ensureLabelsOnTop,
            successLogMessage: '[Route Traffic] Traffic edge layers moved before ' +
                (dispatch.beforeId || 'top'),
            errorLogPrefix: '[Route Traffic] Error moving traffic layers to top:',
            useWarnOnError: false,
        };
    }

    /**
     * Execute plan for keeping navigation routes above traffic edge overlays.
     * @param {{ id?: string, outlineId?: string }|null|undefined} routeLayer
     * @param {Array<{ id?: string }>} allRouteLayers
     * @param {Array<Object>} [styleLayers]
     * @returns {Object}
     */
    function buildBringNavRouteAboveTrafficEdgesExecutePlan(routeLayer, allRouteLayers, styleLayers) {
        var dispatch = buildBringNavRouteAboveTrafficEdgesDispatchPlan(
            routeLayer,
            allRouteLayers,
            styleLayers
        );
        if (!dispatch.shouldRun) {
            return { shouldExecute: false };
        }
        return {
            shouldExecute: true,
            layerIds: dispatch.layerIds,
            beforeId: dispatch.beforeId,
            ensureLabelsOnTop: dispatch.ensureLabelsOnTop,
            successLogMessage: '[Routes] Navigation route above traffic edges: ' +
                dispatch.layerIds.join(', '),
            errorLogPrefix: '[Routes] bringNavRouteAboveTrafficEdges:',
            useWarnOnError: true,
        };
    }

    /**
     * Apply plan for immediate map layer reorder instructions.
     * @param {Object} [executePlan]
     * @returns {Object}
     */
    function buildMapLayerReorderApplyPlan(executePlan) {
        executePlan = executePlan || {};
        if (!executePlan.shouldExecute) {
            return { shouldApply: false };
        }
        return {
            shouldApply: true,
            layerIds: executePlan.layerIds || [],
            beforeId: executePlan.beforeId,
            ensureLabelsOnTop: executePlan.ensureLabelsOnTop,
            successLogMessage: executePlan.successLogMessage,
            errorLogPrefix: executePlan.errorLogPrefix,
            useWarnOnError: executePlan.useWarnOnError,
            logMissingLayers: true,
        };
    }

    /**
     * Orchestration plan for bringTrafficEdgesToTop entry guards.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildBringTrafficEdgesToTopOrchestrationPlan(input) {
        input = input || {};
        if (!input.hasMap) {
            return { shouldRun: false };
        }
        var trafficLayers = input.trafficLayers || [];
        if (trafficLayers.length === 0) {
            return { shouldRun: false };
        }
        return {
            shouldRun: true,
            trafficLayers: trafficLayers,
            styleLayers: input.styleLayers || [],
        };
    }

    /**
     * Orchestration plan for bringNavRouteAboveTrafficEdges entry guards.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildBringNavRouteAboveTrafficEdgesOrchestrationPlan(input) {
        input = input || {};
        if (!input.hasMap) {
            return { shouldRun: false };
        }
        return {
            shouldRun: true,
            routeLayer: input.routeLayer || null,
            allRouteLayers: input.allRouteLayers || [],
            styleLayers: input.styleLayers || [],
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
        buildRouteLayerStyle: buildRouteLayerStyle,
        latLonPolylineToLngLatCoords: latLonPolylineToLngLatCoords,
        buildRouteLineGeoJsonFeature: buildRouteLineGeoJsonFeature,
        findFirstTextSymbolLayerId: findFirstTextSymbolLayerId,
        collectTextSymbolLayerIds: collectTextSymbolLayerIds,
        buildRouteLayerMountPlan: buildRouteLayerMountPlan,
        buildTripInfoDisplayValues: buildTripInfoDisplayValues,
        buildTripInfoApplyPlan: buildTripInfoApplyPlan,
        buildRouteComparisonCardHtml: buildRouteComparisonCardHtml,
        buildRouteComparisonListHtml: buildRouteComparisonListHtml,
        buildRouteComparisonListDomApplyPlan: buildRouteComparisonListDomApplyPlan,
        buildDisplayRouteComparisonOrchestrationPlan: buildDisplayRouteComparisonOrchestrationPlan,
        buildUseRouteOrchestrationPlan: buildUseRouteOrchestrationPlan,
        buildRouteComparisonRequestRoutes: buildRouteComparisonRequestRoutes,
        buildRouteComparisonTableRowHtml: buildRouteComparisonTableRowHtml,
        buildRouteComparisonTableHtml: buildRouteComparisonTableHtml,
        buildRouteComparisonRecommendationsHtml: buildRouteComparisonRecommendationsHtml,
        buildRouteComparisonReportHtml: buildRouteComparisonReportHtml,
        buildRouteComparisonModalHtml: buildRouteComparisonModalHtml,
        hasRoutesForComparison: hasRoutesForComparison,
        buildRouteComparisonModalMountPlan: buildRouteComparisonModalMountPlan,
        buildRouteComparisonModalDomApplyPlan: buildRouteComparisonModalDomApplyPlan,
        buildRouteComparisonModalExecutePlan: buildRouteComparisonModalExecutePlan,
        buildShowRouteComparisonOrchestrationPlan: buildShowRouteComparisonOrchestrationPlan,
        buildShowRouteComparisonSuccessExecutePlan: buildShowRouteComparisonSuccessExecutePlan,
        buildShowRouteComparisonFetchPlan: buildShowRouteComparisonFetchPlan,
        buildShowRouteComparisonErrorExecutePlan: buildShowRouteComparisonErrorExecutePlan,
        buildShowRouteComparisonRequestOrchestrationPlan: buildShowRouteComparisonRequestOrchestrationPlan,
        buildShowRouteComparisonApiResultExecutePlan: buildShowRouteComparisonApiResultExecutePlan,
        buildShowAllRoutesOrchestrationPlan: buildShowAllRoutesOrchestrationPlan,
        buildSelectRouteDispatchPlan: buildSelectRouteDispatchPlan,
        buildSelectRoutePreviewPayloadPlan: buildSelectRoutePreviewPayloadPlan,
        buildSelectRouteOrchestrationPlan: buildSelectRouteOrchestrationPlan,
        buildDisplaySingleRouteOrchestrationPlan: buildDisplaySingleRouteOrchestrationPlan,
        buildRoutePreviewAfterDisplayPlan: buildRoutePreviewAfterDisplayPlan,
        buildRoutePreviewAfterDisplayExecutePlan: buildRoutePreviewAfterDisplayExecutePlan,
        buildShowRoutePreviewOrchestrationPlan: buildShowRoutePreviewOrchestrationPlan,
        buildAlternativeRoutesPreviewDomApplyPlan: buildAlternativeRoutesPreviewDomApplyPlan,
        buildAlternativeRoutesPreviewDomExecutePlan: buildAlternativeRoutesPreviewDomExecutePlan,
        buildShowAlternativeRoutesPreviewOrchestrationPlan: buildShowAlternativeRoutesPreviewOrchestrationPlan,
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
        buildNavRouteSilentUpdatePatchPlan: buildNavRouteSilentUpdatePatchPlan,
        buildRouteUpdateDuringNavigationExecutePlan: buildRouteUpdateDuringNavigationExecutePlan,
        buildInNavRerouteSuccessPlan: buildInNavRerouteSuccessPlan,
        resolveRouteGeometryPrecision: resolveRouteGeometryPrecision,
        resolvePerRouteGeometryPrecision: resolvePerRouteGeometryPrecision,
        normalizeRouteOption: normalizeRouteOption,
        buildRouteOptionsFromApiResponse: buildRouteOptionsFromApiResponse,
        hydrateRouteOptionPolylines: hydrateRouteOptionPolylines,
        isValidDecodedRoutePoint: isValidDecodedRoutePoint,
        buildStraightLineRoutePath: buildStraightLineRoutePath,
        resolvePreviewRoutePath: resolvePreviewRoutePath,
        buildRouteCalculatedStatusMessage: buildRouteCalculatedStatusMessage,
        resolveRouteDisplayTime: resolveRouteDisplayTime,
        resolveInitialRouteDurationMinutes: resolveInitialRouteDurationMinutes,
        buildLastCalculatedRoutePatch: buildLastCalculatedRoutePatch,
        buildPreviewRouteCoordsPlan: buildPreviewRouteCoordsPlan,
        buildRoutePreviewSuccessInputPlan: buildRoutePreviewSuccessInputPlan,
        buildRoutePreviewSuccessPlan: buildRoutePreviewSuccessPlan,
        buildCalculateRouteIdlePreviewExecutePlan: buildCalculateRouteIdlePreviewExecutePlan,
        isCurrentLocationPlaceholder: isCurrentLocationPlaceholder,
        orderWaypointsGreedy: orderWaypointsGreedy,
        resolvePreviewRoute: resolvePreviewRoute,
        resolvePreviewDistanceKm: resolvePreviewDistanceKm,
        buildPreviewCostValues: buildPreviewCostValues,
        buildCazStatusHtml: buildCazStatusHtml,
        getHazardPreviewPanelState: getHazardPreviewPanelState,
        buildHazardPreviewPanelApplyPlan: buildHazardPreviewPanelApplyPlan,
        formatPreviewVehicleTypeLabel: formatPreviewVehicleTypeLabel,
        formatPreviewRoutingModeLabel: formatPreviewRoutingModeLabel,
        parseRecentDestinationFromCoordString: parseRecentDestinationFromCoordString,
        buildInNavRerouteDispatchPlan: buildInNavRerouteDispatchPlan,
        buildInNavRerouteOutcomeExecutePlan: buildInNavRerouteOutcomeExecutePlan,
        buildCalculateRouteIdleUiApplyPlan: buildCalculateRouteIdleUiApplyPlan,
        buildCalculateRouteIdleUiExecutePlan: buildCalculateRouteIdleUiExecutePlan,
        buildRecalculateRouteWithPreferencesPlan: buildRecalculateRouteWithPreferencesPlan,
        buildRecalculateRouteWithPreferencesExecutePlan: buildRecalculateRouteWithPreferencesExecutePlan,
        buildStartNavigationExecutePlan: buildStartNavigationExecutePlan,
        buildRoutePreviewPanelApplyPlan: buildRoutePreviewPanelApplyPlan,
        buildRoutePreviewPanelDomApplyPlan: buildRoutePreviewPanelDomApplyPlan,
        buildRoutePreviewPanelDomExecutePlan: buildRoutePreviewPanelDomExecutePlan,
        ROUTE_PREVIEW_PANEL_ELEMENT_IDS: ROUTE_PREVIEW_PANEL_ELEMENT_IDS,
        buildAlternativeRoutesPreviewMountPlans: buildAlternativeRoutesPreviewMountPlans,
        buildNavActiveRoutePolylineStyle: buildNavActiveRoutePolylineStyle,
        buildNavRouteLayerRedrawGuardPlan: buildNavRouteLayerRedrawGuardPlan,
        buildNavActiveRouteLayerMountPlan: buildNavActiveRouteLayerMountPlan,
        routeHazardsIncludeOsmTrafficLights: routeHazardsIncludeOsmTrafficLights,
        buildRouteOverviewDispatchPlan: buildRouteOverviewDispatchPlan,
        buildSingleRouteMapDisplayPlan: buildSingleRouteMapDisplayPlan,
        buildSingleRouteMapDisplayExecutePlan: buildSingleRouteMapDisplayExecutePlan,
        buildAllRoutesMapSideEffectsPlan: buildAllRoutesMapSideEffectsPlan,
        buildClearAllRouteLayersFromMapPlan: buildClearAllRouteLayersFromMapPlan,
        buildDisplayAllRoutesMapPreMountPlan: buildDisplayAllRoutesMapPreMountPlan,
        buildDisplayAllRoutesMapStyleLoadExecutePlan: buildDisplayAllRoutesMapStyleLoadExecutePlan,
        buildDoAddRouteLayersPostMountExecutePlan: buildDoAddRouteLayersPostMountExecutePlan,
        buildDisplayAllRoutesMapDispatchPlan: buildDisplayAllRoutesMapDispatchPlan,
        buildDisplayAllRoutesMapOrchestrationPlan: buildDisplayAllRoutesMapOrchestrationPlan,
        buildDisplayAllRoutesMapExecutePlan: buildDisplayAllRoutesMapExecutePlan,
        buildDisplayAllRoutesMapMountApplyPlan: buildDisplayAllRoutesMapMountApplyPlan,
        buildDisplayAllRoutesMapEntryOrchestrationPlan: buildDisplayAllRoutesMapEntryOrchestrationPlan,
        buildBringRoutesToTopDispatchPlan: buildBringRoutesToTopDispatchPlan,
        buildBringRoutesToTopExecutePlan: buildBringRoutesToTopExecutePlan,
        buildRouteLayerMapLibreApplyPlan: buildRouteLayerMapLibreApplyPlan,
        buildRouteLayerMapLibreMountExecutePlan: buildRouteLayerMapLibreMountExecutePlan,
        buildDoAddRouteLayersBatchPlan: buildDoAddRouteLayersBatchPlan,
        buildDoAddRouteLayersBatchExecutePlan: buildDoAddRouteLayersBatchExecutePlan,
        buildDoAddRouteLayersOrchestrationPlan: buildDoAddRouteLayersOrchestrationPlan,
        buildDoAddRouteLayersExecutePlan: buildDoAddRouteLayersExecutePlan,
        buildDoAddRouteLayersEntryOrchestrationPlan: buildDoAddRouteLayersEntryOrchestrationPlan,
        buildBringRoutesToTopOrchestrationPlan: buildBringRoutesToTopOrchestrationPlan,
        buildBringRoutesToTopEntryOrchestrationPlan: buildBringRoutesToTopEntryOrchestrationPlan,
        buildBringRoutesToTopAttemptLogPlan: buildBringRoutesToTopAttemptLogPlan,
        buildBringRoutesToTopLayerMoveLogPlan: buildBringRoutesToTopLayerMoveLogPlan,
        buildBringRoutesToTopLayerPresencePlan: buildBringRoutesToTopLayerPresencePlan,
        buildBringRoutesToTopRetryOutcomePlan: buildBringRoutesToTopRetryOutcomePlan,
        buildBringRoutesToTopStartupPlan: buildBringRoutesToTopStartupPlan,
        buildEnsureLabelsOnTopOrchestrationPlan: buildEnsureLabelsOnTopOrchestrationPlan,
        buildEnsureLabelsOnTopDispatchPlan: buildEnsureLabelsOnTopDispatchPlan,
        buildEnsureLabelsOnTopExecutePlan: buildEnsureLabelsOnTopExecutePlan,
        buildEnsureLabelsOnTopDebounceApplyPlan: buildEnsureLabelsOnTopDebounceApplyPlan,
        buildEnsureLabelsOnTopApplyPlan: buildEnsureLabelsOnTopApplyPlan,
        buildBringTrafficEdgesToTopDispatchPlan: buildBringTrafficEdgesToTopDispatchPlan,
        buildBringNavRouteAboveTrafficEdgesDispatchPlan: buildBringNavRouteAboveTrafficEdgesDispatchPlan,
        buildBringTrafficEdgesToTopExecutePlan: buildBringTrafficEdgesToTopExecutePlan,
        buildBringNavRouteAboveTrafficEdgesExecutePlan: buildBringNavRouteAboveTrafficEdgesExecutePlan,
        buildMapLayerReorderApplyPlan: buildMapLayerReorderApplyPlan,
        buildBringTrafficEdgesToTopOrchestrationPlan: buildBringTrafficEdgesToTopOrchestrationPlan,
        buildBringNavRouteAboveTrafficEdgesOrchestrationPlan:
            buildBringNavRouteAboveTrafficEdgesOrchestrationPlan,
        ENSURE_LABELS_ON_TOP_DEBOUNCE_MS: ENSURE_LABELS_ON_TOP_DEBOUNCE_MS,
        DISPLAY_ALL_ROUTES_STYLE_FALLBACK_MS: DISPLAY_ALL_ROUTES_STYLE_FALLBACK_MS,
        mergeNavigationRouteFromSelected: mergeNavigationRouteFromSelected,
        mergeLastCalculatedRouteFromSelection: mergeLastCalculatedRouteFromSelection,
        buildRoutePayloadFromPersisted: buildRoutePayloadFromPersisted,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSelection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

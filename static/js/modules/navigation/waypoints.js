/**
 * @file Pure waypoint list and multi-drop itinerary HTML builders (no DOM, no globals).
 * @module modules/navigation/waypoints
 */
(function (root) {
    'use strict';

    var MULTIDROP_LEG_COLORS = [
        '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
        '#00BCD4', '#FF5722', '#795548', '#607D8B', '#3F51B5',
    ];

    var EMPTY_WAYPOINTS_HTML = '<div class="waypoints-empty">No waypoints yet. Add via-points or stops above.</div>';

    /**
     * @param {{name: string}} point
     * @param {number} index
     * @returns {string}
     */
    function buildViaWaypointItemHtml(point, index) {
        return (
            '<div class="waypoint-item" draggable="true" data-type="via" data-index="' + index + '"' +
            ' ondragstart="onWaypointDragStart(event)" ondragover="onWaypointDragOver(event)" ondrop="onWaypointDrop(event)"' +
            ' style="display: flex; align-items: center; padding: 8px; background: #FFF3E0; border-radius: 6px; margin-bottom: 6px; cursor: grab; transition: opacity 0.2s;">' +
                '<span style="margin-right: 6px; color: #999; font-size: 14px; cursor: grab;">⠿</span>' +
                '<span style="background: #FF9800; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">' + (index + 1) + '</span>' +
                '<span style="flex: 1; font-size: 13px;">' + point.name + '</span>' +
                '<button onclick="moveWaypoint(\'via\', ' + index + ', -1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move up">▲</button>' +
                '<button onclick="moveWaypoint(\'via\', ' + index + ', 1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move down">▼</button>' +
                '<button onclick="removeViaPoint(' + index + ')" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 16px;">✕</button>' +
            '</div>'
        );
    }

    /**
     * @param {{name: string, duration: number}} stop
     * @param {number} index
     * @returns {string}
     */
    function buildStopWaypointItemHtml(stop, index) {
        return (
            '<div class="waypoint-item" draggable="true" data-type="stop" data-index="' + index + '"' +
            ' ondragstart="onWaypointDragStart(event)" ondragover="onWaypointDragOver(event)" ondrop="onWaypointDrop(event)"' +
            ' style="display: flex; align-items: center; padding: 8px; background: #FCE4EC; border-radius: 6px; margin-bottom: 6px; cursor: grab; transition: opacity 0.2s;">' +
                '<span style="margin-right: 6px; color: #999; font-size: 14px; cursor: grab;">⠿</span>' +
                '<span style="background: #E91E63; color: white; border-radius: 4px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">' + (index + 1) + '</span>' +
                '<span style="flex: 1; font-size: 13px;">' + stop.name + ' (' + stop.duration + ' min)</span>' +
                '<button onclick="moveWaypoint(\'stop\', ' + index + ', -1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move up">▲</button>' +
                '<button onclick="moveWaypoint(\'stop\', ' + index + ', 1)" style="background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px;" title="Move down">▼</button>' +
                '<button onclick="removeStop(' + index + ')" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 16px;">✕</button>' +
            '</div>'
        );
    }

    /**
     * @param {Array<Object>} viaPoints
     * @param {Array<Object>} stops
     * @returns {string}
     */
    function buildWaypointsListHtml(viaPoints, stops) {
        viaPoints = viaPoints || [];
        stops = stops || [];
        if (viaPoints.length === 0 && stops.length === 0) return EMPTY_WAYPOINTS_HTML;

        var html = '';
        for (var i = 0; i < viaPoints.length; i++) {
            html += buildViaWaypointItemHtml(viaPoints[i], i);
        }
        for (var j = 0; j < stops.length; j++) {
            html += buildStopWaypointItemHtml(stops[j], j);
        }
        var totalStopTime = stops.reduce(function (sum, s) { return sum + (s.duration || 0); }, 0);
        if (totalStopTime > 0) {
            html += '<div style="font-size: 12px; color: #666; margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px;">Total stop time: <strong>' + totalStopTime + ' min</strong></div>';
        }
        return html;
    }

    /**
     * @param {Object} leg
     * @param {number} index
     * @param {Object} opts
     * @returns {string}
     */
    function buildMultiDropLegHtml(leg, index, opts) {
        opts = opts || {};
        var legDist = opts.distanceText;
        var legTime = Math.round(leg.duration_minutes || 0);
        var eta = opts.etaClockText || '';
        var stopInfo = leg.stop;
        var bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
        var borderColor = stopInfo && !stopInfo.time_window_ok ? '#f44336' : '#4CAF50';

        var html = '<div style="padding: 10px; background: ' + bgColor + '; border-left: 3px solid ' + borderColor + '; border-radius: 4px; margin-bottom: 4px;">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center;">';
        html += '<span style="font-weight: 500; font-size: 13px;">Leg ' + (index + 1) + '</span>';
        html += '<span style="font-size: 12px; color: #666;">' + legDist + ' ' + opts.distUnit + ' | ' + legTime + ' min</span>';
        html += '</div>';

        if (stopInfo) {
            html += '<div style="margin-top: 4px; font-size: 12px;">';
            html += '<span style="color: #E91E63; font-weight: 500;">' + stopInfo.name + '</span>';
            if (stopInfo.duration_minutes > 0) {
                html += ' <span style="color: #999;">(' + stopInfo.duration_minutes + ' min stop)</span>';
            }
            if (eta) html += ' <span style="color: #2196F3;">ETA: ' + eta + '</span>';
            if (!stopInfo.time_window_ok) {
                html += ' <span style="color: #f44336; font-weight: 600;">Outside time window</span>';
            }
            html += '</div>';
        } else if (eta) {
            html += '<div style="margin-top: 4px; font-size: 12px; color: #2196F3;">ETA: ' + eta + '</div>';
        }
        html += '</div>';
        return html;
    }

    /**
     * @param {Object} data
     * @param {Object} opts
     * @returns {string}
     */
    function buildMultiDropItineraryHtml(data, opts) {
        opts = opts || {};
        if (!data || !data.legs) return '';

        var html = '<div style="margin-top: 10px;">';
        html += '<div style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #333;">Route Itinerary' +
            (data.optimized ? ' (Optimized)' : '') + '</div>';

        for (var i = 0; i < data.legs.length; i++) {
            var leg = data.legs[i];
            var etaText = '';
            if (leg.eta && opts.formatEtaClock) {
                etaText = opts.formatEtaClock(new Date(leg.eta));
            }
            html += buildMultiDropLegHtml(leg, i, {
                distanceText: opts.legDistanceTexts ? opts.legDistanceTexts[i] : opts.distanceText,
                distUnit: opts.distUnit,
                etaClockText: etaText,
            });
        }

        html += '<div style="padding: 8px; background: #E8F5E9; border-radius: 4px; margin-top: 8px;">';
        html += '<div style="font-weight: 600; font-size: 13px; color: #2E7D32;">';
        html += 'Total: ' + opts.totalDistanceText + ' ' + opts.distUnit + ' | ';
        html += Math.round(data.total_duration_minutes) + ' min';
        if (data.total_stop_time_minutes > 0) {
            html += ' (incl. ' + data.total_stop_time_minutes + ' min stops)';
        }
        html += '</div>';
        if (data.round_trip) {
            html += '<div style="font-size: 11px; color: #666; margin-top: 2px;">Round trip - returns to start</div>';
        }
        html += '</div></div>';
        return html;
    }

    /**
     * Mount plan for multi-drop itinerary HTML appended to the waypoints list.
     * @param {Object} data
     * @param {Object} fmt
     * @param {string} fmt.distUnit
     * @param {function(number): string} [fmt.convertDistance]
     * @param {string} [fmt.totalDistanceText]
     * @param {Array<string>} [fmt.legDistanceTexts]
     * @param {function(Date): string} [fmt.formatEtaClock]
     * @returns {{ appendHtml: string, shouldDrawLegs: boolean }|null}
     */
    function buildMultiDropItineraryMountPlan(data, fmt) {
        if (!data || !data.legs) return null;
        fmt = fmt || {};
        var legDistanceTexts = fmt.legDistanceTexts;
        if (!legDistanceTexts && fmt.convertDistance) {
            legDistanceTexts = data.legs.map(function (leg) {
                return fmt.convertDistance(leg.distance_km || 0);
            });
        }
        return {
            appendHtml: buildMultiDropItineraryHtml(data, {
                distUnit: fmt.distUnit,
                totalDistanceText: fmt.totalDistanceText ||
                    (fmt.convertDistance ? fmt.convertDistance(data.total_distance_km) : ''),
                legDistanceTexts: legDistanceTexts,
                formatEtaClock: fmt.formatEtaClock,
            }),
            shouldDrawLegs: !!(data.all_geometry && data.all_geometry.length > 0),
        };
    }

    /**
     * DOM apply plan for appending multi-drop itinerary to the waypoints list.
     * @param {Object} data
     * @param {Object} fmt
     * @returns {Object}
     */
    function buildMultiDropLegsDisplayDomApplyPlan(data, fmt) {
        var mountPlan = buildMultiDropItineraryMountPlan(data, fmt);
        if (!mountPlan) {
            return { shouldDisplay: false };
        }
        return {
            shouldDisplay: true,
            containerId: WAYPOINTS_LIST_CONTAINER_ID,
            appendHtml: mountPlan.appendHtml,
            shouldDrawLegs: mountPlan.shouldDrawLegs,
        };
    }

    var ROUTE_DRAG_MARKER_ICON_SIZE = [20, 20];
    var WAYPOINT_MARKER_ICON_SIZE = [28, 28];

    /**
     * @returns {string}
     */
    function buildRouteDragMarkerHtml() {
        return '<div style="background: #FF9800; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: grab;"></div>';
    }

    var ROUTE_EDIT_MARKER_INTERVAL_MIN = 10;
    var ROUTE_EDIT_MARKER_DIVISOR = 15;

    /**
     * Plan for draggable route-edit markers along a path.
     * @param {Array<[number,number]>} routePath
     * @returns {Object}
     */
    function buildRouteEditMarkersPlan(routePath) {
        routePath = routePath || [];
        if (routePath.length < 2) {
            return {
                valid: false,
                statusMessage: 'No route to edit',
                statusType: 'error',
            };
        }
        var interval = Math.max(
            ROUTE_EDIT_MARKER_INTERVAL_MIN,
            Math.floor(routePath.length / ROUTE_EDIT_MARKER_DIVISOR)
        );
        var markers = [];
        for (var i = interval; i < routePath.length - interval; i += interval) {
            markers.push({
                lat: routePath[i][0],
                lon: routePath[i][1],
                routeIndex: i,
            });
        }
        return {
            valid: true,
            markers: markers,
            statusMessage: '🖐️ Drag the orange markers to modify the route (' + markers.length + ' edit points)',
            statusType: 'info',
        };
    }

    /**
     * Mount spec for one route drag marker.
     * @param {number} lat
     * @param {number} lon
     * @param {number} routeIndex
     * @returns {Object}
     */
    function buildRouteDragMarkerMountPlan(lat, lon, routeIndex) {
        return {
            lat: lat,
            lon: lon,
            routeIndex: routeIndex,
            className: 'route-drag-marker',
            markerHtml: buildRouteDragMarkerHtml(),
            iconSize: ROUTE_DRAG_MARKER_ICON_SIZE,
            iconAnchor: [10, 10],
            cursorStyle: 'grab',
            draggable: true,
            dragEndEvent: 'dragend',
            dragEndAction: 'addDraggedViaPoint',
        };
    }

    var ROUTE_EDIT_TOGGLE_ELEMENT_ID = 'editRouteBtn';
    var VIA_POINT_ADDRESS_INPUT_ID = 'viaPointAddress';
    var STOP_ADDRESS_INPUT_ID = 'stopAddress';
    var ADD_VIA_POINT_BTN_ID = 'addViaPointBtn';
    var ADD_STOP_BTN_ID = 'addStopBtn';
    var WAYPOINTS_LIST_CONTAINER_ID = 'waypointsList';
    var MULTIDROP_LEG_CLEAR_MAX = 25;
    var MULTIDROP_LEG_LINE_WIDTH = 5;
    var MULTIDROP_LEG_LINE_OPACITY = 0.85;

    /**
     * Apply plan for adding a via-point from route drag.
     * @param {number} lat
     * @param {number} lon
     * @param {number} viaPointsCount
     * @returns {Object}
     */
    function buildDraggedViaPointAddPlan(lat, lon, viaPointsCount) {
        var index = viaPointsCount || 0;
        return {
            viaPoint: {
                lat: lat,
                lon: lon,
                name: 'Drag point ' + (index + 1),
                type: 'via',
            },
            viaIndex: index,
            marker: {
                className: 'via-point-marker',
                iconSize: WAYPOINT_MARKER_ICON_SIZE,
                iconAnchor: [14, 14],
                removeOnclick: 'removeViaPoint(' + index + ')',
            },
            clearRouteDragMarkers: true,
            updateWaypointsList: true,
            recalculateRoute: true,
            statusMessage: '🔄 Recalculating route with new via-point...',
            statusType: 'info',
        };
    }

    /**
     * DOM apply plan for the route editing toggle button.
     * @param {boolean} routeEditingEnabled
     * @returns {Object}
     */
    function buildRouteEditingToggleDomApplyPlan(routeEditingEnabled) {
        return {
            elementId: ROUTE_EDIT_TOGGLE_ELEMENT_ID,
            active: !!routeEditingEnabled,
            text: routeEditingEnabled
                ? '✏️ Editing... (click to stop)'
                : '✏️ Edit Route',
        };
    }

    /**
     * Dispatch plan when toggling route editing off.
     * @returns {Object}
     */
    function buildRouteEditingDisablePlan() {
        return {
            clearRouteDragMarkers: true,
            disableRouteEditing: true,
            statusMessage: 'Route editing disabled',
            statusType: 'info',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleRouteEditingOrchestrationPlan(input) {
        input = input || {};
        if (input.currentlyEnabled) {
            var disable = buildRouteEditingDisablePlan();
            return {
                action: 'disable',
                clearRouteDragMarkers: disable.clearRouteDragMarkers,
                disableRouteEditing: disable.disableRouteEditing,
                statusMessage: disable.statusMessage,
                statusType: disable.statusType,
            };
        }
        return { action: 'enable' };
    }

    /**
     * Execute plan for enabling route editing markers.
     * @param {Object} markerPlan - from buildRouteEditMarkersPlan
     * @returns {Object}
     */
    function buildRouteEditEnableExecutePlan(markerPlan) {
        markerPlan = markerPlan || {};
        if (!markerPlan.valid) {
            return {
                shouldEnable: false,
                errorStatusMessage: markerPlan.statusMessage,
                statusType: markerPlan.statusType,
            };
        }
        return {
            shouldEnable: true,
            markers: markerPlan.markers || [],
            statusMessage: markerPlan.statusMessage,
            statusType: markerPlan.statusType,
            addedLogPrefix: '[Route Edit] Added ',
            addedLogSuffix: ' drag markers',
        };
    }

    /**
     * Execute plan for mounting one route drag marker.
     * @param {Object} mountPlan - from buildRouteDragMarkerMountPlan
     * @returns {Object}
     */
    function buildRouteDragMarkerExecutePlan(mountPlan) {
        mountPlan = mountPlan || {};
        return {
            shouldMount: true,
            lat: mountPlan.lat,
            lon: mountPlan.lon,
            routeIndex: mountPlan.routeIndex,
            className: mountPlan.className,
            markerHtml: mountPlan.markerHtml,
            iconSize: mountPlan.iconSize,
            iconAnchor: mountPlan.iconAnchor,
            cursorStyle: mountPlan.cursorStyle,
            originalLat: mountPlan.lat,
            originalLon: mountPlan.lon,
            draggable: mountPlan.draggable !== false,
            dragEndEvent: mountPlan.dragEndEvent || 'dragend',
            dragEndAction: mountPlan.dragEndAction || 'addDraggedViaPoint',
        };
    }

    /**
     * Dispatch plan when a route drag marker finishes dragging.
     * @param {number} lat
     * @param {number} lon
     * @returns {Object}
     */
    function buildRouteDragMarkerDragEndDispatchPlan(lat, lon) {
        var parsedLat = Number(lat);
        var parsedLon = Number(lon);
        return {
            shouldAddViaPoint: Number.isFinite(parsedLat) && Number.isFinite(parsedLon),
            lat: parsedLat,
            lon: parsedLon,
            dragEndAction: 'addDraggedViaPoint',
        };
    }

    /**
     * Execute plan for clearing route drag markers.
     * @returns {Object}
     */
    function buildClearRouteDragMarkersExecutePlan() {
        return {
            shouldClear: true,
            disableRouteEditing: true,
        };
    }

    /**
     * @param {string|number} label
     * @returns {string}
     */
    function buildViaPointMarkerHtml(label) {
        return (
            '<div style="background: #FF9800; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">' +
                label +
            '</div>'
        );
    }

    /**
     * @returns {string}
     */
    function buildViaPointDragAddedMarkerHtml() {
        return (
            '<div style="background: #4CAF50; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">✓</div>'
        );
    }

    /**
     * @returns {string}
     */
    function buildStopMarkerHtml() {
        return (
            '<div style="background: #E91E63; color: white; border-radius: 4px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🅿️</div>'
        );
    }

    /**
     * @param {string} removeOnclick
     * @returns {string}
     */
    function buildWaypointRemoveButtonHtml(removeOnclick) {
        return '<button onclick="' + removeOnclick + '" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button>';
    }

    /**
     * @param {string} pointName
     * @param {string} removeOnclick
     * @returns {string}
     */
    function buildViaPointPopupHtml(pointName, removeOnclick) {
        return '<b>' + pointName + '</b><br>' + buildWaypointRemoveButtonHtml(removeOnclick);
    }

    /**
     * @param {string} removeOnclick
     * @returns {string}
     */
    function buildViaPointDragPopupHtml(removeOnclick) {
        return (
            '<div style="text-align: center;">' +
                '<strong>Via Point</strong><br>' +
                '<small>Drag to adjust</small><br>' +
                '<button onclick="' + removeOnclick + '" style="background: #F44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-top: 6px; cursor: pointer;">Remove</button>' +
            '</div>'
        );
    }

    /**
     * @param {string} stopName
     * @param {number} duration
     * @param {string} removeOnclick
     * @returns {string}
     */
    function buildStopPopupHtml(stopName, duration, removeOnclick) {
        return '<b>' + stopName + '</b><br>Duration: ' + duration + ' min<br>' + buildWaypointRemoveButtonHtml(removeOnclick);
    }

    /**
     * Add plan for a via-point at map coordinates.
     * @param {number} lat
     * @param {number} lon
     * @param {string|null} [name]
     * @param {number} [viaPointsCount]
     * @returns {Object}
     */
    function buildViaPointAddPlan(lat, lon, name, viaPointsCount) {
        var count = viaPointsCount || 0;
        var pointName = name || ('Via-point ' + (count + 1));
        var viaIndex = count;
        return {
            viaPoint: { lat: lat, lon: lon, name: pointName, type: 'via' },
            viaIndex: viaIndex,
            marker: {
                className: 'via-point-marker',
                label: count + 1,
                iconSize: WAYPOINT_MARKER_ICON_SIZE,
                iconAnchor: [14, 14],
                removeOnclick: 'removeViaPoint(' + viaIndex + ')',
            },
            updateWaypointsList: true,
            statusMessage: 'Added via-point: ' + pointName,
            statusType: 'success',
        };
    }

    /**
     * Remove plan for a via-point by index.
     * @param {number} index
     * @param {number} [viaPointsCount]
     * @returns {Object}
     */
    function buildViaPointRemovePlan(index, viaPointsCount) {
        var count = viaPointsCount || 0;
        if (index < 0 || index >= count) {
            return { shouldRemove: false };
        }
        return {
            shouldRemove: true,
            index: index,
            removeMarkerAtIndex: index,
            updateWaypointsList: true,
            refreshMarkers: true,
            statusMessage: 'Via-point removed',
            statusType: 'info',
        };
    }

    /**
     * Rebuild plan for all via-point markers after list mutation.
     * @param {Array<Object>} viaPoints
     * @returns {Object}
     */
    function buildViaPointMarkersRefreshPlan(viaPoints) {
        viaPoints = viaPoints || [];
        return {
            markers: viaPoints.map(function (point, idx) {
                return {
                    lat: point.lat,
                    lon: point.lon,
                    className: 'via-point-marker',
                    label: idx + 1,
                    iconSize: WAYPOINT_MARKER_ICON_SIZE,
                    iconAnchor: [14, 14],
                    removeOnclick: 'removeViaPoint(' + idx + ')',
                    popupName: point.name,
                };
            }),
        };
    }

    /**
     * Add plan for a stop at map coordinates.
     * @param {number} lat
     * @param {number} lon
     * @param {string|null} [name]
     * @param {number} [duration]
     * @param {number} [stopsCount]
     * @returns {Object}
     */
    function buildStopAddPlan(lat, lon, name, duration, stopsCount) {
        var count = stopsCount || 0;
        var stopDuration = duration != null ? duration : 15;
        var stopName = name || ('Stop ' + (count + 1));
        var stopIndex = count;
        return {
            stop: { lat: lat, lon: lon, name: stopName, type: 'stop', duration: stopDuration },
            stopIndex: stopIndex,
            marker: {
                className: 'stop-marker',
                iconSize: WAYPOINT_MARKER_ICON_SIZE,
                iconAnchor: [14, 14],
                removeOnclick: 'removeStop(' + stopIndex + ')',
            },
            updateWaypointsList: true,
            statusMessage: 'Added stop: ' + stopName + ' (' + stopDuration + ' min)',
            statusType: 'success',
        };
    }

    /**
     * Remove plan for a stop by index.
     * @param {number} index
     * @param {number} [stopsCount]
     * @returns {Object}
     */
    function buildStopRemovePlan(index, stopsCount) {
        var count = stopsCount || 0;
        if (index < 0 || index >= count) {
            return { shouldRemove: false };
        }
        return {
            shouldRemove: true,
            index: index,
            removeMarkerAtIndex: index,
            updateWaypointsList: true,
            statusMessage: 'Stop removed',
            statusType: 'info',
        };
    }

    /**
     * Clear plan for all via-points and stops.
     * @returns {Object}
     */
    function buildClearAllWaypointsPlan() {
        return {
            clearViaPoints: true,
            clearStops: true,
            removeAllMarkers: true,
            clearMultiDropLayers: true,
            updateWaypointsList: true,
            statusMessage: 'All waypoints cleared',
            statusType: 'info',
        };
    }

    /**
     * Move plan for reordering a waypoint up or down in the list.
     * @param {string} type - 'via' | 'stop'
     * @param {number} index
     * @param {number} direction - -1 or 1
     * @param {number} [count]
     * @returns {Object}
     */
    function buildWaypointMovePlan(type, index, direction, count) {
        count = count || 0;
        var newIndex = index + direction;
        if (newIndex < 0 || newIndex >= count) {
            return { shouldMove: false };
        }
        return {
            shouldMove: true,
            type: type,
            fromIndex: index,
            toIndex: newIndex,
            updateWaypointsList: true,
            refreshViaMarkers: type === 'via',
        };
    }

    /**
     * Reorder plan for drag-and-drop waypoint list changes.
     * @param {string} type - 'via' | 'stop'
     * @param {number} dragIndex
     * @param {number} targetIndex
     * @param {number} [count]
     * @returns {Object}
     */
    function buildWaypointReorderPlan(type, dragIndex, targetIndex, count) {
        count = count || 0;
        if (dragIndex < 0 || dragIndex >= count || targetIndex < 0 || targetIndex >= count) {
            return { shouldReorder: false };
        }
        if (dragIndex === targetIndex) {
            return { shouldReorder: false };
        }
        return {
            shouldReorder: true,
            type: type,
            fromIndex: dragIndex,
            toIndex: targetIndex,
            updateWaypointsList: true,
            refreshViaMarkers: type === 'via',
            resetDragOpacity: true,
        };
    }

    /**
     * Dispatch plan for adding a waypoint from an address input field.
     * @param {Object} inputState
     * @param {string} [inputState.lat]
     * @param {string} [inputState.lon]
     * @param {string} [inputState.displayName]
     * @param {string} [inputState.query]
     * @param {string} waypointKind - 'via' | 'stop'
     * @returns {Object}
     */
    function buildWaypointAddressAddDispatchPlan(inputState, waypointKind) {
        inputState = inputState || {};
        var isVia = waypointKind === 'via';
        var inputId = isVia ? VIA_POINT_ADDRESS_INPUT_ID : STOP_ADDRESS_INPUT_ID;
        var lat = inputState.lat;
        var lon = inputState.lon;
        var displayName = inputState.displayName || (inputState.query || '').trim();
        var query = (inputState.query || '').trim();

        if (lat && lon) {
            return {
                action: 'add_resolved',
                inputId: inputId,
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                name: displayName,
                clearInput: true,
                hideAutocomplete: true,
            };
        }

        if (!query) {
            return {
                action: 'prompt',
                statusMessage: isVia
                    ? 'Type an address to add as via-point'
                    : 'Type an address to add as stop',
                statusType: 'info',
            };
        }

        return {
            action: 'geocode',
            inputId: inputId,
            query: query,
            waypointKind: waypointKind,
            loadingMessage: isVia
                ? '🔍 Looking up via-point address...'
                : '🔍 Looking up stop address...',
        };
    }

    /**
     * Status plan after geocoding succeeds for a waypoint address.
     * @param {string} waypointKind - 'via' | 'stop'
     * @param {string} displayName
     * @returns {Object}
     */
    function buildWaypointAddressGeocodeSuccessPlan(waypointKind, displayName) {
        var isVia = waypointKind === 'via';
        return {
            clearInput: true,
            statusMessage: isVia
                ? '📍 Via-point added: ' + displayName
                : '🛑 Stop added: ' + displayName,
            statusType: 'success',
        };
    }

    /**
     * Status plan when geocoding fails for a waypoint address.
     * @returns {Object}
     */
    function buildWaypointAddressGeocodeFailurePlan() {
        return {
            statusMessage: '❌ Could not find that address',
            statusType: 'error',
        };
    }

    /**
     * Toggle plan for via-point map-pick mode.
     * @param {boolean} addingViaPoint
     * @returns {Object}
     */
    function buildAddViaPointTogglePlan(addingViaPoint) {
        return {
            addingViaPoint: !!addingViaPoint,
            addingStop: false,
            buttonId: ADD_VIA_POINT_BTN_ID,
            buttonActive: !!addingViaPoint,
            buttonText: addingViaPoint ? '📍 Click map to add via-point' : '📍 Add Via-Point',
            statusMessage: addingViaPoint ? 'Click on the map to add a via-point' : null,
            statusType: 'info',
            mapCursor: addingViaPoint ? 'crosshair' : '',
        };
    }

    /**
     * Toggle plan for stop map-pick mode.
     * @param {boolean} addingStop
     * @returns {Object}
     */
    function buildAddStopTogglePlan(addingStop) {
        return {
            addingViaPoint: false,
            addingStop: !!addingStop,
            buttonId: ADD_STOP_BTN_ID,
            buttonActive: !!addingStop,
            buttonText: addingStop ? '🛑 Click map to add stop' : '🛑 Add Stop',
            statusMessage: addingStop ? 'Click on the map to add a stop' : null,
            statusType: 'info',
            mapCursor: addingStop ? 'crosshair' : '',
        };
    }

    /**
     * Dispatch plan for map clicks while adding waypoints.
     * @param {Object} [opts]
     * @param {boolean} [opts.addingViaPoint]
     * @param {boolean} [opts.addingStop]
     * @param {number} [opts.lat]
     * @param {number} [opts.lon]
     * @returns {Object}
     */
    function buildMapClickWaypointDispatchPlan(opts) {
        opts = opts || {};
        if (opts.addingViaPoint) {
            return {
                action: 'add_via',
                lat: opts.lat,
                lon: opts.lon,
                toggleOffVia: true,
            };
        }
        if (opts.addingStop) {
            return {
                action: 'add_stop',
                lat: opts.lat,
                lon: opts.lon,
                toggleOffStop: true,
            };
        }
        return { action: 'none' };
    }

    /**
     * DOM apply plan for the waypoints list container.
     * @param {Array<Object>} viaPoints
     * @param {Array<Object>} stops
     * @returns {Object}
     */
    function buildWaypointsListDomApplyPlan(viaPoints, stops) {
        return {
            containerId: WAYPOINTS_LIST_CONTAINER_ID,
            innerHtml: buildWaypointsListHtml(viaPoints, stops),
        };
    }

    /**
     * Drag-start plan for reordering waypoints in the list.
     * @param {string} type
     * @param {number} index
     * @returns {Object}
     */
    function buildWaypointDragStartPlan(type, index) {
        if (!type || isNaN(index)) {
            return { shouldDrag: false };
        }
        return {
            shouldDrag: true,
            dragState: { type: type, index: index },
            itemOpacity: '0.5',
            dataTransferEffect: 'move',
        };
    }

    /**
     * Extract drag context from a waypoint list item event target.
     * @param {Object|null|undefined} target - DOM event target with dataset
     * @returns {Object}
     */
    function buildWaypointDragEventContextPlan(target) {
        var dataset = target && target.dataset ? target.dataset : {};
        var type = dataset.type || null;
        var index = dataset.index != null ? parseInt(dataset.index, 10) : NaN;
        return {
            type: type,
            index: index,
            dragStartPlan: buildWaypointDragStartPlan(type, index),
        };
    }

    /**
     * Reset plan for waypoint item opacity after drag ends.
     * @returns {Object}
     */
    function buildWaypointDragOpacityResetPlan() {
        return {
            selector: '.waypoint-item',
            opacity: '1',
        };
    }

    /**
     * Drag-over plan for waypoint list reordering.
     * @returns {Object}
     */
    function buildWaypointDragOverPlan() {
        return {
            preventDefault: true,
            dropEffect: 'move',
        };
    }

    /**
     * Drop dispatch plan for waypoint list drag-and-drop reordering.
     * @param {Object|null} draggedWaypoint
     * @param {string|null} targetType
     * @param {number} targetIndex
     * @param {number} [viaCount]
     * @param {number} [stopsCount]
     * @returns {Object}
     */
    function buildWaypointDropDispatchPlan(draggedWaypoint, targetType, targetIndex, viaCount, stopsCount) {
        if (!draggedWaypoint || !targetType || isNaN(targetIndex)) {
            return { action: 'none', clearDragState: true, resetOpacity: true };
        }
        if (draggedWaypoint.type !== targetType) {
            return { action: 'none', clearDragState: true, resetOpacity: true };
        }
        var count = targetType === 'via' ? (viaCount || 0) : (stopsCount || 0);
        var reorderPlan = buildWaypointReorderPlan(
            targetType,
            draggedWaypoint.index,
            targetIndex,
            count
        );
        if (!reorderPlan.shouldReorder) {
            return { action: 'none', clearDragState: true, resetOpacity: true };
        }
        return {
            action: 'reorder',
            reorderPlan: reorderPlan,
            clearDragState: true,
            resetOpacity: true,
        };
    }

    /**
     * Map apply plan for drawing all multi-drop leg geometries.
     * @param {Object} data
     * @param {function(string, number): Array<[number,number]>} decodePolyline
     * @returns {Object}
     */
    function buildMultiDropLegsMapApplyPlan(data, decodePolyline) {
        if (!data || !data.all_geometry) {
            return { shouldDraw: false, layers: [] };
        }
        var layers = [];
        for (var idx = 0; idx < data.all_geometry.length; idx++) {
            var geom = data.all_geometry[idx];
            var leg = data.legs && data.legs[idx];
            var descriptor = buildMultiDropLegLayerDescriptor(geom, idx, leg, decodePolyline);
            if (descriptor) {
                layers.push({
                    layerId: descriptor.layerId,
                    sourceId: descriptor.sourceId,
                    coordinates: descriptor.coordinates,
                    lineColor: descriptor.lineColor,
                    lineWidth: MULTIDROP_LEG_LINE_WIDTH,
                    lineOpacity: MULTIDROP_LEG_LINE_OPACITY,
                });
            }
        }
        return {
            shouldDraw: layers.length > 0,
            layers: layers,
        };
    }

    /**
     * MapLibre apply spec for one multi-drop leg line layer.
     * @param {Object} layerPlan
     * @returns {Object}
     */
    function buildMultiDropLegLayerMapLibreApplyPlan(layerPlan) {
        layerPlan = layerPlan || {};
        if (!layerPlan.coordinates || layerPlan.coordinates.length < 2) {
            return { valid: false };
        }
        return {
            valid: true,
            layerId: layerPlan.layerId,
            sourceId: layerPlan.sourceId,
            geoJsonFeature: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: layerPlan.coordinates,
                },
            },
            layerLayout: {
                'line-join': 'round',
                'line-cap': 'round',
            },
            paint: {
                lineColor: layerPlan.lineColor,
                lineWidth: layerPlan.lineWidth,
                lineOpacity: layerPlan.lineOpacity,
            },
        };
    }

    /**
     * Execute plan for drawing all multi-drop leg layers on the map.
     * @param {Object} applyPlan - from buildMultiDropLegsMapApplyPlan
     * @returns {Object}
     */
    function buildMultiDropLegsMapExecutePlan(applyPlan) {
        applyPlan = applyPlan || {};
        if (!applyPlan.shouldDraw) {
            return { shouldExecute: false, layers: [] };
        }
        var layers = [];
        (applyPlan.layers || []).forEach(function (layerPlan, idx) {
            var spec = buildMultiDropLegLayerMapLibreApplyPlan(layerPlan);
            if (spec.valid) {
                spec.legIndex = idx;
                spec.errorLogPrefix = '[MultiDrop] Failed to draw leg ';
                layers.push(spec);
            }
        });
        return {
            shouldExecute: layers.length > 0,
            layers: layers,
        };
    }

    /**
     * Clear plan for multi-drop leg map layers.
     * @param {number} [maxLegs]
     * @returns {Object}
     */
    function buildClearMultiDropLayersPlan(maxLegs) {
        var limit = maxLegs != null ? maxLegs : MULTIDROP_LEG_CLEAR_MAX;
        var layerSpecs = [];
        for (var i = 0; i < limit; i++) {
            layerSpecs.push({
                layerId: 'multidrop-leg-' + i,
                sourceId: 'multidrop-leg-source-' + i,
            });
        }
        return { layerSpecs: layerSpecs };
    }

    /**
     * MapLibre layer descriptor for one multi-drop leg geometry string.
     * @param {string} geom - Encoded polyline
     * @param {number} idx - Leg index
     * @param {Object|null|undefined} leg - Leg metadata from API
     * @param {function(string, number): Array<[number,number]>} decodePolyline
     * @returns {{ layerId: string, sourceId: string, coordinates: Array<[number,number]>, lineColor: string }|null}
     */
    function buildMultiDropLegLayerDescriptor(geom, idx, leg, decodePolyline) {
        if (!geom || typeof decodePolyline !== 'function') return null;
        try {
            var precision = leg ? (leg.geometry_precision || 6) : 6;
            var decoded = decodePolyline(geom, precision);
            if (!decoded || decoded.length < 2) return null;
            return {
                layerId: 'multidrop-leg-' + idx,
                sourceId: 'multidrop-leg-source-' + idx,
                coordinates: decoded.map(function (p) { return [p[1], p[0]]; }),
                lineColor: MULTIDROP_LEG_COLORS[idx % MULTIDROP_LEG_COLORS.length],
            };
        } catch (_e) {
            return null;
        }
    }

    var api = {
        MULTIDROP_LEG_COLORS: MULTIDROP_LEG_COLORS,
        EMPTY_WAYPOINTS_HTML: EMPTY_WAYPOINTS_HTML,
        buildViaWaypointItemHtml: buildViaWaypointItemHtml,
        buildStopWaypointItemHtml: buildStopWaypointItemHtml,
        buildWaypointsListHtml: buildWaypointsListHtml,
        buildMultiDropLegHtml: buildMultiDropLegHtml,
        buildMultiDropItineraryHtml: buildMultiDropItineraryHtml,
        buildMultiDropLegLayerDescriptor: buildMultiDropLegLayerDescriptor,
        buildMultiDropItineraryMountPlan: buildMultiDropItineraryMountPlan,
        buildMultiDropLegsDisplayDomApplyPlan: buildMultiDropLegsDisplayDomApplyPlan,
        ROUTE_DRAG_MARKER_ICON_SIZE: ROUTE_DRAG_MARKER_ICON_SIZE,
        WAYPOINT_MARKER_ICON_SIZE: WAYPOINT_MARKER_ICON_SIZE,
        buildRouteDragMarkerHtml: buildRouteDragMarkerHtml,
        buildRouteEditMarkersPlan: buildRouteEditMarkersPlan,
        buildRouteDragMarkerMountPlan: buildRouteDragMarkerMountPlan,
        buildDraggedViaPointAddPlan: buildDraggedViaPointAddPlan,
        buildRouteEditingToggleDomApplyPlan: buildRouteEditingToggleDomApplyPlan,
        buildRouteEditingDisablePlan: buildRouteEditingDisablePlan,
        buildToggleRouteEditingOrchestrationPlan: buildToggleRouteEditingOrchestrationPlan,
        buildRouteEditEnableExecutePlan: buildRouteEditEnableExecutePlan,
        buildRouteDragMarkerExecutePlan: buildRouteDragMarkerExecutePlan,
        buildRouteDragMarkerDragEndDispatchPlan: buildRouteDragMarkerDragEndDispatchPlan,
        buildClearRouteDragMarkersExecutePlan: buildClearRouteDragMarkersExecutePlan,
        ROUTE_EDIT_TOGGLE_ELEMENT_ID: ROUTE_EDIT_TOGGLE_ELEMENT_ID,
        ROUTE_EDIT_MARKER_INTERVAL_MIN: ROUTE_EDIT_MARKER_INTERVAL_MIN,
        buildViaPointMarkerHtml: buildViaPointMarkerHtml,
        buildViaPointDragAddedMarkerHtml: buildViaPointDragAddedMarkerHtml,
        buildStopMarkerHtml: buildStopMarkerHtml,
        buildViaPointPopupHtml: buildViaPointPopupHtml,
        buildViaPointDragPopupHtml: buildViaPointDragPopupHtml,
        buildStopPopupHtml: buildStopPopupHtml,
        buildViaPointAddPlan: buildViaPointAddPlan,
        buildViaPointRemovePlan: buildViaPointRemovePlan,
        buildViaPointMarkersRefreshPlan: buildViaPointMarkersRefreshPlan,
        buildStopAddPlan: buildStopAddPlan,
        buildStopRemovePlan: buildStopRemovePlan,
        buildClearAllWaypointsPlan: buildClearAllWaypointsPlan,
        buildWaypointMovePlan: buildWaypointMovePlan,
        buildWaypointReorderPlan: buildWaypointReorderPlan,
        buildWaypointAddressAddDispatchPlan: buildWaypointAddressAddDispatchPlan,
        buildWaypointAddressGeocodeSuccessPlan: buildWaypointAddressGeocodeSuccessPlan,
        buildWaypointAddressGeocodeFailurePlan: buildWaypointAddressGeocodeFailurePlan,
        buildAddViaPointTogglePlan: buildAddViaPointTogglePlan,
        buildAddStopTogglePlan: buildAddStopTogglePlan,
        buildMapClickWaypointDispatchPlan: buildMapClickWaypointDispatchPlan,
        VIA_POINT_ADDRESS_INPUT_ID: VIA_POINT_ADDRESS_INPUT_ID,
        STOP_ADDRESS_INPUT_ID: STOP_ADDRESS_INPUT_ID,
        ADD_VIA_POINT_BTN_ID: ADD_VIA_POINT_BTN_ID,
        ADD_STOP_BTN_ID: ADD_STOP_BTN_ID,
        WAYPOINTS_LIST_CONTAINER_ID: WAYPOINTS_LIST_CONTAINER_ID,
        MULTIDROP_LEG_CLEAR_MAX: MULTIDROP_LEG_CLEAR_MAX,
        buildWaypointsListDomApplyPlan: buildWaypointsListDomApplyPlan,
        buildWaypointDragStartPlan: buildWaypointDragStartPlan,
        buildWaypointDragEventContextPlan: buildWaypointDragEventContextPlan,
        buildWaypointDragOverPlan: buildWaypointDragOverPlan,
        buildWaypointDropDispatchPlan: buildWaypointDropDispatchPlan,
        buildWaypointDragOpacityResetPlan: buildWaypointDragOpacityResetPlan,
        buildMultiDropLegsMapApplyPlan: buildMultiDropLegsMapApplyPlan,
        buildMultiDropLegLayerMapLibreApplyPlan: buildMultiDropLegLayerMapLibreApplyPlan,
        buildMultiDropLegsMapExecutePlan: buildMultiDropLegsMapExecutePlan,
        buildClearMultiDropLayersPlan: buildClearMultiDropLayersPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrWaypoints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

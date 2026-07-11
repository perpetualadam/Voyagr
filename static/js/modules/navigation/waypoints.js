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

    var ROUTE_DRAG_MARKER_ICON_SIZE = [20, 20];
    var WAYPOINT_MARKER_ICON_SIZE = [28, 28];

    /**
     * @returns {string}
     */
    function buildRouteDragMarkerHtml() {
        return '<div style="background: #FF9800; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: grab;"></div>';
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

    var api = {
        MULTIDROP_LEG_COLORS: MULTIDROP_LEG_COLORS,
        EMPTY_WAYPOINTS_HTML: EMPTY_WAYPOINTS_HTML,
        buildViaWaypointItemHtml: buildViaWaypointItemHtml,
        buildStopWaypointItemHtml: buildStopWaypointItemHtml,
        buildWaypointsListHtml: buildWaypointsListHtml,
        buildMultiDropLegHtml: buildMultiDropLegHtml,
        buildMultiDropItineraryHtml: buildMultiDropItineraryHtml,
        ROUTE_DRAG_MARKER_ICON_SIZE: ROUTE_DRAG_MARKER_ICON_SIZE,
        WAYPOINT_MARKER_ICON_SIZE: WAYPOINT_MARKER_ICON_SIZE,
        buildRouteDragMarkerHtml: buildRouteDragMarkerHtml,
        buildViaPointMarkerHtml: buildViaPointMarkerHtml,
        buildViaPointDragAddedMarkerHtml: buildViaPointDragAddedMarkerHtml,
        buildStopMarkerHtml: buildStopMarkerHtml,
        buildViaPointPopupHtml: buildViaPointPopupHtml,
        buildViaPointDragPopupHtml: buildViaPointDragPopupHtml,
        buildStopPopupHtml: buildStopPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrWaypoints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

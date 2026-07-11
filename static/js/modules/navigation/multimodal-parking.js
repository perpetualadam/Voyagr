/**
 * @file Pure parking + walking multimodal journey helpers (no DOM, no network).
 * @module modules/navigation/multimodal-parking
 */
(function (root) {
    'use strict';

    /**
     * @typedef {Object} MultimodalLegTotals
     * @property {number} drivingDistKm
     * @property {number} drivingTimeMin
     * @property {number} walkingDistKm
     * @property {number} walkingTimeMin
     * @property {number} totalDistKm
     * @property {number} totalTimeMin
     */

    /**
     * Sum driving and walking leg metrics for parking routing preview.
     * @param {{ distance_km?: number, duration_minutes?: number }|null|undefined} drivingData
     * @param {{ distance_km?: number, duration_minutes?: number }|null|undefined} walkingData
     * @returns {MultimodalLegTotals}
     */
    function computeMultimodalLegTotals(drivingData, walkingData) {
        var drivingDistKm = (drivingData && drivingData.distance_km) || 0;
        var drivingTimeMin = (drivingData && drivingData.duration_minutes) || 0;
        var walkingDistKm = (walkingData && walkingData.distance_km) || 0;
        var walkingTimeMin = (walkingData && walkingData.duration_minutes) || 0;
        return {
            drivingDistKm: drivingDistKm,
            drivingTimeMin: drivingTimeMin,
            walkingDistKm: walkingDistKm,
            walkingTimeMin: walkingTimeMin,
            totalDistKm: drivingDistKm + walkingDistKm,
            totalTimeMin: drivingTimeMin + walkingTimeMin,
        };
    }

    /**
     * Route label for parking preview: start → parking → end.
     * @param {string} startLabel
     * @param {string} parkingName
     * @param {string} endLabel
     * @returns {string}
     */
    function buildParkingRouteLabel(startLabel, parkingName, endLabel) {
        return startLabel + ' → 🅿️ ' + parkingName + ' → ' + endLabel;
    }

    /**
     * HTML breakdown for driving + walking legs (distances already converted for display).
     * @param {Object} o
     * @param {string} o.drivingDistDisplay
     * @param {number} o.drivingTimeMin
     * @param {string} o.walkingDistDisplay
     * @param {number} o.walkingTimeMin
     * @param {string} o.distUnit
     * @returns {string}
     */
    function buildParkingBreakdownHtml(o) {
        o = o || {};
        return (
            '<div style="font-size: 12px; line-height: 1.6; color: #333;">' +
                '<div style="margin-bottom: 8px;">' +
                    '<strong>🚗 Driving:</strong> ' + o.drivingDistDisplay + ' ' + o.distUnit +
                    ' / ' + Math.round(o.drivingTimeMin) + ' min' +
                '</div>' +
                '<div>' +
                    '<strong>🚶 Walking:</strong> ' + o.walkingDistDisplay + ' ' + o.distUnit +
                    ' / ' + Math.round(o.walkingTimeMin) + ' min' +
                '</div>' +
            '</div>'
        );
    }

    /**
     * Estimate walking time in minutes from distance in metres (1.4 m/s).
     * @param {number} distanceM
     * @returns {number}
     */
    function computeWalkingMinutesFromMeters(distanceM) {
        var walkingTime = Math.round((distanceM || 0) / 1.4);
        return Math.max(1, Math.round(walkingTime / 60));
    }

    /**
     * Container style for a parking option list row.
     * @returns {string}
     */
    function getParkingOptionItemContainerStyleCssText() {
        return 'background: white; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #ddd; cursor: pointer; transition: all 0.2s;';
    }

    var PARKING_OPTION_ITEM_HOVER_BACKGROUND = '#FFF3E0';
    var PARKING_OPTION_ITEM_REST_BACKGROUND = 'white';
    var PARKING_OPTIONS_DISPLAY_LIMIT = 5;
    var PARKING_DRIVING_ROUTE_POLYLINE = { color: '#2196F3', weight: 5, opacity: 0.8 };
    var PARKING_WALKING_ROUTE_POLYLINE = { color: '#4CAF50', weight: 4, opacity: 0.7 };

    /**
     * HTML for one parking option row in the parking search list.
     * @param {Object} parking
     * @param {number} index
     * @param {Object} opts
     * @returns {string}
     */
    function buildParkingOptionItemHtml(parking, index, opts) {
        parking = parking || {};
        opts = opts || {};
        var walkingMinutes = computeWalkingMinutesFromMeters(parking.distance_m);
        return (
            '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">' +
                '<strong style="font-size: 13px;">' + parking.name + '</strong>' +
                '<span style="background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold;">' + (index + 1) + '</span>' +
            '</div>' +
            '<div style="font-size: 12px; color: #666;">' +
                '📍 ' + opts.distanceText + ' ' + opts.distUnit + ' away<br>' +
                '🚶 ' + walkingMinutes + ' min walk' +
            '</div>' +
            '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
                '<button type="button" class="parking-show-route-btn" style="flex: 1; background: #2196F3; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer;">' +
                    '🗺️ Show Route' +
                '</button>' +
                '<button type="button" class="parking-set-dest-btn" style="flex: 1; background: #4CAF50; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer;">' +
                    '📍 Set as Destination' +
                '</button>' +
            '</div>'
        );
    }

    /**
     * Empty-state HTML for the parking search list.
     * @param {string} message
     * @returns {string}
     */
    function buildParkingEmptyStateHtml(message) {
        return '<div style="font-size:13px;color:#666;line-height:1.5;padding:4px 0;">' + message + '</div>';
    }

    /**
     * @param {string} routeLabel
     * @param {string} breakdown
     * @returns {string}
     */
    function buildParkingPreviewRouteHtml(routeLabel, breakdown) {
        return (routeLabel || '') + (breakdown || '');
    }

    /**
     * @returns {string}
     */
    function buildParkingMapMarkerHtml() {
        return (
            '<div style="background: #FF9800; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🅿️</div>'
        );
    }

    /**
     * @param {string} name
     * @param {string} distanceDisplay
     * @param {string} distUnit
     * @returns {string}
     */
    function buildParkingMapMarkerPopupHtml(name, distanceDisplay, distUnit) {
        return '<strong>' + (name || '') + '</strong><br>Distance: ' + distanceDisplay + ' ' + distUnit;
    }

    /**
     * @param {Array<Object>} parkingList
     * @returns {Array<Object>}
     */
    function sortParkingOptionsByDistance(parkingList) {
        return (parkingList || []).slice().sort(function (a, b) {
            return (a.distance_m || 0) - (b.distance_m || 0);
        });
    }

    /**
     * @param {Array<Object>} parkingList
     * @param {number} [limit]
     * @returns {Array<Object>}
     */
    function getParkingOptionsDisplaySlice(parkingList, limit) {
        var max = limit == null ? PARKING_OPTIONS_DISPLAY_LIMIT : limit;
        return sortParkingOptionsByDistance(parkingList).slice(0, max);
    }

    /**
     * Mount plan for one parking option list row.
     * @param {Object} parking
     * @param {number} index
     * @param {Object} opts
     * @returns {Object}
     */
    function buildParkingOptionItemMountPlan(parking, index, opts) {
        return {
            containerStyle: getParkingOptionItemContainerStyleCssText(),
            html: buildParkingOptionItemHtml(parking, index, opts),
            hoverBackground: PARKING_OPTION_ITEM_HOVER_BACKGROUND,
            restBackground: PARKING_OPTION_ITEM_REST_BACKGROUND,
        };
    }

    var api = {
        computeMultimodalLegTotals: computeMultimodalLegTotals,
        buildParkingRouteLabel: buildParkingRouteLabel,
        buildParkingBreakdownHtml: buildParkingBreakdownHtml,
        computeWalkingMinutesFromMeters: computeWalkingMinutesFromMeters,
        getParkingOptionItemContainerStyleCssText: getParkingOptionItemContainerStyleCssText,
        PARKING_OPTION_ITEM_HOVER_BACKGROUND: PARKING_OPTION_ITEM_HOVER_BACKGROUND,
        PARKING_OPTION_ITEM_REST_BACKGROUND: PARKING_OPTION_ITEM_REST_BACKGROUND,
        PARKING_OPTIONS_DISPLAY_LIMIT: PARKING_OPTIONS_DISPLAY_LIMIT,
        PARKING_DRIVING_ROUTE_POLYLINE: PARKING_DRIVING_ROUTE_POLYLINE,
        PARKING_WALKING_ROUTE_POLYLINE: PARKING_WALKING_ROUTE_POLYLINE,
        sortParkingOptionsByDistance: sortParkingOptionsByDistance,
        getParkingOptionsDisplaySlice: getParkingOptionsDisplaySlice,
        buildParkingOptionItemMountPlan: buildParkingOptionItemMountPlan,
        buildParkingOptionItemHtml: buildParkingOptionItemHtml,
        buildParkingEmptyStateHtml: buildParkingEmptyStateHtml,
        buildParkingPreviewRouteHtml: buildParkingPreviewRouteHtml,
        buildParkingMapMarkerHtml: buildParkingMapMarkerHtml,
        buildParkingMapMarkerPopupHtml: buildParkingMapMarkerPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMultimodalParking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

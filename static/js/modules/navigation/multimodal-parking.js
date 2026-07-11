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

    var api = {
        computeMultimodalLegTotals: computeMultimodalLegTotals,
        buildParkingRouteLabel: buildParkingRouteLabel,
        buildParkingBreakdownHtml: buildParkingBreakdownHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMultimodalParking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

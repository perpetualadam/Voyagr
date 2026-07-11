/**
 * @file Pure route-sharing payload and URL builders (no DOM, no network).
 * @module modules/navigation/route-sharing
 */
(function (root) {
    'use strict';

    /**
     * Build the shareable route payload embedded in share links / QR codes.
     * @param {Object} route
     * @param {string} startLabel
     * @param {string} endLabel
     * @param {boolean} [includeGeometry=true]
     * @returns {Object}
     */
    function buildShareableRoutePayload(route, startLabel, endLabel, includeGeometry) {
        route = route || {};
        var payload = {
            start: startLabel,
            end: endLabel,
            distance: route.distance_km,
            time: route.time,
            fuel_cost: route.fuel_cost,
            toll_cost: route.toll_cost,
            caz_cost: route.caz_cost,
        };
        if (includeGeometry !== false) {
            payload.geometry = route.geometry;
        }
        return payload;
    }

    /**
     * Base64-encode a JSON-serializable payload for URL embedding.
     * @param {Object} payload
     * @returns {string}
     */
    function encodeRoutePayload(payload) {
        var json = JSON.stringify(payload);
        if (typeof btoa !== 'undefined') return btoa(json);
        return Buffer.from(json, 'utf8').toString('base64');
    }

    /**
     * @param {string} origin - e.g. window.location.origin
     * @param {string} encodedRoute
     * @returns {string}
     */
    function buildShareUrl(origin, encodedRoute) {
        return origin + '?route=' + encodedRoute;
    }

    /**
     * Display values for the route sharing summary panel.
     * @param {Object} route
     * @param {Object} fmt
     * @param {string} fmt.startLabel
     * @param {string} fmt.endLabel
     * @param {string} fmt.distanceText
     * @param {string} fmt.distUnit
     * @param {string} fmt.currencySymbol
     * @returns {Object}
     */
    function buildRouteShareSummaryValues(route, fmt) {
        route = route || {};
        fmt = fmt || {};
        var totalCost = parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
        return {
            startLabel: fmt.startLabel,
            endLabel: fmt.endLabel,
            distanceText: fmt.distanceText,
            distUnit: fmt.distUnit,
            durationText: route.time || 'N/A',
            totalCostText: fmt.currencySymbol + totalCost.toFixed(2),
            totalCost: totalCost,
        };
    }

    /**
     * WhatsApp share message body.
     * @param {Object} route
     * @param {Object} fmt
     * @returns {string}
     */
    function buildShareWhatsAppMessage(route, fmt) {
        route = route || {};
        fmt = fmt || {};
        var totalCost = parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
        return (
            '📍 Route from ' + fmt.startLabel + ' to ' + fmt.endLabel + '\n' +
            '📏 Distance: ' + fmt.distanceText + ' ' + fmt.distUnit + '\n' +
            '⏱️ Duration: ' + (route.time || 'N/A') + '\n' +
            '💰 Cost: ' + fmt.currencySymbol + totalCost.toFixed(2) + '\n\n' +
            'Shared via Voyagr Navigation'
        );
    }

    /**
     * @param {string} startLabel
     * @param {string} endLabel
     * @returns {string}
     */
    function buildShareEmailSubject(startLabel, endLabel) {
        return 'Route: ' + startLabel + ' to ' + endLabel;
    }

    /**
     * Email share body.
     * @param {Object} route
     * @param {Object} fmt
     * @returns {string}
     */
    function buildShareEmailBody(route, fmt) {
        route = route || {};
        fmt = fmt || {};
        var totalCost = parseFloat(route.fuel_cost || 0) +
            parseFloat(route.toll_cost || 0) +
            parseFloat(route.caz_cost || 0);
        return (
            "I'm sharing a route with you:\n\n" +
            'From: ' + fmt.startLabel + '\n' +
            'To: ' + fmt.endLabel + '\n' +
            'Distance: ' + fmt.distanceText + ' ' + fmt.distUnit + '\n' +
            'Duration: ' + (route.time || 'N/A') + '\n' +
            'Estimated Cost: ' + fmt.currencySymbol + totalCost.toFixed(2) + '\n\n' +
            'Shared via Voyagr Navigation'
        );
    }

    var api = {
        buildShareableRoutePayload: buildShareableRoutePayload,
        encodeRoutePayload: encodeRoutePayload,
        buildShareUrl: buildShareUrl,
        buildRouteShareSummaryValues: buildRouteShareSummaryValues,
        buildShareWhatsAppMessage: buildShareWhatsAppMessage,
        buildShareEmailSubject: buildShareEmailSubject,
        buildShareEmailBody: buildShareEmailBody,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteSharing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

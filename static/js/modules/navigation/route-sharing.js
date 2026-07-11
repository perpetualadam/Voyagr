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
     * Decode a base64 route payload from a share URL.
     * @param {string} encoded
     * @returns {Object|null}
     */
    function decodeRoutePayload(encoded) {
        if (!encoded || typeof encoded !== 'string') return null;
        try {
            var json;
            if (typeof atob !== 'undefined') {
                json = atob(encoded);
            } else {
                json = Buffer.from(encoded, 'base64').toString('utf8');
            }
            var payload = JSON.parse(json);
            return payload && typeof payload === 'object' ? payload : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Read the `route` query param from a URL search string.
     * @param {string} search
     * @returns {string|null}
     */
    function extractRouteParamFromSearch(search) {
        try {
            return new URLSearchParams(search || '').get('route');
        } catch (e) {
            return null;
        }
    }

    /**
     * Remove the `route` query param from a full URL.
     * @param {string} href
     * @returns {string}
     */
    function stripRouteParamFromUrl(href) {
        var url = new URL(href);
        url.searchParams.delete('route');
        return url.pathname + url.search + url.hash;
    }

    /**
     * Parse duration minutes from shared payload time strings.
     * @param {string|number} time
     * @returns {number}
     */
    function parseSharedRouteDurationMinutes(time) {
        if (typeof time === 'number' && Number.isFinite(time)) return time;
        var parsed = parseInt(String(time || '').replace(/\D/g, ''), 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    /**
     * Map a decoded share payload to lastCalculatedRoute fields.
     * @param {Object} payload
     * @returns {Object}
     */
    function buildLastCalculatedRouteFromSharedPayload(payload) {
        payload = payload || {};
        var distanceKm = payload.distance != null ? payload.distance : (payload.distance_km || 0);
        return {
            distance_km: distanceKm,
            time: payload.time,
            duration_minutes: parseSharedRouteDurationMinutes(payload.time),
            fuel_cost: payload.fuel_cost || 0,
            toll_cost: payload.toll_cost || 0,
            caz_cost: payload.caz_cost || 0,
            geometry: payload.geometry || null,
        };
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
        decodeRoutePayload: decodeRoutePayload,
        extractRouteParamFromSearch: extractRouteParamFromSearch,
        stripRouteParamFromUrl: stripRouteParamFromUrl,
        parseSharedRouteDurationMinutes: parseSharedRouteDurationMinutes,
        buildLastCalculatedRouteFromSharedPayload: buildLastCalculatedRouteFromSharedPayload,
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

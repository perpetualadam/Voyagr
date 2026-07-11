/**
 * @file Pure navigation destination resolution (no DOM, no globals).
 * @module modules/navigation/navigation-destination
 *
 * Resolves "lat,lon" for reroute APIs — must survive useRoute() replacing
 * lastCalculatedRoute with a bare route option.
 */
(function (root) {
    'use strict';

    /**
     * @typedef {Object} NavigationDestinationInput
     * @property {string|null} [lastRouteDestination] - lastCalculatedRoute.destination when lat,lon string
     * @property {{ lat: number, lon: number }|null} [endCoords] - #end dataset lat/lon
     * @property {{ lat: number, lon: number }|null} [polylineEnd] - last decoded polyline vertex
     */

    /**
     * Resolve destination as "lat,lon" from pre-gathered inputs.
     * @param {NavigationDestinationInput} input
     * @returns {string|null}
     */
    function resolveDestinationLatLon(input) {
        input = input || {};

        if (typeof input.lastRouteDestination === 'string') {
            var d = input.lastRouteDestination.trim();
            if (d.indexOf(',') !== -1) return d;
        }

        var end = input.endCoords;
        if (end && Number.isFinite(end.lat) && Number.isFinite(end.lon)) {
            return end.lat + ',' + end.lon;
        }

        var last = input.polylineEnd;
        if (last && Number.isFinite(last.lat) && Number.isFinite(last.lon)) {
            return last.lat + ',' + last.lon;
        }

        return null;
    }

    /**
     * Normalise DOM/route inputs for destination resolution.
     * @param {Object} opts
     * @param {string|null} [opts.lastRouteDestination]
     * @param {{ dataset?: { lat?: string, lon?: string } }|null} [opts.endElement]
     * @param {{ lat: number, lon: number }|null} [opts.polylineEnd]
     * @returns {NavigationDestinationInput}
     */
    function readNavigationDestinationSources(opts) {
        opts = opts || {};
        var endCoords = null;
        var endEl = opts.endElement;
        if (endEl && endEl.dataset && endEl.dataset.lat != null && endEl.dataset.lon != null) {
            endCoords = {
                lat: parseFloat(endEl.dataset.lat),
                lon: parseFloat(endEl.dataset.lon),
            };
        }
        return {
            lastRouteDestination: opts.lastRouteDestination,
            endCoords: endCoords,
            polylineEnd: opts.polylineEnd,
        };
    }

    var api = {
        resolveDestinationLatLon: resolveDestinationLatLon,
        readNavigationDestinationSources: readNavigationDestinationSources,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrNavigationDestination = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

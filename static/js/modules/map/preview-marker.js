/**
 * @file Pure map preview marker HTML and styles (no DOM, no MapLibre).
 * @module modules/map/preview-marker
 */
(function (root) {
    'use strict';

    var PREVIEW_MARKER_CLASS = 'preview-marker';

    /**
     * @returns {string}
     */
    function getPreviewMarkerStyleCssText() {
        return [
            'display: flex;',
            'flex-direction: column;',
            'align-items: center;',
            'transform: translateY(-50%);',
        ].join('');
    }

    /**
     * @param {string} label
     * @returns {string}
     */
    function buildPreviewMarkerInnerHtml(label) {
        return (
            '<div class="preview-marker-icon">📍</div>' +
            '<div class="preview-marker-label">' + (label || '') + '</div>'
        );
    }

    /**
     * Circle-marker options for route preview start/end pins (MapLibre createCircleMarker).
     * @param {'start'|'end'} which
     * @returns {{ radius: number, fillColor: string, color: string, weight: number, fillOpacity: number, popup: string }}
     */
    function getRouteEndpointMarkerOptions(which) {
        if (which === 'start') {
            return {
                radius: 8,
                fillColor: '#00ff00',
                color: '#000',
                weight: 2,
                fillOpacity: 0.8,
                popup: 'Start Location',
            };
        }
        return {
            radius: 8,
            fillColor: '#ff0000',
            color: '#000',
            weight: 2,
            fillOpacity: 0.8,
            popup: 'End Location',
        };
    }

    /**
     * Map/marker apply plan for idle route preview after calculateRoute.
     * @param {Object} o
     * @param {[number, number]} o.startCoords
     * @param {[number, number]} o.endCoords
     * @param {Array<[number,number]>} o.routePath
     * @param {Object} [o.pathPlan]
     * @param {boolean} [o.hasGeometry]
     * @param {string} [o.geometrySource]
     * @returns {Object}
     */
    function buildRoutePreviewMapApplyPlan(o) {
        o = o || {};
        var startCoords = o.startCoords || [];
        var endCoords = o.endCoords || [];
        var routePath = o.routePath || [];
        var pathPlan = o.pathPlan || {};
        var startOpts = getRouteEndpointMarkerOptions('start');
        var endOpts = getRouteEndpointMarkerOptions('end');
        var pathLog = null;

        if (pathPlan.usedFallback && o.hasGeometry) {
            pathLog = {
                level: 'error',
                message: !pathPlan.precision
                    ? '[Route] Decoded polyline is empty, using straight line'
                    : '[Route] Invalid decoded coordinates, using straight line',
            };
        } else if (!pathPlan.usedFallback && pathPlan.precision != null) {
            pathLog = {
                level: 'log',
                message: 'Route path decoded: ' + routePath.length
                    + ' points with precision ' + pathPlan.precision
                    + ' (source: ' + (o.geometrySource || '') + ')',
            };
        }

        return {
            removeExistingMarkers: true,
            startMarker: {
                lat: startCoords[0],
                lon: startCoords[1],
                options: startOpts,
            },
            endMarker: {
                lat: endCoords[0],
                lon: endCoords[1],
                options: endOpts,
            },
            fitBounds: {
                routePath: routePath,
                padding: 50,
            },
            pathLog: pathLog,
            requiresMap: true,
        };
    }

    /**
     * Execute plan for applying route preview map markers and bounds.
     * @param {Object} applyPlan - from buildRoutePreviewMapApplyPlan
     * @returns {Object}
     */
    function buildRoutePreviewMapExecutePlan(applyPlan) {
        applyPlan = applyPlan || {};
        return {
            shouldExecute: !!applyPlan,
            removeExistingMarkers: !!applyPlan.removeExistingMarkers,
            startMarker: applyPlan.startMarker || null,
            endMarker: applyPlan.endMarker || null,
            fitBounds: applyPlan.fitBounds || null,
            pathLog: applyPlan.pathLog || null,
            requiresMap: !!applyPlan.requiresMap,
            mapMissingLogMessage: '[Route] Map not initialized',
            mapMissingStatusMessage: 'Error: Map not initialized',
        };
    }

    var api = {
        PREVIEW_MARKER_CLASS: PREVIEW_MARKER_CLASS,
        getPreviewMarkerStyleCssText: getPreviewMarkerStyleCssText,
        buildPreviewMarkerInnerHtml: buildPreviewMarkerInnerHtml,
        getRouteEndpointMarkerOptions: getRouteEndpointMarkerOptions,
        buildRoutePreviewMapApplyPlan: buildRoutePreviewMapApplyPlan,
        buildRoutePreviewMapExecutePlan: buildRoutePreviewMapExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPreviewMarker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

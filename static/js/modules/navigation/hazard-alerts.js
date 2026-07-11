/**
 * @file Hazard distance formatting and route/nearby hazard collection for navigation alerts.
 * @module modules/navigation/hazard-alerts
 *
 * Pure helpers shared by voyagr-app.js. Route-embedded hazards must announce offline;
 * nearby API results are merged when online.
 */
(function (root) {
    'use strict';

    var CAMERA_HAZARD_TYPES = [
        'camera',
        'traffic_light',
        'speed_camera',
        'camera_speed',
        'camera_red_light',
        'traffic_light_camera',
        'camera_average_speed',
        'camera_bus_lane',
        'camera_mobile',
        'camera_other'
    ];

    /**
     * @param {string|null|undefined} typeStr
     * @returns {boolean}
     */
    function isCameraHazardType(typeStr) {
        if (typeStr == null || typeStr === '') return false;
        var t = String(typeStr).toLowerCase();
        if (CAMERA_HAZARD_TYPES.indexOf(t) >= 0) return true;
        return t.indexOf('camera') >= 0 || t === 'speed_camera' || t === 'traffic_light_camera';
    }

    /**
     * @param {*} hazardsPayload - Array or { cameras, reports } from /api/hazards/nearby.
     * @returns {Array<object>}
     */
    function flattenNearbyHazardsPayload(hazardsPayload) {
        if (!hazardsPayload) return [];
        if (Array.isArray(hazardsPayload)) return hazardsPayload.slice();
        var out = [];
        if (Array.isArray(hazardsPayload.cameras)) out.push.apply(out, hazardsPayload.cameras);
        if (Array.isArray(hazardsPayload.reports)) out.push.apply(out, hazardsPayload.reports);
        return out;
    }

    /**
     * Hazards baked into the active route object (available offline after route calc).
     * @param {object|null|undefined} route
     * @returns {Array<object>}
     */
    function getRouteEmbeddedHazards(route) {
        if (!route) return [];
        var list = route.hazards || route.hazards_on_route || [];
        return Array.isArray(list) ? list.slice() : [];
    }

    /**
     * Stable dedupe key for lat/lon/type.
     * @param {object} hazard
     * @returns {string}
     */
    function hazardLocationKey(hazard) {
        var lat = Number(hazard && hazard.lat);
        var lon = Number(hazard && hazard.lon);
        var type = String((hazard && hazard.type) || 'hazard').toLowerCase();
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
        return lat.toFixed(5) + '_' + lon.toFixed(5) + '_' + type;
    }

    /**
     * Merge route hazards with optional nearby list; route entries win on duplicate keys.
     * @param {Array<object>} routeHazards
     * @param {Array<object>} nearbyHazards
     * @returns {Array<object>}
     */
    function mergeHazardSources(routeHazards, nearbyHazards) {
        var map = Object.create(null);
        (nearbyHazards || []).forEach(function (h) {
            var key = hazardLocationKey(h);
            if (key) map[key] = h;
        });
        (routeHazards || []).forEach(function (h) {
            var key = hazardLocationKey(h);
            if (key) map[key] = Object.assign({}, map[key] || {}, h, { fromRoute: true });
        });
        return Object.keys(map).map(function (k) { return map[k]; });
    }

    /**
     * Haversine distance in metres (pure).
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @returns {number}
     */
    function haversineMeters(lat1, lon1, lat2, lon2) {
        var R = 6371000;
        var p1 = lat1 * Math.PI / 180;
        var p2 = lat2 * Math.PI / 180;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Along-route remaining distance (m) from current polyline index to hazard's nearest vertex.
     * Falls back to crow-flies when polyline unavailable.
     *
     * @param {number} lat
     * @param {number} lon
     * @param {object} hazard
     * @param {Array<[number,number]>|null} routePolyline - [lat, lon] pairs
     * @param {number} fromIndex - Current snapped index on polyline
     * @returns {number|null}
     */
    function distanceToHazardAlongRouteMeters(lat, lon, hazard, routePolyline, fromIndex) {
        var hLat = Number(hazard && hazard.lat);
        var hLon = Number(hazard && hazard.lon);
        if (!Number.isFinite(hLat) || !Number.isFinite(hLon)) return null;

        if (!Array.isArray(routePolyline) || routePolyline.length < 2) {
            return haversineMeters(lat, lon, hLat, hLon);
        }

        var bestIdx = 0;
        var bestDist = Infinity;
        for (var i = 0; i < routePolyline.length; i++) {
            var pt = routePolyline[i];
            if (!pt || pt.length < 2) continue;
            var d = haversineMeters(hLat, hLon, pt[0], pt[1]);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }

        var startIdx = Number.isFinite(fromIndex) && fromIndex >= 0 ? fromIndex : 0;
        if (bestIdx < startIdx) {
            return haversineMeters(lat, lon, hLat, hLon);
        }

        var along = haversineMeters(lat, lon, routePolyline[startIdx][0], routePolyline[startIdx][1]);
        for (var j = startIdx; j < bestIdx; j++) {
            var a = routePolyline[j];
            var b = routePolyline[j + 1];
            if (!a || !b) continue;
            along += haversineMeters(a[0], a[1], b[0], b[1]);
        }
        along += haversineMeters(
            routePolyline[bestIdx][0], routePolyline[bestIdx][1],
            hLat, hLon
        );
        return along;
    }

    /**
     * Spoken distance string respecting mi/feet vs km/m.
     * @param {number} distanceM
     * @param {'mi'|'km'} distanceUnit
     * @returns {string}
     */
    function formatHazardDistanceForUserMeters(distanceM, distanceUnit) {
        var m = Math.max(0, Number(distanceM) || 0);
        if (distanceUnit === 'mi') {
            if (m < 402) {
                return Math.round(m * 3.28084) + ' feet';
            }
            var miles = m / 1609.34;
            return miles < 10 ? miles.toFixed(1) + ' miles' : Math.round(miles) + ' miles';
        }
        if (m < 1000) {
            return Math.round(m) + ' meters';
        }
        return (m / 1000).toFixed(1) + ' kilometers';
    }

    /**
     * Pick alert threshold (m) for a hazard.
     * @param {object} hazard
     * @param {number} cameraAlertDistanceM
     * @param {number} generalHazardDistanceM
     * @returns {number}
     */
    function alertDistanceForHazard(hazard, cameraAlertDistanceM, generalHazardDistanceM) {
        return isCameraHazardType(hazard && hazard.type)
            ? cameraAlertDistanceM
            : generalHazardDistanceM;
    }

    /**
     * Resolve crow-flies or along-route distance for alerting.
     * @param {object} params
     * @returns {number|null}
     */
    function resolveHazardDistanceMeters(params) {
        params = params || {};
        var hazard = params.hazard;
        if (!hazard) return null;

        if (hazard.distance_meters != null && Number.isFinite(Number(hazard.distance_meters))) {
            return Number(hazard.distance_meters);
        }

        if (params.preferAlongRoute && params.routePolyline && params.routePolyline.length >= 2) {
            var along = distanceToHazardAlongRouteMeters(
                params.lat, params.lon, hazard,
                params.routePolyline, params.snappedRouteIndex
            );
            if (along != null) return along;
        }

        if (hazard.lat == null || hazard.lon == null) return null;
        if (typeof params.calculateDistance === 'function') {
            return params.calculateDistance(params.lat, params.lon, hazard.lat, hazard.lon);
        }
        return haversineMeters(params.lat, params.lon, Number(hazard.lat), Number(hazard.lon));
    }

    /**
     * Hazards within alert range for the current position.
     * @param {object} params
     * @returns {Array<{ hazard: object, distanceM: number, unavoidableRouteCamera: boolean }>}
     */
    function collectHazardsToAnnounce(params) {
        params = params || {};
        var routeList = getRouteEmbeddedHazards(params.route);
        var nearbyList = params.includeNearby ? flattenNearbyHazardsPayload(params.nearbyPayload) : [];
        var merged = mergeHazardSources(routeList, nearbyList);
        var out = [];

        merged.forEach(function (hazard) {
            if (hazard.lat == null || hazard.lon == null) return;
            var preferAlong = !!(hazard.fromRoute || params.preferAlongRouteForRouteHazards);
            var distanceM = resolveHazardDistanceMeters({
                lat: params.lat,
                lon: params.lon,
                hazard: hazard,
                preferAlongRoute: preferAlong,
                routePolyline: params.routePolyline,
                snappedRouteIndex: params.snappedRouteIndex,
                calculateDistance: params.calculateDistance
            });
            if (distanceM == null) return;

            var threshold = alertDistanceForHazard(
                hazard,
                params.cameraAlertDistanceM,
                params.generalHazardDistanceM
            );
            if (distanceM >= threshold) return;

            var isCamera = isCameraHazardType(hazard.type);
            out.push({
                hazard: hazard,
                distanceM: distanceM,
                unavoidableRouteCamera: !!(isCamera && hazard.fromRoute)
            });
        });

        return out;
    }

    var HAZARD_TYPE_ICONS = {
        camera: '📷',
        traffic_light: '🚦',
        police: '👮',
        accident: '🚗💥',
        roadworks: '🚧',
        traffic_jam: '🚗',
        hazard: '⚠️',
        toll: '💰',
        caz: '🏙️',
    };

    /**
     * @param {string} type
     * @returns {string}
     */
    function getHazardIcon(type) {
        return HAZARD_TYPE_ICONS[type] || '⚠️';
    }

    /**
     * Count hazards by type string.
     * @param {Array<{type?: string}>} hazardsList
     * @returns {Object<string, number>}
     */
    function groupHazardsByType(hazardsList) {
        var hazardTypes = {};
        (hazardsList || []).forEach(function (hazard) {
            var type = (hazard && hazard.type) || 'unknown';
            hazardTypes[type] = (hazardTypes[type] || 0) + 1;
        });
        return hazardTypes;
    }

    /**
     * Human-readable comma-separated hazard summary.
     * @param {Object<string, number>} hazardTypes
     * @returns {string}
     */
    function formatHazardTypeSummary(hazardTypes) {
        var parts = [];
        for (var type in hazardTypes) {
            if (Object.prototype.hasOwnProperty.call(hazardTypes, type)) {
                parts.push(hazardTypes[type] + 'x ' + type.replace(/_/g, ' '));
            }
        }
        return parts.join(', ') || 'See map for hazard markers along this route.';
    }

    /**
     * List-item HTML for the unavoidable-hazards modal.
     * @param {Object<string, number>} hazardTypes
     * @returns {string}
     */
    function buildUnavoidableHazardsListHtml(hazardTypes) {
        var html = '';
        for (var type in hazardTypes) {
            if (!Object.prototype.hasOwnProperty.call(hazardTypes, type)) continue;
            var count = hazardTypes[type];
            var icon = getHazardIcon(type);
            html += '<div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #fff3e0; border-radius: 8px; margin: 5px 0;">' +
                '<span style="font-size: 20px;">' + icon + '</span>' +
                '<span style="flex: 1; text-align: left;">' + type.replace(/_/g, ' ') + '</span>' +
                '<span style="font-weight: bold; color: #e65100;">' + count + '</span>' +
            '</div>';
        }
        return html;
    }

    var api = {
        CAMERA_HAZARD_TYPES: CAMERA_HAZARD_TYPES,
        isCameraHazardType: isCameraHazardType,
        flattenNearbyHazardsPayload: flattenNearbyHazardsPayload,
        getRouteEmbeddedHazards: getRouteEmbeddedHazards,
        hazardLocationKey: hazardLocationKey,
        mergeHazardSources: mergeHazardSources,
        haversineMeters: haversineMeters,
        distanceToHazardAlongRouteMeters: distanceToHazardAlongRouteMeters,
        formatHazardDistanceForUserMeters: formatHazardDistanceForUserMeters,
        alertDistanceForHazard: alertDistanceForHazard,
        resolveHazardDistanceMeters: resolveHazardDistanceMeters,
        collectHazardsToAnnounce: collectHazardsToAnnounce,
        getHazardIcon: getHazardIcon,
        groupHazardsByType: groupHazardsByType,
        formatHazardTypeSummary: formatHazardTypeSummary,
        buildUnavoidableHazardsListHtml: buildUnavoidableHazardsListHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrHazardAlerts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

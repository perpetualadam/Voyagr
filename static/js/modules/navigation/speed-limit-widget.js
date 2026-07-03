/**
 * @file Posted speed-limit fetch throttling and widget display helpers.
 * @module modules/navigation/speed-limit-widget
 *
 * GPS smoothing stays in speed-gps.js; this module owns limit fetch cadence,
 * API parsing, offline cache keys, and DOM display values for the limit circle.
 */
(function (root) {
    'use strict';

    var DEFAULTS = {
        FETCH_INTERVAL_MS: 4000,
        DISTANCE_THRESHOLD_M: 50,
        CACHE_MAX_AGE_MS: 24 * 60 * 60 * 1000
    };

    /**
     * @param {object|null} state
     * @returns {object}
     */
    function createFetchState(state) {
        return Object.assign({
            inFlight: false,
            lastFetchAt: 0,
            lastPosition: null,
            seq: 0,
            appliedSeq: 0,
            currentLimitMph: null
        }, state || {});
    }

    /**
     * @param {object} state
     * @param {number} lat
     * @param {number} lon
     * @param {number} now
     * @param {function} distanceMeters - (lat1, lon1, lat2, lon2) => m
     * @param {object} [constants]
     * @returns {boolean}
     */
    function shouldFetchSpeedLimit(state, lat, lon, now, distanceMeters, constants) {
        var c = constants || DEFAULTS;
        if (!state || state.inFlight) return false;
        var elapsed = state.lastFetchAt ? (now - state.lastFetchAt) : Infinity;
        var moved = Infinity;
        if (state.lastPosition && typeof distanceMeters === 'function') {
            moved = distanceMeters(lat, lon, state.lastPosition.lat, state.lastPosition.lon);
        }
        return elapsed > c.FETCH_INTERVAL_MS || moved > c.DISTANCE_THRESHOLD_M;
    }

    var ROAD_TYPE_DEFAULT_MPH_UK = {
        motorway: 70,
        trunk_road: 70,
        trunk: 70,
        primary_road: 50,
        primary: 50,
        secondary_road: 50,
        secondary: 50,
        residential: 30,
        living_street: 20,
        unclassified: 30
    };

    /**
     * Regional default mph by road class (client-side immediate fallback).
     * @param {string} roadType
     * @param {string} [region] - uk | us | metric
     * @returns {number|null}
     */
    function inferRoadTypeDefaultLimitMph(roadType, region) {
        var rt = String(roadType || '').toLowerCase();
        if (!rt || rt === 'unknown') return null;
        if (rt === 'motorway_link') rt = 'motorway';
        if (rt === 'trunk_link') rt = 'trunk';
        if (rt === 'primary_link') rt = 'primary';
        if (rt === 'secondary_link') rt = 'secondary';
        var reg = String(region || 'uk').toLowerCase();
        if (reg === 'us') {
            var us = { motorway: 70, trunk: 55, trunk_road: 55, primary: 55, primary_road: 55,
                secondary: 55, secondary_road: 55, residential: 25, living_street: 15, unclassified: 35 };
            return us[rt] != null ? us[rt] : us.residential;
        }
        if (reg === 'metric') {
            var eu = { motorway: 81, trunk: 62, trunk_road: 62, primary: 56, primary_road: 56,
                secondary: 50, secondary_road: 50, residential: 31, living_street: 19, unclassified: 31 };
            return eu[rt] != null ? eu[rt] : eu.residential;
        }
        return ROAD_TYPE_DEFAULT_MPH_UK[rt] != null ? ROAD_TYPE_DEFAULT_MPH_UK[rt] : ROAD_TYPE_DEFAULT_MPH_UK.residential;
    }

    /**
     * @param {number} lat
     * @param {number} lon
     * @param {string} roadType
     * @param {number|null} valhallaSpeedLimitMph
     * @param {number|null} [headingDeg]
     * @returns {string}
     */
    function buildSpeedLimitApiUrl(lat, lon, roadType, valhallaSpeedLimitMph, headingDeg) {
        var vslParam = (Number.isFinite(valhallaSpeedLimitMph) && valhallaSpeedLimitMph > 0)
            ? '&valhalla_speed_limit=' + valhallaSpeedLimitMph
            : '';
        var headingParam = (Number.isFinite(headingDeg))
            ? '&heading=' + encodeURIComponent(String(headingDeg))
            : '';
        return '/api/speed-limit?lat=' + lat + '&lon=' + lon
            + '&road_type=' + encodeURIComponent(roadType || 'unknown')
            + vslParam + headingParam;
    }

    /**
     * @param {*} mph
     * @param {string|null} roadClass
     * @param {number} gpsSpeedMph
     * @param {object|null} speedGpsModule - VoyagrSpeedGps
     * @returns {number|null}
     */
    function coerceApiSpeedLimitMph(mph, roadClass, gpsSpeedMph, speedGpsModule, trustServer) {
        var n = Number(mph);
        if (!Number.isFinite(n) || n < 5 || n > 100) return null;
        var rounded = Math.round(n);
        if (trustServer) return rounded;
        if (speedGpsModule && typeof speedGpsModule.sanitizeApiSpeedLimitMph === 'function') {
            return speedGpsModule.sanitizeApiSpeedLimitMph(rounded, roadClass, gpsSpeedMph);
        }
        return rounded;
    }

    /**
     * Parse /api/speed-limit JSON into mph, or null when unknown.
     * @param {object|null} data - Full JSON body
     * @param {string} roadType
     * @param {number} gpsSpeedMph
     * @param {object|null} speedGpsModule
     * @returns {{ limitMph: number|null, roadType: string, source: string|null }}
     */
    function parseSpeedLimitApiResponse(data, roadType, gpsSpeedMph, speedGpsModule) {
        if (!data || !data.success || !data.data) {
            return { limitMph: null, roadType: roadType, source: null, region: null };
        }
        var payload = data.data;
        var apiRoadType = payload.detected_road_type || payload.road_type || roadType;
        var source = payload.source || payload.posted_limit_source || 'api';
        var authoritative = /tomtom|osm|road-type-default|highway-inferred/i.test(String(source));
        var limitMph = coerceApiSpeedLimitMph(
            payload.speed_limit_mph, apiRoadType, gpsSpeedMph, speedGpsModule, authoritative
        );
        if (limitMph == null) {
            var kmh = Number(payload.speed_limit_kmh);
            if (Number.isFinite(kmh) && kmh > 0) {
                limitMph = coerceApiSpeedLimitMph(
                    kmh * 0.621371, apiRoadType, gpsSpeedMph, speedGpsModule, authoritative
                );
            }
        }
        return {
            limitMph: limitMph,
            roadType: apiRoadType,
            source: source,
            region: payload.speed_limit_region || null
        };
    }

    /**
     * @param {number|null} apiLimitMph
     * @param {number|null} valhallaLimitMph
     * @param {string} [roadType]
     * @param {string} [region]
     * @param {{ allowRoadTypeFallback?: boolean }} [options]
     * @returns {number|null}
     */
    function pickDisplaySpeedLimitMph(apiLimitMph, valhallaLimitMph, roadType, region, options) {
        options = options || {};
        if (apiLimitMph != null && apiLimitMph > 0) return apiLimitMph;
        if (Number.isFinite(valhallaLimitMph) && valhallaLimitMph > 0) return valhallaLimitMph;
        if (options.allowRoadTypeFallback) {
            var fallback = inferRoadTypeDefaultLimitMph(roadType, region);
            return fallback != null && fallback > 0 ? fallback : null;
        }
        return null;
    }

    /**
     * @param {number} displayValue
     * @returns {number}
     */
    function sanitizeWidgetDisplayNumber(displayValue) {
        var n = Number(displayValue);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    }

    /**
     * @param {number} mph
     * @param {string} speedUnitPref - 'mph' | 'kmh'
     * @param {object|null} speedGpsModule
     * @returns {{ value: number, unitLabel: string }}
     */
    function formatSpeedForWidget(mph, speedUnitPref, speedGpsModule) {
        var n = Number.isFinite(mph) ? mph : 0;
        if (speedGpsModule) {
            return {
                value: sanitizeWidgetDisplayNumber(speedGpsModule.mphToDisplaySpeed(n, speedUnitPref)),
                unitLabel: speedGpsModule.speedUnitLabel(speedUnitPref)
            };
        }
        var isMph = String(speedUnitPref).toLowerCase() === 'mph';
        return {
            value: sanitizeWidgetDisplayNumber(isMph ? n : n * 1.609344),
            unitLabel: isMph ? 'mph' : 'km/h'
        };
    }

    /**
     * IndexedDB cache key (4 decimal places ~ 11 m).
     * @param {number} lat
     * @param {number} lon
     * @returns {string}
     */
    function speedLimitCacheKey(lat, lon) {
        return Number(lat).toFixed(4) + '_' + Number(lon).toFixed(4);
    }

    /**
     * @param {object|null} cachedEntry
     * @param {number} now
     * @param {object} [constants]
     * @returns {number|null}
     */
    function readCachedLimitMph(cachedEntry, now, constants) {
        var c = constants || DEFAULTS;
        if (!cachedEntry || !Number.isFinite(Number(cachedEntry.speedLimit))) return null;
        if (cachedEntry.cachedAt && (now - cachedEntry.cachedAt) > c.CACHE_MAX_AGE_MS) return null;
        var n = Number(cachedEntry.speedLimit);
        return n > 0 ? n : null;
    }

    var api = {
        DEFAULTS: DEFAULTS,
        createFetchState: createFetchState,
        shouldFetchSpeedLimit: shouldFetchSpeedLimit,
        buildSpeedLimitApiUrl: buildSpeedLimitApiUrl,
        coerceApiSpeedLimitMph: coerceApiSpeedLimitMph,
        parseSpeedLimitApiResponse: parseSpeedLimitApiResponse,
        pickDisplaySpeedLimitMph: pickDisplaySpeedLimitMph,
        inferRoadTypeDefaultLimitMph: inferRoadTypeDefaultLimitMph,
        sanitizeWidgetDisplayNumber: sanitizeWidgetDisplayNumber,
        formatSpeedForWidget: formatSpeedForWidget,
        speedLimitCacheKey: speedLimitCacheKey,
        readCachedLimitMph: readCachedLimitMph
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeedLimitWidget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

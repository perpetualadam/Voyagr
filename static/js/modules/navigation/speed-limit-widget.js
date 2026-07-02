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

    /**
     * @param {number} lat
     * @param {number} lon
     * @param {string} roadType
     * @param {number|null} valhallaSpeedLimitMph
     * @returns {string}
     */
    function buildSpeedLimitApiUrl(lat, lon, roadType, valhallaSpeedLimitMph) {
        var vslParam = (Number.isFinite(valhallaSpeedLimitMph) && valhallaSpeedLimitMph > 0)
            ? '&valhalla_speed_limit=' + valhallaSpeedLimitMph
            : '';
        return '/api/speed-limit?lat=' + lat + '&lon=' + lon
            + '&road_type=' + encodeURIComponent(roadType || 'residential')
            + vslParam;
    }

    /**
     * @param {*} mph
     * @param {string|null} roadClass
     * @param {number} gpsSpeedMph
     * @param {object|null} speedGpsModule - VoyagrSpeedGps
     * @returns {number|null}
     */
    function coerceApiSpeedLimitMph(mph, roadClass, gpsSpeedMph, speedGpsModule) {
        var n = Number(mph);
        if (!Number.isFinite(n) || n < 5 || n > 100) return null;
        var rounded = Math.round(n);
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
            return { limitMph: null, roadType: roadType, source: null };
        }
        var payload = data.data;
        var apiRoadType = payload.road_type || roadType;
        var limitMph = coerceApiSpeedLimitMph(payload.speed_limit_mph, apiRoadType, gpsSpeedMph, speedGpsModule);
        if (limitMph == null) {
            var kmh = Number(payload.speed_limit_kmh);
            if (Number.isFinite(kmh) && kmh > 0) {
                limitMph = coerceApiSpeedLimitMph(kmh * 0.621371, apiRoadType, gpsSpeedMph, speedGpsModule);
            }
        }
        return {
            limitMph: limitMph,
            roadType: apiRoadType,
            source: payload.source || 'api'
        };
    }

    /**
     * @param {number|null} valhallaLimitMph
     * @param {number|null} apiLimitMph
     * @returns {number|null}
     */
    function pickDisplaySpeedLimitMph(apiLimitMph, valhallaLimitMph) {
        if (apiLimitMph != null && apiLimitMph > 0) return apiLimitMph;
        if (Number.isFinite(valhallaLimitMph) && valhallaLimitMph > 0) return valhallaLimitMph;
        return null;
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
                value: Math.round(speedGpsModule.mphToDisplaySpeed(n, speedUnitPref)),
                unitLabel: speedGpsModule.speedUnitLabel(speedUnitPref)
            };
        }
        var isMph = String(speedUnitPref).toLowerCase() === 'mph';
        return {
            value: Math.round(isMph ? n : n * 1.609344),
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
        formatSpeedForWidget: formatSpeedForWidget,
        speedLimitCacheKey: speedLimitCacheKey,
        readCachedLimitMph: readCachedLimitMph
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeedLimitWidget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

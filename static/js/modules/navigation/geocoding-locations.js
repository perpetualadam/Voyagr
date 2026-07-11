/**
 * @file Pure geocoding location helpers — dataset reads, status copy, API coord formatting (no DOM).
 * @module modules/navigation/geocoding-locations
 *
 * Extracted from voyagr-app.js geocodeLocations so coordinate resolution messages and
 * stored-input reads can be unit tested without the fetch orchestration.
 */
(function (root) {
    'use strict';

    /**
     * Read lat/lon/display name from an input element's dataset when already resolved.
     * @param {DOMStringMap|Object|null|undefined} dataset
     * @param {string} fallbackAddress
     * @returns {{ lat: number, lon: number, display_name: string, cached: boolean }|null}
     */
    function readStoredLocationFromDataset(dataset, fallbackAddress) {
        dataset = dataset || {};
        if (!dataset.lat || !dataset.lon) {
            return null;
        }
        return {
            lat: parseFloat(dataset.lat),
            lon: parseFloat(dataset.lon),
            display_name: dataset.displayName || fallbackAddress,
            cached: true,
        };
    }

    /**
     * @returns {string}
     */
    function getGeocodeLoadingStatusMessage() {
        return '🔍 Geocoding locations...';
    }

    /**
     * @param {'start'|'end'} which
     * @param {string} address
     * @returns {string}
     */
    function buildGeocodeNotFoundStatusMessage(which, address) {
        var label = which === 'end' ? 'end' : 'start';
        return '❌ Could not find ' + label + ' location: ' + address;
    }

    /**
     * @param {{ display_name: string, cached?: boolean }} startResult
     * @param {{ display_name: string, cached?: boolean }} endResult
     * @returns {string}
     */
    function buildGeocodeResolvedStatusMessage(startResult, endResult) {
        startResult = startResult || {};
        endResult = endResult || {};
        var cacheInfo = (startResult.cached ? ' (cached)' : '') + (endResult.cached ? ' (cached)' : '');
        return '✅ Resolved: ' + startResult.display_name + ' → ' + endResult.display_name + cacheInfo;
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    function buildGeocodeErrorStatusMessage(message) {
        return '❌ Geocoding error: ' + String(message || '');
    }

    /**
     * Format geocoded start/end for `/api/route` and display names.
     * @param {{ lat: number, lon: number, display_name: string }} startResult
     * @param {{ lat: number, lon: number, display_name: string }} endResult
     * @returns {{ start: string, end: string, startName: string, endName: string }}
     */
    function formatGeocodeApiCoords(startResult, endResult) {
        return {
            start: startResult.lat + ',' + startResult.lon,
            end: endResult.lat + ',' + endResult.lon,
            startName: startResult.display_name,
            endName: endResult.display_name,
        };
    }

    /**
     * Trim and validate a geocode query string.
     * @param {string} address
     * @returns {string|null}
     */
    function normalizeGeocodeQuery(address) {
        if (!address || String(address).trim() === '') {
            return null;
        }
        return String(address).trim();
    }

    /**
     * Whether input is already a valid "lat,lon" pair.
     * @param {string} input
     * @returns {boolean}
     */
    function isCoordinateFormat(input) {
        var parts = String(input || '').trim().split(',');
        if (parts.length !== 2) return false;
        var lat = parseFloat(parts[0].trim());
        var lon = parseFloat(parts[1].trim());
        return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    }

    /**
     * Build a geocode result from a coordinate string input.
     * @param {string} trimmedAddress
     * @returns {{ lat: number, lon: number, display_name: string, cached: boolean }|null}
     */
    function parseCoordinateGeocodeResult(trimmedAddress) {
        if (!isCoordinateFormat(trimmedAddress)) return null;
        var parts = trimmedAddress.split(',');
        var lat = parseFloat(parts[0].trim());
        var lon = parseFloat(parts[1].trim());
        return {
            lat: lat,
            lon: lon,
            display_name: lat.toFixed(4) + ', ' + lon.toFixed(4),
            cached: false,
        };
    }

    /**
     * @param {string} code
     * @param {{ lat: number, lon: number }} decoded
     * @returns {{ lat: number, lon: number, display_name: string, cached: boolean }}
     */
    function buildPlusCodeGeocodeResult(code, decoded) {
        decoded = decoded || {};
        return {
            lat: decoded.lat,
            lon: decoded.lon,
            display_name: 'Plus Code: ' + code,
            cached: false,
        };
    }

    /**
     * @param {Object|null|undefined} row - First Nominatim result row
     * @returns {{ lat: number, lon: number, display_name: string }|null}
     */
    function parseNominatimResultRow(row) {
        if (!row) return null;
        return {
            lat: parseFloat(row.lat),
            lon: parseFloat(row.lon),
            display_name: row.display_name,
        };
    }

    /**
     * Parse a "lat,lon" API coordinate string into numeric coords.
     * @param {string} coordString
     * @returns {{ valid: boolean, coords?: [number, number] }}
     */
    function parseLatLonPairString(coordString) {
        if (!coordString || typeof coordString !== 'string') {
            return { valid: false };
        }
        var parts = coordString.split(',');
        if (parts.length < 2) {
            return { valid: false };
        }
        var lat = parseFloat(parts[0].trim());
        var lon = parseFloat(parts[1].trim());
        if (isNaN(lat) || isNaN(lon)) {
            return { valid: false };
        }
        return { valid: true, coords: [lat, lon] };
    }

    /**
     * @returns {string}
     */
    function getInvalidCoordinatesFormatStatusMessage() {
        return 'Error: Invalid coordinates format';
    }

    /**
     * @returns {string}
     */
    function getInvalidCoordinatesStatusMessage() {
        return 'Error: Invalid coordinates';
    }

    /**
     * Read a cached geocode entry, marking it as cached for status copy.
     * @param {Object} cache
     * @param {string} key
     * @returns {({ lat: number, lon: number, display_name: string, cached: boolean }|null)}
     */
    function readGeocodeCacheHit(cache, key) {
        cache = cache || {};
        if (!cache[key]) return null;
        var hit = cache[key];
        return {
            lat: hit.lat,
            lon: hit.lon,
            display_name: hit.display_name,
            cached: true,
        };
    }

    /**
     * Store a geocode result in the in-memory cache (without the cached flag).
     * @param {Object} cache
     * @param {string} key
     * @param {{ lat: number, lon: number, display_name: string }} entry
     * @returns {Object}
     */
    function writeGeocodeCacheEntry(cache, key, entry) {
        if (!cache || !key || !entry) return cache || {};
        cache[key] = {
            lat: entry.lat,
            lon: entry.lon,
            display_name: entry.display_name,
        };
        return cache;
    }

    /**
     * Build a Nominatim search URL for a free-text query.
     * @param {string} baseUrl
     * @param {string} query
     * @param {number} [limit=8]
     * @returns {string}
     */
    function buildNominatimSearchUrl(baseUrl, query, limit) {
        var q = encodeURIComponent(String(query || ''));
        var lim = Math.max(1, parseInt(limit, 10) || 8);
        var base = String(baseUrl || '').replace(/\/$/, '');
        return base + '?q=' + q + '&limit=' + lim;
    }

    /**
     * Parse a Nominatim JSON payload into a geocode result or failure reason.
     * @param {*} data
     * @returns {{ ok: true, geocoded: { lat: number, lon: number, display_name: string } }|{ ok: false, reason: string, message?: string }}
     */
    function parseNominatimFetchPayload(data) {
        if (data && typeof data === 'object' && data.success === false && data.error) {
            return { ok: false, reason: 'api_error', message: String(data.error) };
        }
        if (!Array.isArray(data) || data.length === 0) {
            return { ok: false, reason: 'empty' };
        }
        var geocoded = parseNominatimResultRow(data[0]);
        if (!geocoded) {
            return { ok: false, reason: 'parse_fail' };
        }
        return { ok: true, geocoded: geocoded };
    }

    /**
     * Decide whether to use stored dataset coords or fetch a free-text address.
     * @param {{ lat: number, lon: number, display_name: string, cached?: boolean }|null} storedFromDataset
     * @param {string} address
     * @returns {{ action: 'use_stored', result: object }|{ action: 'fetch', address: string }}
     */
    function buildGeocodeEndpointPlan(storedFromDataset, address) {
        if (storedFromDataset) {
            return { action: 'use_stored', result: storedFromDataset };
        }
        return { action: 'fetch', address: String(address || '') };
    }

    /**
     * Pair of start/end geocode endpoint plans for geocodeLocations.
     * @param {Object} o
     * @param {Object|null} o.startStored
     * @param {string} o.startAddress
     * @param {Object|null} o.endStored
     * @param {string} o.endAddress
     * @returns {Object}
     */
    function buildGeocodePairPlans(o) {
        o = o || {};
        return {
            startPlan: buildGeocodeEndpointPlan(o.startStored, o.startAddress),
            endPlan: buildGeocodeEndpointPlan(o.endStored, o.endAddress),
            loadingStatusMessage: getGeocodeLoadingStatusMessage(),
        };
    }

    /**
     * Failure outcome when a single endpoint geocode fetch fails.
     * @param {'start'|'end'} which
     * @param {string} address
     * @returns {Object}
     */
    function buildGeocodeEndpointFailurePlan(which, address) {
        return {
            statusMessage: buildGeocodeNotFoundStatusMessage(which, address),
            statusType: 'error',
            clearGeocodingFlag: true,
        };
    }

    /**
     * Success outcome after both endpoints resolve.
     * @param {Object} startResult
     * @param {Object} endResult
     * @returns {Object}
     */
    function buildGeocodePairSuccessOutcomePlan(startResult, endResult) {
        return {
            ok: true,
            statusMessage: buildGeocodeResolvedStatusMessage(startResult, endResult),
            statusType: 'success',
            coords: formatGeocodeApiCoords(startResult, endResult),
            clearGeocodingFlag: true,
        };
    }

    /**
     * Error outcome when geocodeLocations throws.
     * @param {string} message
     * @returns {Object}
     */
    function buildGeocodePairErrorOutcomePlan(message) {
        return {
            ok: false,
            statusMessage: buildGeocodeErrorStatusMessage(message),
            statusType: 'error',
            clearGeocodingFlag: true,
        };
    }

    var api = {
        readStoredLocationFromDataset: readStoredLocationFromDataset,
        getGeocodeLoadingStatusMessage: getGeocodeLoadingStatusMessage,
        buildGeocodeNotFoundStatusMessage: buildGeocodeNotFoundStatusMessage,
        buildGeocodeResolvedStatusMessage: buildGeocodeResolvedStatusMessage,
        buildGeocodeErrorStatusMessage: buildGeocodeErrorStatusMessage,
        formatGeocodeApiCoords: formatGeocodeApiCoords,
        normalizeGeocodeQuery: normalizeGeocodeQuery,
        isCoordinateFormat: isCoordinateFormat,
        parseCoordinateGeocodeResult: parseCoordinateGeocodeResult,
        buildPlusCodeGeocodeResult: buildPlusCodeGeocodeResult,
        parseNominatimResultRow: parseNominatimResultRow,
        parseLatLonPairString: parseLatLonPairString,
        getInvalidCoordinatesFormatStatusMessage: getInvalidCoordinatesFormatStatusMessage,
        getInvalidCoordinatesStatusMessage: getInvalidCoordinatesStatusMessage,
        readGeocodeCacheHit: readGeocodeCacheHit,
        writeGeocodeCacheEntry: writeGeocodeCacheEntry,
        buildNominatimSearchUrl: buildNominatimSearchUrl,
        parseNominatimFetchPayload: parseNominatimFetchPayload,
        buildGeocodeEndpointPlan: buildGeocodeEndpointPlan,
        buildGeocodePairPlans: buildGeocodePairPlans,
        buildGeocodeEndpointFailurePlan: buildGeocodeEndpointFailurePlan,
        buildGeocodePairSuccessOutcomePlan: buildGeocodePairSuccessOutcomePlan,
        buildGeocodePairErrorOutcomePlan: buildGeocodePairErrorOutcomePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGeocodingLocations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

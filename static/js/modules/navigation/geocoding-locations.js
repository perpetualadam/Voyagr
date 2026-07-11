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
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGeocodingLocations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

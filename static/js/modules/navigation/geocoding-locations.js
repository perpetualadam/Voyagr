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

    var api = {
        readStoredLocationFromDataset: readStoredLocationFromDataset,
        getGeocodeLoadingStatusMessage: getGeocodeLoadingStatusMessage,
        buildGeocodeNotFoundStatusMessage: buildGeocodeNotFoundStatusMessage,
        buildGeocodeResolvedStatusMessage: buildGeocodeResolvedStatusMessage,
        buildGeocodeErrorStatusMessage: buildGeocodeErrorStatusMessage,
        formatGeocodeApiCoords: formatGeocodeApiCoords,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGeocodingLocations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

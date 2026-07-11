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

    /**
     * Input assembly for geocodeLocations from stored dataset reads and addresses.
     * @param {Object} o
     * @param {Object|null} o.startStored
     * @param {string} o.startAddress
     * @param {Object|null} o.endStored
     * @param {string} o.endAddress
     * @returns {Object}
     */
    function buildGeocodeLocationsInputPlan(o) {
        return buildGeocodePairPlans(o);
    }

    /**
     * Execute plan for resolving a single geocode endpoint (stored vs fetch).
     * @param {'start'|'end'} which
     * @param {Object} endpointPlan - from buildGeocodeEndpointPlan
     * @returns {Object}
     */
    function buildGeocodeEndpointResolveExecutePlan(which, endpointPlan) {
        endpointPlan = endpointPlan || {};
        if (endpointPlan.action === 'use_stored') {
            return {
                useStored: true,
                storedLogPrefix: '[Geocoding] Using stored coordinates for ' + which + ':',
                storedResult: endpointPlan.result,
            };
        }
        return {
            useStored: false,
            fetchAddress: endpointPlan.address,
        };
    }

    /**
     * Execute plan when a single endpoint geocode fetch fails.
     * @param {Object} failurePlan - from buildGeocodeEndpointFailurePlan
     * @returns {Object}
     */
    function buildGeocodeEndpointFailureExecutePlan(failurePlan) {
        failurePlan = failurePlan || {};
        return {
            shouldAbort: true,
            statusMessage: failurePlan.statusMessage,
            statusType: failurePlan.statusType,
            clearGeocodingFlag: failurePlan.clearGeocodingFlag !== false,
        };
    }

    /**
     * Execute plan for geocodeLocations pair success/error outcomes.
     * @param {Object} outcome - from buildGeocodePairSuccessOutcomePlan or buildGeocodePairErrorOutcomePlan
     * @returns {Object}
     */
    function buildGeocodePairOutcomeExecutePlan(outcome) {
        outcome = outcome || {};
        return {
            shouldReturnCoords: !!outcome.ok && !!outcome.coords,
            coords: outcome.coords || null,
            statusMessage: outcome.statusMessage,
            statusType: outcome.statusType,
            clearGeocodingFlag: outcome.clearGeocodingFlag !== false,
            errorLogPrefix: outcome.ok ? null : '[Geocoding] Error:',
        };
    }

    /**
     * Lookup plan for geocodeAddress before network fetch (coords, cache, or Nominatim).
     * @param {Object} input
     * @param {string} input.address
     * @param {Object} [input.cache]
     * @param {string} [input.nominatimBaseUrl]
     * @param {number} [input.limit]
     * @returns {Object}
     */
    function buildGeocodeAddressLookupPlan(input) {
        input = input || {};
        var trimmed = normalizeGeocodeQuery(input.address);
        if (!trimmed) {
            return { action: 'empty' };
        }

        var coordResult = parseCoordinateGeocodeResult(trimmed);
        if (coordResult) {
            return { action: 'resolve', trimmed: trimmed, result: coordResult, source: 'coordinates' };
        }

        var cached = readGeocodeCacheHit(input.cache, trimmed);
        if (cached) {
            return { action: 'resolve', trimmed: trimmed, result: cached, source: 'cache' };
        }

        return {
            action: 'nominatim_fetch',
            trimmed: trimmed,
            url: buildNominatimSearchUrl(input.nominatimBaseUrl, trimmed, input.limit),
            source: 'nominatim',
        };
    }

    /**
     * Success plan after a Nominatim fetch resolves an address.
     * @param {Object} geocoded
     * @param {string} cacheKey
     * @returns {Object}
     */
    function buildGeocodeAddressFetchSuccessPlan(geocoded, cacheKey) {
        return {
            ok: true,
            result: Object.assign({}, geocoded, { cached: false }),
            cacheKey: cacheKey,
            cacheEntry: geocoded,
        };
    }

    /**
     * Fetch request plan for a Nominatim geocode lookup.
     * @param {Object} lookup - from buildGeocodeAddressLookupPlan (nominatim_fetch)
     * @returns {Object}
     */
    function buildGeocodeNominatimFetchRequestPlan(lookup) {
        lookup = lookup || {};
        return {
            url: lookup.url,
            headers: { 'User-Agent': 'Voyagr-PWA/1.0' },
            trimmed: lookup.trimmed,
        };
    }

    /**
     * Outcome plan for a Nominatim HTTP response body.
     * @param {Object} parsed - from parseNominatimFetchPayload
     * @param {string} trimmed
     * @returns {Object}
     */
    function buildGeocodeNominatimResponsePlan(parsed, trimmed) {
        parsed = parsed || {};
        if (!parsed.ok) {
            if (parsed.reason === 'api_error') {
                return {
                    ok: false,
                    branch: 'api_error',
                    errorMessage: parsed.message,
                };
            }
            return {
                ok: false,
                branch: 'empty_results',
                trimmed: trimmed,
            };
        }
        return {
            ok: true,
            success: buildGeocodeAddressFetchSuccessPlan(parsed.geocoded, trimmed),
        };
    }

    /**
     * Orchestration plan for geocodeAddress lookup branching.
     * @param {Object} lookup - from buildGeocodeAddressLookupPlan
     * @returns {Object}
     */
    function buildGeocodeAddressOrchestrationPlan(lookup) {
        lookup = lookup || {};
        if (lookup.action === 'empty') {
            return { branch: 'empty' };
        }
        if (lookup.action === 'resolve') {
            return {
                branch: 'resolve',
                result: lookup.result,
                resolveLogPrefix: '[Geocoding] Resolved via ' + (lookup.source || 'unknown') + ':',
                trimmed: lookup.trimmed,
            };
        }
        return {
            branch: 'fetch',
            lookup: lookup,
            trimmed: lookup.trimmed,
        };
    }

    /**
     * Execute plan when geocodeAddress resolves via coordinates or cache.
     * @param {Object} orch - from buildGeocodeAddressOrchestrationPlan
     * @returns {Object}
     */
    function buildGeocodeAddressResolveExecutePlan(orch) {
        orch = orch || {};
        return {
            shouldReturn: orch.branch === 'resolve',
            result: orch.result,
            resolveLogPrefix: orch.resolveLogPrefix,
            trimmed: orch.trimmed,
        };
    }

    /**
     * Log plan when a Plus Code is detected and decoded.
     * @param {string} trimmed
     * @returns {Object}
     */
    function buildGeocodePlusCodeResolveLogPlan(trimmed) {
        return {
            detectLogMessage: '[Geocoding] Detected Plus Code:',
            decodeLogPrefix: '[Geocoding] Decoded Plus Code to:',
            trimmed: trimmed,
        };
    }

    /**
     * Execute plan after a successful Nominatim fetch.
     * @param {Object} outcome - from buildGeocodeNominatimResponsePlan
     * @param {Object} fetchPlan - from buildGeocodeNominatimFetchRequestPlan
     * @returns {Object}
     */
    function buildGeocodeNominatimSuccessExecutePlan(outcome, fetchPlan) {
        outcome = outcome || {};
        fetchPlan = fetchPlan || {};
        var success = outcome.success || {};
        return {
            shouldCache: true,
            cacheKey: success.cacheKey,
            cacheEntry: success.cacheEntry,
            result: success.result,
            successLogPrefix: '[Geocoding] Success:',
            trimmed: fetchPlan.trimmed,
        };
    }

    /**
     * Execute plan when Nominatim returns no results.
     * @param {Object} outcome - from buildGeocodeNominatimResponsePlan
     * @returns {Object}
     */
    function buildGeocodeNominatimEmptyExecutePlan(outcome) {
        outcome = outcome || {};
        return {
            shouldReturnNull: true,
            emptyLogPrefix: '[Geocoding] No results for:',
            trimmed: outcome.trimmed,
        };
    }

    /**
     * Execute plan when geocodeAddress fetch throws.
     * @param {string} message
     * @returns {Object}
     */
    function buildGeocodeAddressFetchErrorExecutePlan(message) {
        return {
            shouldReturnNull: true,
            errorLogPrefix: '[Geocoding] Error:',
            errorMessage: message,
        };
    }

    /**
     * Error plan for a non-OK Nominatim HTTP status.
     * @param {number} status
     * @returns {Object}
     */
    function buildGeocodeHttpErrorPlan(status) {
        return {
            ok: false,
            branch: 'http_error',
            errorMessage: 'API error: ' + status,
        };
    }

    /**
     * Lookup plan for Plus Code geocoding after service validation in the app.
     * @param {Object} input
     * @param {boolean} input.plusCodesEnabled
     * @param {boolean} input.hasPlusCodeService
     * @param {string} input.trimmed
     * @param {boolean} [input.isValidCode]
     * @param {{ lat: number, lon: number }|null} [input.decoded]
     * @param {string} [input.errorMessage]
     * @returns {Object}
     */
    function buildGeocodePlusCodeLookupPlan(input) {
        input = input || {};
        if (!input.plusCodesEnabled || !input.hasPlusCodeService) {
            return { action: 'skip' };
        }
        if (!input.isValidCode) {
            return { action: 'not_plus_code', trimmed: input.trimmed };
        }
        if (!input.decoded || !Number.isFinite(input.decoded.lat) || !Number.isFinite(input.decoded.lon)) {
            return {
                action: 'decode_failed',
                trimmed: input.trimmed,
                errorMessage: input.errorMessage,
            };
        }
        return {
            action: 'resolve',
            trimmed: input.trimmed,
            result: buildPlusCodeGeocodeResult(input.trimmed, input.decoded),
            source: 'plus_code',
        };
    }

    /**
     * Execute plan for entering map location-pick mode.
     * @param {'start'|'end'} field
     * @returns {Object}
     */
    function buildPickLocationFromMapExecutePlan(field) {
        return {
            shouldPick: true,
            mapPickerMode: field,
            collapseBottomSheet: true,
            statusMessage: 'Click on the map to select ' + (field === 'start' ? 'start' : 'destination') + ' location',
            statusType: 'loading',
        };
    }

    /**
     * Dispatch plan for map click events (waypoints vs location picker).
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildMapClickDispatchPlan(opts) {
        opts = opts || {};
        if (opts.addingViaPoint || opts.addingStop) {
            return {
                action: 'waypoint',
                lat: opts.lat,
                lon: opts.lon,
                addingViaPoint: !!opts.addingViaPoint,
                addingStop: !!opts.addingStop,
            };
        }
        if (opts.mapPickerMode) {
            return {
                action: 'location_picker',
                lat: opts.lat,
                lon: opts.lon,
                mapPickerMode: opts.mapPickerMode,
            };
        }
        return { action: 'none' };
    }

    /**
     * Execute plan for applying a map click while in location-pick mode.
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildMapClickLocationPickerExecutePlan(opts) {
        opts = opts || {};
        var mode = opts.mapPickerMode;
        var lat = opts.lat;
        var lon = opts.lon;
        if (!mode || lat == null || lon == null) {
            return { shouldApply: false };
        }
        var isStart = mode === 'start';
        return {
            shouldApply: true,
            inputId: mode,
            inputValue: lat + ',' + lon,
            removeExistingMarker: true,
            markerTarget: isStart ? 'start' : 'end',
            markerOptions: {
                radius: 8,
                fillColor: isStart ? '#00ff00' : '#ff0000',
                color: '#000',
                weight: 2,
                fillOpacity: 0.8,
            },
            clearMapPickerMode: true,
            collapseBottomSheet: true,
            successStatusMessage: 'Location selected!',
            successStatusType: 'success',
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
        buildGeocodeLocationsInputPlan: buildGeocodeLocationsInputPlan,
        buildGeocodeEndpointResolveExecutePlan: buildGeocodeEndpointResolveExecutePlan,
        buildGeocodeEndpointFailureExecutePlan: buildGeocodeEndpointFailureExecutePlan,
        buildGeocodePairOutcomeExecutePlan: buildGeocodePairOutcomeExecutePlan,
        buildGeocodeAddressLookupPlan: buildGeocodeAddressLookupPlan,
        buildGeocodeAddressFetchSuccessPlan: buildGeocodeAddressFetchSuccessPlan,
        buildGeocodeNominatimFetchRequestPlan: buildGeocodeNominatimFetchRequestPlan,
        buildGeocodeNominatimResponsePlan: buildGeocodeNominatimResponsePlan,
        buildGeocodeAddressOrchestrationPlan: buildGeocodeAddressOrchestrationPlan,
        buildGeocodeAddressResolveExecutePlan: buildGeocodeAddressResolveExecutePlan,
        buildGeocodePlusCodeResolveLogPlan: buildGeocodePlusCodeResolveLogPlan,
        buildGeocodeNominatimSuccessExecutePlan: buildGeocodeNominatimSuccessExecutePlan,
        buildGeocodeNominatimEmptyExecutePlan: buildGeocodeNominatimEmptyExecutePlan,
        buildGeocodeAddressFetchErrorExecutePlan: buildGeocodeAddressFetchErrorExecutePlan,
        buildGeocodeHttpErrorPlan: buildGeocodeHttpErrorPlan,
        buildGeocodePlusCodeLookupPlan: buildGeocodePlusCodeLookupPlan,
        buildPickLocationFromMapExecutePlan: buildPickLocationFromMapExecutePlan,
        buildMapClickDispatchPlan: buildMapClickDispatchPlan,
        buildMapClickLocationPickerExecutePlan: buildMapClickLocationPickerExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGeocodingLocations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

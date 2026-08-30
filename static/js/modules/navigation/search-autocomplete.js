/**
 * @file Pure search autocomplete row HTML and location icon helpers (no DOM).
 * @module modules/navigation/search-autocomplete
 */
(function (root) {
    'use strict';

    var DEFAULT_NO_RESULTS_MESSAGE =
        'Type at least 2 letters to search. Recent locations appear here after you select places or calculate a route.';

    /**
     * @param {Object} result
     * @returns {string}
     */
    function getLocationIcon(result) {
        result = result || {};
        var type = result.type || '';
        // Nominatim uses `class`; some providers use `category`.
        var category = result.category || result.class || '';

        if (type === 'house' || category === 'building') return '🏠';
        if (type === 'postcode' || category === 'postcode') return '📫';
        if (type === 'street' || category === 'highway') return '🛣️';
        if (type === 'city' || type === 'town' || (category === 'place' && type !== 'postcode')) return '🏙️';
        if (type === 'parking') return '🅿️';
        if (type === 'fuel') return '⛽';
        if (type === 'hospital' || category === 'healthcare') return '🏥';
        if (type === 'school') return '🏫';
        if (type === 'shop' || category === 'shop') return '🛍️';
        if (type === 'airport') return '✈️';
        if (type === 'railway') return '🚂';
        if (type === 'bus_stop') return '🚌';
        if (type === 'hotel' || category === 'tourism') return '🏨';
        if (type === 'museum') return '🏛️';
        if (type === 'park') return '🌳';
        if (type === 'beach') return '🏖️';
        if (type === 'mountain') return '⛰️';
        if (type === 'lake' || category === 'water') return '🌊';
        if (type === 'restaurant' || type === 'cafe' || type === 'fast_food' || type === 'pub' || type === 'bar') return '🍽️';
        if (type === 'poi' || category === 'office' || category === 'industrial') return '🏢';
        if (category === 'amenity') return '🍽️';
        if (category === 'parking') return '🅿️';
        if (category === 'fuel') return '⛽';
        if (category === 'hospital') return '🏥';
        if (category === 'school') return '🏫';
        if (category === 'airport') return '✈️';
        if (category === 'railway') return '🚂';
        if (category === 'bus') return '🚌';
        if (category === 'hotel') return '🏨';
        if (category === 'museum') return '🏛️';
        if (category === 'park') return '🌳';
        if (category === 'beach') return '🏖️';
        if (category === 'mountain') return '⛰️';
        return '📍';
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    function buildAutocompleteNoResultsHtml(message) {
        return '<div class="autocomplete-no-results">' + (message || DEFAULT_NO_RESULTS_MESSAGE) + '</div>';
    }

    var AUTOCOMPLETE_LOADING_RECENT_TEXT = 'Loading…';
    var AUTOCOMPLETE_SEARCHING_TEXT = '🔍 Searching...';
    var AUTOCOMPLETE_RECENT_LOAD_ERROR_MESSAGE = 'Could not load recent locations.';
    var AUTOCOMPLETE_SEARCH_FAILED_MESSAGE = '❌ Search failed. Try again.';

    /**
     * @param {string} message
     * @returns {string}
     */
    function buildAutocompleteLoadingHtml(message) {
        return '<div class="autocomplete-loading">' + (message || '') + '</div>';
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    function buildAutocompleteSectionTitleHtml(text) {
        return (
            '<div class="autocomplete-section-title" style="padding:10px 14px 6px;font-size:12px;font-weight:600;' +
                'color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">' + text + '</div>'
        );
    }

    /**
     * @param {Object} item
     * @param {Object} opts
     * @returns {string}
     */
    function buildRecentDestinationItemHtml(item, opts) {
        item = item || {};
        opts = opts || {};
        var escape = opts.escapeHtml || function (s) { return String(s); };
        var kindLabel = item.kind === 'route' ? 'Used in a route' : 'Recent search';
        return (
            '<div class="autocomplete-item-icon">🕐</div>' +
            '<div class="autocomplete-item-text">' +
                '<div class="autocomplete-item-name">' + escape(item.label) + '</div>' +
                '<div class="autocomplete-item-address">' + kindLabel + '</div>' +
            '</div>'
        );
    }

    /**
     * @param {Object} item
     * @param {Object} opts
     * @returns {{ html: string, hasCoords: boolean, lat: number, lon: number }}
     */
    function buildServerSearchHistoryItemHtml(item, opts) {
        item = item || {};
        opts = opts || {};
        var escape = opts.escapeHtml || function (s) { return String(s); };
        var primary = escape(item.query || '');
        var meta = escape(item.result_name || '');
        var lat = item.lat != null ? parseFloat(item.lat) : NaN;
        var lon = item.lon != null ? parseFloat(item.lon) : NaN;
        var hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
        var html = '<div class="autocomplete-item-icon">🔎</div><div class="autocomplete-item-text">';
        html += '<div class="autocomplete-item-name">' + primary + '</div>';
        if (hasCoords && meta) {
            html += '<div class="autocomplete-item-address">' + meta + '</div>';
        }
        html += '</div>';
        return { html: html, hasCoords: hasCoords, lat: lat, lon: lon };
    }

    /**
     * @param {string} icon
     * @param {string} name
     * @param {string} shortAddress
     * @returns {string}
     */
    function buildGeocodeAutocompleteItemHtml(icon, name, shortAddress) {
        return (
            '<div class="autocomplete-item-icon">' + icon + '</div>' +
            '<div class="autocomplete-item-text">' +
                '<div class="autocomplete-item-name">' + name + '</div>' +
                '<div class="autocomplete-item-address">' + shortAddress + '</div>' +
            '</div>'
        );
    }

    /**
     * Primary label for a geocode autocomplete result row.
     * @param {Object} result
     * @returns {string}
     */
    function resolveGeocodeResultDisplayName(result) {
        result = result || {};
        var namedetails = result.namedetails || {};
        var name = result.name ||
            (namedetails && namedetails.name) ||
            (result.address && result.address.postcode) ||
            (result.address && result.address.road) ||
            (result.address && result.address.city) ||
            result.display_name ||
            'Location';
        var houseNum = result.address && result.address.house_number;
        var category = result.class || result.category || '';
        var type = result.type || '';
        var isPoi = type === 'poi' ||
            category === 'amenity' ||
            category === 'shop' ||
            category === 'office' ||
            category === 'tourism' ||
            category === 'craft' ||
            category === 'leisure' ||
            category === 'healthcare';
        // Keep house numbers on street addresses; named businesses already include branding.
        if (houseNum && !isPoi && !String(name).startsWith(String(houseNum))) {
            name = houseNum + ' ' + name;
        }
        return name;
    }

    /**
     * Truncated display_name for autocomplete secondary line.
     * @param {Object} result
     * @param {number} [maxLen=60]
     * @returns {string}
     */
    function resolveGeocodeResultShortAddress(result, maxLen) {
        result = result || {};
        var limit = Number(maxLen) || 60;
        var address = result.display_name || '';
        return address.length > limit ? address.substring(0, limit) + '...' : address;
    }

    var api = {
        DEFAULT_NO_RESULTS_MESSAGE: DEFAULT_NO_RESULTS_MESSAGE,
        getLocationIcon: getLocationIcon,
        buildAutocompleteNoResultsHtml: buildAutocompleteNoResultsHtml,
        buildAutocompleteSectionTitleHtml: buildAutocompleteSectionTitleHtml,
        buildRecentDestinationItemHtml: buildRecentDestinationItemHtml,
        buildServerSearchHistoryItemHtml: buildServerSearchHistoryItemHtml,
        buildGeocodeAutocompleteItemHtml: buildGeocodeAutocompleteItemHtml,
        resolveGeocodeResultDisplayName: resolveGeocodeResultDisplayName,
        resolveGeocodeResultShortAddress: resolveGeocodeResultShortAddress,
        AUTOCOMPLETE_LOADING_RECENT_TEXT: AUTOCOMPLETE_LOADING_RECENT_TEXT,
        AUTOCOMPLETE_SEARCHING_TEXT: AUTOCOMPLETE_SEARCHING_TEXT,
        AUTOCOMPLETE_RECENT_LOAD_ERROR_MESSAGE: AUTOCOMPLETE_RECENT_LOAD_ERROR_MESSAGE,
        AUTOCOMPLETE_SEARCH_FAILED_MESSAGE: AUTOCOMPLETE_SEARCH_FAILED_MESSAGE,
        buildAutocompleteLoadingHtml: buildAutocompleteLoadingHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSearchAutocomplete = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

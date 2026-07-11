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
        var category = result.category || '';

        if (type === 'house' || category === 'building') return '🏠';
        if (type === 'street' || category === 'highway') return '🛣️';
        if (type === 'city' || type === 'town' || category === 'place') return '🏙️';
        if (type === 'restaurant' || category === 'amenity') return '🍽️';
        if (type === 'parking' || category === 'parking') return '🅿️';
        if (type === 'fuel' || category === 'fuel') return '⛽';
        if (type === 'hospital' || category === 'hospital') return '🏥';
        if (type === 'school' || category === 'school') return '🏫';
        if (type === 'shop' || category === 'shop') return '🛍️';
        if (type === 'airport' || category === 'airport') return '✈️';
        if (type === 'railway' || category === 'railway') return '🚂';
        if (type === 'bus_stop' || category === 'bus') return '🚌';
        if (type === 'hotel' || category === 'hotel') return '🏨';
        if (type === 'museum' || category === 'museum') return '🏛️';
        if (type === 'park' || category === 'park') return '🌳';
        if (type === 'beach' || category === 'beach') return '🏖️';
        if (type === 'mountain' || category === 'mountain') return '⛰️';
        if (type === 'lake' || category === 'water') return '🌊';
        return '📍';
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    function buildAutocompleteNoResultsHtml(message) {
        return '<div class="autocomplete-no-results">' + (message || DEFAULT_NO_RESULTS_MESSAGE) + '</div>';
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

    var api = {
        DEFAULT_NO_RESULTS_MESSAGE: DEFAULT_NO_RESULTS_MESSAGE,
        getLocationIcon: getLocationIcon,
        buildAutocompleteNoResultsHtml: buildAutocompleteNoResultsHtml,
        buildAutocompleteSectionTitleHtml: buildAutocompleteSectionTitleHtml,
        buildRecentDestinationItemHtml: buildRecentDestinationItemHtml,
        buildServerSearchHistoryItemHtml: buildServerSearchHistoryItemHtml,
        buildGeocodeAutocompleteItemHtml: buildGeocodeAutocompleteItemHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSearchAutocomplete = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

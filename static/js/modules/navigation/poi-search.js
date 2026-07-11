/**
 * @file Pure POI quick-search modal HTML builders (no DOM, no network).
 * @module modules/navigation/poi-search
 */
(function (root) {
    'use strict';

    var POI_TYPE_ICONS = {
        fuel: '⛽',
        food: '🍽️',
        parking: '🅿️',
        charging: '🔌',
        hospital: '🏥',
        pharmacy: '💊',
        groceries: '🛒',
    };

    /** Map marker icons (food uses burger emoji, not the modal plate icon). */
    var POI_MAP_MARKER_ICONS = {
        fuel: '⛽',
        food: '🍔',
        parking: '🅿️',
        charging: '🔌',
        pharmacy: '💊',
        hospital: '🏥',
        groceries: '🛒',
    };

    /**
     * @param {string} type
     * @returns {string}
     */
    function getPoiTypeIcon(type) {
        return POI_TYPE_ICONS[type] || '📍';
    }

    /**
     * @param {string} type
     * @returns {string}
     */
    function getPoiMapMarkerIcon(type) {
        return POI_MAP_MARKER_ICONS[type] || '📍';
    }

    /**
     * @returns {string}
     */
    function getPoiMapMarkerStyleCssText() {
        return 'font-size: 24px; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));';
    }

    /**
     * Popup HTML for a POI map marker.
     * @param {Object} poi
     * @returns {string}
     */
    function buildPoiMapMarkerPopupHtml(poi) {
        poi = poi || {};
        var distanceKm = (Number(poi.distance_m) || 0) / 1000;
        var phoneHtml = poi.phone
            ? '<br><a href="tel:' + poi.phone + '" style="font-size: 12px;">' + poi.phone + '</a>'
            : '';
        return (
            '<div style="padding: 8px;">' +
                '<strong>' + poi.name + '</strong><br>' +
                '<span style="font-size: 12px; color: #666;">' + (poi.address || '') + '</span><br>' +
                '<span style="font-size: 11px; color: #888;">' + distanceKm.toFixed(1) + ' km away</span>' +
                phoneHtml +
            '</div>'
        );
    }

    /**
     * @param {string} type
     * @returns {string}
     */
    function formatPoiTypeTitle(type) {
        if (type === 'groceries') return 'Groceries';
        if (!type) return 'Places';
        return type.charAt(0).toUpperCase() + type.slice(1);
    }

    /**
     * @param {Object} poi
     * @param {Object} opts
     * @returns {string}
     */
    function buildPoiResultItemHtml(poi, opts) {
        poi = poi || {};
        opts = opts || {};
        var icon = opts.icon || '📍';
        var brand = poi.brand
            ? '<span style="color: #667eea; font-weight: 500;">' + poi.brand + '</span> - '
            : '';
        var safeName = String(poi.name || '').replace(/'/g, "\\'");
        var html = (
            '<div style="padding: 12px; margin-bottom: 8px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">' +
                '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">' +
                    '<div style="font-weight: 600; color: #333; font-size: 14px;">' + icon + ' ' + brand + poi.name + '</div>' +
                    '<div style="font-size: 12px; color: #667eea; font-weight: 500;">' + opts.distanceText + '</div>' +
                '</div>'
        );
        if (poi.address) {
            html += '<div style="font-size: 11px; color: #666; margin-bottom: 6px;">' + poi.address + '</div>';
        }
        if (poi.opening_hours) {
            html += '<div style="font-size: 11px; color: #888;">🕒 ' + poi.opening_hours + '</div>';
        }
        html += (
            '<button onclick="selectPOI(' + poi.lat + ', ' + poi.lon + ', \'' + safeName + '\', ' +
                opts.userLat + ', ' + opts.userLon + ')"' +
                ' style="width: 100%; margin-top: 8px; background: #667eea; color: white; border: none; border-radius: 6px; padding: 10px; cursor: pointer; font-weight: 500; font-size: 13px;">' +
                '🚗 Navigate Here' +
            '</button></div>'
        );
        return html;
    }

    /**
     * @param {Array<Object>} results
     * @param {string} type
     * @param {Object} opts
     * @returns {string}
     */
    function buildPoiResultsModalHtml(results, type, opts) {
        results = results || [];
        opts = opts || {};
        var icon = getPoiTypeIcon(type);
        var title = formatPoiTypeTitle(type);
        var html = (
            '<div id="poiModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;">' +
                '<div style="background: white; border-radius: 12px; max-width: 400px; width: 100%; max-height: 80vh; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">' +
                    '<div style="padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                            '<h3 style="margin: 0; font-size: 18px;">' + icon + ' Nearby ' + title + '</h3>' +
                            '<button onclick="closePOIModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0;">✕</button>' +
                        '</div>' +
                        '<p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Found ' + results.length + ' locations</p>' +
                    '</div>' +
                    '<div style="max-height: 50vh; overflow-y: auto; padding: 12px;">'
        );
        for (var i = 0; i < results.length; i++) {
            html += buildPoiResultItemHtml(results[i], {
                icon: icon,
                distanceText: opts.distanceTexts ? opts.distanceTexts[i] : opts.distanceText,
                userLat: opts.userLat,
                userLon: opts.userLon,
            });
        }
        html += '</div></div></div>';
        return html;
    }

    var api = {
        POI_TYPE_ICONS: POI_TYPE_ICONS,
        POI_MAP_MARKER_ICONS: POI_MAP_MARKER_ICONS,
        getPoiTypeIcon: getPoiTypeIcon,
        getPoiMapMarkerIcon: getPoiMapMarkerIcon,
        getPoiMapMarkerStyleCssText: getPoiMapMarkerStyleCssText,
        buildPoiMapMarkerPopupHtml: buildPoiMapMarkerPopupHtml,
        formatPoiTypeTitle: formatPoiTypeTitle,
        buildPoiResultItemHtml: buildPoiResultItemHtml,
        buildPoiResultsModalHtml: buildPoiResultsModalHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPoiSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

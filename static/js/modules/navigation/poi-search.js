/**
 * @file Pure POI quick-search modal HTML builders (no DOM, no network).
 * @module modules/navigation/poi-search
 */
(function (root) {
    'use strict';

    function escapeText(value){return String(value==null?'':value).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
    function safeCoordinate(value,bound){return typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=bound;}
    function feeDetails(poi){
        if(poi.type!=='parking')return '';
        var labels={free:'Reported free — check signs and eligibility',paid:'Reported paid — check current tariff',conditional:'Conditional fee — check rules',unknown:'Fee unknown — check signs'};
        var text=labels[poi.fee_category]||labels.unknown;
        if(poi.access_category==='customers')text+=' · Customers only — check eligibility';
        else if(poi.access_category==='restricted')text+=' · Restricted/private access — check permission';
        else text+=' · Vehicle access unverified';
        if(poi.reported_fee)Object.keys(poi.reported_fee).forEach(function(key){text+=' · '+key+': '+poi.reported_fee[key];});
        return '<div style="font-size:12px;margin:6px 0;">'+escapeText(text)+'</div>';
    }

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
            ? '<br><a href="tel:' + escapeText(poi.phone) + '" style="font-size: 12px;">' + escapeText(poi.phone) + '</a>'
            : '';
        return (
            '<div style="padding: 8px;">' +
                '<strong>' + escapeText(poi.name) + '</strong><br>' +
                '<span style="font-size: 12px; color: #666;">' + escapeText(poi.address) + '</span><br>' +
                '<span style="font-size: 11px; color: #888;">' + distanceKm.toFixed(1) + ' km away</span>' +
                feeDetails(poi) + phoneHtml +
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
            ? '<span style="color: #667eea; font-weight: 500;">' + escapeText(poi.brand) + '</span> - '
            : '';
        var valid=[poi.lat,poi.lon,opts.userLat,opts.userLon].every(function(value,i){return safeCoordinate(value,i%2===0?90:180);});
        var handler=valid?'selectPOI('+poi.lat+','+poi.lon+','+JSON.stringify(String(poi.name||''))+','+opts.userLat+','+opts.userLon+')':null;
        var html = (
            '<div style="padding: 12px; margin-bottom: 8px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">' +
                '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">' +
                    '<div style="font-weight: 600; color: #333; font-size: 14px;">' + icon + ' ' + brand + escapeText(poi.name) + '</div>' +
                    '<div style="font-size: 12px; color: #667eea; font-weight: 500;">' + opts.distanceText + '</div>' +
                '</div>'
        );
        if (poi.address) {
            html += '<div style="font-size: 11px; color: #666; margin-bottom: 6px;">' + escapeText(poi.address) + '</div>';
        }
        if (poi.opening_hours) {
            html += '<div style="font-size: 11px; color: #888;">🕒 ' + (poi.type==='fuel'?'Reported hours: ':'') + escapeText(poi.opening_hours) + '</div>';
        }
        if(poi.type==='fuel'&&Array.isArray(poi.reported_fuels)&&poi.reported_fuels.length)html+='<div style="font-size:12px;">Reported fuels: '+escapeText(poi.reported_fuels.join(', '))+'</div>';
        html += feeDetails(poi);
        html += (
            '<button '+(handler?'onclick="'+escapeText(handler)+'"':'disabled')+
                ' style="width: 100%; margin-top: 8px; background: #667eea; color: white; border: none; border-radius: 6px; padding: 10px; cursor: pointer; font-weight: 500; font-size: 13px;">' +
                (poi.type==='fuel'?'Plan route here':'🚗 Navigate Here') +
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
        if(type==='fuel'){
            html+='<p>Fuel locations from provider/map data. Distance is straight-line. Check current opening hours, fuel availability and vehicle access; the map point may not be an entrance.</p>';
            if(!results.length)html+='<p>No fuel candidates returned. Coverage may be incomplete.</p>';
        }
        if(type==='parking'){
            html+='<label for="poiParkingPrice">Parking price</label><select id="poiParkingPrice" onchange="quickSearch(\'parking\')">';
            [['any','Any price'],['free','Reported free only'],['paid','Reported paid only'],['free_street','Reported free street parking']].forEach(function(row){html+='<option value="'+row[0]+'"'+(opts.parkingPricePreference===row[0]?' selected':'')+'>'+row[1]+'</option>';});
            html+='</select><p>Overpass map data near your location. Missing fees are unknown; check signs and restrictions.</p>';
            if(!results.length)html+='<p>No matching mapped parking found. Fee data may be incomplete.</p>';
        }
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

    var ALONG_ROUTE_SEARCH_RADIUS_M = 1000;
    var ALONG_ROUTE_MIN_ROUTE_POINTS = 2;
    var POI_MODAL_ID = 'poiModal';

    /**
     * @param {number} routePointCount
     * @returns {boolean}
     */
    function canSearchAlongRoute(routePointCount) {
        return routePointCount >= ALONG_ROUTE_MIN_ROUTE_POINTS;
    }

    /**
     * @param {string} currentDisplay
     * @returns {string}
     */
    function toggleAlongRouteCategoriesDisplay(currentDisplay) {
        return currentDisplay === 'none' ? 'block' : 'none';
    }

    /**
     * @param {Array<Array<number>>} routePoints
     * @param {string} type
     * @param {number} [radius]
     * @returns {Object}
     */
    function buildAlongRouteSearchBody(routePoints, type, radius) {
        return {
            route_points: routePoints || [],
            type: type,
            radius: radius == null ? ALONG_ROUTE_SEARCH_RADIUS_M : radius,
        };
    }

    /**
     * @returns {string}
     */
    function getAlongRouteNoRouteMessage() {
        return 'Calculate a route first';
    }

    /**
     * @param {string} type
     * @returns {string}
     */
    function getAlongRouteSearchingMessage(type) {
        return 'Searching for ' + type + ' along route...';
    }

    /**
     * @param {string} type
     * @param {number} count
     * @returns {string}
     */
    function getAlongRouteResultsMessage(type, count) {
        return 'Found ' + count + ' ' + type + ' along route';
    }

    /**
     * @param {string} type
     * @returns {string}
     */
    function getAlongRouteNoResultsMessage(type) {
        return 'No ' + type + ' found along route';
    }

    /**
     * @returns {string}
     */
    function getAlongRouteSearchFailedMessage() {
        return 'Search failed';
    }

    /**
     * @param {Array<Object>} results
     * @param {string} type
     * @param {number} userLat
     * @param {number} userLon
     * @param {function(number): string} formatDistanceFn
     * @returns {Object}
     */
    function buildPoiResultsModalDisplayOpts(results, type, userLat, userLon, formatDistanceFn) {
        results = results || [];
        var format = formatDistanceFn || function () { return ''; };
        return {
            userLat: userLat,
            userLon: userLon,
            distanceTexts: results.map(function (poi) {
                return format(poi.distance_m);
            }),
        };
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    function getPoiSelectDestinationStatusMessage(name) {
        return '📍 Destination set: ' + name;
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
        ALONG_ROUTE_SEARCH_RADIUS_M: ALONG_ROUTE_SEARCH_RADIUS_M,
        ALONG_ROUTE_MIN_ROUTE_POINTS: ALONG_ROUTE_MIN_ROUTE_POINTS,
        canSearchAlongRoute: canSearchAlongRoute,
        toggleAlongRouteCategoriesDisplay: toggleAlongRouteCategoriesDisplay,
        buildAlongRouteSearchBody: buildAlongRouteSearchBody,
        getAlongRouteNoRouteMessage: getAlongRouteNoRouteMessage,
        getAlongRouteSearchingMessage: getAlongRouteSearchingMessage,
        getAlongRouteResultsMessage: getAlongRouteResultsMessage,
        getAlongRouteNoResultsMessage: getAlongRouteNoResultsMessage,
        getAlongRouteSearchFailedMessage: getAlongRouteSearchFailedMessage,
        POI_MODAL_ID: POI_MODAL_ID,
        buildPoiResultsModalDisplayOpts: buildPoiResultsModalDisplayOpts,
        getPoiSelectDestinationStatusMessage: getPoiSelectDestinationStatusMessage,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPoiSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Pure parking + walking multimodal journey helpers (no DOM, no network).
 * @module modules/navigation/multimodal-parking
 */
(function (root) {
    'use strict';

    /**
     * @typedef {Object} MultimodalLegTotals
     * @property {number} drivingDistKm
     * @property {number} drivingTimeMin
     * @property {number} walkingDistKm
     * @property {number} walkingTimeMin
     * @property {number} totalDistKm
     * @property {number} totalTimeMin
     */

    /**
     * Sum driving and walking leg metrics for parking routing preview.
     * @param {{ distance_km?: number, duration_minutes?: number }|null|undefined} drivingData
     * @param {{ distance_km?: number, duration_minutes?: number }|null|undefined} walkingData
     * @returns {MultimodalLegTotals}
     */
    function computeMultimodalLegTotals(drivingData, walkingData) {
        var drivingDistKm = (drivingData && drivingData.distance_km) || 0;
        var drivingTimeMin = (drivingData && drivingData.duration_minutes) || 0;
        var walkingDistKm = (walkingData && walkingData.distance_km) || 0;
        var walkingTimeMin = (walkingData && walkingData.duration_minutes) || 0;
        return {
            drivingDistKm: drivingDistKm,
            drivingTimeMin: drivingTimeMin,
            walkingDistKm: walkingDistKm,
            walkingTimeMin: walkingTimeMin,
            totalDistKm: drivingDistKm + walkingDistKm,
            totalTimeMin: drivingTimeMin + walkingTimeMin,
        };
    }

    /**
     * Route label for parking preview: start → parking → end.
     * @param {string} startLabel
     * @param {string} parkingName
     * @param {string} endLabel
     * @returns {string}
     */
    function buildParkingRouteLabel(startLabel, parkingName, endLabel) {
        return startLabel + ' → 🅿️ ' + parkingName + ' → ' + endLabel;
    }

    /**
     * HTML breakdown for driving + walking legs (distances already converted for display).
     * @param {Object} o
     * @param {string} o.drivingDistDisplay
     * @param {number} o.drivingTimeMin
     * @param {string} o.walkingDistDisplay
     * @param {number} o.walkingTimeMin
     * @param {string} o.distUnit
     * @returns {string}
     */
    function buildParkingBreakdownHtml(o) {
        o = o || {};
        return (
            '<div style="font-size: 12px; line-height: 1.6; color: #333;">' +
                '<div style="margin-bottom: 8px;">' +
                    '<strong>🚗 Driving:</strong> ' + o.drivingDistDisplay + ' ' + o.distUnit +
                    ' / ' + Math.round(o.drivingTimeMin) + ' min' +
                '</div>' +
                '<div>' +
                    '<strong>🚶 Walking:</strong> ' + o.walkingDistDisplay + ' ' + o.distUnit +
                    ' / ' + Math.round(o.walkingTimeMin) + ' min' +
                '</div>' +
            '</div>'
        );
    }

    /**
     * Estimate walking time in minutes from distance in metres (1.4 m/s).
     * @param {number} distanceM
     * @returns {number}
     */
    function computeWalkingMinutesFromMeters(distanceM) {
        var walkingTime = Math.round((distanceM || 0) / 1.4);
        return Math.max(1, Math.round(walkingTime / 60));
    }

    /**
     * Container style for a parking option list row.
     * @returns {string}
     */
    function getParkingOptionItemContainerStyleCssText() {
        return 'background: white; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #ddd; cursor: pointer; transition: all 0.2s;';
    }

    var PARKING_OPTION_ITEM_HOVER_BACKGROUND = '#FFF3E0';
    var PARKING_OPTION_ITEM_REST_BACKGROUND = 'white';
    var PARKING_OPTIONS_DISPLAY_LIMIT = 5;
    var PARKING_DRIVING_ROUTE_POLYLINE = { color: '#2196F3', weight: 5, opacity: 0.8 };
    var PARKING_WALKING_ROUTE_POLYLINE = { color: '#4CAF50', weight: 4, opacity: 0.7 };

    /**
     * HTML for one parking option row in the parking search list.
     * @param {Object} parking
     * @param {number} index
     * @param {Object} opts
     * @returns {string}
     */
    function buildParkingOptionItemHtml(parking, index, opts) {
        parking = parking || {};
        opts = opts || {};
        var walkingMinutes = computeWalkingMinutesFromMeters(parking.distance_m);
        return (
            '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">' +
                '<strong style="font-size: 13px;">' + parking.name + '</strong>' +
                '<span style="background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold;">' + (index + 1) + '</span>' +
            '</div>' +
            '<div style="font-size: 12px; color: #666;">' +
                '📍 ' + opts.distanceText + ' ' + opts.distUnit + ' away<br>' +
                '🚶 ' + walkingMinutes + ' min walk' +
            '</div>' +
            '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
                '<button type="button" class="parking-show-route-btn" style="flex: 1; background: #2196F3; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer;">' +
                    '🗺️ Show Route' +
                '</button>' +
                '<button type="button" class="parking-set-dest-btn" style="flex: 1; background: #4CAF50; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer;">' +
                    '📍 Set as Destination' +
                '</button>' +
            '</div>'
        );
    }

    /**
     * Empty-state HTML for the parking search list.
     * @param {string} message
     * @returns {string}
     */
    function buildParkingEmptyStateHtml(message) {
        return '<div style="font-size:13px;color:#666;line-height:1.5;padding:4px 0;">' + message + '</div>';
    }

    /**
     * @param {string} routeLabel
     * @param {string} breakdown
     * @returns {string}
     */
    function buildParkingPreviewRouteHtml(routeLabel, breakdown) {
        return (routeLabel || '') + (breakdown || '');
    }

    /**
     * @returns {string}
     */
    function buildParkingMapMarkerHtml() {
        return (
            '<div style="background: #FF9800; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🅿️</div>'
        );
    }

    /**
     * @param {string} name
     * @param {string} distanceDisplay
     * @param {string} distUnit
     * @returns {string}
     */
    function buildParkingMapMarkerPopupHtml(name, distanceDisplay, distUnit) {
        return '<strong>' + (name || '') + '</strong><br>Distance: ' + distanceDisplay + ' ' + distUnit;
    }

    /**
     * @param {Array<Object>} parkingList
     * @returns {Array<Object>}
     */
    function sortParkingOptionsByDistance(parkingList) {
        return (parkingList || []).slice().sort(function (a, b) {
            return (a.distance_m || 0) - (b.distance_m || 0);
        });
    }

    /**
     * @param {Array<Object>} parkingList
     * @param {number} [limit]
     * @returns {Array<Object>}
     */
    function getParkingOptionsDisplaySlice(parkingList, limit) {
        var max = limit == null ? PARKING_OPTIONS_DISPLAY_LIMIT : limit;
        return sortParkingOptionsByDistance(parkingList).slice(0, max);
    }

    /**
     * Mount plan for one parking option list row.
     * @param {Object} parking
     * @param {number} index
     * @param {Object} opts
     * @returns {Object}
     */
    function buildParkingOptionItemMountPlan(parking, index, opts) {
        return {
            containerStyle: getParkingOptionItemContainerStyleCssText(),
            html: buildParkingOptionItemHtml(parking, index, opts),
            hoverBackground: PARKING_OPTION_ITEM_HOVER_BACKGROUND,
            restBackground: PARKING_OPTION_ITEM_REST_BACKGROUND,
        };
    }

    /**
     * @param {Object|null|undefined} lastCalculatedRoute
     * @returns {{ lat: number, lon: number }|null}
     */
    function resolveParkingStartCoordsFromRoute(lastCalculatedRoute) {
        if (!lastCalculatedRoute || lastCalculatedRoute.start_lat == null) return null;
        return {
            lat: lastCalculatedRoute.start_lat,
            lon: lastCalculatedRoute.start_lon,
        };
    }

    var WALKING_DISTANCE_TO_RADIUS_METERS = 80;
    var PARKING_SEARCH_MIN_RADIUS_METERS = 1200;

    /**
     * Parse "lat,lon" coordinate string.
     * @param {*} value
     * @returns {{ lat: number, lon: number }|null}
     */
    function parseLatLonCommaString(value) {
        if (value == null || value === '') return null;
        var parts = String(value).split(',');
        if (parts.length < 2) return null;
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return null;
        return { lat: lat, lon: lon };
    }

    /**
     * Last point from a polyline array ([lat,lon] pairs or {lat,lon} objects).
     * @param {Array} polyline
     * @returns {{ lat: number, lon: number }|null}
     */
    function lastPolylinePointCoords(polyline) {
        if (!polyline || !polyline.length) return null;
        var last = polyline[polyline.length - 1];
        if (Array.isArray(last) && last.length >= 2) {
            return { lat: last[0], lon: last[1] };
        }
        if (last && last.lat != null && last.lon != null) {
            return { lat: last.lat, lon: last.lon };
        }
        return null;
    }

    /**
     * Resolve parking destination coordinates from route/selection sources (no DOM, no network).
     * @param {Object} sources
     * @param {function(string, number): Array<[number,number]>} [decodePolyline]
     * @returns {{ coords?: { lat: number, lon: number }, source?: string, needsGeocode?: boolean }}
     */
    function resolveParkingDestinationCoordsFromSources(sources, decodePolyline) {
        sources = sources || {};
        var lr = sources.lastRoute || {};

        if (lr.end_lat != null && lr.end_lon != null) {
            var endLat = Number(lr.end_lat);
            var endLon = Number(lr.end_lon);
            if (!isNaN(endLat) && !isNaN(endLon)) {
                return { coords: { lat: endLat, lon: endLon }, source: 'end_lat' };
            }
        }

        var destinationCoords = parseLatLonCommaString(lr.destination);
        if (destinationCoords) {
            return { coords: destinationCoords, source: 'destination' };
        }

        var route = sources.selectedRouteOption;
        if (route) {
            var fromPolyline = lastPolylinePointCoords(route.polyline);
            if (fromPolyline) {
                return { coords: fromPolyline, source: 'route_polyline' };
            }
            if (route.geometry && typeof decodePolyline === 'function') {
                var routePrecision = Number.isFinite(route.geometry_precision) ? route.geometry_precision : 6;
                var routePts = decodePolyline(route.geometry, routePrecision);
                var fromRouteGeom = lastPolylinePointCoords(routePts);
                if (fromRouteGeom) {
                    return { coords: fromRouteGeom, source: 'route_geometry' };
                }
            }
        }

        if (lr.routes && lr.routes[0]) {
            var firstRoute = lr.routes[0];
            if (firstRoute.end_lat != null && firstRoute.end_lon != null) {
                return {
                    coords: { lat: Number(firstRoute.end_lat), lon: Number(firstRoute.end_lon) },
                    source: 'routes_end_lat',
                };
            }
            if (firstRoute.geometry && typeof decodePolyline === 'function') {
                var firstPrecision = Number.isFinite(firstRoute.geometry_precision)
                    ? firstRoute.geometry_precision
                    : 6;
                var firstPts = decodePolyline(firstRoute.geometry, firstPrecision);
                var fromFirstGeom = lastPolylinePointCoords(firstPts);
                if (fromFirstGeom) {
                    return { coords: fromFirstGeom, source: 'routes_geometry' };
                }
            }
        }

        if (lr.geometry && typeof decodePolyline === 'function') {
            var lrPrecision = Number.isFinite(lr.geometry_precision) ? lr.geometry_precision : 6;
            var lrPts = decodePolyline(lr.geometry, lrPrecision);
            var fromLrGeom = lastPolylinePointCoords(lrPts);
            if (fromLrGeom) {
                return { coords: fromLrGeom, source: 'geometry' };
            }
        }

        if (sources.endElementCoords) {
            return { coords: sources.endElementCoords, source: 'end_element' };
        }

        var geocodedCoords = parseLatLonCommaString(sources.geocodedEnd);
        if (geocodedCoords) {
            return { coords: geocodedCoords, source: 'geocoded_end' };
        }

        if (sources.endInput) {
            return { needsGeocode: true };
        }

        return { coords: null };
    }

    /**
     * Search dispatch plan for parking near destination.
     * @param {Object} formState
     * @param {number} formState.lat
     * @param {number} formState.lon
     * @param {number} [formState.maxWalkingDist]
     * @param {string} [formState.parkingType]
     * @param {string} [formState.pricePref]
     * @returns {Object}
     */
    function buildParkingSearchDispatchPlan(formState) {
        formState = formState || {};
        var maxWalkingDist = parseInt(formState.maxWalkingDist, 10);
        if (!Number.isFinite(maxWalkingDist) || isNaN(maxWalkingDist)) {
            maxWalkingDist = 10;
        }
        var radiusMeters = maxWalkingDist * WALKING_DISTANCE_TO_RADIUS_METERS;
        var parkingType = formState.parkingType || 'any';
        var pricePref = formState.pricePref || 'any';
        return {
            initialSearch: {
                lat: formState.lat,
                lon: formState.lon,
                radius: radiusMeters,
                type: parkingType,
                price: pricePref,
            },
            widenSearchWhenEmpty: {
                enabled: parkingType !== 'any' || pricePref !== 'any' || radiusMeters < PARKING_SEARCH_MIN_RADIUS_METERS,
                params: {
                    lat: formState.lat,
                    lon: formState.lon,
                    radius: Math.max(radiusMeters, PARKING_SEARCH_MIN_RADIUS_METERS),
                    type: 'any',
                    price: 'any',
                },
                statusMessage: 'No parking with current filters — widening search…',
            },
            emptyStateMessage:
                'No parking found near your destination. Try Settings → Parking Preferences to increase walking distance or relax price/type filters.',
            noResultsStatusMessage: 'No parking found nearby. Adjust Parking Preferences in Settings.',
        };
    }

    var PARKING_PREFS_STORAGE_KEY = 'parkingPreferences';
    var PARKING_PREFS_DEFAULTS = {
        maxWalkingDistance: '10',
        preferredType: 'any',
        pricePreference: 'any',
    };
    var PARKING_PREFS_ELEMENT_IDS = {
        maxWalkingDistance: 'parkingMaxWalkingDistance',
        preferredType: 'parkingPreferredType',
        pricePreference: 'parkingPricePreference',
    };

    /**
     * Normalise parking preference values from form/runtime input.
     * @param {Object} [formState]
     * @returns {Object}
     */
    function buildParkingPreferencesCollectPlan(formState) {
        formState = formState || {};
        return {
            maxWalkingDistance: formState.maxWalkingDistance != null && formState.maxWalkingDistance !== ''
                ? formState.maxWalkingDistance
                : PARKING_PREFS_DEFAULTS.maxWalkingDistance,
            preferredType: formState.preferredType != null && formState.preferredType !== ''
                ? formState.preferredType
                : PARKING_PREFS_DEFAULTS.preferredType,
            pricePreference: formState.pricePreference != null && formState.pricePreference !== ''
                ? formState.pricePreference
                : PARKING_PREFS_DEFAULTS.pricePreference,
        };
    }

    /**
     * localStorage write plan for parking preferences.
     * @param {Object} prefs
     * @returns {{ storageKey: string, storageValue: string }}
     */
    function buildParkingPreferencesStoragePlan(prefs) {
        return {
            storageKey: PARKING_PREFS_STORAGE_KEY,
            storageValue: JSON.stringify(prefs || {}),
        };
    }

    /**
     * UI apply plan for parking preference selects.
     * @param {Object|null|undefined} stored
     * @returns {Object}
     */
    function buildParkingPreferencesUiApplyPlan(stored) {
        stored = stored || {};
        return {
            maxWalkingDistance: stored.maxWalkingDistance || PARKING_PREFS_DEFAULTS.maxWalkingDistance,
            preferredType: stored.preferredType || PARKING_PREFS_DEFAULTS.preferredType,
            pricePreference: stored.pricePreference || PARKING_PREFS_DEFAULTS.pricePreference,
        };
    }

    /**
     * DOM apply patches for parking preference selects.
     * @param {Object} uiPlan
     * @returns {{ selects: Array<{ id: string, value: string }> }}
     */
    function buildParkingPreferencesDomApplyPlan(uiPlan) {
        uiPlan = uiPlan || {};
        return {
            selects: [
                { id: PARKING_PREFS_ELEMENT_IDS.maxWalkingDistance, value: uiPlan.maxWalkingDistance },
                { id: PARKING_PREFS_ELEMENT_IDS.preferredType, value: uiPlan.preferredType },
                { id: PARKING_PREFS_ELEMENT_IDS.pricePreference, value: uiPlan.pricePreference },
            ],
        };
    }

    /**
     * Input assembly for collecting parking preference controls from the DOM.
     * @param {Object} [formState]
     * @returns {Object}
     */
    function buildCollectParkingPreferencesInputPlan(formState) {
        return buildParkingPreferencesCollectPlan(formState);
    }

    /**
     * Execute plan for saving parking preferences to storage.
     * @param {Object} prefs
     * @returns {Object}
     */
    function buildSaveParkingPreferencesExecutePlan(prefs) {
        var storage = buildParkingPreferencesStoragePlan(prefs);
        return {
            shouldSave: true,
            storageKey: storage.storageKey,
            storageValue: storage.storageValue,
            saveAllSettings: true,
            logMessage: '[Parking] Preferences saved:',
            prefs: prefs || {},
        };
    }

    /**
     * Orchestration plan for loading parking preferences from storage.
     * @returns {Object}
     */
    function buildLoadParkingPreferencesOrchestrationPlan() {
        return {
            storageKey: PARKING_PREFS_STORAGE_KEY,
            errorLogPrefix: '[Parking] Error loading preferences:',
        };
    }

    /**
     * Execute plan for applying loaded parking preferences to the form.
     * @param {Object} prefs
     * @returns {Object}
     */
    function buildLoadParkingPreferencesExecutePlan(prefs) {
        prefs = prefs || {};
        return {
            shouldApply: true,
            domPlan: buildParkingPreferencesDomApplyPlan(buildParkingPreferencesUiApplyPlan(prefs)),
            logMessage: '[Parking] Preferences loaded:',
            prefs: prefs,
        };
    }

    /**
     * @returns {string}
     */
    function getParkingSelectLoadingMessage() {
        return '🅿️ Calculating routes via parking...';
    }

    /**
     * @returns {string}
     */
    function getParkingSelectSuccessMessage() {
        return '✅ Routes calculated. Driving + Walking shown on map';
    }

    /**
     * @returns {string}
     */
    function getParkingSelectNoStartMessage() {
        return 'Could not determine start location';
    }

    /**
     * @param {string} leg
     * @returns {string}
     */
    function getParkingSelectLegErrorMessage(leg) {
        return 'Error calculating ' + leg + ' route';
    }

    var api = {
        computeMultimodalLegTotals: computeMultimodalLegTotals,
        buildParkingRouteLabel: buildParkingRouteLabel,
        buildParkingBreakdownHtml: buildParkingBreakdownHtml,
        computeWalkingMinutesFromMeters: computeWalkingMinutesFromMeters,
        getParkingOptionItemContainerStyleCssText: getParkingOptionItemContainerStyleCssText,
        PARKING_OPTION_ITEM_HOVER_BACKGROUND: PARKING_OPTION_ITEM_HOVER_BACKGROUND,
        PARKING_OPTION_ITEM_REST_BACKGROUND: PARKING_OPTION_ITEM_REST_BACKGROUND,
        PARKING_OPTIONS_DISPLAY_LIMIT: PARKING_OPTIONS_DISPLAY_LIMIT,
        PARKING_DRIVING_ROUTE_POLYLINE: PARKING_DRIVING_ROUTE_POLYLINE,
        PARKING_WALKING_ROUTE_POLYLINE: PARKING_WALKING_ROUTE_POLYLINE,
        sortParkingOptionsByDistance: sortParkingOptionsByDistance,
        getParkingOptionsDisplaySlice: getParkingOptionsDisplaySlice,
        buildParkingOptionItemMountPlan: buildParkingOptionItemMountPlan,
        resolveParkingStartCoordsFromRoute: resolveParkingStartCoordsFromRoute,
        WALKING_DISTANCE_TO_RADIUS_METERS: WALKING_DISTANCE_TO_RADIUS_METERS,
        PARKING_SEARCH_MIN_RADIUS_METERS: PARKING_SEARCH_MIN_RADIUS_METERS,
        parseLatLonCommaString: parseLatLonCommaString,
        lastPolylinePointCoords: lastPolylinePointCoords,
        resolveParkingDestinationCoordsFromSources: resolveParkingDestinationCoordsFromSources,
        buildParkingSearchDispatchPlan: buildParkingSearchDispatchPlan,
        PARKING_PREFS_STORAGE_KEY: PARKING_PREFS_STORAGE_KEY,
        PARKING_PREFS_DEFAULTS: PARKING_PREFS_DEFAULTS,
        buildParkingPreferencesCollectPlan: buildParkingPreferencesCollectPlan,
        buildParkingPreferencesStoragePlan: buildParkingPreferencesStoragePlan,
        buildParkingPreferencesUiApplyPlan: buildParkingPreferencesUiApplyPlan,
        buildParkingPreferencesDomApplyPlan: buildParkingPreferencesDomApplyPlan,
        buildCollectParkingPreferencesInputPlan: buildCollectParkingPreferencesInputPlan,
        buildSaveParkingPreferencesExecutePlan: buildSaveParkingPreferencesExecutePlan,
        buildLoadParkingPreferencesOrchestrationPlan: buildLoadParkingPreferencesOrchestrationPlan,
        buildLoadParkingPreferencesExecutePlan: buildLoadParkingPreferencesExecutePlan,
        getParkingSelectLoadingMessage: getParkingSelectLoadingMessage,
        getParkingSelectSuccessMessage: getParkingSelectSuccessMessage,
        getParkingSelectNoStartMessage: getParkingSelectNoStartMessage,
        getParkingSelectLegErrorMessage: getParkingSelectLegErrorMessage,
        buildParkingOptionItemHtml: buildParkingOptionItemHtml,
        buildParkingEmptyStateHtml: buildParkingEmptyStateHtml,
        buildParkingPreviewRouteHtml: buildParkingPreviewRouteHtml,
        buildParkingMapMarkerHtml: buildParkingMapMarkerHtml,
        buildParkingMapMarkerPopupHtml: buildParkingMapMarkerPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMultimodalParking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

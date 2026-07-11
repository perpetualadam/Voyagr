/**
 * @file Pure route hazard map marker HTML builders (no DOM, no MapLibre).
 * @module modules/map/hazard-map-markers
 */
(function (root) {
    'use strict';

    var HAZARD_MARKER_ICON_SIZE = [28, 28];

    var DEFAULT_HAZARD_MARKER_CONFIG = {
        emoji: '⚠️',
        color: '#ff9800',
        bgColor: '#fff3e0',
        label: 'Hazard',
    };

    /**
     * Map API / legacy hazard.type strings to marker style keys (camera_* , traffic_light, …).
     * @param {*} raw
     * @returns {string}
     */
    function normalizeCameraHazardTypeForMarker(raw) {
        if (raw === 'traffic_signals' || raw === 'traffic_signal') return 'traffic_light';
        if (raw == null || raw === '') return 'camera_speed';
        var k = String(raw).toLowerCase();
        if (k === 'roadworks' || k === 'police' || k === 'accident' ||
            k === 'railway_crossing' || k === 'pothole' || k === 'debris' ||
            k === 'traffic_light') {
            return k;
        }
        if (k === 'camera') return 'camera_speed';
        if (k === 'speed_camera') return 'camera_speed';
        if (k === 'traffic_light_camera' || k === 'traffic-light-camera') return 'camera_red_light';
        if (k.startsWith('camera_')) return k;
        if (/(red_light|red-light|traffic_light|traffic light|rlc|tlc)/i.test(String(raw))) return 'camera_red_light';
        if (/(spec|average|vec)/i.test(k)) return 'camera_average_speed';
        if (k.indexOf('bus') >= 0) return 'camera_bus_lane';
        if (k.indexOf('mobile') >= 0) return 'camera_mobile';
        if (k === 'speed' || k === 'fixed' || k === 'gatso' || k === 'truvelo') return 'camera_speed';
        return 'camera_other';
    }

    /**
     * Shared SVG marker styles for route hazards and cameras-on-map layer.
     * @returns {Object<string, Object>}
     */
    function getHazardMarkerStyleMap() {
        var cameraSVG = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="5" width="16" height="16" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="12" cy="13" r="4" fill="#222"/><circle cx="12" cy="13" r="2" fill="#FFD600"/><rect x="8" y="2" width="8" height="4" rx="1" fill="#222"/></svg>';
        var cameraRedLightSVG = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="9.5" cy="12" r="3.2" fill="#222"/><circle cx="9.5" cy="12" r="1.6" fill="#FFD600"/><circle cx="16.5" cy="9.5" r="2.2" fill="#f44336" stroke="#b71c1c" stroke-width="0.8"/><circle cx="16.5" cy="14.5" r="2.2" fill="#fbc02d" stroke="#f57f17" stroke-width="0.8"/><circle cx="16.5" cy="19.5" r="2.2" fill="#388e3c" stroke="#1b5e20" stroke-width="0.8"/></svg>';
        var cameraAvgSVG = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="7" width="16" height="11" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="12" cy="12.5" r="3" fill="#222"/><path d="M5 18 L19 18" stroke="#222" stroke-width="1.3" stroke-dasharray="2 2"/></svg>';
        var cameraBusSVG = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="7" width="16" height="12" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="12" cy="13" r="3" fill="#222"/><rect x="7" y="9" width="10" height="6" rx="1" fill="#1565c0"/></svg>';
        var cameraMobileSVG = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="6" width="13" height="13" rx="2" fill="#FFD600" stroke="#222" stroke-width="1.5"/><circle cx="10.5" cy="12.5" r="3" fill="#222"/><path d="M17 8 L20 7 L19 14 L16 13 Z" fill="#555"/></svg>';

        return {
            camera: { svg: cameraSVG, color: '#FFD600', bgColor: '#fff9c4', label: 'Speed camera' },
            camera_speed: { svg: cameraSVG, color: '#FFD600', bgColor: '#fff9c4', label: 'Speed camera' },
            camera_red_light: { svg: cameraRedLightSVG, color: '#e65100', bgColor: '#fff3e0', label: 'Traffic-light camera' },
            camera_average_speed: { svg: cameraAvgSVG, color: '#6a1b9a', bgColor: '#f3e5f5', label: 'Average speed camera' },
            camera_bus_lane: { svg: cameraBusSVG, color: '#0d47a1', bgColor: '#e3f2fd', label: 'Bus lane camera' },
            camera_mobile: { svg: cameraMobileSVG, color: '#37474f', bgColor: '#eceff1', label: 'Mobile camera' },
            camera_other: { svg: cameraSVG, color: '#f57c00', bgColor: '#fff8e1', label: 'Camera' },
            traffic_light: { useOsmTrafficLightPill: true, color: '#2e7d32', bgColor: '#e8f5e9', label: 'Traffic light' },
            police: { emoji: '🚔', color: '#1976d2', bgColor: '#e3f2fd', label: 'Police' },
            roadworks: { emoji: '🚧', color: '#ffc107', bgColor: '#fff8e1', label: 'Roadworks' },
            accident: { emoji: '⚠️', color: '#f44336', bgColor: '#ffebee', label: 'Accident' },
            railway_crossing: { emoji: '🚂', color: '#795548', bgColor: '#efebe9', label: 'Railway Crossing' },
            pothole: { emoji: '🕳️', color: '#607d8b', bgColor: '#eceff1', label: 'Pothole' },
            debris: { emoji: '🪨', color: '#8d6e63', bgColor: '#efebe9', label: 'Debris' },
        };
    }

    /**
     * @param {Object<string, Object>} styleMap
     * @param {string} typeKey
     * @returns {Object}
     */
    function resolveHazardMarkerConfig(styleMap, typeKey) {
        return (styleMap && styleMap[typeKey]) || DEFAULT_HAZARD_MARKER_CONFIG;
    }

    /**
     * @param {Object} config
     * @param {string} svg
     * @returns {string}
     */
    function buildHazardSvgMarkerHtml(config, svg) {
        config = config || {};
        return (
            '<div style="' +
                'background: ' + (config.bgColor || '#fff3e0') + ';' +
                'border: 2px solid ' + (config.color || '#ff9800') + ';' +
                'border-radius: 4px;' +
                'width: 28px;' +
                'height: 28px;' +
                'display: flex;' +
                'align-items: center;' +
                'justify-content: center;' +
                'font-size: 12px;' +
                'box-shadow: 0 2px 6px rgba(0,0,0,0.3);' +
                'cursor: pointer;' +
            '">' + (svg || '') + '</div>'
        );
    }

    /**
     * @param {Object} config
     * @returns {string}
     */
    function buildHazardEmojiMarkerHtml(config) {
        config = config || {};
        return (
            '<div style="' +
                'background: ' + (config.bgColor || '#fff3e0') + ';' +
                'border: 2px solid ' + (config.color || '#ff9800') + ';' +
                'border-radius: 50%;' +
                'width: 28px;' +
                'height: 28px;' +
                'display: flex;' +
                'align-items: center;' +
                'justify-content: center;' +
                'font-size: 14px;' +
                'box-shadow: 0 2px 6px rgba(0,0,0,0.3);' +
                'cursor: pointer;' +
            '">' + (config.emoji || '⚠️') + '</div>'
        );
    }

    /**
     * @param {string} emoji
     * @returns {string}
     */
    function buildHazardPopupEmojiIconHtml(emoji) {
        return '<span style="font-size: 24px;">' + (emoji || '⚠️') + '</span>';
    }

    /**
     * @param {number} distanceKm
     * @returns {string}
     */
    function buildHazardDistanceAheadHtml(distanceKm) {
        if (!Number.isFinite(distanceKm)) return '';
        return '<div style="font-size: 11px; color: #888; margin-top: 5px;">' + distanceKm.toFixed(1) + ' km ahead</div>';
    }

    /**
     * @param {Object} opts
     * @returns {string}
     */
    function buildHazardMarkerPopupHtml(opts) {
        opts = opts || {};
        var config = opts.config || {};
        var descHtml = opts.description
            ? '<div style="font-size: 12px; color: #666;">' + opts.description + '</div>'
            : '';
        return (
            '<div style="text-align: center; min-width: 150px;">' +
                '<div style="margin-bottom: 8px; display: flex; justify-content: center;">' + (opts.popupIcon || '') + '</div>' +
                '<div style="font-weight: bold; color: ' + (config.color || '#ff9800') + '; margin-bottom: 5px;">' + (config.label || 'Hazard') + '</div>' +
                descHtml +
                (opts.distanceHtml || '') +
            '</div>'
        );
    }

    /**
     * Collect hazards from all route options (deduped list, not by location).
     * @param {Array<Object>} routeOptions
     * @returns {{ hazards: Array<Object>, routeCount: number }}
     */
    function buildAllRoutesHazardsList(routeOptions) {
        var allHazards = [];
        var routes = routeOptions || [];
        routes.forEach(function (route) {
            if (route && route.hazards && route.hazards.length > 0) {
                allHazards.push.apply(allHazards, route.hazards);
            }
        });
        return {
            hazards: allHazards,
            routeCount: routes.length,
        };
    }

    /**
     * Build marker mount specs for route hazards (no MapLibre calls).
     * @param {Array<Object>} hazards
     * @param {Object} [opts]
     * @param {string} [opts.osmTrafficLightPillHtml]
     * @param {Array<number>} [opts.osmTrafficLightIconSize]
     * @param {string} [opts.osmTrafficLightPopupIcon]
     * @returns {{ markers: Array<Object>, skippedInvalid: number, skippedDuplicate: number }}
     */
    function buildHazardMarkersMountPlans(hazards, opts) {
        opts = opts || {};
        var hazardConfig = getHazardMarkerStyleMap();
        var seenLocations = {};
        var markers = [];
        var skippedInvalid = 0;
        var skippedDuplicate = 0;

        (hazards || []).forEach(function (hazard) {
            if (!hazard || !Number.isFinite(hazard.lat) || !Number.isFinite(hazard.lon)) {
                skippedInvalid += 1;
                return;
            }
            var locationKey = hazard.lat.toFixed(5) + ',' + hazard.lon.toFixed(5);
            if (seenLocations[locationKey]) {
                skippedDuplicate += 1;
                return;
            }
            seenLocations[locationKey] = true;

            var hazardTypeKey = normalizeCameraHazardTypeForMarker(hazard.type);
            var config = resolveHazardMarkerConfig(hazardConfig, hazardTypeKey);
            var markerHtml;
            var markerIconSize;
            var popupIcon;

            if (config.useOsmTrafficLightPill && opts.osmTrafficLightPillHtml) {
                markerHtml = opts.osmTrafficLightPillHtml;
                markerIconSize = opts.osmTrafficLightIconSize || HAZARD_MARKER_ICON_SIZE;
                popupIcon = opts.osmTrafficLightPopupIcon || opts.osmTrafficLightPillHtml;
            } else if (config.svg) {
                markerHtml = buildHazardSvgMarkerHtml(config, config.svg);
                markerIconSize = HAZARD_MARKER_ICON_SIZE;
                popupIcon = config.svg;
            } else {
                markerHtml = buildHazardEmojiMarkerHtml(config);
                markerIconSize = HAZARD_MARKER_ICON_SIZE;
                popupIcon = buildHazardPopupEmojiIconHtml(config.emoji);
            }

            markers.push({
                lat: hazard.lat,
                lon: hazard.lon,
                className: 'hazard-marker',
                markerHtml: markerHtml,
                iconSize: markerIconSize,
                iconAnchor: [markerIconSize[0] / 2, markerIconSize[1] / 2],
                popupHtml: buildHazardMarkerPopupHtml({
                    popupIcon: popupIcon,
                    config: config,
                    description: hazard.description,
                    distanceHtml: buildHazardDistanceAheadHtml(hazard.distance_km),
                }),
            });
        });

        return {
            markers: markers,
            skippedInvalid: skippedInvalid,
            skippedDuplicate: skippedDuplicate,
        };
    }

    var api = {
        HAZARD_MARKER_ICON_SIZE: HAZARD_MARKER_ICON_SIZE,
        DEFAULT_HAZARD_MARKER_CONFIG: DEFAULT_HAZARD_MARKER_CONFIG,
        normalizeCameraHazardTypeForMarker: normalizeCameraHazardTypeForMarker,
        getHazardMarkerStyleMap: getHazardMarkerStyleMap,
        resolveHazardMarkerConfig: resolveHazardMarkerConfig,
        buildHazardSvgMarkerHtml: buildHazardSvgMarkerHtml,
        buildHazardEmojiMarkerHtml: buildHazardEmojiMarkerHtml,
        buildHazardPopupEmojiIconHtml: buildHazardPopupEmojiIconHtml,
        buildHazardDistanceAheadHtml: buildHazardDistanceAheadHtml,
        buildHazardMarkerPopupHtml: buildHazardMarkerPopupHtml,
        buildAllRoutesHazardsList: buildAllRoutesHazardsList,
        buildHazardMarkersMountPlans: buildHazardMarkersMountPlans,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrHazardMapMarkers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Pure route hazard map marker HTML builders (no DOM, no MapLibre).
 * @module modules/map/hazard-map-markers
 */
(function (root) {
    'use strict';

    var HAZARD_MARKER_ICON_SIZE = [28, 28];

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

    var api = {
        HAZARD_MARKER_ICON_SIZE: HAZARD_MARKER_ICON_SIZE,
        buildHazardSvgMarkerHtml: buildHazardSvgMarkerHtml,
        buildHazardEmojiMarkerHtml: buildHazardEmojiMarkerHtml,
        buildHazardPopupEmojiIconHtml: buildHazardPopupEmojiIconHtml,
        buildHazardDistanceAheadHtml: buildHazardDistanceAheadHtml,
        buildHazardMarkerPopupHtml: buildHazardMarkerPopupHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrHazardMapMarkers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

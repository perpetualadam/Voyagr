/**
 * @file Pure CAZ zones settings panel HTML builders (no DOM, no network).
 * @module modules/navigation/caz-info
 */
(function (root) {
    'use strict';

    /**
     * @returns {string}
     */
    function buildCazLoadingHtml() {
        return '<p style="text-align: center; color: #666;">Loading CAZ zones...</p>';
    }

    /**
     * @returns {string}
     */
    function buildCazEmptyHtml() {
        return '<p style="text-align: center; color: #666;">No CAZ zones found</p>';
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    function buildCazErrorHtml(message) {
        return '<p style="text-align: center; color: #f44336;">Error: ' + (message || 'Unknown error') + '</p>';
    }

    /**
     * @param {Object<string, number|string>} passes
     * @returns {string}
     */
    function buildCazPassesHtml(passes) {
        if (!passes) return '';
        return Object.keys(passes).map(function (type) {
            return (
                '<span style="display: inline-block; background: #e3f2fd; padding: 2px 6px; border-radius: 4px; margin: 2px; font-size: 11px;">' +
                    type + ': £' + passes[type] +
                '</span>'
            );
        }).join('');
    }

    /**
     * @param {string[]} exemptions
     * @returns {string}
     */
    function buildCazExemptionsHtml(exemptions) {
        if (!exemptions || !exemptions.length) return '';
        return (
            '<div style="margin-top: 5px; font-size: 11px; color: #4caf50;">✅ Exempt: ' +
                exemptions.join(', ') +
            '</div>'
        );
    }

    /**
     * @param {Object} zone
     * @returns {string}
     */
    function buildCazZoneCardHtml(zone) {
        zone = zone || {};
        var passesHtml = buildCazPassesHtml(zone.passes);
        var exemptionsHtml = buildCazExemptionsHtml(zone.exemptions);
        var purchaseLink = zone.purchase_url
            ? '<a href="' + zone.purchase_url + '" target="_blank" style="display: inline-block; margin-top: 8px; font-size: 12px; color: #1976d2; text-decoration: none;">🔗 Buy Pass</a>'
            : '';

        return (
            '<div style="border: 1px solid #ddd; border-radius: 8px; padding: 10px; margin-bottom: 10px; background: white;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<strong style="font-size: 14px;">' + (zone.name || '') + '</strong>' +
                    '<span style="background: #ff5722; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">£' +
                        (zone.daily_charge != null ? zone.daily_charge : '') + '/day</span>' +
                '</div>' +
                '<div style="font-size: 12px; color: #666; margin-top: 5px;">' +
                    '📍 ' + (zone.city || '') + ' | ⏰ ' + (zone.operating_hours || '') + ' | 📅 ' + (zone.operating_days || '') +
                '</div>' +
                (passesHtml ? '<div style="margin-top: 8px;"><strong style="font-size: 11px;">Passes:</strong><br>' + passesHtml + '</div>' : '') +
                exemptionsHtml +
                purchaseLink +
            '</div>'
        );
    }

    /**
     * @param {Object[]} zones
     * @returns {string}
     */
    function buildCazZonesListHtml(zones) {
        if (!zones || !zones.length) return buildCazEmptyHtml();
        return zones.map(buildCazZoneCardHtml).join('');
    }

    var api = {
        buildCazLoadingHtml: buildCazLoadingHtml,
        buildCazEmptyHtml: buildCazEmptyHtml,
        buildCazErrorHtml: buildCazErrorHtml,
        buildCazPassesHtml: buildCazPassesHtml,
        buildCazExemptionsHtml: buildCazExemptionsHtml,
        buildCazZoneCardHtml: buildCazZoneCardHtml,
        buildCazZonesListHtml: buildCazZonesListHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrCazInfo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

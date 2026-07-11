/**
 * @file Pure best-time-to-leave analysis panel HTML (no DOM, no network).
 * @module modules/navigation/best-time-leave
 */
(function (root) {
    'use strict';

    var TRAFFIC_SLOT_COLORS = {
        low: '#4CAF50',
        moderate: '#FF9800',
        heavy: '#FF5722',
        severe: '#D32F2F',
    };

    /**
     * @param {string} level
     * @returns {string}
     */
    function trafficColorForLevel(level) {
        return TRAFFIC_SLOT_COLORS[level] || '#999';
    }

    /**
     * @param {number} pct
     * @returns {number}
     */
    function clampCongestionBarWidth(pct) {
        var n = Number(pct);
        if (!Number.isFinite(n)) return 10;
        return Math.max(10, Math.min(100, n));
    }

    /**
     * @param {Object} slot
     * @param {boolean} isBest
     * @param {string} color
     * @param {number} barWidth
     * @returns {string}
     */
    function buildBestTimeSlotRowHtml(slot, isBest, color, barWidth) {
        slot = slot || {};
        var timeLabel = slot.is_now ? 'Now' : (slot.time || '');
        var bestBadge = isBest ? '<span style="font-size: 11px; color: #388E3C; font-weight: 700;">BEST</span>' : '';
        return (
            '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 6px 8px; border-radius: 6px; ' +
                (isBest ? 'background: #e8f5e9; border: 1px solid #81C784;' : 'background: #fafafa;') + '">' +
                '<span style="font-size: 13px; font-weight: ' + (isBest ? '700' : '500') + '; min-width: 45px;">' + timeLabel + '</span>' +
                '<div style="flex: 1; background: #eee; border-radius: 4px; height: 8px; overflow: hidden;">' +
                    '<div style="width: ' + barWidth + '%; height: 100%; background: ' + color + '; border-radius: 4px;"></div>' +
                '</div>' +
                '<span style="font-size: 11px; color: ' + color + '; font-weight: 600; min-width: 60px; text-align: right;">' + (slot.traffic_level || '') + '</span>' +
                bestBadge +
            '</div>'
        );
    }

    /**
     * @param {string} source
     * @param {string} analysedAt
     * @returns {string}
     */
    function buildBestTimeAnalysisFooterHtml(source, analysedAt) {
        return '<div style="font-size: 11px; color: #888; margin-top: 8px;">Source: ' + (source || '') + ' | Analysed at ' + (analysedAt || '') + '</div>';
    }

    /**
     * @param {string} time
     * @returns {string}
     */
    function buildBestTimeDepartureButtonHtml(time) {
        return (
            '<button onclick="applyBestDepartureTime(\'' + time + '\')" style="margin-top: 8px; width: 100%; padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">' +
                'Set departure to ' + time +
            '</button>'
        );
    }

    /**
     * @param {Object[]} slots
     * @param {Object|null} bestTime
     * @param {Object} meta
     * @returns {string}
     */
    function buildBestTimeSlotsPanelHtml(slots, bestTime, meta) {
        slots = slots || [];
        meta = meta || {};
        var html = '';
        slots.forEach(function (slot) {
            var color = trafficColorForLevel(slot.traffic_level);
            var isBest = !!(bestTime && slot.time === bestTime.time);
            var barWidth = clampCongestionBarWidth(slot.congestion_pct);
            html += buildBestTimeSlotRowHtml(slot, isBest, color, barWidth);
        });
        html += buildBestTimeAnalysisFooterHtml(meta.source, meta.analysed_at);
        if (bestTime && !bestTime.is_now) {
            html += buildBestTimeDepartureButtonHtml(bestTime.time);
        }
        return html;
    }

    var api = {
        TRAFFIC_SLOT_COLORS: TRAFFIC_SLOT_COLORS,
        trafficColorForLevel: trafficColorForLevel,
        clampCongestionBarWidth: clampCongestionBarWidth,
        buildBestTimeSlotRowHtml: buildBestTimeSlotRowHtml,
        buildBestTimeAnalysisFooterHtml: buildBestTimeAnalysisFooterHtml,
        buildBestTimeDepartureButtonHtml: buildBestTimeDepartureButtonHtml,
        buildBestTimeSlotsPanelHtml: buildBestTimeSlotsPanelHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrBestTimeLeave = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

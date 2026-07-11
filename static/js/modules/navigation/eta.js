/**
 * @file Pure ETA / time-format helpers (no DOM, no network, no localStorage).
 * @module modules/navigation/eta
 *
 * Extracted from voyagr-app.js:
 *   - formatRemainingTime  — e.g. "45 min" or "2h 15min"
 *   - buildETAVoiceMessage — "You will arrive in X at HH:MM"
 *   - formatETATime        — clock display for the ETA bar (12h/24h)
 */
(function (root) {
    'use strict';

    /**
     * Format a remaining-time duration for the ETA bar.
     * @param {number} minutes - Remaining minutes (may be fractional)
     * @returns {string} e.g. "<1 min", "45 min", "2h", "2h 15min"
     */
    function formatRemainingTime(minutes) {
        if (minutes < 1) return '<1 min';
        if (minutes < 60) return Math.round(minutes) + ' min';
        var hours = Math.floor(minutes / 60);
        var mins = Math.round(minutes % 60);
        if (mins === 0) return hours + 'h';
        return hours + 'h ' + mins + 'min';
    }

    /**
     * Build the voice ETA announcement string.
     * @param {number} timeRemainingMinutes - Whole minutes remaining
     * @param {Date}   etaDate - Estimated arrival Date object
     * @returns {string}
     */
    function buildETAVoiceMessage(timeRemainingMinutes, etaDate) {
        var etaHours = etaDate.getHours();
        var etaMinutes = etaDate.getMinutes();
        var etaStr = etaHours + ':' + String(etaMinutes).padStart(2, '0');
        if (timeRemainingMinutes > 60) {
            var h = Math.floor(timeRemainingMinutes / 60);
            var m = timeRemainingMinutes % 60;
            return 'You will arrive in ' + h + ' hour' + (h > 1 ? 's' : '') + ' and ' + m + ' minutes at ' + etaStr;
        }
        return 'You will arrive in ' + timeRemainingMinutes + ' minutes at ' + etaStr;
    }

    /**
     * Format a Date for the ETA clock display.
     * @param {Date} date
     * @param {boolean} [use24Hour=true] - false → 12-hour clock with AM/PM
     * @returns {string}
     */
    function formatETATime(date, use24Hour) {
        var hours = date.getHours();
        var minutes = date.getMinutes();
        if (use24Hour !== false) {
            return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
        }
        var period = hours >= 12 ? 'PM' : 'AM';
        var hour12 = hours % 12 || 12;
        return hour12 + ':' + String(minutes).padStart(2, '0') + ' ' + period;
    }

    var TRAFFIC_RATIO_MAX_AGE_MS = 90000;

    /**
     * One-time default: traffic-aware ETA on; only explicit 'false' disables.
     * @param {Storage} storage
     */
    function ensureDefaultTrafficAwareRouting(storage) {
        if (storage.getItem('pref_trafficAwareRouting') === null) {
            storage.setItem('pref_trafficAwareRouting', 'true');
        }
    }

    /**
     * Whether live traffic should adjust the navigation ETA.
     * @param {Storage} storage
     * @param {string} [routingMode]
     * @returns {boolean}
     */
    function shouldApplyTrafficAwareETA(storage, routingMode) {
        ensureDefaultTrafficAwareRouting(storage);
        if (storage.getItem('pref_trafficAwareRouting') === 'false') return false;
        return (routingMode || 'auto') === 'auto';
    }

    /**
     * Normalize route duration from lastCalculatedRoute fields to whole minutes.
     * @param {{ duration_minutes?: number, time?: string|number }|null|undefined} route
     * @returns {number}
     */
    function normalizeRouteDurationMinutes(route) {
        if (!route) return 0;
        var m = route.duration_minutes ||
            (route.time ? parseInt(route.time, 10) : 0);
        if (m > 1440) m = Math.round(m / 60);
        return m;
    }

    /**
     * Apply cached traffic ratio to a base remaining-time estimate.
     * @param {number} baseRemainingMinutes
     * @param {{ trafficAdjustedMinutes?: number|null, baseAtTrafficFetch?: number, trafficFetchAt?: number }} snap
     * @param {number} nowMs
     * @param {boolean} applyTraffic
     * @returns {number}
     */
    function applyTrafficRatioToBaseRemaining(baseRemainingMinutes, snap, nowMs, applyTraffic) {
        if (!applyTraffic) return baseRemainingMinutes;
        snap = snap || {};
        if (snap.trafficAdjustedMinutes == null || snap.baseAtTrafficFetch <= 0 || !snap.trafficFetchAt) {
            return baseRemainingMinutes;
        }
        if (nowMs - snap.trafficFetchAt > TRAFFIC_RATIO_MAX_AGE_MS) return baseRemainingMinutes;
        var ratio = snap.trafficAdjustedMinutes / snap.baseAtTrafficFetch;
        return Math.max(1, Math.round(baseRemainingMinutes * ratio));
    }

    var api = {
        formatRemainingTime: formatRemainingTime,
        buildETAVoiceMessage: buildETAVoiceMessage,
        formatETATime: formatETATime,
        ensureDefaultTrafficAwareRouting: ensureDefaultTrafficAwareRouting,
        shouldApplyTrafficAwareETA: shouldApplyTrafficAwareETA,
        normalizeRouteDurationMinutes: normalizeRouteDurationMinutes,
        applyTrafficRatioToBaseRemaining: applyTrafficRatioToBaseRemaining,
        TRAFFIC_RATIO_MAX_AGE_MS: TRAFFIC_RATIO_MAX_AGE_MS,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrETA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

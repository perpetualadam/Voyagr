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

    /**
     * Progress-based remaining time (minutes) from GPS on polyline.
     * @param {Object} o
     * @param {boolean} o.routeInProgress
     * @param {object|null} o.lastCalculatedRoute
     * @param {Array<[number,number]>} o.polyline
     * @param {number} o.originalDurationMinutes
     * @param {boolean} o.userHasStartedMoving
     * @param {number|null} o.currentLat
     * @param {number|null} o.currentLon
     * @param {number} [o.lastSnappedRouteIndex]
     * @param {{ totalPolylineLengthMeters: function, computeRemainingDistanceAlongRoute: function }} o.routeGeometry
     * @returns {{ originalDurationMinutes: number, timeRemainingMinutes: number, progressPercent: number }|null}
     */
    function computeBaseNavigationETAMinutes(o) {
        o = o || {};
        if (!o.routeInProgress || !o.lastCalculatedRoute || !o.polyline || o.polyline.length === 0) {
            return null;
        }
        var originalDurationMinutes = o.originalDurationMinutes;
        if (!originalDurationMinutes || originalDurationMinutes <= 0) return null;

        var rg = o.routeGeometry;
        var totalDistance = rg.totalPolylineLengthMeters(o.polyline);
        var remainingDistance = totalDistance;
        if (o.userHasStartedMoving && o.currentLat != null && o.currentLon != null && o.polyline.length >= 2) {
            remainingDistance = rg.computeRemainingDistanceAlongRoute(
                o.currentLat, o.currentLon, o.polyline, o.lastSnappedRouteIndex || 0
            );
        }
        var progressPercent = 0;
        if (totalDistance > 0) {
            progressPercent = Math.max(0, Math.min(100, ((totalDistance - remainingDistance) / totalDistance) * 100));
        }
        var timeRemainingMinutes = Math.round(originalDurationMinutes * (1 - (progressPercent / 100)));
        if (timeRemainingMinutes < 0 || timeRemainingMinutes > originalDurationMinutes) return null;
        return {
            originalDurationMinutes: originalDurationMinutes,
            timeRemainingMinutes: timeRemainingMinutes,
            progressPercent: progressPercent,
        };
    }

    /**
     * Remaining journey time for the summary bar (pre-movement uses full duration).
     * @param {Object} o
     * @param {object|null} o.lastCalculatedRoute
     * @param {number} o.routeDurationMin
     * @param {boolean} o.userHasStartedMoving
     * @param {number} o.remainingDistanceMeters
     * @param {number} o.polylineTotalM
     * @returns {number|null} Minutes remaining, or null when route duration unavailable
     */
    function computeJourneyRemainingTimeMinutes(o) {
        o = o || {};
        if (!o.lastCalculatedRoute || !(o.routeDurationMin > 0)) return null;

        var totalDuration = o.routeDurationMin;
        var totalDistance = o.polylineTotalM > 0
            ? o.polylineTotalM
            : ((o.lastCalculatedRoute.distance_km || 0) * 1000 || 1);

        if (o.userHasStartedMoving) {
            var progress = 1 - (o.remainingDistanceMeters / totalDistance);
            var remaining = totalDuration * (1 - progress);
            if (remaining < 0) remaining = 0;
            if (remaining > 1440) remaining = totalDuration;
            return remaining;
        }
        return totalDuration;
    }

    /**
     * Fallback remaining time when route duration is unavailable (50 km/h average).
     * @param {number} remainingDistanceMeters
     * @returns {number}
     */
    function estimateRemainingTimeFromDistance(remainingDistanceMeters) {
        var avgSpeedKmh = 50;
        return (remainingDistanceMeters / 1000 / avgSpeedKmh) * 60;
    }

    /**
     * Whether a nav traffic-conditions fetch is due.
     * @param {number} nowMs
     * @param {number} lastFetchAt
     * @param {number} minIntervalMs
     * @param {boolean} forceFetch
     * @param {boolean} hasPriorTrafficFetch
     * @returns {boolean}
     */
    function shouldRefreshNavTrafficETA(nowMs, lastFetchAt, minIntervalMs, forceFetch, hasPriorTrafficFetch) {
        if (forceFetch) return true;
        if (!hasPriorTrafficFetch) return true;
        return (nowMs - lastFetchAt) >= minIntervalMs;
    }

    /**
     * Build navETASnapshot traffic fields from a TomTom flow sample.
     * @param {number} baseRemainingMinutes
     * @param {{ source?: string, delayMin?: number, severe?: boolean, avgCongestion?: number|null }|null|undefined} flow
     * @param {number} nowMs
     * @returns {{ trafficAdjustedMinutes: number, trafficLevel: string, congestionPercent: number|null, trafficFetchAt: number, baseAtTrafficFetch: number }|null}
     */
    function buildTrafficSnapshotFromFlow(baseRemainingMinutes, flow, nowMs) {
        if (!flow || flow.source !== 'TomTom') return null;
        var baseAt = Math.max(1, Math.round(baseRemainingMinutes));
        var delayMin = flow.delayMin || 0;
        var adjusted = Math.max(1, Math.round(baseAt + delayMin));
        var level = flow.severe ? 'Heavy' : (delayMin >= 3 ? 'Moderate' : 'Light');
        return {
            trafficAdjustedMinutes: adjusted,
            trafficLevel: level,
            congestionPercent: flow.avgCongestion != null ? flow.avgCongestion : null,
            trafficFetchAt: nowMs,
            baseAtTrafficFetch: baseAt,
        };
    }

    /**
     * Traffic status line for the turn-info ETA panel.
     * @param {boolean} showTraffic
     * @param {string|null} trafficLevel
     * @param {number|null} congestionPercent
     * @returns {string}
     */
    function buildTrafficStatusLine(showTraffic, trafficLevel, congestionPercent) {
        if (!showTraffic) return '';
        if (trafficLevel) {
            var line = 'Traffic: ' + trafficLevel;
            if (congestionPercent != null) line += ' · ' + congestionPercent + '% congestion';
            return line;
        }
        return 'Traffic: updating…';
    }

    /**
     * HTML for the turn-info ETA panel (caller supplies locale-formatted clock time).
     * @param {number} displayMins
     * @param {number} progressPercent
     * @param {string} etaClockText
     * @param {string} [trafficLine]
     * @returns {string}
     */
    function buildTurnInfoETAPanelHtml(displayMins, progressPercent, etaClockText, trafficLine) {
        var trafficHtml = trafficLine
            ? '<div style="font-size: 11px; color: #555; margin-top: 4px;">' + trafficLine + '</div>'
            : '';
        return (
            '<div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">' +
                '<div style="font-size: 12px; color: #666;">ETA</div>' +
                '<div style="font-size: 18px; font-weight: bold; color: #333;">' + etaClockText + '</div>' +
                '<div style="font-size: 12px; color: #999; margin-top: 5px;">' +
                    displayMins + ' min remaining (' + progressPercent.toFixed(0) + '% complete)' +
                '</div>' +
                trafficHtml +
            '</div>'
        );
    }

    /**
     * HTML for destination-remaining progress in the turn-info panel.
     * @param {string} displayDistance
     * @param {string} distUnit
     * @param {number} progressPercent
     * @returns {string}
     */
    function buildDestinationProgressPanelHtml(displayDistance, distUnit, progressPercent) {
        return (
            '<div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">' +
                '<div style="font-size: 14px; color: #666;">Distance to destination</div>' +
                '<div style="font-size: 24px; font-weight: bold; color: #333;">' + displayDistance + ' ' + distUnit + '</div>' +
                '<div style="font-size: 12px; color: #999; margin-top: 5px;">Route progress: ' + progressPercent.toFixed(0) + '%</div>' +
            '</div>'
        );
    }

    var api = {
        formatRemainingTime: formatRemainingTime,
        buildETAVoiceMessage: buildETAVoiceMessage,
        formatETATime: formatETATime,
        ensureDefaultTrafficAwareRouting: ensureDefaultTrafficAwareRouting,
        shouldApplyTrafficAwareETA: shouldApplyTrafficAwareETA,
        normalizeRouteDurationMinutes: normalizeRouteDurationMinutes,
        applyTrafficRatioToBaseRemaining: applyTrafficRatioToBaseRemaining,
        computeBaseNavigationETAMinutes: computeBaseNavigationETAMinutes,
        computeJourneyRemainingTimeMinutes: computeJourneyRemainingTimeMinutes,
        estimateRemainingTimeFromDistance: estimateRemainingTimeFromDistance,
        shouldRefreshNavTrafficETA: shouldRefreshNavTrafficETA,
        buildTrafficSnapshotFromFlow: buildTrafficSnapshotFromFlow,
        buildTrafficStatusLine: buildTrafficStatusLine,
        buildTurnInfoETAPanelHtml: buildTurnInfoETAPanelHtml,
        buildDestinationProgressPanelHtml: buildDestinationProgressPanelHtml,
        TRAFFIC_RATIO_MAX_AGE_MS: TRAFFIC_RATIO_MAX_AGE_MS,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrETA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

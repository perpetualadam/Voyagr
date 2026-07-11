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

    /**
     * Fresh nav ETA + traffic snapshot at navigation start.
     * @returns {{ baseRemainingMinutes: number, trafficAdjustedMinutes: null, trafficLevel: null, congestionPercent: null, progressPercent: number, trafficFetchAt: number, baseAtTrafficFetch: number }}
     */
    function createEmptyNavETASnapshot() {
        return {
            baseRemainingMinutes: 0,
            trafficAdjustedMinutes: null,
            trafficLevel: null,
            congestionPercent: null,
            progressPercent: 0,
            trafficFetchAt: 0,
            baseAtTrafficFetch: 0,
        };
    }

    /**
     * Apply plan for the journey summary bar (values only; app writes DOM).
     * @param {Object} o
     * @returns {{ distanceText: string, timeText: string, etaText: string, remainingTimeMinutes: number }}
     */
    function buildJourneySummaryBarApplyPlan(o) {
        o = o || {};
        var distanceText = typeof o.formatRemainingDistance === 'function'
            ? o.formatRemainingDistance(o.remainingDistanceMeters || 0, o.distanceUnit)
            : '';

        var remainingTimeMinutes = 0;
        var journeyMinutes = computeJourneyRemainingTimeMinutes({
            lastCalculatedRoute: o.lastCalculatedRoute,
            routeDurationMin: o.routeDurationMin,
            userHasStartedMoving: o.userHasStartedMoving,
            remainingDistanceMeters: o.remainingDistanceMeters,
            polylineTotalM: o.polylineTotalM,
        });

        if (journeyMinutes != null) {
            remainingTimeMinutes = typeof o.applyTrafficRatio === 'function'
                ? o.applyTrafficRatio(journeyMinutes)
                : journeyMinutes;
        } else {
            remainingTimeMinutes = estimateRemainingTimeFromDistance(o.remainingDistanceMeters || 0);
        }

        var now = o.now != null ? o.now : Date.now();
        var eta = new Date(now + remainingTimeMinutes * 60000);
        return {
            distanceText: distanceText,
            timeText: formatRemainingTime(remainingTimeMinutes),
            etaText: formatETATime(eta, o.use24HourFormat !== false),
            remainingTimeMinutes: remainingTimeMinutes,
        };
    }

    var MAX_PLAUSIBLE_AVG_KMH = 300;

    /**
     * Patch plan for traveled journey summary (distance/time substitution rules).
     * @param {Object|null} route
     * @param {number} traveledMeters
     * @param {number|null} navStartedAt
     * @param {number} [now]
     * @returns {{ patch: Object|null, avgSpeedKmh: number }}
     */
    function buildTraveledJourneyRoutePatch(route, traveledMeters, navStartedAt, now) {
        if (!route) return { patch: null, avgSpeedKmh: 0 };
        now = now != null ? now : Date.now();
        var traveledKm = (traveledMeters || 0) / 1000;
        var haveRealDistance = traveledKm > 0.05;
        var elapsedMin = null;
        if (Number.isFinite(navStartedAt) && navStartedAt > 0) {
            var mins = (now - navStartedAt) / 60000;
            if (mins > 0.1) elapsedMin = mins;
        }

        var out = Object.assign({}, route);
        var avgSpeedKmh = 0;
        if (haveRealDistance && elapsedMin != null) {
            out.distance_km = Number(traveledKm.toFixed(2));
            out.duration_minutes = Math.round(elapsedMin);
            if (out.duration_minutes > 0 && out.distance_km > 0) {
                avgSpeedKmh = out.distance_km / (out.duration_minutes / 60);
                if (!Number.isFinite(avgSpeedKmh) || avgSpeedKmh > MAX_PLAUSIBLE_AVG_KMH) {
                    avgSpeedKmh = Math.min(Math.max(avgSpeedKmh, 0), MAX_PLAUSIBLE_AVG_KMH);
                }
            }
            return { patch: out, avgSpeedKmh: avgSpeedKmh };
        }
        var distanceKm = route.distance_km || 0;
        var durationMin = route.duration_minutes || 0;
        if (durationMin > 0 && distanceKm > 0) {
            avgSpeedKmh = distanceKm / (durationMin / 60);
            if (!Number.isFinite(avgSpeedKmh) || avgSpeedKmh > MAX_PLAUSIBLE_AVG_KMH) {
                avgSpeedKmh = Math.min(Math.max(avgSpeedKmh, 0), MAX_PLAUSIBLE_AVG_KMH);
            }
        }
        return { patch: null, avgSpeedKmh: avgSpeedKmh };
    }

    /**
     * Apply plan for the end-of-journey summary modal (values only; app writes DOM).
     * @param {Object|null} routeData
     * @param {Object} opts
     * @returns {{ visible: boolean, distanceText?: string, timeText?: string, costText?: string, avgSpeedText?: string }}
     */
    function buildJourneySummaryModalApplyPlan(routeData, opts) {
        opts = opts || {};
        if (!routeData) {
            return { visible: false };
        }
        var distanceKm = routeData.distance_km || 0;
        var durationMin = routeData.duration_minutes || 0;
        var cost = routeData.total_cost || 0;
        var traveled = buildTraveledJourneyRoutePatch(
            routeData,
            opts.traveledMeters,
            opts.navStartedAt,
            opts.now
        );
        var avgSpeedKmh = traveled.avgSpeedKmh;
        var displayDist = typeof opts.convertDistance === 'function'
            ? opts.convertDistance(distanceKm)
            : String(distanceKm);
        var distUnit = opts.distUnit || 'km';
        var adjustedCost = typeof opts.adjustCost === 'function'
            ? opts.adjustCost(cost)
            : cost;
        var currencySymbol = opts.currencySymbol || '£';
        var speedText = typeof opts.convertSpeed === 'function'
            ? opts.convertSpeed(avgSpeedKmh)
            : String(avgSpeedKmh);
        var speedUnit = opts.speedUnit || 'km/h';
        return {
            visible: true,
            distanceText: displayDist + ' ' + distUnit,
            timeText: Math.round(durationMin) + ' min',
            costText: currencySymbol + Number(adjustedCost).toFixed(2),
            avgSpeedText: speedText + ' ' + speedUnit,
        };
    }

    /**
     * Execute plan for mounting the end-of-journey summary modal.
     * @param {Object} applyPlan - from buildJourneySummaryModalApplyPlan
     * @returns {Object}
     */
    function buildJourneySummaryModalExecutePlan(applyPlan) {
        applyPlan = applyPlan || {};
        return {
            shouldShow: !!applyPlan.visible,
            modalId: 'journeySummaryModal',
            elementIds: {
                summaryDistance: 'summaryDistance',
                summaryTime: 'summaryTime',
                summaryCost: 'summaryCost',
                summaryAvgSpeed: 'summaryAvgSpeed',
            },
            distanceText: applyPlan.distanceText,
            timeText: applyPlan.timeText,
            costText: applyPlan.costText,
            avgSpeedText: applyPlan.avgSpeedText,
            expandBottomSheet: true,
            logMessage: '[Journey Summary] Displayed summary',
        };
    }

    /**
     * Execute plan for closing the journey summary modal.
     * @returns {Object}
     */
    function buildCloseJourneySummaryExecutePlan() {
        return {
            shouldClose: true,
            modalId: 'journeySummaryModal',
            switchTab: 'navigation',
            clearForm: true,
        };
    }

    var ETA_ANNOUNCEMENT_INTERVAL_MS = 600000;
    var ETA_INITIAL_ANNOUNCE_DELAY_MS = 30000;
    var INITIAL_ETA_MOVEMENT_RETRY_MS = 20000;
    var INITIAL_ETA_MOVEMENT_MAX_RETRIES = 15;

    /**
     * Periodic ETA voice announcement tick plan.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildAnnounceETAIfNeededPlan(input) {
        input = input || {};
        if (!input.routeInProgress || !input.hasRoute || !input.voiceEnabled) {
            return { action: 'skip', reason: 'inactive' };
        }
        var now = input.now != null ? input.now : Date.now();
        var intervalMs = input.intervalMs != null ? input.intervalMs : ETA_ANNOUNCEMENT_INTERVAL_MS;
        var elapsed = now - (input.lastETAAnnouncementTime || 0);
        if (elapsed <= intervalMs) {
            return { action: 'skip', reason: 'interval' };
        }
        if (!input.baseRemainingMinutes) {
            return {
                action: 'skip',
                reason: 'no-duration',
                warnLog: '[ETA] No valid route duration for voice',
            };
        }
        var timeRemainingMinutes = typeof input.applyTrafficRatio === 'function'
            ? input.applyTrafficRatio(input.baseRemainingMinutes)
            : input.baseRemainingMinutes;
        return {
            action: 'announce',
            timeRemainingMinutes: timeRemainingMinutes,
            etaMs: now + timeRemainingMinutes * 60000,
            logPrefix: '[Voice] ETA announcement:',
            updateLastETAAnnouncementTime: now,
        };
    }

    /**
     * Movement gate for the first ETA voice announcement after nav start.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildInitialETAMovementDeferPlan(input) {
        input = input || {};
        if (input.hasStartedMoving) {
            return { action: 'proceed', resetRetries: true };
        }
        var retries = (input.retries || 0) + 1;
        var maxRetries = input.maxRetries != null ? input.maxRetries : INITIAL_ETA_MOVEMENT_MAX_RETRIES;
        if (retries <= maxRetries) {
            return {
                action: 'defer',
                retries: retries,
                retryDelayMs: input.retryDelayMs != null ? input.retryDelayMs : INITIAL_ETA_MOVEMENT_RETRY_MS,
                logMessage: '[Voice] Initial ETA deferred until movement (retry ' + retries + '/' + maxRetries + ')',
            };
        }
        return {
            action: 'skip',
            logMessage: '[Voice] Initial ETA skipped after max stationary retries; periodic ETA still applies',
        };
    }

    /**
     * Execute plan for the first ETA voice announcement after movement gate passes.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildInitialETAAnnouncementExecutePlan(input) {
        input = input || {};
        if (!input.routeInProgress || !input.hasRoute || !input.voiceEnabled) {
            return { shouldAnnounce: false };
        }
        if (!input.baseRemainingMinutes) {
            return { shouldAnnounce: false };
        }
        var now = input.now != null ? input.now : Date.now();
        var timeRemainingMinutes = typeof input.applyTrafficRatio === 'function'
            ? input.applyTrafficRatio(input.baseRemainingMinutes)
            : input.baseRemainingMinutes;
        return {
            shouldAnnounce: true,
            refreshTrafficIfDue: !!input.refreshTrafficIfDue,
            timeRemainingMinutes: timeRemainingMinutes,
            etaMs: now + timeRemainingMinutes * 60000,
            logPrefix: '[Voice] Initial ETA announcement:',
            updateLastETAAnnouncementTime: now,
            resetMovementRetries: true,
        };
    }

    /**
     * Schedule plan for deferred initial ETA announcement after navigation starts.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildScheduleInitialETAAnnouncementPlan(input) {
        input = input || {};
        return {
            shouldSchedule: true,
            clearExisting: true,
            delayMs: input.delayMs != null ? input.delayMs : ETA_INITIAL_ANNOUNCE_DELAY_MS,
            action: 'speakInitialETAAnnouncement',
        };
    }

    /**
     * Tick plan for periodic navigation ETA panel refresh.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildUpdateETACalculationTickPlan(input) {
        input = input || {};
        if (!input.routeInProgress || !input.hasRoute || !input.hasPolyline) {
            return { action: 'skip', reason: 'inactive' };
        }
        if (input.baseRemainingMinutes == null) {
            return {
                action: 'skip',
                reason: 'no-duration',
                warnLog: '[ETA] No valid route duration or progress',
            };
        }
        return {
            action: 'update',
            timeRemainingMinutes: input.baseRemainingMinutes,
            progressPercent: input.progressPercent != null ? input.progressPercent : 0,
            applyTrafficAware: !!input.applyTrafficAware,
            trafficLevel: input.trafficLevel,
            congestionPercent: input.congestionPercent,
            refreshTrafficBetweenRenders: true,
        };
    }

    /**
     * Render plan for the turn-info ETA panel HTML.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildTurnInfoETAPanelRenderPlan(input) {
        input = input || {};
        var displayMins = input.adjustedMinutes != null ? input.adjustedMinutes : input.baseMinutes;
        var trafficLine = buildTrafficStatusLine(
            !!input.showTraffic,
            input.trafficLevel,
            input.congestionPercent
        );
        return {
            shouldRender: true,
            targetId: 'turnInfo',
            panelHtml: buildTurnInfoETAPanelHtml(
                displayMins,
                input.progressPercent != null ? input.progressPercent : 0,
                input.etaClockText || '',
                trafficLine
            ),
        };
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
        createEmptyNavETASnapshot: createEmptyNavETASnapshot,
        buildJourneySummaryBarApplyPlan: buildJourneySummaryBarApplyPlan,
        buildTraveledJourneyRoutePatch: buildTraveledJourneyRoutePatch,
        buildJourneySummaryModalApplyPlan: buildJourneySummaryModalApplyPlan,
        buildJourneySummaryModalExecutePlan: buildJourneySummaryModalExecutePlan,
        buildCloseJourneySummaryExecutePlan: buildCloseJourneySummaryExecutePlan,
        ETA_ANNOUNCEMENT_INTERVAL_MS: ETA_ANNOUNCEMENT_INTERVAL_MS,
        ETA_INITIAL_ANNOUNCE_DELAY_MS: ETA_INITIAL_ANNOUNCE_DELAY_MS,
        INITIAL_ETA_MOVEMENT_RETRY_MS: INITIAL_ETA_MOVEMENT_RETRY_MS,
        INITIAL_ETA_MOVEMENT_MAX_RETRIES: INITIAL_ETA_MOVEMENT_MAX_RETRIES,
        buildAnnounceETAIfNeededPlan: buildAnnounceETAIfNeededPlan,
        buildInitialETAMovementDeferPlan: buildInitialETAMovementDeferPlan,
        buildInitialETAAnnouncementExecutePlan: buildInitialETAAnnouncementExecutePlan,
        buildScheduleInitialETAAnnouncementPlan: buildScheduleInitialETAAnnouncementPlan,
        buildUpdateETACalculationTickPlan: buildUpdateETACalculationTickPlan,
        buildTurnInfoETAPanelRenderPlan: buildTurnInfoETAPanelRenderPlan,
        MAX_PLAUSIBLE_AVG_KMH: MAX_PLAUSIBLE_AVG_KMH,
        TRAFFIC_RATIO_MAX_AGE_MS: TRAFFIC_RATIO_MAX_AGE_MS,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrETA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

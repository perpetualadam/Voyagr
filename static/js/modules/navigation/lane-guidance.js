/**
 * @file Pure lane-guidance helpers (deterministic fallback data + UI view-model).
 * @module modules/navigation/lane-guidance
 *
 * Side-effect-free helpers extracted from the voyagr-app.js monolith so they can be unit
 * tested for real and shared with the classic (non-module) app script via the
 * `VoyagrLaneGuidance` global. The monolith delegates to these with an inline fallback, so
 * lane guidance still works if this script fails to load.
 *
 * Two groups of helpers:
 *   1. Deterministic, network-free lane *data* used when Overpass is slow/unavailable —
 *      lane count from road class, recommended lane + urgency mirroring the backend UK
 *      heuristic (`buildDeterministicLaneGuidance` and its parts).
 *   2. A pure *view-model* for the overlay (`shouldShow`, `urgencyClass`, `displayText`,
 *      `badge`, `laneIndicators`) so the DOM-rendering function in the monolith stays a
 *      thin, untestable shell over tested logic.
 */
(function (root) {
    'use strict';

    var ARROW = { left: '←', slight_left: '↖', through: '↑', slight_right: '↗', right: '→' };

    var LANE_DEFAULTS = {
        motorway: 3, trunk: 3, primary: 2, secondary: 2,
        tertiary: 1, residential: 1, unclassified: 1
    };

    /** English ordinal for a positive integer (1 -> "1st", 2 -> "2nd", ...). */
    function ordinal(n) {
        var s = ['th', 'st', 'nd', 'rd'];
        var v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    /** Human-friendly name for a 1-based lane (mirrors backend _descriptive_lane_name). */
    function laneNameFor(lane, total) {
        if (total <= 1) return 'lane';
        if (lane === 1) return 'left lane';
        if (lane === total) return 'right lane';
        if (total === 3 && lane === 2) return 'middle lane';
        return 'lane ' + lane;
    }

    /**
     * Distance-derived urgency fields (mirrors the backend thresholds). Recomputed from the
     * live distance so a cached lane structure never shows stale urgency as you approach.
     * @param {number} distance - Metres to the maneuver.
     * @param {string} lanePos - Lane name (from laneNameFor).
     * @param {string} maneuver - Maneuver key.
     * @param {number} exitCount - Roundabout exit count (0 when N/A).
     */
    function laneUrgencyFields(distance, lanePos, maneuver, exitCount) {
        var urgency = 'none', urgency_text = '';
        if (distance <= 100) { urgency = 'now'; urgency_text = 'Get in the ' + lanePos + ' now!'; }
        else if (distance <= 300) { urgency = 'soon'; urgency_text = 'Move to the ' + lanePos; }
        else if (distance <= 800) { urgency = 'ahead'; urgency_text = 'Prepare to use the ' + lanePos; }
        else if (distance <= 1500) { urgency = 'info'; urgency_text = 'Stay in the ' + lanePos; }
        var guidance_text = 'Use the ' + lanePos;
        if (maneuver === 'roundabout' && exitCount > 0) {
            guidance_text = 'Use the ' + lanePos + ' and take the ' + ordinal(exitCount) + ' exit';
        }
        return {
            urgency: urgency,
            urgency_text: urgency_text,
            guidance_text: guidance_text,
            lane_change_needed: ['now', 'soon', 'ahead'].indexOf(urgency) >= 0,
            distance_to_maneuver: distance
        };
    }

    /**
     * Deterministic, network-free lane guidance used when Overpass is slow/unavailable.
     * Lane count comes from the road class; the recommended lane mirrors the backend UK
     * heuristic. Single-lane roads return total_lanes=1 so the overlay stays hidden.
     */
    function buildDeterministicLaneGuidance(maneuver, distance, exitCount, roadType) {
        var totalLanes = LANE_DEFAULTS[roadType] || 2;
        if (totalLanes < 1) totalLanes = 1;

        var lane;
        var dir = 'through';
        if (maneuver === 'roundabout' && exitCount > 0) {
            lane = exitCount >= 3 ? totalLanes : 1;
            dir = exitCount >= 3 ? 'right' : (exitCount <= 1 ? 'left' : 'through');
        } else if (['left', 'slight_left', 'sharp_left', 'exit_left'].indexOf(maneuver) >= 0) {
            lane = 1;
            dir = maneuver.indexOf('slight') >= 0 ? 'slight_left' : 'left';
        } else if (['right', 'slight_right', 'sharp_right', 'exit_right', 'exit'].indexOf(maneuver) >= 0) {
            lane = totalLanes;
            dir = maneuver.indexOf('slight') >= 0 ? 'slight_right' : 'right';
        } else if (maneuver === 'uturn') {
            lane = totalLanes;
            dir = 'right';
        } else {
            lane = Math.max(1, Math.ceil(totalLanes / 2));
            dir = 'through';
        }

        var lane_arrows = [];
        for (var i = 1; i <= totalLanes; i++) {
            var isRec = i === lane;
            lane_arrows.push({
                directions: [isRec ? dir : 'through'],
                arrow: isRec ? (ARROW[dir] || '↑') : '↑',
                primary: isRec ? dir : 'through'
            });
        }

        var lanePos = laneNameFor(lane, totalLanes);
        var urgencyFields = laneUrgencyFields(distance, lanePos, maneuver, exitCount);

        var result = {
            success: true, total_lanes: totalLanes, recommended_lane: lane,
            lane_arrows: lane_arrows, next_maneuver: maneuver,
            road_name: '', highway_type: roadType || 'unknown',
            has_osm_data: false, has_turn_lanes: false, roundabout_exit_count: exitCount,
            estimated: true
        };
        for (var k in urgencyFields) {
            if (Object.prototype.hasOwnProperty.call(urgencyFields, k)) result[k] = urgencyFields[k];
        }
        return result;
    }

    // ---- View-model helpers for the overlay (rendering decisions, no DOM) ----

    /**
     * @returns {boolean} Whether the lane overlay should be visible. Hidden on single-lane
     *   roads or when no maneuver is approaching.
     */
    function shouldShow(data) {
        return !!data && data.total_lanes > 1 && data.urgency !== 'none';
    }

    /**
     * The "Estimated" badge state for non-OSM (fallback) guidance.
     * @returns {{ text: string, visible: boolean }}
     */
    function badge(data) {
        if (data && data.has_osm_data) return { text: '', visible: false };
        return { text: 'Estimated', visible: true };
    }

    /**
     * @returns {string} The urgency CSS class to add to the overlay ('' when none/info).
     */
    function urgencyClass(urgency) {
        if (urgency === 'now') return 'urgency-now';
        if (urgency === 'soon') return 'urgency-soon';
        if (urgency === 'ahead') return 'urgency-ahead';
        return '';
    }

    /**
     * @returns {string} The guidance text to show — the urgency text takes over once the
     *   maneuver is imminent (not 'none'/'info'), else the steady guidance text.
     */
    function displayText(data) {
        if (!data) return '';
        var text = data.guidance_text || '';
        if (data.urgency_text && data.urgency !== 'none' && data.urgency !== 'info') {
            text = data.urgency_text;
        }
        return text;
    }

    /**
     * Per-lane view-model for the visual strip.
     * @returns {Array<{ arrow: string, recommended: boolean, hasDirection: boolean }>}
     */
    function laneIndicators(data) {
        if (!data) return [];
        var total = data.total_lanes || 0;
        var laneArrows = data.lane_arrows || [];
        var out = [];
        for (var i = 0; i < total; i++) {
            var laneNum = i + 1;
            var arrowInfo = laneArrows[i];
            out.push({
                arrow: arrowInfo ? arrowInfo.arrow : '↑',
                recommended: laneNum === data.recommended_lane,
                hasDirection: !!(arrowInfo && arrowInfo.directions && data.has_turn_lanes)
            });
        }
        return out;
    }

    /**
     * @param {string} arrow
     * @returns {string}
     */
    function buildLaneIndicatorHtml(arrow) {
        return '<span class="lane-arrow">' + (arrow || '↑') + '</span>';
    }

    var LANE_GUIDANCE_FETCH_INTERVAL_MS = 3000;
    var LANE_GUIDANCE_CACHE_TTL_MS = 20000;
    var LANE_GUIDANCE_FALLBACK_TTL_MS = 8000;
    var LANE_GUIDANCE_FETCH_TIMEOUT_MS = 2500;
    var LANE_GUIDANCE_CACHE_MAX_ENTRIES = 40;
    var LANE_GUIDANCE_POSITION_THRESHOLD_M = 50;

    /**
     * @param {Object} o
     * @returns {boolean}
     */
    function shouldSkipLaneGuidanceFetch(o) {
        o = o || {};
        var posChanged = !o.lastPosition || o.distanceMovedMeters > LANE_GUIDANCE_POSITION_THRESHOLD_M;
        var maneuverChanged = o.maneuver !== o.lastManeuver;
        return !posChanged && !maneuverChanged &&
            (o.now - o.lastFetch) < LANE_GUIDANCE_FETCH_INTERVAL_MS;
    }

    /**
     * Crow-flies distance (m) from current position to the next maneuver shape index.
     * @param {number} lat
     * @param {number} lon
     * @param {Array<Object>|null|undefined} routeSteps
     * @param {number} currentStepIndex
     * @param {Array<[number,number]>|null|undefined} routePolyline
     * @param {function(number,number,number,number): number} calculateDistance
     * @returns {number}
     */
    function computeDistanceToManeuverMeters(lat, lon, routeSteps, currentStepIndex, routePolyline, calculateDistance) {
        if (!routeSteps || !routePolyline || routeSteps.length === 0) return 9999;
        if (currentStepIndex >= routeSteps.length) return 9999;
        var nextStep = routeSteps[currentStepIndex];
        if (!nextStep) return 9999;
        var shapeIdx = nextStep.begin_shape_index || 0;
        if (shapeIdx >= routePolyline.length) return 9999;
        var pt = routePolyline[shapeIdx];
        if (!pt || pt.length < 2) return 9999;
        if (typeof calculateDistance !== 'function') return 9999;
        return calculateDistance(lat, lon, pt[0], pt[1]);
    }

    /**
     * Lane-guidance fetch tick plan: throttle, cache hit, or API fetch.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildLaneGuidanceFetchTickPlan(opts) {
        opts = opts || {};
        var now = opts.now != null ? opts.now : Date.now();
        var roundaboutExitCount = opts.roundaboutExitCount || 0;

        var distanceMovedMeters = 999;
        if (opts.lastPosition && typeof opts.calculateDistance === 'function') {
            distanceMovedMeters = opts.calculateDistance(
                opts.lat,
                opts.lon,
                opts.lastPosition.lat,
                opts.lastPosition.lon
            );
        }

        if (shouldSkipLaneGuidanceFetch({
            now: now,
            lastFetch: opts.lastFetch,
            lastPosition: opts.lastPosition,
            distanceMovedMeters: distanceMovedMeters,
            maneuver: opts.maneuver,
            lastManeuver: opts.lastManeuver,
        })) {
            return { action: 'skip', reason: 'throttle' };
        }

        var distToManeuver = computeDistanceToManeuverMeters(
            opts.lat,
            opts.lon,
            opts.routeSteps,
            opts.currentStepIndex,
            opts.routePolyline,
            opts.calculateDistance
        );
        var roadType = opts.roadType || 'unknown';

        var statePatch = {
            lastFetch: now,
            lastManeuver: opts.maneuver,
            lastPosition: { lat: opts.lat, lon: opts.lon },
        };

        var cacheKey = buildLaneGuidanceCacheKey(
            opts.maneuver,
            roundaboutExitCount,
            roadType,
            opts.lat,
            opts.lon
        );
        var cacheEntry = typeof opts.cacheLookup === 'function'
            ? opts.cacheLookup(cacheKey)
            : opts.cacheEntry;

        if (isLaneGuidanceCacheEntryFresh(cacheEntry, now)) {
            var lanePos = laneNameFor(
                cacheEntry.data.recommended_lane,
                cacheEntry.data.total_lanes
            );
            return {
                action: 'render-cached',
                cacheKey: cacheKey,
                statePatch: statePatch,
                renderPayload: Object.assign(
                    {},
                    cacheEntry.data,
                    laneUrgencyFields(distToManeuver, lanePos, opts.maneuver, roundaboutExitCount)
                ),
            };
        }

        return {
            action: 'fetch',
            cacheKey: cacheKey,
            statePatch: statePatch,
            url: buildLaneGuidanceApiUrl({
                lat: opts.lat,
                lon: opts.lon,
                heading: opts.heading,
                maneuver: opts.maneuver,
                distance: distToManeuver,
                roadType: roadType,
                roundaboutExitCount: roundaboutExitCount,
            }),
            timeoutMs: LANE_GUIDANCE_FETCH_TIMEOUT_MS,
            distToManeuver: distToManeuver,
            roadType: roadType,
            roundaboutExitCount: roundaboutExitCount,
            maneuver: opts.maneuver,
        };
    }

    /**
     * @param {string} maneuver
     * @param {number} roundaboutExitCount
     * @param {string} roadType
     * @param {number} lat
     * @param {number} lon
     * @returns {string}
     */
    function buildLaneGuidanceCacheKey(maneuver, roundaboutExitCount, roadType, lat, lon) {
        return maneuver + '|' + roundaboutExitCount + '|' + roadType + '|' +
            lat.toFixed(3) + ',' + lon.toFixed(3);
    }

    /**
     * @param {Object} o
     * @returns {string}
     */
    function buildLaneGuidanceApiUrl(o) {
        o = o || {};
        return '/api/lane-guidance?lat=' + o.lat + '&lon=' + o.lon +
            '&heading=' + o.heading + '&maneuver=' + o.maneuver +
            '&distance=' + o.distance + '&road_type=' + o.roadType +
            '&roundabout_exit_count=' + (o.roundaboutExitCount || 0);
    }

    /**
     * @param {boolean} isFallback
     * @returns {number}
     */
    function getLaneGuidanceCacheTtlMs(isFallback) {
        return isFallback ? LANE_GUIDANCE_FALLBACK_TTL_MS : LANE_GUIDANCE_CACHE_TTL_MS;
    }

    /**
     * @param {{ ts: number, fallback?: boolean }} entry
     * @param {number} now
     * @returns {boolean}
     */
    function isLaneGuidanceCacheEntryFresh(entry, now) {
        if (!entry) return false;
        return (now - entry.ts) < getLaneGuidanceCacheTtlMs(!!entry.fallback);
    }

    /**
     * DOM apply plan for the lane guidance overlay.
     * @param {Object} data
     * @returns {Object}
     */
    function buildLaneGuidanceUiApplyPlan(data) {
        if (!shouldShow(data)) {
            return { visible: false };
        }
        return {
            visible: true,
            displayClassName: 'lane-guidance-display show',
            urgencyClass: urgencyClass(data.urgency),
            badge: badge(data),
            indicators: laneIndicators(data),
            guidanceText: displayText(data),
        };
    }

    /**
     * @param {number} recommendedLane
     * @param {number} totalLanes
     * @returns {string}
     */
    function resolveLanePositionLabel(recommendedLane, totalLanes) {
        if (recommendedLane === 1) return 'left';
        if (recommendedLane === totalLanes) return 'right';
        if (totalLanes === 3 && recommendedLane === 2) return 'middle';
        return 'lane ' + recommendedLane;
    }

    /**
     * Voice announcement plan for lane guidance (no speech side effects).
     * @param {Object} data
     * @param {string} lastAnnounceKey
     * @returns {{ announceKey: string, message: string, priority: string }|null}
     */
    function buildLaneVoiceAnnouncementPlan(data, lastAnnounceKey) {
        data = data || {};
        if (!data.recommended_lane || data.total_lanes <= 1) return null;
        var announceKey = 'lane_' + data.next_maneuver + '_' + data.recommended_lane + '_' + data.urgency;
        if (announceKey === lastAnnounceKey) return null;

        var lanePos = resolveLanePositionLabel(data.recommended_lane, data.total_lanes);
        var exitInfo = data.roundabout_exit_count > 0
            ? ', take the ' + ordinal(data.roundabout_exit_count) + ' exit'
            : '';
        var laneMsg = '';
        var priority = 'normal';

        if (data.urgency === 'now') {
            priority = 'high';
            if (data.next_maneuver === 'roundabout') {
                laneMsg = 'At the roundabout, use the ' + lanePos + ' lane' + exitInfo;
            } else {
                laneMsg = data.urgency_text || ('Get in the ' + lanePos + ' lane now');
            }
        } else if (data.urgency === 'soon') {
            if (data.next_maneuver === 'roundabout') {
                laneMsg = 'At the roundabout ahead, use the ' + lanePos + ' lane' + exitInfo;
            } else {
                laneMsg = data.urgency_text || ('Move to the ' + lanePos + ' lane');
            }
        } else if (data.urgency === 'ahead' && data.lane_change_needed) {
            laneMsg = 'Ahead, you\'ll need the ' + lanePos + ' lane';
        } else {
            return null;
        }

        return { announceKey: announceKey, message: laneMsg, priority: priority };
    }

    var api = {
        ARROW: ARROW,
        LANE_DEFAULTS: LANE_DEFAULTS,
        ordinal: ordinal,
        laneNameFor: laneNameFor,
        laneUrgencyFields: laneUrgencyFields,
        buildDeterministicLaneGuidance: buildDeterministicLaneGuidance,
        shouldShow: shouldShow,
        badge: badge,
        urgencyClass: urgencyClass,
        displayText: displayText,
        laneIndicators: laneIndicators,
        buildLaneIndicatorHtml: buildLaneIndicatorHtml,
        LANE_GUIDANCE_FETCH_INTERVAL_MS: LANE_GUIDANCE_FETCH_INTERVAL_MS,
        LANE_GUIDANCE_CACHE_TTL_MS: LANE_GUIDANCE_CACHE_TTL_MS,
        LANE_GUIDANCE_FALLBACK_TTL_MS: LANE_GUIDANCE_FALLBACK_TTL_MS,
        LANE_GUIDANCE_FETCH_TIMEOUT_MS: LANE_GUIDANCE_FETCH_TIMEOUT_MS,
        LANE_GUIDANCE_CACHE_MAX_ENTRIES: LANE_GUIDANCE_CACHE_MAX_ENTRIES,
        LANE_GUIDANCE_POSITION_THRESHOLD_M: LANE_GUIDANCE_POSITION_THRESHOLD_M,
        shouldSkipLaneGuidanceFetch: shouldSkipLaneGuidanceFetch,
        computeDistanceToManeuverMeters: computeDistanceToManeuverMeters,
        buildLaneGuidanceFetchTickPlan: buildLaneGuidanceFetchTickPlan,
        buildLaneGuidanceCacheKey: buildLaneGuidanceCacheKey,
        buildLaneGuidanceApiUrl: buildLaneGuidanceApiUrl,
        getLaneGuidanceCacheTtlMs: getLaneGuidanceCacheTtlMs,
        isLaneGuidanceCacheEntryFresh: isLaneGuidanceCacheEntryFresh,
        buildLaneGuidanceUiApplyPlan: buildLaneGuidanceUiApplyPlan,
        resolveLanePositionLabel: resolveLanePositionLabel,
        buildLaneVoiceAnnouncementPlan: buildLaneVoiceAnnouncementPlan,
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Namespace global for the classic browser script (voyagr-app.js). Intentionally does
    // NOT expose bare function names, to avoid clobbering the monolith's own declarations.
    root.VoyagrLaneGuidance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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
        laneIndicators: laneIndicators
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Namespace global for the classic browser script (voyagr-app.js). Intentionally does
    // NOT expose bare function names, to avoid clobbering the monolith's own declarations.
    root.VoyagrLaneGuidance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

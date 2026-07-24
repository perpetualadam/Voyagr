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

    /** Minimum confidence (0–100) to show lane guidance at all. */
    var LANE_CONFIDENCE_DISPLAY_MIN = 70;
    /** Confidence at or above this highlights a single lane. */
    var LANE_CONFIDENCE_HIGH = 90;
    /** Lock lane selection within this distance (m) of the junction. */
    var LANE_LOCK_DISTANCE_M = 400;
    /** Confidence gain required to replace locked guidance. */
    var LANE_LOCK_UPGRADE_DELTA = 15;

    /** True for motorway/trunk (and link) road classes. */
    function isMotorwayRoadType(roadType) {
        if (roadType == null || roadType === '') return false;
        var rc = String(roadType).toLowerCase();
        return rc === 'motorway' || rc === 'motorway_link' || rc === 'trunk' || rc === 'trunk_link';
    }

    /**
     * UK left-hand default: on 2-lane non-motorway roads, slight keep hints are lane-neutral.
     * @param {string} maneuver
     * @param {string} roadType
     * @param {number} totalLanes
     * @returns {string}
     */
    function normalizeLaneManeuverForUK(maneuver, roadType, totalLanes) {
        if (maneuver === 'through') return 'straight';
        if (isMotorwayRoadType(roadType)) return maneuver;
        if (totalLanes <= 2 && (maneuver === 'slight_right' || maneuver === 'slight_left')) {
            return 'straight';
        }
        return maneuver;
    }

    /**
     * Parse Valhalla routing `maneuver.lanes` into lane guidance (highest-priority source).
     * @param {Array<Object>|null|undefined} maneuverLanes
     * @returns {Object|null}
     */
    function extractRoutingLaneGuidance(maneuverLanes) {
        if (!Array.isArray(maneuverLanes) || maneuverLanes.length <= 1) return null;

        var activeLanes = [];
        var validLanes = [];
        for (var i = 0; i < maneuverLanes.length; i++) {
            var lane = maneuverLanes[i];
            if (!lane) continue;
            if (lane.active === true || lane.active_indication === true) {
                activeLanes.push(i + 1);
            }
            if (Array.isArray(lane.valid_indications) && lane.valid_indications.length > 0) {
                validLanes.push(i + 1);
            }
        }

        if (activeLanes.length === 1) {
            return {
                total_lanes: maneuverLanes.length,
                recommended_lanes: activeLanes.slice(),
                recommended_lane: activeLanes[0],
                confidence: 97,
                source: 'routing',
                has_routing_lanes: true,
                has_turn_lanes: true,
                has_osm_data: false,
                estimated: false,
            };
        }
        if (activeLanes.length > 1) {
            return {
                total_lanes: maneuverLanes.length,
                recommended_lanes: activeLanes.slice(),
                recommended_lane: activeLanes[0],
                confidence: 88,
                source: 'routing',
                has_routing_lanes: true,
                has_turn_lanes: true,
                has_osm_data: false,
                estimated: false,
            };
        }
        if (validLanes.length === 1) {
            return {
                total_lanes: maneuverLanes.length,
                recommended_lanes: validLanes.slice(),
                recommended_lane: validLanes[0],
                confidence: 92,
                source: 'routing',
                has_routing_lanes: true,
                has_turn_lanes: true,
                has_osm_data: false,
                estimated: false,
            };
        }
        if (validLanes.length > 1) {
            return {
                total_lanes: maneuverLanes.length,
                recommended_lanes: validLanes.slice(),
                recommended_lane: validLanes[0],
                confidence: 82,
                source: 'routing',
                has_routing_lanes: true,
                has_turn_lanes: true,
                has_osm_data: false,
                estimated: false,
            };
        }
        return null;
    }

    /**
     * Score confidence for `/api/lane-guidance` OSM-backed responses.
     * @param {Object} apiData
     * @returns {number}
     */
    function scoreApiLaneGuidanceConfidence(apiData) {
        if (!apiData) return 0;
        if (apiData.has_turn_lanes) return 95;
        if (apiData.has_osm_data) return 78;
        return 0;
    }

    /**
     * Conservative confidence for UK heuristic (offline) lane estimates.
     * @param {Object} guidance
     * @param {string} maneuver
     * @param {string} roadType
     * @returns {number}
     */
    function scoreEstimatedLaneConfidence(guidance, maneuver, roadType) {
        if (!guidance || guidance.total_lanes <= 1) return 0;
        if (isMotorwayRoadType(roadType)) {
            if (['exit_left', 'exit_right', 'exit', 'merge', 'roundabout'].indexOf(maneuver) >= 0) {
                return 76;
            }
            if (maneuver.indexOf('slight_') === 0) return 74;
            if (guidance.total_lanes >= 3) return 72;
            return 68;
        }
        if (maneuver === 'roundabout' && guidance.total_lanes >= 2) return 80;
        if (guidance.total_lanes >= 3) {
            if (['left', 'right', 'sharp_left', 'sharp_right', 'exit_left', 'exit_right'].indexOf(maneuver) >= 0) {
                return 72;
            }
        }
        if (['exit_left', 'exit_right', 'exit', 'merge'].indexOf(maneuver) >= 0) return 71;
        return 65;
    }

    /**
     * Whether lane guidance adds value for this manoeuvre (conservative gate).
     * @param {Object} opts
     * @returns {boolean}
     */
    function isLaneGuidanceValuableManeuver(opts) {
        opts = opts || {};
        var totalLanes = opts.totalLanes || 0;
        if (totalLanes <= 1) return false;
        if (opts.hasRoutingLanes || opts.hasTurnLanes) return true;

        var maneuver = opts.maneuver || '';
        var roadType = opts.roadType || '';

        if (isMotorwayRoadType(roadType)) {
            if (['exit_left', 'exit_right', 'exit', 'merge', 'roundabout'].indexOf(maneuver) >= 0) return true;
            if (maneuver.indexOf('slight_') === 0) return true;
            return totalLanes >= 3;
        }
        if (maneuver === 'roundabout' && totalLanes >= 2) return true;
        if (totalLanes >= 3) {
            return ['left', 'right', 'sharp_left', 'sharp_right', 'exit_left', 'exit_right', 'merge', 'uturn']
                .indexOf(maneuver) >= 0;
        }
        return ['exit_left', 'exit_right', 'exit', 'merge', 'roundabout'].indexOf(maneuver) >= 0;
    }

    /**
     * @param {Object} data
     * @returns {number[]}
     */
    function getRecommendedLaneNumbers(data) {
        if (!data) return [];
        if (Array.isArray(data.recommended_lanes) && data.recommended_lanes.length > 0) {
            return data.recommended_lanes.slice();
        }
        if (data.recommended_lane != null) return [data.recommended_lane];
        return [];
    }

    /**
     * UK heuristic: candidate lanes for a manoeuvre (1-based indices).
     * @param {string} maneuver
     * @param {number} totalLanes
     * @param {number} exitCount
     * @returns {number[]}
     */
    function estimateCandidateLanesUK(maneuver, totalLanes, exitCount) {
        if (totalLanes <= 1) return [1];
        if (maneuver === 'roundabout' && exitCount > 0) {
            if (exitCount <= 2) return [1];
            if (exitCount >= 3) return [totalLanes];
            return [1];
        }
        if (['left', 'slight_left', 'sharp_left', 'exit_left'].indexOf(maneuver) >= 0) {
            return totalLanes >= 3 ? [1, 2] : [1];
        }
        if (['right', 'slight_right', 'sharp_right', 'exit_right', 'exit', 'uturn'].indexOf(maneuver) >= 0) {
            return totalLanes >= 3 ? [totalLanes - 1, totalLanes] : [totalLanes];
        }
        if (maneuver === 'merge') {
            return totalLanes >= 3 ? [1, totalLanes] : [Math.max(1, Math.ceil(totalLanes / 2))];
        }
        return [Math.max(1, Math.ceil(totalLanes / 2))];
    }

    /**
     * Attach `recommended_lanes` from lane_arrows / heuristics when missing.
     * @param {Object} guidance
     * @param {string} maneuver
     * @param {number} exitCount
     * @returns {Object}
     */
    function enrichGuidanceWithRecommendedLanes(guidance, maneuver, exitCount) {
        if (!guidance) return guidance;
        var out = Object.assign({}, guidance);
        if (getRecommendedLaneNumbers(out).length > 0) return out;

        var total = out.total_lanes || 0;
        var candidates = estimateCandidateLanesUK(maneuver, total, exitCount || 0);
        out.recommended_lanes = candidates;
        out.recommended_lane = candidates[0];
        return out;
    }

    /**
     * Apply confidence bands: single lane (90+) vs multiple (70–89).
     * @param {Object} guidance
     * @returns {Object}
     */
    function applyConfidenceLaneSelection(guidance) {
        if (!guidance) return guidance;
        var out = Object.assign({}, guidance);
        var confidence = out.confidence || 0;
        var lanes = getRecommendedLaneNumbers(out);
        if (lanes.length === 0) return out;

        if (confidence >= LANE_CONFIDENCE_HIGH) {
            out.recommended_lanes = [lanes[0]];
            out.recommended_lane = lanes[0];
        } else if (confidence >= LANE_CONFIDENCE_DISPLAY_MIN) {
            out.recommended_lanes = lanes.slice();
            out.recommended_lane = lanes[0];
        } else {
            out.recommended_lanes = [];
            out.recommended_lane = null;
        }
        return out;
    }

    /**
     * Confidence-based hybrid merge: routing lanes > OSM API > UK estimate.
     * Estimated guidance never overrides explicit routing lane data.
     * @param {Object} opts
     * @returns {Object|null}
     */
    function buildHybridLaneGuidance(opts) {
        opts = opts || {};
        var maneuver = opts.maneuver || 'straight';
        var exitCount = opts.roundaboutExitCount || 0;
        var roadType = opts.roadType || 'unknown';
        var dist = opts.distanceToManeuver != null ? opts.distanceToManeuver : 9999;
        var routing = extractRoutingLaneGuidance(opts.routingManeuverLanes);
        var base = null;

        if (routing) {
            base = Object.assign({}, routing);
        } else if (opts.apiData && opts.apiData.success) {
            var apiConfidence = typeof opts.apiData.confidence === 'number'
                ? opts.apiData.confidence
                : scoreApiLaneGuidanceConfidence(opts.apiData);
            if (apiConfidence > 0 || opts.apiData.has_osm_data || opts.apiData.has_turn_lanes) {
                base = Object.assign({}, opts.apiData, {
                    confidence: apiConfidence,
                    source: opts.apiData.source || (opts.apiData.has_turn_lanes ? 'osm_turn_lanes' : 'osm_lanes'),
                    estimated: opts.apiData.estimated === true,
                });
                base = enrichGuidanceWithRecommendedLanes(base, maneuver, exitCount);
            }
        }
        if (!base) {
            var fb = buildDeterministicLaneGuidance(maneuver, dist, exitCount, roadType);
            var estConfidence = scoreEstimatedLaneConfidence(fb, maneuver, roadType);
            base = Object.assign({}, fb, {
                confidence: estConfidence,
                source: 'estimated',
            });
            base = enrichGuidanceWithRecommendedLanes(base, maneuver, exitCount);
        }

        base = applyConfidenceLaneSelection(base);

        var valuable = isLaneGuidanceValuableManeuver({
            totalLanes: base.total_lanes,
            maneuver: maneuver,
            roadType: roadType,
            roundaboutExitCount: exitCount,
            hasRoutingLanes: !!(routing && routing.has_routing_lanes),
            hasTurnLanes: !!base.has_turn_lanes,
        });
        base.show_lane_guidance = valuable && (base.confidence || 0) >= LANE_CONFIDENCE_DISPLAY_MIN;

        if (!base.show_lane_guidance) {
            base.confidence = Math.min(base.confidence || 0, LANE_CONFIDENCE_DISPLAY_MIN - 1);
        }

        var lanePos = laneNameFor(
            getRecommendedLaneNumbers(base)[0] || base.recommended_lane || 1,
            base.total_lanes
        );
        var urgencyFields = laneUrgencyFields(dist, lanePos, maneuver, exitCount);
        for (var k in urgencyFields) {
            if (Object.prototype.hasOwnProperty.call(urgencyFields, k)) base[k] = urgencyFields[k];
        }
        return base;
    }

    /**
     * Numeric rank for hybrid source priority (routing > OSM > estimated).
     * @param {Object|null|undefined} data
     * @returns {number}
     */
    function laneGuidanceSourceRank(data) {
        if (!data) return 0;
        if (data.source === 'routing' || data.has_routing_lanes) return 3;
        if (data.source === 'osm_turn_lanes' || data.source === 'osm_lanes'
            || data.has_osm_data || data.has_turn_lanes) {
            return 2;
        }
        if (data.source === 'estimated' || data.estimated === true) return 1;
        return 0;
    }

    /**
     * Stability plan: lock lane selection within ~400 m of the junction.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildLaneGuidanceStabilityPlan(opts) {
        opts = opts || {};
        var newGuidance = opts.newGuidance;
        var locked = opts.lockedGuidance;
        var distance = opts.distanceToManeuver != null ? opts.distanceToManeuver : 9999;
        var stepIndex = opts.maneuverStepIndex != null ? opts.maneuverStepIndex : -1;

        if (opts.routeRecalculated) {
            return {
                action: 'lock',
                guidance: newGuidance,
                lockedGuidance: newGuidance,
                lockedStepIndex: stepIndex,
            };
        }
        if (opts.maneuverCompleted) {
            return { action: 'clear', guidance: null, lockedGuidance: null, lockedStepIndex: -1 };
        }

        if (locked && locked.lockedStepIndex === stepIndex && distance <= LANE_LOCK_DISTANCE_M) {
            var lockedData = locked.data || locked;
            var newConf = newGuidance ? (newGuidance.confidence || 0) : 0;
            var lockedConf = lockedData.confidence || 0;
            var higherSource = newGuidance
                && laneGuidanceSourceRank(newGuidance) > laneGuidanceSourceRank(lockedData);
            var confidenceUpgrade = newGuidance
                && newConf >= lockedConf + LANE_LOCK_UPGRADE_DELTA;
            if (higherSource || confidenceUpgrade) {
                return {
                    action: 'lock',
                    guidance: newGuidance,
                    lockedGuidance: { data: newGuidance, lockedStepIndex: stepIndex },
                    lockedStepIndex: stepIndex,
                };
            }
            var refreshed = refreshLockedGuidanceUrgency(
                lockedData,
                distance,
                opts.maneuver,
                opts.roundaboutExitCount || 0
            );
            return {
                action: 'use-locked',
                guidance: refreshed,
                lockedGuidance: { data: lockedData, lockedStepIndex: stepIndex },
                lockedStepIndex: stepIndex,
            };
        }

        if (distance <= LANE_LOCK_DISTANCE_M && newGuidance && shouldShow(newGuidance)) {
            return {
                action: 'lock',
                guidance: newGuidance,
                lockedGuidance: { data: newGuidance, lockedStepIndex: stepIndex },
                lockedStepIndex: stepIndex,
            };
        }

        return {
            action: 'update',
            guidance: newGuidance,
            lockedGuidance: locked,
            lockedStepIndex: opts.lockedStepIndex != null ? opts.lockedStepIndex : -1,
        };
    }

    /**
     * Recompute urgency fields for locked guidance while keeping lane selection stable.
     * @param {Object} locked
     * @param {number} distance
     * @param {string} maneuver
     * @param {number} exitCount
     * @returns {Object|null}
     */
    function refreshLockedGuidanceUrgency(locked, distance, maneuver, exitCount) {
        if (!locked) return null;
        var lanes = getRecommendedLaneNumbers(locked);
        var lanePos = laneNameFor(lanes[0] || locked.recommended_lane || 1, locked.total_lanes);
        return Object.assign({}, locked, laneUrgencyFields(distance, lanePos, maneuver, exitCount));
    }

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

        maneuver = normalizeLaneManeuverForUK(maneuver, roadType, totalLanes);

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
            recommended_lanes: [lane],
            lane_arrows: lane_arrows, next_maneuver: maneuver,
            road_name: '', highway_type: roadType || 'unknown',
            has_osm_data: false, has_turn_lanes: false, roundabout_exit_count: exitCount,
            estimated: true, source: 'estimated', confidence: 0, show_lane_guidance: false
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
        if (!data || data.total_lanes <= 1 || data.urgency === 'none') return false;
        if (data.show_lane_guidance === false) return false;
        if ((data.confidence || 0) < LANE_CONFIDENCE_DISPLAY_MIN) return false;
        if (getRecommendedLaneNumbers(data).length === 0) return false;
        return true;
    }

    /**
     * The "Estimated" badge state for non-OSM (fallback) guidance.
     * @returns {{ text: string, visible: boolean }}
     */
    function badge(data) {
        if (data && (data.has_osm_data || data.has_routing_lanes || data.source === 'routing' || data.source === 'osm_turn_lanes')) {
            return { text: '', visible: false };
        }
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
        var recommendedSet = getRecommendedLaneNumbers(data);
        var out = [];
        for (var i = 0; i < total; i++) {
            var laneNum = i + 1;
            var arrowInfo = laneArrows[i];
            out.push({
                arrow: arrowInfo ? arrowInfo.arrow : '↑',
                recommended: recommendedSet.indexOf(laneNum) >= 0,
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
     * Distance (m) from current position to the next maneuver shape index.
     * Prefers along-route distance when snap helpers are provided (accurate on curves);
     * falls back to crow-flies otherwise.
     * @param {number} lat
     * @param {number} lon
     * @param {Array<Object>|null|undefined} routeSteps
     * @param {number} currentStepIndex
     * @param {Array<[number,number]>|null|undefined} routePolyline
     * @param {function(number,number,number,number): number} calculateDistance
     * @param {Object} [opts]
     * @param {function(number,number,Array,number): {index:number,t?:number}} [opts.snapToRoutePolyline]
     * @param {function(Array, Object, number): number} [opts.distanceAlongRouteToVertexMeters]
     * @param {number} [opts.searchStartIndex]
     * @returns {number}
     */
    function computeDistanceToManeuverMeters(lat, lon, routeSteps, currentStepIndex, routePolyline, calculateDistance, opts) {
        if (!routeSteps || !routePolyline || routeSteps.length === 0) return 9999;
        if (currentStepIndex >= routeSteps.length) return 9999;
        var nextStep = routeSteps[currentStepIndex];
        if (!nextStep) return 9999;
        var shapeIdx = nextStep.begin_shape_index || 0;
        if (shapeIdx >= routePolyline.length) return 9999;
        opts = opts || {};
        if (typeof opts.snapToRoutePolyline === 'function'
                && typeof opts.distanceAlongRouteToVertexMeters === 'function') {
            var snap = opts.snapToRoutePolyline(
                lat,
                lon,
                routePolyline,
                opts.searchStartIndex || 0
            );
            if (snap) {
                return opts.distanceAlongRouteToVertexMeters(routePolyline, snap, shapeIdx);
            }
        }
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
        var roadType = opts.roadType || 'unknown';
        var estimatedLanes = LANE_DEFAULTS[roadType] || 2;
        var maneuver = normalizeLaneManeuverForUK(
            opts.maneuver,
            roadType,
            estimatedLanes
        );

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
            maneuver: maneuver,
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
            opts.calculateDistance,
            {
                snapToRoutePolyline: opts.snapToRoutePolyline,
                distanceAlongRouteToVertexMeters: opts.distanceAlongRouteToVertexMeters,
                searchStartIndex: opts.lastSnappedRouteIndex || 0,
            }
        );

        var statePatch = {
            lastFetch: now,
            lastManeuver: maneuver,
            lastPosition: { lat: opts.lat, lon: opts.lon },
        };

        var cacheKey = buildLaneGuidanceCacheKey(
            maneuver,
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
                    laneUrgencyFields(distToManeuver, lanePos, maneuver, roundaboutExitCount)
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
                maneuver: maneuver,
                distance: distToManeuver,
                roadType: roadType,
                roundaboutExitCount: roundaboutExitCount,
            }),
            timeoutMs: LANE_GUIDANCE_FETCH_TIMEOUT_MS,
            distToManeuver: distToManeuver,
            roadType: roadType,
            roundaboutExitCount: roundaboutExitCount,
            maneuver: maneuver,
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
     * Apply plan for lane-guidance fetch tick state patches and next action.
     * @param {Object|null|undefined} tick - from buildLaneGuidanceFetchTickPlan
     * @returns {Object}
     */
    function buildLaneGuidanceFetchStateApplyPlan(tick) {
        if (!tick || tick.action === 'skip') {
            return { action: 'skip', reason: tick && tick.reason };
        }
        var apply = {
            action: 'apply',
            kind: tick.action,
            statePatch: tick.statePatch || {},
        };
        if (tick.action === 'render-cached') {
            apply.renderPayload = tick.renderPayload;
        }
        if (tick.action === 'fetch') {
            apply.fetch = {
                url: tick.url,
                timeoutMs: tick.timeoutMs,
                cacheKey: tick.cacheKey,
                maneuver: tick.maneuver,
                distToManeuver: tick.distToManeuver,
                roundaboutExitCount: tick.roundaboutExitCount,
                roadType: tick.roadType,
            };
        }
        return apply;
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
     * DOM apply plan for lane guidance overlay (app performs element mutations).
     * @param {Object} data
     * @param {string} [lastVoiceKey]
     * @returns {Object}
     */
    function buildLaneGuidanceDomApplyPlan(data, lastVoiceKey) {
        var uiPlan = buildLaneGuidanceUiApplyPlan(data);
        if (!uiPlan.visible) {
            return { action: 'hide' };
        }

        var indicators = (uiPlan.indicators || []).map(function (ind) {
            var cls = 'lane-indicator';
            if (ind.recommended) cls += ' recommended';
            if (ind.hasDirection) cls += ' has-direction';
            return {
                className: cls,
                innerHtml: buildLaneIndicatorHtml(ind.arrow),
            };
        });

        return {
            action: 'show',
            displayClassName: uiPlan.displayClassName,
            urgencyClass: uiPlan.urgencyClass,
            badge: uiPlan.badge,
            indicators: indicators,
            guidanceText: uiPlan.guidanceText,
            voicePlan: buildLaneVoiceAnnouncementPlan(data, lastVoiceKey),
        };
    }

    /**
     * DOM state apply plan for lane guidance overlay mutations.
     * @param {Object|null|undefined} domPlan - from buildLaneGuidanceDomApplyPlan
     * @param {Object} [opts]
     * @param {boolean} [opts.voiceEnabled]
     * @returns {Object}
     */
    function buildLaneGuidanceDomStateApplyPlan(domPlan, opts) {
        opts = opts || {};
        if (!domPlan || domPlan.action === 'hide') {
            return { action: 'hide' };
        }
        var voice = null;
        if (opts.voiceEnabled && domPlan.voicePlan) {
            voice = {
                message: domPlan.voicePlan.message,
                priority: domPlan.voicePlan.priority,
                announceKey: domPlan.voicePlan.announceKey,
            };
        }
        return {
            action: 'show',
            displayClassName: domPlan.displayClassName,
            urgencyClass: domPlan.urgencyClass || null,
            badge: domPlan.badge || null,
            indicators: domPlan.indicators || [],
            guidanceText: domPlan.guidanceText || '',
            voice: voice,
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
        var lanes = getRecommendedLaneNumbers(data);
        if (lanes.length === 0 || data.total_lanes <= 1) return null;
        if ((data.confidence || 0) < LANE_CONFIDENCE_DISPLAY_MIN) return null;
        var announceKey = 'lane_' + data.next_maneuver + '_' + lanes.join('-') + '_' + data.urgency;
        if (announceKey === lastAnnounceKey) return null;

        var lanePos;
        if (lanes.length > 1) {
            lanePos = lanes.map(function (ln) {
                return resolveLanePositionLabel(ln, data.total_lanes);
            }).join(' or ');
        } else {
            lanePos = resolveLanePositionLabel(lanes[0], data.total_lanes);
        }
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

        return { announceKey: announceKey, message: laneMsg, priority: priority         };
    }

    /**
     * Outcome plan after lane-guidance API response or error (cache + render payload).
     * @param {Object} opts
     * @returns {Object}
     */
    function buildLaneGuidanceFetchOutcomePlan(opts) {
        opts = opts || {};
        var now = opts.now != null ? opts.now : Date.now();
        var maneuver = opts.maneuver || 'straight';
        var dist = opts.distToManeuver != null ? opts.distToManeuver : 9999;
        var exitCount = opts.roundaboutExitCount || 0;
        var roadType = opts.roadType || 'unknown';

        var hybrid = buildHybridLaneGuidance({
            routingManeuverLanes: opts.routingManeuverLanes,
            apiData: opts.apiSuccess ? opts.apiData : null,
            maneuver: maneuver,
            distanceToManeuver: dist,
            roundaboutExitCount: exitCount,
            roadType: roadType,
        });

        if (opts.apiSuccess && opts.apiData) {
            return {
                action: 'cache-and-render',
                cacheEntry: { data: hybrid, ts: now, fallback: false },
                renderData: hybrid,
            };
        }

        var reason = opts.errorReason || 'no data';
        return {
            action: 'fallback',
            cacheEntry: { data: hybrid, ts: now, fallback: true },
            renderData: hybrid,
            warnLine: '[Lane Guidance] using deterministic fallback: ' + reason,
        };
    }

    var api = {
        ARROW: ARROW,
        LANE_DEFAULTS: LANE_DEFAULTS,
        LANE_CONFIDENCE_DISPLAY_MIN: LANE_CONFIDENCE_DISPLAY_MIN,
        LANE_CONFIDENCE_HIGH: LANE_CONFIDENCE_HIGH,
        LANE_LOCK_DISTANCE_M: LANE_LOCK_DISTANCE_M,
        LANE_LOCK_UPGRADE_DELTA: LANE_LOCK_UPGRADE_DELTA,
        isMotorwayRoadType: isMotorwayRoadType,
        extractRoutingLaneGuidance: extractRoutingLaneGuidance,
        scoreApiLaneGuidanceConfidence: scoreApiLaneGuidanceConfidence,
        scoreEstimatedLaneConfidence: scoreEstimatedLaneConfidence,
        isLaneGuidanceValuableManeuver: isLaneGuidanceValuableManeuver,
        getRecommendedLaneNumbers: getRecommendedLaneNumbers,
        estimateCandidateLanesUK: estimateCandidateLanesUK,
        enrichGuidanceWithRecommendedLanes: enrichGuidanceWithRecommendedLanes,
        applyConfidenceLaneSelection: applyConfidenceLaneSelection,
        buildHybridLaneGuidance: buildHybridLaneGuidance,
        buildLaneGuidanceStabilityPlan: buildLaneGuidanceStabilityPlan,
        refreshLockedGuidanceUrgency: refreshLockedGuidanceUrgency,
        normalizeLaneManeuverForUK: normalizeLaneManeuverForUK,
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
        buildLaneGuidanceFetchStateApplyPlan: buildLaneGuidanceFetchStateApplyPlan,
        buildLaneGuidanceFetchOutcomePlan: buildLaneGuidanceFetchOutcomePlan,
        buildLaneGuidanceCacheKey: buildLaneGuidanceCacheKey,
        buildLaneGuidanceApiUrl: buildLaneGuidanceApiUrl,
        getLaneGuidanceCacheTtlMs: getLaneGuidanceCacheTtlMs,
        isLaneGuidanceCacheEntryFresh: isLaneGuidanceCacheEntryFresh,
        buildLaneGuidanceUiApplyPlan: buildLaneGuidanceUiApplyPlan,
        buildLaneGuidanceDomApplyPlan: buildLaneGuidanceDomApplyPlan,
        buildLaneGuidanceDomStateApplyPlan: buildLaneGuidanceDomStateApplyPlan,
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

/**
 * @file Pure turn-by-turn instruction helpers (icon, direction, phrasing, distance).
 * @module modules/navigation/turn-instructions
 *
 * These are small, side-effect-free functions extracted from the voyagr-app.js monolith
 * so they can be unit-tested for real and shared with the classic (non-module) app script
 * via the `VoyagrTurnInstructions` global. The monolith delegates to these with an inline
 * fallback, so navigation still works if this script fails to load.
 *
 * Conventions encoded here (must match the app's behaviour):
 *   - Valhalla maneuver `type` integers map to direction keys / arrow glyphs.
 *   - The slight-vs-full turn boundary is 35 degrees of bearing change (gentle motorway
 *     forks stay "slight/keep"; a genuine turn onto a slip/side road is a "turn").
 *   - "slight_left"/"slight_right" are phrased as "keep left"/"keep right".
 */
(function (root) {
    'use strict';

    /**
     * Classify the bearing change between two segments into a direction key.
     * @param {number} bearing1 - Incoming bearing (degrees).
     * @param {number} bearing2 - Outgoing bearing (degrees).
     * @returns {string} One of sharp_left|left|slight_left|straight|slight_right|right|sharp_right.
     */
    function calculateTurnDirection(bearing1, bearing2) {
        let bearingChange = bearing2 - bearing1;

        // Normalize to -180 to 180 range
        if (bearingChange > 180) bearingChange -= 360;
        if (bearingChange < -180) bearingChange += 360;

        if (bearingChange < -135) return 'sharp_left';
        if (bearingChange < -35) return 'left';
        if (bearingChange < -10) return 'slight_left';
        if (bearingChange <= 10) return 'straight';
        if (bearingChange <= 35) return 'slight_right';
        if (bearingChange <= 135) return 'right';
        return 'sharp_right';
    }

    /**
     * Map a Valhalla maneuver type to a turn-by-turn direction key, or null when it is not
     * an announceable maneuver (start / continue / straight / ramp-straight / stay-straight).
     * @param {number} type - Valhalla maneuver type.
     * @returns {string|null}
     */
    function maneuverTypeToDirectionKey(type) {
        if ([4, 5, 6].includes(type)) return 'destination';
        if (type === 9 || type === 18 || type === 23) return 'slight_right';
        if (type === 10) return 'right';
        if (type === 11) return 'sharp_right';
        if (type === 16 || type === 19 || type === 24) return 'slight_left';
        if (type === 15) return 'left';
        if (type === 14) return 'sharp_left';
        if (type === 12 || type === 13) return 'uturn';
        if (type === 20) return 'exit_right';
        if (type === 21) return 'exit_left';
        if (type === 25 || type === 35 || type === 36) return 'merge';
        if (type === 26 || type === 27) return 'roundabout';
        return null;  // 0,1,2,3,7,8,17,22 and transit/ferry types are not "turns"
    }

    /** AR overlay uses hyphenated direction keys. */
    var AR_DIRECTION_KEY_MAP = {
        9: 'slight-right', 18: 'slight-right', 23: 'slight-right',
        10: 'right',
        11: 'sharp-right',
        16: 'slight-left', 19: 'slight-left', 24: 'slight-left',
        15: 'left',
        14: 'sharp-left',
        12: 'u-turn', 13: 'u-turn',
        20: 'exit', 21: 'exit',
        26: 'roundabout', 27: 'roundabout',
        4: 'destination', 5: 'destination', 6: 'destination',
    };

    /**
     * Lane-guidance direction key (underscore); non-turn maneuvers => straight.
     * @param {number} type
     * @returns {string}
     */
    function maneuverTypeToLaneDirectionKey(type) {
        return maneuverTypeToDirectionKey(type) || 'straight';
    }

    /**
     * AR navigation arrow direction key (hyphenated).
     * @param {number} type
     * @returns {string}
     */
    function maneuverTypeToARDirectionKey(type) {
        return AR_DIRECTION_KEY_MAP[type] || 'straight';
    }

    // Valhalla maneuver type → arrow / icon glyph. Left maneuvers show left arrows, etc.
    var TURN_ICON_MAP = {
        0: '↑', 1: '↑', 2: '↑', 3: '↑',
        4: '🏁', 5: '🏁', 6: '🏁',
        7: '↑', 8: '↑',
        9: '↱', 10: '→', 11: '↳',
        12: '↩', 13: '↩',
        14: '↲', 15: '←', 16: '↰',
        17: '↑', 18: '↱', 19: '↰',
        20: '↗', 21: '↖',
        22: '↑', 23: '↱', 24: '↰',
        25: '⚙️', 26: '🔄', 27: '↗',
        28: '⛴️', 29: '🚗', 30: '🚇',
        31: '🚶', 32: '🚶', 33: '🚏', 34: '⛴️',
        35: '⚙️', 36: '⚙️'
    };

    /**
     * @param {number} type - Valhalla maneuver type.
     * @returns {string} Arrow / icon glyph (defaults to straight arrow).
     */
    function getTurnIcon(type) {
        return TURN_ICON_MAP[type] || '↑';
    }

    /**
     * Format a distance for the turn widget using the user's preferred units.
     * @param {number} distanceMeters - Distance in meters.
     * @param {string} [distanceUnit] - 'mi' for miles/feet, anything else => metric.
     * @returns {string}
     */
    function formatTurnDistance(distanceMeters, distanceUnit) {
        var useMiles = distanceUnit === 'mi';

        if (useMiles) {
            var miles = distanceMeters / 1609.34;
            if (miles < 0.1) {
                var feet = Math.round(distanceMeters * 3.28084);
                return feet + ' ft';
            } else if (miles < 1) {
                return ((miles * 5280 / 100).toFixed(0) * 100) + ' ft';
            } else {
                return miles.toFixed(1) + ' mi';
            }
        } else {
            if (distanceMeters < 100) {
                return Math.round(distanceMeters) + ' m';
            } else if (distanceMeters < 1000) {
                return (Math.round(distanceMeters / 10) * 10) + ' m';
            } else {
                return (distanceMeters / 1000).toFixed(1) + ' km';
            }
        }
    }

    var DIRECTION_TEXT_MAP = {
        'sharp_left': 'turn sharply left',
        'sharp-left': 'turn sharply left',
        'left': 'turn left',
        'slight_left': 'keep left',
        'slight-left': 'keep left',
        'straight': 'continue straight',
        'slight_right': 'keep right',
        'slight-right': 'keep right',
        'right': 'turn right',
        'sharp_right': 'turn sharply right',
        'sharp-right': 'turn sharply right',
        'uturn': 'make a U-turn',
        'u-turn': 'make a U-turn',
        'exit': 'take the exit',
        'exit_right': 'take the exit on the right',
        'exit-right': 'take the exit on the right',
        'exit_left': 'take the exit on the left',
        'exit-left': 'take the exit on the left',
        'merge': 'merge',
        'roundabout': 'enter the roundabout',
        'destination': 'arrive at your destination'
    };

    /**
     * @param {string} direction - A direction key (underscore or hyphen form).
     * @returns {string} Human/voice phrasing (defaults to 'continue').
     */
    function getTurnDirectionText(direction) {
        return DIRECTION_TEXT_MAP[direction] || 'continue';
    }

    function isMotorwayRoadClass(roadClass) {
        if (roadClass == null || roadClass === '') return false;
        var rc = String(roadClass).toLowerCase();
        return rc === 'motorway' || rc === 'motorway_link' || rc === 'trunk' || rc === 'trunk_link';
    }

    /**
     * Promote ramp/turn types to exit_left/exit_right when leaving a motorway/trunk.
     * @param {number} type - Valhalla maneuver type.
     * @param {string|null} direction - Base direction key from maneuverTypeToDirectionKey.
     * @param {string|null} roadClass - Valhalla road_class for the maneuver edge.
     * @returns {string|null}
     */
    function refineManeuverDirection(type, direction, roadClass) {
        if (!direction || !isMotorwayRoadClass(roadClass)) return direction;
        if (direction === 'exit_left' || direction === 'exit_right') return direction;

        if (type === 18 || type === 9 || type === 23 || type === 10) return 'exit_right';
        if (type === 19 || type === 16 || type === 24 || type === 15 || type === 14) return 'exit_left';
        return direction;
    }

    function ordinalExit(n) {
        var j = n % 10;
        var k = n % 100;
        if (j === 1 && k !== 11) return n + 'st';
        if (j === 2 && k !== 12) return n + 'nd';
        if (j === 3 && k !== 13) return n + 'rd';
        return n + 'th';
    }

    /**
     * Roundabout-specific phrasing (enter vs leave / exit count).
     * @param {number} valhallaType - 26 enter, 27 exit.
     * @param {number} [exitCount]
     * @returns {string}
     */
    function getRoundaboutDirectionText(valhallaType, exitCount) {
        var n = Number(exitCount) || 0;
        if (valhallaType === 27 && n > 0) {
            return 'take the ' + ordinalExit(n) + ' exit';
        }
        if (valhallaType === 26 && n > 0) {
            return 'at the roundabout, take the ' + ordinalExit(n) + ' exit';
        }
        return valhallaType === 27 ? 'leave the roundabout' : 'enter the roundabout';
    }

    /**
     * Widget/voice instruction line — prefer exit/keep phrasing over raw engine text.
     * @param {string} direction
     * @param {string} [rawInstruction]
     * @param {number} [valhallaType]
     * @param {number} [roundaboutExitCount]
     * @returns {string}
     */
    function buildTurnDisplayInstruction(direction, rawInstruction, valhallaType, roundaboutExitCount) {
        if (direction === 'roundabout') {
            return getRoundaboutDirectionText(valhallaType, roundaboutExitCount);
        }
        if (direction === 'exit' || direction === 'exit_left' || direction === 'exit_right'
            || direction === 'exit-left' || direction === 'exit-right') {
            return getTurnDirectionText(direction);
        }
        if (direction === 'slight_left' || direction === 'slight_right'
            || direction === 'slight-left' || direction === 'slight-right') {
            return getTurnDirectionText(direction);
        }
        if (rawInstruction && String(rawInstruction).trim()) {
            return String(rawInstruction).trim();
        }
        return getTurnDirectionText(direction || 'straight');
    }

    // ======================================================================
    // Ordinal helpers and lane-hint HTML (pure; extracted from voyagr-app.js)
    // ======================================================================

    /**
     * English ordinal for roundabout/exit numbering: 1st, 2nd, 3rd, 4th, 11th, 21st …
     * @param {number} n
     * @returns {string}
     */
    function ordinalEnglishExit(n) {
        var j = n % 10;
        var k = n % 100;
        if (j === 1 && k !== 11) return n + 'st';
        if (j === 2 && k !== 12) return n + 'nd';
        if (j === 3 && k !== 13) return n + 'rd';
        return n + 'th';
    }

    /**
     * English ordinal for lane numbering (1st, 2nd, 3rd, nth).
     * @param {number} n
     * @returns {string}
     */
    function laneOrdinalEnglish(n) {
        if (n === 1) return '1st';
        if (n === 2) return '2nd';
        if (n === 3) return '3rd';
        return n + 'th';
    }

    // Maneuver types that warrant a "Keep left" hint.
    var KEEP_LEFT_TYPES  = [16, 19, 21, 24, 36]; // slight/ramp/exit/stay/merge LEFT
    // Maneuver types that warrant a "Keep right" hint.
    var KEEP_RIGHT_TYPES = [9, 18, 20, 23, 35];  // slight/ramp/exit/stay/merge RIGHT

    /**
     * Build the lane-hint chip HTML for the next-turn widget (exit count badge, lane
     * position badge, and "Keep left/right" fallback when within 900 m).
     *
     * @param {object|null} maneuver - Valhalla maneuver object
     * @param {number} exitCount - Result of the caller's effectiveRoundaboutExitCount()
     * @param {number|null} distanceMeters - Current distance to this maneuver
     * @returns {string} HTML fragment (may be empty)
     */
    function buildTurnLaneHintHtml(maneuver, exitCount, distanceMeters) {
        if (!maneuver) return '';
        var mt = maneuver.type || 0;
        var chips = [];

        if ((mt === 26 || mt === 27) && exitCount > 0) {
            chips.push('<span class="lane-hint-chip">' + ordinalEnglishExit(exitCount) + ' exit</span>');
        }

        var lanes = maneuver.lanes;
        if (Array.isArray(lanes) && lanes.length > 1) {
            var idx = -1;
            for (var i = 0; i < lanes.length; i++) {
                if (lanes[i] && (lanes[i].active === true || lanes[i].active_indication === true)) { idx = i; break; }
            }
            if (idx < 0) {
                for (var ii = 0; ii < lanes.length; ii++) {
                    if (lanes[ii] && Array.isArray(lanes[ii].valid_indications) && lanes[ii].valid_indications.length > 0) { idx = ii; break; }
                }
            }
            if (idx >= 0) {
                chips.push('<span class="lane-hint-chip">' + laneOrdinalEnglish(idx + 1) + ' lane</span>');
            }
        }

        // Keep-hint: only for forks/keeps/ramps/exits — NOT hard turns (to avoid
        // "keep left" being shown alongside a "Turn left" instruction).
        var isKeep = KEEP_LEFT_TYPES.indexOf(mt) >= 0 || KEEP_RIGHT_TYPES.indexOf(mt) >= 0;
        if (isKeep && chips.length === 0 && typeof distanceMeters === 'number' && distanceMeters < 900) {
            if (KEEP_LEFT_TYPES.indexOf(mt) >= 0) {
                chips.push('<span class="lane-hint-chip">Keep left</span>');
            } else {
                chips.push('<span class="lane-hint-chip">Keep right</span>');
            }
        }
        return chips.join(' ');
    }

    var INSTRUCTIONS_EMPTY_HTML =
        '<div class="instruction-item"><div class="instruction-item-content"><div class="instruction-item-text">No instructions available</div></div></div>';

    /**
     * @param {boolean} isPassed
     * @param {boolean} isCurrent
     * @returns {string}
     */
    function buildInstructionStatusHtml(isPassed, isCurrent) {
        if (isPassed) return '<div class="instruction-item-status">✓ Passed</div>';
        if (isCurrent) return '<div class="instruction-item-status current-status">→ Next</div>';
        return '';
    }

    /**
     * @param {Object} opts
     * @returns {string}
     */
    function buildInstructionListItemHtml(opts) {
        opts = opts || {};
        var streetHtml = opts.streetName
            ? '<div class="instruction-item-street">' + opts.streetName + '</div>'
            : '';
        return (
            '<div class="' + (opts.itemClass || 'instruction-item') + '" data-step-index="' + opts.stepIndex + '" data-shape-index="' + opts.shapeIndex + '" onclick="previewInstructionOnMap(' + opts.stepIndex + ', ' + opts.shapeIndex + ')">' +
                '<div class="instruction-item-icon">' + (opts.icon || '') + '</div>' +
                '<div class="instruction-item-content">' +
                    '<div class="instruction-item-text">' + (opts.instruction || '') + (opts.exitBadge || '') + '</div>' +
                    streetHtml +
                    (opts.statusHtml || '') +
                '</div>' +
                '<div class="instruction-item-preview" title="Click to preview on map">👁️</div>' +
            '</div>'
        );
    }

    /**
     * Valhalla stores roundabout exit count on enter and/or exit maneuver — merge for UI/lane hints.
     * @param {Array<Object>|null|undefined} steps
     * @param {number} stepIndex
     * @returns {number}
     */
    function effectiveRoundaboutExitCountFromSteps(steps, stepIndex) {
        if (!steps || stepIndex == null || stepIndex < 0 || stepIndex >= steps.length) return 0;
        var s = steps[stepIndex];
        var n = Number(s.roundabout_exit_count) || 0;
        if (n > 0) return n;
        var mt = s.type || 0;
        if (mt === 26 && stepIndex + 1 < steps.length) {
            var next = steps[stepIndex + 1];
            if ((next.type || 0) === 27) return Number(next.roundabout_exit_count) || 0;
        }
        return 0;
    }

    /**
     * Initial turn-instruction widget payload when navigation starts without a live GPS fix.
     * @param {Array<Object>} steps
     * @param {number} stepIndex
     * @param {Array<[number,number]>} polyline
     * @param {Object} [opts]
     * @param {function(number,number,number,number): number} [opts.haversineDistanceMeters]
     * @param {function(Object): (string|null)} [opts.resolveRoadClass]
     * @returns {Object|null}
     */
    function buildNavStartTurnInstructionInit(steps, stepIndex, polyline, opts) {
        opts = opts || {};
        if (!steps || !steps.length || !polyline || !polyline.length) return null;
        var initIdx = Math.min(Math.max(0, stepIndex || 0), steps.length - 1);
        var step = steps[initIdx];
        var type = step.type || 0;
        var direction = maneuverTypeToDirectionKey(type) || 'straight';
        var roadClass = opts.resolveRoadClass ? opts.resolveRoadClass(step) : (step.road_class || null);
        direction = refineManeuverDirection(type, direction, roadClass);
        var firstManeuverIndex = step.begin_shape_index || 0;
        var distanceToFirst = step.distance || 0;
        if (firstManeuverIndex > 0 && firstManeuverIndex < polyline.length && opts.haversineDistanceMeters) {
            var startPoint = polyline[0];
            var firstManeuverPoint = polyline[firstManeuverIndex];
            distanceToFirst = opts.haversineDistanceMeters(
                startPoint[0], startPoint[1], firstManeuverPoint[0], firstManeuverPoint[1]
            );
        }
        return {
            distance: distanceToFirst,
            direction: direction,
            instruction: step.instruction || '',
            streetName: (step.street_names || [])[0] || '',
            maneuver: step,
            maneuverIndex: initIdx,
            valhallaType: type,
            roundabout_exit_count: effectiveRoundaboutExitCountFromSteps(steps, initIdx),
        };
    }

    /**
     * Full instructions-list HTML for the expanded turn-by-turn panel.
     * @param {Array<Object>} steps
     * @param {number} currentStepIndex
     * @param {Object} [opts]
     * @param {function(number): string} [opts.getTurnIcon]
     * @param {function(Array, number): number} [opts.effectiveRoundaboutExitCountFromSteps]
     * @returns {{ html: string, countText: string }}
     */
    function buildInstructionsListHtml(steps, currentStepIndex, opts) {
        opts = opts || {};
        if (!steps || !steps.length) {
            return { html: INSTRUCTIONS_EMPTY_HTML, countText: '0 steps' };
        }
        var getTurnIcon = opts.getTurnIcon || function () { return ''; };
        var roundaboutExit = opts.effectiveRoundaboutExitCountFromSteps || effectiveRoundaboutExitCountFromSteps;
        var html = '';
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            var isCurrent = i === currentStepIndex;
            var isPassed = i < currentStepIndex;
            var type = step.type || 0;
            var icon = getTurnIcon(type);
            var instruction = step.instruction || 'Continue';
            var streetNames = step.street_names || [];
            var streetName = streetNames.length > 0 ? streetNames.join(', ') : '';
            var shapeIndex = step.begin_shape_index || 0;
            var itemClass = 'instruction-item';
            if (isCurrent) itemClass += ' current';
            if (isPassed) itemClass += ' passed';
            var exitCt = roundaboutExit(steps, i);
            var exitBadge = ((type === 26 || type === 27) && exitCt > 0)
                ? ' <span class="lane-hint-chip" style="font-size:11px;vertical-align:middle;">' +
                    ordinalEnglishExit(exitCt) + ' exit</span>'
                : '';
            html += buildInstructionListItemHtml({
                itemClass: itemClass,
                stepIndex: i,
                shapeIndex: shapeIndex,
                icon: icon,
                instruction: instruction,
                exitBadge: exitBadge,
                streetName: streetName,
                statusHtml: buildInstructionStatusHtml(isPassed, isCurrent),
            });
        }
        return {
            html: html,
            countText: (steps.length - currentStepIndex) + ' of ' + steps.length + ' steps remaining',
        };
    }

    /**
     * First announceable maneuver after the current step, with along-route gap (m).
     * @param {Array<Object>} steps
     * @param {number} currentIndex
     * @param {Array<[number,number]>} polyline
     * @param {Object} [opts]
     * @param {function(Array, number, number): number} [opts.cumulativeDistanceBetweenVertices]
     * @param {function(Object, boolean): string} [opts.getManeuverStreetLabel]
     * @param {function(Object): (string|null)} [opts.resolveRoadClass]
     * @returns {Object|null}
     */
    function findFollowingManeuver(steps, currentIndex, polyline, opts) {
        opts = opts || {};
        if (!steps || currentIndex == null || currentIndex < 0) return null;
        var current = steps[currentIndex];
        if (!current) return null;
        var cumDist = opts.cumulativeDistanceBetweenVertices;
        var getStreetLabel = opts.getManeuverStreetLabel || function () { return ''; };
        var resolveRoadClass = opts.resolveRoadClass || function (s) { return s.road_class || null; };
        var currentShapeIdx = current.begin_shape_index || 0;
        for (var j = currentIndex + 1; j < steps.length; j++) {
            var m = steps[j];
            var type = m.type || 0;
            var baseDir = maneuverTypeToDirectionKey(type);
            if (!baseDir) continue;
            var dir = refineManeuverDirection(type, baseDir, resolveRoadClass(m));
            var targetIdx = m.begin_shape_index || 0;
            var gapMeters = cumDist ? cumDist(polyline, currentShapeIdx, targetIdx) : 0;
            if (!Number.isFinite(gapMeters)) gapMeters = 0;
            return {
                direction: dir,
                valhallaType: type,
                streetName: getStreetLabel(m, false),
                gapMeters: gapMeters,
                index: j,
                maneuver: m,
            };
        }
        return null;
    }

    /** Map direction keys (hyphen or underscore) to Valhalla maneuver types for icon lookup. */
    var DIRECTION_KEY_TO_VALHALLA_TYPE = {
        'left': 15,
        'right': 10,
        'slight-left': 16,
        'slight_left': 16,
        'slight-right': 9,
        'slight_right': 9,
        'sharp-left': 14,
        'sharp_left': 14,
        'sharp-right': 11,
        'sharp_right': 11,
        'u-turn': 12,
        'uturn': 12,
        'straight': 8,
        'exit': 20,
        'exit-right': 20,
        'exit_right': 20,
        'exit-left': 21,
        'exit_left': 21,
        'merge': 25,
        'roundabout': 26,
        'destination': 4,
    };

    var THEN_ROW_CURRENT_DISTANCE_MAX_M = 700;
    var THEN_ROW_FOLLOW_GAP_MAX_M = 900;
    var TURN_WIDGET_COUNTDOWN_MIN_M = 15;

    /**
     * Resolve Valhalla maneuver type for turn widget icon display.
     * @param {string} direction
     * @param {number|undefined} valhallaType
     * @returns {number}
     */
    function resolveTurnIconValhallaType(direction, valhallaType) {
        if (typeof valhallaType === 'number') return valhallaType;
        return DIRECTION_KEY_TO_VALHALLA_TYPE[direction] || 8;
    }

    /**
     * Display plan for the main next-turn widget row (values only; app writes DOM).
     * @param {Object|null} turnInfo
     * @param {string} distanceUnit
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildTurnWidgetRowDisplayPlan(turnInfo, distanceUnit, opts) {
        opts = opts || {};
        if (!turnInfo) {
            return {
                hasTurn: false,
                distanceText: 'Follow Route',
                instructionText: 'Continue on current road',
                streetVisible: false,
                streetText: '',
                iconType: 8,
                hintHtml: '',
                hintVisible: false,
                maneuverIndex: null,
                distance: null,
            };
        }

        var isContinue = turnInfo.direction === 'straight';
        var hasCountdown = turnInfo.distance != null && turnInfo.distance >= TURN_WIDGET_COUNTDOWN_MIN_M;
        var formattedDistance = formatTurnDistance(turnInfo.distance || 0, distanceUnit);
        var streetVisible = !!turnInfo.streetName;
        var streetText = streetVisible
            ? (isContinue ? 'on ' : 'onto ') + turnInfo.streetName
            : '';
        var hintHtml = '';
        var hintVisible = false;
        if (turnInfo.maneuver && turnInfo.maneuverIndex != null) {
            var exitCt = opts.roundaboutExitCount != null ? opts.roundaboutExitCount : 0;
            hintHtml = buildTurnLaneHintHtml(turnInfo.maneuver, exitCt, turnInfo.distance);
            hintVisible = !!hintHtml;
        }

        return {
            hasTurn: true,
            distanceText: hasCountdown ? 'In ' + formattedDistance : 'On',
            instructionText: buildTurnDisplayInstruction(
                turnInfo.direction,
                turnInfo.instruction,
                turnInfo.valhallaType,
                turnInfo.roundabout_exit_count
            ),
            streetVisible: streetVisible,
            streetText: streetText,
            iconType: resolveTurnIconValhallaType(turnInfo.direction, turnInfo.valhallaType),
            hintHtml: hintHtml,
            hintVisible: hintVisible,
            maneuverIndex: turnInfo.maneuverIndex,
            distance: turnInfo.distance,
        };
    }

    /**
     * Display plan for the advance "Then …" row beneath the main turn widget.
     * @param {number|null} maneuverIndex
     * @param {number|null} currentDistance
     * @param {Object|null} follow
     * @param {string} distanceUnit
     * @param {number} [roundaboutExitCount]
     * @returns {{ visible: boolean, icon?: string, text?: string }}
     */
    function buildThenRowDisplayPlan(maneuverIndex, currentDistance, follow, distanceUnit, roundaboutExitCount) {
        if (maneuverIndex == null || typeof currentDistance !== 'number'
            || currentDistance > THEN_ROW_CURRENT_DISTANCE_MAX_M) {
            return { visible: false };
        }
        if (!follow || follow.gapMeters > THEN_ROW_FOLLOW_GAP_MAX_M) {
            return { visible: false };
        }

        var label = getTurnDirectionText(follow.direction);
        label = label.charAt(0).toUpperCase() + label.slice(1);
        if (follow.direction === 'roundabout' && roundaboutExitCount > 0) {
            label = 'Roundabout, ' + ordinalEnglishExit(roundaboutExitCount) + ' exit';
        }
        var onto = follow.streetName ? ' onto ' + follow.streetName : '';
        var thenDistance = formatTurnDistance(follow.gapMeters, distanceUnit);
        return {
            visible: true,
            icon: getTurnIcon(follow.valhallaType),
            text: 'In ' + thenDistance + ' · ' + label + onto,
        };
    }

    /**
     * Max along-route distance (m) to surface an upcoming maneuver by direction type.
     * @param {string} direction
     * @returns {number}
     */
    function getTurnDetectionMaxDistanceMeters(direction) {
        var isExitDir = direction === 'exit' || direction === 'exit_right' || direction === 'exit_left';
        var isKeepDir = direction === 'slight_right' || direction === 'slight_left';
        var isRb = direction === 'roundabout';
        if (isExitDir) return 2500;
        if (isKeepDir) return 1500;
        if (isRb) return 900;
        return 750;
    }

    /**
     * Lock turn-detection progress forward so snap index never moves backward on curves.
     * @param {number} snapIndex
     * @param {number} lastIndex
     * @returns {{ userRouteIndex: number, lastTurnDetectRouteVertexIndex: number }}
     */
    function advanceMonotonicTurnDetectIndex(snapIndex, lastIndex) {
        var userRouteIndex = snapIndex;
        var nextLast = lastIndex;
        if (userRouteIndex < lastIndex) {
            userRouteIndex = lastIndex;
        } else {
            nextLast = userRouteIndex;
        }
        return {
            userRouteIndex: userRouteIndex,
            lastTurnDetectRouteVertexIndex: nextLast,
        };
    }

    /**
     * Find the next Valhalla maneuver within voice/widget detection range ahead of the user.
     * @param {Array<Object>} steps
     * @param {number} userRouteIndex
     * @param {Array<[number,number]>} polyline
     * @param {{ index: number, t?: number }} turnSnap
     * @param {Object} [opts]
     * @param {function(Array, Object, number): number} [opts.distanceAlongRouteToVertexMeters]
     * @param {function(Object, boolean): string} [opts.getManeuverStreetLabel]
     * @param {function(Object): (string|null)} [opts.resolveRoadClass]
     * @param {function(Array, number): number} [opts.effectiveRoundaboutExitCountFromSteps]
     * @returns {Object|null}
     */
    function findUpcomingManeuverTurn(steps, userRouteIndex, polyline, turnSnap, opts) {
        opts = opts || {};
        if (!steps || !steps.length || !polyline || !polyline.length) return null;
        var distAlong = opts.distanceAlongRouteToVertexMeters;
        var getStreetLabel = opts.getManeuverStreetLabel || function () { return ''; };
        var resolveRoadClass = opts.resolveRoadClass || function (s) { return s.road_class || null; };
        var roundaboutExit = opts.effectiveRoundaboutExitCountFromSteps || effectiveRoundaboutExitCountFromSteps;

        for (var i = 0; i < steps.length; i++) {
            var maneuver = steps[i];
            var maneuverShapeIndex = maneuver.begin_shape_index || 0;
            if (maneuverShapeIndex < userRouteIndex - 5) continue;

            var type = maneuver.type || 0;
            var direction = maneuverTypeToDirectionKey(type);
            if (direction === null) continue;
            direction = refineManeuverDirection(type, direction, resolveRoadClass(maneuver));

            var targetIndex = Math.min(maneuverShapeIndex, polyline.length - 1);
            var distanceToManeuver = distAlong ? distAlong(polyline, turnSnap, targetIndex) : 0;
            var maxDetectionDistance = getTurnDetectionMaxDistanceMeters(direction);

            if (distanceToManeuver <= maxDetectionDistance) {
                return {
                    stepIndex: i,
                    distance: distanceToManeuver,
                    direction: direction,
                    streetName: getStreetLabel(maneuver, false),
                    instruction: maneuver.instruction || maneuver.verbal_pre_transition_instruction || '',
                    verbal_transition_alert_instruction: maneuver.verbal_transition_alert_instruction || '',
                    verbal_pre_transition_instruction: maneuver.verbal_pre_transition_instruction || '',
                    verbal_post_transition_instruction: maneuver.verbal_post_transition_instruction || '',
                    roundabout_exit_count: roundaboutExit(steps, i),
                    maneuver: maneuver,
                    maneuverIndex: i,
                    valhallaType: type,
                };
            }
            if (distanceToManeuver > maxDetectionDistance) break;
        }
        return null;
    }

    /**
     * Geometry-only turn detection when a route has no Valhalla maneuvers.
     * Scans polyline bearing changes ahead of the snapped position.
     * @param {Array<[number,number]>} polyline
     * @param {{ index: number, t?: number }} turnSnap
     * @param {number} closestIndex
     * @param {Object} [opts]
     * @param {function(number,number,number,number): number} [opts.bearing]
     * @param {function(number,number): string} [opts.calculateTurnDirection]
     * @param {function(Array, Object, number): number} [opts.distanceAlongRouteToVertexMeters]
     * @returns {Object|null}
     */
    function findGeometryFallbackTurn(polyline, turnSnap, closestIndex, opts) {
        opts = opts || {};
        if (!polyline || polyline.length < 2) return null;
        var bearing = opts.bearing;
        var calcTurnDir = opts.calculateTurnDirection;
        var distAlong = opts.distanceAlongRouteToVertexMeters;

        var nextTurnIndex = null;
        var maxBearingChange = 0;
        var currentBearing = null;
        if (closestIndex < polyline.length - 1 && bearing) {
            var currPoint = polyline[closestIndex];
            var nextPoint = polyline[closestIndex + 1];
            currentBearing = bearing(currPoint[0], currPoint[1], nextPoint[0], nextPoint[1]);
        }

        var scanDistance = Math.min(50, polyline.length - closestIndex - 1);
        for (var i = closestIndex + 2; i < closestIndex + scanDistance; i++) {
            if (i >= polyline.length) break;
            var prevPoint = polyline[i - 1];
            var currPt = polyline[i];
            if (!bearing) continue;
            var segBearing = bearing(prevPoint[0], prevPoint[1], currPt[0], currPt[1]);
            if (currentBearing !== null) {
                var bearingChange = segBearing - currentBearing;
                if (bearingChange > 180) bearingChange -= 360;
                if (bearingChange < -180) bearingChange += 360;
                if (Math.abs(bearingChange) > 10 && Math.abs(bearingChange) > maxBearingChange) {
                    maxBearingChange = Math.abs(bearingChange);
                    nextTurnIndex = i;
                }
            }
        }

        if (nextTurnIndex === null) {
            nextTurnIndex = Math.min(closestIndex + 5, polyline.length - 1);
        }
        if (nextTurnIndex === closestIndex || nextTurnIndex === closestIndex + 1) {
            return null;
        }

        var nextTurnPoint = polyline[nextTurnIndex];
        var distanceToTurn = distAlong ? distAlong(polyline, turnSnap, nextTurnIndex) : 0;
        var turnDirection = 'straight';
        if (closestIndex > 0 && nextTurnIndex < polyline.length - 1 && bearing && calcTurnDir) {
            var prevPt = polyline[Math.max(0, closestIndex - 1)];
            var currPt2 = polyline[closestIndex];
            var nextPt = polyline[nextTurnIndex];
            var bearing1 = bearing(prevPt[0], prevPt[1], currPt2[0], currPt2[1]);
            var bearing2 = bearing(currPt2[0], currPt2[1], nextPt[0], nextPt[1]);
            turnDirection = calcTurnDir(bearing1, bearing2);
        }

        return {
            distance: distanceToTurn,
            lat: nextTurnPoint[0],
            lon: nextTurnPoint[1],
            index: nextTurnIndex,
            direction: turnDirection,
            streetName: '',
        };
    }

    var BETWEEN_TURN_MIN_DISTANCE_M = 15;

    /**
     * Display payload for the turn widget from a detected turn.
     * @param {Object|null} turnInfo
     * @returns {Object|null}
     */
    function buildTurnWidgetDisplayPayloadFromTurnInfo(turnInfo) {
        if (!turnInfo) return null;
        return {
            distance: turnInfo.distance,
            direction: turnInfo.direction,
            instruction: turnInfo.instruction || '',
            streetName: turnInfo.streetName || '',
            maneuver: turnInfo.maneuver,
            maneuverIndex: turnInfo.maneuverIndex,
            valhallaType: turnInfo.valhallaType,
        };
    }

    /**
     * Full turn-detection tick plan: snap, monotonic index, maneuver or geometry fallback.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildDetectUpcomingTurnTickPlan(opts) {
        opts = opts || {};
        if (!opts.routeInProgress || !opts.routePolyline || !opts.routePolyline.length) {
            return { action: 'skip', reason: 'no-route' };
        }
        if (typeof opts.snapToRoutePolyline !== 'function') {
            return { action: 'skip', reason: 'no-snap' };
        }

        var turnSnap = opts.snapToRoutePolyline(
            opts.userLat,
            opts.userLon,
            opts.routePolyline,
            opts.lastTurnDetectRouteVertexIndex
        );
        var indexPlan = advanceMonotonicTurnDetectIndex(
            turnSnap.index,
            opts.lastTurnDetectRouteVertexIndex
        );

        var steps = opts.routeSteps;
        var detected = null;

        if (steps && steps.length > 0) {
            detected = findUpcomingManeuverTurn(
                steps,
                indexPlan.userRouteIndex,
                opts.routePolyline,
                turnSnap,
                {
                    distanceAlongRouteToVertexMeters: opts.distanceAlongRouteToVertexMeters,
                    getManeuverStreetLabel: opts.getManeuverStreetLabel,
                    resolveRoadClass: opts.resolveRoadClass,
                    effectiveRoundaboutExitCountFromSteps: opts.effectiveRoundaboutExitCountFromSteps,
                }
            );
        } else {
            detected = findGeometryFallbackTurn(
                opts.routePolyline,
                turnSnap,
                indexPlan.lastTurnDetectRouteVertexIndex,
                {
                    bearing: opts.bearing,
                    calculateTurnDirection: calculateTurnDirection,
                    distanceAlongRouteToVertexMeters: opts.distanceAlongRouteToVertexMeters,
                }
            );
        }

        var plan = {
            action: detected ? 'detected' : 'none',
            turnInfo: detected,
            statePatch: {
                lastTurnDetectRouteVertexIndex: indexPlan.lastTurnDetectRouteVertexIndex,
            },
            persistRoute: !!detected,
            logLine: null,
        };

        if (detected) {
            if (detected.stepIndex != null) {
                plan.statePatch.currentStepIndex = detected.stepIndex;
            }
            var shapeIdx = (detected.maneuver && detected.maneuver.begin_shape_index) || 0;
            plan.logLine = '[Turn] Detected: ' + detected.direction + ' in ' +
                detected.distance.toFixed(0) + 'm (type=' + detected.valhallaType +
                ', step=' + detected.stepIndex + ', shapeIdx=' + shapeIdx + ')';
        }

        return plan;
    }

    /**
     * Turn widget tick plan: show detected turn, between-turn continue, or clear.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildTurnWidgetTickPlan(opts) {
        opts = opts || {};
        if (!opts.routeInProgress || !opts.routeSteps || !opts.routeSteps.length) {
            return { action: 'skip', reason: 'no-route' };
        }
        if (!opts.routePolyline || opts.routePolyline.length < 2) {
            return { action: 'skip', reason: 'no-polyline' };
        }

        if (opts.turnInfo) {
            return {
                action: 'show-turn',
                displayPayload: buildTurnWidgetDisplayPayloadFromTurnInfo(opts.turnInfo),
            };
        }

        var getActiveIdx = opts.getActiveRouteManeuverIndex;
        if (typeof getActiveIdx !== 'function') {
            return { action: 'clear' };
        }

        var activeIdx = getActiveIdx(opts.routeSteps, opts.lastSnappedRouteIndex);
        var activeM = (activeIdx >= 0 && activeIdx < opts.routeSteps.length)
            ? opts.routeSteps[activeIdx]
            : null;

        var buildBetween = opts.buildBetweenTurnDisplay;
        var betweenTurn = (typeof buildBetween === 'function')
            ? buildBetween(activeM, activeIdx, opts.currentRoadDisplayName)
            : null;

        if (!betweenTurn) {
            return { action: 'clear' };
        }

        var nextManeuver = (activeIdx >= 0 && activeIdx + 1 < opts.routeSteps.length)
            ? opts.routeSteps[activeIdx + 1]
            : null;

        if (nextManeuver &&
            typeof opts.snapToRoutePolyline === 'function' &&
            typeof opts.distanceAlongRouteToVertexMeters === 'function') {
            var snap = opts.snapToRoutePolyline(
                opts.lat,
                opts.lon,
                opts.routePolyline,
                opts.lastSnappedRouteIndex
            );
            var targetIdx = Math.min(
                nextManeuver.begin_shape_index || 0,
                opts.routePolyline.length - 1
            );
            var distToNext = opts.distanceAlongRouteToVertexMeters(
                opts.routePolyline,
                snap,
                targetIdx
            );
            if (Number.isFinite(distToNext) && distToNext >= BETWEEN_TURN_MIN_DISTANCE_M) {
                betweenTurn = Object.assign({}, betweenTurn, { distance: distToNext });
            }
        }

        return {
            action: 'show-between',
            displayPayload: betweenTurn,
        };
    }

    /**
     * Lane-guidance inputs for one GPS tick (maneuver direction + roundabout exits).
     * @param {Object} opts
     * @returns {Object}
     */
    function buildLaneGuidanceTickPlan(opts) {
        opts = opts || {};
        if (!opts.routeInProgress || !opts.routeSteps || opts.routeSteps.length === 0) {
            return { action: 'skip', reason: 'no-route' };
        }

        var stepIndex = opts.currentStepIndex != null ? opts.currentStepIndex : 0;
        var nextStep = opts.routeSteps[stepIndex];
        if (!nextStep) {
            return { action: 'skip', reason: 'no-step' };
        }

        var maneuverDir = maneuverTypeToLaneDirectionKey(nextStep.type || 0);
        var exitCount = 0;
        if (maneuverDir === 'roundabout') {
            exitCount = effectiveRoundaboutExitCountFromSteps(opts.routeSteps, stepIndex);
        }

        return {
            action: 'update',
            maneuverDir: maneuverDir,
            roundaboutExitCount: exitCount,
        };
    }

    var api = {
        BETWEEN_TURN_MIN_DISTANCE_M: BETWEEN_TURN_MIN_DISTANCE_M,
        buildTurnWidgetDisplayPayloadFromTurnInfo: buildTurnWidgetDisplayPayloadFromTurnInfo,
        buildDetectUpcomingTurnTickPlan: buildDetectUpcomingTurnTickPlan,
        buildTurnWidgetTickPlan: buildTurnWidgetTickPlan,
        buildLaneGuidanceTickPlan: buildLaneGuidanceTickPlan,
        calculateTurnDirection: calculateTurnDirection,
        maneuverTypeToDirectionKey: maneuverTypeToDirectionKey,
        maneuverTypeToLaneDirectionKey: maneuverTypeToLaneDirectionKey,
        maneuverTypeToARDirectionKey: maneuverTypeToARDirectionKey,
        getTurnIcon: getTurnIcon,
        formatTurnDistance: formatTurnDistance,
        getTurnDirectionText: getTurnDirectionText,
        isMotorwayRoadClass: isMotorwayRoadClass,
        refineManeuverDirection: refineManeuverDirection,
        getRoundaboutDirectionText: getRoundaboutDirectionText,
        buildTurnDisplayInstruction: buildTurnDisplayInstruction,
        ordinalEnglishExit: ordinalEnglishExit,
        laneOrdinalEnglish: laneOrdinalEnglish,
        buildTurnLaneHintHtml: buildTurnLaneHintHtml,
        INSTRUCTIONS_EMPTY_HTML: INSTRUCTIONS_EMPTY_HTML,
        buildInstructionStatusHtml: buildInstructionStatusHtml,
        buildInstructionListItemHtml: buildInstructionListItemHtml,
        effectiveRoundaboutExitCountFromSteps: effectiveRoundaboutExitCountFromSteps,
        buildNavStartTurnInstructionInit: buildNavStartTurnInstructionInit,
        buildInstructionsListHtml: buildInstructionsListHtml,
        findFollowingManeuver: findFollowingManeuver,
        DIRECTION_KEY_TO_VALHALLA_TYPE: DIRECTION_KEY_TO_VALHALLA_TYPE,
        THEN_ROW_CURRENT_DISTANCE_MAX_M: THEN_ROW_CURRENT_DISTANCE_MAX_M,
        THEN_ROW_FOLLOW_GAP_MAX_M: THEN_ROW_FOLLOW_GAP_MAX_M,
        TURN_WIDGET_COUNTDOWN_MIN_M: TURN_WIDGET_COUNTDOWN_MIN_M,
        resolveTurnIconValhallaType: resolveTurnIconValhallaType,
        buildTurnWidgetRowDisplayPlan: buildTurnWidgetRowDisplayPlan,
        buildThenRowDisplayPlan: buildThenRowDisplayPlan,
        getTurnDetectionMaxDistanceMeters: getTurnDetectionMaxDistanceMeters,
        advanceMonotonicTurnDetectIndex: advanceMonotonicTurnDetectIndex,
        findUpcomingManeuverTurn: findUpcomingManeuverTurn,
        findGeometryFallbackTurn: findGeometryFallbackTurn,
        TURN_ICON_MAP: TURN_ICON_MAP,
        DIRECTION_TEXT_MAP: DIRECTION_TEXT_MAP
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Namespace global for the classic browser script (voyagr-app.js). Intentionally does
    // NOT expose bare function names, to avoid clobbering the monolith's own declarations.
    root.VoyagrTurnInstructions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

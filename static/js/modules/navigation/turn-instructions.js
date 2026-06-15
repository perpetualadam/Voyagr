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

    var api = {
        calculateTurnDirection: calculateTurnDirection,
        maneuverTypeToDirectionKey: maneuverTypeToDirectionKey,
        getTurnIcon: getTurnIcon,
        formatTurnDistance: formatTurnDistance,
        getTurnDirectionText: getTurnDirectionText,
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

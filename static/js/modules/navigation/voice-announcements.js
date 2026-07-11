/**
 * @file Pure voice-announcement text builders (turn / exit / keep / destination phrasing).
 * @module modules/navigation/voice-announcements
 *
 * These are side-effect-free string builders extracted from the voyagr-app.js monolith so
 * they can be unit-tested for real and shared with the classic (non-module) app script via
 * the `VoyagrVoiceAnnouncements` global. The monolith delegates to these with an inline
 * fallback, so spoken guidance still works if this script fails to load.
 *
 * Conventions encoded here (must match the app's behaviour):
 *   - Turn announcements fire at 4 distance thresholds; exits and gentle "keep" forks get
 *     earlier warnings at motorway speed (different threshold sets / wording).
 *   - Valhalla's own verbal phrasing (verbal_transition_alert_instruction / verbal_pre_
 *     transition_instruction) is preferred at the alert and most-imminent thresholds when
 *     present; otherwise a distance-based phrase is synthesised.
 *   - Street names join with " toward " for exits/keeps and " onto " for plain turns.
 *   - Imperial ("mi") vs metric wording is hard-coded per threshold to read naturally
 *     (e.g. "In 1600 feet" vs "In 500 meters") rather than mechanically converted.
 */
(function (root) {
    'use strict';

    /**
     * @param {string} direction - A direction key (underscore or hyphen form).
     * @returns {boolean} True for exit-ramp maneuvers.
     */
    function isExitDirection(direction) {
        return direction === 'exit' || direction === 'exit_right' || direction === 'exit_left'
            || direction === 'exit-right' || direction === 'exit-left';
    }

    /**
     * @param {string} direction - A direction key (underscore or hyphen form).
     * @returns {boolean} True for gentle "keep left/right" fork/veer maneuvers.
     */
    function isKeepDirection(direction) {
        return direction === 'slight_right' || direction === 'slight_left'
            || direction === 'slight-right' || direction === 'slight-left';
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
     * Build the spoken phrase for an upcoming turn/exit/keep at a given threshold.
     * Returns '' when the threshold has no phrase (defensive — caller should only pass a
     * threshold from the relevant distance set).
     *
     * @param {object} opts
     * @param {number} opts.announcementDistance - The threshold (m) being announced.
     * @param {string} [opts.direction='straight'] - Direction key.
     * @param {string} [opts.distanceUnit] - 'mi' => imperial wording, else metric.
     * @param {string} [opts.streetName] - Optional street/road being joined onto.
     * @param {string} [opts.directionText='continue'] - Pre-computed turn phrasing
     *   (e.g. "turn left"); used for plain (non exit/keep) turns.
     * @param {string} [opts.verbalAlert] - Valhalla early alert phrasing, if any.
     * @param {string} [opts.verbalPre] - Valhalla immediate-prior phrasing, if any.
     * @returns {string}
     */
    function buildTurnAnnouncement(opts) {
        opts = opts || {};
        var announcementDistance = opts.announcementDistance;
        var direction = opts.direction || 'straight';
        var distanceUnit = opts.distanceUnit;
        var streetName = opts.streetName || '';
        var directionText = opts.directionText || 'continue';
        var verbalAlert = opts.verbalAlert || '';
        var verbalPre = opts.verbalPre || '';

        var isExit = isExitDirection(direction);
        var isKeep = isKeepDirection(direction);
        var message = '';
        // Exits and keeps join the next road with " toward "; plain turns use " onto ".
        var streetInfo = streetName ? ' toward ' + streetName : '';

        if (isExit) {
            var exitSide = (direction === 'exit_left' || direction === 'exit-left')
                ? ' on the left'
                : (direction === 'exit_right' || direction === 'exit-right') ? ' on the right' : '';
            if (announcementDistance === 2000) {
                message = distanceUnit === 'mi'
                    ? 'In about 1 mile, take the exit' + exitSide + streetInfo
                    : 'In 2 kilometers, take the exit' + exitSide + streetInfo;
            } else if (announcementDistance === 800) {
                message = distanceUnit === 'mi'
                    ? 'In half a mile, prepare to exit' + exitSide + streetInfo
                    : 'In 800 meters, prepare to exit' + exitSide + streetInfo;
            } else if (announcementDistance === 200) {
                message = 'Exit ahead' + exitSide + streetInfo;
            } else if (announcementDistance === 100) {
                message = 'Exit now' + exitSide + streetInfo;
            }
        } else if (direction === 'roundabout') {
            var rbExit = Number(opts.roundaboutExitCount) || 0;
            var rbType = Number(opts.valhallaType) || 26;
            var rbStreet = streetName ? ' onto ' + streetName : '';
            var exitPhrase = rbExit > 0
                ? 'take the ' + ordinalExit(rbExit) + ' exit'
                : (rbType === 27 ? 'leave the roundabout' : 'enter the roundabout');
            if (announcementDistance === 500) {
                if (verbalAlert) {
                    message = verbalAlert;
                } else {
                    message = distanceUnit === 'mi'
                        ? 'In 1600 feet, ' + exitPhrase + rbStreet
                        : 'In 500 meters, ' + exitPhrase + rbStreet;
                }
            } else if (announcementDistance === 200) {
                message = distanceUnit === 'mi'
                    ? 'In 600 feet, ' + exitPhrase + rbStreet
                    : 'In 200 meters, ' + exitPhrase + rbStreet;
            } else if (announcementDistance === 100) {
                message = verbalPre || (distanceUnit === 'mi'
                    ? 'In 300 feet, ' + exitPhrase + rbStreet
                    : 'In 100 meters, ' + exitPhrase + rbStreet);
            } else if (announcementDistance === 50) {
                message = verbalPre || (exitPhrase + rbStreet);
            }
        } else if (isKeep) {
            var keepDir = (direction === 'slight_left' || direction === 'slight-left') ? 'left' : 'right';
            if (announcementDistance === 1000) {
                if (verbalAlert) {
                    message = verbalAlert;
                } else {
                    message = distanceUnit === 'mi'
                        ? 'In half a mile, keep ' + keepDir + streetInfo
                        : 'In 1 kilometer, keep ' + keepDir + streetInfo;
                }
            } else if (announcementDistance === 400) {
                message = distanceUnit === 'mi'
                    ? 'In 1300 feet, keep ' + keepDir + streetInfo
                    : 'In 400 meters, keep ' + keepDir + streetInfo;
            } else if (announcementDistance === 150) {
                message = verbalPre || ('Keep ' + keepDir + streetInfo);
            } else if (announcementDistance === 50) {
                message = verbalPre || ('Keep ' + keepDir + ' now');
            }
        } else {
            var streetOnto = streetName ? ' onto ' + streetName : '';
            if (announcementDistance === 500) {
                if (verbalAlert) {
                    message = verbalAlert;
                } else {
                    message = distanceUnit === 'mi'
                        ? 'In 1600 feet, ' + directionText + streetOnto
                        : 'In 500 meters, ' + directionText + streetOnto;
                }
            } else if (announcementDistance === 200) {
                message = distanceUnit === 'mi'
                    ? 'In 600 feet, ' + directionText + streetOnto
                    : 'In 200 meters, ' + directionText + streetOnto;
            } else if (announcementDistance === 100) {
                if (verbalPre) {
                    message = verbalPre;
                } else {
                    message = distanceUnit === 'mi'
                        ? 'In 300 feet, ' + directionText + streetOnto
                        : 'In 100 meters, ' + directionText + streetOnto;
                }
            } else if (announcementDistance === 50) {
                message = verbalPre || (directionText + streetOnto);
            }
        }

        return message;
    }

    /**
     * Build the spoken phrase for a distance-to-destination milestone.
     * @param {number} announcementDistance - The milestone (m) being announced.
     * @param {string} [distanceUnit] - 'mi' => imperial wording, else the unit label (e.g. 'km').
     * @returns {string}
     */
    function buildDestinationAnnouncement(announcementDistance, distanceUnit) {
        var mi = distanceUnit === 'mi';
        if (announcementDistance === 10000) {
            return (mi ? (10 * 0.621371).toFixed(1) : '10') + ' ' + distanceUnit + ' to destination';
        }
        if (announcementDistance === 5000) {
            return (mi ? (5 * 0.621371).toFixed(1) : '5') + ' ' + distanceUnit + ' to destination';
        }
        if (announcementDistance === 2000) {
            return (mi ? (2 * 0.621371).toFixed(1) : '2') + ' ' + distanceUnit + ' to destination';
        }
        if (announcementDistance === 1000) {
            return (mi ? (1 * 0.621371).toFixed(1) : '1') + ' ' + distanceUnit + ' to destination';
        }
        if (announcementDistance === 500) {
            return mi ? '1600 feet to destination' : '500 meters to destination';
        }
        if (announcementDistance === 100) {
            return 'Arriving at destination';
        }
        return '';
    }

    /**
     * Scalar fields to reset when route geometry changes (Sets cleared separately in app).
     * @param {number} nowMs
     * @returns {Object}
     */
    function voiceAnnouncementStateResetValues(nowMs) {
        return {
            lastETAAnnouncementTime: nowMs,
            lastAnnouncedETA: null,
            lastDestinationAnnouncementDistance: Infinity,
            lastTurnDetectRouteVertexIndex: 0,
            initialETAMovementRetries: 0,
            voiceAnnouncedForManeuverIndex: null,
            voiceAnnouncedCategory: null,
            lastLaneVoiceKey: '',
        };
    }

    var api = {
        isExitDirection: isExitDirection,
        isKeepDirection: isKeepDirection,
        buildTurnAnnouncement: buildTurnAnnouncement,
        buildDestinationAnnouncement: buildDestinationAnnouncement,
        voiceAnnouncementStateResetValues: voiceAnnouncementStateResetValues,
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Namespace global for the classic browser script (voyagr-app.js). Intentionally does
    // NOT expose bare function names, to avoid clobbering the monolith's own declarations.
    root.VoyagrVoiceAnnouncements = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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
     * Voice category for threshold-set selection.
     * @param {string} direction
     * @returns {'exit'|'keep'|'turn'}
     */
    function resolveTurnAnnouncementCategory(direction) {
        if (isExitDirection(direction)) return 'exit';
        if (isKeepDirection(direction)) return 'keep';
        return 'turn';
    }

    /**
     * Distance thresholds for an upcoming maneuver direction.
     * @param {string} direction
     * @param {number[]} turnDistances
     * @param {number[]} exitDistances
     * @param {number[]} keepDistances
     * @returns {number[]}
     */
    function resolveAnnouncementDistancesForDirection(direction, turnDistances, exitDistances, keepDistances) {
        if (isExitDirection(direction)) return exitDistances;
        if (isKeepDirection(direction)) return keepDistances;
        return turnDistances;
    }

    /**
     * Distance past which announced thresholds reset for a maneuver category.
     * @param {string} direction
     * @returns {number}
     */
    function resolveThresholdResetDistance(direction) {
        if (isExitDirection(direction)) return 2500;
        if (isKeepDirection(direction)) return 1500;
        return 600;
    }

    /**
     * Pick the most-urgent unannounced threshold at the current distance.
     * @param {number} distanceMeters
     * @param {number[]} announcementDistances
     * @param {Set<number>} announcedSet
     * @returns {{ threshold: number, markPassed: number[] }|null}
     */
    function pickTurnAnnouncementThreshold(distanceMeters, announcementDistances, announcedSet) {
        if (!announcementDistances || !announcedSet) return null;
        var announcementDistance = null;
        for (var i = 0; i < announcementDistances.length; i++) {
            var d = announcementDistances[i];
            if (distanceMeters <= d && !announcedSet.has(d)) {
                announcementDistance = d;
            }
        }
        if (announcementDistance === null) return null;
        var markPassed = [];
        for (var j = 0; j < announcementDistances.length; j++) {
            var dd = announcementDistances[j];
            if (dd > announcementDistance && distanceMeters <= dd) {
                markPassed.push(dd);
            }
        }
        return { threshold: announcementDistance, markPassed: markPassed };
    }

    /**
     * Append chained "then …" phrasing at the most-imminent threshold.
     * @param {string} message
     * @param {number} announcementDistance
     * @param {number[]} announcementDistances
     * @param {Object|null} follow
     * @param {Object} [opts]
     * @param {function(string): string} [opts.getTurnDirectionText]
     * @param {function(number): number} [opts.effectiveRoundaboutExitCount]
     * @param {function(number): string} [opts.ordinalEnglishExit]
     * @returns {string}
     */
    function appendChainedFollowingManeuver(message, announcementDistance, announcementDistances, follow, opts) {
        if (!message || !follow || follow.gapMeters > 900) return message;
        if (!announcementDistances || announcementDistances.length === 0) return message;
        var isImminent = announcementDistance === announcementDistances[announcementDistances.length - 1];
        if (!isImminent) return message;
        opts = opts || {};
        var getText = opts.getTurnDirectionText || function () { return 'continue'; };
        var followText = getText(follow.direction);
        if (follow.direction === 'roundabout' && opts.effectiveRoundaboutExitCount && opts.ordinalEnglishExit) {
            var exitCt = opts.effectiveRoundaboutExitCount(follow.index);
            if (exitCt > 0) {
                followText = 'at the roundabout take the ' + opts.ordinalEnglishExit(exitCt) + ' exit';
            }
        }
        return message + ', then ' + followText;
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

    var DESTINATION_ANNOUNCEMENT_HYSTERESIS_M = 100;
    var DESTINATION_ANNOUNCEMENT_RESET_M = 11000;

    /**
     * Destination distance voice tick plan with hysteresis and far-range reset.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildDestinationAnnouncementTickPlan(opts) {
        opts = opts || {};
        if (!opts.routeInProgress || !opts.routePolylineLength || !opts.voiceAnnouncementsEnabled) {
            return { action: 'skip', reason: 'inactive' };
        }

        var remaining = opts.remainingDistanceM;
        var lastAnnounced = opts.lastDestinationAnnouncementDistance;
        var distances = opts.destinationDistances || [];

        for (var i = 0; i < distances.length; i++) {
            var announcementDistance = distances[i];
            if (remaining <= announcementDistance &&
                lastAnnounced > announcementDistance + DESTINATION_ANNOUNCEMENT_HYSTERESIS_M) {
                return {
                    action: 'announce',
                    announcementDistance: announcementDistance,
                    spokenMessage: buildDestinationAnnouncement(
                        announcementDistance,
                        opts.distanceUnit
                    ),
                    statePatch: { lastDestinationAnnouncementDistance: remaining },
                };
            }
        }

        if (remaining > DESTINATION_ANNOUNCEMENT_RESET_M) {
            return {
                action: 'reset',
                statePatch: { lastDestinationAnnouncementDistance: Infinity },
            };
        }

        return { action: 'none' };
    }

    /**
     * Apply plan for destination distance voice announcement state and speech.
     * @param {Object|null|undefined} tick - from buildDestinationAnnouncementTickPlan
     * @returns {Object}
     */
    function buildDestinationAnnouncementStateApplyPlan(tick) {
        if (!tick || tick.action === 'skip') {
            return { action: 'skip', reason: tick && tick.reason };
        }
        return {
            action: 'apply',
            kind: tick.action,
            statePatch: tick.statePatch || {},
            speak: tick.action === 'announce' && !!tick.spokenMessage,
            spokenMessage: tick.spokenMessage || null,
        };
    }

    /**
     * Turn voice announcement tick plan: threshold pick, message build, state patch hints.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildTurnAnnouncementTickPlan(opts) {
        opts = opts || {};
        if (!opts.turnInfo || !opts.voiceAnnouncementsEnabled) {
            return { action: 'skip', reason: 'disabled' };
        }

        var distance = opts.turnInfo.distance;
        if (typeof distance !== 'number' || isNaN(distance) || distance < 0) {
            return {
                action: 'skip',
                reason: 'invalid-distance',
                warnLine: '[Voice] Invalid turn distance: ' + distance,
            };
        }

        var direction = opts.turnInfo.direction || 'straight';
        var category = resolveTurnAnnouncementCategory(direction);
        var announcementDistances = resolveAnnouncementDistancesForDirection(
            direction,
            opts.turnDistances,
            opts.exitDistances,
            opts.keepDistances
        );

        var maneuverIdx = opts.turnInfo.maneuverIndex;
        var clearThresholds = maneuverIdx != null && (
            maneuverIdx !== opts.voiceAnnouncedForManeuverIndex ||
            category !== opts.voiceAnnouncedCategory
        );

        var announcedValues = clearThresholds
            ? []
            : (opts.announcedThresholdValues || []).slice();
        var announcedSet = new Set(announcedValues);

        var plan = {
            action: 'none',
            category: category,
            clearThresholds: clearThresholds,
            resetThresholds: false,
            resetCategory: null,
            statePatch: {},
            announcedThresholdValues: announcedValues,
        };

        if (clearThresholds) {
            plan.statePatch.voiceAnnouncedForManeuverIndex = maneuverIdx;
            plan.statePatch.voiceAnnouncedCategory = category;
        }

        var picked = pickTurnAnnouncementThreshold(distance, announcementDistances, announcedSet);
        if (picked) {
            for (var mp = 0; mp < picked.markPassed.length; mp++) {
                announcedSet.add(picked.markPassed[mp]);
            }

            var message = buildTurnAnnouncement({
                announcementDistance: picked.threshold,
                direction: direction,
                distanceUnit: opts.distanceUnit,
                streetName: opts.turnInfo.streetName || '',
                directionText: opts.directionText || 'continue',
                verbalAlert: (opts.turnInfo.verbal_transition_alert_instruction || '').trim(),
                verbalPre: (opts.turnInfo.verbal_pre_transition_instruction || '').trim(),
                valhallaType: opts.turnInfo.valhallaType,
                roundaboutExitCount: opts.turnInfo.roundabout_exit_count,
            });

            if (message && opts.followingManeuver) {
                message = appendChainedFollowingManeuver(
                    message,
                    picked.threshold,
                    announcementDistances,
                    opts.followingManeuver,
                    opts.chainAppendOpts || {}
                );
            }

            if (message) {
                announcedSet.add(picked.threshold);
                plan.action = 'announce';
                plan.speak = true;
                plan.speakPriority = 'high';
                plan.spokenMessage = message;
                plan.logLine = '[Voice] Announcing ' + category + ': ' + message +
                    ' (distance: ' + distance.toFixed(0) + 'm)';
            }

            plan.announcedThresholdValues = Array.from(announcedSet);
        }

        var resetDistance = resolveThresholdResetDistance(direction);
        if (distance > resetDistance) {
            plan.resetThresholds = true;
            plan.resetCategory = category;
        }

        return plan;
    }

    /**
     * Apply plan for turn voice announcement state patches and speech.
     * @param {Object|null|undefined} tick - from buildTurnAnnouncementTickPlan
     * @returns {Object}
     */
    function buildTurnAnnouncementStateApplyPlan(tick) {
        if (!tick || tick.action === 'skip') {
            return {
                action: 'skip',
                warnLine: tick && tick.warnLine,
            };
        }
        return {
            action: 'apply',
            category: tick.category,
            clearThresholds: !!tick.clearThresholds,
            statePatch: tick.statePatch || {},
            announcedThresholdValues: tick.announcedThresholdValues || null,
            speak: !!(tick.speak && tick.spokenMessage),
            spokenMessage: tick.spokenMessage || null,
            speakPriority: tick.speakPriority || 'high',
            logLine: tick.logLine || null,
            resetThresholds: !!tick.resetThresholds,
            resetCategory: tick.resetCategory || null,
        };
    }

    var api = {
        DESTINATION_ANNOUNCEMENT_HYSTERESIS_M: DESTINATION_ANNOUNCEMENT_HYSTERESIS_M,
        DESTINATION_ANNOUNCEMENT_RESET_M: DESTINATION_ANNOUNCEMENT_RESET_M,
        buildDestinationAnnouncementTickPlan: buildDestinationAnnouncementTickPlan,
        buildDestinationAnnouncementStateApplyPlan: buildDestinationAnnouncementStateApplyPlan,
        buildTurnAnnouncementTickPlan: buildTurnAnnouncementTickPlan,
        buildTurnAnnouncementStateApplyPlan: buildTurnAnnouncementStateApplyPlan,
        isExitDirection: isExitDirection,
        isKeepDirection: isKeepDirection,
        buildTurnAnnouncement: buildTurnAnnouncement,
        resolveTurnAnnouncementCategory: resolveTurnAnnouncementCategory,
        resolveAnnouncementDistancesForDirection: resolveAnnouncementDistancesForDirection,
        resolveThresholdResetDistance: resolveThresholdResetDistance,
        pickTurnAnnouncementThreshold: pickTurnAnnouncementThreshold,
        appendChainedFollowingManeuver: appendChainedFollowingManeuver,
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

/**
 * @file Pure GPS speed, snap-blend, and maneuver speed-limit helpers.
 * @module modules/navigation/speed-gps
 *
 * Side-effect-free functions extracted from voyagr-app.js so GPS speedometer,
 * snap-to-route, and maneuver speed-limit behaviour can be unit-tested and
 * shared with the classic app script via the `VoyagrSpeedGps` global. The
 * monolith delegates with inline fallbacks.
 */
(function (root) {
    'use strict';

    var DEFAULTS = {
        SPEED_WIDGET_DEAD_BAND_MPH: 0.5,
        SPEED_WIDGET_SNAP_DELTA_MPH: 8.0,
        SPEED_WIDGET_LARGE_JUMP_MPH: 55.0,
        SPEED_WIDGET_LARGE_JUMP_DECAY_ALPHA: 0.2,
        MAX_DISPLAY_GPS_SPEED_MPH: 185.0,
        SPEED_WIDGET_EMA_ALPHA: 0.45,
        SPEED_WIDGET_WAKE_RAW_MPH: 3.0,
        SPEED_WIDGET_INIT_RESET_MS: 5000,
        SNAP_RELEASE_BAND_METERS: 40,
        SNAP_LOCK_HYSTERESIS_METERS: 18,
        SNAP_BLEND_EMA_ALPHA: 0.4,
        SNAP_HYSTERESIS_ON_THRESHOLD: 0.55,
        DISPLAY_POS_EMA_ALPHA: 0.52,
        DISPLAY_POS_URGENT_ALPHA: 0.88,
        DISPLAY_POS_URGENT_JUMP_M: 40,
        MS_TO_MPH: 2.237,
        DISPLACEMENT_MOVE_THRESHOLD: 3,
        DISPLACEMENT_NOISE_FLOOR_MOVING: 4,
        DISPLACEMENT_NOISE_ACC_SCALE_MOVING: 0.35,
        DISPLACEMENT_NOISE_FLOOR_PARKED: 8
    };

    var TYPICAL_MPH_LIMITS = [20, 30, 40, 50, 60, 70];

    /**
     * Reject implausible GPS speed spikes before display smoothing.
     * @param {number} mph
     * @param {number} prevPick
     * @returns {number}
     */
    function rejectGpsSpeedSpikeMph(mph, prevPick) {
        if (!Number.isFinite(mph) || mph < 0) return mph;
        var prev = Number.isFinite(prevPick) ? prevPick : mph;
        if (mph > 100) {
            return prev;
        }
        if (prev > 5 && mph > prev + 40) {
            return prev;
        }
        return mph;
    }

    /**
     * @param {number} mph
     * @param {string|null} roadClass
     * @param {number} gpsSpeedMph
     * @returns {boolean}
     */
    function isPlausibleEdgeSpeedLimitMph(mph, roadClass, gpsSpeedMph) {
        if (!Number.isFinite(mph) || mph <= 0 || mph > 100) return false;
        var rc = String(roadClass || '').toLowerCase();
        if (rc === 'motorway' && mph < 30) return false;
        if (rc === 'trunk' && mph < 25) return false;
        if ((rc === 'residential' || rc === 'service' || rc === 'living_street') && mph > 50) return false;
        if (mph < 10 && gpsSpeedMph > 25) return false;
        return true;
    }

    /**
     * @param {object|null} maneuver
     * @param {boolean} [preferCurrentRoad]
     * @returns {string}
     */
    function getManeuverStreetLabel(maneuver, preferCurrentRoad) {
        if (!maneuver) return '';
        if (preferCurrentRoad) {
            var begin = maneuver.begin_street_names || [];
            if (begin.length > 0 && begin[0]) return begin[0];
        }
        var names = maneuver.street_names || [];
        if (names.length > 0 && names[0]) return names[0];
        return maneuver.street_name || '';
    }

    /**
     * @param {number} rawSl
     * @param {string|null} roadClass
     * @param {number} gpsSpeedMph
     * @returns {number|null}
     */
    function normalizeManeuverSpeedLimitMph(rawSl, roadClass, gpsSpeedMph) {
        var raw = Number(rawSl);
        if (!Number.isFinite(raw) || raw <= 0) return null;

        var asKmhMph = Math.round(raw * 0.621371);
        var asDirectMph = Math.round(raw);

        if (TYPICAL_MPH_LIMITS.indexOf(asDirectMph) >= 0 && TYPICAL_MPH_LIMITS.indexOf(asKmhMph) < 0) {
            if (isPlausibleEdgeSpeedLimitMph(asDirectMph, roadClass, gpsSpeedMph)) {
                return asDirectMph;
            }
        }

        if (isPlausibleEdgeSpeedLimitMph(asKmhMph, roadClass, gpsSpeedMph)) {
            return asKmhMph;
        }
        if (isPlausibleEdgeSpeedLimitMph(asDirectMph, roadClass, gpsSpeedMph)) {
            return asDirectMph;
        }
        return null;
    }

    /**
     * Noise floor (m) for displacement speed when device reports coords.speed === 0.
     * @param {boolean} deviceReportsStopped
     * @param {number} consecutiveDisplacementMoves
     * @param {number|null} accAvg
     * @param {object} [constants]
     * @returns {number}
     */
    function displacementNoiseFloorMeters(deviceReportsStopped, consecutiveDisplacementMoves, accAvg, constants) {
        var c = constants || DEFAULTS;
        if (!deviceReportsStopped) return 0;
        if (consecutiveDisplacementMoves >= c.DISPLACEMENT_MOVE_THRESHOLD) {
            return Math.max(Number.isFinite(accAvg) ? accAvg * c.DISPLACEMENT_NOISE_ACC_SCALE_MOVING : c.DISPLACEMENT_NOISE_FLOOR_MOVING, c.DISPLACEMENT_NOISE_FLOOR_MOVING);
        }
        return Math.max(Number.isFinite(accAvg) ? accAvg : c.DISPLACEMENT_NOISE_FLOOR_PARKED, c.DISPLACEMENT_NOISE_FLOOR_PARKED);
    }

    /**
     * Compute route-snap blend weight with hysteresis + EMA on the weight itself.
     * @param {object} params
     * @param {number} params.distSnap
     * @param {number} params.snapLockMeters
     * @param {number} params.prevWeightState
     * @param {object} [params.constants]
     * @returns {{ effectiveBlend: number, weightState: number }}
     */
    function computeSnapBlendWeight(params) {
        params = params || {};
        var c = params.constants || DEFAULTS;
        var distSnap = params.distSnap;
        var snapLockMeters = params.snapLockMeters;
        var prevWeightState = Number.isFinite(params.prevWeightState) ? params.prevWeightState : 0;
        var snapReleaseMeters = snapLockMeters + c.SNAP_RELEASE_BAND_METERS;
        var releaseMeters = (prevWeightState > c.SNAP_HYSTERESIS_ON_THRESHOLD)
            ? snapReleaseMeters + c.SNAP_LOCK_HYSTERESIS_METERS
            : snapReleaseMeters;

        var target = 0;
        if (distSnap <= snapLockMeters) {
            target = 1;
        } else if (distSnap <= releaseMeters) {
            target = (releaseMeters - distSnap) / c.SNAP_RELEASE_BAND_METERS;
        }
        target = Math.max(0, Math.min(1, target));

        var weightState = (1 - c.SNAP_BLEND_EMA_ALPHA) * prevWeightState + c.SNAP_BLEND_EMA_ALPHA * target;
        return { effectiveBlend: weightState, weightState: weightState };
    }

    /**
     * One EMA step for lat/lon display smoothing.
     * @param {number|null} current
     * @param {number} target
     * @param {number} followJumpM
     * @param {object} [constants]
     * @returns {number}
     */
    function smoothDisplayCoordinate(current, target, followJumpM, constants) {
        var c = constants || DEFAULTS;
        if (!Number.isFinite(current)) return target;
        var alpha = (Number.isFinite(followJumpM) && followJumpM > c.DISPLAY_POS_URGENT_JUMP_M)
            ? c.DISPLAY_POS_URGENT_ALPHA
            : c.DISPLAY_POS_EMA_ALPHA;
        return current + (target - current) * alpha;
    }

    /**
     * Stateless smooth-GPS step (caller holds state).
     * @param {object|null} state - { smoothedMph, initAt }
     * @param {number} rawMph
     * @param {number} now - ms timestamp
     * @param {object} [constants]
     * @returns {{ value: number, state: { smoothedMph: number, initAt: number } }}
     */
    function stepSmoothGpsSpeedMph(state, rawMph, now, constants) {
        var c = constants || DEFAULTS;
        state = state || { smoothedMph: 0, initAt: 0 };

        if (!Number.isFinite(rawMph) || rawMph < 0) rawMph = 0;
        rawMph = Math.min(rawMph, c.MAX_DISPLAY_GPS_SPEED_MPH);

        if (state.smoothedMph < c.SPEED_WIDGET_DEAD_BAND_MPH && rawMph >= c.SPEED_WIDGET_WAKE_RAW_MPH) {
            return { value: rawMph, state: { smoothedMph: rawMph, initAt: now } };
        }
        if (rawMph < c.SPEED_WIDGET_DEAD_BAND_MPH) {
            return { value: 0, state: { smoothedMph: 0, initAt: now } };
        }
        if (!state.initAt || now - state.initAt > c.SPEED_WIDGET_INIT_RESET_MS) {
            return { value: rawMph, state: { smoothedMph: rawMph, initAt: now } };
        }

        var delta = Math.abs(rawMph - state.smoothedMph);
        var smoothed = state.smoothedMph;

        if (delta >= c.SPEED_WIDGET_LARGE_JUMP_MPH) {
            smoothed = (1 - c.SPEED_WIDGET_LARGE_JUMP_DECAY_ALPHA) * smoothed
                + c.SPEED_WIDGET_LARGE_JUMP_DECAY_ALPHA * rawMph;
        } else if (delta >= c.SPEED_WIDGET_SNAP_DELTA_MPH) {
            smoothed = rawMph;
        } else {
            smoothed = (1 - c.SPEED_WIDGET_EMA_ALPHA) * smoothed + c.SPEED_WIDGET_EMA_ALPHA * rawMph;
        }

        smoothed = Math.min(smoothed, c.MAX_DISPLAY_GPS_SPEED_MPH);
        return { value: smoothed, state: { smoothedMph: smoothed, initAt: now } };
    }

    var api = {
        DEFAULTS: DEFAULTS,
        rejectGpsSpeedSpikeMph: rejectGpsSpeedSpikeMph,
        isPlausibleEdgeSpeedLimitMph: isPlausibleEdgeSpeedLimitMph,
        getManeuverStreetLabel: getManeuverStreetLabel,
        normalizeManeuverSpeedLimitMph: normalizeManeuverSpeedLimitMph,
        displacementNoiseFloorMeters: displacementNoiseFloorMeters,
        computeSnapBlendWeight: computeSnapBlendWeight,
        smoothDisplayCoordinate: smoothDisplayCoordinate,
        stepSmoothGpsSpeedMph: stepSmoothGpsSpeedMph
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeedGps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

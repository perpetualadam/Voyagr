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
        DISPLACEMENT_NOISE_FLOOR_PARKED: 8,
        REVERSE_INDEX_MAX_SPEED_MPH: 2
    };

    var TYPICAL_MPH_LIMITS = [20, 30, 40, 50, 60, 70];
    /** km/h → mph */
    var KMH_TO_MPH = 0.621371192237334;
    /** Values above this in coords.speed are almost certainly km/h, not m/s (~123 mph). */
    var COORD_SPEED_LIKELY_KMH_THRESHOLD = 55;

    function metersPerSecondToMph(mps) {
        if (!Number.isFinite(mps) || mps <= 0) return 0;
        return mps * DEFAULTS.MS_TO_MPH;
    }

    function kmhToMph(kmh) {
        if (!Number.isFinite(kmh) || kmh <= 0) return 0;
        return kmh * KMH_TO_MPH;
    }

    /**
     * Normalize user speed-unit preference strings from settings / localStorage.
     * @param {string} unitPref
     * @returns {'mph'|'kmh'}
     */
    function normalizeSpeedUnitPref(unitPref) {
        if (unitPref == null || unitPref === '') return 'mph';
        var s = String(unitPref).toLowerCase().replace(/\s+/g, '');
        if (s === 'mph' || s === 'mi/h' || s === 'milesperhour') return 'mph';
        return 'kmh';
    }

    /**
     * Convert a canonical mph value to the user's chosen display unit.
     * @param {number} mph
     * @param {string} unitPref
     * @returns {number}
     */
    function mphToDisplaySpeed(mph, unitPref) {
        if (!Number.isFinite(mph) || mph < 0) mph = 0;
        if (normalizeSpeedUnitPref(unitPref) === 'mph') return mph;
        return mph * (1 / KMH_TO_MPH);
    }

    /**
     * Display label for a normalized speed unit preference.
     * @param {string} unitPref
     * @returns {'mph'|'km/h'}
     */
    function speedUnitLabel(unitPref) {
        return normalizeSpeedUnitPref(unitPref) === 'mph' ? 'mph' : 'km/h';
    }

    /**
     * Interpret `position.coords.speed` as mph.
     *
     * W3C Geolocation specifies m/s, but some Android WebViews emit km/h.
     *
     * @param {number|null|undefined} raw - coords.speed from Geolocation API.
     * @param {number|null|undefined} [derivedMphHint] - optional mph from Δposition/Δt.
     * @returns {number|null} mph, or null when raw is not a positive finite number.
     */
    function normalizeGeolocationSpeedToMph(raw, derivedMphHint) {
        if (!Number.isFinite(raw) || raw <= 0) return null;

        var fromMs = metersPerSecondToMph(raw);
        var fromKmh = kmhToMph(raw);

        if (raw > COORD_SPEED_LIKELY_KMH_THRESHOLD) {
            return fromKmh;
        }

        if (Number.isFinite(derivedMphHint) && derivedMphHint > 1) {
            var diffMs = Math.abs(fromMs - derivedMphHint);
            var diffKmh = Math.abs(fromKmh - derivedMphHint);
            if (diffKmh + 8 < diffMs) return fromKmh;
            if (diffMs + 8 < diffKmh) return fromMs;
        }

        return fromMs;
    }

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
    /**
     * Reject API speed limits that are implausible for the active road class
     * (e.g. 70 mph on residential from stale cache or nearby motorway OSM ways).
     * @param {number|null} mph
     * @param {string|null} roadClass
     * @param {number} gpsSpeedMph
     * @returns {number|null}
     */
    function sanitizeApiSpeedLimitMph(mph, roadClass, gpsSpeedMph) {
        var n = Number(mph);
        if (!Number.isFinite(n) || n <= 0) return null;
        var rounded = Math.round(n);
        if (!isPlausibleEdgeSpeedLimitMph(rounded, roadClass, gpsSpeedMph)) return null;
        return rounded;
    }

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

    /**
     * Map a snapped polyline vertex index to the maneuver describing the edge under the wheels.
     * @param {Array<object>|null} steps - Valhalla maneuvers.
     * @param {number} snappedIndex - Index into route polyline.
     * @returns {number} Maneuver index, or -1 when unavailable.
     */
    function getActiveRouteManeuverIndex(steps, snappedIndex) {
        if (!Array.isArray(steps) || steps.length === 0) return -1;
        if (!Number.isFinite(snappedIndex) || snappedIndex < 0) return 0;
        var best = 0;
        for (var i = 0; i < steps.length; i++) {
            var begin = steps[i] && Number.isFinite(steps[i].begin_shape_index)
                ? steps[i].begin_shape_index
                : 0;
            if (begin <= snappedIndex) {
                best = i;
            } else {
                break;
            }
        }
        return best;
    }

    /**
     * Monotonic along-route index: only move backward when nearly stopped (U-turn / parking).
     * @param {number} snappedIndex
     * @param {number} lastIndex
     * @param {number} speedMph
     * @param {object} [constants]
     * @returns {number}
     */
    function advanceSnappedRouteIndex(snappedIndex, lastIndex, speedMph, constants) {
        var c = constants || DEFAULTS;
        if (!Number.isFinite(snappedIndex)) return lastIndex;
        if (!Number.isFinite(lastIndex)) return snappedIndex;
        if (snappedIndex >= lastIndex) return snappedIndex;
        if (Number.isFinite(speedMph) && speedMph < c.REVERSE_INDEX_MAX_SPEED_MPH) return snappedIndex;
        return lastIndex;
    }

    /**
     * Turn-widget payload when no upcoming turn is in detection range — show current road.
     * @param {object|null} activeManeuver
     * @param {number} activeIdx
     * @param {string} [currentRoadDisplayName]
     * @returns {object|null}
     */
    function buildBetweenTurnDisplay(activeManeuver, activeIdx, currentRoadDisplayName) {
        var street = getManeuverStreetLabel(activeManeuver, true)
            || (currentRoadDisplayName || '');
        if (!street) return null;
        return {
            distance: 0,
            direction: 'straight',
            instruction: 'Continue',
            streetName: street,
            maneuver: activeManeuver,
            maneuverIndex: (activeIdx >= 0) ? activeIdx : null,
            valhallaType: 8
        };
    }

    /**
     * Derive mph from displacement between two fixes (null ⇒ treat as stationary / below noise).
     * @param {object} params
     * @returns {number|null}
     */
    function estimateDisplacementSpeedMph(params) {
        params = params || {};
        var c = params.constants || DEFAULTS;
        var distM = params.distM;
        var dtSec = params.dtSec;
        if (!Number.isFinite(distM) || distM > 500) return null;
        if (!Number.isFinite(dtSec) || dtSec <= 0.2 || dtSec >= 10) return null;

        if (params.deviceReportsStopped) {
            var floor = displacementNoiseFloorMeters(
                true,
                params.consecutiveDisplacementMoves || 0,
                params.accAvg,
                c
            );
            if (distM < floor) return null;
        }

        var mph = (distM / dtSec) * c.MS_TO_MPH;
        mph = Math.min(mph, c.MAX_DISPLAY_GPS_SPEED_MPH);
        var prevPick = Number.isFinite(params.prevPickMph) ? params.prevPickMph : mph;
        mph = rejectGpsSpeedSpikeMph(mph, prevPick);

        var accAvg = params.accAvg;
        if (accAvg != null) {
            if (mph > 95 && mph > prevPick + 70 && distM > accAvg * 2.3) {
                mph = prevPick;
            }
            if (mph > 130 && distM > 120 && distM > accAvg * 1.8 && accAvg > 55) {
                mph = Math.min(mph, prevPick + Math.max(20, mph * 0.15));
            }
        }
        if (mph > 120 && dtSec < 0.42 && distM > 42) {
            mph = Math.min(mph, Math.max(prevPick, prevPick * 1.42 + 6));
        }
        return mph;
    }

    var NAV_ODOMETER_DEFAULTS = {
        MIN_STEP_M: 3,
        MAX_STEP_M: 400,
        MAX_SPEED_MPH: 160,
        MIN_DT_S: 0.2,
        MAX_DT_S: 30,
        MS_TO_MPH: 2.237,
    };

    /**
     * Accumulate whole-journey odometer distance from raw GPS fixes with gating.
     * @param {Object|null} state - { lastGeo: {lat,lon,t}|null, traveledMeters }
     * @param {number} lat
     * @param {number} lon
     * @param {number} nowMs
     * @param {function(number,number,number,number): number} calculateDistanceMeters
     * @param {Object} [constants]
     * @returns {{ lastGeo: Object, traveledMeters: number }}
     */
    function accumulateNavOdometerSegment(state, lat, lon, nowMs, calculateDistanceMeters, constants) {
        constants = constants || NAV_ODOMETER_DEFAULTS;
        state = state || { lastGeo: null, traveledMeters: 0 };
        var traveledMeters = state.traveledMeters || 0;
        var lastGeo = state.lastGeo;

        if (lastGeo) {
            var segM = typeof calculateDistanceMeters === 'function'
                ? calculateDistanceMeters(lastGeo.lat, lastGeo.lon, lat, lon)
                : NaN;
            var dtS = (nowMs - lastGeo.t) / 1000;
            if (dtS > constants.MIN_DT_S && dtS < constants.MAX_DT_S) {
                var segSpeedMph = Number.isFinite(segM)
                    ? (segM / dtS) * constants.MS_TO_MPH
                    : Infinity;
                if (Number.isFinite(segM) &&
                    segM >= constants.MIN_STEP_M &&
                    segM < constants.MAX_STEP_M &&
                    segSpeedMph <= constants.MAX_SPEED_MPH) {
                    traveledMeters += segM;
                }
                lastGeo = { lat: lat, lon: lon, t: nowMs };
            }
        } else {
            lastGeo = { lat: lat, lon: lon, t: nowMs };
        }

        return { lastGeo: lastGeo, traveledMeters: traveledMeters };
    }

    /**
     * Resolve GPS heading for vehicle icon rotation (compass or motion vector).
     * @param {Object} opts
     * @param {number|null} [opts.deviceHeading]
     * @param {number} [opts.speed]
     * @param {Array<Object>} [opts.trackingHistory]
     * @param {function(number,number,number,number): number} [opts.calculateDistanceMeters]
     * @returns {number}
     */
    function resolveGpsHeadingDegrees(opts) {
        opts = opts || {};
        var deviceHeading = opts.deviceHeading;
        var speed = opts.speed || 0;
        var history = opts.trackingHistory || [];
        var calculateDistanceMeters = opts.calculateDistanceMeters;

        if (deviceHeading != null && speed > 1.5) {
            return (deviceHeading + 360) % 360;
        }
        if (history.length > 1) {
            var curr = history[history.length - 1];
            var prev = history[history.length - 2];
            for (var i = history.length - 2; i >= 0 && i >= history.length - 6; i--) {
                var p = history[i];
                if (typeof calculateDistanceMeters === 'function') {
                    var segM = calculateDistanceMeters(p.lat, p.lon, curr.lat, curr.lon);
                    if (segM >= 3) {
                        prev = p;
                        break;
                    }
                }
            }
            var dLon = curr.lon - prev.lon;
            var dLat = curr.lat - prev.lat;
            if (Math.abs(dLon) + Math.abs(dLat) > 1e-7) {
                return (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
            }
        }
        return 0;
    }

    /**
     * Follow-jump distance for display-coordinate EMA urgency.
     * @param {Object} opts
     * @returns {number}
     */
    function computeFollowJumpMeters(opts) {
        opts = opts || {};
        var followJumpM = Number.POSITIVE_INFINITY;
        var lastFollowCenter = opts.lastFollowCenterGeo;
        var calculateDistanceMeters = opts.calculateDistanceMeters;

        if (lastFollowCenter &&
            Number.isFinite(lastFollowCenter.lat) &&
            Number.isFinite(lastFollowCenter.lon) &&
            typeof calculateDistanceMeters === 'function') {
            followJumpM = calculateDistanceMeters(
                opts.displayLat, opts.displayLon,
                lastFollowCenter.lat, lastFollowCenter.lon
            );
        }
        if (opts.smoothDisplayLat != null &&
            opts.smoothDisplayLon != null &&
            typeof calculateDistanceMeters === 'function') {
            var smoothDeltaM = calculateDistanceMeters(
                opts.smoothDisplayLat, opts.smoothDisplayLon,
                opts.displayLat, opts.displayLon
            );
            if (Number.isFinite(smoothDeltaM)) {
                followJumpM = Math.max(followJumpM, smoothDeltaM);
            }
        }
        return followJumpM;
    }

    var api = {
        DEFAULTS: DEFAULTS,
        KMH_TO_MPH: KMH_TO_MPH,
        COORD_SPEED_LIKELY_KMH_THRESHOLD: COORD_SPEED_LIKELY_KMH_THRESHOLD,
        metersPerSecondToMph: metersPerSecondToMph,
        kmhToMph: kmhToMph,
        normalizeSpeedUnitPref: normalizeSpeedUnitPref,
        mphToDisplaySpeed: mphToDisplaySpeed,
        speedUnitLabel: speedUnitLabel,
        normalizeGeolocationSpeedToMph: normalizeGeolocationSpeedToMph,
        rejectGpsSpeedSpikeMph: rejectGpsSpeedSpikeMph,
        isPlausibleEdgeSpeedLimitMph: isPlausibleEdgeSpeedLimitMph,
        sanitizeApiSpeedLimitMph: sanitizeApiSpeedLimitMph,
        getManeuverStreetLabel: getManeuverStreetLabel,
        normalizeManeuverSpeedLimitMph: normalizeManeuverSpeedLimitMph,
        displacementNoiseFloorMeters: displacementNoiseFloorMeters,
        computeSnapBlendWeight: computeSnapBlendWeight,
        smoothDisplayCoordinate: smoothDisplayCoordinate,
        stepSmoothGpsSpeedMph: stepSmoothGpsSpeedMph,
        getActiveRouteManeuverIndex: getActiveRouteManeuverIndex,
        advanceSnappedRouteIndex: advanceSnappedRouteIndex,
        buildBetweenTurnDisplay: buildBetweenTurnDisplay,
        estimateDisplacementSpeedMph: estimateDisplacementSpeedMph,
        stepPickRawSpeedMph: stepPickRawSpeedMph,
        NAV_ODOMETER_DEFAULTS: NAV_ODOMETER_DEFAULTS,
        accumulateNavOdometerSegment: accumulateNavOdometerSegment,
        resolveGpsHeadingDegrees: resolveGpsHeadingDegrees,
        computeFollowJumpMeters: computeFollowJumpMeters,
    };

    // ======================================================================
    // stepPickRawSpeedMph — stateless raw-speed picker (extracted from voyagr-app.js)
    // Mirrors the pattern of stepSmoothGpsSpeedMph: caller holds state,
    // function is a pure tick that returns { value, state }.
    // ======================================================================

    /**
     * Pick the best GPS-speed estimate for this tick (device m/s or displacement).
     *
     * @param {object} state - Mutable-by-caller state: { lastGoodRawPickMph, consecutiveDisplacementMoves }
     * @param {number|null|undefined} coordsSpeed - coords.speed in m/s (null = device doesn't report)
     * @param {Array<{lat,lon,timestamp,accuracy?}>} history - Recent fix history (newest last)
     * @param {number|null|undefined} coordAccuracy - coords.accuracy in metres
     * @param {object} [constants] - Override DEFAULTS (for tests)
     * @returns {{ value: number, state: { lastGoodRawPickMph, consecutiveDisplacementMoves } }}
     */
    function stepPickRawSpeedMph(state, coordsSpeed, history, coordAccuracy, constants) {
        var c = constants || DEFAULTS;
        state = state || { lastGoodRawPickMph: 0, consecutiveDisplacementMoves: 0 };
        var lastGoodRawPickMph = Number.isFinite(state.lastGoodRawPickMph) ? state.lastGoodRawPickMph : 0;
        var consecutiveDisplacementMoves = state.consecutiveDisplacementMoves | 0;

        var accCurr = (Number.isFinite(coordAccuracy) && coordAccuracy > 2) ? coordAccuracy : null;

        function finish(mph) {
            var x = (Number.isFinite(mph) && mph >= 0) ? Math.min(mph, c.MAX_DISPLAY_GPS_SPEED_MPH) : 0;
            return {
                value: x,
                state: { lastGoodRawPickMph: x, consecutiveDisplacementMoves: consecutiveDisplacementMoves }
            };
        }

        var deviceReportsStopped = Number.isFinite(coordsSpeed) && coordsSpeed === 0;

        if (Number.isFinite(coordsSpeed) && coordsSpeed > 0) {
            var derivedHint = null;
            if (Array.isArray(history) && history.length >= 2) {
                var curr1 = history[history.length - 1];
                var prev1 = history[history.length - 2];
                var tCurr1 = curr1 && curr1.timestamp ? +curr1.timestamp : 0;
                var tPrev1 = prev1 && prev1.timestamp ? +prev1.timestamp : 0;
                var dt1 = (tCurr1 - tPrev1) / 1000;
                if (dt1 > 0.2 && dt1 < 10) {
                    // Haversine distance (metres) between two fixes
                    var dLat1 = (curr1.lat - prev1.lat) * Math.PI / 180;
                    var dLon1 = (curr1.lon - prev1.lon) * Math.PI / 180;
                    var a1 = Math.sin(dLat1 / 2) * Math.sin(dLat1 / 2) +
                        Math.cos(prev1.lat * Math.PI / 180) * Math.cos(curr1.lat * Math.PI / 180) *
                        Math.sin(dLon1 / 2) * Math.sin(dLon1 / 2);
                    var distM1 = 6371000 * 2 * Math.atan2(Math.sqrt(a1), Math.sqrt(1 - a1));
                    if (Number.isFinite(distM1) && distM1 <= 500) {
                        derivedHint = Math.min((distM1 / dt1) * 2.237, c.MAX_DISPLAY_GPS_SPEED_MPH);
                    }
                }
            }

            var mph = normalizeGeolocationSpeedToMph(coordsSpeed, derivedHint);
            if (mph == null || !Number.isFinite(mph)) mph = coordsSpeed * 2.237;
            mph = Math.min(mph, c.MAX_DISPLAY_GPS_SPEED_MPH);
            var prevPick1 = Number.isFinite(lastGoodRawPickMph) ? lastGoodRawPickMph : mph;
            mph = rejectGpsSpeedSpikeMph(mph, prevPick1);
            if (prevPick1 > 5 && mph > prevPick1 + 85 && accCurr != null && accCurr > 40) {
                mph = prevPick1;
            }
            if (mph >= 2) {
                consecutiveDisplacementMoves = Math.min(consecutiveDisplacementMoves + 1, 20);
            }
            return finish(mph);
        }

        if (Array.isArray(history) && history.length >= 2) {
            var curr2 = history[history.length - 1];
            var prev2 = history[history.length - 2];
            var tCurr2 = curr2 && curr2.timestamp ? +curr2.timestamp : 0;
            var tPrev2 = prev2 && prev2.timestamp ? +prev2.timestamp : 0;
            var dt2 = (tCurr2 - tPrev2) / 1000;
            var accAvg = Number.isFinite(prev2.accuracy) && Number.isFinite(curr2.accuracy)
                ? Math.max(Number(prev2.accuracy), Number(curr2.accuracy))
                : (accCurr != null ? accCurr : null);

            if (dt2 > 0.2 && dt2 < 10) {
                var dLat2 = (curr2.lat - prev2.lat) * Math.PI / 180;
                var dLon2 = (curr2.lon - prev2.lon) * Math.PI / 180;
                var a2 = Math.sin(dLat2 / 2) * Math.sin(dLat2 / 2) +
                    Math.cos(prev2.lat * Math.PI / 180) * Math.cos(curr2.lat * Math.PI / 180) *
                    Math.sin(dLon2 / 2) * Math.sin(dLon2 / 2);
                var distM2 = 6371000 * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));

                if (!Number.isFinite(distM2) || distM2 > 500) {
                    return finish(0);
                }

                if (deviceReportsStopped) {
                    var noiseFloor = displacementNoiseFloorMeters(deviceReportsStopped, consecutiveDisplacementMoves, accAvg);
                    if (distM2 < noiseFloor) {
                        return finish(0);
                    }
                }

                var prevPick2 = Number.isFinite(lastGoodRawPickMph) ? lastGoodRawPickMph : 0;
                var mph2 = estimateDisplacementSpeedMph({
                    distM: distM2,
                    dtSec: dt2,
                    prevPickMph: prevPick2,
                    accAvg: accAvg,
                    deviceReportsStopped: deviceReportsStopped,
                    consecutiveDisplacementMoves: consecutiveDisplacementMoves
                });

                if (mph2 == null) {
                    mph2 = (distM2 / dt2) * 2.237;
                    mph2 = rejectGpsSpeedSpikeMph(Math.min(mph2, c.MAX_DISPLAY_GPS_SPEED_MPH), prevPick2);
                }

                if (mph2 >= 2) {
                    consecutiveDisplacementMoves = Math.min(consecutiveDisplacementMoves + 1, 20);
                }

                return finish(mph2);
            }
        }

        return finish(0);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeedGps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

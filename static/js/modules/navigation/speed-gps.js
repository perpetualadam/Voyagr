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
        REVERSE_INDEX_MAX_SPEED_MPH: 2,
        SNAP_NEAR_ROUTE_FORCE_METERS: 130,
        SNAP_LOCK_ACC_SCALE: 1.5,
        /** Restart watchPosition if no fix arrives for this long during nav/tracking. */
        GPS_ENSURE_STALE_FIX_MS: 45000,
    };

    /**
     * Decide whether to restart geolocation watch after background/screen-off.
     * startGPSTracking() is a UI toggle and must not be used for resume recovery.
     * Respect trackingStoppedByUser so an intentional stop during turn-by-turn is
     * not silently undone by foreground resume / ensureGPSTracking.
     * @param {Object} [opts]
     * @param {boolean} [opts.geolocationAvailable]
     * @param {boolean} [opts.documentVisible]
     * @param {boolean} [opts.routeInProgress]
     * @param {boolean} [opts.isTrackingActive]
     * @param {boolean} [opts.trackingStoppedByUser]
     * @param {boolean} [opts.hasGpsWatchId]
     * @param {number|null|undefined} [opts.lastFixAgeMs]
     * @param {boolean} [opts.forceRestart]
     * @param {number} [opts.staleAfterMs]
     * @returns {Object}
     */
    function buildGpsTrackingEnsurePlan(opts) {
        opts = opts || {};
        var staleAfterMs = opts.staleAfterMs != null
            ? opts.staleAfterMs
            : DEFAULTS.GPS_ENSURE_STALE_FIX_MS;

        if (!opts.geolocationAvailable) {
            return { shouldRestart: false, reason: 'no_geolocation' };
        }
        if (opts.documentVisible === false) {
            return { shouldRestart: false, reason: 'hidden' };
        }
        // User turned tracking off (including mid-navigation). Resume/ensure must
        // not revive the watch. Geolocation-error recovery never sets this flag;
        // stopGPSTracking also clears the error-retry timer.
        if (opts.trackingStoppedByUser) {
            return { shouldRestart: false, reason: 'user_stopped' };
        }

        var needsTracking = !!(opts.routeInProgress || opts.isTrackingActive);
        if (!needsTracking && !opts.forceRestart) {
            return { shouldRestart: false, reason: 'not_needed' };
        }

        var missingWatch = !opts.hasGpsWatchId;
        var inactive = !opts.isTrackingActive;
        var stale = Number.isFinite(opts.lastFixAgeMs) && opts.lastFixAgeMs >= staleAfterMs;

        if (!opts.forceRestart && !missingWatch && !inactive && !stale) {
            return { shouldRestart: false, reason: 'healthy' };
        }

        var reason = opts.forceRestart ? 'force'
            : missingWatch ? 'missing_watch'
            : inactive ? 'inactive'
            : stale ? 'stale_fix'
            : 'restart';

        return {
            shouldRestart: true,
            clearExistingWatch: true,
            resetDisplayState: true,
            quietStatus: true,
            reason: reason,
            logMessage: '[GPS] Restarting watch (' + reason + ')',
        };
    }

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
        if ((rc === 'motorway' || rc === 'motorway_link') && mph < 30) return false;
        if ((rc === 'trunk' || rc === 'trunk_link' || rc === 'trunk_road') && mph < 25) return false;
        if ((rc === 'residential' || rc === 'service' || rc === 'living_street') && mph > 50) return false;
        // Local / minor classes should not show motorway NSL 70 (common Optimised leak).
        if ((rc === 'tertiary' || rc === 'unclassified') && mph >= 70) return false;
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
        var directTypical = TYPICAL_MPH_LIMITS.indexOf(asDirectMph) >= 0;
        var kmhTypical = TYPICAL_MPH_LIMITS.indexOf(asKmhMph) >= 0;

        // GraphHopper/OSRM store mph; Valhalla may still send km/h (48 → 30).
        // Prefer the interpretation that lands on a typical signed limit.
        if (directTypical && !kmhTypical) {
            if (isPlausibleEdgeSpeedLimitMph(asDirectMph, roadClass, gpsSpeedMph)) {
                return asDirectMph;
            }
        }
        if (kmhTypical && !directTypical) {
            if (isPlausibleEdgeSpeedLimitMph(asKmhMph, roadClass, gpsSpeedMph)) {
                return asKmhMph;
            }
        }
        // Raw values above UK NSL mph range are almost certainly km/h.
        if (asDirectMph > 80 && isPlausibleEdgeSpeedLimitMph(asKmhMph, roadClass, gpsSpeedMph)) {
            return asKmhMph;
        }
        if (isPlausibleEdgeSpeedLimitMph(asDirectMph, roadClass, gpsSpeedMph)) {
            return asDirectMph;
        }
        if (isPlausibleEdgeSpeedLimitMph(asKmhMph, roadClass, gpsSpeedMph)) {
            return asKmhMph;
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

    /**
     * Display position/heading after route snap blend (pure; caller supplies snap result).
     * @param {Object} opts
     * @param {number} opts.lat
     * @param {number} opts.lon
     * @param {number|null} [opts.accuracy]
     * @param {Object} opts.snapped - { lat, lon, index, distance }
     * @param {Array<[number,number]>} opts.routePolyline
     * @param {number} opts.gpsHeadingForBlend
     * @param {number} opts.lastSnappedRouteIndex
     * @param {number} opts.speedMph
     * @param {number} [opts.prevSnapBlendWeightState]
     * @param {function(number,number,number,number): number} [opts.calculateBearing]
     * @param {function(number,number,number): number} [opts.blendHeadingsCircular]
     * @param {Object} [opts.constants]
     * @returns {{ displayLat: number, displayLon: number, heading: number, snapBlendWeightState: number, lastSnappedRouteIndex: number }}
     */
    function buildSnappedVehicleDisplayPlan(opts) {
        opts = opts || {};
        var c = opts.constants || DEFAULTS;
        var lat = opts.lat;
        var lon = opts.lon;
        var snapped = opts.snapped;
        var routePolyline = opts.routePolyline || [];
        var gpsHeadingForBlend = opts.gpsHeadingForBlend || 0;
        var lastSnappedRouteIndex = opts.lastSnappedRouteIndex || 0;
        var speedMph = opts.speedMph || 0;
        var snapBlendWeightState = Number.isFinite(opts.prevSnapBlendWeightState)
            ? opts.prevSnapBlendWeightState
            : 0;

        var displayLat = lat;
        var displayLon = lon;
        var heading = gpsHeadingForBlend;

        if (!snapped || routePolyline.length < 2) {
            return {
                displayLat: displayLat,
                displayLon: displayLon,
                heading: heading,
                snapBlendWeightState: snapBlendWeightState,
                lastSnappedRouteIndex: lastSnappedRouteIndex,
            };
        }

        var routeBearing = gpsHeadingForBlend;
        if (snapped.index < routePolyline.length - 1 && typeof opts.calculateBearing === 'function') {
            var rA = routePolyline[snapped.index];
            var rB = routePolyline[snapped.index + 1];
            routeBearing = opts.calculateBearing(rA[0], rA[1], rB[0], rB[1]);
        }

        var accuracy = opts.accuracy;
        var horizAcc = typeof accuracy === 'number' && accuracy > 1 && accuracy < 520 ? accuracy : null;
        var snapLockMeters = Math.max(
            c.SNAP_NEAR_ROUTE_FORCE_METERS,
            horizAcc != null ? horizAcc * c.SNAP_LOCK_ACC_SCALE : 0
        );

        var snapBlend = computeSnapBlendWeight({
            distSnap: snapped.distance,
            snapLockMeters: snapLockMeters,
            prevWeightState: snapBlendWeightState,
            constants: c,
        });
        snapBlendWeightState = snapBlend.weightState;
        var effectiveBlend = snapBlend.effectiveBlend;

        displayLat = lat + (snapped.lat - lat) * effectiveBlend;
        displayLon = lon + (snapped.lon - lon) * effectiveBlend;
        if (typeof opts.blendHeadingsCircular === 'function') {
            heading = opts.blendHeadingsCircular(gpsHeadingForBlend, routeBearing, effectiveBlend);
        }

        var nextSnappedRouteIndex = advanceSnappedRouteIndex(
            snapped.index,
            lastSnappedRouteIndex,
            speedMph,
            c
        );

        return {
            displayLat: displayLat,
            displayLon: displayLon,
            heading: heading,
            snapBlendWeightState: snapBlendWeightState,
            lastSnappedRouteIndex: nextSnappedRouteIndex,
        };
    }

    /**
     * Compute vehicle marker lat/lon after route snap blend and position smoothing.
     * @param {Object} opts
     * @returns {{ displayLat: number, displayLon: number, markerLat: number, markerLon: number, smoothDisplayLat: number, smoothDisplayLon: number, heading: number, snapBlendWeightState: number, lastSnappedRouteIndex: number }}
     */
    function buildNavigationVehicleMarkerPositionPlan(opts) {
        opts = opts || {};
        var lat = opts.lat;
        var lon = opts.lon;
        var displayLat = lat;
        var displayLon = lon;
        var heading = opts.gpsHeadingForBlend || 0;
        var snapBlendWeightState = Number.isFinite(opts.prevSnapBlendWeightState)
            ? opts.prevSnapBlendWeightState
            : 0;
        var lastSnappedRouteIndex = opts.lastSnappedRouteIndex || 0;

        if (opts.snapPlan) {
            displayLat = opts.snapPlan.displayLat;
            displayLon = opts.snapPlan.displayLon;
            heading = opts.snapPlan.heading;
            snapBlendWeightState = opts.snapPlan.snapBlendWeightState;
            lastSnappedRouteIndex = opts.snapPlan.lastSnappedRouteIndex;
        } else if (opts.routeInProgress && opts.routePolyline && opts.routePolyline.length >= 2 && opts.snapped) {
            var innerSnap = buildSnappedVehicleDisplayPlan({
                lat: lat,
                lon: lon,
                accuracy: opts.accuracy,
                snapped: opts.snapped,
                routePolyline: opts.routePolyline,
                gpsHeadingForBlend: heading,
                lastSnappedRouteIndex: lastSnappedRouteIndex,
                speedMph: opts.speedMph || 0,
                prevSnapBlendWeightState: snapBlendWeightState,
                calculateBearing: opts.calculateBearing,
                blendHeadingsCircular: opts.blendHeadingsCircular,
            });
            displayLat = innerSnap.displayLat;
            displayLon = innerSnap.displayLon;
            heading = innerSnap.heading;
            snapBlendWeightState = innerSnap.snapBlendWeightState;
            lastSnappedRouteIndex = innerSnap.lastSnappedRouteIndex;
        }

        var smoothLat = opts.smoothDisplayLat;
        var smoothLon = opts.smoothDisplayLon;
        var markerLat;
        var markerLon;

        if (opts.useSmoothCoordsOnly && smoothLat != null && smoothLon != null) {
            markerLat = smoothLat;
            markerLon = smoothLon;
        } else {
            var followJumpM = Number.isFinite(opts.followJumpM)
                ? opts.followJumpM
                : (typeof opts.calculateDistanceMeters === 'function'
                    ? computeFollowJumpMeters({
                        displayLat: displayLat,
                        displayLon: displayLon,
                        smoothDisplayLat: smoothLat,
                        smoothDisplayLon: smoothLon,
                        lastFollowCenterGeo: opts.lastFollowCenterGeo,
                        calculateDistanceMeters: opts.calculateDistanceMeters,
                    })
                    : Number.POSITIVE_INFINITY);

            if (smoothLat == null || smoothLon == null || opts.resetSmooth) {
                smoothLat = displayLat;
                smoothLon = displayLon;
            } else {
                smoothLat = smoothDisplayCoordinate(smoothLat, displayLat, followJumpM);
                smoothLon = smoothDisplayCoordinate(smoothLon, displayLon, followJumpM);
            }
            markerLat = smoothLat;
            markerLon = smoothLon;
        }

        return {
            displayLat: displayLat,
            displayLon: displayLon,
            markerLat: markerLat,
            markerLon: markerLon,
            smoothDisplayLat: smoothLat,
            smoothDisplayLon: smoothLon,
            heading: heading,
            snapBlendWeightState: snapBlendWeightState,
            lastSnappedRouteIndex: lastSnappedRouteIndex,
        };
    }

    /**
     * Vehicle marker display coordinates for map overlays (recenter, distance checks).
     * @param {Object} opts
     * @returns {{ lat: number, lon: number }}
     */
    function buildVehicleDisplayCoordinatesPlan(opts) {
        opts = opts || {};
        var lat = opts.lat;
        var lon = opts.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return { lat: lat, lon: lon };
        }
        var posPlan = buildNavigationVehicleMarkerPositionPlan({
            lat: lat,
            lon: lon,
            routeInProgress: opts.routeInProgress,
            routePolyline: opts.routePolyline,
            snapped: opts.snapped,
            lastSnappedRouteIndex: opts.lastSnappedRouteIndex,
            prevSnapBlendWeightState: opts.prevSnapBlendWeightState,
            smoothDisplayLat: opts.smoothDisplayLat,
            smoothDisplayLon: opts.smoothDisplayLon,
            useSmoothCoordsOnly: opts.useSmoothCoordsOnly,
            calculateBearing: opts.calculateBearing,
            blendHeadingsCircular: opts.blendHeadingsCircular,
        });
        return { lat: posPlan.markerLat, lon: posPlan.markerLon };
    }

    /**
     * CSS rotation for vehicle marker icon (degrees), compensating for map bearing.
     * @param {number} heading
     * @param {number} mapBearing
     * @returns {number}
     */
    function computeVehicleMarkerRotationDeg(heading, mapBearing) {
        var h = Number.isFinite(heading) ? heading : 0;
        var mb = Number.isFinite(mapBearing) ? mapBearing : 0;
        return ((h - mb) % 360 + 360) % 360;
    }

    /**
     * Vehicle marker update plan for one GPS tick (reuse marker vs create fresh).
     * @param {Object} opts
     * @returns {Object}
     */
    function buildVehicleMarkerTickPlan(opts) {
        opts = opts || {};
        var hasExisting = !!(opts.hasMarker && opts.canSetLngLat);
        var mapBearing = Number.isFinite(opts.mapBearing) ? opts.mapBearing : 0;
        var rotationDeg = computeVehicleMarkerRotationDeg(opts.heading, mapBearing);

        if (hasExisting) {
            return {
                action: 'update',
                lngLat: [opts.markerLon, opts.markerLat],
                rotationDeg: rotationDeg,
                heading: opts.heading,
                speed: opts.speed,
                accuracy: opts.accuracy,
                reattachToMap: !!(opts.hasMarker && opts.canSetLngLat && opts.markerOnMap === false),
            };
        }

        return {
            action: 'create',
            lat: opts.markerLat,
            lon: opts.markerLon,
            speed: opts.speed,
            accuracy: opts.accuracy,
            heading: opts.heading,
        };
    }

    /**
     * Vehicle marker redraw plan after map/style recovery (position + marker tick).
     * @param {Object} opts
     * @returns {{ markerTick: Object, reattachToMap: boolean }}
     */
    function buildNavigationVehicleMarkerRedrawPlan(opts) {
        opts = opts || {};
        var posPlan = buildNavigationVehicleMarkerPositionPlan({
            lat: opts.lat,
            lon: opts.lon,
            accuracy: opts.accuracy,
            routeInProgress: opts.routeInProgress,
            routePolyline: opts.routePolyline,
            snapped: opts.snapped,
            gpsHeadingForBlend: opts.gpsHeadingForBlend,
            lastSnappedRouteIndex: opts.lastSnappedRouteIndex,
            prevSnapBlendWeightState: opts.prevSnapBlendWeightState,
            smoothDisplayLat: opts.smoothDisplayLat,
            smoothDisplayLon: opts.smoothDisplayLon,
            useSmoothCoordsOnly: opts.useSmoothCoordsOnly,
            speedMph: opts.speedMph,
            calculateBearing: opts.calculateBearing,
            blendHeadingsCircular: opts.blendHeadingsCircular,
        });
        var markerTick = buildVehicleMarkerTickPlan({
            hasMarker: opts.hasMarker,
            canSetLngLat: opts.canSetLngLat,
            markerLat: posPlan.markerLat,
            markerLon: posPlan.markerLon,
            heading: posPlan.heading,
            speed: opts.speed,
            accuracy: opts.accuracy,
            mapBearing: opts.mapBearing,
        });
        return {
            markerTick: markerTick,
            reattachToMap: !!(opts.hasMarker && opts.canSetLngLat && !opts.markerOnMap),
        };
    }

    /**
     * Apply plan for priming vehicle marker on a new route polyline.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildPrimeVehicleMarkerOnRouteApplyPlan(opts) {
        opts = opts || {};
        var posPlan = buildNavigationVehicleMarkerPositionPlan({
            lat: opts.lat,
            lon: opts.lon,
            routeInProgress: true,
            routePolyline: opts.routePolyline,
            snapped: opts.snapped,
            lastSnappedRouteIndex: opts.lastSnappedRouteIndex,
            resetSmooth: true,
            speedMph: 0,
            calculateBearing: opts.calculateBearing,
            blendHeadingsCircular: opts.blendHeadingsCircular,
        });
        return {
            action: 'apply',
            statePatch: {
                smoothDisplayLat: posPlan.smoothDisplayLat,
                smoothDisplayLon: posPlan.smoothDisplayLon,
                snapBlendWeightState: 1,
            },
            markerLngLat: [posPlan.markerLon, posPlan.markerLat],
        };
    }

    /**
     * Position/heading/smooth-state plan for one GPS tracking tick.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildGpsTrackingPositionTickPlan(opts) {
        opts = opts || {};
        var lat = opts.lat;
        var lon = opts.lon;
        var gpsHeadingForBlend = typeof opts.resolveGpsHeading === 'function'
            ? opts.resolveGpsHeading()
            : (opts.gpsHeadingForBlend || 0);

        var followJumpM = Number.isFinite(opts.followJumpM)
            ? opts.followJumpM
            : computeFollowJumpMeters({
                displayLat: lat,
                displayLon: lon,
                smoothDisplayLat: opts.smoothDisplayLat,
                smoothDisplayLon: opts.smoothDisplayLon,
                lastFollowCenterGeo: opts.lastFollowCenterGeo,
                calculateDistanceMeters: opts.calculateDistanceMeters,
            });

        var posPlan = buildNavigationVehicleMarkerPositionPlan({
            lat: lat,
            lon: lon,
            accuracy: opts.accuracy,
            routeInProgress: opts.routeInProgress,
            routePolyline: opts.routePolyline,
            snapped: opts.snapped,
            gpsHeadingForBlend: gpsHeadingForBlend,
            lastSnappedRouteIndex: opts.lastSnappedRouteIndex,
            prevSnapBlendWeightState: opts.prevSnapBlendWeightState,
            speedMph: opts.speedMph,
            smoothDisplayLat: opts.smoothDisplayLat,
            smoothDisplayLon: opts.smoothDisplayLon,
            followJumpM: followJumpM,
            calculateBearing: opts.calculateBearing,
            blendHeadingsCircular: opts.blendHeadingsCircular,
        });

        return {
            heading: posPlan.heading,
            markerLat: posPlan.markerLat,
            markerLon: posPlan.markerLon,
            followJumpM: followJumpM,
            statePatch: {
                snapBlendWeightState: posPlan.snapBlendWeightState,
                lastSnappedRouteIndex: posPlan.lastSnappedRouteIndex,
                smoothDisplayLat: posPlan.smoothDisplayLat,
                smoothDisplayLon: posPlan.smoothDisplayLon,
            },
        };
    }

    /**
     * Apply plan for GPS position tick state patches and marker outputs.
     * @param {Object|null|undefined} posTick - from buildGpsTrackingPositionTickPlan
     * @param {Object} [opts]
     * @param {number} opts.lat
     * @param {number} opts.lon
     * @param {number|null} [opts.smoothDisplayLat]
     * @param {number|null} [opts.smoothDisplayLon]
     * @returns {Object}
     */
    function buildGpsPositionStateApplyPlan(posTick, opts) {
        opts = opts || {};
        if (!posTick) {
            var markerLat = opts.smoothDisplayLat;
            var markerLon = opts.smoothDisplayLon;
            var statePatch = {};
            if (markerLat == null || markerLon == null) {
                markerLat = opts.lat;
                markerLon = opts.lon;
                statePatch.smoothDisplayLat = opts.lat;
                statePatch.smoothDisplayLon = opts.lon;
            }
            return {
                action: 'apply',
                heading: 0,
                markerLat: markerLat,
                markerLon: markerLon,
                followJumpM: Number.POSITIVE_INFINITY,
                statePatch: statePatch,
            };
        }
        return {
            action: 'apply',
            heading: posTick.heading,
            markerLat: posTick.markerLat,
            markerLon: posTick.markerLon,
            followJumpM: posTick.followJumpM,
            statePatch: posTick.statePatch || {},
        };
    }

    /**
     * Position tick, apply, and speed-limit plans for one GPS position tick.
     * Caller supplies coord outputs and a precomputed snap result.
     * @param {Object} opts
     * @returns {{ posTick: (Object|null), posApply: Object, speedLimitPlan: Object }}
     */
    function buildGpsPositionTickPlan(opts) {
        opts = opts || {};
        var posTick = buildGpsTrackingPositionTickPlan({
            lat: opts.lat,
            lon: opts.lon,
            accuracy: opts.accuracy,
            routeInProgress: opts.routeInProgress,
            routePolyline: opts.routePolyline,
            snapped: opts.snapped,
            lastSnappedRouteIndex: opts.lastSnappedRouteIndex,
            prevSnapBlendWeightState: opts.prevSnapBlendWeightState,
            speedMph: opts.speedMph,
            smoothDisplayLat: opts.smoothDisplayLat,
            smoothDisplayLon: opts.smoothDisplayLon,
            lastFollowCenterGeo: opts.lastFollowCenterGeo,
            calculateDistanceMeters: opts.calculateDistanceMeters,
            calculateBearing: opts.calculateBearing,
            blendHeadingsCircular: opts.blendHeadingsCircular,
            resolveGpsHeading: opts.resolveGpsHeading,
        });

        var posApply = buildGpsPositionStateApplyPlan(posTick, {
            lat: opts.lat,
            lon: opts.lon,
            smoothDisplayLat: opts.smoothDisplayLat,
            smoothDisplayLon: opts.smoothDisplayLon,
        });

        var speedLimitPlan = buildNavSpeedLimitTickPlan({
            routeInProgress: opts.routeInProgress,
            isTrackingActive: opts.isTrackingActive,
            routePolyline: opts.routePolyline,
            currentRouteSteps: opts.currentRouteSteps,
            lastSnappedRouteIndex: opts.lastSnappedRouteIndex,
            displaySpeedMph: opts.displaySpeedMph,
            currentSpeedLimitMph: opts.currentSpeedLimitMph,
            lastSpeedLimitRegion: opts.lastSpeedLimitRegion,
            lastActiveManeuverIdx: opts.lastActiveManeuverIdx,
            resolveRoadType: opts.resolveRoadType,
            pickDisplaySpeedLimitMph: opts.pickDisplaySpeedLimitMph,
        });

        return {
            posTick: posTick,
            posApply: posApply,
            speedLimitPlan: speedLimitPlan,
        };
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
        buildSnappedVehicleDisplayPlan: buildSnappedVehicleDisplayPlan,
        buildNavigationVehicleMarkerPositionPlan: buildNavigationVehicleMarkerPositionPlan,
        buildVehicleDisplayCoordinatesPlan: buildVehicleDisplayCoordinatesPlan,
        buildVehicleMarkerTickPlan: buildVehicleMarkerTickPlan,
        buildNavigationVehicleMarkerRedrawPlan: buildNavigationVehicleMarkerRedrawPlan,
        buildPrimeVehicleMarkerOnRouteApplyPlan: buildPrimeVehicleMarkerOnRouteApplyPlan,
        buildGpsTrackingPositionTickPlan: buildGpsTrackingPositionTickPlan,
        buildGpsCoordSampleTickPlan: buildGpsCoordSampleTickPlan,
        buildGpsCoordSampleStateApplyPlan: buildGpsCoordSampleStateApplyPlan,
        buildGpsPositionTickPlan: buildGpsPositionTickPlan,
        buildGpsPositionStateApplyPlan: buildGpsPositionStateApplyPlan,
        buildGpsTrackingEnsurePlan: buildGpsTrackingEnsurePlan,
        computeVehicleMarkerRotationDeg: computeVehicleMarkerRotationDeg,
        normalizeGeolocationCoordsSample: normalizeGeolocationCoordsSample,
        buildTrackingHistoryAppendPlan: buildTrackingHistoryAppendPlan,
        buildNavSpeedLimitTickPlan: buildNavSpeedLimitTickPlan,
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

        var deviceReportsStopped = !Number.isFinite(coordsSpeed) || coordsSpeed <= 0;

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

                if (deviceReportsStopped || !Number.isFinite(coordsSpeed)) {
                    var noiseFloor = displacementNoiseFloorMeters(true, consecutiveDisplacementMoves, accAvg);
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

    /**
     * Normalize a GeolocationPosition coords object into app-friendly fields.
     * @param {Object|null|undefined} coords
     * @returns {{ lat: number, lon: number, accuracy: number, speedMs: number, deviceHeading: (number|null) }}
     */
    function normalizeGeolocationCoordsSample(coords) {
        coords = coords || {};
        var rawCoordsSpeed = coords.speed;
        var deviceSpeedMs = (Number.isFinite(rawCoordsSpeed) && rawCoordsSpeed >= 0) ? rawCoordsSpeed : null;
        var speedMs = deviceSpeedMs != null ? deviceSpeedMs : 0;
        var deviceHeading = typeof coords.heading === 'number' && !Number.isNaN(coords.heading)
            ? coords.heading
            : null;
        return {
            lat: coords.latitude,
            lon: coords.longitude,
            accuracy: coords.accuracy,
            speedMs: speedMs,
            deviceSpeedMs: deviceSpeedMs,
            deviceHeading: deviceHeading,
        };
    }

    /**
     * Coord sample + history + raw speed + odometer plan for one GPS tick.
     * @param {Object} opts
     * @param {Object} opts.sample - from normalizeGeolocationCoordsSample
     * @param {Array<Object>} [opts.trackingHistory]
     * @param {Object} [opts.pickRawSpeedState] - { lastGoodRawPickMph, consecutiveDisplacementMoves }
     * @param {boolean} [opts.routeInProgress]
     * @param {Object|null} [opts.odometerState] - { lastGeo, traveledMeters }
     * @param {number} [opts.nowMs]
     * @param {Date} [opts.timestamp]
     * @param {function(number,number,number,number): number} [opts.calculateDistanceMeters]
     * @returns {Object}
     */
    function buildGpsCoordSampleTickPlan(opts) {
        opts = opts || {};
        var sample = opts.sample || {};
        var lat = sample.lat;
        var lon = sample.lon;
        var accuracy = sample.accuracy;
        var speed = sample.speedMs;

        var historyPlan = buildTrackingHistoryAppendPlan(opts.trackingHistory, {
            lat: lat,
            lon: lon,
            timestamp: opts.timestamp != null
                ? opts.timestamp
                : new Date(opts.nowMs != null ? opts.nowMs : Date.now()),
            speed: speed,
            accuracy: accuracy,
        });

        var pickResult = stepPickRawSpeedMph(
            opts.pickRawSpeedState,
            sample.deviceSpeedMs,
            historyPlan.history,
            accuracy
        );

        var odometerPatch = null;
        if (opts.routeInProgress && typeof opts.calculateDistanceMeters === 'function') {
            var odo = accumulateNavOdometerSegment(
                opts.odometerState,
                lat,
                lon,
                opts.nowMs != null ? opts.nowMs : Date.now(),
                opts.calculateDistanceMeters
            );
            odometerPatch = {
                lastGeo: odo.lastGeo,
                traveledMeters: odo.traveledMeters,
            };
        }

        return {
            lat: lat,
            lon: lon,
            accuracy: accuracy,
            speed: speed,
            deviceHeading: sample.deviceHeading,
            speedMph: pickResult.value,
            statePatch: {
                trackingHistory: historyPlan.history,
                pickRawSpeedState: pickResult.state,
                currentLat: lat,
                currentLon: lon,
                odometer: odometerPatch,
            },
        };
    }

    /**
     * Apply plan for coord-sample tick state patches and tick outputs.
     * @param {Object|null|undefined} tick - from buildGpsCoordSampleTickPlan
     * @returns {Object}
     */
    function buildGpsCoordSampleStateApplyPlan(tick) {
        if (!tick) {
            return { action: 'skip' };
        }
        return {
            action: 'apply',
            lat: tick.lat,
            lon: tick.lon,
            accuracy: tick.accuracy,
            speed: tick.speed,
            deviceHeading: tick.deviceHeading,
            speedMph: tick.speedMph,
            statePatch: tick.statePatch || {},
        };
    }

    /**
     * Append a tracking history entry and trim to max length.
     * @param {Array<Object>} history
     * @param {Object} entry
     * @param {number} [maxLen]
     * @returns {{ history: Array<Object> }}
     */
    function buildTrackingHistoryAppendPlan(history, entry, maxLen) {
        history = history || [];
        maxLen = maxLen != null ? maxLen : 40;
        var next = history.concat([entry]);
        if (next.length > maxLen) {
            next = next.slice(next.length - maxLen);
        }
        return { history: next };
    }

    /**
     * Resolve active maneuver, road type, and Valhalla speed-limit hint for a GPS tick.
     * @param {Object} opts
     * @param {boolean} opts.routeInProgress
     * @param {boolean} opts.isTrackingActive
     * @param {Array<[number,number]>} [opts.routePolyline]
     * @param {Array<Object>} [opts.currentRouteSteps]
     * @param {number} [opts.lastSnappedRouteIndex]
     * @param {number} opts.displaySpeedMph
     * @param {number|null} [opts.currentSpeedLimitMph]
     * @param {string|null} [opts.lastSpeedLimitRegion]
     * @param {number} [opts.lastActiveManeuverIdx]
     * @param {function(number, number): string} [opts.resolveRoadType]
     * @param {function(number|null, number|null, string, string|null): number|null} [opts.pickDisplaySpeedLimitMph]
     * @returns {Object}
     */
    function buildNavSpeedLimitTickPlan(opts) {
        opts = opts || {};
        var displaySpeedMph = opts.displaySpeedMph;
        var routeInProgress = !!opts.routeInProgress;
        var isTrackingActive = !!opts.isTrackingActive;

        if (!routeInProgress && !isTrackingActive) {
            return {
                showWidget: true,
                displaySpeedMph: displaySpeedMph,
                shownLimit: null,
                roadType: 'unknown',
            };
        }

        var activeManeuverIdx = -1;
        if (routeInProgress && opts.routePolyline && opts.routePolyline.length >= 2) {
            activeManeuverIdx = getActiveRouteManeuverIndex(opts.currentRouteSteps, opts.lastSnappedRouteIndex);
        }
        var activeManeuver = (activeManeuverIdx >= 0 && opts.currentRouteSteps && activeManeuverIdx < opts.currentRouteSteps.length)
            ? opts.currentRouteSteps[activeManeuverIdx]
            : null;

        var roadType = typeof opts.resolveRoadType === 'function'
            ? opts.resolveRoadType(activeManeuverIdx, displaySpeedMph)
            : 'unknown';

        var valhallaSpeedLimitMph = null;
        if (activeManeuver) {
            var rawSl = activeManeuver.speed_limit != null ? Number(activeManeuver.speed_limit) : NaN;
            if (Number.isFinite(rawSl) && rawSl > 0) {
                valhallaSpeedLimitMph = normalizeManeuverSpeedLimitMph(
                    rawSl,
                    activeManeuver.road_class || roadType,
                    displaySpeedMph
                );
            }
        }
        if (valhallaSpeedLimitMph != null
            && !isPlausibleEdgeSpeedLimitMph(valhallaSpeedLimitMph, roadType, displaySpeedMph)) {
            valhallaSpeedLimitMph = null;
        }

        var resetFetchState = activeManeuverIdx >= 0 && activeManeuverIdx !== opts.lastActiveManeuverIdx;
        var pickFn = opts.pickDisplaySpeedLimitMph;
        // Only prefer the edge hint when we have no API/cached limit yet. Preferring
        // a stale GraphHopper begin-of-instruction 70 mph over a live OSM/TomTom 30
        // is what kept NSL showing after entering a 30 zone.
        var preferEdgeHint = resetFetchState
            && valhallaSpeedLimitMph != null
            && !(opts.currentSpeedLimitMph > 0);
        var shownLimit = typeof pickFn === 'function'
            ? pickFn(opts.currentSpeedLimitMph, valhallaSpeedLimitMph, roadType, opts.lastSpeedLimitRegion, {
                preferValhallaOverApi: preferEdgeHint,
            })
            : (opts.currentSpeedLimitMph && opts.currentSpeedLimitMph > 0
                ? opts.currentSpeedLimitMph
                : valhallaSpeedLimitMph);

        return {
            showWidget: true,
            displaySpeedMph: displaySpeedMph,
            activeManeuverIdx: activeManeuverIdx,
            roadType: roadType,
            valhallaSpeedLimitMph: valhallaSpeedLimitMph,
            shownLimit: shownLimit,
            resetFetchState: resetFetchState,
            newLastActiveManeuverIdx: resetFetchState ? activeManeuverIdx : opts.lastActiveManeuverIdx,
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSpeedGps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

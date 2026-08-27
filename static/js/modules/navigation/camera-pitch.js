/**
 * @file Pure decision for the driving / follow camera.
 * @module modules/navigation/camera-pitch
 *
 * Two independent concerns are returned:
 *   - followHeading: should the camera follow the vehicle and rotate to heading
 *                    (vs. a static north-up overview)?
 *   - tilt:          should it ALSO tilt into a 3D pitch (vs. stay flat 2D)?
 *
 * The key behaviour this encodes: an explicit 2D map-view choice is honoured even
 * during active turn-by-turn navigation. 2D navigation still follows heading-up —
 * it simply stays flat (pitch 0) instead of tilting to 60°.
 *
 * This is intentionally a tiny, side-effect-free function so it can be unit tested
 * for real and shared by the (classic, non-module) app script via a global.
 */
(function (root) {
    'use strict';

    /**
     * @param {object} state
     * @param {boolean} state.activeNavFollow        Active nav with zoom-and-follow engaged.
     * @param {boolean} state.driverPerspectiveEnabled User opted into driver view while browsing.
     * @param {boolean} state.prefersFlat2D           User selected the flat 2D map view.
     * @returns {{ followHeading: boolean, tilt: boolean }}
     */
    function decideDrivingCamera(state) {
        state = state || {};
        const activeNavFollow = !!state.activeNavFollow;
        const driverPerspectiveEnabled = !!state.driverPerspectiveEnabled;
        const prefersFlat2D = !!state.prefersFlat2D;

        const followHeading = activeNavFollow || driverPerspectiveEnabled;
        const tilt = followHeading && !prefersFlat2D;

        return { followHeading: followHeading, tilt: tilt };
    }

    /**
     * MapLibre follow padding: vehicle in lower quarter, road ahead visible.
     * @param {number} viewportHeight
     * @param {number} viewportWidth
     * @returns {{top:number, bottom:number, left:number, right:number}}
     */
    function computeFollowPadding(viewportHeight, viewportWidth) {
        var h = viewportHeight;
        var w = viewportWidth;
        var bottomUiReserve = Math.min(200, Math.max(96, h * 0.15));
        return {
            top: Math.round(h * 0.55),
            bottom: Math.round(bottomUiReserve),
            left: Math.round(Math.min(22, w * 0.03)),
            right: Math.round(Math.min(22, w * 0.03)),
        };
    }

    /**
     * Prefer the MapLibre canvas size so follow padding matches the transform
     * that actually receives easeTo/flyTo. Window size is only a fallback.
     * @param {Object} [opts]
     * @param {{ getContainer?: function }} [opts.map]
     * @param {number} [opts.fallbackHeight]
     * @param {number} [opts.fallbackWidth]
     * @returns {{ height: number, width: number }}
     */
    function resolveFollowViewportSize(opts) {
        opts = opts || {};
        var map = opts.map;
        if (map && typeof map.getContainer === 'function') {
            try {
                var el = map.getContainer();
                if (el && el.clientHeight > 0 && el.clientWidth > 0) {
                    return { height: el.clientHeight, width: el.clientWidth };
                }
            } catch (_err) { /* fall through to window/fallback */ }
        }
        var fallbackH = opts.fallbackHeight;
        var fallbackW = opts.fallbackWidth;
        if (fallbackH == null && typeof window !== 'undefined') {
            fallbackH = window.innerHeight;
        }
        if (fallbackW == null && typeof window !== 'undefined') {
            fallbackW = window.innerWidth;
        }
        var h = Number(fallbackH);
        var w = Number(fallbackW);
        return {
            height: (Number.isFinite(h) && h > 0) ? h : 0,
            width: (Number.isFinite(w) && w > 0) ? w : 0,
        };
    }

    /**
     * Follow padding for the given map canvas (or window fallback).
     * @param {Object} [opts] - same as resolveFollowViewportSize
     * @returns {{top:number, bottom:number, left:number, right:number}}
     */
    function resolveFollowPadding(opts) {
        var size = resolveFollowViewportSize(opts);
        return computeFollowPadding(size.height, size.width);
    }

    /**
     * Whether returning to the foreground should re-apply the navigation camera.
     * Must not restore when the driver has left follow / zoom-and-follow.
     * @param {Object} [opts]
     * @returns {{ shouldRestore: boolean, action: string }}
     */
    function buildForegroundFollowCameraRestorePlan(opts) {
        opts = opts || {};
        var shouldRestore = !!(
            opts.routeInProgress &&
            opts.zoomAndFollowEnabled &&
            opts.mapFollowingActive
        );
        return {
            shouldRestore: shouldRestore,
            action: shouldRestore ? 'applyLiveNavigationCamera' : 'skip',
        };
    }

    /**
     * Whether and how the follow camera should ease on this GPS tick.
     * @param {Object} opts
     * @param {number} [opts.nowMs]
     * @param {number} [opts.lastFollowEaseAt]
     * @param {number} [opts.followJumpM]
     * @param {boolean} [opts.zoomAndFollowEnabled]
     * @param {boolean} [opts.mapFollowingActive]
     * @param {boolean} [opts.mapUserPanned]
     * @param {boolean} [opts.routeInProgress]
     * @param {number} [opts.followEaseMinMs]
     * @returns {Object}
     */
    function buildNavigationFollowEasePlan(opts) {
        opts = opts || {};
        // Keep interval >= typical ease duration so overlapping easeTo zooms do not stack.
        var followEaseMinMs = opts.followEaseMinMs != null ? opts.followEaseMinMs : 700;
        var nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
        var lastFollowEaseAt = opts.lastFollowEaseAt || 0;
        var followJumpM = Number.isFinite(opts.followJumpM) ? opts.followJumpM : Infinity;

        var followDue = nowMs - lastFollowEaseAt >= followEaseMinMs;
        var followUrgent = followJumpM > 40;
        var shouldEase = followDue || followUrgent;

        var plan = {
            nowMs: nowMs,
            followDue: followDue,
            followUrgent: followUrgent,
            shouldEase: shouldEase,
            durationMs: followJumpM > 95
                ? Math.min(720, followEaseMinMs + 40)
                : Math.min(650, Math.max(400, followEaseMinMs - 50)),
            browsingDurationMs: followJumpM > 95 ? 650 : 420,
            mode: 'none',
        };

        if (opts.zoomAndFollowEnabled && opts.mapFollowingActive) {
            plan.mode = 'navigation';
        } else if (!opts.zoomAndFollowEnabled && !opts.mapUserPanned) {
            plan.mode = 'browsing';
            plan.zoom = 16;
            plan.includePadding = !!opts.routeInProgress;
        }

        return plan;
    }

    /**
     * Camera parameters for navigation follow ease on a GPS tick.
     * @param {Object} opts
     * @returns {{ zoom: number, pitch: number, bearing: number, padding: Object, easeTo: (Object|null) }}
     */
    function buildNavigationFollowCameraPlan(opts) {
        opts = opts || {};
        var computeZoom = typeof opts.computeSmartZoom === 'function'
            ? opts.computeSmartZoom
            : function () { return 16; };
        var roadType = opts.roadType || 'unknown';
        var distanceToNextTurn = opts.distanceToNextTurn != null ? opts.distanceToNextTurn : null;
        var smartZoom = computeZoom(opts.speedMph, distanceToNextTurn, roadType);
        var pitch = opts.shouldTilt ? 60 : 0;
        var padding = computeFollowPadding(opts.viewportHeight || 0, opts.viewportWidth || 0);
        var bearing = opts.usePitchedDrivingCamera
            ? (opts.heading != null ? opts.heading : (opts.mapBearing || 0))
            : 0;
        var easeTo = null;
        if (opts.shouldEase) {
            easeTo = {
                center: [opts.markerLon, opts.markerLat],
                bearing: bearing,
                pitch: pitch,
                padding: padding,
                duration: opts.durationMs != null ? opts.durationMs : 650,
                essential: true,
            };
            // Only skip zoom when this exact integer band was already applied.
            // Do not use a "within 1" check: lastZoomLevel is often a fractional
            // map.getZoom() from route fit, and syncing the target band after an
            // omitted zoom leaves the camera stuck (e.g. at overview).
            var lastZoom = opts.lastZoomLevel;
            var zoomChanged = !Number.isFinite(lastZoom) || lastZoom !== smartZoom;
            if (zoomChanged) {
                easeTo.zoom = smartZoom;
            }
        }
        return {
            zoom: smartZoom,
            pitch: pitch,
            bearing: bearing,
            padding: padding,
            easeTo: easeTo,
        };
    }

    /**
     * Plan for speed/turn-based smart zoom animation during navigation.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildSmartZoomEasePlan(opts) {
        opts = opts || {};
        if (!opts.smartZoomEnabled || !opts.routeInProgress) {
            return { shouldApply: false };
        }
        var computeZoom = typeof opts.computeSmartZoom === 'function'
            ? opts.computeSmartZoom
            : function () { return opts.lastZoomLevel || 13; };
        var newZoomLevel = computeZoom(opts.speedMph, opts.distanceToNextTurn, opts.roadType || 'urban');
        var lastZoom = Number.isFinite(opts.lastZoomLevel) ? opts.lastZoomLevel : 13;
        if (Math.abs(newZoomLevel - lastZoom) < 1) {
            return { shouldApply: false };
        }

        var navFollow = !!(opts.zoomAndFollowEnabled && opts.mapFollowingActive);
        var hasUserCoords = opts.userLat != null && opts.userLon != null && opts.hasMap;
        var easeTo = null;
        var setZoomOnly = false;

        if (hasUserCoords) {
            var pitch = opts.currentPitch != null ? opts.currentPitch : 0;
            var bearing = opts.currentBearing != null ? opts.currentBearing : 0;
            var padding;
            if (navFollow) {
                padding = computeFollowPadding(opts.viewportHeight || 0, opts.viewportWidth || 0);
                if (opts.usePitchedDrivingCamera) {
                    pitch = opts.shouldTilt ? 60 : 0;
                    bearing = (typeof opts.vehicleHeading === 'number')
                        ? opts.vehicleHeading
                        : bearing;
                } else {
                    pitch = 0;
                    bearing = 0;
                }
            }
            easeTo = {
                center: [opts.userLon, opts.userLat],
                zoom: newZoomLevel,
                pitch: pitch,
                bearing: bearing,
                duration: opts.zoomAnimationDurationMs != null ? opts.zoomAnimationDurationMs : 500,
                essential: true,
            };
            if (padding) easeTo.padding = padding;
        } else if (opts.hasMap) {
            setZoomOnly = true;
        } else {
            return { shouldApply: false };
        }

        var turnAheadZoom = opts.turnAheadZoomLevel != null ? opts.turnAheadZoomLevel : 18;
        var isTurnZoom = newZoomLevel === turnAheadZoom;
        return {
            shouldApply: true,
            newZoomLevel: newZoomLevel,
            easeTo: easeTo,
            setZoomOnly: setZoomOnly,
            logTurn: isTurnZoom,
            logDistanceToTurn: opts.distanceToNextTurn,
            logSpeedMph: opts.speedMph,
            lastTurnZoomApplied: isTurnZoom,
        };
    }

    /**
     * Decide whether turn/smart zoom should run after navigation follow eased this tick.
     * When zoom-and-follow is active, follow owns zoom (including turn zoom) so smart zoom
     * must not fight it on ticks where follow skipped an ease.
     * @param {Object} opts
     * @returns {{ applySmartZoom: boolean, syncLastZoomLevel: (number|null) }}
     */
    function buildNavigationZoomTickPlan(opts) {
        opts = opts || {};
        var followEaseApplied = !!(opts.navigationFollowEaseApplied);
        var navFollowActive = !!(opts.zoomAndFollowEnabled && opts.mapFollowingActive);
        var syncZoom = followEaseApplied && Number.isFinite(opts.followZoom) ? opts.followZoom : null;
        return {
            applySmartZoom: !!(
                opts.smartZoomEnabled &&
                opts.routeInProgress &&
                !followEaseApplied &&
                !navFollowActive
            ),
            syncLastZoomLevel: syncZoom,
        };
    }

    /**
     * Apply plan for navigation zoom coordination on one GPS tick.
     * @param {Object|null|undefined} zoomTick - from buildNavigationZoomTickPlan
     * @param {Object} [ctx]
     * @param {number} [ctx.speedMph]
     * @param {number|null} [ctx.distanceToNextTurn]
     * @param {string} [ctx.roadType]
     * @param {number} [ctx.lat]
     * @param {number} [ctx.lon]
     * @returns {Object}
     */
    function buildNavigationZoomApplyPlan(zoomTick, ctx) {
        ctx = ctx || {};
        if (!zoomTick) return { action: 'skip' };
        var apply = { action: 'apply' };
        if (zoomTick.syncLastZoomLevel != null) {
            apply.syncLastZoomLevel = zoomTick.syncLastZoomLevel;
        }
        if (zoomTick.applySmartZoom) {
            apply.applySmartZoom = {
                speedMph: ctx.speedMph,
                distanceToNextTurn: ctx.distanceToNextTurn,
                roadType: ctx.roadType || 'unknown',
                lat: ctx.lat,
                lon: ctx.lon,
            };
        }
        return apply;
    }

    /**
     * Apply plan for navigation/browsing follow camera on a GPS tick.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildNavigationFollowApplyPlan(opts) {
        opts = opts || {};
        var none = {
            action: 'skip',
            navigationFollowEaseApplied: false,
            navigationFollowZoom: null,
        };

        if (!opts.hasMap) return none;

        var followPlan = opts.followEasePlan || {};
        if (followPlan.mode === 'none') return none;

        if (followPlan.mode === 'navigation') {
            var followCamera = opts.followCameraPlan || {};
            var applied = !!followCamera.easeTo;
            // Only expose followZoom for lastZoomLevel sync when easeTo actually
            // included zoom; otherwise gps-orchestration would record the band
            // as applied while the camera never moved to it.
            var easeZoom = applied && followCamera.easeTo && Number.isFinite(followCamera.easeTo.zoom)
                ? followCamera.easeTo.zoom
                : null;
            var result = {
                action: 'navigation',
                navigationFollowEaseApplied: applied,
                navigationFollowZoom: easeZoom,
                updateRecenterVisibility: true,
                logLine: '[Navigation] View: pitch ' + (followCamera.pitch || 0) + '°, bearing ' +
                    Math.round(followCamera.bearing || 0) + '°, zoom ' +
                    (followCamera.zoom != null ? followCamera.zoom.toFixed(1) : '0') +
                    ', pitchedNav: ' + !!opts.isActiveNavigationFollow +
                    ', pref: ' + !!opts.driverPerspectiveEnabled,
            };
            if (applied) {
                result.easeTo = followCamera.easeTo;
                result.statePatch = {
                    lastFollowEaseAt: followPlan.nowMs,
                    lastFollowCenterGeo: { lat: opts.markerLat, lon: opts.markerLon },
                };
            }
            return result;
        }

        if (followPlan.mode === 'browsing' && followPlan.shouldEase) {
            var pad = followPlan.includePadding
                ? computeFollowPadding(opts.viewportHeight || 0, opts.viewportWidth || 0)
                : undefined;
            return {
                action: 'browsing',
                navigationFollowEaseApplied: false,
                navigationFollowZoom: null,
                easeTo: {
                    center: [opts.markerLon, opts.markerLat],
                    zoom: followPlan.zoom,
                    padding: pad,
                    duration: followPlan.browsingDurationMs,
                },
                statePatch: {
                    lastFollowEaseAt: followPlan.nowMs,
                    lastFollowCenterGeo: { lat: opts.markerLat, lon: opts.markerLon },
                },
            };
        }

        return none;
    }

    /**
     * Apply plan for smart zoom animation after buildSmartZoomEasePlan.
     * @param {Object} easePlan
     * @returns {Object}
     */
    function buildSmartZoomApplyPlan(easePlan) {
        if (!easePlan || !easePlan.shouldApply) {
            return { action: 'skip' };
        }

        var apply = {
            action: 'apply',
            newZoomLevel: easePlan.newZoomLevel,
            lastTurnZoomApplied: !!easePlan.lastTurnZoomApplied,
        };

        if (easePlan.easeTo) {
            apply.easeTo = easePlan.easeTo;
        } else if (easePlan.setZoomOnly) {
            apply.setZoomOnly = true;
        }

        if (easePlan.logTurn) {
            apply.logLine = '[SmartZoom] Turn-based zoom to level ' + easePlan.newZoomLevel +
                ' - Turn in ' + easePlan.logDistanceToTurn.toFixed(0) + ' m';
        } else {
            apply.logLine = '[SmartZoom] Speed-based zoom to level ' + easePlan.newZoomLevel +
                ' for speed ' + easePlan.logSpeedMph.toFixed(1) + ' mph';
        }

        return apply;
    }

    const api = {
        decideDrivingCamera: decideDrivingCamera,
        computeFollowPadding: computeFollowPadding,
        resolveFollowViewportSize: resolveFollowViewportSize,
        resolveFollowPadding: resolveFollowPadding,
        buildForegroundFollowCameraRestorePlan: buildForegroundFollowCameraRestorePlan,
        buildNavigationFollowEasePlan: buildNavigationFollowEasePlan,
        buildNavigationFollowCameraPlan: buildNavigationFollowCameraPlan,
        buildNavigationFollowApplyPlan: buildNavigationFollowApplyPlan,
        buildSmartZoomEasePlan: buildSmartZoomEasePlan,
        buildSmartZoomApplyPlan: buildSmartZoomApplyPlan,
        buildNavigationZoomTickPlan: buildNavigationZoomTickPlan,
        buildNavigationZoomApplyPlan: buildNavigationZoomApplyPlan,
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Global for the classic browser scripts (voyagr-app.js).
    root.decideDrivingCamera = decideDrivingCamera;
    root.VoyagrCameraPitch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

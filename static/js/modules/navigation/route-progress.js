/**
 * @file Pure route calculation progress bar HTML and styles (no DOM).
 * @module modules/navigation/route-progress
 */
(function (root) {
    'use strict';

    var ROUTE_PROGRESS_CONTAINER_ID = 'routeProgressContainer';
    var ROUTE_PROGRESS_BAR_ID = 'routeProgressBar';
    var ROUTE_PROGRESS_TEXT_ID = 'routeProgressText';
    var ROUTE_PROGRESS_ANIMATION_STYLE_ID = 'progressAnimationStyle';
    var ROUTE_PROGRESS_DEFAULT_TEXT = '📍 Calculating route...';

    /**
     * @returns {string}
     */
    function getRouteProgressContainerStyleCssText() {
        return [
            'position: fixed;',
            'top: 0;',
            'left: 0;',
            'right: 0;',
            'z-index: 9999;',
            'background: rgba(102, 126, 234, 0.1);',
            'padding: 0;',
        ].join('');
    }

    /**
     * @param {string} [progressText]
     * @returns {string}
     */
    function buildRouteProgressBarInnerHtml(progressText) {
        var text = progressText || ROUTE_PROGRESS_DEFAULT_TEXT;
        return (
            '<div id="' + ROUTE_PROGRESS_BAR_ID + '" style="' +
                'height: 4px;' +
                'background: linear-gradient(90deg, #667eea, #764ba2, #667eea);' +
                'background-size: 200% 100%;' +
                'animation: progressGradient 1.5s ease-in-out infinite;' +
                'width: 100%;' +
            '"></div>' +
            '<div style="' +
                'text-align: center;' +
                'padding: 8px;' +
                'font-size: 13px;' +
                'color: #667eea;' +
                'font-weight: 500;' +
            '">' +
                '<span id="' + ROUTE_PROGRESS_TEXT_ID + '">' + text + '</span>' +
            '</div>'
        );
    }

    /**
     * @returns {string}
     */
    function getRouteProgressAnimationKeyframes() {
        return (
            '@keyframes progressGradient {' +
                '0% { background-position: 0% 50%; }' +
                '50% { background-position: 100% 50%; }' +
                '100% { background-position: 0% 50%; }' +
            '}'
        );
    }

    /**
     * Mount plan for the route calculation progress bar (app creates DOM from this).
     * @param {string} [progressText]
     * @returns {{ containerId: string, containerStyleCssText: string, innerHtml: string, animationStyleId: string, animationKeyframes: string }}
     */
    function buildRouteProgressMountPlan(progressText) {
        return {
            containerId: ROUTE_PROGRESS_CONTAINER_ID,
            containerStyleCssText: getRouteProgressContainerStyleCssText(),
            innerHtml: buildRouteProgressBarInnerHtml(progressText),
            animationStyleId: ROUTE_PROGRESS_ANIMATION_STYLE_ID,
            animationKeyframes: getRouteProgressAnimationKeyframes(),
        };
    }

    /**
     * Resolve maneuver step index from a snapped polyline vertex index.
     * @param {Array<Object>|null|undefined} steps
     * @param {number} snapIndex
     * @returns {number}
     */
    function resolveStepIndexFromSnapIndex(steps, snapIndex) {
        if (!steps || steps.length === 0) return 0;
        var stepIdx = 0;
        for (var i = 0; i < steps.length; i++) {
            var begin = steps[i].begin_shape_index || 0;
            if (begin <= snapIndex + 5) {
                stepIdx = i;
            } else {
                break;
            }
        }
        for (var j = stepIdx; j < steps.length; j++) {
            var beginJ = steps[j].begin_shape_index || 0;
            if (beginJ >= snapIndex - 5) {
                return j;
            }
        }
        return stepIdx;
    }

    /**
     * Seed plan for navigation progress indices after reroute (values only; app assigns globals).
     * @param {number} snapIndex - Clamped snap index on route polyline
     * @param {number} snapDistance - Off-route distance in metres
     * @param {Array<Object>|null|undefined} steps
     * @param {number} routeJoinGateMeters
     * @returns {Object}
     */
    function buildNavigationProgressSeedPlan(snapIndex, snapDistance, steps, routeJoinGateMeters) {
        var idx = Math.max(0, snapIndex);
        var stepIndex = resolveStepIndexFromSnapIndex(steps, idx);
        var offRoute = Number.isFinite(snapDistance) ? snapDistance : 0;
        return {
            lastSnappedRouteIndex: idx,
            lastTurnDetectRouteVertexIndex: idx,
            currentStepIndex: stepIndex,
            routeJoinConfirmedForDeviation: offRoute <= routeJoinGateMeters,
            logMessage: '[Reroute] Seeded progress: snapIdx=' + idx + ', step=' + stepIndex +
                ', offRoute=' + offRoute.toFixed(0) + 'm',
        };
    }

    var NAV_ARRIVAL_DEFAULTS = {
        END_REMAINING_M: 40,
        DWELL_REMAINING_M: 55,
        DWELL_MS: 3500,
        MAX_SPEED_MS: 1.2,
    };

    /**
     * Arrival decision plan for auto-ending navigation near destination.
     * @param {number} remainingM
     * @param {number} speedMs
     * @param {number} arrivalZoneSince - ms timestamp when dwell zone entered (0 if none)
     * @param {number} now
     * @param {Object} [constants]
     * @returns {{ action: string, nextArrivalZoneSince: number }}
     */
    function buildNavigationArrivalPlan(remainingM, speedMs, arrivalZoneSince, now, constants) {
        constants = constants || NAV_ARRIVAL_DEFAULTS;
        var speed = Number.isFinite(speedMs) && speedMs >= 0 ? speedMs : 0;

        if (remainingM <= constants.END_REMAINING_M) {
            return { action: 'end', nextArrivalZoneSince: 0 };
        }

        if (remainingM <= constants.DWELL_REMAINING_M && speed <= constants.MAX_SPEED_MS) {
            if (!arrivalZoneSince) {
                return { action: 'dwell-start', nextArrivalZoneSince: now };
            }
            if (now - arrivalZoneSince >= constants.DWELL_MS) {
                return { action: 'end', nextArrivalZoneSince: 0 };
            }
            return { action: 'dwell-wait', nextArrivalZoneSince: arrivalZoneSince };
        }

        return { action: 'none', nextArrivalZoneSince: 0 };
    }

    /**
     * Full arrival tick plan: guards, dwell state patch, end-navigation hint.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildNavigationArrivalTickPlan(opts) {
        opts = opts || {};
        if (!opts.routeInProgress) {
            return { action: 'skip', reason: 'inactive' };
        }
        if (opts.arrivalTriggered) {
            return { action: 'skip', reason: 'triggered' };
        }

        var arrivalPlan = buildNavigationArrivalPlan(
            opts.remainingM,
            opts.speedMs,
            opts.arrivalZoneSince,
            opts.now != null ? opts.now : Date.now(),
            opts.constants
        );

        var endNavigation = arrivalPlan.action === 'end';
        return {
            action: arrivalPlan.action,
            arrivalPlan: arrivalPlan,
            statePatch: { arrivalZoneSince: arrivalPlan.nextArrivalZoneSince },
            endNavigation: endNavigation,
            logMessage: endNavigation
                ? '[Navigation] Arrival (' + Math.round(opts.remainingM) + 'm remaining) — ending trip'
                : null,
        };
    }

    /**
     * Apply plan for navigation arrival state patches and end-navigation hint.
     * @param {Object|null|undefined} tick - from buildNavigationArrivalTickPlan
     * @returns {Object}
     */
    function buildNavigationArrivalStateApplyPlan(tick) {
        if (!tick || tick.action === 'skip') {
            return { action: 'skip', reason: tick && tick.reason };
        }
        return {
            action: 'apply',
            statePatch: tick.statePatch || {},
            endNavigation: !!tick.endNavigation,
            logMessage: tick.logMessage || null,
        };
    }

    /**
     * Which GPS navigation sub-tasks run when route polyline is active.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildGpsNavigationActiveTickPlan(opts) {
        opts = opts || {};
        var active = !!(opts.routeInProgress && opts.routePolyline && opts.routePolyline.length > 0);
        return {
            active: active,
            detectTurn: active,
            updateTurnWidget: active,
            announceDestination: active,
            checkArrival: active,
        };
    }

    /**
     * Which GPS-tick side-effect phases run after position/speed-limit plans.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildGpsTrackingSideEffectsPlan(opts) {
        opts = opts || {};
        var navActive = buildGpsNavigationActiveTickPlan({
            routeInProgress: opts.routeInProgress,
            routePolyline: opts.routePolyline,
        });
        var hasPolyline = !!(opts.routePolyline && opts.routePolyline.length > 0);
        return {
            accumulateOdometer: !!opts.routeInProgress,
            checkDeviation: !!(opts.routeInProgress && hasPolyline),
            processHazards: !!(opts.routeInProgress || opts.isTrackingActive),
            navActive: navActive,
            updateLaneGuidance: navActive.active && !!(opts.routeSteps && opts.routeSteps.length > 0),
            showSpeedWidget: !!opts.speedLimitShowWidget,
            fetchRoadName: !!opts.routeInProgress,
        };
    }

    /**
     * Ordered navigation side-effect phases for one GPS tick after position/speed plans.
     * @param {Object} opts
     * @param {Object} opts.sideEffects - from buildGpsTrackingSideEffectsPlan
     * @returns {Object}
     */
    function buildGpsNavigationSideEffectsTickPlan(opts) {
        opts = opts || {};
        var side = opts.sideEffects || {};
        var nav = side.navActive || {};
        return {
            checkDeviation: !!side.checkDeviation,
            processHazards: !!side.processHazards,
            turn: {
                detect: !!nav.active,
                announce: !!nav.detectTurn,
                updateWidget: !!nav.updateTurnWidget,
            },
            announceDestination: !!nav.announceDestination,
            checkArrival: !!nav.checkArrival,
            applyZoom: true,
            updateLaneGuidance: !!side.updateLaneGuidance,
            showSpeedWidget: !!side.showSpeedWidget,
            fetchRoadName: !!side.fetchRoadName,
        };
    }

    /**
     * Full GPS tracking tick outcome: position outputs plus side-effects plan.
     * @param {Object} opts
     * @returns {Object}
     */
    function buildGpsTrackingTickOutcomePlan(opts) {
        opts = opts || {};
        var sideEffects = buildGpsTrackingSideEffectsPlan({
            routeInProgress: opts.routeInProgress,
            routePolyline: opts.routePolyline,
            routeSteps: opts.routeSteps,
            isTrackingActive: opts.isTrackingActive,
            speedLimitShowWidget: opts.speedLimitShowWidget,
        });
        return {
            lat: opts.lat,
            lon: opts.lon,
            accuracy: opts.accuracy,
            speed: opts.speed,
            speedMph: opts.speedMph,
            markerLat: opts.markerLat,
            markerLon: opts.markerLon,
            heading: opts.heading,
            followJumpM: opts.followJumpM,
            speedLimitPlan: opts.speedLimitPlan,
            sideEffects: sideEffects,
        };
    }

    var api = {
        ROUTE_PROGRESS_CONTAINER_ID: ROUTE_PROGRESS_CONTAINER_ID,
        ROUTE_PROGRESS_BAR_ID: ROUTE_PROGRESS_BAR_ID,
        ROUTE_PROGRESS_TEXT_ID: ROUTE_PROGRESS_TEXT_ID,
        ROUTE_PROGRESS_ANIMATION_STYLE_ID: ROUTE_PROGRESS_ANIMATION_STYLE_ID,
        ROUTE_PROGRESS_DEFAULT_TEXT: ROUTE_PROGRESS_DEFAULT_TEXT,
        getRouteProgressContainerStyleCssText: getRouteProgressContainerStyleCssText,
        buildRouteProgressBarInnerHtml: buildRouteProgressBarInnerHtml,
        getRouteProgressAnimationKeyframes: getRouteProgressAnimationKeyframes,
        buildRouteProgressMountPlan: buildRouteProgressMountPlan,
        resolveStepIndexFromSnapIndex: resolveStepIndexFromSnapIndex,
        buildNavigationProgressSeedPlan: buildNavigationProgressSeedPlan,
        NAV_ARRIVAL_DEFAULTS: NAV_ARRIVAL_DEFAULTS,
        buildNavigationArrivalPlan: buildNavigationArrivalPlan,
        buildNavigationArrivalTickPlan: buildNavigationArrivalTickPlan,
        buildNavigationArrivalStateApplyPlan: buildNavigationArrivalStateApplyPlan,
        buildGpsNavigationActiveTickPlan: buildGpsNavigationActiveTickPlan,
        buildGpsTrackingSideEffectsPlan: buildGpsTrackingSideEffectsPlan,
        buildGpsNavigationSideEffectsTickPlan: buildGpsNavigationSideEffectsTickPlan,
        buildGpsTrackingTickOutcomePlan: buildGpsTrackingTickOutcomePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

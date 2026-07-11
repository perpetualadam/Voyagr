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
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRouteProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

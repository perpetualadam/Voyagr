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
        var followEaseMinMs = opts.followEaseMinMs != null ? opts.followEaseMinMs : 400;
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
            durationMs: followJumpM > 95 ? 780 : Math.min(680, followEaseMinMs + 240),
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

    const api = {
        decideDrivingCamera: decideDrivingCamera,
        computeFollowPadding: computeFollowPadding,
        buildNavigationFollowEasePlan: buildNavigationFollowEasePlan,
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Global for the classic browser scripts (voyagr-app.js).
    root.decideDrivingCamera = decideDrivingCamera;
    root.VoyagrCameraPitch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

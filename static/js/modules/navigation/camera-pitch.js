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

    const api = {
        decideDrivingCamera: decideDrivingCamera,
        computeFollowPadding: computeFollowPadding,
    };

    // CommonJS (Jest) export.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Global for the classic browser scripts (voyagr-app.js).
    root.decideDrivingCamera = decideDrivingCamera;
    root.VoyagrCameraPitch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

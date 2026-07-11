/**
 * @file Pure road-name bar throttle and display helpers (no DOM, no network).
 * @module modules/navigation/road-name-display
 */
(function (root) {
    'use strict';

    var ROAD_NAME_FETCH_INTERVAL_MS = 5000;
    var ROAD_NAME_DISTANCE_THRESHOLD_M = 50;

    /**
     * Whether a road-name fetch should run given throttle state.
     * @param {Object} state
     * @param {number} state.now
     * @param {number} state.lastFetch
     * @param {{ lat: number, lon: number }|null} state.lastPosition
     * @param {number} state.distanceMovedMeters
     * @returns {boolean}
     */
    function shouldFetchRoadName(state) {
        state = state || {};
        if ((state.now - state.lastFetch) < ROAD_NAME_FETCH_INTERVAL_MS) {
            return false;
        }
        if (state.lastPosition && state.distanceMovedMeters < ROAD_NAME_DISTANCE_THRESHOLD_M && state.lastFetch > 0) {
            return false;
        }
        return true;
    }

    /**
     * Road-name fetch tick plan: throttle or API fetch.
     * @param {Object} opts
     * @param {number} opts.lat
     * @param {number} opts.lon
     * @param {number} [opts.now]
     * @param {number} [opts.lastFetch]
     * @param {{ lat: number, lon: number }|null} [opts.lastPosition]
     * @param {function(number,number,number,number): number} [opts.calculateDistance]
     * @returns {Object}
     */
    function buildRoadNameFetchTickPlan(opts) {
        opts = opts || {};
        var now = opts.now != null ? opts.now : Date.now();

        var distanceMovedMeters = 999;
        if (opts.lastPosition && typeof opts.calculateDistance === 'function') {
            distanceMovedMeters = opts.calculateDistance(
                opts.lat,
                opts.lon,
                opts.lastPosition.lat,
                opts.lastPosition.lon
            );
        }

        if (!shouldFetchRoadName({
            now: now,
            lastFetch: opts.lastFetch,
            lastPosition: opts.lastPosition,
            distanceMovedMeters: distanceMovedMeters,
        })) {
            return { action: 'skip', reason: 'throttle' };
        }

        return {
            action: 'fetch',
            url: buildRoadInfoApiUrl(opts.lat, opts.lon),
            statePatch: {
                lastFetch: now,
                lastPosition: { lat: opts.lat, lon: opts.lon },
            },
        };
    }

    /**
     * Apply plan for road-name fetch tick state patches and next action.
     * @param {Object|null|undefined} tick - from buildRoadNameFetchTickPlan
     * @returns {Object}
     */
    function buildRoadNameFetchStateApplyPlan(tick) {
        if (!tick || tick.action === 'skip') {
            return { action: 'skip', reason: tick && tick.reason };
        }
        return {
            action: 'apply',
            fetch: { url: tick.url },
            statePatch: tick.statePatch || {},
        };
    }

    /**
     * DOM apply plan for a successful road-info API response.
     * @param {Object|null|undefined} data
     * @returns {Object}
     */
    function buildRoadNameApiResponseDomApplyPlan(data) {
        if (!data || !data.success || !data.road_name) {
            return { action: 'skip' };
        }
        var barPlan = getRoadNameBarShowPlan(data.road_name);
        return {
            action: 'apply',
            roadName: barPlan.roadName,
            barDisplay: barPlan.barDisplay,
            statePatch: { currentRoadDisplayName: barPlan.roadName },
        };
    }

    /**
     * @param {number} lat
     * @param {number} lon
     * @returns {string}
     */
    function buildRoadInfoApiUrl(lat, lon) {
        return '/api/road-info?lat=' + lat + '&lon=' + lon;
    }

    /**
     * @param {string} roadName
     * @returns {{ roadName: string, barDisplay: string }}
     */
    function getRoadNameBarShowPlan(roadName) {
        return { roadName: roadName || '', barDisplay: 'block' };
    }

    /**
     * @returns {{ roadName: string, barDisplay: string }}
     */
    function getRoadNameBarHidePlan() {
        return { roadName: '', barDisplay: 'none' };
    }

    var api = {
        ROAD_NAME_FETCH_INTERVAL_MS: ROAD_NAME_FETCH_INTERVAL_MS,
        ROAD_NAME_DISTANCE_THRESHOLD_M: ROAD_NAME_DISTANCE_THRESHOLD_M,
        shouldFetchRoadName: shouldFetchRoadName,
        buildRoadNameFetchTickPlan: buildRoadNameFetchTickPlan,
        buildRoadNameFetchStateApplyPlan: buildRoadNameFetchStateApplyPlan,
        buildRoadNameApiResponseDomApplyPlan: buildRoadNameApiResponseDomApplyPlan,
        buildRoadInfoApiUrl: buildRoadInfoApiUrl,
        getRoadNameBarShowPlan: getRoadNameBarShowPlan,
        getRoadNameBarHidePlan: getRoadNameBarHidePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoadNameDisplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

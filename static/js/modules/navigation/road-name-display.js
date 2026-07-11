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
        buildRoadInfoApiUrl: buildRoadInfoApiUrl,
        getRoadNameBarShowPlan: getRoadNameBarShowPlan,
        getRoadNameBarHidePlan: getRoadNameBarHidePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoadNameDisplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

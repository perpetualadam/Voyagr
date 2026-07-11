/**
 * @file Pure movement-detection helpers for navigation ETA progress (no DOM, no globals).
 * @module modules/navigation/movement-detection
 */
(function (root) {
    'use strict';

    var SPEED_THRESHOLD_MS = 0.56; // 2 km/h in m/s
    var DISTANCE_THRESHOLD_M = 50;
    var RECENT_WINDOW_MS = 30000;
    var MIN_HISTORY_POINTS = 3;
    var MIN_RECENT_POINTS = 2;
    var MIN_SPEED_READINGS = 2;

    /**
     * @typedef {Object} TrackingPoint
     * @property {number} lat
     * @property {number} lon
     * @property {number} [speed] - m/s
     * @property {Date} timestamp
     */

    /**
     * Detect if the user has actually started moving from GPS history.
     * @param {Object} o
     * @param {TrackingPoint[]} o.trackingHistory
     * @param {number} [o.nowMs] - Defaults to Date.now()
     * @param {function(number, number, number, number): number} o.haversineDistanceMeters
     * @param {function(string, ...*): void} [o.log] - Optional logger (console.log)
     * @returns {boolean}
     */
    function hasUserStartedMoving(o) {
        o = o || {};
        var history = o.trackingHistory || [];
        var now = typeof o.nowMs === 'number' ? o.nowMs : Date.now();
        var distFn = o.haversineDistanceMeters;
        var log = o.log || function () {};

        if (history.length < MIN_HISTORY_POINTS) return false;

        var recentHistory = history.filter(function (point) {
            if (!point || !point.timestamp) return false;
            var age = now - point.timestamp.getTime();
            return age <= RECENT_WINDOW_MS;
        });

        if (recentHistory.length < MIN_RECENT_POINTS) return false;

        var speedReadings = recentHistory
            .map(function (point) { return point.speed || 0; })
            .filter(function (speed) { return speed > SPEED_THRESHOLD_MS; });

        if (speedReadings.length >= MIN_SPEED_READINGS) {
            log('[Movement Detection] User is moving (speed detected)');
            return true;
        }

        var firstPoint = recentHistory[0];
        var lastPoint = recentHistory[recentHistory.length - 1];
        var distanceMoved = distFn(
            firstPoint.lat, firstPoint.lon,
            lastPoint.lat, lastPoint.lon
        );

        if (distanceMoved > DISTANCE_THRESHOLD_M) {
            log('[Movement Detection] User is moving (moved ' + distanceMoved.toFixed(0) + 'm)');
            return true;
        }

        log('[Movement Detection] User has not started moving yet');
        return false;
    }

    var api = {
        hasUserStartedMoving: hasUserStartedMoving,
        SPEED_THRESHOLD_MS: SPEED_THRESHOLD_MS,
        DISTANCE_THRESHOLD_M: DISTANCE_THRESHOLD_M,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMovementDetection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

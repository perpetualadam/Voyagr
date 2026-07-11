/**
 * @file Pure live data refresh interval and fetch notification plans (no DOM).
 * @module modules/navigation/live-data-refresh
 */
(function (root) {
    'use strict';

    var REFRESH_INTERVALS = {
        traffic_navigation: 300000,
        traffic_idle: 900000,
        eta: 30000,
        weather_navigation: 1800000,
        weather_idle: 3600000,
        hazards_navigation: 300000,
        hazards_idle: 600000,
    };

    /**
     * Scale a base refresh interval based on battery level.
     * @param {number} baseIntervalMs
     * @param {number} [batteryLevel] - 0..1
     * @param {boolean} [hasBatteryApi]
     * @returns {{ intervalMs: number }}
     */
    function buildAdaptiveRefreshIntervalPlan(baseIntervalMs, batteryLevel, hasBatteryApi) {
        var base = baseIntervalMs > 0 ? baseIntervalMs : REFRESH_INTERVALS.eta;
        if (!hasBatteryApi) {
            return { intervalMs: base };
        }
        var level = Number.isFinite(batteryLevel) ? batteryLevel : 1;
        if (level < 0.15) {
            return { intervalMs: Math.round(base * 3) };
        }
        if (level < 0.30) {
            return { intervalMs: Math.round(base * 2) };
        }
        if (level < 0.50) {
            return { intervalMs: Math.round(base * 1.5) };
        }
        return { intervalMs: base };
    }

    /**
     * Execute plan for starting navigation live-data refresh timers.
     * @param {Object} [input]
     * @param {boolean} [input.routeInProgress]
     * @param {number} [input.batteryLevel]
     * @param {boolean} [input.hasBatteryApi]
     * @returns {Object}
     */
    function buildStartLiveDataRefreshExecutePlan(input) {
        input = input || {};
        if (!input.routeInProgress) {
            return { shouldStart: false };
        }
        var battery = input.batteryLevel != null ? input.batteryLevel : 1;
        var hasBatteryApi = !!input.hasBatteryApi;
        return {
            shouldStart: true,
            stopExistingFirst: true,
            intervals: {
                traffic: buildAdaptiveRefreshIntervalPlan(
                    REFRESH_INTERVALS.traffic_navigation, battery, hasBatteryApi
                ).intervalMs,
                eta: buildAdaptiveRefreshIntervalPlan(
                    REFRESH_INTERVALS.eta, battery, hasBatteryApi
                ).intervalMs,
                weather: buildAdaptiveRefreshIntervalPlan(
                    REFRESH_INTERVALS.weather_navigation, battery, hasBatteryApi
                ).intervalMs,
                hazard: buildAdaptiveRefreshIntervalPlan(
                    REFRESH_INTERVALS.hazards_navigation, battery, hasBatteryApi
                ).intervalMs,
            },
            timerActions: {
                traffic: 'refreshTrafficData',
                eta: 'updateETACalculationThenAnnounceETA',
                weather: 'refreshWeatherData',
                hazard: 'processNavigationHazardAlerts',
            },
            hazardRequiresGps: true,
            startLogMessage: '[Live Data] Refresh intervals started',
        };
    }

    /**
     * Execute plan for stopping navigation live-data refresh timers.
     * @returns {Object}
     */
    function buildStopLiveDataRefreshExecutePlan() {
        return {
            shouldStop: true,
            timerKeys: ['traffic', 'eta', 'weather', 'hazard'],
            stopLogMessage: '[Live Data] Refresh intervals stopped',
        };
    }

    /**
     * Preflight for traffic pattern refresh during navigation.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildRefreshTrafficDataPreflightPlan(input) {
        input = input || {};
        if (!input.routeInProgress || input.lat == null || input.lon == null) {
            return { shouldFetch: false };
        }
        return {
            shouldFetch: true,
            url: '/api/traffic-patterns?lat=' + input.lat + '&lon=' + input.lon,
            errorLogPrefix: '[Traffic] Refresh error:',
        };
    }

    /**
     * Notification plan from traffic patterns API response.
     * @param {Object} [data]
     * @returns {Object}
     */
    function buildRefreshTrafficDataNotificationPlan(data) {
        data = data || {};
        if (!data.success || !data.patterns || !data.patterns.length) {
            return { shouldNotify: false };
        }
        var pattern = data.patterns[0];
        if (!pattern || pattern.congestion <= 2) {
            return { shouldNotify: false };
        }
        return {
            shouldNotify: true,
            notification: {
                title: '🚗 Traffic Update',
                message: 'Heavy traffic ahead (Congestion: ' + pattern.congestion + '/5)',
                type: 'warning',
            },
        };
    }

    /**
     * Preflight for weather refresh during navigation.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildRefreshWeatherDataPreflightPlan(input) {
        input = input || {};
        if (input.lat == null || input.lon == null) {
            return { shouldFetch: false };
        }
        return {
            shouldFetch: true,
            url: '/api/weather?lat=' + input.lat + '&lon=' + input.lon,
            errorLogPrefix: '[Weather] Refresh error:',
        };
    }

    var SEVERE_WEATHER_KEYWORDS = ['rain', 'storm', 'snow'];

    /**
     * Notification plan from weather API response.
     * @param {Object} [data]
     * @returns {Object}
     */
    function buildRefreshWeatherDataNotificationPlan(data) {
        data = data || {};
        if (!data.success || !data.description) {
            return { shouldNotify: false };
        }
        var desc = String(data.description).toLowerCase();
        var severe = SEVERE_WEATHER_KEYWORDS.some(function (word) {
            return desc.indexOf(word) !== -1;
        });
        if (!severe) {
            return { shouldNotify: false };
        }
        return {
            shouldNotify: true,
            notification: {
                title: '⛈️ Weather Alert',
                message: data.description + ' ahead',
                type: 'warning',
            },
        };
    }

    var api = {
        REFRESH_INTERVALS: REFRESH_INTERVALS,
        SEVERE_WEATHER_KEYWORDS: SEVERE_WEATHER_KEYWORDS,
        buildAdaptiveRefreshIntervalPlan: buildAdaptiveRefreshIntervalPlan,
        buildStartLiveDataRefreshExecutePlan: buildStartLiveDataRefreshExecutePlan,
        buildStopLiveDataRefreshExecutePlan: buildStopLiveDataRefreshExecutePlan,
        buildRefreshTrafficDataPreflightPlan: buildRefreshTrafficDataPreflightPlan,
        buildRefreshTrafficDataNotificationPlan: buildRefreshTrafficDataNotificationPlan,
        buildRefreshWeatherDataPreflightPlan: buildRefreshWeatherDataPreflightPlan,
        buildRefreshWeatherDataNotificationPlan: buildRefreshWeatherDataNotificationPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrLiveDataRefresh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

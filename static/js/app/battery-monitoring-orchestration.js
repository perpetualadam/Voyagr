/**
 * @file Battery level monitoring orchestration (adaptive refresh + low-battery alerts).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var currentBatteryLevel = 1.0;

    function rt() {
        if (!runtime) {
            throw new Error('[BatteryMonitoring] Orchestration runtime not bound');
        }
        return runtime;
    }

    function initBatteryMonitoring() {
        if (window.__voyagrBatteryMonitoringInitialized) {
            return;
        }
        window.__voyagrBatteryMonitoringInitialized = true;

        if ('getBattery' in navigator) {
            navigator.getBattery().then((battery) => {
                currentBatteryLevel = battery.level;
                console.log('[Battery] Initial level:', (currentBatteryLevel * 100).toFixed(0) + '%');

                battery.addEventListener('levelchange', () => {
                    currentBatteryLevel = battery.level;
                    console.log('[Battery] Level changed:', (currentBatteryLevel * 100).toFixed(0) + '%');

                    if (currentBatteryLevel < 0.30 && rt().getRouteInProgress()) {
                        rt().call.sendNotification(
                            '🔋 Low Battery',
                            'Battery at ' + (currentBatteryLevel * 100).toFixed(0) + '%. Refresh intervals adjusted.',
                            'warning'
                        );
                    }
                });

                battery.addEventListener('chargingtimechange', () => {
                    console.log('[Battery] Charging time changed');
                });

                battery.addEventListener('dischargingtimechange', () => {
                    console.log('[Battery] Discharging time changed');
                });

                battery.addEventListener('chargingchange', () => {
                    console.log('[Battery] Charging status changed:', battery.charging ? 'charging' : 'discharging');
                });
            }).catch((e) => {
                console.log('[Battery] API error:', e);
            });
        } else {
            console.log('[Battery] Battery Status API not supported');
        }
    }

    function getCurrentBatteryLevel() {
        return currentBatteryLevel;
    }

    function setCurrentBatteryLevel(level) {
        currentBatteryLevel = level;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        initBatteryMonitoring: initBatteryMonitoring,
        getCurrentBatteryLevel: getCurrentBatteryLevel,
        setCurrentBatteryLevel: setCurrentBatteryLevel,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrBatteryMonitoringOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Phase 3 feature init orchestration (gesture API, battery saving, ML, AR).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[Phase3Features] Orchestration runtime not bound');
        }
        return runtime;
    }

    function P3() { return rt().phase3Features(); }

    function applyGestureSettingsFromApiPlan(execute) {
        if (!execute || !execute.shouldApply) return;
        const toggleUi = rt().toggleUI();
        rt().setGestureEnabled(execute.enabled);
        rt().setGestureSensitivity(execute.sensitivity);
        rt().setGestureAction(execute.action);

        const toggle = document.getElementById(execute.toggle.id);
        if (toggle) toggleUi.applyToggleButton(toggle, execute.toggle.enabled);

        const sensitivityEl = document.getElementById(execute.sensitivitySelect.id);
        if (sensitivityEl) sensitivityEl.value = execute.sensitivitySelect.value;

        const actionEl = document.getElementById(execute.actionSelect.id);
        if (actionEl) actionEl.value = execute.actionSelect.value;

        const settingsPanel = document.getElementById(execute.settingsPanel.id);
        if (settingsPanel) settingsPanel.style.display = execute.settingsPanel.display;

        localStorage.setItem(execute.storageKey, execute.storageValue);
        if (execute.addDeviceMotionListener) {
            window.addEventListener('devicemotion', rt().call.handleDeviceMotion);
        }
    }

    function initPhase3Features() {
        const phase3 = P3();
        const orch = phase3.buildInitPhase3FeaturesOrchestrationPlan();
        if (window[orch.initFlagProperty]) {
            return;
        }
        window[orch.initFlagProperty] = true;

        if (orch.loadGestureFromApi) {
            const gestureControl = rt().gestureControl();
            const fetchPlan = gestureControl.buildLoadGestureSettingsFetchPlan();
            fetch(fetchPlan.url)
                .then((response) => response.json())
                .then((data) => {
                    if (data.success) {
                        applyGestureSettingsFromApiPlan(
                            gestureControl.buildApplyGestureSettingsFromApiExecutePlan(data.settings, {
                                hasDeviceMotion: 'DeviceMotionEvent' in window,
                            })
                        );
                    }
                })
                .catch((error) => console.error(fetchPlan.errorLogPrefix, error));
        }

        if (orch.initBatteryMonitoring) {
            const batteryPlan = phase3.buildInitBatteryMonitoringPlan({
                hasGetBattery: 'getBattery' in navigator,
            });
            if (batteryPlan.shouldInit) {
                navigator.getBattery().then((battery) => {
                    rt().call.updateBatteryStatus(battery);
                    (batteryPlan.listeners || []).forEach((eventName) => {
                        battery.addEventListener(eventName, () => rt().call.updateBatteryStatus(battery));
                    });
                });
            }
        }

        if (orch.loadMlPredictions) rt().call.loadMLPredictions();

        if (orch.loadArSetting) {
            const arExecute = phase3.buildLoadArSettingExecutePlan();
            const mapControls = rt().mapControls();
            const toggleUi = rt().toggleUI();
            if (arExecute.shouldApply) {
                const arEnabled = mapControls.isAREnabledInStorage(localStorage);
                rt().setIsAREnabled(arEnabled);
                const arToggleBtn = document.getElementById(arExecute.toggleId);
                if (arToggleBtn) {
                    toggleUi.applyToggleButton(arToggleBtn, arEnabled, toggleUi.TOGGLE_SWITCH_OPTS);
                }
            }
        }
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        initPhase3Features: initPhase3Features,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPhase3FeaturesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

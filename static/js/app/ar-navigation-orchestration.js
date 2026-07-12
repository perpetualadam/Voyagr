/**
 * @file AR navigation mode orchestration (WebXR / camera overlay).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var arNavigator = null;

    function rt() {
        if (!runtime) {
            throw new Error('[ArNavigation] Orchestration runtime not bound');
        }
        return runtime;
    }

    function MC() { return rt().mapControls(); }
    function TU() { return rt().toggleUI(); }

    function toggleARSetting() {
        const collected = MC().buildToggleARSettingCollectPlan({
            currentlyEnabled: rt().getIsAREnabled(),
        });
        const execute = MC().buildToggleARSettingExecutePlan({
            enabled: collected.enabled,
            arModeActive: rt().getArModeActive(),
        });
        const btn = document.getElementById(execute.toggleId);
        if (!btn) return;

        rt().setIsAREnabled(execute.enabled);
        TU().applyToggleButton(btn, rt().getIsAREnabled(), TU().TOGGLE_SWITCH_OPTS);
        MC().writeAREnabledToStorage(localStorage, rt().getIsAREnabled());

        if (execute.updateFabVisibility) updateARButtonVisibility();

        rt().call.showStatus(execute.statusMessage, execute.statusType);
        if (execute.stopArModeIfDisabling) stopARMode();
    }

    function updateARButtonVisibility() {
        const arFab = document.getElementById(MC().AR_MODE_FAB_ID);
        if (!arFab) return;

        const hasRoute = window.lastCalculatedRoute !== null;
        const display = MC().getARFabVisibilityDisplay(
            rt().getIsAREnabled(),
            hasRoute,
            rt().getRouteInProgress()
        );
        arFab.style.display = display.display;
        if (display.textContent != null) {
            arFab.textContent = display.textContent;
        }
    }

    async function toggleARMode() {
        const entry = MC().buildToggleARModeEntryPlan({ arModeActive: rt().getArModeActive() });
        const toggleBtn = document.getElementById(entry.toggleId);

        if (entry.shouldStop) {
            await stopARMode();
            if (entry.applyToggleOff) MC().applyARModeToggleButton(toggleBtn, false, TU());
            return;
        }

        try {
            const mod = await import(entry.moduleImportPath);
            const ARNavigator = mod.ARNavigator;

            if (!arNavigator) {
                arNavigator = new ARNavigator({
                    onError: (err) => {
                        rt().call.showStatus('AR Error: ' + err.message, 'error');
                    },
                    onStatusChange: (status) => {
                        console.log('[AR] Status:', status);
                        updateARButtonState(status);
                    },
                });
            }

            rt().call.showStatus(entry.startingStatusMessage, entry.startingStatusType);

            const result = await arNavigator.start();
            const resultPlan = MC().buildToggleARModeStartResultPlan(result);

            if (resultPlan.shouldApply) {
                rt().setArModeActive(resultPlan.arModeActive);
                if (resultPlan.applyToggleOn) MC().applyARModeToggleButton(toggleBtn, true, TU());
                rt().call.showStatus(resultPlan.statusMessage, resultPlan.statusType);

                const currentRouteSteps = rt().getCurrentRouteSteps();
                const currentStepIndex = rt().getCurrentStepIndex();
                if (resultPlan.syncCurrentInstruction && currentRouteSteps && currentStepIndex < currentRouteSteps.length) {
                    const step = currentRouteSteps[currentStepIndex];
                    arNavigator.updateInstruction({
                        instruction: step.instruction,
                        direction: rt().turnInstructions().maneuverTypeToARDirectionKey(step.type),
                        distance: rt().getNextManeuverDistance(),
                    });
                }
            } else {
                rt().call.showStatus(resultPlan.statusMessage, resultPlan.statusType);
            }
        } catch (err) {
            console.error(entry.loadErrorLogPrefix, err);
            rt().call.showStatus(entry.loadErrorStatusMessage, 'error');
        }
    }

    async function stopARMode() {
        if (arNavigator) {
            await arNavigator.stop();
        }
        const execute = MC().buildStopARModeExecutePlan();
        rt().setArModeActive(execute.arModeActive);
        MC().applyARModeToggleButton(
            document.getElementById(execute.toggleId),
            false,
            TU()
        );
        if (execute.statusMessage) rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    function updateARButtonState(status) {
        MC().applyARModeButtonState(document.getElementById('arModeBtn'), status);
    }

    function updateARInstruction(turnInfo) {
        if (!rt().getArModeActive() || !arNavigator) return;

        arNavigator.updateInstruction({
            instruction: turnInfo?.instruction || 'Follow route',
            direction: turnInfo?.direction || 'straight',
            distance: turnInfo?.distance || 0,
        });
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        toggleARSetting: toggleARSetting,
        updateARButtonVisibility: updateARButtonVisibility,
        toggleARMode: toggleARMode,
        stopARMode: stopARMode,
        updateARButtonState: updateARButtonState,
        updateARInstruction: updateARInstruction,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrArNavigationOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

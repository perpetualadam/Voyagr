/**
 * @file Gesture control orchestration (shake removed; stubs keep call sites stable).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var gestureEnabled = false;
    var gestureSensitivity = 'medium';
    var gestureAction = 'recalculate';

    function rt() {
        if (!runtime) {
            throw new Error('[GestureControl] Orchestration runtime not bound');
        }
        return runtime;
    }

    function GC() { return rt().gestureControl(); }

    function handleDeviceMotion(event) {
        // Shake gesture removed — ignore device motion.
        return;
    }

    function triggerGestureAction() {
        const gestureControl = GC();
        const execute = gestureControl.buildGestureActionExecutePlan({ action: gestureAction });
        if (!execute.shouldApply) return;
    }

    function toggleGestureControl() {
        const gestureControl = GC();
        const toggleUi = rt().toggleUI();
        const collected = gestureControl.buildToggleGestureControlCollectPlan({ currentlyEnabled: gestureEnabled });
        const execute = gestureControl.buildToggleGestureControlExecutePlan({
            enabled: collected.enabled,
            hasDeviceMotion: 'DeviceMotionEvent' in window,
        });
        if (!execute.shouldApply) return;

        gestureEnabled = false;
        const toggleEl = document.getElementById(execute.toggle.id);
        if (toggleEl) toggleUi.applyToggleButton(toggleEl, false);

        const settingsPanel = document.getElementById(execute.settingsPanel.id);
        if (settingsPanel) settingsPanel.style.display = 'none';

        localStorage.setItem(execute.storageKey, false);

        fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.persistApiBody),
        }).catch((error) => console.error('Error updating gesture setting:', error));

        window.removeEventListener('devicemotion', handleDeviceMotion);
        if (execute.statusMessage) {
            rt().call.showStatus(execute.statusMessage, execute.statusType);
        }
    }

    function updateGestureSensitivity() {
        const gestureControl = GC();
        const execute = gestureControl.buildUpdateGestureSensitivityExecutePlan({
            value: document.getElementById(gestureControl.GESTURE_SENSITIVITY_ID).value,
        });
        if (!execute.shouldApply) return;
        gestureSensitivity = execute.sensitivity;
        fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.persistApiBody),
        }).catch((error) => console.error(execute.errorLogPrefix, error));
    }

    function updateGestureAction() {
        const gestureControl = GC();
        const execute = gestureControl.buildUpdateGestureActionExecutePlan({
            value: document.getElementById(gestureControl.GESTURE_ACTION_ID).value,
        });
        if (!execute.shouldApply) return;
        gestureAction = execute.action;
        fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.persistApiBody),
        }).catch((error) => console.error(execute.errorLogPrefix, error));
    }

    function setGestureEnabled(val) {
        // Shake gesture removed — remain disabled regardless of callers.
        gestureEnabled = false;
    }

    function setGestureSensitivity(val) {
        gestureSensitivity = val;
    }

    function setGestureAction(val) {
        gestureAction = val;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        handleDeviceMotion: handleDeviceMotion,
        triggerGestureAction: triggerGestureAction,
        toggleGestureControl: toggleGestureControl,
        updateGestureSensitivity: updateGestureSensitivity,
        updateGestureAction: updateGestureAction,
        setGestureEnabled: setGestureEnabled,
        setGestureSensitivity: setGestureSensitivity,
        setGestureAction: setGestureAction,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrGestureControlOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

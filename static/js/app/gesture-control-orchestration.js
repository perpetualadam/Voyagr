/**
 * @file Gesture control orchestration (shake detection, toggle, sensitivity/action).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var shakeCount = 0;
    var lastShakeTime = 0;
    var gestureEnabled = true;
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
        if (!gestureEnabled) return;

        const gestureControl = GC();
        const accel = event.acceleration;
        if (!accel) return;

        const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
        const detection = gestureControl.buildGestureShakeDetectionPlan({
            magnitude,
            sensitivity: gestureSensitivity,
            lastShakeTime,
            shakeCount,
            now: Date.now(),
        });
        shakeCount = detection.shakeCount;
        lastShakeTime = detection.lastShakeTime;
        if (detection.shouldTrigger) {
            triggerGestureAction();
        }
    }

    function triggerGestureAction() {
        const gestureControl = GC();
        const execute = gestureControl.buildGestureActionExecutePlan({ action: gestureAction });
        if (!execute.shouldApply) return;

        const indicator = document.getElementById(execute.indicator.id);
        if (indicator) {
            indicator.classList.add(execute.indicator.showClass);
            setTimeout(() => indicator.classList.remove(execute.indicator.showClass), execute.indicator.hideAfterMs);
        }

        if ('vibrate' in navigator) {
            navigator.vibrate(execute.vibrateMs);
        }

        fetch('/api/gesture-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.logApiBody),
        }).catch((error) => console.error('Error logging gesture:', error));

        if (execute.triggerRecalculate) {
            rt().call.showStatus(execute.statusMessage, execute.statusType);
            rt().call.calculateRoute();
        } else if (execute.triggerClear) {
            rt().call.showStatus(execute.statusMessage, execute.statusType);
            rt().call.clearForm();
        } else {
            rt().call.showStatus(execute.statusMessage, execute.statusType);
        }
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

        gestureEnabled = execute.enabled;
        toggleUi.applyToggleButton(document.getElementById(execute.toggle.id), execute.toggle.enabled);

        const settingsPanel = document.getElementById(execute.settingsPanel.id);
        if (settingsPanel) settingsPanel.style.display = execute.settingsPanel.display;

        localStorage.setItem(execute.storageKey, execute.storageValue);

        fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.persistApiBody),
        }).catch((error) => console.error('Error updating gesture setting:', error));

        if (execute.addDeviceMotionListener) {
            window.addEventListener('devicemotion', handleDeviceMotion);
        }
        if (execute.removeDeviceMotionListener) {
            window.removeEventListener('devicemotion', handleDeviceMotion);
        }
        rt().call.showStatus(execute.statusMessage, execute.statusType);
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
        gestureEnabled = val;
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

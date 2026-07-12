/**
 * @file ML predictions orchestration (load suggestions, toggle preference).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[MlPredictions] Orchestration runtime not bound');
        }
        return runtime;
    }

    function ML() { return rt().mlPredictions(); }

    function loadMLPredictions() {
        const mlPredictions = ML();
        const fetchPlan = mlPredictions.buildLoadMlPredictionsFetchPlan();
        if (!fetchPlan.shouldFetch) return;

        fetch(fetchPlan.url)
            .then((response) => response.json())
            .then((data) => {
                const render = mlPredictions.buildLoadMlPredictionsDomRenderPlan(data);
                if (!render.shouldRender) return;

                const section = document.getElementById(fetchPlan.sectionId);
                const list = document.getElementById(fetchPlan.listId);
                if (!section || !list) return;

                list.innerHTML = '';
                (render.items || []).forEach((item) => {
                    const el = document.createElement('div');
                    el.className = item.className;
                    el.innerHTML = item.html;
                    el.onclick = () => {
                        document.getElementById(fetchPlan.startInputId).value = item.routeInputs.start;
                        document.getElementById(fetchPlan.endInputId).value = item.routeInputs.end;
                        rt().call.calculateRoute();
                    };
                    list.appendChild(el);
                });
                section.classList.add(render.sectionShowClass);
            })
            .catch((error) => console.error(fetchPlan.errorLogPrefix, error));
    }

    function toggleMLPredictions() {
        const mlPredictions = ML();
        const toggleUi = rt().toggleUI();
        const button = document.getElementById('mlPredictionsEnabled');
        if (!button) return;

        const collected = mlPredictions.buildToggleMlPredictionsCollectPlan({
            currentEnabled: button.classList.contains('active'),
        });
        const execute = mlPredictions.buildToggleMlPredictionsExecutePlan({ enabled: collected.enabled });
        if (!execute.shouldApply) return;

        toggleUi.applyLabeledToggleButton(button, execute.toggle.enabled);
        localStorage.setItem(execute.storageKey, execute.storageValue);

        fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.persistApiBody),
        }).catch((error) => console.error('Error updating ML predictions:', error));

        if (execute.loadPredictions) loadMLPredictions();
        if (execute.hideSection) {
            const section = document.getElementById(execute.sectionId);
            if (section) section.classList.remove(execute.sectionShowClass);
        }
        rt().call.showStatus(execute.statusMessage, execute.statusType);
        if (execute.saveAllSettings) rt().call.saveAllSettings();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        loadMLPredictions: loadMLPredictions,
        toggleMLPredictions: toggleMLPredictions,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMlPredictionsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

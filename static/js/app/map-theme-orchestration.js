/**
 * @file Map theme orchestration (style switch, 3D buildings, road labels reinit).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var currentMapTheme =
        typeof localStorage !== 'undefined' ? localStorage.getItem('mapTheme') || 'standard' : 'standard';

    function rt() {
        if (!runtime) {
            throw new Error('[MapTheme] Orchestration runtime not bound');
        }
        return runtime;
    }

    function setMapTheme(themeOrEvent) {
        const mapTheme = rt().mapTheme();
        const map = rt().getMap();
        const execute = mapTheme.buildSetMapThemeExecutePlan({
            themeOrEvent,
            currentMapTheme,
            hasMap: !!map,
            buildings3DEnabled: rt().getBuildings3DEnabled(),
            toAbs: window.__voyagrToAbsoluteOriginUrl || ((u) => u),
            preferredFallbackStyleUrl: window.__voyagrPreferredFallbackStyleUrl,
        });
        if (!execute.shouldApply) return;

        localStorage.setItem(execute.storageKey, execute.storageValue);

        const mapThemeRow = document.getElementById(execute.selectorId);
        if (mapThemeRow) {
            mapThemeRow.querySelectorAll('.theme-option').forEach((btn) => {
                btn.classList.remove('active');
            });
        }
        const activeBtn = document.querySelector(execute.activeButtonSelector);
        if (activeBtn) activeBtn.classList.add('active');

        if (!execute.hasMap) {
            console.warn(execute.mapNotReadyLog);
            currentMapTheme = execute.theme;
            return;
        }
        if (execute.skipStyleReload) {
            console.log(execute.alreadyActiveLog);
            return;
        }

        currentMapTheme = execute.theme;
        const resolveUrls = window.__voyagrResolveStyleUrls || ((s) => s);
        const chosenUrl = execute.stylePlan.chosenUrl;

        let resolvedStyle = null;
        if (execute.syncFetchStyle) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', chosenUrl, false);
                xhr.send();
                if (xhr.status === 200) {
                    resolvedStyle = JSON.parse(xhr.responseText);
                    resolveUrls(resolvedStyle);
                }
            } catch (e) {
                console.warn(execute.syncFetchErrorLogPrefix, e.message);
            }
        }

        map.setStyle(resolvedStyle || chosenUrl);

        map.once('style.load', () => {
            if (execute.postStyleLoad.add3DBuildings) {
                rt().getMapLibreHelpers().add3DBuildings(map, {
                    heightMultiplier: rt().getBuildings3DHeightMultiplier(),
                    opacity: rt().getBuildings3DOpacity()
                });
            }
            if (execute.postStyleLoad.reinitRoadLabels) {
                rt().call.initializeRoadLabels();
            }
        });

        rt().call.showStatus(execute.statusMessage, execute.statusType);
        if (execute.saveAllSettings) rt().call.saveAllSettings();

        fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execute.persistApiBody),
        }).catch((error) => console.error('Error updating map theme:', error));
    }

    function getCurrentMapTheme() {
        return currentMapTheme;
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        setMapTheme: setMapTheme,
        getCurrentMapTheme: getCurrentMapTheme,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapThemeOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

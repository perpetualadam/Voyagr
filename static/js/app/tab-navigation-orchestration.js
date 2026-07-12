/**
 * @file Bottom sheet tab navigation orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var previousTab = 'navigation';

    function rt() {
        if (!runtime) {
            throw new Error('[TabNavigation] Orchestration runtime not bound');
        }
        return runtime;
    }

    function getCurrentVisibleTab() {
        const tabs = [
            'navigationTab', 'settingsTab', 'tripHistoryTab', 'routeComparisonTab',
            'routeSharingTab', 'routeAnalyticsTab', 'savedRoutesTab', 'routePreviewTab', 'dashcamTab',
        ];

        for (let i = 0; i < tabs.length; i++) {
            const tabId = tabs[i];
            const tab = document.getElementById(tabId);
            if (tab && tab.style.display !== 'none') {
                return tabId.replace('Tab', '');
            }
        }
        return 'navigation';
    }

    function loadUnitPreferences() {
        const execute = rt().units().buildLoadUnitPreferencesDomApplyPlan({
            distanceUnit: rt().getDistanceUnit(),
            currencyUnit: rt().getCurrencyUnit(),
            speedUnit: rt().getSpeedUnit(),
            temperatureUnit: rt().getTemperatureUnit(),
        });
        if (!execute.shouldApply) return;
        rt().call.applyDomSelectsFromPlan(execute.selects);
    }

    function switchTab(tab) {
        const navigationTab = document.getElementById('navigationTab');
        const settingsTab = document.getElementById('settingsTab');
        const tripHistoryTab = document.getElementById('tripHistoryTab');
        const routeComparisonTab = document.getElementById('routeComparisonTab');
        const routeSharingTab = document.getElementById('routeSharingTab');
        const routeAnalyticsTab = document.getElementById('routeAnalyticsTab');
        const savedRoutesTab = document.getElementById('savedRoutesTab');
        const routePreviewTab = document.getElementById('routePreviewTab');
        const dashcamTab = document.getElementById('dashcamTab');
        const sheetTitle = document.getElementById('sheetTitle');
        const bottomSheetContent = document.querySelector('.bottom-sheet-content');

        console.log('[SwitchTab] Switching to tab:', tab);

        const currentTab = getCurrentVisibleTab();
        if (currentTab && currentTab !== tab) {
            previousTab = currentTab;
            console.log('[SwitchTab] Previous tab stored:', previousTab);
        }

        if (bottomSheetContent) {
            bottomSheetContent.scrollTop = 0;
        }

        if (navigationTab) navigationTab.style.display = 'none';
        if (settingsTab) settingsTab.style.display = 'none';
        if (tripHistoryTab) tripHistoryTab.style.display = 'none';
        if (routeComparisonTab) routeComparisonTab.style.display = 'none';
        if (routeSharingTab) routeSharingTab.style.display = 'none';
        if (routeAnalyticsTab) routeAnalyticsTab.style.display = 'none';
        if (savedRoutesTab) savedRoutesTab.style.display = 'none';
        if (routePreviewTab) routePreviewTab.style.display = 'none';
        if (dashcamTab) dashcamTab.style.display = 'none';

        if (tab === 'settings') {
            settingsTab.style.display = 'block';
            sheetTitle.textContent = '⚙️ Settings';
            loadUnitPreferences();
            rt().call.loadRoutePreferences();
            rt().call.loadMultiDropPreferences();
            rt().call.loadVoicePreferences();
            rt().call.loadPorcupineWakeUi();
            rt().call.loadCameraAlertPreferences();
            rt().call.loadAvoidancePreferences();
            rt().call.loadHazardCameraTogglesFromApi();
            rt().call.loadPromoEntitlementStatus();
        } else if (tab === 'tripHistory') {
            tripHistoryTab.style.display = 'block';
            sheetTitle.textContent = '📋 Trip History';
            rt().call.loadTripHistory();
        } else if (tab === 'routePreview') {
            console.log('[SwitchTab] Switching to routePreview tab, element:', routePreviewTab);
            if (routePreviewTab) {
                routePreviewTab.style.display = 'block';
                sheetTitle.textContent = '📍 Route Preview';
                console.log('[SwitchTab] routePreviewTab displayed successfully');
            } else {
                console.error('[SwitchTab] routePreviewTab element not found!');
            }
        } else if (tab === 'routeComparison') {
            routeComparisonTab.style.display = 'block';
            sheetTitle.textContent = '🛣️ Route Options';
            rt().call.displayRouteComparison();
        } else if (tab === 'routeSharing') {
            routeSharingTab.style.display = 'block';
            sheetTitle.textContent = '🔗 Share Route';
            rt().call.prepareRouteSharing();
        } else if (tab === 'routeAnalytics') {
            routeAnalyticsTab.style.display = 'block';
            sheetTitle.textContent = '📊 Analytics';
            rt().call.loadRouteAnalytics();
        } else if (tab === 'savedRoutes') {
            savedRoutesTab.style.display = 'block';
            sheetTitle.textContent = '⭐ Saved Routes';
            rt().call.loadSavedRoutes();
        } else if (tab === 'dashcam') {
            if (dashcamTab) dashcamTab.style.display = 'block';
            sheetTitle.textContent = '📹 Dashcam';
        } else if (tab === 'navigation') {
            if (navigationTab) navigationTab.style.display = 'block';
            sheetTitle.textContent = '🗺️ Navigation';
        } else {
            if (navigationTab) navigationTab.style.display = 'block';
            sheetTitle.textContent = '🗺️ Navigation';
        }
    }

    function goBackToPreviousTab() {
        console.log('[GoBack] Returning to previous tab:', previousTab);
        switchTab(previousTab);
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        switchTab: switchTab,
        getCurrentVisibleTab: getCurrentVisibleTab,
        goBackToPreviousTab: goBackToPreviousTab,
        loadUnitPreferences: loadUnitPreferences,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTabNavigationOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

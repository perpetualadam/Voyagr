/**
 * @file Pure navigation map control button icon constants (no DOM).
 * @module modules/map/map-controls
 */
(function (root) {
    'use strict';

    var ZOOM_FOLLOW_ENABLED_ICON = '📍';
    var ZOOM_FOLLOW_DISABLED_ICON = '🔓';
    var JOURNEY_OVERVIEW_ICON = '🗺️';
    var JOURNEY_RETURN_ICON = '📍';
    var AR_ACTIVE_LABEL = '🎯 Exit AR';
    var AR_INACTIVE_LABEL = '📷 AR View';
    var JOURNEY_OVERVIEW_ACTIVE_BACKGROUND = '#4CAF50';
    var JOURNEY_OVERVIEW_INACTIVE_BACKGROUND = '#9C27B0';
    var ZOOM_FOLLOW_ACTIVE_BACKGROUND = '#FF9800';
    var ZOOM_FOLLOW_INACTIVE_BACKGROUND = '#9E9E9E';
    var AR_PREF_STORAGE_KEY = 'voyagr_ar_enabled';
    var AR_FAB_VISIBLE_ICON = '👓';

    var MAP_CONTROLS_HINT_SECTIONS = [
        { title: 'Map (round buttons)', selector: '.fab-container .fab, #navControlButtons .fab' },
        { title: 'Bottom sheet toolbar', selector: '.sheet-toolbar .sheet-icon-btn' },
    ];

    var MAP_CONTROLS_HINT_EXTRAS = [
        '\u2014 After you calculate a route, \u201cStart navigation\u201d can appear on the map.',
        '\u2014 During turn-by-turn, Zoom & follow, Recenter, and Journey overview may appear as round buttons.',
        '\u2014 Long-press any round map icon ~\u00bds for this same text as a bottom banner.',
    ];

    var MAP_CONTROLS_HINT_SKIP_IDS = ['mapControlsHintFab'];
    var MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE = 'Often hidden until you need them';

    var MAP_HINT_TOAST_ID = 'mapHintToast';
    var MAP_HINT_TOAST_VISIBLE_CLASS = 'is-visible';
    var MAP_HINT_TOAST_TIMER_PROPERTY = '__voyagrMapHintToastT';
    var MAP_HINT_AUTO_DISMISS_MS = 4200;
    var MAP_ICON_HINT_LONG_PRESS_MS = 420;
    var MAP_ICON_HINT_MOVE_PX2 = 100;
    var MAP_ICON_HINT_ROOT_SELECTORS = ['.fab-container', '#navControlButtons', '.sheet-toolbar'];
    var MAP_ICON_HINT_BUTTON_SELECTOR = 'button.fab, button.sheet-icon-btn';
    var MAP_CONTROLS_HINT_MODAL_ID = 'mapControlsHintModal';
    var MAP_CONTROLS_HINT_LIST_ID = 'mapControlsHintList';
    var FAB_LONG_PRESS_HINT_DATASET = 'voyagrLongPressHint';
    var FAB_SUPPRESS_CLICK_DATASET = 'voyagrSuppressClick';

    /**
     * @returns {Object}
     */
    function buildOpenMapControlsHintModalExecutePlan() {
        return {
            shouldOpen: true,
            modalId: MAP_CONTROLS_HINT_MODAL_ID,
            listId: MAP_CONTROLS_HINT_LIST_ID,
            sections: MAP_CONTROLS_HINT_SECTIONS.slice(),
            extrasSectionTitle: MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE,
            extras: MAP_CONTROLS_HINT_EXTRAS.slice(),
            sectionTitleClass: 'map-hint-section-title',
            itemClass: 'map-hint-item',
            modalDisplay: 'block',
        };
    }

    /**
     * @returns {Object}
     */
    function buildCloseMapControlsHintModalExecutePlan() {
        return {
            shouldClose: true,
            modalId: MAP_CONTROLS_HINT_MODAL_ID,
            modalDisplay: 'none',
        };
    }

    /**
     * @param {Object} [initPlan]
     * @returns {Object}
     */
    function buildFabLongPressHintBindPlan(initPlan) {
        initPlan = initPlan || {};
        return {
            shouldBind: true,
            datasetKey: FAB_LONG_PRESS_HINT_DATASET,
            datasetValue: '1',
            suppressClickDataset: FAB_SUPPRESS_CLICK_DATASET,
            longPressMs: initPlan.longPressMs != null ? initPlan.longPressMs : MAP_ICON_HINT_LONG_PRESS_MS,
            moveThresholdPx2: initPlan.moveThresholdPx2 != null ? initPlan.moveThresholdPx2 : MAP_ICON_HINT_MOVE_PX2,
            vibrateMs: initPlan.vibrateMs != null ? initPlan.vibrateMs : 20,
            skipMousePointers: true,
            singleTouchOnly: true,
        };
    }

    /**
     * @param {Object} [env]
     * @returns {boolean}
     */
    function isTouchHintsEnvironment(env) {
        env = env || {};
        try {
            var nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
            var win = env.window || (typeof window !== 'undefined' ? window : null);
            if (nav && nav.maxTouchPoints > 0) return true;
            if (win && 'ontouchstart' in win) return true;
            if (win && win.matchMedia) {
                if (win.matchMedia('(hover: none)').matches) return true;
                if (win.matchMedia('(pointer: coarse)').matches) return true;
            }
        } catch (_e) {
            /* ignore */
        }
        return false;
    }

    /**
     * @param {string} message
     * @returns {Object}
     */
    function buildShowMapHintToastExecutePlan(message) {
        if (!message) {
            return { shouldShow: false };
        }
        return {
            shouldShow: true,
            message: message,
            toastId: MAP_HINT_TOAST_ID,
            visibleClass: MAP_HINT_TOAST_VISIBLE_CLASS,
            timerProperty: MAP_HINT_TOAST_TIMER_PROPERTY,
            autoDismissMs: MAP_HINT_AUTO_DISMISS_MS,
            clearExistingTimer: true,
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildInitMobileMapIconHintsPlan(input) {
        input = input || {};
        var enabled = !!input.touchHintsEnabled;
        return {
            shouldInit: enabled,
            skipLogMessage: '[Hints] Long-press map hints skipped (touch / coarse pointer not detected)',
            enabledLogMessage: '[Hints] Long-press map hints enabled (\u2248' + MAP_ICON_HINT_LONG_PRESS_MS + 'ms, bottom banner)',
            rootSelectors: MAP_ICON_HINT_ROOT_SELECTORS.slice(),
            buttonSelector: MAP_ICON_HINT_BUTTON_SELECTOR,
            longPressMs: MAP_ICON_HINT_LONG_PRESS_MS,
            moveThresholdPx2: MAP_ICON_HINT_MOVE_PX2,
            vibrateMs: 20,
        };
    }

    /**
     * Display values for the zoom-and-follow map FAB.
     * @param {boolean} enabled
     * @returns {{ active: boolean, background: string, innerHtml: string }}
     */
    function getZoomFollowButtonDisplay(enabled) {
        return {
            active: !!enabled,
            background: enabled ? ZOOM_FOLLOW_ACTIVE_BACKGROUND : ZOOM_FOLLOW_INACTIVE_BACKGROUND,
            innerHtml: enabled ? ZOOM_FOLLOW_ENABLED_ICON : ZOOM_FOLLOW_DISABLED_ICON,
        };
    }

    /**
     * Display values for the journey overview map FAB.
     * @param {boolean} overviewActive
     * @returns {{ background: string, innerHtml: string, title: string }}
     */
    function getJourneyOverviewButtonDisplay(overviewActive) {
        return overviewActive
            ? {
                background: JOURNEY_OVERVIEW_ACTIVE_BACKGROUND,
                innerHtml: JOURNEY_RETURN_ICON,
                title: 'Return to Navigation View',
            }
            : {
                background: JOURNEY_OVERVIEW_INACTIVE_BACKGROUND,
                innerHtml: JOURNEY_OVERVIEW_ICON,
                title: 'Journey Overview',
            };
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    function shouldSkipMapControlsHintElement(id) {
        return MAP_CONTROLS_HINT_SKIP_IDS.indexOf(id) >= 0;
    }

    /**
     * @param {string} display
     * @param {string} visibility
     * @returns {boolean}
     */
    function isMapControlsHintElementVisible(display, visibility) {
        return display !== 'none' && visibility !== 'hidden';
    }

    /**
     * Trim button label text for the hint list icon prefix.
     * @param {string} textContent
     * @returns {string}
     */
    function normalizeMapHintIconText(textContent) {
        return String(textContent || '').trim().replace(/\s+/g, ' ').slice(0, 6);
    }

    /**
     * @param {string} iconText
     * @param {string} hint
     * @returns {string}
     */
    function formatMapControlsHintItemLabel(iconText, hint) {
        var icon = normalizeMapHintIconText(iconText);
        return (icon ? icon + ' \u2014 ' : '') + hint;
    }

    /**
     * Display values for the AR mode map/settings button.
     * @param {string} status
     * @returns {{ active: boolean, innerHtml: string }}
     */
    function getARModeButtonDisplay(status) {
        var active = status === 'active' || status === 'active-fallback';
        return {
            active: active,
            innerHtml: active ? AR_ACTIVE_LABEL : AR_INACTIVE_LABEL,
        };
    }

    /**
     * @param {Storage} storage
     * @returns {boolean}
     */
    function isAREnabledInStorage(storage) {
        return storage.getItem(AR_PREF_STORAGE_KEY) === 'true';
    }

    /**
     * @param {Storage} storage
     * @param {boolean} enabled
     */
    function writeAREnabledToStorage(storage, enabled) {
        storage.setItem(AR_PREF_STORAGE_KEY, enabled ? 'true' : 'false');
    }

    /**
     * Apply settings toggle-switch styling for AR mode on/off.
     * @param {HTMLElement|null} btn
     * @param {boolean} active
     * @param {Object} toggleUi - VoyagrToggleUI module
     */
    function applyARModeToggleButton(btn, active, toggleUi) {
        if (!btn || !toggleUi) return;
        toggleUi.applyToggleButton(btn, active, toggleUi.TOGGLE_SWITCH_OPTS);
    }

    /**
     * FAB visibility for AR mode button when used as a map overlay.
     * @param {boolean} isAREnabled
     * @param {boolean} hasRoute
     * @param {boolean} routeInProgress
     * @returns {{ visible: boolean, display: string, textContent: string|null }}
     */
    function getARFabVisibilityDisplay(isAREnabled, hasRoute, routeInProgress) {
        if (isAREnabled && (hasRoute || routeInProgress)) {
            return { visible: true, display: 'flex', textContent: AR_FAB_VISIBLE_ICON };
        }
        return { visible: false, display: 'none', textContent: null };
    }

    /**
     * Apply AR mode button label/active state from navigator status.
     * @param {HTMLElement|null} btn
     * @param {string} status
     */
    function applyARModeButtonState(btn, status) {
        if (!btn) return;
        var display = getARModeButtonDisplay(status);
        if (display.active) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        btn.innerHTML = display.innerHtml;
    }

    /**
     * End/start navigation FAB visibility during turn-by-turn.
     * @param {boolean} routeInProgress
     * @returns {{ endBtnDisplay: string, startBtnDisplay: string|null }}
     */
    function getNavigationFabVisibilityPlan(routeInProgress) {
        if (routeInProgress) {
            return { endBtnDisplay: 'block', startBtnDisplay: 'none' };
        }
        return { endBtnDisplay: 'none', startBtnDisplay: null };
    }

    /**
     * Extra map FABs shown when navigation starts (AR + driver perspective).
     * @returns {{ arModeBtnDisplay: string, driverPerspectiveBtnDisplay: string }}
     */
    function getNavStartExtraFabDisplay() {
        return { arModeBtnDisplay: 'flex', driverPerspectiveBtnDisplay: 'flex' };
    }

    /**
     * Primary map FABs shown when turn-by-turn navigation starts.
     * @returns {{ zoomFollowDisplay: string, journeyOverviewDisplay: string, mapFollowingActive: boolean }}
     */
    function getNavStartFabDisplayPlan() {
        return {
            zoomFollowDisplay: 'block',
            journeyOverviewDisplay: 'block',
            mapFollowingActive: true,
        };
    }

    /**
     * Map FABs hidden when navigation stops.
     * @returns {{ zoomFollowDisplay: string, recenterDisplay: string, journeyOverviewDisplay: string, arModeBtnDisplay: string, driverPerspectiveDisplay: string }}
     */
    function getNavStopFabHidePlan() {
        return {
            zoomFollowDisplay: 'none',
            recenterDisplay: 'none',
            journeyOverviewDisplay: 'none',
            arModeBtnDisplay: 'none',
            driverPerspectiveDisplay: 'none',
        };
    }

    /**
     * @returns {string}
     */
    function getNavStopStatusMessage() {
        return 'Navigation stopped';
    }

    /**
     * @returns {{ title: string, body: string }}
     */
    function getNavStopNotification() {
        return { title: 'Navigation Ended', body: 'Route guidance ended' };
    }

    /**
     * Preflight plan for stopTurnByTurnNavigation when already idle.
     * @param {boolean} routeInProgress
     * @param {boolean} isTrackingActive
     * @returns {Object}
     */
    function buildNavStopPreflightPlan(routeInProgress, isTrackingActive) {
        if (!routeInProgress && !isTrackingActive) {
            return {
                shouldStop: false,
                updateNavFabOnly: true,
            };
        }
        return { shouldStop: true };
    }

    /**
     * State reset plan when navigation stops.
     * @returns {Object}
     */
    function buildNavStopStateResetPlan() {
        return {
            routeInProgress: false,
            routeJoinConfirmedForDeviation: false,
            currentStepIndex: 0,
            clearRouteSteps: true,
            clearRerouteFailureRetries: true,
            clearPersistedRoute: true,
            journeyOverviewActive: false,
            mapFollowingActive: false,
            savedMapState: null,
            initialETAMovementRetries: 0,
        };
    }

    /**
     * Execute plan for navigation stop lifecycle side effects.
     * @param {Object} o
     * @param {boolean} o.routeInProgress
     * @param {Object|null|undefined} o.lastCalculatedRoute
     * @param {boolean} o.hasWakeLock
     * @param {boolean} o.arModeActive
     * @param {boolean} o.driverPerspectiveEnabled
     * @param {boolean} o.updatePending
     * @returns {Object}
     */
    function buildNavStopLifecycleExecutePlan(o) {
        o = o || {};
        var wasNavigating = !!(o.lastCalculatedRoute && o.routeInProgress);
        return {
            resetNavigationArrival: true,
            buildTraveledSummary: wasNavigating,
            persistCompletedTrip: wasNavigating,
            showJourneySummary: wasNavigating,
            stopGpsTracking: true,
            hideRoadNameBar: true,
            releaseWakeLock: !!o.hasWakeLock,
            stopLiveDataRefresh: true,
            clearInitialEtaAnnouncement: true,
            stopAutoTraffic: true,
            stopRouteTraffic: true,
            updateRoadReportFab: true,
            updateNavFabVisibility: true,
            updateSpeedWidget: true,
            hideTurnWidget: true,
            hideJourneySummaryBar: true,
            applyFabHidePlan: true,
            stopArModeIfActive: !!o.arModeActive,
            applyMapPitchReset: true,
            driverPerspectiveEnabled: !!o.driverPerspectiveEnabled,
            applyPendingPwaUpdate: !!o.updatePending,
            autoTrafficStopLog: '[Navigation] Auto-traffic updates stopped',
            routeTrafficStopLog: '[Navigation] Route traffic edge display stopped',
            wakeLockReleaseLog: '[Screen Wake Lock] Screen lock released - screen can turn off',
            wakeLockReleaseErrorLogPrefix: '[Screen Wake Lock] Error releasing wake lock:',
            pwaUpdateStatusMessage: '🔄 Applying pending update...',
            pwaReloadDelayMs: 1000,
        };
    }

    /**
     * Status message shown when screen wake lock is acquired at nav start.
     * @returns {string}
     */
    function getWakeLockAcquiredStatusMessage() {
        return '🔒 Screen lock enabled - screen will stay on';
    }

    /**
     * Notification, status banner, and optional TTS copy when navigation starts or resumes.
     * @param {boolean} isQuietResume - True when resuming a persisted route without full restart fanfare.
     * @returns {{ notificationTitle: string, notificationBody: string, speakMessage: string|null, statusMessage: string, statusType: string }}
     */
    function buildNavStartUserFeedbackPlan(isQuietResume) {
        if (isQuietResume) {
            return {
                notificationTitle: 'Navigation resumed',
                notificationBody: 'Continuing your saved route.',
                speakMessage: null,
                statusMessage: '🧭 Navigation resumed — following saved route',
                statusType: 'success',
            };
        }
        return {
            notificationTitle: 'Navigation Started',
            notificationBody: 'Turn-by-turn guidance activated',
            speakMessage: 'Navigation started. Follow the route.',
            statusMessage: '🧭 Turn-by-turn navigation active',
            statusType: 'success',
        };
    }

    /**
     * @returns {string}
     */
    function getNavStartNoGeometryStatusMessage() {
        return 'No route geometry available';
    }

    /**
     * @returns {string}
     */
    function getNavStartInvalidGeometryStatusMessage() {
        return 'Error: Invalid route geometry';
    }

    /**
     * @returns {string}
     */
    function getNavStartDecodeGeometryErrorStatusMessage() {
        return 'Error: Could not decode route geometry';
    }

    /**
     * Preflight plan for startTurnByTurnNavigation after route merge.
     * @param {Object|null|undefined} mergedRouteData
     * @returns {Object}
     */
    function buildNavStartPreflightPlan(mergedRouteData) {
        if (!mergedRouteData || !mergedRouteData.geometry) {
            return {
                ok: false,
                errorStatusMessage: getNavStartNoGeometryStatusMessage(),
            };
        }
        return { ok: true, routeData: mergedRouteData };
    }

    /**
     * State init plan for navigation session variables at start.
     * @param {Object} routeData
     * @param {Object|null|undefined} navStartOpts
     * @returns {Object}
     */
    function buildNavStartStateInitPlan(routeData, navStartOpts) {
        routeData = routeData || {};
        navStartOpts = navStartOpts || null;
        var isQuietResume = !!(navStartOpts && navStartOpts.fromPersistedResume);
        var resumeStepIdx = 0;
        if (navStartOpts != null && Number.isFinite(navStartOpts.resumeStepIndex)) {
            resumeStepIdx = Math.max(0, Math.floor(navStartOpts.resumeStepIndex));
        }
        var navPrecision = Number.isFinite(routeData.geometry_precision)
            ? routeData.geometry_precision
            : 6;
        return {
            routeInProgress: true,
            currentStepIndex: resumeStepIdx,
            maneuvers: routeData.maneuvers || [],
            resetVoiceOnStart: !isQuietResume,
            isQuietResume: isQuietResume,
            navPrecision: navPrecision,
            geometry: routeData.geometry,
            persistActiveRoute: true,
            precacheTiles: true,
            driverViewDelayMs: 1500,
            volumeHintDelayMs: 2600,
            polylineDecodeLogPrefix: 'Route polyline decoded:',
            maneuversLogPrefix: 'Route maneuvers:',
            emptyPolylineErrorLog: '[Navigation] Failed to decode route geometry - polyline is empty',
            decodeGeometryErrorLogPrefix: 'Could not decode geometry:',
            wakeLockAcquireLog: '[Screen Wake Lock] Screen lock acquired - screen will stay on',
            wakeLockReleaseLog: '[Screen Wake Lock] Screen lock released',
            wakeLockUnsupportedLog: '[Screen Wake Lock] Screen Wake Lock API not supported on this device',
            wakeLockFailureLogPrefix: '[Screen Wake Lock] Failed to acquire wake lock:',
        };
    }

    /**
     * Execute plan for post-geometry navigation lifecycle side effects.
     * @param {Object} o
     * @param {boolean} o.isTrackingActive
     * @param {boolean} o.autoTrafficUpdateEnabled
     * @param {boolean} o.routeTrafficEnabled
     * @returns {Object}
     */
    function buildNavStartLifecycleExecutePlan(o) {
        o = o || {};
        return {
            startGpsIfInactive: !o.isTrackingActive,
            startLiveDataRefresh: true,
            updateEta: true,
            scheduleInitialEtaAnnouncement: true,
            startAutoTraffic: !!o.autoTrafficUpdateEnabled,
            startRouteTraffic: !!o.routeTrafficEnabled,
            showTurnWidget: true,
            showJourneySummaryBar: true,
            updateNavFabVisibility: true,
            showMapIconHint: 'Tap the red ⏹ button to end navigation when you arrive.',
            autoTrafficLogMessage: '[Navigation] Auto-traffic updates started',
            routeTrafficLogMessage: '[Navigation] Route traffic edge display started',
        };
    }

    /**
     * DOM execute plan for map FABs shown when navigation starts.
     * @param {Object} [o]
     * @param {boolean} [o.driverPerspectiveActive]
     * @returns {Object}
     */
    function buildNavStartFabDomExecutePlan(o) {
        o = o || {};
        var fabPlan = getNavStartFabDisplayPlan();
        var extraFab = getNavStartExtraFabDisplay();
        return {
            shouldApply: true,
            mapFollowingActive: fabPlan.mapFollowingActive,
            elementDisplays: [
                { id: 'zoomFollowToggle', display: fabPlan.zoomFollowDisplay },
                { id: 'journeyOverviewBtn', display: fabPlan.journeyOverviewDisplay },
                { id: 'arModeBtn', display: extraFab.arModeBtnDisplay },
                { id: 'driverPerspectiveToggle', display: extraFab.driverPerspectiveBtnDisplay },
            ],
            applyZoomFollowButton: true,
            applyDriverPerspectiveToggle: o.driverPerspectiveActive,
            updateRoadReportFab: true,
            updateRecenterButton: true,
            updateSpeedWidget: true,
        };
    }

    /**
     * Schedule plan for applying live navigation camera after nav start delay.
     * @param {Object} [input]
     * @param {number} [input.delayMs]
     * @param {boolean} [input.hasMap]
     * @param {boolean} [input.hasPosition]
     * @param {boolean} [input.zoomAndFollowEnabled]
     * @param {boolean} [input.mapFollowingActive]
     * @returns {Object}
     */
    function buildNavStartDriverViewSchedulePlan(input) {
        input = input || {};
        return {
            shouldSchedule: Number.isFinite(input.delayMs) && input.delayMs >= 0,
            delayMs: input.delayMs != null ? input.delayMs : 1500,
            applyWhenReady: {
                hasMap: !!input.hasMap,
                hasPosition: !!input.hasPosition,
                zoomAndFollowEnabled: !!input.zoomAndFollowEnabled,
                mapFollowingActive: !!input.mapFollowingActive,
            },
            action: 'applyLiveNavigationCamera',
        };
    }

    /**
     * Execute plan for requesting a screen wake lock when navigation starts.
     * @param {boolean} hasWakeLockApi
     * @param {Object} [stateInit] - from buildNavStartStateInitPlan
     * @returns {Object}
     */
    function buildNavStartWakeLockExecutePlan(hasWakeLockApi, stateInit) {
        stateInit = stateInit || {};
        if (!hasWakeLockApi) {
            return {
                shouldRequest: false,
                unsupportedLog: stateInit.wakeLockUnsupportedLog
                    || '[Screen Wake Lock] Screen Wake Lock API not supported on this device',
            };
        }
        return {
            shouldRequest: true,
            lockType: 'screen',
            windowProperty: 'screenWakeLock',
            acquireLog: stateInit.wakeLockAcquireLog
                || '[Screen Wake Lock] Screen lock acquired - screen will stay on',
            releaseLog: stateInit.wakeLockReleaseLog
                || '[Screen Wake Lock] Screen lock released',
            failureLogPrefix: stateInit.wakeLockFailureLogPrefix
                || '[Screen Wake Lock] Failed to acquire wake lock:',
            successStatusMessage: getWakeLockAcquiredStatusMessage(),
            successStatusType: 'success',
        };
    }

    var api = {
        ZOOM_FOLLOW_ENABLED_ICON: ZOOM_FOLLOW_ENABLED_ICON,
        ZOOM_FOLLOW_DISABLED_ICON: ZOOM_FOLLOW_DISABLED_ICON,
        JOURNEY_OVERVIEW_ICON: JOURNEY_OVERVIEW_ICON,
        JOURNEY_RETURN_ICON: JOURNEY_RETURN_ICON,
        AR_ACTIVE_LABEL: AR_ACTIVE_LABEL,
        AR_INACTIVE_LABEL: AR_INACTIVE_LABEL,
        JOURNEY_OVERVIEW_ACTIVE_BACKGROUND: JOURNEY_OVERVIEW_ACTIVE_BACKGROUND,
        JOURNEY_OVERVIEW_INACTIVE_BACKGROUND: JOURNEY_OVERVIEW_INACTIVE_BACKGROUND,
        ZOOM_FOLLOW_ACTIVE_BACKGROUND: ZOOM_FOLLOW_ACTIVE_BACKGROUND,
        ZOOM_FOLLOW_INACTIVE_BACKGROUND: ZOOM_FOLLOW_INACTIVE_BACKGROUND,
        AR_PREF_STORAGE_KEY: AR_PREF_STORAGE_KEY,
        AR_FAB_VISIBLE_ICON: AR_FAB_VISIBLE_ICON,
        MAP_CONTROLS_HINT_SECTIONS: MAP_CONTROLS_HINT_SECTIONS,
        MAP_CONTROLS_HINT_EXTRAS: MAP_CONTROLS_HINT_EXTRAS,
        MAP_CONTROLS_HINT_SKIP_IDS: MAP_CONTROLS_HINT_SKIP_IDS,
        MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE: MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE,
        MAP_HINT_TOAST_ID: MAP_HINT_TOAST_ID,
        MAP_HINT_AUTO_DISMISS_MS: MAP_HINT_AUTO_DISMISS_MS,
        MAP_ICON_HINT_LONG_PRESS_MS: MAP_ICON_HINT_LONG_PRESS_MS,
        MAP_CONTROLS_HINT_MODAL_ID: MAP_CONTROLS_HINT_MODAL_ID,
        MAP_CONTROLS_HINT_LIST_ID: MAP_CONTROLS_HINT_LIST_ID,
        isTouchHintsEnvironment: isTouchHintsEnvironment,
        buildOpenMapControlsHintModalExecutePlan: buildOpenMapControlsHintModalExecutePlan,
        buildCloseMapControlsHintModalExecutePlan: buildCloseMapControlsHintModalExecutePlan,
        buildFabLongPressHintBindPlan: buildFabLongPressHintBindPlan,
        buildShowMapHintToastExecutePlan: buildShowMapHintToastExecutePlan,
        buildInitMobileMapIconHintsPlan: buildInitMobileMapIconHintsPlan,
        getZoomFollowButtonDisplay: getZoomFollowButtonDisplay,
        getJourneyOverviewButtonDisplay: getJourneyOverviewButtonDisplay,
        shouldSkipMapControlsHintElement: shouldSkipMapControlsHintElement,
        isMapControlsHintElementVisible: isMapControlsHintElementVisible,
        normalizeMapHintIconText: normalizeMapHintIconText,
        formatMapControlsHintItemLabel: formatMapControlsHintItemLabel,
        getARModeButtonDisplay: getARModeButtonDisplay,
        isAREnabledInStorage: isAREnabledInStorage,
        writeAREnabledToStorage: writeAREnabledToStorage,
        applyARModeToggleButton: applyARModeToggleButton,
        getARFabVisibilityDisplay: getARFabVisibilityDisplay,
        applyARModeButtonState: applyARModeButtonState,
        getNavigationFabVisibilityPlan: getNavigationFabVisibilityPlan,
        getNavStartExtraFabDisplay: getNavStartExtraFabDisplay,
        getNavStartFabDisplayPlan: getNavStartFabDisplayPlan,
        getNavStopFabHidePlan: getNavStopFabHidePlan,
        getNavStopStatusMessage: getNavStopStatusMessage,
        getNavStopNotification: getNavStopNotification,
        buildNavStopPreflightPlan: buildNavStopPreflightPlan,
        buildNavStopStateResetPlan: buildNavStopStateResetPlan,
        buildNavStopLifecycleExecutePlan: buildNavStopLifecycleExecutePlan,
        getWakeLockAcquiredStatusMessage: getWakeLockAcquiredStatusMessage,
        buildNavStartUserFeedbackPlan: buildNavStartUserFeedbackPlan,
        getNavStartNoGeometryStatusMessage: getNavStartNoGeometryStatusMessage,
        getNavStartInvalidGeometryStatusMessage: getNavStartInvalidGeometryStatusMessage,
        getNavStartDecodeGeometryErrorStatusMessage: getNavStartDecodeGeometryErrorStatusMessage,
        buildNavStartPreflightPlan: buildNavStartPreflightPlan,
        buildNavStartStateInitPlan: buildNavStartStateInitPlan,
        buildNavStartLifecycleExecutePlan: buildNavStartLifecycleExecutePlan,
        buildNavStartFabDomExecutePlan: buildNavStartFabDomExecutePlan,
        buildNavStartDriverViewSchedulePlan: buildNavStartDriverViewSchedulePlan,
        buildNavStartWakeLockExecutePlan: buildNavStartWakeLockExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

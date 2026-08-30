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
        { title: 'Map (round buttons)', selector: '#navControlButtons .fab, .nav-control-menu > .fab' },
        { title: 'Bottom sheet toolbar', selector: '.sheet-toolbar .sheet-icon-btn' },
    ];

    var MAP_CONTROLS_HINT_EXTRAS = [
        '\u2014 After you calculate a route, \u201cStart navigation\u201d can appear on the map.',
        '\u2014 During turn-by-turn, Zoom & follow, Recenter, and Journey overview may appear as round buttons.',
        '\u2014 Long-press any round map icon ~\u00bds for this same text as a bottom banner.',
    ];

    var MAP_CONTROLS_HINT_SKIP_IDS = ['mapControlsHintFab', 'navMenuToggle'];
    var MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE = 'Often hidden until you need them';

    var MAP_HINT_TOAST_ID = 'mapHintToast';
    var MAP_HINT_TOAST_VISIBLE_CLASS = 'is-visible';
    var MAP_HINT_TOAST_TIMER_PROPERTY = '__voyagrMapHintToastT';
    var MAP_HINT_AUTO_DISMISS_MS = 4200;
    var MAP_ICON_HINT_LONG_PRESS_MS = 420;
    var MAP_ICON_HINT_MOVE_PX2 = 100;
    var MAP_ICON_HINT_ROOT_SELECTORS = ['#navControlButtons', '.sheet-toolbar'];
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

    var ZOOM_FOLLOW_TOGGLE_ID = 'zoomFollowToggle';
    var ZOOM_FOLLOW_STORAGE_KEY = 'zoomAndFollowEnabled';

    /**
     * Resolve zoom-and-follow preference from localStorage (default on when unset).
     * @param {string|null|undefined} storedValue
     * @returns {boolean}
     */
    function resolveZoomAndFollowEnabledFromStorage(storedValue) {
        if (storedValue === null || storedValue === undefined || storedValue === '') {
            return true;
        }
        return storedValue === 'true';
    }

    /**
     * Orchestration plan for toggling zoom-and-follow mode.
     * @param {Object} [input]
     * @param {boolean} [input.currentEnabled]
     * @returns {Object}
     */
    function buildToggleZoomAndFollowOrchestrationPlan(input) {
        input = input || {};
        var nextEnabled = !input.currentEnabled;
        return {
            shouldToggle: true,
            nextEnabled: nextEnabled,
            storageKey: ZOOM_FOLLOW_STORAGE_KEY,
            storageValue: nextEnabled ? 'true' : 'false',
            toggleButtonId: ZOOM_FOLLOW_TOGGLE_ID,
            updateRecenterVisibility: true,
            action: nextEnabled ? 'enable' : 'disable',
        };
    }

    /**
     * Execute plan when zoom-and-follow is enabled.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleZoomAndFollowEnabledExecutePlan(input) {
        input = input || {};
        var hasPosition = !!(input.hasMap && input.currentLat && input.currentLon);
        var flyTo = null;
        if (hasPosition) {
            flyTo = {
                center: [input.currentLon, input.currentLat],
                zoom: 17,
                duration: 500,
                essential: true,
            };
            if (input.followPadding) {
                flyTo.padding = input.followPadding;
            }
        }
        return {
            mapFollowingActive: true,
            statusMessage: '📍 Zoom & Follow enabled - map will follow your vehicle',
            statusType: 'success',
            logMessage: '[Zoom & Follow] Enabled',
            flyTo: flyTo,
        };
    }

    /**
     * Execute plan when zoom-and-follow is disabled.
     * @returns {Object}
     */
    function buildToggleZoomAndFollowDisabledExecutePlan() {
        return {
            mapFollowingActive: false,
            statusMessage: '📍 Zoom & Follow disabled - map is free to pan',
            statusType: 'info',
            logMessage: '[Zoom & Follow] Disabled',
        };
    }

    /**
     * DOM execute plan for zoom-and-follow button styling.
     * @param {boolean} enabled
     * @returns {Object}
     */
    function buildZoomFollowButtonUiExecutePlan(enabled) {
        var display = getZoomFollowButtonDisplay(enabled);
        return {
            shouldApply: true,
            active: display.active,
            background: display.background,
            innerHtml: display.innerHtml,
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

    var AR_SETTINGS_TOGGLE_ID = 'arToggleBtn';
    var AR_MODE_FAB_ID = 'arModeBtn';
    var AR_MODULE_IMPORT_PATH = './modules/ar-navigation.js';

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentlyEnabled]
     * @returns {Object}
     */
    function buildToggleARSettingCollectPlan(input) {
        input = input || {};
        return { enabled: !input.currentlyEnabled };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @param {boolean} [input.arModeActive]
     * @returns {Object}
     */
    function buildToggleARSettingExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggleId: AR_SETTINGS_TOGGLE_ID,
            storageKey: AR_PREF_STORAGE_KEY,
            useToggleSwitchOpts: true,
            updateFabVisibility: true,
            stopArModeIfDisabling: !enabled && !!input.arModeActive,
            statusMessage: enabled ? 'AR Navigation enabled' : 'AR Navigation disabled',
            statusType: enabled ? 'success' : 'info',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.arModeActive]
     * @returns {Object}
     */
    function buildToggleARModeEntryPlan(input) {
        input = input || {};
        if (input.arModeActive) {
            return {
                shouldStop: true,
                toggleId: AR_MODE_FAB_ID,
                applyToggleOff: true,
            };
        }
        return {
            shouldStop: false,
            shouldStart: true,
            toggleId: AR_MODE_FAB_ID,
            moduleImportPath: AR_MODULE_IMPORT_PATH,
            startingStatusMessage: '📸 Starting AR mode...',
            startingStatusType: 'info',
            loadErrorStatusMessage: 'AR module failed to load',
            loadErrorLogPrefix: '[AR] Failed to load module:',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.success]
     * @param {string} [input.mode]
     * @param {string} [input.error]
     * @returns {Object}
     */
    function buildToggleARModeStartResultPlan(input) {
        input = input || {};
        if (input.success) {
            return {
                shouldApply: true,
                arModeActive: true,
                applyToggleOn: true,
                toggleId: AR_MODE_FAB_ID,
                statusMessage: '📷 AR mode active (' + (input.mode || 'unknown') + ')',
                statusType: 'success',
                syncCurrentInstruction: true,
            };
        }
        return {
            shouldApply: false,
            statusMessage: 'AR not available: ' + (input.error || 'unknown'),
            statusType: 'error',
        };
    }

    /**
     * @returns {Object}
     */
    function buildStopARModeExecutePlan() {
        return {
            shouldApply: true,
            arModeActive: false,
            toggleId: AR_MODE_FAB_ID,
            applyToggleOff: true,
            statusMessage: '🗺️ Returned to map view',
            statusType: 'info',
        };
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
            // Keep wake lock while the journey-end summary is shown; release on Done.
            releaseWakeLock: !!o.hasWakeLock && !wasNavigating,
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
     * Entry orchestration plan for stopTurnByTurnNavigation.
     * @param {Object} [input]
     * @param {boolean} [input.routeInProgress]
     * @param {boolean} [input.isTrackingActive]
     * @param {Object|null|undefined} [input.lastCalculatedRoute]
     * @param {boolean} [input.hasWakeLock]
     * @param {boolean} [input.arModeActive]
     * @param {boolean} [input.driverPerspectiveEnabled]
     * @param {boolean} [input.updatePending]
     * @returns {Object}
     */
    function buildNavStopEntryOrchestrationPlan(input) {
        input = input || {};
        var preflight = buildNavStopPreflightPlan(!!input.routeInProgress, !!input.isTrackingActive);
        if (!preflight.shouldStop) {
            return {
                shouldStop: false,
                updateNavFabOnly: !!preflight.updateNavFabOnly,
            };
        }
        return {
            shouldStop: true,
            wasRouteInProgress: !!input.routeInProgress,
            stateReset: buildNavStopStateResetPlan(),
            services: buildNavStopServicesOrchestrationPlan(input),
        };
    }

    /**
     * Runtime apply plan for navigation session reset at stop.
     * @param {Object} [reset] - from buildNavStopStateResetPlan
     * @returns {Object}
     */
    function buildNavStopRuntimeApplyPlan(reset) {
        reset = reset || buildNavStopStateResetPlan();
        return {
            shouldApply: true,
            routeInProgress: reset.routeInProgress,
            routeJoinConfirmedForDeviation: reset.routeJoinConfirmedForDeviation,
            currentStepIndex: reset.currentStepIndex,
            clearRouteSteps: !!reset.clearRouteSteps,
            clearPersistedRoute: !!reset.clearPersistedRoute,
            clearRerouteFailureRetries: !!reset.clearRerouteFailureRetries,
            mapFollowingActive: reset.mapFollowingActive,
            journeyOverviewActive: reset.journeyOverviewActive,
            savedMapState: reset.savedMapState,
            initialETAMovementRetries: reset.initialETAMovementRetries,
            resetVehicleMarker: true,
        };
    }

    /**
     * DOM execute plan for map FABs hidden when navigation stops.
     * @returns {Object}
     */
    function buildNavStopFabDomExecutePlan() {
        var fabPlan = getNavStopFabHidePlan();
        return {
            shouldApply: true,
            elementDisplays: [
                { id: 'zoomFollowToggle', display: fabPlan.zoomFollowDisplay },
                { id: 'recenterVehicleFab', display: fabPlan.recenterDisplay },
                { id: 'journeyOverviewBtn', display: fabPlan.journeyOverviewDisplay },
                { id: 'arModeBtn', display: fabPlan.arModeBtnDisplay },
                { id: 'driverPerspectiveToggle', display: fabPlan.driverPerspectiveDisplay },
            ],
            updateRoadReportFab: true,
            updateNavFabVisibility: true,
            updateSpeedWidget: true,
            hideTurnWidget: true,
            hideJourneySummaryBar: true,
        };
    }

    /**
     * Services orchestration plan for post-reset navigation stop side effects.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildNavStopServicesOrchestrationPlan(input) {
        input = input || {};
        var lifecycle = buildNavStopLifecycleExecutePlan({
            routeInProgress: !!input.routeInProgress,
            lastCalculatedRoute: input.lastCalculatedRoute,
            hasWakeLock: !!input.hasWakeLock,
            arModeActive: !!input.arModeActive,
            driverPerspectiveEnabled: !!input.driverPerspectiveEnabled,
            updatePending: !!input.updatePending,
        });
        var wasNavigating = !!(input.lastCalculatedRoute && input.routeInProgress);
        return {
            lifecycle: lifecycle,
            fabExecute: buildNavStopFabDomExecutePlan(),
            traveledSummary: {
                shouldBuild: wasNavigating && lifecycle.buildTraveledSummary,
                persistCompletedTrip: lifecycle.persistCompletedTrip,
                showJourneySummary: lifecycle.showJourneySummary,
            },
            mapPitchReset: lifecycle.applyMapPitchReset ? {
                shouldApply: true,
                driverPerspectiveEnabled: lifecycle.driverPerspectiveEnabled,
                pitch: 0,
                bearing: 0,
                durationMs: 500,
            } : null,
            pwaUpdate: lifecycle.applyPendingPwaUpdate && input.updatePending ? {
                shouldApply: true,
                statusMessage: lifecycle.pwaUpdateStatusMessage,
                reloadDelayMs: lifecycle.pwaReloadDelayMs,
            } : null,
            userFeedback: {
                statusMessage: getNavStopStatusMessage(),
                notification: getNavStopNotification(),
                statusType: 'info',
            },
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
    function buildNavStartPreflightPlan(mergedRouteData, navStartOpts) {
        navStartOpts = navStartOpts || null;
        var persistedPolyline = navStartOpts && navStartOpts.persistedPolyline;
        var hasPersistedPolyline = Array.isArray(persistedPolyline) && persistedPolyline.length >= 2;

        if (!mergedRouteData) {
            return {
                ok: false,
                errorStatusMessage: getNavStartNoGeometryStatusMessage(),
            };
        }
        if (mergedRouteData.geometry) {
            return { ok: true, routeData: mergedRouteData };
        }
        if (hasPersistedPolyline) {
            return {
                ok: true,
                routeData: mergedRouteData,
                usePersistedPolyline: true,
                persistedPolyline: persistedPolyline,
            };
        }
        return {
            ok: false,
            errorStatusMessage: getNavStartNoGeometryStatusMessage(),
        };
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
        var usePersistedPolyline = !!(navStartOpts && Array.isArray(navStartOpts.persistedPolyline)
            && navStartOpts.persistedPolyline.length >= 2);
        return {
            routeInProgress: true,
            currentStepIndex: resumeStepIdx,
            maneuvers: routeData.maneuvers || [],
            resetVoiceOnStart: !isQuietResume,
            isQuietResume: isQuietResume,
            navPrecision: navPrecision,
            geometry: routeData.geometry,
            usePersistedPolyline: usePersistedPolyline,
            persistedPolyline: usePersistedPolyline ? navStartOpts.persistedPolyline : null,
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
     * Entry orchestration plan for startTurnByTurnNavigation after route merge.
     * @param {Object|null|undefined} mergedRouteData
     * @param {Object|null|undefined} navStartOpts
     * @returns {Object}
     */
    function buildNavStartEntryOrchestrationPlan(mergedRouteData, navStartOpts) {
        var preflight = buildNavStartPreflightPlan(mergedRouteData, navStartOpts);
        if (!preflight.ok) {
            return {
                shouldStart: false,
                errorStatusMessage: preflight.errorStatusMessage,
            };
        }
        var routeData = preflight.routeData;
        return {
            shouldStart: true,
            routeData: routeData,
            stateInit: buildNavStartStateInitPlan(routeData, navStartOpts),
            mergeLastCalculatedRoute: true,
        };
    }

    /**
     * Runtime apply plan for navigation session variables at start.
     * @param {Object} [stateInit] - from buildNavStartStateInitPlan
     * @returns {Object}
     */
    function buildNavStartRuntimeApplyPlan(stateInit) {
        stateInit = stateInit || {};
        return {
            shouldApply: true,
            routeInProgress: stateInit.routeInProgress,
            currentStepIndex: stateInit.currentStepIndex,
            maneuvers: stateInit.maneuvers || [],
            resetSessionCounters: true,
            resetVoiceOnStart: !!stateInit.resetVoiceOnStart,
            createEmptyEtaSnapshot: true,
        };
    }

    /**
     * Execute plan for polyline decode and persistence at navigation start.
     * @param {Object} [stateInit] - from buildNavStartStateInitPlan
     * @returns {Object}
     */
    function buildNavStartPolylineInitExecutePlan(stateInit) {
        stateInit = stateInit || {};
        return {
            shouldInit: true,
            usePersistedPolyline: !!stateInit.usePersistedPolyline,
            persistedPolyline: stateInit.persistedPolyline,
            geometry: stateInit.geometry,
            navPrecision: stateInit.navPrecision,
            persistActiveRoute: !!stateInit.persistActiveRoute,
            precacheTiles: !!stateInit.precacheTiles,
            // Own the visible nav line: clear comparison/preview polylines and mount the
            // active route as routeLayer so instructions and the map stay in sync, and so
            // style-load / reroute recovery can redraw from the owned layer.
            clearPreviewRouteLayers: true,
            mountActiveNavRoute: true,
            bringNavRouteAboveTraffic: true,
            polylineDecodeLogPrefix: stateInit.polylineDecodeLogPrefix,
            maneuversLogPrefix: stateInit.maneuversLogPrefix,
            emptyPolylineErrorLog: stateInit.emptyPolylineErrorLog,
            decodeGeometryErrorLogPrefix: stateInit.decodeGeometryErrorLogPrefix,
            persistedPolylineLogSuffix: 'points (persisted polyline)',
            navRouteMountLogPrefix: '[Navigation] Active route layer mounted:',
            routeMountFailedLog: '[Navigation] Active route layer mount failed — scheduling retry',
            routeMountFailedStatusMessage: 'Route line could not be drawn yet — retrying…',
            routeMountFailedStatusType: 'warning',
            routeMountRetryDelayMs: 500,
            routeMountRetryReason: 'nav-start-mount-retry',
            primeVehicleWhenPositionKnown: true,
            resetSnappedIndexWhenNoPosition: true,
            invalidGeometryStatusMessage: getNavStartInvalidGeometryStatusMessage(),
            decodeGeometryErrorStatusMessage: getNavStartDecodeGeometryErrorStatusMessage(),
        };
    }

    /**
     * Services orchestration plan for post-geometry navigation start side effects.
     * @param {Object} [opts]
     * @param {Object} [opts.stateInit]
     * @param {boolean} [opts.isTrackingActive]
     * @param {boolean} [opts.autoTrafficUpdateEnabled]
     * @param {boolean} [opts.routeTrafficEnabled]
     * @param {boolean} [opts.hasMap]
     * @param {boolean} [opts.hasPosition]
     * @param {boolean} [opts.zoomAndFollowEnabled]
     * @param {boolean} [opts.mapFollowingActive]
     * @param {boolean} [opts.driverPerspectiveActive]
     * @param {boolean} [opts.wakeLockApiAvailable]
     * @returns {Object}
     */
    function buildNavStartServicesOrchestrationPlan(opts) {
        opts = opts || {};
        var stateInit = opts.stateInit || {};
        return {
            lifecycle: buildNavStartLifecycleExecutePlan({
                isTrackingActive: opts.isTrackingActive,
                autoTrafficUpdateEnabled: opts.autoTrafficUpdateEnabled,
                routeTrafficEnabled: opts.routeTrafficEnabled,
            }),
            driverViewSchedule: buildNavStartDriverViewSchedulePlan({
                delayMs: stateInit.driverViewDelayMs,
                hasMap: !!opts.hasMap,
                hasPosition: !!opts.hasPosition,
                zoomAndFollowEnabled: !!opts.zoomAndFollowEnabled,
                mapFollowingActive: !!opts.mapFollowingActive,
            }),
            fabExecute: buildNavStartFabDomExecutePlan({
                driverPerspectiveActive: !!opts.driverPerspectiveActive,
            }),
            userFeedback: buildNavStartUserFeedbackPlan(!!stateInit.isQuietResume),
            volumeHintDelayMs: stateInit.volumeHintDelayMs,
            wakeLockApiAvailable: !!opts.wakeLockApiAvailable,
            stateInit: stateInit,
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

    /**
     * Reacquire screen wake lock after background/screen-off during navigation.
     * Wake Lock is released when the document is hidden; without this the screen
     * can stay off and OS GPS/watchPosition stalls leave the vehicle icon frozen.
     * @param {Object} [input]
     * @param {boolean} [input.documentVisible]
     * @param {boolean} [input.routeInProgress]
     * @param {boolean} [input.wakeLockApiAvailable]
     * @param {boolean} [input.hasWakeLock]
     * @returns {Object}
     */
    function buildNavForegroundWakeLockEnsurePlan(input) {
        input = input || {};
        if (input.documentVisible === false) {
            return { shouldRequest: false, reason: 'hidden' };
        }
        if (!input.routeInProgress) {
            return { shouldRequest: false, reason: 'not_navigating' };
        }
        if (!input.wakeLockApiAvailable) {
            return {
                shouldRequest: false,
                reason: 'unsupported',
                unsupportedLog: '[Screen Wake Lock] Screen Wake Lock API not supported on this device',
            };
        }
        if (input.hasWakeLock) {
            return { shouldRequest: false, reason: 'already_held' };
        }
        return {
            shouldRequest: true,
            reason: 'reacquire',
            lockType: 'screen',
            windowProperty: 'screenWakeLock',
            acquireLog: '[Screen Wake Lock] Re-acquired after foreground resume',
            releaseLog: '[Screen Wake Lock] Screen lock released',
            failureLogPrefix: '[Screen Wake Lock] Failed to re-acquire wake lock:',
            quietStatus: true,
        };
    }

    var MAP_EXPLORE_HANDLERS_FLAG = '__voyagrMapExploreHandlersInitialized';

    /**
     * Setup plan for syncing voice/hazard position from map center while browsing.
     * @param {Object} [input]
     * @param {boolean} [input.hasMap]
     * @returns {Object}
     */
    function buildMapMoveHandlerSetupPlan(input) {
        input = input || {};
        if (!input.hasMap) {
            return {
                shouldBind: false,
                deferLogMessage: '[Map] Map not initialized yet, deferring move handler setup',
            };
        }
        return {
            shouldBind: true,
            eventName: 'move',
        };
    }

    /**
     * Execute plan for syncing currentLat/currentLon from map center.
     * @param {Object} [input]
     * @param {boolean} [input.routeInProgress]
     * @param {boolean} [input.isTrackingActive]
     * @param {{ lat?: number, lng?: number }} [input.center]
     * @returns {Object}
     */
    function buildMapCenterSyncExecutePlan(input) {
        input = input || {};
        if (input.routeInProgress || input.isTrackingActive) {
            return { shouldSync: false };
        }
        var center = input.center || {};
        return {
            shouldSync: Number.isFinite(center.lat) && Number.isFinite(center.lng),
            lat: center.lat,
            lon: center.lng,
        };
    }

    /**
     * Setup plan for pausing follow when the user explores the map.
     * @param {Object} [input]
     * @param {boolean} [input.hasMap]
     * @param {boolean} [input.alreadyInitialized]
     * @returns {Object}
     */
    function buildMapExploreHandlersSetupPlan(input) {
        input = input || {};
        if (!input.hasMap) {
            return {
                shouldBind: false,
                deferLogMessage: '[Map] Map not initialized yet, deferring explore handler setup',
            };
        }
        if (input.alreadyInitialized) {
            return { shouldBind: false, alreadyInitialized: true };
        }
        return {
            shouldBind: true,
            markInitialized: true,
            initializedFlagProperty: MAP_EXPLORE_HANDLERS_FLAG,
            gestureEvents: ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'],
            moveEndEvent: 'moveend',
        };
    }

    /**
     * Execute plan when the user starts a map gesture during navigation/tracking.
     * @param {Object} [input]
     * @param {boolean} [input.hasOriginalEvent]
     * @param {boolean} [input.routeInProgress]
     * @param {boolean} [input.isTrackingActive]
     * @param {boolean} [input.zoomAndFollowEnabled]
     * @param {boolean} [input.mapFollowingActive]
     * @returns {Object}
     */
    function buildMapExploreGestureExecutePlan(input) {
        input = input || {};
        if (!input.hasOriginalEvent) {
            return { shouldReact: false };
        }
        if (!input.routeInProgress && !input.isTrackingActive) {
            return { shouldReact: false };
        }
        var pauseFollow = !!(
            input.routeInProgress &&
            input.zoomAndFollowEnabled &&
            input.mapFollowingActive
        );
        return {
            shouldReact: true,
            pauseMapFollowing: pauseFollow,
            updateRecenterVisibility: true,
            pauseFollowLogMessage: '[Nav] User explored map — follow paused',
        };
    }

    /**
     * Execute plan after map movement ends.
     * @returns {Object}
     */
    function buildMapExploreMoveEndExecutePlan() {
        return {
            shouldReact: true,
            updateRecenterVisibility: true,
        };
    }

    var RECENTER_MIN_DISTANCE_M = 70;
    var RECENTER_VEHICLE_FAB_ID = 'recenterVehicleFab';
    var JOURNEY_OVERVIEW_BTN_ID = 'journeyOverviewBtn';

    /**
     * Visibility plan for the recenter-vehicle FAB.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildShouldShowRecenterVehicleButtonPlan(input) {
        input = input || {};
        if (!input.hasMap || input.currentLat == null || input.currentLon == null) {
            return { shouldShow: false };
        }
        if (!input.routeInProgress && !input.isTrackingActive) {
            return { shouldShow: false };
        }
        if (input.journeyOverviewActive) {
            return { shouldShow: true };
        }
        if (input.routeInProgress && input.zoomAndFollowEnabled && !input.mapFollowingActive) {
            return { shouldShow: true };
        }
        var minDistance = input.minDistanceM != null ? input.minDistanceM : RECENTER_MIN_DISTANCE_M;
        if (Number.isFinite(input.distanceFromCenterM) && input.distanceFromCenterM >= minDistance) {
            return { shouldShow: true };
        }
        return { shouldShow: false };
    }

    /**
     * DOM execute plan for recenter button visibility.
     * @param {boolean} shouldShow
     * @returns {Object}
     */
    function buildRecenterButtonVisibilityExecutePlan(shouldShow) {
        return {
            shouldUpdate: true,
            buttonId: RECENTER_VEHICLE_FAB_ID,
            display: shouldShow ? 'flex' : 'none',
        };
    }

    /**
     * Preflight for recenter-on-vehicle action.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildRecenterOnVehiclePreflightPlan(input) {
        input = input || {};
        if (!input.hasMap || input.currentLat == null || input.currentLon == null) {
            return {
                shouldRecenter: false,
                statusMessage: 'Waiting for GPS position…',
                statusType: 'info',
            };
        }
        return {
            shouldRecenter: true,
            exitJourneyOverview: !!input.journeyOverviewActive,
            vehicleLat: input.displayLat,
            vehicleLon: input.displayLon,
            routeInProgress: !!input.routeInProgress,
        };
    }

    /**
     * Execute plan for exiting journey overview before recenter.
     * @returns {Object}
     */
    function buildRecenterJourneyOverviewExitPlan() {
        return {
            shouldExit: true,
            journeyOverviewActive: false,
            journeyBtnId: JOURNEY_OVERVIEW_BTN_ID,
            clearSavedMapState: true,
        };
    }

    /**
     * Input plan for navigation follow camera during recenter.
     * Prefer the live camera zoom over the managed lastZoomLevel cache: a user
     * zoomstart pauses follow without updating that cache, so comparing only the
     * cache can omit easeTo.zoom and leave zoom-and-follow stuck at the manual scale.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildRecenterNavigationFollowInputPlan(input) {
        input = input || {};
        var zoomForOmit = Number.isFinite(input.currentMapZoom)
            ? input.currentMapZoom
            : input.lastZoomLevel;
        return {
            mapFollowingActive: true,
            speedMph: input.speedMph,
            roadType: input.roadType,
            heading: input.heading,
            mapBearing: input.mapBearing,
            markerLat: input.lat,
            markerLon: input.lon,
            shouldEase: true,
            durationMs: 600,
            shouldTilt: !!input.shouldTilt,
            usePitchedDrivingCamera: !!input.usePitchedDrivingCamera,
            viewportHeight: input.viewportHeight,
            viewportWidth: input.viewportWidth,
            distanceToNextTurn: input.distanceToNextTurn != null ? input.distanceToNextTurn : null,
            lastZoomLevel: zoomForOmit,
        };
    }

    /**
     * Execute plan after navigation recenter camera ease.
     * @returns {Object}
     */
    function buildRecenterNavigationCompletePlan() {
        return {
            setLastFollowCenterGeo: true,
            setLastFollowEaseAt: true,
            statusMessage: '📍 Recentered on vehicle',
            statusType: 'success',
            updateRecenterVisibility: true,
        };
    }

    /**
     * Execute plan for recenter while tracking (non-navigation).
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildRecenterTrackingEasePlan(input) {
        input = input || {};
        var zoom = Number.isFinite(input.currentZoom) ? input.currentZoom : 16;
        return {
            mapFollowingActive: true,
            easeTo: {
                center: [input.lon, input.lat],
                zoom: Math.max(zoom, 16),
                duration: 500,
                essential: true,
            },
            statusMessage: '📍 Recentered on your location',
            statusType: 'success',
            updateRecenterVisibility: true,
        };
    }

    /**
     * Preflight for toggling journey overview during navigation.
     * @param {Object} [input]
     * @param {boolean} [input.routeInProgress]
     * @param {number} [input.routePolylineLength]
     * @param {boolean} [input.journeyOverviewActive]
     * @returns {Object}
     */
    function buildToggleJourneyOverviewPreflightPlan(input) {
        input = input || {};
        if (!input.routeInProgress || !input.routePolylineLength) {
            return {
                shouldToggle: false,
                statusMessage: 'No active navigation to show overview',
                statusType: 'error',
            };
        }
        return {
            shouldToggle: true,
            journeyBtnId: JOURNEY_OVERVIEW_BTN_ID,
            currentlyActive: !!input.journeyOverviewActive,
        };
    }

    /**
     * Fit-bounds plan for journey overview activation.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleJourneyOverviewFitBoundsPlan(input) {
        input = input || {};
        if (input.useMultiRouteCoords && input.allRouteCoords && input.allRouteCoords.length > 0) {
            return { shouldFit: true, coords: input.allRouteCoords, padding: 50 };
        }
        if (input.routePolylineLength > 0 && input.routePolyline) {
            return { shouldFit: true, coords: input.routePolyline, padding: 50 };
        }
        return { shouldFit: false };
    }

    /**
     * Execute plan for activating journey overview mode.
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildToggleJourneyOverviewActivatePlan(input) {
        input = input || {};
        var fit = buildToggleJourneyOverviewFitBoundsPlan(input);
        return {
            action: 'activate',
            saveMapState: {
                center: input.mapCenter,
                zoom: input.mapZoom,
            },
            mapFollowingActive: false,
            journeyOverviewActive: true,
            fitBounds: fit.shouldFit ? { coords: fit.coords, padding: fit.padding } : null,
            overviewButtonActive: true,
            statusMessage: '🗺️ Journey Overview - Tap again to return',
            statusType: 'info',
            logMessage: '[Navigation] Journey overview activated',
            updateRecenterVisibility: true,
        };
    }

    /**
     * Execute plan for deactivating journey overview mode.
     * @param {Object} [input]
     * @param {boolean} [input.zoomAndFollowEnabled]
     * @param {Object|null} [input.savedMapState]
     * @returns {Object}
     */
    function buildToggleJourneyOverviewDeactivatePlan(input) {
        input = input || {};
        var restoreFollow = !!input.zoomAndFollowEnabled;
        var flyTo = null;
        if (input.savedMapState && input.savedMapState.center) {
            flyTo = {
                center: [
                    input.savedMapState.center.lng,
                    input.savedMapState.center.lat,
                ],
                zoom: input.savedMapState.zoom,
                pitch: input.pitch != null ? input.pitch : 55,
                duration: 1000,
                essential: true,
            };
            if (input.followPadding) {
                flyTo.padding = input.followPadding;
            }
        }
        return {
            action: 'deactivate',
            journeyOverviewActive: false,
            restoreMapFollowing: restoreFollow,
            restoreLiveNavigationCamera: restoreFollow,
            flyTo: flyTo,
            clearSavedMapState: !!input.savedMapState,
            overviewButtonActive: false,
            statusMessage: '📍 Returned to navigation view',
            statusType: 'success',
            logMessage: '[Navigation] Journey overview deactivated',
            updateRecenterVisibility: true,
        };
    }

    /**
     * DOM execute plan for journey overview button styling.
     * @param {boolean} overviewActive
     * @returns {Object}
     */
    function buildJourneyOverviewButtonUiExecutePlan(overviewActive) {
        var display = getJourneyOverviewButtonDisplay(overviewActive);
        return {
            shouldApply: true,
            background: display.background,
            innerHtml: display.innerHtml,
            title: display.title,
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
        AR_SETTINGS_TOGGLE_ID: AR_SETTINGS_TOGGLE_ID,
        AR_MODE_FAB_ID: AR_MODE_FAB_ID,
        AR_MODULE_IMPORT_PATH: AR_MODULE_IMPORT_PATH,
        MAP_CONTROLS_HINT_SECTIONS: MAP_CONTROLS_HINT_SECTIONS,
        MAP_CONTROLS_HINT_EXTRAS: MAP_CONTROLS_HINT_EXTRAS,
        MAP_CONTROLS_HINT_SKIP_IDS: MAP_CONTROLS_HINT_SKIP_IDS,
        MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE: MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE,
        MAP_HINT_TOAST_ID: MAP_HINT_TOAST_ID,
        MAP_HINT_AUTO_DISMISS_MS: MAP_HINT_AUTO_DISMISS_MS,
        MAP_ICON_HINT_LONG_PRESS_MS: MAP_ICON_HINT_LONG_PRESS_MS,
        MAP_CONTROLS_HINT_MODAL_ID: MAP_CONTROLS_HINT_MODAL_ID,
        MAP_CONTROLS_HINT_LIST_ID: MAP_CONTROLS_HINT_LIST_ID,
        MAP_EXPLORE_HANDLERS_FLAG: MAP_EXPLORE_HANDLERS_FLAG,
        isTouchHintsEnvironment: isTouchHintsEnvironment,
        buildMapMoveHandlerSetupPlan: buildMapMoveHandlerSetupPlan,
        buildMapCenterSyncExecutePlan: buildMapCenterSyncExecutePlan,
        buildMapExploreHandlersSetupPlan: buildMapExploreHandlersSetupPlan,
        buildMapExploreGestureExecutePlan: buildMapExploreGestureExecutePlan,
        buildMapExploreMoveEndExecutePlan: buildMapExploreMoveEndExecutePlan,
        RECENTER_MIN_DISTANCE_M: RECENTER_MIN_DISTANCE_M,
        RECENTER_VEHICLE_FAB_ID: RECENTER_VEHICLE_FAB_ID,
        JOURNEY_OVERVIEW_BTN_ID: JOURNEY_OVERVIEW_BTN_ID,
        buildShouldShowRecenterVehicleButtonPlan: buildShouldShowRecenterVehicleButtonPlan,
        buildRecenterButtonVisibilityExecutePlan: buildRecenterButtonVisibilityExecutePlan,
        buildRecenterOnVehiclePreflightPlan: buildRecenterOnVehiclePreflightPlan,
        buildRecenterJourneyOverviewExitPlan: buildRecenterJourneyOverviewExitPlan,
        buildRecenterNavigationFollowInputPlan: buildRecenterNavigationFollowInputPlan,
        buildRecenterNavigationCompletePlan: buildRecenterNavigationCompletePlan,
        buildRecenterTrackingEasePlan: buildRecenterTrackingEasePlan,
        buildToggleJourneyOverviewPreflightPlan: buildToggleJourneyOverviewPreflightPlan,
        buildToggleJourneyOverviewFitBoundsPlan: buildToggleJourneyOverviewFitBoundsPlan,
        buildToggleJourneyOverviewActivatePlan: buildToggleJourneyOverviewActivatePlan,
        buildToggleJourneyOverviewDeactivatePlan: buildToggleJourneyOverviewDeactivatePlan,
        buildJourneyOverviewButtonUiExecutePlan: buildJourneyOverviewButtonUiExecutePlan,
        ZOOM_FOLLOW_TOGGLE_ID: ZOOM_FOLLOW_TOGGLE_ID,
        ZOOM_FOLLOW_STORAGE_KEY: ZOOM_FOLLOW_STORAGE_KEY,
        resolveZoomAndFollowEnabledFromStorage: resolveZoomAndFollowEnabledFromStorage,
        buildToggleZoomAndFollowOrchestrationPlan: buildToggleZoomAndFollowOrchestrationPlan,
        buildToggleZoomAndFollowEnabledExecutePlan: buildToggleZoomAndFollowEnabledExecutePlan,
        buildToggleZoomAndFollowDisabledExecutePlan: buildToggleZoomAndFollowDisabledExecutePlan,
        buildZoomFollowButtonUiExecutePlan: buildZoomFollowButtonUiExecutePlan,
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
        buildToggleARSettingCollectPlan: buildToggleARSettingCollectPlan,
        buildToggleARSettingExecutePlan: buildToggleARSettingExecutePlan,
        buildToggleARModeEntryPlan: buildToggleARModeEntryPlan,
        buildToggleARModeStartResultPlan: buildToggleARModeStartResultPlan,
        buildStopARModeExecutePlan: buildStopARModeExecutePlan,
        getNavigationFabVisibilityPlan: getNavigationFabVisibilityPlan,
        getNavStartExtraFabDisplay: getNavStartExtraFabDisplay,
        getNavStartFabDisplayPlan: getNavStartFabDisplayPlan,
        getNavStopFabHidePlan: getNavStopFabHidePlan,
        getNavStopStatusMessage: getNavStopStatusMessage,
        getNavStopNotification: getNavStopNotification,
        buildNavStopPreflightPlan: buildNavStopPreflightPlan,
        buildNavStopStateResetPlan: buildNavStopStateResetPlan,
        buildNavStopLifecycleExecutePlan: buildNavStopLifecycleExecutePlan,
        buildNavStopEntryOrchestrationPlan: buildNavStopEntryOrchestrationPlan,
        buildNavStopRuntimeApplyPlan: buildNavStopRuntimeApplyPlan,
        buildNavStopFabDomExecutePlan: buildNavStopFabDomExecutePlan,
        buildNavStopServicesOrchestrationPlan: buildNavStopServicesOrchestrationPlan,
        getWakeLockAcquiredStatusMessage: getWakeLockAcquiredStatusMessage,
        buildNavStartUserFeedbackPlan: buildNavStartUserFeedbackPlan,
        getNavStartNoGeometryStatusMessage: getNavStartNoGeometryStatusMessage,
        getNavStartInvalidGeometryStatusMessage: getNavStartInvalidGeometryStatusMessage,
        getNavStartDecodeGeometryErrorStatusMessage: getNavStartDecodeGeometryErrorStatusMessage,
        buildNavStartPreflightPlan: buildNavStartPreflightPlan,
        buildNavStartEntryOrchestrationPlan: buildNavStartEntryOrchestrationPlan,
        buildNavStartStateInitPlan: buildNavStartStateInitPlan,
        buildNavStartRuntimeApplyPlan: buildNavStartRuntimeApplyPlan,
        buildNavStartPolylineInitExecutePlan: buildNavStartPolylineInitExecutePlan,
        buildNavStartServicesOrchestrationPlan: buildNavStartServicesOrchestrationPlan,
        buildNavStartLifecycleExecutePlan: buildNavStartLifecycleExecutePlan,
        buildNavStartFabDomExecutePlan: buildNavStartFabDomExecutePlan,
        buildNavStartDriverViewSchedulePlan: buildNavStartDriverViewSchedulePlan,
        buildNavStartWakeLockExecutePlan: buildNavStartWakeLockExecutePlan,
        buildNavForegroundWakeLockEnsurePlan: buildNavForegroundWakeLockEnsurePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

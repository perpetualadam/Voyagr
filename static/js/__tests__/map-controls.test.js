/**
 * Tests for modules/map/map-controls.js
 */
const MC = require('../modules/map/map-controls.js');

describe('map-controls module', () => {
    test('exposes zoom follow and journey overview icons', () => {
        expect(MC.ZOOM_FOLLOW_ENABLED_ICON).toBe('📍');
        expect(MC.ZOOM_FOLLOW_DISABLED_ICON).toBe('🔓');
        expect(MC.JOURNEY_OVERVIEW_ICON).toBe('🗺️');
        expect(MC.JOURNEY_RETURN_ICON).toBe('📍');
        expect(MC.AR_ACTIVE_LABEL).toContain('Exit AR');
        expect(MC.AR_INACTIVE_LABEL).toContain('AR View');
    });

    test('exposes journey overview button background colours', () => {
        expect(MC.JOURNEY_OVERVIEW_ACTIVE_BACKGROUND).toBe('#4CAF50');
        expect(MC.JOURNEY_OVERVIEW_INACTIVE_BACKGROUND).toBe('#9C27B0');
    });

    test('getZoomFollowButtonDisplay and getJourneyOverviewButtonDisplay', () => {
        const on = MC.getZoomFollowButtonDisplay(true);
        expect(on.background).toBe('#FF9800');
        expect(on.innerHtml).toBe(MC.ZOOM_FOLLOW_ENABLED_ICON);
        const off = MC.getZoomFollowButtonDisplay(false);
        expect(off.background).toBe('#9E9E9E');
        const overview = MC.getJourneyOverviewButtonDisplay(true);
        expect(overview.innerHtml).toBe(MC.JOURNEY_RETURN_ICON);
        expect(overview.title).toContain('Return');
    });

    test('map controls hint helpers format labels and filter elements', () => {
        expect(MC.shouldSkipMapControlsHintElement('mapControlsHintFab')).toBe(true);
        expect(MC.shouldSkipMapControlsHintElement('voiceFab')).toBe(false);
        expect(MC.isMapControlsHintElementVisible('flex', 'visible')).toBe(true);
        expect(MC.isMapControlsHintElementVisible('none', 'visible')).toBe(false);
        expect(MC.formatMapControlsHintItemLabel('  🎤  mic ', 'Voice commands')).toContain('Voice commands');
        expect(MC.MAP_CONTROLS_HINT_EXTRAS.length).toBeGreaterThan(0);
    });

    test('map controls hint modal execute plans expose modal wiring', () => {
        const open = MC.buildOpenMapControlsHintModalExecutePlan();
        expect(open.shouldOpen).toBe(true);
        expect(open.modalId).toBe(MC.MAP_CONTROLS_HINT_MODAL_ID);
        expect(open.listId).toBe(MC.MAP_CONTROLS_HINT_LIST_ID);
        expect(open.sections.length).toBeGreaterThan(0);
        expect(open.extras).toEqual(MC.MAP_CONTROLS_HINT_EXTRAS);
        expect(open.modalDisplay).toBe('block');

        const close = MC.buildCloseMapControlsHintModalExecutePlan();
        expect(close.shouldClose).toBe(true);
        expect(close.modalId).toBe(MC.MAP_CONTROLS_HINT_MODAL_ID);
        expect(close.modalDisplay).toBe('none');
    });

    test('buildFabLongPressHintBindPlan uses defaults and allows overrides', () => {
        const defaults = MC.buildFabLongPressHintBindPlan();
        expect(defaults.shouldBind).toBe(true);
        expect(defaults.datasetKey).toBe('voyagrLongPressHint');
        expect(defaults.longPressMs).toBe(MC.MAP_ICON_HINT_LONG_PRESS_MS);
        expect(defaults.moveThresholdPx2).toBe(100);
        expect(defaults.singleTouchOnly).toBe(true);

        const custom = MC.buildFabLongPressHintBindPlan({ longPressMs: 500, moveThresholdPx2: 200 });
        expect(custom.longPressMs).toBe(500);
        expect(custom.moveThresholdPx2).toBe(200);
    });

    test('AR preference and button display helpers', () => {
        const storage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };
        expect(MC.isAREnabledInStorage(storage)).toBe(false);
        MC.writeAREnabledToStorage(storage, true);
        expect(MC.isAREnabledInStorage(storage)).toBe(true);
        const active = MC.getARModeButtonDisplay('active');
        expect(active.active).toBe(true);
        expect(active.innerHtml).toBe(MC.AR_ACTIVE_LABEL);
        const idle = MC.getARModeButtonDisplay('idle');
        expect(idle.active).toBe(false);
        expect(idle.innerHtml).toBe(MC.AR_INACTIVE_LABEL);
    });

    test('applyARModeToggleButton delegates to toggle-ui', () => {
        const TU = require('../modules/ui/toggle-ui.js');
        const btn = document.createElement('button');
        MC.applyARModeToggleButton(btn, true, TU);
        expect(btn.classList.contains('active')).toBe(true);
        MC.applyARModeToggleButton(btn, false, TU);
        expect(btn.classList.contains('active')).toBe(false);
    });

    test('AR toggle execute plans wire setting and mode entry', () => {
        const setting = MC.buildToggleARSettingExecutePlan({ enabled: false, arModeActive: true });
        expect(setting.stopArModeIfDisabling).toBe(true);
        expect(setting.toggleId).toBe(MC.AR_SETTINGS_TOGGLE_ID);

        const entry = MC.buildToggleARModeEntryPlan({ arModeActive: true });
        expect(entry.shouldStop).toBe(true);

        const start = MC.buildToggleARModeStartResultPlan({ success: true, mode: 'webxr' });
        expect(start.arModeActive).toBe(true);
        expect(start.statusMessage).toContain('webxr');

        const stop = MC.buildStopARModeExecutePlan();
        expect(stop.statusMessage).toContain('Returned');
    });

    test('getARFabVisibilityDisplay and applyARModeButtonState', () => {
        const on = MC.getARFabVisibilityDisplay(true, true, false);
        expect(on.visible).toBe(true);
        expect(on.display).toBe('flex');
        expect(on.textContent).toBe(MC.AR_FAB_VISIBLE_ICON);
        const off = MC.getARFabVisibilityDisplay(false, true, true);
        expect(off.visible).toBe(false);
        const btn = document.createElement('button');
        MC.applyARModeButtonState(btn, 'active');
        expect(btn.classList.contains('active')).toBe(true);
        expect(btn.innerHTML).toBe(MC.AR_ACTIVE_LABEL);
    });

    test('navigation FAB visibility plans', () => {
        const active = MC.getNavigationFabVisibilityPlan(true);
        expect(active.endBtnDisplay).toBe('block');
        expect(active.startBtnDisplay).toBe('none');
        const idle = MC.getNavigationFabVisibilityPlan(false);
        expect(idle.endBtnDisplay).toBe('none');
        expect(MC.getNavStartExtraFabDisplay().arModeBtnDisplay).toBe('flex');
    });

    test('nav stop FAB hide plan and status messages', () => {
        const plan = MC.getNavStopFabHidePlan();
        expect(plan.zoomFollowDisplay).toBe('none');
        expect(plan.arModeBtnDisplay).toBe('none');
        expect(MC.getNavStopStatusMessage()).toBe('Navigation stopped');
        expect(MC.getNavStopNotification().title).toBe('Navigation Ended');
    });

    test('nav start feedback and wake lock status copy', () => {
        expect(MC.getWakeLockAcquiredStatusMessage()).toContain('Screen lock');
        const fresh = MC.buildNavStartUserFeedbackPlan(false);
        expect(fresh.notificationTitle).toBe('Navigation Started');
        expect(fresh.speakMessage).toContain('Navigation started');
        expect(fresh.statusMessage).toContain('active');
        const resume = MC.buildNavStartUserFeedbackPlan(true);
        expect(resume.notificationTitle).toBe('Navigation resumed');
        expect(resume.speakMessage).toBeNull();
        expect(resume.statusMessage).toContain('resumed');
    });

    test('nav start FAB display plan shows zoom and journey overview', () => {
        const plan = MC.getNavStartFabDisplayPlan();
        expect(plan.zoomFollowDisplay).toBe('block');
        expect(plan.journeyOverviewDisplay).toBe('block');
        expect(plan.mapFollowingActive).toBe(true);
    });

    test('nav start geometry error status messages', () => {
        expect(MC.getNavStartNoGeometryStatusMessage()).toContain('geometry');
        expect(MC.getNavStartInvalidGeometryStatusMessage()).toContain('Invalid');
        expect(MC.getNavStartDecodeGeometryErrorStatusMessage()).toContain('decode');
    });

    test('buildNavStartPreflightPlan and state init plans', () => {
        expect(MC.buildNavStartPreflightPlan(null).ok).toBe(false);
        const preflight = MC.buildNavStartPreflightPlan({ geometry: 'abc', maneuvers: [] });
        expect(preflight.ok).toBe(true);

        const polylinePreflight = MC.buildNavStartPreflightPlan(
            { maneuvers: [{ type: 1 }] },
            { persistedPolyline: [[51.5, -0.1], [51.6, -0.2]] }
        );
        expect(polylinePreflight.ok).toBe(true);
        expect(polylinePreflight.usePersistedPolyline).toBe(true);

        const state = MC.buildNavStartStateInitPlan(
            { geometry: 'abc', geometry_precision: 5, maneuvers: [{ type: 1 }] },
            { resumeStepIndex: 2, fromPersistedResume: true }
        );
        expect(state.currentStepIndex).toBe(2);
        expect(state.resetVoiceOnStart).toBe(false);
        expect(state.navPrecision).toBe(5);

        const polylineState = MC.buildNavStartStateInitPlan(
            { maneuvers: [{ type: 1 }] },
            { fromPersistedResume: true, persistedPolyline: [[1, 2], [3, 4]] }
        );
        expect(polylineState.usePersistedPolyline).toBe(true);
        expect(polylineState.persistedPolyline).toHaveLength(2);

        const lifecycle = MC.buildNavStartLifecycleExecutePlan({
            isTrackingActive: false,
            autoTrafficUpdateEnabled: true,
            routeTrafficEnabled: false,
        });
        expect(lifecycle.startGpsIfInactive).toBe(true);
        expect(lifecycle.startAutoTraffic).toBe(true);
        expect(lifecycle.startRouteTraffic).toBe(false);
    });

    test('buildNavStartFabDomExecutePlan lists nav start FAB element displays', () => {
        const execute = MC.buildNavStartFabDomExecutePlan({ driverPerspectiveActive: true });
        expect(execute.shouldApply).toBe(true);
        expect(execute.mapFollowingActive).toBe(true);
        expect(execute.elementDisplays.find((item) => item.id === 'zoomFollowToggle').display).toBe('block');
        expect(execute.elementDisplays.find((item) => item.id === 'arModeBtn').display).toBe('flex');
        expect(execute.applyDriverPerspectiveToggle).toBe(true);
        expect(execute.updateSpeedWidget).toBe(true);
    });

    test('buildNavStartDriverViewSchedulePlan gates camera apply on map and follow state', () => {
        const schedule = MC.buildNavStartDriverViewSchedulePlan({
            delayMs: 1500,
            hasMap: true,
            hasPosition: true,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        expect(schedule.shouldSchedule).toBe(true);
        expect(schedule.delayMs).toBe(1500);
        expect(schedule.applyWhenReady.hasMap).toBe(true);
        expect(schedule.applyWhenReady.mapFollowingActive).toBe(true);
    });

    test('buildNavStartWakeLockExecutePlan requests lock when API is available', () => {
        const supported = MC.buildNavStartWakeLockExecutePlan(true, {
            wakeLockAcquireLog: 'acquired',
            wakeLockReleaseLog: 'released',
        });
        expect(supported.shouldRequest).toBe(true);
        expect(supported.lockType).toBe('screen');
        expect(supported.successStatusMessage).toBeTruthy();

        const unsupported = MC.buildNavStartWakeLockExecutePlan(false, {
            wakeLockUnsupportedLog: 'unsupported',
        });
        expect(unsupported.shouldRequest).toBe(false);
        expect(unsupported.unsupportedLog).toBe('unsupported');
    });

    test('buildShowMapHintToastExecutePlan and touch hint environment detection', () => {
        expect(MC.buildShowMapHintToastExecutePlan('').shouldShow).toBe(false);
        const show = MC.buildShowMapHintToastExecutePlan('Recenter map');
        expect(show.toastId).toBe(MC.MAP_HINT_TOAST_ID);
        expect(show.autoDismissMs).toBe(MC.MAP_HINT_AUTO_DISMISS_MS);

        expect(MC.isTouchHintsEnvironment({ navigator: { maxTouchPoints: 1 }, window: {} })).toBe(true);
        expect(MC.buildInitMobileMapIconHintsPlan({ touchHintsEnabled: true }).shouldInit).toBe(true);
    });

    test('buildNavStopPreflightPlan and lifecycle execute plans', () => {
        expect(MC.buildNavStopPreflightPlan(false, false).shouldStop).toBe(false);
        expect(MC.buildNavStopPreflightPlan(true, false).shouldStop).toBe(true);
        const lifecycle = MC.buildNavStopLifecycleExecutePlan({
            routeInProgress: true,
            lastCalculatedRoute: { distance_km: 10 },
            hasWakeLock: true,
            arModeActive: false,
            updatePending: false,
        });
        expect(lifecycle.persistCompletedTrip).toBe(true);
        expect(lifecycle.stopAutoTraffic).toBe(true);
        expect(MC.buildNavStopStateResetPlan().routeInProgress).toBe(false);
    });

    test('map explore handler plans gate binding and follow pause', () => {
        expect(MC.buildMapMoveHandlerSetupPlan({ hasMap: false }).shouldBind).toBe(false);
        expect(MC.buildMapMoveHandlerSetupPlan({ hasMap: true }).eventName).toBe('move');

        const sync = MC.buildMapCenterSyncExecutePlan({
            routeInProgress: false,
            isTrackingActive: false,
            center: { lat: 51.5, lng: -0.1 },
        });
        expect(sync.shouldSync).toBe(true);
        expect(MC.buildMapCenterSyncExecutePlan({ routeInProgress: true }).shouldSync).toBe(false);

        expect(MC.buildMapExploreHandlersSetupPlan({ hasMap: true, alreadyInitialized: true }).shouldBind)
            .toBe(false);
        const explore = MC.buildMapExploreHandlersSetupPlan({ hasMap: true });
        expect(explore.gestureEvents).toContain('dragstart');

        const gesture = MC.buildMapExploreGestureExecutePlan({
            hasOriginalEvent: true,
            routeInProgress: true,
            zoomAndFollowEnabled: true,
            mapFollowingActive: true,
        });
        expect(gesture.pauseMapFollowing).toBe(true);
        expect(MC.buildMapExploreMoveEndExecutePlan().updateRecenterVisibility).toBe(true);
    });

    test('recenter vehicle visibility and action plans', () => {
        expect(MC.RECENTER_MIN_DISTANCE_M).toBe(70);
        expect(MC.buildShouldShowRecenterVehicleButtonPlan({
            hasMap: true,
            currentLat: 1,
            currentLon: 2,
            routeInProgress: true,
            journeyOverviewActive: true,
        }).shouldShow).toBe(true);
        expect(MC.buildRecenterButtonVisibilityExecutePlan(true).display).toBe('flex');
        expect(MC.buildRecenterOnVehiclePreflightPlan({ hasMap: false }).shouldRecenter).toBe(false);
        expect(MC.buildRecenterTrackingEasePlan({ lat: 1, lon: 2, currentZoom: 15 }).easeTo.zoom).toBe(16);
    });
});

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

        const state = MC.buildNavStartStateInitPlan(
            { geometry: 'abc', geometry_precision: 5, maneuvers: [{ type: 1 }] },
            { resumeStepIndex: 2, fromPersistedResume: true }
        );
        expect(state.currentStepIndex).toBe(2);
        expect(state.resetVoiceOnStart).toBe(false);
        expect(state.navPrecision).toBe(5);

        const lifecycle = MC.buildNavStartLifecycleExecutePlan({
            isTrackingActive: false,
            autoTrafficUpdateEnabled: true,
            routeTrafficEnabled: false,
        });
        expect(lifecycle.startGpsIfInactive).toBe(true);
        expect(lifecycle.startAutoTraffic).toBe(true);
        expect(lifecycle.startRouteTraffic).toBe(false);
    });
});

/**
 * Tests for modules/navigation/legacy-prefs-restore.js
 */
const LPR = require('../modules/navigation/legacy-prefs-restore.js');

describe('legacy-prefs-restore module', () => {
    test('buildLoadLegacyPreferencesOrchestrationPlan lists restore steps', () => {
        const orch = LPR.buildLoadLegacyPreferencesOrchestrationPlan();
        expect(orch.applyRouteAvoidanceToggles).toBe(true);
        expect(orch.restoreBatterySavingPreference).toBe(true);
    });

    test('buildRestoreGesturePreferencePlan never restores shake gesture', () => {
        expect(LPR.buildLoadLegacyPreferencesOrchestrationPlan().restoreGesturePreference).toBe(false);
        expect(LPR.buildRestoreGesturePreferencePlan({ savedValue: 'false' }).shouldRestore).toBe(false);
        const restore = LPR.buildRestoreGesturePreferencePlan({
            savedValue: 'true',
            hasDeviceMotion: true,
        });
        expect(restore.shouldRestore).toBe(false);
        expect(restore.gestureEnabled).toBe(false);
        expect(restore.addDeviceMotionListener).toBe(false);
    });

    test('buildRestoreAutoGpsPreferencePlan starts auto GPS when saved', () => {
        const restore = LPR.buildRestoreAutoGpsPreferencePlan({ savedValue: 'true' });
        expect(restore.shouldRestore).toBe(true);
        expect(restore.startAutoGpsLocation).toBe(true);
        expect(restore.toggle.id).toBe(LPR.AUTO_GPS_TOGGLE_ID);
    });
});

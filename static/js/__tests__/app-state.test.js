/**
 * Tests for modules/navigation/app-state.js
 */
const AS = require('../modules/navigation/app-state.js');

describe('app-state module', () => {
    test('resolvePreferenceStorageKey maps direct and pref keys', () => {
        expect(AS.resolvePreferenceStorageKey('mapTheme')).toBe('mapTheme');
        expect(AS.resolvePreferenceStorageKey('mlPredictions')).toBe('mlPredictionsEnabled');
        expect(AS.resolvePreferenceStorageKey('gestureControl')).toBe('gestureEnabled');
        expect(AS.resolvePreferenceStorageKey('tolls')).toBe('pref_tolls');
        expect(AS.resolvePreferenceStorageKey('caz')).toBe('pref_caz');
    });

    test('buildSaveAppStatePlan wraps preferences and ui snapshot', () => {
        const plan = AS.buildSaveAppStatePlan({
            preferences: { mapTheme: 'dark', tolls: 'true' },
            ui: { activeTab: 'settings' },
            now: 1000,
        });
        expect(plan.storageKey).toBe(AS.APP_STATE_STORAGE_KEY);
        expect(plan.state.preferences.mapTheme).toBe('dark');
        expect(plan.state.ui.activeTab).toBe('settings');
        expect(plan.state.timestamp).toBe(1000);
    });

    test('buildRestoreAppStateExecutePlan writes canonical storage keys', () => {
        const execute = AS.buildRestoreAppStateExecutePlan({
            preferences: {
                mapTheme: 'satellite',
                mlPredictions: 'true',
                gestureControl: 'true',
                tolls: 'false',
                caz: 'true',
            },
            ui: { activeTab: 'navigation' },
        });
        expect(execute.shouldRestore).toBe(true);
        expect(execute.storagePatches).toEqual(expect.arrayContaining([
            { key: 'mapTheme', value: 'satellite' },
            { key: 'mlPredictionsEnabled', value: 'true' },
            { key: 'gestureEnabled', value: 'true' },
            { key: 'pref_tolls', value: 'false' },
            { key: 'pref_caz', value: 'true' },
        ]));
        expect(execute.pendingUiRestore).toEqual({ activeTab: 'navigation' });
    });

    test('buildSaveAppStatePreferencesCollectPlan reads canonical storage keys', () => {
        const prefs = AS.buildSaveAppStatePreferencesCollectPlan({
            avoidTolls: true,
            getStorageItem: (key) => (key === 'mapTheme' ? 'dark' : key === 'pref_caz' ? 'false' : null),
        });
        expect(prefs.tolls).toBe('true');
        expect(prefs.mapTheme).toBe('dark');
        expect(prefs.caz).toBe('false');
    });

    test('buildSaveAppStateExecutePlan serialises collect input', () => {
        const execute = AS.buildSaveAppStateExecutePlan({
            avoidTolls: false,
            getStorageItem: () => null,
            activeTab: 'settings',
            bottomSheetExpanded: false,
        });
        expect(execute.shouldSave).toBe(true);
        expect(execute.storageKey).toBe(AS.APP_STATE_STORAGE_KEY);
        const parsed = JSON.parse(execute.storageValue);
        expect(parsed.ui.activeTab).toBe('settings');
        expect(parsed.ui.bottomSheetExpanded).toBe(false);
        expect(parsed.preferences.tolls).toBe('false');
    });

    test('buildRestoreAppStateApplyPlan bundles storage patches and pending UI', () => {
        const orch = AS.buildRestoreAppStateOrchestrationPlan();
        const execute = AS.buildRestoreAppStateExecutePlan({
            preferences: { caz: 'true' },
            ui: { activeTab: 'history' },
        });
        const apply = AS.buildRestoreAppStateApplyPlan(execute, orch);
        expect(apply.shouldApply).toBe(true);
        expect(apply.pendingUiRestoreProperty).toBe(orch.pendingUiRestoreProperty);
        expect(apply.pendingUiRestore.activeTab).toBe('history');
    });
});

/**
 * Tests for modules/navigation/route-prefs.js
 */
const RoutePrefs = require('../modules/navigation/route-prefs.js');

describe('route-prefs module', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('migrateTollPrefKey', () => {
        test('copies legacy pref_tolls when canonical key missing', () => {
            localStorage.setItem('pref_tolls', 'false');
            RoutePrefs.migrateTollPrefKey(localStorage);
            expect(localStorage.getItem('pref_avoid_tollRoads')).toBe('false');
        });

        test('does not overwrite existing canonical key', () => {
            localStorage.setItem('pref_avoid_tollRoads', 'true');
            localStorage.setItem('pref_tolls', 'false');
            RoutePrefs.migrateTollPrefKey(localStorage);
            expect(localStorage.getItem('pref_avoid_tollRoads')).toBe('true');
        });
    });

    describe('isAvoidTollsEnabled', () => {
        test('reads canonical key when set', () => {
            localStorage.setItem('pref_avoid_tollRoads', 'false');
            expect(RoutePrefs.isAvoidTollsEnabled(localStorage)).toBe(false);
        });

        test('falls back to legacy default-enabled semantic', () => {
            expect(RoutePrefs.isAvoidTollsEnabled(localStorage)).toBe(true);
            localStorage.setItem('pref_tolls', 'false');
            expect(RoutePrefs.isAvoidTollsEnabled(localStorage)).toBe(false);
        });
    });

    describe('getRouteCostParams', () => {
        test('returns vehicle-type defaults', () => {
            const p = RoutePrefs.getRouteCostParams('electric', localStorage);
            expect(p.fuel_efficiency).toBe(6.5);
            expect(p.electricity_price).toBe(0.32);
        });

        test('localStorage overrides defaults', () => {
            localStorage.setItem('fuelPrice', '1.99');
            const p = RoutePrefs.getRouteCostParams('petrol_diesel', localStorage);
            expect(p.fuel_price).toBe(1.99);
        });
    });

    describe('getRoutePreferences', () => {
        test('returns defaults when storage unset', () => {
            const prefs = RoutePrefs.getRoutePreferences(localStorage);
            expect(prefs.routeOptimization).toBe('fastest');
            expect(prefs.maxDetour).toBe(20);
            expect(prefs.avoidTolls).toBe(true);
        });

        test('parses saved JSON from storage', () => {
            localStorage.setItem('routePreferences', JSON.stringify({
                preferScenic: true,
                maxDetour: 35,
            }));
            const prefs = RoutePrefs.getRoutePreferences(localStorage);
            expect(prefs.preferScenic).toBe(true);
            expect(prefs.maxDetour).toBe(35);
        });
    });

    describe('route avoidance preference helpers', () => {
        test('resolveRouteAvoidanceButtonId maps known prefs', () => {
            expect(RoutePrefs.resolveRouteAvoidanceButtonId('caz')).toBe('avoidCAZ');
            expect(RoutePrefs.resolveRouteAvoidanceButtonId('cameras')).toBe('avoidCameras');
        });

        test('isRouteAvoidancePrefEnabled defaults cameras to enabled', () => {
            expect(RoutePrefs.isRouteAvoidancePrefEnabled('cameras', localStorage)).toBe(true);
            localStorage.setItem('pref_cameras', 'false');
            expect(RoutePrefs.isRouteAvoidancePrefEnabled('cameras', localStorage)).toBe(false);
        });

        test('buildRouteAvoidanceTogglesApplyPlan lists all avoidance toggles', () => {
            const plan = RoutePrefs.buildRouteAvoidanceTogglesApplyPlan(localStorage);
            expect(plan.length).toBe(RoutePrefs.ROUTE_AVOIDANCE_PREF_KEYS.length);
            const cameras = plan.find((item) => item.pref === 'cameras');
            expect(cameras.buttonId).toBe('avoidCameras');
            expect(cameras.enabled).toBe(true);
            expect(cameras.usesDefault).toBe(true);
            localStorage.setItem('pref_cameras', 'false');
            const updated = RoutePrefs.buildRouteAvoidanceTogglesApplyPlan(localStorage);
            expect(updated.find((item) => item.pref === 'cameras').enabled).toBe(false);
            expect(updated.find((item) => item.pref === 'cameras').usesDefault).toBe(false);
        });

        test('buildRoutePreferencesUiApplyPlan maps storage to form patches', () => {
            localStorage.setItem('routePreferences', JSON.stringify({
                preferScenic: true,
                routeOptimization: 'shortest',
                maxDetour: 30,
            }));
            const plan = RoutePrefs.buildRoutePreferencesUiApplyPlan(localStorage);
            expect(plan.checks.preferScenic).toBe(true);
            expect(plan.selects.routeOptimization).toBe('shortest');
            expect(plan.selects.maxDetour).toBe(30);
            expect(plan.elementIds.maxDetour).toBe('maxDetour');
            expect(plan.updateDetourLabel).toBe(true);
        });
    });

    describe('route leg avoidance preference helpers', () => {
        test('resolveRouteLegAvoidanceButtonId maps toll roads, motorways, ferries', () => {
            expect(RoutePrefs.resolveRouteLegAvoidanceButtonId('tollRoads')).toBe('avoidTollRoads');
            expect(RoutePrefs.resolveRouteLegAvoidanceButtonId('motorways')).toBe('avoidMotorways');
            expect(RoutePrefs.resolveRouteLegAvoidanceButtonId('ferries')).toBe('avoidFerries');
        });

        test('isRouteLegAvoidancePrefEnabled defaults to false when unset', () => {
            expect(RoutePrefs.isRouteLegAvoidancePrefEnabled('tollRoads', localStorage)).toBe(false);
            localStorage.setItem('pref_avoid_motorways', 'true');
            expect(RoutePrefs.isRouteLegAvoidancePrefEnabled('motorways', localStorage)).toBe(true);
        });
    });
});

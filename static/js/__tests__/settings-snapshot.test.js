/**
 * Tests for modules/navigation/settings-snapshot.js
 */
const SS = require('../modules/navigation/settings-snapshot.js');

describe('settings-snapshot module', () => {
    test('exposes storage key constant', () => {
        expect(SS.SETTINGS_STORAGE_KEY).toBe('voyagr_all_settings');
    });

    test('buildSettingsSnapshot assembles cross-cutting prefs blob', () => {
        const snapshot = SS.buildSettingsSnapshot({
            distanceUnit: 'mi',
            currencyUnit: 'GBP',
            speedUnit: 'mph',
            temperatureUnit: 'c',
            vehicleType: 'petrol',
            routingMode: 'fastest',
            routePreferences: { avoidTolls: true },
            hazardPreferences: { avoidCameras: true, avoidCAZ: true, avoidTolls: true },
            mapTheme: 'dark',
            smartZoomEnabled: true,
            showCamerasEnabled: false,
            showOsmTrafficLightsEnabled: true,
            showOsmRailwayCrossingsEnabled: false,
            showTrafficEnabled: true,
            autoTrafficUpdateEnabled: true,
            autoRerouteOnDeviationEnabled: false,
            speedWidgetEnabled: true,
            parkingPreferences: { maxWalkingDistance: '5' },
            multiDropPreferences: { roundTrip: true, optimizeStopOrder: false },
            now: Date.parse('2026-07-11T12:00:00.000Z'),
        });
        expect(snapshot.unit_distance).toBe('mi');
        expect(snapshot.vehicleType).toBe('petrol');
        expect(snapshot.multiDropPreferences.roundTrip).toBe(true);
        expect(snapshot.lastSaved).toBe('2026-07-11T12:00:00.000Z');
    });

    test('buildSettingsRestorePlan maps hazard prefs to canonical localStorage keys', () => {
        const plan = SS.buildSettingsRestorePlan({
            unit_distance: 'km',
            vehicleType: 'electric',
            hazardPreferences: {
                avoidTolls: false,
                avoidCAZ: true,
                avoidCameras: false,
                avoidTrafficLights: true,
                avoidRailwayCrossings: false,
            },
        });
        expect(plan.found).toBe(true);
        expect(plan.localStorage.pref_avoid_tollRoads).toBe('false');
        expect(plan.localStorage.pref_tolls).toBe('false');
        expect(plan.localStorage.pref_caz).toBe('true');
        expect(plan.localStorage.pref_cameras).toBe('false');
        expect(plan.runtime.distanceUnit).toBe('km');
        expect(plan.runtime.currentVehicleType).toBe('electric');
    });

    test('buildSettingsRestorePlan restores multi-drop preferences', () => {
        const plan = SS.buildSettingsRestorePlan({
            multiDropPreferences: {
                optimizeStopOrder: false,
                roundTrip: true,
                trafficAwareRouting: true,
                avoidRoadClosures: false,
                avoidIncidents: true,
                departureTime: '08:30',
            },
        });
        expect(plan.localStorage.pref_optimizeStopOrder).toBe('false');
        expect(plan.localStorage.pref_roundTrip).toBe('true');
        expect(plan.localStorage.pref_departureTime).toBe('08:30');
    });

    test('buildSettingsRestorePlan returns found false for missing settings', () => {
        expect(SS.buildSettingsRestorePlan(null)).toEqual({ found: false });
    });
});

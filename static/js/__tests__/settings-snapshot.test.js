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

    test('buildSettingsUiApplyPlan maps runtime values to form control patches', () => {
        const plan = SS.buildSettingsUiApplyPlan({
            distanceUnit: 'mi',
            currencyUnit: 'GBP',
            speedUnit: 'mph',
            temperatureUnit: 'f',
            vehicleType: 'electric',
            routingMode: 'shortest',
            routePreferences: { avoidHighways: true, maxDetour: 15 },
            parkingPreferences: { maxWalkingDistance: '5', preferredType: 'street' },
            mapTheme: 'dark',
            smartZoomEnabled: true,
            autoTrafficUpdateEnabled: false,
            autoRerouteOnDeviationEnabled: true,
            mlPredictionsEnabled: true,
            voiceAnnouncementsEnabled: false,
            batterySavingEnabled: true,
            gestureControlEnabled: false,
        });
        expect(plan.selects.distanceUnit).toBe('mi');
        expect(plan.routePreferenceChecks.avoidHighways).toBe(true);
        expect(plan.routePreferenceChecks.maxDetour).toBe(15);
        expect(plan.parkingSelects.maxWalkingDistance).toBe('5');
        expect(plan.toggleButtons.smartZoom).toBe(true);
        expect(plan.labeledToggleButtons.mlPredictions).toBe(true);
        expect(plan.detourLabel.text).toBe('15%');
        expect(plan.sideEffects.applySpeedWidgetToggleUi).toBe(true);
        expect(plan.sideEffects.updateDetourLabel).toBeUndefined();
    });

    test('buildSettingsUiDomApplyPlan maps semantic plan to element ids', () => {
        const uiPlan = SS.buildSettingsUiApplyPlan({
            distanceUnit: 'mi',
            vehicleType: 'electric',
            routingMode: 'shortest',
            routePreferences: { avoidHighways: true, maxDetour: 15 },
            smartZoomEnabled: true,
            mlPredictionsEnabled: true,
        });
        const dom = SS.buildSettingsUiDomApplyPlan(uiPlan);
        expect(dom.unitSelects.find((item) => item.id === 'distanceUnit').value).toBe('mi');
        expect(dom.routeChecks.find((item) => item.id === 'avoidHighways').checked).toBe(true);
        expect(dom.standardToggles.find((item) => item.id === 'smartZoomToggle').enabled).toBe(true);
        expect(dom.labeledToggles.find((item) => item.id === 'mlPredictionsEnabled').enabled).toBe(true);
        expect(dom.detourLabel.text).toBe('15%');
    });

    test('buildSettingsUiInputPlan merges runtime and stored state', () => {
        const input = SS.buildSettingsUiInputPlan(
            {
                distanceUnit: 'mi',
                vehicleType: 'electric',
                smartZoomEnabled: true,
                mlPredictionsEnabled: true,
            },
            {
                routePreferences: { maxDetour: 12 },
                parkingPreferences: { maxWalkingDistance: '5' },
                mapTheme: 'dark',
            }
        );
        expect(input.distanceUnit).toBe('mi');
        expect(input.routePreferences.maxDetour).toBe(12);
        expect(input.parkingPreferences.maxWalkingDistance).toBe('5');
        expect(input.mapTheme).toBe('dark');
        expect(input.mlPredictionsEnabled).toBe(true);
    });

    test('buildSettingsSnapshotInputPlan merges runtime and form state', () => {
        const input = SS.buildSettingsSnapshotInputPlan(
            {
                distanceUnit: 'km',
                currencyUnit: 'GBP',
                speedUnit: 'kmh',
                temperatureUnit: 'c',
                vehicleType: 'hybrid',
                routingMode: 'fastest',
                smartZoomEnabled: true,
                showCamerasEnabled: false,
                showOsmTrafficLightsEnabled: true,
                showOsmRailwayCrossingsEnabled: false,
                showTrafficEnabled: true,
                autoTrafficUpdateEnabled: false,
                autoRerouteOnDeviationEnabled: true,
                speedWidgetEnabled: true,
            },
            {
                routePreferences: { avoidHighways: true, maxDetour: 25 },
                hazardPreferences: { avoidCameras: false },
                parkingPreferences: { maxWalkingDistance: '8' },
                multiDropPreferences: { roundTrip: true },
                mapTheme: 'dark',
            }
        );
        expect(input.distanceUnit).toBe('km');
        expect(input.routePreferences.avoidHighways).toBe(true);
        expect(input.hazardPreferences.avoidCameras).toBe(false);
        expect(input.multiDropPreferences.roundTrip).toBe(true);
        expect(input.mapTheme).toBe('dark');
    });

    test('buildMultiDropPreferencesStoragePlan maps booleans to localStorage keys', () => {
        const patches = SS.buildMultiDropPreferencesStoragePlan({
            optimizeStopOrder: false,
            roundTrip: true,
            departureTime: '09:15',
        });
        expect(patches.pref_optimizeStopOrder).toBe('false');
        expect(patches.pref_roundTrip).toBe('true');
        expect(patches.pref_departureTime).toBe('09:15');
    });

    test('buildMultiDropPreferencesUiApplyPlan reads storage into form patches', () => {
        const storage = {
            getItem(key) {
                const values = {
                    pref_optimizeStopOrder: 'false',
                    pref_roundTrip: 'true',
                    pref_trafficAwareRouting: 'true',
                    pref_avoidRoadClosures: 'false',
                    pref_avoidIncidents: 'true',
                    pref_departureTime: '08:00',
                };
                return values[key] != null ? values[key] : null;
            },
        };
        const plan = SS.buildMultiDropPreferencesUiApplyPlan(storage);
        expect(plan.checks.optimizeStopOrder).toBe(false);
        expect(plan.checks.roundTrip).toBe(true);
        expect(plan.departureTime).toBe('08:00');
        expect(plan.elementIds.optimizeStopOrder).toBe('optimizeStopOrder');
    });

    test('buildMultiDropPreferencesDomApplyPlan maps checks and departure time', () => {
        const uiPlan = SS.buildMultiDropPreferencesUiApplyPlan({
            getItem(key) {
                const values = {
                    pref_optimizeStopOrder: 'true',
                    pref_roundTrip: 'false',
                    pref_trafficAwareRouting: 'true',
                    pref_avoidRoadClosures: 'false',
                    pref_avoidIncidents: 'true',
                    pref_departureTime: '07:45',
                };
                return values[key] != null ? values[key] : null;
            },
        });
        const dom = SS.buildMultiDropPreferencesDomApplyPlan(uiPlan);
        expect(dom.checks.find((item) => item.id === 'optimizeStopOrder').checked).toBe(true);
        expect(dom.selects.find((item) => item.id === 'departureTime').value).toBe('07:45');
    });

    test('buildSettingsResetPlan lists storage keys and runtime defaults', () => {
        const plan = SS.buildSettingsResetPlan();
        expect(plan.localStorageKeys).toContain(SS.SETTINGS_STORAGE_KEY);
        expect(plan.localStorageKeys).toContain('routePreferences');
        expect(plan.runtimeDefaults.distanceUnit).toBe('km');
        expect(plan.reloadAfterReset).toBe(true);
    });

    test('buildClearDepartureTimeApplyPlan clears departure time control', () => {
        const plan = SS.buildClearDepartureTimeApplyPlan();
        expect(plan.elementId).toBe('departureTime');
        expect(plan.removeStorageKey).toBe('pref_departureTime');
        expect(plan.statusMessage).toContain('cleared');
        expect(plan.statusType).toBe('info');
    });

    test('buildSettingsExportPlan builds download metadata from stored snapshot', () => {
        const raw = JSON.stringify({ unit_distance: 'km', vehicleType: 'petrol' });
        const plan = SS.buildSettingsExportPlan(raw, '2026-07-11');
        expect(plan.ok).toBe(true);
        expect(plan.downloadFilename).toBe('voyagr-settings-2026-07-11.json');
        expect(plan.mimeType).toBe('application/json');
        expect(plan.prettyJson).toContain('"unit_distance": "km"');
        expect(plan.statusType).toBe('success');
    });

    test('buildSettingsExportPlan rejects missing or invalid snapshot', () => {
        expect(SS.buildSettingsExportPlan(null).ok).toBe(false);
        expect(SS.buildSettingsExportPlan('not-json').ok).toBe(false);
    });

    test('buildSettingsImportApplyPlan writes snapshot to canonical storage key', () => {
        const settings = { unit_distance: 'mi', vehicleType: 'electric' };
        const plan = SS.buildSettingsImportApplyPlan(settings);
        expect(plan.ok).toBe(true);
        expect(plan.storageKey).toBe(SS.SETTINGS_STORAGE_KEY);
        expect(JSON.parse(plan.storageValue).unit_distance).toBe('mi');
        expect(plan.restoreAfterImport).toBe(true);
        expect(plan.applyUiAfterImport).toBe(true);
    });

    test('buildSettingsImportParsePlan parses JSON text into import apply plan', () => {
        const plan = SS.buildSettingsImportParsePlan('{"unit_speed":"mph"}');
        expect(plan.ok).toBe(true);
        expect(JSON.parse(plan.storageValue).unit_speed).toBe('mph');
    });

    test('buildSettingsImportParsePlan rejects invalid JSON', () => {
        expect(SS.buildSettingsImportParsePlan('{bad').ok).toBe(false);
    });

    test('buildSettingsImportApplyPlan rejects unrecognised JSON objects', () => {
        expect(SS.buildSettingsImportApplyPlan({ foo: 'bar' }).ok).toBe(false);
        expect(SS.buildSettingsImportApplyPlan({ unit_distance: 'km' }).ok).toBe(true);
    });

    test('isRecognisedSettingsSnapshot detects Voyagr export keys', () => {
        expect(SS.isRecognisedSettingsSnapshot({ vehicleType: 'petrol' })).toBe(true);
        expect(SS.isRecognisedSettingsSnapshot({ random: true })).toBe(false);
        expect(SS.isRecognisedSettingsSnapshot(null)).toBe(false);
    });
});

/**
 * @file Pure settings snapshot serialize/restore plans (no DOM, no network).
 * @module modules/navigation/settings-snapshot
 */
(function (root) {
    'use strict';

    var SETTINGS_STORAGE_KEY = 'voyagr_all_settings';

    /**
     * Build the voyagr_all_settings JSON blob from runtime + form state supplied by the app.
     * @param {Object} input
     * @returns {Object}
     */
    function buildSettingsSnapshot(input) {
        input = input || {};
        var now = input.now != null ? input.now : Date.now();
        return {
            unit_distance: input.distanceUnit,
            unit_currency: input.currencyUnit,
            unit_speed: input.speedUnit,
            unit_temperature: input.temperatureUnit,
            vehicleType: input.vehicleType,
            routingMode: input.routingMode,
            routePreferences: input.routePreferences || {},
            hazardPreferences: input.hazardPreferences || {},
            mapTheme: input.mapTheme,
            smartZoomEnabled: input.smartZoomEnabled,
            showCamerasEnabled: input.showCamerasEnabled,
            showOsmTrafficLightsEnabled: input.showOsmTrafficLightsEnabled,
            showOsmRailwayCrossingsEnabled: input.showOsmRailwayCrossingsEnabled,
            showTrafficEnabled: input.showTrafficEnabled,
            autoTrafficUpdateEnabled: input.autoTrafficUpdateEnabled,
            autoRerouteOnDeviationEnabled: input.autoRerouteOnDeviationEnabled,
            speedWidgetEnabled: input.speedWidgetEnabled,
            parkingPreferences: input.parkingPreferences || {},
            multiDropPreferences: input.multiDropPreferences || {},
            lastSaved: new Date(now).toISOString(),
        };
    }

    /**
     * Merge runtime variables and form state into buildSettingsSnapshot input.
     * @param {Object} runtime - app globals (units, vehicle, toggles)
     * @param {Object} formState - DOM-collected form values from the app
     * @returns {Object}
     */
    function buildSettingsSnapshotInputPlan(runtime, formState) {
        runtime = runtime || {};
        formState = formState || {};
        return {
            distanceUnit: runtime.distanceUnit,
            currencyUnit: runtime.currencyUnit,
            speedUnit: runtime.speedUnit,
            temperatureUnit: runtime.temperatureUnit,
            vehicleType: runtime.vehicleType,
            routingMode: runtime.routingMode,
            routePreferences: formState.routePreferences || {},
            hazardPreferences: formState.hazardPreferences || {},
            mapTheme: formState.mapTheme != null ? formState.mapTheme : 'standard',
            smartZoomEnabled: runtime.smartZoomEnabled,
            showCamerasEnabled: runtime.showCamerasEnabled,
            showOsmTrafficLightsEnabled: runtime.showOsmTrafficLightsEnabled,
            showOsmRailwayCrossingsEnabled: runtime.showOsmRailwayCrossingsEnabled,
            showTrafficEnabled: runtime.showTrafficEnabled,
            autoTrafficUpdateEnabled: runtime.autoTrafficUpdateEnabled,
            autoRerouteOnDeviationEnabled: runtime.autoRerouteOnDeviationEnabled,
            speedWidgetEnabled: runtime.speedWidgetEnabled,
            parkingPreferences: formState.parkingPreferences || {},
            multiDropPreferences: formState.multiDropPreferences || {},
        };
    }

    /**
     * Build localStorage patches and runtime variable updates from a saved snapshot.
     * @param {Object|null|undefined} settings
     * @returns {{ found: boolean, localStorage?: Object, runtime?: Object }}
     */
    function buildSettingsRestorePlan(settings) {
        if (!settings) {
            return { found: false };
        }

        var localStoragePatches = {};
        var runtime = {};

        if (settings.unit_distance) {
            localStoragePatches.unit_distance = settings.unit_distance;
            runtime.distanceUnit = settings.unit_distance;
        }
        if (settings.unit_currency) {
            localStoragePatches.unit_currency = settings.unit_currency;
            runtime.currencyUnit = settings.unit_currency;
        }
        if (settings.unit_speed) {
            localStoragePatches.unit_speed = settings.unit_speed;
            runtime.speedUnit = settings.unit_speed;
        }
        if (settings.unit_temperature) {
            localStoragePatches.unit_temperature = settings.unit_temperature;
            runtime.temperatureUnit = settings.unit_temperature;
        }
        if (settings.vehicleType) {
            localStoragePatches.vehicleType = settings.vehicleType;
            runtime.currentVehicleType = settings.vehicleType;
        }
        if (settings.routingMode) {
            localStoragePatches.routingMode = settings.routingMode;
            runtime.currentRoutingMode = settings.routingMode;
        }
        if (settings.routePreferences) {
            localStoragePatches.routePreferences = JSON.stringify(settings.routePreferences);
        }

        if (settings.hazardPreferences) {
            var tollVal = settings.hazardPreferences.avoidTolls ? 'true' : 'false';
            localStoragePatches.pref_avoid_tollRoads = tollVal;
            localStoragePatches.pref_tolls = tollVal;
            localStoragePatches.pref_caz = settings.hazardPreferences.avoidCAZ ? 'true' : 'false';
            localStoragePatches.pref_cameras = settings.hazardPreferences.avoidCameras ? 'true' : 'false';
            if (settings.hazardPreferences.avoidTrafficLights !== undefined) {
                localStoragePatches.pref_trafficLightsAvoid = settings.hazardPreferences.avoidTrafficLights ? 'true' : 'false';
            }
            if (settings.hazardPreferences.avoidRailwayCrossings !== undefined) {
                localStoragePatches.pref_railwayCrossingsAvoid = settings.hazardPreferences.avoidRailwayCrossings ? 'true' : 'false';
            }
        }

        if (settings.mapTheme) {
            localStoragePatches.mapTheme = settings.mapTheme;
        }
        if (settings.smartZoomEnabled !== undefined) {
            runtime.smartZoomEnabled = settings.smartZoomEnabled;
            localStoragePatches.smartZoomEnabled = settings.smartZoomEnabled ? '1' : '0';
        }
        if (settings.showCamerasEnabled !== undefined) {
            runtime.showCamerasEnabled = settings.showCamerasEnabled;
            localStoragePatches.showCamerasEnabled = settings.showCamerasEnabled ? 'true' : 'false';
        }
        if (settings.showOsmTrafficLightsEnabled !== undefined) {
            runtime.showOsmTrafficLightsEnabled = settings.showOsmTrafficLightsEnabled;
            localStoragePatches.showOsmTrafficLightsOnMap = settings.showOsmTrafficLightsEnabled ? 'true' : 'false';
        }
        if (settings.showOsmRailwayCrossingsEnabled !== undefined) {
            runtime.showOsmRailwayCrossingsEnabled = settings.showOsmRailwayCrossingsEnabled;
            localStoragePatches.showOsmRailwayCrossingsOnMap = settings.showOsmRailwayCrossingsEnabled ? 'true' : 'false';
        }
        if (settings.showTrafficEnabled !== undefined) {
            runtime.showTrafficEnabled = settings.showTrafficEnabled;
            localStoragePatches.showTrafficEnabled = settings.showTrafficEnabled ? 'true' : 'false';
        }
        if (settings.autoTrafficUpdateEnabled !== undefined) {
            runtime.autoTrafficUpdateEnabled = settings.autoTrafficUpdateEnabled;
            localStoragePatches.autoTrafficUpdate = settings.autoTrafficUpdateEnabled ? 'true' : 'false';
        }
        if (settings.autoRerouteOnDeviationEnabled !== undefined) {
            runtime.autoRerouteOnDeviationEnabled = settings.autoRerouteOnDeviationEnabled;
            localStoragePatches.autoRerouteOnDeviation = settings.autoRerouteOnDeviationEnabled ? 'true' : 'false';
        }
        if (settings.speedWidgetEnabled !== undefined) {
            runtime.speedWidgetEnabled = !!settings.speedWidgetEnabled;
            localStoragePatches.speedWidgetEnabled = runtime.speedWidgetEnabled ? 'true' : 'false';
        }
        if (settings.parkingPreferences) {
            localStoragePatches.parkingPreferences = JSON.stringify(settings.parkingPreferences);
        }
        if (settings.multiDropPreferences) {
            var md = settings.multiDropPreferences;
            if (md.optimizeStopOrder !== undefined) {
                localStoragePatches.pref_optimizeStopOrder = md.optimizeStopOrder ? 'true' : 'false';
            }
            if (md.roundTrip !== undefined) {
                localStoragePatches.pref_roundTrip = md.roundTrip ? 'true' : 'false';
            }
            if (md.trafficAwareRouting !== undefined) {
                localStoragePatches.pref_trafficAwareRouting = md.trafficAwareRouting ? 'true' : 'false';
            }
            if (md.avoidRoadClosures !== undefined) {
                localStoragePatches.pref_avoidRoadClosures = md.avoidRoadClosures ? 'true' : 'false';
            }
            if (md.avoidIncidents !== undefined) {
                localStoragePatches.pref_avoidIncidents = md.avoidIncidents ? 'true' : 'false';
            }
            if (md.departureTime !== undefined) {
                localStoragePatches.pref_departureTime = md.departureTime || '';
            }
        }

        return {
            found: true,
            localStorage: localStoragePatches,
            runtime: runtime,
        };
    }

    /**
     * Export plan for the voyagr_all_settings JSON blob.
     * @param {string|null|undefined} rawJson
     * @param {string} [dateIso] - YYYY-MM-DD for filename
     * @returns {Object}
     */
    function buildSettingsExportPlan(rawJson, dateIso) {
        if (!rawJson) {
            return {
                ok: false,
                statusMessage: '❌ No settings to export',
                statusType: 'error',
            };
        }
        var parsed;
        try {
            parsed = JSON.parse(rawJson);
        } catch (_) {
            return {
                ok: false,
                statusMessage: '❌ Invalid settings export',
                statusType: 'error',
            };
        }
        var stamp = dateIso || new Date().toISOString().split('T')[0];
        return {
            ok: true,
            downloadFilename: 'voyagr-settings-' + stamp + '.json',
            mimeType: 'application/json',
            prettyJson: JSON.stringify(parsed, null, 2),
            statusMessage: '✅ Settings exported',
            statusType: 'success',
        };
    }

    /**
     * Apply plan for importing a parsed settings snapshot.
     * @param {Object|null|undefined} settings
     * @returns {Object}
     */
    function buildSettingsImportApplyPlan(settings) {
        if (!settings || typeof settings !== 'object') {
            return {
                ok: false,
                statusMessage: '❌ Error importing settings',
                statusType: 'error',
            };
        }
        return {
            ok: true,
            storageKey: SETTINGS_STORAGE_KEY,
            storageValue: JSON.stringify(settings),
            restoreAfterImport: true,
            applyUiAfterImport: true,
            statusMessage: '✅ Settings imported successfully',
            statusType: 'success',
        };
    }

    /**
     * Parse imported settings JSON text into an import apply plan.
     * @param {string} rawText
     * @returns {Object}
     */
    function buildSettingsImportParsePlan(rawText) {
        try {
            return buildSettingsImportApplyPlan(JSON.parse(rawText));
        } catch (e) {
            return {
                ok: false,
                statusMessage: '❌ Error importing settings',
                statusType: 'error',
            };
        }
    }

    /**
     * localStorage patches for multi-drop preference values.
     * @param {Object} prefs
     * @returns {Object<string, string>}
     */
    function buildMultiDropPreferencesStoragePlan(prefs) {
        prefs = prefs || {};
        var patches = {};
        if (prefs.optimizeStopOrder !== undefined) {
            patches.pref_optimizeStopOrder = prefs.optimizeStopOrder ? 'true' : 'false';
        }
        if (prefs.roundTrip !== undefined) {
            patches.pref_roundTrip = prefs.roundTrip ? 'true' : 'false';
        }
        if (prefs.trafficAwareRouting !== undefined) {
            patches.pref_trafficAwareRouting = prefs.trafficAwareRouting ? 'true' : 'false';
        }
        if (prefs.avoidRoadClosures !== undefined) {
            patches.pref_avoidRoadClosures = prefs.avoidRoadClosures ? 'true' : 'false';
        }
        if (prefs.avoidIncidents !== undefined) {
            patches.pref_avoidIncidents = prefs.avoidIncidents ? 'true' : 'false';
        }
        if (prefs.departureTime !== undefined) {
            patches.pref_departureTime = prefs.departureTime || '';
        }
        return patches;
    }

    /**
     * DOM apply plan for multi-drop preference form controls.
     * @param {Storage} storage
     * @returns {Object}
     */
    function buildMultiDropPreferencesUiApplyPlan(storage) {
        return {
            checks: {
                optimizeStopOrder: storage.getItem('pref_optimizeStopOrder') !== 'false',
                roundTrip: storage.getItem('pref_roundTrip') === 'true',
                trafficAwareRouting: storage.getItem('pref_trafficAwareRouting') !== 'false',
                avoidRoadClosures: storage.getItem('pref_avoidRoadClosures') !== 'false',
                avoidIncidents: storage.getItem('pref_avoidIncidents') !== 'false',
            },
            departureTime: storage.getItem('pref_departureTime') || '',
            elementIds: {
                optimizeStopOrder: 'optimizeStopOrder',
                roundTrip: 'roundTrip',
                trafficAwareRouting: 'trafficAwareRouting',
                avoidRoadClosures: 'avoidRoadClosures',
                avoidIncidents: 'avoidIncidents',
                departureTime: 'departureTime',
            },
        };
    }

    /**
     * DOM apply plan with explicit element ids for multi-drop preference controls.
     * @param {Object} uiPlan - from buildMultiDropPreferencesUiApplyPlan
     * @returns {Object}
     */
    function buildMultiDropPreferencesDomApplyPlan(uiPlan) {
        uiPlan = uiPlan || {};
        var ids = uiPlan.elementIds || {};
        var checks = uiPlan.checks || {};
        var selects = [];
        if (ids.departureTime) {
            selects.push({ id: ids.departureTime, value: uiPlan.departureTime || '' });
        }
        return {
            checks: Object.keys(checks).map(function (key) {
                return { id: ids[key], checked: checks[key] };
            }).filter(function (item) { return item.id; }),
            selects: selects,
        };
    }

    /**
     * Apply plan for clearing the multi-drop departure time control.
     * @returns {Object}
     */
    function buildClearDepartureTimeApplyPlan() {
        return {
            elementId: 'departureTime',
            removeStorageKey: 'pref_departureTime',
            statusMessage: 'Departure time cleared - using current time',
            statusType: 'info',
        };
    }

    /** localStorage keys cleared by resetAllSettings. */
    var SETTINGS_RESET_LOCAL_STORAGE_KEYS = [
        SETTINGS_STORAGE_KEY,
        'unit_distance', 'unit_currency', 'unit_speed', 'unit_temperature',
        'vehicleType', 'routingMode',
        'routePreferences',
        'pref_avoid_tollRoads', 'pref_avoid_motorways', 'pref_avoid_ferries',
        'pref_tolls', 'pref_caz', 'pref_cameras',
        'mapTheme', 'smartZoomEnabled',
        'parkingPreferences',
    ];

    /**
     * Reset plan for clearing saved settings and restoring runtime defaults.
     * @returns {Object}
     */
    function buildSettingsResetPlan() {
        return {
            confirmMessage: 'Are you sure you want to reset all settings to defaults?',
            localStorageKeys: SETTINGS_RESET_LOCAL_STORAGE_KEYS.slice(),
            runtimeDefaults: {
                distanceUnit: 'km',
                currencyUnit: 'GBP',
                speedUnit: 'kmh',
                temperatureUnit: 'celsius',
                currentVehicleType: 'petrol_diesel',
                currentRoutingMode: 'auto',
                smartZoomEnabled: true,
            },
            reloadAfterReset: true,
        };
    }

    /**
     * DOM apply plan for settings form controls (values only; app writes DOM).
     * @param {Object} input
     * @returns {Object}
     */
    function buildSettingsUiApplyPlan(input) {
        input = input || {};
        var routePrefs = input.routePreferences || {};
        if (typeof routePrefs === 'string') {
            try {
                routePrefs = JSON.parse(routePrefs);
            } catch (_) {
                routePrefs = {};
            }
        }
        var parkingPrefs = input.parkingPreferences || {};
        if (typeof parkingPrefs === 'string') {
            try {
                parkingPrefs = JSON.parse(parkingPrefs);
            } catch (_) {
                parkingPrefs = {};
            }
        }
        return {
            selects: {
                distanceUnit: input.distanceUnit,
                currencyUnit: input.currencyUnit,
                speedUnit: input.speedUnit,
                temperatureUnit: input.temperatureUnit,
                vehicleType: input.vehicleType,
            },
            routingMode: input.routingMode,
            routePreferenceChecks: {
                avoidHighways: !!routePrefs.avoidHighways,
                preferScenic: !!routePrefs.preferScenic,
                preferQuiet: !!routePrefs.preferQuiet,
                avoidUnpaved: !!routePrefs.avoidUnpaved,
                routeOptimization: routePrefs.routeOptimization || 'fastest',
                maxDetour: routePrefs.maxDetour != null ? routePrefs.maxDetour : 20,
            },
            parkingSelects: {
                maxWalkingDistance: parkingPrefs.maxWalkingDistance || '10',
                preferredType: parkingPrefs.preferredType || 'any',
                pricePreference: parkingPrefs.pricePreference || 'any',
            },
            mapTheme: input.mapTheme || 'standard',
            toggleButtons: {
                smartZoom: !!input.smartZoomEnabled,
                autoTrafficUpdate: !!input.autoTrafficUpdateEnabled,
                autoRerouteOnDeviation: !!input.autoRerouteOnDeviationEnabled,
            },
            labeledToggleButtons: {
                mlPredictions: !!input.mlPredictionsEnabled,
                voiceAnnouncements: !!input.voiceAnnouncementsEnabled,
                batterySaving: !!input.batterySavingEnabled,
                gestureControl: !!input.gestureControlEnabled,
            },
            detourLabel: {
                labelElementId: 'detourLabel',
                text: String(routePrefs.maxDetour != null ? routePrefs.maxDetour : 20) + '%',
            },
            sideEffects: {
                loadPreferences: true,
                setMapTheme: true,
                initializeDarkMode: true,
                updateThemeButtons: true,
                applySpeedWidgetToggleUi: true,
            },
        };
    }

    /**
     * Merge runtime globals and stored prefs into buildSettingsUiApplyPlan input.
     * @param {Object} runtime
     * @param {Object} stored
     * @returns {Object}
     */
    function buildSettingsUiInputPlan(runtime, stored) {
        runtime = runtime || {};
        stored = stored || {};
        return {
            distanceUnit: runtime.distanceUnit,
            currencyUnit: runtime.currencyUnit,
            speedUnit: runtime.speedUnit,
            temperatureUnit: runtime.temperatureUnit,
            vehicleType: runtime.vehicleType,
            routingMode: runtime.routingMode,
            routePreferences: stored.routePreferences,
            parkingPreferences: stored.parkingPreferences,
            mapTheme: stored.mapTheme != null ? stored.mapTheme : 'standard',
            smartZoomEnabled: runtime.smartZoomEnabled,
            autoTrafficUpdateEnabled: runtime.autoTrafficUpdateEnabled,
            autoRerouteOnDeviationEnabled: runtime.autoRerouteOnDeviationEnabled,
            mlPredictionsEnabled: runtime.mlPredictionsEnabled,
            voiceAnnouncementsEnabled: runtime.voiceAnnouncementsEnabled,
            batterySavingEnabled: runtime.batterySavingEnabled,
            gestureControlEnabled: runtime.gestureControlEnabled,
        };
    }

    /**
     * DOM apply plan with explicit element ids for settings UI orchestration.
     * @param {Object} uiPlan - from buildSettingsUiApplyPlan
     * @returns {Object}
     */
    function buildSettingsUiDomApplyPlan(uiPlan) {
        uiPlan = uiPlan || {};
        var selects = uiPlan.selects || {};
        var route = uiPlan.routePreferenceChecks || {};
        var parking = uiPlan.parkingSelects || {};
        var toggles = uiPlan.toggleButtons || {};
        var labeled = uiPlan.labeledToggleButtons || {};
        return {
            unitSelects: [
                { id: 'distanceUnit', value: selects.distanceUnit },
                { id: 'currencyUnit', value: selects.currencyUnit },
                { id: 'speedUnit', value: selects.speedUnit },
                { id: 'temperatureUnit', value: selects.temperatureUnit },
                { id: 'vehicleType', value: selects.vehicleType },
            ],
            routeChecks: [
                { id: 'avoidHighways', checked: route.avoidHighways },
                { id: 'preferScenic', checked: route.preferScenic },
                { id: 'preferQuiet', checked: route.preferQuiet },
                { id: 'avoidUnpaved', checked: route.avoidUnpaved },
            ],
            routeSelects: [
                { id: 'routeOptimization', value: route.routeOptimization },
                { id: 'maxDetour', value: route.maxDetour },
            ],
            parkingSelects: [
                { id: 'parkingMaxWalkingDistance', value: parking.maxWalkingDistance },
                { id: 'parkingPreferredType', value: parking.preferredType },
                { id: 'parkingPricePreference', value: parking.pricePreference },
            ],
            standardToggles: [
                { id: 'smartZoomToggle', enabled: toggles.smartZoom },
                { id: 'autoTrafficUpdateToggle', enabled: toggles.autoTrafficUpdate },
                { id: 'autoRerouteDeviationToggle', enabled: toggles.autoRerouteOnDeviation },
            ],
            labeledToggles: [
                { id: 'mlPredictionsEnabled', enabled: labeled.mlPredictions },
                { id: 'voiceAnnouncementsEnabled', enabled: labeled.voiceAnnouncements },
                { id: 'batterySavingMode', enabled: labeled.batterySaving },
                { id: 'gestureEnabled', enabled: labeled.gestureControl },
            ],
            detourLabel: uiPlan.detourLabel,
            routingMode: uiPlan.routingMode,
            mapTheme: uiPlan.mapTheme,
            sideEffects: uiPlan.sideEffects || {},
        };
    }

    var api = {
        SETTINGS_STORAGE_KEY: SETTINGS_STORAGE_KEY,
        buildSettingsSnapshot: buildSettingsSnapshot,
        buildSettingsSnapshotInputPlan: buildSettingsSnapshotInputPlan,
        buildSettingsRestorePlan: buildSettingsRestorePlan,
        buildSettingsExportPlan: buildSettingsExportPlan,
        buildSettingsImportApplyPlan: buildSettingsImportApplyPlan,
        buildSettingsImportParsePlan: buildSettingsImportParsePlan,
        buildMultiDropPreferencesStoragePlan: buildMultiDropPreferencesStoragePlan,
        buildMultiDropPreferencesUiApplyPlan: buildMultiDropPreferencesUiApplyPlan,
        buildMultiDropPreferencesDomApplyPlan: buildMultiDropPreferencesDomApplyPlan,
        buildClearDepartureTimeApplyPlan: buildClearDepartureTimeApplyPlan,
        buildSettingsResetPlan: buildSettingsResetPlan,
        buildSettingsUiApplyPlan: buildSettingsUiApplyPlan,
        buildSettingsUiInputPlan: buildSettingsUiInputPlan,
        buildSettingsUiDomApplyPlan: buildSettingsUiDomApplyPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSettingsSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

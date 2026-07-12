/**
 * @file Pure settings snapshot serialize/restore plans (no DOM, no network).
 * @module modules/navigation/settings-snapshot
 */
(function (root) {
    'use strict';

    var SETTINGS_STORAGE_KEY = 'voyagr_all_settings';

    var SETTINGS_SNAPSHOT_KEYS = [
        'unit_distance',
        'unit_currency',
        'unit_speed',
        'unit_temperature',
        'vehicleType',
        'routingMode',
        'routePreferences',
        'hazardPreferences',
        'mapTheme',
        'smartZoomEnabled',
        'showCamerasEnabled',
        'showOsmTrafficLightsEnabled',
        'showOsmRailwayCrossingsEnabled',
        'showTrafficEnabled',
        'autoTrafficUpdateEnabled',
        'autoRerouteOnDeviationEnabled',
        'routeTrafficEnabled',
        'speedWidgetEnabled',
        'parkingPreferences',
        'multiDropPreferences',
        'lastSaved',
    ];

    /**
     * True when parsed JSON looks like a Voyagr settings export.
     * @param {*} settings
     * @returns {boolean}
     */
    function isRecognisedSettingsSnapshot(settings) {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            return false;
        }
        return SETTINGS_SNAPSHOT_KEYS.some(function (key) {
            return settings[key] !== undefined;
        });
    }

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
            routeTrafficEnabled: input.routeTrafficEnabled,
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
            routeTrafficEnabled: runtime.routeTrafficEnabled,
            speedWidgetEnabled: runtime.speedWidgetEnabled,
            parkingPreferences: formState.parkingPreferences || {},
            multiDropPreferences: formState.multiDropPreferences || {},
        };
    }

    /**
     * Save plan for persisting a settings snapshot to localStorage.
     * @param {Object} snapshotInput - from buildSettingsSnapshotInputPlan
     * @returns {Object}
     */
    function buildSettingsSavePlan(snapshotInput) {
        var snapshot = buildSettingsSnapshot(snapshotInput);
        return {
            storageKey: SETTINGS_STORAGE_KEY,
            storageValue: JSON.stringify(snapshot),
            snapshot: snapshot,
            logMessage: '[Settings] All settings saved to localStorage',
            persistActiveProfile: true,
        };
    }

    /**
     * Execute plan for persisting settings snapshot to localStorage.
     * @param {Object} savePlan - from buildSettingsSavePlan
     * @returns {Object}
     */
    function buildSaveAllSettingsExecutePlan(savePlan) {
        savePlan = savePlan || {};
        return {
            shouldSave: true,
            storageKey: savePlan.storageKey || SETTINGS_STORAGE_KEY,
            storageValue: savePlan.storageValue,
            snapshot: savePlan.snapshot,
            logMessage: savePlan.logMessage,
            persistActiveProfile: !!savePlan.persistActiveProfile,
        };
    }

    /**
     * Orchestration plan for loading settings from localStorage.
     * @returns {Object}
     */
    function buildLoadAllSettingsOrchestrationPlan() {
        return {
            storageKey: SETTINGS_STORAGE_KEY,
            noSavedLog: '[Settings] No saved settings found, using defaults',
            loadedLogPrefix: '[Settings] Loaded settings from localStorage',
            successLog: '[Settings] All settings restored successfully',
            errorLogPrefix: '[Settings] Error loading settings:',
        };
    }

    /**
     * Input assembly for saveAllSettings handler.
     * @param {Object} runtimeState
     * @param {Object} formState
     * @returns {Object}
     */
    function buildCollectSaveAllSettingsInputPlan(runtimeState, formState) {
        return buildSettingsSnapshotInputPlan(runtimeState, formState);
    }

    /**
     * Entry orchestration plan for saveAllSettings handler.
     * @param {Object} snapshotInput - from buildCollectSaveAllSettingsInputPlan
     * @returns {Object}
     */
    function buildSaveAllSettingsEntryOrchestrationPlan(snapshotInput) {
        var savePlan = buildSettingsSavePlan(snapshotInput);
        return {
            savePlan: savePlan,
            execute: buildSaveAllSettingsExecutePlan(savePlan),
        };
    }

    /**
     * Entry orchestration plan for loadAllSettings handler.
     * @returns {Object}
     */
    function buildLoadAllSettingsEntryOrchestrationPlan() {
        return {
            orch: buildLoadAllSettingsOrchestrationPlan(),
        };
    }

    /**
     * Entry orchestration plan for restoring a parsed settings snapshot.
     * @param {Object} settings
     * @param {Object} [opts]
     * @param {boolean} [opts.routeInProgress]
     * @returns {Object}
     */
    function buildLoadAllSettingsRestoreEntryOrchestrationPlan(settings, opts) {
        opts = opts || {};
        var restorePlan = buildSettingsRestorePlan(settings);
        var postEffects = buildApplySettingsRestorePostEffectsExecutePlan(
            buildSettingsRestorePostApplyPlan(restorePlan.runtime || {}, opts)
        );
        return {
            restorePlan: restorePlan,
            postEffects: postEffects,
        };
    }

    /**
     * Hazard preference values for settings snapshot from storage reads.
     * @param {Object} [opts]
     * @param {boolean} [opts.avoidTolls]
     * @param {function(string): string|null|undefined} [opts.getStorageItem]
     * @returns {Object}
     */
    function buildSettingsHazardPreferencesPlan(opts) {
        opts = opts || {};
        var get = opts.getStorageItem || function () { return null; };
        return {
            avoidTolls: !!opts.avoidTolls,
            avoidCAZ: get('pref_caz') !== 'false',
            avoidCameras: get('pref_cameras') !== 'false',
            avoidTrafficLights: get('pref_trafficLightsAvoid') !== 'false',
            avoidRailwayCrossings: get('pref_railwayCrossingsAvoid') !== 'false',
        };
    }

    /**
     * Merge settings form fragments into snapshot input form state.
     * @param {Object} fragments
     * @returns {Object}
     */
    function buildSettingsFormStateInputPlan(fragments) {
        fragments = fragments || {};
        return {
            routePreferences: fragments.routePreferences || {},
            hazardPreferences: fragments.hazardPreferences || buildSettingsHazardPreferencesPlan({}),
            parkingPreferences: fragments.parkingPreferences || {},
            multiDropPreferences: fragments.multiDropPreferences || {},
            mapTheme: fragments.mapTheme != null ? fragments.mapTheme : 'standard',
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
        if (settings.routeTrafficEnabled !== undefined) {
            runtime.routeTrafficEnabled = settings.routeTrafficEnabled;
            localStoragePatches.routeTrafficEnabled = settings.routeTrafficEnabled ? 'true' : 'false';
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
     * DOM execute plan for exporting settings as a downloadable JSON file.
     * @param {Object} exportPlan - from buildSettingsExportPlan
     * @returns {Object}
     */
    function buildExportSettingsDomExecutePlan(exportPlan) {
        exportPlan = exportPlan || {};
        if (!exportPlan.ok) {
            return {
                shouldExport: false,
                statusMessage: exportPlan.statusMessage,
                statusType: exportPlan.statusType,
            };
        }
        return {
            shouldExport: true,
            blobContent: exportPlan.prettyJson,
            mimeType: exportPlan.mimeType,
            downloadFilename: exportPlan.downloadFilename,
            statusMessage: exportPlan.statusMessage,
            statusType: exportPlan.statusType,
        };
    }

    /**
     * Orchestration plan for the settings import file picker.
     * @returns {Object}
     */
    function buildImportSettingsFilePickerOrchestrationPlan() {
        return {
            inputType: 'file',
            accept: '.json',
        };
    }

    /**
     * Orchestration plan when the user selects a settings import file.
     * @param {File|null|undefined} file
     * @returns {Object}
     */
    function buildImportSettingsFileSelectedOrchestrationPlan(file) {
        return {
            shouldReadFile: !!file,
            readMethod: 'readAsText',
        };
    }

    /**
     * Apply plan for importing a parsed settings snapshot.
     * @param {Object|null|undefined} settings
     * @returns {Object}
     */
    function buildSettingsImportApplyPlan(settings) {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            return {
                ok: false,
                statusMessage: '❌ Error importing settings',
                statusType: 'error',
            };
        }
        if (!isRecognisedSettingsSnapshot(settings)) {
            return {
                ok: false,
                statusMessage: '❌ Invalid settings file — not a Voyagr settings export',
                statusType: 'error',
            };
        }
        var restorePlan = buildSettingsRestorePlan(settings);
        if (!restorePlan.found) {
            return {
                ok: false,
                statusMessage: '❌ Invalid settings file — could not restore snapshot',
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
     * Orchestration plan for applying a parsed settings import.
     * @param {Object} importPlan - from buildSettingsImportApplyPlan or buildSettingsImportParsePlan
     * @param {Object} [opts]
     * @param {boolean} [opts.routeInProgress]
     * @returns {Object}
     */
    function buildSettingsImportOrchestrationPlan(importPlan, opts) {
        importPlan = importPlan || {};
        opts = opts || {};
        if (!importPlan.ok) {
            return { shouldApply: false };
        }
        return {
            shouldApply: true,
            writeStorage: true,
            storageKey: importPlan.storageKey,
            storageValue: importPlan.storageValue,
            restoreSettings: !!importPlan.restoreAfterImport,
            applySettingsUi: !!importPlan.applyUiAfterImport,
            routeInProgress: !!opts.routeInProgress,
            statusMessage: importPlan.statusMessage,
            statusType: importPlan.statusType,
        };
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
     * Form-state plan for multi-drop preference controls.
     * @param {Object} [opts]
     * @param {function(string): string|null|undefined} [opts.getStorageItem]
     * @returns {Object}
     */
    function buildMultiDropFormStatePlan(opts) {
        opts = opts || {};
        var get = opts.getStorageItem || function () { return null; };
        return {
            optimizeStopOrder: opts.optimizeStopOrder !== undefined
                ? !!opts.optimizeStopOrder
                : get('pref_optimizeStopOrder') !== 'false',
            roundTrip: opts.roundTrip !== undefined
                ? !!opts.roundTrip
                : get('pref_roundTrip') === 'true',
            trafficAwareRouting: opts.trafficAwareRouting !== undefined
                ? !!opts.trafficAwareRouting
                : get('pref_trafficAwareRouting') !== 'false',
            avoidRoadClosures: opts.avoidRoadClosures !== undefined
                ? !!opts.avoidRoadClosures
                : get('pref_avoidRoadClosures') !== 'false',
            avoidIncidents: opts.avoidIncidents !== undefined
                ? !!opts.avoidIncidents
                : get('pref_avoidIncidents') !== 'false',
            departureTime: opts.departureTime !== undefined
                ? (opts.departureTime || '')
                : (get('pref_departureTime') || ''),
        };
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
     * Input assembly for collecting multi-drop preference controls from the DOM.
     * @param {Object} [opts]
     * @returns {Object}
     */
    function buildCollectMultiDropInputPlan(opts) {
        opts = opts || {};
        return {
            optimizeStopOrder: opts.optimizeStopOrder,
            roundTrip: opts.roundTrip,
            trafficAwareRouting: opts.trafficAwareRouting,
            avoidRoadClosures: opts.avoidRoadClosures,
            avoidIncidents: opts.avoidIncidents,
            departureTime: opts.departureTime,
            getStorageItem: opts.getStorageItem,
        };
    }

    /**
     * Execute plan for persisting multi-drop preferences from form state.
     * @param {Object} prefs
     * @returns {Object}
     */
    function buildSaveMultiDropPreferencesExecutePlan(prefs) {
        return {
            shouldSave: true,
            storagePatches: buildMultiDropPreferencesStoragePlan(prefs),
            saveAllSettings: true,
            successStatusMessage: 'Multi-drop preferences saved!',
            successStatusType: 'success',
        };
    }

    /**
     * Entry orchestration plan for saveMultiDropPreferences handler.
     * @param {Object} input - from buildCollectMultiDropInputPlan
     * @returns {Object}
     */
    function buildSaveMultiDropPreferencesEntryOrchestrationPlan(input) {
        var prefs = buildMultiDropFormStatePlan(buildCollectMultiDropInputPlan(input));
        return {
            prefs: prefs,
            execute: buildSaveMultiDropPreferencesExecutePlan(prefs),
        };
    }

    /**
     * Execute plan for loading multi-drop preferences into the form.
     * @returns {Object}
     */
    function buildLoadMultiDropPreferencesExecutePlan() {
        return {
            shouldLoad: true,
            ensureDefaultTrafficAwareRouting: true,
        };
    }

    /**
     * Entry orchestration plan for loadMultiDropPreferences handler.
     * @param {Storage} storage
     * @returns {Object}
     */
    function buildLoadMultiDropPreferencesEntryOrchestrationPlan(storage) {
        return {
            execute: buildLoadMultiDropPreferencesExecutePlan(),
            uiApply: buildMultiDropPreferencesUiApplyPlan(storage),
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

    /**
     * Entry orchestration plan for clearDepartureTime handler.
     * @returns {Object}
     */
    function buildClearDepartureTimeEntryOrchestrationPlan() {
        return {
            apply: buildClearDepartureTimeApplyPlan(),
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
        'pref_trafficLightsAvoid', 'pref_railwayCrossingsAvoid',
        'mapTheme', 'smartZoomEnabled',
        'parkingPreferences',
        'autoTrafficUpdate', 'autoRerouteOnDeviation', 'routeTrafficEnabled',
        'showCamerasEnabled', 'showOsmTrafficLightsOnMap',
        'showOsmRailwayCrossingsOnMap', 'showTrafficEnabled', 'speedWidgetEnabled',
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
                autoTrafficUpdateEnabled: true,
                autoRerouteOnDeviationEnabled: true,
                routeTrafficEnabled: true,
                showCamerasEnabled: true,
                showOsmTrafficLightsEnabled: true,
                showOsmRailwayCrossingsEnabled: true,
                showTrafficEnabled: true,
                speedWidgetEnabled: true,
            },
            reloadAfterReset: true,
        };
    }

    /**
     * Execute plan for resetting all settings to defaults.
     * @param {Object} [resetPlan] - from buildSettingsResetPlan
     * @returns {Object}
     */
    function buildResetAllSettingsExecutePlan(resetPlan) {
        resetPlan = resetPlan || buildSettingsResetPlan();
        return {
            shouldReset: true,
            confirmMessage: resetPlan.confirmMessage,
            localStorageKeys: resetPlan.localStorageKeys || [],
            runtimeDefaults: resetPlan.runtimeDefaults || {},
            reloadAfterReset: !!resetPlan.reloadAfterReset,
        };
    }

    /**
     * Entry orchestration plan for resetAllSettings handler.
     * @returns {Object}
     */
    function buildResetAllSettingsEntryOrchestrationPlan() {
        return {
            execute: buildResetAllSettingsExecutePlan(buildSettingsResetPlan()),
        };
    }

    /**
     * Entry orchestration plan for exportSettings handler.
     * @param {string|null|undefined} rawSnapshot
     * @param {string} dateStamp
     * @returns {Object}
     */
    function buildExportSettingsEntryOrchestrationPlan(rawSnapshot, dateStamp) {
        return {
            execute: buildExportSettingsDomExecutePlan(
                buildSettingsExportPlan(rawSnapshot, dateStamp)
            ),
        };
    }

    /**
     * Entry orchestration plan for importSettings file picker.
     * @returns {Object}
     */
    function buildImportSettingsEntryOrchestrationPlan() {
        return {
            picker: buildImportSettingsFilePickerOrchestrationPlan(),
        };
    }

    /**
     * Entry orchestration plan for parsing and applying imported settings JSON.
     * @param {string} rawText
     * @param {Object} [opts]
     * @param {boolean} [opts.routeInProgress]
     * @returns {Object}
     */
    function buildImportSettingsFileContentEntryOrchestrationPlan(rawText, opts) {
        var parsePlan = buildSettingsImportParsePlan(rawText);
        return {
            parsePlan: parsePlan,
            importOrch: buildSettingsImportOrchestrationPlan(parsePlan, opts),
        };
    }

    /**
     * Build runtime global patches from a settings restore or reset object.
     * @param {Object} [runtime]
     * @returns {Object}
     */
    function buildApplySettingsRuntimePatchesExecutePlan(runtime) {
        runtime = runtime || {};
        var patches = [];
        if (runtime.distanceUnit) patches.push({ key: 'distanceUnit', value: runtime.distanceUnit });
        if (runtime.currencyUnit) patches.push({ key: 'currencyUnit', value: runtime.currencyUnit });
        if (runtime.speedUnit) patches.push({ key: 'speedUnit', value: runtime.speedUnit });
        if (runtime.temperatureUnit) patches.push({ key: 'temperatureUnit', value: runtime.temperatureUnit });
        if (runtime.currentVehicleType) patches.push({ key: 'currentVehicleType', value: runtime.currentVehicleType });
        if (runtime.currentRoutingMode) patches.push({ key: 'currentRoutingMode', value: runtime.currentRoutingMode });
        if (runtime.smartZoomEnabled !== undefined) {
            patches.push({ key: 'smartZoomEnabled', value: !!runtime.smartZoomEnabled });
        }
        if (runtime.autoTrafficUpdateEnabled !== undefined) {
            patches.push({ key: 'autoTrafficUpdateEnabled', value: !!runtime.autoTrafficUpdateEnabled });
        }
        if (runtime.autoRerouteOnDeviationEnabled !== undefined) {
            patches.push({ key: 'autoRerouteOnDeviationEnabled', value: !!runtime.autoRerouteOnDeviationEnabled });
        }
        if (runtime.routeTrafficEnabled !== undefined) {
            patches.push({ key: 'routeTrafficEnabled', value: !!runtime.routeTrafficEnabled });
        }
        if (runtime.showCamerasEnabled !== undefined) {
            patches.push({ key: 'showCamerasEnabled', value: !!runtime.showCamerasEnabled });
        }
        if (runtime.showOsmTrafficLightsEnabled !== undefined) {
            patches.push({ key: 'showOsmTrafficLightsEnabled', value: !!runtime.showOsmTrafficLightsEnabled });
        }
        if (runtime.showOsmRailwayCrossingsEnabled !== undefined) {
            patches.push({ key: 'showOsmRailwayCrossingsEnabled', value: !!runtime.showOsmRailwayCrossingsEnabled });
        }
        if (runtime.showTrafficEnabled !== undefined) {
            patches.push({ key: 'showTrafficEnabled', value: !!runtime.showTrafficEnabled });
        }
        if (runtime.speedWidgetEnabled !== undefined) {
            patches.push({ key: 'speedWidgetEnabled', value: !!runtime.speedWidgetEnabled });
        }
        return {
            shouldApply: patches.length > 0,
            runtimePatches: patches,
        };
    }

    /**
     * Execute plan for applying runtime default globals after settings reset.
     * @param {Object} [defaults]
     * @returns {Object}
     */
    function buildApplySettingsResetRuntimeExecutePlan(defaults) {
        return buildApplySettingsRuntimePatchesExecutePlan(defaults);
    }

    /**
     * Execute plan for applying runtime globals after settings restore.
     * @param {Object} [runtime]
     * @returns {Object}
     */
    function buildApplySettingsRestoreRuntimeExecutePlan(runtime) {
        return buildApplySettingsRuntimePatchesExecutePlan(runtime);
    }

    /**
     * Execute plan for hydrating localStorage and runtime from a restore plan.
     * @param {Object} restorePlan - from buildSettingsRestorePlan
     * @returns {Object}
     */
    function buildApplySettingsRestoreExecutePlan(restorePlan) {
        restorePlan = restorePlan || {};
        if (!restorePlan.found) {
            return { shouldRestore: false };
        }
        var localStoragePatches = [];
        Object.keys(restorePlan.localStorage || {}).forEach(function (key) {
            var value = restorePlan.localStorage[key];
            if (value !== undefined) {
                localStoragePatches.push({ key: key, value: value });
            }
        });
        return {
            shouldRestore: true,
            localStoragePatches: localStoragePatches,
            runtimeExecute: buildApplySettingsRestoreRuntimeExecutePlan(restorePlan.runtime),
        };
    }

    /**
     * Orchestration plan for applying settings to the UI.
     * @returns {Object}
     */
    function buildApplySettingsToUiOrchestrationPlan() {
        return {
            successLog: '[Settings] All settings applied to UI',
            errorLogPrefix: '[Settings] Error applying settings to UI:',
        };
    }

    /**
     * Execute plan for applying a settings UI plan to form controls.
     * @param {Object} uiPlan - from buildSettingsUiApplyPlan
     * @returns {Object}
     */
    function buildApplySettingsUiExecutePlan(uiPlan) {
        uiPlan = uiPlan || {};
        return {
            shouldApply: true,
            uiPlan: uiPlan,
            routingMode: uiPlan.routingMode,
            mapTheme: uiPlan.mapTheme,
            detourLabel: uiPlan.detourLabel,
            sideEffects: uiPlan.sideEffects || {},
        };
    }

    /**
     * Input assembly for collecting settings form fragments from the app.
     * @param {Object} [o]
     * @returns {Object}
     */
    function buildCollectSettingsFormStateInputPlan(o) {
        o = o || {};
        return {
            routePreferences: o.routePreferences || {},
            hazardPreferences: o.hazardPreferences || {},
            parkingPreferences: o.parkingPreferences || {},
            multiDropPreferences: o.multiDropPreferences || {},
            mapTheme: o.mapTheme || 'standard',
        };
    }

    /**
     * Stored-state plan for settings UI apply input assembly.
     * @param {Object} [o]
     * @returns {Object}
     */
    function buildCollectSettingsUiStoredStatePlan(o) {
        o = o || {};
        var parkingPrefs = {};
        if (o.parkingPreferences) {
            parkingPrefs = o.parkingPreferences;
        } else if (o.parkingPreferencesRaw) {
            try {
                parkingPrefs = JSON.parse(o.parkingPreferencesRaw);
            } catch (_) {
                parkingPrefs = {};
            }
        }
        return {
            routePreferences: o.routePreferences,
            parkingPreferences: parkingPrefs,
            mapTheme: o.mapTheme || 'standard',
            parkingParseErrorLog: '[Settings] Error parsing parking preferences:',
        };
    }

    /**
     * Runtime-state input for settings UI apply beyond snapshot runtime fields.
     * @param {Object} runtime
     * @returns {Object}
     */
    function buildCollectSettingsUiRuntimeStateInputPlan(runtime) {
        runtime = runtime || {};
        return {
            mlPredictionsEnabled: !!runtime.mlPredictionsEnabled,
            voiceAnnouncementsEnabled: !!runtime.voiceAnnouncementsEnabled,
            batterySavingEnabled: !!runtime.batterySavingEnabled,
            gestureControlEnabled: !!runtime.gestureControlEnabled,
        };
    }

    /**
     * Post-restore side-effect plan for traffic services after settings hydrate.
     * @param {Object} [runtime] - restored runtime fields from buildSettingsRestorePlan
     * @param {Object} [opts]
     * @param {boolean} [opts.routeInProgress]
     * @returns {Object}
     */
    function buildSettingsRestorePostApplyPlan(runtime, opts) {
        runtime = runtime || {};
        opts = opts || {};
        var effects = [];

        if (runtime.routeTrafficEnabled === false) {
            effects.push('stopRouteTrafficUpdates');
        } else if (runtime.routeTrafficEnabled === true && opts.routeInProgress) {
            effects.push('startRouteTrafficUpdates');
        }

        if (runtime.autoTrafficUpdateEnabled === false) {
            effects.push('stopAutoTrafficUpdates');
        } else if (runtime.autoTrafficUpdateEnabled === true && opts.routeInProgress) {
            effects.push('startAutoTrafficUpdates');
        }

        return {
            effects: effects,
            hasEffects: effects.length > 0,
        };
    }

    /**
     * Execute plan for dispatching post-restore traffic service side effects.
     * @param {Object} postApplyPlan - from buildSettingsRestorePostApplyPlan
     * @returns {Object}
     */
    function buildApplySettingsRestorePostEffectsExecutePlan(postApplyPlan) {
        postApplyPlan = postApplyPlan || {};
        return {
            shouldDispatch: !!postApplyPlan.hasEffects,
            effects: postApplyPlan.effects || [],
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
                routeTraffic: !!input.routeTrafficEnabled,
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
            routeTrafficEnabled: runtime.routeTrafficEnabled,
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
                { id: 'routeTrafficToggle', enabled: toggles.routeTraffic },
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
        buildSettingsSavePlan: buildSettingsSavePlan,
        buildSaveAllSettingsExecutePlan: buildSaveAllSettingsExecutePlan,
        buildLoadAllSettingsOrchestrationPlan: buildLoadAllSettingsOrchestrationPlan,
        buildCollectSaveAllSettingsInputPlan: buildCollectSaveAllSettingsInputPlan,
        buildSaveAllSettingsEntryOrchestrationPlan: buildSaveAllSettingsEntryOrchestrationPlan,
        buildLoadAllSettingsEntryOrchestrationPlan: buildLoadAllSettingsEntryOrchestrationPlan,
        buildLoadAllSettingsRestoreEntryOrchestrationPlan: buildLoadAllSettingsRestoreEntryOrchestrationPlan,
        buildSettingsHazardPreferencesPlan: buildSettingsHazardPreferencesPlan,
        buildSettingsFormStateInputPlan: buildSettingsFormStateInputPlan,
        buildSettingsRestorePlan: buildSettingsRestorePlan,
        buildApplySettingsRestoreExecutePlan: buildApplySettingsRestoreExecutePlan,
        buildApplySettingsRuntimePatchesExecutePlan: buildApplySettingsRuntimePatchesExecutePlan,
        buildApplySettingsRestoreRuntimeExecutePlan: buildApplySettingsRestoreRuntimeExecutePlan,
        isRecognisedSettingsSnapshot: isRecognisedSettingsSnapshot,
        buildSettingsExportPlan: buildSettingsExportPlan,
        buildExportSettingsDomExecutePlan: buildExportSettingsDomExecutePlan,
        buildImportSettingsFilePickerOrchestrationPlan: buildImportSettingsFilePickerOrchestrationPlan,
        buildImportSettingsFileSelectedOrchestrationPlan: buildImportSettingsFileSelectedOrchestrationPlan,
        buildSettingsImportApplyPlan: buildSettingsImportApplyPlan,
        buildSettingsImportParsePlan: buildSettingsImportParsePlan,
        buildSettingsImportOrchestrationPlan: buildSettingsImportOrchestrationPlan,
        buildMultiDropPreferencesStoragePlan: buildMultiDropPreferencesStoragePlan,
        buildMultiDropFormStatePlan: buildMultiDropFormStatePlan,
        buildMultiDropPreferencesUiApplyPlan: buildMultiDropPreferencesUiApplyPlan,
        buildMultiDropPreferencesDomApplyPlan: buildMultiDropPreferencesDomApplyPlan,
        buildCollectMultiDropInputPlan: buildCollectMultiDropInputPlan,
        buildSaveMultiDropPreferencesExecutePlan: buildSaveMultiDropPreferencesExecutePlan,
        buildSaveMultiDropPreferencesEntryOrchestrationPlan:
            buildSaveMultiDropPreferencesEntryOrchestrationPlan,
        buildLoadMultiDropPreferencesExecutePlan: buildLoadMultiDropPreferencesExecutePlan,
        buildLoadMultiDropPreferencesEntryOrchestrationPlan:
            buildLoadMultiDropPreferencesEntryOrchestrationPlan,
        buildClearDepartureTimeApplyPlan: buildClearDepartureTimeApplyPlan,
        buildClearDepartureTimeEntryOrchestrationPlan: buildClearDepartureTimeEntryOrchestrationPlan,
        buildSettingsResetPlan: buildSettingsResetPlan,
        buildResetAllSettingsExecutePlan: buildResetAllSettingsExecutePlan,
        buildResetAllSettingsEntryOrchestrationPlan: buildResetAllSettingsEntryOrchestrationPlan,
        buildExportSettingsEntryOrchestrationPlan: buildExportSettingsEntryOrchestrationPlan,
        buildImportSettingsEntryOrchestrationPlan: buildImportSettingsEntryOrchestrationPlan,
        buildImportSettingsFileContentEntryOrchestrationPlan:
            buildImportSettingsFileContentEntryOrchestrationPlan,
        buildApplySettingsResetRuntimeExecutePlan: buildApplySettingsResetRuntimeExecutePlan,
        buildApplySettingsToUiOrchestrationPlan: buildApplySettingsToUiOrchestrationPlan,
        buildApplySettingsUiExecutePlan: buildApplySettingsUiExecutePlan,
        buildCollectSettingsFormStateInputPlan: buildCollectSettingsFormStateInputPlan,
        buildCollectSettingsUiStoredStatePlan: buildCollectSettingsUiStoredStatePlan,
        buildCollectSettingsUiRuntimeStateInputPlan: buildCollectSettingsUiRuntimeStateInputPlan,
        buildSettingsRestorePostApplyPlan: buildSettingsRestorePostApplyPlan,
        buildApplySettingsRestorePostEffectsExecutePlan: buildApplySettingsRestorePostEffectsExecutePlan,
        buildSettingsUiApplyPlan: buildSettingsUiApplyPlan,
        buildSettingsUiInputPlan: buildSettingsUiInputPlan,
        buildSettingsUiDomApplyPlan: buildSettingsUiDomApplyPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSettingsSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

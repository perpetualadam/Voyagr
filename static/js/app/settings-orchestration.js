/**
 * @file Persistent settings snapshot orchestration (save, load, reset, import/export, UI apply).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[Settings] Orchestration runtime not bound');
        }
        return runtime;
    }

    function SS() { return rt().settingsSnapshot(); }
    function RS() { return rt().routeSelection(); }
    function TU() { return rt().toggleUI(); }
    function RP() { return rt().routePrefs(); }

    function storedMapTheme() {
        var MT = root.VoyagrMapTheme;
        return MT && typeof MT.readStoredMapTheme === 'function'
            ? MT.readStoredMapTheme()
            : (typeof localStorage !== 'undefined' ? localStorage.getItem('mapTheme') || 'standard' : 'standard');
    }

    function collectSettingsFormState() {
        var settingsSnapshot = SS();
        return settingsSnapshot.buildSettingsFormStateInputPlan(
            settingsSnapshot.buildCollectSettingsFormStateInputPlan({
                routePreferences: rt().call.collectRoutePreferencesFormState(),
                hazardPreferences: settingsSnapshot.buildSettingsHazardPreferencesPlan({
                    avoidTolls: rt().call.isAvoidTollsEnabled(),
                    getStorageItem: function (key) { return localStorage.getItem(key); },
                }),
                parkingPreferences: rt().call.collectParkingPreferencesFormState(),
                multiDropPreferences: rt().call.collectMultiDropFormState(),
                mapTheme: storedMapTheme(),
                uiTheme: localStorage.getItem('ui_theme') || 'light',
            })
        );
    }

    function collectSettingsSnapshotRuntimeState() {
        const traffic = root.VoyagrTrafficOrchestration.getTrafficSettingsSnapshot();
        return {
            distanceUnit: rt().getDistanceUnit(),
            currencyUnit: rt().getCurrencyUnit(),
            speedUnit: rt().getSpeedUnit(),
            temperatureUnit: rt().getTemperatureUnit(),
            vehicleType: rt().getCurrentVehicleType(),
            routingMode: rt().getCurrentRoutingMode(),
            smartZoomEnabled: rt().getSmartZoomEnabled(),
            showCamerasEnabled: rt().getShowCamerasEnabled(),
            showOsmTrafficLightsEnabled: rt().getShowOsmTrafficLightsEnabled(),
            showOsmRailwayCrossingsEnabled: rt().getShowOsmRailwayCrossingsEnabled(),
            showTrafficEnabled: rt().getShowTrafficEnabled(),
            autoTrafficUpdateEnabled: traffic.autoTrafficUpdateEnabled,
            autoRerouteOnDeviationEnabled: traffic.autoRerouteOnDeviationEnabled,
            routeTrafficEnabled: traffic.routeTrafficEnabled,
            speedWidgetEnabled: rt().getSpeedWidgetEnabled(),
        };
    }

    function applySaveAllSettingsFromPlan(execute) {
        if (!execute || !execute.shouldSave) return;

        localStorage.setItem(execute.storageKey, execute.storageValue);
        console.log(execute.logMessage, execute.snapshot);

        if (execute.persistActiveProfile) rt().call.persistActiveProfile();
    }

    function saveAllSettings() {
        const settingsSnapshot = SS();
        applySaveAllSettingsFromPlan(
            settingsSnapshot.buildSaveAllSettingsEntryOrchestrationPlan(
                settingsSnapshot.buildCollectSaveAllSettingsInputPlan(
                    collectSettingsSnapshotRuntimeState(),
                    collectSettingsFormState()
                )
            ).execute
        );
    }

    function applySettingsResetRuntimeFromPlan(execute) {
        if (!execute || !execute.shouldApply) return;

        (execute.runtimePatches || []).forEach(({ key, value }) => {
            switch (key) {
                case 'distanceUnit': rt().setDistanceUnit(value); break;
                case 'currencyUnit': rt().setCurrencyUnit(value); break;
                case 'speedUnit': rt().setSpeedUnit(value); break;
                case 'temperatureUnit': rt().setTemperatureUnit(value); break;
                case 'currentVehicleType': rt().setCurrentVehicleType(value); break;
                case 'currentRoutingMode': rt().setCurrentRoutingMode(value); break;
                case 'smartZoomEnabled': rt().setSmartZoomEnabled(value); break;
                case 'autoTrafficUpdateEnabled':
                    root.VoyagrTrafficOrchestration.applyTrafficSettingsPatch('autoTrafficUpdateEnabled', value);
                    break;
                case 'autoRerouteOnDeviationEnabled':
                    root.VoyagrTrafficOrchestration.applyTrafficSettingsPatch('autoRerouteOnDeviationEnabled', value);
                    break;
                case 'routeTrafficEnabled':
                    root.VoyagrTrafficOrchestration.applyTrafficSettingsPatch('routeTrafficEnabled', value);
                    break;
                case 'showCamerasEnabled': rt().setShowCamerasEnabled(value); break;
                case 'showOsmTrafficLightsEnabled': rt().setShowOsmTrafficLightsEnabled(value); break;
                case 'showOsmRailwayCrossingsEnabled': rt().setShowOsmRailwayCrossingsEnabled(value); break;
                case 'showTrafficEnabled': rt().setShowTrafficEnabled(value); break;
                case 'speedWidgetEnabled': rt().setSpeedWidgetEnabled(value); break;
                default: break;
            }
        });
    }

    function applySettingsRestoreFromPlan(plan) {
        const settingsSnapshot = SS();
        const execute = settingsSnapshot.buildApplySettingsRestoreExecutePlan(plan);
        if (!execute.shouldRestore) return false;

        (execute.localStoragePatches || []).forEach(({ key, value }) => {
            localStorage.setItem(key, value);
        });

        applySettingsResetRuntimeFromPlan(execute.runtimeExecute);
        return true;
    }

    function applySettingsRestorePostEffectsFromPlan(plan) {
        if (!plan || !plan.shouldDispatch) return;
        (plan.effects || []).forEach((effect) => {
            if (effect === 'stopRouteTrafficUpdates') rt().call.stopRouteTrafficUpdates();
            else if (effect === 'startRouteTrafficUpdates') rt().call.startRouteTrafficUpdates();
            else if (effect === 'stopAutoTrafficUpdates') rt().call.stopAutoTrafficUpdates();
            else if (effect === 'startAutoTrafficUpdates') rt().call.startAutoTrafficUpdates();
        });
    }

    function loadAllSettings() {
        const settingsSnapshot = SS();
        const entry = settingsSnapshot.buildLoadAllSettingsEntryOrchestrationPlan();
        const orch = entry.orch;
        try {
            const saved = localStorage.getItem(orch.storageKey);
            if (!saved) {
                console.log(orch.noSavedLog);
                return false;
            }

            const settings = JSON.parse(saved);
            console.log(orch.loadedLogPrefix, settings);
            const restoreEntry = settingsSnapshot.buildLoadAllSettingsRestoreEntryOrchestrationPlan(settings, {
                routeInProgress: rt().getRouteInProgress(),
            });
            if (!applySettingsRestoreFromPlan(restoreEntry.restorePlan)) {
                return false;
            }
            applySettingsRestorePostEffectsFromPlan(restoreEntry.postEffects);

            console.log(orch.successLog);
            return true;
        } catch (error) {
            console.error(orch.errorLogPrefix, error);
            return false;
        }
    }

    function applyDomSelectsFromPlan(selects) {
        (selects || []).forEach(({ id, value }) => {
            const el = document.getElementById(id);
            if (el && value != null) el.value = value;
        });
    }

    function applyDomChecksFromPlan(checks) {
        (checks || []).forEach(({ id, checked }) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!checked;
        });
    }

    function applyStandardTogglesFromPlan(toggles, toggleUi) {
        (toggles || []).forEach(({ id, enabled }) => {
            const el = document.getElementById(id);
            if (el) toggleUi.applyToggleButton(el, enabled);
        });
    }

    function applyLabeledTogglesFromPlan(toggles, toggleUi) {
        (toggles || []).forEach(({ id, enabled }) => {
            const el = document.getElementById(id);
            if (el) toggleUi.applyLabeledToggleButton(el, enabled);
        });
    }

    function applyMapLayerReorderFromPlan(plan) {
        const map = rt().getMap();
        if (!plan || !plan.shouldApply || !map) return false;

        try {
            const presentById = {};
            plan.layerIds.forEach((layerId) => {
                presentById[layerId] = !!map.getLayer(layerId);
            });

            plan.layerIds.forEach((layerId) => {
                if (!presentById[layerId]) {
                    if (plan.logMissingLayers) {
                        const moveLog = RS().buildBringRoutesToTopLayerMoveLogPlan(
                            layerId,
                            plan.beforeId,
                            false
                        );
                        if (moveLog.notFoundLogMessage) console.log(moveLog.notFoundLogMessage);
                    }
                    return;
                }
                map.moveLayer(layerId, plan.beforeId);
                if (plan.logMissingLayers) {
                    const moveLog = RS().buildBringRoutesToTopLayerMoveLogPlan(
                        layerId,
                        plan.beforeId,
                        true
                    );
                    if (moveLog.movedLogMessage) console.log(moveLog.movedLogMessage);
                }
            });

            if (plan.ensureLabelsOnTop) rt().call.ensureLabelsOnTop();
            if (plan.successLogMessage) console.log(plan.successLogMessage);
            return true;
        } catch (e) {
            const prefix = plan.errorLogPrefix || '[Map] Layer reorder error:';
            if (plan.useWarnOnError) {
                console.warn(prefix, e.message);
            } else {
                console.log(prefix, e.message);
            }
            return false;
        }
    }

    function applySettingsUiFromPlan(plan) {
        if (!plan) return;

        const domPlan = SS().buildSettingsUiDomApplyPlan(plan);
        applyDomSelectsFromPlan(domPlan.unitSelects);

        if (domPlan.routingMode) {
            rt().call.setRoutingMode(domPlan.routingMode);
        }

        applyDomChecksFromPlan(domPlan.routeChecks);
        applyDomSelectsFromPlan(domPlan.routeSelects);
        applyDomSelectsFromPlan(domPlan.parkingSelects);

        const side = domPlan.sideEffects || {};
        if (side.loadPreferences) rt().call.loadPreferences();

        if (side.setMapTheme) {
            rt().call.setMapTheme(domPlan.mapTheme || 'standard');
        }

        const toggleUi = TU();
        applyStandardTogglesFromPlan(domPlan.standardToggles, toggleUi);
        applyLabeledTogglesFromPlan(domPlan.labeledToggles, toggleUi);

        if (side.applyUiTheme && domPlan.uiTheme) {
            rt().call.applyTheme(domPlan.uiTheme);
        } else if (side.initializeDarkMode) {
            rt().call.initializeDarkMode();
        }
        if (side.updateThemeButtons) rt().call.updateThemeButtons();
        if (domPlan.detourLabel) {
            root.VoyagrRoutePreferencesOrchestration.applyDetourLabelFromPlan(domPlan.detourLabel);
        }
        if (side.applySpeedWidgetToggleUi) rt().call.applySpeedWidgetToggleUi();
    }

    function collectSettingsUiRuntimeState() {
        const settingsSnapshot = SS();
        const extras = settingsSnapshot.buildCollectSettingsUiRuntimeStateInputPlan({
            mlPredictionsEnabled: localStorage.getItem('mlPredictionsEnabled') === 'true',
            voiceAnnouncementsEnabled: localStorage.getItem('voiceAnnouncementsEnabled') === 'true',
            batterySavingEnabled: localStorage.getItem('pref_batterySaving') === 'true',
            gestureControlEnabled: false,
        });
        return {
            ...collectSettingsSnapshotRuntimeState(),
            ...extras,
        };
    }

    function collectSettingsUiStoredState() {
        const settingsSnapshot = SS();
        const savedParking = localStorage.getItem('parkingPreferences');
        let parkingPrefs = {};
        if (savedParking) {
            try {
                parkingPrefs = JSON.parse(savedParking);
            } catch (e) {
                console.log(settingsSnapshot.buildCollectSettingsUiStoredStatePlan({}).parkingParseErrorLog, e);
            }
        }

        return settingsSnapshot.buildCollectSettingsUiStoredStatePlan({
            routePreferences: RP().getRoutePreferences(localStorage),
            parkingPreferences: parkingPrefs,
            mapTheme: storedMapTheme(),
            uiTheme: localStorage.getItem('ui_theme') || 'light',
        });
    }

    function applySettingsToUI() {
        const settingsSnapshot = SS();
        const orch = settingsSnapshot.buildApplySettingsToUiOrchestrationPlan();
        try {
            const execute = settingsSnapshot.buildApplySettingsUiExecutePlan(
                settingsSnapshot.buildSettingsUiApplyPlan(
                    settingsSnapshot.buildSettingsUiInputPlan(
                        collectSettingsUiRuntimeState(),
                        collectSettingsUiStoredState()
                    )
                )
            );
            if (execute.shouldApply) {
                applySettingsUiFromPlan(execute.uiPlan);
            }

            console.log(orch.successLog);
        } catch (error) {
            console.error(orch.errorLogPrefix, error);
        }
    }

    function applyResetAllSettingsFromPlan(execute) {
        if (!execute || !execute.shouldReset) return false;
        if (!confirm(execute.confirmMessage)) return false;

        (execute.localStorageKeys || []).forEach((key) => {
            localStorage.removeItem(key);
        });

        applySettingsResetRuntimeFromPlan(
            SS().buildApplySettingsResetRuntimeExecutePlan(execute.runtimeDefaults)
        );

        if (execute.reloadAfterReset) {
            location.reload();
        }
        return true;
    }

    function resetAllSettings() {
        applyResetAllSettingsFromPlan(
            SS().buildResetAllSettingsEntryOrchestrationPlan().execute
        );
    }

    function collectExportSettingsInput() {
        const settingsSnapshot = SS();
        return {
            rawSnapshot: localStorage.getItem(settingsSnapshot.SETTINGS_STORAGE_KEY),
            dateStamp: new Date().toISOString().split('T')[0],
        };
    }

    function applyExportSettingsDownloadFromPlan(execute) {
        if (!execute || !execute.shouldExport) {
            if (execute) rt().call.showStatus(execute.statusMessage, execute.statusType);
            return;
        }
        const dataBlob = new Blob([execute.blobContent], { type: execute.mimeType });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = execute.downloadFilename;
        link.click();
        URL.revokeObjectURL(url);
        rt().call.showStatus(execute.statusMessage, execute.statusType);
    }

    function exportSettings() {
        const settingsSnapshot = SS();
        const input = collectExportSettingsInput();
        applyExportSettingsDownloadFromPlan(
            settingsSnapshot.buildExportSettingsEntryOrchestrationPlan(input.rawSnapshot, input.dateStamp).execute
        );
    }

    function applySettingsImportFromOrchestrationPlan(plan) {
        if (!plan || !plan.shouldApply) return false;

        if (plan.writeStorage) {
            localStorage.setItem(plan.storageKey, plan.storageValue);
        }
        if (plan.restoreSettings) loadAllSettings();
        if (plan.applySettingsUi) applySettingsToUI();
        rt().call.showStatus(plan.statusMessage, plan.statusType);
        return true;
    }

    function applySettingsImportFileContent(rawText) {
        const settingsSnapshot = SS();
        const entry = settingsSnapshot.buildImportSettingsFileContentEntryOrchestrationPlan(rawText, {
            routeInProgress: rt().getRouteInProgress(),
        });
        if (!applySettingsImportFromOrchestrationPlan(entry.importOrch)) {
            rt().call.showStatus(entry.parsePlan.statusMessage, entry.parsePlan.statusType);
        }
    }

    function importSettings() {
        const settingsSnapshot = SS();
        const picker = settingsSnapshot.buildImportSettingsEntryOrchestrationPlan().picker;
        const input = document.createElement('input');
        input.type = picker.inputType;
        input.accept = picker.accept;
        input.onchange = (e) => {
            const fileOrch = settingsSnapshot.buildImportSettingsFileSelectedOrchestrationPlan(e.target.files[0]);
            if (!fileOrch.shouldReadFile) return;
            const reader = new FileReader();
            reader.onload = (event) => applySettingsImportFileContent(event.target.result);
            reader[fileOrch.readMethod](e.target.files[0]);
        };
        input.click();
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        collectSettingsFormState: collectSettingsFormState,
        saveAllSettings: saveAllSettings,
        loadAllSettings: loadAllSettings,
        applyDomSelectsFromPlan: applyDomSelectsFromPlan,
        applyDomChecksFromPlan: applyDomChecksFromPlan,
        applyMapLayerReorderFromPlan: applyMapLayerReorderFromPlan,
        applySettingsToUI: applySettingsToUI,
        resetAllSettings: resetAllSettings,
        exportSettings: exportSettings,
        importSettings: importSettings,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSettingsOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

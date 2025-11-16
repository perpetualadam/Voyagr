if (typeof window !== 'undefined' && window.ethereum) {
    try {
        Object.defineProperty(window, 'ethereum', {
            value: window.ethereum,
            writable: false,
            configurable: false
        });
    } catch (e) {
        // Ignore if property is already defined by extension
        console.log('[Init] Ethereum property already defined by extension');
    }
}

// Note: All global variables are declared in voyagr-core.js
// This file contains all the application logic and functions
// Variables: map, routeLayer, startMarker, endMarker, mapPickerMode
// Unit variables: distanceUnit, currencyUnit, speedUnit, temperatureUnit
// Currency symbols: currencySymbols

// ===== BOTTOM SHEET VARIABLES =====
let bottomSheetStartY = 0;
let bottomSheetCurrentY = 0;
let bottomSheetIsExpanded = false;

// ===== UNIT CONVERSION FUNCTIONS =====
/**
 * convertDistance function
 * @function convertDistance
 * @param {*} km - Parameter description
 * @returns {*} Return value description
 */
function convertDistance(km) {
    if (distanceUnit === 'mi') {
        return (km * 0.621371).toFixed(2);
    }
    return km.toFixed(2);
}

/**
 * getDistanceUnit function
 * @function getDistanceUnit
 * @returns {*} Return value description
 */
function getDistanceUnit() {
    return distanceUnit === 'mi' ? 'mi' : 'km';
}

/**
 * convertSpeed function
 * @function convertSpeed
 * @param {*} kmh - Parameter description
 * @returns {*} Return value description
 */
function convertSpeed(kmh) {
    if (speedUnit === 'mph') {
        return (kmh * 0.621371).toFixed(1);
    }
    return kmh.toFixed(1);
}

/**
 * getSpeedUnit function
 * @function getSpeedUnit
 * @returns {*} Return value description
 */
function getSpeedUnit() {
    return speedUnit === 'mph' ? 'mph' : 'km/h';
}

/**
 * convertTemperature function
 * @function convertTemperature
 * @param {*} celsius - Parameter description
 * @returns {*} Return value description
 */
function convertTemperature(celsius) {
    if (temperatureUnit === 'fahrenheit') {
        return ((celsius * 9/5) + 32).toFixed(1);
    }
    return celsius.toFixed(1);
}

/**
 * getTemperatureUnit function
 * @function getTemperatureUnit
 * @returns {*} Return value description
 */
function getTemperatureUnit() {
    return temperatureUnit === 'fahrenheit' ? '°F' : '°C';
}

/**
 * getCurrencySymbol function
 * @function getCurrencySymbol
 * @returns {*} Return value description
 */
function getCurrencySymbol() {
    return currencySymbols[currencyUnit] || '£';
}
/**
 * adjustCostForUnits function
 * @function adjustCostForUnits
 * @param {*} cost - Parameter description
 * @param {*} costType - Parameter description
 * @returns {*} Return value description
 */
function adjustCostForUnits(cost, costType = 'fuel') {
    if (distanceUnit === 'mi') {
        // For imperial units, costs need to be adjusted
        // Fuel: 1 L/100km = 0.0621371 L/mile, so multiply by 1.60934
        // Toll: £/km becomes £/mile, multiply by 1.60934
        // CAZ: Based on distance, so multiply by 1.60934
        return cost * 1.60934;
    }
    return cost;
}
/**
 * getFuelEfficiencyInUnits function
 * @function getFuelEfficiencyInUnits
 * @param {*} liters_per_100km - Parameter description
 * @returns {*} Return value description
 */
function getFuelEfficiencyInUnits(liters_per_100km) {
    if (distanceUnit === 'mi') {
        // Convert L/100km to MPG (miles per gallon)
        // 1 L/100km ≈ 235.214 / L/100km = MPG
        return (235.214 / liters_per_100km).toFixed(1);
    }
    return liters_per_100km.toFixed(1);
}

/**
 * getFuelEfficiencyLabel function
 * @function getFuelEfficiencyLabel
 * @returns {*} Return value description
 */
function getFuelEfficiencyLabel() {
    return distanceUnit === 'mi' ? 'MPG' : 'L/100km';
}

// ===== DARK MODE FUNCTIONS =====
let currentTheme = localStorage.getItem('ui_theme') || 'light';

/**
 * initializeDarkMode function
 * @function initializeDarkMode
 * @returns {*} Return value description
 */
function initializeDarkMode() {
    const savedTheme = localStorage.getItem('ui_theme') || 'light';
    currentTheme = savedTheme;
    applyTheme(savedTheme);
    console.log('[Dark Mode] Initialized with theme:', savedTheme);
}
/**
 * applyTheme function
 * @function applyTheme
 * @param {*} theme - Parameter description
 * @returns {*} Return value description
 */
function applyTheme(theme) {
    const body = document.body;

    if (theme === 'auto') {
        // Use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            body.classList.add('dark-mode');
            console.log('[Dark Mode] Applied auto theme (system prefers dark)');
        } else {
            body.classList.remove('dark-mode');
            console.log('[Dark Mode] Applied auto theme (system prefers light)');
        }
    } else if (theme === 'dark') {
        body.classList.add('dark-mode');
        console.log('[Dark Mode] Applied dark theme');
    } else {
        body.classList.remove('dark-mode');
        console.log('[Dark Mode] Applied light theme');
    }

    currentTheme = theme;
    localStorage.setItem('ui_theme', theme);
}

/**
 * toggleDarkMode function
 * @function toggleDarkMode
 * @returns {*} Return value description
 */
function toggleDarkMode() {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    showStatus(`🌙 Theme changed to ${newTheme} mode`, 'success');
}
/**
 * setTheme function
 * @function setTheme
 * @param {*} theme - Parameter description
 * @returns {*} Return value description
 */
function setTheme(theme) {
    applyTheme(theme);
    updateThemeButtons();  // Update button states to show which theme is active
    saveAllSettings();  // Save theme preference
    showStatus(`🎨 Theme changed to ${theme} mode`, 'success');
}

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (currentTheme === 'auto') {
            applyTheme('auto');
            console.log('[Dark Mode] System theme changed, reapplying auto theme');
        }
    });
}

/**
 * updateThemeButtons function
 * @function updateThemeButtons
 * @returns {*} Return value description
 */
function updateThemeButtons() {
    const lightBtn = document.getElementById('themeLight');
    const darkBtn = document.getElementById('themeDark');
    const autoBtn = document.getElementById('themeAuto');

    // Remove active class from all buttons
    if (lightBtn) lightBtn.classList.remove('active');
    if (darkBtn) darkBtn.classList.remove('active');
    if (autoBtn) autoBtn.classList.remove('active');

    // Add active class to current theme button
    if (currentTheme === 'light' && lightBtn) {
        lightBtn.classList.add('active');
    } else if (currentTheme === 'dark' && darkBtn) {
        darkBtn.classList.add('active');
    } else if (currentTheme === 'auto' && autoBtn) {
        autoBtn.classList.add('active');
    }

    console.log('[Dark Mode] Theme buttons updated for theme:', currentTheme);
}

// Tab switching function
/**
 * switchTab function
 * @function switchTab
 * @param {*} tab - Parameter description
 * @returns {*} Return value description
 */
function switchTab(tab) {
    const navigationContent = document.querySelector('.bottom-sheet-content > div:not(#settingsTab):not(#tripHistoryTab):not(#routeComparisonTab):not(#routeSharingTab):not(#routeAnalyticsTab):not(#savedRoutesTab)');
    const settingsTab = document.getElementById('settingsTab');
    const tripHistoryTab = document.getElementById('tripHistoryTab');
    const routeComparisonTab = document.getElementById('routeComparisonTab');
    const routeSharingTab = document.getElementById('routeSharingTab');
    const routeAnalyticsTab = document.getElementById('routeAnalyticsTab');
    const savedRoutesTab = document.getElementById('savedRoutesTab');
    const sheetTitle = document.getElementById('sheetTitle');

    // Hide all tabs
    if (navigationContent) navigationContent.style.display = 'none';
    settingsTab.style.display = 'none';
    tripHistoryTab.style.display = 'none';
    routeComparisonTab.style.display = 'none';
    routeSharingTab.style.display = 'none';
    routeAnalyticsTab.style.display = 'none';
    savedRoutesTab.style.display = 'none';
    const routePreviewTab = document.getElementById('routePreviewTab');
    if (routePreviewTab) routePreviewTab.style.display = 'none';

    if (tab === 'settings') {
        settingsTab.style.display = 'block';
        sheetTitle.textContent = '⚙️ Settings';
        loadUnitPreferences();
        loadRoutePreferences();
        loadVoicePreferences();
    } else if (tab === 'tripHistory') {
        tripHistoryTab.style.display = 'block';
        sheetTitle.textContent = '📋 Trip History';
        loadTripHistory();
    } else if (tab === 'routePreview') {
        if (routePreviewTab) {
            routePreviewTab.style.display = 'block';
            sheetTitle.textContent = '📍 Route Preview';
        }
    } else if (tab === 'routeComparison') {
        routeComparisonTab.style.display = 'block';
        sheetTitle.textContent = '🛣️ Route Options';
        displayRouteComparison();
    } else if (tab === 'routeSharing') {
        routeSharingTab.style.display = 'block';
        sheetTitle.textContent = '🔗 Share Route';
        prepareRouteSharing();
    } else if (tab === 'routeAnalytics') {
        routeAnalyticsTab.style.display = 'block';
        sheetTitle.textContent = '📊 Analytics';
        loadRouteAnalytics();
    } else if (tab === 'savedRoutes') {
        savedRoutesTab.style.display = 'block';
        sheetTitle.textContent = '⭐ Saved Routes';
        loadSavedRoutes();
    } else {
        if (navigationContent) navigationContent.style.display = 'block';
        sheetTitle.textContent = '🗺️ Navigation';
    }
}

// Load unit preferences from localStorage
/**
 * loadUnitPreferences function
 * @function loadUnitPreferences
 * @returns {*} Return value description
 */
function loadUnitPreferences() {
    document.getElementById('distanceUnit').value = distanceUnit;
    document.getElementById('currencyUnit').value = currencyUnit;
    document.getElementById('speedUnit').value = speedUnit;
    document.getElementById('temperatureUnit').value = temperatureUnit;
}

// Update distance unit
/**
 * updateDistanceUnit function
 * @function updateDistanceUnit
 * @returns {*} Return value description
 */
function updateDistanceUnit() {
    const newUnit = document.getElementById('distanceUnit').value;
    distanceUnit = newUnit;
    localStorage.setItem('unit_distance', newUnit);
    saveUnitSettingsToBackend();
    updateAllDistanceDisplays();
    saveAllSettings();
    showStatus(`Distance unit changed to ${newUnit === 'mi' ? 'miles' : 'kilometers'}`, 'success');
}

// Update currency unit
/**
 * updateCurrencyUnit function
 * @function updateCurrencyUnit
 * @returns {*} Return value description
 */
function updateCurrencyUnit() {
    const newUnit = document.getElementById('currencyUnit').value;
    currencyUnit = newUnit;
    localStorage.setItem('unit_currency', newUnit);
    saveUnitSettingsToBackend();
    updateAllCostDisplays();
    saveAllSettings();
    showStatus(`Currency changed to ${newUnit}`, 'success');
}

// Update speed unit
/**
 * updateSpeedUnit function
 * @function updateSpeedUnit
 * @returns {*} Return value description
 */
function updateSpeedUnit() {
    const newUnit = document.getElementById('speedUnit').value;
    speedUnit = newUnit;
    localStorage.setItem('unit_speed', newUnit);
    saveUnitSettingsToBackend();
    updateAllSpeedDisplays();
    saveAllSettings();
    showStatus(`Speed unit changed to ${newUnit === 'mph' ? 'mph' : 'km/h'}`, 'success');
}

// Update temperature unit
/**
 * updateTemperatureUnit function
 * @function updateTemperatureUnit
 * @returns {*} Return value description
 */
function updateTemperatureUnit() {
    const newUnit = document.getElementById('temperatureUnit').value;
    temperatureUnit = newUnit;
    localStorage.setItem('unit_temperature', newUnit);
    saveUnitSettingsToBackend();
    updateAllTemperatureDisplays();
    saveAllSettings();
    showStatus(`Temperature unit changed to ${newUnit === 'fahrenheit' ? 'Fahrenheit' : 'Celsius'}`, 'success');
}

// Save unit settings to backend
/**
 * saveUnitSettingsToBackend function
 * @function saveUnitSettingsToBackend
 * @returns {*} Return value description
 */
function saveUnitSettingsToBackend() {
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            distance_unit: distanceUnit,
            currency_unit: currencyUnit,
            speed_unit: speedUnit,
            temperature_unit: temperatureUnit
        })
    }).catch(error => console.error('Error saving unit settings:', error));
}

// ===== COMPREHENSIVE PERSISTENT SETTINGS SYSTEM =====

/**
 * saveAllSettings function
 * @function saveAllSettings
 * @returns {*} Return value description
 */
function saveAllSettings() {
    const allSettings = {
        // Unit preferences
        unit_distance: distanceUnit,
        unit_currency: currencyUnit,
        unit_speed: speedUnit,
        unit_temperature: temperatureUnit,

        // Vehicle and routing
        vehicleType: currentVehicleType,
        routingMode: currentRoutingMode,

        // Route preferences
        routePreferences: {
            avoidHighways: document.getElementById('avoidHighways')?.checked || false,
            preferScenic: document.getElementById('preferScenic')?.checked || false,
            avoidTolls: localStorage.getItem('pref_tolls') === 'true',
            avoidCAZ: localStorage.getItem('pref_caz') === 'true',
            preferQuiet: document.getElementById('preferQuiet')?.checked || false,
            avoidUnpaved: document.getElementById('avoidUnpaved')?.checked || false,
            routeOptimization: document.getElementById('routeOptimization')?.value || 'fastest',
            maxDetour: parseInt(document.getElementById('maxDetour')?.value || 20)
        },

        // Hazard avoidance
        hazardPreferences: {
            avoidTolls: localStorage.getItem('pref_tolls') === 'true',
            avoidCAZ: localStorage.getItem('pref_caz') === 'true',
            avoidSpeedCameras: localStorage.getItem('pref_speedCameras') === 'true',
            avoidTrafficCameras: localStorage.getItem('pref_trafficCameras') === 'true',
            variableSpeedAlerts: localStorage.getItem('pref_variableSpeedAlerts') === 'true'
        },

        // Display preferences
        mapTheme: localStorage.getItem('mapTheme') || 'standard',
        smartZoomEnabled: smartZoomEnabled,

        // Parking preferences
        parkingPreferences: {
            maxWalkingDistance: document.getElementById('parkingMaxWalkingDistance')?.value || '10',
            preferredType: document.getElementById('parkingPreferredType')?.value || 'any',
            pricePreference: document.getElementById('parkingPricePreference')?.value || 'any'
        },

        // Timestamp for debugging
        lastSaved: new Date().toISOString()
    };

    localStorage.setItem('voyagr_all_settings', JSON.stringify(allSettings));
    console.log('[Settings] All settings saved to localStorage', allSettings);
}

/**
 * loadAllSettings function
 * @function loadAllSettings
 * @returns {*} Return value description
 */
function loadAllSettings() {
    try {
        const saved = localStorage.getItem('voyagr_all_settings');
        if (saved) {
            const settings = JSON.parse(saved);
            console.log('[Settings] Loaded settings from localStorage', settings);

            // Restore unit preferences
            if (settings.unit_distance) {
                distanceUnit = settings.unit_distance;
                localStorage.setItem('unit_distance', distanceUnit);
            }
            if (settings.unit_currency) {
                currencyUnit = settings.unit_currency;
                localStorage.setItem('unit_currency', currencyUnit);
            }
            if (settings.unit_speed) {
                speedUnit = settings.unit_speed;
                localStorage.setItem('unit_speed', speedUnit);
            }
            if (settings.unit_temperature) {
                temperatureUnit = settings.unit_temperature;
                localStorage.setItem('unit_temperature', temperatureUnit);
            }

            // Restore vehicle type and routing mode
            if (settings.vehicleType) {
                currentVehicleType = settings.vehicleType;
                localStorage.setItem('vehicleType', currentVehicleType);
            }
            if (settings.routingMode) {
                currentRoutingMode = settings.routingMode;
                localStorage.setItem('routingMode', currentRoutingMode);
            }

            // Restore route preferences
            if (settings.routePreferences) {
                localStorage.setItem('routePreferences', JSON.stringify(settings.routePreferences));
            }

            // Restore hazard preferences
            if (settings.hazardPreferences) {
                localStorage.setItem('pref_tolls', settings.hazardPreferences.avoidTolls ? 'true' : 'false');
                localStorage.setItem('pref_caz', settings.hazardPreferences.avoidCAZ ? 'true' : 'false');
                localStorage.setItem('pref_speedCameras', settings.hazardPreferences.avoidSpeedCameras ? 'true' : 'false');
                localStorage.setItem('pref_trafficCameras', settings.hazardPreferences.avoidTrafficCameras ? 'true' : 'false');
                localStorage.setItem('pref_variableSpeedAlerts', settings.hazardPreferences.variableSpeedAlerts ? 'true' : 'false');
            }

            // Restore display preferences
            if (settings.mapTheme) {
                localStorage.setItem('mapTheme', settings.mapTheme);
            }
            if (settings.smartZoomEnabled !== undefined) {
                smartZoomEnabled = settings.smartZoomEnabled;
                localStorage.setItem('smartZoomEnabled', smartZoomEnabled ? '1' : '0');
            }

            // Restore parking preferences
            if (settings.parkingPreferences) {
                localStorage.setItem('parkingPreferences', JSON.stringify(settings.parkingPreferences));
            }

            console.log('[Settings] All settings restored successfully');
            return true;
        } else {
            console.log('[Settings] No saved settings found, using defaults');
            return false;
        }
    } catch (error) {
        console.error('[Settings] Error loading settings:', error);
        return false;
    }
}

/**
 * applySettingsToUI function
 * @function applySettingsToUI
 * @returns {*} Return value description
 */
function applySettingsToUI() {
    try {
        // Apply unit preferences
        const distanceUnitEl = document.getElementById('distanceUnit');
        if (distanceUnitEl) distanceUnitEl.value = distanceUnit;

        const currencyUnitEl = document.getElementById('currencyUnit');
        if (currencyUnitEl) currencyUnitEl.value = currencyUnit;

        const speedUnitEl = document.getElementById('speedUnit');
        if (speedUnitEl) speedUnitEl.value = speedUnit;

        const temperatureUnitEl = document.getElementById('temperatureUnit');
        if (temperatureUnitEl) temperatureUnitEl.value = temperatureUnit;

        // Apply vehicle type
        const vehicleTypeEl = document.getElementById('vehicleType');
        if (vehicleTypeEl) vehicleTypeEl.value = currentVehicleType;

        // Apply routing mode
        setRoutingMode(currentRoutingMode);

        // Apply route preferences
        const saved = localStorage.getItem('routePreferences');
        if (saved) {
            const prefs = JSON.parse(saved);
            const avoidHighwaysEl = document.getElementById('avoidHighways');
            if (avoidHighwaysEl) avoidHighwaysEl.checked = prefs.avoidHighways || false;

            const preferScenicEl = document.getElementById('preferScenic');
            if (preferScenicEl) preferScenicEl.checked = prefs.preferScenic || false;

            const preferQuietEl = document.getElementById('preferQuiet');
            if (preferQuietEl) preferQuietEl.checked = prefs.preferQuiet || false;

            const avoidUnpavedEl = document.getElementById('avoidUnpaved');
            if (avoidUnpavedEl) avoidUnpavedEl.checked = prefs.avoidUnpaved || false;

            const routeOptimizationEl = document.getElementById('routeOptimization');
            if (routeOptimizationEl) routeOptimizationEl.value = prefs.routeOptimization || 'fastest';

            const maxDetourEl = document.getElementById('maxDetour');
            if (maxDetourEl) {
                maxDetourEl.value = prefs.maxDetour || 20;
                updateDetourLabel();
            }
        }

        // Apply hazard preferences
        loadPreferences();

        // Apply parking preferences
        const parkingMaxWalkingEl = document.getElementById('parkingMaxWalkingDistance');
        const parkingTypeEl = document.getElementById('parkingPreferredType');
        const parkingPriceEl = document.getElementById('parkingPricePreference');
        const savedParking = localStorage.getItem('parkingPreferences');
        if (savedParking) {
            try {
                const parkingPrefs = JSON.parse(savedParking);
                if (parkingMaxWalkingEl) parkingMaxWalkingEl.value = parkingPrefs.maxWalkingDistance || '10';
                if (parkingTypeEl) parkingTypeEl.value = parkingPrefs.preferredType || 'any';
                if (parkingPriceEl) parkingPriceEl.value = parkingPrefs.pricePreference || 'any';
            } catch (e) {
                console.log('[Settings] Error applying parking preferences:', e);
            }
        }

        // Apply display preferences
        const mapTheme = localStorage.getItem('mapTheme') || 'standard';
        setMapTheme(mapTheme);

        const smartZoomToggle = document.getElementById('smartZoomToggle');
        if (smartZoomToggle) {
            if (smartZoomEnabled) {
                smartZoomToggle.classList.add('active');
            } else {
                smartZoomToggle.classList.remove('active');
            }
        }

        // Apply ML predictions toggle state
        const mlPredictionsEnabled = localStorage.getItem('mlPredictionsEnabled') === 'true';
        const mlToggle = document.getElementById('mlPredictionsEnabled');
        if (mlToggle) {
            if (mlPredictionsEnabled) {
                mlToggle.classList.add('active');
                mlToggle.style.background = '#4CAF50';
                mlToggle.style.borderColor = '#4CAF50';
                mlToggle.style.color = 'white';
            } else {
                mlToggle.classList.remove('active');
                mlToggle.style.background = '#ddd';
                mlToggle.style.borderColor = '#999';
                mlToggle.style.color = '#333';
            }
        }

        // Apply voice announcements toggle state
        const voiceAnnouncementsEnabled = localStorage.getItem('voiceAnnouncementsEnabled') === 'true';
        const voiceToggle = document.getElementById('voiceAnnouncementsEnabled');
        if (voiceToggle) {
            if (voiceAnnouncementsEnabled) {
                voiceToggle.classList.add('active');
                voiceToggle.style.background = '#4CAF50';
                voiceToggle.style.borderColor = '#4CAF50';
                voiceToggle.style.color = 'white';
            } else {
                voiceToggle.classList.remove('active');
                voiceToggle.style.background = '#ddd';
                voiceToggle.style.borderColor = '#999';
                voiceToggle.style.color = '#333';
            }
        }

        // Apply battery saving mode toggle state
        const batterySavingEnabled = localStorage.getItem('pref_batterySaving') === 'true';
        const batteryToggle = document.getElementById('batterySavingMode');
        if (batteryToggle) {
            if (batterySavingEnabled) {
                batteryToggle.classList.add('active');
                batteryToggle.style.background = '#4CAF50';
                batteryToggle.style.borderColor = '#4CAF50';
                batteryToggle.style.color = 'white';
            } else {
                batteryToggle.classList.remove('active');
                batteryToggle.style.background = '#ddd';
                batteryToggle.style.borderColor = '#999';
                batteryToggle.style.color = '#333';
            }
        }

        // Apply gesture control toggle state
        const gestureControlEnabled = localStorage.getItem('gestureEnabled') === 'true';
        const gestureToggle = document.getElementById('gestureEnabled');
        if (gestureToggle) {
            if (gestureControlEnabled) {
                gestureToggle.classList.add('active');
                gestureToggle.style.background = '#4CAF50';
                gestureToggle.style.borderColor = '#4CAF50';
                gestureToggle.style.color = 'white';
            } else {
                gestureToggle.classList.remove('active');
                gestureToggle.style.background = '#ddd';
                gestureToggle.style.borderColor = '#999';
                gestureToggle.style.color = '#333';
            }
        }

        // Apply UI theme preference
        initializeDarkMode();
        updateThemeButtons();

        console.log('[Settings] All settings applied to UI');
    } catch (error) {
        console.error('[Settings] Error applying settings to UI:', error);
    }
}

/**
 * resetAllSettings function
 * @function resetAllSettings
 * @returns {*} Return value description
 */
function resetAllSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        // Clear all settings from localStorage
        const keysToRemove = [
            'voyagr_all_settings',
            'unit_distance', 'unit_currency', 'unit_speed', 'unit_temperature',
            'vehicleType', 'routingMode',
            'routePreferences',
            'pref_tolls', 'pref_caz', 'pref_speedCameras', 'pref_trafficCameras', 'pref_variableSpeedAlerts',
            'mapTheme', 'smartZoomEnabled',
            'parkingPreferences'
        ];

        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Reset variables to defaults
        distanceUnit = 'km';
        currencyUnit = 'GBP';
        speedUnit = 'kmh';
        temperatureUnit = 'celsius';
        currentVehicleType = 'petrol_diesel';
        currentRoutingMode = 'auto';
        smartZoomEnabled = true;

        // Reload page to apply defaults
        location.reload();
        showStatus('✅ Settings reset to defaults', 'success');
    }
}

/**
 * exportSettings function
 * @function exportSettings
 * @returns {*} Return value description
 */
function exportSettings() {
    const settings = localStorage.getItem('voyagr_all_settings');
    if (settings) {
        const dataStr = JSON.stringify(JSON.parse(settings), null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `voyagr-settings-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        showStatus('✅ Settings exported', 'success');
    } else {
        showStatus('❌ No settings to export', 'error');
    }
}

/**
 * importSettings function
 * @function importSettings
 * @returns {*} Return value description
 */
function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const settings = JSON.parse(event.target.result);
                    localStorage.setItem('voyagr_all_settings', JSON.stringify(settings));
                    loadAllSettings();
                    applySettingsToUI();
                    showStatus('✅ Settings imported successfully', 'success');
                } catch (error) {
                    console.error('Error importing settings:', error);
                    showStatus('❌ Error importing settings', 'error');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

// Update all distance displays
/**
 * updateAllDistanceDisplays function
 * @function updateAllDistanceDisplays
 * @returns {*} Return value description
 */
function updateAllDistanceDisplays() {
    // Update main distance display
    const distanceElement = document.getElementById('distance');
    if (distanceElement && distanceElement.dataset.km) {
        const km = parseFloat(distanceElement.dataset.km);
        if (!isNaN(km)) {
            distanceElement.textContent = convertDistance(km) + ' ' + getDistanceUnit();
        }
    }

    // Update route preview distance if available
    const previewDistanceElement = document.getElementById('previewDistance');
    if (previewDistanceElement && previewDistanceElement.dataset.km) {
        const previewKm = parseFloat(previewDistanceElement.dataset.km);
        if (!isNaN(previewKm)) {
            previewDistanceElement.textContent = convertDistance(previewKm) + ' ' + getDistanceUnit();
        }
    }
}

// Update all cost displays
/**
 * updateAllCostDisplays function
 * @function updateAllCostDisplays
 * @returns {*} Return value description
 */
function updateAllCostDisplays() {
    const fuelCostEl = document.getElementById('fuelCost');
    const tollCostEl = document.getElementById('tollCost');
    const cazCostEl = document.getElementById('cazCost');
    const symbol = getCurrencySymbol();

    if (fuelCostEl && fuelCostEl.dataset.value) {
        fuelCostEl.textContent = symbol + fuelCostEl.dataset.value;
    }
    if (tollCostEl && tollCostEl.dataset.value) {
        tollCostEl.textContent = symbol + tollCostEl.dataset.value;
    }
    if (cazCostEl && cazCostEl.dataset.value) {
        cazCostEl.textContent = symbol + cazCostEl.dataset.value;
    }
}

// Update all speed displays
/**
 * updateAllSpeedDisplays function
 * @function updateAllSpeedDisplays
 * @returns {*} Return value description
 */
function updateAllSpeedDisplays() {
    // This will be called when speed updates occur
    console.log('[Units] Speed unit updated to', speedUnit);
}

// Update all temperature displays
/**
 * updateAllTemperatureDisplays function
 * @function updateAllTemperatureDisplays
 * @returns {*} Return value description
 */
function updateAllTemperatureDisplays() {
    // This will be called when weather updates occur
    console.log('[Units] Temperature unit updated to', temperatureUnit);
}

// ===== TRIP HISTORY FUNCTIONS =====
let allTrips = [];

async function loadTripHistory() {
    try {
        const response = await fetch('/api/trip-history');
        const data = await response.json();

        if (data.success && data.trips) {
            allTrips = data.trips;
            displayTripHistory(allTrips);
        } else {
            document.getElementById('tripHistoryList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trips found</div>';
        }
    } catch (error) {
        console.error('Error loading trip history:', error);
        document.getElementById('tripHistoryList').innerHTML = '<div style="text-align: center; padding: 20px; color: #f44336;">Error loading trips</div>';
    }
}
/**
 * displayTripHistory function
 * @function displayTripHistory
 * @param {*} trips - Parameter description
 * @returns {*} Return value description
 */
function displayTripHistory(trips) {
    const listContainer = document.getElementById('tripHistoryList');

    if (!trips || trips.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trips found</div>';
        return;
    }

    listContainer.innerHTML = trips.map((trip, index) => {
        const date = new Date(trip.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const distance = convertDistance(trip.distance_km);
        const distUnit = getDistanceUnit();
        const totalCost = (parseFloat(trip.fuel_cost || 0) + parseFloat(trip.toll_cost || 0) + parseFloat(trip.caz_cost || 0)).toFixed(2);
        const symbol = getCurrencySymbol();

        return `
            <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #667eea;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        <div style="font-weight: 600; color: #333; margin-bottom: 4px;">
                            ${trip.start_address || 'Start'} → ${trip.end_address || 'End'}
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            ${dateStr}
                        </div>
                    </div>
                    <button onclick="deleteTripHistory(${trip.id})" style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;">Delete</button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #666; margin-bottom: 8px;">
                    <div>📏 ${distance} ${distUnit}</div>
                    <div>⏱️ ${trip.duration_minutes} min</div>
                    <div>💰 ${symbol}${totalCost}</div>
                    <div>🛣️ ${trip.routing_mode}</div>
                </div>
                <button onclick="recalculateTrip(${trip.id})" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Recalculate Route</button>
            </div>
        `;
    }).join('');

    // Add search functionality
    document.getElementById('tripSearchInput').oninput = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = allTrips.filter(trip =>
            (trip.start_address && trip.start_address.toLowerCase().includes(searchTerm)) ||
            (trip.end_address && trip.end_address.toLowerCase().includes(searchTerm)) ||
            (trip.timestamp && trip.timestamp.toLowerCase().includes(searchTerm))
        );
        displayTripHistory(filtered);
    };
}

async function recalculateTrip(tripId) {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) return;

    // Populate form with trip data
    document.getElementById('start').value = trip.start_address || `${trip.start_lat},${trip.start_lon}`;
    document.getElementById('end').value = trip.end_address || `${trip.end_lat},${trip.end_lon}`;

    // Switch back to navigation tab
    switchTab('navigation');

    // Trigger route calculation
    setTimeout(() => {
        calculateRoute();
    }, 300);

    showStatus('Trip loaded. Recalculating route...', 'success');
}

async function deleteTripHistory(tripId) {
    if (!confirm('Are you sure you want to delete this trip?')) return;

    try {
        const response = await fetch(`/api/trip-history/${tripId}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            allTrips = allTrips.filter(t => t.id !== tripId);
            displayTripHistory(allTrips);
            showStatus('Trip deleted', 'success');
        } else {
            showStatus('Error deleting trip', 'error');
        }
    } catch (error) {
        console.error('Error deleting trip:', error);
        showStatus('Error deleting trip', 'error');
    }
}

// ===== ROUTE COMPARISON FUNCTIONS =====
let routeOptions = [];
let selectedRouteIndex = 0;
let routePreference = 'fastest';
/**
 * setRoutePreference function
 * @function setRoutePreference
 * @param {*} preference - Parameter description
 * @returns {*} Return value description
 */
function setRoutePreference(preference) {
    routePreference = preference;

    // Update button states
    document.getElementById('routePrefFastest').classList.remove('active');
    document.getElementById('routePrefShortest').classList.remove('active');
    document.getElementById('routePrefCheapest').classList.remove('active');
    document.getElementById('routePrefEco').classList.remove('active');

    document.getElementById('routePref' + preference.charAt(0).toUpperCase() + preference.slice(1)).classList.add('active');

    // Re-sort routes based on preference
    sortRoutesByPreference();
    displayRouteComparison();
}

/**
 * sortRoutesByPreference function
 * @function sortRoutesByPreference
 * @returns {*} Return value description
 */
function sortRoutesByPreference() {
    if (!routeOptions || routeOptions.length === 0) return;

    routeOptions.sort((a, b) => {
        switch(routePreference) {
            case 'fastest':
                return a.duration_minutes - b.duration_minutes;
            case 'shortest':
                return a.distance_km - b.distance_km;
            case 'cheapest':
                const costA = (a.fuel_cost || 0) + (a.toll_cost || 0) + (a.caz_cost || 0);
                const costB = (b.fuel_cost || 0) + (b.toll_cost || 0) + (b.caz_cost || 0);
                return costA - costB;
            case 'eco':
                return (a.fuel_cost || 0) - (b.fuel_cost || 0);
            default:
                return 0;
        }
    });
}

/**
 * displayRouteComparison function
 * @function displayRouteComparison
 * @returns {*} Return value description
 */
function displayRouteComparison() {
    if (!routeOptions || routeOptions.length === 0) {
        document.getElementById('routeComparisonList').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Calculate a route to see options</div>';
        return;
    }

    const listContainer = document.getElementById('routeComparisonList');
    const symbol = getCurrencySymbol();

    listContainer.innerHTML = routeOptions.map((route, index) => {
        const distance = convertDistance(route.distance_km);
        const distUnit = getDistanceUnit();

        // Adjust costs for imperial units if needed
        const fuelCost = parseFloat(route.fuel_cost || 0);
        const tollCost = parseFloat(route.toll_cost || 0);
        const cazCost = parseFloat(route.caz_cost || 0);
        const adjustedFuelCost = distanceUnit === 'mi' ? fuelCost * 1.60934 : fuelCost;
        const adjustedTollCost = distanceUnit === 'mi' ? tollCost * 1.60934 : tollCost;
        const adjustedCazCost = distanceUnit === 'mi' ? cazCost * 1.60934 : cazCost;
        const totalCost = (adjustedFuelCost + adjustedTollCost + adjustedCazCost).toFixed(2);

        const isRecommended = index === 0;
        const borderColor = isRecommended ? '#4CAF50' : '#ddd';
        const bgColor = isRecommended ? '#E8F5E9' : '#f8f9fa';

        return `
            <div style="background: ${bgColor}; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${borderColor}; cursor: pointer;" onclick="selectRoute(${index})">
                ${isRecommended ? '<div style="font-size: 12px; color: #4CAF50; font-weight: 600; margin-bottom: 6px;">✓ RECOMMENDED</div>' : ''}
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #333; margin-bottom: 8px;">
                    <div><strong>⏱️ ${route.duration_minutes} min</strong></div>
                    <div><strong>📏 ${distance} ${distUnit}</strong></div>
                    <div>⛽ ${symbol}${adjustedFuelCost.toFixed(2)}</div>
                    <div>🛣️ ${symbol}${adjustedTollCost.toFixed(2)}</div>
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                    Total: <strong>${symbol}${totalCost}</strong>
                </div>
                <button onclick="useRoute(${index}); event.stopPropagation();" style="width: 100%; background: #667eea; color: white; border: none; border-radius: 4px; padding: 8px; font-size: 12px; cursor: pointer; font-weight: 500;">Use This Route</button>
            </div>
        `;
    }).join('');
}
/**
 * selectRoute function
 * @function selectRoute
 * @param {*} index - Parameter description
 * @returns {*} Return value description
 */
function selectRoute(index) {
    selectedRouteIndex = index;
    displayRouteComparison();
}
/**
 * useRoute function
 * @function useRoute
 * @param {*} index - Parameter description
 * @returns {*} Return value description
 */
function useRoute(index) {
    const route = routeOptions[index];
    if (!route) return;

    // Update the map to show this route
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }

    // Draw the selected route on map
    const polylinePoints = route.polyline || [];
    if (polylinePoints.length > 0) {
        routeLayer = L.polyline(polylinePoints, {
            color: '#667eea',
            weight: 5,
            opacity: 0.8,
            dashArray: '5, 5'
        }).addTo(map);

        const bounds = routeLayer.getBounds().pad(0.1);
        const center = bounds.getCenter();
        const zoomLevel = map.getBoundsZoom(bounds);
        map.flyTo(center, zoomLevel, {
            duration: 0.5,
            easeLinearity: 0.25
        });
    }

    // Update trip info with unit-adjusted costs
    const distance = convertDistance(route.distance_km);
    const distUnit = getDistanceUnit();
    const symbol = getCurrencySymbol();

    // Adjust costs for imperial units if needed
    const fuelCost = parseFloat(route.fuel_cost || 0);
    const tollCost = parseFloat(route.toll_cost || 0);
    const cazCost = parseFloat(route.caz_cost || 0);
    const adjustedFuelCost = distanceUnit === 'mi' ? fuelCost * 1.60934 : fuelCost;
    const adjustedTollCost = distanceUnit === 'mi' ? tollCost * 1.60934 : tollCost;
    const adjustedCazCost = distanceUnit === 'mi' ? cazCost * 1.60934 : cazCost;
    const totalCost = (adjustedFuelCost + adjustedTollCost + adjustedCazCost).toFixed(2);

    document.getElementById('distance').textContent = distance + ' ' + distUnit;
    document.getElementById('distance').dataset.km = route.distance_km;
    document.getElementById('time').textContent = route.duration_minutes + ' min';
    document.getElementById('fuelCost').textContent = symbol + adjustedFuelCost.toFixed(2);
    document.getElementById('fuelCost').dataset.value = adjustedFuelCost;
    document.getElementById('tollCost').textContent = symbol + adjustedTollCost.toFixed(2);
    document.getElementById('tollCost').dataset.value = adjustedTollCost;

    console.log('[Cost] Route selected with adjusted costs:', {
        distanceUnit: distanceUnit,
        fuelCost: adjustedFuelCost.toFixed(2),
        tollCost: adjustedTollCost.toFixed(2),
        cazCost: adjustedCazCost.toFixed(2),
        totalCost: totalCost
    });

    // Store selected route for navigation
    window.lastCalculatedRoute = route;

    showStatus('Route selected. Ready to navigate!', 'success');
    switchTab('navigation');
}

// ===== ROUTE SHARING FUNCTIONS =====
/**
 * prepareRouteSharing function
 * @function prepareRouteSharing
 * @returns {*} Return value description
 */
function prepareRouteSharing() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    // Update route summary with unit-adjusted costs
    document.getElementById('shareStart').textContent = `Start: ${startInput}`;
    document.getElementById('shareEnd').textContent = `End: ${endInput}`;
    document.getElementById('shareDistance').textContent = `Distance: ${convertDistance(route.distance_km || 0)} ${distUnit}`;
    document.getElementById('shareTime').textContent = `Duration: ${route.time || 'N/A'}`;

    // Adjust costs for imperial units if needed
    const fuelCost = parseFloat(route.fuel_cost || 0);
    const tollCost = parseFloat(route.toll_cost || 0);
    const cazCost = parseFloat(route.caz_cost || 0);
    const adjustedFuelCost = distanceUnit === 'mi' ? fuelCost * 1.60934 : fuelCost;
    const adjustedTollCost = distanceUnit === 'mi' ? tollCost * 1.60934 : tollCost;
    const adjustedCazCost = distanceUnit === 'mi' ? cazCost * 1.60934 : cazCost;
    const totalCost = (adjustedFuelCost + adjustedTollCost + adjustedCazCost).toFixed(2);
    document.getElementById('shareCost').textContent = `Total Cost: ${symbol}${totalCost}`;

    console.log('[Cost] Route sharing prepared with adjusted costs:', {
        distanceUnit: distanceUnit,
        totalCost: totalCost
    });
}

/**
 * generateShareLink function
 * @function generateShareLink
 * @returns {*} Return value description
 */
function generateShareLink() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    // Create shareable link with route data
    const routeData = {
        start: startInput,
        end: endInput,
        distance: route.distance_km,
        time: route.time,
        fuel_cost: route.fuel_cost,
        toll_cost: route.toll_cost,
        caz_cost: route.caz_cost,
        geometry: route.geometry
    };

    // Encode route data as base64
    const encodedRoute = btoa(JSON.stringify(routeData));
    const shareLink = `${window.location.origin}?route=${encodedRoute}`;

    // Display share link
    document.getElementById('shareLink').value = shareLink;
    document.getElementById('shareLinkContainer').style.display = 'block';
    document.getElementById('qrCodeContainer').style.display = 'none';

    showStatus('Share link generated!', 'success');
}

/**
 * copyShareLink function
 * @function copyShareLink
 * @returns {*} Return value description
 */
function copyShareLink() {
    const shareLink = document.getElementById('shareLink');
    shareLink.select();
    document.execCommand('copy');
    showStatus('Link copied to clipboard!', 'success');
}

/**
 * generateQRCode function
 * @function generateQRCode
 * @returns {*} Return value description
 */
function generateQRCode() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    // Generate share link first
    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    const routeData = {
        start: startInput,
        end: endInput,
        distance: route.distance_km,
        time: route.time,
        fuel_cost: route.fuel_cost,
        toll_cost: route.toll_cost,
        caz_cost: route.caz_cost
    };

    const encodedRoute = btoa(JSON.stringify(routeData));
    const shareLink = `${window.location.origin}?route=${encodedRoute}`;

    // Clear previous QR code
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';

    // Generate QR code using QR Server API
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareLink)}`;
    const qrImage = document.createElement('img');
    qrImage.src = qrImageUrl;
    qrImage.alt = 'Route QR Code';
    qrImage.style.width = '200px';
    qrImage.style.height = '200px';
    qrContainer.appendChild(qrImage);

    // Store QR image URL for download
    window.qrImageUrl = qrImageUrl;

    document.getElementById('qrCodeContainer').style.display = 'block';
    document.getElementById('shareLinkContainer').style.display = 'none';

    showStatus('QR code generated!', 'success');
}

/**
 * downloadQRCode function
 * @function downloadQRCode
 * @returns {*} Return value description
 */
function downloadQRCode() {
    if (!window.qrImageUrl) {
        showStatus('Generate QR code first', 'error');
        return;
    }

    const link = document.createElement('a');
    link.href = window.qrImageUrl;
    link.download = 'route-qr-code.png';
    link.click();

    showStatus('QR code downloaded!', 'success');
}

/**
 * shareViaWhatsApp function
 * @function shareViaWhatsApp
 * @returns {*} Return value description
 */
function shareViaWhatsApp() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    const message = `📍 Route from ${startInput} to ${endInput}\n📏 Distance: ${convertDistance(route.distance_km)} ${distUnit}\n⏱️ Duration: ${route.time}\n💰 Cost: ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}\n\nShared via Voyagr Navigation`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');

    showStatus('Opening WhatsApp...', 'success');
}

/**
 * shareViaEmail function
 * @function shareViaEmail
 * @returns {*} Return value description
 */
function shareViaEmail() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    const subject = `Route: ${startInput} to ${endInput}`;
    const body = `I'm sharing a route with you:\n\nFrom: ${startInput}\nTo: ${endInput}\nDistance: ${convertDistance(route.distance_km)} ${distUnit}\nDuration: ${route.time}\nEstimated Cost: ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}\n\nShared via Voyagr Navigation`;

    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;

    showStatus('Opening email client...', 'success');
}

// ===== ROUTE ANALYTICS FUNCTIONS =====
/**
 * loadRouteAnalytics function
 * @function loadRouteAnalytics
 * @returns {*} Return value description
 */
function loadRouteAnalytics() {
    fetch('/api/trip-analytics')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayAnalytics(data);
            } else {
                showStatus('Failed to load analytics', 'error');
            }
        })
        .catch(error => {
            console.error('Analytics error:', error);
            showStatus('Error loading analytics', 'error');
        });
}
/**
 * displayAnalytics function
 * @function displayAnalytics
 * @param {*} data - Parameter description
 * @returns {*} Return value description
 */
function displayAnalytics(data) {
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    // Update summary stats
    document.getElementById('totalTrips').textContent = data.total_trips || 0;
    document.getElementById('totalDistance').textContent = `${convertDistance(data.total_distance_km || 0)} ${distUnit}`;
    document.getElementById('totalCost').textContent = `${symbol}${(data.total_cost || 0).toFixed(2)}`;
    document.getElementById('avgDuration').textContent = `${data.avg_duration || 0} min`;

    // Update cost breakdown
    document.getElementById('totalFuelCost').textContent = `${symbol}${(data.total_fuel_cost || 0).toFixed(2)}`;
    document.getElementById('totalTollCost').textContent = `${symbol}${(data.total_toll_cost || 0).toFixed(2)}`;
    document.getElementById('totalCAZCost').textContent = `${symbol}${(data.total_caz_cost || 0).toFixed(2)}`;

    // Update time statistics
    const totalHours = Math.floor((data.total_time_minutes || 0) / 60);
    const totalMinutes = (data.total_time_minutes || 0) % 60;
    document.getElementById('totalTime').textContent = `${totalHours}h ${totalMinutes}m`;
    document.getElementById('avgSpeed').textContent = `${(data.avg_speed || 0).toFixed(1)} ${distUnit === 'km' ? 'km/h' : 'mph'}`;

    // Display most frequent routes
    const frequentRoutesList = document.getElementById('frequentRoutesList');
    if (data.frequent_routes && data.frequent_routes.length > 0) {
        frequentRoutesList.innerHTML = data.frequent_routes.map((route, idx) => `
            <div style="background: white; padding: 10px; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #FF5722;">
                <div style="font-weight: 500; font-size: 13px; margin-bottom: 4px;">${idx + 1}. ${route.start} → ${route.end}</div>
                <div style="font-size: 12px; color: #666;">
                    <span>🔄 ${route.count} trips</span> |
                    <span>📏 ${convertDistance(route.avg_distance)} ${distUnit}</span> |
                    <span>💰 ${symbol}${route.avg_cost.toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    } else {
        frequentRoutesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No trip history yet</div>';
    }
}

// ===== ADVANCED ROUTE PREFERENCES FUNCTIONS =====
/**
 * saveRoutePreferences function
 * @function saveRoutePreferences
 * @returns {*} Return value description
 */
function saveRoutePreferences() {
    const preferences = {
        avoidHighways: document.getElementById('avoidHighways').checked,
        preferScenic: document.getElementById('preferScenic').checked,
        avoidTolls: localStorage.getItem('pref_tolls') === 'true',
        avoidCAZ: localStorage.getItem('pref_caz') === 'true',
        preferQuiet: document.getElementById('preferQuiet').checked,
        avoidUnpaved: document.getElementById('avoidUnpaved').checked,
        routeOptimization: document.getElementById('routeOptimization').value,
        maxDetour: parseInt(document.getElementById('maxDetour').value)
    };

    localStorage.setItem('routePreferences', JSON.stringify(preferences));
    saveAllSettings();
    showStatus('Route preferences saved!', 'success');
}

/**
 * loadRoutePreferences function
 * @function loadRoutePreferences
 * @returns {*} Return value description
 */
function loadRoutePreferences() {
    const saved = localStorage.getItem('routePreferences');
    if (saved) {
        const preferences = JSON.parse(saved);
        document.getElementById('avoidHighways').checked = preferences.avoidHighways || false;
        document.getElementById('preferScenic').checked = preferences.preferScenic || false;
        // Note: avoidTolls and avoidCAZ are toggle-switch buttons, not checkboxes
        // They are managed by togglePreference() and stored in localStorage as pref_tolls and pref_caz
        document.getElementById('preferQuiet').checked = preferences.preferQuiet || false;
        document.getElementById('avoidUnpaved').checked = preferences.avoidUnpaved || false;
        document.getElementById('routeOptimization').value = preferences.routeOptimization || 'fastest';
        document.getElementById('maxDetour').value = preferences.maxDetour || 20;
        updateDetourLabel();
    }
}

/**
 * updateDetourLabel function
 * @function updateDetourLabel
 * @returns {*} Return value description
 */
function updateDetourLabel() {
    const value = document.getElementById('maxDetour').value;
    document.getElementById('detourLabel').textContent = value + '%';
    saveRoutePreferences();
}

/**
 * getRoutePreferences function
 * @function getRoutePreferences
 * @returns {*} Return value description
 */
function getRoutePreferences() {
    const saved = localStorage.getItem('routePreferences');
    if (saved) {
        return JSON.parse(saved);
    }
    return {
        avoidHighways: false,
        preferScenic: false,
        avoidTolls: false,
        avoidCAZ: false,
        preferQuiet: false,
        avoidUnpaved: false,
        routeOptimization: 'fastest',
        maxDetour: 20
    };
}

/**
 * recalculateRouteWithPreferences function
 * @function recalculateRouteWithPreferences
 * @returns {*} Return value description
 */
function recalculateRouteWithPreferences() {
    // Check if there's an active route to recalculate
    if (!window.lastCalculatedRoute || !window.lastCalculatedRoute.destination) {
        showStatus('No active route to recalculate. Please calculate a route first.', 'error');
        return;
    }

    // Save current preferences
    saveRoutePreferences();

    // Show loading status
    showStatus('🔄 Recalculating route with new preferences...', 'loading');

    // Switch back to navigation tab to show results
    switchTab('navigation');

    // Trigger route calculation with current start/end locations
    setTimeout(() => {
        calculateRoute();
    }, 300);
}

// ===== ROUTE SAVING FUNCTIONS =====
/**
 * saveCurrentRoute function
 * @function saveCurrentRoute
 * @returns {*} Return value description
 */
function saveCurrentRoute() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const routeName = document.getElementById('routeName').value.trim();
    if (!routeName) {
        showStatus('Please enter a route name', 'error');
        return;
    }

    const route = window.lastCalculatedRoute;
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    const savedRoute = {
        id: Date.now(),
        name: routeName,
        start: startInput,
        end: endInput,
        distance_km: route.distance_km,
        duration_minutes: route.time,
        fuel_cost: route.fuel_cost,
        toll_cost: route.toll_cost,
        caz_cost: route.caz_cost,
        geometry: route.geometry,
        timestamp: new Date().toISOString()
    };

    // Get existing saved routes
    let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    savedRoutes.push(savedRoute);
    localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));

    document.getElementById('routeName').value = '';
    showStatus(`Route "${routeName}" saved!`, 'success');
    loadSavedRoutes();
}

/**
 * loadSavedRoutes function
 * @function loadSavedRoutes
 * @returns {*} Return value description
 */
function loadSavedRoutes() {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    const savedRoutesList = document.getElementById('savedRoutesList');

    if (savedRoutes.length === 0) {
        savedRoutesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No saved routes yet</div>';
        return;
    }

    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    savedRoutesList.innerHTML = savedRoutes.map(route => `
        <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #E91E63;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div>
                    <div style="font-weight: 500; font-size: 14px;">${route.name}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 4px;">📍 ${route.start} → ${route.end}</div>
                </div>
                <button onclick="deleteSavedRoute(${route.id})" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">✕</button>
            </div>
            <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                📏 ${convertDistance(route.distance_km)} ${distUnit} | ⏱️ ${route.duration_minutes} | 💰 ${symbol}${(parseFloat(route.fuel_cost || 0) + parseFloat(route.toll_cost || 0) + parseFloat(route.caz_cost || 0)).toFixed(2)}
            </div>
            <button onclick="useSavedRoute(${route.id})" style="width: 100%; background: #E91E63; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 13px;">🚀 Use This Route</button>
        </div>
    `).join('');
}
/**
 * useSavedRoute function
 * @function useSavedRoute
 * @param {*} routeId - Parameter description
 * @returns {*} Return value description
 */
function useSavedRoute(routeId) {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    const route = savedRoutes.find(r => r.id === routeId);

    if (route) {
        document.getElementById('start').value = route.start;
        document.getElementById('end').value = route.end;
        window.lastCalculatedRoute = {
            distance_km: route.distance_km,
            time: route.duration_minutes,
            fuel_cost: route.fuel_cost,
            toll_cost: route.toll_cost,
            caz_cost: route.caz_cost,
            geometry: route.geometry
        };
        showStatus(`Loaded route: ${route.name}`, 'success');
        switchTab('navigation');
    }
}
/**
 * deleteSavedRoute function
 * @function deleteSavedRoute
 * @param {*} routeId - Parameter description
 * @returns {*} Return value description
 */
function deleteSavedRoute(routeId) {
    if (confirm('Delete this saved route?')) {
        let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
        savedRoutes = savedRoutes.filter(r => r.id !== routeId);
        localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
        showStatus('Route deleted', 'success');
        loadSavedRoutes();
    }
}

// ===== REAL-TIME TRAFFIC UPDATE FUNCTIONS =====
/**
 * updateTrafficConditions function
 * @function updateTrafficConditions
 * @returns {*} Return value description
 */
function updateTrafficConditions() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;

    showStatus('Checking traffic conditions...', 'info');

    // Fetch traffic data from backend
    fetch('/api/traffic-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start: startInput,
            end: endInput
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayTrafficUpdate(data);
        } else {
            showStatus('Could not fetch traffic data', 'error');
        }
    })
    .catch(error => {
        console.error('Traffic update error:', error);
        showStatus('Error updating traffic conditions', 'error');
    });
}
/**
 * displayTrafficUpdate function
 * @function displayTrafficUpdate
 * @param {*} data - Parameter description
 * @returns {*} Return value description
 */
function displayTrafficUpdate(data) {
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    // Update traffic status
    const trafficStatus = document.getElementById('trafficStatus');
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    trafficStatus.textContent = `Last updated: ${timeStr} | Conditions: ${data.traffic_level}`;

    // Update route information if traffic has changed
    if (data.updated_duration_minutes !== window.lastCalculatedRoute.time) {
        const oldTime = parseInt(window.lastCalculatedRoute.time);
        const newTime = data.updated_duration_minutes;
        const timeDiff = newTime - oldTime;
        const timeDiffStr = timeDiff > 0 ? `+${timeDiff}` : `${timeDiff}`;

        showStatus(`Traffic update: Duration changed from ${oldTime} to ${newTime} min (${timeDiffStr} min)`, 'warning');

        // Update route data
        window.lastCalculatedRoute.time = newTime;
        window.lastCalculatedRoute.traffic_level = data.traffic_level;
        window.lastCalculatedRoute.updated_at = new Date().toISOString();

        // Recalculate costs if distance changed
        if (data.updated_distance_km) {
            window.lastCalculatedRoute.distance_km = data.updated_distance_km;
        }
    } else {
        showStatus(`Traffic conditions: ${data.traffic_level}`, 'success');
    }

    // Display traffic details
    const trafficDetails = `
        🚦 Traffic Level: ${data.traffic_level}
        📏 Distance: ${convertDistance(data.updated_distance_km || window.lastCalculatedRoute.distance_km)} ${distUnit}
        ⏱️ Duration: ${data.updated_duration_minutes} minutes
        🚗 Congestion: ${data.congestion_percentage}%
        ⚠️ Incidents: ${data.incidents_count}
    `;

    console.log('Traffic Update:', trafficDetails);
}

// Auto-update traffic every 5 minutes during navigation
/**
 * startTrafficMonitoring function
 * @function startTrafficMonitoring
 * @returns {*} Return value description
 */
function startTrafficMonitoring() {
    if (window.trafficMonitoringInterval) {
        clearInterval(window.trafficMonitoringInterval);
    }

    window.trafficMonitoringInterval = setInterval(() => {
        if (window.lastCalculatedRoute && document.getElementById('start').value) {
            updateTrafficConditions();
        }
    }, 5 * 60 * 1000); // Update every 5 minutes

    showStatus('Traffic monitoring started', 'success');
}

/**
 * stopTrafficMonitoring function
 * @function stopTrafficMonitoring
 * @returns {*} Return value description
 */
function stopTrafficMonitoring() {
    if (window.trafficMonitoringInterval) {
        clearInterval(window.trafficMonitoringInterval);
        window.trafficMonitoringInterval = null;
        showStatus('Traffic monitoring stopped', 'info');
    }
}

/**
 * setupMapClickHandler function
 * @function setupMapClickHandler
 * @returns {void}
 */
function setupMapClickHandler() {
    if (!map) {
        console.log('[Map] Map not initialized yet, deferring click handler setup');
        return;
    }

    // Map click handler for location picker
    map.on('click', (e) => {
        if (mapPickerMode) {
            const lat = e.latlng.lat;
            const lon = e.latlng.lng;
            document.getElementById(mapPickerMode).value = `${lat},${lon}`;

            // Add marker
            if (mapPickerMode === 'start' && startMarker) map.removeLayer(startMarker);
            if (mapPickerMode === 'end' && endMarker) map.removeLayer(endMarker);

            const marker = L.circleMarker([lat, lon], {
                radius: 8,
                fillColor: mapPickerMode === 'start' ? '#00ff00' : '#ff0000',
                color: '#000',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);

            if (mapPickerMode === 'start') {
                startMarker = marker;
            } else {
                endMarker = marker;
            }

            mapPickerMode = null;
            showStatus('Location selected!', 'success');
            collapseBottomSheet();
        }
    });
}

// Decode polyline (for OSRM format)
/**
 * decodePolyline function
 * @function decodePolyline
 * @param {*} encoded - Parameter description
 * @returns {*} Return value description
 */
function decodePolyline(encoded) {
    if (!encoded) return [];
    const inv = 1.0 / 1e5;
    const decoded = [];
    let previous = [0, 0];
    let i = 0;

    while (i < encoded.length) {
        let ll = [0, 0];
        for (let j = 0; j < 2; j++) {
            let shift = 0;
            let result = 0;
            let byte = 0;
            do {
                byte = encoded.charCodeAt(i++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            ll[j] = previous[j] + (result & 1 ? ~(result >> 1) : result >> 1);
            previous[j] = ll[j];
        }
        decoded.push([ll[0] * inv, ll[1] * inv]);
    }
    return decoded;
}
/**
 * showStatus function
 * @function showStatus
 * @param {*} message - Parameter description
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
}

async function calculateRoute() {
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');

    if (!startInput || !endInput) {
        showStatus('Error: Input fields not found', 'error');
        return;
    }

    const start = startInput.value ? startInput.value.trim() : '';
    const end = endInput.value ? endInput.value.trim() : '';

    if (!start || !end) {
        showStatus('Please enter both start and end locations', 'error');
        return;
    }

    // Prevent multiple simultaneous geocoding requests
    if (isGeocoding) {
        showStatus('⏳ Geocoding in progress...', 'loading');
        return;
    }

    // Geocode locations if needed
    let geocodedResult = await geocodeLocations(start, end);
    if (!geocodedResult) {
        return; // Error already shown by geocodeLocations
    }

    const geocodedStart = geocodedResult.start;
    const geocodedEnd = geocodedResult.end;

    showStatus('📍 Calculating route...', 'loading');

    fetch('/api/route', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            start: geocodedStart,
            end: geocodedEnd,
            routing_mode: currentRoutingMode,
            vehicle_type: currentVehicleType
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Parse coordinates
            try {
                const startParts = geocodedStart.split(',');
                const endParts = geocodedEnd.split(',');

                if (startParts.length < 2 || endParts.length < 2) {
                    showStatus('Error: Invalid coordinates format', 'error');
                    return;
                }

                const startCoords = [parseFloat(startParts[0].trim()), parseFloat(startParts[1].trim())];
                const endCoords = [parseFloat(endParts[0].trim()), parseFloat(endParts[1].trim())];

                if (isNaN(startCoords[0]) || isNaN(startCoords[1]) || isNaN(endCoords[0]) || isNaN(endCoords[1])) {
                    showStatus('Error: Invalid coordinates', 'error');
                    return;
                }

                // Clear previous markers and route
                if (startMarker) map.removeLayer(startMarker);
                if (endMarker) map.removeLayer(endMarker);
                if (routeLayer) map.removeLayer(routeLayer);

                // Add markers
                startMarker = L.circleMarker([startCoords[0], startCoords[1]], {
                    radius: 8,
                    fillColor: '#00ff00',
                    color: '#000',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map).bindPopup('Start Location');

                endMarker = L.circleMarker([endCoords[0], endCoords[1]], {
                    radius: 8,
                    fillColor: '#ff0000',
                    color: '#000',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map).bindPopup('End Location');

                // Draw route line
                let routePath = [[startCoords[0], startCoords[1]], [endCoords[0], endCoords[1]]];

                // If we have geometry from the routing service, use it
                if (data.geometry) {
                    try {
                        // Decode polyline geometry
                        routePath = decodePolyline(data.geometry);
                        console.log('Route path decoded:', routePath.length, 'points');
                    } catch (e) {
                        console.log('Could not decode geometry, using straight line:', e);
                    }
                }

                routeLayer = L.polyline(routePath, {
                    color: '#667eea',
                    weight: 4,
                    opacity: 0.8
                }).addTo(map);

                // Fit map to route with smooth animation
                const bounds = routeLayer.getBounds().pad(0.1);
                const center = bounds.getCenter();
                const zoomLevel = map.getBoundsZoom(bounds);

                // Use smooth animation to fit route
                map.flyTo(center, zoomLevel, {
                    duration: ZOOM_ANIMATION_DURATION,
                    easeLinearity: 0.25
                });

                lastZoomLevel = zoomLevel;

                // Update info
                updateTripInfo(data.distance, data.time, data.fuel_cost || '-', data.toll_cost || '-');
                showStatus('Route calculated successfully! (' + data.source + ')', 'success');

                // Store route data for navigation (including destination for rerouting)
                window.lastCalculatedRoute = {
                    ...data,
                    destination: end  // Store destination for automatic rerouting
                };

                // Show route preview instead of auto-starting navigation
                setTimeout(() => {
                    showRoutePreview(data);
                }, 300);

                // Use real routes from backend if available, otherwise use main route
                if (data.routes && data.routes.length > 0) {
                    // Real routes from routing engine
                    routeOptions = data.routes.map(route => ({
                        id: route.id,
                        name: route.name,
                        distance_km: route.distance_km,
                        duration_minutes: route.duration_minutes,
                        fuel_cost: route.fuel_cost,
                        toll_cost: route.toll_cost,
                        caz_cost: route.caz_cost,
                        polyline: decodePolyline(route.geometry || ''),
                        geometry: route.geometry
                    }));
                    console.log(`[Route Comparison] Loaded ${routeOptions.length} real routes from ${data.source}`);
                } else {
                    // Fallback: single route (for backward compatibility)
                    routeOptions = [
                        {
                            id: 1,
                            name: 'Route',
                            distance_km: parseFloat(data.distance) || 0,
                            duration_minutes: parseInt(data.time) || 0,
                            fuel_cost: data.fuel_cost || 0,
                            toll_cost: data.toll_cost || 0,
                            caz_cost: data.caz_cost || 0,
                            polyline: routePath,
                            geometry: data.geometry
                        }
                    ];
                    console.log('[Route Comparison] Using single route (fallback)');
                }

                // Sort by preference
                sortRoutesByPreference();

                // Show start navigation buttons (both in FAB and in bottom sheet)
                const startNavBtn = document.getElementById('startNavBtn');
                const startNavBtnSheet = document.getElementById('startNavBtnSheet');
                if (startNavBtn) {
                    startNavBtn.style.display = 'block';
                }
                if (startNavBtnSheet) {
                    startNavBtnSheet.style.display = 'block';
                }

                // Send notification with proper unit conversion
                const distanceKm = parseFloat(data.distance_km || data.distance) || 0;
                const distUnit = getDistanceUnit();
                const displayDistance = convertDistance(distanceKm);
                const notificationMessage = `${displayDistance} ${distUnit} in ${data.time}. Ready to navigate?`;
                console.log('[Route] Route ready notification:', notificationMessage);
                sendNotification('Route Ready', notificationMessage, 'success');
            } catch (e) {
                showStatus('Error parsing coordinates: ' + e.message, 'error');
                console.error('Coordinate parsing error:', e);
            }
        } else {
            showStatus('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showStatus('Error: ' + error.message, 'error');
    });
}

/**
 * startNavigation function
 * @function startNavigation
 * @returns {*} Return value description
 */
function startNavigation() {
    if (!window.lastCalculatedRoute) {
        showStatus('Please calculate a route first', 'error');
        return;
    }
    startTurnByTurnNavigation(window.lastCalculatedRoute);
    document.getElementById('startNavBtn').style.display = 'none';
    const startNavBtnSheet = document.getElementById('startNavBtnSheet');
    if (startNavBtnSheet) {
        startNavBtnSheet.style.display = 'none';
    }
}

// ===== ROUTE PREVIEW FEATURE =====
/**
 * showRoutePreview function
 * @function showRoutePreview
 * @param {*} routeData - Parameter description
 * @returns {*} Return value description
 */
function showRoutePreview(routeData) {
    if (!routeData) {
        showStatus('No route data available', 'error');
        return;
    }

    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();
    const speedUnit = getSpeedUnit();

    // Update route preview information
    // Use distance_km from routes array if available, otherwise parse from distance string
    let distanceKm = 0;
    if (routeData.routes && routeData.routes.length > 0) {
        distanceKm = routeData.routes[0].distance_km || 0;
    } else if (routeData.distance_km) {
        distanceKm = routeData.distance_km;
    } else if (routeData.distance) {
        // Parse distance string like "1.31 km" to extract number
        distanceKm = parseFloat(routeData.distance) || 0;
    }

    // Store distance_km in data attribute for unit conversion updates
    const previewDistanceEl = document.getElementById('previewDistance');
    if (previewDistanceEl) {
        previewDistanceEl.dataset.km = distanceKm;
        previewDistanceEl.textContent = convertDistance(distanceKm) + ' ' + distUnit;
    }
    document.getElementById('previewDuration').textContent = (routeData.time || routeData.duration_minutes || 0) + ' min';

    // Build route description
    const startInput = document.getElementById('start').value;
    const endInput = document.getElementById('end').value;
    document.getElementById('previewRoute').textContent = `${startInput} → ${endInput}`;

    // Update cost breakdown with unit conversion
    const fuelCost = parseFloat(routeData.fuel_cost || 0);
    const tollCost = parseFloat(routeData.toll_cost || 0);
    const cazCost = parseFloat(routeData.caz_cost || 0);

    // Adjust costs for imperial units if needed
    const adjustedFuelCost = distanceUnit === 'mi' ? fuelCost * 1.60934 : fuelCost;
    const adjustedTollCost = distanceUnit === 'mi' ? tollCost * 1.60934 : tollCost;
    const adjustedCazCost = distanceUnit === 'mi' ? cazCost * 1.60934 : cazCost;
    const totalCost = adjustedFuelCost + adjustedTollCost + adjustedCazCost;

    document.getElementById('previewFuelCost').textContent = symbol + adjustedFuelCost.toFixed(2);
    document.getElementById('previewTollCost').textContent = symbol + adjustedTollCost.toFixed(2);
    document.getElementById('previewCAZCost').textContent = symbol + adjustedCazCost.toFixed(2);
    document.getElementById('previewTotalCost').textContent = symbol + totalCost.toFixed(2);

    console.log('[Cost] Route preview costs adjusted for unit preference:', {
        distanceUnit: distanceUnit,
        fuelCost: adjustedFuelCost.toFixed(2),
        tollCost: adjustedTollCost.toFixed(2),
        cazCost: adjustedCazCost.toFixed(2),
        totalCost: totalCost.toFixed(2)
    });

    // Update route details
    document.getElementById('previewRoutingEngine').textContent = routeData.source || 'Unknown';
    document.getElementById('previewRoutingMode').textContent = currentRoutingMode.charAt(0).toUpperCase() + currentRoutingMode.slice(1);
    document.getElementById('previewVehicleType').textContent = currentVehicleType.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Show alternative routes if available
    if (routeOptions && routeOptions.length > 1) {
        showAlternativeRoutesInPreview();
    } else {
        document.getElementById('previewAlternativeRoutesContainer').style.display = 'none';
    }

    // Switch to route preview tab
    switchTab('routePreview');

    // Expand bottom sheet to show preview
    expandBottomSheet();

    showStatus('📍 Review your route before starting navigation', 'success');
}

/**
 * showAlternativeRoutesInPreview function
 * @function showAlternativeRoutesInPreview
 * @returns {*} Return value description
 */
function showAlternativeRoutesInPreview() {
    const container = document.getElementById('previewAlternativeRoutesList');
    const parentContainer = document.getElementById('previewAlternativeRoutesContainer');

    if (!routeOptions || routeOptions.length <= 1) {
        parentContainer.style.display = 'none';
        return;
    }

    container.innerHTML = '';
    const symbol = getCurrencySymbol();
    const distUnit = getDistanceUnit();

    routeOptions.forEach((route, index) => {
        // Adjust costs for imperial units if needed
        const fuelCost = parseFloat(route.fuel_cost || 0);
        const tollCost = parseFloat(route.toll_cost || 0);
        const cazCost = parseFloat(route.caz_cost || 0);
        const adjustedFuelCost = distanceUnit === 'mi' ? fuelCost * 1.60934 : fuelCost;
        const adjustedTollCost = distanceUnit === 'mi' ? tollCost * 1.60934 : tollCost;
        const adjustedCazCost = distanceUnit === 'mi' ? cazCost * 1.60934 : cazCost;
        const totalCost = (adjustedFuelCost + adjustedTollCost + adjustedCazCost).toFixed(2);
        const div = document.createElement('div');
        div.style.cssText = 'background: white; padding: 10px; border-radius: 6px; margin-bottom: 8px; border: 2px solid #ddd; cursor: pointer; transition: all 0.3s ease;';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="color: #333;">Route ${index + 1}</strong>
                <span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">${convertDistance(route.distance_km)} ${distUnit}</span>
            </div>
            <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
                ⏱️ ${route.duration_minutes} min | 💰 ${symbol}${totalCost}
            </div>
        `;
        div.onmouseover = () => div.style.borderColor = '#667eea';
        div.onmouseout = () => div.style.borderColor = '#ddd';
        div.onclick = () => {
            useRoute(index);
            showRoutePreview(routeOptions[index]);
        };
        container.appendChild(div);
    });

    parentContainer.style.display = 'block';
}

async function showRouteComparison() {
    if (!routeOptions || routeOptions.length < 2) {
        showStatus('Need at least 2 routes to compare', 'error');
        return;
    }

    try {
        // Prepare routes data for comparison
        const routesForComparison = routeOptions.map(route => ({
            distance_km: route.distance_km || 0,
            duration_minutes: route.duration_minutes || 0,
            fuel_cost: route.fuel_cost || 0,
            toll_cost: route.toll_cost || 0,
            caz_cost: route.caz_cost || 0
        }));

        // Call comparison API
        const response = await fetch('/api/route-comparison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routes: routesForComparison })
        });

        const data = await response.json();
        if (!data.success) {
            showStatus('Error comparing routes: ' + data.error, 'error');
            return;
        }

        const comparison = data.comparison;
        const symbol = getCurrencySymbol();
        const distUnit = getDistanceUnit();

        // Create comparison table
        let comparisonHTML = '<div style="overflow-x: auto; margin: 10px 0;">';
        comparisonHTML += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
        comparisonHTML += '<thead><tr style="background: #667eea; color: white;">';
        comparisonHTML += '<th style="padding: 8px; text-align: left;">Route</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Distance</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Time</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Cost</th>';
        comparisonHTML += '<th style="padding: 8px; text-align: center;">Cost/km</th>';
        comparisonHTML += '</tr></thead><tbody>';

        comparison.routes.forEach((route, idx) => {
            const bgColor = idx % 2 === 0 ? '#f9f9f9' : '#fff';
            comparisonHTML += `<tr style="background: ${bgColor}; border-bottom: 1px solid #ddd;">`;
            comparisonHTML += `<td style="padding: 8px;"><strong>Route ${route.route_id}</strong></td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;">${convertDistance(route.distance_km)} ${distUnit}</td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;">${Math.round(route.duration_minutes)} min</td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;"><strong>${symbol}${route.total_cost.toFixed(2)}</strong></td>`;
            comparisonHTML += `<td style="padding: 8px; text-align: center;">${symbol}${route.cost_per_km.toFixed(2)}</td>`;
            comparisonHTML += '</tr>';
        });

        comparisonHTML += '</tbody></table></div>';

        // Add recommendations
        comparisonHTML += '<div style="margin-top: 15px; padding: 10px; background: #f0f4ff; border-radius: 6px;">';
        comparisonHTML += '<strong style="color: #667eea;">💡 Recommendations:</strong><br>';

        const rec = comparison.recommendations;
        comparisonHTML += `<div style="margin-top: 8px; font-size: 12px;">`;
        comparisonHTML += `<div style="margin-bottom: 6px;">💰 <strong>Cheapest:</strong> Route ${rec.cheapest.route_id} - ${rec.cheapest.reason}</div>`;
        comparisonHTML += `<div style="margin-bottom: 6px;">⚡ <strong>Fastest:</strong> Route ${rec.fastest.route_id} - ${rec.fastest.reason}</div>`;
        comparisonHTML += `<div>📍 <strong>Shortest:</strong> Route ${rec.shortest.route_id} - ${rec.shortest.reason}</div>`;
        comparisonHTML += '</div></div>';

        // Display in a modal or alert
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 12px; max-width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; color: #333;">Route Comparison</h3>
                    <button onclick="this.closest('div').parentElement.remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">×</button>
                </div>
                ${comparisonHTML}
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                    <button onclick="this.closest('div').parentElement.remove()" style="flex: 1; padding: 10px; background: #ddd; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        showStatus('📊 Route comparison displayed', 'success');
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        console.error('[Comparison] Error:', error);
    }
}

/**
 * overviewRoute function
 * @function overviewRoute
 * @returns {*} Return value description
 */
function overviewRoute() {
    if (!routePath || routePath.length === 0) {
        showStatus('No route to overview', 'error');
        return;
    }

    try {
        // Calculate bounds from route polyline
        let minLat = routePath[0][0];
        let maxLat = routePath[0][0];
        let minLon = routePath[0][1];
        let maxLon = routePath[0][1];

        routePath.forEach(point => {
            minLat = Math.min(minLat, point[0]);
            maxLat = Math.max(maxLat, point[0]);
            minLon = Math.min(minLon, point[1]);
            maxLon = Math.max(maxLon, point[1]);
        });

        // Create bounds object for Leaflet
        const bounds = [[minLat, minLon], [maxLat, maxLon]];

        // Fit map to bounds with padding
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

        showStatus('📍 Route overview - pan and zoom to inspect', 'success');
        console.log('[Route] Overview fitted bounds:', bounds);
    } catch (error) {
        showStatus('Error displaying route overview: ' + error.message, 'error');
        console.error('[Route] Overview error:', error);
    }
}

/**
 * startNavigationFromPreview function
 * @function startNavigationFromPreview
 * @returns {*} Return value description
 */
function startNavigationFromPreview() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route available', 'error');
        return;
    }

    // Hide the start navigation buttons
    const startNavBtn = document.getElementById('startNavBtn');
    const startNavBtnSheet = document.getElementById('startNavBtnSheet');
    if (startNavBtn) startNavBtn.style.display = 'none';
    if (startNavBtnSheet) startNavBtnSheet.style.display = 'none';

    // Start turn-by-turn navigation
    startTurnByTurnNavigation(window.lastCalculatedRoute);

    // Collapse bottom sheet to show full map
    collapseBottomSheet();
}

// ===== PARKING INTEGRATION FEATURE =====

let parkingMarkers = [];
let selectedParking = null;
let parkingWalkingRoute = null;
let parkingDrivingRoute = null;

/**
 * saveParkingPreferences function
 * @function saveParkingPreferences
 * @returns {*} Return value description
 */
function saveParkingPreferences() {
    const prefs = {
        maxWalkingDistance: document.getElementById('parkingMaxWalkingDistance').value,
        preferredType: document.getElementById('parkingPreferredType').value,
        pricePreference: document.getElementById('parkingPricePreference').value
    };
    localStorage.setItem('parkingPreferences', JSON.stringify(prefs));
    saveAllSettings();
    console.log('[Parking] Preferences saved:', prefs);
}

/**
 * loadParkingPreferences function
 * @function loadParkingPreferences
 * @returns {*} Return value description
 */
function loadParkingPreferences() {
    try {
        const saved = localStorage.getItem('parkingPreferences');
        if (saved) {
            const prefs = JSON.parse(saved);
            document.getElementById('parkingMaxWalkingDistance').value = prefs.maxWalkingDistance || '10';
            document.getElementById('parkingPreferredType').value = prefs.preferredType || 'any';
            document.getElementById('parkingPricePreference').value = prefs.pricePreference || 'any';
            console.log('[Parking] Preferences loaded:', prefs);
        }
    } catch (e) {
        console.log('[Parking] Error loading preferences:', e);
    }
}

/**
 * saveVoicePreferences function
 * @function saveVoicePreferences
 * @returns {*} Return value description
 */
function saveVoicePreferences() {
    const prefs = {
        turnDistance1: parseInt(document.getElementById('voiceTurnDistance1').value),
        turnDistance2: parseInt(document.getElementById('voiceTurnDistance2').value),
        turnDistance3: parseInt(document.getElementById('voiceTurnDistance3').value),
        hazardDistance: parseInt(document.getElementById('voiceHazardDistance').value),
        announcementsEnabled: document.getElementById('voiceAnnouncementsEnabled').checked
    };
    localStorage.setItem('voicePreferences', JSON.stringify(prefs));

    // Update global announcement distance arrays
    TURN_ANNOUNCEMENT_DISTANCES.length = 0;
    TURN_ANNOUNCEMENT_DISTANCES.push(prefs.turnDistance1, prefs.turnDistance2, prefs.turnDistance3, 50);
    DESTINATION_ANNOUNCEMENT_DISTANCES.length = 0;
    DESTINATION_ANNOUNCEMENT_DISTANCES.push(10000, 5000, 2000, 1000, 500, 100);
    HAZARD_WARNING_DISTANCE = prefs.hazardDistance;
    voiceRecognition = prefs.announcementsEnabled;

    console.log('[Voice] Preferences saved:', prefs);
    showStatus('✅ Voice preferences updated', 'success');
}

/**
 * loadVoicePreferences function
 * @function loadVoicePreferences
 * @returns {*} Return value description
 */
function loadVoicePreferences() {
    try {
        const saved = localStorage.getItem('voicePreferences');
        if (saved) {
            const prefs = JSON.parse(saved);
            document.getElementById('voiceTurnDistance1').value = prefs.turnDistance1 || 500;
            document.getElementById('voiceTurnDistance2').value = prefs.turnDistance2 || 200;
            document.getElementById('voiceTurnDistance3').value = prefs.turnDistance3 || 100;
            document.getElementById('voiceHazardDistance').value = prefs.hazardDistance || 500;

            // FIXED: Properly set toggle button state with active class
            const toggleButton = document.getElementById('voiceAnnouncementsEnabled');
            const announcementsEnabled = prefs.announcementsEnabled !== false;

            if (announcementsEnabled) {
                toggleButton.classList.add('active');
                toggleButton.style.background = '#4CAF50';
                toggleButton.style.borderColor = '#4CAF50';
            } else {
                toggleButton.classList.remove('active');
                toggleButton.style.background = '#ddd';
                toggleButton.style.borderColor = '#999';
            }

            // Update global arrays
            TURN_ANNOUNCEMENT_DISTANCES.length = 0;
            TURN_ANNOUNCEMENT_DISTANCES.push(prefs.turnDistance1, prefs.turnDistance2, prefs.turnDistance3, 50);
            HAZARD_WARNING_DISTANCE = prefs.hazardDistance || 500;
            // FIXED: Update the new boolean flag instead of voiceRecognition object
            voiceAnnouncementsEnabled = announcementsEnabled;

            console.log('[Voice] Preferences loaded:', prefs);
        } else {
            // Initialize with defaults if no saved preferences
            const toggleButton = document.getElementById('voiceAnnouncementsEnabled');
            if (toggleButton) {
                toggleButton.classList.add('active');
                toggleButton.style.background = '#4CAF50';
                toggleButton.style.borderColor = '#4CAF50';
                voiceRecognition = true;
            }
            console.log('[Voice] No saved preferences, using defaults');
        }
    } catch (e) {
        console.log('[Voice] Error loading preferences:', e);
    }
}

/**
 * toggleVoiceAnnouncements function
 * @function toggleVoiceAnnouncements
 * @returns {*} Return value description
 */
function toggleVoiceAnnouncements() {
    const button = document.getElementById('voiceAnnouncementsEnabled');

    // Toggle the active class (like other toggle switches)
    button.classList.toggle('active');
    const enabled = button.classList.contains('active');

    // Update visual state
    if (enabled) {
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }

    // Save to localStorage
    localStorage.setItem('voiceAnnouncementsEnabled', enabled ? 'true' : 'false');

    // FIXED: Update the new boolean flag instead of voiceRecognition object
    voiceAnnouncementsEnabled = enabled;
    saveVoicePreferences();
    showStatus(enabled ? '🔊 Voice announcements enabled' : '🔇 Voice announcements disabled', 'success');
    saveAllSettings();
}

async function findParkingNearDestination() {
    if (!window.lastCalculatedRoute) {
        showStatus('No route calculated yet', 'error');
        return;
    }

    const endInput = document.getElementById('end').value;
    if (!endInput) {
        showStatus('Please enter a destination first', 'error');
        return;
    }

    showStatus('🔍 Searching for parking near destination...', 'loading');

    try {
        // Get destination coordinates from last route
        const endCoords = window.lastCalculatedRoute.end_lat && window.lastCalculatedRoute.end_lon
            ? { lat: window.lastCalculatedRoute.end_lat, lon: window.lastCalculatedRoute.end_lon }
            : null;

        if (!endCoords) {
            showStatus('Could not determine destination coordinates', 'error');
            return;
        }

        // Get parking preferences
        const maxWalkingDist = parseInt(document.getElementById('parkingMaxWalkingDistance').value) || 10;
        const radiusMeters = maxWalkingDist * 80; // Approximate: 1 min walk ≈ 80m

        // Search for parking
        const response = await fetch('/api/parking-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: endCoords.lat,
                lon: endCoords.lon,
                radius: radiusMeters,
                type: document.getElementById('parkingPreferredType').value
            })
        });

        const data = await response.json();

        if (!data.success || !data.parking || data.parking.length === 0) {
            showStatus('No parking found nearby. Try adjusting your search radius.', 'warning');
            return;
        }

        // Display parking options
        displayParkingOptions(data.parking, endCoords);
        showStatus(`✅ Found ${data.parking.length} parking options`, 'success');

    } catch (error) {
        console.error('[Parking] Error:', error);
        showStatus('Error searching for parking: ' + error.message, 'error');
    }
}
/**
 * displayParkingOptions function
 * @function displayParkingOptions
 * @param {*} parkingList - Parameter description
 * @param {*} destinationCoords - Parameter description
 * @returns {*} Return value description
 */
function displayParkingOptions(parkingList, destinationCoords) {
    // Clear previous markers
    parkingMarkers.forEach(marker => map.removeLayer(marker));
    parkingMarkers = [];

    const parkingSection = document.getElementById('parkingSection');
    const parkingListDiv = document.getElementById('parkingList');
    parkingListDiv.innerHTML = '';

    // Sort by distance
    parkingList.sort((a, b) => a.distance_m - b.distance_m);

    // Display top 5 parking options
    parkingList.slice(0, 5).forEach((parking, index) => {
        // Add marker to map
        const icon = L.divIcon({
            html: `<div style="background: #FF9800; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🅿️</div>`,
            iconSize: [32, 32],
            className: 'parking-marker'
        });

        const marker = L.marker([parking.lat, parking.lon], { icon })
            .bindPopup(`<strong>${parking.name}</strong><br>Distance: ${(parking.distance_m / 1000).toFixed(2)} km`)
            .addTo(map);

        marker.parkingData = parking;
        marker.on('click', () => selectParking(parking, destinationCoords));
        parkingMarkers.push(marker);

        // Add to list
        const walkingTime = Math.round(parking.distance_m / 1.4); // 1.4 m/s walking speed
        const walkingMinutes = Math.round(walkingTime / 60);

        const item = document.createElement('div');
        item.style.cssText = 'background: white; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #ddd; cursor: pointer; transition: all 0.2s;';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                <strong style="font-size: 13px;">${parking.name}</strong>
                <span style="background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold;">${index + 1}</span>
            </div>
            <div style="font-size: 12px; color: #666;">
                📍 ${(parking.distance_m / 1000).toFixed(2)} km away
                <br>🚶 ${walkingMinutes} min walk
            </div>
        `;

        item.onmouseover = () => item.style.background = '#FFF3E0';
        item.onmouseout = () => item.style.background = 'white';
        item.onclick = () => selectParking(parking, destinationCoords);

        parkingListDiv.appendChild(item);
    });

    parkingSection.style.display = 'block';
}

async function selectParking(parking, destinationCoords) {
    selectedParking = parking;
    showStatus('🅿️ Calculating routes via parking...', 'loading');

    try {
        // Get current location or start location
        const startInput = document.getElementById('start').value;
        let startCoords = null;

        if (window.lastCalculatedRoute && window.lastCalculatedRoute.start_lat) {
            startCoords = {
                lat: window.lastCalculatedRoute.start_lat,
                lon: window.lastCalculatedRoute.start_lon
            };
        } else {
            showStatus('Could not determine start location', 'error');
            return;
        }

        // Calculate driving route to parking
        const drivingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: `${startCoords.lat},${startCoords.lon}`,
                end: `${parking.lat},${parking.lon}`,
                routing_mode: 'auto',
                vehicle_type: currentVehicleType,
                include_tolls: localStorage.getItem('pref_tolls') === 'true',
                avoid_caz: localStorage.getItem('pref_caz') === 'true'
            })
        });

        const drivingData = await drivingResponse.json();
        if (!drivingData.success) {
            showStatus('Error calculating driving route', 'error');
            return;
        }

        // Calculate walking route from parking to destination
        const walkingResponse = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: `${parking.lat},${parking.lon}`,
                end: `${destinationCoords.lat},${destinationCoords.lon}`,
                routing_mode: 'pedestrian',
                vehicle_type: 'pedestrian'
            })
        });

        const walkingData = await walkingResponse.json();
        if (!walkingData.success) {
            showStatus('Error calculating walking route', 'error');
            return;
        }

        // Display both routes on map
        displayParkingRoutes(drivingData, walkingData, parking, destinationCoords);

        // Update preview with combined journey info
        updateParkingPreview(drivingData, walkingData, parking);

        showStatus('✅ Routes calculated. Driving + Walking shown on map', 'success');

    } catch (error) {
        console.error('[Parking] Error selecting parking:', error);
        showStatus('Error: ' + error.message, 'error');
    }
}
/**
 * displayParkingRoutes function
 * @function displayParkingRoutes
 * @param {*} drivingData - Parameter description
 * @param {*} walkingData - Parameter description
 * @param {*} parking - Parameter description
 * @param {*} destination - Parameter description
 * @returns {*} Return value description
 */
function displayParkingRoutes(drivingData, walkingData, parking, destination) {
    // Remove previous parking routes
    if (parkingDrivingRoute) map.removeLayer(parkingDrivingRoute);
    if (parkingWalkingRoute) map.removeLayer(parkingWalkingRoute);

    // Decode and display driving route (blue)
    if (drivingData.geometry) {
        const drivingCoords = polyline.decode(drivingData.geometry);
        parkingDrivingRoute = L.polyline(drivingCoords, {
            color: '#2196F3',
            weight: 5,
            opacity: 0.8,
            dashArray: '5, 5'
        }).addTo(map);
    }

    // Decode and display walking route (green)
    if (walkingData.geometry) {
        const walkingCoords = polyline.decode(walkingData.geometry);
        parkingWalkingRoute = L.polyline(walkingCoords, {
            color: '#4CAF50',
            weight: 4,
            opacity: 0.7
        }).addTo(map);
    }

    // Fit map to show both routes
    const allCoords = [];
    if (parkingDrivingRoute) allCoords.push(...parkingDrivingRoute.getLatLngs());
    if (parkingWalkingRoute) allCoords.push(...parkingWalkingRoute.getLatLngs());
    if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}
/**
 * updateParkingPreview function
 * @function updateParkingPreview
 * @param {*} drivingData - Parameter description
 * @param {*} walkingData - Parameter description
 * @param {*} parking - Parameter description
 * @returns {*} Return value description
 */
function updateParkingPreview(drivingData, walkingData, parking) {
    const drivingDist = drivingData.distance_km || 0;
    const drivingTime = drivingData.duration_minutes || 0;
    const walkingDist = walkingData.distance_km || 0;
    const walkingTime = walkingData.duration_minutes || 0;
    const totalDist = drivingDist + walkingDist;
    const totalTime = drivingTime + walkingTime;

    const distUnit = getDistanceUnit();
    const convertedDist = convertDistance(totalDist);

    // Update preview info
    document.getElementById('previewDistance').textContent = convertedDist + ' ' + distUnit;
    document.getElementById('previewDuration').textContent = Math.round(totalTime) + ' min';
    document.getElementById('previewRoute').textContent = `${document.getElementById('start').value} → 🅿️ ${parking.name} → ${document.getElementById('end').value}`;

    // Show breakdown
    const breakdown = `
        <div style="font-size: 12px; line-height: 1.6; color: #333;">
            <div style="margin-bottom: 8px;">
                <strong>🚗 Driving:</strong> ${drivingDist.toFixed(1)} km / ${Math.round(drivingTime)} min
            </div>
            <div>
                <strong>🚶 Walking:</strong> ${walkingDist.toFixed(2)} km / ${Math.round(walkingTime)} min
            </div>
        </div>
    `;
    document.getElementById('previewRoute').innerHTML = `${document.getElementById('start').value} → 🅿️ ${parking.name} → ${document.getElementById('end').value}` + breakdown;
}

/**
 * clearParkingSelection function
 * @function clearParkingSelection
 * @returns {*} Return value description
 */
function clearParkingSelection() {
    selectedParking = null;
    if (parkingDrivingRoute) map.removeLayer(parkingDrivingRoute);
    if (parkingWalkingRoute) map.removeLayer(parkingWalkingRoute);
    parkingMarkers.forEach(marker => map.removeLayer(marker));
    parkingMarkers = [];

    document.getElementById('parkingSection').style.display = 'none';
    document.getElementById('parkingList').innerHTML = '';

    // Restore original route preview
    if (window.lastCalculatedRoute) {
        showRoutePreview(window.lastCalculatedRoute);
    }

    showStatus('🗺️ Parking selection cleared', 'info');
}

/**
 * clearForm function
 * @function clearForm
 * @returns {*} Return value description
 */
function clearForm() {
    document.getElementById('start').value = '';
    document.getElementById('end').value = '';
    document.getElementById('result').classList.remove('show');
    document.getElementById('status').className = 'status';

    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    if (routeLayer) map.removeLayer(routeLayer);

    // Clear parking
    clearParkingSelection();

    // Use smooth animation to return to default view
    map.flyTo([51.5074, -0.1278], 13, {
        duration: ZOOM_ANIMATION_DURATION,
        easeLinearity: 0.25
    });
    lastZoomLevel = 13;
}

// ===== PHASE 2 FEATURES: SEARCH HISTORY & FAVORITES =====

// Load and display search history
/**
 * showSearchHistory function
 * @function showSearchHistory
 * @returns {*} Return value description
 */
function showSearchHistory() {
    fetch('/api/search-history')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.history.length > 0) {
                const dropdown = document.getElementById('searchHistoryDropdown');
                dropdown.innerHTML = '';

                data.history.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'search-history-item';
                    div.innerHTML = `
                        <div class="search-history-item-text">${item.query}</div>
                        ${item.result_name ? `<div class="search-history-item-meta">${item.result_name}</div>` : ''}
                    `;
                    div.onclick = () => {
                        document.getElementById('end').value = item.query;
                        dropdown.classList.remove('show');
                    };
                    dropdown.appendChild(div);
                });

                dropdown.classList.add('show');
            }
        })
        .catch(error => console.error('Error loading search history:', error));
}

// Add search to history
/**
 * addToSearchHistory function
 * @function addToSearchHistory
 * @param {*} query - Parameter description
 * @param {*} resultName - Parameter description
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @returns {*} Return value description
 */
function addToSearchHistory(query, resultName, lat, lon) {
    fetch('/api/search-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, result_name: resultName, lat, lon })
    })
    .catch(error => console.error('Error adding to search history:', error));
}

// Load and display favorite locations
/**
 * loadFavorites function
 * @function loadFavorites
 * @returns {*} Return value description
 */
function loadFavorites() {
    fetch('/api/favorites')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.favorites.length > 0) {
                const section = document.getElementById('favoritesSection');
                const grid = document.getElementById('favoritesGrid');
                grid.innerHTML = '';

                data.favorites.forEach(fav => {
                    const btn = document.createElement('button');
                    btn.className = 'favorite-btn';
                    btn.innerHTML = `
                        <span class="favorite-btn-name">${fav.name}</span>
                        <span class="favorite-btn-category">${fav.category}</span>
                    `;
                    btn.onclick = () => {
                        document.getElementById('end').value = `${fav.lat},${fav.lon}`;
                        addToSearchHistory(fav.name, fav.name, fav.lat, fav.lon);
                        expandBottomSheet();
                    };
                    grid.appendChild(btn);
                });

                section.style.display = 'block';
            }
        })
        .catch(error => console.error('Error loading favorites:', error));
}

// Add current location to favorites
/**
 * addCurrentToFavorites function
 * @function addCurrentToFavorites
 * @returns {*} Return value description
 */
function addCurrentToFavorites() {
    const name = prompt('Enter name for this location (e.g., Home, Work):');
    if (!name) return;

    const category = prompt('Enter category (e.g., home, work, shopping):', 'location');

    fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: name,
            address: document.getElementById('end').value,
            lat: currentLat,
            lon: currentLon,
            category: category || 'location'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(`Added ${name} to favorites!`, 'success');
            loadFavorites();
        } else {
            showStatus('Error adding to favorites', 'error');
        }
    })
    .catch(error => {
        showStatus('Error: ' + error.message, 'error');
    });
}

// ===== PHASE 2 FEATURES: LANE GUIDANCE =====
/**
 * updateLaneGuidance function
 * @function updateLaneGuidance
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} heading - Parameter description
 * @param {*} maneuver - Parameter description
 * @returns {*} Return value description
 */
function updateLaneGuidance(lat, lon, heading, maneuver) {
    fetch(`/api/lane-guidance?lat=${lat}&lon=${lon}&heading=${heading}&maneuver=${maneuver}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const display = document.getElementById('laneGuidanceDisplay');
                const visual = document.getElementById('laneVisual');
                const text = document.getElementById('laneGuidanceText');

                visual.innerHTML = '';
                for (let i = 1; i <= data.total_lanes; i++) {
                    const lane = document.createElement('div');
                    lane.className = 'lane-indicator';
                    if (i === data.current_lane) lane.classList.add('current');
                    if (i === data.recommended_lane) lane.classList.add('recommended');
                    lane.textContent = i;
                    visual.appendChild(lane);
                }

                text.textContent = data.guidance_text;
                display.classList.add('show');
            }
        })
        .catch(error => console.error('Error updating lane guidance:', error));
}

// ===== PHASE 2 FEATURES: SPEED WARNINGS =====

// Speed widget variables
let speedWidgetEnabled = false;
let currentSpeedMph = 0;
let currentSpeedLimitMph = 0;
let speedLimitThreshold = 3; // mph over limit to trigger warning
/**
 * updateSpeedWidget function
 * @function updateSpeedWidget
 * @param {*} speedMph - Parameter description
 * @param {*} speedLimitMph - Parameter description
 * @returns {*} Return value description
 */
function updateSpeedWidget(speedMph, speedLimitMph = null) {
    const widget = document.getElementById('speedWidget');
    if (!widget) return;

    // Get user's preferred unit using global speedUnit variable
    const displaySpeedUnit = getSpeedUnit();
    const displaySpeed = convertSpeed(speedMph);

    // Update current speed
    document.getElementById('speedValue').textContent = Math.round(displaySpeed);
    document.getElementById('speedUnit').textContent = displaySpeedUnit;

    // Update speed limit if provided
    if (speedLimitMph !== null && speedLimitMph > 0) {
        const displaySpeedLimit = convertSpeed(speedLimitMph);
        document.getElementById('speedLimitValue').textContent = Math.round(displaySpeedLimit);
        document.getElementById('speedLimitUnit').textContent = displaySpeedUnit;

        // Check if speeding
        const speedDiff = speedMph - speedLimitMph;
        const warningElement = document.getElementById('speedWarning');
        if (speedDiff > speedLimitThreshold) {
            warningElement.style.display = 'block';
            widget.style.borderLeft = '4px solid #FF5722';
        } else {
            warningElement.style.display = 'none';
            widget.style.borderLeft = '4px solid #4CAF50';
        }
    } else {
        // No speed limit data available - show '?' instead of '--'
        document.getElementById('speedLimitValue').textContent = '?';
        document.getElementById('speedLimitUnit').textContent = displaySpeedUnit;
        document.getElementById('speedWarning').style.display = 'none';
        widget.style.borderLeft = '4px solid #999';
        console.log('[Speed Widget] No speed limit available');
    }

    // Show widget if tracking is active
    if (isTrackingActive) {
        widget.style.display = 'block';
    }
}

/**
 * toggleSpeedWidget function
 * @function toggleSpeedWidget
 * @returns {*} Return value description
 */
function toggleSpeedWidget() {
    speedWidgetEnabled = !speedWidgetEnabled;
    const widget = document.getElementById('speedWidget');
    if (speedWidgetEnabled && isTrackingActive) {
        widget.style.display = 'block';
    } else {
        widget.style.display = 'none';
    }
    localStorage.setItem('speedWidgetEnabled', speedWidgetEnabled);
}
/**
 * updateSpeedWarning function
 * @function updateSpeedWarning
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} currentSpeed - Parameter description
 * @param {*} roadType - Parameter description
 * @returns {*} Return value description
 */
function updateSpeedWarning(lat, lon, currentSpeed, roadType) {
    fetch(`/api/speed-warnings?lat=${lat}&lon=${lon}&speed=${currentSpeed}&road_type=${roadType}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const display = document.getElementById('speedWarningDisplay');
                const text = document.getElementById('speedWarningText');
                const details = document.getElementById('speedWarningDetails');

                display.className = `speed-warning-display show ${data.status}`;
                text.textContent = data.message;
                details.textContent = `Limit: ${data.speed_limit_mph} mph | Current: ${data.current_speed_mph} mph`;
            }
        })
        .catch(error => console.error('Error updating speed warning:', error));
}

// ===== DISTANCE CALCULATION & TURN DETECTION =====
/**
 * calculateHaversineDistance function
 * @function calculateHaversineDistance
 * @param {*} lat1 - Parameter description
 * @param {*} lon1 - Parameter description
 * @param {*} lat2 - Parameter description
 * @param {*} lon2 - Parameter description
 * @returns {*} Return value description
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
/**
 * calculateBearing function
 * @function calculateBearing
 * @param {*} lat1 - Parameter description
 * @param {*} lon1 - Parameter description
 * @param {*} lat2 - Parameter description
 * @param {*} lon2 - Parameter description
 * @returns {*} Return value description
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    return bearing;
}
/**
 * calculateTurnDirection function
 * @function calculateTurnDirection
 * @param {*} bearing1 - Parameter description
 * @param {*} bearing2 - Parameter description
 * @returns {*} Return value description
 */
function calculateTurnDirection(bearing1, bearing2) {
    let bearingChange = bearing2 - bearing1;

    // Normalize to -180 to 180 range
    if (bearingChange > 180) bearingChange -= 360;
    if (bearingChange < -180) bearingChange += 360;

    // Classify turn
    if (bearingChange < -135) return 'sharp_left';
    if (bearingChange < -45) return 'left';
    if (bearingChange < -10) return 'slight_left';
    if (bearingChange <= 10) return 'straight';
    if (bearingChange <= 45) return 'slight_right';
    if (bearingChange <= 135) return 'right';
    return 'sharp_right';
}
/**
 * detectUpcomingTurn function
 * @function detectUpcomingTurn
 * @param {*} userLat - Parameter description
 * @param {*} userLon - Parameter description
 * @returns {*} Return value description
 */
function detectUpcomingTurn(userLat, userLon) {
    if (!routeInProgress || !routePolyline || routePolyline.length === 0) {
        return null;
    }

    // Find the closest point on the route to the user
    let closestDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < routePolyline.length; i++) {
        const point = routePolyline[i];
        const distance = calculateHaversineDistance(userLat, userLon, point[0], point[1]);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = i;
        }
    }

    // FIXED: Look ahead for significant direction changes (turns)
    // Scan ahead to find the next point where direction changes significantly
    let nextTurnIndex = null;
    let maxBearingChange = 0;

    // Get current bearing (from closest point to next point)
    let currentBearing = null;
    if (closestIndex < routePolyline.length - 1) {
        const currPoint = routePolyline[closestIndex];
        const nextPoint = routePolyline[closestIndex + 1];
        currentBearing = calculateBearing(currPoint[0], currPoint[1], nextPoint[0], nextPoint[1]);
    }

    // Scan ahead up to 50 points or 1km to find the next significant turn
    const scanDistance = Math.min(50, routePolyline.length - closestIndex - 1);
    for (let i = closestIndex + 2; i < closestIndex + scanDistance; i++) {
        if (i >= routePolyline.length) break;

        const prevPoint = routePolyline[i - 1];
        const currPoint = routePolyline[i];
        const bearing = calculateBearing(prevPoint[0], prevPoint[1], currPoint[0], currPoint[1]);

        if (currentBearing !== null) {
            let bearingChange = bearing - currentBearing;
            // Normalize to -180 to 180
            if (bearingChange > 180) bearingChange -= 360;
            if (bearingChange < -180) bearingChange += 360;

            // Look for significant direction changes (>10 degrees)
            if (Math.abs(bearingChange) > 10 && Math.abs(bearingChange) > maxBearingChange) {
                maxBearingChange = Math.abs(bearingChange);
                nextTurnIndex = i;
            }
        }
    }

    // If no significant turn found, use the next point ahead
    if (nextTurnIndex === null) {
        nextTurnIndex = Math.min(closestIndex + 5, routePolyline.length - 1);
    }

    if (nextTurnIndex === closestIndex || nextTurnIndex === closestIndex + 1) {
        return null; // No turn ahead
    }

    const nextTurnPoint = routePolyline[nextTurnIndex];
    const distanceToTurn = calculateHaversineDistance(
        userLat, userLon,
        nextTurnPoint[0], nextTurnPoint[1]
    );

    // FIXED: Calculate turn direction using proper bearing calculation
    let turnDirection = 'straight';
    if (closestIndex > 0 && nextTurnIndex < routePolyline.length - 1) {
        // Get bearing from point before closest to closest point
        const prevPoint = routePolyline[Math.max(0, closestIndex - 1)];
        const currPoint = routePolyline[closestIndex];
        const nextPoint = routePolyline[nextTurnIndex];

        const bearing1 = calculateBearing(prevPoint[0], prevPoint[1], currPoint[0], currPoint[1]);
        const bearing2 = calculateBearing(currPoint[0], currPoint[1], nextPoint[0], nextPoint[1]);

        turnDirection = calculateTurnDirection(bearing1, bearing2);
    }

    return {
        distance: distanceToTurn,
        lat: nextTurnPoint[0],
        lon: nextTurnPoint[1],
        index: nextTurnIndex,
        direction: turnDirection
    };
}

// ===== VEHICLE TYPE & ROUTING MODE MANAGEMENT =====

/**
 * updateVehicleType function
 * @function updateVehicleType
 * @returns {*} Return value description
 */
function updateVehicleType() {
    const select = document.getElementById('vehicleType');
    currentVehicleType = select.value;
    localStorage.setItem('vehicleType', currentVehicleType);

    // Update user marker icon
    updateUserMarkerIcon();

    console.log('[Vehicle] Type changed to:', currentVehicleType);
    saveAllSettings();
    showStatus(`🚗 Vehicle type: ${select.options[select.selectedIndex].text}`, 'info');
}
/**
 * setRoutingMode function
 * @function setRoutingMode
 * @param {*} mode - Parameter description
 * @returns {*} Return value description
 */
function setRoutingMode(mode) {
    currentRoutingMode = mode;
    localStorage.setItem('routingMode', mode);

    // Update button states
    document.getElementById('routingAuto').classList.toggle('active', mode === 'auto');
    document.getElementById('routingPedestrian').classList.toggle('active', mode === 'pedestrian');
    document.getElementById('routingBicycle').classList.toggle('active', mode === 'bicycle');

    // Update vehicle type selector visibility
    if (mode === 'pedestrian') {
        document.getElementById('vehicleType').style.display = 'none';
        currentVehicleType = 'pedestrian';
    } else if (mode === 'bicycle') {
        document.getElementById('vehicleType').style.display = 'none';
        currentVehicleType = 'bicycle';
    } else {
        document.getElementById('vehicleType').style.display = 'block';
        currentVehicleType = document.getElementById('vehicleType').value;
    }

    // Update user marker icon
    updateUserMarkerIcon();

    console.log('[Routing] Mode changed to:', mode);
    const modeNames = { 'auto': '🚗 Auto', 'pedestrian': '🚶 Pedestrian', 'bicycle': '🚴 Bicycle' };
    saveAllSettings();
    showStatus(`${modeNames[mode]} mode`, 'info');
}

/**
 * updateUserMarkerIcon function
 * @function updateUserMarkerIcon
 * @returns {*} Return value description
 */
function updateUserMarkerIcon() {
    // Determine which icon to use
    let iconEmoji = vehicleIcons[currentRoutingMode] || vehicleIcons[currentVehicleType] || '🚗';

    // Update the marker if it exists
    if (currentUserMarker) {
        map.removeLayer(currentUserMarker);
        currentUserMarker = null;
    }

    currentUserMarkerIcon = iconEmoji;
    console.log('[Marker] Icon updated to:', iconEmoji);
}
/**
 * createVehicleMarker function
 * @function createVehicleMarker
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} speed - Parameter description
 * @param {*} accuracy - Parameter description
 * @returns {*} Return value description
 */
function createVehicleMarker(lat, lon, speed, accuracy) {
    // Create a custom marker with vehicle icon
    const iconEmoji = vehicleIcons[currentRoutingMode] || vehicleIcons[currentVehicleType] || '🚗';

    // Create a div element for the marker
    const markerDiv = document.createElement('div');
    markerDiv.style.fontSize = '24px';
    markerDiv.style.textAlign = 'center';
    markerDiv.style.width = '30px';
    markerDiv.style.height = '30px';
    markerDiv.innerHTML = iconEmoji;

    // Create custom icon
    const customIcon = L.divIcon({
        html: markerDiv.innerHTML,
        iconSize: [30, 30],
        className: 'vehicle-marker-icon'
    });

    // Create marker with custom icon
    const marker = L.marker([lat, lon], { icon: customIcon })
        .bindPopup(`${iconEmoji} Current Position<br>Speed: ${(speed * 3.6).toFixed(1)} km/h<br>Accuracy: ${accuracy.toFixed(0)}m`);

    return marker;
}

// ===== SMART ZOOM FUNCTIONALITY =====
/**
 * calculateSmartZoom function
 * @function calculateSmartZoom
 * @param {*} speedMph - Parameter description
 * @param {*} distanceToNextTurn - Parameter description
 * @param {*} roadType - Parameter description
 * @returns {*} Return value description
 */
function calculateSmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
    let zoomLevel = ZOOM_LEVELS.urban_low_speed; // Default

    // Priority 1: Turn-based zoom (highest priority)
    if (distanceToNextTurn !== null && distanceToNextTurn < TURN_ZOOM_THRESHOLD) {
        // Zoom in for turn details when within 500m
        zoomLevel = ZOOM_LEVELS.turn_ahead;
        return zoomLevel;
    }

    // Priority 2: Speed-based zoom
    if (speedMph > 100) {
        // Motorway - zoom out to see more ahead
        zoomLevel = ZOOM_LEVELS.motorway_high_speed;
    } else if (speedMph > 50) {
        // Main road - medium zoom
        zoomLevel = ZOOM_LEVELS.main_road_medium_speed;
    } else if (speedMph > 20) {
        // Urban - normal zoom
        zoomLevel = ZOOM_LEVELS.urban_low_speed;
    } else {
        // Parking/very slow - zoom in
        zoomLevel = ZOOM_LEVELS.parking_very_low_speed;
    }

    return zoomLevel;
}
/**
 * applySmartZoomWithAnimation function
 * @function applySmartZoomWithAnimation
 * @param {*} speedMph - Parameter description
 * @param {*} distanceToNextTurn - Parameter description
 * @param {*} roadType - Parameter description
 * @param {*} userLat - Parameter description
 * @param {*} userLon - Parameter description
 * @returns {*} Return value description
 */
function applySmartZoomWithAnimation(speedMph, distanceToNextTurn = null, roadType = 'urban', userLat = null, userLon = null) {
    if (!smartZoomEnabled || !routeInProgress) return;

    const newZoomLevel = calculateSmartZoom(speedMph, distanceToNextTurn, roadType);

    // Only update if zoom level changed significantly
    if (Math.abs(newZoomLevel - lastZoomLevel) >= 1) {
        // Use smooth animation with flyTo
        if (userLat !== null && userLon !== null) {
            map.flyTo([userLat, userLon], newZoomLevel, {
                duration: ZOOM_ANIMATION_DURATION,
                easeLinearity: 0.25
            });
        } else {
            // Fallback if coordinates not provided
            map.setZoom(newZoomLevel);
        }

        lastZoomLevel = newZoomLevel;

        // Log zoom reason
        if (distanceToNextTurn !== null && distanceToNextTurn < TURN_ZOOM_THRESHOLD) {
            console.log('[SmartZoom] Turn-based zoom to level', newZoomLevel, '- Turn in', distanceToNextTurn.toFixed(0), 'm');
            lastTurnZoomApplied = true;
        } else {
            console.log('[SmartZoom] Speed-based zoom to level', newZoomLevel, 'for speed', speedMph.toFixed(1), 'mph');
            lastTurnZoomApplied = false;
        }
    }
}

// Legacy function for backward compatibility
/**
 * applySmartZoom function
 * @function applySmartZoom
 * @param {*} speedMph - Parameter description
 * @param {*} distanceToNextTurn - Parameter description
 * @param {*} roadType - Parameter description
 * @returns {*} Return value description
 */
function applySmartZoom(speedMph, distanceToNextTurn = null, roadType = 'urban') {
    applySmartZoomWithAnimation(speedMph, distanceToNextTurn, roadType, currentLat, currentLon);
}

/**
 * toggleSmartZoom function
 * @function toggleSmartZoom
 * @returns {*} Return value description
 */
function toggleSmartZoom() {
    smartZoomEnabled = !smartZoomEnabled;
    const btn = document.getElementById('smartZoomToggle');
    if (btn) {
        btn.classList.toggle('active', smartZoomEnabled);
    }
    localStorage.setItem('smartZoomEnabled', smartZoomEnabled ? '1' : '0');
    saveAllSettings();
    showStatus(`🔍 Smart Zoom ${smartZoomEnabled ? 'enabled' : 'disabled'}`, 'info');
    console.log('[SmartZoom] Toggled to:', smartZoomEnabled);
}

// ===== VARIABLE SPEED LIMIT DETECTION =====
/**
 * updateVariableSpeedLimit function
 * @function updateVariableSpeedLimit
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} roadType - Parameter description
 * @param {*} vehicleType - Parameter description
 * @returns {*} Return value description
 */
function updateVariableSpeedLimit(lat, lon, roadType = 'motorway', vehicleType = 'car') {
    fetch(`/api/speed-limit?lat=${lat}&lon=${lon}&road_type=${roadType}&vehicle_type=${vehicleType}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const display = document.getElementById('variableSpeedDisplay');
                const limitEl = document.getElementById('variableSpeedLimit');
                const infoEl = document.getElementById('variableSpeedInfo');

                const speedData = data.data;
                limitEl.textContent = `${speedData.speed_limit_mph} mph`;

                let infoHtml = '';
                if (speedData.is_smart_motorway) {
                    infoHtml += `<div class="variable-speed-info-item">🚗 Smart Motorway: ${speedData.motorway_name}</div>`;
                }
                infoHtml += `<div class="variable-speed-info-item">Road: ${speedData.road_type.replace(/_/g, ' ')}</div>`;

                infoEl.innerHTML = infoHtml;
                display.classList.add('show');
            }
        })
        .catch(error => console.error('Error updating variable speed limit:', error));
}
/**
 * checkSpeedViolation function
 * @function checkSpeedViolation
 * @param {*} currentSpeedMph - Parameter description
 * @param {*} speedLimitMph - Parameter description
 * @param {*} threshold - Parameter description
 * @returns {*} Return value description
 */
function checkSpeedViolation(currentSpeedMph, speedLimitMph, threshold = 5) {
    fetch('/api/speed-violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            current_speed_mph: currentSpeedMph,
            speed_limit_mph: speedLimitMph,
            warning_threshold_mph: threshold
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const violation = data.data;
                console.log(`[Speed] Status: ${violation.status}, Diff: ${violation.speed_diff_mph} mph`);

                // Announce speed violations via voice if enabled
                if (violation.status === 'exceeding' && voiceRecognition) {
                    speakMessage(`⚠️ Exceeding speed limit by ${violation.speed_diff_mph} mph`);
                }
            }
        })
        .catch(error => console.error('Error checking speed violation:', error));
}

// Initialize Phase 2 features on page load
window.addEventListener('load', () => {
    loadFavorites();
    initPhase3Features();
});

// ===== PHASE 3 FEATURES: GESTURE CONTROL =====

let lastAcceleration = { x: 0, y: 0, z: 0 };
let shakeCount = 0;
let lastShakeTime = 0;
let gestureEnabled = true;
let gestureSensitivity = 'medium';
let gestureAction = 'recalculate';

/**
 * initPhase3Features function
 * @function initPhase3Features
 * @returns {*} Return value description
 */
function initPhase3Features() {
    // Load gesture settings
    fetch('/api/app-settings')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                gestureEnabled = data.settings.gesture_enabled;
                gestureSensitivity = data.settings.gesture_sensitivity;
                gestureAction = data.settings.gesture_action;

                // Update UI
                document.getElementById('gestureEnabled').checked = gestureEnabled;
                document.getElementById('gestureSensitivity').value = gestureSensitivity;
                document.getElementById('gestureAction').value = gestureAction;
                document.getElementById('gestureSettings').style.display = gestureEnabled ? 'block' : 'none';

                // Initialize gesture detection
                if (gestureEnabled && 'DeviceMotionEvent' in window) {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                }
            }
        })
        .catch(error => console.error('Error loading app settings:', error));

    // Initialize battery monitoring
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            updateBatteryStatus(battery);
            battery.addEventListener('levelchange', () => updateBatteryStatus(battery));
            battery.addEventListener('chargingchange', () => updateBatteryStatus(battery));
        });
    }

    // Load ML predictions
    loadMLPredictions();
}
/**
 * handleDeviceMotion function
 * @function handleDeviceMotion
 * @param {*} event - Parameter description
 * @returns {*} Return value description
 */
function handleDeviceMotion(event) {
    if (!gestureEnabled) return;

    const accel = event.acceleration;
    if (!accel) return;

    // Calculate acceleration magnitude
    const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);

    // Sensitivity thresholds
    const thresholds = {
        'low': 20,
        'medium': 15,
        'high': 10
    };
    const threshold = thresholds[gestureSensitivity] || 15;

    // Detect shake
    if (magnitude > threshold) {
        const now = Date.now();
        if (now - lastShakeTime < 1000) {
            shakeCount++;
            if (shakeCount >= 2) {
                triggerGestureAction();
                shakeCount = 0;
            }
        } else {
            shakeCount = 1;
        }
        lastShakeTime = now;
    }
}

/**
 * triggerGestureAction function
 * @function triggerGestureAction
 * @returns {*} Return value description
 */
function triggerGestureAction() {
    // Show gesture indicator
    const indicator = document.getElementById('gestureIndicator');
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 500);

    // Trigger haptic feedback if available
    if ('vibrate' in navigator) {
        navigator.vibrate(100);
    }

    // Log gesture event
    fetch('/api/gesture-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_type: 'shake', action: gestureAction })
    }).catch(error => console.error('Error logging gesture:', error));

    // Execute action
    switch (gestureAction) {
        case 'recalculate':
            showStatus('🔄 Recalculating route...', 'info');
            calculateRoute();
            break;
        case 'report':
            showStatus('📍 Report hazard mode activated', 'info');
            // Would open hazard reporting UI
            break;
        case 'clear':
            showStatus('🗑️ Route cleared', 'info');
            clearForm();
            break;
    }
}

/**
 * toggleGestureControl function
 * @function toggleGestureControl
 * @returns {*} Return value description
 */
function toggleGestureControl() {
    gestureEnabled = !gestureEnabled;

    // Update UI
    const button = document.getElementById('gestureEnabled');
    if (button) {
        button.classList.toggle('active');
        if (gestureEnabled) {
            button.style.background = '#4CAF50';
            button.style.borderColor = '#4CAF50';
        } else {
            button.style.background = '#ddd';
            button.style.borderColor = '#999';
        }
    }

    document.getElementById('gestureSettings').style.display = gestureEnabled ? 'block' : 'none';

    // Save to localStorage
    localStorage.setItem('gestureEnabled', gestureEnabled);

    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_enabled: gestureEnabled })
    }).catch(error => console.error('Error updating gesture setting:', error));

    if (gestureEnabled && 'DeviceMotionEvent' in window) {
        window.addEventListener('devicemotion', handleDeviceMotion);
        showStatus('✅ Gesture control enabled', 'success');
    } else {
        window.removeEventListener('devicemotion', handleDeviceMotion);
        showStatus('❌ Gesture control disabled', 'info');
    }
}

/**
 * updateGestureSensitivity function
 * @function updateGestureSensitivity
 * @returns {*} Return value description
 */
function updateGestureSensitivity() {
    gestureSensitivity = document.getElementById('gestureSensitivity').value;
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_sensitivity: gestureSensitivity })
    }).catch(error => console.error('Error updating gesture sensitivity:', error));
}

/**
 * updateGestureAction function
 * @function updateGestureAction
 * @returns {*} Return value description
 */
function updateGestureAction() {
    gestureAction = document.getElementById('gestureAction').value;
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesture_action: gestureAction })
    }).catch(error => console.error('Error updating gesture action:', error));
}

// ===== PHASE 3 FEATURES: BATTERY SAVING MODE =====

let batterySavingMode = false;
let originalGPSFrequency = 1000; // ms
/**
 * updateBatteryStatus function
 * @function updateBatteryStatus
 * @param {*} battery - Parameter description
 * @returns {*} Return value description
 */
function updateBatteryStatus(battery) {
    const level = Math.round(battery.level * 100);
    const indicator = document.getElementById('batteryIndicator');

    indicator.style.display = 'block';
    document.getElementById('batteryLevel').textContent = level + '%';

    // Update battery status class
    indicator.className = 'battery-indicator';
    if (level < 20) {
        indicator.classList.add('low');
    } else if (level < 50) {
        indicator.classList.add('medium');
    } else {
        indicator.classList.add('high');
    }

    // Auto-enable battery saving if low
    if (level < 15 && !batterySavingMode) {
        enableBatterySavingMode();
    }
}

/**
 * toggleBatterySavingMode function
 * @function toggleBatterySavingMode
 * @returns {*} Return value description
 */
function toggleBatterySavingMode() {
    batterySavingMode = !batterySavingMode;
    if (batterySavingMode) {
        enableBatterySavingMode();
    } else {
        disableBatterySavingMode();
    }
}

/**
 * enableBatterySavingMode function
 * @function enableBatterySavingMode
 * @returns {*} Return value description
 */
function enableBatterySavingMode() {
    batterySavingMode = true;
    const button = document.getElementById('batterySavingMode');
    if (button) {
        button.classList.add('active');
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
    }

    // Reduce GPS update frequency
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                // GPS callback - will be handled by existing tracking
            },
            (error) => console.error('GPS error:', error),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
        );
    }

    // Disable animations
    document.body.style.animation = 'none';
    document.querySelectorAll('[style*="animation"]').forEach(el => {
        el.style.animation = 'none';
    });

    showStatus('🔋 Battery saving mode enabled', 'success');
    localStorage.setItem('pref_batterySaving', 'true');
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battery_saving_mode: 1 })
    }).catch(error => console.error('Error updating battery mode:', error));
}

/**
 * disableBatterySavingMode function
 * @function disableBatterySavingMode
 * @returns {*} Return value description
 */
function disableBatterySavingMode() {
    batterySavingMode = false;
    const button = document.getElementById('batterySavingMode');
    if (button) {
        button.classList.remove('active');
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
    }

    // Restore GPS update frequency
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                // GPS callback
            },
            (error) => console.error('GPS error:', error),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    // Re-enable animations
    document.body.style.animation = '';

    showStatus('🔋 Battery saving mode disabled', 'info');
    localStorage.setItem('pref_batterySaving', 'false');
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battery_saving_mode: 0 })
    }).catch(error => console.error('Error updating battery mode:', error));
}

// ===== PHASE 3 FEATURES: MAP THEMES =====

let currentMapTheme = 'standard';
/**
 * setMapTheme function
 * @function setMapTheme
 * @param {string|Event} themeOrEvent - Theme name or event object
 * @returns {void}
 */
function setMapTheme(themeOrEvent) {
    // Handle both string theme and event object
    let theme = typeof themeOrEvent === 'string' ? themeOrEvent : (themeOrEvent?.target?.dataset?.theme || 'standard');

    currentMapTheme = theme;
    localStorage.setItem('mapTheme', theme);

    // Update UI
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.remove('active');
    });

    // Highlight the active theme button
    const activeBtn = document.querySelector(`[data-theme="${theme}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Apply theme to map
    const tileUrls = {
        'standard': 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'satellite': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        'dark': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    };

    // Remove existing tile layer
    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
            map.removeLayer(layer);
        }
    });

    // Add new tile layer
    L.tileLayer(tileUrls[theme], {
        attribution: '© Map contributors',
        maxZoom: 19
    }).addTo(map);

    showStatus(`🗺️ Map theme changed to ${theme}`, 'success');
    saveAllSettings();

    // Save preference
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_theme: theme })
    }).catch(error => console.error('Error updating map theme:', error));
}

// ===== PHASE 3 FEATURES: ML PREDICTIONS =====

/**
 * loadMLPredictions function
 * @function loadMLPredictions
 * @returns {*} Return value description
 */
function loadMLPredictions() {
    fetch('/api/ml-predictions')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.predictions.length > 0) {
                const section = document.getElementById('mlPredictionsSection');
                const list = document.getElementById('mlPredictionsList');
                list.innerHTML = '';

                data.predictions.forEach(pred => {
                    const item = document.createElement('div');
                    item.className = 'ml-prediction-item';
                    item.innerHTML = `
                        <span class="ml-prediction-label">${pred.label}</span>
                        <span class="ml-prediction-details">${pred.details}</span>
                    `;
                    item.onclick = () => {
                        document.getElementById('start').value = pred.start_address;
                        document.getElementById('end').value = pred.end_address;
                        calculateRoute();
                    };
                    list.appendChild(item);
                });

                section.classList.add('show');
            }
        })
        .catch(error => console.error('Error loading ML predictions:', error));
}

/**
 * toggleMLPredictions function
 * @function toggleMLPredictions
 * @returns {*} Return value description
 */
function toggleMLPredictions() {
    const button = document.getElementById('mlPredictionsEnabled');

    // Toggle the active class (like other toggle switches)
    button.classList.toggle('active');
    const enabled = button.classList.contains('active');

    // Update visual state
    if (enabled) {
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }

    // Save to localStorage
    localStorage.setItem('mlPredictionsEnabled', enabled ? 'true' : 'false');

    // Send to backend
    fetch('/api/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ml_predictions_enabled: enabled ? 1 : 0 })
    }).catch(error => console.error('Error updating ML predictions:', error));

    if (enabled) {
        loadMLPredictions();
        showStatus('🤖 Smart predictions enabled', 'success');
    } else {
        document.getElementById('mlPredictionsSection').classList.remove('show');
        showStatus('🤖 Smart predictions disabled', 'info');
    }

    // Save all settings
    saveAllSettings();
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('[PWA] Service Worker registered:', registration);

                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60000); // Check every minute
            })
            .catch(error => {
                console.log('[PWA] Service Worker registration failed:', error);
            });
    });

    // ===== PHASE 2: Handle service worker updates with smart reload =====
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] New service worker activated');

        // Check if navigation is in progress
        if (routeInProgress) {
            // Queue update for after navigation
            updatePending = true;
            showStatus('✅ Update available. Will apply after navigation.', 'info');
        } else {
            // Safe to reload immediately
            showStatus('🔄 Applying app update...', 'success');
            // Save state before reload
            saveAppState();
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    });
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Request persistent storage
if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(persistent => {
        console.log('[PWA] Persistent storage:', persistent ? 'granted' : 'denied');
    });
}

// ===== PHASE 2: Restore app state on page load =====
window.addEventListener('load', () => {
    restoreAppState();
});

// ===== PHASE 3: Initialize battery monitoring =====
initBatteryMonitoring();

// ===== GPS TRACKING SYSTEM =====
let gpsWatchId = null;
let currentUserMarker = null;
let isTrackingActive = false;
let trackingHistory = [];
let routeStarted = false;
let routeInProgress = false;

// ===== SCREEN WAKE LOCK (keeps screen on during navigation) =====
window.screenWakeLock = null;

// ===== TURN-BY-TURN NAVIGATION =====
let currentRouteSteps = [];
let currentStepIndex = 0;
let nextManeuverDistance = 0;
let routePolyline = null;

// ===== NOTIFICATIONS SYSTEM =====
let notificationQueue = [];
let lastNotificationTime = 0;
const NOTIFICATION_THROTTLE_MS = 3000; // Prevent notification spam

// ===== LIVE DATA REFRESH SYSTEM (PHASE 1) =====
let trafficRefreshInterval = null;
let etaRefreshInterval = null;
let weatherRefreshInterval = null;
let hazardRefreshInterval = null;

const REFRESH_INTERVALS = {
    traffic_navigation: 300000,    // 5 minutes during navigation
    traffic_idle: 900000,          // 15 minutes when idle
    eta: 30000,                    // 30 seconds during navigation
    weather_navigation: 1800000,   // 30 minutes during navigation
    weather_idle: 3600000,         // 60 minutes when idle
    hazards_navigation: 300000,    // 5 minutes during navigation
    hazards_idle: 600000           // 10 minutes when idle
};

// ===== PWA AUTO-RELOAD SYSTEM (PHASE 2) =====
let updatePending = false;
let appStateBeforeReload = null;

// ===== BATTERY-AWARE REFRESH (PHASE 3) =====
let currentBatteryLevel = 1.0;
let batteryStatusMonitor = null;

// ===== VOICE CONTROL SYSTEM =====
let voiceRecognition = null;
let isListening = false;
let currentLat = 51.5074;
let currentLon = -0.1278;

// ===== AUTO GPS LOCATION FEATURE =====
let autoGpsEnabled = false;
let autoGpsLocationMonitor = null;
const AUTO_GPS_UPDATE_INTERVAL = 5000; // Update every 5 seconds

// ===== VEHICLE TYPE & ROUTING MODE =====
let currentVehicleType = 'petrol_diesel';
let currentRoutingMode = 'auto';
let currentUserMarkerIcon = null;

// Vehicle icon mapping
const vehicleIcons = {
    'petrol_diesel': '🚗',
    'electric': '⚡',
    'motorcycle': '🏍️',
    'truck': '🚚',
    'van': '🚐',
    'bicycle': '🚴',
    'pedestrian': '🚶'
};

// ===== SMART ZOOM VARIABLES =====
let smartZoomEnabled = true;
let lastZoomLevel = 16;
let lastTurnZoomApplied = false;
const ZOOM_LEVELS = {
    'motorway_high_speed': 14,      // > 100 km/h
    'main_road_medium_speed': 15,   // 50-100 km/h
    'urban_low_speed': 16,          // 20-50 km/h
    'parking_very_low_speed': 17,   // < 20 km/h
    'turn_ahead': 18                 // Upcoming turn
};
const TURN_ZOOM_THRESHOLD = 500;    // Zoom in when within 500m of turn
const ZOOM_ANIMATION_DURATION = 0.5; // 500ms smooth animation

// ===== GEOCODING FEATURE =====
let geocodingCache = {};
const GEOCODING_CACHE_KEY = 'voyagr_geocoding_cache';
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_API = 'https://nominatim.openstreetmap.org/reverse';
let isGeocoding = false;

// Initialize Web Speech API
/**
 * initVoiceRecognition function
 * @function initVoiceRecognition
 * @returns {*} Return value description
 */
function initVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.log('[Voice] Web Speech API not supported');
        document.getElementById('voiceStatus').textContent = '❌ Voice not supported in this browser';
        return false;
    }

    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = true;
    voiceRecognition.lang = 'en-US';

    voiceRecognition.onstart = () => {
        console.log('[Voice] Listening started');
        document.getElementById('voiceStatus').textContent = '🎤 Listening...';
        document.getElementById('voiceBtnText').textContent = '⏹️ Stop Voice';
        document.getElementById('voiceBtn').classList.add('active');
    };

    voiceRecognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        document.getElementById('voiceTranscript').textContent = '📝 ' + transcript;
        console.log('[Voice] Transcript:', transcript);
    };

    voiceRecognition.onerror = (event) => {
        console.log('[Voice] Error:', event.error);
        document.getElementById('voiceStatus').textContent = '❌ Error: ' + event.error;
        document.getElementById('voiceBtnText').textContent = '🎤 Start Voice';
        document.getElementById('voiceBtn').classList.remove('active');
        isListening = false;
    };

    voiceRecognition.onend = () => {
        console.log('[Voice] Listening ended');
        document.getElementById('voiceStatus').textContent = '✅ Processing command...';
        document.getElementById('voiceBtnText').textContent = '🎤 Start Voice';
        document.getElementById('voiceBtn').classList.remove('active');
        isListening = false;
    };

    return true;
}

/**
 * toggleVoiceInput function
 * @function toggleVoiceInput
 * @returns {*} Return value description
 */
function toggleVoiceInput() {
    if (!voiceRecognition) {
        if (!initVoiceRecognition()) {
            return;
        }
    }

    if (isListening) {
        voiceRecognition.stop();
        isListening = false;
    } else {
        document.getElementById('voiceTranscript').textContent = '';
        voiceRecognition.start();
        isListening = true;
    }
}
/**
 * speakText function
 * @function speakText
 * @param {*} text - Parameter description
 * @returns {*} Return value description
 */
function speakText(text) {
    if (!('speechSynthesis' in window)) {
        console.log('[Voice] Speech Synthesis not supported');
        return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
        console.log('[Voice] Speaking:', text);
        document.getElementById('voiceStatus').textContent = '🔊 Speaking...';
    };

    utterance.onend = () => {
        console.log('[Voice] Speech ended');
        document.getElementById('voiceStatus').textContent = '✅ Ready';
    };

    utterance.onerror = (event) => {
        console.log('[Voice] Speech error:', event.error);
        document.getElementById('voiceStatus').textContent = '❌ Speech error: ' + event.error;
    };

    window.speechSynthesis.speak(utterance);
}

// Override voice recognition onend to process command
/**
 * setupVoiceCommandProcessing function
 * @function setupVoiceCommandProcessing
 * @returns {*} Return value description
 */
function setupVoiceCommandProcessing() {
    if (!voiceRecognition) return;

    const originalOnEnd = voiceRecognition.onend;
    voiceRecognition.onend = function() {
        originalOnEnd.call(this);

        // Get the final transcript
        const transcript = document.getElementById('voiceTranscript').textContent.replace('📝 ', '').trim();
        if (transcript) {
            processVoiceCommand(transcript);
        }
    };
}
/**
 * processVoiceCommand function
 * @function processVoiceCommand
 * @param {*} command - Parameter description
 * @returns {*} Return value description
 */
function processVoiceCommand(command) {
    if (!command) return;

    console.log('[Voice] Processing command:', command);
    document.getElementById('voiceStatus').textContent = '⚙️ Processing: ' + command;

    fetch('/api/voice/command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: command,
            lat: currentLat,
            lon: currentLon
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('[Voice] Command result:', data);

        if (data.success) {
            handleVoiceAction(data);
            speakText(data.message);
        } else {
            speakText(data.message || 'Command not recognized');
            document.getElementById('voiceStatus').textContent = '❌ ' + (data.message || 'Command failed');
        }
    })
    .catch(error => {
        console.log('[Voice] Error:', error);
        speakText('Error processing command');
        document.getElementById('voiceStatus').textContent = '❌ Error: ' + error.message;
    });
}
/**
 * handleVoiceAction function
 * @function handleVoiceAction
 * @param {*} data - Parameter description
 * @returns {*} Return value description
 */
function handleVoiceAction(data) {
    const action = data.action;

    switch(action) {
        case 'navigate':
            document.getElementById('end').value = data.location;
            calculateRoute();
            break;

        case 'search':
            document.getElementById('end').value = data.search_term;
            calculateRoute();
            break;

        case 'set_preference':
            console.log('[Voice] Setting preference:', data.preference, '=', data.value);
            // Store preference in localStorage
            localStorage.setItem('voice_pref_' + data.preference, JSON.stringify(data.value));
            break;

        case 'get_info':
            console.log('[Voice] Getting info:', data.info_type);
            // This would be handled by the app based on current route
            break;

        case 'report_hazard':
            console.log('[Voice] Reporting hazard:', data.hazard_type);
            // Report hazard to backend
            fetch('/api/hazards/report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    lat: currentLat,
                    lon: currentLon,
                    hazard_type: data.hazard_type,
                    description: data.description,
                    severity: 'medium'
                })
            })
            .then(r => r.json())
            .then(r => console.log('[Voice] Hazard reported:', r));
            break;

        case 'reroute':
            console.log('[Voice] Rerouting from current location');
            if (routeInProgress && currentLat && currentLon) {
                // Trigger automatic reroute from current position
                triggerAutomaticReroute(currentLat, currentLon);
                speakMessage('Recalculating route from your current location');
            } else {
                speakMessage('No active route to recalculate');
            }
            break;
    }
}

/**
 * setupMapMoveHandler function
 * @function setupMapMoveHandler
 * @returns {void}
 */
function setupMapMoveHandler() {
    if (!map) {
        console.log('[Map] Map not initialized yet, deferring move handler setup');
        return;
    }

    // Update current location when map is moved
    map.on('move', () => {
        const center = map.getCenter();
        currentLat = center.lat;
        currentLon = center.lng;
    });
}

// Initialize voice recognition on page load
window.addEventListener('load', () => {
    console.log('[Voice] Initializing voice system');
    initVoiceRecognition();
    setupVoiceCommandProcessing();
    // Note: initBottomSheet() is already called from app.js
    initGeocodeCache();

    // Load all persistent settings from localStorage
    console.log('[Settings] Loading all persistent settings...');
    loadAllSettings();
    applySettingsToUI();

    // Load parking preferences
    console.log('[Parking] Loading parking preferences...');
    loadParkingPreferences();

    // Load voice preferences (FIXED: was missing)
    console.log('[Voice] Loading voice preferences...');
    loadVoicePreferences();

    // Legacy preference loading (for backward compatibility)
    loadPreferences();

    console.log('[Init] Vehicle Type:', currentVehicleType, 'Routing Mode:', currentRoutingMode, 'Smart Zoom:', smartZoomEnabled);
    console.log('[Init] All settings loaded and applied successfully');
});

// ===== BOTTOM SHEET FUNCTIONALITY =====
/**
 * initBottomSheet function
 * @function initBottomSheet
 * @returns {*} Return value description
 */
function initBottomSheet() {
    const bottomSheet = document.getElementById('bottomSheet');
    const handle = document.querySelector('.bottom-sheet-handle');
    const header = document.querySelector('.bottom-sheet-header');
    let isDragging = false;

    console.log('[BottomSheet] Initializing...', { bottomSheet, handle, header });

    if (!bottomSheet || !handle) {
        console.error('[BottomSheet] ERROR: bottomSheet or handle not found!');
        return;
    }

    // Click on handle or header to expand/collapse
    handle.addEventListener('click', (e) => {
        console.log('[BottomSheet] Handle clicked, expanded:', bottomSheetIsExpanded);
        e.stopPropagation();
        if (bottomSheetIsExpanded) {
            collapseBottomSheet();
        } else {
            expandBottomSheet();
        }
    });

    if (header) {
        header.addEventListener('click', (e) => {
            // Don't expand if clicking on the icon buttons
            if (e.target.closest('button')) return;
            e.stopPropagation();
            if (bottomSheetIsExpanded) {
                collapseBottomSheet();
            } else {
                expandBottomSheet();
            }
        });
    }

    // Touch events for dragging
    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        bottomSheetStartY = e.touches[0].clientY;
        bottomSheetCurrentY = bottomSheetStartY;
    });

    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        bottomSheetCurrentY = e.touches[0].clientY;
        const diff = bottomSheetCurrentY - bottomSheetStartY;

        if (bottomSheetIsExpanded && diff > 0) {
            // Dragging down while expanded
            bottomSheet.style.transform = `translateY(${diff}px)`;
        }
    });

    handle.addEventListener('touchend', () => {
        isDragging = false;
        const diff = bottomSheetCurrentY - bottomSheetStartY;
        const threshold = 100; // pixels

        if (bottomSheetIsExpanded && diff > threshold) {
            // Collapse
            collapseBottomSheet();
        } else {
            // Snap back
            bottomSheet.style.transform = '';
        }
    });

    // Mouse events for desktop browsers
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        bottomSheetStartY = e.clientY;
        bottomSheetCurrentY = bottomSheetStartY;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        bottomSheetCurrentY = e.clientY;
        const diff = bottomSheetCurrentY - bottomSheetStartY;

        if (bottomSheetIsExpanded && diff > 0) {
            // Dragging down while expanded
            bottomSheet.style.transform = `translateY(${diff}px)`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = bottomSheetCurrentY - bottomSheetStartY;
        const threshold = 100; // pixels

        if (bottomSheetIsExpanded && diff > threshold) {
            // Collapse
            collapseBottomSheet();
        } else {
            // Snap back
            bottomSheet.style.transform = '';
        }
    });

    // Expand on input focus
    document.getElementById('start').addEventListener('focus', expandBottomSheet);
    document.getElementById('end').addEventListener('focus', expandBottomSheet);
}

/**
 * expandBottomSheet function
 * @function expandBottomSheet
 * @returns {*} Return value description
 */
function expandBottomSheet() {
    const bottomSheet = document.getElementById('bottomSheet');
    console.log('[BottomSheet] Expanding...');
    bottomSheet.classList.add('expanded');
    bottomSheetIsExpanded = true;
    console.log('[BottomSheet] Expanded, classes:', bottomSheet.className);
}

/**
 * collapseBottomSheet function
 * @function collapseBottomSheet
 * @returns {*} Return value description
 */
function collapseBottomSheet() {
    const bottomSheet = document.getElementById('bottomSheet');
    console.log('[BottomSheet] Collapsing...');
    bottomSheet.classList.remove('expanded');
    bottomSheetIsExpanded = false;
}

// ===== GPS TRACKING FUNCTIONS =====
/**
 * startGPSTracking function
 * @function startGPSTracking
 * @returns {*} Return value description
 */
function startGPSTracking() {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    if (isTrackingActive) {
        stopGPSTracking();
        return;
    }

    isTrackingActive = true;
    trackingHistory = [];
    showStatus('🎯 GPS Tracking started...', 'success');

    // Watch position with high accuracy
    gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            const speed = position.coords.speed || 0;

            currentLat = lat;
            currentLon = lon;

            // Add to tracking history
            trackingHistory.push({
                lat: lat,
                lon: lon,
                timestamp: new Date(),
                speed: speed,
                accuracy: accuracy
            });

            // Update user marker on map with vehicle icon
            if (currentUserMarker) {
                map.removeLayer(currentUserMarker);
            }

            currentUserMarker = createVehicleMarker(lat, lon, speed, accuracy);
            currentUserMarker.addTo(map);

            // Center map on user (if not manually panned) with smooth animation
            if (!map._userPanned) {
                map.flyTo([lat, lon], 16, {
                    duration: 0.3,
                    easeLinearity: 0.25
                });
            }

            // Check for route deviation
            if (routeInProgress && routePolyline) {
                checkRouteDeviation(lat, lon);
            }

            // Check for hazards nearby
            checkNearbyHazards(lat, lon);

            // Check for variable speed limits
            updateVariableSpeedLimit(lat, lon, 'motorway', currentVehicleType);

            // Apply smart zoom with turn detection
            const speedMph = speed ? (speed * 2.237) : 0;
            let distanceToNextTurn = null;

            // Detect upcoming turns if navigation is active
            if (routeInProgress && routePolyline && routePolyline.length > 0) {
                const turnInfo = detectUpcomingTurn(lat, lon);
                if (turnInfo) {
                    distanceToNextTurn = turnInfo.distance;

                    // FIXED: Announce upcoming turns via voice
                    announceUpcomingTurn(turnInfo);
                }

                // NEW: Announce distance to destination
                announceDistanceToDestination(lat, lon);

                // FIXED: Removed announceETAUpdate() from GPS callback
                // ETA is now announced only via interval timer (every 10 minutes)
                // This prevents ETA from being announced every 1-5 seconds
            }

            applySmartZoomWithAnimation(speedMph, distanceToNextTurn, 'motorway', lat, lon);

            // ===== PHASE 2: Update lane guidance and speed warnings =====
            // Convert speed from m/s to mph (already done above)
            const speedMphFormatted = speedMph.toFixed(1);

            // Determine heading from tracking history
            let heading = 0;
            if (trackingHistory.length > 1) {
                const prev = trackingHistory[trackingHistory.length - 2];
                const curr = trackingHistory[trackingHistory.length - 1];
                const dLon = curr.lon - prev.lon;
                const dLat = curr.lat - prev.lat;
                heading = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
            }

            // Update lane guidance if navigating
            if (routeInProgress && currentRouteSteps.length > 0) {
                const nextStep = currentRouteSteps[currentStepIndex];
                const maneuver = nextStep ? nextStep.maneuver || 'straight' : 'straight';
                updateLaneGuidance(lat, lon, heading, maneuver);
            }

            // Update speed warnings (assume local roads by default)
            updateSpeedWarning(lat, lon, speedMph, 'local');

            // ===== UPDATE SPEED WIDGET =====
            // Fetch speed limit for current location and update widget
            fetch(`/api/speed-limit?lat=${lat}&lon=${lon}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.data) {
                        // FIXED: Extract speed_limit_mph from data.data object
                        const speedLimitMph = data.data.speed_limit_mph || data.data.speed_limit;
                        console.log('[Speed Limit] API response:', data.data, 'Extracted limit:', speedLimitMph);
                        updateSpeedWidget(speedMph, speedLimitMph);
                    } else {
                        console.log('[Speed Limit] No data in response:', data);
                        updateSpeedWidget(speedMph, null);
                    }
                })
                .catch(err => {
                    console.log('[Speed Limit] API error:', err);
                    updateSpeedWidget(speedMph, null);
                });
        },
        (error) => {
            showStatus('GPS Error: ' + error.message, 'error');
            isTrackingActive = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

/**
 * stopGPSTracking function
 * @function stopGPSTracking
 * @returns {*} Return value description
 */
function stopGPSTracking() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    isTrackingActive = false;
    // Hide speed widget when tracking stops
    const speedWidget = document.getElementById('speedWidget');
    if (speedWidget) {
        speedWidget.style.display = 'none';
    }
    showStatus('🛑 GPS Tracking stopped', 'info');
}

// Turn announcement variables
let announcedTurnThresholds = new Set();  // FIXED: Track each threshold independently
const TURN_ANNOUNCEMENT_DISTANCES = [500, 200, 100, 50]; // meters

// Distance-to-destination announcement variables
let lastDestinationAnnouncementDistance = Infinity;
const DESTINATION_ANNOUNCEMENT_DISTANCES = [10000, 5000, 2000, 1000, 500, 100]; // meters (10km, 5km, 2km, 1km, 500m, 100m)

// ETA announcement variables
let lastETAAnnouncementTime = 0;
let lastAnnouncedETA = null;
const ETA_ANNOUNCEMENT_INTERVAL_MS = 600000; // Announce ETA every 10 minutes (600,000 ms)
const ETA_CHANGE_THRESHOLD_MS = 300000; // Announce if ETA changes by >5 minutes (300,000 ms)
const ETA_MIN_INTERVAL_MS = 60000; // Minimum 1 minute between any ETA announcements (prevents excessive frequency)

// Voice announcements enabled flag (FIXED: separate from Web Speech API object)
let voiceAnnouncementsEnabled = true;
/**
 * getTurnDirectionText function
 * @function getTurnDirectionText
 * @param {*} direction - Parameter description
 * @returns {*} Return value description
 */
function getTurnDirectionText(direction) {
    const directionMap = {
        'sharp_left': 'sharply left',
        'left': 'left',
        'slight_left': 'slightly left',
        'straight': 'continue straight',  // FIXED: Changed from 'straight' to 'continue straight'
        'slight_right': 'slightly right',
        'right': 'right',
        'sharp_right': 'sharply right'
    };
    return directionMap[direction] || 'ahead';
}
/**
 * announceDistanceToDestination function
 * @function announceDistanceToDestination
 * @param {*} currentLat - Parameter description
 * @param {*} currentLon - Parameter description
 * @returns {*} Return value description
 */
function announceDistanceToDestination(currentLat, currentLon) {
    // FIXED: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
    if (!routeInProgress || !routePolyline || routePolyline.length === 0 || !voiceAnnouncementsEnabled) return;

    // Calculate remaining distance from current position to destination
    let remainingDistance = 0;
    let closestIndex = 0;
    let closestDistance = Infinity;

    // Find closest point on route
    for (let i = 0; i < routePolyline.length; i++) {
        const point = routePolyline[i];
        const distance = calculateHaversineDistance(currentLat, currentLon, point[0], point[1]);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = i;
        }
    }

    // Calculate remaining distance from closest point to destination
    for (let i = closestIndex; i < routePolyline.length - 1; i++) {
        remainingDistance += calculateDistance(
            routePolyline[i][0], routePolyline[i][1],
            routePolyline[i+1][0], routePolyline[i+1][1]
        );
    }

    // Check if we should announce at this distance
    for (const announcementDistance of DESTINATION_ANNOUNCEMENT_DISTANCES) {
        // Announce when within range (with hysteresis to avoid repeated announcements)
        if (remainingDistance <= announcementDistance && lastDestinationAnnouncementDistance > announcementDistance + 100) {
            let message = '';

            if (announcementDistance === 10000) {
                message = `10 kilometers to destination`;
            } else if (announcementDistance === 5000) {
                message = `5 kilometers to destination`;
            } else if (announcementDistance === 2000) {
                message = `2 kilometers to destination`;
            } else if (announcementDistance === 1000) {
                message = `1 kilometer to destination`;
            } else if (announcementDistance === 500) {
                message = `500 meters to destination`;
            } else if (announcementDistance === 100) {
                message = `Arriving at destination`;
            }

            console.log(`[Voice] Distance announcement: ${message} (remaining: ${(remainingDistance/1000).toFixed(1)}km)`);
            speakMessage(message);
            lastDestinationAnnouncementDistance = remainingDistance;
            break;
        }
    }

    // Reset announcement when destination is reached
    if (remainingDistance > 11000) {
        lastDestinationAnnouncementDistance = Infinity;
    }
}
/**
 * announceETAUpdate function
 * @function announceETAUpdate
 * @param {*} currentLat - Parameter description
 * @param {*} currentLon - Parameter description
 * @returns {*} Return value description
 * @deprecated Use announceETAIfNeeded() instead - this function is no longer called from GPS callback
 */
function announceETAUpdate(currentLat, currentLon) {
    // FIXED: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
    if (!routeInProgress || !routePolyline || routePolyline.length === 0 || !voiceAnnouncementsEnabled) return;

    const now = Date.now();

    // Calculate remaining distance
    let remainingDistance = 0;
    let closestIndex = 0;
    let closestDistance = Infinity;

    // Find closest point on route
    for (let i = 0; i < routePolyline.length; i++) {
        const point = routePolyline[i];
        const distance = calculateHaversineDistance(currentLat, currentLon, point[0], point[1]);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = i;
        }
    }

    // Calculate remaining distance from closest point to destination
    for (let i = closestIndex; i < routePolyline.length - 1; i++) {
        remainingDistance += calculateDistance(
            routePolyline[i][0], routePolyline[i][1],
            routePolyline[i+1][0], routePolyline[i+1][1]
        );
    }

    // Get average speed from recent tracking history with proper validation
    let avgSpeed = 40; // Default 40 km/h
    if (trackingHistory && trackingHistory.length > 5) {
        try {
            const recentSpeeds = trackingHistory.slice(-5)
                .map(t => {
                    // Handle both m/s and km/h formats
                    let speed = t.speed || 0;
                    // If speed is very small (< 1), assume it's in m/s, convert to km/h
                    if (speed < 1 && speed > 0) {
                        speed = speed * 3.6;
                    }
                    return speed;
                })
                .filter(s => s > 0 && s < 200); // Filter out invalid speeds (0 or > 200 km/h)

            if (recentSpeeds.length > 0) {
                avgSpeed = recentSpeeds.reduce((a, b) => a + b) / recentSpeeds.length;
                // Ensure avgSpeed is reasonable (5-200 km/h)
                avgSpeed = Math.max(5, Math.min(200, avgSpeed));
            }
        } catch (e) {
            console.warn('[Voice] Error calculating average speed:', e);
            avgSpeed = 40; // Fall back to default
        }
    }

    // FIXED: Correct ETA calculation with validation
    // Formula: time (hours) = distance (km) / speed (km/h)
    // Then convert to milliseconds
    const remainingDistanceKm = remainingDistance / 1000;

    // Prevent division by zero
    if (avgSpeed <= 0) {
        console.warn('[Voice] Invalid average speed:', avgSpeed, 'using default 40 km/h');
        avgSpeed = 40;
    }

    const timeRemainingHours = remainingDistanceKm / avgSpeed;
    const timeRemainingMs = timeRemainingHours * 3600000; // Convert hours to milliseconds

    // Sanity check: ETA should be reasonable (< 24 hours)
    if (timeRemainingMs > 86400000) {
        console.warn('[Voice] ETA exceeds 24 hours, skipping announcement');
        return;
    }

    const etaTime = new Date(now + timeRemainingMs);

    // Check if we should announce
    const timeSinceLastAnnouncement = now - lastETAAnnouncementTime;
    const etaChanged = lastAnnouncedETA && Math.abs(etaTime.getTime() - lastAnnouncedETA.getTime()) > ETA_CHANGE_THRESHOLD_MS;

    // FIXED: Enforce minimum interval (1 minute) to prevent excessive announcements
    // Only announce if: (1) 10 minutes have passed, OR (2) ETA changed by >5 minutes AND at least 1 minute has passed
    if ((timeSinceLastAnnouncement > ETA_ANNOUNCEMENT_INTERVAL_MS) ||
        (etaChanged && timeSinceLastAnnouncement > ETA_MIN_INTERVAL_MS)) {
        const etaHours = etaTime.getHours();
        const etaMinutes = etaTime.getMinutes();
        const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);

        let message = '';
        if (timeRemainingMinutes > 60) {
            const hours = Math.floor(timeRemainingMinutes / 60);
            const minutes = timeRemainingMinutes % 60;
            message = `You will arrive in ${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
        } else {
            message = `You will arrive in ${timeRemainingMinutes} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
        }

        console.log(`[Voice] ETA announcement: ${message} (remaining: ${remainingDistanceKm.toFixed(1)}km, avg speed: ${avgSpeed.toFixed(1)}km/h, time: ${timeRemainingMinutes}min)`);
        speakMessage(message);
        lastETAAnnouncementTime = now;
        lastAnnouncedETA = etaTime;
    }
}
/**
 * announceUpcomingTurn function
 * @function announceUpcomingTurn
 * @param {*} turnInfo - Parameter description
 * @returns {*} Return value description
 */
function announceUpcomingTurn(turnInfo) {
    // FIXED: Use voiceAnnouncementsEnabled boolean flag instead of voiceRecognition object
    if (!turnInfo || !voiceAnnouncementsEnabled) return;

    const distance = turnInfo.distance;

    // FIXED: Validate distance is a valid number
    if (typeof distance !== 'number' || isNaN(distance) || distance < 0) {
        console.warn('[Voice] Invalid turn distance:', distance);
        return;
    }

    const direction = turnInfo.direction || 'straight';
    const directionText = getTurnDirectionText(direction);
    const isStraight = direction === 'straight';

    // FIXED: Check each threshold independently using Set
    // This ensures all thresholds are announced (500m, 200m, 100m, 50m)
    for (const announcementDistance of TURN_ANNOUNCEMENT_DISTANCES) {
        // Announce when: (1) within range, (2) not already announced, (3) haven't passed it yet
        if (distance <= announcementDistance &&
            !announcedTurnThresholds.has(announcementDistance) &&
            distance > announcementDistance - 50) {  // 50m buffer before threshold

            let message = '';

            if (announcementDistance === 500) {
                message = isStraight
                    ? `In 500 meters, prepare to ${directionText}`
                    : `In 500 meters, prepare to turn ${directionText}`;
            } else if (announcementDistance === 200) {
                message = isStraight
                    ? `In 200 meters, ${directionText}`
                    : `In 200 meters, turn ${directionText}`;
            } else if (announcementDistance === 100) {
                message = isStraight
                    ? `In 100 meters, ${directionText}`
                    : `In 100 meters, turn ${directionText}`;
            } else if (announcementDistance === 50) {
                message = isStraight
                    ? `${directionText} now`
                    : `Turn ${directionText} now`;
            }

            console.log(`[Voice] Announcing turn: ${message} (distance: ${distance.toFixed(0)}m, direction: ${direction})`);
            speakMessage(message);
            announcedTurnThresholds.add(announcementDistance);
        }
    }

    // FIXED: Reset when turn is completely passed
    if (distance > 600) {
        announcedTurnThresholds.clear();
    }
}

// Rerouting debounce variables
let lastRerouteTime = 0;
const REROUTE_DEBOUNCE_MS = 5000; // Wait 5 seconds between reroute attempts
let lastRerouteDeviation = 0;
/**
 * checkRouteDeviation function
 * @function checkRouteDeviation
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @returns {*} Return value description
 */
function checkRouteDeviation(lat, lon) {
    // Calculate distance from current position to route
    if (!routePolyline || routePolyline.length === 0) return;

    let minDistance = Infinity;
    for (let i = 0; i < routePolyline.length; i++) {
        const point = routePolyline[i];
        const distance = calculateDistance(lat, lon, point[0], point[1]);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    // If deviation > 50 meters, trigger automatic rerouting
    if (minDistance > 50) {
        const now = Date.now();
        const timeSinceLastReroute = now - lastRerouteTime;

        // Only reroute if enough time has passed (debounce)
        if (timeSinceLastReroute > REROUTE_DEBOUNCE_MS) {
            console.log(`[Rerouting] Deviation detected: ${minDistance.toFixed(0)}m (threshold: 50m)`);
            sendNotification('Route Deviation', `You are ${minDistance.toFixed(0)}m off route. Recalculating...`, 'warning');
            triggerAutomaticReroute(lat, lon);
            lastRerouteTime = now;
        } else {
            console.log(`[Rerouting] Deviation ${minDistance.toFixed(0)}m detected but debouncing (${(REROUTE_DEBOUNCE_MS - timeSinceLastReroute).toFixed(0)}ms remaining)`);
        }
        lastRerouteDeviation = minDistance;
    }
}

async function triggerAutomaticReroute(currentLat, currentLon) {
    try {
        if (!window.lastCalculatedRoute || !window.lastCalculatedRoute.destination) {
            console.log('[Rerouting] No destination stored, cannot reroute');
            return;
        }

        const destination = window.lastCalculatedRoute.destination;
        console.log(`[Rerouting] Starting automatic reroute from (${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}) to ${destination}`);

        // Prepare route calculation request
        const routeRequest = {
            start: `${currentLat},${currentLon}`,
            end: destination,
            routing_mode: currentRoutingMode || 'auto',
            vehicle_type: currentVehicleType || 'petrol_diesel',
            fuel_efficiency: parseFloat(localStorage.getItem('fuelEfficiency') || '6.5'),
            fuel_price: parseFloat(localStorage.getItem('fuelPrice') || '1.40'),
            energy_efficiency: parseFloat(localStorage.getItem('energyEfficiency') || '18.5'),
            electricity_price: parseFloat(localStorage.getItem('electricityPrice') || '0.30'),
            include_tolls: localStorage.getItem('includeTolls') !== 'false',
            include_caz: localStorage.getItem('includeCAZ') !== 'false'
        };

        const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeRequest)
        });

        const data = await response.json();

        if (data.success && data.routes && data.routes.length > 0) {
            const newRoute = data.routes[0];
            console.log(`[Rerouting] New route calculated: ${newRoute.distance_km}km, ${newRoute.duration_minutes}min`);

            // Update route on map
            if (routeLayer) {
                map.removeLayer(routeLayer);
            }

            // Decode new route geometry
            routePolyline = decodePolyline(newRoute.geometry);
            console.log(`[Rerouting] Route polyline decoded: ${routePolyline.length} points`);

            // Draw new route on map
            routeLayer = L.polyline(routePolyline, {
                color: '#667eea',
                weight: 5,
                opacity: 0.8,
                dashArray: '5, 5'
            }).addTo(map);

            // Update trip info
            updateTripInfo(newRoute.distance_km, newRoute.duration_minutes, newRoute.fuel_cost, newRoute.toll_cost);

            // Store updated route
            window.lastCalculatedRoute = {
                ...window.lastCalculatedRoute,
                ...newRoute,
                geometry: newRoute.geometry,
                distance: `${newRoute.distance_km} km`,
                time: `${newRoute.duration_minutes} minutes`
            };

            // Announce reroute via voice
            if (voiceRecognition) {
                speakMessage(`Route recalculated. New distance: ${newRoute.distance_km} kilometers, time: ${newRoute.duration_minutes} minutes`);
            }

            sendNotification('Route Updated', `New route: ${newRoute.distance_km}km, ${newRoute.duration_minutes}min`, 'success');
            console.log('[Rerouting] Automatic reroute completed successfully');
        } else {
            console.log('[Rerouting] Failed to calculate new route:', data.error);
            sendNotification('Rerouting Failed', 'Could not calculate new route. Continuing on current route.', 'error');
        }
    } catch (error) {
        console.error('[Rerouting] Error during automatic reroute:', error);
        sendNotification('Rerouting Error', 'Error recalculating route: ' + error.message, 'error');
    }
}
/**
 * calculateDistance function
 * @function calculateDistance
 * @param {*} lat1 - Parameter description
 * @param {*} lon1 - Parameter description
 * @param {*} lat2 - Parameter description
 * @param {*} lon2 - Parameter description
 * @returns {*} Return value description
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula for distance calculation
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Return in meters
}

// Hazard announcement debouncing
const hazardAnnouncementDebounce = {}; // Track last announcement time per hazard type
const HAZARD_ANNOUNCEMENT_DEBOUNCE_MS = 30000; // Wait 30 seconds between announcements for same hazard type
const HAZARD_WARNING_DISTANCE = 500; // meters
/**
 * checkNearbyHazards function
 * @function checkNearbyHazards
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @returns {*} Return value description
 */
function checkNearbyHazards(lat, lon) {
    // Check for hazards within 500m
    fetch(`/api/hazards/nearby?lat=${lat}&lon=${lon}&radius=0.5`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.hazards && data.hazards.length > 0) {
                data.hazards.forEach(hazard => {
                    const distance = calculateDistance(lat, lon, hazard.lat, hazard.lon);
                    if (distance < HAZARD_WARNING_DISTANCE) {
                        const message = `⚠️ ${hazard.type} ${distance.toFixed(0)}m ahead`;
                        sendNotification('Hazard Alert', message, 'warning');

                        // ENHANCED: Announce via voice with debouncing per hazard type
                        if (voiceRecognition) {
                            const now = Date.now();
                            const lastAnnouncementTime = hazardAnnouncementDebounce[hazard.type] || 0;
                            const timeSinceLastAnnouncement = now - lastAnnouncementTime;

                            if (timeSinceLastAnnouncement > HAZARD_ANNOUNCEMENT_DEBOUNCE_MS) {
                                const voiceMessage = `${hazard.type.replace(/_/g, ' ')} ${distance.toFixed(0)} meters ahead`;
                                console.log(`[Voice] Hazard announcement: ${voiceMessage} (type: ${hazard.type})`);
                                speakMessage(voiceMessage);
                                hazardAnnouncementDebounce[hazard.type] = now;
                            } else {
                                console.log(`[Voice] Hazard debounced: ${hazard.type} (${(HAZARD_ANNOUNCEMENT_DEBOUNCE_MS - timeSinceLastAnnouncement).toFixed(0)}ms remaining)`);
                            }
                        }
                    }
                });
            }
        })
        .catch(error => console.log('Hazard check error:', error));
}

// ===== PHASE 1: LIVE DATA REFRESH FUNCTIONS =====
/**
 * startLiveDataRefresh function
 * @function startLiveDataRefresh
 * @returns {*} Return value description
 */
function startLiveDataRefresh() {
    if (routeInProgress) {
        // Get adaptive intervals based on battery level (Phase 3)
        const trafficInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.traffic_navigation);
        const etaInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.eta);
        const weatherInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.weather_navigation);
        const hazardInterval = getAdaptiveRefreshInterval(REFRESH_INTERVALS.hazards_navigation);

        // Traffic refresh every 5 minutes (or adaptive)
        trafficRefreshInterval = setInterval(() => {
            refreshTrafficData();
        }, trafficInterval);

        // FIXED: ETA refresh every 30 seconds (or adaptive)
        // Now includes voice announcement with proper throttling
        etaRefreshInterval = setInterval(() => {
            updateETACalculation();
            announceETAIfNeeded();  // FIXED: Announce ETA only when needed (every 10 minutes)
        }, etaInterval);

        // Weather refresh every 30 minutes (or adaptive)
        weatherRefreshInterval = setInterval(() => {
            refreshWeatherData();
        }, weatherInterval);

        // Hazard refresh every 5 minutes (or adaptive)
        hazardRefreshInterval = setInterval(() => {
            if (currentLat && currentLon) {
                checkNearbyHazards(currentLat, currentLon);
            }
        }, hazardInterval);

        console.log('[Live Data] Refresh intervals started');
    }
}

/**
 * stopLiveDataRefresh function
 * @function stopLiveDataRefresh
 * @returns {*} Return value description
 */
function stopLiveDataRefresh() {
    clearInterval(trafficRefreshInterval);
    clearInterval(etaRefreshInterval);
    clearInterval(weatherRefreshInterval);
    clearInterval(hazardRefreshInterval);
    console.log('[Live Data] Refresh intervals stopped');
}

/**
 * refreshTrafficData function
 * @function refreshTrafficData
 * @returns {*} Return value description
 */
function refreshTrafficData() {
    if (!routeInProgress || !currentLat || !currentLon) return;

    fetch(`/api/traffic-patterns?lat=${currentLat}&lon=${currentLon}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.patterns && data.patterns.length > 0) {
                const pattern = data.patterns[0];
                if (pattern.congestion > 2) {
                    sendNotification('🚗 Traffic Update',
                        `Heavy traffic ahead (Congestion: ${pattern.congestion}/5)`,
                        'warning');
                }
            }
        })
        .catch(e => console.log('[Traffic] Refresh error:', e));
}

/**
 * updateETACalculation function
 * @function updateETACalculation
 * @returns {*} Return value description
 */
function updateETACalculation() {
    if (!routeInProgress || !routePolyline || currentStepIndex === undefined) return;

    // Calculate remaining distance
    let remainingDistance = 0;
    for (let i = currentStepIndex; i < routePolyline.length - 1; i++) {
        remainingDistance += calculateDistance(
            routePolyline[i][0], routePolyline[i][1],
            routePolyline[i+1][0], routePolyline[i+1][1]
        );
    }

    // Get average speed from recent tracking history with proper validation
    let avgSpeed = 40; // Default 40 km/h
    if (trackingHistory && trackingHistory.length > 5) {
        try {
            const recentSpeeds = trackingHistory.slice(-5)
                .map(t => {
                    let speed = t.speed || 0;
                    if (speed < 1 && speed > 0) speed = speed * 3.6;
                    return speed;
                })
                .filter(s => s > 0 && s < 200);

            if (recentSpeeds.length > 0) {
                avgSpeed = recentSpeeds.reduce((a, b) => a + b) / recentSpeeds.length;
                avgSpeed = Math.max(5, Math.min(200, avgSpeed));
            }
        } catch (e) {
            console.warn('[ETA] Error calculating speed:', e);
        }
    }

    // Calculate ETA with validation
    if (avgSpeed <= 0) avgSpeed = 40;
    const timeRemaining = (remainingDistance / 1000 / avgSpeed) * 60; // minutes (convert distance to km)
    const eta = new Date(Date.now() + timeRemaining * 60000);

    // Update display
    const turnInfo = document.getElementById('turnInfo');
    if (turnInfo) {
        turnInfo.innerHTML = `
            <div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">
                <div style="font-size: 12px; color: #666;">ETA</div>
                <div style="font-size: 18px; font-weight: bold; color: #333;">
                    ${eta.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                </div>
                <div style="font-size: 12px; color: #999; margin-top: 5px;">
                    ${(remainingDistance / 1000).toFixed(1)} km remaining
                </div>
            </div>
        `;
    }
}

/**
 * announceETAIfNeeded function
 * @function announceETAIfNeeded
 * @returns {*} Return value description
 */
function announceETAIfNeeded() {
    // FIXED: Announce ETA only when needed (every 10 minutes)
    // This replaces the old announceETAUpdate() which was called on every GPS update
    if (!routeInProgress || !routePolyline || currentStepIndex === undefined || !voiceAnnouncementsEnabled) return;

    const now = Date.now();
    const timeSinceLastAnnouncement = now - lastETAAnnouncementTime;

    // Only announce if 10 minutes have passed since last announcement
    if (timeSinceLastAnnouncement > ETA_ANNOUNCEMENT_INTERVAL_MS) {
        // Calculate remaining distance
        let remainingDistance = 0;
        for (let i = currentStepIndex; i < routePolyline.length - 1; i++) {
            remainingDistance += calculateDistance(
                routePolyline[i][0], routePolyline[i][1],
                routePolyline[i+1][0], routePolyline[i+1][1]
            );
        }

        // Get average speed from recent tracking history with proper validation
        let avgSpeed = 40; // Default 40 km/h
        if (trackingHistory && trackingHistory.length > 5) {
            try {
                const recentSpeeds = trackingHistory.slice(-5)
                    .map(t => {
                        let speed = t.speed || 0;
                        if (speed < 1 && speed > 0) speed = speed * 3.6;
                        return speed;
                    })
                    .filter(s => s > 0 && s < 200);
                if (recentSpeeds.length > 0) {
                    avgSpeed = recentSpeeds.reduce((a, b) => a + b) / recentSpeeds.length;
                    avgSpeed = Math.max(5, Math.min(200, avgSpeed));
                }
            } catch (e) {
                console.warn('[ETA] Error calculating speed:', e);
            }
        }

        // Calculate ETA with validation
        if (avgSpeed <= 0) avgSpeed = 40;
        const timeRemainingMinutes = Math.round((remainingDistance / 1000 / avgSpeed) * 60);
        const eta = new Date(now + timeRemainingMinutes * 60000);
        const etaHours = eta.getHours();
        const etaMinutes = eta.getMinutes();

        let message = '';
        if (timeRemainingMinutes > 60) {
            const hours = Math.floor(timeRemainingMinutes / 60);
            const mins = timeRemainingMinutes % 60;
            message = `You will arrive in ${hours} hour${hours > 1 ? 's' : ''} and ${mins} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
        } else {
            message = `You will arrive in ${timeRemainingMinutes} minutes at ${etaHours}:${String(etaMinutes).padStart(2, '0')}`;
        }

        console.log(`[Voice] ETA announcement: ${message} (remaining: ${(remainingDistance / 1000).toFixed(1)}km, avg speed: ${avgSpeed.toFixed(1)}km/h, time: ${timeRemainingMinutes}min)`);
        speakMessage(message);
        lastETAAnnouncementTime = now;
        lastAnnouncedETA = eta;
    }
}

/**
 * refreshWeatherData function
 * @function refreshWeatherData
 * @returns {*} Return value description
 */
function refreshWeatherData() {
    if (!currentLat || !currentLon) return;

    fetch(`/api/weather?lat=${currentLat}&lon=${currentLon}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                // Check for severe weather
                if (data.description.includes('rain') ||
                    data.description.includes('storm') ||
                    data.description.includes('snow')) {
                    sendNotification('⛈️ Weather Alert',
                        `${data.description} ahead`,
                        'warning');
                }
            }
        })
        .catch(e => console.log('[Weather] Refresh error:', e));
}

// ===== PHASE 2: PWA AUTO-RELOAD FUNCTIONS =====
/**
 * saveAppState function
 * @function saveAppState
 * @returns {*} Return value description
 */
function saveAppState() {
    try {
        const state = {
            preferences: {
                tolls: localStorage.getItem('pref_tolls'),
                caz: localStorage.getItem('pref_caz'),
                speedCameras: localStorage.getItem('pref_speedCameras'),
                trafficCameras: localStorage.getItem('pref_trafficCameras'),
                policeRadars: localStorage.getItem('pref_policeRadars'),
                roadworks: localStorage.getItem('pref_roadworks'),
                accidents: localStorage.getItem('pref_accidents'),
                railwayCrossings: localStorage.getItem('pref_railwayCrossings'),
                potholes: localStorage.getItem('pref_potholes'),
                debris: localStorage.getItem('pref_debris'),
                gestureControl: localStorage.getItem('pref_gestureControl'),
                batterySaving: localStorage.getItem('pref_batterySaving'),
                mapTheme: localStorage.getItem('pref_mapTheme'),
                mlPredictions: localStorage.getItem('pref_mlPredictions')
            },
            timestamp: Date.now()
        };
        localStorage.setItem('appState', JSON.stringify(state));
        console.log('[PWA] App state saved');
    } catch (e) {
        console.log('[PWA] State save error:', e);
    }
}

/**
 * restoreAppState function
 * @function restoreAppState
 * @returns {*} Return value description
 */
function restoreAppState() {
    try {
        const saved = localStorage.getItem('appState');
        if (saved) {
            const state = JSON.parse(saved);
            // Restore preferences
            Object.keys(state.preferences).forEach(key => {
                if (state.preferences[key]) {
                    localStorage.setItem('pref_' + key, state.preferences[key]);
                }
            });
            localStorage.removeItem('appState');
            console.log('[PWA] App state restored');
        }
    } catch (e) {
        console.log('[PWA] State restore error:', e);
    }
}

// ===== PHASE 3: BATTERY-AWARE REFRESH INTERVALS =====
/**
 * getAdaptiveRefreshInterval function
 * @function getAdaptiveRefreshInterval
 * @param {*} baseInterval - Parameter description
 * @returns {*} Return value description
 */
function getAdaptiveRefreshInterval(baseInterval) {
    // Adjust refresh intervals based on battery level
    if (!('getBattery' in navigator)) {
        return baseInterval; // Use base interval if Battery API unavailable
    }

    // If battery is low, increase intervals to save power
    if (currentBatteryLevel < 0.15) {
        // Critical battery: increase intervals by 3x
        return baseInterval * 3;
    } else if (currentBatteryLevel < 0.30) {
        // Low battery: increase intervals by 2x
        return baseInterval * 2;
    } else if (currentBatteryLevel < 0.50) {
        // Medium battery: increase intervals by 1.5x
        return baseInterval * 1.5;
    }

    return baseInterval; // Normal intervals
}

/**
 * initBatteryMonitoring function
 * @function initBatteryMonitoring
 * @returns {*} Return value description
 */
function initBatteryMonitoring() {
    // Monitor battery status for adaptive refresh intervals
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            currentBatteryLevel = battery.level;
            console.log('[Battery] Initial level:', (currentBatteryLevel * 100).toFixed(0) + '%');

            battery.addEventListener('levelchange', () => {
                currentBatteryLevel = battery.level;
                console.log('[Battery] Level changed:', (currentBatteryLevel * 100).toFixed(0) + '%');

                // If battery drops below 30%, notify user
                if (currentBatteryLevel < 0.30 && routeInProgress) {
                    sendNotification('🔋 Low Battery',
                        `Battery at ${(currentBatteryLevel * 100).toFixed(0)}%. Refresh intervals adjusted.`,
                        'warning');
                }
            });

            battery.addEventListener('chargingtimechange', () => {
                console.log('[Battery] Charging time changed');
            });

            battery.addEventListener('dischargingtimechange', () => {
                console.log('[Battery] Discharging time changed');
            });

            battery.addEventListener('chargingchange', () => {
                console.log('[Battery] Charging status changed:', battery.charging ? 'charging' : 'discharging');
            });
        }).catch(e => {
            console.log('[Battery] API error:', e);
        });
    } else {
        console.log('[Battery] Battery Status API not supported');
    }
}

// ===== LOCATION FUNCTIONS =====
/**
 * getCurrentLocation function
 * @function getCurrentLocation
 * @returns {*} Return value description
 */
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    showStatus('Getting location...', 'loading');
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            currentLat = lat;
            currentLon = lon;

            // Center map on current location with smooth animation
            map.flyTo([lat, lon], 15, {
                duration: ZOOM_ANIMATION_DURATION,
                easeLinearity: 0.25
            });

            // Add marker
            if (startMarker) map.removeLayer(startMarker);
            startMarker = L.circleMarker([lat, lon], {
                radius: 8,
                fillColor: '#667eea',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map).bindPopup('Current Location');

            showStatus('Location found!', 'success');
        },
        (error) => {
            showStatus('Error: ' + error.message, 'error');
        }
    );
}
/**
 * setCurrentLocation function
 * @function setCurrentLocation
 * @param {*} field - Parameter description
 * @returns {*} Return value description
 */
function setCurrentLocation(field) {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    showStatus('Getting location...', 'loading');
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            document.getElementById(field).value = `${lat},${lon}`;
            currentLat = lat;
            currentLon = lon;
            showStatus('Location set!', 'success');
        },
        (error) => {
            showStatus('Error: ' + error.message, 'error');
        }
    );
}

// ===== AUTO GPS LOCATION FEATURE =====
/**
 * toggleAutoGpsLocation function
 * @function toggleAutoGpsLocation
 * @returns {*} Return value description
 */
function toggleAutoGpsLocation() {
    const toggle = document.getElementById('autoGpsToggle');
    autoGpsEnabled = toggle.checked;

    if (autoGpsEnabled) {
        startAutoGpsLocation();
    } else {
        stopAutoGpsLocation();
    }

    // Save preference to localStorage
    localStorage.setItem('autoGpsEnabled', autoGpsEnabled);
}

/**
 * startAutoGpsLocation function
 * @function startAutoGpsLocation
 * @returns {*} Return value description
 */
function startAutoGpsLocation() {
    if (!navigator.geolocation) {
        showStatus('❌ Geolocation not supported by your browser', 'error');
        document.getElementById('autoGpsToggle').checked = false;
        autoGpsEnabled = false;
        return;
    }

    showStatus('📍 Auto GPS location enabled. Fetching your location...', 'success');
    console.log('[Auto GPS] Starting auto location monitoring');

    // Get initial location immediately
    updateAutoGpsLocation();

    // Then update every 5 seconds
    autoGpsLocationMonitor = setInterval(() => {
        updateAutoGpsLocation();
    }, AUTO_GPS_UPDATE_INTERVAL);
}

/**
 * stopAutoGpsLocation function
 * @function stopAutoGpsLocation
 * @returns {*} Return value description
 */
function stopAutoGpsLocation() {
    if (autoGpsLocationMonitor) {
        clearInterval(autoGpsLocationMonitor);
        autoGpsLocationMonitor = null;
    }
    showStatus('📍 Auto GPS location disabled', 'info');
    console.log('[Auto GPS] Auto location monitoring stopped');
}

/**
 * updateAutoGpsLocation function
 * @function updateAutoGpsLocation
 * @returns {*} Return value description
 */
function updateAutoGpsLocation() {
    if (!autoGpsEnabled) return;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            // Update the start location field
            document.getElementById('start').value = `${lat.toFixed(6)},${lon.toFixed(6)}`;
            currentLat = lat;
            currentLon = lon;

            // Log the update
            console.log(`[Auto GPS] Location updated: ${lat.toFixed(6)}, ${lon.toFixed(6)} (accuracy: ${accuracy.toFixed(0)}m)`);

            // Show subtle notification only on first update or significant change
            if (!window.lastAutoGpsLat ||
                calculateDistance(window.lastAutoGpsLat, window.lastAutoGpsLon, lat, lon) > 0.05) {
                // Only show notification if moved more than 50 meters
                showStatus(`📍 Location updated: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 'info');
                window.lastAutoGpsLat = lat;
                window.lastAutoGpsLon = lon;
            }
        },
        (error) => {
            console.log(`[Auto GPS] Error: ${error.message}`);
            // Don't show error every time - just log it
            // This prevents notification spam if GPS is temporarily unavailable
        }
    );
}
/**
 * pickLocationFromMap function
 * @function pickLocationFromMap
 * @param {*} field - Parameter description
 * @returns {*} Return value description
 */
function pickLocationFromMap(field) {
    mapPickerMode = field;
    collapseBottomSheet();
    showStatus('Click on the map to select ' + (field === 'start' ? 'start' : 'destination') + ' location', 'loading');
}

// ===== GEOCODING FUNCTIONS =====
/**
 * initGeocodeCache function
 * @function initGeocodeCache
 * @returns {*} Return value description
 */
function initGeocodeCache() {
    try {
        const cached = localStorage.getItem(GEOCODING_CACHE_KEY);
        if (cached) {
            geocodingCache = JSON.parse(cached);
            console.log('[Geocoding] Cache loaded with', Object.keys(geocodingCache).length, 'entries');
        }
    } catch (e) {
        console.log('[Geocoding] Cache load error:', e);
        geocodingCache = {};
    }
}

/**
 * saveGeocodeCache function
 * @function saveGeocodeCache
 * @returns {*} Return value description
 */
function saveGeocodeCache() {
    try {
        localStorage.setItem(GEOCODING_CACHE_KEY, JSON.stringify(geocodingCache));
    } catch (e) {
        console.log('[Geocoding] Cache save error:', e);
    }
}

let autocompleteTimeout = null;
let autocompleteCache = {};

async function showAutocomplete(fieldId) {
    const input = document.getElementById(fieldId);
    const dropdown = document.getElementById(`autocomplete${fieldId === 'start' ? 'Start' : 'End'}`);
    const query = input.value.trim();

    // Clear previous timeout
    if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
    }

    // Hide dropdown if input is empty
    if (!query || query.length < 2) {
        dropdown.classList.remove('show');
        return;
    }

    // Show loading state
    dropdown.innerHTML = '<div class="autocomplete-loading">🔍 Searching...</div>';
    dropdown.classList.add('show');

    // Debounce the search
    autocompleteTimeout = setTimeout(async () => {
        try {
            // Check cache first
            if (autocompleteCache[query]) {
                displayAutocompleteResults(fieldId, autocompleteCache[query]);
                return;
            }

            // Fetch from Nominatim
            const response = await fetch(
                `${NOMINATIM_API}?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'Voyagr-PWA/1.0'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const results = await response.json();

            // Cache results
            autocompleteCache[query] = results;

            // Display results
            displayAutocompleteResults(fieldId, results);
        } catch (error) {
            console.error('[Autocomplete] Error:', error);
            dropdown.innerHTML = '<div class="autocomplete-no-results">❌ Search failed. Try again.</div>';
        }
    }, 300); // 300ms debounce
}
/**
 * displayAutocompleteResults function
 * @function displayAutocompleteResults
 * @param {*} fieldId - Parameter description
 * @param {*} results - Parameter description
 * @returns {*} Return value description
 */
function displayAutocompleteResults(fieldId, results) {
    const dropdown = document.getElementById(`autocomplete${fieldId === 'start' ? 'Start' : 'End'}`);

    if (!results || results.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-no-results">No results found</div>';
        return;
    }

    let html = '';
    results.forEach((result, index) => {
        const icon = getLocationIcon(result);
        const name = result.name || result.address?.road || result.address?.city || 'Location';
        const address = result.display_name || '';
        const shortAddress = address.length > 60 ? address.substring(0, 60) + '...' : address;

        html += `
            <div class="autocomplete-item" onclick="selectAutocompleteResult('${fieldId}', ${result.lat}, ${result.lon}, '${name.replace(/'/g, "\\'")}')">
                <div class="autocomplete-item-icon">${icon}</div>
                <div class="autocomplete-item-text">
                    <div class="autocomplete-item-name">${name}</div>
                    <div class="autocomplete-item-address">${shortAddress}</div>
                </div>
            </div>
        `;
    });

    dropdown.innerHTML = html;
}
/**
 * getLocationIcon function
 * @function getLocationIcon
 * @param {*} result - Parameter description
 * @returns {*} Return value description
 */
function getLocationIcon(result) {
    const type = result.type || '';
    const category = result.category || '';

    if (type === 'house' || category === 'building') return '🏠';
    if (type === 'street' || category === 'highway') return '🛣️';
    if (type === 'city' || type === 'town' || category === 'place') return '🏙️';
    if (type === 'restaurant' || category === 'amenity') return '🍽️';
    if (type === 'parking' || category === 'parking') return '🅿️';
    if (type === 'fuel' || category === 'fuel') return '⛽';
    if (type === 'hospital' || category === 'hospital') return '🏥';
    if (type === 'school' || category === 'school') return '🏫';
    if (type === 'shop' || category === 'shop') return '🛍️';
    if (type === 'airport' || category === 'airport') return '✈️';
    if (type === 'railway' || category === 'railway') return '🚂';
    if (type === 'bus_stop' || category === 'bus') return '🚌';
    if (type === 'hotel' || category === 'hotel') return '🏨';
    if (type === 'museum' || category === 'museum') return '🏛️';
    if (type === 'park' || category === 'park') return '🌳';
    if (type === 'beach' || category === 'beach') return '🏖️';
    if (type === 'mountain' || category === 'mountain') return '⛰️';
    if (type === 'lake' || category === 'water') return '🌊';
    return '📍';
}
/**
 * selectAutocompleteResult function
 * @function selectAutocompleteResult
 * @param {*} fieldId - Parameter description
 * @param {*} lat - Parameter description
 * @param {*} lon - Parameter description
 * @param {*} name - Parameter description
 * @returns {*} Return value description
 */
function selectAutocompleteResult(fieldId, lat, lon, name) {
    const input = document.getElementById(fieldId);
    const dropdown = document.getElementById(`autocomplete${fieldId === 'start' ? 'Start' : 'End'}`);

    // Set the input value to coordinates
    input.value = `${lat},${lon}`;

    // Hide dropdown
    dropdown.classList.remove('show');

    // Show confirmation
    showStatus(`✅ Selected: ${name}`, 'success');

    console.log(`[Autocomplete] Selected ${fieldId}: ${name} (${lat}, ${lon})`);
}
/**
 * isCoordinateFormat function
 * @function isCoordinateFormat
 * @param {*} input - Parameter description
 * @returns {*} Return value description
 */
function isCoordinateFormat(input) {
    // Check if input is already in "lat,lon" format
    const parts = input.trim().split(',');
    if (parts.length !== 2) return false;

    const lat = parseFloat(parts[0].trim());
    const lon = parseFloat(parts[1].trim());

    // Valid latitude: -90 to 90, Valid longitude: -180 to 180
    return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

async function geocodeAddress(address) {
    if (!address || address.trim() === '') {
        return null;
    }

    const trimmedAddress = address.trim();

    // Check if already in coordinate format
    if (isCoordinateFormat(trimmedAddress)) {
        const parts = trimmedAddress.split(',');
        const lat = parseFloat(parts[0].trim());
        const lon = parseFloat(parts[1].trim());
        console.log('[Geocoding] Input is already coordinates:', lat, lon);
        return { lat, lon, display_name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, cached: false };
    }

    // Check cache first
    if (geocodingCache[trimmedAddress]) {
        console.log('[Geocoding] Cache hit for:', trimmedAddress);
        return { ...geocodingCache[trimmedAddress], cached: true };
    }

    try {
        console.log('[Geocoding] Fetching:', trimmedAddress);
        const response = await fetch(`${NOMINATIM_API}?q=${encodeURIComponent(trimmedAddress)}&format=json&limit=1`, {
            headers: {
                'User-Agent': 'Voyagr-PWA/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            console.log('[Geocoding] No results for:', trimmedAddress);
            return null;
        }

        const result = data[0];
        const geocoded = {
            lat: parseFloat(result.lat),
            lon: parseFloat(result.lon),
            display_name: result.display_name
        };

        // Cache the result
        geocodingCache[trimmedAddress] = geocoded;
        saveGeocodeCache();

        console.log('[Geocoding] Success:', trimmedAddress, '→', geocoded.lat, geocoded.lon);
        return { ...geocoded, cached: false };
    } catch (error) {
        console.log('[Geocoding] Error:', error.message);
        return null;
    }
}

async function geocodeLocations(startAddress, endAddress) {
    isGeocoding = true;
    showStatus('🔍 Geocoding locations...', 'loading');

    try {
        // Geocode start location
        const startResult = await geocodeAddress(startAddress);
        if (!startResult) {
            showStatus('❌ Could not find start location: ' + startAddress, 'error');
            isGeocoding = false;
            return null;
        }

        // Geocode end location
        const endResult = await geocodeAddress(endAddress);
        if (!endResult) {
            showStatus('❌ Could not find end location: ' + endAddress, 'error');
            isGeocoding = false;
            return null;
        }

        // Show resolved locations
        const cacheInfo = (startResult.cached ? ' (cached)' : '') + (endResult.cached ? ' (cached)' : '');
        showStatus(`✅ Resolved: ${startResult.display_name} → ${endResult.display_name}${cacheInfo}`, 'success');

        isGeocoding = false;
        return {
            start: `${startResult.lat},${startResult.lon}`,
            end: `${endResult.lat},${endResult.lon}`,
            startName: startResult.display_name,
            endName: endResult.display_name
        };
    } catch (error) {
        console.log('[Geocoding] Error:', error);
        showStatus('❌ Geocoding error: ' + error.message, 'error');
        isGeocoding = false;
        return null;
    }
}

// ===== TURN-BY-TURN NAVIGATION FUNCTIONS =====
/**
 * startTurnByTurnNavigation function
 * @function startTurnByTurnNavigation
 * @param {*} routeData - Parameter description
 * @returns {*} Return value description
 */
function startTurnByTurnNavigation(routeData) {
    if (!routeData || !routeData.geometry) {
        showStatus('No route geometry available', 'error');
        return;
    }

    routeInProgress = true;
    currentStepIndex = 0;
    currentRouteSteps = [];

    // Decode route geometry
    try {
        routePolyline = decodePolyline(routeData.geometry);
        console.log('Route polyline decoded:', routePolyline.length, 'points');
    } catch (e) {
        console.log('Could not decode geometry:', e);
        return;
    }

    // ===== SCREEN WAKE LOCK: Keep screen on during navigation =====
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen')
            .then(wakeLock => {
                window.screenWakeLock = wakeLock;
                console.log('[Screen Wake Lock] Screen lock acquired - screen will stay on');
                showStatus('🔒 Screen lock enabled - screen will stay on', 'success');

                // Handle wake lock release
                wakeLock.addEventListener('release', () => {
                    console.log('[Screen Wake Lock] Screen lock released');
                });
            })
            .catch(err => {
                console.log('[Screen Wake Lock] Failed to acquire wake lock:', err.name, err.message);
                // This is not critical - navigation will continue without wake lock
            });
    } else {
        console.log('[Screen Wake Lock] Screen Wake Lock API not supported on this device');
    }

    // Start GPS tracking if not already active
    if (!isTrackingActive) {
        startGPSTracking();
    }

    // ===== PHASE 1: Start live data refresh =====
    startLiveDataRefresh();

    sendNotification('Navigation Started', 'Turn-by-turn guidance activated', 'success');
    speakMessage('Navigation started. Follow the route.');
    showStatus('🧭 Turn-by-turn navigation active', 'success');
}

/**
 * stopTurnByTurnNavigation function
 * @function stopTurnByTurnNavigation
 * @returns {*} Return value description
 */
function stopTurnByTurnNavigation() {
    routeInProgress = false;
    currentStepIndex = 0;
    currentRouteSteps = [];
    stopGPSTracking();

    // ===== SCREEN WAKE LOCK: Release screen lock when navigation ends =====
    if (window.screenWakeLock) {
        window.screenWakeLock.release()
            .then(() => {
                console.log('[Screen Wake Lock] Screen lock released - screen can turn off');
                window.screenWakeLock = null;
            })
            .catch(err => {
                console.log('[Screen Wake Lock] Error releasing wake lock:', err);
            });
    }

    // ===== PHASE 1: Stop live data refresh =====
    stopLiveDataRefresh();

    // ===== PHASE 2: Apply pending PWA update if available =====
    if (updatePending) {
        showStatus('🔄 Applying pending update...', 'success');
        saveAppState();
        setTimeout(() => {
            window.location.reload();
        }, 1000);
        return;
    }

    showStatus('Navigation stopped', 'info');
    sendNotification('Navigation Ended', 'Route guidance ended', 'info');
}
/**
 * updateTurnGuidance function
 * @function updateTurnGuidance
 * @param {*} userLat - Parameter description
 * @param {*} userLon - Parameter description
 * @returns {*} Return value description
 */
function updateTurnGuidance(userLat, userLon) {
    if (!routeInProgress || !routePolyline || routePolyline.length === 0) return;

    // Find closest point on route
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routePolyline.length; i++) {
        const distance = calculateDistance(userLat, userLon, routePolyline[i][0], routePolyline[i][1]);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }

    // Calculate distance to end of route
    let distanceToEnd = 0;
    for (let i = closestIndex; i < routePolyline.length - 1; i++) {
        distanceToEnd += calculateDistance(
            routePolyline[i][0], routePolyline[i][1],
            routePolyline[i + 1][0], routePolyline[i + 1][1]
        );
    }

    // Update turn guidance display
    const turnInfo = document.getElementById('turnInfo');
    if (turnInfo) {
        turnInfo.innerHTML = `
            <div style="padding: 10px; background: #f0f0f0; border-radius: 8px;">
                <div style="font-size: 14px; color: #666;">Distance to destination</div>
                <div style="font-size: 24px; font-weight: bold; color: #333;">${(distanceToEnd / 1000).toFixed(1)} km</div>
                <div style="font-size: 12px; color: #999; margin-top: 5px;">Route progress: ${((closestIndex / routePolyline.length) * 100).toFixed(0)}%</div>
            </div>
        `;
    }

    // Announce upcoming turns (every 500m)
    if (closestIndex % 50 === 0 && closestIndex > 0) {
        const nextTurnDistance = Math.min(500, distanceToEnd);
        if (nextTurnDistance < 500) {
            speakMessage(`Turn ahead in ${nextTurnDistance.toFixed(0)} meters`);
        }
    }
}

// ===== QUICK SEARCH FUNCTIONS =====
/**
 * quickSearch function
 * @function quickSearch
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function quickSearch(type) {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported', 'error');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            const searchTerms = {
                'parking': 'parking near ' + lat + ',' + lon,
                'fuel': 'gas station near ' + lat + ',' + lon,
                'food': 'restaurant near ' + lat + ',' + lon
            };

            document.getElementById('end').value = searchTerms[type] || type;
            showStatus('Search term set. Click Calculate Route to find ' + type, 'success');
            expandBottomSheet();
        },
        (error) => {
            showStatus('Error getting location: ' + error.message, 'error');
        }
    );
}

// ===== NOTIFICATIONS SYSTEM FUNCTIONS =====
/**
 * sendNotification function
 * @function sendNotification
 * @param {*} title - Parameter description
 * @param {*} message - Parameter description
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function sendNotification(title, message, type = 'info') {
    // Throttle notifications to prevent spam
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) {
        return;
    }
    lastNotificationTime = now;

    // Send browser push notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const notification = new Notification(title, {
                body: message,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: type,
                requireInteraction: type === 'warning' || type === 'error'
            });

            // Auto-close after 5 seconds (unless warning/error)
            if (type !== 'warning' && type !== 'error') {
                setTimeout(() => notification.close(), 5000);
            }

            notification.onclick = () => {
                window.focus();
                notification.close();
            };
        } catch (e) {
            console.log('Notification error:', e);
        }
    }

    // Also show in-app notification
    showInAppNotification(title, message, type);
}
/**
 * showInAppNotification function
 * @function showInAppNotification
 * @param {*} title - Parameter description
 * @param {*} message - Parameter description
 * @param {*} type - Parameter description
 * @returns {*} Return value description
 */
function showInAppNotification(title, message, type = 'info') {
    // Create notification element
    const notifContainer = document.getElementById('notificationContainer');
    if (!notifContainer) {
        console.log('Notification container not found');
        return;
    }

    const notif = document.createElement('div');
    notif.className = `in-app-notification notification-${type}`;
    notif.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
                <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
                <div style="font-size: 14px; opacity: 0.9;">${message}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; cursor: pointer; font-size: 18px;">×</button>
        </div>
    `;

    notifContainer.appendChild(notif);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notif.parentElement) {
            notif.remove();
        }
    }, 5000);
}
/**
 * speakMessage function
 * @function speakMessage
 * @param {*} message - Parameter description
 * @returns {*} Return value description
 */
function speakMessage(message) {
    // Use Web Speech API for voice output
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        speechSynthesis.speak(utterance);
    }
}
/**
 * sendETANotification function
 * @function sendETANotification
 * @param {*} eta - Parameter description
 * @param {*} distance - Parameter description
 * @returns {*} Return value description
 */
function sendETANotification(eta, distance) {
    const etaTime = new Date(eta);
    const timeStr = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sendNotification('ETA Update', `Arriving at ${timeStr} (${distance} remaining)`, 'info');
}

/**
 * sendArrivalNotification function
 * @function sendArrivalNotification
 * @returns {*} Return value description
 */
function sendArrivalNotification() {
    sendNotification('🎉 Destination Reached', 'You have arrived at your destination', 'success');
    speakMessage('You have arrived at your destination');
    stopTurnByTurnNavigation();
}

// ===== PREFERENCE FUNCTIONS =====
/**
 * togglePreference function
 * @function togglePreference
 * @param {*} pref - Parameter description
 * @returns {*} Return value description
 */
function togglePreference(pref) {
    // Map preference names to button IDs
    const buttonIdMap = {
        'tolls': 'avoidTolls',
        'caz': 'avoidCAZ',
        'speedCameras': 'avoidSpeedCameras',
        'trafficCameras': 'avoidTrafficCameras',
        'variableSpeedAlerts': 'variableSpeedAlerts'
    };

    const buttonId = buttonIdMap[pref] || ('avoid' + pref.charAt(0).toUpperCase() + pref.slice(1));
    const button = document.getElementById(buttonId);

    if (!button) {
        console.warn('[Preferences] Button not found for preference:', pref, 'ID:', buttonId);
        return;
    }

    button.classList.toggle('active');
    const isActive = button.classList.contains('active');
    localStorage.setItem('pref_' + pref, isActive ? 'true' : 'false');

    // Update visual state with proper styling
    if (isActive) {
        button.style.background = '#4CAF50';
        button.style.borderColor = '#4CAF50';
        button.style.color = 'white';
    } else {
        button.style.background = '#ddd';
        button.style.borderColor = '#999';
        button.style.color = '#333';
    }

    // Handle specific preference behaviors
    if (pref === 'caz') {
        console.log('[Settings] CAZ avoidance:', isActive ? 'enabled' : 'disabled');
        showStatus(`🚫 CAZ avoidance ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'tolls') {
        console.log('[Settings] Toll avoidance:', isActive ? 'enabled' : 'disabled');
        showStatus(`💰 Toll avoidance ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'variableSpeedAlerts') {
        console.log('[Settings] Variable speed alerts:', isActive ? 'enabled' : 'disabled');
        showStatus(`📊 Variable speed alerts ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'speedCameras') {
        console.log('[Settings] Speed camera avoidance:', isActive ? 'enabled' : 'disabled');
        showStatus(`📷 Speed camera avoidance ${isActive ? 'enabled' : 'disabled'}`, 'info');
    } else if (pref === 'trafficCameras') {
        console.log('[Settings] Traffic camera avoidance:', isActive ? 'enabled' : 'disabled');
        showStatus(`📹 Traffic camera avoidance ${isActive ? 'enabled' : 'disabled'}`, 'info');
    }

    // Save all settings to persistent storage
    saveAllSettings();
}

/**
 * loadPreferences function
 * @function loadPreferences
 * @returns {*} Return value description
 */
function loadPreferences() {
    const buttonIdMap = {
        'tolls': 'avoidTolls',
        'caz': 'avoidCAZ',
        'speedCameras': 'avoidSpeedCameras',
        'trafficCameras': 'avoidTrafficCameras',
        'variableSpeedAlerts': 'variableSpeedAlerts'
    };

    const prefs = ['tolls', 'caz', 'speedCameras', 'trafficCameras', 'variableSpeedAlerts'];
    prefs.forEach(pref => {
        const saved = localStorage.getItem('pref_' + pref);
        const buttonId = buttonIdMap[pref];
        const button = document.getElementById(buttonId);

        if (button) {
            if (saved === 'true') {
                button.classList.add('active');
                button.style.background = '#4CAF50';
                button.style.borderColor = '#4CAF50';
                button.style.color = 'white';
                console.log('[Settings] Loaded preference:', pref, '= enabled');
            } else {
                button.classList.remove('active');
                button.style.background = '#ddd';
                button.style.borderColor = '#999';
                button.style.color = '#333';
                console.log('[Settings] Loaded preference:', pref, '= disabled');
            }
        } else {
            console.warn('[Settings] Button not found for preference:', pref, 'ID:', buttonId);
        }
    });

    // ===== LOAD GESTURE CONTROL PREFERENCE =====
    const gestureSaved = localStorage.getItem('gestureEnabled');
    if (gestureSaved === 'true') {
        const button = document.getElementById('gestureEnabled');
        if (button) {
            button.classList.add('active');
            button.style.background = '#4CAF50';
            button.style.borderColor = '#4CAF50';
            gestureEnabled = true;
            document.getElementById('gestureSettings').style.display = 'block';
            if ('DeviceMotionEvent' in window) {
                window.addEventListener('devicemotion', handleDeviceMotion);
            }
        }
    }

    // ===== LOAD AUTO GPS PREFERENCE =====
    const autoGpsSaved = localStorage.getItem('autoGpsEnabled');
    if (autoGpsSaved === 'true') {
        const toggle = document.getElementById('autoGpsToggle');
        if (toggle) {
            toggle.checked = true;
            autoGpsEnabled = true;
            startAutoGpsLocation();
            console.log('[Auto GPS] Preference restored from localStorage');
        }
    }

    // ===== LOAD BATTERY SAVING MODE PREFERENCE =====
    const batterySavingSaved = localStorage.getItem('pref_batterySaving');
    if (batterySavingSaved === 'true') {
        const button = document.getElementById('batterySavingMode');
        if (button) {
            button.classList.add('active');
            button.style.background = '#4CAF50';
            button.style.borderColor = '#4CAF50';
            batterySavingMode = true;
            console.log('[Battery] Battery saving mode restored from localStorage');
        }
    }
}

// Update trip info display
/**
 * updateTripInfo function
 * @function updateTripInfo
 * @param {*} distance - Parameter description (can be string like "8.64 km" or number)
 * @param {*} time - Parameter description
 * @param {*} fuelCost - Parameter description
 * @param {*} tollCost - Parameter description
 * @returns {*} Return value description
 */
function updateTripInfo(distance, time, fuelCost, tollCost) {
    const tripInfo = document.getElementById('tripInfo');
    if (distance && time) {
        // Extract km value from distance (handle both "8.64 km" string and numeric formats)
        let distanceKm = 0;
        if (typeof distance === 'string') {
            distanceKm = parseFloat(distance) || 0;
        } else {
            distanceKm = parseFloat(distance) || 0;
        }

        // Store km value in data attribute for unit conversion
        const distanceEl = document.getElementById('distance');
        distanceEl.dataset.km = distanceKm;
        distanceEl.textContent = convertDistance(distanceKm) + ' ' + getDistanceUnit();

        document.getElementById('time').textContent = time;
        document.getElementById('fuelCost').textContent = fuelCost || '-';
        document.getElementById('tollCost').textContent = tollCost || '-';
        tripInfo.classList.add('show');
    }
}

// Update clearForm to also hide trip info
const originalClearForm = clearForm;
clearForm = function() {
    originalClearForm();
    document.getElementById('tripInfo').classList.remove('show');
};

// Update calculateRoute to show trip info
const originalCalculateRoute = calculateRoute;
calculateRoute = function() {
    originalCalculateRoute();
    // Trip info will be updated when route is calculated
}
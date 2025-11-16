/**
 * Voyagr Navigation App - Main Entry Point
 * Initializes all modules and sets up event listeners
 * @module app
 */

/**
 * Initialize the Voyagr application
 * Called when DOM is fully loaded
 * @function initializeApp
 * @returns {void}
 */
function initializeApp() {
    console.log('[App] Initializing Voyagr Navigation App...');
    
    try {
        // Initialize core components
        initializeMap();
        console.log('[App] Map initialized');

        // Setup map click handler for location picker
        setupMapClickHandler();
        console.log('[App] Map click handler setup');

        // Setup map move handler
        setupMapMoveHandler();
        console.log('[App] Map move handler setup');

        // Load user preferences
        loadAllSettings();
        console.log('[App] Settings loaded');

        // Initialize UI components
        initBottomSheet();
        console.log('[App] Bottom sheet initialized');
        
        // Initialize voice recognition
        initVoiceRecognition();
        console.log('[App] Voice recognition initialized');
        
        // Initialize Phase 3 features
        initPhase3Features();
        console.log('[App] Phase 3 features initialized');
        
        // Initialize battery monitoring
        initBatteryMonitoring();
        console.log('[App] Battery monitoring initialized');
        
        // Initialize geocode cache
        initGeocodeCache();
        console.log('[App] Geocode cache initialized');
        
        // Setup event listeners
        setupEventListeners();
        console.log('[App] Event listeners setup');
        
        // Restore app state if available
        restoreAppState();
        console.log('[App] App state restored');
        
        console.log('[App] Voyagr Navigation App initialized successfully!');
    } catch (error) {
        console.error('[App] Error initializing app:', error);
        showStatus('Error initializing app. Please refresh the page.', 'error');
    }
}

/**
 * Setup all event listeners for the application
 * @function setupEventListeners
 * @returns {void}
 */
function setupEventListeners() {
    // Calculate route button
    const calculateBtn = document.getElementById('calculateBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateRoute);
    }
    
    // Clear form button
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearForm);
    }
    
    // Voice input button
    const voiceFab = document.getElementById('voiceFab');
    if (voiceFab) {
        voiceFab.addEventListener('click', toggleVoiceInput);
    }
    
    // Location buttons
    const startLocationBtn = document.getElementById('startLocationBtn');
    if (startLocationBtn) {
        startLocationBtn.addEventListener('click', () => setCurrentLocation('start'));
    }
    
    const endLocationBtn = document.getElementById('endLocationBtn');
    if (endLocationBtn) {
        endLocationBtn.addEventListener('click', () => setCurrentLocation('end'));
    }
    
    // Tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    // Theme selector
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        option.addEventListener('click', (e) => setTheme(e.target.dataset.theme));
    });
    
    // Preference toggles - Note: These are handled by inline onclick handlers in HTML
    // The buttons have onclick="togglePreference('preference_name')" attributes
    // No need to add event listeners here as they would conflict with the inline handlers
    
    // Unit preference selectors
    const distanceSelect = document.getElementById('distanceUnit');
    if (distanceSelect) {
        distanceSelect.addEventListener('change', updateDistanceUnit);
    }
    
    const currencySelect = document.getElementById('currencyUnit');
    if (currencySelect) {
        currencySelect.addEventListener('change', updateCurrencyUnit);
    }
    
    const speedSelect = document.getElementById('speedUnit');
    if (speedSelect) {
        speedSelect.addEventListener('change', updateSpeedUnit);
    }
    
    const temperatureSelect = document.getElementById('temperatureUnit');
    if (temperatureSelect) {
        temperatureSelect.addEventListener('change', updateTemperatureUnit);
    }
    
    // Map click for location picker
    if (map) {
        map.on('click', (e) => {
            if (mapPickerMode) {
                selectAutocompleteResult(mapPickerMode, e.latlng.lat, e.latlng.lng, 'Selected Location');
                mapPickerMode = null;
            }
        });
    }
    
    console.log('[App] Event listeners setup complete');
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

// Save app state before unload
window.addEventListener('beforeunload', saveAppState);


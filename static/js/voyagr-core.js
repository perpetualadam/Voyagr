/**
 * Voyagr Navigation App - Core Module
 * Handles map initialization, core variables, and utility functions
 * @module voyagr-core
 */

// ===== CORE VARIABLES =====
let map = null;
let routeLayer = null;
let startMarker = null;
let endMarker = null;
let mapPickerMode = null; // 'start' or 'end' when picking location from map

// ===== ZOOM AND FOLLOW VARIABLES =====
let zoomAndFollowEnabled = localStorage.getItem('zoomAndFollowEnabled') === 'true' || true; // Default: enabled
let mapFollowingActive = false; // Whether we're currently following the vehicle

// ===== UNIT CONVERSION VARIABLES =====
let distanceUnit = localStorage.getItem('unit_distance') || 'mi';  // Default: miles
let currencyUnit = localStorage.getItem('unit_currency') || 'GBP';
let speedUnit = localStorage.getItem('unit_speed') || 'mph';  // Default: mph
let temperatureUnit = localStorage.getItem('unit_temperature') || 'celsius';

const currencySymbols = {
    'GBP': '£',
    'USD': '$',
    'EUR': '€'
};

/**
 * Initialize the map with Leaflet
 * @function initializeMap
 * @returns {void}
 */
function initializeMap() {
    // Check if map is already initialized
    if (map !== null) {
        console.log('[Init] Map already initialized, skipping');
        return;
    }

    // Suppress ethereum property redefinition warning from browser extensions
    if (typeof window !== 'undefined' && window.ethereum) {
        try {
            Object.defineProperty(window, 'ethereum', {
                value: window.ethereum,
                writable: false,
                configurable: false
            });
        } catch (e) {
            console.log('[Init] Ethereum property already defined by extension');
        }
    }

    // Initialize map with MapLibre GL JS - Using OpenFreeMap for 3D building support
    map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [-0.1278, 51.5074], // Default: London [lon, lat]
        zoom: 13,
        pitch: 0, // Start flat, will tilt for driving mode
        bearing: 0,
        maxPitch: 85, // Allow steep pitch for driving perspective
        pitchWithRotate: true // Enable pitch control with mouse/touch
    });

    // Handle missing images (POI icons) by providing a transparent placeholder
    // This suppresses "Image 'x' could not be loaded" errors in the console
    map.on('styleimagemissing', (e) => {
        const id = e.id;
        if (!map.hasImage(id)) {
            // Create a 1x1 transparent image
            const width = 1;
            const height = 1;
            const bytes = new Uint8Array(width * height * 4); // RGBA
            map.addImage(id, { width, height, data: bytes });
        }
    });

    // Attempt to center on current location on load
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                console.log(`[Init] Centering on user: [${lat}, ${lon}]`);
                map.flyTo({
                    center: [lon, lat],
                    zoom: 15,
                    duration: 2000
                });
            },
            (error) => {
                console.log('[Init] Geolocation failed or denied:', error.message);
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
    }
    // Add navigation controls (zoom and rotation)
    map.addControl(new maplibregl.NavigationControl());

    // Enable 3D buildings
    MapLibreHelpers.add3DBuildings(map);

    // Configure road name labels with zoom-level-based visibility
    // Labels will be visible during navigation and remain readable at 65° pitch
    MapLibreHelpers.configureRoadLabels(map, {
        enabled: true,
        minZoom: 10,
        maxZoom: 22,
        textColor: '#000000',
        textHaloColor: '#ffffff',
        textHaloWidth: 1.5,
        textSize: 12
    });

    // Set zoom-level-based filtering for different road types
    MapLibreHelpers.setRoadLabelZoomFilters(map, {
        motorwayMinZoom: 5,      // Show motorways from zoom 5+
        mainRoadMinZoom: 10,     // Show A/B roads from zoom 10+
        streetMinZoom: 14        // Show all streets from zoom 14+
    });

    console.log('[Init] Map initialized successfully');
}

/**
 * Convert distance from kilometers to selected unit
 * @function convertDistance
 * @param {number} km - Distance in kilometers
 * @returns {string} Converted distance
 */
function convertDistance(km) {
    if (distanceUnit === 'mi') {
        return (km * 0.621371).toFixed(2);
    }
    return km.toFixed(2);
}

/**
 * Get the current distance unit
 * @function getDistanceUnit
 * @returns {string} Distance unit ('km' or 'mi')
 */
function getDistanceUnit() {
    return distanceUnit === 'mi' ? 'mi' : 'km';
}

/**
 * Convert speed from km/h to selected unit
 * @function convertSpeed
 * @param {number} kmh - Speed in kilometers per hour
 * @returns {string} Converted speed
 */
function convertSpeed(kmh) {
    if (speedUnit === 'mph') {
        return (kmh * 0.621371).toFixed(1);
    }
    return kmh.toFixed(1);
}

/**
 * Get the current speed unit
 * @function getSpeedUnit
 * @returns {string} Speed unit ('km/h' or 'mph')
 */
function getSpeedUnit() {
    return speedUnit === 'mph' ? 'mph' : 'km/h';
}

/**
 * Convert temperature from Celsius to selected unit
 * @function convertTemperature
 * @param {number} celsius - Temperature in Celsius
 * @returns {string} Converted temperature
 */
function convertTemperature(celsius) {
    if (temperatureUnit === 'fahrenheit') {
        return ((celsius * 9 / 5) + 32).toFixed(1);
    }
    return celsius.toFixed(1);
}

/**
 * Get the current temperature unit
 * @function getTemperatureUnit
 * @returns {string} Temperature unit ('°C' or '°F')
 */
function getTemperatureUnit() {
    return temperatureUnit === 'fahrenheit' ? '°F' : '°C';
}

/**
 * Calculate Haversine distance between two coordinates
 * @function calculateDistance
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', initializeMap);


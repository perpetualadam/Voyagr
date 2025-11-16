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
let distanceUnit = localStorage.getItem('unit_distance') || 'km';
let currencyUnit = localStorage.getItem('unit_currency') || 'GBP';
let speedUnit = localStorage.getItem('unit_speed') || 'kmh';
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

    // Initialize map
    map = L.map('map').setView([51.5074, -0.1278], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
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
        return ((celsius * 9/5) + 32).toFixed(1);
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
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', initializeMap);


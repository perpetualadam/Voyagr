/**
 * @file Core constants for Voyagr PWA
 * @module core/constants
 */

// API Configuration
export const API_CONFIG = {
    ROUTE_ENDPOINT: '/api/route',
    WEATHER_ENDPOINT: '/api/weather',
    TRAFFIC_ENDPOINT: '/api/traffic-patterns',
    SPEED_LIMIT_ENDPOINT: '/api/speed-limit',
    HAZARDS_ENDPOINT: '/api/hazards/nearby',
    BATCH_ENDPOINT: '/api/batch',
    CHARGING_ENDPOINT: '/api/charging-stations',
    TRIP_HISTORY_ENDPOINT: '/api/trip-history',
    COST_BREAKDOWN_ENDPOINT: '/api/cost-breakdown',
    REPORT_HAZARD_ENDPOINT: '/api/hazards/report'
};

// Map Configuration
export const MAP_CONFIG = {
    DEFAULT_CENTER: [51.5074, -0.1278], // London
    DEFAULT_ZOOM: 13,
    MIN_ZOOM: 5,
    MAX_ZOOM: 19,
    TILE_LAYER: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ATTRIBUTION: '© OpenStreetMap contributors'
};

// Routing Engines
export const ROUTING_ENGINES = {
    GRAPHHOPPER: 'GraphHopper',
    VALHALLA: 'Valhalla',
    OSRM: 'OSRM'
};

// Routing Modes
export const ROUTING_MODES = {
    AUTO: 'auto',
    PEDESTRIAN: 'pedestrian',
    BICYCLE: 'bicycle'
};

// Vehicle Types
export const VEHICLE_TYPES = {
    CAR: 'car',
    ELECTRIC: 'electric',
    MOTORCYCLE: 'motorcycle',
    TRUCK: 'truck',
    VAN: 'van'
};

// Hazard Types
export const HAZARD_TYPES = {
    SPEED_CAMERA: 'speed_camera',
    TRAFFIC_CAMERA: 'traffic_camera',
    POLICE: 'police',
    ROADWORKS: 'roadworks',
    ACCIDENT: 'accident',
    RAILWAY_CROSSING: 'railway_crossing',
    POTHOLE: 'pothole',
    DEBRIS: 'debris'
};

// Cache Configuration
export const CACHE_CONFIG = {
    DEFAULT_TTL: 300000, // 5 minutes
    MAX_SIZE: 1000,
    ROUTE_TTL: 600000, // 10 minutes
    WEATHER_TTL: 1800000, // 30 minutes
    TRAFFIC_TTL: 300000, // 5 minutes
    SPEED_LIMIT_TTL: 3600000 // 1 hour
};

// Deduplication Configuration
export const DEDUP_CONFIG = {
    WINDOW: 5000, // 5 seconds
    CLEANUP_INTERVAL: 10000 // 10 seconds
};

// Batch Configuration
export const BATCH_CONFIG = {
    TIMEOUT: 100, // 100ms
    MAX_SIZE: 10, // 10 requests per batch
    ENABLED: true
};

// UI Configuration
export const UI_CONFIG = {
    ANIMATION_DURATION: 500, // 500ms
    DEBOUNCE_DELAY: 300, // 300ms
    TOAST_DURATION: 3000, // 3 seconds
    PANEL_ANIMATION: 300 // 300ms
};

// GPS Configuration
export const GPS_CONFIG = {
    ACCURACY_THRESHOLD: 50, // 50 meters
    UPDATE_INTERVAL: 1000, // 1 second
    TIMEOUT: 10000, // 10 seconds
    MAX_AGE: 0 // Always get fresh location
};

// Voice Configuration
export const VOICE_CONFIG = {
    WAKE_WORD: 'Hey SatNav',
    LANGUAGE: 'en-GB',
    RATE: 1.0,
    PITCH: 1.0,
    VOLUME: 1.0
};

// Storage Keys
export const STORAGE_KEYS = {
    SETTINGS: 'voyagr_settings',
    TRIP_HISTORY: 'voyagr_trip_history',
    SAVED_ROUTES: 'voyagr_saved_routes',
    PREFERENCES: 'voyagr_preferences',
    CACHE: 'voyagr_cache',
    THEME: 'voyagr_theme',
    UNITS: 'voyagr_units'
};

// Default Settings
export const DEFAULT_SETTINGS = {
    units: 'metric',
    theme: 'auto',
    language: 'en',
    routingMode: 'auto',
    vehicleType: 'car',
    enableHazardAvoidance: true,
    enableTrafficUpdates: true,
    enableVoiceGuidance: true,
    enableOfflineMode: false
};

// Error Messages
export const ERROR_MESSAGES = {
    LOCATION_ERROR: 'Unable to get your location',
    ROUTE_ERROR: 'Unable to calculate route',
    NETWORK_ERROR: 'Network connection error',
    API_ERROR: 'API error occurred',
    STORAGE_ERROR: 'Storage error occurred',
    PERMISSION_ERROR: 'Permission denied'
};

// Success Messages
export const SUCCESS_MESSAGES = {
    ROUTE_CALCULATED: 'Route calculated successfully',
    TRIP_SAVED: 'Trip saved successfully',
    SETTINGS_SAVED: 'Settings saved successfully',
    HAZARD_REPORTED: 'Hazard reported successfully'
};

export default {
    API_CONFIG,
    MAP_CONFIG,
    ROUTING_ENGINES,
    ROUTING_MODES,
    VEHICLE_TYPES,
    HAZARD_TYPES,
    CACHE_CONFIG,
    DEDUP_CONFIG,
    BATCH_CONFIG,
    UI_CONFIG,
    GPS_CONFIG,
    VOICE_CONFIG,
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES
};


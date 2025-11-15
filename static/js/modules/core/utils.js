/**
 * @file Core utility functions for Voyagr PWA
 * @module core/utils
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @function calculateDistance
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Format distance for display
 * @function formatDistance
 * @param {number} km - Distance in kilometers
 * @param {string} units - 'metric' or 'imperial'
 * @returns {string} Formatted distance string
 */
export function formatDistance(km, units = 'metric') {
    if (units === 'imperial') {
        const miles = km * 0.621371;
        return miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
    }
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Format time duration
 * @function formatDuration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Format currency
 * @function formatCurrency
 * @param {number} amount - Amount in currency
 * @param {string} currency - Currency code (e.g., 'GBP')
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'GBP') {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

/**
 * Debounce function
 * @function debounce
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

/**
 * Throttle function
 * @function throttle
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Deep clone object
 * @function deepClone
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge objects
 * @function mergeObjects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
export function mergeObjects(target, source) {
    return { ...target, ...source };
}

/**
 * Get URL parameters
 * @function getUrlParams
 * @returns {Object} URL parameters
 */
export function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

/**
 * Set URL parameter
 * @function setUrlParam
 * @param {string} key - Parameter key
 * @param {string} value - Parameter value
 */
export function setUrlParam(key, value) {
    const params = new URLSearchParams(window.location.search);
    params.set(key, value);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

/**
 * Check if device is mobile
 * @function isMobile
 * @returns {boolean} True if mobile device
 */
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Check if device is online
 * @function isOnline
 * @returns {boolean} True if online
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Get device orientation
 * @function getOrientation
 * @returns {string} 'portrait' or 'landscape'
 */
export function getOrientation() {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

/**
 * Sleep for specified milliseconds
 * @function sleep
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    calculateDistance,
    formatDistance,
    formatDuration,
    formatCurrency,
    debounce,
    throttle,
    deepClone,
    mergeObjects,
    getUrlParams,
    setUrlParam,
    isMobile,
    isOnline,
    getOrientation,
    sleep
};


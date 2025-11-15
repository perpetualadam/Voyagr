/**
 * @file Weather Feature Module - Handles weather data
 * @module modules/features/weather
 */

/**
 * WeatherManager class - Manages weather information
 * @class WeatherManager
 */
export class WeatherManager {
    constructor(config = {}) {
        this.weatherData = null;
        this.cacheTime = config.cacheTime || 1800000; // 30 minutes
        this.lastUpdate = null;
        this.listeners = new Map();
    }

    /**
     * Fetch weather for location
     * @async
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {Promise<Object>} Weather data
     */
    async fetchWeather(lat, lon) {
        // Check cache
        if (this.weatherData && Date.now() - this.lastUpdate < this.cacheTime) {
            return this.weatherData;
        }

        try {
            const response = await fetch('/api/weather', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lon })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.weatherData = data;
            this.lastUpdate = Date.now();
            this.emit('weatherUpdated', data);
            return data;
        } catch (error) {
            this.emit('error', { message: error.message });
            return null;
        }
    }

    /**
     * Get current weather
     * @returns {Object} Current weather
     */
    getCurrentWeather() {
        return this.weatherData;
    }

    /**
     * Check if weather is severe
     * @returns {boolean} Is severe weather
     */
    isSevereWeather() {
        if (!this.weatherData) return false;

        const condition = this.weatherData.condition || '';
        const severity = this.weatherData.severity || 'low';

        return severity === 'high' || 
               condition.includes('storm') ||
               condition.includes('heavy rain') ||
               condition.includes('snow');
    }

    /**
     * Get weather impact on routing
     * @returns {Object} Weather impact
     */
    getWeatherImpact() {
        if (!this.weatherData) return null;

        const impact = {
            speedReduction: 0,
            routeAvoidance: [],
            warnings: []
        };

        const condition = this.weatherData.condition || '';
        const temperature = this.weatherData.temperature || 20;

        if (condition.includes('rain')) {
            impact.speedReduction = 10;
            impact.warnings.push('Wet roads - reduce speed');
        }

        if (condition.includes('snow') || temperature < 0) {
            impact.speedReduction = 20;
            impact.warnings.push('Icy conditions - use caution');
        }

        if (condition.includes('fog')) {
            impact.speedReduction = 15;
            impact.warnings.push('Low visibility - use headlights');
        }

        if (this.isSevereWeather()) {
            impact.warnings.push('Severe weather - consider alternative route');
        }

        return impact;
    }

    /**
     * Get weather forecast
     * @returns {Array} Weather forecast
     */
    getForecast() {
        if (!this.weatherData || !this.weatherData.forecast) return [];
        return this.weatherData.forecast;
    }

    /**
     * Clear weather data
     */
    clearWeather() {
        this.weatherData = null;
        this.lastUpdate = null;
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }
}


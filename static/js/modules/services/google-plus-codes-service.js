/**
 * Google Plus Codes Service
 * Converts between coordinates and Google Plus Codes (also known as Open Location Code)
 * 
 * Plus Codes are short, memorable location codes that work offline
 * Example: 8FWC+5X San Francisco, CA, USA
 * 
 * Free, open-source alternative to What3Words
 * No API key required - uses client-side encoding/decoding
 */

class GooglePlusCodesService {
    constructor() {
        this.name = 'Google Plus Codes';
        this.codeLength = 5; // Standard Plus Code length (e.g., 8FWC+5X = 7 chars)
        this.shortCodeLength = 6; // Short code length (e.g., +5X)
        this.cache = new Map();
    }

    /**
     * Encode coordinates to Plus Code
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} codeLength - Length of code (default 10)
     * @returns {string} Plus Code
     */
    encode(lat, lon, codeLength = this.codeLength) {
        if (!this.isValidCoordinates(lat, lon)) {
            throw new Error('Invalid coordinates');
        }

        // Use OpenLocationCode library if available, otherwise use simple encoding
        if (typeof OpenLocationCode !== 'undefined') {
            return OpenLocationCode.encode(lat, lon, codeLength);
        }

        // Fallback: Simple encoding (not as accurate but works)
        return this.simpleEncode(lat, lon, codeLength);
    }

    /**
     * Decode Plus Code to coordinates
     * @param {string} code - Plus Code (e.g., 8FWC+5X)
     * @returns {object} {lat, lon, accuracy}
     */
    decode(code) {
        if (!this.isValidCode(code)) {
            throw new Error('Invalid Plus Code format');
        }

        // Check cache first
        const cached = this.cache.get(code);
        if (cached) {
            return cached;
        }

        // Use OpenLocationCode library if available
        if (typeof OpenLocationCode !== 'undefined') {
            const result = OpenLocationCode.decode(code);
            const decoded = {
                lat: result.latitudeCenter,
                lon: result.longitudeCenter,
                accuracy: result.latitudeHeight,
                code: code
            };
            this.cache.set(code, decoded);
            return decoded;
        }

        // Fallback: Simple decoding
        return this.simpleDecode(code);
    }

    /**
     * Validate coordinates
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {boolean}
     */
    isValidCoordinates(lat, lon) {
        return typeof lat === 'number' && typeof lon === 'number' &&
               lat >= -90 && lat <= 90 &&
               lon >= -180 && lon <= 180;
    }

    /**
     * Validate Plus Code format
     * @param {string} code - Plus Code
     * @returns {boolean}
     */
    isValidCode(code) {
        if (typeof code !== 'string' || code.length === 0) return false;

        const alphabet = '23456789CFGHJMPQRVWX';
        const hasPlus = code.includes('+');
        const length = code.length;

        if (hasPlus) {
            // Full code with +: 8FWC+5X (7 chars) to 8FWC+5XWX (11 chars)
            if (length < 7 || length > 11) return false;

            // Check that all characters (except +) are valid
            const parts = code.split('+');
            if (parts.length !== 2) return false; // Only one + allowed

            for (let char of code) {
                if (char !== '+' && !alphabet.includes(char.toUpperCase())) {
                    return false;
                }
            }
            return true;
        } else {
            // Short code without +: 8FWC5X (6-10 chars)
            if (length < 6 || length > 10) return false;

            // Check that all characters are valid
            for (let char of code) {
                if (!alphabet.includes(char.toUpperCase())) {
                    return false;
                }
            }
            return true;
        }
    }

    /**
     * Simple Plus Code encoding (fallback)
     * @private
     */
    simpleEncode(lat, lon, length) {
        const alphabet = '23456789CFGHJMPQRVWX';
        let code = '';

        // Normalize coordinates to 0-1 range
        let latitude = (lat + 90) / 180;
        let longitude = (lon + 180) / 360;

        // Encode to base 20
        for (let i = 0; i < length; i++) {
            latitude *= 20;
            longitude *= 20;

            const latIndex = Math.floor(latitude);
            const lonIndex = Math.floor(longitude);

            code += alphabet[latIndex % 20];
            code += alphabet[lonIndex % 20];

            latitude -= latIndex;
            longitude -= lonIndex;
        }

        // Add separator after 4 character pairs (8 characters) if code is long enough
        if (code.length > 8) {
            code = code.substring(0, 8) + '+' + code.substring(8);
        }

        return code;
    }

    /**
     * Simple Plus Code decoding (fallback)
     * @private
     */
    simpleDecode(code) {
        const alphabet = '23456789CFGHJMPQRVWX';
        const cleanCode = code.replace('+', '');

        let latitude = 0;
        let longitude = 0;
        let latRange = 1;
        let lonRange = 1;

        for (let i = 0; i < cleanCode.length; i += 2) {
            const latIndex = alphabet.indexOf(cleanCode[i]);
            const lonIndex = alphabet.indexOf(cleanCode[i + 1]);

            if (latIndex === -1 || lonIndex === -1) {
                throw new Error('Invalid Plus Code characters');
            }

            latRange /= 20;
            lonRange /= 20;

            latitude += latIndex * latRange;
            longitude += lonIndex * lonRange;
        }

        // Add half the range to get the center of the cell
        latitude += latRange / 2;
        longitude += lonRange / 2;

        // Convert back to degrees
        const result = {
            lat: latitude * 180 - 90,
            lon: longitude * 360 - 180,
            accuracy: Math.max(latRange * 180, lonRange * 360),
            code: code
        };

        // Cache the result
        this.cache.set(code, result);

        return result;
    }

    /**
     * Get stats about the service
     * @returns {object}
     */
    getStats() {
        return {
            name: this.name,
            cacheSize: this.cache.size,
            codeLength: this.codeLength,
            isOfflineCapable: true,
            requiresApiKey: false
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GooglePlusCodesService;
}


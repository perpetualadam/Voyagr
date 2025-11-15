/**
 * @file API Response Optimizer - Reduce payload size
 * @module api/response-optimizer
 */

/**
 * ResponseOptimizer class - Optimizes API responses
 * @class ResponseOptimizer
 */
export class ResponseOptimizer {
    /**
     * Initialize ResponseOptimizer
     * @constructor
     * @param {Object} config - Configuration
     */
    constructor(config = {}) {
        this.config = config;
        this.fieldMappings = {
            '/api/route': ['geometry', 'distance', 'duration', 'cost', 'mode'],
            '/api/hazards': ['id', 'type', 'lat', 'lon', 'severity', 'distance'],
            '/api/weather': ['temperature', 'condition', 'windSpeed', 'humidity'],
            '/api/charging': ['id', 'name', 'lat', 'lon', 'distance', 'available'],
            '/api/trip-history': ['id', 'start', 'end', 'distance', 'duration', 'date'],
            '/api/vehicle': ['id', 'name', 'type', 'fuelType', 'consumption'],
            '/api/traffic': ['id', 'severity', 'lat', 'lon', 'distance', 'delay']
        };
    }

    /**
     * Get required fields for endpoint
     * @function getRequiredFields
     * @param {string} endpoint - API endpoint
     * @returns {Array} Required fields
     */
    getRequiredFields(endpoint) {
        // Extract base endpoint
        const baseEndpoint = endpoint.split('?')[0];
        
        for (const [pattern, fields] of Object.entries(this.fieldMappings)) {
            if (baseEndpoint.startsWith(pattern)) {
                return fields;
            }
        }
        
        return null; // Return all fields if no mapping
    }

    /**
     * Filter response to include only required fields
     * @function filterResponse
     * @param {any} response - API response
     * @param {Array} fields - Required fields
     * @returns {any} Filtered response
     */
    filterResponse(response, fields) {
        if (!fields || !response) return response;

        if (Array.isArray(response)) {
            return response.map(item => this.filterObject(item, fields));
        } else if (typeof response === 'object') {
            return this.filterObject(response, fields);
        }

        return response;
    }

    /**
     * Filter object to include only required fields
     * @function filterObject
     * @param {Object} obj - Object to filter
     * @param {Array} fields - Required fields
     * @returns {Object} Filtered object
     */
    filterObject(obj, fields) {
        const filtered = {};
        fields.forEach(field => {
            if (field in obj) {
                filtered[field] = obj[field];
            }
        });
        return filtered;
    }

    /**
     * Simplify polyline geometry
     * @function simplifyPolyline
     * @param {string} polyline - Encoded polyline
     * @param {number} tolerance - Simplification tolerance (default: 0.00001)
     * @returns {string} Simplified polyline
     */
    simplifyPolyline(polyline, tolerance = 0.00001) {
        // Decode polyline
        const points = this.decodePolyline(polyline);
        
        // Simplify using Douglas-Peucker algorithm
        const simplified = this.douglasPeucker(points, tolerance);
        
        // Encode back
        return this.encodePolyline(simplified);
    }

    /**
     * Decode polyline
     * @function decodePolyline
     * @param {string} polyline - Encoded polyline
     * @returns {Array} Decoded points
     */
    decodePolyline(polyline) {
        const points = [];
        let index = 0, lat = 0, lng = 0;

        while (index < polyline.length) {
            let result = 0, shift = 0;
            let byte;

            do {
                byte = polyline.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
            lat += dlat;

            result = 0;
            shift = 0;

            do {
                byte = polyline.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
            lng += dlng;

            points.push([lat / 1e5, lng / 1e5]);
        }

        return points;
    }

    /**
     * Encode polyline
     * @function encodePolyline
     * @param {Array} points - Points to encode
     * @returns {string} Encoded polyline
     */
    encodePolyline(points) {
        let encoded = '';
        let prevLat = 0, prevLng = 0;

        points.forEach(([lat, lng]) => {
            const dlat = Math.round((lat - prevLat) * 1e5);
            const dlng = Math.round((lng - prevLng) * 1e5);

            encoded += this.encodeValue(dlat);
            encoded += this.encodeValue(dlng);

            prevLat = lat;
            prevLng = lng;
        });

        return encoded;
    }

    /**
     * Encode value for polyline
     * @function encodeValue
     * @param {number} value - Value to encode
     * @returns {string} Encoded value
     */
    encodeValue(value) {
        value = value < 0 ? ~(value << 1) : value << 1;
        let encoded = '';

        while (value >= 0x20) {
            encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
            value >>= 5;
        }

        encoded += String.fromCharCode(value + 63);
        return encoded;
    }

    /**
     * Douglas-Peucker algorithm for polyline simplification
     * @function douglasPeucker
     * @param {Array} points - Points to simplify
     * @param {number} tolerance - Simplification tolerance
     * @returns {Array} Simplified points
     */
    douglasPeucker(points, tolerance) {
        if (points.length <= 2) return points;

        let maxDist = 0;
        let maxIndex = 0;

        for (let i = 1; i < points.length - 1; i++) {
            const dist = this.perpendicularDistance(points[i], points[0], points[points.length - 1]);
            if (dist > maxDist) {
                maxDist = dist;
                maxIndex = i;
            }
        }

        if (maxDist > tolerance) {
            const left = this.douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
            const right = this.douglasPeucker(points.slice(maxIndex), tolerance);
            return left.slice(0, -1).concat(right);
        }

        return [points[0], points[points.length - 1]];
    }

    /**
     * Calculate perpendicular distance
     * @function perpendicularDistance
     * @param {Array} point - Point [lat, lng]
     * @param {Array} lineStart - Line start [lat, lng]
     * @param {Array} lineEnd - Line end [lat, lng]
     * @returns {number} Distance
     */
    perpendicularDistance(point, lineStart, lineEnd) {
        const [x, y] = point;
        const [x1, y1] = lineStart;
        const [x2, y2] = lineEnd;

        const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
        const denominator = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);

        return numerator / denominator;
    }

    /**
     * Optimize response
     * @function optimize
     * @param {any} response - API response
     * @param {string} endpoint - API endpoint
     * @returns {any} Optimized response
     */
    optimize(response, endpoint) {
        let optimized = response;

        // Filter fields
        const fields = this.getRequiredFields(endpoint);
        if (fields) {
            optimized = this.filterResponse(optimized, fields);
        }

        // Simplify polylines if present
        if (endpoint.includes('/api/route') && optimized.geometry) {
            optimized.geometry = this.simplifyPolyline(optimized.geometry);
        }

        return optimized;
    }
}

export default ResponseOptimizer;


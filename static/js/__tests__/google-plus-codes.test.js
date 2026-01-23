/**
 * Unit tests for Google Plus Codes Service
 */

// Import the service
const GooglePlusCodesService = require('../modules/services/google-plus-codes-service.js');

describe('GooglePlusCodesService', () => {
    let service;

    beforeEach(() => {
        service = new GooglePlusCodesService();
    });

    afterEach(() => {
        service.clearCache();
    });

    // ===== COORDINATE VALIDATION TESTS =====
    test('should validate correct coordinates', () => {
        expect(service.isValidCoordinates(51.5074, -0.1278)).toBe(true);
        expect(service.isValidCoordinates(0, 0)).toBe(true);
        expect(service.isValidCoordinates(-90, -180)).toBe(true);
        expect(service.isValidCoordinates(90, 180)).toBe(true);
    });

    test('should reject invalid coordinates', () => {
        expect(service.isValidCoordinates(91, 0)).toBe(false);
        expect(service.isValidCoordinates(-91, 0)).toBe(false);
        expect(service.isValidCoordinates(0, 181)).toBe(false);
        expect(service.isValidCoordinates(0, -181)).toBe(false);
        expect(service.isValidCoordinates('51.5', '-0.1')).toBe(false);
        expect(service.isValidCoordinates(null, null)).toBe(false);
    });

    // ===== PLUS CODE VALIDATION TESTS =====
    test('should validate correct Plus Code format', () => {
        expect(service.isValidCode('8FWC+5X')).toBe(true);
        expect(service.isValidCode('8fwc+5x')).toBe(true);
        expect(service.isValidCode('9C5XWXXX+XX')).toBe(true);
        expect(service.isValidCode('2345+67')).toBe(true);
    });

    test('should reject invalid Plus Code format', () => {
        expect(service.isValidCode('8FWC+')).toBe(false); // Too short
        expect(service.isValidCode('+')).toBe(false); // Only +
        expect(service.isValidCode('')).toBe(false); // Empty
        expect(service.isValidCode(null)).toBe(false); // Null
        expect(service.isValidCode(123)).toBe(false); // Not a string
        expect(service.isValidCode('INVALID')).toBe(false); // Invalid format
    });

    // ===== ENCODING TESTS =====
    test('should encode coordinates to Plus Code', () => {
        const code = service.encode(51.5074, -0.1278);
        expect(code).toBeDefined();
        expect(code).toContain('+');
        expect(code.length).toBeGreaterThanOrEqual(6);
    });

    test('should encode with custom code length', () => {
        const code6 = service.encode(51.5074, -0.1278, 6);
        const code10 = service.encode(51.5074, -0.1278, 10);
        expect(code6.length).toBeLessThanOrEqual(code10.length);
    });

    test('should throw error for invalid coordinates during encoding', () => {
        expect(() => service.encode(91, 0)).toThrow();
        expect(() => service.encode(0, 181)).toThrow();
        expect(() => service.encode('51.5', '-0.1')).toThrow();
    });

    // ===== DECODING TESTS =====
    test('should decode Plus Code to coordinates', () => {
        const code = service.encode(51.5074, -0.1278);
        const result = service.decode(code);

        expect(result).toHaveProperty('lat');
        expect(result).toHaveProperty('lon');
        expect(result).toHaveProperty('accuracy');
        expect(result).toHaveProperty('code');

        // Check coordinates are close (within 1 degree due to simple encoding)
        expect(Math.abs(result.lat - 51.5074)).toBeLessThan(1);
        expect(Math.abs(result.lon - (-0.1278))).toBeLessThan(1);
    });

    test('should throw error for invalid Plus Code during decoding', () => {
        expect(() => service.decode('INVALID')).toThrow();
        expect(() => service.decode('+')).toThrow(); // Only +
        expect(() => service.decode('')).toThrow();
    });

    // ===== CACHING TESTS =====
    test('should cache decoded results', () => {
        const code = service.encode(51.5074, -0.1278);
        
        // First decode
        const result1 = service.decode(code);
        expect(service.cache.size).toBe(1);
        
        // Second decode should use cache
        const result2 = service.decode(code);
        expect(service.cache.size).toBe(1);
        expect(result1).toEqual(result2);
    });

    test('should clear cache', () => {
        const code = service.encode(51.5074, -0.1278);
        service.decode(code);
        expect(service.cache.size).toBe(1);
        
        service.clearCache();
        expect(service.cache.size).toBe(0);
    });

    // ===== ROUND-TRIP TESTS =====
    test('should encode and decode consistently', () => {
        const originalLat = 51.5074;
        const originalLon = -0.1278;
        
        const code = service.encode(originalLat, originalLon);
        const decoded = service.decode(code);
        
        // Should be close (within accuracy)
        expect(Math.abs(decoded.lat - originalLat)).toBeLessThan(decoded.accuracy);
        expect(Math.abs(decoded.lon - originalLon)).toBeLessThan(decoded.accuracy);
    });

    test('should handle multiple locations', () => {
        const locations = [
            { lat: 51.5074, lon: -0.1278 }, // London
            { lat: 48.8566, lon: 2.3522 },  // Paris
            { lat: 52.5200, lon: 13.4050 }  // Berlin
        ];
        
        locations.forEach(loc => {
            const code = service.encode(loc.lat, loc.lon);
            const decoded = service.decode(code);
            expect(decoded).toHaveProperty('lat');
            expect(decoded).toHaveProperty('lon');
        });
    });

    // ===== STATS TESTS =====
    test('should return service stats', () => {
        const stats = service.getStats();
        expect(stats).toHaveProperty('name');
        expect(stats).toHaveProperty('cacheSize');
        expect(stats).toHaveProperty('codeLength');
        expect(stats).toHaveProperty('isOfflineCapable');
        expect(stats).toHaveProperty('requiresApiKey');
        
        expect(stats.name).toBe('Google Plus Codes');
        expect(stats.isOfflineCapable).toBe(true);
        expect(stats.requiresApiKey).toBe(false);
    });

    test('should update cache size in stats', () => {
        const code = service.encode(51.5074, -0.1278);
        service.decode(code);
        
        const stats = service.getStats();
        expect(stats.cacheSize).toBe(1);
    });

    // ===== EDGE CASES =====
    test('should handle equator and prime meridian', () => {
        const code = service.encode(0, 0);
        const decoded = service.decode(code);
        
        expect(decoded.lat).toBeDefined();
        expect(decoded.lon).toBeDefined();
    });

    test('should handle poles', () => {
        const northPole = service.encode(90, 0);
        const southPole = service.encode(-90, 0);
        
        expect(northPole).toBeDefined();
        expect(southPole).toBeDefined();
    });

    test('should handle international date line', () => {
        const code1 = service.encode(0, 180);
        const code2 = service.encode(0, -180);
        
        expect(code1).toBeDefined();
        expect(code2).toBeDefined();
    });
});


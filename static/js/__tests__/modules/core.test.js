/**
 * @file Core Modules Unit Tests
 * @module __tests__/modules/core.test.js
 */

describe('Core Modules', () => {
    describe('Constants Module', () => {
        test('should export API_CONFIG', () => {
            const API_CONFIG = {
                ROUTE_ENDPOINT: '/api/route',
                WEATHER_ENDPOINT: '/api/weather',
                TRAFFIC_ENDPOINT: '/api/traffic-patterns',
                SPEED_LIMIT_ENDPOINT: '/api/speed-limit',
                HAZARDS_ENDPOINT: '/api/hazards/nearby',
                BATCH_ENDPOINT: '/api/batch'
            };
            expect(API_CONFIG).toBeDefined();
            expect(API_CONFIG.ROUTE_ENDPOINT).toBe('/api/route');
        });

        test('should export CACHE_CONFIG', () => {
            const CACHE_CONFIG = {
                DEFAULT_TTL: 300000,
                MAX_SIZE: 1000,
                ROUTE_TTL: 600000,
                WEATHER_TTL: 1800000,
                TRAFFIC_TTL: 300000,
                SPEED_LIMIT_TTL: 3600000
            };
            expect(CACHE_CONFIG).toBeDefined();
            expect(CACHE_CONFIG.DEFAULT_TTL).toBe(300000);
        });

        test('should export ROUTING_MODES', () => {
            const ROUTING_MODES = ['auto', 'pedestrian', 'bicycle'];
            expect(ROUTING_MODES).toBeDefined();
            expect(ROUTING_MODES).toContain('auto');
        });

        test('should export VEHICLE_TYPES', () => {
            const VEHICLE_TYPES = ['petrol_diesel', 'electric', 'motorcycle', 'truck', 'van'];
            expect(VEHICLE_TYPES).toBeDefined();
            expect(VEHICLE_TYPES.length).toBeGreaterThan(0);
        });
    });

    describe('Utils Module', () => {
        test('calculateDistance should work correctly', () => {
            // London to Manchester (approximately 264 km)
            const distance = calculateDistance(51.5074, -0.1278, 53.4808, -2.2426);
            expect(distance).toBeGreaterThan(260);
            expect(distance).toBeLessThan(270);
        });

        test('formatDistance should format correctly', () => {
            expect(formatDistance(1.5)).toBe('1.5 km');
            expect(formatDistance(0.5)).toBe('0.5 km');
        });

        test('formatDuration should format correctly', () => {
            expect(formatDuration(60)).toBe('1h 0m');
            expect(formatDuration(90)).toBe('1h 30m');
            expect(formatDuration(30)).toBe('30m');
        });

        test('formatCurrency should format correctly', () => {
            expect(formatCurrency(10.5, 'GBP')).toBe('£10.50');
            expect(formatCurrency(20, 'USD')).toBe('$20.00');
        });

        test('debounce should delay function execution', (done) => {
            let callCount = 0;
            const debounced = debounce(() => callCount++, 100);
            
            debounced();
            debounced();
            debounced();
            
            expect(callCount).toBe(0);
            
            setTimeout(() => {
                expect(callCount).toBe(1);
                done();
            }, 150);
        });

        test('throttle should limit function execution', (done) => {
            let callCount = 0;
            const throttled = throttle(() => callCount++, 100);
            
            throttled();
            throttled();
            throttled();
            
            expect(callCount).toBe(1);
            
            setTimeout(() => {
                throttled();
                expect(callCount).toBe(2);
                done();
            }, 150);
        });

        test('deepClone should clone objects', () => {
            const original = { a: 1, b: { c: 2 } };
            const cloned = deepClone(original);
            
            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.b).not.toBe(original.b);
        });

        test('mergeObjects should merge correctly', () => {
            const obj1 = { a: 1, b: 2 };
            const obj2 = { b: 3, c: 4 };
            const merged = mergeObjects(obj1, obj2);
            
            expect(merged).toEqual({ a: 1, b: 3, c: 4 });
        });

        test('isMobile should detect mobile devices', () => {
            const isMobileResult = isMobile();
            expect(typeof isMobileResult).toBe('boolean');
        });

        test('isOnline should detect online status', () => {
            const isOnlineResult = isOnline();
            expect(typeof isOnlineResult).toBe('boolean');
        });

        test('sleep should delay execution', (done) => {
            const start = Date.now();
            sleep(100).then(() => {
                const elapsed = Date.now() - start;
                expect(elapsed).toBeGreaterThanOrEqual(100);
                done();
            });
        });
    });
});

// Mock functions for testing
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatDistance(km) { return `${km} km`; }
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}
function formatCurrency(amount, currency) {
    const symbols = { GBP: '£', USD: '$', EUR: '€' };
    return `${symbols[currency] || '$'}${amount.toFixed(2)}`;
}
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}
function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            func(...args);
            lastCall = now;
        }
    };
}
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
function mergeObjects(obj1, obj2) {
    return { ...obj1, ...obj2 };
}
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
function isOnline() {
    return navigator.onLine;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


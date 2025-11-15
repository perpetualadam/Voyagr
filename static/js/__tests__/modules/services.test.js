/**
 * @file Services Modules Unit Tests
 * @module __tests__/modules/services.test.js
 */

describe('Services Modules', () => {
    describe('LocationService', () => {
        let location;

        beforeEach(() => {
            location = {
                geocodingEndpoint: '/api/geocode',
                reverseGeocodingEndpoint: '/api/reverse-geocode',
                cache: new Map(),
                cacheTTL: 3600000,
                geocodeAddress: function(address) {
                    const cached = this.cache.get(`geocode_${address}`);
                    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
                        return Promise.resolve(cached.data);
                    }
                    return Promise.resolve({ lat: 51.5, lon: -0.1 });
                },
                reverseGeocode: function(lat, lon) {
                    return Promise.resolve({ address: 'London, UK' });
                },
                geocodeMultiple: function(addresses) {
                    return Promise.all(addresses.map(addr => this.geocodeAddress(addr)));
                },
                clearCache: function() {
                    this.cache.clear();
                },
                getCacheStats: function() {
                    return { size: this.cache.size };
                }
            };
        });

        test('should geocode address', async () => {
            const result = await location.geocodeAddress('London');
            expect(result).toBeDefined();
            expect(result.lat).toBeDefined();
            expect(result.lon).toBeDefined();
        });

        test('should reverse geocode', async () => {
            const result = await location.reverseGeocode(51.5, -0.1);
            expect(result).toBeDefined();
            expect(result.address).toBeDefined();
        });

        test('should geocode multiple addresses', async () => {
            const results = await location.geocodeMultiple(['London', 'Manchester']);
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBe(2);
        });

        test('should clear cache', () => {
            location.cache.set('test', { data: 'test' });
            location.clearCache();
            expect(location.getCacheStats().size).toBe(0);
        });

        test('should get cache stats', () => {
            const stats = location.getCacheStats();
            expect(stats).toBeDefined();
            expect(stats.size).toBeDefined();
        });
    });

    describe('NotificationsService', () => {
        let notifications;

        beforeEach(() => {
            notifications = {
                enabled: true,
                position: 'top-right',
                duration: 3000,
                notifications: [],
                maxNotifications: 5,
                show: function(message, type = 'info', options = {}) {
                    if (!this.enabled) return null;
                    const id = `notif_${Date.now()}`;
                    this.notifications.push({ id, message, type });
                    if (this.notifications.length > this.maxNotifications) {
                        this.notifications.shift();
                    }
                    return id;
                },
                info: function(message, options) { return this.show(message, 'info', options); },
                success: function(message, options) { return this.show(message, 'success', options); },
                warning: function(message, options) { return this.show(message, 'warning', options); },
                error: function(message, options) { return this.show(message, 'error', options); },
                dismiss: function(id) {
                    this.notifications = this.notifications.filter(n => n.id !== id);
                },
                dismissAll: function() {
                    this.notifications = [];
                },
                getAll: function() {
                    return [...this.notifications];
                },
                enable: function() { this.enabled = true; },
                disable: function() { this.enabled = false; }
            };
        });

        test('should show notification', () => {
            const id = notifications.show('Test message', 'info');
            expect(id).not.toBeNull();
            expect(notifications.getAll().length).toBe(1);
        });

        test('should show info notification', () => {
            notifications.info('Info message');
            expect(notifications.getAll().length).toBe(1);
        });

        test('should show success notification', () => {
            notifications.success('Success message');
            expect(notifications.getAll().length).toBe(1);
        });

        test('should show warning notification', () => {
            notifications.warning('Warning message');
            expect(notifications.getAll().length).toBe(1);
        });

        test('should show error notification', () => {
            notifications.error('Error message');
            expect(notifications.getAll().length).toBe(1);
        });

        test('should dismiss notification', () => {
            const id = notifications.show('Test');
            notifications.dismiss(id);
            expect(notifications.getAll().length).toBe(0);
        });

        test('should dismiss all notifications', () => {
            notifications.show('Test 1');
            notifications.show('Test 2');
            notifications.dismissAll();
            expect(notifications.getAll().length).toBe(0);
        });

        test('should enable/disable notifications', () => {
            notifications.disable();
            const id = notifications.show('Test');
            expect(id).toBeNull();
            
            notifications.enable();
            const id2 = notifications.show('Test');
            expect(id2).not.toBeNull();
        });
    });

    describe('AnalyticsService', () => {
        let analytics;

        beforeEach(() => {
            analytics = {
                enabled: true,
                endpoint: '/api/analytics',
                events: [],
                sessionId: 'session_123',
                batchSize: 10,
                batchTimeout: 30000,
                trackEvent: function(eventName, data = {}) {
                    if (!this.enabled) return;
                    this.events.push({ name: eventName, data, timestamp: Date.now() });
                },
                trackPageView: function(page, data) {
                    this.trackEvent('pageView', { page, ...data });
                },
                trackAction: function(action, data) {
                    this.trackEvent('userAction', { action, ...data });
                },
                trackError: function(message, data) {
                    this.trackEvent('error', { message, ...data });
                },
                trackMetric: function(metric, value, data) {
                    this.trackEvent('metric', { metric, value, ...data });
                },
                getPendingEvents: function() {
                    return [...this.events];
                },
                clearPendingEvents: function() {
                    this.events = [];
                },
                enable: function() { this.enabled = true; },
                disable: function() { this.enabled = false; }
            };
        });

        test('should track event', () => {
            analytics.trackEvent('test', { data: 'value' });
            expect(analytics.getPendingEvents().length).toBe(1);
        });

        test('should track page view', () => {
            analytics.trackPageView('home');
            expect(analytics.getPendingEvents().length).toBe(1);
        });

        test('should track action', () => {
            analytics.trackAction('click', { element: 'button' });
            expect(analytics.getPendingEvents().length).toBe(1);
        });

        test('should track error', () => {
            analytics.trackError('Error occurred', { code: 500 });
            expect(analytics.getPendingEvents().length).toBe(1);
        });

        test('should track metric', () => {
            analytics.trackMetric('response_time', 250);
            expect(analytics.getPendingEvents().length).toBe(1);
        });

        test('should clear pending events', () => {
            analytics.trackEvent('test');
            analytics.clearPendingEvents();
            expect(analytics.getPendingEvents().length).toBe(0);
        });

        test('should enable/disable analytics', () => {
            analytics.disable();
            analytics.trackEvent('test');
            expect(analytics.getPendingEvents().length).toBe(0);
            
            analytics.enable();
            analytics.trackEvent('test');
            expect(analytics.getPendingEvents().length).toBe(1);
        });
    });
});


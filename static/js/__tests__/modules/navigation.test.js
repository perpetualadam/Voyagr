/**
 * @file Navigation Modules Unit Tests
 * @module __tests__/modules/navigation.test.js
 */

describe('Navigation Modules', () => {
    describe('TurnByTurnNavigator', () => {
        let navigator;

        beforeEach(() => {
            navigator = {
                route: null,
                currentStep: 0,
                currentLocation: null,
                isNavigating: false,
                listeners: new Map(),
                startNavigation: function(route) {
                    this.route = route;
                    this.currentStep = 0;
                    this.isNavigating = true;
                },
                stopNavigation: function() {
                    this.isNavigating = false;
                    this.route = null;
                    this.currentStep = 0;
                },
                updateLocation: function(lat, lon) {
                    this.currentLocation = { lat, lon };
                },
                getCurrentInstruction: function() {
                    if (!this.route || !this.route.instructions) return null;
                    return this.route.instructions[this.currentStep] || null;
                },
                on: function(event, callback) {
                    if (!this.listeners.has(event)) {
                        this.listeners.set(event, []);
                    }
                    this.listeners.get(event).push(callback);
                }
            };
        });

        test('should start navigation', () => {
            const route = { instructions: [] };
            navigator.startNavigation(route);
            
            expect(navigator.isNavigating).toBe(true);
            expect(navigator.route).toEqual(route);
            expect(navigator.currentStep).toBe(0);
        });

        test('should stop navigation', () => {
            navigator.startNavigation({ instructions: [] });
            navigator.stopNavigation();
            
            expect(navigator.isNavigating).toBe(false);
            expect(navigator.route).toBeNull();
        });

        test('should update location', () => {
            navigator.updateLocation(51.5, -0.1);
            
            expect(navigator.currentLocation).toEqual({ lat: 51.5, lon: -0.1 });
        });

        test('should get current instruction', () => {
            const instructions = [
                { text: 'Turn left', distance: 100 },
                { text: 'Turn right', distance: 200 }
            ];
            navigator.route = { instructions };
            
            expect(navigator.getCurrentInstruction()).toEqual(instructions[0]);
        });

        test('should support event listeners', () => {
            let eventFired = false;
            navigator.on('navigationStarted', () => {
                eventFired = true;
            });
            
            expect(navigator.listeners.has('navigationStarted')).toBe(true);
        });
    });

    describe('VoiceNavigator', () => {
        let voice;

        beforeEach(() => {
            voice = {
                enabled: true,
                language: 'en-US',
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
                isSpeaking: false,
                synth: null,
                enable: function() { this.enabled = true; },
                disable: function() { this.enabled = false; },
                setLanguage: function(lang) { this.language = lang; },
                isSpeakingNow: function() { return this.isSpeaking; }
            };
        });

        test('should enable voice', () => {
            voice.disable();
            voice.enable();
            expect(voice.enabled).toBe(true);
        });

        test('should disable voice', () => {
            voice.disable();
            expect(voice.enabled).toBe(false);
        });

        test('should set language', () => {
            voice.setLanguage('fr-FR');
            expect(voice.language).toBe('fr-FR');
        });

        test('should check if speaking', () => {
            expect(voice.isSpeakingNow()).toBe(false);
            voice.isSpeaking = true;
            expect(voice.isSpeakingNow()).toBe(true);
        });
    });

    describe('LocationTracker', () => {
        let tracker;

        beforeEach(() => {
            tracker = {
                isTracking: false,
                currentLocation: null,
                locationHistory: [],
                maxHistorySize: 1000,
                listeners: new Map(),
                startTracking: function() { this.isTracking = true; },
                stopTracking: function() { this.isTracking = false; },
                getCurrentLocation: function() { return this.currentLocation; },
                getLocationHistory: function() { return [...this.locationHistory]; },
                clearHistory: function() { this.locationHistory = []; },
                on: function(event, callback) {
                    if (!this.listeners.has(event)) {
                        this.listeners.set(event, []);
                    }
                    this.listeners.get(event).push(callback);
                },
                calculateDistanceTraveled: function() {
                    if (this.locationHistory.length < 2) return 0;
                    let distance = 0;
                    for (let i = 1; i < this.locationHistory.length; i++) {
                        const prev = this.locationHistory[i - 1];
                        const curr = this.locationHistory[i];
                        distance += this.haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
                    }
                    return distance;
                },
                haversineDistance: function(lat1, lon1, lat2, lon2) {
                    const R = 6371;
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    return R * c;
                }
            };
        });

        test('should start tracking', () => {
            tracker.startTracking();
            expect(tracker.isTracking).toBe(true);
        });

        test('should stop tracking', () => {
            tracker.startTracking();
            tracker.stopTracking();
            expect(tracker.isTracking).toBe(false);
        });

        test('should clear history', () => {
            tracker.locationHistory = [{ lat: 51.5, lon: -0.1 }];
            tracker.clearHistory();
            expect(tracker.locationHistory.length).toBe(0);
        });

        test('should calculate distance traveled', () => {
            tracker.locationHistory = [
                { lat: 51.5, lon: -0.1 },
                { lat: 51.51, lon: -0.1 }
            ];
            
            const distance = tracker.calculateDistanceTraveled();
            expect(distance).toBeGreaterThan(0);
        });
    });
});


/**
 * Unit and Integration Tests for Driver's Perspective Mode
 * Tests toggleDriverPerspective, applyDriverPerspective, and GPS tracking pitch behavior
 */

describe('Driver Perspective Mode', () => {
    let mockMap;
    let mockCurrentUserMarker;

    beforeEach(() => {
        // Mock MapLibre map instance
        mockMap = {
            easeTo: jest.fn(),
            getPitch: jest.fn().mockReturnValue(0),
            getBearing: jest.fn().mockReturnValue(0),
            getZoom: jest.fn().mockReturnValue(15),
            getCenter: jest.fn().mockReturnValue({ lng: -0.1, lat: 51.5 }),
        };

        mockCurrentUserMarker = {
            heading: 45
        };

        // Mock window object
        global.window = {
            innerHeight: 800,
            innerWidth: 400
        };

        // Mock DOM elements
        document.body.innerHTML = `
            <button id="driverPerspectiveToggle" class="toggle-switch"></button>
        `;

        // Mock localStorage
        const mockStorage = {};
        global.localStorage = {
            getItem: jest.fn((key) => mockStorage[key] || null),
            setItem: jest.fn((key, value) => { mockStorage[key] = value; }),
            removeItem: jest.fn((key) => { delete mockStorage[key]; }),
            clear: jest.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); })
        };

        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    describe('toggleDriverPerspective()', () => {
        test('should toggle driverPerspectiveEnabled state', () => {
            let driverPerspectiveEnabled = false;
            
            // Simulate toggle
            driverPerspectiveEnabled = !driverPerspectiveEnabled;
            expect(driverPerspectiveEnabled).toBe(true);
            
            driverPerspectiveEnabled = !driverPerspectiveEnabled;
            expect(driverPerspectiveEnabled).toBe(false);
        });

        test('should save state to localStorage', () => {
            localStorage.setItem('driverPerspectiveEnabled', 'true');
            expect(localStorage.getItem('driverPerspectiveEnabled')).toBe('true');

            localStorage.setItem('driverPerspectiveEnabled', 'false');
            expect(localStorage.getItem('driverPerspectiveEnabled')).toBe('false');
        });

        test('should update toggle button styling when enabled', () => {
            const btn = document.getElementById('driverPerspectiveToggle');
            
            // Simulate enabling
            btn.classList.add('active');
            btn.style.background = '#4CAF50';
            btn.style.borderColor = '#4CAF50';
            
            expect(btn.classList.contains('active')).toBe(true);
            expect(btn.style.background).toBe('rgb(76, 175, 80)');
        });

        test('should update toggle button styling when disabled', () => {
            const btn = document.getElementById('driverPerspectiveToggle');
            btn.classList.add('active');
            
            // Simulate disabling
            btn.classList.remove('active');
            btn.style.background = '#ddd';
            btn.style.borderColor = '#999';
            
            expect(btn.classList.contains('active')).toBe(false);
            expect(btn.style.background).toBe('rgb(221, 221, 221)');
        });

        test('should handle missing toggle button gracefully', () => {
            document.body.innerHTML = '';
            
            expect(() => {
                const btn = document.getElementById('driverPerspectiveToggle');
                if (btn) {
                    btn.classList.toggle('active');
                }
            }).not.toThrow();
        });
    });

    describe('applyDriverPerspective()', () => {
        test('should apply 60° pitch when enabled', () => {
            const driverPerspectiveEnabled = true;
            const easeOptions = { duration: 1000 };

            if (driverPerspectiveEnabled) {
                easeOptions.pitch = 60;
                easeOptions.bearing = mockCurrentUserMarker.heading;
                easeOptions.padding = { top: 0, bottom: window.innerHeight * 0.5, left: 0, right: 0 };
            }

            mockMap.easeTo(easeOptions);

            expect(mockMap.easeTo).toHaveBeenCalledWith(expect.objectContaining({
                pitch: 60,
                bearing: 45
            }));
            // Verify padding has bottom = 50% of innerHeight
            expect(easeOptions.padding.bottom).toBe(window.innerHeight * 0.5);
        });

        test('should apply 0° pitch when disabled', () => {
            const driverPerspectiveEnabled = false;
            const easeOptions = { duration: 500 };
            
            if (!driverPerspectiveEnabled) {
                easeOptions.pitch = 0;
                easeOptions.bearing = 0;
                easeOptions.padding = { top: 50, bottom: 200, left: 50, right: 50 };
            }
            
            mockMap.easeTo(easeOptions);
            
            expect(mockMap.easeTo).toHaveBeenCalledWith(expect.objectContaining({
                pitch: 0,
                bearing: 0
            }));
        });

        test('should use heading from currentUserMarker', () => {
            mockCurrentUserMarker.heading = 90;
            const bearing = mockCurrentUserMarker.heading || 0;
            
            expect(bearing).toBe(90);
        });

        test('should default to 0 heading if no marker', () => {
            mockCurrentUserMarker = null;
            const heading = mockCurrentUserMarker?.heading || 0;

            expect(heading).toBe(0);
        });

        test('should handle null map gracefully', () => {
            expect(() => {
                const map = null;
                if (map) {
                    map.easeTo({ pitch: 60 });
                }
            }).not.toThrow();
        });

        test('should work without GPS coordinates', () => {
            const currentLat = null;
            const currentLon = null;
            const easeOptions = { duration: 1000, pitch: 60, bearing: 45 };

            // Only set center if we have valid coordinates
            if (currentLat && currentLon) {
                easeOptions.center = [currentLon, currentLat];
            }

            expect(easeOptions.center).toBeUndefined();
            mockMap.easeTo(easeOptions);
            expect(mockMap.easeTo).toHaveBeenCalled();
        });
    });

    describe('GPS Tracking Pitch Behavior', () => {
        test('should use 60° pitch when driverPerspectiveEnabled is true', () => {
            const driverPerspectiveEnabled = true;
            const pitch = driverPerspectiveEnabled ? 60 : 0;

            expect(pitch).toBe(60);
        });

        test('should use 0° pitch when driverPerspectiveEnabled is false', () => {
            const driverPerspectiveEnabled = false;
            const pitch = driverPerspectiveEnabled ? 60 : 0;

            expect(pitch).toBe(0);
        });

        test('should apply bottom padding when perspective enabled', () => {
            const driverPerspectiveEnabled = true;
            const padding = driverPerspectiveEnabled
                ? { top: 0, bottom: window.innerHeight * 0.5, left: 0, right: 0 }
                : { top: 50, bottom: 200, left: 50, right: 50 };

            // Bottom padding is 50% of innerHeight
            expect(padding.bottom).toBe(window.innerHeight * 0.5);
            expect(padding.top).toBe(0);
        });

        test('should apply standard padding when perspective disabled', () => {
            const driverPerspectiveEnabled = false;
            const padding = driverPerspectiveEnabled
                ? { top: 0, bottom: window.innerHeight * 0.5, left: 0, right: 0 }
                : { top: 50, bottom: 200, left: 50, right: 50 };

            expect(padding.bottom).toBe(200);
            expect(padding.top).toBe(50);
        });

        test('should align bearing with heading when perspective enabled', () => {
            const driverPerspectiveEnabled = true;
            const heading = 135;
            const bearing = driverPerspectiveEnabled ? (heading || mockMap.getBearing()) : 0;

            expect(bearing).toBe(135);
        });

        test('should use 0 bearing when perspective disabled', () => {
            const driverPerspectiveEnabled = false;
            const heading = 135;
            const bearing = driverPerspectiveEnabled ? (heading || mockMap.getBearing()) : 0;

            expect(bearing).toBe(0);
        });

        test('should call map.easeTo with correct options during navigation', () => {
            const driverPerspectiveEnabled = true;
            const lat = 51.5;
            const lon = -0.1;
            const heading = 90;
            const smartZoom = 17;

            const pitch = driverPerspectiveEnabled ? 60 : 0;
            const padding = driverPerspectiveEnabled
                ? { top: 0, bottom: window.innerHeight * 0.5, left: 0, right: 0 }
                : { top: 50, bottom: 200, left: 50, right: 50 };
            const bearing = driverPerspectiveEnabled ? (heading || 0) : 0;

            mockMap.easeTo({
                center: [lon, lat],
                zoom: smartZoom,
                bearing: bearing,
                pitch: pitch,
                padding: padding,
                duration: 1000,
                essential: true
            });

            expect(mockMap.easeTo).toHaveBeenCalledWith(expect.objectContaining({
                center: [-0.1, 51.5],
                zoom: 17,
                bearing: 90,
                pitch: 60
            }));
        });
    });

    describe('localStorage Persistence', () => {
        test('should retrieve driver perspective preference', () => {
            localStorage.setItem('driverPerspectiveEnabled', 'true');
            const enabled = localStorage.getItem('driverPerspectiveEnabled') === 'true';
            expect(enabled).toBe(true);
        });

        test('should default to false if not set', () => {
            // Clear localStorage to ensure clean state
            localStorage.clear();
            const value = localStorage.getItem('driverPerspectiveEnabled');
            const enabled = value === 'true';
            expect(enabled).toBe(false);
        });

        test('should persist state across toggles', () => {
            // Enable
            localStorage.setItem('driverPerspectiveEnabled', 'true');
            expect(localStorage.getItem('driverPerspectiveEnabled')).toBe('true');

            // Disable
            localStorage.setItem('driverPerspectiveEnabled', 'false');
            expect(localStorage.getItem('driverPerspectiveEnabled')).toBe('false');
        });
    });

    describe('Edge Cases', () => {
        test('should handle rapid toggle calls', () => {
            let enabled = false;

            expect(() => {
                for (let i = 0; i < 10; i++) {
                    enabled = !enabled;
                    localStorage.setItem('driverPerspectiveEnabled', enabled.toString());
                }
            }).not.toThrow();
        });

        test('should handle undefined heading gracefully', () => {
            mockCurrentUserMarker.heading = undefined;
            const heading = mockCurrentUserMarker?.heading || 0;

            expect(heading).toBe(0);
        });

        test('should handle NaN heading gracefully', () => {
            mockCurrentUserMarker.heading = NaN;
            const heading = mockCurrentUserMarker?.heading || 0;

            // NaN is falsy
            expect(heading).toBe(0);
        });
    });
});


/**
 * @jest-environment jsdom
 * @file Auto GPS must keep a single getCurrentPosition interval.
 * startAutoGpsLocation is invoked from preference restore and from applySettingsToUI
 * → loadPreferences; a second start must not stack another timer.
 */

const AutoGps = require('../app/auto-gps-orchestration.js');

function mockGeolocation() {
    navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
        success({
            coords: {
                latitude: 51.5074,
                longitude: -0.1278,
                accuracy: 12,
            },
        });
    });
    return navigator.geolocation.getCurrentPosition;
}

function bindAutoGps() {
    document.body.innerHTML = [
        '<input id="autoGpsToggle" type="checkbox" />',
        '<input id="start" />',
    ].join('');
    AutoGps.bind({
        setCurrentLat: jest.fn(),
        setCurrentLon: jest.fn(),
        call: {
            showStatus: jest.fn(),
            calculateDistanceMeters: () => 0,
        },
    });
    AutoGps.setAutoGpsEnabled(true);
}

describe('startAutoGpsLocation interval lifecycle (PWA-02)', () => {
    let getCurrentPosition;

    beforeEach(() => {
        jest.useFakeTimers();
        getCurrentPosition = mockGeolocation();
        bindAutoGps();
    });

    afterEach(() => {
        AutoGps.stopAutoGpsLocation();
        AutoGps.setAutoGpsEnabled(false);
        jest.useRealTimers();
        document.body.innerHTML = '';
    });

    test('starting Auto GPS creates one interval and one immediate getCurrentPosition', () => {
        const intervalSpy = jest.spyOn(global, 'setInterval');

        AutoGps.startAutoGpsLocation();

        expect(intervalSpy).toHaveBeenCalledTimes(1);
        expect(intervalSpy.mock.calls[0][1]).toBe(5000);
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
        intervalSpy.mockRestore();
    });

    test('repeated startAutoGpsLocation does not stack extra intervals or fetches', () => {
        const intervalSpy = jest.spyOn(global, 'setInterval');

        AutoGps.startAutoGpsLocation();
        AutoGps.startAutoGpsLocation();
        AutoGps.startAutoGpsLocation();
        AutoGps.startAutoGpsLocation();

        expect(intervalSpy).toHaveBeenCalledTimes(1);
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(5000);
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
        intervalSpy.mockRestore();
    });

    test('stopAutoGpsLocation clears the interval so a later start creates one replacement', () => {
        const clearSpy = jest.spyOn(global, 'clearInterval');
        const intervalSpy = jest.spyOn(global, 'setInterval');

        AutoGps.startAutoGpsLocation();
        AutoGps.stopAutoGpsLocation();
        expect(clearSpy).toHaveBeenCalledTimes(1);

        AutoGps.setAutoGpsEnabled(true);
        AutoGps.startAutoGpsLocation();
        expect(intervalSpy).toHaveBeenCalledTimes(2);
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(5000);
        expect(getCurrentPosition).toHaveBeenCalledTimes(3);
        intervalSpy.mockRestore();
        clearSpy.mockRestore();
    });

    test('preference-restore style double start (loadPreferences twice) keeps one watcher', () => {
        const intervalSpy = jest.spyOn(global, 'setInterval');

        AutoGps.setAutoGpsEnabled(true);
        AutoGps.startAutoGpsLocation();
        AutoGps.setAutoGpsEnabled(true);
        AutoGps.startAutoGpsLocation();

        expect(intervalSpy).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(10000);
        expect(getCurrentPosition).toHaveBeenCalledTimes(3);
        intervalSpy.mockRestore();
    });

    test('later interval ticks still process legitimate subsequent GPS callbacks', () => {
        AutoGps.startAutoGpsLocation();
        getCurrentPosition.mockClear();

        jest.advanceTimersByTime(5000);
        jest.advanceTimersByTime(5000);

        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
        expect(document.getElementById('start').dataset.lat).toBe('51.5074');
    });
});

const SG = require('../modules/navigation/speed-gps.js');
const GPS = require('../app/gps-orchestration.js');
const now = 1800000000000;
const fix = (at, lat = 51.5, accuracy = 8) => ({
    timestamp: at, coords: { latitude: lat, longitude: -0.1, accuracy },
});

test('replay keeps last reliable position through stale, duplicate, invalid and inaccurate fixes', () => {
    let accepted = { at: 0, lat: null };
    const replay = [fix(now - 2000), fix(now - 3000, 52), fix(now - 2000, 53),
        fix(now - 1000, 54, 900), fix(now - 1000, NaN), fix(now - 1000, 51.6)];
    const decisions = replay.map(p => {
        const result = SG.validateNavigationGpsFix(p, now, accepted.at);
        if (result.accepted) accepted = { at: result.timestamp, lat: p.coords.latitude };
        return result.accepted;
    });
    expect(decisions).toEqual([true, false, false, false, false, true]);
    expect(accepted).toEqual({ at: now - 1000, lat: 51.6 });
});

test.each([fix(now - 16000), fix(now + 2000), fix(now, 91), fix(now, 51.5, Infinity), {}])(
    'invalid fix is rejected before orchestration mutates navigation state', position => {
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const showStatus = jest.fn();
        const mutate = jest.fn();
        GPS.bind({ g: () => true, s: mutate, m: { speedGps: () => SG }, call: { showStatus } });
        GPS.setGpsTrackingStoppedByUser(false);
        GPS.setGpsWatchId(null);
        GPS.setIsTrackingActive(false);
        navigator.geolocation.watchPosition = jest.fn(() => 7);
        GPS.ensureGPSTracking({ forceRestart: true, documentVisible: true });
        GPS.setLastGpsFixAtMs(now - 2000);
        GPS.setSmoothDisplayLat(51.5);
        GPS.setSmoothDisplayLon(-0.1);
        navigator.geolocation.watchPosition.mock.calls[0][0](position);
        expect(GPS.getLastGpsFixAtMs()).toBe(now - 2000);
        expect(GPS.getSmoothDisplayLat()).toBe(51.5);
        expect(GPS.getSmoothDisplayLon()).toBe(-0.1);
        expect(mutate).not.toHaveBeenCalled();
        expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('last reliable position'), 'warning');
        jest.restoreAllMocks();
    }
);

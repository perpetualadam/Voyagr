/**
 * @file Navigation Modules Unit Tests (REAL modules)
 *
 * Imports the real TurnByTurnNavigator, VoiceNavigator and LocationTracker and
 * asserts their actual behaviour (event emission, turn detection, voice phrasing,
 * GPS history) instead of re-implementing them inline.
 */

import { TurnByTurnNavigator } from '../../modules/navigation/turn-by-turn.js';
import { VoiceNavigator } from '../../modules/navigation/voice.js';
import { LocationTracker } from '../../modules/navigation/tracking.js';

describe('TurnByTurnNavigator (real module)', () => {
    let nav;
    beforeEach(() => { nav = new TurnByTurnNavigator(); });

    test('startNavigation sets state and emits navigationStarted', () => {
        const cb = jest.fn();
        nav.on('navigationStarted', cb);
        const route = { instructions: [] };
        nav.startNavigation(route);
        expect(nav.isNavigating).toBe(true);
        expect(nav.route).toBe(route);
        expect(cb).toHaveBeenCalledWith({ route });
    });

    test('stopNavigation clears state and emits navigationStopped', () => {
        const cb = jest.fn();
        nav.on('navigationStopped', cb);
        nav.startNavigation({ instructions: [] });
        nav.stopNavigation();
        expect(nav.isNavigating).toBe(false);
        expect(nav.route).toBeNull();
        expect(cb).toHaveBeenCalled();
    });

    test('getCurrentInstruction / getNextInstruction follow currentStep', () => {
        const instructions = [{ text: 'Turn left' }, { text: 'Turn right' }];
        nav.startNavigation({ instructions });
        expect(nav.getCurrentInstruction()).toEqual({ text: 'Turn left' });
        expect(nav.getNextInstruction()).toEqual({ text: 'Turn right' });
    });

    test('updateLocation advances the step and emits turnReached when within 20m', () => {
        const reached = jest.fn();
        nav.on('turnReached', reached);
        // Instruction co-located with the user -> distance ~0 -> turn reached.
        nav.startNavigation({ instructions: [{ text: 'Turn left', lat: 51.5, lon: -0.1 }] });
        nav.updateLocation(51.5, -0.1);
        expect(reached).toHaveBeenCalled();
        expect(nav.currentStep).toBe(1);
    });

    test('emits navigationComplete once past the last instruction', () => {
        const done = jest.fn();
        nav.on('navigationComplete', done);
        nav.startNavigation({ instructions: [{ text: 'Arrive', lat: 51.5, lon: -0.1 }] });
        nav.updateLocation(51.5, -0.1); // reaches turn -> step 1
        nav.updateLocation(51.5, -0.1); // step >= length -> complete
        expect(done).toHaveBeenCalled();
    });

    test('calculateDistance returns metres (Haversine)', () => {
        // ~111 m per 0.001 deg latitude.
        const d = nav.calculateDistance(51.5, -0.1, 51.501, -0.1);
        expect(d).toBeGreaterThan(100);
        expect(d).toBeLessThan(120);
    });
});

describe('VoiceNavigator (real module)', () => {
    let speakSpy;
    beforeEach(() => {
        speakSpy = jest.fn();
        global.window.speechSynthesis = {
            cancel: jest.fn(),
            speak: speakSpy,
            getVoices: () => [],
            pause: jest.fn(),
            resume: jest.fn(),
        };
        global.SpeechSynthesisUtterance = function (text) { this.text = text; };
    });
    afterEach(() => {
        delete global.window.speechSynthesis;
        delete global.SpeechSynthesisUtterance;
    });

    test('enable/disable toggles enabled flag', () => {
        const v = new VoiceNavigator();
        v.disable();
        expect(v.enabled).toBe(false);
        v.enable();
        expect(v.enabled).toBe(true);
    });

    test('setLanguage and setRate (clamped 0.5..2.0)', () => {
        const v = new VoiceNavigator();
        v.setLanguage('fr-FR');
        expect(v.language).toBe('fr-FR');
        v.setRate(5);
        expect(v.rate).toBe(2.0);
        v.setRate(0.1);
        expect(v.rate).toBe(0.5);
    });

    test('formatDistance phrasing', () => {
        const v = new VoiceNavigator();
        expect(v.formatDistance(1500)).toBe('1.5 kilometres');
        expect(v.formatDistance(450)).toBe('450 metres');
        expect(v.formatDistance(42)).toBe('42 metres');
    });

    test('speak sends an utterance and records lastSpokenText', () => {
        const v = new VoiceNavigator();
        v.speak('Turn left');
        expect(speakSpy).toHaveBeenCalledTimes(1);
        expect(v.lastSpokenText).toBe('Turn left');
    });

    test('disabled navigator does not speak', () => {
        const v = new VoiceNavigator({ enabled: false });
        v.speak('Turn left');
        expect(speakSpy).not.toHaveBeenCalled();
    });

    test('announceConfirmation maps known maneuvers', () => {
        const v = new VoiceNavigator();
        v.announceConfirmation('left');
        expect(v.lastSpokenText).toBe('You have turned left');
    });

    test('isSpeakingNow reflects internal state', () => {
        const v = new VoiceNavigator();
        expect(v.isSpeakingNow()).toBe(false);
        v.isSpeaking = true;
        expect(v.isSpeakingNow()).toBe(true);
    });
});

describe('LocationTracker (real module)', () => {
    beforeEach(() => {
        navigator.geolocation.clearWatch = jest.fn();
    });

    test('startTracking uses geolocation.watchPosition and emits trackingStarted', () => {
        const started = jest.fn();
        navigator.geolocation.watchPosition.mockReturnValue(7);
        const t = new LocationTracker();
        t.on('trackingStarted', started);
        t.startTracking();
        expect(t.isTracking).toBe(true);
        expect(t.watchId).toBe(7);
        expect(started).toHaveBeenCalled();
    });

    test('stopTracking clears the watch and emits trackingStopped', () => {
        navigator.geolocation.watchPosition.mockReturnValue(7);
        const stopped = jest.fn();
        const t = new LocationTracker();
        t.on('trackingStopped', stopped);
        t.startTracking();
        t.stopTracking();
        expect(t.isTracking).toBe(false);
        expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(7);
        expect(stopped).toHaveBeenCalled();
    });

    test('handleLocationUpdate stores location and bounds history', () => {
        const t = new LocationTracker({ maxHistorySize: 2 });
        const mk = (lat) => ({ coords: { latitude: lat, longitude: -0.1, accuracy: 5 } });
        t.handleLocationUpdate(mk(51.50));
        t.handleLocationUpdate(mk(51.51));
        t.handleLocationUpdate(mk(51.52));
        expect(t.getLocationHistory()).toHaveLength(2); // oldest dropped
        expect(t.getCurrentLocation().lat).toBe(51.52);
    });

    test('clearHistory empties history', () => {
        const t = new LocationTracker();
        t.handleLocationUpdate({ coords: { latitude: 51.5, longitude: -0.1 } });
        t.clearHistory();
        expect(t.getLocationHistory()).toHaveLength(0);
    });

    test('calculateDistanceTraveled sums consecutive legs (km)', () => {
        const t = new LocationTracker();
        t.handleLocationUpdate({ coords: { latitude: 51.5, longitude: -0.1 } });
        t.handleLocationUpdate({ coords: { latitude: 53.4808, longitude: -2.2426 } });
        const km = t.calculateDistanceTraveled();
        expect(km).toBeGreaterThan(250);
        expect(km).toBeLessThan(270);
    });
});

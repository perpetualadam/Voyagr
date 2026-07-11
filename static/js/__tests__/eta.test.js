/**
 * Tests for modules/navigation/eta.js
 */
const ETA = require('../modules/navigation/eta.js');

describe('eta module surface', () => {
    test('exposes formatRemainingTime, buildETAVoiceMessage, and formatETATime', () => {
        expect(typeof ETA.formatRemainingTime).toBe('function');
        expect(typeof ETA.buildETAVoiceMessage).toBe('function');
        expect(typeof ETA.formatETATime).toBe('function');
    });
});

describe('formatRemainingTime', () => {
    test('< 1 min → "<1 min"', () => expect(ETA.formatRemainingTime(0.5)).toBe('<1 min'));
    test('whole minutes < 60', () => expect(ETA.formatRemainingTime(45)).toBe('45 min'));
    test('fractional rounds correctly', () => expect(ETA.formatRemainingTime(44.6)).toBe('45 min'));
    test('exactly 60 min → "1h"', () => expect(ETA.formatRemainingTime(60)).toBe('1h'));
    test('90 min → "1h 30min"', () => expect(ETA.formatRemainingTime(90)).toBe('1h 30min'));
    test('120 min → "2h" (no trailing 0min)', () => expect(ETA.formatRemainingTime(120)).toBe('2h'));
    test('135.4 min → "2h 15min"', () => expect(ETA.formatRemainingTime(135.4)).toBe('2h 15min'));
});

describe('buildETAVoiceMessage', () => {
    test('≤ 60 min uses simple template', () => {
        const d = new Date(2026, 0, 1, 14, 5);  // 14:05
        expect(ETA.buildETAVoiceMessage(30, d)).toBe('You will arrive in 30 minutes at 14:05');
    });

    test('> 60 min uses hours-and-minutes template', () => {
        const d = new Date(2026, 0, 1, 16, 30);
        expect(ETA.buildETAVoiceMessage(90, d)).toBe('You will arrive in 1 hour and 30 minutes at 16:30');
    });

    test('plural hours', () => {
        const d = new Date(2026, 0, 1, 18, 0);
        expect(ETA.buildETAVoiceMessage(130, d)).toBe('You will arrive in 2 hours and 10 minutes at 18:00');
    });

    test('single-digit minutes are zero-padded, hour is not (matching original)', () => {
        const d = new Date(2026, 0, 1, 9, 5);
        // Original: `${etaHours}:${String(etaMinutes).padStart(2,'0')}` → "9:05"
        expect(ETA.buildETAVoiceMessage(5, d)).toContain('9:05');
    });
});

describe('formatETATime', () => {
    test('24-hour format zero-pads hours and minutes', () => {
        const d = new Date(2026, 0, 1, 9, 5);
        expect(ETA.formatETATime(d, true)).toBe('09:05');
    });

    test('12-hour format uses AM/PM', () => {
        const d = new Date(2026, 0, 1, 14, 30);
        expect(ETA.formatETATime(d, false)).toBe('2:30 PM');
    });

    test('defaults to 24-hour when use24Hour omitted', () => {
        const d = new Date(2026, 0, 1, 23, 0);
        expect(ETA.formatETATime(d)).toBe('23:00');
    });
});

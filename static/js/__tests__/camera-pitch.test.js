/**
 * Behaviour-first tests for the REAL camera-pitch decision module
 * (static/js/modules/navigation/camera-pitch.js).
 *
 * Unlike the older driver-perspective tests (which re-implement logic inline),
 * this imports the actual function the app delegates to and asserts the full
 * truth table — in particular the new behaviour: 2D navigation stays heading-up
 * but flat.
 */

const { decideDrivingCamera } = require('../modules/navigation/camera-pitch.js');

const decide = (overrides) => decideDrivingCamera({
    activeNavFollow: false,
    driverPerspectiveEnabled: false,
    prefersFlat2D: false,
    ...overrides,
});

describe('decideDrivingCamera', () => {
    describe('browsing (no active navigation)', () => {
        test('default: static north-up, flat', () => {
            expect(decide({})).toEqual({ followHeading: false, tilt: false });
        });

        test('driver view ON: follow heading and tilt', () => {
            expect(decide({ driverPerspectiveEnabled: true }))
                .toEqual({ followHeading: true, tilt: true });
        });

        test('driver view ON but 2D chosen: follow heading, flat', () => {
            expect(decide({ driverPerspectiveEnabled: true, prefersFlat2D: true }))
                .toEqual({ followHeading: true, tilt: false });
        });
    });

    describe('active navigation', () => {
        test('default 3D: follow heading and tilt to 60°', () => {
            expect(decide({ activeNavFollow: true }))
                .toEqual({ followHeading: true, tilt: true });
        });

        test('THE FIX — 2D chosen: still follows heading-up, but stays flat', () => {
            expect(decide({ activeNavFollow: true, prefersFlat2D: true }))
                .toEqual({ followHeading: true, tilt: false });
        });

        test('2D choice overrides driver-view tilt during navigation', () => {
            expect(decide({
                activeNavFollow: true,
                driverPerspectiveEnabled: true,
                prefersFlat2D: true,
            })).toEqual({ followHeading: true, tilt: false });
        });
    });

    describe('robustness', () => {
        test('missing state is treated as all-false (flat overview)', () => {
            expect(decideDrivingCamera()).toEqual({ followHeading: false, tilt: false });
        });

        test('truthy/falsy coercion', () => {
            const r = decideDrivingCamera({ activeNavFollow: 1, prefersFlat2D: 0 });
            expect(r).toEqual({ followHeading: true, tilt: true });
        });

        test('tilt never true without followHeading', () => {
            // Exhaustive: tilt implies followHeading for every input combination.
            for (const a of [false, true]) {
                for (const d of [false, true]) {
                    for (const f of [false, true]) {
                        const r = decideDrivingCamera({
                            activeNavFollow: a, driverPerspectiveEnabled: d, prefersFlat2D: f,
                        });
                        if (r.tilt) expect(r.followHeading).toBe(true);
                    }
                }
            }
        });
    });
});

describe('computeFollowPadding', () => {
    const { computeFollowPadding } = require('../modules/navigation/camera-pitch.js');

    test('scales with viewport height and width', () => {
        expect(computeFollowPadding(800, 400)).toEqual({
            top: 440,
            bottom: 120,
            left: 12,
            right: 12,
        });
    });

    test('caps bottom reserve between 96 and 200', () => {
        expect(computeFollowPadding(400, 300).bottom).toBe(96);
        expect(computeFollowPadding(2000, 300).bottom).toBe(200);
    });
});

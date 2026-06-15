/**
 * Behaviour tests for the real modules/navigation/turn-instructions.js module.
 * These assert the turn-by-turn phrasing/icon/distance rules the app must follow,
 * not a re-implementation of them.
 */
const TI = require('../modules/navigation/turn-instructions.js');

describe('turn-instructions module surface', () => {
    test('exposes the expected pure functions', () => {
        expect(typeof TI.calculateTurnDirection).toBe('function');
        expect(typeof TI.maneuverTypeToDirectionKey).toBe('function');
        expect(typeof TI.getTurnIcon).toBe('function');
        expect(typeof TI.formatTurnDistance).toBe('function');
        expect(typeof TI.getTurnDirectionText).toBe('function');
    });
});

describe('calculateTurnDirection', () => {
    test('no bearing change is straight', () => {
        expect(TI.calculateTurnDirection(90, 90)).toBe('straight');
        expect(TI.calculateTurnDirection(0, 10)).toBe('straight');
        expect(TI.calculateTurnDirection(0, -10)).toBe('straight');
    });

    test('small change (>10, <=35) is a "slight"/keep, not a full turn', () => {
        expect(TI.calculateTurnDirection(0, 30)).toBe('slight_right');
        expect(TI.calculateTurnDirection(0, -30)).toBe('slight_left');
    });

    test('35-degree boundary: <=35 stays slight, >35 becomes a full turn', () => {
        expect(TI.calculateTurnDirection(0, 35)).toBe('slight_right');
        expect(TI.calculateTurnDirection(0, 36)).toBe('right');
        expect(TI.calculateTurnDirection(0, -35)).toBe('slight_left');
        expect(TI.calculateTurnDirection(0, -36)).toBe('left');
    });

    test('large changes are sharp turns', () => {
        expect(TI.calculateTurnDirection(0, 170)).toBe('sharp_right');
        expect(TI.calculateTurnDirection(0, -170)).toBe('sharp_left');
    });

    test('handles wrap-around past 180/-180', () => {
        // 350 -> 10 is a +20 net change (slight right), not -340.
        expect(TI.calculateTurnDirection(350, 10)).toBe('slight_right');
        // 10 -> 350 is -20 net change (slight left).
        expect(TI.calculateTurnDirection(10, 350)).toBe('slight_left');
    });
});

describe('maneuverTypeToDirectionKey', () => {
    test('non-turn maneuvers (start/continue/straight) return null', () => {
        [0, 1, 2, 3, 7, 8, 17, 22].forEach((t) => {
            expect(TI.maneuverTypeToDirectionKey(t)).toBeNull();
        });
    });

    test('destination types', () => {
        [4, 5, 6].forEach((t) => expect(TI.maneuverTypeToDirectionKey(t)).toBe('destination'));
    });

    test('left/right family mappings', () => {
        expect(TI.maneuverTypeToDirectionKey(10)).toBe('right');
        expect(TI.maneuverTypeToDirectionKey(11)).toBe('sharp_right');
        expect(TI.maneuverTypeToDirectionKey(15)).toBe('left');
        expect(TI.maneuverTypeToDirectionKey(14)).toBe('sharp_left');
        expect(TI.maneuverTypeToDirectionKey(9)).toBe('slight_right');
        expect(TI.maneuverTypeToDirectionKey(16)).toBe('slight_left');
    });

    test('exits, merges, roundabouts, u-turns', () => {
        expect(TI.maneuverTypeToDirectionKey(20)).toBe('exit_right');
        expect(TI.maneuverTypeToDirectionKey(21)).toBe('exit_left');
        expect(TI.maneuverTypeToDirectionKey(25)).toBe('merge');
        expect(TI.maneuverTypeToDirectionKey(35)).toBe('merge');
        expect(TI.maneuverTypeToDirectionKey(26)).toBe('roundabout');
        expect(TI.maneuverTypeToDirectionKey(12)).toBe('uturn');
        expect(TI.maneuverTypeToDirectionKey(13)).toBe('uturn');
    });
});

describe('getTurnIcon', () => {
    test('left/right arrows match the maneuver side', () => {
        expect(TI.getTurnIcon(15)).toBe('←');
        expect(TI.getTurnIcon(10)).toBe('→');
        expect(TI.getTurnIcon(21)).toBe('↖'); // exit left -> upper-left
        expect(TI.getTurnIcon(20)).toBe('↗'); // exit right -> upper-right
    });

    test('destination is a flag', () => {
        expect(TI.getTurnIcon(4)).toBe('🏁');
    });

    test('unknown type defaults to straight arrow', () => {
        expect(TI.getTurnIcon(999)).toBe('↑');
        expect(TI.getTurnIcon(undefined)).toBe('↑');
    });
});

describe('formatTurnDistance', () => {
    describe('metric (default)', () => {
        test('under 100 m is rounded to the metre', () => {
            expect(TI.formatTurnDistance(42)).toBe('42 m');
        });
        test('100-1000 m is rounded to nearest 10 m', () => {
            expect(TI.formatTurnDistance(355)).toBe('360 m');
        });
        test('1000 m+ is shown in km to 1 dp', () => {
            expect(TI.formatTurnDistance(2500)).toBe('2.5 km');
        });
    });

    describe('imperial (distanceUnit="mi")', () => {
        test('very short distances are feet', () => {
            expect(TI.formatTurnDistance(30, 'mi')).toBe('98 ft');
        });
        test('0.1-1 mile is feet rounded to nearest 100 ft', () => {
            // 800 m ≈ 0.497 mi → feet rounded to nearest 100.
            expect(TI.formatTurnDistance(800, 'mi')).toBe('2600 ft');
        });
        test('1 mile+ is shown in miles to 1 dp', () => {
            expect(TI.formatTurnDistance(3218.68, 'mi')).toBe('2.0 mi');
        });
    });
});

describe('getTurnDirectionText', () => {
    test('slight turns are phrased as "keep" (the key motorway behaviour)', () => {
        expect(TI.getTurnDirectionText('slight_left')).toBe('keep left');
        expect(TI.getTurnDirectionText('slight-right')).toBe('keep right');
    });

    test('full turns are phrased as "turn"', () => {
        expect(TI.getTurnDirectionText('left')).toBe('turn left');
        expect(TI.getTurnDirectionText('right')).toBe('turn right');
        expect(TI.getTurnDirectionText('sharp_left')).toBe('turn sharply left');
    });

    test('both underscore and hyphen key forms are accepted', () => {
        expect(TI.getTurnDirectionText('u-turn')).toBe('make a U-turn');
        expect(TI.getTurnDirectionText('uturn')).toBe('make a U-turn');
    });

    test('unknown direction defaults to "continue"', () => {
        expect(TI.getTurnDirectionText('banana')).toBe('continue');
        expect(TI.getTurnDirectionText(undefined)).toBe('continue');
    });
});

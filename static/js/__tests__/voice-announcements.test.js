/**
 * Behaviour tests for the real modules/navigation/voice-announcements.js module.
 * These assert the spoken phrasing rules the app must follow (threshold wording, unit
 * wording, street joining, Valhalla-phrase preference), not a re-implementation of them.
 */
const VA = require('../modules/navigation/voice-announcements.js');

describe('voice-announcements module surface', () => {
    test('exposes the expected pure functions', () => {
        expect(typeof VA.isExitDirection).toBe('function');
        expect(typeof VA.isKeepDirection).toBe('function');
        expect(typeof VA.buildTurnAnnouncement).toBe('function');
        expect(typeof VA.buildDestinationAnnouncement).toBe('function');
    });
});

describe('isExitDirection / isKeepDirection', () => {
    test('exit keys (underscore and hyphen) are exits', () => {
        ['exit', 'exit_left', 'exit_right', 'exit-left', 'exit-right'].forEach((d) => {
            expect(VA.isExitDirection(d)).toBe(true);
        });
    });

    test('keep keys (underscore and hyphen) are keeps', () => {
        ['slight_left', 'slight_right', 'slight-left', 'slight-right'].forEach((d) => {
            expect(VA.isKeepDirection(d)).toBe(true);
        });
    });

    test('plain turns are neither exit nor keep', () => {
        ['left', 'right', 'straight', 'uturn'].forEach((d) => {
            expect(VA.isExitDirection(d)).toBe(false);
            expect(VA.isKeepDirection(d)).toBe(false);
        });
    });
});

describe('buildTurnAnnouncement — plain turns', () => {
    const base = { direction: 'left', directionText: 'turn left', streetName: 'High Street' };

    test('500 m threshold: metric vs imperial wording', () => {
        expect(VA.buildTurnAnnouncement({ ...base, announcementDistance: 500 }))
            .toBe('In 500 meters, turn left onto High Street');
        expect(VA.buildTurnAnnouncement({ ...base, announcementDistance: 500, distanceUnit: 'mi' }))
            .toBe('In 1600 feet, turn left onto High Street');
    });

    test('200 m and 100 m thresholds', () => {
        expect(VA.buildTurnAnnouncement({ ...base, announcementDistance: 200 }))
            .toBe('In 200 meters, turn left onto High Street');
        expect(VA.buildTurnAnnouncement({ ...base, announcementDistance: 100, distanceUnit: 'mi' }))
            .toBe('In 300 feet, turn left onto High Street');
    });

    test('50 m threshold is the bare instruction', () => {
        expect(VA.buildTurnAnnouncement({ ...base, announcementDistance: 50 }))
            .toBe('turn left onto High Street');
    });

    test('plain turns join the street with " onto " (not " toward ")', () => {
        const msg = VA.buildTurnAnnouncement({ ...base, announcementDistance: 200 });
        expect(msg).toContain(' onto ');
        expect(msg).not.toContain(' toward ');
    });

    test('no street name omits the join phrase entirely', () => {
        expect(VA.buildTurnAnnouncement({ direction: 'right', directionText: 'turn right', announcementDistance: 50 }))
            .toBe('turn right');
    });

    test('Valhalla verbal alert is preferred at the 500 m threshold', () => {
        expect(VA.buildTurnAnnouncement({
            ...base, announcementDistance: 500, verbalAlert: 'Turn left to stay on the A1'
        })).toBe('Turn left to stay on the A1');
    });

    test('Valhalla verbal pre-instruction is preferred at the 100 m threshold', () => {
        expect(VA.buildTurnAnnouncement({
            ...base, announcementDistance: 100, verbalPre: 'Turn left now'
        })).toBe('Turn left now');
    });
});

describe('buildTurnAnnouncement — exits', () => {
    test('2 km threshold wording, with side and street', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'exit_right', announcementDistance: 2000, streetName: 'M1'
        })).toBe('In 2 kilometers, take the exit on the right toward M1');
        expect(VA.buildTurnAnnouncement({
            direction: 'exit_right', announcementDistance: 2000, streetName: 'M1', distanceUnit: 'mi'
        })).toBe('In about 1 mile, take the exit on the right toward M1');
    });

    test('left exits say "on the left"', () => {
        expect(VA.buildTurnAnnouncement({ direction: 'exit_left', announcementDistance: 800 }))
            .toBe('In 800 meters, prepare to exit on the left');
    });

    test('near thresholds are urgent and unitless', () => {
        expect(VA.buildTurnAnnouncement({ direction: 'exit_right', announcementDistance: 200 }))
            .toBe('Exit ahead on the right');
        expect(VA.buildTurnAnnouncement({ direction: 'exit_right', announcementDistance: 100 }))
            .toBe('Exit now on the right');
    });

    test('exits join the street with " toward "', () => {
        const msg = VA.buildTurnAnnouncement({ direction: 'exit_left', announcementDistance: 200, streetName: 'Services' });
        expect(msg).toBe('Exit ahead on the left toward Services');
    });
});

describe('buildTurnAnnouncement — keeps', () => {
    test('1 km threshold prefers verbal alert, else synthesises keep wording', () => {
        expect(VA.buildTurnAnnouncement({ direction: 'slight_left', announcementDistance: 1000 }))
            .toBe('In 1 kilometer, keep left');
        expect(VA.buildTurnAnnouncement({ direction: 'slight_left', announcementDistance: 1000, distanceUnit: 'mi' }))
            .toBe('In half a mile, keep left');
        expect(VA.buildTurnAnnouncement({
            direction: 'slight_left', announcementDistance: 1000, verbalAlert: 'Keep left to take the ramp'
        })).toBe('Keep left to take the ramp');
    });

    test('400 m threshold wording', () => {
        expect(VA.buildTurnAnnouncement({ direction: 'slight_right', announcementDistance: 400 }))
            .toBe('In 400 meters, keep right');
        expect(VA.buildTurnAnnouncement({ direction: 'slight_right', announcementDistance: 400, distanceUnit: 'mi' }))
            .toBe('In 1300 feet, keep right');
    });

    test('near thresholds prefer verbal pre, else synthesise', () => {
        expect(VA.buildTurnAnnouncement({ direction: 'slight_right', announcementDistance: 150 }))
            .toBe('Keep right');
        expect(VA.buildTurnAnnouncement({ direction: 'slight_right', announcementDistance: 50 }))
            .toBe('Keep right now');
        expect(VA.buildTurnAnnouncement({
            direction: 'slight_right', announcementDistance: 50, verbalPre: 'Bear right onto the slip road'
        })).toBe('Bear right onto the slip road');
    });
});

describe('buildTurnAnnouncement — roundabouts', () => {
    test('500 m threshold with exit count', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'roundabout',
            announcementDistance: 500,
            valhallaType: 26,
            roundaboutExitCount: 3,
            streetName: 'High Street'
        })).toBe('In 500 meters, take the 3rd exit onto High Street');
    });

    test('prefers verbal pre at 50 m', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'roundabout',
            announcementDistance: 50,
            valhallaType: 26,
            roundaboutExitCount: 2,
            verbalPre: 'Take the second exit'
        })).toBe('Take the second exit');
    });

    test('500 m prefers a Valhalla verbal alert when present', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'roundabout', announcementDistance: 500, valhallaType: 26,
            roundaboutExitCount: 2, verbalAlert: 'Enter the roundabout and take the 2nd exit'
        })).toBe('Enter the roundabout and take the 2nd exit');
    });

    test('200 m threshold wording (metric), with an "nth" ordinal exit', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'roundabout', announcementDistance: 200, valhallaType: 26,
            roundaboutExitCount: 4, streetName: 'Mill Lane'
        })).toBe('In 200 meters, take the 4th exit onto Mill Lane');
    });

    test('100 m threshold synthesises wording when no verbal pre is given', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'roundabout', announcementDistance: 100, valhallaType: 27,
            roundaboutExitCount: 1
        })).toBe('In 100 meters, take the 1st exit');
    });

    test('100 m threshold prefers verbal pre when present', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'roundabout', announcementDistance: 100, valhallaType: 26,
            roundaboutExitCount: 2, verbalPre: 'Take the 2nd exit now'
        })).toBe('Take the 2nd exit now');
    });

    test('200 m imperial wording', () => {
        expect(VA.buildTurnAnnouncement({
            direction: 'roundabout', announcementDistance: 200, valhallaType: 26,
            roundaboutExitCount: 2, distanceUnit: 'mi'
        })).toBe('In 600 feet, take the 2nd exit');
    });
});

describe('buildTurnAnnouncement — defensive', () => {
    test('unknown threshold returns empty string', () => {
        expect(VA.buildTurnAnnouncement({ direction: 'left', directionText: 'turn left', announcementDistance: 12345 }))
            .toBe('');
    });

    test('no options returns empty string', () => {
        expect(VA.buildTurnAnnouncement()).toBe('');
    });
});

describe('buildDestinationAnnouncement', () => {
    test('long-range milestones use the unit label, imperial converts km->mi', () => {
        expect(VA.buildDestinationAnnouncement(10000, 'km')).toBe('10 km to destination');
        expect(VA.buildDestinationAnnouncement(5000, 'km')).toBe('5 km to destination');
        expect(VA.buildDestinationAnnouncement(2000, 'km')).toBe('2 km to destination');
        expect(VA.buildDestinationAnnouncement(1000, 'km')).toBe('1 km to destination');
        expect(VA.buildDestinationAnnouncement(10000, 'mi')).toBe('6.2 mi to destination');
        expect(VA.buildDestinationAnnouncement(2000, 'mi')).toBe('1.2 mi to destination');
        expect(VA.buildDestinationAnnouncement(1000, 'mi')).toBe('0.6 mi to destination');
    });

    test('500 m milestone has fixed metric/imperial wording', () => {
        expect(VA.buildDestinationAnnouncement(500, 'km')).toBe('500 meters to destination');
        expect(VA.buildDestinationAnnouncement(500, 'mi')).toBe('1600 feet to destination');
    });

    test('100 m milestone is the arrival phrase', () => {
        expect(VA.buildDestinationAnnouncement(100, 'km')).toBe('Arriving at destination');
    });

    test('unknown milestone returns empty string', () => {
        expect(VA.buildDestinationAnnouncement(750, 'km')).toBe('');
    });
});

describe('turn announcement threshold helpers', () => {
    const turnDistances = [500, 200, 100, 50];
    const exitDistances = [2000, 800, 200, 100];
    const keepDistances = [1000, 400, 150, 50];

    test('resolveTurnAnnouncementCategory maps direction families', () => {
        expect(VA.resolveTurnAnnouncementCategory('exit_right')).toBe('exit');
        expect(VA.resolveTurnAnnouncementCategory('slight_left')).toBe('keep');
        expect(VA.resolveTurnAnnouncementCategory('left')).toBe('turn');
    });

    test('resolveAnnouncementDistancesForDirection picks the right array', () => {
        expect(VA.resolveAnnouncementDistancesForDirection('exit_left', turnDistances, exitDistances, keepDistances))
            .toBe(exitDistances);
        expect(VA.resolveAnnouncementDistancesForDirection('slight_right', turnDistances, exitDistances, keepDistances))
            .toBe(keepDistances);
        expect(VA.resolveAnnouncementDistancesForDirection('right', turnDistances, exitDistances, keepDistances))
            .toBe(turnDistances);
    });

    test('resolveThresholdResetDistance matches maneuver category', () => {
        expect(VA.resolveThresholdResetDistance('exit_right')).toBe(2500);
        expect(VA.resolveThresholdResetDistance('slight_left')).toBe(1500);
        expect(VA.resolveThresholdResetDistance('left')).toBe(600);
    });

    test('pickTurnAnnouncementThreshold picks most urgent unannounced threshold', () => {
        const announced = new Set();
        const picked = VA.pickTurnAnnouncementThreshold(180, turnDistances, announced);
        expect(picked).toEqual({ threshold: 200, markPassed: [500] });

        announced.add(200);
        announced.add(500);
        const picked2 = VA.pickTurnAnnouncementThreshold(95, turnDistances, announced);
        expect(picked2).toEqual({ threshold: 100, markPassed: [500, 200] });
    });

    test('pickTurnAnnouncementThreshold marks farther thresholds passed when closer one fires', () => {
        const announced = new Set();
        const picked = VA.pickTurnAnnouncementThreshold(450, turnDistances, announced);
        expect(picked.threshold).toBe(500);
        expect(picked.markPassed).toEqual([]);
    });

    test('appendChainedFollowingManeuver adds then-clause only at imminent threshold', () => {
        const follow = { direction: 'right', gapMeters: 200, index: 2 };
        const msg = 'turn left onto High Street';
        expect(VA.appendChainedFollowingManeuver(msg, 500, turnDistances, follow, {
            getTurnDirectionText: (d) => (d === 'right' ? 'turn right' : d),
        })).toBe(msg);
        expect(VA.appendChainedFollowingManeuver(msg, 50, turnDistances, follow, {
            getTurnDirectionText: (d) => (d === 'right' ? 'turn right' : d),
        })).toBe('turn left onto High Street, then turn right');
    });

    test('appendChainedFollowingManeuver skips when follow gap exceeds 900 m', () => {
        const msg = 'turn left';
        expect(VA.appendChainedFollowingManeuver(msg, 50, turnDistances, {
            direction: 'right', gapMeters: 950, index: 1,
        }, { getTurnDirectionText: () => 'turn right' })).toBe(msg);
    });
});

describe('voiceAnnouncementStateResetValues', () => {
    test('returns scalar reset fields for new route geometry', () => {
        const patch = VA.voiceAnnouncementStateResetValues(12345);
        expect(patch.lastETAAnnouncementTime).toBe(12345);
        expect(patch.lastAnnouncedETA).toBeNull();
        expect(patch.lastDestinationAnnouncementDistance).toBe(Infinity);
        expect(patch.voiceAnnouncedForManeuverIndex).toBeNull();
        expect(patch.lastLaneVoiceKey).toBe('');
    });
});

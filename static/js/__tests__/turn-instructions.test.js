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

describe('maneuverTypeToLaneDirectionKey / maneuverTypeToARDirectionKey', () => {
    test('lane key defaults non-turn maneuvers to straight', () => {
        expect(TI.maneuverTypeToLaneDirectionKey(8)).toBe('straight');
        expect(TI.maneuverTypeToLaneDirectionKey(10)).toBe('right');
        expect(TI.maneuverTypeToLaneDirectionKey(20)).toBe('exit_right');
    });

    test('AR key uses hyphenated labels for overlay rotation', () => {
        expect(TI.maneuverTypeToARDirectionKey(10)).toBe('right');
        expect(TI.maneuverTypeToARDirectionKey(9)).toBe('slight-right');
        expect(TI.maneuverTypeToARDirectionKey(12)).toBe('u-turn');
        expect(TI.maneuverTypeToARDirectionKey(8)).toBe('straight');
        expect(TI.maneuverTypeToARDirectionKey(20)).toBe('exit');
    });
});

describe('refineManeuverDirection', () => {
    test('promotes ramp left on motorway to exit_left', () => {
        expect(TI.refineManeuverDirection(19, 'slight_left', 'motorway')).toBe('exit_left');
    });
    test('promotes left turn on motorway to exit_left', () => {
        expect(TI.refineManeuverDirection(15, 'left', 'motorway')).toBe('exit_left');
    });
    test('does not change residential left turn', () => {
        expect(TI.refineManeuverDirection(15, 'left', 'residential')).toBe('left');
    });
    test('stay/slight on motorway stay as keep (not exit)', () => {
        expect(TI.refineManeuverDirection(9, 'slight_right', 'motorway')).toBe('slight_right');
        expect(TI.refineManeuverDirection(23, 'slight_right', 'motorway')).toBe('slight_right');
        expect(TI.refineManeuverDirection(16, 'slight_left', 'motorway')).toBe('slight_left');
        expect(TI.refineManeuverDirection(24, 'slight_left', 'trunk')).toBe('slight_left');
    });
});

describe('buildTurnDisplayInstruction', () => {
    test('prefers exit phrasing over raw turn-left engine text', () => {
        expect(TI.buildTurnDisplayInstruction('exit_left', 'Turn left onto A556', 21, 0))
            .toBe('take the exit on the left');
    });
    test('roundabout exit count phrasing', () => {
        expect(TI.buildTurnDisplayInstruction('roundabout', '', 26, 2))
            .toBe('at the roundabout, take the 2nd exit');
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

describe('refineManeuverDirection', () => {
    test('non-motorway road class leaves the direction unchanged', () => {
        expect(TI.refineManeuverDirection(10, 'right', 'residential')).toBe('right');
    });

    test('already-exit directions are preserved on motorways', () => {
        expect(TI.refineManeuverDirection(10, 'exit_left', 'motorway')).toBe('exit_left');
        expect(TI.refineManeuverDirection(10, 'exit_right', 'motorway')).toBe('exit_right');
    });

    test('motorway right-family ramp/turn become exit_right; stay/slight keep', () => {
        [18, 10].forEach((t) => {
            expect(TI.refineManeuverDirection(t, 'right', 'motorway')).toBe('exit_right');
        });
        [9, 23].forEach((t) => {
            expect(TI.refineManeuverDirection(t, 'slight_right', 'motorway')).toBe('slight_right');
        });
    });

    test('motorway left-family ramp/turn become exit_left; stay/slight keep', () => {
        [19, 15, 14].forEach((t) => {
            expect(TI.refineManeuverDirection(t, 'left', 'motorway')).toBe('exit_left');
        });
        [16, 24].forEach((t) => {
            expect(TI.refineManeuverDirection(t, 'slight_left', 'motorway')).toBe('slight_left');
        });
    });

    test('motorway type without an exit mapping keeps the original direction', () => {
        expect(TI.refineManeuverDirection(8, 'straight', 'motorway')).toBe('straight');
    });

    test('missing direction is returned as-is', () => {
        expect(TI.refineManeuverDirection(10, null, 'motorway')).toBeNull();
    });
});

describe('getRoundaboutDirectionText', () => {
    test('exit (type 27) with a count uses the ordinal exit', () => {
        expect(TI.getRoundaboutDirectionText(27, 1)).toBe('take the 1st exit');
        expect(TI.getRoundaboutDirectionText(27, 2)).toBe('take the 2nd exit');
        expect(TI.getRoundaboutDirectionText(27, 3)).toBe('take the 3rd exit');
        expect(TI.getRoundaboutDirectionText(27, 4)).toBe('take the 4th exit');
        expect(TI.getRoundaboutDirectionText(27, 11)).toBe('take the 11th exit');
    });

    test('enter (type 26) with a count phrases "at the roundabout"', () => {
        expect(TI.getRoundaboutDirectionText(26, 2)).toBe('at the roundabout, take the 2nd exit');
    });

    test('no exit count falls back to enter/leave phrasing', () => {
        expect(TI.getRoundaboutDirectionText(27, 0)).toBe('leave the roundabout');
        expect(TI.getRoundaboutDirectionText(26, 0)).toBe('enter the roundabout');
    });
});

describe('buildTurnDisplayInstruction', () => {
    test('roundabout delegates to roundabout phrasing', () => {
        expect(TI.buildTurnDisplayInstruction('roundabout', 'ignored', 27, 2)).toBe('take the 2nd exit');
    });

    test('exit/slight directions use direction text over raw instruction', () => {
        expect(TI.buildTurnDisplayInstruction('exit_left', 'raw text')).toBe(TI.getTurnDirectionText('exit_left'));
        expect(TI.buildTurnDisplayInstruction('slight_right', 'raw text')).toBe(TI.getTurnDirectionText('slight_right'));
    });

    test('raw instruction is used when present for ordinary turns', () => {
        expect(TI.buildTurnDisplayInstruction('left', 'Turn left onto High St')).toBe('Turn left onto High St');
    });

    test('falls back to direction text (then straight) when no raw instruction', () => {
        expect(TI.buildTurnDisplayInstruction('left', '   ')).toBe(TI.getTurnDirectionText('left'));
        expect(TI.buildTurnDisplayInstruction(null)).toBe(TI.getTurnDirectionText('straight'));
    });
});

describe('ordinalEnglishExit', () => {
    test('1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st', () => {
        expect(TI.ordinalEnglishExit(1)).toBe('1st');
        expect(TI.ordinalEnglishExit(2)).toBe('2nd');
        expect(TI.ordinalEnglishExit(3)).toBe('3rd');
        expect(TI.ordinalEnglishExit(4)).toBe('4th');
        expect(TI.ordinalEnglishExit(11)).toBe('11th');
        expect(TI.ordinalEnglishExit(12)).toBe('12th');
        expect(TI.ordinalEnglishExit(13)).toBe('13th');
        expect(TI.ordinalEnglishExit(21)).toBe('21st');
    });
});

describe('laneOrdinalEnglish', () => {
    test('1st-3rd then nth', () => {
        expect(TI.laneOrdinalEnglish(1)).toBe('1st');
        expect(TI.laneOrdinalEnglish(2)).toBe('2nd');
        expect(TI.laneOrdinalEnglish(3)).toBe('3rd');
        expect(TI.laneOrdinalEnglish(4)).toBe('4th');
    });
});

describe('buildTurnLaneHintHtml', () => {
    test('roundabout exit count badge', () => {
        const html = TI.buildTurnLaneHintHtml({ type: 27, lanes: null }, 2, 500);
        expect(html).toContain('2nd exit');
    });

    test('keep-left chip for slight-left type within 900m', () => {
        const html = TI.buildTurnLaneHintHtml({ type: 16, lanes: null }, 0, 400);
        expect(html).toContain('Keep left');
    });

    test('no keep chip beyond 900m', () => {
        const html = TI.buildTurnLaneHintHtml({ type: 16, lanes: null }, 0, 1000);
        expect(html).toBe('');
    });

    test('hard turn types get no keep chip', () => {
        // type 15 = left turn, should NOT get "Keep left"
        const html = TI.buildTurnLaneHintHtml({ type: 15, lanes: null }, 0, 500);
        expect(html).not.toContain('Keep left');
    });

    test('null maneuver returns empty string', () => {
        expect(TI.buildTurnLaneHintHtml(null, 0, 500)).toBe('');
    });

    test('keep-right chip for slight-right type within 900m on motorways', () => {
        const html = TI.buildTurnLaneHintHtml({ type: 9, lanes: null }, 0, 400, 'motorway');
        expect(html).toContain('Keep right');
    });

    test('no keep-right chip on 2-lane primary (UK left-hand default)', () => {
        const html = TI.buildTurnLaneHintHtml({ type: 9, lanes: null }, 0, 400, 'primary');
        expect(html).not.toContain('Keep right');
        expect(html).not.toContain('Keep left');
    });

    test('shouldShowUkKeepLaneHint suppresses slight keeps on 2-lane A-roads', () => {
        expect(TI.shouldShowUkKeepLaneHint(9, 'right', 'primary')).toBe(false);
        expect(TI.shouldShowUkKeepLaneHint(9, 'right', 'motorway')).toBe(true);
    });

    test('active lane indicator shows lane ordinal chip', () => {
        const html = TI.buildTurnLaneHintHtml(
            { type: 10, lanes: [{ active: false }, { active: true }] },
            0, 500
        );
        expect(html).toContain('2nd lane');
    });

    test('valid_indications fallback sets lane chip when no active flag', () => {
        const html = TI.buildTurnLaneHintHtml(
            { type: 10, lanes: [{ valid_indications: [] }, { valid_indications: ['right'] }] },
            0, 500
        );
        expect(html).toContain('2nd lane');
    });
});

describe('isMotorwayRoadClass', () => {
    test('null/empty road class is not a motorway', () => {
        expect(TI.isMotorwayRoadClass(null)).toBe(false);
        expect(TI.isMotorwayRoadClass('')).toBe(false);
    });

    test('motorway/trunk families are recognised (case-insensitive)', () => {
        ['motorway', 'motorway_link', 'trunk', 'TRUNK_LINK'].forEach((rc) => {
            expect(TI.isMotorwayRoadClass(rc)).toBe(true);
        });
        expect(TI.isMotorwayRoadClass('residential')).toBe(false);
    });
});

describe('instructions panel HTML helpers', () => {
    test('INSTRUCTIONS_EMPTY_HTML shows fallback message', () => {
        expect(TI.INSTRUCTIONS_EMPTY_HTML).toContain('No instructions available');
    });

    test('buildInstructionListItemHtml includes preview onclick handler', () => {
        const html = TI.buildInstructionListItemHtml({
            itemClass: 'instruction-item current',
            stepIndex: 2,
            shapeIndex: 40,
            icon: '→',
            instruction: 'Turn right',
            exitBadge: '',
            streetName: 'High St',
            statusHtml: TI.buildInstructionStatusHtml(false, true),
        });
        expect(html).toContain('previewInstructionOnMap(2, 40)');
        expect(html).toContain('Turn right');
        expect(html).toContain('High St');
        expect(html).toContain('→ Next');
    });

    test('buildInstructionsListHtml returns empty state when no steps', () => {
        const plan = TI.buildInstructionsListHtml([], 0, { getTurnIcon: TI.getTurnIcon });
        expect(plan.html).toBe(TI.INSTRUCTIONS_EMPTY_HTML);
        expect(plan.countText).toBe('0 steps');
    });

    test('buildInstructionsListHtml marks current and passed steps with remaining count', () => {
        const steps = [
            { type: 8, instruction: 'Continue', street_names: ['A Road'], begin_shape_index: 0 },
            { type: 10, instruction: 'Turn right', street_names: ['B Lane'], begin_shape_index: 12 },
            { type: 8, instruction: 'Continue', street_names: [], begin_shape_index: 20 },
        ];
        const plan = TI.buildInstructionsListHtml(steps, 1, { getTurnIcon: TI.getTurnIcon });
        expect(plan.countText).toBe('2 of 3 steps remaining');
        expect(plan.html).toContain('instruction-item passed');
        expect(plan.html).toContain('instruction-item current');
        expect(plan.html).toContain('Turn right');
        expect(plan.html).toContain('previewInstructionOnMap(1, 12)');
    });
});

describe('effectiveRoundaboutExitCountFromSteps', () => {
    test('reads exit count from enter maneuver', () => {
        const steps = [{ type: 26, roundabout_exit_count: 3 }];
        expect(TI.effectiveRoundaboutExitCountFromSteps(steps, 0)).toBe(3);
    });

    test('falls back to next exit maneuver after roundabout enter', () => {
        const steps = [
            { type: 26, roundabout_exit_count: 0 },
            { type: 27, roundabout_exit_count: 2 },
        ];
        expect(TI.effectiveRoundaboutExitCountFromSteps(steps, 0)).toBe(2);
    });
});

describe('buildLaneGuidanceTickPlan', () => {
    test('skips when route is not active', () => {
        expect(TI.buildLaneGuidanceTickPlan({ routeInProgress: false, routeSteps: [] }).action)
            .toBe('skip');
    });

    test('skips when current step index is out of range', () => {
        expect(TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [{ type: 8 }],
            currentStepIndex: 5,
        })).toMatchObject({ action: 'skip', reason: 'no-step' });
    });

    test('resolves maneuver direction and roundabout exit count', () => {
        const steps = [
            { type: 26, roundabout_exit_count: 0 },
            { type: 27, roundabout_exit_count: 3 },
        ];
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: steps,
            currentStepIndex: 0,
        });
        expect(plan.action).toBe('update');
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(3);
    });

    test('uses straight for continue maneuvers', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [{ type: 8 }],
            currentStepIndex: 0,
        });
        expect(plan.action).toBe('update');
        expect(plan.maneuverDir).toBe('straight');
        expect(plan.roundaboutExitCount).toBe(0);
    });

    test('looks ahead from continue to upcoming roundabout needing right lane', () => {
        // Drivers on a continue after leaving a motorway must pre-position for
        // upcoming roundabout exits instead of ignoring them until the last moment.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 1.2, road_class: 'primary' }, // 1.2 km continue
                { type: 26, distance: 0.1, roundabout_exit_count: 3, road_class: 'primary' },
            ],
            currentStepIndex: 0,
            roadClass: 'primary',
        });
        expect(plan.action).toBe('update');
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(3);
        expect(plan.lookAhead).toBe(true);
        expect(plan.guidanceStepIndex).toBe(1);
    });

    test('looks ahead to 2nd-exit roundabout on dual approach', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.8 },
                { type: 26, roundabout_exit_count: 0 },
                { type: 27, roundabout_exit_count: 2 },
            ],
            currentStepIndex: 0,
            roadClass: 'trunk',
        });
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(2);
        expect(plan.lookAhead).toBe(true);
    });

    test('does not look ahead past the roundabout distance budget', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 5.0 }, // 5 km > 4 km roundabout lookahead
                { type: 26, roundabout_exit_count: 3 },
            ],
            currentStepIndex: 0,
            roadClass: 'primary',
        });
        expect(plan.maneuverDir).toBe('straight');
        expect(plan.lookAhead).toBe(false);
    });

    test('looks ahead from long motorway off-slip to 3rd-exit roundabout', () => {
        // Long UK slips often exceed the old 2 km budget; right-lane prep must start
        // as soon as the driver is on the link, not halfway down the dual approach.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 3.2, road_class: 'motorway_link' },
                {
                    type: 26,
                    distance: 0.05,
                    roundabout_exit_count: 3,
                    road_class: 'primary',
                },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway_link',
        });
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(3);
        expect(plan.lookAhead).toBe(true);
        expect(plan.guidanceStepIndex).toBe(1);
        expect(3.2 * 1000).toBeLessThanOrEqual(TI.LANE_LOOKAHEAD_ROUNDABOUT_MAX_M);
    });

    test('looks ahead to exit/right turns with larger distance budgets', () => {
        const exitPlan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 2.2 }, // within exit budget (2.5 km)
                { type: 20, distance: 0.1 }, // exit_right
            ],
            currentStepIndex: 0,
            roadClass: 'motorway',
        });
        expect(exitPlan.maneuverDir).toBe('exit_right');
        expect(exitPlan.lookAhead).toBe(true);

        const turnPlan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.5 },
                { type: 10, distance: 0.1 }, // right turn
            ],
            currentStepIndex: 0,
        });
        expect(turnPlan.maneuverDir).toBe('right');
        expect(turnPlan.lookAhead).toBe(true);
    });

    test('skips intervening neutral continues when looking ahead', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.3 },
                { type: 8, distance: 0.4 }, // intervening continue
                { type: 26, roundabout_exit_count: 3 },
            ],
            currentStepIndex: 0,
            roadClass: 'primary',
        });
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(3);
        expect(plan.guidanceStepIndex).toBe(2);
        expect(plan.lookAhead).toBe(true);
    });

    test('resolveLaneGuidanceTargetFromSteps handles missing step', () => {
        expect(TI.resolveLaneGuidanceTargetFromSteps([], 0)).toMatchObject({
            maneuverDir: 'straight',
            lookAhead: false,
        });
        expect(TI.isLaneNeutralManeuverDir('straight')).toBe(true);
        expect(TI.isLaneNeutralManeuverDir('roundabout')).toBe(false);
    });

    test('slight_right on 2-lane primary becomes straight for lane guidance', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [{ type: 9 }],
            currentStepIndex: 0,
            roadClass: 'primary',
        });
        expect(plan.maneuverDir).toBe('straight');
    });

    test('slight_right on motorway stays slight_right', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [{ type: 9 }],
            currentStepIndex: 0,
            roadClass: 'motorway',
        });
        expect(plan.maneuverDir).toBe('slight_right');
    });

    test('does not look ahead from slip road to later motorway keep-right', () => {
        // Roundabout → motorway_link slip → motorway continue → keep right because
        // left lanes peel onto another motorway. While still on the slip, left lane
        // is fine for joining; do not force right for the later fork.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.4, road_class: 'motorway_link' }, // slip continue
                { type: 8, distance: 0.5, road_class: 'motorway' }, // joined
                { type: 23, distance: 0.1, road_class: 'motorway' }, // stay/keep right
            ],
            currentStepIndex: 0,
            roadClass: 'motorway_link',
        });
        expect(plan.maneuverDir).toBe('straight');
        expect(plan.lookAhead).toBe(false);
        expect(plan.guidanceStepIndex).toBe(0);
    });

    test('still looks ahead from slip road to merge onto motorway', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.3, road_class: 'motorway_link' },
                { type: 25, distance: 0.1, road_class: 'motorway' }, // merge
                { type: 23, distance: 0.1, road_class: 'motorway' }, // later keep right
            ],
            currentStepIndex: 0,
            roadClass: 'motorway_link',
        });
        expect(plan.maneuverDir).toBe('merge');
        expect(plan.lookAhead).toBe(true);
        expect(plan.guidanceStepIndex).toBe(1);
    });

    test('looks ahead to motorway keep-right once already on the motorway', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.5, road_class: 'motorway' },
                { type: 23, distance: 0.1, road_class: 'motorway' }, // stay/keep right
            ],
            currentStepIndex: 0,
            roadClass: 'motorway',
        });
        expect(plan.maneuverDir).toBe('slight_right');
        expect(plan.lookAhead).toBe(true);
        expect(plan.guidanceStepIndex).toBe(1);
    });

    test('still looks ahead to keep-right fork that remains on the slip', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.2, road_class: 'motorway_link' },
                { type: 23, distance: 0.1, road_class: 'motorway_link' },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway_link',
        });
        expect(plan.maneuverDir).toBe('slight_right');
        expect(plan.lookAhead).toBe(true);
    });

    test('isSlipLinkRoadClass recognises motorway and trunk links only', () => {
        expect(TI.isSlipLinkRoadClass('motorway_link')).toBe(true);
        expect(TI.isSlipLinkRoadClass('trunk_link')).toBe(true);
        expect(TI.isSlipLinkRoadClass('motorway')).toBe(false);
        expect(TI.isSlipLinkRoadClass('primary')).toBe(false);
        expect(TI.isSlipLinkRoadClass('')).toBe(false);
    });

    test('looks ahead from off-slip continue to 3rd-exit roundabout (offline route steps)', () => {
        // Motorway leave → short link continue → roundabout 3rd exit. Turn/Then may
        // still mention the exit, but lane guidance must prep right for the roundabout.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.35, road_class: 'motorway_link' },
                {
                    type: 26,
                    distance: 0.05,
                    roundabout_exit_count: 3,
                    road_class: 'primary',
                },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway_link',
        });
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(3);
        expect(plan.lookAhead).toBe(true);
        expect(plan.guidanceStepIndex).toBe(1);
    });

    test('active hard exit prefers following 3rd-exit roundabout for lanes', () => {
        // Then-row shows "3rd exit" while current step is the motorway exit — without
        // this peek, lane guidance stays on keep-left and the dual approach is too late.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 21, distance: 0.2, road_class: 'motorway' }, // exit_left
                { type: 8, distance: 0.25, road_class: 'motorway_link' },
                {
                    type: 26,
                    distance: 0.05,
                    roundabout_exit_count: 0,
                    road_class: 'primary',
                },
                { type: 27, distance: 0.05, roundabout_exit_count: 3, road_class: 'primary' },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway',
        });
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(3);
        expect(plan.lookAhead).toBe(true);
    });

    test('active keep-left on motorway mainline still targets the exit, not the roundabout', () => {
        // Distant keep-left: driver still needs the left lane to leave the motorway.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 16, distance: 1.0, road_class: 'motorway' }, // slight_left
                {
                    type: 26,
                    distance: 0.05,
                    roundabout_exit_count: 3,
                    road_class: 'primary',
                },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway',
        });
        expect(plan.maneuverDir).toBe('slight_left');
        expect(plan.lookAhead).toBe(false);
    });

    test('motorway continue still targets exit-left before a later roundabout', () => {
        // From the mainline, leave left first; roundabout right-lane prep starts on the slip.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.8, road_class: 'motorway' },
                { type: 21, distance: 0.2, road_class: 'motorway' },
                {
                    type: 26,
                    distance: 0.05,
                    roundabout_exit_count: 3,
                    road_class: 'primary',
                },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway',
        });
        expect(plan.maneuverDir).toBe('exit_left');
        expect(plan.lookAhead).toBe(true);
        expect(plan.guidanceStepIndex).toBe(1);
    });

    test('active exit on off-slip peeks to 2nd-exit roundabout', () => {
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 19, distance: 0.15, road_class: 'motorway_link' }, // ramp left on slip
                {
                    type: 26,
                    roundabout_exit_count: 2,
                    road_class: 'trunk',
                },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway_link',
        });
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(2);
        expect(plan.lookAhead).toBe(true);
    });

    test('off-slip continue peeks past trunk keep-left to 3rd-exit roundabout', () => {
        // Leaving the motorway: slip continue → trunk keep-left → roundabout 3rd exit.
        // Joining-slip guard must not stop the loop on the trunk keep; peek to the
        // roundabout so lane guidance preps right instead of staying neutral.
        const plan = TI.buildLaneGuidanceTickPlan({
            routeInProgress: true,
            routeSteps: [
                { type: 8, distance: 0.25, road_class: 'motorway_link' },
                { type: 16, distance: 0.15, road_class: 'trunk' }, // slight_left on trunk
                {
                    type: 26,
                    distance: 0.05,
                    roundabout_exit_count: 3,
                    road_class: 'trunk',
                },
            ],
            currentStepIndex: 0,
            roadClass: 'motorway_link',
        });
        expect(plan.maneuverDir).toBe('roundabout');
        expect(plan.roundaboutExitCount).toBe(3);
        expect(plan.lookAhead).toBe(true);
        expect(plan.guidanceStepIndex).toBe(2);
    });
});

describe('buildLaneGuidanceTickApplyPlan', () => {
    test('skips when tick is not an update', () => {
        expect(TI.buildLaneGuidanceTickApplyPlan({ action: 'skip' }).action).toBe('skip');
    });

    test('maps update tick to lane guidance inputs', () => {
        const apply = TI.buildLaneGuidanceTickApplyPlan({
            action: 'update',
            maneuverDir: 'left',
            roundaboutExitCount: 2,
            guidanceStepIndex: 4,
            lookAhead: true,
        });
        expect(apply.action).toBe('apply');
        expect(apply.maneuverDir).toBe('left');
        expect(apply.roundaboutExitCount).toBe(2);
        expect(apply.guidanceStepIndex).toBe(4);
        expect(apply.lookAhead).toBe(true);
    });
});

describe('buildNavStartTurnInstructionInit', () => {
    const polyline = [[51.5, -0.12], [51.51, -0.11], [51.52, -0.10]];

    test('builds initial turn widget payload from first step', () => {
        const steps = [{
            type: 10,
            instruction: 'Turn right',
            street_names: ['High Street'],
            begin_shape_index: 2,
            distance: 100,
        }];
        const init = TI.buildNavStartTurnInstructionInit(steps, 0, polyline, {
            haversineDistanceMeters: () => 250,
            resolveRoadClass: () => 'primary',
        });
        expect(init.direction).toBe('right');
        expect(init.distance).toBe(250);
        expect(init.streetName).toBe('High Street');
        expect(init.valhallaType).toBe(10);
    });

    test('returns null for empty steps or polyline', () => {
        expect(TI.buildNavStartTurnInstructionInit([], 0, polyline, {})).toBeNull();
        expect(TI.buildNavStartTurnInstructionInit([{ type: 1 }], 0, [], {})).toBeNull();
    });
});

describe('buildNavStartTurnWidgetExecutePlan', () => {
    test('prefers GPS position update when coordinates are available', () => {
        const execute = TI.buildNavStartTurnWidgetExecutePlan({
            currentLat: 51.5,
            currentLon: -0.12,
            steps: [{ type: 10 }],
            stepIndex: 0,
            polyline: [[51.5, -0.12]],
        });
        expect(execute.shouldShowWidget).toBe(true);
        expect(execute.updateFromGps).toBe(true);
        expect(execute.initFromRoute).toBe(false);
    });

    test('falls back to route init when GPS is unavailable', () => {
        const execute = TI.buildNavStartTurnWidgetExecutePlan({
            currentLat: null,
            currentLon: null,
            steps: [{ type: 10 }],
            stepIndex: 0,
            polyline: [[51.5, -0.12]],
        });
        expect(execute.updateFromGps).toBe(false);
        expect(execute.initFromRoute).toBe(true);
    });
});

describe('findFollowingManeuver', () => {
    const polyline = [[51.5, -0.12], [51.51, -0.11], [51.52, -0.10]];
    const steps = [
        { type: 8, begin_shape_index: 0, instruction: 'Continue' },
        { type: 10, begin_shape_index: 2, instruction: 'Turn right', street_names: ['High St'] },
    ];

    test('returns next announceable maneuver with along-route gap', () => {
        const next = TI.findFollowingManeuver(steps, 0, polyline, {
            cumulativeDistanceBetweenVertices: () => 120,
            getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
            resolveRoadClass: () => 'primary',
        });
        expect(next.index).toBe(1);
        expect(next.direction).toBe('right');
        expect(next.gapMeters).toBe(120);
        expect(next.streetName).toBe('High St');
    });

    test('returns null when no following maneuver', () => {
        expect(TI.findFollowingManeuver(steps, 1, polyline, {})).toBeNull();
    });
});

describe('turn detection helpers', () => {
    test('getTurnDetectionMaxDistanceMeters scales by maneuver type', () => {
        expect(TI.getTurnDetectionMaxDistanceMeters('exit')).toBe(2500);
        expect(TI.getTurnDetectionMaxDistanceMeters('slight_right')).toBe(1500);
        expect(TI.getTurnDetectionMaxDistanceMeters('roundabout')).toBe(900);
        expect(TI.getTurnDetectionMaxDistanceMeters('right')).toBe(750);
    });

    test('advanceMonotonicTurnDetectIndex allows small rewind then locks large jumps', () => {
        // Within the small rewind window — sync to live snap (fixes instruction lag).
        expect(TI.advanceMonotonicTurnDetectIndex(10, 15)).toEqual({
            userRouteIndex: 10,
            lastTurnDetectRouteVertexIndex: 10,
        });
        // Large backward jump still locked (GPS noise / loop).
        expect(TI.advanceMonotonicTurnDetectIndex(1, 20)).toEqual({
            userRouteIndex: 20,
            lastTurnDetectRouteVertexIndex: 20,
        });
        expect(TI.advanceMonotonicTurnDetectIndex(20, 15)).toEqual({
            userRouteIndex: 20,
            lastTurnDetectRouteVertexIndex: 20,
        });
    });

    test('findUpcomingManeuverTurn returns in-range maneuver', () => {
        const steps = [
            { type: 8, begin_shape_index: 0 },
            { type: 10, begin_shape_index: 1, instruction: 'Turn right', street_names: ['High St'] },
        ];
        const polyline = [[51.5, -0.1], [51.51, -0.09]];
        const turn = TI.findUpcomingManeuverTurn(steps, 0, polyline, { index: 0, t: 0 }, {
            distanceAlongRouteToVertexMeters: () => 200,
            getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
            resolveRoadClass: () => 'primary',
        });
        expect(turn.direction).toBe('right');
        expect(turn.maneuverIndex).toBe(1);
        expect(turn.distance).toBe(200);
    });

    test('findUpcomingManeuverTurn advances past completed maneuver immediately', () => {
        // Sparse GH geometry: old `userRouteIndex - 5` hold kept "Turn left"/"On"
        // for several vertices after the junction. Once the snap is past the
        // maneuver vertex, the banner must advance to the next turn.
        const steps = [
            { type: 8, begin_shape_index: 0 },
            { type: 15, begin_shape_index: 2, instruction: 'Turn left', street_names: ['Old St'] },
            { type: 10, begin_shape_index: 5, instruction: 'Turn right', street_names: ['Next St'] },
        ];
        const polyline = [
            [51.50, -0.12],
            [51.501, -0.119],
            [51.502, -0.118],
            [51.503, -0.117],
            [51.504, -0.116],
            [51.505, -0.115],
        ];
        const turn = TI.findUpcomingManeuverTurn(steps, 3, polyline, { index: 3, t: 0 }, {
            // Past the left-turn vertex → along-route distance clamps to 0.
            distanceAlongRouteToVertexMeters: (_poly, _snap, target) => (target <= 2 ? 0 : 180),
            getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
            resolveRoadClass: () => 'primary',
        });
        expect(turn).not.toBeNull();
        expect(turn.direction).toBe('right');
        expect(turn.maneuverIndex).toBe(2);
        expect(turn.streetName).toBe('Next St');
        expect(turn.distance).toBe(180);
    });

    test('findUpcomingManeuverTurn still shows turn at the junction vertex', () => {
        const steps = [
            { type: 8, begin_shape_index: 0 },
            { type: 15, begin_shape_index: 2, instruction: 'Turn left', street_names: ['High St'] },
        ];
        const polyline = [[51.50, -0.12], [51.501, -0.119], [51.502, -0.118]];
        const turn = TI.findUpcomingManeuverTurn(steps, 2, polyline, { index: 2, t: 0 }, {
            distanceAlongRouteToVertexMeters: () => 0,
            getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
            resolveRoadClass: () => 'primary',
        });
        expect(turn).not.toBeNull();
        expect(turn.direction).toBe('left');
        expect(turn.maneuverIndex).toBe(1);
    });

    test('findUpcomingManeuverTurn does not skip turns between live snap and monotonic lock', () => {
        // Backward snap of 10 verts: > MAX_REWIND (8) so the lock stays at 20,
        // but <= VEHICLE_SYNC (12) so searchStart is not re-synced. The upcoming
        // maneuver at shape index 15 lies between snap (10) and lock (20) and
        // must still be detected.
        const indexPlan = TI.advanceMonotonicTurnDetectIndex(10, 20);
        expect(indexPlan.userRouteIndex).toBe(20);

        const steps = [
            { type: 8, begin_shape_index: 0 },
            { type: 10, begin_shape_index: 15, instruction: 'Turn right', street_names: ['Gap St'] },
        ];
        const polyline = Array.from({ length: 30 }, (_, i) => [51.5 + i * 0.001, -0.1]);
        const turn = TI.findUpcomingManeuverTurn(
            steps,
            indexPlan.userRouteIndex,
            polyline,
            { index: 10, t: 0 },
            {
                distanceAlongRouteToVertexMeters: (_poly, _snap, target) =>
                    Math.max(0, (target - 10) * 20),
                getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
                resolveRoadClass: () => 'primary',
            }
        );
        expect(turn).not.toBeNull();
        expect(turn.direction).toBe('right');
        expect(turn.maneuverIndex).toBe(1);
        expect(turn.streetName).toBe('Gap St');
        expect(turn.distance).toBe(100);
    });
});

describe('buildDetectUpcomingTurnTickPlan', () => {
    const steps = [
        { type: 8, begin_shape_index: 0 },
        { type: 10, begin_shape_index: 1, instruction: 'Turn right', street_names: ['High St'] },
    ];
    const polyline = [[51.5, -0.1], [51.51, -0.09]];

    test('skips when route is not active', () => {
        expect(TI.buildDetectUpcomingTurnTickPlan({ routeInProgress: false }).action).toBe('skip');
    });

    test('skips when snap helper is missing', () => {
        expect(TI.buildDetectUpcomingTurnTickPlan({
            routeInProgress: true,
            routePolyline: polyline,
        }).action).toBe('skip');
    });

    test('re-syncs search start to vehicle snap when turn-detect cursor drifts ahead', () => {
        let usedSearchStart = null;
        const tick = TI.buildDetectUpcomingTurnTickPlan({
            routeInProgress: true,
            routePolyline: polyline,
            routeSteps: steps,
            userLat: 51.5,
            userLon: -0.1,
            lastTurnDetectRouteVertexIndex: 40,
            lastSnappedRouteIndex: 0,
            snapToRoutePolyline: (_lat, _lon, _poly, searchStart) => {
                usedSearchStart = searchStart;
                return { index: 0, t: 0 };
            },
            distanceAlongRouteToVertexMeters: () => 200,
            getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
            resolveRoadClass: () => 'primary',
        });
        expect(usedSearchStart).toBe(0);
        expect(tick.action).toBe('detected');
        expect(tick.statePatch.lastTurnDetectRouteVertexIndex).toBe(0);
    });

    test('detects maneuver between locked cursor and live snap after mid-sized rewind', () => {
        // last=20, live snap=10: no vehicle re-sync (delta 10 <= 12), monotonic
        // lock stays at 20 (> max rewind 8). Maneuver at 15 must still surface.
        const longPolyline = Array.from({ length: 40 }, (_, i) => [51.5 + i * 0.001, -0.1]);
        const gapSteps = [
            { type: 8, begin_shape_index: 0 },
            { type: 10, begin_shape_index: 15, instruction: 'Turn right', street_names: ['Gap St'] },
        ];
        const tick = TI.buildDetectUpcomingTurnTickPlan({
            routeInProgress: true,
            routePolyline: longPolyline,
            routeSteps: gapSteps,
            userLat: 51.51,
            userLon: -0.1,
            lastTurnDetectRouteVertexIndex: 20,
            lastSnappedRouteIndex: 10,
            snapToRoutePolyline: () => ({ index: 10, t: 0 }),
            distanceAlongRouteToVertexMeters: (_poly, _snap, target) =>
                Math.max(0, (target - 10) * 20),
            getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
            resolveRoadClass: () => 'primary',
        });
        expect(tick.action).toBe('detected');
        expect(tick.turnInfo.streetName).toBe('Gap St');
        expect(tick.turnInfo.maneuverIndex).toBe(1);
        expect(tick.statePatch.lastTurnDetectRouteVertexIndex).toBe(20);
    });

    test('detects in-range maneuver and patches state', () => {
        const tick = TI.buildDetectUpcomingTurnTickPlan({
            routeInProgress: true,
            routePolyline: polyline,
            routeSteps: steps,
            userLat: 51.5,
            userLon: -0.1,
            lastTurnDetectRouteVertexIndex: 0,
            snapToRoutePolyline: () => ({ index: 0, t: 0 }),
            distanceAlongRouteToVertexMeters: () => 200,
            getManeuverStreetLabel: (m) => (m.street_names || [])[0] || '',
            resolveRoadClass: () => 'primary',
        });
        expect(tick.action).toBe('detected');
        expect(tick.turnInfo.direction).toBe('right');
        expect(tick.statePatch.currentStepIndex).toBe(1);
        expect(tick.persistRoute).toBe(true);
        expect(tick.logLine).toContain('[Turn] Detected');
    });

    test('returns none when next maneuver is beyond detection range', () => {
        const tick = TI.buildDetectUpcomingTurnTickPlan({
            routeInProgress: true,
            routePolyline: polyline,
            routeSteps: steps,
            userLat: 51.5,
            userLon: -0.1,
            lastTurnDetectRouteVertexIndex: 0,
            snapToRoutePolyline: () => ({ index: 0, t: 0 }),
            distanceAlongRouteToVertexMeters: () => 9000,
            getManeuverStreetLabel: () => '',
            resolveRoadClass: () => 'motorway',
        });
        expect(tick.action).toBe('none');
        expect(tick.turnInfo).toBeNull();
        expect(tick.persistRoute).toBe(false);
    });
});

describe('buildDetectUpcomingTurnStateApplyPlan', () => {
    test('skips when tick is missing or skipped', () => {
        expect(TI.buildDetectUpcomingTurnStateApplyPlan(null).action).toBe('skip');
        expect(TI.buildDetectUpcomingTurnStateApplyPlan({ action: 'skip' }).action).toBe('skip');
    });

    test('maps detected tick to state apply plan', () => {
        const apply = TI.buildDetectUpcomingTurnStateApplyPlan({
            action: 'detected',
            turnInfo: { distance: 120, direction: 'right' },
            statePatch: { lastTurnDetectRouteVertexIndex: 3, currentStepIndex: 1 },
            persistRoute: true,
            logLine: '[Turn] Detected',
        });
        expect(apply.action).toBe('apply');
        expect(apply.turnInfo.distance).toBe(120);
        expect(apply.statePatch.currentStepIndex).toBe(1);
        expect(apply.persistRoute).toBe(true);
        expect(apply.logLine).toContain('Detected');
    });
});

describe('buildTurnWidgetTickPlan', () => {
    const steps = [
        { type: 8, begin_shape_index: 0, street_names: ['Main Rd'] },
        { type: 10, begin_shape_index: 2, instruction: 'Turn right' },
    ];
    const polyline = [[51.5, -0.1], [51.51, -0.09], [51.52, -0.08]];

    test('shows detected turn payload', () => {
        const tick = TI.buildTurnWidgetTickPlan({
            routeInProgress: true,
            routeSteps: steps,
            routePolyline: polyline,
            lat: 51.5,
            lon: -0.1,
            lastSnappedRouteIndex: 0,
            turnInfo: {
                distance: 120,
                direction: 'right',
                instruction: 'Turn right',
                streetName: 'High St',
                maneuver: steps[1],
                maneuverIndex: 1,
                valhallaType: 10,
            },
        });
        expect(tick.action).toBe('show-turn');
        expect(tick.displayPayload.direction).toBe('right');
        expect(tick.displayPayload.maneuverIndex).toBe(1);
    });

    test('shows between-turn continue with distance to next maneuver', () => {
        const tick = TI.buildTurnWidgetTickPlan({
            routeInProgress: true,
            routeSteps: steps,
            routePolyline: polyline,
            lat: 51.5,
            lon: -0.1,
            lastSnappedRouteIndex: 0,
            currentRoadDisplayName: 'Main Rd',
            turnInfo: null,
            getActiveRouteManeuverIndex: () => 0,
            buildBetweenTurnDisplay: (m, idx, road) => ({
                distance: 0,
                direction: 'straight',
                instruction: 'Continue',
                streetName: road,
                maneuver: m,
                maneuverIndex: idx,
                valhallaType: 8,
            }),
            snapToRoutePolyline: () => ({ index: 0, t: 0 }),
            distanceAlongRouteToVertexMeters: () => 2500,
        });
        expect(tick.action).toBe('show-between');
        expect(tick.displayPayload.distance).toBe(2500);
        expect(tick.displayPayload.instruction).toBe('Continue');
    });

    test('clears widget when no between-turn display available', () => {
        const tick = TI.buildTurnWidgetTickPlan({
            routeInProgress: true,
            routeSteps: steps,
            routePolyline: polyline,
            lat: 51.5,
            lon: -0.1,
            lastSnappedRouteIndex: 0,
            turnInfo: null,
            getActiveRouteManeuverIndex: () => 0,
            buildBetweenTurnDisplay: () => null,
        });
        expect(tick.action).toBe('clear');
    });
});

describe('findGeometryFallbackTurn', () => {
    const polyline = [
        [51.5, -0.12],
        [51.501, -0.119],
        [51.502, -0.118],
        [51.504, -0.115],
        [51.506, -0.110],
    ];

    test('detects geometry fallback turn payload on polyline-only routes', () => {
        const turnSnap = { index: 1, t: 0 };
        const result = TI.findGeometryFallbackTurn(polyline, turnSnap, 1, {
            bearing: () => 90,
            calculateTurnDirection: () => 'left',
            distanceAlongRouteToVertexMeters: () => 420,
        });
        expect(result).not.toBeNull();
        expect(result.distance).toBe(420);
        expect(result.index).toBe(4);
        expect(result.lat).toBe(polyline[4][0]);
        expect(result.streetName).toBe('');
    });

    test('returns null when polyline is too short', () => {
        expect(TI.findGeometryFallbackTurn([[51.5, -0.1]], { index: 0 }, 0, {})).toBeNull();
    });
});

describe('turn widget display plans', () => {
    test('resolveTurnIconValhallaType prefers explicit type then direction map', () => {
        expect(TI.resolveTurnIconValhallaType('left', 10)).toBe(10);
        expect(TI.resolveTurnIconValhallaType('left', undefined)).toBe(15);
        expect(TI.resolveTurnIconValhallaType('slight_right', undefined)).toBe(9);
        expect(TI.resolveTurnIconValhallaType('unknown', undefined)).toBe(8);
    });

    test('buildTurnWidgetRowDisplayPlan formats countdown and street prefix', () => {
        const plan = TI.buildTurnWidgetRowDisplayPlan({
            direction: 'left',
            distance: 120,
            instruction: 'Turn left onto High St',
            streetName: 'High St',
            valhallaType: 15,
            maneuverIndex: 2,
            maneuver: { type: 15, lanes: null },
        }, 'km', { roundaboutExitCount: 0 });
        expect(plan.hasTurn).toBe(true);
        expect(plan.distanceText).toMatch(/^In /);
        expect(plan.instructionText).toContain('Turn left');
        expect(plan.streetText).toBe('onto High St');
        expect(plan.iconType).toBe(15);
    });

    test('buildTurnWidgetRowDisplayPlan uses On for short distances and straight prefix', () => {
        const plan = TI.buildTurnWidgetRowDisplayPlan({
            direction: 'straight',
            distance: 10,
            instruction: 'Continue',
            streetName: 'A40',
            valhallaType: 8,
        }, 'km');
        expect(plan.distanceText).toBe('On');
        expect(plan.streetText).toBe('on A40');
    });

    test('buildTurnWidgetRowDisplayPlan returns follow-route fallback when turnInfo is null', () => {
        const plan = TI.buildTurnWidgetRowDisplayPlan(null, 'km');
        expect(plan.hasTurn).toBe(false);
        expect(plan.distanceText).toBe('Follow Route');
        expect(plan.instructionText).toBe('Continue on current road');
    });

    test('buildThenRowDisplayPlan shows following maneuver within thresholds', () => {
        const plan = TI.buildThenRowDisplayPlan(1, 500, {
            direction: 'right',
            valhallaType: 10,
            streetName: 'Park Lane',
            gapMeters: 300,
            index: 2,
        }, 'km', 0);
        expect(plan.visible).toBe(true);
        expect(plan.text).toContain('Park Lane');
        expect(plan.text).toMatch(/^In /);
        expect(plan.icon).toBe('→');
    });

    test('buildThenRowDisplayPlan hides when current distance exceeds 700 m', () => {
        const plan = TI.buildThenRowDisplayPlan(1, 800, {
            direction: 'right',
            valhallaType: 10,
            gapMeters: 200,
        }, 'km', 0);
        expect(plan.visible).toBe(false);
    });

    test('buildThenRowDisplayPlan hides when follow gap exceeds 900 m', () => {
        const plan = TI.buildThenRowDisplayPlan(1, 500, {
            direction: 'right',
            valhallaType: 10,
            gapMeters: 950,
        }, 'km', 0);
        expect(plan.visible).toBe(false);
    });
});

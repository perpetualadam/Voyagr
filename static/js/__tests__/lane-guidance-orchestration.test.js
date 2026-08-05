/**
 * @jest-environment jsdom
 * @file Lookahead must resolve roadType from guidanceStepIndex, not only the active step.
 */

const LaneGuidance = require('../modules/navigation/lane-guidance.js');
const LaneGuidanceOrchestration = require('../app/lane-guidance-orchestration.js');

function flushPromises() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
}

describe('lane-guidance-orchestration lookahead roadType', () => {
    let getCurrentRoadType;
    let fetchTickSpy;
    let buildHybridSpy;

    beforeEach(() => {
        document.body.innerHTML = [
            '<div id="laneGuidanceDisplay"><span id="laneGuidanceBadge"></span>',
            '<div id="laneVisual"></div><div id="laneGuidanceText"></div></div>',
        ].join('');

        getCurrentRoadType = jest.fn(function (idx) {
            // Active continue is residential; lookahead roundabout approach is primary.
            if (idx === 1) return 'primary';
            return 'residential';
        });

        fetchTickSpy = jest.spyOn(LaneGuidance, 'buildLaneGuidanceFetchTickPlan');
        buildHybridSpy = jest.spyOn(LaneGuidance, 'buildHybridLaneGuidance');
        global.fetch = jest.fn(function () {
            return Promise.reject(new Error('network off in test'));
        });

        LaneGuidanceOrchestration.bind({
            laneGuidance: () => LaneGuidance,
            getCurrentRouteSteps: () => [
                { type: 8, distance: 1.2, road_class: 'residential' },
                {
                    type: 26,
                    distance: 0.1,
                    roundabout_exit_count: 2,
                    road_class: 'primary',
                    lanes: [{ active: false }, { active: true }],
                },
            ],
            getCurrentStepIndex: () => 0,
            getRoutePolyline: () => [[51.5, -0.1], [51.51, -0.09]],
            getLastSnappedRouteIndex: () => 0,
            getVoiceAnnouncementsEnabled: () => false,
            call: {
                getCurrentRoadType: getCurrentRoadType,
                calculateDistanceMeters: () => 400,
                speakMessage: jest.fn(),
            },
        });
        LaneGuidanceOrchestration.resetLaneGuidanceForNewRoute();
        fetchTickSpy.mockClear();
        buildHybridSpy.mockClear();
        getCurrentRoadType.mockClear();
    });

    afterEach(() => {
        fetchTickSpy.mockRestore();
        buildHybridSpy.mockRestore();
        delete global.fetch;
        LaneGuidanceOrchestration.resetLaneGuidanceForNewRoute();
    });

    test('passes guidanceStepIndex into getCurrentRoadType for fetch and hybrid render', async () => {
        LaneGuidanceOrchestration.updateLaneGuidance(
            51.5,
            -0.1,
            90,
            'roundabout',
            2,
            1
        );

        expect(getCurrentRoadType).toHaveBeenCalledWith(1);
        expect(getCurrentRoadType).not.toHaveBeenCalledWith();
        expect(fetchTickSpy).toHaveBeenCalled();
        expect(fetchTickSpy.mock.calls[0][0].roadType).toBe('primary');
        expect(fetchTickSpy.mock.calls[0][0].currentStepIndex).toBe(1);

        await flushPromises();

        expect(buildHybridSpy).toHaveBeenCalled();
        const hybridOpts = buildHybridSpy.mock.calls[0][0];
        expect(hybridOpts.roadType).toBe('primary');
        expect(hybridOpts.roundaboutExitCount).toBe(2);
        // 2nd+ exits prefer right on any multi-lane approach (road class no longer gates).
        expect(LaneGuidance.roundaboutPrefersRightLane(2, 2, 'residential')).toBe(true);
        expect(LaneGuidance.roundaboutPrefersRightLane(2, 2, hybridOpts.roadType)).toBe(true);
        expect(LaneGuidance.estimateCandidateLanesUK(
            'roundabout',
            2,
            2,
            hybridOpts.roadType
        )).toEqual([2]);
    });

    test('without lookahead still resolves road type from the active step', async () => {
        LaneGuidanceOrchestration.updateLaneGuidance(
            51.5,
            -0.1,
            90,
            'straight',
            0,
            null
        );

        expect(getCurrentRoadType).toHaveBeenCalledWith(undefined);
        expect(fetchTickSpy.mock.calls[0][0].roadType).toBe('residential');

        await flushPromises();

        expect(buildHybridSpy).toHaveBeenCalled();
        expect(buildHybridSpy.mock.calls[0][0].roadType).toBe('residential');
    });
});

describe('lane-guidance-orchestration hides after maneuver complete', () => {
    beforeEach(() => {
        document.body.innerHTML = [
            '<div id="laneGuidanceDisplay" class="lane-guidance-display show">',
            '<span id="laneGuidanceBadge"></span>',
            '<div id="laneVisual"><div class="lane-indicator recommended">←</div></div>',
            '<div id="laneGuidanceText">Get in the left lane now!</div></div>',
        ].join('');

        global.fetch = jest.fn(function () {
            return Promise.reject(new Error('network off in test'));
        });

        LaneGuidanceOrchestration.bind({
            laneGuidance: () => LaneGuidance,
            getCurrentRouteSteps: () => [
                { type: 15, begin_shape_index: 1, road_class: 'primary', distance: 0.2 },
                { type: 8, begin_shape_index: 2, road_class: 'primary', distance: 1.0 },
            ],
            getCurrentStepIndex: () => 0,
            getRoutePolyline: () => [[51.50, -0.12], [51.51, -0.11], [51.52, -0.10]],
            getLastSnappedRouteIndex: () => 1,
            getVoiceAnnouncementsEnabled: () => false,
            routeGeometry: () => ({
                snapToRoutePolyline: () => ({ index: 1, t: 0 }),
                distanceAlongRouteToVertexMeters: () => 0,
            }),
            call: {
                getCurrentRoadType: () => 'primary',
                calculateDistanceMeters: () => 5,
                speakMessage: jest.fn(),
            },
        });
        LaneGuidanceOrchestration.resetLaneGuidanceForNewRoute();
        // Restore visible UI after reset (reset hides it) so we assert a real hide transition.
        const display = document.getElementById('laneGuidanceDisplay');
        display.className = 'lane-guidance-display show';
        document.getElementById('laneGuidanceText').textContent = 'Get in the left lane now!';
    });

    afterEach(() => {
        delete global.fetch;
        LaneGuidanceOrchestration.resetLaneGuidanceForNewRoute();
    });

    test('hides overlay when along-route distance reports maneuver complete', async () => {
        const display = document.getElementById('laneGuidanceDisplay');
        expect(display.classList.contains('show')).toBe(true);

        LaneGuidanceOrchestration.updateLaneGuidance(
            51.51,
            -0.11,
            90,
            'left',
            0,
            0
        );

        await flushPromises();

        expect(display.classList.contains('show')).toBe(false);
    });
});

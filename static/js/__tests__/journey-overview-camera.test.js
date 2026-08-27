/**
 * @jest-environment jsdom
 * @file Leaving journey overview must restore navigation zoom (not stay overview-scale).
 */

const JourneyOverview = require('../app/journey-overview-orchestration.js');
const DriverCamera = require('../app/driver-camera-orchestration.js');

describe('journey overview leave camera restore', () => {
    afterEach(() => {
        JourneyOverview.setJourneyOverviewActive(false);
        JourneyOverview.setSavedMapState(null);
        document.body.innerHTML = '';
    });

    test('applyLiveNavigationCamera includes zoom and returns false without position', () => {
        const easeTo = jest.fn();
        DriverCamera.bind({
            getMap: () => ({
                easeTo,
                getBearing: () => 45,
                getContainer: () => ({ clientHeight: 800, clientWidth: 400 }),
            }),
            getCurrentLat: () => 51.5,
            getCurrentLon: () => -0.1,
            getCurrentUserMarker: () => ({ heading: 90 }),
            getRouteInProgress: () => true,
            getZoomAndFollowEnabled: () => true,
            getMapFollowingActive: () => true,
            cameraPitch: () => ({
                decideDrivingCamera: () => ({ followHeading: true, tilt: true }),
                resolveFollowPadding: () => ({ top: 440, bottom: 120, left: 12, right: 12 }),
            }),
        });

        expect(DriverCamera.applyLiveNavigationCamera({ zoom: 15 })).toBe(true);
        expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({
            zoom: 15,
            center: [-0.1, 51.5],
            bearing: 90,
            pitch: 60,
        }));

        DriverCamera.bind({
            getMap: () => ({ easeTo: jest.fn(), getBearing: () => 0 }),
            getCurrentLat: () => null,
            getCurrentLon: () => null,
            getCurrentUserMarker: () => null,
            getRouteInProgress: () => true,
            getZoomAndFollowEnabled: () => true,
            getMapFollowingActive: () => true,
            cameraPitch: () => ({
                decideDrivingCamera: () => ({ followHeading: true, tilt: true }),
                resolveFollowPadding: () => ({ top: 1, bottom: 1, left: 1, right: 1 }),
            }),
        });
        expect(DriverCamera.applyLiveNavigationCamera({ zoom: 15 })).toBe(false);
    });

    test('deactivating overview passes saved zoom into live camera', () => {
        const applyLiveNavigationCamera = jest.fn(() => true);
        const flyTo = jest.fn();
        const mapControls = {
            buildToggleJourneyOverviewPreflightPlan: () => ({
                shouldToggle: true,
                currentlyActive: true,
                journeyBtnId: 'journeyOverviewBtn',
            }),
            buildToggleJourneyOverviewDeactivatePlan: (input) => ({
                journeyOverviewActive: false,
                restoreMapFollowing: true,
                restoreLiveNavigationCamera: true,
                flyTo: {
                    center: [input.savedMapState.center.lng, input.savedMapState.center.lat],
                    zoom: input.savedMapState.zoom,
                    pitch: 55,
                    duration: 1000,
                    essential: true,
                },
                clearSavedMapState: true,
                overviewButtonActive: false,
                statusMessage: 'back',
                statusType: 'success',
                logMessage: 'deactivated',
                updateRecenterVisibility: true,
            }),
            buildJourneyOverviewButtonUiExecutePlan: () => ({
                shouldApply: false,
            }),
        };

        document.body.innerHTML = '<button id="journeyOverviewBtn"></button>';
        JourneyOverview.setJourneyOverviewActive(true);
        JourneyOverview.setSavedMapState({ center: { lat: 51.5, lng: -0.1 }, zoom: 16 });
        JourneyOverview.bind({
            mapControls: () => mapControls,
            getMap: () => ({ flyTo }),
            getMapLibreHelpers: () => ({}),
            getRouteInProgress: () => true,
            getRoutePolyline: () => [[1, 2], [3, 4]],
            getRouteOptions: () => null,
            getZoomAndFollowEnabled: () => true,
            getMapFollowingActive: () => false,
            setMapFollowingActive: jest.fn(),
            call: {
                showStatus: jest.fn(),
                updateRecenterButtonVisibility: jest.fn(),
                applyLiveNavigationCamera,
            },
        });

        JourneyOverview.toggleJourneyOverview();

        expect(applyLiveNavigationCamera).toHaveBeenCalledWith({ zoom: 16 });
        expect(flyTo).not.toHaveBeenCalled();
    });

    test('falls back to flyTo with saved zoom when live camera cannot apply', () => {
        const applyLiveNavigationCamera = jest.fn(() => false);
        const flyTo = jest.fn();
        const savedFlyTo = {
            center: [-0.1, 51.5],
            zoom: 16,
            pitch: 55,
            duration: 1000,
            essential: true,
        };
        const mapControls = {
            buildToggleJourneyOverviewPreflightPlan: () => ({
                shouldToggle: true,
                currentlyActive: true,
                journeyBtnId: 'journeyOverviewBtn',
            }),
            buildToggleJourneyOverviewDeactivatePlan: () => ({
                journeyOverviewActive: false,
                restoreMapFollowing: true,
                restoreLiveNavigationCamera: true,
                flyTo: savedFlyTo,
                clearSavedMapState: true,
                overviewButtonActive: false,
                statusMessage: 'back',
                statusType: 'success',
                logMessage: 'deactivated',
                updateRecenterVisibility: true,
            }),
            buildJourneyOverviewButtonUiExecutePlan: () => ({
                shouldApply: false,
            }),
        };

        document.body.innerHTML = '<button id="journeyOverviewBtn"></button>';
        JourneyOverview.setJourneyOverviewActive(true);
        JourneyOverview.setSavedMapState({ center: { lat: 51.5, lng: -0.1 }, zoom: 16 });
        JourneyOverview.bind({
            mapControls: () => mapControls,
            getMap: () => ({ flyTo }),
            getMapLibreHelpers: () => ({}),
            getRouteInProgress: () => true,
            getRoutePolyline: () => [[1, 2], [3, 4]],
            getRouteOptions: () => null,
            getZoomAndFollowEnabled: () => true,
            getMapFollowingActive: () => false,
            setMapFollowingActive: jest.fn(),
            call: {
                showStatus: jest.fn(),
                updateRecenterButtonVisibility: jest.fn(),
                applyLiveNavigationCamera,
            },
        });

        JourneyOverview.toggleJourneyOverview();

        expect(applyLiveNavigationCamera).toHaveBeenCalled();
        expect(flyTo).toHaveBeenCalledWith(savedFlyTo);
    });
});

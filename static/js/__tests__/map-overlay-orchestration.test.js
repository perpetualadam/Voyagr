/**
 * @jest-environment jsdom
 * @file Tests for map overlay orchestration (OSM traffic light pill HTML).
 */

const OSM = require('../modules/map/osm-map-icons.js');
const MapOverlayToggles = require('../modules/map/map-overlay-toggles.js');
const MapOverlayOrchestration = require('../app/map-overlay-orchestration.js');

describe('map-overlay-orchestration OSM traffic light pill', () => {
    beforeEach(() => {
        global.TrafficLights = {
            createIconSVG: jest.fn(function (state, width, height) {
                return '<svg data-state="' + state + '" width="' + width + '" height="' + height + '"></svg>';
            }),
        };
        MapOverlayOrchestration.bind({
            mapOverlayToggles: () => MapOverlayToggles,
            toggleUI: () => ({ writeBoolPref: jest.fn(), applyToggleButton: jest.fn(), applyLabeledToggleButton: jest.fn() }),
            osmMapIcons: () => OSM,
            getMap: () => null,
            getMapLibreHelpers: () => null,
            getRoadLabelsEnabled: () => false,
            mapLayerToggles: () => ({ ROAD_LABELS_INIT_FLAG: '__roadLabelsInit', buildInitializeRoadLabelsExecutePlan: jest.fn() }),
            call: { saveAllSettings: jest.fn() },
        });
    });

    afterEach(() => {
        delete global.TrafficLights;
    });

    test('getOsmTrafficLightMarkerPillHTML uses TrafficLights.createIconSVG with OSM dimensions', () => {
        const pill = MapOverlayOrchestration.getOsmTrafficLightMarkerPillHTML();

        expect(global.TrafficLights.createIconSVG).toHaveBeenCalledWith(
            'none',
            OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_WIDTH,
            OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_HEIGHT
        );
        expect(pill).toContain('osm-traffic-light-pill');
        expect(pill).toContain('width="' + OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_WIDTH + '"');
        expect(pill).toContain('height="' + OSM.OSM_TRAFFIC_LIGHT_INNER_SVG_HEIGHT + '"');
    });
});

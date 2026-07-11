/**
 * Tests for modules/navigation/waypoints.js
 */
const W = require('../modules/navigation/waypoints.js');

describe('waypoints module', () => {
    test('buildWaypointsListHtml returns empty state when no points', () => {
        expect(W.buildWaypointsListHtml([], [])).toContain('No waypoints yet');
    });

    test('buildWaypointsListHtml includes via and stop items with drag handlers', () => {
        const html = W.buildWaypointsListHtml(
            [{ name: 'Via 1' }],
            [{ name: 'Stop A', duration: 10 }]
        );
        expect(html).toContain('Via 1');
        expect(html).toContain('Stop A (10 min)');
        expect(html).toContain('ondragstart="onWaypointDragStart(event)"');
        expect(html).toContain('Total stop time');
    });

    test('buildMultiDropItineraryHtml renders legs and total summary', () => {
        const html = W.buildMultiDropItineraryHtml(
            {
                optimized: true,
                legs: [
                    { distance_km: 5, duration_minutes: 12, eta: '2026-07-11T14:30:00Z' },
                    { distance_km: 3, duration_minutes: 8, stop: { name: 'Coffee', duration_minutes: 5, time_window_ok: true } },
                ],
                total_distance_km: 8,
                total_duration_minutes: 25,
                total_stop_time_minutes: 5,
                round_trip: true,
            },
            {
                distUnit: 'mi',
                totalDistanceText: '4.97',
                legDistanceTexts: ['3.11', '1.86'],
                formatEtaClock: () => '14:30',
            }
        );
        expect(html).toContain('Route Itinerary (Optimized)');
        expect(html).toContain('Leg 1');
        expect(html).toContain('Coffee');
        expect(html).toContain('Round trip');
        expect(html).toContain('incl. 5 min stops');
    });

    test('MULTIDROP_LEG_COLORS has distinct palette entries', () => {
        expect(W.MULTIDROP_LEG_COLORS.length).toBeGreaterThanOrEqual(5);
        expect(W.MULTIDROP_LEG_COLORS[0]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('map marker HTML builders include remove handlers', () => {
        expect(W.buildRouteDragMarkerHtml()).toContain('cursor: grab');
        expect(W.buildViaPointMarkerHtml(2)).toContain('>2<');
        expect(W.buildViaPointDragAddedMarkerHtml()).toContain('✓');
        expect(W.buildStopMarkerHtml()).toContain('🅿️');
        expect(W.buildViaPointPopupHtml('Via A', 'removeViaPoint(0)')).toContain('removeViaPoint(0)');
        expect(W.buildViaPointDragPopupHtml('removeViaPoint(1)')).toContain('Drag to adjust');
        expect(W.buildStopPopupHtml('Coffee', 15, 'removeStop(0)')).toContain('15 min');
    });

    test('buildMultiDropLegLayerDescriptor decodes geometry for map layers', () => {
        const decode = jest.fn(() => [[51.5, -0.1], [51.6, -0.2]]);
        const desc = W.buildMultiDropLegLayerDescriptor('encoded', 1, { geometry_precision: 6 }, decode);
        expect(desc.layerId).toBe('multidrop-leg-1');
        expect(desc.coordinates).toEqual([[-0.1, 51.5], [-0.2, 51.6]]);
        expect(desc.lineColor).toBe(W.MULTIDROP_LEG_COLORS[1]);
        expect(W.buildMultiDropLegLayerDescriptor('', 0, null, decode)).toBeNull();
    });
});

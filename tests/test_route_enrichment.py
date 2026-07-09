"""Tests for post-Valhalla route enrichment pipeline."""

import unittest
from unittest.mock import MagicMock, patch

from voyagr.services.routing.enrichment import (
    RouteEnrichmentContext,
    merge_graphhopper_optimised_route,
)


def _ctx(**overrides):
    base = dict(
        url='http://valhalla/route',
        headers={'Accept': 'application/json'},
        route_locations=[{'lat': 1.0, 'lon': 2.0}],
        has_waypoints=False,
        start_lat=1.0, start_lon=2.0, end_lat=3.0, end_lon=4.0,
        route_bbox={'min_lat': 1, 'max_lat': 3, 'min_lon': 2, 'max_lon': 4},
        hazards={'camera': []},
        enable_hazard_avoidance=True,
        avoid_cameras=True,
        graphhopper_route=None,
        cost_calculator=MagicMock(),
        vehicle_type='petrol_diesel',
        fuel_efficiency=6.5, fuel_price=1.4,
        energy_efficiency=20.0, electricity_price=0.3,
        include_tolls=True, include_caz=True, caz_exempt=False,
    )
    base.update(overrides)
    return RouteEnrichmentContext(**base)


class TestMergeGraphhopperOptimisedRoute(unittest.TestCase):
    @patch('voyagr.services.routing.enrichment.graphhopper_qualifies_as_optimised', return_value=False)
    def test_skips_when_gh_does_not_qualify(self, _qual):
        routes = [{'name': 'Fastest', 'id': 1}]
        ctx = _ctx(graphhopper_route={'success': True})
        out = merge_graphhopper_optimised_route(routes, ctx)
        self.assertEqual(len(out), 1)

    @patch('voyagr.services.routing.enrichment.graphhopper_qualifies_as_optimised', return_value=False)
    def test_warns_when_gh_success_but_hazard_avoidance_off(self, _qual):
        routes = [{'name': 'Fastest', 'id': 1}]
        ctx = _ctx(graphhopper_route={'success': True}, enable_hazard_avoidance=False)
        out = merge_graphhopper_optimised_route(routes, ctx)
        self.assertEqual(out, routes)


if __name__ == '__main__':
    unittest.main()

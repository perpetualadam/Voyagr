"""Tests for post-Valhalla route enrichment pipeline."""

import inspect
import unittest
from unittest.mock import MagicMock, patch

import voyagr_web as vw
from voyagr.services.routing.enrichment import (
    RouteEnrichmentContext,
    _ensure_kwargs,
    _variety_kwargs,
    apply_valhalla_route_enrichment,
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


class TestEnsureKwargsCompatibility(unittest.TestCase):
    """Regression guard: shared kwargs must match every ensure_* signature.

    A previous refactor passed graphhopper_route to scenic/shortest (which do not
    accept it), raising TypeError at runtime and returning success:false.
    """

    def test_shared_kwargs_accepted_by_all_ensure_helpers(self):
        ctx = _ctx()
        shared = _ensure_kwargs(ctx)

        scenic_params = set(inspect.signature(vw.ensure_scenic_valhalla_route).parameters)
        shortest_params = set(inspect.signature(vw.ensure_shortest_respects_camera_avoidance).parameters)
        optimised_params = set(inspect.signature(vw.ensure_optimised_camera_avoiding_route).parameters)
        variety_params = set(inspect.signature(vw.ensure_costing_preference_variety_routes).parameters)
        variety_kw = _variety_kwargs(ctx)

        for key in shared:
            self.assertIn(key, scenic_params, f'{key} not accepted by ensure_scenic')
            self.assertIn(key, shortest_params, f'{key} not accepted by ensure_shortest')
            self.assertIn(key, optimised_params, f'{key} not accepted by ensure_optimised')
        for key in variety_kw:
            self.assertIn(key, variety_params, f'{key} not accepted by ensure_costing_preference_variety')

        # graphhopper_route must NOT be in shared kwargs (optimised gets it explicitly)
        self.assertNotIn('graphhopper_route', shared)
        self.assertIn('graphhopper_route', optimised_params)

    def test_apply_enrichment_invokes_all_ensure_helpers_without_type_error(self):
        ctx = _ctx()
        routes = [{'name': 'Fastest', 'id': 1, 'hazard_penalty_seconds': 0, 'duration_minutes': 10}]

        with patch.object(vw, 'ensure_optimised_camera_avoiding_route', side_effect=lambda r, **kw: r) as m_opt, \
             patch.object(vw, 'ensure_scenic_valhalla_route', side_effect=lambda r, **kw: r) as m_sce, \
             patch.object(vw, 'ensure_costing_preference_variety_routes', side_effect=lambda r, **kw: r) as m_var, \
             patch.object(vw, 'ensure_shortest_respects_camera_avoidance', side_effect=lambda r, **kw: r) as m_sho, \
             patch('voyagr.services.routing.enrichment.annotate_routes_camera_proximity', side_effect=lambda r, h: r):
            out = apply_valhalla_route_enrichment(routes, ctx, merge_graphhopper=False)

        self.assertEqual(len(out), 1)
        # optimised got graphhopper_route; scenic/shortest/variety did not
        self.assertIn('graphhopper_route', m_opt.call_args.kwargs)
        self.assertNotIn('graphhopper_route', m_sce.call_args.kwargs)
        self.assertNotIn('graphhopper_route', m_var.call_args.kwargs)
        self.assertNotIn('graphhopper_route', m_sho.call_args.kwargs)


if __name__ == '__main__':
    unittest.main()

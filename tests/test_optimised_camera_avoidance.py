"""Tests for Optimised route camera avoidance qualification and ensure logic."""

from unittest.mock import MagicMock, patch

from voyagr.services.routing.optimised_route import (
    PRIMARY_OPTIMISED_NAME,
    SHORTEST_ROUTE_NAME,
    baseline_camera_hazard_count,
    cameras_near_polyline_exclude_points,
    count_cameras_near_polyline,
    fetch_valhalla_auto_json,
    fetch_valhalla_auto_shorter_json,
    graphhopper_qualifies_as_optimised,
    is_primary_optimised_route,
    is_shortest_route,
    merge_valhalla_exclude_locations,
    optimised_route_entry_qualifies,
    prune_non_qualifying_optimised_routes,
)


class TestGraphhopperQualifiesAsOptimised:
    def test_qualifies_when_custom_model_applied(self):
        gh = {'success': True, 'custom_model_applied': True}
        assert graphhopper_qualifies_as_optimised(gh, avoid_cameras=True) is True

    def test_rejects_unfiltered_fallback_when_avoiding_cameras(self):
        gh = {'success': True, 'custom_model_applied': False}
        assert graphhopper_qualifies_as_optimised(gh, avoid_cameras=True) is False

    def test_qualifies_without_camera_avoidance_setting(self):
        gh = {'success': True, 'custom_model_applied': False}
        assert graphhopper_qualifies_as_optimised(gh, avoid_cameras=False) is True

    def test_rejects_failed_route(self):
        assert graphhopper_qualifies_as_optimised(None, avoid_cameras=True) is False
        assert graphhopper_qualifies_as_optimised({'success': False}, avoid_cameras=True) is False


class TestFetchValhallaAutoJson:
    def test_tries_with_exclusions_before_bare_request(self):
        trip = {'trip': {'legs': [{'shape': 'x'}]}}
        resp_ok = MagicMock(status_code=200)
        resp_ok.json.return_value = trip
        resp_fail = MagicMock(status_code=400)

        with patch('voyagr.services.routing.optimised_route.requests.post', side_effect=[resp_fail, resp_ok]) as mock_post:
            result = fetch_valhalla_auto_json(
                'http://v/route', {}, [{'lat': 1, 'lon': 2}, {'lat': 3, 'lon': 4}],
                exclude_locations=[{'lat': 1.5, 'lon': 2.5}],
            )

        assert result == trip
        assert mock_post.call_count == 2
        assert 'exclude_locations' in mock_post.call_args_list[0].kwargs['json']

    def test_require_exclusions_skips_bare_fallback(self):
        resp_fail = MagicMock(status_code=400)
        resp_bare_ok = MagicMock(status_code=200)
        resp_bare_ok.json.return_value = {'trip': {'legs': [{'shape': 'x'}]}}

        with patch(
            'voyagr.services.routing.optimised_route.requests.post',
            side_effect=[resp_fail, resp_bare_ok],
        ) as mock_post:
            result = fetch_valhalla_auto_json(
                'http://v/route', {}, [{'lat': 1, 'lon': 2}],
                exclude_locations=[{'lat': 1.5, 'lon': 2.5}],
                require_exclusions=True,
            )

        assert result is None
        assert mock_post.call_count == 1


class TestFetchValhallaAutoShorterJson:
    def test_require_exclusions_skips_bare_fallback(self):
        resp_fail = MagicMock(status_code=400)
        resp_bare_ok = MagicMock(status_code=200)
        resp_bare_ok.json.return_value = {'trip': {'legs': [{'shape': 'x'}]}}

        with patch(
            'voyagr.services.routing.optimised_route.requests.post',
            side_effect=[resp_fail, resp_bare_ok],
        ) as mock_post:
            result = fetch_valhalla_auto_shorter_json(
                'http://v/route', {}, [{'lat': 1, 'lon': 2}],
                exclude_locations=[{'lat': 1.5, 'lon': 2.5}],
                require_exclusions=True,
            )

        assert result is None
        assert mock_post.call_count == 1

    def test_merge_exclude_locations_prioritises_first_group(self):
        merged = merge_valhalla_exclude_locations(
            [{'lat': 1.0, 'lon': 2.0}],
            [{'lat': 1.0, 'lon': 2.0}, {'lat': 3.0, 'lon': 4.0}],
            max_points=50,
        )
        assert len(merged) == 2
        assert merged[0] == {'lat': 1.0, 'lon': 2.0}


class TestShortestRouteNaming:
    def test_shortest_name_detection(self):
        assert is_shortest_route({'name': SHORTEST_ROUTE_NAME}) is True
        assert is_shortest_route({'name': 'Shortest'}) is False
        assert is_shortest_route({'name': 'Alternate'}) is False


class TestPolylineCameraCounting:
    def test_counts_camera_near_route_geometry(self):
        hazards = {
            'camera_speed': [{'lat': 51.500, 'lon': -0.100}],
        }
        route = {
            'geometry': [[51.5001, -0.1001], [51.501, -0.101]],
            'geometry_precision': 6,
        }
        assert count_cameras_near_polyline(route, hazards, threshold_m=150) == 1

    def test_exclude_points_for_cameras_on_route(self):
        hazards = {
            'camera_speed': [{'lat': 51.500, 'lon': -0.100}],
        }
        route = {
            'geometry': [[51.5001, -0.1001], [51.501, -0.101]],
            'geometry_precision': 6,
        }
        pts = cameras_near_polyline_exclude_points(route, hazards, threshold_m=150)
        assert len(pts) == 1
        assert pts[0]['lat'] == 51.500
        assert pts[0]['lon'] == -0.100


class TestOptimisedRouteQualification:
    def test_primary_name_detection(self):
        assert is_primary_optimised_route({'name': PRIMARY_OPTIMISED_NAME}) is True
        assert is_primary_optimised_route({'name': '⚡ Optimised Discovery'}) is False
        assert is_primary_optimised_route({'name': 'Fastest'}) is False

    def test_baseline_ignores_primary_optimised(self):
        routes = [
            {'name': 'Fastest', 'hazard_count': 5},
            {'name': PRIMARY_OPTIMISED_NAME, 'hazard_count': 12},
            {'name': '⚡ Optimised Discovery', 'hazard_count': 8},
        ]
        assert baseline_camera_hazard_count(routes) == 5

    def test_rejects_valhalla_optimised_without_exclusions(self):
        route = {'name': PRIMARY_OPTIMISED_NAME, 'source': 'Valhalla', 'hazard_count': 2}
        gh = {'success': True, 'custom_model_applied': True}
        assert optimised_route_entry_qualifies(
            route, graphhopper_route=gh, baseline_hazard_count=5, avoid_cameras=True,
        ) is False

    def test_accepts_valhalla_optimised_with_exclusions(self):
        route = {
            'name': PRIMARY_OPTIMISED_NAME,
            'source': 'Valhalla',
            'hazard_count': 2,
            'camera_exclusions_applied': True,
        }
        assert optimised_route_entry_qualifies(
            route, graphhopper_route=None, baseline_hazard_count=5, avoid_cameras=True,
        ) is True

    def test_rejects_optimised_with_more_cameras_than_baseline(self):
        route = {
            'name': PRIMARY_OPTIMISED_NAME,
            'source': 'GraphHopper',
            'hazard_count': 10,
        }
        gh = {'success': True, 'custom_model_applied': True}
        assert optimised_route_entry_qualifies(
            route, graphhopper_route=gh, baseline_hazard_count=5, avoid_cameras=True,
        ) is False

    def test_prune_drops_weak_optimised(self):
        routes = [
            {'name': 'Fastest', 'hazard_count': 3},
            {'name': PRIMARY_OPTIMISED_NAME, 'source': 'Valhalla', 'hazard_count': 8},
        ]
        pruned = prune_non_qualifying_optimised_routes(
            routes, graphhopper_route=None, avoid_cameras=True,
        )
        assert len(pruned) == 1
        assert pruned[0]['name'] == 'Fastest'

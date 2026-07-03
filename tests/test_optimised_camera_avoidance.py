"""Tests for Optimised route camera avoidance qualification and ensure logic."""

from unittest.mock import MagicMock, patch

from voyagr.services.routing.optimised_route import (
    fetch_valhalla_auto_json,
    graphhopper_qualifies_as_optimised,
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

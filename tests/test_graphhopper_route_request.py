"""Tests for route_with_graphhopper HTTP fallback behaviour."""

from unittest.mock import MagicMock, patch

from voyagr.services.routing.engines import route_with_graphhopper


def _mock_response(status_code: int, json_data=None, text=''):
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.json.return_value = json_data or {}
    return resp


@patch('voyagr.services.routing.engines.requests.get')
@patch('voyagr.services.routing.engines.requests.post')
@patch('voyagr.services.routing.engines.USE_GRAPHHOPPER_CAMERA_AVOIDANCE', True)
@patch('voyagr.services.hazards.build_graphhopper_combined_camera_model')
def test_post_failure_with_areas_returns_none(mock_cam_model, mock_post, mock_get):
    mock_cam_model.return_value = {
        'priority': [{'if': 'in_camera_area_1', 'multiply_by': '0.01'}],
        'areas': {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'id': 'camera_area_1'}]},
    }
    mock_post.return_value = _mock_response(400, text='model too large')

    result = route_with_graphhopper(
        51.5, -0.1, 51.6, -0.2,
        enable_camera_avoidance=True,
        route_bbox={'min_lat': 51.5, 'max_lat': 51.6, 'min_lon': -0.2, 'max_lon': -0.1},
    )

    assert result is None
    mock_get.assert_not_called()


@patch('voyagr.services.routing.engines.requests.get')
@patch('voyagr.services.routing.engines.requests.post')
@patch('voyagr.services.routing.engines.USE_GRAPHHOPPER_CAMERA_AVOIDANCE', True)
@patch('voyagr.services.hazards.build_graphhopper_combined_camera_model')
def test_post_failure_with_server_side_camera_priority_returns_none(mock_cam_model, mock_post, mock_get):
    """UK production models: in_camera_area_N priority only (no areas in JSON)."""
    mock_cam_model.return_value = {
        'priority': [{'if': 'in_camera_area_1 || in_camera_area_2', 'multiply_by': '0.01'}],
    }
    mock_post.return_value = _mock_response(400, text='custom model failed')

    result = route_with_graphhopper(
        51.5, -0.1, 51.6, -0.2,
        enable_camera_avoidance=True,
        route_bbox={'min_lat': 51.5, 'max_lat': 51.6, 'min_lon': -0.2, 'max_lon': -0.1},
    )

    assert result is None
    mock_get.assert_not_called()


@patch('voyagr.services.routing.engines.requests.get')
@patch('voyagr.services.routing.engines.requests.post')
@patch('voyagr.services.routing.costing.build_graphhopper_costing_preference_model')
def test_post_failure_costing_only_falls_back_to_get(mock_costing, mock_post, mock_get):
    mock_costing.return_value = {
        'priority': [{'if': 'road_class == MOTORWAY', 'multiply_by': '0.01'}],
    }
    mock_post.return_value = _mock_response(400, text='unsupported')
    mock_get.return_value = _mock_response(200, json_data={
        'paths': [{
            'distance': 5000,
            'time': 300000,
            'points': 'encoded',
            'instructions': [],
            'details': {},
        }],
    })

    result = route_with_graphhopper(
        51.5, -0.1, 51.6, -0.2,
        enable_camera_avoidance=False,
        avoid_motorways=True,
    )

    assert result is not None
    assert result['success'] is True
    assert result['custom_model_applied'] is False
    assert result['custom_model_requested'] is True
    mock_get.assert_called()

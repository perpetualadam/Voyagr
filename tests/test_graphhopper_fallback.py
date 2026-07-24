"""Tests for GraphHopper POST→GET fallback policy."""

from voyagr.services.routing.graphhopper_fallback import (
    graphhopper_model_has_avoidance_areas,
    graphhopper_model_has_hard_costing_avoids,
    graphhopper_model_has_hazard_blocks,
    should_refuse_graphhopper_unfiltered_fallback,
)


def test_costing_only_model_has_no_avoidance_areas():
    model = {'priority': [{'if': 'road_class == MOTORWAY', 'multiply_by': '0.01'}]}
    assert graphhopper_model_has_avoidance_areas(model) is False
    assert graphhopper_model_has_hazard_blocks(model) is False
    assert graphhopper_model_has_hard_costing_avoids(model) is True


def test_polygon_model_has_avoidance_areas():
    model = {
        'priority': [{'if': 'in_hazard_0', 'multiply_by': '0'}],
        'areas': {'type': 'FeatureCollection', 'features': [{'type': 'Feature'}]},
    }
    assert graphhopper_model_has_avoidance_areas(model) is True
    assert graphhopper_model_has_hazard_blocks(model) is True


def test_server_side_camera_priority_detected():
    model = {
        'priority': [{'if': 'in_camera_area_10 || in_camera_area_11', 'multiply_by': '0'}],
    }
    assert graphhopper_model_has_hazard_blocks(model) is True
    assert graphhopper_model_has_avoidance_areas(model) is False


def test_refuse_unfiltered_when_areas_required_and_post_failed():
    model = {
        'areas': {'type': 'FeatureCollection', 'features': [{'type': 'Feature'}]},
    }
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=False) is True


def test_refuse_unfiltered_when_server_side_camera_model_post_failed():
    """Production UK camera models use in_camera_area_N with no areas payload."""
    model = {
        'priority': [{'if': 'in_camera_area_0 || in_camera_area_1', 'multiply_by': '0'}],
    }
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=False) is True


def test_allow_unfiltered_when_costing_only_and_post_failed():
    model = {'priority': [{'if': 'true', 'multiply_by': '0.5'}]}
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=False) is False


def test_refuse_unfiltered_when_hard_costing_avoid_and_post_failed():
    model = {'priority': [{'if': 'road_class == MOTORWAY', 'multiply_by': '0.01'}]}
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=False) is True


def test_no_refusal_when_post_succeeded():
    model = {
        'areas': {'type': 'FeatureCollection', 'features': [{'type': 'Feature'}]},
    }
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=True) is False

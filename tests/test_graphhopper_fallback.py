"""Tests for GraphHopper POST→GET fallback policy."""

from voyagr.services.routing.graphhopper_fallback import (
    graphhopper_model_has_avoidance_areas,
    should_refuse_graphhopper_unfiltered_fallback,
)


def test_costing_only_model_has_no_avoidance_areas():
    model = {'priority': [{'if': 'road_class == MOTORWAY', 'multiply_by': '0.01'}]}
    assert graphhopper_model_has_avoidance_areas(model) is False


def test_polygon_model_has_avoidance_areas():
    model = {
        'priority': [{'if': 'in_hazard_0', 'multiply_by': '0.1'}],
        'areas': {'type': 'FeatureCollection', 'features': [{'type': 'Feature'}]},
    }
    assert graphhopper_model_has_avoidance_areas(model) is True


def test_refuse_unfiltered_when_areas_required_and_post_failed():
    model = {
        'areas': {'type': 'FeatureCollection', 'features': [{'type': 'Feature'}]},
    }
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=False) is True


def test_allow_unfiltered_when_costing_only_and_post_failed():
    model = {'priority': [{'if': 'true', 'multiply_by': '0.5'}]}
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=False) is False


def test_no_refusal_when_post_succeeded():
    model = {
        'areas': {'type': 'FeatureCollection', 'features': [{'type': 'Feature'}]},
    }
    assert should_refuse_graphhopper_unfiltered_fallback(model, custom_model_applied=True) is False

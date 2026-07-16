"""GraphHopper custom-model hazard weight parity with Valhalla."""

from voyagr.services.hazards import (
    GRAPHOPPER_HAZARD_WEIGHTS,
    build_graphhopper_custom_model,
    extract_graphhopper_live_incident_hazards,
)


def test_avoid_point_included_in_graphhopper_model():
    hazards = {
        'avoid_point': [{'lat': 51.5, 'lon': -0.1}],
        'pothole': [{'lat': 51.51, 'lon': -0.11}],
    }
    model = build_graphhopper_custom_model(hazards, max_hazards=5)
    assert model.get('priority')
    assert model.get('areas', {}).get('features')


def test_live_incident_extractor_returns_tomtom_buckets():
    hazards = {
        'accident': [{'lat': 1.0, 'lon': 2.0}],
        'roadworks': [{'lat': 3.0, 'lon': 4.0}],
        'camera_speed': [{'lat': 5.0, 'lon': 6.0}],
    }
    out = extract_graphhopper_live_incident_hazards(hazards)
    assert 'accident' in out
    assert 'roadworks' in out
    assert 'camera_speed' not in out


def test_graphhopper_weights_align_avoid_point_with_valhalla():
    assert GRAPHOPPER_HAZARD_WEIGHTS['avoid_point'] == 60.0
    assert GRAPHOPPER_HAZARD_WEIGHTS['accident'] >= 30.0
    assert GRAPHOPPER_HAZARD_WEIGHTS['roadworks'] >= 30.0

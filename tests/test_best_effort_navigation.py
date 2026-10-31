"""Synthetic HTTP safety-hook outcomes; no provider calls or real route captures."""
import copy
from unittest.mock import patch

import pytest
from flask import Flask, jsonify
from voyagr.services.routing.integrity import assess_response, normalize_requirements
from voyagr.services.routing.integrity_api import register_avoidance_integrity
from voyagr.utils.hazard_matching import HazardDataset

NOW = 1800000000
POINTS = [(53.0, -1.0), (53.005, -1.0), (53.01, -1.0)]


def route(points=POINTS):
    return {'id': 'synthetic', 'source': 'GraphHopper', 'geometry': points,
            'geometry_precision': 6, 'distance_km': 1, 'duration_minutes': 2,
            'maneuvers': [{'instruction': 'Synthetic road', 'begin_shape_index': 0, 'end_shape_index': 2}],
            'road_segments': [{'begin_shape_index': 0, 'end_shape_index': 2,
                               'road_id': 'synthetic-road', 'road_id_namespace': 'test-only',
                               'observed_at_ms': NOW * 1000, 'level': 0}]}


def context():
    return {'start': POINTS[0], 'end': POINTS[-1], 'camera_mandatory': False,
            'accuracy_m': None, 'relations': {}}


def evaluate(category=None, mode='preference', candidate=None, hazards=None):
    raw = {'avoid_caz': False}
    if category:
        raw['avoidance_requirements'] = [{'category': category, 'enabled': True, 'mode': mode}]
    return assess_response({'success': True, 'routes': [candidate or route()]},
                           normalize_requirements(raw), hazards, now=NOW, origin_context=context())


@pytest.mark.parametrize('category,bucket', [('speed_cameras', 'camera_speed'),
                                            ('traffic_lights', 'traffic_light'),
                                            ('railway_crossings', 'railway_crossing')])
def test_independently_matched_preference_conflict_is_best_effort(category, bucket):
    hazard = {'id': 'synthetic-hazard', 'lat': 53.005, 'lon': -1.0,
              'road_id': 'synthetic-road', 'road_id_namespace': 'test-only',
              'observed_at_ms': NOW * 1000, 'travel_bearing_deg': 0}
    out = evaluate(category, hazards=HazardDataset({bucket: [hazard]}))
    assessment = out['routes'][0]['avoidance_assessment']
    row = next(r for r in assessment['requirements'] if r['category'] == category)
    assert row['status'] == 'VIOLATED'
    assert out['navigation_outcome'] == 'BEST_EFFORT'
    assert out['automatic_selection_allowed'] is True
    assert assessment['requires_acceptance'] is False


def test_verified_route_needs_no_preference_warning():
    out = evaluate()
    assert out['navigation_outcome'] == 'VERIFIED'
    assert out['avoidance_assessment']['origin_integrity']['navigation_allowed'] is True


@pytest.mark.parametrize('category', ['tolls', 'caz', 'traffic_lights'])
def test_unverified_preferences_remain_eligible_but_mandatory_never_downgrades(category):
    preference = evaluate(category)
    assert preference['navigation_outcome'] == 'BEST_EFFORT'
    assert preference['automatic_selection_allowed'] is True
    mandatory = evaluate(category, 'mandatory')
    assert mandatory['navigation_outcome'] == 'REFUSED'
    assert mandatory['automatic_selection_allowed'] is False


def test_graphhopper_limitation_is_not_critical_permission_or_native_proof():
    candidate = route()
    candidate['provider_limitations'] = [{'category': 'tolls', 'reason': 'attribute_unavailable'}]
    out = evaluate('tolls', candidate=candidate)
    assert out['navigation_outcome'] == 'BEST_EFFORT'
    row = next(r for r in out['avoidance_assessment']['requirements'] if r['category'] == 'tolls')
    assert row['status'] == 'UNVERIFIED'
    assert row['provider_limitation'] == 'attribute_unavailable'


def test_cached_claim_is_reassessed_by_actual_http_integrity_hook():
    cached = route([(53.0001, -1), POINTS[1], POINTS[-1]])
    cached.update(navigation_outcome='BEST_EFFORT', automatic_selection_allowed=True,
                  avoidance_assessment={'status': 'SATISFIED', 'automatic_selection_allowed': True})
    original = copy.deepcopy(cached)
    app = Flask(__name__)
    register_avoidance_integrity(app)

    @app.post('/api/route')
    def endpoint():
        return jsonify(success=True, routes=[cached])

    with patch('voyagr.services.hazards.fetch_hazards_for_route', return_value={}):
        with app.test_client() as client:
            out = client.post('/api/route', json={'start': '53,-1', 'end': '53.01,-1',
                                                 'avoid_caz': False}).get_json()
    assert out['navigation_outcome'] == 'REFUSED'
    assert out['automatic_selection_allowed'] is False
    assert out['routes'][0]['avoidance_assessment']['origin_integrity']['origin_displacement_m'] > 2
    assert cached == original


def test_all_alternatives_keep_their_own_critical_refusal():
    good = route()
    bad = route([(53.0001, -1), POINTS[1], POINTS[-1]])
    bad['id'] = 'displaced'
    req = normalize_requirements({'avoid_caz': False, 'avoid_tolls': True})
    out = assess_response({'success': True, 'routes': [bad, good]}, req,
                          now=NOW, origin_context=context())
    by_id = {r['id']: r for r in out['routes']}
    assert by_id['synthetic']['navigation_outcome'] == 'BEST_EFFORT'
    assert by_id['displaced']['navigation_outcome'] == 'REFUSED'
    assert by_id['displaced']['avoidance_assessment']['requires_acceptance'] is True

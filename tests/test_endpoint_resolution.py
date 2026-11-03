"""Planning evidence is additive, source-specific and never navigation authority."""
import copy
import json
from pathlib import Path
from unittest.mock import patch

import polyline
import pytest
from flask import Flask, jsonify

from voyagr.services.routing.endpoint_resolution import resolve_endpoints, search_evidence
from voyagr.services.routing.integrity_api import register_avoidance_integrity
from voyagr.services.routing.journey_geometry import decode_geometry

CAPTURE = json.loads((Path(__file__).parent.parent / 'static/js/__tests__/fixtures/sheffield-doncaster-20261101.json').read_text())
START = [53.3806626, -1.4702278]
END = [53.5227681, -1.1335312]


def metadata(point):
    # Synthetic search metadata used as a contract control; not a geocoder capture.
    return {'version': 1, 'coordinates': point, 'semantic_class': 'locality', 'provider': 'nominatim',
            'provider_ref': 'relation:synthetic', 'bounds': [53, -2, 54, 0]}


def body(kind='searched', purpose='planning'):
    return {'start': ','.join(map(str, START)), 'end': ','.join(map(str, END)), 'avoid_caz': False,
            'journey_context': {'purpose': purpose, 'origin': {'kind': kind, 'search_evidence': metadata(START)},
                                'destination': {'kind': kind, 'search_evidence': metadata(END)}}}


def post(raw, payload=None):
    fixture = copy.deepcopy(CAPTURE if payload is None else payload)
    before = copy.deepcopy(fixture)
    app = Flask(__name__)
    register_avoidance_integrity(app)

    @app.post('/api/route')
    def endpoint():
        return jsonify(fixture)

    with patch('voyagr.services.hazards.fetch_hazards_for_route', return_value={}):
        response = app.test_client().post('/api/route', json=raw)
    assert fixture == before
    assert response.status_code == 200
    return response.get_json()


def test_captured_provider_snaps_support_planning_classification_without_live_permission():
    result = post(body())
    route = result['routes'][0]
    evidence = route['endpoint_resolution']
    assert evidence['planning_disposition'] == 'ROAD_SNAPPED'
    assert evidence['navigation_authority'] == 'NONE'
    assert evidence['geometry_binding'] == route['avoidance_assessment']['geometry_binding']
    for name, point, offset in [('origin', START, 23.651), ('destination', END, 22.793)]:
        item = evidence[name]
        assert item['requested']['coordinates'] == point
        assert item['offset_m'] == offset
        assert item['anchor_evidence'] == 'NATIVE_SNAP_CONSISTENT'
        assert item['access_evidence'] == 'UNKNOWN'
        assert item['routing_anchor']['coordinates'] == item['routing_anchor']['native_coordinates']
    assert result['endpoint_resolution'] == evidence
    assert route['avoidance_assessment']['origin_integrity']['navigation_allowed'] is False
    assert route['navigation_outcome'] == 'REFUSED'
    assert route['geometry'] == CAPTURE['routes'][0]['geometry']
    assert route['maneuvers'] == CAPTURE['routes'][0]['maneuvers']


def test_alternatives_cannot_borrow_primary_native_snap_evidence():
    result = post(body())
    for route in result['routes'][1:]:
        record = route['endpoint_resolution']
        assert record['origin']['anchor_evidence'] == 'GEOMETRY_ONLY'
        assert record['planning_disposition'] == 'REVIEW_REQUIRED'
        assert record['geometry_binding'] == route['avoidance_assessment']['geometry_binding']


@pytest.mark.parametrize('kind,purpose', [('gps', 'live_gps'), ('searched', 'live_gps'), ('map', 'planning'), ('unknown', 'planning')])
def test_claimed_endpoint_kind_or_purpose_cannot_authorize_relocation(kind, purpose):
    result = post(body(kind, purpose))
    assert all(not r['avoidance_assessment']['origin_integrity']['navigation_allowed'] for r in result['routes'])
    assert all(r['endpoint_resolution']['navigation_authority'] == 'NONE' for r in result['routes'])


@pytest.mark.parametrize('bad', [None, [], True, {'version': True}, {'version': 1, 'coordinates': [0, 0]}])
def test_invalid_or_stale_search_metadata_is_ignored(bad):
    assert search_evidence(bad, START) is None


def test_untrusted_metadata_is_bounded_and_cannot_claim_access():
    supplied = dict(metadata(START), provider=[], semantic_class={}, verified=True,
                    access_evidence='VERIFIED_CONNECTOR', entry_points=[{'coordinates': START, 'type': 'x'*100}]*20)
    value = search_evidence(supplied, START)
    assert value['authority'] == 'request_metadata_only'
    assert value['provider'] == value['semantic_class'] == 'unknown'
    assert 'verified' not in value and 'access_evidence' not in value
    assert len(value['entry_points']) == 8 and len(value['entry_points'][0]['type']) == 40


def test_anchor_outside_selected_bounds_and_missing_metadata_require_review():
    raw = body()
    raw['journey_context']['origin']['search_evidence']['bounds'] = [53.38066, -1.47023, 53.38067, -1.47022]
    raw['journey_context']['destination'].pop('search_evidence')
    result = post(raw)
    assert result['endpoint_resolution']['planning_disposition'] == 'REVIEW_REQUIRED'
    assert result['endpoint_resolution']['origin']['planning_disposition'] == 'REVIEW_REQUIRED'
    assert 'search_evidence' not in result['journey_context']['destination']


def test_cached_or_client_supplied_endpoint_records_are_replaced():
    payload = copy.deepcopy(CAPTURE)
    payload['endpoint_resolution'] = {'navigation_authority': 'FULL', 'planning_disposition': 'ROAD_SNAPPED'}
    for route in payload['routes']:
        route['endpoint_resolution'] = payload['endpoint_resolution']
    raw = body()
    raw['endpoint_resolution'] = payload['endpoint_resolution']
    result = post(raw, payload)
    assert result['endpoint_resolution']['navigation_authority'] == 'NONE'
    assert all(r['endpoint_resolution']['authority'] == 'planning_evidence_only' for r in result['routes'])


def test_single_route_envelope_also_gets_evidence():
    payload = dict(CAPTURE['routes'][0], success=True)
    result = post(body(), payload)
    assert result['endpoint_resolution']['origin']['anchor_evidence'] == 'NATIVE_SNAP_CONSISTENT'


def test_native_snap_mismatch_remains_review_only():
    route = copy.deepcopy(CAPTURE['routes'][0])
    route['provider_snapped_waypoints'] = polyline.encode([[53, -1], [54, -1]], precision=5)
    context = {'origin': {'coordinates': START, 'kind': 'searched'}, 'destination': {'coordinates': END, 'kind': 'searched'}}
    record = resolve_endpoints(route, context)
    assert record['origin']['anchor_evidence'] == 'MISMATCH'
    assert record['planning_disposition'] == 'REVIEW_REQUIRED'


def test_stop_records_follow_validated_ranges_and_preserve_visit_identity():
    points = [[53, -1], [53.01, -1], [53.02, -1]]
    route = {'source': 'GraphHopper', 'geometry': points, 'geometry_precision': 6,
             'provider_snapped_waypoints': polyline.encode(points, precision=5),
             'avoidance_assessment': {'geometry_valid': True},
             'leg_geometry_ranges': [{'begin_shape_index': 0, 'end_shape_index': 1}, {'begin_shape_index': 1, 'end_shape_index': 2}]}
    context = {'origin': {'coordinates': points[0]}, 'destination': {'coordinates': points[-1]},
               'ordered_stops': [{'coordinates': points[1], 'original_index': 7}]}
    record = resolve_endpoints(route, context)
    assert record['stops'][0]['routing_anchor']['coordinates'] == points[1]
    assert record['stops'][0]['original_index'] == 7
    assert record['stops'][0]['anchor_evidence'] == 'NATIVE_SNAP_CONSISTENT'
    del route['leg_geometry_ranges']
    assert resolve_endpoints(route, context)['stops'][0]['planning_disposition'] == 'UNAVAILABLE'


def test_round_trip_search_evidence_uses_the_origin_point():
    raw = body()
    raw['round_trip'] = True
    result = post(raw)
    assert result['journey_context']['destination']['coordinates'] == START
    assert result['journey_context']['destination']['search_evidence']['coordinates'] == START


def test_invalid_geometry_never_acquires_planning_evidence():
    route = {'geometry': '?', 'avoidance_assessment': {'geometry_valid': False}}
    assert resolve_endpoints(route, {})['planning_disposition'] == 'NO_VALID_GEOMETRY'


def test_real_http_assessment_integrates_with_shipped_javascript_planning_and_gate():
    import subprocess
    result = post(body())
    script = r"""
const fs=require('fs');
const AI=require('./static/js/modules/navigation/avoidance-integrity.js');
const RS=require('./static/js/modules/navigation/route-selection.js');
const Plan=require('./static/js/modules/navigation/journey-plan.js');
const codec=require('./static/js/modules/navigation/polyline-codec.js');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
const rows=RS.buildRouteOptionsFromApiResponse(payload,codec.decodePolyline).map(route=>{
 const diagnostics={},candidate=AI.prepareNavigationCandidate(route,diagnostics);
 if(!candidate)throw Error(diagnostics.reason);
 return {authority:route.endpoint_resolution.navigation_authority,
   planning:route.endpoint_resolution.planning_disposition,
   summary:AI.summary(route),allowed:AI.decision(candidate).allowed,
   steps:Plan.inspection(candidate,AI).steps.length};
});
process.stdout.write(JSON.stringify(rows));
"""
    completed = subprocess.run(['node', '-e', script], input=json.dumps(result), text=True, capture_output=True,
                               cwd=Path(__file__).resolve().parents[1], check=True)
    rows = json.loads(completed.stdout)
    assert len(rows) == 5
    assert rows[0]['planning'] == 'ROAD_SNAPPED'
    assert 'Start offset: about 24 m' in rows[0]['summary']
    assert all(row['steps'] > 0 and row['authority'] == 'NONE' and not row['allowed'] for row in rows)
    assert all(row['planning'] == 'REVIEW_REQUIRED' for row in rows[1:])


def test_mandatory_unknown_evidence_still_blocks_a_road_snapped_plan():
    raw = body()
    raw['avoidance_requirements'] = [{'category': 'speed_cameras', 'mode': 'mandatory', 'enabled': True}]
    with patch('voyagr.services.hazards.CAMERA_AREAS_DATA', None):
        result = post(raw)
    assert result['endpoint_resolution']['planning_disposition'] == 'ROAD_SNAPPED'
    assert not result['automatic_selection_allowed']
    assert all(not route['avoidance_assessment']['automatic_selection_allowed'] for route in result['routes'])

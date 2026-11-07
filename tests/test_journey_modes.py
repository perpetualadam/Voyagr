"""Synthetic provenance and real HTTP verification; no engine, GPS or external calls."""
import copy
from unittest.mock import patch

import pytest
from flask import Flask, jsonify

from voyagr.services.routing.journey_context import context_for_plan
from voyagr.services.routing.integrity_api import register_avoidance_integrity


def request_body(kind='searched'):
    return {'start': '53,-1', 'end': '53.01,-1', 'avoid_caz': False,
            'journey_context': {'purpose': 'planning', 'origin': {'kind': kind, 'coordinates': [0, 0]},
                                'destination': {'kind': 'map'}}}


def candidate(start=53):
    return {'id': 'synthetic', 'source': 'GraphHopper', 'geometry': [[start, -1], [53.005, -1], [53.01, -1]],
            'geometry_precision': 6, 'distance_km': 1, 'duration_minutes': 2,
            'maneuvers': [{'instruction': 'Synthetic road', 'begin_shape_index': 0, 'end_shape_index': 2}]}


def post(body, routes=None, payload=None):
    app = Flask(__name__)
    register_avoidance_integrity(app)
    cached = payload or {'success': True, 'routes': routes or [candidate()]}
    original = copy.deepcopy(cached)

    @app.post('/api/route')
    def endpoint():
        return jsonify(cached)

    with patch('voyagr.services.hazards.fetch_hazards_for_route', return_value={}):
        with app.test_client() as client:
            response = client.post('/api/route', json=body)
    assert cached == original
    assert response.status_code == 200
    return response.get_json()


@pytest.mark.parametrize('kind', ['searched', 'map', 'gps', 'saved', 'coordinates', 'unknown'])
def test_provenance_does_not_replace_actual_request_coordinates(kind):
    result = context_for_plan(request_body(kind), [])
    assert result['origin'] == {'kind': kind, 'coordinates': [53.0, -1.0]}
    assert result['destination'] == {'kind': 'map', 'coordinates': [53.01, -1.0]}
    assert result['authority'] == 'request_metadata_only'


@pytest.mark.parametrize('kind', [None, [], {}, 1, True, 'trusted_gps'])
def test_invalid_provenance_normalizes_to_unknown_without_creating_permission(kind):
    assert context_for_plan(request_body(kind), [])['origin']['kind'] == 'unknown'


def test_physical_gps_is_not_required_for_manual_planning():
    result = post(request_body())
    assert result['success'] is True
    assert result['navigation_outcome'] == 'VERIFIED'
    assert result['avoidance_assessment']['origin_integrity']['requested_origin'] == [53, -1]
    assert result['journey_context']['purpose'] == 'planning'


@pytest.mark.parametrize('kind', ['gps', 'searched', 'map'])
def test_material_23_7_metre_snap_stays_refused_independent_of_origin_claim(kind):
    body = request_body(kind)
    body['journey_context'].update(purpose='live_gps', navigation_allowed=True, transition_verified=True)
    result = post(body, [candidate(53 + 23.7 / 111195)])
    assert result['success'] is True  # geometry inspection remains possible
    assert result['navigation_outcome'] == 'REFUSED'
    assert result['automatic_selection_allowed'] is False
    origin = result['routes'][0]['avoidance_assessment']['origin_integrity']
    assert origin['navigation_allowed'] is False
    assert origin['transition_verified'] is False
    assert 23 < origin['origin_displacement_m'] < 24.5
    assert result['journey_context']['origin']['coordinates'] == [53, -1]
    assert result['routes'][0]['geometry'][0][0] > 53


def test_each_alternative_is_independently_assessed_not_borrowed():
    bad = candidate(53.0002)
    bad['id'] = 'displaced'
    result = post(request_body(), [bad, candidate()])
    routes = {r['id']: r for r in result['routes']}
    assert routes['displaced']['navigation_outcome'] == 'REFUSED'
    assert routes['synthetic']['navigation_outcome'] == 'VERIFIED'
    assert routes['displaced']['journey_context'] == routes['synthetic']['journey_context']


def test_cached_old_provenance_and_permission_are_rebound_to_new_request():
    cached = candidate()
    cached['journey_context'] = {'origin': {'kind': 'gps', 'coordinates': [0, 0]}}
    cached['navigation_outcome'] = 'VERIFIED'
    body = request_body('map')
    body['start'] = '53.0002,-1'
    result = post(body, [cached])
    assert result['navigation_outcome'] == 'REFUSED'
    assert result['routes'][0]['journey_context']['origin'] == {'kind': 'map', 'coordinates': [53.0002, -1]}


def test_canonical_order_keeps_mixed_via_and_duration_stop_provenance():
    a = {'lat': 53.001, 'lon': -1, 'name': 'A', 'provenance': 'map', 'original_index': 0}
    b = {'lat': 53.002, 'lon': -1, 'name': 'B', 'duration': 3, 'provenance': 'saved', 'original_index': 1}
    body = dict(request_body(), via_points=[a], stops=[b])
    context = context_for_plan(body, [b, a])
    assert [s['kind'] for s in context['ordered_stops']] == ['saved', 'map']
    assert [s['coordinates'] for s in context['ordered_stops']] == [[53.002, -1], [53.001, -1]]
    assert [s['original_index'] for s in context['ordered_stops']] == [1, 0]
    assert context['ordered_stops'][0]['duration_minutes'] == 3


def test_coincident_stops_cannot_borrow_each_others_provenance():
    a = {'lat': 53.005, 'lon': -1, 'provenance': 'gps', 'original_index': 0}
    b = dict(a, provenance='map', original_index=1)
    context = context_for_plan(dict(request_body(), stops=[a, b]), [b, a])
    assert [s['kind'] for s in context['ordered_stops']] == ['map', 'gps']
    unknown = context_for_plan(dict(request_body(), stops=[a, b]), [{'lat': 53.005, 'lon': -1}])
    assert unknown['ordered_stops'][0]['kind'] == 'unknown'


def test_round_trip_destination_is_bound_to_request_origin():
    body = dict(request_body(), round_trip=True)
    assert context_for_plan(body, [])['destination']['coordinates'] == [53, -1]


def test_mandatory_unknown_hazard_cannot_become_best_effort_through_provenance():
    body = request_body('gps')
    body['avoidance_requirements'] = [{'category': 'traffic_lights', 'enabled': True, 'mode': 'mandatory'}]
    result = post(body)
    assert result['navigation_outcome'] == 'REFUSED'
    assert result['automatic_selection_allowed'] is False
    assert result['journey_context']['origin']['kind'] == 'gps'


def test_live_request_uses_complete_multi_stop_envelope_without_reoptimization():
    from voyagr.services.routing.multidrop import build_route_multidrop_response
    from voyagr.services.routing.request_params import parse_route_request
    body = dict(request_body('gps'), stops=[
        {'lat': 53.002, 'lon': -1, 'name': 'First', 'duration': 0, 'provenance': 'map'},
        {'lat': 53.006, 'lon': -1, 'name': 'Second', 'duration': 3, 'provenance': 'saved'}],
        preserve_stop_order=True, optimize_stop_order=False, force_refresh=True,
        enable_hazard_avoidance=False, avoid_caz=False)
    core = {'success': True, 'total_distance_km': 1, 'total_duration_minutes': 2,
            'geometry': [[53, -1], [53.002, -1], [53.006, -1], [53.01, -1]],
            'maneuvers': [{'instruction': 'Synthetic complete journey'}],
            'geometry_complete': True, 'ordered_stops': body['stops']}
    with patch('voyagr.services.routing.multidrop.build_multidrop_route', return_value=core) as build:
        result = build_route_multidrop_response(parse_route_request(body))
    assert build.call_args.kwargs['optimize_order'] is False
    assert [s['name'] for s in build.call_args.kwargs['stops']] == ['First', 'Second']
    assert result['multi_drop'] is True
    assert result['routes'][0]['geometry'] == core['geometry']
    assert result['routes'][0]['maneuvers'] == core['maneuvers']


@pytest.mark.parametrize('unverified_claim', [
    {'oneway': True}, {'divided_carriageway': True}, {'access': 'private'},
    {'barrier': 'fence'}, {'road_connectivity': 'VERIFIED', 'safe_exit': 'VERIFIED'}])
def test_untrusted_road_labels_cannot_verify_material_endpoint_connection(unverified_claim):
    route = candidate(53.0002)
    route.update(unverified_claim)
    result = post(request_body(), [route])
    origin = result['routes'][0]['avoidance_assessment']['origin_integrity']
    assert origin['navigation_allowed'] is False
    assert origin['transition_verified'] is False
    assert origin['safe_exit'] == 'NOT_ESTABLISHED'


@pytest.mark.parametrize('kind', ['gps', 'searched', 'map', 'saved', 'coordinates', 'unknown'])
def test_stop_provenance_round_trip_is_metadata_not_permission(kind):
    stop = {'lat': 53.005, 'lon': -1, 'name': 'Synthetic visit', 'duration': 0,
            'provenance': kind, 'original_index': 7}
    if kind == 'saved':
        stop['source_kind'] = 'gps'
    body = dict(request_body(kind), stops=[stop])
    context = context_for_plan(body, [stop])
    assert context['ordered_stops'][0]['kind'] == kind
    assert context['ordered_stops'][0]['duration_minutes'] == 0
    assert context['ordered_stops'][0]['original_index'] == 7
    if kind == 'saved':
        assert context['ordered_stops'][0]['source_kind'] == 'gps'
    # Actual HTTP hook rebinds even cached claims; provenance cannot repair displacement.
    result = post(body, [candidate(53.0002)])
    assert result['routes'][0]['journey_context']['ordered_stops'][0]['kind'] == kind
    assert result['navigation_outcome'] == 'REFUSED'


def test_historical_endpoint_source_survives_new_request_without_claiming_gps_authenticity():
    body = request_body('saved')
    body['journey_context']['origin']['source_kind'] = 'gps'
    result = post(body, [candidate(53.0002)])
    assert result['journey_context']['origin']['source_kind'] == 'gps'
    assert result['avoidance_assessment']['origin_integrity']['navigation_allowed'] is False


def test_sheffield_doncaster_five_snapped_alternatives_are_independently_refused():
    """Synthetic reported envelope; no live provider request or production capture."""
    start = [53.3806626, -1.4702278]
    end = [53.5227681, -1.1335312]
    body = {'start': ','.join(map(str, start)), 'end': ','.join(map(str, end)),
            'avoid_caz': False, 'journey_context': {'purpose': 'planning',
            'origin': {'kind': 'searched'}, 'destination': {'kind': 'searched'}}}
    routes = []
    for i in range(5):
        route = candidate()
        route.update(id=f'synthetic-{i}', source='GraphHopper' if i < 3 else 'Valhalla',
                     geometry=[[start[0] + 23.7 / 111195, start[1]],
                               [53.45, -1.3 + i * .00001],
                               [end[0] + (22.8 + i * .2) / 111195, end[1]]])
        routes.append(route)
    result = post(body, routes)
    assert result['navigation_outcome'] == 'REFUSED'
    assert result['avoidance_status'] == 'NO_COMPLIANT_ROUTE'
    assert len(result['routes']) == 5
    assert len({r['avoidance_assessment']['geometry_binding'] for r in result['routes']}) == 5
    for route in result['routes']:
        assessment = route['avoidance_assessment']
        origin = assessment['origin_integrity']
        assert assessment['geometry_valid'] is True
        assert assessment['automatic_selection_allowed'] is False
        assert origin['reason'] == 'material_endpoint_relocation'
        assert origin['navigation_allowed'] is False
        assert 23 < origin['origin_displacement_m'] < 24.5
        assert 22 < origin['destination_displacement_m'] < 24.5
        assert route['journey_context']['purpose'] == 'planning'


def test_planning_page_bypasses_pre_fix_immutable_asset_urls():
    """The page must not reuse the cache keys observed serving old inspection code."""
    import re
    from pathlib import Path
    from flask import render_template

    root = Path(__file__).resolve().parents[1]
    app = Flask(__name__, template_folder=str(root / 'templates'))
    with app.test_request_context('/'):
        html = render_template(
            'index.html', tomtom_api_key='', tomtom_traffic_proxy=False,
            picovoice_access_key='', picovoice_keyword_public_path='',
            picovoice_web_assets_ok=False, wake_backend_default='none',
            show_firefox_browser_hint=False)
    urls = re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', html)
    previous = {
        'modules/navigation/journey-plan.js': '20261031phase12fgremediation',
        'modules/navigation/avoidance-integrity.js': '20261031phase12fgr5r6',
        'modules/navigation/route-selection.js': '20261031phase12fgr9',
        'app/calculate-route-orchestration.js': '20261031phase12fgr7r8',
    }
    for asset, stale_version in previous.items():
        matches = [u for u in urls if u.startswith('/static/js/' + asset + '?v=')]
        assert len(matches) == 1, asset
        version = matches[0].split('?v=', 1)[1]
        assert version and version != stale_version, asset

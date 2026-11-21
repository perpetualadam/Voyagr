"""Synthetic settings retention across real provider request and recovery paths."""
import copy
from unittest.mock import MagicMock, patch

import pytest

from voyagr.services.routing.selected_settings import retain_valhalla_settings
from voyagr.services.routing.optimised_route import fetch_valhalla_auto_costing_preference_json

SELECTED = {
    'locations': [{'lat': 53.52, 'lon': -1.13}, {'lat': 53.525, 'lon': -1.12}, {'lat': 53.53, 'lon': -1.13}],
    'costing': 'auto',
    'exclude_locations': [{'lat': 53.524, 'lon': -1.13, 'radius': 40}],
    'costing_options': {'auto': {'use_tolls': 0, 'use_highways': 0, 'use_ferry': 0, 'use_tracks': 0, 'top_speed': 90}},
    'date_time': {'type': 1, 'value': '2026-11-21T09:00'},
}


def test_variant_retains_all_selected_settings_without_mutating_either_input():
    candidate = {'locations': [], 'costing': 'auto', 'costing_options': {'auto': {'use_highways': .3, 'use_living_streets': .8}}}
    originals = copy.deepcopy((candidate, SELECTED))
    out = retain_valhalla_settings(candidate, SELECTED)
    assert all(out[key] == SELECTED[key] for key in ('locations', 'costing', 'exclude_locations', 'date_time'))
    assert out['costing_options']['auto'] == dict(SELECTED['costing_options']['auto'], use_living_streets=.8)
    out['locations'][0]['lat'] = 0
    assert (candidate, SELECTED) == originals


@pytest.mark.parametrize('status', [400, 500])
def test_scenic_quiet_failure_never_retries_without_selected_hazards(status):
    with patch('voyagr.services.routing.optimised_route.requests.post', return_value=MagicMock(status_code=status)) as post:
        result = fetch_valhalla_auto_costing_preference_json('http://fixture/route', {}, SELECTED['locations'],
            prefer_quiet=True, exclude_locations=SELECTED['exclude_locations'], selected_payload=SELECTED)
    assert result is None
    assert post.call_count == 1
    sent = post.call_args.kwargs['json']
    assert sent['exclude_locations'] == SELECTED['exclude_locations']
    assert sent['costing_options']['auto']['use_highways'] == 0


@pytest.mark.parametrize('enabled', [False, True])
def test_multidrop_fallback_does_not_drop_selected_settings(enabled):
    from voyagr.services.routing import multidrop
    with patch.object(multidrop, '_valhalla_leg', return_value=None), \
         patch.object(multidrop, '_osrm_leg', return_value={'source': 'OSRM'}) as osrm:
        result = multidrop._route_leg(SELECTED['locations'][0], SELECTED['locations'][-1],
                                      enable_hazard_avoidance=enabled)
    if enabled:
        osrm.assert_not_called()
        assert result['geometry'] is None  # existing incomplete-journey gate refuses estimates
    else:
        osrm.assert_called_once()
        assert result['source'] == 'OSRM'


@pytest.mark.parametrize('reroute', [False, True])
def test_actual_route_recovery_keeps_settings_and_refuses_unconstrained_fallback(reroute):
    import voyagr_web as vw
    excluded = [{'lat': 53.524 + i*.00001, 'lon': -1.13, 'radius': 40} for i in range(30)]
    failed = MagicMock(status_code=400)
    with patch.object(vw, 'resolve_fuel_pricing', side_effect=lambda d: (d, {}, 'synthetic')), \
         patch.object(vw, 'prepare_route_hazards', return_value={}), \
         patch.object(vw, 'attempt_graphhopper_camera_route', return_value=(None, 'synthetic failure')), \
         patch.object(vw, 'build_prioritised_valhalla_exclude_locations', return_value=excluded), \
         patch.object(vw, 'get_traffic_duration_multiplier', return_value=(1, 'N/A')), \
         patch('voyagr.utils.request_budget.requests.post', return_value=failed) as post, \
         patch('voyagr.utils.request_budget.requests.get') as get:
        response = vw.app.test_client().post('/api/route', json={
            'start': '53.52,-1.13', 'end': '53.53,-1.13', 'force_refresh': True, 'is_reroute': reroute,
            'enable_hazard_avoidance': True, 'avoid_caz': False, 'avoid_tolls': True,
            'avoid_motorways': True, 'avoid_ferries': True, 'avoid_unpaved': True,
            'via_points': [{'lat': 53.525, 'lon': -1.12}]})
    assert response.json['error_code'] == 'ROUTING_SETTINGS_UNSUPPORTED'
    assert response.json['success'] is False
    assert response.json['automatic_selection_allowed'] is False
    assert post.call_count == 3  # primary plus two metadata-only recoveries; no reduced excludes
    get.assert_not_called()
    for call in post.call_args_list:
        payload = call.kwargs['json']
        assert payload['exclude_locations'] == excluded
        assert len(payload['locations']) == 3
        assert payload['costing_options']['auto'] == {'use_tolls': 0, 'use_highways': 0, 'use_ferry': 0, 'use_tracks': 0}


def test_optimised_ensure_inherits_primary_settings_at_provider_boundary():
    from voyagr.services.routing.optimised_route import ensure_optimised_camera_avoiding_route
    failed = MagicMock(status_code=400)
    with patch('voyagr.services.routing.optimised_route.build_valhalla_exclude_locations', return_value=SELECTED['exclude_locations']), \
         patch('voyagr.services.routing.optimised_route.requests.post', return_value=failed) as post:
        routes = [{'name': 'Fastest', 'hazard_count': 1}]
        out = ensure_optimised_camera_avoiding_route(routes, url='http://fixture/route', headers={},
            route_locations=SELECTED['locations'], has_waypoints=True,
            start_lat=53.52, start_lon=-1.13, end_lat=53.53, end_lon=-1.13,
            route_bbox={}, hazards={'camera_speed': [{}]}, enable_hazard_avoidance=True, avoid_cameras=True,
            cost_calculator=None, vehicle_type='petrol_diesel', fuel_efficiency=6, fuel_price=1.5,
            energy_efficiency=18, electricity_price=.3, include_tolls=True, include_caz=True, caz_exempt=False,
            selected_payload=SELECTED)
    assert out == routes
    post.assert_called_once()
    assert post.call_args.kwargs['json']['costing_options'] == SELECTED['costing_options']
    assert post.call_args.kwargs['json']['locations'] == SELECTED['locations']


def test_discovery_keeps_waypoints_road_preferences_and_all_selected_exclusions():
    import polyline
    from voyagr.services.routing.discovery import append_distinct_valhalla_route_types
    from tests.test_route_discovery import BASE
    with patch('voyagr.services.routing.discovery._append_preference_route_if_distinct', side_effect=lambda r, **kw: r) as preference, \
         patch('voyagr.services.routing.discovery.build_valhalla_exclude_locations', return_value=SELECTED['exclude_locations']), \
         patch('voyagr.services.routing.discovery.find_baseline_cameras_on_route', return_value=[SELECTED['exclude_locations'][0]]), \
         patch('voyagr.services.routing.discovery.route_transport.post', return_value=MagicMock(status_code=400)) as post:
        append_distinct_valhalla_route_types([{'name': 'Fastest'}], valhalla_costing='auto',
            enable_hazard_avoidance=True, selected_payload=SELECTED,
            **dict(BASE, route_geometry=polyline.encode([(53.52,-1.13),(53.53,-1.13)], precision=6)))
    assert preference.call_count == 2
    assert all(call.kwargs['selected_payload'] == SELECTED for call in preference.call_args_list)
    post.assert_called_once()
    sent = post.call_args.kwargs['json']
    assert all(sent[key] == SELECTED[key] for key in SELECTED)


@pytest.mark.parametrize('enabled', [False, True])
def test_multi_stop_endpoint_passes_selected_signal_and_crossing_preferences(enabled):
    from voyagr.services.routing import multidrop
    signals = [{'lat': 53.525, 'lon': -1.13}]
    with patch('voyagr.services.hazards.fetch_hazards_for_route', return_value={}), \
         patch('voyagr.services.routing.warning_observations.collect', return_value={'traffic_light': signals, 'railway_crossing': signals}), \
         patch.object(multidrop, '_merge_tomtom_incidents_for_bbox', side_effect=lambda h, b: h), \
         patch.object(multidrop, 'build_multidrop_route', return_value={'success': True, 'total_distance_km': 1, 'total_duration_minutes': 2}) as build:
        result, status = multidrop.build_multidrop_route_from_request({
            'start': '53.52,-1.13', 'stops': [{'lat': 53.53, 'lon': -1.13}], 'avoid_caz': False,
            'enable_hazard_avoidance': True, 'avoid_cameras': False,
            'avoid_traffic_lights': enabled, 'avoid_railway_crossings': enabled})
    assert status == 200 and result['success']
    assert build.call_args.kwargs['traffic_light_hazards'] == (signals if enabled else [])
    assert build.call_args.kwargs['railway_crossing_hazards'] == (signals if enabled else [])

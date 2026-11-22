"""Synthetic settings only; no location, infrastructure or production app import."""
import copy
import json
import subprocess
import sys
import pytest
from prototypes.graphhopper11.app_settings_adapter import adapt_settings, compile_app_settings
from voyagr.avoidance_contract import normalize_requirements


def test_exact_legacy_defaults_and_explicit_override_are_preserved():
    settings = {'enable_hazard_avoidance': False, 'avoidance_mode': 'mandatory',
                'avoidance_requirements': [{'category': 'traffic_lights', 'enabled': True,
                                            'mode': 'preference'}]}
    original = copy.deepcopy(settings)
    result = compile_app_settings(settings)
    rows = {r['category']: r for r in result['policy_request']['requirements']}
    assert rows['caz']['enabled'] and rows['congestion_charging']['enabled']
    assert not rows['speed_cameras']['enabled']
    assert rows['traffic_lights']['enabled'] and rows['traffic_lights']['mode'] == 'preference'
    assert not result['policy_report']['route_preview_allowed']
    assert result['app_settings'] == original == settings
    assert not result['navigation_allowed'] and not result['app_integration_allowed']


@pytest.mark.parametrize('exemption', [{'vehicle_type': 'electric'}, {'caz_exempt': True}])
def test_caz_exemptions_match_existing_app(exemption):
    rows = adapt_settings(exemption)['policy_request']['requirements']
    assert rows == sorted(normalize_requirements(exemption), key=lambda row: row['category'])
    assert not any(row['enabled'] for row in rows)


def test_camera_off_keeps_ordinary_signals_and_crossings_selected():
    result = compile_app_settings({'enable_hazard_avoidance': True, 'avoid_cameras': False,
                                   'avoidance_mode': 'mandatory'})
    rows = {r['category']: r for r in result['policy_report']['rules']}
    assert not any(rows[c]['enabled'] for c in ('speed_cameras', 'red_light_cameras', 'other_cameras'))
    assert rows['traffic_lights']['enabled'] and rows['railway_crossings']['enabled']
    assert not result['policy_report']['route_preview_allowed']


@pytest.mark.parametrize('bad', [None, [], {'lat': 53}, {'avoid_cameras': 1},
    {'routing_mode': 'truck'}, {'routing_mode': 'auto', 'vehicle_type': 'bicycle'},
    {'avoid_points': [{'lat': 1, 'lon': 2}]}, {'avoid_points': None},
    {'route_optimization': 'unknown'}, {'max_detour': True}, {'max_detour': 20.5},
    {'max_detour': 101}, {'avoidance_mode': 'best_effort'},
    {'avoidance_requirements': [{'category': 'tolls', 'enabled': True, 'mode': 'mandatory', 'proof': True}]}])
def test_unsupported_or_malformed_settings_cannot_be_discarded(bad):
    with pytest.raises(ValueError):
        adapt_settings(bad)


def test_real_javascript_request_builder_to_compiler_without_storage_or_location():
    script = """
    const builder = require('./static/js/modules/navigation/routing-request.js');
    console.log(JSON.stringify(builder.buildSharedRouteOptions({
      routingMode:'auto',vehicleType:'petrol_diesel',costParams:{},
      enableHazardAvoidance:true,avoidCameras:true,avoidCaz:false,
      avoidTrafficLights:true,avoidRailwayCrossings:true,avoidMotorways:true,
      routePrefs:{preferScenic:true,routeOptimization:'scenic',maxDetour:30}
    })));
    """
    settings = json.loads(subprocess.check_output(['node', '-e', script], text=True))
    settings['avoidance_mode'] = 'mandatory'
    result = compile_app_settings(settings, registered_no_motorways=True)
    assert result['app_settings'] == settings
    rows = {r['category']: r for r in result['policy_report']['rules']}
    assert rows['motorways']['state'] == 'COMPILED'
    assert rows['speed_cameras']['state'] == 'UNVERIFIED'
    assert not result['policy_report']['route_preview_allowed']
    assert {r['setting'] for r in result['supplemental_settings']} == {
        'prefer_scenic', 'prefer_quiet', 'route_optimization', 'max_detour'}
    altered = dict(settings, max_detour=31)
    assert compile_app_settings(altered)['settings_fingerprint'] != result['settings_fingerprint']


@pytest.mark.parametrize('mode', ['pedestrian', 'bicycle'])
def test_non_car_profiles_are_not_silently_replaced(mode):
    result = compile_app_settings({'routing_mode': mode, 'vehicle_type': mode})
    assert result['policy_request']['profile'] == mode
    assert not result['policy_report']['profile_supported']
    assert not result['policy_report']['route_preview_allowed']


def test_adapter_import_does_not_bootstrap_production_services():
    script = """
import sys
from prototypes.graphhopper11.app_settings_adapter import compile_app_settings
compile_app_settings({})
assert 'voyagr.services' not in sys.modules
assert 'voyagr_web' not in sys.modules
assert 'voyagr.utils' not in sys.modules
"""
    subprocess.check_call([sys.executable, '-c', script])


def test_returned_settings_are_not_aliases_and_cost_visibility_is_not_avoidance():
    settings = {'avoid_tolls': True, 'include_tolls': False, 'avoid_caz': False,
                'avoidance_requirements': []}
    result = compile_app_settings(settings)
    assert next(r for r in result['policy_request']['requirements'] if r['category'] == 'tolls')['enabled']
    result['app_settings']['avoidance_requirements'].append({'category': 'tolls'})
    assert settings['avoidance_requirements'] == []


def test_rich_policy_binds_all_settings_and_rejects_weaker_or_conflicting_rows():
    from prototypes.graphhopper11.policy_compiler import compile_policy, InvalidPolicy
    settings = {'avoid_caz': False, 'max_detour': 20, 'prefer_scenic': True}
    adapted = adapt_settings(settings)
    selected = dict(adapted['policy_request'], app_settings=adapted['app_settings'])
    report = compile_policy(selected)
    assert report['selected']['app_settings'] == settings
    assert report['app_settings'] == settings
    assert {r['setting'] for r in report['supplemental_settings']} == {'max_detour', 'prefer_scenic'}
    assert not report['app_integration_allowed'] and not report['navigation_allowed']
    changed = copy.deepcopy(selected);changed['app_settings']['max_detour'] = 21
    assert compile_policy(changed)['fingerprint'] != report['fingerprint']
    changed['requirements'][0]['enabled'] = not changed['requirements'][0]['enabled']
    with pytest.raises(InvalidPolicy, match='app_settings_policy_mismatch'):
        compile_policy(changed)
    changed = copy.deepcopy(selected);changed['app_settings']['avoidance_mode'] = 'mandatory'
    with pytest.raises(InvalidPolicy, match='app_settings_policy_mismatch'):
        compile_policy(changed)

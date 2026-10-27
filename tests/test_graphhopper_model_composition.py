"""GraphHopper 8 request-area identity regressions; no installed graph required."""
import copy
import json
import re
from unittest.mock import patch

from voyagr.services import hazards as hz
from voyagr.services.routing.engines import route_with_graphhopper

BBOX = {'min_lat': 53.45, 'max_lat': 53.65, 'min_lon': -1.6, 'max_lon': -1.3}
CAMERAS = {'camera_speed': [{'lat': 53.50, 'lon': -1.45}, {'lat': 53.51, 'lon': -1.44}]}
OSM = {'traffic_light': [{'lat': 53.52, 'lon': -1.43}], 'railway_crossing': [{'lat': 53.53, 'lon': -1.42}]}


def assert_area_contract(model):
    features = model['areas']['features']
    ids = [feature['id'] for feature in features]
    assert len(ids) == len(set(ids)), 'GraphHopper 8.0 rejects duplicate area IDs'
    assert all(re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', name) for name in ids)
    for feature in features:
        assert feature['geometry']['type'] == 'Polygon'
        ring = feature['geometry']['coordinates'][0]
        assert len(ring) >= 4 and ring[0] == ring[-1]
    for rule in model['priority']:
        assert len(rule) == 2
        for name in re.findall(r'\bin_([a-zA-Z0-9_]+)\b', rule['if']):
            assert name in ids or name == 'camera_area_0'


def test_scdb_and_osm_merge_keeps_all_four_distinct_hard_blocks():
    camera = hz.build_graphhopper_filtered_camera_model(CAMERAS)
    osm = hz.build_graphhopper_custom_model(OSM)
    inputs = copy.deepcopy([camera, osm])
    merged = hz.merge_graphhopper_custom_model_parts(camera, osm)
    assert_area_contract(merged)
    assert len(merged['areas']['features']) == 4
    assert len(merged['priority']) == 4
    by_id = {feature['id']: feature for feature in merged['areas']['features']}
    for rule, original in zip(merged['priority'], camera['areas']['features'] + osm['areas']['features']):
        assert by_id[rule['if'][3:]]['geometry'] == original['geometry']
        assert rule['multiply_by'] == '0'
    assert [camera, osm] == inputs


def test_mixed_sections_scdb_osm_caz_preserves_order_and_installed_references(monkeypatch):
    monkeypatch.setattr(hz, 'build_graphhopper_camera_avoidance_model', lambda _: {'priority': [{'if': 'in_camera_area_0', 'multiply_by': '0'}]})
    camera = hz.build_graphhopper_combined_camera_model(CAMERAS, BBOX, selective_filters=False)
    osm = hz.build_graphhopper_custom_model(OSM, BBOX)
    with patch('voyagr.config.CAZ_ZONES_DATA', {'test-zone': {'polygon': [(53.49,-1.46),(53.49,-1.40),(53.56,-1.40),(53.56,-1.46)]}}):
        caz = hz.build_graphhopper_caz_avoidance_model(BBOX)
    merged = hz.merge_graphhopper_custom_model_parts(camera, osm, caz)
    assert_area_contract(merged)
    assert len(merged['areas']['features']) == 5
    assert [rule['multiply_by'] for rule in merged['priority']] == ['0'] * 5 + ['0.02']
    assert merged['priority'][0]['if'] == 'in_camera_area_0'
    assert json.loads(json.dumps(merged)) == merged


def test_area_reference_rewrite_is_token_bound_and_simultaneous():
    base = hz.build_graphhopper_custom_model({'camera_speed': CAMERAS['camera_speed'][:1]})
    second = copy.deepcopy(base)
    second['priority'] = [{'if': 'in_hazard_0 || in_hazard_01', 'multiply_by': '0'}]
    other = copy.deepcopy(second['areas']['features'][0]);other['id'] = 'hazard_01'
    second['areas']['features'].append(other)
    second['speed'] = [{'if': 'in_hazard_0', 'limit_to': '20'}]
    merged = hz.merge_graphhopper_custom_model_parts(base, second)
    assert_area_contract(merged)
    assert 'in_hazard_01' in merged['priority'][1]['if']
    assert merged['speed'][0]['if'] != 'in_hazard_0'
    assert merged['speed'][0]['limit_to'] == '20'


def test_real_route_request_with_camera_and_osm_is_unique_and_still_fail_closed():
    with patch('voyagr.services.routing.engines.USE_GRAPHHOPPER_CAMERA_AVOIDANCE', True), \
         patch.object(hz, 'camera_map_data_filters_are_selective', return_value=False), \
         patch.object(hz, 'build_graphhopper_camera_avoidance_model', return_value={'priority': [{'if': 'in_camera_area_0', 'multiply_by': '0'}]}), \
         patch('voyagr.services.routing.engines.route_transport.post') as post, \
         patch('voyagr.services.routing.engines.route_transport.get') as get:
        post.return_value.status_code = 400
        assert route_with_graphhopper(53.49,-1.46,53.56,-1.4,route_bbox=BBOX,camera_hazards=CAMERAS,traffic_light_hazards=OSM['traffic_light'],railway_crossing_hazards=OSM['railway_crossing']) is None
        assert_area_contract(post.call_args.kwargs['json']['custom_model'])
        assert post.call_args.kwargs['json']['ch.disable'] is True
        assert post.call_count == 1
        get.assert_not_called()


def test_renamed_id_avoids_existing_feature_and_server_reference_names():
    base = hz.build_graphhopper_custom_model({'camera_speed': CAMERAS['camera_speed'][:1]})
    second = copy.deepcopy(base)
    # This identifier must not be stolen by the collision allocator.
    second['priority'].append({'if': 'in_hazard_0_part_1', 'multiply_by': '0'})
    third = copy.deepcopy(base)
    third['areas']['features'][0]['id'] = 'hazard_0_part_1_1'
    third['priority'][0]['if'] = 'in_hazard_0_part_1_1'
    merged = hz.merge_graphhopper_custom_model_parts(base, second, third)
    ids = [f['id'] for f in merged['areas']['features']]
    assert ids == ['hazard_0', 'hazard_0_part_1_2', 'hazard_0_part_1_1']
    assert merged['priority'][2]['if'] == 'in_hazard_0_part_1'


def test_duplicate_identity_within_one_part_is_rejected_not_dropped():
    import pytest
    model = hz.build_graphhopper_custom_model({'camera_speed': CAMERAS['camera_speed'][:1]})
    model['areas']['features'].append(copy.deepcopy(model['areas']['features'][0]))
    with pytest.raises(ValueError, match='within model part'):
        hz.merge_graphhopper_custom_model_parts(model)


def test_rewrite_preserves_quoted_literals_and_else_if_order():
    base = hz.build_graphhopper_custom_model({'camera_speed': CAMERAS['camera_speed'][:1]})
    second = copy.deepcopy(base)
    second['priority'] = [{'if': 'in_hazard_0', 'multiply_by': '0'}, {'else_if': 'name == "in_hazard_0"', 'multiply_by': '0.5'}]
    merged = hz.merge_graphhopper_custom_model_parts(base, second)
    assert merged['priority'][1]['if'] != 'in_hazard_0'
    assert merged['priority'][2] == second['priority'][1]

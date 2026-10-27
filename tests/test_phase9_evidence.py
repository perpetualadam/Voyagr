"""Evidence boundary regressions, never real road/device acceptance."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest


def script(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path('scripts') / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('element', [
    '<node id="1" lat="53.52" lon="-1.13"><tag k="highway" v="speed_camera"/><tag k="highway" v="traffic_signals"/></node>',
    '<way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/><tag k="oneway" v="yes"/><tag k="oneway" v="no"/></way>',
    '<relation id="20"><tag k="type" v="restriction"/><tag k="restriction" v="no_left_turn"/><tag k="restriction" v="only_left_turn"/></relation>',
])
def test_conflicting_source_tags_are_not_last_value_wins(element):
    raw = ('<osm><node id="1" lat="53.52" lon="-1.13"/><node id="2" lat="53.521" lon="-1.13"/>' + element + '</osm>').encode()
    with pytest.raises(ValueError, match='Conflicting source tag'):
        script('export-phase8-road-evidence').export(raw, [53.51, -1.14, 53.53, -1.12], 1800000000000, 'synthetic-test', 'England', now=1800000000001)


def test_identical_repeated_tag_does_not_destroy_direction():
    raw = b'<osm><node id="1" lat="53.52" lon="-1.13"/><node id="2" lat="53.521" lon="-1.13"/><way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/><tag k="oneway" v="yes"/><tag k="oneway" v="yes"/></way></osm>'
    data = script('export-phase8-road-evidence').export(raw, [53.51, -1.14, 53.53, -1.12], 1800000000000, 'synthetic-test', 'England', now=1800000000001)
    assert data['roads'][0]['tags']['oneway'] == 'yes'
    assert data['coverage'] == 'PARTIAL'


def recorded_device_result():
    data = json.loads(Path('scripts/fixtures/phase8/pwa-device-results-template.json').read_text())
    data.update(execution_environment='physical-device', device_model='unit-test-only', os_version='test', browser_version='test', app_commit='a' * 40, recorded_at='2026-10-27T00:00:00Z', observation_role='stationary')
    for case in data['cases']:
        case.update(status='PASS', evidence_notes='Synthetic validator regression, not physical execution')
    return data


@pytest.mark.parametrize('stamp', ['not-a-date', '2026-10-27T00:00:00', '2999-01-01T00:00:00Z'])
def test_device_results_require_past_timezone_aware_record_time(stamp):
    data = recorded_device_result()
    data['recorded_at'] = stamp
    result = script('validate-phase8-device-results').validate(data)
    assert result['status'] == 'REAL_DEVICE_ACCEPTANCE_NOT_TESTED'
    assert 'Invalid recorded_at: require a past/present timezone-aware timestamp' in result['errors']
    assert not result['production_release_authorized']


def test_complete_device_artifact_still_requires_independent_review():
    result = script('validate-phase8-device-results').validate(recorded_device_result())
    assert result['status'] == 'OPERATOR_RECORDED_RESULTS_REQUIRE_INDEPENDENT_REVIEW'
    assert not result['production_release_authorized']


def source_data():
    return dict(schema_version=1, source='synthetic-unit-test', source_kind='SYNTHETIC', revision='unit-v1', acquired_at_ms=1800000000000, bounds=[53.51, -1.14, 53.53, -1.12], coverage='PARTIAL', roads=[dict(osm_way_id='10', node_ids=['1', '2'], geometry=[[53.52, -1.13], [53.521, -1.13]], tags={'highway': 'primary'})])


@pytest.mark.parametrize('kind,expected', [('partial', 'SOURCE_PARTIAL'), ('stale', 'SOURCE_STALE'), ('conflict', 'SOURCE_CONFLICTING'), ('reviewed', 'SOURCE_VALIDATED'), ('synthetic', 'SOURCE_PARTIAL')])
def test_source_states_preserve_uncertainty(kind, expected):
    from voyagr.utils.road_evidence import validate_evidence, SOURCE_TTL_MS
    data = source_data()
    now = data['acquired_at_ms'] + 1
    if kind == 'stale':
        now += SOURCE_TTL_MS
    if kind == 'conflict':
        data['roads'].append(copy.deepcopy(data['roads'][0]))
    if kind in ('reviewed', 'synthetic'):
        data['coverage'] = 'COMPLETE'
    if kind == 'reviewed':
        data['source_kind'] = 'REVIEWED_PROVIDER'
    result = validate_evidence(data, now=now)
    assert result['source_state'] == expected
    assert result['attribute_eligible'] == (kind == 'reviewed')
    assert not result['surveyed_truth']


def test_missing_evidence_has_explicit_unavailable_state():
    from voyagr.utils.road_evidence import validate_evidence
    result = validate_evidence(None)
    assert result['source_state'] == 'SOURCE_UNAVAILABLE'
    assert not result['valid']

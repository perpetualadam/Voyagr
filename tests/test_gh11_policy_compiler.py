"""Offline policy semantics; no graph, app, account or infrastructure required."""
import ast
import copy
from pathlib import Path
import pytest
from prototypes.graphhopper11.policy_compiler import CATEGORIES, compile_policy, normalize_policy, InvalidPolicy


def selected(category='railway_crossings', *, mode='mandatory', enabled=True, profile='car'):
    return {'profile':profile,'requirements':[{'category':category,'enabled':enabled,'mode':mode}]}


@pytest.mark.parametrize('category', CATEGORIES)
def test_every_mandatory_category_is_retained_and_refused_without_proven_capability(category):
    request = selected(category)
    original = copy.deepcopy(request)
    result = compile_policy(request)
    assert result['selected']['requirements'] == [dict(request['requirements'][0], scope='route')]
    assert not result['route_preview_allowed'] and result['unresolved_mandatory'][0]['category'] == category
    assert not result['navigation_allowed'] and not result['automatic_selection_allowed']
    assert result['legal_restrictions'] == {'required':True,'verification':'UNVERIFIED'}
    assert request == original


@pytest.mark.parametrize('category', CATEGORIES)
def test_unresolved_preferences_are_preserved_with_warning_and_no_authority(category):
    result = compile_policy(selected(category, mode='preference'))
    assert result['route_preview_allowed']
    assert result['rules'][0]['enabled'] is True and result['rules'][0]['mode'] == 'preference'
    assert result['preference_warnings'][0]['category'] == category
    assert result['unresolved_mandatory'] == []
    assert not result['navigation_allowed']


def test_only_registered_motorway_mechanism_compiles_and_does_not_establish_navigation():
    result = compile_policy(selected('motorways'), registered_no_motorways=True)
    assert result['route_preview_allowed'] and result['rules'][0]['state'] == 'COMPILED'
    assert not result['navigation_allowed']
    # Truthy operator metadata is not sufficient to declare a capability.
    assert not compile_policy(selected('motorways'), registered_no_motorways='true')['route_preview_allowed']
    assert not compile_policy(selected('speed_cameras'), registered_no_motorways=True)['route_preview_allowed']


def test_disabled_rows_and_mixed_modes_are_not_removed_or_downgraded():
    request = {'profile':'car','requirements':[
        {'category':'motorways','enabled':True,'mode':'mandatory'},
        {'category':'ferries','enabled':True,'mode':'preference'},
        {'category':'caz','enabled':False,'mode':'mandatory'}]}
    result = compile_policy(request, registered_no_motorways=True)
    assert result['route_preview_allowed'] and len(result['rules']) == 3
    assert {row['category']:row['state'] for row in result['rules']} == {'motorways':'COMPILED','ferries':'UNSUPPORTED','caz':'DISABLED'}
    assert result['preference_warnings'][0]['category'] == 'ferries'
    changed = copy.deepcopy(request);changed['requirements'][1]['mode'] = 'mandatory'
    assert not compile_policy(changed, registered_no_motorways=True)['route_preview_allowed']
    assert compile_policy(changed)['fingerprint'] != result['fingerprint']


def test_directional_fixture_coverage_is_never_promoted_to_general_hazard_coverage():
    for category in ('speed_cameras','red_light_cameras','traffic_lights','railway_crossings'):
        result = compile_policy(selected(category))
        assert result['rules'][0]['state'] == 'UNVERIFIED'
        assert not result['route_preview_allowed']


def test_unknown_profile_never_substitutes_car_even_when_rules_are_disabled():
    result = compile_policy(selected('motorways',enabled=False,profile='bicycle'), registered_no_motorways=True)
    assert result['selected']['profile'] == 'bicycle'
    assert result['profile_supported'] is False and result['route_preview_allowed'] is False


@pytest.mark.parametrize('bad', [None, [], {}, {'profile':'car','requirements':[],'coverage':'AVAILABLE'},
    {'profile':True,'requirements':[]}, {'profile':'car','requirements':'all'},
    selected('unknown'), selected(enabled=1), selected(mode='best_effort'),
    {'profile':'car','requirements':[{'category':'motorways','enabled':True,'mode':'mandatory','scope':'leg'}]},
    {'profile':'car','requirements':[{'category':'motorways','enabled':True,'mode':'mandatory','edge_keys':[1]}]}])
def test_invalid_contracts_refuse_without_guessing_or_discarding_fields(bad):
    with pytest.raises(InvalidPolicy):
        compile_policy(bad)


def test_duplicate_categories_refuse_and_order_only_changes_are_equivalent():
    row = selected()['requirements'][0]
    with pytest.raises(InvalidPolicy):
        normalize_policy({'profile':'car','requirements':[row,row]})
    request = {'profile':'car','requirements':[row,selected('tolls',enabled=False)['requirements'][0]]}
    assert compile_policy(request) == compile_policy(dict(request, requirements=list(reversed(request['requirements']))))


def test_supported_category_vocabulary_matches_real_application_without_importing_it():
    source = Path(__file__).resolve().parents[1]/'voyagr/services/routing/integrity.py'
    tree = ast.parse(source.read_text())
    assignment = next(node for node in tree.body if isinstance(node,ast.Assign)
                      and any(isinstance(target,ast.Name) and target.id=='CATEGORIES' for target in node.targets))
    assert set(CATEGORIES) == set(ast.literal_eval(assignment.value))
